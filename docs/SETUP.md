# Setup & Installation

## Prerequisites

- **Node.js** (v18+)
- **Go** (v1.20+)
- **Android Studio** (for Android builds)
- **Google Cloud Console** Project (for OAuth keys)

## 1. Backend Setup (Server)

The server is a lightweight Go application.

### Server Installation

1. Navigate to the `Server` directory.

   ```bash
   cd Server
   ```

2. Initialize dependencies (if not already done).

   ```bash
   go mod init socket
   go get github.com/gorilla/websocket
   go get github.com/joho/godotenv
   ```

### Running the Server

```bash
go run socket.go
```

The server listens on `ws://localhost:9000`.

---

## 2. Frontend Setup (Client)

The client is a React application using Vite and Capacitor.

### Client Installation

1. Navigate to the `Client` directory.

   ```bash
   cd Client
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. **Configuration**: Ensure you have valid Google OAuth credentials.
   - Place `google-services.json` in `android/app/` (for Android).
   - Configure Client IDs in your environment or constants.

### Building Application

The build command handles all preparation steps including:

- Building React application with Vite
- Syncing with Capacitor for Android
- Copying assets for Electron

```bash
npm run build
```

> [!NOTE]
> This single command prepares the application for both Android and Electron platforms. You don't need to run separate build or sync commands.

### Running Android

After building, open the project in Android Studio:

```bash
npx cap open android
```

Then run the app from Android Studio on an emulator or physical device.

### Running Electron (Desktop)

After building, start the Electron app:

```bash
npm run electron:start
```
