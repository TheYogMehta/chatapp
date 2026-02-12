import { EventEmitter } from "events";
import { executeDB } from "../storage/sqliteService";
import socket from "./SocketManager";
import { MessageQueue } from "../../utils/MessageQueue";

interface ServerFrame {
  t: string;
  sid: string;
  data: any;
  c?: boolean;
  p?: number;
}

import { AuthService } from "../auth/AuthService";
import { SessionService } from "../messaging/SessionService";
import { FileTransferService } from "../media/FileTransferService";
import { CallService } from "../media/CallService";
import { MessageService } from "../messaging/MessageService";
import { IChatClient } from "./interfaces";

export class ChatClient extends EventEmitter implements IChatClient {
  private static instance: ChatClient;

  public authService: AuthService;
  public sessionService: SessionService;
  public messageService: MessageService;
  public fileTransfer: FileTransferService;
  public callService: CallService;

  private messageQueue: MessageQueue;

  constructor() {
    super();
    this.authService = new AuthService();
    this.sessionService = new SessionService(this.authService);

    this.fileTransfer = new FileTransferService(this);
    this.callService = new CallService(this);
    this.messageService = new MessageService(this);

    this.messageQueue = new MessageQueue(async (item) => {
      if (item.type === "HANDLE_MSG") {
        await this.messageService.handleMsg(
          item.payload.sid,
          item.payload.payload,
          item.priority,
        );
      }
    });

    this.authService.on("auth_success", (email) =>
      this.emit("auth_success", email),
    );
    this.authService.on("auth_error", () => this.emit("auth_error"));

    this.sessionService.on("session_updated", () => {
      console.log("[ChatClient] session_updated event received from Service");
      this.emit("session_updated");
    });
    this.sessionService.on("session_created", (sid) => {
      console.log(
        "[ChatClient] session_created event received from Service:",
        sid,
      );
      this.emit("session_created", sid);
    });

    socket.on("message", (frame) => {
      this.handleFrame(frame);
    });

    socket.on("WS_CONNECTED", () => {
      console.log("[ChatClient] WS Connected");
      if (this.authService.hasToken()) {
        this.emit("session_updated");
      }
    });

    socket.on("WS_DISCONNECTED", () => {
      console.log("[ChatClient] WS Disconnected");
    });

    socket.on("error", (err) => {
      console.error("[ChatClient] Socket Error:", err);
      this.emit("notification", {
        type: "error",
        message: "Connection failed. Retrying...",
      });
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

  public get sessions() {
    return this.sessionService.sessions;
  }

  public get userEmail() {
    return this.authService.userEmail;
  }

  public hasToken(): boolean {
    return this.authService.hasToken();
  }

  async init() {
    await this.sessionService.loadSessions();
    this.emit("session_updated");
  }

  public async syncPendingMessages() {
    return this.messageService.syncPendingMessages();
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
          await this.authService.logout();
        }
        this.emit("notification", { type: "error", message: data.message });
        break;
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "AUTH_SUCCESS":
        await this.authService.handleAuthSuccess(data);
        break;
      case "JOIN_REQUEST":
        this.emit("inbound_request", {
          sid,
          publicKey: data.publicKey,
          email: data.email,
        });
        break;
      case "JOIN_ACCEPT":
        await this.sessionService.finalizeSession(sid, data.publicKey);
        this.emit("joined_success", sid);
        break;
      case "TURN_CREDS":
        console.log("[ChatClient] Received TURN credentials");
        this.callService.resolveTurnCreds(data);
        break;
      case "RTC_OFFER":
      case "RTC_ANSWER":
      case "RTC_ICE":
      case "MSG":
        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: data.payload, priority: frame.p ?? 1 },
          frame.p ?? 1,
        );
        break;
      case "PEER_ONLINE":
        this.sessionService.setPeerOnline(sid, true);
        this.emit("session_updated");
        this.syncPendingMessages();
        break;
      case "PEER_OFFLINE":
        this.sessionService.setPeerOnline(sid, false);
        this.emit("session_updated");
        break;
      case "DELIVERED":
        await executeDB(
          "UPDATE messages SET status = 2 WHERE sid = ? AND status = 1",
          [sid],
        );
        this.emit("message_status", { sid });
        break;
      case "DELIVERED_FAILED":
        this.emit("message_status", { sid });
        this.emit("notification", {
          type: "warning",
          message:
            "Message not delivered yet. It will be retried when the peer is online.",
        });
        break;
      case "LINK_SAFETY":
        this.emit("link_safety_result", data);
        break;
    }
  }

  public async insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string> {
    return this.messageService.insertMessageRecord(
      sid,
      text,
      type,
      sender,
      forceId,
      replyTo,
    );
  }

  public async encryptForSession(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<string> {
    return this.sessionService.encrypt(sid, data, priority);
  }

  public async checkLinkSafety(
    url: string,
  ): Promise<"SAFE" | "UNSAFE" | "UNKNOWN"> {
    return new Promise((resolve) => {
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

  public async login(token: string) {
    return this.authService.login(token);
  }

  public async logout() {
    return this.authService.logout();
  }

  public async switchAccount(email: string) {
    return this.authService.switchAccount(email);
  }

  // --- Actions ---
  public async connectToPeer(targetEmail: string) {
    return this.sessionService.connectToPeer(targetEmail);
  }

  public async acceptFriend(sid: string, remotePub: string) {
    return this.sessionService.acceptFriend(sid, remotePub);
  }

  public denyFriend(sid: string) {
    return this.sessionService.denyFriend(sid);
  }

  public async sendMessage(
    sid: string,
    text: string,
    replyTo?: any,
    type: string = "text",
  ) {
    return this.messageService.sendMessage(sid, text, replyTo, type);
  }

  public async editMessage(sid: string, messageId: string, newText: string) {
    return this.messageService.editMessage(sid, messageId, newText);
  }

  public async deleteMessage(sid: string, messageId: string) {
    return this.messageService.deleteMessage(sid, messageId);
  }

  public async broadcastProfileUpdate() {
    return this.messageService.broadcastProfileUpdate();
  }

  public async sendReaction(
    sid: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) {
    return this.messageService.sendReaction(sid, messageId, emoji, action);
  }

  public async sendFile(
    sid: string,
    fileData: File | Blob | string,
    fileInfo: { name: string; size: number; type: string },
  ) {
    return this.fileTransfer.sendFile(sid, fileData, fileInfo);
  }

  public async requestDownload(
    sid: string,
    messageId: string,
    chunkIndex: number = 0,
  ) {
    return this.fileTransfer.requestDownload(sid, messageId, chunkIndex);
  }

  public async startCall(
    sid: string,
    mode: "Audio" | "Video" | "Screen" = "Audio",
  ) {
    return this.callService.startCall(sid, mode);
  }

  public async switchStream(_sid: string, mode: "Audio" | "Video" | "Screen") {
    return this.callService.switchStream(_sid, mode);
  }

  // Getters for CallService properties
  public get isCalling() {
    return this.callService.isCalling;
  }
  public get isCallConnected() {
    return this.callService.isCallConnected;
  }
  public get callStartTime() {
    return this.callService.callStartTime;
  }
  public get isMicEnabled() {
    return this.callService.isMicEnabled;
  }
  public get isVideoEnabled() {
    return this.callService.isVideoEnabled;
  }
  public get isScreenEnabled() {
    return this.callService.isScreenEnabled;
  }
  public get currentCallSid() {
    return this.callService.currentCallSid;
  }

  // Delegate Call Public Methods
  public async toggleVideo(enabled: boolean) {
    return this.callService.toggleVideo(enabled);
  }

  public async toggleScreenShare(enabled: boolean) {
    return this.callService.toggleScreenShare(enabled);
  }

  public async toggleMic(enabled?: boolean) {
    if (enabled === undefined) {
      return this.callService.toggleMic();
    }
    return this.callService.toggleMic();
  }

  public async acceptCall(sid: string) {
    return this.callService.acceptCall(sid);
  }

  public async endCall(sid?: string) {
    return this.callService.endCall(sid);
  }

  public async handleRTCOffer(sid: string, offer: RTCSessionDescriptionInit) {
    return this.callService.handleRTCOffer(sid, offer);
  }

  public async handleRTCAnswer(sid: string, answer: RTCSessionDescriptionInit) {
    return this.callService.handleRTCAnswer(sid, answer);
  }

  public async handleICECandidate(sid: string, candidate: RTCIceCandidateInit) {
    return this.callService.handleICECandidate(sid, candidate);
  }

  public getRemoteStream() {
    return this.callService.getRemoteStream();
  }
}

export default ChatClient.getInstance();
