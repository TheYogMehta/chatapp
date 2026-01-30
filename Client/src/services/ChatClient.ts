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
  peerEmail?: string;
}

export class ChatClient extends EventEmitter {
  private static instance: ChatClient;
  public sessions: Record<string, ChatSession> = {};
  public userEmail: string | null = null;
  private authToken: string | null = null;
  private identityKeyPair: CryptoKeyPair | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private iceCandidatesQueue: RTCIceCandidate[] = [];
  private remoteAudio: HTMLAudioElement | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  public hasToken(): boolean {
    return !!this.authToken;
  }

  async init() {
    await dbInit();
    await this.loadIdentity();
    await this.loadSessions();

    const storedToken = await getKeyFromSecureStorage("auth_token");
    if (storedToken) {
      this.authToken = storedToken;
      console.log("[Client] Restored session token");
    }

    this.emit("session_updated");

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      if (this.authToken) {
        this.send({ t: "AUTH", data: { token: this.authToken } });
      }
      Object.keys(this.sessions).forEach((sid) =>
        this.send({ t: "REATTACH", sid }),
      );
    });

    socket.on("message", (frame: ServerFrame) => this.handleFrame(frame));

    await socket.connect("ws://162.248.100.69:9000");

    if (socket.isConnected()) {
      this.emit("status", true);
      Object.keys(this.sessions).forEach((sid) =>
        this.send({ t: "REATTACH", sid }),
      );
    }
  }

  public async syncPendingMessages() {
    console.log("[Client] Syncing pending messages...");
    try {
      const rows = await queryDB(
        "SELECT * FROM messages WHERE status = 1 AND sender = 'me'",
      );
      for (const row of rows) {
        if (this.sessions[row.sid]) {
          console.log(`[Client] Resending msg ${row.id} to ${row.sid}`);
          const payload = await this.encryptForSession(
            row.sid,
            JSON.stringify({
              t: "MSG",
              data: { text: row.text, id: row.id, timestamp: row.timestamp },
            }),
          );
          this.send({ t: "MSG", sid: row.sid, data: { payload } });
        }
      }
    } catch (e) {
      console.error("Failed to sync pending messages:", e);
    }
  }

  public async login(token: string) {
    this.authToken = token;
    await setKeyFromSecureStorage("auth_token", token);
    this.send({ t: "AUTH", data: { token } });
  }

  // --- Actions ---
  public async connectToPeer(targetEmail: string) {
    if (!this.userEmail) {
      throw new Error("Must be logged in to connect");
    }
    const pub = await this.exportPub();
    this.send({ t: "CONNECT_REQ", data: { targetEmail, publicKey: pub } });
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
    fileData: File | Blob | string,
    fileInfo: { name: string; size: number; type: string },
  ) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    console.log(`[ChatClient] sendFile: Processing...`);

    let blob: Blob;
    if (fileData instanceof Blob) {
      blob = fileData;
    } else if (typeof fileData === "string") {
      console.log(`[ChatClient] Fetching URI: ${fileData}`);
      const response = await fetch(fileData);
      blob = await response.blob();
    } else {
      throw new Error("Invalid file data type");
    }

    console.log(`[ChatClient] Blob size ${blob.size}, type ${blob.type}`);
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.includes(",") ? res.split(",")[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    console.log(`[ChatClient] Base64 length: ${base64Data.length}`);
    const vaultFilename = await StorageService.saveRawFile(base64Data);
    console.log(`[ChatClient] Saved to vault: ${vaultFilename}`);

    const thumbUri =
      typeof fileData === "string" ? fileData : URL.createObjectURL(fileData);
    const thumbnail = await generateThumbnail(thumbUri, fileInfo.type);
    if (typeof fileData !== "string") {
      URL.revokeObjectURL(thumbUri);
    }
    const isImage = fileInfo.type.startsWith("image/");
    const isVideo = fileInfo.type.startsWith("video/");
    const isAudio = fileInfo.type.startsWith("audio/");

    const msgType = isImage
      ? "image"
      : isVideo
        ? "video"
        : isAudio
          ? "audio"
          : "file";
    const messageId = await this.insertMessageRecord(sid, "", msgType, "me");

    await StorageService.initMediaEntry(
      messageId,
      fileInfo.name,
      fileInfo.size,
      fileInfo.type,
      thumbnail,
      vaultFilename,
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
    if (!this.sessions[sid]?.online) {
      console.warn(
        `[Client] Cannot download ${messageId}, user ${sid} is OFFLINE`,
      );
      this.emit("notification", {
        type: "error",
        message: "User is offline. Download queued.",
      });
      return;
    }

    console.log(
      `[Client] Sending download request for ${messageId} chunk ${chunkIndex} to ${sid}`,
    );
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
    if (!this.sessions[sid]) throw new Error("Session not found");

    await this.setupPeerConnection(sid);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === "Audio" ? { audio: true } : { audio: true, video: true }
      );
      console.log("[ChatClient] startCall: Got local stream", stream.id);
      this.localStream = stream;
      stream.getTracks().forEach(track => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, stream);
        }
      });

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "OFFER", data: offer })
      );
      this.send({ t: "MSG", sid, data: { payload } });

      this.emit("call_outgoing", { sid, type: mode, remoteSid: sid });

    } catch (err) {
      console.error("Error starting call:", err);
      // Emit notification so UI shows toast
      this.emit("notification", {
        type: "error",
        message: "Could not access microphone/camera. Please check permissions."
      });
      // Also emit legacy error for logs
      this.emit("error", "Could not start call");
      this.endCall(sid);
    }
  }

  public async acceptCall(sid: string) {
    if (!this.sessions[sid]) return;

    try {
      if (!this.peerConnection) {
        console.error("No peer connection to accept");
        // Attempt to setup if missing (e.g. slight race condition or logic miss)
        await this.setupPeerConnection(sid);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[ChatClient] acceptCall: Got local stream", stream.id);
      this.localStream = stream;
      stream.getTracks().forEach(track => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, stream);
        }
      });

      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "ANSWER", data: answer })
      );
      this.send({ t: "MSG", sid, data: { payload } });

      this.emit("call_started", { sid, status: "connected", remoteSid: sid });

    } catch (err) {
      console.error("Error accepting call:", err);
      this.emit("notification", {
        type: "error",
        message: "Failed to accept call (Microphone error?)"
      });
    }
  }

  public async endCall(sid: string) {
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "CALL_END" })
    );
    this.send({ t: "MSG", sid, data: { payload } });
    this.cleanupCall();
    this.emit("call_ended", sid);
  }

  private cleanupCall() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
    this.remoteStream = null;
    this.iceCandidatesQueue = [];
  }

  private async setupPeerConnection(sid: string) {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log("[ChatClient] Sending ICE candidate");
        const payload = await this.encryptForSession(
          sid,
          JSON.stringify({ t: "ICE_CANDIDATE", data: event.candidate.toJSON() })
        );
        this.send({ t: "MSG", sid, data: { payload } });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("[ChatClient] ICE State:", this.peerConnection?.iceConnectionState);
      this.emit("ice_status", this.peerConnection?.iceConnectionState);
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[ChatClient] Received remote track", event.track.kind);
      // Use the first stream if available, otherwise create a new one with the track
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStream = stream;

      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      // Attach to DOM (hidden) to prevent GC and ensure playback policies
      audio.style.display = "none";
      document.body.appendChild(audio);
      this.remoteAudio = audio;

      audio.play().catch(e => {
        console.error("[ChatClient] Audio auto-play failed", e);
        // Retry on interaction if needed, but for now just log
      });

      // Cleanup on track end
      event.track.onended = () => {
        audio.remove();
      };
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log("[ChatClient] Connection state:", this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'disconnected' ||
        this.peerConnection?.connectionState === 'failed') {
        this.cleanupCall();
        this.emit("call_ended", sid);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("[ChatClient] ICE Connection state:", this.peerConnection?.iceConnectionState);
    };
  }

  private async handleMsg(sid: string, payload: string) {
    if (!this.sessions[sid]) {
      console.warn(`[Client] Received MSG for unknown session ${sid}`);
      return;
    }
    try {
      const decryptedBuffer = await this.decryptFromSession(sid, payload);
      if (!decryptedBuffer) {
        console.error(`[Client] Decryption failed for ${sid}`);
        return;
      }
      const { t, data } = JSON.parse(new TextDecoder().decode(decryptedBuffer));

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
          const isAudio = data.type.startsWith("audio/");
          const msgType = isImage
            ? "image"
            : isVideo
              ? "video"
              : isAudio
                ? "audio"
                : "file";

          const localId = await this.insertMessageRecord(
            sid,
            data.name,
            msgType,
            "other",
            data.messageId,
          );
          console.log(
            `[ChatClient] Received FILE_INFO: name=${data.name}, mime=${data.type}, size=${data.size}`,
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
            id: localId,
            mediaStatus: "pending",
          });
          break;
        case "FILE_REQ_CHUNK":
          await this.sendSingleChunk(sid, data.messageId, data.chunkIndex);
          break;
        case "FILE_CHUNK":
          await this.handleFileChunk(sid, data);
          break;
        case "OFFER":
          console.log("[ChatClient] Received OFFER");
          await this.setupPeerConnection(sid);
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(data));

          while (this.iceCandidatesQueue.length) {
            const c = this.iceCandidatesQueue.shift();
            await this.peerConnection!.addIceCandidate(c!);
          }
          this.emit("call_incoming", { sid, type: "Audio", remoteSid: sid });
          break;

        case "ANSWER":
          console.log("[ChatClient] Received ANSWER");
          if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data));
          }
          // Process queued ICE candidates
          while (this.iceCandidatesQueue.length) {
            const c = this.iceCandidatesQueue.shift();
            if (this.peerConnection) await this.peerConnection.addIceCandidate(c!);
          }
          this.emit("call_started", { sid, status: "connected", remoteSid: sid });
          break;

        case "ICE_CANDIDATE":
          try {
            console.log("[ChatClient] Received ICE_CANDIDATE", data);
            // Ensure data is in correct format (it should be since we send .toJSON())
            const candidate = new RTCIceCandidate(data);
            if (this.peerConnection) {
              if (this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(candidate).catch(e => {
                  console.error("[ChatClient] AddIceCandidate failed", e);
                });
              } else {
                console.log("[ChatClient] Queuing ICE candidate (no remote desc)");
                this.iceCandidatesQueue.push(candidate);
              }
            }
          } catch (e) {
            console.error("[ChatClient] Error handling ICE candidate", e);
          }
          break;

        case "CALL_END":
          console.log("[ChatClient] Received CALL_END");
          this.cleanupCall();
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
    console.log(
      `[Client] Processing FILE_REQ_CHUNK for ${messageId} index ${chunkIndex}`,
    );
    const rows = await queryDB(
      "SELECT filename, file_size FROM media WHERE message_id = ?",
      [messageId],
    );
    if (!rows.length) {
      console.error(`[Client] Media record not found for message ${messageId}`);
      return;
    }
    const { filename, file_size } = rows[0];
    try {
      const base64Chunk = await StorageService.readChunk(filename, chunkIndex);
      if (!base64Chunk) {
        console.error(`[Client] readChunk returned empty for ${filename}`);
        return;
      }

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
      console.log(`[Client] Sent chunk ${chunkIndex} for ${messageId}`);
    } catch (e) {
      console.error(`[Client] Failed to send chunk ${chunkIndex}:`, e);
    }
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
    console.log(
      `[Client] Received chunk ${chunkIndex} for ${messageId}, progress: ${progress}`,
    );

    if (isLast) {
      await executeDB(
        "UPDATE media SET status = 'downloaded' WHERE message_id = ?",
        [messageId],
      );
      this.emit("file_downloaded", { messageId });
    } else {
      await this.requestDownload(sid, messageId, chunkIndex + 1);
      this.emit("download_progress", { messageId, progress });
    }
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
      "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, 1)",
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

  public async logout() {
    this.authToken = null;
    this.userEmail = null;
    await setKeyFromSecureStorage("auth_token", "");
    this.emit("auth_error");
  }

  private async handleFrame(frame: ServerFrame) {
    const { t, sid, data } = frame;
    switch (t) {
      case "ERROR":
        console.error("[Client] Server Error:", data);
        if (data.message === "Auth failed" || data.message === "Authentication required") {
          await this.logout();
        }
        this.emit("notification", { type: "error", message: data.message });
        break;
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "AUTH_SUCCESS":
        this.userEmail = data.email;
        this.emit("auth_success", data.email);
        break;
      case "JOIN_REQUEST":
        this.emit("inbound_request", { sid, publicKey: data.publicKey, email: data.email });
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
          this.syncPendingMessages();
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

  // acceptFriend is duplicate, removing this block.
  // private async finalizeSession(sid: string, remotePubB64: string, peerEmail?: string) ... this is correct

  private async finalizeSession(sid: string, remotePubB64: string, peerEmail?: string) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = { cryptoKey: sharedKey, online: true, peerEmail };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await executeDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK, peer_email) VALUES (?, ?, ?)",
      [sid, JSON.stringify(jwk), peerEmail || null],
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
