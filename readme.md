# Local Server Setup

1. Install Go on the server

```bash
sudo apt update
sudo apt install golang -y
```

2. download socket.go and create a folder `server` place the socket.go in `server` folder

3. Initialize Go module

```bash
go mod init socket
```

4. Now install the only dependency (Gorilla WebSocket):

```bash
go get github.com/gorilla/websocket
```

5. Go will create:

```bash
go.mod
go.sum
```

6. Run the server

```bash
go run socket.go
--- or ---
go build -o socket socket.go
```
