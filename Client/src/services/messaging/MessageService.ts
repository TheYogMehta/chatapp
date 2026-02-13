import { EventEmitter } from "events";
import { queryDB, executeDB } from "../storage/sqliteService";
import { StorageService } from "../storage/StorageService";
import { FileTransferService } from "../media/FileTransferService";
import { CallService } from "../media/CallService";
import { AuthService } from "../auth/AuthService";
import { SessionService } from "./SessionService";
import { TEXT_CHUNK_SIZE_CHARS } from "../core/protocolLimits";

interface IMessageClient {
  authService: AuthService;
  sessionService: SessionService;
  fileTransfer: FileTransferService;
  callService: CallService;
  encryptForSession(sid: string, data: any, priority: number): Promise<string>;
  send(frame: any): void;
  emit(event: string, ...args: any[]): boolean;
  insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string>;
}

export class MessageService extends EventEmitter {
  private client: IMessageClient;
  private static readonly MAX_PROFILE_AVATAR_B64_CHARS = 120 * 1024;
  private static readonly PROFILE_AVATAR_CHUNK_SIZE_CHARS = 60 * 1024;
  private textChunkBuffer = new Map<
    string,
    {
      totalChunks: number;
      parts: string[];
      chunkType: "TEXT" | "GIF";
      timestamp: number;
      replyTo?: any;
    }
  >();
  private profileAvatarChunkBuffer = new Map<
    string,
    {
      totalChunks: number;
      parts: string[];
      name: string | null;
      nameVersion: number;
      avatarVersion: number;
      timestamp: number;
    }
  >();

  constructor(client: IMessageClient) {
    super();
    this.client = client;
  }

  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private chunkKey(sid: string, id: string): string {
    return `${sid}:${id}`;
  }

  private normalizeProfileAvatarPayload(avatar?: string | null): string | null {
    if (!avatar || typeof avatar !== "string") return null;
    let base64 = avatar;
    if (avatar.startsWith("data:")) {
      const parts = avatar.split(",");
      base64 = parts.length > 1 ? parts[1] : "";
    }
    if (!base64) return null;
    return base64;
  }

  private splitProfileAvatarIntoChunks(base64: string): string[] {
    return this.splitTextIntoChunks(
      base64,
      MessageService.PROFILE_AVATAR_CHUNK_SIZE_CHARS,
    );
  }

  private profileAvatarChunkKey(sid: string, transferId: string): string {
    return `${sid}:${transferId}`;
  }

  private async saveAndEmitInboundMessage(
    sid: string,
    data: {
      id: string;
      type: string;
      text: string;
      timestamp: number;
      replyTo?: any;
    },
  ) {
    try {
      await executeDB(
        "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'other', ?, ?, ?, 2, ?)",
        [
          data.id,
          sid,
          data.text,
          data.type.toLowerCase(),
          data.timestamp,
          data.replyTo ? JSON.stringify(data.replyTo) : null,
        ],
      );
    } catch (e) {
      console.error("[MessageService] Failed to save received message:", e);
    }
    this.client.emit("message", {
      sid,
      text: data.text,
      sender: "other",
      type: data.type.toLowerCase(),
      id: data.id,
      replyTo: data.replyTo,
      timestamp: data.timestamp,
    });
  }

  public async sendMessage(
    sid: string,
    text: string,
    replyTo?: any,
    type: string = "text",
  ) {
    if (!this.client.sessionService.sessions[sid]) {
      console.warn(
        `[MessageService] Session ${sid} not found in memory, reloading sessions...`,
      );
      await this.client.sessionService.loadSessions();
      if (!this.client.sessionService.sessions[sid]) {
        throw new Error("Session not found");
      }
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    try {
      await executeDB(
        "INSERT INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'me', ?, 'text', ?, 1, ?)",
        [id, sid, text, timestamp, replyTo ? JSON.stringify(replyTo) : null],
      );
      const normalizedType = type === "text" ? "TEXT" : type.toUpperCase();
      if (
        (normalizedType === "TEXT" || normalizedType === "GIF") &&
        text.length > TEXT_CHUNK_SIZE_CHARS
      ) {
        const chunks = this.splitTextIntoChunks(text, TEXT_CHUNK_SIZE_CHARS);
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const payload = await this.client.encryptForSession(
            sid,
            JSON.stringify({
              t: "MSG",
              data: {
                type: "TEXT_CHUNK",
                id,
                chunkIndex,
                totalChunks: chunks.length,
                chunkType: normalizedType,
                textChunk: chunks[chunkIndex],
                timestamp,
                replyTo,
              },
            }),
            1,
          );
          this.client.send({
            t: "MSG",
            sid,
            data: { payload },
            c: chunkIndex === chunks.length - 1,
            p: 1,
          });
        }
      } else {
        const payload = await this.client.encryptForSession(
          sid,
          JSON.stringify({
            t: "MSG",
            data: {
              type: normalizedType,
              text,
              id,
              timestamp,
              replyTo,
            },
          }),
          1,
        );
        this.client.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
      }
    } catch (e) {
      console.error("[MessageService] Failed to save sent message:", e);
    }
  }

