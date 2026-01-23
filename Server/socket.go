package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Frame struct {
	T    string          `json:"t"`
	SID  string          `json:"sid,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	id   string
	conn *websocket.Conn
	mu   sync.Mutex
}

type Session struct {
	id      string
	clients map[string]*Client
	mu      sync.Mutex
}

type Server struct {
	clients  map[string]*Client
	sessions map[string]*Session
	invites  map[string]string 
	mu       sync.Mutex
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) newID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func (s *Server) send(c *Client, f Frame) error {
	if c == nil { return nil }
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	return c.conn.WriteJSON(f)
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }

	client := &Client{id: s.newID(), conn: ws}
	s.mu.Lock()
	s.clients[client.id] = client
	s.mu.Unlock()

	// Heartbeat
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.mu.Lock()
			_, exists := s.clients[client.id]
			s.mu.Unlock()
			if !exists { return }
			s.send(client, Frame{T: "PING"})
		}
	}()


	// CLient Disconnect
	defer func() {
		s.mu.Lock()
		delete(s.clients, client.id)
		s.mu.Unlock()

		for _, sess := range s.sessions {
			sess.mu.Lock()
			_, wasMember := sess.clients[client.id]
			if wasMember {
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{
							T:   "PEER_OFFLINE",
							SID: sess.id,
						})
					}
				}
				delete(sess.clients, client.id)
			}
			sess.mu.Unlock()
		}

		ws.Close()
	}()


	for {
		var frame Frame
		if err := ws.ReadJSON(&frame); err != nil { break }

		switch frame.T {
		// Genrate a invite code
		case "CREATE_SESSION":
			sid := s.newID()
			code := fmt.Sprintf("%06d", rand.Intn(1000000))

			s.mu.Lock()

			s.sessions[sid] = &Session{id: sid, clients: map[string]*Client{client.id: client}}

			s.invites[code] = sid
			s.mu.Unlock()

			log.Printf("[Server] Created Session %s with Code %s", sid, code)
			s.send(client, Frame{
				T:   "INVITE_CODE",
				SID: sid,
				Data: json.RawMessage(fmt.Sprintf(`{"code":"%s"}`, code)),
			})
		// Joins another client with invite code
		case "JOIN":
			var d struct {
				Code      string `json:"code"`
				PublicKey string `json:"publicKey"`
			}

			json.Unmarshal(frame.Data, &d)

			s.mu.Lock()
			sid, ok := s.invites[d.Code]
			if !ok {
				s.mu.Unlock()
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Invalid or expired code"}`)})
				continue
			}

			sess := s.sessions[sid]
			sess.mu.Lock()
			sess.clients[client.id] = client

			var creator *Client
			for _, c := range sess.clients {
				if c.id != client.id {
					creator = c
					break
				}
			}
			
			if creator != nil {
				s.send(creator, Frame{
					T:   "JOIN_REQUEST",
					SID: sid,
					Data: json.RawMessage(fmt.Sprintf(`{"publicKey":"%s"}`, d.PublicKey)),
				})
			}

			sess.mu.Unlock()
			delete(s.invites, d.Code)
			s.mu.Unlock()
		// Client Accept the request
		case "JOIN_ACCEPT":
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{T: "JOIN_ACCEPT", SID: frame.SID, Data: frame.Data})
					}
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()
		// Client Deny the request
	    case "JOIN_DENY":
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{T: "JOIN_DENIED", SID: frame.SID})
					}
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()
		// Reconnect CLient
		case "REATTACH":
				s.mu.Lock()

				sess, ok := s.sessions[frame.SID]
				if !ok {
					sess = &Session{
						id: frame.SID,
						clients: map[string]*Client{client.id: client},
					}
					s.sessions[frame.SID] = sess
				}
				s.mu.Unlock()

				sess.mu.Lock()
				sess.clients[client.id] = client
				
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{
							T:   "PEER_ONLINE",
							SID: frame.SID,
						})
						s.send(client, Frame{
							T:   "PEER_ONLINE",
							SID: frame.SID,
						})
					}
				}

				sess.mu.Unlock()

				log.Printf(
					"[Server] Client %s reattached to session %s",
					client.id,
					frame.SID,
				)
		case "MSG":
			delivered := false
			s.mu.Lock()

			sess, ok := s.sessions[frame.SID]
			if !ok {
				sess = &Session{
					id:      frame.SID,
					clients: map[string]*Client{client.id: client},
				}
				s.sessions[frame.SID] = sess
				log.Printf("[Server] Auto-created session %s from MSG", frame.SID)
			}
			s.mu.Unlock()

			sess.mu.Lock()
			if _, exists := sess.clients[client.id]; !exists {
				sess.clients[client.id] = client
			}

			for _, c := range sess.clients {
				if c.id != client.id {
					if err := s.send(c, frame); err == nil {
						delivered = true
					} else {
						log.Printf("[Error] Failed to send to %s: %v", c.id, err)
					}
				}
			}
			sess.mu.Unlock()

			if delivered {
				s.send(client, Frame{T: "DELIVERED", SID: frame.SID})
			} else {
				s.send(client, Frame{T: "DELIVERED_FAILED", SID: frame.SID})
			}
		}
	}
}

func main() {
	s := &Server{
		clients:  make(map[string]*Client),
		sessions: make(map[string]*Session),
		invites:  make(map[string]string),
	}
	http.HandleFunc("/", s.handle)
	log.Println("✅ Secure E2E Relay Server running on :9000")
	http.ListenAndServe(":9000", nil)
}