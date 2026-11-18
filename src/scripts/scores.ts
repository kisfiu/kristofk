// Game records (best times, statistics, options) in localStorage. Own try/catch instead of desktop.ts's
// `store`: private mode throws, and the game modules stay testable without the whole desktop.
export function load<T extends object>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v) return { ...structuredClone(fallback), ...JSON.parse(v) };
  } catch {}
  return structuredClone(fallback);
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Streak-aware win/loss record, as in XP's Statistics box. */
export interface Stats {
  won: number;
  lost: number;
  bestWins: number;
  bestLosses: number;
  /** > 0: wins in a row, < 0: losses in a row. */
  current: number;
}
export const NO_STATS: Stats = { won: 0, lost: 0, bestWins: 0, bestLosses: 0, current: 0 };
export function record(s: Stats, win: boolean): Stats {
  const current = win ? Math.max(0, s.current) + 1 : Math.min(0, s.current) - 1;
  return {
    won: s.won + (win ? 1 : 0),
    lost: s.lost + (win ? 0 : 1),
    current,
    bestWins: Math.max(s.bestWins, current),
    bestLosses: Math.max(s.bestLosses, -current),
  };
}
