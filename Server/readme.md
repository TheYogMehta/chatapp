# Setup & Installation

## Prerequisites

- **Go** (v1.20+)

## Server Setup

The server is a lightweight Go application.

1. Initialize dependencies (if not already done).

   ```bash
   go mod init socket
   go get github.com/gorilla/websocket
   go get github.com/joho/
   go get github.com/joho/godotenv
   ```

2. generate ssl certificates

   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes
   ```

3. install coturn

   ```bash
   apt install coturn
   ```

4. Generate Random String

   ```bash
   openssl rand -hex 64
   ```

   copy this string

5. edit coturn config

   ```bash
   nano /etc/turnserver.conf
   ```

   > uncomment below configs

   ```bash
   listening-port=3478
   fingerprint
   no-multicast-peers
   use-auth-secret
   static-auth-secret=PASTE-YOUR-RANDOM-GEN-STRING
   realm=yourdomain.com
   ```

### Running the Server

```bash
go run socket.go
```

The server listens on `ws://localhost:9000`.

### Building Code

```bash
 go build -o socket socket.go
```

> then you can can use ./socket
