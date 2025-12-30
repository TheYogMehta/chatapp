require("./rt/electron-rt");
//////////////////////////////
// User Defined Preload scripts below
import { contextBridge } from "electron";
import keytar from "keytar";

let isUnlocked = false;

async function getStoredLockout() {
  const until = await keytar.getPassword("ChatApp", "LOCKOUT_UNTIL");
  return until ? parseInt(until, 10) : 0;
}

contextBridge.exposeInMainWorld("SafeStorage", {
  verifylock: async (hashPass: string | null) => {
    if (isUnlocked)
      return {
        success: true,
      };
    const isNull = hashPass === null || hashPass === "null" || hashPass === "";
    const now = Date.now();
    const storedLockout = await getStoredLockout();

    if (now < storedLockout && !isNull) {
      return {
        success: false,
        isLockedOut: true,
        remainingMs: storedLockout - now,
      };
    }

    const MasterKey = await keytar.getPassword("ChatApp", "MASTER_KEY");
    if (!MasterKey || MasterKey === "null") {
      isUnlocked = true;
      return { success: true, needsMasterKey: true };
    }

    const storedHash = await keytar.getPassword("ChatApp", "APP_LOCK");
    if (!storedHash) {
      isUnlocked = true;
      return { success: true, needsPin: true };
    }

    const AppLockActive = await keytar.getPassword(
      "ChatApp",
      "APP_LOCK_ENABLED"
    );

    if (AppLockActive !== "true") {
      isUnlocked = true;
      return { success: true };
    }

    if (hashPass === storedHash) {
      isUnlocked = true;
      await keytar.deletePassword("ChatApp", "FAILED_ATTEMPTS");
      await keytar.deletePassword("ChatApp", "LOCKOUT_UNTIL");
      return { success: true };
    } else if (!isNull) {
      const failedStr = await keytar.getPassword("ChatApp", "FAILED_ATTEMPTS");
      const attempts = (failedStr ? parseInt(failedStr, 10) : 0) + 1;
      await keytar.setPassword(
        "ChatApp",
        "FAILED_ATTEMPTS",
        attempts.toString()
      );

      let cooldownMs = 0;
      if (attempts === 3) cooldownMs = 30 * 1000; // 30s
      else if (attempts === 4) cooldownMs = 300 * 1000; // 5m
      else if (attempts >= 5) cooldownMs = 3 * 60 * 60 * 1000; // 3h

      if (cooldownMs > 0) {
        const lockUntil = now + cooldownMs;
        await keytar.setPassword(
          "ChatApp",
          "LOCKOUT_UNTIL",
          lockUntil.toString()
        );
        return { success: false, isLockedOut: true, remainingMs: cooldownMs };
      }
      return { success: false, isLockedOut: false, attempts };
    }
    return { success: false };
  },
  AppLock: async (hashPass: string, oldHashpass: string | null) => {
    const storedHash = await keytar.getPassword("ChatApp", "APP_LOCK");
    if (!storedHash) {
      await keytar.setPassword("ChatApp", "APP_LOCK", hashPass);
      await keytar.setPassword("ChatApp", "APP_LOCK_ENABLED", "true");
      return { success: true };
    }

    if (isUnlocked || (oldHashpass && oldHashpass === storedHash)) {
      await keytar.setPassword("ChatApp", "APP_LOCK", hashPass);
      return { success: true };
    }

    return { success: false, message: "Unauthorized" };
  },
  ToggleAppLock: async (enabled: boolean) => {
    if (!isUnlocked) return { success: false };
    await keytar.setPassword("ChatApp", "APP_LOCK_ENABLED", enabled.toString());
    return { success: true };
  },
  setKey: async (key: string, value: string) => {
    if (!isUnlocked) return null;
    keytar.setPassword("ChatApp", key, value);
  },
  getKey: async (key: string) => {
    if (!isUnlocked && key !== "APP_LOCK_LEN") return null;
    return keytar.getPassword("ChatApp", key);
  },
  // For Development Purpose
  deleteKey: async (key: string) => await keytar.deletePassword("ChatApp", key),
  findall: async () => await keytar.findCredentials("ChatApp"),
});
