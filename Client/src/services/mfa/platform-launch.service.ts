import { Capacitor } from "@capacitor/core";

const isElectron = (): boolean => !!window.electron?.openExternal;

export const platformLaunchService = {
  async canOpenOtpAuthUri(uri: string): Promise<boolean> {
    if (!uri.startsWith("otpauth://")) return false;

    if (isElectron()) return true;

    if (Capacitor.getPlatform() === "android") {
      const appLauncher = (window as any)?.Capacitor?.Plugins?.AppLauncher;
      if (appLauncher?.canOpenUrl) {
        try {
          const result = await appLauncher.canOpenUrl({ url: uri });
          return !!result?.value;
        } catch {
          return false;
        }
      }
    }

    return false;
  },

  async openOtpAuthUri(uri: string): Promise<boolean> {
    if (!uri.startsWith("otpauth://")) return false;

    if (isElectron()) {
      try {
        return !!(await window.electron?.openExternal(uri));
      } catch {
        return false;
      }
    }

    if (Capacitor.getPlatform() === "android") {
      const appLauncher = (window as any)?.Capacitor?.Plugins?.AppLauncher;
      if (appLauncher?.openUrl) {
        try {
          await appLauncher.openUrl({ url: uri });
          return true;
        } catch {
          return false;
        }
      }
    }

    return false;
  },
};

