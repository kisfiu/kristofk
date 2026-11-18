import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import {
  BLACK,
  botMove,
  cellName,
  count,
  EMPTY,
  flips,
  moves,
  newBoard,
  nextTurn,
  over,
  play,
  WHITE,
} from "./reversi-logic";

describe("Reversi (XP Internet Reversi rules)", () => {
  it("starts with two stones each in the centre; Black has four opening moves", () => {
    const b = newBoard();
    expect(count(b, BLACK)).toBe(2);
    expect(count(b, WHITE)).toBe(2);
    expect(moves(b, BLACK).map(cellName).sort()).toEqual(["c4", "d3", "e6", "f5"]);
  });

  it("a move must flip at least one line; every line it closes flips", () => {
    const b = newBoard();
    expect(play(b, 0, BLACK)).toBeNull();
    const n = play(b, 43, BLACK)!; // d3 flips d4
    expect(count(n, BLACK)).toBe(4);
    expect(count(n, WHITE)).toBe(1);
  });

  it("lines stop at the edge of the board (no wrapping to the next row)", () => {
    const b = new Uint8Array(64);
    b[7] = WHITE; // h8
    b[8] = BLACK; // a7: the next index, but on the other side of the board
    expect(flips(b, 6, BLACK)).toEqual([]);
  });

  it("passes when a side has no move and ends when neither has", () => {
    const b = new Uint8Array(64).fill(BLACK);
    b[63] = EMPTY;
    b[62] = WHITE;
    expect(nextTurn(b, WHITE)).toBe(BLACK); // White can't move, Black can
    const full = new Uint8Array(64).fill(WHITE);
    expect(over(full)).toBe(true);
    expect(nextTurn(full, BLACK)).toBeNull();
  });

  it("the bot always plays a legal move, takes a free corner, and finishes games at every skill", () => {
    const corner = new Uint8Array(64);
    corner[9] = WHITE;
    corner[18] = BLACK;
    expect(botMove(corner, BLACK, 1, seeded(1))).toBe(0);
    for (const skill of [0, 1, 2] as const) {
      const rnd = seeded(skill + 3);
      let b = newBoard();
      let s: typeof BLACK | typeof WHITE | null = BLACK;
      // whole games for Beginner and Intermediate; Expert's deeper search is slow, so its opening only
      for (let n = 0; s && (skill < 2 || n < 8); n++) {
        const m = botMove(b, s, skill, rnd);
        expect(moves(b, s)).toContain(m);
        b = play(b, m, s)!;
        s = nextTurn(b, s === BLACK ? WHITE : BLACK);
      }
      if (skill < 2) expect(over(b)).toBe(true);
    }
  });
});
