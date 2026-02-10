# Secure Chat Application

A privacy-first, end-to-end encrypted messaging platform with file sharing and voice calls. Built with React, Capacitor, and Go.

## 🌟 Features

- **End-to-End Encryption**: AES-GCM-256 for messages, ECDH P-256 for key exchange
- **Cross-Platform**: Android, and Desktop (Electron)
- **File Sharing**: Encrypted chunked file transfer
- **Voice Calls**: Real-time encrypted audio streaming
- **Secure Vault**: Local encrypted storage for passwords and sensitive files
- **Multi-Account**: Switch between multiple Google accounts
- **Zero Server Storage**: Messages never stored on the server

## 📚 Documentation

### Getting Started

- **[Setup Guide](docs/SETUP.md)** - Build and run instructions for all platforms
- **[Overview](docs/OVERVIEW.md)** - What the app does, target users, and key features

### Architecture & Design

- **[System Architecture](docs/ARCHITECTURE.md)** - High-level architecture, components, and deployment
- **[Database Schema](docs/DATABASE.md)** - SQLite tables, relationships, and ER diagrams
- **[WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md)** - Frame types and API specifications
- **[Folder Structure](docs/FOLDER_STRUCTURE.md)** - Project organization and file purposes

### User Experience

- **[User Flows](docs/USER_FLOWS.md)** - End-to-end user journeys with flowcharts
- **[Features](docs/FEATURES.md)** - Detailed feature breakdowns and data flows

### Security & Authentication

- **[Security Documentation](docs/SECURITY.md)** - Encryption protocols, threat model, and best practices
- **[Authentication](docs/AUTHENTICATION.md)** - Google OAuth, session management, and multi-account

### Development & Deployment

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Platform-specific builds, CI/CD, and production deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Go 1.21+
- Android Studio (for Android builds)

### Run Client (Electron)

```bash
cd Client
npm install
cd electron
npm install
cd ..
npm run build
npm run electron:start
```

### Run Server

```bash
cd Server
go run socket.go
```

Server runs on port 9000

### Build for Production

See the [Deployment Guide](docs/DEPLOYMENT.md) for detailed platform-specific instructions.

## 🏗️ Tech Stack

### Frontend

- **React 18** + **TypeScript**
- **Ionic Framework** - Cross-platform UI
- **Capacitor** - Native bridge
- **Vite** - Build tool
- **Web Crypto API** - Encryption

### Backend

- **Go (Golang)** - WebSocket relay server
- **Gorilla WebSocket** - WebSocket implementation

### Storage

- **SQLite** - Local message database
- **Capacitor Secure Storage** - Keychain/Keystore for keys

## 🔐 Security Overview

- **Encryption**: ECDH P-256 + AES-GCM-256
- **Authentication**: Google OAuth 2.0
- **Session Tokens**: HMAC-signed with SHA-256
- **Zero Knowledge**: Server cannot decrypt messages
- **Device-Bound Keys**: Identity keys never leave the device

See [Security Documentation](docs/SECURITY.md) for comprehensive details.

## 📱 Platform Support

| Platform    | Status                  | Build Instructions                                                 |
| ----------- | ----------------------- | ------------------------------------------------------------------ |
| **Android** | ✅ Supported            | [Android Build](docs/DEPLOYMENT.md#2-android-application)          |
| **Desktop** | ✅ Supported (Electron) | [Desktop Build](docs/DEPLOYMENT.md#3-desktop-application-electron) |
| **iOS**     | ❌ Not implemented      | -                                                                  |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

- **You can**: Use, modify, and distribute this software.
- **You must**: Open-source your modifications if you distribute the software or run it as a network service (e.g., a web server).
- **You cannot**: Sublicense or use it in closed-source proprietary software.

See the [LICENSE](LICENSE) file for details.

## 🐛 Known Limitations

- No perfect forward secrecy (static session keys)
- No cross-device message synchronization
- Single relay server (no federation)
- Google OAuth dependency (no alternative auth methods)

## 📞 Support

For issues, questions, or feature requests, please open an issue on the repository.

## 🗺️ Roadmap

- [ ] App Vault Tagging System & One Time Otp With google authenticator
- [ ] Search in Vault & Chats
- [ ] Video Player
- [ ] Video Call
- [ ] Dev Share
- [ ] Live Share
- [ ] Add Users With QR Code
- [ ] Add Users With Bluetooth
- [ ] Add Users With NFC
- [ ] Backup & Restore
- [ ] Load External Media (Images) via server

## 📖 Additional Resources

- [Google OAuth Setup](https://console.cloud.google.com/apis/credentials)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Web Crypto API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

Built with ❤️ for privacy and security
