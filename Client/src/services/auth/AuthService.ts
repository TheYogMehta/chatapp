import { EventEmitter } from "events";
import { AccountService } from "./AccountService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
  setActiveUser,
} from "../storage/SafeStorage";
import { switchDatabase } from "../storage/sqliteService";
import socket from "../core/SocketManager";
import * as bip39 from "bip39";

export class AuthService extends EventEmitter {
  public userEmail: string | null = null;
  private authToken: string | null = null;
  public identityKeyPair: CryptoKeyPair | null = null;

  constructor() {
    super();
  }

  public hasToken(): boolean {
    return !!this.authToken;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setAuthToken(token: string) {
    this.authToken = token;
  }

  public async login(token: string) {
    this.authToken = token;
    if (!socket.isConnected()) {
      await socket.connect("wss://socket.cryptnode.theyogmehta.online");
    }
    socket.send({ t: "AUTH", data: { token }, c: true, p: 0 });
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

    this.userEmail = email;
    await setActiveUser(email);

    await this.loadIdentity();

    if (!socket.isConnected()) {
      await socket.connect("wss://socket.cryptnode.theyogmehta.online");
    }
    socket.send({ t: "AUTH", data: { token: this.authToken } });

    this.emit("auth_success", email);
  }

  public async loadIdentity() {
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

  public async exportPub() {
    const raw = await crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey,
    );
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  public async handleAuthSuccess(data: any) {
    this.userEmail = data.email;
    if (data.token) {
      this.authToken = data.token;
      const tokenKey = await AccountService.getStorageKey(
        data.email,
        "auth_token",
      );
      await setKeyFromSecureStorage(tokenKey, data.token);
      console.log("[AuthService] Session token saved/refreshed");

      await AccountService.addAccount(data.email, data.token);
      await setActiveUser(data.email);

      let key = await getKeyFromSecureStorage(
        await AccountService.getStorageKey(data.email, "MASTER_KEY"),
      );
      if (!key) {
        console.log("[AuthService] Generating new MASTER_KEY for user");
        key = bip39.generateMnemonic(128);
        await setKeyFromSecureStorage(
          await AccountService.getStorageKey(data.email, "MASTER_KEY"),
          key,
        );
      }
      const dbName = await AccountService.getDbName(data.email);
      await switchDatabase(dbName, key);

      await this.loadIdentity();
      this.emit("auth_success", data.email);
    }
  }
}
