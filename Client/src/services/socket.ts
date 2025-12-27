import { EventEmitter } from "events";
import { queryDB, executeDB } from "./sqliteService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
} from "./SafeStorage";

const SERVER_URL = "ws://162.248.100.69:9000";

// Push Notification
// import { PushNotifications } from "@capacitor/push-notifications";
// import { Capacitor } from "@capacitor/core";

// const PushSetup = () => {
//   useEffect(() => {
//     if (Capacitor.getPlatform() !== "android") return;

//     const registerPush = async () => {
//       let perm = await PushNotifications.checkPermissions();
//       if (perm.receive === "prompt") {
//         perm = await PushNotifications.requestPermissions();
//       }
//       if (perm.receive !== "granted") return;
//       await PushNotifications.register();
//       PushNotifications.addListener("registration", (token) => {
//         console.log("FCM Token:", token.value);
//       });

//       PushNotifications.addListener(
//         "pushNotificationReceived",
//         (notification) => {
//           console.log("Push received:", notification);
//         }
//       );
//     };

//     registerPush();
//   }, []);

//   return null;
// };

class ChatClient extends EventEmitter {
  private static instance: ChatClient;
  private ws: WebSocket | null = null;
  public sessions: Record<string, any> = {};
  private identityKeyPair: CryptoKeyPair | null = null;
  private name: string = "User";

  private constructor() {
    super();
  }

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  async init(userName: string) {
    this.name = userName;
    await this.loadIdentity();
    await this.loadSessions();
    this.connect();
  }

  private async loadIdentity() {
    try {
      const privJWK = await getKeyFromSecureStorage("identity_priv");
      const pubJWK = await getKeyFromSecureStorage("identity_pub");

      if (!privJWK || !pubJWK) throw new Error("failed to find saved keys");

      const priv = await window.crypto.subtle.importKey(
        "jwk",
        JSON.parse(privJWK),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      const pub = await window.crypto.subtle.importKey(
        "jwk",
        JSON.parse(pubJWK),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
      );
      this.identityKeyPair = { publicKey: pub, privateKey: priv };
    } catch (e) {
      this.identityKeyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      const privExport = await window.crypto.subtle.exportKey(
        "jwk",
        this.identityKeyPair.privateKey
      );
      const pubExport = await window.crypto.subtle.exportKey(
        "jwk",
        this.identityKeyPair.publicKey
      );
      await setKeyFromSecureStorage(
        "identity_priv",
        JSON.stringify(privExport)
      );
      await setKeyFromSecureStorage("identity_pub", JSON.stringify(pubExport));
    }
  }

  private async loadSessions() {
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      const cryptoKey = await window.crypto.subtle.importKey(
        "jwk",
        JSON.parse(row.keyJWK),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
      this.sessions[row.sid] = {
        cryptoKey,
        metadata: JSON.parse(row.metadata || "{}"),
      };
    }
  }

  private async saveSession(sid: string) {
    const keyJWK = await window.crypto.subtle.exportKey(
      "jwk",
      this.sessions[sid].cryptoKey
    );
    const sql = `INSERT OR REPLACE INTO sessions (sid, keyJWK, metadata) VALUES (?, ?, ?)`;
    await queryDB(sql, [
      sid,
      JSON.stringify(keyJWK),
      JSON.stringify(this.sessions[sid].metadata || {}),
    ]);
  }

  connect() {
    this.ws = new WebSocket(SERVER_URL);
    this.ws.onopen = () => this.emit("connected");
    this.ws.onmessage = (m) => this.handle(JSON.parse(m.data));
    this.ws.onclose = () => setTimeout(() => this.connect(), 3000);
  }

  async exportMyPublicKey() {
    const pub = await window.crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey
    );
    return btoa(String.fromCharCode(...new Uint8Array(pub)));
  }

  async deriveSharedKey(remotePubKeyBase64: string) {
    const remoteRaw = Uint8Array.from(atob(remotePubKeyBase64), (c) =>
      c.charCodeAt(0)
    );
    const remoteKey = await window.crypto.subtle.importKey(
      "raw",
      remoteRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    return await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: remoteKey },
      this.identityKeyPair!.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async encrypt(sid: string, text: string) {
    const key = this.sessions[sid].cryptoKey;
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(text)
    );
    const combined = new Uint8Array(12 + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), 12);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(sid: string, payload: string) {
    const key = this.sessions[sid].cryptoKey;
    const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  }

  async handle(frame: any) {
    const { t, sid, data } = frame;
    if (sid && !this.sessions[sid]) this.sessions[sid] = {};

    switch (t) {
      case "INVITE_CODE":
        const myPub = await this.exportMyPublicKey();
        this.send({ t: "INVITE_CREATE", sid, data: { publicKey: myPub } });
        this.emit("invite_ready", data.code);
        break;

      case "JOIN_REQUEST":
      case "JOINED":
        if (data.publicKey) {
          this.sessions[sid].cryptoKey = await this.deriveSharedKey(
            data.publicKey
          );
          await this.saveSession(sid);
          if (t === "JOIN_REQUEST") {
            const replyPub = await this.exportMyPublicKey();
            this.send({ t: "JOIN_ACCEPT", sid, data: { publicKey: replyPub } });
          }
          this.emit("joined", sid);
        }
        break;

      case "MSG":
        if (this.sessions[sid]?.cryptoKey) {
          const text = await this.decrypt(sid, data.payload);
          await queryDB(
            "INSERT INTO messages (sid, sender, text) VALUES (?, ?, ?)",
            [sid, "other", text]
          );
          this.emit("message", { sid, text });
        }
        break;
    }
  }

  send(frame: any) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(frame));
  }

  private async flushPendingMessages() {
    const pending = await queryDB("SELECT * FROM pending_messages");
    for (const msg of pending) {
      this.send({
        t: "MSG",
        sid: msg.sid,
        data: { payload: msg.payload, msgID: msg.msgID },
      });
      await queryDB("DELETE FROM pending_messages WHERE id = ?", [msg.id]);
    }
  }

  async sendMessage(sid: string, text: string) {
    const payload = await this.encrypt(sid, text);
    const msgID = Math.random().toString(16).slice(2);

    await queryDB("INSERT INTO messages (sid, sender, text) VALUES (?, ?, ?)", [
      sid,
      "me",
      text,
    ]);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: "MSG", sid, data: { payload, msgID } });
    } else {
      console.log("Offline: Queuing message for later...");
      await queryDB(
        "INSERT INTO pending_messages (sid, payload, msgID) VALUES (?, ?, ?)",
        [sid, payload, msgID]
      );
    }
  }
}

export default ChatClient.getInstance();