  public async editMessage(sid: string, messageId: string, newText: string) {
    if (!this.client.sessionService.sessions[sid])
      throw new Error("Session not found");

    const payload = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "EDIT",
          id: messageId,
          text: newText,
          timestamp: Date.now(),
        },
      }),
      1,
    );

    this.client.send({
      t: "MSG",
      sid,
      data: { payload },
      c: true,
      p: 1,
    });

    try {
      await executeDB("UPDATE messages SET text = ? WHERE id = ?", [
        newText,
        messageId,
      ]);
      this.client.emit("message_updated", {
        sid,
        id: messageId,
        text: newText,
      });
    } catch (e) {
      console.error("[MessageService] Failed to update local message:", e);
    }
  }

  public async deleteMessage(sid: string, messageId: string) {
    if (!this.client.sessionService.sessions[sid])
      throw new Error("Session not found");

    // 1. Check message ownership and details
    const rows = await queryDB("SELECT sender FROM messages WHERE id = ?", [
      messageId,
    ]);
    const isMe = rows.length > 0 && rows[0].sender === "me";

    // 2. If it's my message, broadcast delete to peer (unsend)
    if (isMe) {
      console.log(
        `[MessageService] Deleting my message ${messageId}, sending retraction to peer`,
      );
      const payload = await this.client.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: {
            type: "DELETE",
            id: messageId,
            timestamp: Date.now(),
          },
        }),
        1,
      );

      this.client.send({
        t: "MSG",
        sid,
        data: { payload },
        c: true,
        p: 1,
      });
    } else {
      console.log(
        `[MessageService] Deleting peer message ${messageId} locally only`,
      );
    }

    // 3. Local Hard Delete (for both me and other)
    try {
      await executeDB("DELETE FROM messages WHERE id = ?", [messageId]);

      // Also delete associated reactions/media
      await executeDB("DELETE FROM reactions WHERE message_id = ?", [
        messageId,
      ]);
      await executeDB("DELETE FROM media WHERE message_id = ?", [messageId]);

      this.client.emit("message_updated", {
        sid,
        id: messageId,
        text: "🚫 This message was deleted",
        type: "deleted",
        // Additional flag to indicate hard delete if UI supports it,
        // but for now we rely on the implementation plan to use a specific event or filter
      });

      // Emitting a specific 'message_deleted' event for UI to remove it entirely
      this.client.emit("message_deleted", {
        sid,
        id: messageId,
      });
    } catch (e) {
      console.error("[MessageService] Failed to delete message locally:", e);
    }
  }

  public async handleMsg(sid: string, payload: string, priority: number = 1) {
    if (!this.client.sessionService.sessions[sid]) {
      console.warn(`[MessageService] Received MSG for unknown session ${sid}`);
      return;
    }

    try {
      const decryptedBuffer = await this.client.sessionService.decrypt(
        sid,
        payload,
        priority,
      );

      if (!decryptedBuffer) {
        console.error(`[MessageService] Decryption failed for ${sid}`);
        return;
      }
      const json = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      const { t, data } = json;

      if (t !== "MSG") {
        console.warn(`[MessageService] Unexpected message type: ${t}`);
        return;
      }

      if (!data || !data.type) {
        console.warn(`[MessageService] MSG missing data.type`);
        return;
      }

      console.log(`[MessageService] Received ${data.type}:`, data);

      switch (data.type) {
        case "MIC_STATUS":
          this.client.emit("peer_mic_status", { sid, muted: data.muted });
          break;
        case "CALL_MODE":
          console.log(`[MessageService] Remote switched to mode: ${data.mode}`);
          this.client.emit("call_mode_changed", { sid, mode: data.mode });
          break;
        case "TEXT":
        case "GIF":
        case "IMAGE":
          await this.saveAndEmitInboundMessage(sid, {
            id: data.id,
            type: data.type,
            text: data.text,
            timestamp: data.timestamp,
            replyTo: data.replyTo,
          });
          break;
        case "TEXT_CHUNK":
          if (
            !data?.id ||
            typeof data.chunkIndex !== "number" ||
            typeof data.totalChunks !== "number" ||
            data.totalChunks <= 0 ||
            data.totalChunks > 10000 ||
            !["TEXT", "GIF"].includes(data.chunkType) ||
            typeof data.textChunk !== "string"
          ) {
            console.warn("[MessageService] Invalid TEXT_CHUNK frame");
            break;
          }
          const key = this.chunkKey(sid, data.id);
          const existing = this.textChunkBuffer.get(key);
          if (
            existing &&
            (existing.totalChunks !== data.totalChunks ||
              existing.chunkType !== data.chunkType)
          ) {
            this.textChunkBuffer.delete(key);
          }
          const buffer =
            this.textChunkBuffer.get(key) ||
            ({
              totalChunks: data.totalChunks,
              parts: new Array(data.totalChunks),
              chunkType: data.chunkType,
              timestamp: data.timestamp || Date.now(),
              replyTo: data.replyTo,
            } as {
              totalChunks: number;
              parts: string[];
              chunkType: "TEXT" | "GIF";
              timestamp: number;
              replyTo?: any;
            });
          if (data.chunkIndex < 0 || data.chunkIndex >= buffer.totalChunks) {
            console.warn("[MessageService] TEXT_CHUNK index out of range");
            break;
          }
          buffer.parts[data.chunkIndex] = data.textChunk;
          this.textChunkBuffer.set(key, buffer);
          if (buffer.parts.some((part) => typeof part !== "string")) {
            break;
          }
          this.textChunkBuffer.delete(key);
          await this.saveAndEmitInboundMessage(sid, {
            id: data.id,
            type: buffer.chunkType,
            text: buffer.parts.join(""),
            timestamp: buffer.timestamp,
            replyTo: buffer.replyTo,
          });
          break;
        case "EDIT":
          try {
            const msgRows = await queryDB(
              "SELECT timestamp, sid, sender FROM messages WHERE id = ?",
              [data.id],
            );
            if (msgRows.length > 0) {
              const msg = msgRows[0];
              if (msg.sid !== sid || msg.sender !== "other") {
                console.warn(
                  "[MessageService] Ignoring EDIT for message not owned by sender",
                  data.id,
                );
                break;
              }
              if (Date.now() - msg.timestamp > 24 * 60 * 60 * 1000) {
                console.warn(
                  "[MessageService] Ignoring EDIT for old message",
                  data.id,
                );
                break;
              }
            } else {
              console.warn(
                "[MessageService] Message not found for EDIT",
                data.id,
              );
              break;
            }

            await executeDB("UPDATE messages SET text = ? WHERE id = ?", [
              data.text,
              data.id,
            ]);
            this.client.emit("message_updated", {
              sid,
              id: data.id,
              text: data.text,
            });
          } catch (e) {
            console.error(
              "[MessageService] Failed to process EDIT message:",
              e,
            );
          }
          break;
        case "DELETE":
          try {
            const msgRowsDelete = await queryDB(
              "SELECT timestamp, sid, sender FROM messages WHERE id = ?",
              [data.id],
            );
            if (msgRowsDelete.length > 0) {
              const msg = msgRowsDelete[0];
              if (msg.sid !== sid || msg.sender !== "other") {
                console.warn(
                  "[MessageService] Ignoring DELETE for message not owned by sender",
                  data.id,
                );
                break;
              }
              if (Date.now() - msg.timestamp > 24 * 60 * 60 * 1000) {
                console.warn(
                  "[MessageService] Ignoring DELETE for old message",
                  data.id,
                );
                break;
              }
            } else {
              console.warn(
                "[MessageService] Message not found for DELETE",
                data.id,
              );
              break;
            }

            await executeDB(
              "UPDATE messages SET text = ?, type = 'deleted' WHERE id = ?",
              ["🚫 This message was deleted", data.id],
            );
            this.client.emit("message_updated", {
              sid,
              id: data.id,
              text: "🚫 This message was deleted",
              type: "deleted",
            });
          } catch (e) {
            console.error(
              "[MessageService] Failed to process DELETE message:",
              e,
            );
          }
          break;
        case "FILE_INFO":
          await this.client.fileTransfer.handleFileInfo(sid, data);
          break;
        case "FILE_REQ_CHUNK":
          this.client.fileTransfer.streamAllChunks(
            sid,
            data.messageId,
            data.chunkIndex,
          );
          break;
        case "FILE_CHUNK":
          await this.client.fileTransfer.handleFileChunk(sid, data);
          break;
        case "CALL_START":
          if (this.client.callService.isCalling) {
            console.log(
              "[MessageService] Already on call, rejecting new call from",
              sid,
            );
            const busyPayload = await this.client.encryptForSession(
              sid,
              JSON.stringify({ t: "MSG", data: { type: "CALL_BUSY" } }),
              0,
            );
            this.client.send({ t: "MSG", sid, data: { payload: busyPayload } });
            return;
          }
          console.log("[MessageService] Received CALL_START");

          this.client.callService.playRingtone();

          this.client.emit("call_incoming", {
            sid,
            mode: data?.mode || "Audio",
            remoteSid: sid,
          });
          break;
        case "RTC_OFFER":
          console.log("[MessageService] Received RTC_OFFER");
          if (data?.offer) {
            await this.client.callService.handleRTCOffer(sid, data.offer);
          }
          break;
        case "RTC_ANSWER":
          console.log("[MessageService] Received RTC_ANSWER");
          if (data?.answer) {
            await this.client.callService.handleRTCAnswer(sid, data.answer);
          }
          break;
        case "ICE_CANDIDATE":
          console.log("[MessageService] Received ICE_CANDIDATE");
          if (data?.candidate) {
            await this.client.callService.handleICECandidate(
              sid,
              data.candidate,
            );
          }
          break;
        case "CALL_BUSY":
          console.log("[MessageService] Remote user is busy");
          this.client.emit("notification", {
            type: "info",
            message: "User is busy on another call.",
          });
          this.client.callService.cleanupCall();
          this.client.emit("call_ended", {
            sid,
            duration: 0,
            connected: false,
          });
          break;
        case "CALL_ACCEPT":
          console.log(
            "[MessageService] Received CALL_ACCEPT - call is being answered",
          );
          break;
        case "CALL_END":
          console.log("[MessageService] Received CALL_END");
          const wasCallConnected = this.client.callService.isCallConnected;
          this.client.callService.cleanupCall();
          const callDuration = this.client.callService.callStartTime
            ? Date.now() - this.client.callService.callStartTime
            : 0;
          this.client.emit("call_ended", {
            sid,
            duration: callDuration,
            connected: wasCallConnected,
          });
          break;
        case "METADATA":
          try {
            const meta = data;
            this.client.emit("metadata_response", meta);
          } catch (e) {
            console.error("Error handling METADATA", e);
          }
          break;
        case "IMAGE_DATA":
          try {
            this.client.emit("image_response", data);
          } catch (e) {
            console.error("Error handling IMAGE_DATA", e);
          }
          break;
        case "PROFILE_VERSION":
          try {
            const { name_version, avatar_version } = data;
            const peerRows = await queryDB(
              "SELECT peer_name_ver, peer_avatar_ver, peer_name, peer_avatar FROM sessions WHERE sid = ?",
              [sid],
            );
            if (peerRows.length) {
              const current = peerRows[0];
              const missingProfileData =
                (name_version > 0 && !current.peer_name) ||
                (avatar_version > 0 && !current.peer_avatar);
              if (
                name_version > (current.peer_name_ver || 0) ||
                avatar_version > (current.peer_avatar_ver || 0) ||
                missingProfileData
              ) {
                console.log(
                  `[MessageService] Peer ${sid} has newer profile (v${name_version}/${avatar_version}), requesting update...`,
                );
                const reqPayload = await this.client.encryptForSession(
                  sid,
                  JSON.stringify({ t: "MSG", data: { type: "GET_PROFILE" } }),
                  1,
                );
                this.client.send({
                  t: "MSG",
                  sid,
                  data: { payload: reqPayload },
                });
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
              let avatarBase64: string | null = null;
              if (me.public_avatar) {
                if (!me.public_avatar.startsWith("data:")) {
                  try {
                    console.log(
                      `[MessageService] Reading avatar file via StorageService.getFileSrc: ${me.public_avatar}`,
                    );
                    const fileData = await StorageService.getFileSrc(
                      me.public_avatar,
                      "image/jpeg",
                    );
                    avatarBase64 = this.normalizeProfileAvatarPayload(fileData);
                    console.log(
                      `[MessageService] Loaded avatar data, length: ${fileData?.length}`,
                    );
                  } catch (e) {
                    console.warn("Failed to load avatar file", e);
                  }
                } else {
                  const parts = me.public_avatar.split(",");
                  avatarBase64 = parts.length > 1 ? parts[1] : null;
                }
              }
              const normalizedAvatar =
                this.normalizeProfileAvatarPayload(avatarBase64);
              const canInlineAvatar =
                !!normalizedAvatar &&
                normalizedAvatar.length <=
                  MessageService.MAX_PROFILE_AVATAR_B64_CHARS;
              const transferId = canInlineAvatar ? null : crypto.randomUUID();
              const avatarChunks =
                !canInlineAvatar && avatarBase64
                  ? this.splitProfileAvatarIntoChunks(avatarBase64)
                  : [];

              const profilePayload = await this.client.encryptForSession(
                sid,
                JSON.stringify({
                  t: "MSG",
                  data: {
                    type: "PROFILE_DATA",
                    name: me.public_name,
                    avatar: canInlineAvatar ? normalizedAvatar : null,
                    name_version: me.name_version,
                    avatar_version: me.avatar_version,
                    avatar_chunked: !!avatarChunks.length,
                    avatar_transfer_id: transferId,
                    avatar_total_chunks: avatarChunks.length,
                  },
                }),
                1,
              );
              this.client.send({
                t: "MSG",
                sid,
                data: { payload: profilePayload },
              });

              if (avatarChunks.length && transferId) {
                console.log(
                  `[MessageService] Sending chunked avatar for ${sid}: ${avatarChunks.length} chunks`,
                );
                for (
                  let chunkIndex = 0;
                  chunkIndex < avatarChunks.length;
                  chunkIndex++
                ) {
                  const chunkPayload = await this.client.encryptForSession(
                    sid,
                    JSON.stringify({
                      t: "MSG",
                      data: {
                        type: "PROFILE_AVATAR_CHUNK",
                        transfer_id: transferId,
                        chunk_index: chunkIndex,
                        total_chunks: avatarChunks.length,
                        chunk: avatarChunks[chunkIndex],
                        name_version: me.name_version,
                        avatar_version: me.avatar_version,
                        name: me.public_name,
                      },
                    }),
                    1,
                  );
                  this.client.send({
                    t: "MSG",
                    sid,
                    data: { payload: chunkPayload },
                    c: chunkIndex === avatarChunks.length - 1,
                    p: 1,
                  });
                }
              }
            }
          } catch (e) {
            console.error("Error handling GET_PROFILE", e);
          }
          break;
        case "PROFILE_DATA":
          try {
            const {
              name,
              avatar,
              name_version,
              avatar_version,
              avatar_chunked,
              avatar_transfer_id,
              avatar_total_chunks,
            } = data;
            console.log(
              `[MessageService] Received PROFILE_DATA from ${sid}: ${name}`,
            );

            let avatarFile = null;
            if (avatar && !avatar_chunked) {
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
            if (
              avatar_chunked &&
              avatar_transfer_id &&
              avatar_total_chunks > 0
            ) {
              const chunkKey = this.profileAvatarChunkKey(
                sid,
                avatar_transfer_id,
              );
              this.profileAvatarChunkBuffer.set(chunkKey, {
                totalChunks: avatar_total_chunks,
                parts: new Array(avatar_total_chunks),
                name: name || null,
                nameVersion: name_version || 0,
                avatarVersion: avatar_version || 0,
                timestamp: Date.now(),
              });
              await executeDB(
                "UPDATE sessions SET peer_name = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
                [name, name_version, avatar_version, sid],
              );
            } else {
              await executeDB(
                "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
                [name, avatarFile, name_version, avatar_version, sid],
              );
            }
            this.client.emit("session_updated");
          } catch (e) {
            console.error("Error handling PROFILE_DATA", e);
          }
          break;
        case "PROFILE_AVATAR_CHUNK":
          try {
            const {
              transfer_id,
              chunk_index,
              total_chunks,
              chunk,
              name,
              name_version,
              avatar_version,
            } = data;
            if (
              typeof transfer_id !== "string" ||
              typeof chunk_index !== "number" ||
              typeof total_chunks !== "number" ||
              typeof chunk !== "string" ||
              chunk_index < 0 ||
              total_chunks <= 0 ||
              chunk_index >= total_chunks ||
              total_chunks > 10000
            ) {
              console.warn("[MessageService] Invalid PROFILE_AVATAR_CHUNK");
              break;
            }
            const chunkKey = this.profileAvatarChunkKey(sid, transfer_id);
            const existing = this.profileAvatarChunkBuffer.get(chunkKey);
            const buffer =
              existing ||
              ({
                totalChunks: total_chunks,
                parts: new Array(total_chunks),
                name: name || null,
                nameVersion: name_version || 0,
                avatarVersion: avatar_version || 0,
                timestamp: Date.now(),
              } as {
                totalChunks: number;
                parts: string[];
                name: string | null;
                nameVersion: number;
                avatarVersion: number;
                timestamp: number;
              });
            if (buffer.totalChunks !== total_chunks) {
              this.profileAvatarChunkBuffer.delete(chunkKey);
              break;
            }
            buffer.parts[chunk_index] = chunk;
            this.profileAvatarChunkBuffer.set(chunkKey, buffer);
            if (buffer.parts.some((part) => typeof part !== "string")) {
              break;
            }
            this.profileAvatarChunkBuffer.delete(chunkKey);
            const base64 = buffer.parts.join("");
            const avatarFile = await StorageService.saveProfileImage(
              base64,
              sid,
            );
            await executeDB(
              "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
              [
                buffer.name,
                avatarFile,
                buffer.nameVersion,
                buffer.avatarVersion,
                sid,
              ],
            );
            this.client.emit("session_updated");
          } catch (e) {
            console.error("Error handling PROFILE_AVATAR_CHUNK", e);
          }
          break;
        case "REACTION":
          try {
            const { messageId, emoji, action, timestamp } = data;
            const peerEmail =
              this.client.sessionService.sessions[sid]?.peerEmail || sid;
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
            this.client.emit("reaction_update", { messageId });
            this.client.emit(`reaction_update:${messageId}`, {
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

  public async syncPendingMessages() {
    console.log("[MessageService] Syncing pending messages...");
    try {
      const rows = await queryDB(
        "SELECT * FROM messages WHERE status = 1 AND sender = 'me'",
      );
      for (const row of rows) {
        if (
          this.client.sessionService.sessions[row.sid] &&
          this.client.sessionService.sessions[row.sid].online
        ) {
          console.log(`[MessageService] Resending msg ${row.id} to ${row.sid}`);
          const payload = await this.client.encryptForSession(
            row.sid,
            JSON.stringify({
              t: "MSG",
              data: {
                type:
                  row.type === "text"
                    ? "TEXT"
                    : row.type
                    ? row.type.toUpperCase()
                    : "TEXT",
                text: row.text,
                id: row.id,
                timestamp: row.timestamp,
                replyTo: row.reply_to ? JSON.parse(row.reply_to) : undefined,
              },
            }),
            1,
          );
          this.client.send({
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

  public async sendReaction(
    sid: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) {
    if (!this.client.sessionService.sessions[sid]) {
      console.warn(
        `[MessageService] Session ${sid} not found, attempting reload...`,
      );
      await this.client.sessionService.loadSessions();
      if (!this.client.sessionService.sessions[sid]) {
        console.error(
          `[MessageService] Session ${sid} STILL not found after reload.`,
        );
        throw new Error("Session not found");
      }
    }

    const payload = await this.client.encryptForSession(
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
    this.client.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
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
      this.client.emit("reaction_update", { messageId });
      this.client.emit(`reaction_update:${messageId}`, {
        messageId,
        emoji,
        action,
        sender: "me",
      });
    } catch (e) {
      console.error("Failed to save reaction locally", e);
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
        `[MessageService] Broadcasting profile update: v${name_version}/${avatar_version}`,
      );

      const sids = Object.keys(this.client.sessionService.sessions);
      for (const sid of sids) {
        if (this.client.sessionService.sessions[sid].online) {
          try {
            const payload = await this.client.encryptForSession(
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
            this.client.send({
              t: "MSG",
              sid,
              data: { payload },
              c: true,
              p: 1,
            });
          } catch (e) {
            console.error(
              `[MessageService] Failed to send profile update to ${sid}`,
              e,
            );
          }
        }
      }
    } catch (e) {
      console.error("[MessageService] Failed to broadcast profile update", e);
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
}
