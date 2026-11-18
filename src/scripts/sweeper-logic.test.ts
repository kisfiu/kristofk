import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import {
  type Board,
  chord,
  clampCustom,
  count,
  cycleMark,
  FLAG,
  HIDDEN,
  isLevel,
  isRecord,
  LEVELS,
  minesLeft,
  newBoard,
  OPEN,
  open,
  QUESTION,
} from "./sweeper-logic";

/** A board with mines exactly where given. */
const board = (w: number, h: number, mines: number[]): Board => {
  const b = newBoard(w, h, 0);
  for (const m of mines) b.mine[m] = 1;
  b.mines = mines.length;
  return b;
};

describe("Wall Sweeper (XP Minesweeper rules)", () => {
  it("has XP's three levels and clamps Custom like XP", () => {
    expect(LEVELS.beginner).toEqual({ w: 9, h: 9, mines: 10 });
    expect(LEVELS.intermediate).toEqual({ w: 16, h: 16, mines: 40 });
    expect(LEVELS.expert).toEqual({ w: 30, h: 16, mines: 99 });
    expect(clampCustom(1, 99, 5)).toEqual({ h: 9, w: 30, mines: 10 });
    expect(clampCustom(24, 30, 5000)).toEqual({ h: 24, w: 30, mines: 667 });
    expect(clampCustom(9, 9, 100)).toEqual({ h: 9, w: 9, mines: 64 });
  });

  it("trusts only well-formed saved levels and best times (a damaged one falls back)", () => {
    expect(["beginner", "custom"].every(isLevel)).toBe(true);
    expect(["master", "toString", 3, null].some(isLevel)).toBe(false);
    expect(isRecord({ t: 12, name: "Kristóf" })).toBe(true);
    expect([null, {}, { t: "12", name: "x" }, { t: 5, name: 5 }].some(isRecord)).toBe(false);
    // a damaged Custom Field comes back as the smallest one
    expect(clampCustom(Number(undefined), Number("x"), Number(undefined))).toEqual({ h: 9, w: 9, mines: 10 });
  });

  it("places exactly the asked number of spots", () => {
    for (let s = 1; s < 50; s++) expect(newBoard(30, 16, 99, seeded(s)).mine.reduce((a, b) => a + b, 0)).toBe(99);
  });

  it("moves a first-click spot to the first free cell, skipping the last row and column", () => {
    // 9×9, spots on the whole first row except its last cell: the scan skips column 8, so the spot lands on (0,1)
    const b = board(9, 9, [0, 1, 2, 3, 4, 5, 6, 7, 40]);
    open(b, 40);
    expect(b.status).toBe("play");
    expect(b.mine[40]).toBe(0);
    expect(b.mine[9]).toBe(1);
    expect(b.state[40]).toBe(OPEN);
  });

  it("only the very first click is safe", () => {
    const b = board(9, 9, [80]);
    open(b, 0);
    expect(b.status).toBe("won"); // one spot: the flood opens everything else
    const c = board(9, 9, [79, 80]);
    open(c, 0);
    open(c, 80);
    expect(c.status).toBe("won"); // already over: a later click changes nothing
    const d = board(9, 9, [10, 80]);
    open(d, 0);
    open(d, 80);
    expect(d.status).toBe("lost");
    expect(d.boom).toBe(80);
  });

  it("floods zeros, never opens flags, opens ? cells", () => {
    const b = board(9, 9, [80]);
    cycleMark(b, 40, true);
    cycleMark(b, 41, true);
    cycleMark(b, 41, true);
    expect([b.state[40], b.state[41]]).toEqual([FLAG, QUESTION]);
    open(b, 0);
    expect(b.state[40]).toBe(FLAG);
    expect(b.state[41]).toBe(OPEN);
    expect(b.status).toBe("play");
  });

  it("right-click cycles flag → ? → blank, or flag → blank with Marks off", () => {
    const b = board(9, 9, [80]);
    for (const want of [FLAG, QUESTION, HIDDEN]) {
      cycleMark(b, 3, true);
      expect(b.state[3]).toBe(want);
    }
    cycleMark(b, 3, false);
    cycleMark(b, 3, false);
    expect(b.state[3]).toBe(HIDDEN);
  });

  it("the counter goes negative with too many flags", () => {
    const b = board(9, 9, [80]);
    cycleMark(b, 0, true);
    cycleMark(b, 1, true);
    expect(minesLeft(b)).toBe(-1);
  });

  it("chords only when the flags match, and a wrong flag loses", () => {
    // spots at (0,0) and (2,0); cell (1,1) shows 2
    const b = board(9, 9, [0, 2]);
    open(b, 10);
    expect(count(b, 10)).toBe(2);
    chord(b, 10);
    expect(b.state[1]).toBe(HIDDEN); // no flags yet: nothing happens
    cycleMark(b, 0, true);
    cycleMark(b, 2, true);
    chord(b, 10);
    expect(b.state[1]).toBe(OPEN);
    expect(b.status).toBe("won"); // the chord opened a 0, whose flood cleared the board
    const w = board(9, 9, [0, 2]);
    open(w, 10);
    cycleMark(w, 0, true);
    cycleMark(w, 1, true); // wrong flag
    chord(w, 10);
    expect(w.status).toBe("lost");
    expect(w.boom).toBe(2);
  });

  it("winning flags every spot", () => {
    const b = board(9, 9, [0, 80]);
    open(b, 40);
    open(b, 1);
    open(b, 9);
    open(b, 10);
    open(b, 79);
    open(b, 71);
    open(b, 70);
    expect(b.status).toBe("won");
    expect(b.state[0]).toBe(FLAG);
    expect(minesLeft(b)).toBe(0);
  });
});
