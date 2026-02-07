# Authentication & Authorization

This document describes the complete authentication and authorization system including Google OAuth integration, session management, and multi-account support.

## Authentication Architecture

![authentication-architecture](./images/authentication-architecture.svg)

## 1. Google OAuth Integration

### OAuth Flow Sequence

![oauth-flow](./images/oauth-flow.svg)

### ID Token Structure

Google returns a JWT (JSON Web Token) with the following claims:

```json
{
  "iss": "https://accounts.google.com",
  "azp": "588653192623-...",
  "aud": "588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com",
  "sub": "1234567890",
  "email": "user@example.com",
  "email_verified": true,
  "at_hash": "...",
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Critical Claims**:

- `aud`: Audience - Must match the app's OAuth client ID
- `email`: User's verified email address
- `exp`: Expiration timestamp

### Server-Side Validation

```go
func verifyGoogleToken(token string) (string, error) {
    // Call Google's tokeninfo endpoint
    resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + token)
    if err != nil || resp.StatusCode != 200 {
        return "", fmt.Errorf("invalid token")
    }

    var claims struct {
        Email string `json:"email"`
        Aud   string `json:"aud"`
    }
    json.NewDecoder(resp.Body).Decode(&claims)

    // Validate audience
    validClients := map[string]bool{
        "588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com": true, // Web/Electron
        "588653192623-lrcr1rs3meptlo4a2dkt6aam6jpvoua1.apps.googleusercontent.com": true, // Android
    }

    if !validClients[claims.Aud] {
        return "", fmt.Errorf("invalid audience")
    }

    return claims.Email, nil
}
```

## 2. Session Token System

### HMAC-Based Session Tokens

The server issues custom session tokens to avoid repeated Google API calls.

**Token Format**: `sess:<expiry>:<email>:<signature>`

**Example**: `sess:1735689600:user@example.com:a3d5f7e9...`

### Token Generation

```go
var sessionSecret []byte  // Random 32-byte key generated on server start

func generateSessionToken(email string) string {
    exp := time.Now().Add(30 * 24 * time.Hour).Unix()  // 30-day expiry
    data := fmt.Sprintf("sess:%d:%s", exp, email)

    h := hmac.New(sha256.New, sessionSecret)
    h.Write([]byte(data))
    sig := hex.EncodeToString(h.Sum(nil))

    return fmt.Sprintf("%s:%s", data, sig)
}
```

### Token Validation

```go
func verifyAuthToken(token string) (string, string, error) {
    // Session token path
    if strings.HasPrefix(token, "sess:") {
        parts := strings.Split(token, ":")
        if len(parts) != 4 {
            return "", "", fmt.Errorf("invalid format")
        }

        expStr, email, sig := parts[1], parts[2], parts[3]
        data := fmt.Sprintf("sess:%s:%s", expStr, email)

        // Verify HMAC signature
        h := hmac.New(sha256.New, sessionSecret)
        h.Write([]byte(data))
        expectedSig := hex.EncodeToString(h.Sum(nil))

        if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
            return "", "", fmt.Errorf("invalid signature")
        }

        // Check expiration
        exp, _ := strconv.ParseInt(expStr, 10, 64)
        if time.Now().Unix() > exp {
            return "", "", fmt.Errorf("expired")
        }

        return email, token, nil
    }

    // Google ID token path
    email, err := verifyGoogleToken(token)
    if err != nil {
        return "", "", err
    }

    newToken := generateSessionToken(email)
    return email, newToken, nil
}
```

### Token Storage (Client)

```typescript
// After receiving AUTH_SUCCESS
const key = await AccountService.getStorageKey(email, "auth_token");
await setKeyFromSecureStorage(key, sessionToken);

