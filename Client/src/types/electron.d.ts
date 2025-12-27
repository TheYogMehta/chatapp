export interface IElectronAPI {
  saveKey: (key: string) => Promise<boolean>;
  getKey: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
