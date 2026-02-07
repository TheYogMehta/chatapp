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
import { StorageService } from "../../../utils/Storage";
import { v4 as uuidv4 } from "uuid";
import ChatClient from "../../../services/ChatClient";
import { AccountService } from "../../../services/AccountService";
import { getKeyFromSecureStorage } from "../../../services/SafeStorage";

export const useSecureChat = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const userEmail = ChatClient.userEmail;

  const getSaltKey = () => `secure_chat_salt_${userEmail}`;

  const unlock = useCallback(
    async (password: string) => {
      if (!userEmail) return;
      try {
        // 1. Verify PIN
        const pinKey = await AccountService.getStorageKey(
          userEmail,
          "app_lock_pin",
        );
        const storedPin = await getKeyFromSecureStorage(pinKey);

        if (storedPin !== password) {
          throw new Error("Incorrect Password");
        }

        // 2. Get Master Key
        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error("Master Key not found. Please reset profile.");
        }
        const saltHex = localStorage.getItem(getSaltKey());
        let salt: Uint8Array;

        if (!saltHex) {
          throw new Error("Vault integrity error: Salt missing");
        } else {
          salt = hexToUint8Array(saltHex);
        }

        const derivedKey = await deriveKey(mnemonic, salt);

        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        loadItems(derivedKey);
      } catch (e: any) {
        console.error(e);
        setError(
          e.message === "Incorrect Password"
            ? "Incorrect Password"
            : "Failed to unlock: " + e.message,
        );
        return false;
      }
      return true;
    },
    [userEmail],
  );

  const setupVault = useCallback(
    async (password: string) => {
      if (!userEmail) return;
      try {
        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error(
            "Master Key not found. Complete profile setup first.",
          );
        }

        let saltHex = localStorage.getItem(getSaltKey());
        if (!saltHex) {
          const salt = generateSalt();
          saltHex = uint8ArrayToHex(salt);
          localStorage.setItem(getSaltKey(), saltHex);
        }

        const salt = hexToUint8Array(saltHex);

        const derivedKey = await deriveKey(mnemonic, salt);
        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        const { content: encryptedVerifier, iv: verifierIv } =
          await encryptData("VERIFIER_CHECK", derivedKey);

        const verifierBase64 = bufferToBase64(encryptedVerifier);
        const verifierFile = await StorageService.saveRawFile(verifierBase64);

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
          { title: "Welcome" },
        );
        loadItems(derivedKey);
      } catch (e: any) {
        setError("Setup failed: " + e.message);
      }
    },
    [userEmail],
  );

  const loadItems = async (currentKey: CryptoKey) => {
    try {
      const all = await getAllItems();
      const myItems = all.filter((i) => i.metadata?.owner === userEmail);

      setItems(myItems.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
      console.error("Failed to load items", e);
    }
  };

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
      loadItems(key);
    },
    [key, userEmail],
  );

  const addItemWithKey = async (
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
  };

  const removeItem = useCallback(
    async (id: string) => {
      await deleteItem(id);
      if (key) loadItems(key);
    },
    [key],
  );

  const decryptItemContent = useCallback(
    async (item: VaultItem) => {
      if (!key) throw new Error("Locked");

      let encryptedContent: Uint8Array;

      if (item.encryptedFilePath) {
        const base64 = await StorageService.readFile(item.encryptedFilePath);
        if (!base64) throw new Error("File not found or empty");
        encryptedContent = base64ToBuffer(base64);
      } else {
        throw new Error("Invalid item format");
      }

      if (item.type === "text" || item.type === "password") {
        return decryptString(encryptedContent, item.iv, key);
      } else {
        return decryptData(encryptedContent, item.iv, key);
      }
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
  };
};