// On app restart
const storedAccounts = await AccountService.getAccounts();
const account = storedAccounts.find((a) => a.email === selectedEmail);
await ChatClient.login(account.token);
```

## 3. Multi-Account Support

### Account Data Structure

```typescript
interface StoredAccount {
  email: string;
  token: string; // Session token
  lastActive: number; // Timestamp
  displayName?: string; // User-set name
  avatarUrl?: string; // Local avatar path
}
```

### Account Storage

All accounts stored in `SafeStorage` under key: `chatapp_accounts`

```typescript
const accounts: StoredAccount[] = [
  {
    email: "work@company.com",
    token: "sess:...",
    lastActive: 1704067200000,
    displayName: "Work Account",
  },
  {
    email: "personal@gmail.com",
    token: "sess:...",
    lastActive: 1703980800000,
    displayName: "Personal",
  },
];
```

### Database Isolation

Each account has a separate SQLite database:

```typescript
async function getDbName(email: string): Promise<string> {
  const hashHex = await hashIdentifier(email);
  return `user_${hashHex.substring(0, 16)}`;
  // Example: "user_a3f7d2e1c4b8f9a2"
}
```

**Result**: Complete data isolation between accounts

### Account Switching Flow

![account-switching](./images/account-switching.svg)

## 4. Authorization Model

### Permission Levels

The app has a simple authorization model:

| Resource                | Authorization Rule                                       |
| ----------------------- | -------------------------------------------------------- |
| **Own Messages**        | User can read/delete their own messages                  |
| **Session Messages**    | User can view messages in sessions they're part of       |
| **Session Keys**        | Only accessible to session participants (locally stored) |
| **Identity Keys**       | Private - never shared                                   |
| **Other User Profiles** | Public (name/avatar) shared on connection                |

### No Role-Based Access Control (RBAC)

- All users are equal (no admin/moderator roles)
- Peer-to-peer model: no group chats or channels

## 5. Login Flow (Complete)

![login-flow](./images/login-flow.svg)

## 6. Logout Flow

![logout-flow](./images/logout-flow.svg)

**Important**: Logout does NOT delete:

- Local SQLite database
- Identity key pair
- Peer session keys
- Account entry in SafeStorage

To fully remove an account, use "Delete Account" which calls `deleteDatabase()`.

## 7. Session Expiry Handling

### Token Expiry Detection

```typescript
// Server responds with ERROR
{
  t: "ERROR",
  data: {message: "Auth failed"}
}

// Client handler
if (data.message === "Auth failed") {
  await this.logout();
  this.emit('notification', {type: 'error', message: 'Session expired. Please log in again.'});
}
```

## 8. Security Considerations

### Single-Device Login

**Current Behavior**: If user logs in on Device B while already logged in on Device A, the server rejects Device B.

```go
if oldClientID, exists := s.emailToClientId[email]; exists {
    if _, ok := s.clients[oldClientID]; ok {
        s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Already logged in on another device"}`)})
        return
    }
}
```

**Rationale**: Prevents session hijacking and simplifies state management

### Token Security

| Token Type               | Storage       | Transmission          | Expiry     |
| ------------------------ | ------------- | --------------------- | ---------- |
| **Google ID Token**      | Never stored  | TLS only              | 1 hour     |
| **Session Token**        | SecureStorage | WebSocket (encrypted) | 30 days    |
| **Identity Private Key** | SecureStorage | Never transmitted     | Indefinite |
| **Session AES Keys**     | SQLite        | Never transmitted     | Indefinite |

### Attack Mitigations

1. **Token Replay**: Session tokens tied to email, validated with HMAC
2. **Man-in-the-Middle**: Use `wss://` (WebSocket Secure) in production
3. **Token Theft**: SecureStorage uses OS-level encryption (Keychain/Keystore)
4. **Brute Force**: Google OAuth handles rate limiting
5. **Session Fixation**: Tokens regenerated on each Google sign-in

## 9. Platform-Specific Authentication

### Android

- Uses Google Sign-In Android SDK
- APK must be signed with registered SHA-1 fingerprint
- Secure Storage uses Android Keystore

### Desktop (Electron)

- Uses Web OAuth flow in Electron browser window
- Secure Storage uses `electron-store` with encryption
- Same client ID as web version

## 10. Account Recovery

**Current**: NO account recovery mechanism

- Lost device = lost access
- No password reset (no passwords)
- No email recovery codes

**Mitigation**: Users should backup:

- Their Google account credentials
- Device encryption keys (if possible)
