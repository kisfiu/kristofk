// Reversi: the Windows XP Internet Reversi rules, and a minimax bot. Board: 64 cells, index = row * 8 + col, row 0 = rank 8.
export const EMPTY = 0,
  BLACK = 1,
  WHITE = 2;
export type Side = typeof BLACK | typeof WHITE;
export const other = (s: Side): Side => (s === BLACK ? WHITE : BLACK);

/** The standard start: White on d4 and e5, Black on d5 and e4. Black moves first. */
export function newBoard(): Uint8Array {
  const b = new Uint8Array(64);
  b[35] = b[28] = WHITE; // d4, e5
  b[27] = b[36] = BLACK; // d5, e4
  return b;
}

const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

/** Cells this move would flip (empty if the move is illegal). */
export function flips(b: Uint8Array, at: number, s: Side): number[] {
  if (b[at] !== EMPTY) return [];
  const out: number[] = [];
  for (const d of DIRS) {
    const line: number[] = [];
    let i = at;
    for (;;) {
      const col = i % 8;
      i += d;
      // stop at the board's edge, including wrapping round from one row to the next
      if (i < 0 || i > 63 || Math.abs((i % 8) - col) > 1) break;
      if (b[i] === other(s)) line.push(i);
      else {
        if (b[i] === s && line.length) out.push(...line);
        break;
      }
    }
  }
  return out;
}

export const moves = (b: Uint8Array, s: Side) => [...b.keys()].filter((i) => flips(b, i, s).length > 0);

/** Place a stone and flip; returns the new board, or null if illegal. */
export function play(b: Uint8Array, at: number, s: Side): Uint8Array | null {
  const f = flips(b, at, s);
  if (!f.length) return null;
  const n = b.slice();
  n[at] = s;
  for (const i of f) n[i] = s;
  return n;
}

export const count = (b: Uint8Array, s: Side) => b.reduce((n, v) => n + (v === s ? 1 : 0), 0);
/** Over when neither side can move. */
export const over = (b: Uint8Array) => !moves(b, BLACK).length && !moves(b, WHITE).length;
/** Who moves next: `s` if it can, else the other side (a forced pass), or null when the game is over. */
export const nextTurn = (b: Uint8Array, s: Side): Side | null =>
  moves(b, s).length ? s : moves(b, other(s)).length ? other(s) : null;

/* ---------- The bot: alpha-beta minimax on corners, edges and mobility ---------- */
// biome-ignore format: an 8×8 table reads best as a square
const WEIGHT = [
  100, -20, 10,  5,  5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
   10,  -2,  1,  1,  1,  1,  -2,  10,
    5,  -2,  1,  0,  0,  1,  -2,   5,
    5,  -2,  1,  0,  0,  1,  -2,   5,
   10,  -2,  1,  1,  1,  1,  -2,  10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10,  5,  5, 10, -20, 100,
];

function score(b: Uint8Array, s: Side) {
  if (over(b)) return (count(b, s) - count(b, other(s))) * 1000;
  let v = 0;
  for (let i = 0; i < 64; i++) v += b[i] === s ? WEIGHT[i] : b[i] === other(s) ? -WEIGHT[i] : 0;
  return v + 3 * (moves(b, s).length - moves(b, other(s)).length);
}

function search(b: Uint8Array, s: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const turn = nextTurn(b, s);
  if (depth === 0 || turn === null) return score(b, me);
  const mine = turn === me;
  let best = mine ? -Infinity : Infinity;
  for (const m of moves(b, turn)) {
    const v = search(play(b, m, turn)!, other(turn), me, depth - 1, alpha, beta);
    if (mine) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Skill 0 (Beginner) looks 1 move ahead, 1 (Intermediate) 3, 2 (Expert) 4. Returns a cell, or -1 to pass. */
export function botMove(b: Uint8Array, s: Side, skill: 0 | 1 | 2, rnd: () => number = Math.random): number {
  const list = moves(b, s);
  if (!list.length) return -1;
  // a Beginner sometimes just plays something
  if (skill === 0 && rnd() < 0.3) return list[Math.floor(rnd() * list.length)];
  const depth = [1, 3, 4][skill];
  let best = list[0];
  let bestV = -Infinity;
  for (const m of list) {
    const v = search(play(b, m, s)!, other(s), s, depth - 1, -Infinity, Infinity) + rnd() * 0.5;
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

export const cellName = (i: number) => `${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}`;
