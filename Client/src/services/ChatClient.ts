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
import { StorageService, CHUNK_SIZE } from "../utils/Storage";
import { MessageQueue } from "../utils/MessageQueue";
import * as bip39 from "bip39";
import { Buffer } from "buffer";
import {
  encryptToPackedString,
  decryptFromPackedString,
} from "../utils/crypto";
import { CompressionService } from "./CompressionService";
import { WorkerManager } from "./WorkerManager";

(window as any).Buffer = Buffer;

interface ServerFrame {
  t: string;
  sid: string;
  data: any;
  c?: boolean;
  p?: number;
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
  private remoteStream: MediaStream | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private isCalling: boolean = false;
  private isCallConnected: boolean = false;
  private callStartTime: number = 0;
  public currentLocalStream: MediaStream | null = null;
  private currentCallSid: string | null = null;
  private micStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private remoteMimeType: string | null = null;
  private turnCreds: any = null;
  private turnPromise: Promise<any> | null = null;
  private onTurnCreds: ((creds: any) => void) | null = null;
  public isMicEnabled: boolean = true;
  public isVideoEnabled: boolean = false;
  public isScreenEnabled: boolean = false;
  private ringtoneInterval: any = null;
  private audioContext: AudioContext | null = null;
  private pendingCallMode: "Audio" | "Video" | "Screen" | null = null;
  private messageQueue: MessageQueue;

  private _pendingOffer: {
    sid: string;
    offer: RTCSessionDescriptionInit;
  } | null = null;

  private iceCandidateQueue: Array<{
    sid: string;
    candidate: RTCIceCandidateInit;
  }> = [];

  constructor() {
    super();
    this.messageQueue = new MessageQueue(async (item) => {
      if (item.type === "HANDLE_MSG") {
        await this.handleMsg(
          item.payload.sid,
          item.payload.payload,
          item.priority,
        );
      }
    });
  }

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  public send(frame: {
    t: string;
    sid?: string;
    data?: any;
    c?: boolean;
    p?: number;
  }) {
    socket.send(frame);
  }

