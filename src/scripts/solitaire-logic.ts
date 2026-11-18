// Solitaire: Windows XP Klondike rules and scoring (Standard, Vegas, None; Draw One / Draw Three). Pure, no DOM.
import { type Card, deck, red, shuffle } from "./cards";

export type Scoring = "standard" | "vegas" | "none";
export interface Options {
  draw: 1 | 3;
  scoring: Scoring;
  timed: boolean;
  /** Vegas only: the money carries over from game to game. */
  keepScore: boolean;
}
export type Pile = { kind: "stock" } | { kind: "waste" } | { kind: "found"; i: number } | { kind: "tab"; i: number };

interface Snapshot {
  stock: Card[];
  waste: Card[];
  found: Card[][];
  tab: Card[][];
  score: number;
  recycles: number;
  /** The clock when the move was made: an undo keeps the clock and the time penalties since. */
  seconds: number;
}
export interface Game extends Snapshot {
  opts: Options;
  seconds: number;
  /** XP keeps one undo step. */
  undo: Snapshot | null;
}

export const DEFAULTS: Options = { draw: 3, scoring: "standard", timed: true, keepScore: false };
export const VEGAS_BUYIN = 52;

/** Seven columns of 1–7 cards, the top one face up; the rest is the stock. Vegas starts $52 down (plus any kept score). */
export function newGame(opts: Options = DEFAULTS, rnd: () => number = Math.random, carry = 0): Game {
  const cards = shuffle(deck(), rnd);
  const tab: Card[][] = [];
  for (let i = 0; i < 7; i++) {
    tab.push(cards.splice(0, i + 1));
    tab[i][i].up = true;
  }
  return {
    opts,
    stock: cards,
    waste: [],
    found: [[], [], [], []],
    tab,
    score: opts.scoring === "vegas" ? (opts.keepScore ? carry : 0) - VEGAS_BUYIN : 0,
    recycles: 0,
    seconds: 0,
    undo: null,
  };
}

const snap = (g: Game): Snapshot =>
  structuredClone({
    stock: g.stock,
    waste: g.waste,
    found: g.found,
    tab: g.tab,
    score: g.score,
    recycles: g.recycles,
    seconds: g.seconds,
  });
function remember(g: Game) {
  g.undo = snap(g);
}
/** Standard never drops below 0; Vegas is money and can. None keeps 0. */
function add(g: Game, standard: number, vegas = 0) {
  if (g.opts.scoring === "standard") g.score = Math.max(0, g.score + standard);
  else if (g.opts.scoring === "vegas") g.score += vegas;
}

export const top = <T>(a: T[]) => a[a.length - 1];
export const pileCards = (g: Game, p: Pile): Card[] =>
  p.kind === "stock" ? g.stock : p.kind === "waste" ? g.waste : p.kind === "found" ? g.found[p.i] : g.tab[p.i];

/** Vegas allows one pass through the deck in Draw One and three in Draw Three; Standard and None are unlimited. */
export const canRecycle = (g: Game) =>
  !g.stock.length && g.waste.length > 0 && (g.opts.scoring !== "vegas" || g.recycles < (g.opts.draw === 1 ? 0 : 2));

/** Click on the stock: turn over 1 or 3 cards, or turn the waste back over. */
export function draw(g: Game, n: number = g.opts.draw): boolean {
  if (!g.stock.length) {
    if (!canRecycle(g)) return false;
    remember(g);
    g.stock = g.waste.reverse().map((c) => ({ ...c, up: false }));
    g.waste = [];
    g.recycles++;
    // Draw One: −100 for every pass after the first. Draw Three: −20 for every pass after the third.
    if (g.opts.draw === 1) add(g, -100);
    else if (g.recycles >= 3) add(g, -20);
    return true;
  }
  remember(g);
  for (let k = 0; k < n && g.stock.length; k++) g.waste.push({ ...g.stock.pop()!, up: true });
  return true;
}

