// Backgammon: the XP Internet Backgammon rules, the doubling cube, a 5-point match and a bot. Pure, no DOM.
// A position holds both sides, each counted from its own side: index 1–24 are its points (24 farthest from
// home, 1–6 its home board), 25 its bar, 0 its stones borne off. Your point i is the opponent's point 25 − i.
export const WHITE = 0,
  BROWN = 1;
export type Side = typeof WHITE | typeof BROWN;
export type Pos = [number[], number[]];
/** One die's move: from a point (25 = the bar) to a point (0 = borne off). */
export interface Step {
  from: number;
  to: number;
  die: number;
}
export interface Play {
  steps: Step[];
  pos: Pos;
}

export const other = (s: Side): Side => (s === WHITE ? BROWN : WHITE);
export const BAR = 25;
export const OFF = 0;

/** The standard start: two on your 24, five on 13, three on 8, five on 6. */
export function newPos(): Pos {
  const side = () => {
    const p = new Array(26).fill(0);
    p[24] = 2;
    p[13] = 5;
    p[8] = 3;
    p[6] = 5;
    return p;
  };
  return [side(), side()];
}

export const pips = (pos: Pos, s: Side) => pos[s].reduce((t, n, i) => t + n * i, 0);
const key = (pos: Pos) => `${pos[0].join()}|${pos[1].join()}`;
/** All your stones are in your home board (or off), so you may bear off. */
const home = (p: number[]) => p.slice(7).every((n) => n === 0);

/** Single legal steps for one die, ignoring what the other dice can still do. */
export function steps(pos: Pos, s: Side, die: number): Step[] {
  const me = pos[s];
  const opp = pos[other(s)];
  const out: Step[] = [];
  const open = (to: number) => opp[25 - to] < 2;
  if (me[BAR]) return open(BAR - die) ? [{ from: BAR, to: BAR - die, die }] : [];
  const bearing = home(me);
  let highest = 0;
  for (let i = 6; i > 0; i--)
    if (me[i]) {
      highest = i;
      break;
    }
  for (let from = 24; from > 0; from--) {
    if (!me[from]) continue;
    const to = from - die;
    if (to > 0) {
      if (open(to)) out.push({ from, to, die });
    } else if (bearing && (to === 0 || from === highest)) out.push({ from, to: OFF, die });
  }
  return out;
}

export function apply(pos: Pos, s: Side, st: Step): Pos {
  const next: Pos = [pos[0].slice(), pos[1].slice()];
  const me = next[s];
  const opp = next[other(s)];
  me[st.from]--;
  me[st.to]++;
  // a lone opponent stone there is hit and goes to its bar
  if (st.to > 0 && opp[25 - st.to] === 1) {
    opp[25 - st.to] = 0;
    opp[BAR]++;
  }
  return next;
}

const without = (dice: number[], die: number) => {
  const i = dice.indexOf(die);
  return [...dice.slice(0, i), ...dice.slice(i + 1)];
};

/** The most dice that can still be played from here. */
function maxUse(pos: Pos, s: Side, dice: number[]): number {
  let best = 0;
  for (const d of new Set(dice)) {
    for (const st of steps(pos, s, d)) {
      best = Math.max(best, 1 + maxUse(apply(pos, s, st), s, without(dice, d)));
      if (best === dice.length) return best;
    }
  }
  return best;
}

/**
 * The steps you may take next with the dice left. XP's rules: play as many dice as you can; if only one of two
 * different dice can be played, it must be the higher one when that one can be played.
 */
export function legal(pos: Pos, s: Side, dice: number[]): Step[] {
  const need = maxUse(pos, s, dice);
  if (!need) return [];
  let out = [...new Set(dice)].flatMap((d) =>
    steps(pos, s, d).filter((st) => 1 + maxUse(apply(pos, s, st), s, without(dice, d)) === need),
  );
  if (need === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const high = out.filter((st) => st.die === Math.max(...dice));
    if (high.length) out = high;
  }
  return out;
}

/** Every different result of a whole turn (same end position counts once). */
export function plays(pos: Pos, s: Side, dice: number[]): Play[] {
  const out = new Map<string, Play>();
  const seen = new Set<string>();
  const walk = (p: Pos, left: number[], done: Step[]) => {
    const k = `${key(p)}/${left.join()}`;
    if (seen.has(k)) return;
    seen.add(k);
    const next = legal(p, s, left);
    if (!next.length) {
      out.set(key(p), { steps: done, pos: p });
      return;
    }
    for (const st of next) walk(apply(p, s, st), without(left, st.die), [...done, st]);
  };
  walk(pos, dice, []);
  return [...out.values()];
}

/** The four (doubles) or two dice a roll gives you to play. */
export const diceOf = (a: number, b: number) => (a === b ? [a, a, a, a] : [a, b]);

/* ---------- Winning, the cube and the match ---------- */
/** 1 single, 2 gammon (the loser bore off nothing), 3 backgammon (and still has a stone on the bar or in the winner's home board). */
export function winKind(pos: Pos, winner: Side): 1 | 2 | 3 {
  const loser = pos[other(winner)];
  if (loser[OFF]) return 1;
  return loser.slice(19).some((n) => n) ? 3 : 2;
}
export const over = (pos: Pos): Side | null => (pos[WHITE][OFF] === 15 ? WHITE : pos[BROWN][OFF] === 15 ? BROWN : null);

