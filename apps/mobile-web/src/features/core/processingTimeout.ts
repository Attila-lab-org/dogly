/** Tetto polling analisi: oltre 10 minuti mostriamo un errore onesto. */
export const ANALYSIS_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function analysisPollIntervalMs(updateCount: number): number {
  if (updateCount < 5) return 1_000;
  if (updateCount < 12) return 2_000;
  return 5_000;
}
