declare class CriticalSirenPlayer {
  playBursts(repeats?: number): Promise<void>;
  stop(): void;
}

declare global {
  const CriticalSirenPlayer: typeof CriticalSirenPlayer;
  interface Window {
    CriticalSirenPlayer: typeof CriticalSirenPlayer;
  }
}

export {};
