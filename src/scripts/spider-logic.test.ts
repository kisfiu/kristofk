import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { seeded } from "./pipeline-logic";
import {
  canDeal,
  canGrab,
  canMove,
  deal,
  hints,
  move,
  newGame,
  type Spider,
  START_SCORE,
  undo,
  won,
} from "./spider-logic";

let id = 500;
const c = (suit: Suit, rank: number, up = true): Card => ({ id: id++, suit, rank, up });
const run = (suit: Suit, from: number, to: number) => {
  const out: Card[] = [];
  for (let r = from; r >= to; r--) out.push(c(suit, r));
  return out;
};
const table = (): Spider => ({
  ...newGame(4, seeded(1)),
  cols: Array.from({ length: 10 }, () => [c("C", 13)]),
  stock: [],
  done: [],
  history: [],
});

describe("Spider Solitaire (XP rules)", () => {
  it("deals 104 cards: 6,6,6,6,5,5,5,5,5,5 with the tops up, 50 for five deals; suits by level", () => {
    for (const level of [1, 2, 4] as const) {
      const g = newGame(level, seeded(level));
      expect(g.cols.map((col) => col.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
      expect(g.cols.every((col) => col.every((x, i) => x.up === (i === col.length - 1)))).toBe(true);
      expect(g.stock).toHaveLength(50);
      expect(new Set([...g.stock, ...g.cols.flat()].map((x) => x.suit)).size).toBe(level);
      expect(g.score).toBe(START_SCORE);
    }
  });

  it("any card goes on one higher whatever the suit; only one-suit runs move together", () => {
    const g = table();
    g.cols[0] = [c("H", 9), c("S", 8)];
    g.cols[1] = [c("D", 9)];
    expect(canGrab(g.cols[0], 0)).toBe(false); // mixed suits
    expect(canMove(g, 0, 1, 1)).toBe(true);
    g.cols[2] = [c("S", 9), c("S", 8), c("S", 7)];
    g.cols[3] = [c("H", 10)];
    expect(canMove(g, 2, 0, 3)).toBe(true);
    expect(canMove(g, 2, 1, 3)).toBe(false);
    g.cols[4] = [];
    expect(canMove(g, 3, 0, 4)).toBe(true); // an empty column takes anything
  });

  it("costs a point per move and turns over the card left on top", () => {
    const g = table();
    g.cols[0] = [c("H", 4, false), c("S", 8)];
    g.cols[1] = [c("D", 9)];
    expect(move(g, 0, 1, 1)).toBe(true);
    expect(g.score).toBe(START_SCORE - 1);
    expect(g.cols[0][0].up).toBe(true);
  });

  it("removes a finished King-to-Ace run of one suit for +100", () => {
    const g = table();
    g.cols[0] = [c("H", 3, false), ...run("S", 13, 2)];
    g.cols[1] = [c("S", 1)];
    move(g, 1, 0, 0);
    expect(g.done).toEqual(["S"]);
    expect(g.cols[0]).toHaveLength(1);
    expect(g.cols[0][0].up).toBe(true);
    expect(g.score).toBe(START_SCORE - 1 + 100);
  });

  it("won't deal while a column is empty; a deal adds one face-up card per column and can't be undone", () => {
    const g = newGame(1, seeded(5));
    expect(canDeal(g)).toBe(true);
    g.cols[3] = [];
    expect(deal(g)).toBe(false);
    const h = newGame(1, seeded(5));
    expect(deal(h)).toBe(true);
    expect(h.cols.map((col) => col.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6, 6, 6]);
    expect(h.cols.every((col) => top(col).up)).toBe(true);
    expect(h.stock).toHaveLength(40);
    expect(undo(h)).toBe(false);
  });

  it("undo costs a point and takes back a completed run's 100", () => {
    const g = table();
    g.cols[0] = run("S", 13, 2);
    g.cols[1] = [c("S", 1)];
    move(g, 1, 0, 0);
    expect(g.score).toBe(599);
    expect(undo(g)).toBe(true);
    expect(g.done).toEqual([]);
    expect(g.cols[1]).toHaveLength(1);
    expect(g.score).toBe(498);
  });

  it("hints prefer the same suit", () => {
    const g = table();
    g.cols[0] = [c("H", 9)];
    g.cols[1] = [c("S", 9)];
    g.cols[2] = [c("S", 8)];
    expect(hints(g)[0]).toEqual({ from: 2, index: 0, to: 1 });
  });

  it("is won with eight runs done", () => {
    const g = table();
    g.done = ["S", "S", "S", "S", "S", "S", "S", "S"];
    expect(won(g)).toBe(true);
  });
});

const top = (a: Card[]) => a[a.length - 1];
