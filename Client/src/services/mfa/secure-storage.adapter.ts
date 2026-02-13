import { AccountService } from "../auth/AccountService";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../storage/SafeStorage";

const VAULT_MFA_SECRET_PREFIX = "vault_mfa_secret";

export const mfaSecureStorage = {
  async getVaultMfaSecret(userEmail: string): Promise<string | null> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    return getKeyFromSecureStorage(key);
  },

  async setVaultMfaSecret(userEmail: string, secret: string): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    await setKeyFromSecureStorage(key, secret);
  },

  async clearVaultMfaSecret(userEmail: string): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    await setKeyFromSecureStorage(key, "");
  },
};

