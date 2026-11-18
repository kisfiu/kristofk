// Spider Solitaire: Windows XP rules and scoring. Two decks, 10 columns, 5 deals of 10. Pure, no DOM.
import { type Card, deck, SUITS, type Suit, shuffle } from "./cards";

/** Beginner: one suit (♠), Intermediate: two (♠♥), Advanced: four. */
export type Level = 1 | 2 | 4;
export const LEVEL_SUITS: Record<Level, Suit[]> = { 1: ["S"], 2: ["S", "H"], 4: SUITS };
export const START_SCORE = 500;

interface Snapshot {
  cols: Card[][];
  stock: Card[];
  done: Suit[];
}
export interface Spider extends Snapshot {
  level: Level;
  score: number;
  moves: number;
  /** Undo goes back move by move to the last deal (a deal can't be undone). */
  history: Snapshot[];
}

/** 54 cards to the columns (6,6,6,6,5,5,5,5,5,5), only the top ones face up; 50 left for five deals. */
export function newGame(level: Level, rnd: () => number = Math.random): Spider {
  const cards = shuffle(deck(2, LEVEL_SUITS[level]), rnd);
  const cols: Card[][] = Array.from({ length: 10 }, () => []);
  for (let k = 0; k < 54; k++) cols[k % 10].push(cards.pop()!);
  for (const c of cols) c[c.length - 1].up = true;
  return { level, cols, stock: cards, done: [], score: START_SCORE, moves: 0, history: [] };
}

const snap = (g: Spider): Snapshot => structuredClone({ cols: g.cols, stock: g.stock, done: g.done });
export const top = <T>(a: T[]): T | undefined => a[a.length - 1];

/** Can the cards from `index` up be picked up together: face up, one suit, each one lower than the last? */
export function canGrab(col: Card[], index: number) {
  if (index < 0 || index >= col.length || !col[index].up) return false;
  for (let i = index + 1; i < col.length; i++)
    if (col[i].suit !== col[index].suit || col[i].rank !== col[i - 1].rank - 1) return false;
  return true;
}

/** The lowest index that can be picked up from a column (its whole movable run). */
export function runStart(col: Card[]) {
  let i = col.length - 1;
  while (i > 0 && canGrab(col, i - 1)) i--;
  return i;
}

/** Any card goes on a card one higher, whatever its suit; an empty column takes anything. */
export function canMove(g: Spider, from: number, index: number, to: number) {
  if (from === to || !canGrab(g.cols[from], index)) return false;
  const t = top(g.cols[to]);
  return !t || t.rank === g.cols[from][index].rank + 1;
}

function flipTop(col: Card[]) {
  const t = top(col);
  if (t) t.up = true;
}

/** A full King-to-Ace run of one suit on top of a column goes off the table (+100). */
function completeRuns(g: Spider) {
  for (const col of g.cols) {
    if (col.length < 13) continue;
    const i = col.length - 13;
    if (col[i].rank === 13 && canGrab(col, i) && top(col)!.rank === 1) {
      g.done.push(col[i].suit);
      col.splice(i);
      g.score += 100;
      flipTop(col);
    }
  }
}

/** Move cards; −1 point per move. A face-down card left on top turns over. */
export function move(g: Spider, from: number, index: number, to: number): boolean {
  if (!canMove(g, from, index, to)) return false;
  g.history.push(snap(g));
  g.cols[to].push(...g.cols[from].splice(index));
  flipTop(g.cols[from]);
  g.score--;
  g.moves++;
  completeRuns(g);
  return true;
}

/** XP doesn't deal while a column is empty. */
export const canDeal = (g: Spider) => g.stock.length > 0 && g.cols.every((c) => c.length > 0);

export function deal(g: Spider): boolean {
  if (!canDeal(g)) return false;
  for (const col of g.cols) col.push({ ...g.stock.pop()!, up: true });
  g.history = []; // a deal can't be undone
  completeRuns(g);
  return true;
}

/** Undo costs a point too, and takes back any run that the move completed. */
export function undo(g: Spider): boolean {
  const s = g.history.pop();
  if (!s) return false;
  const runs = g.done.length - s.done.length;
  Object.assign(g, s);
  g.score -= 1 + runs * 100;
  g.moves++;
  return true;
}

/** Possible moves for Hint, best first: onto the same suit, then onto any suit, then into an empty column. */
export function hints(g: Spider): { from: number; index: number; to: number }[] {
  const out: { from: number; index: number; to: number; rank: number }[] = [];
  g.cols.forEach((col, from) => {
    if (!col.length) return;
    const start = runStart(col);
    g.cols.forEach((target, to) => {
      for (let index = start; index < col.length; index++) {
        if (!canMove(g, from, index, to)) continue;
        const t = top(target);
        // moving a whole column into an empty one changes nothing
        if (!t && index === 0) continue;
        out.push({ from, index, to, rank: !t ? 2 : t.suit === col[index].suit ? 0 : 1 });
      }
    });
  });
  return out.sort((a, b) => a.rank - b.rank).map(({ from, index, to }) => ({ from, index, to }));
}

export const won = (g: Spider) => g.done.length === 8;
