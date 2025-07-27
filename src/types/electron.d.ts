// src/types/electron.d.ts
export {};

declare global {
  interface Window {
    electronAPI?: {
      getTradingPairs: () => Promise<any>;
    };
  }
}
