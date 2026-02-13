import { EventEmitter } from "events";
import { AuthService } from "../auth/AuthService";
import { AccountService } from "../auth/AccountService";
import { queryDB, executeDB } from "../storage/sqliteService";
import { WorkerManager } from "../core/WorkerManager";
import socket from "../core/SocketManager";
import { sha256 } from "../../utils/crypto";
import { StorageService } from "../storage/StorageService";

export interface ChatSession {
  cryptoKey: CryptoKey;
  online: boolean;
  peerEmail?: string;
  peerEmailHash?: string;
  peerName?: string;
  peerAvatar?: string;
  peer_name_ver?: number;
  peer_avatar_ver?: number;
}

export class SessionService extends EventEmitter {
  private authService: AuthService;
  public sessions: Record<string, ChatSession> = {};
  private static readonly MAX_HANDSHAKE_AVATAR_B64 = 160 * 1024;

  constructor(authService: AuthService) {
    super();
    this.authService = authService;
  }

  private normalizeEmail(email?: string | null): string {
    return (email || "").trim().toLowerCase();
  }

  public async encrypt(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<string> {
    const buffer =
      data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
    return WorkerManager.getInstance().encrypt(sid, buffer, priority);
  }

  public async decrypt(
    sid: string,
    payload: string,
    priority: number,
  ): Promise<ArrayBuffer | null> {
    try {
      return await WorkerManager.getInstance().decrypt(sid, payload, priority);
    } catch (e) {
      console.warn("[SessionService] Worker decryption failed:", e);
      return null;
    }
  }

  public async loadSessions() {
    const previousSessions = this.sessions;
    this.sessions = {};
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      try {
        const normalizedPeerEmail = this.normalizeEmail(row.peer_email);
        const peerEmailHash =
          row.peer_hash ||
          (normalizedPeerEmail ? await sha256(normalizedPeerEmail) : undefined);
        this.sessions[row.sid] = {
          cryptoKey: await crypto.subtle.importKey(
            "jwk",
            JSON.parse(row.keyJWK),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"],
          ),
          online: previousSessions[row.sid]?.online || false,
          peerEmail: normalizedPeerEmail || undefined,
          peerEmailHash,
          peerName: row.peer_name || undefined,
          peerAvatar: row.peer_avatar || undefined,
          peer_name_ver: row.peer_name_ver || 0,
          peer_avatar_ver: row.peer_avatar_ver || 0,
        };
        const jwk = JSON.parse(row.keyJWK);
        await WorkerManager.getInstance().initSession(row.sid, jwk);
      } catch (e) {
        console.error("Failed to load session", row.sid, e);
      }
    }
  }

  private async getLocalProfileForHandshake() {
    const rows = await queryDB(
      "SELECT public_name, public_avatar, name_version, avatar_version FROM me WHERE id = 1",
    );
    const me = rows?.[0] || {
      public_name: undefined,
      public_avatar: undefined,
      name_version: 1,
      avatar_version: 1,
    };

    let avatarData: string | undefined = undefined;
    if (me.public_avatar) {
      if (typeof me.public_avatar === "string" && me.public_avatar.startsWith("data:")) {
        avatarData = me.public_avatar;
      } else if (
        typeof me.public_avatar === "string" &&
        (me.public_avatar.startsWith("http://") ||
          me.public_avatar.startsWith("https://"))
      ) {
        avatarData = me.public_avatar;
      } else {
        try {
          const fileSrc = await StorageService.getFileSrc(
            me.public_avatar,
            "image/jpeg",
          );
          if (fileSrc) avatarData = fileSrc;
        } catch (_e) {}
      }
    }

    let displayName = me.public_name || undefined;
    if (!displayName || !avatarData) {
      try {
        const currentEmail = this.normalizeEmail(this.authService.userEmail || "");
        const accounts = await AccountService.getAccounts();
        const account = accounts.find(
          (acc) => this.normalizeEmail(acc.email) === currentEmail,
        );
        if (!displayName && account?.displayName) {
          displayName = account.displayName;
        }
        if (!avatarData && account?.avatarUrl) {
          if (
            account.avatarUrl.startsWith("data:") ||
            account.avatarUrl.startsWith("http://") ||
            account.avatarUrl.startsWith("https://")
          ) {
            avatarData = account.avatarUrl;
          } else {
            const fileSrc = await StorageService.getFileSrc(
              account.avatarUrl,
              "image/jpeg",
            );
            if (fileSrc) avatarData = fileSrc;
          }
        }
      } catch (_e) {}
    }

    if (avatarData && avatarData.length > SessionService.MAX_HANDSHAKE_AVATAR_B64) {
      avatarData = undefined;
    }

    return {
      name: displayName,
      avatar: avatarData,
      nameVersion: Number(me.name_version || 1),
      avatarVersion: Number(me.avatar_version || 1),
    };
  }

  public async finalizeSession(
    sid: string,
    remotePubB64: string,
    peerEmail?: string,
    peerEmailHash?: string,
    peerName?: string,
    peerAvatar?: string,
    peerNameVer?: number,
    peerAvatarVer?: number,
  ) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    const normalizedPeerEmail = this.normalizeEmail(peerEmail);
    const resolvedPeerEmailHash =
      peerEmailHash || (normalizedPeerEmail ? await sha256(normalizedPeerEmail) : undefined);

