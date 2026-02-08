import { EventEmitter } from "events";
import { queryDB, executeDB, switchDatabase } from "./sqliteService";
import { AccountService } from "./AccountService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
  setActiveUser,
} from "./SafeStorage";
import socket from "./SocketManager";
import { generateThumbnail } from "../utils/imageUtils";
import { StorageService } from "../utils/Storage";
import { MessageQueue } from "../utils/MessageQueue";
import * as bip39 from "bip39";
import { Buffer } from "buffer";
import {
  encryptToPackedString,
  decryptFromPackedString,
} from "../utils/crypto";

(window as any).Buffer = Buffer;

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
  private isCalling: boolean = false;
  private isCallConnected: boolean = false;
  private remoteAudio: HTMLAudioElement | null = null;
  private remoteVideo: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private messageQueue = new MessageQueue();
  private isSourceOpen = false;
  private callStartTime: number = 0;
  private remoteMimeType: string | null = null;
  public currentLocalStream: MediaStream | null = null;
  private currentCallSid: string | null = null;
  private isMediaSettingUp: boolean = false;
  private isResettingMedia: boolean = false;
  private micStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  public isMicEnabled: boolean = true;
  public isVideoEnabled: boolean = false;
  public isScreenEnabled: boolean = false;

  private ringtoneInterval: any = null;
  private pendingCallMode: "Audio" | "Video" | "Screen" | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  public send(frame: any) {
    socket.send(frame);
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
    this.pendingCallMode = mode;

    try {
      this.isCalling = true;
      this.currentCallSid = sid;
      console.log("[ChatClient] startCall: Sending invite to", sid);

      // Do not start streaming yet (privacy/late media)
      // Just send the invite
      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "CALL_START", data: { type: mode } }),
      );
      this.send({ t: "MSG", sid, data: { payload } });

      this.emit("call_outgoing", { sid, type: mode, remoteSid: sid });

      setTimeout(() => {
        if (
          this.isCalling &&
          !this.isCallConnected &&
          this.currentCallSid === sid
        ) {
          console.warn("[ChatClient] Call timed out, cleaning up");
          this.emit("notification", {
            type: "error",
            message: "Call timed out",
          });
          this.endCall(sid);
        }
      }, 45000);
    } catch (err: any) {
      this.isCalling = false;
      this.currentCallSid = null;
      this.pendingCallMode = null;
      console.error("Error starting call:", err);
      this.emit("notification", {
        type: "error",
        message: "Could not start call: " + err.message,
      });
      this.emit("error", "Could not start call");
    }
  }

  public async switchStream(sid: string, mode: "Audio" | "Video" | "Screen") {
    if (!this.isCalling) return;
    console.log(`[ChatClient] Switching stream to ${mode}`);

    try {
      if (mode === "Video") {
        await this.toggleVideo(true);
      } else if (mode === "Screen") {
        await this.toggleScreenShare(true);
      } else {
        await this.toggleVideo(false);
        await this.toggleScreenShare(false);
      }
    } catch (err: any) {
      console.error("Failed to switch stream:", err);
      this.emit("notification", {
        type: "error",
        message: err.message || "Failed to switch stream",
      });
    }
  }

  private async initializeCallStream(sid: string): Promise<string> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext();
      this.audioDestination = this.audioContext.createMediaStreamDestination();

      const micSource = this.audioContext.createMediaStreamSource(
        this.micStream,
      );
      micSource.connect(this.audioDestination);

      this.combinedStream = new MediaStream();
      this.audioDestination.stream.getAudioTracks().forEach((track) => {
        this.combinedStream!.addTrack(track);
      });

      return await this.startMediaRecorder(sid);
    } catch (e) {
      console.error("Error initializing call stream", e);
      this.emit("notification", {
        type: "error",
        message: "Microphone error: " + e,
      });
      throw e;
    }
  }

  public async toggleVideo(enable?: boolean): Promise<void> {
    const shouldEnable = enable !== undefined ? enable : !this.isVideoEnabled;
    const sid = this.currentCallSid;
    if (!sid || !this.isCalling) return;

    try {
      if (shouldEnable) {
        if (this.isScreenEnabled) {
          await this.toggleScreenShare(false);
        }

        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        });

        this.isVideoEnabled = true;
        console.log("[ChatClient] Video enabled");
      } else {
        if (this.cameraStream) {
          this.cameraStream.getTracks().forEach((t) => t.stop());
          this.cameraStream = null;
        }
        this.isVideoEnabled = false;
        console.log("[ChatClient] Video disabled");
      }

      await this.rebuildCombinedStream(sid);
      this.emit("local_stream_ready", this.combinedStream);
      this.emit("video_toggled", { enabled: this.isVideoEnabled });
    } catch (e: any) {
      console.error("Error toggling video:", e);
      this.emit("notification", {
        type: "error",
        message: "Camera error: " + e.message,
      });
    }
  }

  public async toggleScreenShare(enable?: boolean): Promise<void> {
    const shouldEnable = enable !== undefined ? enable : !this.isScreenEnabled;
    const sid = this.currentCallSid;
    if (!sid || !this.isCalling) return;

    try {
      if (shouldEnable) {
        if (this.isVideoEnabled) {
          await this.toggleVideo(false);
        }

        const isElectron =
          (window as any).electron &&
          (window as any).electron.getDesktopSources;

        if (isElectron) {
          const sources = await (window as any).electron.getDesktopSources();
          const source = sources[0];
          if (!source) throw new Error("No screen sources found.");

          this.screenStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: source.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
              },
            },
          } as any);
        } else if (navigator.mediaDevices?.getDisplayMedia) {
          this.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });

          if (this.audioContext && this.audioDestination) {
            const screenAudioTracks = this.screenStream.getAudioTracks();
            if (screenAudioTracks.length > 0) {
              const screenAudioStream = new MediaStream(screenAudioTracks);
              const screenSource =
                this.audioContext.createMediaStreamSource(screenAudioStream);
              screenSource.connect(this.audioDestination);
            }
          }
        } else {
          throw new Error("Screen sharing not supported on this device.");
        }

        this.screenStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            console.log("[ChatClient] Screen share ended by user");
            this.toggleScreenShare(false);
          };
        });

        this.isScreenEnabled = true;
        console.log("[ChatClient] Screen share enabled");
      } else {
        if (this.screenStream) {
          this.screenStream.getTracks().forEach((t) => t.stop());
          this.screenStream = null;
        }
        this.isScreenEnabled = false;
        console.log("[ChatClient] Screen share disabled");
      }

      await this.rebuildCombinedStream(sid);
      this.emit("local_stream_ready", this.combinedStream);
      this.emit("screen_toggled", { enabled: this.isScreenEnabled });
    } catch (e: any) {
      console.error("Error toggling screen share:", e);
      this.emit("notification", {
        type: "error",
        message: "Screen share error: " + e.message,
      });
    }
  }

  private async rebuildCombinedStream(sid: string): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    this.combinedStream = new MediaStream();

    if (this.audioDestination) {
      this.audioDestination.stream.getAudioTracks().forEach((track) => {
        this.combinedStream!.addTrack(track.clone());
      });
    }

    if (this.isVideoEnabled && this.cameraStream) {
      this.cameraStream.getVideoTracks().forEach((track) => {
        this.combinedStream!.addTrack(track);
      });
    } else if (this.isScreenEnabled && this.screenStream) {
      this.screenStream.getVideoTracks().forEach((track) => {
        this.combinedStream!.addTrack(track);
      });
    }

    this.currentLocalStream = this.combinedStream;

    const mimeType = await this.startMediaRecorder(sid);
    this.send({ t: "MIME_CHANGE", sid, data: { mimeType } });
  }

  private async startMediaRecorder(sid: string): Promise<string> {
    if (!this.combinedStream) throw new Error("No combined stream");

    const hasVideo = this.combinedStream.getVideoTracks().length > 0;
    let mimeType = hasVideo
      ? "video/webm;codecs=vp8,opus"
      : "audio/webm;codecs=opus";
    let bitsPerSecond = hasVideo ? 1000000 : 48000;

    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`[ChatClient] ${mimeType} not supported, trying fallback`);
      if (hasVideo && MediaRecorder.isTypeSupported("video/webm")) {
        mimeType = "video/webm";
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
      }
    }

    this.mediaRecorder = new MediaRecorder(this.combinedStream, {
      mimeType,
      bitsPerSecond,
    });

    this.mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        try {
          const buffer = await e.data.arrayBuffer();
          const encrypted = await this.encryptForSession(sid, buffer);
          this.send({ t: "STREAM", sid, data: encrypted });
        } catch (err) {
          console.error("Encryption streaming error:", err);
        }
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log("MediaRecorder stopped");
    };

    this.mediaRecorder.onerror = (e: any) => {
      console.error("MediaRecorder error:", e);
    };

    this.mediaRecorder.start(100);
    console.log(`[ChatClient] MediaRecorder started with ${mimeType}`);
    return mimeType;
  }

  public async acceptCall(sid: string) {
    if (!this.sessions[sid]) return;
    if (this.isCalling) return;

    this.stopRingtone();

    try {
      this.isCalling = true;
      this.currentCallSid = sid;
      const mimeType = await this.initializeCallStream(sid);
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

  public async endCall(sid?: string) {
    const targetSid = sid || this.currentCallSid;
    if (!targetSid) return;

    const payload = await this.encryptForSession(
      targetSid,
      JSON.stringify({ t: "CALL_END" }),
    );
    this.send({ t: "MSG", sid: targetSid, data: { payload } });
    const wasConnected = this.isCallConnected;
    this.cleanupCall();
    const duration = Date.now() - this.callStartTime;
    this.emit("call_ended", {
      sid: targetSid,
      duration,
      connected: wasConnected,
    });
  }

  private cleanupCall() {
    this.stopRingtone();
    this.isCalling = false;
    this.currentCallSid = null;
    this.pendingCallMode = null;
    this.isCallConnected = false;
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach((t) => t.stop());
      this.combinedStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.audioDestination = null;

    this.isMicEnabled = true;
    this.isVideoEnabled = false;
    this.isScreenEnabled = false;

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
    this.currentLocalStream = null;
    this.emit("local_stream_ready", null);
  }

  public toggleMic() {
    if (this.mediaRecorder && this.mediaRecorder.stream) {
      let isMuted = false;
      this.mediaRecorder.stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        isMuted = !track.enabled;
      });

      if (this.currentCallSid) {
        this.send({
          t: "MIC_STATUS",
          sid: this.currentCallSid,
          data: { muted: isMuted },
        });
      }
      return isMuted;
    }
    return true;
  }

  public getRemoteVideo(): HTMLVideoElement | null {
    return this.remoteVideo;
  }

  private async setupMediaPlayback(): Promise<void> {
    if (this.remoteVideo) return;
    if (this.isMediaSettingUp) {
      console.log(
        "[ChatClient] setupMediaPlayback already in progress, waiting...",
      );
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (!this.isMediaSettingUp) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    this.isMediaSettingUp = true;

    return new Promise((resolve) => {
      this.remoteVideo = document.createElement("video");
      this.remoteVideo!.autoplay = true;
      this.remoteVideo!.playsInline = true;

      const ms = new MediaSource();
      this.mediaSource = ms;
      this.remoteVideo!.src = URL.createObjectURL(ms);

      ms.addEventListener("sourceopen", () => {
        if (this.mediaSource !== ms || ms.sourceBuffers.length > 0) {
          resolve();
          return;
        }
        if (!this.isCalling && !this.isCallConnected) {
          console.warn(
            "[ChatClient] MediaSource open but call ended, ignoring",
          );
          resolve();
          return;
        }

        try {
          let mime = this.remoteMimeType || "video/webm;codecs=vp8,opus";
          if (!MediaSource.isTypeSupported(mime)) {
            console.warn(
              `[ChatClient] Prefered mime ${mime} not supported, trying fallbacks`,
            );
            mime = "video/webm;codecs=vp8,opus";
            if (!MediaSource.isTypeSupported(mime)) {
              mime = "video/webm;codecs=vp8";
              if (!MediaSource.isTypeSupported(mime)) {
                mime = "audio/webm;codecs=opus";
              }
            }
          }

          console.log(`[ChatClient] Creating SourceBuffer with ${mime}`);
          this.sourceBuffer = ms.addSourceBuffer(mime);
          this.isSourceOpen = true;

          this.sourceBuffer.mode = "sequence";
          this.sourceBuffer.addEventListener("updateend", () => {
            this.processQueue();
          });

          this.emit("remote_stream_ready", this.remoteVideo);
          this.isMediaSettingUp = false;
          resolve();
        } catch (e) {
          console.error("Error adding SourceBuffer:", e);
          this.isMediaSettingUp = false;
          resolve();
        }
      });
    });
  }

  private async resetMediaPlayback() {
    console.log("[ChatClient] Resetting MediaSource for new MIME type");

    // Set flag to pause incoming stream processing
    this.isResettingMedia = true;

    if (this.isMediaSettingUp) {
      console.log(
        "[ChatClient] resetMediaPlayback waiting for setup to finish...",
      );
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!this.isMediaSettingUp) {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
      });
    }

    // Clear queue
    this.audioQueue = [];
    this.isSourceOpen = false;

    // Clean up old SourceBuffer
    if (this.sourceBuffer) {
      try {
        if (this.mediaSource && this.mediaSource.readyState === "open") {
          this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        }
      } catch (e) {
        console.warn("Error removing SourceBuffer:", e);
      }
      this.sourceBuffer = null;
    }

    // Clean up old MediaSource
    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === "open") {
          this.mediaSource.endOfStream();
        }
      } catch (e) {
        console.warn("Error ending MediaSource:", e);
      }
      this.mediaSource = null;
    }

    // Force recreation
    if (this.remoteVideo) {
      this.remoteVideo.src = "";
      this.remoteVideo = null;
    }

    // Immediately recreate and wait for it to be ready
    await this.setupMediaPlayback();

    // Resume incoming stream processing
    this.isResettingMedia = false;
    console.log(
      "[ChatClient] MediaSource reset complete, ready for new stream",
    );
  }

  private processQueue() {
    if (
      !this.sourceBuffer ||
      this.sourceBuffer.updating ||
      this.audioQueue.length === 0
    )
      return;

    if (this.mediaSource && this.mediaSource.readyState !== "open") {
      console.warn(
        `[ChatClient] MediaSource readyState is ${this.mediaSource.readyState}, clearing queue`,
      );
      this.audioQueue = [];
      return;
    }

    const chunk = this.audioQueue.shift();
    if (chunk) {
      try {
        this.sourceBuffer.appendBuffer(chunk);
      } catch (e) {
        console.error("SourceBuffer append error", e);
        this.audioQueue = [];
        this.isSourceOpen = false;
      }
    }
  }

  private async handleStream(frame: ServerFrame) {
    const { sid, data } = frame;
    try {
      if (!this.isCalling && !this.isCallConnected) {
        return;
      }

      // Wait while MediaSource is being reset (during mode switch)
      if (this.isResettingMedia) {
        console.log(
          "[ChatClient] handleStream: waiting for media reset to complete",
        );
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!this.isResettingMedia) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });
      }

      if (!this.remoteVideo) {
        console.log(
          "[ChatClient] handleStream: remoteVideo not ready, setting up",
        );
        await this.setupMediaPlayback();
      }

      const decryptedBuffer = await this.decryptFromSession(sid, data);

      if (!this.isCalling && !this.isCallConnected) {
        return;
      }

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

      if (t !== "MSG") {
        console.log(`[ChatClient] Decrypted Signal: ${t}`, data);
      } else {
        console.log("[ChatClient] Decrypted MSG:", json);
      }

      switch (t) {
        case "MIME_CHANGE":
          console.log(`[ChatClient] Received MIME_CHANGE: ${data.mimeType}`);
          this.remoteMimeType = data.mimeType;

          await this.resetMediaPlayback();

          const newMode = data.mimeType.startsWith("video/")
            ? "Video"
            : "Audio";
          this.emit("call_mode_changed", { sid, mode: newMode });
          break;
        case "MIC_STATUS":
          this.emit("peer_mic_status", { sid, muted: data.muted });
          break;
        case "MSG":
          try {
            await executeDB(
              "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'other', ?, 'text', ?, 2, ?)",
              [
                data.id,
                sid,
                data.text,
                Date.now(),
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
            timestamp: data.timestamp,
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
          // Start streaming all chunks from the requested index
          this.streamAllChunks(sid, data.messageId, data.chunkIndex);
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

          this.playRingtone();

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

          const myMime = await this.initializeCallStream(sid);

          if (this.pendingCallMode === "Video") {
            await this.toggleVideo(true);
          } else if (this.pendingCallMode === "Screen") {
            await this.toggleScreenShare(true);
          } else {
            this.send({ t: "MIME_CHANGE", sid, data: { mimeType: myMime } });
          }

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
                    console.log(
                      `[ChatClient] Reading avatar file: ${me.public_avatar}`,
                    );
                    const fileData = await StorageService.readFile(
                      me.public_avatar,
                    );
                    avatarBase64 = fileData;
                    console.log(
                      `[ChatClient] Loaded avatar data, length: ${avatarBase64?.length}`,
                    );
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
              let base64 = "";
              if (avatar.startsWith("data:")) {
                base64 = avatar.split(",")[1];
              } else if (avatar.length > 256) {
                base64 = avatar;
              }
              if (base64) {
                avatarFile = await StorageService.saveProfileImage(base64, sid);
              } else {
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

  /**
   * Stream all remaining chunks starting from chunkIndex.
   * This is sender-push mode for faster file transfers.
   */
  private async streamAllChunks(
    sid: string,
    messageId: string,
    startChunkIndex: number,
  ) {
    console.log(
      `[Client] Starting chunk stream for ${messageId} from index ${startChunkIndex}`,
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
    const CHUNK_SIZE = 256000;
    const totalChunks = Math.ceil(file_size / CHUNK_SIZE);

    // Stream all chunks rapidly
    for (
      let chunkIndex = startChunkIndex;
      chunkIndex < totalChunks;
      chunkIndex++
    ) {
      try {
        const base64Chunk = await StorageService.readChunk(
          filename,
          chunkIndex,
        );
        if (!base64Chunk) {
          console.error(
            `[Client] readChunk returned empty for ${filename} index ${chunkIndex}`,
          );
          return;
        }

        const isLast = chunkIndex === totalChunks - 1;
        const payload = await this.encryptForSession(
          sid,
          JSON.stringify({
            t: "FILE_CHUNK",
            data: {
              messageId,
              chunkIndex,
              payload: base64Chunk,
              isLast,
            },
          }),
        );
        this.send({ t: "MSG", sid, data: { payload } });

        // Small delay to prevent buffer overflow (5ms between chunks)
        if (!isLast) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        console.log(
          `[Client] Streamed chunk ${
            chunkIndex + 1
          }/${totalChunks} for ${messageId}`,
        );
      } catch (e) {
        console.error(`[Client] Failed to stream chunk ${chunkIndex}:`, e);
        return;
      }
    }

    console.log(
      `[Client] Finished streaming all ${totalChunks} chunks for ${messageId}`,
    );
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

    const currentSize = Math.min((chunkIndex + 1) * 256000, file_size);
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
      // Sender-push mode: sender streams all chunks, no need to request next
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
    data: string | Uint8Array | ArrayBuffer,
  ): Promise<string> {
    const session = this.sessions[sid];
    // Normalize data to string or Uint8Array as expected by the helper
    let payload: string | Uint8Array;
    if (data instanceof ArrayBuffer) {
      payload = new Uint8Array(data);
    } else {
      payload = data;
    }

    return encryptToPackedString(payload, session.cryptoKey);
  }

  private async decryptFromSession(
    sid: string,
    payload: string,
  ): Promise<ArrayBuffer | null> {
    const session = this.sessions[sid];
    const decrypted = await decryptFromPackedString(payload, session.cryptoKey);
    return decrypted ? (decrypted.buffer as ArrayBuffer) : null;
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
        if (data.message && data.message.includes("Rate limit")) {
          this.emit("rate_limit_exceeded");
          return;
        }
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
            key = bip39.generateMnemonic(128);
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
        this.messageQueue.enqueue(async () => {
          await this.handleMsg(sid, data.payload);
        });
        break;
      case "STREAM":
        this.messageQueue.enqueue(async () => {
          await this.handleStream(frame);
        });
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
      case "MIME_CHANGE":
        console.log(`[ChatClient] Peer changed MIME to ${data.mimeType}`);
        this.remoteMimeType = data.mimeType;
        await this.resetMediaPlayback();
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
    this.sendProfileTo(sid);
    this.emit("session_updated");
  }

  private async sendProfileTo(sid: string) {
    try {
      const rows = await queryDB(
        "SELECT name_version, avatar_version FROM me WHERE id = 1",
      );
      if (!rows.length) return;
      const { name_version, avatar_version } = rows[0];

      console.log(
        `[ChatClient] Sending profile version to ${sid}: v${name_version}/${avatar_version}`,
      );

      const payload = await this.encryptForSession(
        sid,
        JSON.stringify({
          t: "PROFILE_VERSION",
          data: { name_version, avatar_version },
        }),
      );
      this.send({ t: "MSG", sid, data: { payload } });
    } catch (e) {
      console.error(`[ChatClient] Failed to send profile to ${sid}`, e);
    }
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

  private playRingtone() {
    if (this.ringtoneInterval) return;
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();

      const playBeep = () => {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.frequency.value = 800; // High pitch
        gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.audioContext.currentTime + 0.5,
        );

        osc.start();
        osc.stop(this.audioContext.currentTime + 0.5);
      };

      playBeep();
      this.ringtoneInterval = setInterval(() => {
        playBeep();
        setTimeout(playBeep, 400);
      }, 2000);
    } catch (e) {
      console.error("Failed to play ringtone", e);
    }
  }

  private stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

export default ChatClient.getInstance();