/** Can these cards (the first one is the bottom of the moving run) go onto pile `to`? */
export function canPlace(g: Game, cards: Card[], to: Pile): boolean {
  const c = cards[0];
  if (!c) return false;
  if (to.kind === "found") {
    const f = g.found[to.i];
    return cards.length === 1 && (f.length ? top(f).suit === c.suit && top(f).rank === c.rank - 1 : c.rank === 1);
  }
  if (to.kind !== "tab") return false;
  const t = top(g.tab[to.i]);
  // an empty column takes only a King
  return t ? t.up && red(t) !== red(c) && t.rank === c.rank + 1 : c.rank === 13;
}

/** The cards that would move when grabbing pile `from` at `index` (tableau: a face-up run; elsewhere: the top card). */
export function grab(g: Game, from: Pile, index?: number): Card[] {
  const p = pileCards(g, from);
  if (from.kind === "tab") {
    const i = index ?? p.length - 1;
    return p[i]?.up ? p.slice(i) : [];
  }
  return from.kind === "stock" || !p.length ? [] : [top(p)];
}

export function move(g: Game, from: Pile, index: number | undefined, to: Pile, keepUndo = false): boolean {
  const cards = grab(g, from, index);
  if (!cards.length || !canPlace(g, cards, to)) return false;
  if (!keepUndo) remember(g);
  pileCards(g, from).splice(-cards.length);
  pileCards(g, to).push(...cards);
  // one foundation to another changes nothing, so it scores nothing
  if (to.kind === "found" && from.kind !== "found") add(g, 10, 5);
  else if (from.kind === "waste") add(g, 5);
  else if (from.kind === "found" && to.kind !== "found") add(g, -15, -5);
  return true;
}

/** Click a face-down card on top of a column to turn it over (+5 in Standard). */
export function flip(g: Game, i: number): boolean {
  const t = top(g.tab[i]);
  if (!t || t.up) return false;
  remember(g);
  t.up = true;
  add(g, 5);
  return true;
}

/** The foundation that takes this single card, or -1. */
export const foundationFor = (g: Game, c: Card) => g.found.findIndex((_, i) => canPlace(g, [c], { kind: "found", i }));

/** Double-click / right-click: send the top card of `from` to its foundation. */
export function toFoundation(g: Game, from: Pile, keepUndo = false): boolean {
  const c = grab(g, from)[0];
  if (!c || (from.kind === "tab" && c !== top(g.tab[from.i]))) return false;
  const i = foundationFor(g, c);
  return i >= 0 && move(g, from, undefined, { kind: "found", i }, keepUndo);
}

/** Right-click on the table: everything that can go up goes up. Undo takes the whole lot back. */
export function autoAll(g: Game): number {
  const before = snap(g);
  let n = 0;
  for (let again = true; again; ) {
    again = false;
    for (const from of [{ kind: "waste" } as Pile, ...g.tab.map((_, i) => ({ kind: "tab", i }) as Pile)])
      if (toFoundation(g, from, true)) {
        n++;
        again = true;
      }
  }
  if (n) g.undo = before;
  return n;
}

export const won = (g: Game) => g.found.every((f) => f.length === 13);

/** One second of a timed Standard game: −2 every 10 seconds. */
export function tick(g: Game) {
  g.seconds++;
  if (g.opts.timed && g.seconds % 10 === 0) add(g, -2);
}

/** Win bonus in a timed Standard game: 700,000 ÷ seconds, if the game took over 30 seconds. */
export function bonus(g: Game) {
  const b = g.opts.timed && g.opts.scoring === "standard" && g.seconds > 30 ? Math.floor(700_000 / g.seconds) : 0;
  g.score += b;
  return b;
}

export function undo(g: Game): boolean {
  if (!g.undo) return false;
  const now = g.seconds;
  Object.assign(g, g.undo);
  // time doesn't go back: the clock stays, and the −2 per 10 seconds that passed since that move still counts
  g.seconds = now;
  if (g.opts.timed) add(g, -2 * (Math.floor(now / 10) - Math.floor(g.undo.seconds / 10)));
  g.undo = null;
  return true;
}
