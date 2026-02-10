package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"

	crand "crypto/rand"
)


type Frame struct {
	T    string          `json:"t"`
	SID  string          `json:"sid,omitempty"`
	C    bool            `json:"c,omitempty"`
	P    int             `json:"p,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	id          string
	email       string
	conn        *websocket.Conn
	mu          sync.Mutex
	msgCount    int
	msgWindow   time.Time
	lastConnect time.Time
}

type Session struct {
	id      string
	clients map[string]*Client
	mu      sync.Mutex
}

type RateLimiter struct {
	ipAttempts map[string][]time.Time
	mu         sync.Mutex
}

type Server struct {
	clients         map[string]*Client
	sessions        map[string]*Session
	emailToClientId map[string]string
	mu              sync.Mutex
	logger          *log.Logger
	rateLimiter     *RateLimiter
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (rl *RateLimiter) checkAuthRateLimit(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	attempts, exists := rl.ipAttempts[ip]

	// Clean up old attempts (> 1 minute)
	validAttempts := []time.Time{}
	if exists {
		for _, t := range attempts {
			if now.Sub(t) < time.Minute {
				validAttempts = append(validAttempts, t)
			}
		}
	}

	if len(validAttempts) >= 3 {
		rl.ipAttempts[ip] = validAttempts
		return false
	}

	validAttempts = append(validAttempts, now)
	rl.ipAttempts[ip] = validAttempts
	return true
}

func (s *Server) newID() string {
  b := make([]byte, 8)
  crand.Read(b)
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
		Aud   string `json:"aud"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return "", err
	}

	validClients := map[string]bool{
		"588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com": true, // Web/Electron
		"588653192623-lrcr1rs3meptlo4a2dkt6aam6jpvoua1.apps.googleusercontent.com": true, // Android
	}

	if !validClients[claims.Aud] {
		return "", fmt.Errorf("invalid token audience: %s", claims.Aud)
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

func GenerateTurnCreds(userId, secret string) (string, string) {
    expiry := time.Now().Add(10 * time.Minute).Unix()
    username := fmt.Sprintf("%d:%s", expiry, userId)
    mac := hmac.New(sha1.New, []byte(secret))
    mac.Write([]byte(username))
    password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

    return username, password
}

var sessionSecret []byte

func init() {
  if err := godotenv.Load(); err != nil {
    log.Println("⚠️ No .env file found, relying on environment variables")
  }

  sessionSecret = make([]byte, 32)
  rand.Read(sessionSecret)

  if os.Getenv("TURN_SECRET") == "" {
    log.Fatal("❌ TURN_SECRET is not set")
  }
}

func generateSessionToken(email string) string {
	exp := time.Now().Add(30 * 24 * time.Hour).Unix()
	data := fmt.Sprintf("sess:%d:%s", exp, email)
	
	h := hmac.New(sha256.New, sessionSecret)
	h.Write([]byte(data))
	sig := hex.EncodeToString(h.Sum(nil))
	
	return fmt.Sprintf("%s:%s", data, sig)
}

func verifyAuthToken(token string) (string, string, error) {
	if strings.HasPrefix(token, "sess:") {
		parts := strings.Split(token, ":")
		if len(parts) != 4 {
			return "", "", fmt.Errorf("invalid session format")
		}
		expStr := parts[1]
		email := parts[2]
		sig := parts[3]
		
		data := fmt.Sprintf("sess:%s:%s", expStr, email)
		h := hmac.New(sha256.New, sessionSecret)
		h.Write([]byte(data))
		expectedSig := hex.EncodeToString(h.Sum(nil))
		
		if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
			return "", "", fmt.Errorf("invalid signature")
		}
		
		exp, _ := strconv.ParseInt(expStr, 10, 64)
		if time.Now().Unix() > exp {
			return "", "", fmt.Errorf("token expired")
		}
		
		return email, token, nil
	}

	email, err := verifyGoogleToken(token)
	if err != nil {
		return "", "", err
	}
	
	newToken := generateSessionToken(email)
	return email, newToken, nil
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
			// 1. IP Rate Limiting
			ip := strings.Split(r.RemoteAddr, ":")[0]
			if !s.rateLimiter.checkAuthRateLimit(ip) {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Too many login attempts. Try again later."}`)})
				client.conn.Close()
				return
			}

			var d struct {
				Token string `json:"token"`
			}
			json.Unmarshal(frame.Data, &d)
			
			email, sessionToken, err := verifyAuthToken(d.Token)
			if err != nil {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth failed"}`)})
				continue
			}
			client.mu.Lock()
			client.email = email
			client.mu.Unlock()
			
			s.mu.Lock()
			if oldClientID, exists := s.emailToClientId[email]; exists {
				if _, ok := s.clients[oldClientID]; ok {
					s.mu.Unlock()
					s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Already logged in on another device"}`)})
					client.conn.Close()
					return
				}
			}
			s.emailToClientId[email] = client.id
			s.mu.Unlock()
			
			resp := map[string]string{
				"email": email,
				"token": sessionToken,
			}
			respBytes, _ := json.Marshal(resp)
			s.send(client, Frame{T: "AUTH_SUCCESS", Data: json.RawMessage(respBytes)})

		case "CONNECT_REQ":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			client.mu.Lock()

			if time.Since(client.lastConnect) < 5*time.Second {
				client.mu.Unlock()
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Rate limit exceeded: Wait 5s between connection requests"}`)})
				continue
			}

			client.lastConnect = time.Now()
			client.mu.Unlock()

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
			
			sid := s.newID()
			
			s.sessions[sid] = &Session{id: sid, clients: map[string]*Client{client.id: client}}
			s.mu.Unlock()

			if targetClient != nil {
				s.send(targetClient, Frame{
					T:   "JOIN_REQUEST",
					SID: sid,
					Data: json.RawMessage(fmt.Sprintf(`{"publicKey":"%s", "email":"%s"}`, d.PublicKey, client.email)),
				})
			}

		case "JOIN_ACCEPT":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				sess.clients[client.id] = client 
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{T: "JOIN_ACCEPT", SID: frame.SID, Data: frame.Data})
					}
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()

	    case "JOIN_DENY":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
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
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
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

			recipientCount := 0
			for _, c := range sess.clients {
				if c.id != client.id {
					recipientCount++
					if err := s.send(c, frame); err == nil {
						delivered = true
					} else {
						log.Printf("[Error] Failed to send to %s: %v", c.id, err)
					}
				}
			}

			log.Printf("[Server] Relayed MSG in %s to %d recipients (Delivered: %v)", frame.SID, recipientCount, delivered)
			sess.mu.Unlock()

			if frame.C {
				if delivered {
					s.send(client, Frame{T: "DELIVERED", SID: frame.SID})
				} else {
					s.send(client, Frame{T: "DELIVERED_FAILED", SID: frame.SID})
				}
			}
	
		case "RTC_OFFER":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil { break }

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, frame)
				}
			}
			sess.mu.Unlock()

		case "RTC_ANSWER":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil { break }

		sess.mu.Lock()
		for _, c := range sess.clients {
			if c.id != client.id {
				s.send(c, frame)
			}
		}
		sess.mu.Unlock()

		case "RTC_ICE":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil { break }

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, frame)
				}
			}
			sess.mu.Unlock()

		case "GET_TURN_CREDS":
			if client.email == "" {
				s.send(client, Frame{
					T: "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}

			username, password := GenerateTurnCreds(client.email, os.Getenv("TURN_SECRET"))
			turnHost := os.Getenv("TURN_HOST")
			
			resp := map[string]any{
				"urls": []string{
					"turn:" + turnHost + ":3478?transport=udp",
					"turn:" + turnHost + ":3478?transport=tcp",
				},
				"username":   username,
				"credential": password,
				"ttl":        600,
			}

			respBytes, _ := json.Marshal(resp)
			s.send(client, Frame{
				T:    "TURN_CREDS",
				Data: json.RawMessage(respBytes),
			})

		case "FETCH_METADATA":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			
			var req struct {
				URL string `json:"url"`
			}
			if err := json.Unmarshal(frame.Data, &req); err != nil {
				continue
			}

			go func() {
				httpClient := &http.Client{Timeout: 5 * time.Second}
				r, _ := http.NewRequest("GET", req.URL, nil)
				r.Header.Set("User-Agent", "ChatAppbot/1.0")
				
				resp, err := httpClient.Do(r)
				if err != nil {
					s.send(client, Frame{T: "METADATA", Data: json.RawMessage(`{}`)})
					return 
				}
				defer resp.Body.Close()

				contentType := resp.Header.Get("Content-Type")
				meta := UrlMetadata{Url: req.URL}

				if strings.HasPrefix(contentType, "image/") {
					meta.Type = "image"
					meta.Image = req.URL
					meta.Title = req.URL 
				} else {
					bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
					bodyStr := string(bodyBytes)
					
					reTitle := regexp.MustCompile(`<meta\s+(?:property|name)=["']og:title["']\s+content=["'](.*?)["']`)
					reDesc := regexp.MustCompile(`<meta\s+(?:property|name)=["']og:description["']\s+content=["'](.*?)["']`)
					reImage := regexp.MustCompile(`<meta\s+(?:property|name)=["']og:image["']\s+content=["'](.*?)["']`)
					reHtmlTitle := regexp.MustCompile(`<title>(.*?)</title>`)

					if match := reTitle.FindStringSubmatch(bodyStr); len(match) > 1 {
						meta.Title = htmlUnescape(match[1])
					} else if match := reHtmlTitle.FindStringSubmatch(bodyStr); len(match) > 1 {
						meta.Title = htmlUnescape(match[1])
					}
					if match := reDesc.FindStringSubmatch(bodyStr); len(match) > 1 {
						meta.Description = htmlUnescape(match[1])
					}
					if match := reImage.FindStringSubmatch(bodyStr); len(match) > 1 {
						meta.Image = match[1]
					}
				}

				respBytes, _ := json.Marshal(meta)
				s.send(client, Frame{
					T: "METADATA",
					Data: respBytes,
				})
			}()

		case "FETCH_IMAGE":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}

			var req struct {
				URL string `json:"url"`
			}
			if err := json.Unmarshal(frame.Data, &req); err != nil {
				continue
			}

			go func() {
				httpClient := &http.Client{Timeout: 10 * time.Second}
				r, _ := http.NewRequest("GET", req.URL, nil)
				r.Header.Set("User-Agent", "ChatAppbot/1.0")

				resp, err := httpClient.Do(r)
				if err != nil {
					return
				}
				defer resp.Body.Close()

				data, err := io.ReadAll(resp.Body)
				if err != nil {
					return
				}

				// Convert to base64
				b64 := base64.StdEncoding.EncodeToString(data)
				
				respData := struct {
					URL      string `json:"url"`
					Data     string `json:"data"`
					MimeType string `json:"mimeType"`
				}{
					URL:      req.URL,
					Data:     b64,
					MimeType: resp.Header.Get("Content-Type"),
				}

				b, _ := json.Marshal(respData)

				s.send(client, Frame{
					T:    "IMAGE_DATA",
					Data: b,
				})
			}()



		case "CHECK_LINK":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}

			var req struct {
				URL string `json:"url"`
			}
			if err := json.Unmarshal(frame.Data, &req); err != nil {
				continue
			}

			status := checkLinkSafety(req.URL)
			
			resp := map[string]string{
				"url":    req.URL,
				"status": status, // SAFE, UNSAFE, UNKNOWN
			}
			respBytes, _ := json.Marshal(resp)

			s.send(client, Frame{
				T:    "LINK_SAFETY_RESULT",
				Data: json.RawMessage(respBytes),
			})
		}
	}
}



