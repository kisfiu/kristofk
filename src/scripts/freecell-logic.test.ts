import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import {
  autoplay,
  canMove,
  type FreeCell,
  legalMoves,
  maxRun,
  move,
  newDeal,
  runLength,
  safe,
  undo,
  won,
} from "./freecell-logic";
import { NO_STATS, record } from "./scores";

let id = 100;
const c = (suit: Suit, rank: number): Card => ({ id: id++, suit, rank, up: true });
const empty = (): FreeCell => ({
  ...newDeal(1),
  cells: [null, null, null, null],
  home: [[], [], [], []],
  cols: Array.from({ length: 8 }, () => []),
});
const homeUpTo = (suit: Suit, rank: number) => Array.from({ length: rank }, (_, r) => c(suit, r + 1));

describe("FreeCell (XP rules)", () => {
  it("deals 52 face-up cards 7,7,7,7,6,6,6,6; the same number gives the same deal", () => {
    const g = newDeal(11982);
    expect(g.cols.map((col) => col.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(g.cols.flat().every((x) => x.up)).toBe(true);
    expect(new Set(g.cols.flat().map((x) => x.suit + x.rank)).size).toBe(52);
    expect(newDeal(11982).cols).toEqual(g.cols);
    expect(newDeal(11983).cols).not.toEqual(g.cols);
  });

  it("moves (free cells + 1) × (empty columns + 1) cards, not doubled, and the target column doesn't count", () => {
    const g = empty();
    g.cols[0] = [c("S", 9)];
    expect(maxRun(g, false)).toBe(5 * 8);
    g.cols = g.cols.map((col, i) => (i < 5 ? [c("C", 13)] : col));
    g.cells = [c("H", 2), c("H", 3), null, null];
    expect(maxRun(g, false)).toBe(3 * 4); // 2 free cells, 3 empty columns
    expect(maxRun(g, true)).toBe(3 * 3);
  });

  it("builds down in alternating colours; any card goes into an empty column", () => {
    const g = empty();
    g.cols[0] = [c("H", 9)];
    g.cols[1] = [c("S", 8)];
    g.cols[2] = [c("D", 8)];
    expect(canMove(g, { kind: "col", i: 1 }, { kind: "col", i: 0 })).toBe(true);
    expect(canMove(g, { kind: "col", i: 2 }, { kind: "col", i: 0 })).toBe(false);
    expect(canMove(g, { kind: "col", i: 2 }, { kind: "col", i: 5 })).toBe(true);
  });

  it("moves the part of an ordered run that fits, limited by free cells and columns", () => {
    const g = empty();
    g.cols[0] = [c("C", 13), c("H", 7), c("S", 6), c("D", 5)];
    g.cols[1] = [c("C", 8)];
    expect(runLength(g.cols[0])).toBe(3);
    for (let i = 2; i < 8; i++) g.cols[i] = [c("C", 13)]; // no empty columns
    g.cells = [c("D", 13), c("H", 13), c("S", 13), null]; // one free cell: 2 cards at most
    expect(canMove(g, { kind: "col", i: 0 }, { kind: "col", i: 1 })).toBe(false);
    g.cells[2] = null;
    expect(move(g, { kind: "col", i: 0 }, { kind: "col", i: 1 })).toBe(true);
    expect(g.cols[1].map((x) => x.rank)).toEqual([8, 7, 6, 5]);
  });

  it("asks how much goes to an empty column: the whole run or a single card", () => {
    const g = empty();
    g.cols[0] = [c("C", 13), c("H", 7), c("S", 6)];
    expect(move(g, { kind: "col", i: 0 }, { kind: "col", i: 1 }, 1)).toBe(true);
    expect(g.cols[1].map((x) => x.rank)).toEqual([6]);
    undo(g);
    expect(move(g, { kind: "col", i: 0 }, { kind: "col", i: 1 }, 2)).toBe(true);
    expect(g.cols[1].map((x) => x.rank)).toEqual([7, 6]);
  });

  it("free cells hold one card each; home builds up by suit from the Ace", () => {
    const g = empty();
    g.cols[0] = [c("S", 2), c("S", 1)];
    expect(move(g, { kind: "col", i: 0 }, { kind: "home", i: 0 })).toBe(true);
    expect(move(g, { kind: "col", i: 0 }, { kind: "cell", i: 0 })).toBe(true);
    g.cols[1] = [c("D", 4)];
    expect(canMove(g, { kind: "col", i: 1 }, { kind: "cell", i: 0 })).toBe(false);
    expect(move(g, { kind: "cell", i: 0 }, { kind: "home", i: 0 })).toBe(true);
    expect(g.home.flat().map((x) => x.rank)).toEqual([1, 2]);
  });

  it("autoplay sends Aces and twos home at once, higher cards only when the other colour's lower cards are home", () => {
    const g = empty();
    g.home = [homeUpTo("H", 2), [], [], []];
    g.cols[0] = [c("H", 3)];
    g.cols[1] = [c("C", 1)];
    expect(safe(g, g.cols[0][0])).toBe(false); // black twos are still out
    autoplay(g);
    expect(g.cols[1]).toHaveLength(0); // the Ace went
    expect(g.cols[0]).toHaveLength(1);
    g.home[1].push(c("C", 2));
    g.home[2] = homeUpTo("S", 2);
    expect(autoplay(g)).toBe(1);
    expect(g.cols[0]).toHaveLength(0);
  });

  it("undo takes back the move and what autoplay did after it", () => {
    const g = empty();
    g.cols[0] = [c("S", 1), c("H", 5)];
    move(g, { kind: "col", i: 0 }, { kind: "cell", i: 0 });
    autoplay(g);
    expect(g.home.flat()).toHaveLength(1);
    expect(undo(g)).toBe(true);
    expect(g.home.flat()).toHaveLength(0);
    expect(g.cols[0]).toHaveLength(2);
    expect(undo(g)).toBe(false);
  });

  it("knows when no move is left", () => {
    const g = empty();
    g.cells = [c("S", 13), c("H", 13), c("D", 13), c("C", 13)];
    // all black tops: nothing stacks, no empty column, no Ace
    g.cols = [[c("S", 10)], [c("C", 10)], [c("S", 8)], [c("C", 8)], [c("S", 6)], [c("C", 6)], [c("S", 4)], [c("C", 4)]];
    expect(legalMoves(g)).toHaveLength(0);
    g.cols[1] = [c("H", 11)];
    expect(legalMoves(g)).toHaveLength(1); // only the 10♠ onto the Jack
  });

  it("is won with all 52 home", () => {
    const g = empty();
    g.home = (["C", "D", "H", "S"] as Suit[]).map((s) => homeUpTo(s, 13));
    expect(won(g)).toBe(true);
  });

  it("keeps XP's statistics: won, lost, current and longest streaks", () => {
    let s = NO_STATS;
    for (const w of [true, true, false, false, false, true]) s = record(s, w);
    expect(s).toEqual({ won: 3, lost: 3, bestWins: 2, bestLosses: 3, current: 1 });
  });
});