    let peerAvatarFile: string | undefined = undefined;
    if (peerAvatar) {
      let avatarBase64 = peerAvatar;
      if (peerAvatar.startsWith("data:")) {
        avatarBase64 = peerAvatar.split(",")[1] || "";
      }
      if (avatarBase64.length > 256) {
        try {
          peerAvatarFile = await StorageService.saveProfileImage(avatarBase64, sid);
        } catch (_e) {
          peerAvatarFile = undefined;
        }
      } else {
        peerAvatarFile = peerAvatar;
      }
    }

    const resolvedPeerNameVer = peerName ? Number(peerNameVer || 0) : 0;
    const resolvedPeerAvatarVer = peerAvatarFile ? Number(peerAvatarVer || 0) : 0;

    this.sessions[sid] = {
      cryptoKey: sharedKey,
      online: true,
      peerEmail: normalizedPeerEmail || undefined,
      peerEmailHash: resolvedPeerEmailHash,
      peerName: peerName || undefined,
      peerAvatar: peerAvatarFile || undefined,
      peer_name_ver: resolvedPeerNameVer,
      peer_avatar_ver: resolvedPeerAvatarVer,
    };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await WorkerManager.getInstance().initSession(sid, jwk);
    await executeDB(
      "INSERT OR IGNORE INTO sessions (sid, keyJWK) VALUES (?, ?)",
      [sid, JSON.stringify(jwk)],
    );
    await executeDB(
      `UPDATE sessions
       SET keyJWK = ?,
           peer_email = COALESCE(?, peer_email),
           peer_hash = COALESCE(?, peer_hash),
           peer_name = COALESCE(?, peer_name),
           peer_avatar = COALESCE(?, peer_avatar),
           peer_name_ver = CASE
             WHEN ? > COALESCE(peer_name_ver, 0) THEN ?
             ELSE COALESCE(peer_name_ver, 0)
           END,
           peer_avatar_ver = CASE
             WHEN ? > COALESCE(peer_avatar_ver, 0) THEN ?
             ELSE COALESCE(peer_avatar_ver, 0)
           END
       WHERE sid = ?`,
      [
        JSON.stringify(jwk),
        normalizedPeerEmail || null,
        resolvedPeerEmailHash || null,
        peerName || null,
        peerAvatarFile || null,
        resolvedPeerNameVer,
        resolvedPeerNameVer,
        resolvedPeerAvatarVer,
        resolvedPeerAvatarVer,
        sid,
      ],
    );
    this.emit("session_created", sid);
  }

  private async deriveSharedKey(pubB64: string) {
    if (!this.authService.identityKeyPair) {
      throw new Error("Identity not loaded");
    }
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
      this.authService.identityKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  public async connectToPeer(targetEmail: string) {
    if (!this.authService.userEmail) {
      throw new Error("Must be logged in to connect");
    }
    const pub = await this.authService.exportPub();
    const profile = await this.getLocalProfileForHandshake();
    const senderEmail = this.normalizeEmail(this.authService.userEmail);
    const senderEmailHash = await sha256(senderEmail);
    socket.send({
      t: "CONNECT_REQ",
      data: {
        targetEmail: this.normalizeEmail(targetEmail),
        publicKey: pub,
        senderEmail,
        senderEmailHash,
        senderName: profile.name,
        senderAvatar: profile.avatar,
        senderNameVer: profile.nameVersion,
        senderAvatarVer: profile.avatarVersion,
      },
      c: true,
      p: 0,
    });
  }

  public async acceptFriend(
    sid: string,
    remotePub: string,
    peerEmail?: string,
    peerEmailHash?: string,
    peerName?: string,
    peerAvatar?: string,
    peerNameVer?: number,
    peerAvatarVer?: number,
  ) {
    const pub = await this.authService.exportPub();
    const profile = await this.getLocalProfileForHandshake();
    const senderEmail = this.normalizeEmail(this.authService.userEmail || "");
    const senderEmailHash = senderEmail ? await sha256(senderEmail) : undefined;
    socket.send({
      t: "JOIN_ACCEPT",
      sid,
      data: {
        publicKey: pub,
        senderEmail,
        senderEmailHash,
        senderName: profile.name,
        senderAvatar: profile.avatar,
        senderNameVer: profile.nameVersion,
        senderAvatarVer: profile.avatarVersion,
      },
      c: true,
      p: 0,
    });
    await this.finalizeSession(
      sid,
      remotePub,
      peerEmail,
      peerEmailHash,
      peerName,
      peerAvatar,
      peerNameVer,
      peerAvatarVer,
    );
  }

  public denyFriend(sid: string) {
    socket.send({ t: "JOIN_DENY", sid, c: true, p: 0 });
  }

  public getSession(sid: string) {
    return this.sessions[sid];
  }

  public setPeerOnline(sid: string, online: boolean) {
    if (this.sessions[sid]) {
      this.sessions[sid].online = online;
    }
  }

  public reattachAllSessions() {
    const sids = Object.keys(this.sessions);
    for (const sid of sids) {
      socket.send({ t: "REATTACH", sid, c: true, p: 0 });
    }
    return sids.length;
  }
}