type UrlMetadata struct {
    Title       string `json:"title"`
    Description string `json:"description"`
    Image       string `json:"image"`
    Url         string `json:"url"`
    Type        string `json:"type"`
}




func checkLinkSafety(urlStr string) string {
	// 1. Basic URL parsing
	u, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return "UNSAFE" // Malformed
	}

	hostname := u.URL.Hostname()
	
	// 2. Server-side Blacklist (Expandable)
	blacklist := []string{
		"unsafe.com", 
		"malware.com", 
		"phishing.site",
	}
	for _, bad := range blacklist {
		if hostname == bad || strings.HasSuffix(hostname, "."+bad) {
			return "UNSAFE"
		}
	}

	// 3. DNS Verification (Does domain exist?)
	// This prevents some random generated phishing domains that might not even resolve yet
	// or catches complete gibberish.
	_, err = net.LookupHost(hostname)
	if err != nil {
		return "UNKNOWN" // Could not resolve, treat as unknown/suspicious
	}

	// 4. (Optional) Google Safe Browsing API could go here
    // if apiKey != "" { ... }

	return "SAFE" // Passed basic checks
}

func htmlUnescape(s string) string {
    s = strings.ReplaceAll(s, "&quot;", "\"")
    s = strings.ReplaceAll(s, "&amp;", "&")
    s = strings.ReplaceAll(s, "&lt;", "<")
    s = strings.ReplaceAll(s, "&gt;", ">")
    s = strings.ReplaceAll(s, "&#39;", "'")
    return s
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
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}
	http.HandleFunc("/", s.handle)

	log.Println("✅ Secure E2E Relay Server running on :9000")
	http.ListenAndServe(":9000", nil)
}
