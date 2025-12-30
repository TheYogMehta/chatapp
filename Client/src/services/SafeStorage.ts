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

async function decrypt(payload: string): Promise<string> {
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12) },
    key,
    raw.slice(12)
  );
  return new TextDecoder().decode(decrypted);
}

export async function setKeyFromSecureStorage(
  key: string,
  value: string
): Promise<void> {
  const p = await Platform();
  if (p === "android") {
    if (!isUnlockedAndroid) return;
    await SecureStoragePlugin.set({ key, value: await encrypt(value) });
  } else {
    await (window as any).SafeStorage.setKey(key, await encrypt(value));
  }
}

export async function getKeyFromSecureStorage(
  key: string
): Promise<string | null> {
  const p = await Platform();
  let encrypted: string | null = null;
  if (p === "android") {
    if (!isUnlockedAndroid && key !== "APP_LOCK_LEN") return null;
    encrypted = (await SecureStoragePlugin.get({ key })).value;
  } else {
    encrypted = await (window as any).SafeStorage.getKey(key);
  }
  return encrypted ? decrypt(encrypted) : null;
}

export async function AppLock(
  hashPass: string,
  oldHashpass: string | null
): Promise<any> {
  const p = await Platform();
  if (hashPass !== null) hashPass = await hashPin(hashPass);
  if (oldHashpass !== null) oldHashpass = await hashPin(oldHashpass);
  if (p === "android") {
    const stored = (await SecureStoragePlugin.get({ key: "APP_LOCK" })).value;
    if (
      !stored ||
      isUnlockedAndroid ||
      (oldHashpass && (await hashPin(oldHashpass)) === stored)
    ) {
      await SecureStoragePlugin.set({ key: "APP_LOCK", value: hashPass });
      await SecureStoragePlugin.set({ key: "APP_LOCK_ENABLED", value: "true" });
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
    (await SecureStoragePlugin.get({ key: "LOCKOUT_UNTIL" })).value || 0
  );
  if (now < lockoutUntil && PASS !== null)
    return {
      success: false,
      isLockedOut: true,
      remainingMs: lockoutUntil - now,
    };

  const MasterKey = (await SecureStoragePlugin.get({ key: "MASTER_KEY" }))
    ?.value;
  if (!MasterKey || MasterKey === "null") {
    isUnlockedAndroid = true;
    return { success: true, needsMasterKey: true };
  }

  const storedHash = (await SecureStoragePlugin.get({ key: "APP_LOCK" })).value;
  if (!storedHash || storedHash === "null") {
    isUnlockedAndroid = true;
    return { success: true, needsPin: true };
  }

  const isEnabled = (await SecureStoragePlugin.get({ key: "APP_LOCK_ENABLED" }))
    .value;
  if (isEnabled !== "true") {
    isUnlockedAndroid = true;
    return { success: true };
  }

  if (PASS === storedHash) {
    isUnlockedAndroid = true;
    await SecureStoragePlugin.set({ key: "FAILED_ATTEMPTS", value: "0" });
    return { success: true };
  } else if (PASS !== null) {
    const attempts =
      Number(
        (await SecureStoragePlugin.get({ key: "FAILED_ATTEMPTS" })).value || 0
      ) + 1;
    await SecureStoragePlugin.set({
      key: "FAILED_ATTEMPTS",
      value: String(attempts),
    });
    let cd =
      attempts >= 5
        ? 10800000
        : attempts >= 4
        ? 300000
        : attempts >= 3
        ? 30000
        : 0;
    if (cd > 0)
      await SecureStoragePlugin.set({
        key: "LOCKOUT_UNTIL",
        value: String(now + cd),
      });

    return { success: false, attempts, isLockedOut: cd > 0, remainingMs: cd };
  }
  return { success: false };
}

export async function ToggleAppLock(enabled: boolean) {
  const p = await Platform();
  const val = enabled ? "true" : "false";
  if (p === "android") {
    if (!isUnlockedAndroid) return;
    await SecureStoragePlugin.set({ key: "APP_LOCK_ENABLED", value: val });
  } else {
    await (window as any).SafeStorage.ToggleAppLock(enabled);
  }
}
