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
	mu       sync.Mutex
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (s *Server) newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func (s *Server) send(c *Client, f Frame) {
	if c == nil { return }
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_ = c.conn.WriteJSON(f)
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }

	client := &Client{id: s.newID(), conn: ws}
	s.mu.Lock()
	s.clients[client.id] = client
	s.mu.Unlock()

	// Heartbeat: Send Ping every 5 seconds
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.mu.Lock()
			_, exists := s.clients[client.id]
			s.mu.Unlock()
			if !exists { return }
			s.send(client, Frame{T: "PING"})
		}
	}()

	defer func() {
		s.mu.Lock()
		delete(s.clients, client.id)
		// Clean client from all sessions
		for _, sess := range s.sessions {
			sess.mu.Lock()
			delete(sess.clients, client.id)
			sess.mu.Unlock()
		}
		s.mu.Unlock()
		ws.Close()
	}()

	for {
		var frame Frame
		if err := ws.ReadJSON(&frame); err != nil { break }

		// Stateless Logic: Auto-create session if it doesn't exist
		var sess *Session
		if frame.SID != "" {
			s.mu.Lock()
			if _, ok := s.sessions[frame.SID]; !ok {
				s.sessions[frame.SID] = &Session{id: frame.SID, clients: make(map[string]*Client)}
				log.Printf("[Server] Implicitly created session: %s", frame.SID)
			}
			sess = s.sessions[frame.SID]
			sess.mu.Lock()
			sess.clients[client.id] = client
			sess.mu.Unlock()
			s.mu.Unlock()
		}

		switch frame.T {
		case "PONG":
			// Keep-alive received
		case "CREATE_SESSION":
			sid := s.newID()
			s.mu.Lock()
			s.sessions[sid] = &Session{id: sid, clients: map[string]*Client{client.id: client}}
			s.mu.Unlock()
			s.send(client, Frame{T: "SESSION_CREATED", SID: sid})
		case "MSG":
			if sess != nil {
				sess.mu.Lock()
				for _, c := range sess.clients {
					if c.id != client.id { s.send(c, frame) }
				}
				sess.mu.Unlock()
			}
		case "INVITE_CREATE":
            // ... (rest of your invite logic)
		}
	}
}

func main() {
	s := &Server{clients: make(map[string]*Client), sessions: make(map[string]*Session)}
	http.HandleFunc("/", s.handle)
	log.Println("✅ Stateless E2E Server running on :9000")
	http.ListenAndServe(":9000", nil)
}