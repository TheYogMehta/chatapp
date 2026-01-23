import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from "@capacitor-community/electron";
import type { MenuItemConstructorOptions } from "electron";
import { app, MenuItem, ipcMain, session } from "electron";
import electronIsDev from "electron-is-dev";
import unhandled from "electron-unhandled";
import { autoUpdater } from "electron-updater";
import keytar from "keytar";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
} from "./setup";

// Graceful handling of unhandled errors.
unhandled();

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({ label: "Quit App", role: "quit" }),
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
  { role: "viewMenu" },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig =
  getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol:
      capacitorFileConfig.electron.deepLinkingCustomProtocol ??
      "mycapacitorapp",
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Applicationapp
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  // Check for updates if we are in a packaged app.
  // autoUpdater.checkForUpdatesAndNotify();
  // Handle permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ["media", "mediaKeySystem", "display-capture", "notifications", "clipboard-read", "clipboard-write"];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on("window-all-closed", function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on("activate", async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

// Place all ipc or other electron api calls and custom functionality under this line
let isUnlocked = false;

async function getStoredLockout() {
  const until = await keytar.getPassword("ChatApp", "LOCKOUT_UNTIL");
  return until ? parseInt(until, 10) : 0;
}

ipcMain.handle(
  "SafeStorage:verifylock",
  async (_event, hashPass: string | null) => {
    if (isUnlocked) return { success: true };
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
      else if (attempts === 4) cooldownMs = 5 * 60 * 1000; // 5m
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
  }
);

ipcMain.handle("SafeStorage:getKey", async (_event, key: string) => {
  if (!isUnlocked && key !== "APP_LOCK_LEN") return null;
  return keytar.getPassword("ChatApp", key);
});

ipcMain.handle(
  "SafeStorage:setKey",
  async (_event, key: string, value: string) => {
    if (!isUnlocked) return null;
    return keytar.setPassword("ChatApp", key, value);
  }
);

ipcMain.handle(
  "SafeStorage:ToggleAppLock",
  async (_event, enabled: boolean) => {
    if (!isUnlocked) return { success: false };
    await keytar.setPassword("ChatApp", "APP_LOCK_ENABLED", enabled.toString());
    return { success: true };
  }
);

ipcMain.handle("SafeStorage:initlock", async () => {
  isUnlocked = false;
});

ipcMain.handle(
  "SafeStorage:AppLock",
  async (_event, hashPass: string, oldHashpass: string | null) => {
    const stored = await keytar.getPassword("ChatApp", "APP_LOCK");
    if (
      !stored ||
      isUnlocked ||
      (oldHashpass && stored && oldHashpass === stored)
    ) {
      await keytar.setPassword("ChatApp", "APP_LOCK", hashPass);
      await keytar.setPassword("ChatApp", "APP_LOCK_ENABLED", "true");
      isUnlocked = true;
      return { success: true };
    }
    return { success: false };
  }
);
