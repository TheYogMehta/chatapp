import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { Device } from "@capacitor/device";

let cachedKey: CryptoKey | null = null;
let isUnlockedAndroid = false;

export async function Platform(): Promise<string> {
  const info = await Device.getInfo();
  return info.platform;
}

export async function hashPin(pin: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const id = (await Device.getId()).identifier;
  const rawKey = new TextEncoder().encode(id).slice(0, 32);
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

async function decrypt(payload: string): Promise<string | null> {
  try {
    const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const key = await getCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      key,
      raw.slice(12)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function setKeyFromSecureStorage(
  key: string,
  value: string,
  init: boolean = false
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
  init: boolean = false
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
    // Suppress error if key doesn't exist (common on first run)
    if (
      e?.message?.includes('Item with given key does not exist') ||
      e?.toString().includes('Item with given key does not exist')
    ) {
      return null;
    }
    console.error("Error getting key from secure storage:", e);
    return null;
  }
}

export async function AppLock(
  hashPass: string,
  oldHashpass: string | null
): Promise<any> {
  const p = await Platform();
  if (hashPass !== null) hashPass = await hashPin(hashPass);
  if (oldHashpass !== null) oldHashpass = await hashPin(oldHashpass);
  if (p === "android") {
    const stored = await getKeyFromSecureStorage("APP_LOCK", true);
    if (
      !stored ||
      isUnlockedAndroid ||
      (oldHashpass && oldHashpass === stored)
    ) {
      await setKeyFromSecureStorage("APP_LOCK", hashPass, true);
      await setKeyFromSecureStorage("APP_LOCK_ENABLED", "true", true);
      isUnlockedAndroid = true;
      return { success: true };
    }
    return { success: false };
  }
  return await (window as any).SafeStorage.AppLock(hashPass, oldHashpass);
}

export async function AppLockVerify(PASS: string | null): Promise<any> {
  const p = await Platform();
  if (PASS !== null) PASS = await hashPin(PASS);
  if (p !== "android")
    return await (window as any).SafeStorage.verifylock(PASS);

  if (isUnlockedAndroid)
    return {
      success: true,
    };
  const now = Date.now();

  const lockoutUntil = Number(
    (await getKeyFromSecureStorage("LOCKOUT_UNTIL", true)) || 0
  );
  if (now < lockoutUntil && PASS !== null)
    return {
      success: false,
      isLockedOut: true,
      remainingMs: lockoutUntil - now,
    };

  const MasterKey = await getKeyFromSecureStorage("MASTER_KEY", true);
  if (!MasterKey) {
    isUnlockedAndroid = true;
    return { success: true, needsMasterKey: true };
  }

  const storedHash = await getKeyFromSecureStorage("APP_LOCK", true);
  if (!storedHash || storedHash === "null") {
    isUnlockedAndroid = true;
    return { success: true, needsPin: true };
  }

  const isEnabled = await getKeyFromSecureStorage("APP_LOCK_ENABLED", true);
  if (isEnabled !== "true") {
    isUnlockedAndroid = true;
    return { success: true };
  }

  if (PASS === storedHash) {
    isUnlockedAndroid = true;
    await setKeyFromSecureStorage("FAILED_ATTEMPTS", "0", true);
    return { success: true };
  } else if (PASS !== null) {
    let attempts = Number(
      (await getKeyFromSecureStorage("FAILED_ATTEMPTS", true)) || 0
    );
    attempts += 1;
    await setKeyFromSecureStorage("FAILED_ATTEMPTS", String(attempts), true);
    let cd =
      attempts >= 5
        ? 10800000
        : attempts >= 4
        ? 300000
        : attempts >= 3
        ? 30000
        : 0;
    if (cd > 0) {
      await setKeyFromSecureStorage("LOCKOUT_UNTIL", String(now + cd), true);
    }

    return { success: false, attempts, isLockedOut: cd > 0, remainingMs: cd };
  }
  return { success: false };
}

export async function ToggleAppLock(enabled: boolean) {
  const p = await Platform();
  const val = enabled ? "true" : "false";
  if (p === "android") {
    if (!isUnlockedAndroid) return;
    await setKeyFromSecureStorage("APP_LOCK_ENABLED", val);
  } else {
    await (window as any).SafeStorage.ToggleAppLock(enabled);
  }
}

export async function initlock() {
  const p = await Platform();
  if (p === "android") {
    isUnlockedAndroid = false;
  } else {
    return await (window as any).SafeStorage.initlock();
  }
}
