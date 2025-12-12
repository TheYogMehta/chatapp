package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/rand"
	mathrand "math/rand"
	"net"
	"strings"
	"sync"
	"time"
)

// -------------------- Config --------------------
const (
	CodeLength    = 5
	CodeExpiry    = 60 * time.Second
	PurgeInterval = 10 * time.Second
	MaxMessageLen = 2048
	ServerPort    = ":9000"
)

// -------------------- Data Structures --------------------
type Client struct {
	Conn     net.Conn
	SocketID string
}

type Session struct {
	ID      string
	Clients []*Client
}

type Server struct {
	Clients  map[string]*Client   // socketID -> Client
	Sessions map[string]*Session  // sessionID -> Session
	Codes    map[string]*Client   // temporary code -> waiting Client
	Mutex    sync.Mutex
	RandSrc  *mathrand.Rand
}

// -------------------- Helper Functions --------------------
func NewServer() *Server {
	return &Server{
		Clients:  make(map[string]*Client),
		Sessions: make(map[string]*Session),
		Codes:    make(map[string]*Client),
		RandSrc:  mathrand.New(mathrand.NewSource(time.Now().UnixNano())),
	}
}

// Generate unique socket ID: timestamp + random nonce
func generateSocketID() string {
	timestamp := time.Now().UnixNano()
	nonceBytes := make([]byte, 4)
	if _, err := rand.Read(nonceBytes); err != nil {
		log.Fatal(err)
	}
	return fmt.Sprintf("%d-%x", timestamp, nonceBytes)
}

// Generate unique temporary code
func (s *Server) GenerateUniqueCode(client *Client) string {
	for {
		code := randomString(CodeLength, s.RandSrc)
		s.Mutex.Lock()
		_, exists := s.Codes[code]
		if !exists {
			s.Codes[code] = client
			s.Mutex.Unlock()
			return code
		}
		s.Mutex.Unlock()
	}
}

// Random alphanumeric string
func randomString(n int, r *mathrand.Rand) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[r.Intn(len(letters))]
	}
	return string(b)
}

// Purge expired codes
func (s *Server) PurgeOldCodes() {
	for {
		time.Sleep(PurgeInterval)
		s.Mutex.Lock()
		for code := range s.Codes {
			delete(s.Codes, code)
		}
		s.Mutex.Unlock()
	}
}

// -------------------- Core Logic --------------------

// Add new client
func (s *Server) AddClient(conn net.Conn) *Client {
	socketID := generateSocketID()
	client := &Client{Conn: conn, SocketID: socketID}
	s.Mutex.Lock()
	s.Clients[socketID] = client
	s.Mutex.Unlock()
	return client
}

// Remove client
func (s *Server) RemoveClient(client *Client) {
	s.Mutex.Lock()
	delete(s.Clients, client.SocketID)
	for _, session := range s.Sessions {
		for i, c := range session.Clients {
			if c.SocketID == client.SocketID {
				session.Clients = append(session.Clients[:i], session.Clients[i+1:]...)
			}
		}
	}
	s.Mutex.Unlock()
}

// Relay generic message to all clients in session except sender
func (s *Server) RelayMessage(sessionID string, senderID string, msg []byte) {
	s.Mutex.Lock()
	session, ok := s.Sessions[sessionID]
	s.Mutex.Unlock()
	if !ok {
		return
	}
	for _, c := range session.Clients {
		if c.SocketID != senderID {
			c.Conn.Write(msg)
		}
	}
}

// Relay PUBKEY messages (encryption keys) between clients
func (s *Server) RelayPubKey(sessionID string, senderID string, keyMsg string) {
	s.Mutex.Lock()
	session, ok := s.Sessions[sessionID]
	s.Mutex.Unlock()
	if !ok {
		return
	}
	for _, c := range session.Clients {
		if c.SocketID != senderID {
			c.Conn.Write([]byte(keyMsg + "\n"))
		}
	}
}

// Handle commands from client
func (s *Server) HandleClient(client *Client) {
	defer client.Conn.Close()
	buf := make([]byte, MaxMessageLen)

	for {
		n, err := client.Conn.Read(buf)
		if err != nil {
			log.Println("Client disconnected:", client.SocketID)
			s.RemoveClient(client)
			return
		}
		line := strings.TrimSpace(string(buf[:n]))
		parts := strings.SplitN(line, " ", 2)

		switch parts[0] {
		case "GET_CODE":
			code := s.GenerateUniqueCode(client)
			client.Conn.Write([]byte("CODE " + code + "\n"))
			log.Println("Generated code for", client.SocketID, ":", code)

		case "JOIN":
			if len(parts) < 2 {
				client.Conn.Write([]byte("ERROR Missing code\n"))
				continue
			}
			code := parts[1]
			s.Mutex.Lock()
			peer, ok := s.Codes[code]
			s.Mutex.Unlock()
			if !ok {
				client.Conn.Write([]byte("ERROR Invalid code\n"))
				continue
			}
			// Forward join request to peer
			peer.Conn.Write([]byte("REQUEST " + code + " FROM " + client.SocketID + "\n"))
			client.Conn.Write([]byte("WAITING " + code + "\n"))

		case "ACCEPT":
			if len(parts) < 2 {
				client.Conn.Write([]byte("ERROR Missing code\n"))
				continue
			}
			code := parts[1]
			s.Mutex.Lock()
			peer, ok := s.Codes[code]
			if !ok {
				client.Conn.Write([]byte("ERROR Code expired\n"))
				s.Mutex.Unlock()
				continue
			}
			// Create session
			sessionID := randomString(10, s.RandSrc)
			session := &Session{
				ID:      sessionID,
				Clients: []*Client{client, peer},
			}
			s.Sessions[sessionID] = session
			delete(s.Codes, code)
			s.Mutex.Unlock()

			client.Conn.Write([]byte("SESSION " + sessionID + "\n"))
			peer.Conn.Write([]byte("SESSION " + sessionID + "\n"))
			log.Println("Session created:", sessionID)

		case "PUBKEY":
			if len(parts) < 2 {
				client.Conn.Write([]byte("ERROR Missing key data\n"))
				continue
			}
			// parts[1] = "<sessionID> <pubKeyHex>"
			keyParts := strings.SplitN(parts[1], " ", 2)
			if len(keyParts) < 2 {
				client.Conn.Write([]byte("ERROR Invalid PUBKEY format\n"))
				continue
			}
			sessionID := keyParts[0]
			pubKeyMsg := "PUBKEY " + keyParts[1]
			s.RelayPubKey(sessionID, client.SocketID, pubKeyMsg)

		case "MSG":
			if len(parts) < 2 {
				client.Conn.Write([]byte("ERROR Invalid MSG\n"))
				continue
			}
			msgParts := strings.SplitN(parts[1], " ", 2)
			if len(msgParts) < 2 {
				client.Conn.Write([]byte("ERROR Invalid MSG format\n"))
				continue
			}
			sessionID := msgParts[0]
			message := []byte(msgParts[1])
			s.RelayMessage(sessionID, client.SocketID, message)

		default:
			client.Conn.Write([]byte("ERROR Unknown command\n"))
		}
	}
}

// -------------------- Main --------------------
func main() {
	server := NewServer()
	go server.PurgeOldCodes()

	listener, err := net.Listen("tcp", ServerPort)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	log.Println("Server started on", ServerPort)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Println("Accept error:", err)
			continue
		}
		client := server.AddClient(conn)
		log.Println("New client connected:", client.SocketID)
		go server.HandleClient(client)
	}
}