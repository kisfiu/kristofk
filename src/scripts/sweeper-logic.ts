// Wall Sweeper: the Windows XP Minesweeper rules, exactly (checked against a rebuild of winmine.exe).
// Mines are "hollow spots" in the plaster; the words differ, the rules don't.

export const LEVELS = {
  beginner: { w: 9, h: 9, mines: 10 },
  intermediate: { w: 16, h: 16, mines: 40 },
  expert: { w: 30, h: 16, mines: 99 },
} as const;
export type Level = keyof typeof LEVELS | "custom";

/** A level name read back from storage: only the real ones (`in` would also accept "toString"). */
export const isLevel = (l: unknown): l is Level =>
  l === "custom" || (typeof l === "string" && Object.hasOwn(LEVELS, l));
/** A best time read back from storage: a number of seconds and a name. */
export const isRecord = (r: unknown): r is { t: number; name: string } =>
  typeof (r as { t?: unknown } | null)?.t === "number" && typeof (r as { name?: unknown }).name === "string";

/** XP's Custom Field limits; out-of-range values are clamped without a message. */
export function clampCustom(h: number, w: number, mines: number) {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v) || lo));
  h = c(h, 9, 24);
  w = c(w, 9, 30);
  return { h, w, mines: c(mines, 10, Math.min((h - 1) * (w - 1), 999)) };
}

export const HIDDEN = 0,
  OPEN = 1,
  FLAG = 2,
  QUESTION = 3;

export interface Board {
  w: number;
  h: number;
  mines: number;
  mine: Uint8Array;
  state: Uint8Array;
  opened: number;
  status: "ready" | "play" | "won" | "lost";
  /** The spot that went off, -1 if none. */
  boom: number;
}

export function newBoard(w: number, h: number, mines: number, rnd: () => number = Math.random): Board {
  const mine = new Uint8Array(w * h);
  for (let n = 0; n < mines; ) {
    const i = Math.floor(rnd() * w * h);
    if (mine[i]) continue;
    mine[i] = 1;
    n++;
  }
  return { w, h, mines, mine, state: new Uint8Array(w * h), opened: 0, status: "ready", boom: -1 };
}

export function neighbours(b: Board, i: number) {
  const x = i % b.w;
  const y = Math.floor(i / b.w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < b.w && ny >= 0 && ny < b.h) out.push(ny * b.w + nx);
    }
  return out;
}

export const count = (b: Board, i: number) => neighbours(b, i).filter((n) => b.mine[n]).length;
export const flags = (b: Board) => b.state.reduce((s, v) => s + (v === FLAG ? 1 : 0), 0);
/** The mine counter: spots minus flags, may go negative. */
export const minesLeft = (b: Board) => b.mines - flags(b);
const over = (b: Board) => b.status === "won" || b.status === "lost";

/** XP moves a first-click mine to the first free cell scanning rows from the top-left, skipping the last row and column. */
function moveFirstMine(b: Board, i: number) {
  for (let y = 0; y < b.h - 1; y++)
    for (let x = 0; x < b.w - 1; x++) {
      const j = y * b.w + x;
      if (b.mine[j]) continue;
      b.mine[j] = 1;
      b.mine[i] = 0;
      return;
    }
}

/** Open a cell (left-click release). Flagged cells never open, "?" cells do. A 0 floods its neighbours. */
export function open(b: Board, i: number) {
  if (over(b) || b.state[i] === OPEN || b.state[i] === FLAG) return;
  if (b.opened === 0 && b.mine[i]) moveFirstMine(b, i);
  b.status = "play";
  if (b.mine[i]) {
    b.status = "lost";
    b.boom = i;
    return;
  }
  const todo = [i];
  while (todo.length) {
    const n = todo.pop()!;
    if (b.state[n] === OPEN || b.state[n] === FLAG || b.mine[n]) continue;
    b.state[n] = OPEN;
    b.opened++;
    if (count(b, n) === 0) todo.push(...neighbours(b, n));
  }
  if (b.opened === b.w * b.h - b.mines) {
    b.status = "won";
    for (let c = 0; c < b.mine.length; c++) if (b.mine[c]) b.state[c] = FLAG;
  }
}

/** Right-click: blank → flag → ? (only with Marks on) → blank. */
export function cycleMark(b: Board, i: number, marks: boolean) {
  if (over(b) || b.state[i] === OPEN) return;
  b.state[i] = b.state[i] === HIDDEN ? FLAG : b.state[i] === FLAG && marks ? QUESTION : HIDDEN;
}

/** Both buttons on an open number: when its flags match, open every unflagged neighbour (a wrong flag loses). */
export function chord(b: Board, i: number) {
  if (over(b) || b.state[i] !== OPEN) return;
  const around = neighbours(b, i);
  if (around.filter((n) => b.state[n] === FLAG).length !== count(b, i)) return;
  for (const n of around) if (b.state[n] !== FLAG && b.state[n] !== OPEN) open(b, n);
}
