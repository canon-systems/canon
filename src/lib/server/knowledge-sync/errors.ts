export class SyncStoppedError extends Error {
  phase: string;

  constructor(phase: string) {
    super(`Sync stopped during ${phase}`);
    this.name = 'SyncStoppedError';
    this.phase = phase;
  }
}