  private async sendSignal(signal: {
    type: string;
    sid: string;
    [key: string]: any;
  }) {
    const { type, sid, ...rest } = signal;
    const innerType = type === "RTC_ICE" ? "ICE_CANDIDATE" : type;

    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { type: innerType, ...rest },
      }),
      0,
    );
    this.send({ t: type, sid, data: { payload } });
  }

  public hasToken(): boolean {
    return !!this.authToken;
  }

  async init() {
    this.emit("session_updated");
    await this.messageQueue.init();

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      if (this.authToken) {
        this.send({
          t: "AUTH",
          data: { token: this.authToken },
          c: true,
          p: 0,
        });
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
            1,
          );
          this.send({
            t: "MSG",
            sid: row.sid,
            data: { payload },
            c: true,
            p: 1,
          });
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
      this.send({ t: "AUTH", data: { token }, c: true, p: 0 });
    }
  }

  // --- Actions ---
  public async connectToPeer(targetEmail: string) {
    if (!this.userEmail) {
      throw new Error("Must be logged in to connect");
    }
    const pub = await this.exportPub();
    this.send({
      t: "CONNECT_REQ",
      data: { targetEmail, publicKey: pub },
      c: true,
      p: 0,
    });
  }

  public async acceptFriend(sid: string, remotePub: string) {
    const pub = await this.exportPub();
    this.send({
      t: "JOIN_ACCEPT",
      sid,
      data: { publicKey: pub },
      c: true,
      p: 0,
    });
    await this.finalizeSession(sid, remotePub);
  }

  public denyFriend(sid: string) {
    this.send({ t: "JOIN_DENY", sid, c: true, p: 0 });
  }

  public async sendMessage(sid: string, text: string, replyTo?: any) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { type: "TEXT", text, id, timestamp: Date.now(), replyTo },
      }),
      1,
    );
    this.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
    try {
      await executeDB(
        "INSERT INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'me', ?, 'text', ?, 1, ?)",
        [id, sid, text, timestamp, replyTo ? JSON.stringify(replyTo) : null],
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
                t: "MSG",
                data: {
                  type: "PROFILE_VERSION",
                  name_version,
                  avatar_version,
                },
              }),
              1,
            );
            this.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
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

  public async sendReaction(
    sid: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "REACTION",
          messageId,
          emoji,
          action,
          timestamp: Date.now(),
        },
      }),
      1,
    );
    this.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
    try {
      if (action === "add") {
        await executeDB(
          "INSERT OR IGNORE INTO reactions (id, message_id, sender_email, emoji, timestamp) VALUES (?, ?, 'me', ?, ?)",
          [`${messageId}_me_${emoji}`, messageId, emoji, Date.now()],
        );
      } else {
        await executeDB(
          "DELETE FROM reactions WHERE message_id = ? AND sender_email = 'me' AND emoji = ?",
          [messageId, emoji],
        );
      }
      this.emit("reaction_update", { messageId });
      this.emit(`reaction_update:${messageId}`, {
        messageId,
        emoji,
        action,
        sender: "me",
      });
    } catch (e) {
      console.error("Failed to save reaction locally", e);
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
    const thumb = await generateThumbnail(thumbUri, fileInfo.type);
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
      thumb,
      vaultFilename,
    );

    const encryptedMetadata = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "FILE_INFO",
          name: fileInfo.name,
          size: fileInfo.size,
          mimeType: fileInfo.type,
          messageId,
          thumbnail: thumb,
        },
      }),
      1,
    );

    this.send({
      t: "MSG",
      sid,
      data: { payload: encryptedMetadata },
      c: true,
      p: 1,
    });
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

    // Check for existing progress
    let startChunk = chunkIndex;
    try {
      const rows = await queryDB(
        "SELECT filename, size, status, file_size FROM media WHERE message_id = ?",
        [messageId],
      );
      if (rows.length > 0) {
        const { filename, size, status, file_size } = rows[0];

        if (
          filename &&
          (status === "downloading" ||
            status === "pending" ||
            status === "error" ||
            status === "stopped")
        ) {
          const diskSize = await StorageService.getFileSize(filename);
          if (diskSize > 0) {
            if (diskSize % CHUNK_SIZE !== 0) {
              console.warn(
                `[Client] Disk size ${diskSize} is not multiple of ${CHUNK_SIZE}, restarting download to avoid corruption.`,
              );
              startChunk = 0;
              await StorageService.deleteFile(filename);
              await StorageService.initMediaEntry(
                messageId,
                rows[0].original_name,
                rows[0].file_size,
                rows[0].mime_type,
                rows[0].thumbnail,
              );
            } else {
              startChunk = Math.floor(diskSize / CHUNK_SIZE);
              console.log(
                `[Client] Resuming download for ${messageId} from chunk ${startChunk} (disk: ${diskSize})`,
              );
            }
          }
        }
      }
    } catch (e) {
      console.error("[Client] Error checking resume status:", e);
    }

    console.log(
      `[Client] Sending download request for ${messageId} chunk ${startChunk} to ${sid}`,
    );
    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { type: "FILE_REQ_CHUNK", messageId, chunkIndex: startChunk },
      }),
      1,
    );
    this.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
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
      console.log("[ChatClient] startCall: Initiating WebRTC call to", sid);

      const callStartPayload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_START", mode } }),
        0,
      );
      this.send({
        t: "MSG",
        sid,
        data: { payload: callStartPayload },
        c: true,
        p: 0,
      });

      await this.createPeerConnection(sid);
      await this.initializeLocalMedia();

      if (mode === "Video") {
        await this.toggleVideo(true);
      } else if (mode === "Screen") {
        await this.toggleScreenShare(true);
      }

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      const offerPayload = await this.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: { type: "RTC_OFFER", offer },
        }),
        0,
      );
      this.send({ t: "RTC_OFFER", sid, data: { payload: offerPayload } });

      console.log("[ChatClient] Sent WebRTC offer to", sid);
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

  private waitForTurnCredentials(): Promise<any> {
    if (this.turnCreds) return Promise.resolve(this.turnCreds);
    if (this.turnPromise) return this.turnPromise;

    this.turnPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnPromise = null;
        this.onTurnCreds = null;
        console.error("[ChatClient] TURN credential request timed out");
        reject(new Error("TURN timeout"));
      }, 5000);

      this.onTurnCreds = (data: any) => {
        clearTimeout(timeout);
        this.turnCreds = data;
        this.turnPromise = null;
        this.onTurnCreds = null;
        resolve(data);
      };

      this.send({ t: "GET_TURN_CREDS", c: true, p: 0 });
    });

    return this.turnPromise;
  }

  private async createPeerConnection(sid: string): Promise<void> {
    if (this.peerConnection) {
      console.warn(
        "[ChatClient] PeerConnection already exists — skipping create",
      );
      return;
    }

    console.log("[ChatClient] Creating RTCPeerConnection");

    const creds = await this.waitForTurnCredentials();

    this.peerConnection = new RTCPeerConnection({
      iceServers: creds.iceServers,
      iceTransportPolicy: "all",
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: "RTC_ICE",
          sid,
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE:", this.peerConnection?.iceConnectionState);
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[ChatClient] Received remote track", event.track.kind);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.attachRemoteAudio(this.remoteStream);
      }

      this.remoteStream.addTrack(event.track);
      this.emit("remote_stream_ready", this.remoteStream);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log(
        "[ChatClient] PC connection state:",
        this.peerConnection?.connectionState,
      );
    };
  }

  private attachRemoteAudio(stream: MediaStream) {
    if (!this.remoteAudioEl) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.controls = false;
      audio.muted = false;
      audio.volume = 1.0;

      document.body.appendChild(audio);
      this.remoteAudioEl = audio;
    }

    this.remoteAudioEl.srcObject = stream;

    const playPromise = this.remoteAudioEl.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.warn("[ChatClient] Audio play() blocked:", err);
      });
    }
  }

  private async initializeLocalMedia(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (this.peerConnection) {
        this.micStream.getTracks().forEach((track) => {
          this.peerConnection!.addTrack(track, this.micStream!);
        });
      }

      this.currentLocalStream = this.micStream;
      this.emit("local_stream_ready", this.currentLocalStream);
      console.log("[ChatClient] Local media initialized");
    } catch (e) {
      console.error("Error initializing local media", e);
      this.emit("notification", {
        type: "error",
        message: "Microphone error: " + e,
      });
      throw e;
    }
  }

  public resumeAudioPlayback() {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = false;
      this.remoteAudioEl.volume = 1.0;
      this.remoteAudioEl.play().catch(() => {});
    }

    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
  }

  private async negotiate(sid: string) {
    if (!this.peerConnection || !this.isCallConnected) return;
    try {
      console.log("[ChatClient] Renegotiating connection...");
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const offerPayload = await this.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: { type: "RTC_OFFER", offer },
        }),
        0,
      );
      this.send({ t: "RTC_OFFER", sid, data: { payload: offerPayload } });
    } catch (e) {
      console.error("[ChatClient] Renegotiation failed:", e);
    }
  }

  public async toggleVideo(enable?: boolean): Promise<void> {
    const shouldEnable = enable !== undefined ? enable : !this.isVideoEnabled;
    const sid = this.currentCallSid;
    if (!sid || !this.isCalling || !this.peerConnection) return;

    try {
      if (shouldEnable) {
        if (this.isScreenEnabled) {
          if (this.screenStream) {
            this.screenStream.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
          }
          this.isScreenEnabled = false;
          this.emit("screen_toggled", { enabled: false });
        }

        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        });

        const videoTrack = this.cameraStream.getVideoTracks()[0];
        if (videoTrack) {
          const transceivers = this.peerConnection.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t) => t.receiver.track.kind === "video",
          );

          if (videoTransceiver && videoTransceiver.sender) {
            await videoTransceiver.sender.replaceTrack(videoTrack);
            videoTransceiver.direction = "sendrecv";
          } else {
            this.peerConnection.addTrack(videoTrack, this.cameraStream);
          }
        }
        this.currentLocalStream = new MediaStream([
          ...this.micStream!.getTracks(),
          videoTrack,
        ]);

        this.isVideoEnabled = true;
        console.log("[ChatClient] Video enabled");
      } else {
        const transceivers = this.peerConnection.getTransceivers();
        const videoTransceiver = transceivers.find(
          (t) => t.receiver.track.kind === "video",
        );

        if (videoTransceiver && videoTransceiver.sender) {
          await videoTransceiver.sender.replaceTrack(null);
          videoTransceiver.direction = "recvonly";
        }
        if (this.cameraStream) {
          this.cameraStream.getTracks().forEach((t) => t.stop());
          this.cameraStream = null;
        }

        this.currentLocalStream = this.micStream;
        this.isVideoEnabled = false;
        console.log("[ChatClient] Video disabled");
      }

      this.emit("local_stream_ready", this.currentLocalStream);
      this.emit("video_toggled", { enabled: this.isVideoEnabled });

      await this.negotiate(sid);
      const mode = this.isVideoEnabled ? "Video" : "Audio";
      console.log(`[ChatClient] Sending CALL_MODE: ${mode}`);
      const modePayload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_MODE", mode } }),
        0,
      );
      this.send({
        t: "MSG",
        sid,
        data: { payload: modePayload },
        c: true,
        p: 0,
      });
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
    if (!sid || !this.isCalling || !this.peerConnection) return;

    try {
      if (shouldEnable) {
        if (this.isVideoEnabled) {
          if (this.cameraStream) {
            this.cameraStream.getTracks().forEach((t) => t.stop());
            this.cameraStream = null;
          }
          this.isVideoEnabled = false;
          this.emit("video_toggled", { enabled: false });
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
        } else {
          throw new Error("Screen sharing not supported on this device.");
        }

        const screenTrack = this.screenStream.getVideoTracks()[0];
        if (screenTrack) {
          const transceivers = this.peerConnection.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t) => t.receiver.track.kind === "video",
          );

          if (videoTransceiver && videoTransceiver.sender) {
            await videoTransceiver.sender.replaceTrack(screenTrack);
            videoTransceiver.direction = "sendrecv";
          } else {
            this.peerConnection.addTrack(screenTrack, this.screenStream);
          }

          screenTrack.onended = () => {
            console.log("[ChatClient] Screen share ended by user");
            this.toggleScreenShare(false);
          };
        }
        this.currentLocalStream = new MediaStream([
          ...this.micStream!.getTracks(),
          screenTrack,
        ]);

        this.isScreenEnabled = true;
        console.log("[ChatClient] Screen share enabled");
      } else {
        const transceivers = this.peerConnection.getTransceivers();
        const videoTransceiver = transceivers.find(
          (t) => t.receiver.track.kind === "video",
        );

        if (videoTransceiver && videoTransceiver.sender) {
          await videoTransceiver.sender.replaceTrack(null);
          videoTransceiver.direction = "recvonly";
        }

        if (this.screenStream) {
          this.screenStream.getTracks().forEach((t) => t.stop());
          this.screenStream = null;
        }

        this.currentLocalStream = this.micStream;
        this.isScreenEnabled = false;
        console.log("[ChatClient] Screen share disabled");
      }

      this.emit("local_stream_ready", this.currentLocalStream);
      this.emit("screen_toggled", { enabled: this.isScreenEnabled });

      await this.negotiate(sid);
      const mode = this.isScreenEnabled ? "Screen" : "Audio";
      console.log(`[ChatClient] Sending CALL_MODE: ${mode}`);
      const modePayload = await this.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_MODE", mode } }),
        0,
      );
      this.send({
        t: "MSG",
        sid,
        data: { payload: modePayload },
        c: true,
        p: 0,
      });
    } catch (e: any) {
      console.error("Error toggling screen share:", e);
      this.emit("notification", {
        type: "error",
        message: "Screen share error: " + e.message,
      });
    }
  }

  public async acceptCall(sid: string) {
    this.isCalling = true;
    this.currentCallSid = sid;
    this.stopRingtone();

    if (this._pendingOffer && this._pendingOffer.sid === sid) {
      console.log("[ChatClient] Processing the stashed offer now.");
      const offerToProcess = this._pendingOffer.offer;
      this._pendingOffer = null;
      await this.handleRTCOffer(sid, offerToProcess);
    }

    const payload = await this.encryptForSession(
      sid,
      JSON.stringify({ t: "MSG", data: { type: "CALL_ACCEPT" } }),
      0,
    );
    this.send({ t: "MSG", sid, data: { payload }, c: true, p: 0 });
  }

  public async endCall(sid?: string) {
    const targetSid = sid || this.currentCallSid;
    if (!targetSid) return;

    const payload = await this.encryptForSession(
      targetSid,
      JSON.stringify({ t: "MSG", data: { type: "CALL_END" } }),
      0,
    );
    this.send({ t: "MSG", sid: targetSid, data: { payload }, c: true, p: 0 });
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

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
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

    this.currentLocalStream = null;
    this.remoteStream = null;

    this.isMicEnabled = true;
    this.isVideoEnabled = false;
    this.isScreenEnabled = false;

    this.emit("local_stream_ready", null);
    this.emit("remote_stream_ready", null);
  }

  public async toggleMic() {
    if (this.micStream) {
      let isMuted = false;
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        isMuted = !track.enabled;
      });

      this.isMicEnabled = !isMuted;

      if (this.currentCallSid) {
        const micPayload = await this.encryptForSession(
          this.currentCallSid,
          JSON.stringify({
            t: "MSG",
            data: { type: "MIC_STATUS", muted: isMuted },
          }),
          0,
        );
        this.send({
          t: "MSG",
          sid: this.currentCallSid,
          data: { payload: micPayload },
          c: true,
          p: 0,
        });
      }
      return isMuted;
    }
    return true;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  private async handleRTCOffer(sid: string, offer: RTCSessionDescriptionInit) {
    console.log("[ChatClient] handleRTCOffer");

    if (!this.isCalling) {
      console.log("[ChatClient] Stashing offer until user answers.");
      this._pendingOffer = { sid, offer };
      return;
    }

    if (!this.peerConnection) {
      await this.createPeerConnection(sid);
      await this.initializeLocalMedia();
    }

    await this.peerConnection!.setRemoteDescription(offer);
    await this.flushPendingIce();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.sendSignal({
      type: "RTC_ANSWER",
      sid,
      answer,
    });

    this.isCallConnected = true;
    this.emit("call_started", { sid, status: "connected", remoteSid: sid });
  }

  private async handleRTCAnswer(
    sid: string,
    answer: RTCSessionDescriptionInit,
  ) {
    try {
      console.log("[ChatClient] Received RTC answer from", sid);

      if (!this.peerConnection) {
        console.warn("[ChatClient] No peer connection for RTC answer");
        return;
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      );
      await this.flushPendingIce();
      console.log("[ChatClient] Set remote description from answer");

      this.isCallConnected = true;
      this.emit("call_started", { sid, status: "connected", remoteSid: sid });
    } catch (err) {
      console.error("[ChatClient] Error handling RTC answer:", err);
    }
  }

  private async handleICECandidate(
    sid: string,
    candidate: RTCIceCandidateInit,
  ) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.iceCandidateQueue.push({ sid, candidate });
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[ChatClient] Error adding ICE candidate:", err);
    }
  }

  private async flushPendingIce() {
    while (this.iceCandidateQueue.length > 0) {
      const item = this.iceCandidateQueue.shift();
      if (item) {
        try {
          await this.peerConnection?.addIceCandidate(
            new RTCIceCandidate(item.candidate),
          );
        } catch (e) {
          console.error("[ChatClient] Failed to flush ICE:", e);
        }
      }
    }
  }

  private async handleMsg(sid: string, payload: string, priority: number = 1) {
    if (!this.sessions[sid]) {
      console.warn(`[Client] Received MSG for unknown session ${sid}`);
      return;
    }

    try {
      const decryptedBuffer = await this.decryptFromSession(
        sid,
        payload,
        priority,
      );
      if (!decryptedBuffer) {
        console.error(`[Client] Decryption failed for ${sid}`);
        return;
      }
      const json = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      const { t, data } = json;

      // All messages should now have t: "MSG"
      if (t !== "MSG") {
        console.warn(`[ChatClient] Unexpected message type: ${t}`);
        return;
      }

      if (!data || !data.type) {
        console.warn(`[ChatClient] MSG missing data.type`);
        return;
      }

      console.log(`[ChatClient] Received ${data.type}:`, data);

      switch (data.type) {
        case "MIC_STATUS":
          this.emit("peer_mic_status", { sid, muted: data.muted });
          break;
        case "CALL_MODE":
          console.log(`[ChatClient] Remote switched to mode: ${data.mode}`);
          this.emit("call_mode_changed", { sid, mode: data.mode });
          break;
        case "TEXT":
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
        case "STREAM":
          console.warn(
            "[ChatClient] Legacy STREAM case hit in handleMsg - should not happen",
          );
          break;
        case "FILE_INFO":
          const isImage = data.mimeType.startsWith("image/");
          const isVideo = data.mimeType.startsWith("video/");
          const isAudio = data.mimeType.startsWith("audio/");
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
            `[ChatClient] Received FILE_INFO: name=${data.name}, mime=${data.mimeType}, size=${data.size}`,
          );
          await StorageService.initMediaEntry(
            localId,
            data.name,
            data.size,
            data.mimeType,
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
              JSON.stringify({ t: "MSG", data: { type: "CALL_BUSY" } }),
              0,
            );
            this.send({ t: "MSG", sid, data: { payload: busyPayload } });
            return;
          }
          console.log("[ChatClient] Received CALL_START");

          this.playRingtone();

          this.emit("call_incoming", {
            sid,
            mode: data?.mode || "Audio",
            remoteSid: sid,
          });
          break;

        case "RTC_OFFER":
          console.log("[ChatClient] Received RTC_OFFER");
          if (data?.offer) {
            await this.handleRTCOffer(sid, data.offer);
          }
          break;

        case "RTC_ANSWER":
          console.log("[ChatClient] Received RTC_ANSWER");
          if (data?.answer) {
            await this.handleRTCAnswer(sid, data.answer);
          }
          break;
        // Mark call as connected

        case "ICE_CANDIDATE":
          console.log("[ChatClient] Received ICE_CANDIDATE");
          if (data?.candidate) {
            await this.handleICECandidate(sid, data.candidate);
          }
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
          console.log(
            "[ChatClient] Received CALL_ACCEPT - call is being answered",
          );
          break;

        case "CALL_END":
          console.log("[ChatClient] Received CALL_END");
          const wasCallConnected = this.isCallConnected;
          this.cleanupCall();
          const callDuration = Date.now() - this.callStartTime;
          this.emit("call_ended", {
            sid,
            duration: callDuration,
            connected: wasCallConnected,
          });
          break;

        case "METADATA":
          try {
            const meta = data;
            this.emit("metadata_response", meta);
          } catch (e) {
            console.error("Error handling METADATA", e);
          }
          break;

        case "IMAGE_DATA":
          try {
            this.emit("image_response", data);
          } catch (e) {
            console.error(
              "Error h// data is already the metadata objectandling IMAGE_DATA",
              e,
            );
          }
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
                  JSON.stringify({ t: "MSG", data: { type: "GET_PROFILE" } }),
                  1,
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
                  t: "MSG",
                  data: {
                    type: "PROFILE_DATA",
                    name: me.public_name,
                    avatar: avatarBase64,
                    name_version: me.name_version,
                    avatar_version: me.avatar_version,
                  },
                }),
                1,
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

        case "REACTION":
          try {
            const { messageId, emoji, action, timestamp } = data;
            const peerEmail = this.sessions[sid]?.peerEmail || sid;
            if (action === "add") {
              const id = `${messageId}_${sid}_${emoji}`;
              await executeDB(
                "INSERT OR IGNORE INTO reactions (id, message_id, sender_email, emoji, timestamp) VALUES (?, ?, ?, ?, ?)",
                [id, messageId, peerEmail, emoji, timestamp],
              );
            } else {
              await executeDB(
                "DELETE FROM reactions WHERE message_id = ? AND sender_email = ? AND emoji = ?",
                [messageId, peerEmail, emoji],
              );
            }
            this.emit("reaction_update", { messageId });
            this.emit(`reaction_update:${messageId}`, {
              messageId,
              emoji,
              action,
            });
          } catch (e) {
            console.error("Error handling REACTION", e);
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
    const totalChunks = Math.ceil(file_size / CHUNK_SIZE);

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
            t: "MSG",
            data: {
              type: "FILE_CHUNK",
              messageId,
              chunkIndex,
              payload: base64Chunk,
              isLast,
            },
          }),
          2,
        );
        this.send({ t: "MSG", sid, data: { payload }, c: false, p: 2 });

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
    try {
      const rows = await queryDB(
        "SELECT filename, file_size FROM media WHERE message_id = ?",
        [messageId],
      );
      if (!rows.length) return;
      const { filename, file_size } = rows[0];
      await StorageService.appendChunk(filename, payload);

      const currentSize = Math.min((chunkIndex + 1) * CHUNK_SIZE, file_size);
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
        this.emit("download_progress", { messageId, progress });
      }
    } catch (e) {
      console.error(
        `[Client] Error handling chunk ${chunkIndex} for ${messageId}:`,
        e,
      );
      await executeDB(
        "UPDATE media SET status = 'error' WHERE message_id = ?",
        [messageId],
      );
      this.emit("notification", {
        type: "error",
        message: "Download failed. Please try again.",
      });
      // Optionally notify sender to stop?
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
    priority: number,
  ): Promise<string> {
    const buffer =
      data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
    return WorkerManager.getInstance().encrypt(sid, buffer, priority);
  }

  private async decryptFromSession(
    sid: string,
    payload: string,
    priority: number,
  ): Promise<ArrayBuffer | null> {
    try {
      return await WorkerManager.getInstance().decrypt(sid, payload, priority);
    } catch (e) {
      console.warn("[ChatClient] Worker decryption failed:", e);
      return null;
    }
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

      case "TURN_CREDS":
        console.log("[ChatClient] Received TURN credentials");
        if (this.onTurnCreds) {
          this.onTurnCreds(data);
        } else {
          this.turnCreds = data;
        }
        break;

      case "RTC_OFFER":
        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: data.payload, priority: 0 },
          0,
        );
        break;

      case "RTC_ANSWER":
        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: data.payload, priority: 0 },
          0,
        );
        break;

      case "RTC_ICE":
        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: data.payload, priority: 0 },
          0,
        );
        break;

      case "MSG":
        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: data.payload, priority: frame.p ?? 1 },
          frame.p ?? 1,
        );
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

  private async finalizeSession(
    sid: string,
    remotePubB64: string,
    peerEmail?: string,
  ) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = { cryptoKey: sharedKey, online: true, peerEmail };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await WorkerManager.getInstance().initSession(sid, jwk);
    await executeDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK, peer_email) VALUES (?, ?, ?)",
      [sid, JSON.stringify(jwk), peerEmail || null],
    );
    // Wait for profile send to complete before continuing
    await this.sendProfileTo(sid);
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
          t: "MSG",
          data: {
            type: "PROFILE_VERSION",
            name_version,
            avatar_version,
          },
        }),
        1,
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
      const jwk = JSON.parse(row.keyJWK);
      await WorkerManager.getInstance().initSession(row.sid, jwk);
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

  public async fetchMetadata(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off("metadata_response", handler);
        reject(new Error("Metadata fetch timed out"));
      }, 10000);

      const handler = (data: any) => {
        if (data.url === url) {
          clearTimeout(timeout);
          this.off("metadata_response", handler);
          resolve(data);
        }
      };

      this.on("metadata_response", handler);
      this.send({
        t: "FETCH_METADATA",
        data: { url },
        c: true,
        p: 1,
      });
    });
  }

  public async fetchImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off("image_response", handler);
        reject(new Error("Image fetch timed out"));
      }, 15000);

      const handler = (data: any) => {
        if (data.url === url) {
          clearTimeout(timeout);
          this.off("image_response", handler);

          try {
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: data.mimeType });
            const objectUrl = URL.createObjectURL(blob);
            resolve(objectUrl);
          } catch (e) {
            reject(new Error("Failed to process image data"));
          }
        }
      };

      this.on("image_response", handler);
      this.send({
        t: "FETCH_IMAGE",
        data: { url },
        c: true,
        p: 1,
      });
      this.send({
        t: "FETCH_IMAGE",
        data: { url },
        c: true,
        p: 1,
      });
    });
  }

  public async checkLinkSafety(
    url: string,
  ): Promise<"SAFE" | "UNSAFE" | "UNKNOWN"> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off("link_safety_result", handler);
        resolve("UNKNOWN");
      }, 5000);

      const handler = (data: any) => {
        if (data.url === url) {
          clearTimeout(timeout);
          this.off("link_safety_result", handler);
          resolve(data.status);
        }
      };

      this.on("link_safety_result", handler);
      this.send({
        t: "CHECK_LINK",
        data: { url },
        c: true,
        p: 1,
      });
    });
  }
}

export default ChatClient.getInstance();
