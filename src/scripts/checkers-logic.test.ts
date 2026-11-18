import { describe, expect, it } from "vitest";
import { botMove, isKing, lost, moves, newBoard, play, RED, sideOf, WHITE } from "./checkers-logic";
import { seeded } from "./pipeline-logic";

const sq = (r: number, c: number) => r * 8 + c;
const KING = 2;

describe("Checkers (XP Internet Checkers rules)", () => {
  it("12 pieces each on the dark squares; Red (at the bottom) has seven opening moves", () => {
    const b = newBoard();
    expect(b.filter((v) => sideOf(v) === RED)).toHaveLength(12);
    expect(b.filter((v) => sideOf(v) === WHITE)).toHaveLength(12);
    expect(b.every((v, i) => !v || (Math.floor(i / 8) + (i % 8)) % 2 === 1)).toBe(true);
    expect(moves(b, RED)).toHaveLength(7);
    expect(moves(b, RED).every((m) => m.path[1] < m.path[0])).toBe(true); // men move up
  });

  it("captures are compulsory", () => {
    const b = new Uint8Array(64);
    b[sq(5, 2)] = RED;
    b[sq(4, 3)] = WHITE;
    b[sq(6, 7)] = RED;
    const list = moves(b, RED);
    expect(list).toEqual([{ path: [sq(5, 2), sq(3, 4)], captured: [sq(4, 3)] }]);
  });

  it("a multi-jump must be finished", () => {
    const b = new Uint8Array(64);
    b[sq(7, 0)] = RED;
    b[sq(6, 1)] = WHITE;
    b[sq(4, 3)] = WHITE;
    const [m] = moves(b, RED);
    expect(m.path).toEqual([sq(7, 0), sq(5, 2), sq(3, 4)]);
    const n = play(b, m);
    expect(n.filter((v) => sideOf(v) === WHITE)).toHaveLength(0);
  });

  it("men move forward only; reaching the far row crowns and ends the move; kings move one square both ways", () => {
    const b = new Uint8Array(64);
    b[sq(1, 2)] = RED;
    const [up1, up2] = moves(b, RED);
    expect([up1.path[1], up2.path[1]].sort()).toEqual([sq(0, 1), sq(0, 3)]);
    const crowned = play(b, up1);
    expect(isKing(crowned[up1.path[1]])).toBe(true);
    const k = new Uint8Array(64);
    k[sq(4, 4)] = RED + KING;
    expect(moves(k, RED)).toHaveLength(4); // one square, all four diagonals: no flying kings
  });

  it("a crowning jump stops on the king row", () => {
    const b = new Uint8Array(64);
    b[sq(2, 1)] = RED;
    b[sq(1, 2)] = WHITE;
    b[sq(1, 4)] = WHITE; // a further jump would be possible for a king, not for a man just crowned
    const [m] = moves(b, RED);
    expect(m.path).toEqual([sq(2, 1), sq(0, 3)]);
  });

  it("you lose with no pieces or no move", () => {
    const b = new Uint8Array(64);
    b[sq(0, 1)] = WHITE;
    expect(lost(b, RED)).toBe(true);
    const blocked = new Uint8Array(64);
    blocked[sq(7, 0)] = WHITE; // a white man on its own last row can't move down
    blocked[sq(5, 2)] = RED;
    expect(lost(blocked, WHITE)).toBe(true);
  });

  it("the bot only plays legal moves and takes a free piece", () => {
    const b = new Uint8Array(64);
    b[sq(5, 2)] = RED;
    b[sq(4, 3)] = WHITE;
    expect(botMove(b, RED, 1, seeded(1))!.captured).toEqual([sq(4, 3)]);
    for (const skill of [0, 1] as const) {
      const rnd = seeded(skill + 7);
      let g = newBoard();
      let s: typeof RED | typeof WHITE = RED;
      for (let n = 0; n < 150 && !lost(g, s); n++) {
        const m = botMove(g, s, skill, rnd)!;
        expect(moves(g, s)).toContainEqual(m);
        g = play(g, m);
        s = s === RED ? WHITE : RED;
      }
    }
  });
});
