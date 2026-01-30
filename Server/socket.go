package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
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
	id    string
	email string
	conn  *websocket.Conn
	mu    sync.Mutex
}

type Session struct {
	id      string
	clients map[string]*Client
	mu      sync.Mutex
}

type Server struct {
	clients         map[string]*Client
	sessions        map[string]*Session
	emailToClientId map[string]string
	mu              sync.Mutex
	logger          *log.Logger
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) newID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func verifyGoogleToken(token string) (string, error) {
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + token)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid token")
	}

	var claims struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return "", err
	}
	return claims.Email, nil
}

func (s *Server) send(c *Client, f Frame) error {
	if c == nil { return nil }
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	return c.conn.WriteJSON(f)
}

func (s *Server) logConnection(initiator, target string) {
	h1 := sha256.Sum256([]byte(initiator))
	iHash := hex.EncodeToString(h1[:])
	
	h2 := sha256.Sum256([]byte(target))
	tHash := hex.EncodeToString(h2[:])

	s.logger.Printf("CONNECTION: %s requested connection to %s on %s", iHash, tHash, time.Now().Format(time.RFC3339))
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
		if client.email != "" {
			delete(s.emailToClientId, client.email)
		}
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
		case "AUTH":
			var d struct {
				Token string `json:"token"`
			}
			json.Unmarshal(frame.Data, &d)
			email, err := verifyGoogleToken(d.Token)
			if err != nil {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth failed"}`)})
				continue
			}
			client.mu.Lock()
			client.email = email
			client.mu.Unlock()
			
			s.mu.Lock()
			if oldClientID, exists := s.emailToClientId[email]; exists {
				if oldClient, ok := s.clients[oldClientID]; ok {
					// Disconnect the old client
					s.mu.Unlock() // Unlock before sending to avoid deadlock if send locks
					s.send(oldClient, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Logged in from another device"}`)})
					oldClient.conn.Close() // This will trigger defer disconnect logic
					s.mu.Lock() // Relock
					delete(s.clients, oldClientID)
				}
			}
			s.emailToClientId[email] = client.id
			s.mu.Unlock()
			
			s.send(client, Frame{T: "AUTH_SUCCESS", Data: json.RawMessage(fmt.Sprintf(`{"email":"%s"}`, email))})

		// Connect via Email
		case "CONNECT_REQ":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Authentication required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
				PublicKey   string `json:"publicKey"`
			}
			json.Unmarshal(frame.Data, &d)
			
			s.logConnection(client.email, d.TargetEmail)

			s.mu.Lock()
			targetClientId, ok := s.emailToClientId[d.TargetEmail]
			if !ok {
				s.mu.Unlock()
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"User not online"}`)})
				continue
			}
			targetClient := s.clients[targetClientId]
			
			// Create a session ID deterministically or randomly - let's use random for now but unique
			sid := s.newID()
			
			// Init the session
			s.sessions[sid] = &Session{id: sid, clients: map[string]*Client{client.id: client}}
			s.mu.Unlock()

			// Send Invite to Target
			if targetClient != nil {
				s.send(targetClient, Frame{
					T:   "JOIN_REQUEST",
					SID: sid,
					Data: json.RawMessage(fmt.Sprintf(`{"publicKey":"%s", "email":"%s"}`, d.PublicKey, client.email)),
				})
			}

		case "JOIN_ACCEPT":
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				sess.clients[client.id] = client // Add accepter to session
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
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Authentication required"}`)})
				continue
			}
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
	f, err := os.OpenFile("connections.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("error opening file: %v", err)
	}
	defer f.Close()

	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		emailToClientId: make(map[string]string),
		logger:          log.New(f, "", 0),
	}
	http.HandleFunc("/", s.handle)
	log.Println("✅ Secure E2E Relay Server running on :9000")
	http.ListenAndServe(":9000", nil)
}
