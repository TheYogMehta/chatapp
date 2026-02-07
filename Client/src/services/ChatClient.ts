import { EventEmitter } from "events";
import { queryDB, executeDB, dbInit, switchDatabase } from "./sqliteService";
import { AccountService } from "./AccountService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
  setActiveUser,
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
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isCalling: boolean = false;
  private isCallConnected: boolean = false;
  private remoteAudio: HTMLAudioElement | null = null;
  private remoteVideo: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isSourceOpen = false;
  private callStartTime: number = 0;
  private currentStreamArgs: MediaStreamConstraints | null = null;
  private remoteMimeType: string | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  public hasToken(): boolean {
    return !!this.authToken;
  }

  async init() {
    this.emit("session_updated");

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      if (this.authToken) {
        this.send({ t: "AUTH", data: { token: this.authToken } });
      }
    });

    socket.on("message", (frame: ServerFrame) => this.handleFrame(frame));
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
              data: {
                text: row.text,
                id: row.id,
                timestamp: row.timestamp,
                replyTo: row.reply_to ? JSON.parse(row.reply_to) : undefined,
              },
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
    if (!socket.isConnected()) {
      await socket.connect("ws://162.248.100.69:9000");
    } else {
      this.send({ t: "AUTH", data: { token } });
    }
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

  public async sendMessage(sid: string, text: string, replyTo?: any) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    const msgId = crypto.randomUUID();
    const timestamp = Date.now();
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { text, id: msgId, timestamp, replyTo },
      }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
    try {
      await executeDB(
        "INSERT INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'me', ?, 'text', ?, 1, ?)",
        [msgId, sid, text, timestamp, replyTo ? JSON.stringify(replyTo) : null],
      );
    } catch (e) {
      console.error("[Client] Failed to save sent message:", e);
    }
  }

  public async broadcastProfileUpdate() {
    try {
      const rows = await queryDB(
        "SELECT name_version, avatar_version FROM me WHERE id = 1",
      );
      if (!rows.length) return;
      const { name_version, avatar_version } = rows[0];

      console.log(
        `[ChatClient] Broadcasting profile update: v${name_version}/${avatar_version}`,
      );

      const sids = Object.keys(this.sessions);
      for (const sid of sids) {
        if (this.sessions[sid].online) {
          try {
            const payload = await this.encryptForSession(
              sid,
              JSON.stringify({
                t: "PROFILE_VERSION",
                data: { name_version, avatar_version },
              }),
            );
            this.send({ t: "MSG", sid, data: { payload } });
          } catch (e) {
            console.error(
              `[ChatClient] Failed to send profile update to ${sid}`,
              e,
            );
          }
        }
      }
    } catch (e) {
      console.error("[ChatClient] Failed to broadcast profile update", e);
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

  public async startCall(
    sid: string,
    mode: "Audio" | "Video" | "Screen" = "Audio",
  ) {
    if (!this.sessions[sid]) throw new Error("Session not found");
    if (!this.sessions[sid].online) {
      this.emit("notification", { type: "error", message: "User is offline" });
      return;
    }
    if (this.isCalling) return;

    this.callStartTime = Date.now();

    try {
      this.isCalling = true;
      console.log("[ChatClient] startCall: Sending invite to", sid);

      const mimeType = await this.startStreaming(sid, mode);

      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "CALL_START", data: { type: mode, mimeType } }),
      );
      this.send({ t: "MSG", sid, data: { payload } });

      this.emit("call_outgoing", { sid, type: mode, remoteSid: sid });
      // Pre-warm the stream locally if possible, or wait for accept
    } catch (err: any) {
      this.isCalling = false;
      console.error("Error starting call:", err);
      this.emit("notification", {
        type: "error",
        message:
          "Could not access microphone/camera. Please check permissions.",
      });
      this.emit("error", "Could not start call");
    }
  }

  public async switchStream(sid: string, mode: "Audio" | "Video" | "Screen") {
    if (!this.isCalling) return;
    console.log(`[ChatClient] Switching stream to ${mode}`);

    try {
      // Stop current recorder
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        this.mediaRecorder.stop();
      }
      await this.startStreaming(sid, mode);
    } catch (err: any) {
      console.error("Failed to switch stream:", err);
      this.emit("notification", {
        type: "error",
        message: err.message || "Failed to switch stream",
      });
    }
  }

  private async startStreaming(
    sid: string,
    mode: "Audio" | "Video" | "Screen" = "Audio",
  ): Promise<string> {
    try {
      let stream: MediaStream;
      let mimeType = "audio/webm;codecs=opus"; // Default audio
      let bitsPerSecond = 48000;

      if (mode === "Screen") {
        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getDisplayMedia
        ) {
          throw new Error("Screen sharing is not supported on this device.");
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        mimeType = "video/webm;codecs=vp8,opus";
        bitsPerSecond = 2500000; // 2.5 Mbps
      } else if (mode === "Video") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mimeType = "video/webm;codecs=vp8,opus";
        bitsPerSecond = 1000000; // 1 Mbps
      } else {
        // Audio only
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mimeType = "audio/webm;codecs=opus";
        bitsPerSecond = 48000;
      }

      console.log("[ChatClient] startStreaming: Got local stream", stream.id);

      // Check supported types if needed, or fallbacks
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(`[ChatClient] ${mimeType} not supported, trying fallback`);
        if (mode !== "Audio" && MediaRecorder.isTypeSupported("video/webm")) {
          mimeType = "video/webm";
        } else if (MediaRecorder.isTypeSupported("video/mp4")) {
          mimeType = "video/mp4";
        }
      }

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        bitsPerSecond,
      });

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          try {
            const buffer = await e.data.arrayBuffer();
            const encrypted = await this.encryptForSession(sid, buffer);
            // We can send a flag or detect type on receiver, but existing logic relies on single stream msg
            // To support switching, receiver needs to know if format changed.
            // For now, simpler implementation: receiver tries to append.
            // Ideally we send a "STREAM_CONFIG" msg before data if type changes.
            this.send({ t: "STREAM", sid, data: encrypted });
          } catch (err) {
            console.error("Encryption streaming error:", err);
          }
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped");
      };

      this.mediaRecorder.start(100); // 100ms slices
      return mimeType;
    } catch (e) {
      console.error("Error starting stream", e);
      this.emit("notification", {
        type: "error",
        message: "Microphone/Camera error: " + e,
      });
      // Don't end call immediately on switch fail, just log
      throw e;
    }
  }

  public async acceptCall(sid: string) {
    if (!this.sessions[sid]) return;
    if (this.isCalling) return;

    try {
      this.isCalling = true;
      const mimeType = await this.startStreaming(sid, "Audio"); // Default accept is audio for now, or match offer?

      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "CALL_ACCEPT", data: { mimeType } }),
      );
      this.send({ t: "MSG", sid, data: { payload } });

      this.callStartTime = Date.now();
      this.isCallConnected = true;
      this.emit("call_started", { sid, status: "connected", remoteSid: sid });

      this.setupMediaPlayback();
    } catch (err) {
      this.isCalling = false;
      console.error("Error accepting call:", err);
      this.emit("notification", {
        type: "error",
        message: "Failed to accept call (Microphone error?)",
      });
    }
  }

  public async endCall(sid: string) {
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "CALL_END" }),
    );
    this.send({ t: "MSG", sid, data: { payload } });
    const wasConnected = this.isCallConnected;
    this.cleanupCall();
    const duration = Date.now() - this.callStartTime;
    this.emit("call_ended", { sid, duration, connected: wasConnected });
  }

  private cleanupCall() {
    this.isCalling = false;
    this.isCallConnected = false;
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }
    if (this.remoteAudio) {
      if (this.remoteAudio.src) {
        URL.revokeObjectURL(this.remoteAudio.src);
      }
      this.remoteAudio.pause();
      this.remoteAudio.src = "";
      this.remoteAudio = null;
    }

    if (this.remoteVideo) {
      if (this.remoteVideo.src) {
        URL.revokeObjectURL(this.remoteVideo.src);
      }
      this.remoteVideo.pause();
      this.remoteVideo.src = "";
      this.remoteVideo = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.audioQueue = [];
    this.isSourceOpen = false;
    this.remoteMimeType = null;
  }

  private setupMediaPlayback() {
    if (this.remoteVideo) return; // Already setup

    // We'll use a video element for everything, it can play audio too
    this.remoteVideo = document.createElement("video");
    this.remoteVideo.autoplay = true;
    this.remoteVideo.playsInline = true;
    // this.remoteVideo.style.display = "none"; // Hide initially? Or logic handles it

    // Auto-attach to DOM? No, UI should attach it.
    // Actually, UI needs the stream/element.
    // For now, let's just create it and maybe emit it or expose it?
    // The existing code wasn't attaching remoteAudio to DOM, just playing it.

    const ms = new MediaSource();
    this.mediaSource = ms;
    this.remoteVideo.src = URL.createObjectURL(ms);

    ms.addEventListener("sourceopen", () => {
      if (this.mediaSource !== ms || ms.sourceBuffers.length > 0) return;

      this.isSourceOpen = true;
      try {
        // Try video codec first
        // Note: receiver doesn't strictly know if it is audio or video unless we signal it.
        // But adding a video buffer often handles audio too if MIME is correct.
        // We'll try a generous MIME type.
        // We'll try a generous MIME type.
        let mime = this.remoteMimeType || "video/webm;codecs=vp8,opus";
        if (!MediaSource.isTypeSupported(mime)) {
          console.warn(
            `[ChatClient] Prefered mime ${mime} not supported, trying fallbacks`,
          );
          mime = "video/webm;codecs=vp8,opus"; // Reset to default attempt
          if (!MediaSource.isTypeSupported(mime)) {
            mime = "video/webm;codecs=vp8"; // Fallback?
            if (!MediaSource.isTypeSupported(mime)) {
              mime = "audio/webm;codecs=opus";
            }
          }
        }

        console.log(`[ChatClient] Creating SourceBuffer with ${mime}`);
        this.sourceBuffer = ms.addSourceBuffer(mime);
        this.sourceBuffer.mode = "sequence";
        this.sourceBuffer.addEventListener("updateend", () => {
          this.processQueue();
        });
      } catch (e) {
        console.error("Error adding SourceBuffer:", e);
      }
    });

    // Emit event so UI can grab the video element
    this.emit("remote_stream_ready", this.remoteVideo);
  }

  private processQueue() {
    if (
      !this.sourceBuffer ||
      this.sourceBuffer.updating ||
      this.audioQueue.length === 0
    )
      return;
    const chunk = this.audioQueue.shift();
    if (chunk) {
      try {
        this.sourceBuffer.appendBuffer(chunk);
      } catch (e) {
        console.error("SourceBuffer append error", e);
      }
    }
  }

  private async handleStream(frame: ServerFrame) {
    const { sid, data } = frame;
    try {
      if (!this.remoteVideo) {
        this.setupMediaPlayback();
      }

      const decryptedBuffer = await this.decryptFromSession(sid, data);
      if (decryptedBuffer) {
        this.audioQueue.push(decryptedBuffer);
        if (
          this.isSourceOpen &&
          this.sourceBuffer &&
          !this.sourceBuffer.updating
        ) {
          this.processQueue();
        }
      }
    } catch (e) {
      console.error("Stream handling error", e);
    }
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
      const json = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      const { t, data } = json;
      console.log("[ChatClient] Decrypted MSG:", json);

      switch (t) {
        case "MSG":
          try {
            await executeDB(
              "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'other', ?, 'text', ?, 2, ?)",
              [
                data.id,
                sid,
                data.text,
                data.timestamp,
                data.replyTo ? JSON.stringify(data.replyTo) : null,
              ],
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
            replyTo: data.replyTo,
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

        case "CALL_START":
          if (this.isCalling) {
            console.log(
              "[ChatClient] Already on call, rejecting new call from",
              sid,
            );
            const busyPayload = await this.encryptForSession(
              sid,
              JSON.stringify({ t: "CALL_BUSY" }),
            );
            this.send({ t: "MSG", sid, data: { payload: busyPayload } });
            return;
          }
          console.log("[ChatClient] Received CALL_START");
          if (data?.mimeType) this.remoteMimeType = data.mimeType;
          this.emit("call_incoming", {
            sid,
            type: data?.type || "Audio",
            remoteSid: sid,
          });
          break;

        case "CALL_BUSY":
          console.log("[ChatClient] Remote user is busy");
          this.emit("notification", {
            type: "info",
            message: "User is busy on another call.",
          });
          this.cleanupCall();
          this.emit("call_ended", { sid, duration: 0, connected: false });
          break;

        case "CALL_ACCEPT":
          console.log("[ChatClient] Received CALL_ACCEPT");
          if (data?.mimeType) this.remoteMimeType = data.mimeType;
          await this.startStreaming(sid); // Default audio for now on accept

          this.setupMediaPlayback();
          this.isCallConnected = true;

          this.emit("call_started", {
            sid,
            status: "connected",
            remoteSid: sid,
          });
          break;

        case "CALL_END":
          console.log("[ChatClient] Received CALL_END");
          this.cleanupCall();
          const duration = Date.now() - this.callStartTime;
          this.emit("call_ended", {
            sid,
            duration,
            connected: this.isCallConnected,
          });
          break;

        case "PROFILE_VERSION":
          try {
            const { name_version, avatar_version } = data;
            const peerRows = await queryDB(
              "SELECT peer_name_ver, peer_avatar_ver FROM sessions WHERE sid = ?",
              [sid],
            );
            if (peerRows.length) {
              const current = peerRows[0];
              if (
                name_version > (current.peer_name_ver || 0) ||
                avatar_version > (current.peer_avatar_ver || 0)
              ) {
                console.log(
                  `[ChatClient] Peer ${sid} has newer profile (v${name_version}/${avatar_version}), requesting update...`,
                );
                const reqPayload = await this.encryptForSession(
                  sid,
                  JSON.stringify({ t: "GET_PROFILE" }),
                );
                this.send({ t: "MSG", sid, data: { payload: reqPayload } });
              }
            }
          } catch (e) {
            console.error("Error handling PROFILE_VERSION", e);
          }
          break;

        case "GET_PROFILE":
          try {
            const meRows = await queryDB(
              "SELECT public_name, public_avatar, name_version, avatar_version FROM me WHERE id = 1",
            );
            if (meRows.length) {
              const me = meRows[0];
              let avatarBase64 = null;
              if (me.public_avatar) {
                if (!me.public_avatar.startsWith("data:")) {
                  try {
                    avatarBase64 = await StorageService.readChunk(
                      me.public_avatar,
                      0,
                    );
                    const src = await StorageService.getFileSrc(
                      me.public_avatar,
                    );
                    avatarBase64 = src;
                  } catch (e) {
                    console.warn("Failed to load avatar file", e);
                  }
                } else {
                  avatarBase64 = me.public_avatar;
                }
              }

              const respPayload = await this.encryptForSession(
                sid,
                JSON.stringify({
                  t: "PROFILE_DATA",
                  data: {
                    name: me.public_name,
                    avatar: avatarBase64,
                    name_version: me.name_version,
                    avatar_version: me.avatar_version,
                  },
                }),
              );
              this.send({ t: "MSG", sid, data: { payload: respPayload } });
            }
          } catch (e) {
            console.error("Error handling GET_PROFILE", e);
          }
          break;

        case "PROFILE_DATA":
          try {
            const { name, avatar, name_version, avatar_version } = data;
            console.log(
              `[ChatClient] Received PROFILE_DATA from ${sid}: ${name}`,
            );

            let avatarFile = null;
            if (avatar) {
              // Check if it's a data URI
              if (avatar.startsWith("data:")) {
                // Save to dedicated profile storage using SID as identifier
                // This overwrites any existing profile image for this SID, preventing duplicates
                const base64 = avatar.split(",")[1];
                avatarFile = await StorageService.saveProfileImage(base64, sid);
              } else {
                // It might be a legacy filename or something else, keep as is
                avatarFile = avatar;
              }
            }

            await executeDB(
              "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
              [name, avatarFile, name_version, avatar_version, sid],
            );
            this.emit("session_updated");
          } catch (e) {
            console.error("Error handling PROFILE_DATA", e);
          }
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
    replyTo?: any,
  ): Promise<string> {
    const id = forceId || crypto.randomUUID();
    const timestamp = Date.now();
    await executeDB(
      "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      [
        id,
        sid,
        sender,
        text,
        type,
        timestamp,
        replyTo ? JSON.stringify(replyTo) : null,
      ],
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
    if (this.userEmail) {
      const key = await AccountService.getStorageKey(
        this.userEmail,
        "auth_token",
      );
      await setKeyFromSecureStorage(key, "");
    }
    this.authToken = null;
    this.userEmail = null;
    this.emit("auth_error");
  }

  public async switchAccount(email: string) {
    const accounts = await AccountService.getAccounts();
    const account = accounts.find((a) => a.email === email);
    if (!account) throw new Error("Account not found");

    this.authToken = account.token;
    await setKeyFromSecureStorage(
      await AccountService.getStorageKey(email, "auth_token"),
      account.token,
    );

    const key = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(email, "MASTER_KEY"),
    );
    const dbName = await AccountService.getDbName(email);
    await switchDatabase(dbName, key || undefined);

    this.sessions = {};
    this.userEmail = email;
    await setActiveUser(email);
    await this.loadSessions();
    await this.loadIdentity();

    if (!socket.isConnected()) {
      await socket.connect("ws://162.248.100.69:9000");
    } else {
      this.send({ t: "AUTH", data: { token: this.authToken } });
    }

    this.emit("auth_success", email);
    this.emit("session_updated");
  }

  private async handleFrame(frame: ServerFrame) {
    const { t, sid, data } = frame;
    switch (t) {
      case "ERROR":
        console.error("[Client] Server Error:", data);
        if (
          data.message === "Auth failed" ||
          data.message === "Authentication required" ||
          data.message === "Already logged in on another device"
        ) {
          await this.logout();
        }
        this.emit("notification", { type: "error", message: data.message });
        break;
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "AUTH_SUCCESS":
        this.userEmail = data.email;
        if (data.token) {
          this.authToken = data.token;
          const tokenKey = await AccountService.getStorageKey(
            data.email,
            "auth_token",
          );
          await setKeyFromSecureStorage(tokenKey, data.token);
          console.log("[Client] Session token saved/refreshed");

          await AccountService.addAccount(data.email, data.token);
          await setActiveUser(data.email);

          let key = await getKeyFromSecureStorage(
            await AccountService.getStorageKey(data.email, "MASTER_KEY"),
          );
          if (!key) {
            console.log("[Client] Generating new MASTER_KEY for user");
            const raw = crypto.getRandomValues(new Uint8Array(32));
            key = Array.from(raw)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            await setKeyFromSecureStorage(
              await AccountService.getStorageKey(data.email, "MASTER_KEY"),
              key,
            );
          }
          const dbName = await AccountService.getDbName(data.email);
          await switchDatabase(dbName, key);

          this.sessions = {};
          await this.loadSessions();
          await this.loadIdentity();

          // Sync presence and profile now that we know who we are talking to
          Object.keys(this.sessions).forEach((sid) =>
            this.send({ t: "REATTACH", sid }),
          );
          this.broadcastProfileUpdate();

          this.emit("session_updated");
        }
        this.emit("auth_success", data.email);
        break;
      case "JOIN_REQUEST":
        this.emit("inbound_request", {
          sid,
          publicKey: data.publicKey,
          email: data.email,
        });
        break;
      case "JOIN_ACCEPT":
        await this.finalizeSession(sid, data.publicKey);
        this.emit("joined_success", sid);
        break;
      case "MSG":
        await this.handleMsg(sid, data.payload);
        break;
      case "STREAM":
        await this.handleStream(frame);
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

  private async finalizeSession(
    sid: string,
    remotePubB64: string,
    peerEmail?: string,
  ) {
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
    if (!this.userEmail) return;
    const privKeyName = await AccountService.getStorageKey(
      this.userEmail,
      "identity_priv",
    );
    const pubKeyName = await AccountService.getStorageKey(
      this.userEmail,
      "identity_pub",
    );

    const privJWK = await getKeyFromSecureStorage(privKeyName);
    const pubJWK = await getKeyFromSecureStorage(pubKeyName);
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
        privKeyName,
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.privateKey),
        ),
      );
      await setKeyFromSecureStorage(
        pubKeyName,
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
