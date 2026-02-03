import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
  hashIdentifier,
} from "./SafeStorage";

export interface StoredAccount {
  email: string;
  token: string;
  lastActive: number;
  displayName?: string;
  avatarUrl?: string;
}

const STORAGE_KEY_ACCOUNTS = "chatapp_accounts";

export class AccountService {
  static async getDbName(email: string): Promise<string> {
    const hashHex = await hashIdentifier(email);
    return `user_${hashHex.substring(0, 16)}`;
  }

  static async getStorageKey(email: string, prefix: string): Promise<string> {
    const hashHex = await hashIdentifier(email);
    return `${prefix}_${hashHex}`;
  }

  static async getAccounts(): Promise<StoredAccount[]> {
    const raw = await getKeyFromSecureStorage(STORAGE_KEY_ACCOUNTS);
    console.log(
      "[AccountService] Raw accounts from storage:",
      raw ? "Found data" : "null/empty",
    );
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static async addAccount(
    email: string,
    token: string,
    displayName?: string,
    avatarUrl?: string,
  ) {
    console.log("[AccountService] Adding/Updating account:", email);
    const accounts = await this.getAccounts();
    const existingIndex = accounts.findIndex((a) => a.email === email);

    const newAccount: StoredAccount = {
      email,
      token,
      lastActive: Date.now(),
      displayName:
        displayName ||
        (existingIndex >= 0 ? accounts[existingIndex].displayName : undefined),
      avatarUrl:
        avatarUrl ||
        (existingIndex >= 0 ? accounts[existingIndex].avatarUrl : undefined),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = newAccount;
    } else {
      accounts.push(newAccount);
    }

    await setKeyFromSecureStorage(
      STORAGE_KEY_ACCOUNTS,
      JSON.stringify(accounts),
    );
  }

  static async removeAccount(email: string) {
    const accounts = await this.getAccounts();
    const filtered = accounts.filter((a) => a.email !== email);
    await setKeyFromSecureStorage(
      STORAGE_KEY_ACCOUNTS,
      JSON.stringify(filtered),
    );
  }

  static async updateProfile(
    email: string,
    displayName: string,
    avatarUrl: string,
  ) {
    const accounts = await this.getAccounts();
    const idx = accounts.findIndex((a) => a.email === email);
    if (idx !== -1) {
      accounts[idx].displayName = displayName;
      accounts[idx].avatarUrl = avatarUrl;
      await setKeyFromSecureStorage(
        STORAGE_KEY_ACCOUNTS,
        JSON.stringify(accounts),
      );
    }
  }
}
