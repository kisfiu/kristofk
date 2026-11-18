// FreeCell: Windows XP rules. Numbered deals 1–1,000,000 from our own seeded shuffle (not Microsoft's deal numbers).
import { type Card, deck, red, type Suit, shuffle } from "./cards";
import { seeded } from "./pipeline-logic";

export const MAX_DEAL = 1_000_000;
export type Loc = { kind: "cell"; i: number } | { kind: "home"; i: number } | { kind: "col"; i: number };

interface Snapshot {
  cells: (Card | null)[];
  home: Card[][];
  cols: Card[][];
}
export interface FreeCell extends Snapshot {
  deal: number;
  moves: number;
  /** XP undoes one move (including the cards that then went home by themselves). */
  undo: Snapshot | null;
}

/** All 52 cards face up, dealt left to right in rows: 7,7,7,7,6,6,6,6. */
export function newDeal(deal: number): FreeCell {
  const cards = shuffle(deck(), seeded(deal)).map((c) => ({ ...c, up: true }));
  const cols: Card[][] = Array.from({ length: 8 }, () => []);
  cards.forEach((c, k) => {
    cols[k % 8].push(c);
  });
  return { deal, cells: [null, null, null, null], home: [[], [], [], []], cols, moves: 0, undo: null };
}

const snap = (g: FreeCell): Snapshot => structuredClone({ cells: g.cells, home: g.home, cols: g.cols });
export const top = <T>(a: T[]): T | undefined => a[a.length - 1];
const stacks = (c: Card, on: Card) => red(c) !== red(on) && on.rank === c.rank + 1;
const homeRank = (g: FreeCell, s: Suit) => g.home.find((h) => h[0]?.suit === s)?.length ?? 0;

/** How many cards can move as one (pre-Vista XP: not doubled per empty column): (free cells + 1) × (empty columns + 1). */
export function maxRun(g: FreeCell, toEmptyColumn: boolean) {
  const free = g.cells.filter((c) => !c).length;
  const empty = g.cols.filter((c) => !c.length).length - (toEmptyColumn ? 1 : 0);
  return (free + 1) * (Math.max(0, empty) + 1);
}

/** Length of the ordered run (alternating colours, descending) on top of a column. */
export function runLength(col: Card[]) {
  let n = col.length ? 1 : 0;
  while (n < col.length && stacks(col[col.length - n], col[col.length - n - 1])) n++;
  return n;
}

/** The home cell a card goes to (its suit's pile, or the first empty one for an Ace), or -1. */
export function homeFor(g: FreeCell, c: Card) {
  const i = g.home.findIndex((h) => h[0]?.suit === c.suit);
  if (i >= 0) return top(g.home[i])!.rank === c.rank - 1 ? i : -1;
  return c.rank === 1 ? g.home.findIndex((h) => !h.length) : -1;
}

/** Cards that would leave `from`: one from a cell; from a column, `count` cards (default: what fits on `to`). */
function moving(g: FreeCell, from: Loc, to: Loc, count?: number): Card[] {
  if (from.kind === "cell") return g.cells[from.i] ? [g.cells[from.i]!] : [];
  if (from.kind !== "col") return [];
  const col = g.cols[from.i];
  if (!col.length) return [];
  if (to.kind !== "col") return [top(col)!];
  const target = top(g.cols[to.i]);
  const run = runLength(col);
  const limit = Math.min(run, maxRun(g, !target));
  if (count) return count <= limit ? col.slice(-count) : [];
  if (!target) return col.slice(-limit);
  // the part of the run whose bottom card fits on the target
  for (let n = 1; n <= limit; n++) if (stacks(col[col.length - n], target)) return col.slice(-n);
  return [];
}

export function canMove(g: FreeCell, from: Loc, to: Loc, count?: number): boolean {
  if (from.kind === to.kind && from.i === to.i) return false;
  const cards = moving(g, from, to, count);
  if (!cards.length) return false;
  if (to.kind === "cell") return cards.length === 1 && !g.cells[to.i];
  if (to.kind === "home") return cards.length === 1 && homeFor(g, cards[0]) === to.i;
  const t = top(g.cols[to.i]);
  return !t || stacks(cards[0], t);
}

