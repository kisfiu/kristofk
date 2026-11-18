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
