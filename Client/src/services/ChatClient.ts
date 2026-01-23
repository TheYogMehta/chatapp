import { EventEmitter } from "events";
import { queryDB, executeDB, dbInit } from "./sqliteService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
} from "./SafeStorage";
import socket from "./SocketManager";
import { generateThumbnail } from "../utils/imageUtils";
import { StorageService } from "../utils/Storage";

interface ServerFrame {
  t: string;
  sid: string;
  data: any;
}

interface ChatSession {
  cryptoKey: CryptoKey;
  online: boolean;
}

class ChatClient extends EventEmitter {
  private static instance: ChatClient;
  public sessions: Record<string, ChatSession> = {};
  private identityKeyPair: CryptoKeyPair | null = null;
  private audioContext: AudioContext | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  async init() {
    await dbInit();
    await this.loadIdentity();
    await this.loadSessions();
    this.emit("session_updated");

    await socket.connect("ws://162.248.100.69:9000");

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      Object.keys(this.sessions).forEach((sid) =>
        this.send({ t: "REATTACH", sid }),
      );
    });

    socket.on("message", (frame: ServerFrame) => this.handleFrame(frame));
  }

  // --- Actions ---
  public createInvite() {
    this.send({ t: "CREATE_SESSION" });
  }

  public async joinByCode(code: string) {
    const pub = await this.exportPub();
    this.emit("waiting_for_accept", true);
    this.send({ t: "JOIN", data: { code, publicKey: pub } });
  }

  public async acceptFriend(sid: string, remotePub: string) {
    const pub = await this.exportPub();
    this.send({ t: "JOIN_ACCEPT", sid, data: { publicKey: pub } });
    await this.finalizeSession(sid, remotePub);
  }

  public denyFriend(sid: string) {
    this.send({ t: "JOIN_DENY", sid });
  }

  public async sendMessage(sid: string, text: string) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    const msgId = crypto.randomUUID();
    const timestamp = Date.now();
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "MSG", data: { text, id: msgId, timestamp } }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
    try {
      await executeDB(
        "INSERT INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, 'me', ?, 'text', ?, 1)",
        [msgId, sid, text, timestamp],
      );
    } catch (e) {
      console.error("[Client] Failed to save sent message:", e);
    }
  }

  public async sendFile(
    sid: string,
    fileUri: string,
    fileInfo: { name: string; size: number; type: string },
  ) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    // Persist file for serving
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    const vaultFilename = await StorageService.saveRawFile(base64Data);

    const thumbnail = await generateThumbnail(fileUri, fileInfo.type);
    const messageId = await this.insertMessageRecord(sid, "", "file", "me");
    
    // Initialize media entry with the vault filename so we can serve it later
    // This sets status='downloaded' immediately for the sender
    await StorageService.initMediaEntry(
        messageId,
        fileInfo.name,
        fileInfo.size,
        fileInfo.type,
        thumbnail,
        vaultFilename
    );

    const encryptedMetadata = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "FILE_INFO",
        data: {
          name: fileInfo.name,
          size: fileInfo.size,
          type: fileInfo.type,
          thumbnail,
          messageId,
        },
      }),
    );

    this.send({ t: "MSG", sid, data: { payload: encryptedMetadata } });
    this.emit("session_updated");
  }

  public async requestDownload(
    sid: string,
    messageId: string,
    chunkIndex: number = 0,
  ) {
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "FILE_REQ_CHUNK",
        data: { messageId, chunkIndex },
      }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
  }

  public async startCall(sid: string, mode: "Audio" | "Video" = "Audio") {
    try {
      if (!this.sessions[sid]) throw new Error("Session not found");
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === "Audio" ? { audio: true } : { audio: true, video: true },
      );

      if (!this.audioContext || this.audioContext.state === 'closed') {
         this.audioContext = new AudioContext();
         await this.audioContext.audioWorklet.addModule("audioWorkletProcessor.js");
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        this.audioContext,
        "call-processor",
      );
      source.connect(workletNode);
      workletNode.connect(this.audioContext.destination);

      workletNode.port.onmessage = async (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        const payload = await this.encryptForSession(
          sid,
          JSON.stringify({ t: "CALL_AUDIO", data: pcmBuffer }),
        );
        this.send({ t: "MSG", sid, data: { payload } });
      };

      // Notify peer of the call
      const invite = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "CALL_INVITE", mode }),
      );
      this.send({ t: "MSG", sid, data: { payload: invite } });
    } catch (err) {
      console.error("Could not start call:", err);
      this.emit("error", "Microphone access required.");
    }
  }

  public async acceptCall(sid: string) {
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "CALL_ACCEPT" }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
    this.emit("call_started", { sid, status: "connected" });
  }

  public async endCall(sid: string) {
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "CALL_END" }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.emit("call_ended", sid);
  }

  private async handleMsg(sid: string, payload: string) {
    if (!this.sessions[sid]) {
      console.warn(`[Client] Received MSG for unknown session ${sid}`);
      return;
    }
    try {
      console.log(`[Client] Decrypting frame for ${sid}...`);
      const decryptedBuffer = await this.decryptFromSession(sid, payload);
      if (!decryptedBuffer) {
        console.error(`[Client] Decryption failed for ${sid}`);
        return;
      }
      const { t, data } = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      console.log(`[Client] Frame Type: ${t}`, data);

      switch (t) {
        case "MSG":
          try {
            await executeDB(
              "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, 'other', ?, 'text', ?, 2)",
              [data.id, sid, data.text, data.timestamp],
            );
          } catch (e) {
            console.error("[Client] Failed to save received message:", e);
          }
          this.emit("message", {
            sid,
            text: data.text,
            sender: "other",
            type: "text",
            id: data.id,
          });
          break;
        case "FILE_INFO":
          const isImage = data.type.startsWith("image/");
          const isVideo = data.type.startsWith("video/");
          const msgType = isImage ? "image" : isVideo ? "video" : "file";

          const localId = await this.insertMessageRecord(
            sid,
            data.name,
            msgType,
            "other",
            data.messageId
          );
          await StorageService.initMediaEntry(
            localId,
            data.name,
            data.size,
            data.type,
            data.thumbnail,
            null,
          );
          this.emit("message", {
            sid,
            text: data.name,
            sender: "other",
            type: msgType,
            thumbnail: data.thumbnail,
            messageId: localId,
            mediaStatus: 'pending',
          });
          break;
        case "FILE_REQ_CHUNK":
          await this.sendSingleChunk(sid, data.messageId, data.chunkIndex);
          break;
        case "FILE_CHUNK":
          await this.handleFileChunk(sid, data);
          break;
        case "CALL_INVITE":
          this.emit("call_invite", { sid, mode: data.mode });
          break;
        case "CALL_ACCEPT":
          this.emit("call_started", { sid, status: "connected" });
          break;
        case "CALL_END":
          this.emit("call_ended", sid);
          break;
      }
    } catch (e) {
      console.error("E2EE decrypt error", e);
    }
  }

  private async sendSingleChunk(
    sid: string,
    messageId: string,
    chunkIndex: number,
  ) {
    const rows = await queryDB(
      "SELECT filename, file_size FROM media WHERE message_id = ?",
      [messageId],
    );
    if (!rows.length) return;
    const { filename, file_size } = rows[0];
    const base64Chunk = await StorageService.readChunk(filename, chunkIndex);
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "FILE_CHUNK",
        data: {
          messageId,
          chunkIndex,
          payload: base64Chunk,
          isLast: (chunkIndex + 1) * 64000 >= file_size,
        },
      }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
  }

  private async handleFileChunk(sid: string, data: any) {
    const { messageId, payload, chunkIndex, isLast } = data;
    const rows = await queryDB(
      "SELECT filename, file_size FROM media WHERE message_id = ?",
      [messageId],
    );
    if (!rows.length) return;
    const { filename, file_size } = rows[0];
    await StorageService.appendChunk(filename, payload);

    const currentSize = Math.min((chunkIndex + 1) * 64000, file_size);
    const progress = currentSize / file_size;

    await executeDB(
      "UPDATE media SET download_progress = ?, size = ? WHERE message_id = ?",
      [progress, currentSize, messageId],
    );

    if (isLast) {
      await executeDB(
        "UPDATE media SET status = 'downloaded' WHERE message_id = ?",
        [messageId],
      );
      this.emit("file_downloaded", { messageId });
    } else {
      await this.requestDownload(sid, messageId, chunkIndex + 1);
    }
    this.emit("download_progress", { messageId, progress });
  }

  private async insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
  ): Promise<string> {
    const id = forceId || crypto.randomUUID();
    const timestamp = Date.now();
    await executeDB(
      "INSERT INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, 1)",
      [id, sid, sender, text, type, timestamp],
    );
    return id;
  }

  private async encryptForSession(
    sid: string,
    data: string | ArrayBuffer,
  ): Promise<string> {
    const session = this.sessions[sid];
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    const enc = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      session.cryptoKey,
      encoded,
    );
    const combined = new Uint8Array(12 + enc.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(enc), 12);
    return btoa(String.fromCharCode(...combined));
  }

  private async decryptFromSession(
    sid: string,
    payload: string,
  ): Promise<ArrayBuffer | null> {
    const session = this.sessions[sid];
    const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return crypto.subtle
      .decrypt(
        { name: "AES-GCM", iv: raw.slice(0, 12) },
        session.cryptoKey,
        raw.slice(12),
      )
      .catch(() => null);
  }

  private async handleFrame(frame: ServerFrame) {
    const { t, sid, data } = frame;
    switch (t) {
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "JOIN_REQUEST":
        this.emit("inbound_request", { sid, publicKey: data.publicKey });
        break;
      case "JOIN_ACCEPT":
        await this.finalizeSession(sid, data.publicKey);
        this.emit("joined_success", sid);
        break;
      case "MSG":
        await this.handleMsg(sid, data.payload);
        break;
      case "PEER_ONLINE":
        if (this.sessions[sid]) {
          this.sessions[sid].online = true;
          this.emit("session_updated");
        }
        break;
      case "PEER_OFFLINE":
        if (this.sessions[sid]) {
          this.sessions[sid].online = false;
          this.emit("session_updated");
        }
        break;
      case "DELIVERED":
        await executeDB(
          "UPDATE messages SET status = 2 WHERE sid = ? AND status = 1",
          [sid],
        );
        this.emit("message_status", { sid });
        break;
    }
  }

  public send(f: any) {
    socket.send(f);
  }

  private async finalizeSession(sid: string, remotePubB64: string) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = { cryptoKey: sharedKey, online: false };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await executeDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK) VALUES (?, ?)",
      [sid, JSON.stringify(jwk)],
    );
    this.emit("session_updated");
  }

  private async loadIdentity() {
    const privJWK = await getKeyFromSecureStorage("identity_priv");
    const pubJWK = await getKeyFromSecureStorage("identity_pub");
    if (privJWK && pubJWK) {
      this.identityKeyPair = {
        privateKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(privJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"],
        ),
        publicKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(pubJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          [],
        ),
      };
    } else {
      this.identityKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"],
      );
      await setKeyFromSecureStorage(
        "identity_priv",
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.privateKey),
        ),
      );
      await setKeyFromSecureStorage(
        "identity_pub",
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.publicKey),
        ),
      );
    }
  }

  private async loadSessions() {
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      this.sessions[row.sid] = {
        cryptoKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(row.keyJWK),
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"],
        ),
        online: false,
      };
    }
  }

  public async exportPub() {
    const raw = await crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey,
    );
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  private async deriveSharedKey(pubB64: string) {
    const raw = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0));
    const pub = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return crypto.subtle.deriveKey(
      { name: "ECDH", public: pub },
      this.identityKeyPair!.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }
}

export default ChatClient.getInstance();
