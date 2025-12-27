import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { Device } from "@capacitor/device";

let cachedKey: CryptoKey | null = null;

export async function Platform(): Promise<string> {
  const info = await Device.getInfo();
  return info.platform;
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const deviceId = (await Device.getId()).identifier;
  const rawKey = new TextEncoder().encode(deviceId).slice(0, 32);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

async function encrypt(value: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(payload: string): Promise<string> {
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);

  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

export async function setKeyFromSecureStorage(
  key: string,
  value: string
): Promise<void> {
  const platform = await Platform();
  const encrypted = await encrypt(value);

  if (platform === "android") {
    await SecureStoragePlugin.set({ key, value: encrypted });
  } else if ((window as any).electronAPI) {
    await (window as any).electronAPI.saveKey(key, encrypted);
  }
}

export async function getKeyFromSecureStorage(
  key: string
): Promise<string | null> {
  try {
    const platform = await Platform();
    let encrypted: string | null = null;

    if (platform === "android") {
      const res = await SecureStoragePlugin.get({ key });
      encrypted = res?.value ?? null;
    } else if ((window as any).electronAPI) {
      encrypted = await (window as any).electronAPI.getKey(key);
    }

    if (!encrypted) return null;
    return decrypt(encrypted);
  } catch (error) {
    return null;
  }
}
