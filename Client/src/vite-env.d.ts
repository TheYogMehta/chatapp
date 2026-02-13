/// <reference types="vite/client" />

interface Window {
  electron?: {
    getDesktopSources: () => Promise<any[]>;
    openExternal: (url: string) => Promise<boolean>;
  };
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