export interface Match {
  to: number;
  score: [number, number];
  /** This game is the Crawford game: only the player one point from the match may double. */
  crawford: boolean;
  crawfordDone: boolean;
}
export interface Cube {
  value: number;
  owner: Side | null;
}
export const newMatch = (to = 5): Match => ({ to, score: [0, 0], crawford: false, crawfordDone: false });

/** You may double before your roll: the cube is in the middle or yours, below 64, and not in someone else's Crawford game. */
export function canDouble(cube: Cube, s: Side, m: Match) {
  if (cube.value >= 64 || (cube.owner !== null && cube.owner !== s)) return false;
  return !m.crawford || m.score[s] === m.to - 1;
}
/** Taking a double: the cube doubles and the taker owns it. */
export const take = (cube: Cube, taker: Side): Cube => ({ value: cube.value * 2, owner: taker });

/** The match after a game the winner won for `points`; the next game is the Crawford one when he first reaches match point − 1. */
export function scoreGame(m: Match, winner: Side, points: number): Match {
  const score: [number, number] = [m.score[0], m.score[1]];
  score[winner] += points;
  const crawford = !m.crawfordDone && score[winner] === m.to - 1 && score[other(winner)] < m.to - 1;
  return { to: m.to, score, crawford, crawfordDone: m.crawfordDone || crawford };
}
export const matchWinner = (m: Match): Side | null =>
  m.score[WHITE] >= m.to ? WHITE : m.score[BROWN] >= m.to ? BROWN : null;

/* ---------- The bot ---------- */
/** How good a position is for side s: the race, plus safety, made points and stones the opponent has on the bar. */
export function evaluate(pos: Pos, s: Side): number {
  const me = pos[s];
  const opp = pos[other(s)];
  const win = over(pos);
  if (win !== null) return (win === s ? 1000 : -1000) * winKind(pos, win);
  let v = pips(pos, other(s)) - pips(pos, s);
  // the opponent stone farthest back, in your numbering (the bar is 0): a blot ahead of it can still be hit
  let back = 25;
  for (let i = 25; i > 0; i--)
    if (opp[i]) {
      back = 25 - i;
      break;
    }
  for (let i = 1; i <= 24; i++) {
    if (me[i] === 1 && i > back) v -= 2 + (25 - i) * 0.25;
    if (me[i] >= 2) v += i <= 6 ? 3 : i <= 9 ? 2 : 0.5;
  }
  v += opp[BAR] * 4 - me[BAR] * 4;
  return v;
}

const ROLLS: [number, number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

/** The position's worth after every opponent roll, if the opponent then plays its best (by `evaluate`). */
function lookahead(pos: Pos, s: Side) {
  if (over(pos) !== null) return evaluate(pos, s);
  const o = other(s);
  let total = 0;
  for (const [a, b, w] of ROLLS) {
    const replies = plays(pos, o, diceOf(a, b));
    let worst = Infinity;
    for (const r of replies) worst = Math.min(worst, evaluate(r.pos, s));
    total += w * (worst === Infinity ? evaluate(pos, s) : worst);
  }
  return total / 36;
}

/** The bot's turn. Every skill looks one roll ahead at its best few plays; Beginner adds noise. */
export function botMove(
  pos: Pos,
  s: Side,
  dice: number[],
  skill: 0 | 1 | 2,
  rnd: () => number = Math.random,
): Play | null {
  const list = plays(pos, s, dice);
  if (!list[0]?.steps.length) return null;
  const ranked = list
    .map((p) => ({ p, v: evaluate(p.pos, s) + (skill === 0 ? rnd() * 16 : rnd() * 0.01) }))
    .sort((x, y) => y.v - x.v)
    .slice(0, [3, 5, 8][skill]);
  let best = ranked[0];
  let bestV = -Infinity;
  for (const r of ranked) {
    const v = lookahead(r.p.pos, s) + (skill === 0 ? rnd() * 16 : 0);
    if (v > bestV) {
      bestV = v;
      best = r;
    }
  }
  return best.p;
}

/** A rough chance to win for side s, who is on roll: the race lead as a share of the race. */
export function winChance(pos: Pos, s: Side) {
  const mine = pips(pos, s) - 4; // being on roll is worth about 4 pips
  const lead = (pips(pos, other(s)) - mine) / Math.max(mine, 30);
  return Math.min(1, Math.max(0, 0.5 + lead * 2));
}
/** Expert's cube rule: double at 70% or better; take at 25% or better. The others never double and always take. */
export const botDoubles = (pos: Pos, s: Side, skill: 0 | 1 | 2) => skill === 2 && winChance(pos, s) >= 0.7;
export const botTakes = (pos: Pos, s: Side, skill: 0 | 1 | 2) => skill < 2 || 1 - winChance(pos, other(s)) >= 0.25;

/** A resignation the bot (as winner) accepts: at least the gammon or backgammon it can still see coming. */
export function acceptsResign(pos: Pos, winner: Side, kind: 1 | 2 | 3) {
  const loser = pos[other(winner)];
  if (loser[OFF]) return true;
  const behind = pips(pos, other(winner)) - pips(pos, winner);
  const need = behind < 40 ? 1 : loser.slice(19).some((n) => n) && behind > 80 ? 3 : 2;
  return kind >= need;
}