/** Make a move; `count` picks how many cards go to an empty column (the "Move column / single card" question). */
export function move(g: FreeCell, from: Loc, to: Loc, count?: number): boolean {
  if (to.kind === "home" && from.kind !== "home") {
    const c = from.kind === "cell" ? g.cells[from.i] : top(g.cols[from.i]);
    if (c) to = { kind: "home", i: homeFor(g, c) };
  }
  if (to.kind === "home" && to.i < 0) return false;
  if (!canMove(g, from, to, count)) return false;
  const cards = moving(g, from, to, count);
  g.undo = snap(g);
  if (from.kind === "cell") g.cells[from.i] = null;
  else g.cols[from.i].splice(-cards.length);
  if (to.kind === "cell") g.cells[to.i] = cards[0];
  else if (to.kind === "home") g.home[to.i].push(cards[0]);
  else g.cols[to.i].push(...cards);
  g.moves++;
  return true;
}

/** Can this card go home safely: no lower card of the other colour is still needed on the table? Aces and twos always. */
export function safe(g: FreeCell, c: Card) {
  if (homeFor(g, c) < 0) return false;
  if (c.rank <= 2) return true;
  const other: Suit[] = red(c) ? ["C", "S"] : ["D", "H"];
  return other.every((s) => homeRank(g, s) >= c.rank - 1);
}

/** After a move, safe cards go home by themselves. Returns how many went. */
export function autoplay(g: FreeCell): number {
  let n = 0;
  for (let again = true; again; ) {
    again = false;
    const sources: Loc[] = [
      ...g.cells.map((_, i) => ({ kind: "cell", i }) as Loc),
      ...g.cols.map((_, i) => ({ kind: "col", i }) as Loc),
    ];
    for (const from of sources) {
      const c = from.kind === "cell" ? g.cells[from.i] : top(g.cols[from.i]);
      if (!c || !safe(g, c)) continue;
      const keep = g.undo;
      move(g, from, { kind: "home", i: homeFor(g, c) });
      g.undo = keep; // one undo step covers the player's move and what followed it
      g.moves--;
      n++;
      again = true;
    }
  }
  return n;
}

/** Every distinct legal move (XP flashes the title when only one is left, and says so when there are none). */
export function legalMoves(g: FreeCell) {
  const sources: Loc[] = [
    ...g.cells.map((_, i) => ({ kind: "cell", i }) as Loc),
    ...g.cols.map((_, i) => ({ kind: "col", i }) as Loc),
  ];
  const targets: Loc[] = [
    { kind: "home", i: 0 },
    ...g.cells.map((_, i) => ({ kind: "cell", i }) as Loc),
    ...g.cols.map((_, i) => ({ kind: "col", i }) as Loc),
  ];
  const out: [Loc, Loc][] = [];
  for (const f of sources) {
    let toCell = false;
    for (let t of targets) {
      // one free cell is as good as another; cells to cells are pointless
      if (t.kind === "cell" && (toCell || f.kind === "cell")) continue;
      if (t.kind === "home") {
        const c = f.kind === "cell" ? g.cells[f.i] : top(g.cols[f.i]);
        if (!c) continue;
        t = { kind: "home", i: homeFor(g, c) };
        if (t.i < 0) continue;
      }
      if (canMove(g, f, t)) {
        out.push([f, t]);
        if (t.kind === "cell") toCell = true;
      }
    }
  }
  return out;
}

export const cardsLeft = (g: FreeCell) => 52 - g.home.reduce((s, h) => s + h.length, 0);
export const won = (g: FreeCell) => cardsLeft(g) === 0;

export function undo(g: FreeCell): boolean {
  if (!g.undo) return false;
  Object.assign(g, g.undo);
  g.undo = null;
  g.moves = Math.max(0, g.moves - 1);
  return true;
}

export { NO_STATS, record, type Stats } from "./scores";
