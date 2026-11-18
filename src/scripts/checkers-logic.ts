// Checkers: the XP Internet Checkers rules (American checkers) and a minimax bot. Pure, no DOM.
// Board: 64 cells, index = row * 8 + col, row 0 at the top; only dark squares ((row + col) odd) are used.
// Red starts at the bottom (rows 5–7) and moves up; White starts at the top and moves down. Red moves first.
export const RED = 1,
  WHITE = 2;
export type Side = typeof RED | typeof WHITE;
/** A cell: 0 empty, otherwise side + (king ? 2 : 0): 1 red man, 2 white man, 3 red king, 4 white king. */
export const sideOf = (v: number): Side | 0 => (v ? ((((v - 1) % 2) + 1) as Side) : 0);
export const isKing = (v: number) => v > 2;
export const other = (s: Side): Side => (s === RED ? WHITE : RED);

export interface Move {
  /** Squares visited: the start, then every landing square. */
  path: number[];
  captured: number[];
}

export function newBoard(): Uint8Array {
  const b = new Uint8Array(64);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) if ((r + c) % 2) b[r * 8 + c] = r < 3 ? WHITE : r > 4 ? RED : 0;
  return b;
}

const rc = (i: number) => [Math.floor(i / 8), i % 8];
const at = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
/** Forward is up for Red, down for White; kings go both ways. */
const dirs = (v: number) => {
  const fwd = sideOf(v) === RED ? -1 : 1;
  return isKing(v)
    ? [-1, 1].flatMap((dr) => [
        [dr, -1],
        [dr, 1],
      ])
    : [
        [fwd, -1],
        [fwd, 1],
      ];
};
const crowns = (v: number, i: number) => !isKing(v) && Math.floor(i / 8) === (sideOf(v) === RED ? 0 : 7);

/** Every jump sequence from `from`, followed to its end (a man that gets crowned stops there, as in American checkers). */
function jumps(b: Uint8Array, from: number, v: number, path: number[], captured: number[], out: Move[]) {
  const [r, c] = rc(path[path.length - 1]);
  let more = false;
  for (const [dr, dc] of dirs(v)) {
    const over = at(r + dr, c + dc);
    const land = at(r + 2 * dr, c + 2 * dc);
    if (over < 0 || land < 0 || captured.includes(over)) continue;
    if (sideOf(b[over]) !== other(sideOf(v) as Side) || (b[land] && land !== from)) continue;
    more = true;
    const next = [...path, land];
    if (crowns(v, land)) out.push({ path: next, captured: [...captured, over] });
    else jumps(b, from, v, next, [...captured, over], out);
  }
  if (!more && captured.length) out.push({ path, captured });
}

/** Legal moves for a side: if any capture is possible, only captures (and they must be finished). */
export function moves(b: Uint8Array, s: Side): Move[] {
  const caps: Move[] = [];
  const steps: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (sideOf(b[i]) !== s) continue;
    jumps(b, i, b[i], [i], [], caps);
    const [r, c] = rc(i);
    for (const [dr, dc] of dirs(b[i])) {
      const to = at(r + dr, c + dc);
      if (to >= 0 && !b[to]) steps.push({ path: [i, to], captured: [] });
    }
  }
  return caps.length ? caps : steps;
}

export function play(b: Uint8Array, m: Move): Uint8Array {
  const n = b.slice();
  const from = m.path[0];
  const to = m.path[m.path.length - 1];
  let v = n[from];
  n[from] = 0;
  for (const x of m.captured) n[x] = 0;
  if (crowns(v, to)) v += 2;
  n[to] = v;
  return n;
}

/** You lose when you have no pieces or no legal move. */
export const lost = (b: Uint8Array, s: Side) => moves(b, s).length === 0;

/* ---------- The bot ---------- */
function score(b: Uint8Array, s: Side) {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const side = sideOf(b[i]);
    if (!side) continue;
    const [r, c] = rc(i);
    const advance = side === RED ? 7 - r : r;
    const val = isKing(b[i]) ? 160 : 100 + advance * 3 + (c > 1 && c < 6 ? 2 : 0);
    v += side === s ? val : -val;
  }
  return v;
}

function search(b: Uint8Array, turn: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const list = moves(b, turn);
  if (!list.length) return turn === me ? -10_000 - depth : 10_000 + depth;
  if (depth === 0) return score(b, me);
  let best = turn === me ? -Infinity : Infinity;
  for (const m of list) {
    const v = search(play(b, m), other(turn), me, depth - 1, alpha, beta);
    if (turn === me) {
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

/** Skill 0 looks 2 plies ahead (and sometimes plays loosely), 1 looks 4, 2 looks 6. */
export function botMove(b: Uint8Array, s: Side, skill: 0 | 1 | 2, rnd: () => number = Math.random): Move | null {
  const list = moves(b, s);
  if (!list.length) return null;
  if (skill === 0 && rnd() < 0.3) return list[Math.floor(rnd() * list.length)];
  const depth = [2, 4, 6][skill];
  let best = list[0];
  let bestV = -Infinity;
  for (const m of list) {
    const v = search(play(b, m), other(s), s, depth - 1, -Infinity, Infinity) + rnd();
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

/** The bot takes a draw when it isn't ahead. */
export const acceptsDraw = (b: Uint8Array, s: Side) => score(b, s) <= 0;
