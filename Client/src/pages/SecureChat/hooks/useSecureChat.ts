import { useState, useCallback } from "react";
import {
  deriveKey,
  encryptData,
  decryptString,
  decryptData,
  generateSalt,
  bufferToBase64,
  base64ToBuffer,
  hexToUint8Array,
  uint8ArrayToHex,
} from "../../../utils/crypto";
import {
  storeItem,
  getAllItems,
  deleteItem,
  VaultItem,
} from "../../../utils/secureStorage";
import { StorageService } from "../../../services/storage/StorageService";
import { v4 as uuidv4 } from "uuid";
import ChatClient from "../../../services/core/ChatClient";
import { AccountService } from "../../../services/auth/AccountService";
import { getKeyFromSecureStorage } from "../../../services/storage/SafeStorage";
import {
  mfaService,
  MfaOnboardingData,
} from "../../../services/mfa/mfa.service";
import { qrService } from "../../../services/mfa/qr.service";

interface UnlockResult {
  ok: boolean;
  requiresMfa?: boolean;
}

export const useSecureChat = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mfaOnboarding, setMfaOnboarding] = useState<
    (MfaOnboardingData & { qrDataUrl: string }) | null
  >(null);

  const userEmail = ChatClient.userEmail;
  const getSaltKey = () => `secure_chat_salt_${userEmail}`;

  const loadItems = useCallback(async () => {
    if (!userEmail) {
      setItems([]);
      return;
    }
    try {
      const all = await getAllItems();
      const myItems = all.filter(
        (i) =>
          i.metadata?.owner === userEmail &&
          !i.metadata?.isVerifier &&
          !String(i.id || "").startsWith("verifier_"),
      );
      setItems(myItems.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
      console.error("Failed to load items", e);
    }
  }, [userEmail]);

  const unlock = useCallback(
    async (
      password: string,
      otpToken?: string,
      skipPinCheck: boolean = false,
    ): Promise<UnlockResult> => {
      if (!userEmail) return { ok: false };

      try {
        if (!skipPinCheck) {
          const pinKey = await AccountService.getStorageKey(
            userEmail,
            "app_lock_pin",
          );
          const storedPin = await getKeyFromSecureStorage(pinKey);

          if (storedPin !== password) {
            throw new Error("Incorrect Password");
          }
        }

        const onboarding = await mfaService.getOnboardingData(userEmail);
        const isProvisioned = await mfaService.isProvisioned(userEmail);
        if (!otpToken) {
          if (!isProvisioned) {
            const qrDataUrl = await qrService.toDataUrl(onboarding.otpAuthUri);
            setMfaOnboarding({ ...onboarding, qrDataUrl });
          } else {
            setMfaOnboarding(null);
          }
          setError("Enter your authenticator code to unlock.");
          return { ok: false, requiresMfa: true };
        }

        const valid = await mfaService.verifyToken(onboarding.secret, otpToken);
        if (!valid) {
          throw new Error("Invalid verification code");
        }

        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error("Master Key not found. Please reset profile.");
        }

        const saltHex = localStorage.getItem(getSaltKey());
        if (!saltHex) {
          throw new Error("Vault integrity error: Salt missing");
        }

        const derivedKey = await deriveKey(mnemonic, hexToUint8Array(saltHex));

        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);
        setMfaOnboarding(null);
        if (!isProvisioned) {
          await mfaService.setProvisioned(userEmail, true);
        }

        await loadItems();
        return { ok: true };
      } catch (e: any) {
        console.error(e);
        setError(
          e.message === "Incorrect Password"
            ? "Incorrect Password"
            : e.message === "Invalid verification code"
            ? "Invalid verification code"
            : "Failed to unlock: " + e.message,
        );
        return { ok: false };
      }
    },
    [userEmail, loadItems],
  );

  const addItemWithKey = useCallback(
    async (
      k: CryptoKey,
      type: "text" | "file" | "password",
      content: string | Uint8Array,
      metadata: any,
    ) => {
      const { content: encrypted, iv } = await encryptData(content, k);
      const base64 = bufferToBase64(encrypted);
      const fileName = await StorageService.saveRawFile(base64);

      const item: VaultItem = {
        id: uuidv4(),
        type,
        encryptedFilePath: fileName,
        iv,
        metadata,
        timestamp: Date.now(),
      };

      await storeItem(item);
    },
    [],
  );

  const setupVault = useCallback(
    async (_password?: string): Promise<UnlockResult> => {
      if (!userEmail) return { ok: false };

      try {
        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error("Master Key not found. Complete profile setup first.");
        }

        let saltHex = localStorage.getItem(getSaltKey());
        if (!saltHex) {
          const salt = generateSalt();
          saltHex = uint8ArrayToHex(salt);
          localStorage.setItem(getSaltKey(), saltHex);
        }

        const derivedKey = await deriveKey(mnemonic, hexToUint8Array(saltHex));
        setKey(null);
        setIsUnlocked(false);
        setError("Set up authenticator and verify OTP to unlock vault.");

        const { content: encryptedVerifier, iv: verifierIv } = await encryptData(
          "VERIFIER_CHECK",
          derivedKey,
        );
        const verifierFile = await StorageService.saveRawFile(
          bufferToBase64(encryptedVerifier),
        );

        await storeItem({
          id: `verifier_${userEmail}`,
          type: "text",
          encryptedFilePath: verifierFile,
          iv: verifierIv,
          metadata: { owner: userEmail, isVerifier: true },
          timestamp: Date.now(),
        });

        await addItemWithKey(
          derivedKey,
          "text",
          "Welcome to your Secure Vault! This data is encrypted using your Master Key.",
          { owner: userEmail, title: "Welcome" },
        );

        const onboarding = await mfaService.getOnboardingData(userEmail);
        const qrDataUrl = await qrService.toDataUrl(onboarding.otpAuthUri);
        setMfaOnboarding({ ...onboarding, qrDataUrl });
        await mfaService.setProvisioned(userEmail, false);

        // Keep vault locked until OTP is verified.
        return { ok: false, requiresMfa: true };
      } catch (e: any) {
        setError("Setup failed: " + e.message);
        return { ok: false };
      }
    },
    [userEmail],
  );

  const addItem = useCallback(
    async (
      type: "text" | "file" | "password",
      content: string | Uint8Array,
      metadata: any = {},
    ) => {
      if (!key || !userEmail) return;

      await addItemWithKey(key, type, content, {
        ...metadata,
        owner: userEmail,
      });
      await loadItems();
    },
    [key, userEmail, addItemWithKey, loadItems],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await deleteItem(id);
      await loadItems();
    },
    [loadItems],
  );

  const decryptItemContent = useCallback(
    async (item: VaultItem) => {
      if (!key) throw new Error("Locked");

      const base64 = await StorageService.readFile(item.encryptedFilePath);
      if (!base64) throw new Error("File not found or empty");

      const encryptedContent = base64ToBuffer(base64);
      if (item.type === "text" || item.type === "password") {
        return decryptString(encryptedContent, item.iv, key);
      }

      return decryptData(encryptedContent, item.iv, key);
    },
    [key],
  );

  const isSetup = userEmail ? !!localStorage.getItem(getSaltKey()) : false;

  return {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    addItem,
    removeItem,
    decryptItemContent,
    error,
    mfaOnboarding,
    clearMfaOnboarding: () => setMfaOnboarding(null),
  };
};
