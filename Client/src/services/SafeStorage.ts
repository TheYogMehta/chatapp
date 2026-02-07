import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { Device } from "@capacitor/device";

let cachedKey: CryptoKey | null = null;
let isUnlockedAndroid = true;

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

export async function hashPin(pin: string): Promise<string> {
  return hashIdentifier(pin);
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

async function encrypt(value: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  const chunks = [];
  const chunkSize = 32768;
  for (let i = 0; i < combined.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...combined.slice(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

async function decrypt(payload: string): Promise<string | null> {
  try {
    const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const key = await getCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      key,
      raw.slice(12),
    );
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
      await SecureStoragePlugin.set({ key, value: await encrypt(value) });
    } else {
      await (window as any).SafeStorage.setKey(key, await encrypt(value));
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
    return encrypted ? decrypt(encrypted) : null;
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
