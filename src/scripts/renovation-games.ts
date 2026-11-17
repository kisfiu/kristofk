// Pure rules of the Renovator XP mini-games. Positions are in wall cells (32×20), times in ms.
import { COLS, GH, GW, MARK, OPEN, ROWS } from "./renovation-logic";

/* ---------- Knock-sweeper (Minesweeper-like wall check) ---------- */

export function neighbours(c: number) {
  const x = c % GW;
  const y = Math.floor(c / GW);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < GW && ny >= 0 && ny < GH) out.push(ny * GW + nx);
    }
  return out;
}

export const hollowAround = (hollow: Uint8Array, c: number) => neighbours(c).filter((n) => hollow[n]).length;

/** Knock a sound cell open; a 0 opens its whole area, like Minesweeper. */
export function reveal(hollow: Uint8Array, known: Uint8Array, c: number) {
  const todo = [c];
  while (todo.length) {
    const n = todo.pop()!;
    if (known[n] || hollow[n]) continue;
    known[n] = OPEN;
    if (hollowAround(hollow, n) === 0) todo.push(...neighbours(n));
  }
}

/** A sound cell with no hollow neighbours to start from, so the first knock is never blind. */
export function firstOpen(hollow: Uint8Array, rnd: () => number) {
  const zeros = [...hollow.keys()].filter((c) => !hollow[c] && hollowAround(hollow, c) === 0);
  return zeros[Math.floor(rnd() * zeros.length)];
}

/** Done when the marks are exactly the hollow cells, or (like the original) every solid cell has been knocked open. */
export const sweeperDone = (hollow: Uint8Array, known: Uint8Array) =>
  hollow.every((h, c) => (h ? known[c] === MARK : known[c] !== MARK)) || hollow.every((h, c) => h || known[c] === OPEN);

/* ---------- Timing bar (hard plaster) ---------- */

/** Needle position 0..1, bouncing end to end; `speed` = sweeps per second. */
export const needle = (t: number, speed: number) => {
  const p = ((t / 1000) * speed) % 2;
  return p < 1 ? p : 2 - p;
};
export const timingZone = (pos: number) => {
  const d = Math.abs(pos - 0.5);
  return d < 0.08 ? "green" : d < 0.2 ? "yellow" : "red";
};

/* ---------- Steady hand (putty) ---------- */

export const STRIPS = 5;
export const BAND = 1;
/** Centre of the wavy guide for a strip at wall column x. */
export const guideY = (strip: number, x: number, phase = 0) =>
  strip * (ROWS / STRIPS) + ROWS / STRIPS / 2 + Math.sin(x * 0.45 + phase + strip) * 1.1;
/** Lumps left by a strip, from the share of the drag spent outside the guide band. */
export const lumps = (outside: number) => (outside > 0.4 ? 3 : outside > 0.2 ? 2 : outside > 0.05 ? 1 : 0);

/* ---------- Peel the paint (scraper) ---------- */

/** The old paint comes off in 2-row strips; each is peeled from its curled edge, alternating left and right. */
export interface PaintStrip {
  row: number;
  dir: 1 | -1;
  /** Cells already peeled, counted from the starting edge. */
  done: number;
}
export const paintStrips = (): PaintStrip[] =>
  Array.from({ length: ROWS / 2 }, (_, i) => ({ row: i * 2, dir: i % 2 ? -1 : 1, done: 0 }));
/** x of the curled edge you grab. */
export const edgeX = (s: PaintStrip) => (s.dir === 1 ? s.done : COLS - s.done);
export const stripMid = (s: PaintStrip) => s.row + 1;
export const grabs = (s: PaintStrip, x: number, y: number) =>
  s.done < COLS && Math.abs(x - edgeX(s)) < 2.5 && Math.abs(y - stripMid(s)) < 1.5;
/** Drag a grabbed strip to x: it peels up to there. Where the pointer is vertically doesn't matter. */
export function peel(s: PaintStrip, x: number): "peel" | "done" {
  s.done = Math.min(COLS, Math.max(s.done, s.dir === 1 ? x : COLS - x));
  return s.done >= COLS ? "done" : "peel";
}

/* ---------- Roller (primer and paint) ---------- */

/** Roller paint used per wall cell rolled; a full roller covers about three strips. */
export const LOAD_PER_CELL = 0.017;
/** Faster than this (cells per ms) and the paint drips. */
export const DRIP_SPEED = 0.05;
export function rollerMove(load: number, dist: number, ms: number) {
  return {
    load: Math.max(0, load - dist * LOAD_PER_CELL),
    paints: load > 0,
    drip: load > 0 && ms > 0 && dist / ms > DRIP_SPEED,
  };
}

/* ---------- Targets: flakes, chisel, dust, soak and bumps all share these ---------- */

export interface Target {
  x: number;
  y: number;
  hp: number;
  /** When it appears and how long it stays (ms); Infinity = until the game ends. */
  born: number;
  life: number;
  vx: number;
  vy: number;
  /** Coarse cell for cell targets (chisel, soak): hits count anywhere inside it. */
  cell?: number;
}

const target = (x: number, y: number, extra: Partial<Target> = {}): Target => ({
  x,
  y,
  hp: 1,
  born: 0,
  life: Number.POSITIVE_INFINITY,
  vx: 0,
  vy: 0,
  ...extra,
});

/** One target per hollow coarse cell. */
export const cellTargets = (hollow: Uint8Array, hp: number) =>
  [...hollow.keys()]
    .filter((c) => hollow[c])
    .map((c) => target((c % GW) * 2 + 1, Math.floor(c / GW) * 2 + 1, { hp, cell: c }));

/** Dust clouds that drift around the wall. */
export const dust = (rnd: () => number, hollow: Uint8Array, n = 10) => {
  const cells = cellTargets(hollow, 1);
  return Array.from({ length: n }, (_, i) => {
    const c = cells[i % cells.length];
    const a = rnd() * Math.PI * 2;
    return target(c.x, c.y, { vx: Math.cos(a) * 0.004, vy: Math.sin(a) * 0.004 });
  });
};

/** Bumps to sand: a few always, plus the lumps left by sloppy plaster and putty. */
export const bumps = (rnd: () => number, extra: number) =>
  Array.from({ length: 4 + extra }, () => target(2 + rnd() * (COLS - 4), 2 + rnd() * (ROWS - 4)));

export const alive = (t: Target, now: number) => t.hp > 0 && now >= t.born && now < t.born + t.life;

/** Drifting targets bounce off the wall edges. */
export function drift(t: Target, dt: number) {
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  if (t.x < 1 || t.x > COLS - 1) t.vx = -t.vx;
  if (t.y < 1 || t.y > ROWS - 1) t.vy = -t.vy;
  t.x = Math.min(COLS - 1, Math.max(1, t.x));
  t.y = Math.min(ROWS - 1, Math.max(1, t.y));
}

/** Is (x,y) on the target? Cell targets use their 2×2 square, others a circle. */
export const touches = (t: Target, x: number, y: number, radius: number) =>
  t.cell !== undefined
    ? Math.floor(x / 2) === t.cell % GW && Math.floor(y / 2) === Math.floor(t.cell / GW)
    : Math.hypot(t.x - x, t.y - y) <= radius;
