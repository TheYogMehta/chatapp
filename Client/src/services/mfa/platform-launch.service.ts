import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const isElectron = (): boolean => !!window.electron?.openExternal;
type UrlApi = {
  canOpenUrl?: (args: { url: string }) => Promise<{ value: boolean }>;
  openUrl?: (args: { url: string }) => Promise<unknown>;
};

const getUrlApi = (): UrlApi => {
  const appAny = App as unknown as UrlApi;
  const plugins = (window as any)?.Capacitor?.Plugins ?? {};
  return (
    (appAny && (appAny.canOpenUrl || appAny.openUrl) ? appAny : undefined) ||
    plugins.App ||
    plugins.AppLauncher ||
    {}
  );
};

export const platformLaunchService = {
  async canOpenOtpAuthUri(uri: string): Promise<boolean> {
    if (!uri.startsWith("otpauth://")) return false;

    if (isElectron()) return true;

    if (Capacitor.getPlatform() === "android") {
      const urlApi = getUrlApi();
      try {
        if (!urlApi.canOpenUrl) return false;
        const result = await urlApi.canOpenUrl({ url: uri });
        return !!result?.value;
      } catch {
        return false;
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
      const urlApi = getUrlApi();
      // Attempt 1: native bridge (App/AppLauncher)
      try {
        if (urlApi.openUrl) {
          await urlApi.openUrl({ url: uri });
          return true;
        }
      } catch {
        // continue to fallbacks
      }

      // Attempt 2: direct navigation from WebView.
      try {
        window.location.href = uri;
        return true;
      } catch {
        // continue to fallback
      }

      // Attempt 3: Android intent URI fallback for stubborn runtimes.
      try {
        const intentUrl = `intent://${uri.replace(
          /^otpauth:\/\//,
          "",
        )}#Intent;scheme=otpauth;action=android.intent.action.VIEW;end`;
        window.location.href = intentUrl;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  },
};
