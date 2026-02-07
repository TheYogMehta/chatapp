import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { Device } from "@capacitor/device";
import {
  encryptToPackedString,
  decryptFromPackedString,
} from "../utils/crypto";

let cachedKey: CryptoKey | null = null;
const isUnlockedAndroid = true;

export async function Platform(): Promise<string> {
  const info = await Device.getInfo();
  return info.platform;
}

export async function hashIdentifier(identifier: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(identifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const id = (await Device.getId()).identifier;
  console.log("[SafeStorage] Using Device ID for Encryption:", id);
  const rawKey = new TextEncoder().encode(id).slice(0, 32);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export async function encryptData(value: string): Promise<string> {
  const key = await getCryptoKey();
  return encryptToPackedString(value, key);
}

export async function decryptData(payload: string): Promise<string | null> {
  try {
    const key = await getCryptoKey();
    const decrypted = await decryptFromPackedString(payload, key);
    if (!decrypted) return null;
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[SafeStorage] Decryption failed:", e);
    return null;
  }
}

export async function setKeyFromSecureStorage(
  key: string,
  value: string,
  init: boolean = false,
): Promise<void> {
  try {
    const p = await Platform();
    if (p === "android") {
      if (!isUnlockedAndroid && !init) return;
      await SecureStoragePlugin.set({ key, value: await encryptData(value) });
    } else {
      const encrypted = await encryptData(value);
      console.log(
        `[SafeStorage] Setting key ${key}, encrypted size: ${encrypted.length}`,
      );
      await (window as any).SafeStorage.setKey(key, encrypted);
    }
  } catch (e) {
    console.error("Error setting key in secure storage:", e);
  }
}

export async function getKeyFromSecureStorage(
  key: string,
  init: boolean = false,
): Promise<string | null> {
  try {
    const p = await Platform();
    let encrypted: string | null = null;
    if (p === "android") {
      if (!isUnlockedAndroid && key !== "APP_LOCK_LEN" && !init) return null;
      encrypted = (await SecureStoragePlugin.get({ key })).value;
    } else {
      encrypted = await (window as any).SafeStorage.getKey(key);
    }
    return encrypted ? decryptData(encrypted) : null;
  } catch (e: any) {
    console.error("Error getting key from secure storage:", JSON.stringify(e));
    return null;
  }
}

export async function setActiveUser(identifier: string | null): Promise<void> {
  const p = await Platform();
  let hash: string | null = null;
  if (identifier) {
    hash = await hashIdentifier(identifier);
  }

  if (p !== "android") {
    await (window as any).SafeStorage.SetActiveUser(hash);
  }
}
