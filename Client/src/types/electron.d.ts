export interface ElectronSafeStorage {
  AppLock: (hashPass: string, oldHashpass: string | null) => Promise<{ success: boolean }>;
  verifylock: (hashPass: string | null) => Promise<{ success: boolean; isLockedOut?: boolean; remainingMs?: number }>;
  getKey: (key: string) => Promise<string | null>;
  setKey: (key: string, value: string) => Promise<void>;
  ToggleAppLock: (enabled: boolean) => Promise<{ success: boolean }>;
  initlock: () => Promise<void>;
  googleLogin: () => Promise<{ accessToken: string; idToken: string } | null>;
}

declare global {
interface ElectronBridge {
  getDesktopSources: () => Promise<
    Array<{ id: string; name: string; thumbnail: string }>
  >;
  openExternal: (url: string) => Promise<boolean>;
}

  interface Window {
    SafeStorage: ElectronSafeStorage;
    electron?: ElectronBridge;
  }
}
