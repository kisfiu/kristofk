import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { seeded } from "./pipeline-logic";
import {
  autoAll,
  bonus,
  canPlace,
  DEFAULTS,
  draw,
  flip,
  type Game,
  move,
  newGame,
  type Options,
  tick,
  toFoundation,
  undo,
  won,
} from "./solitaire-logic";

const card = (suit: Suit, rank: number, up = true, id = rank): Card => ({ id, suit, rank, up });
const opts = (o: Partial<Options>): Options => ({ ...DEFAULTS, ...o });
/** An empty table to build positions on. */
const table = (o: Partial<Options> = {}): Game => ({
  ...newGame(opts(o), seeded(1)),
  stock: [],
  waste: [],
  found: [[], [], [], []],
  tab: [[], [], [], [], [], [], []],
  score: 0,
});

describe("Solitaire (XP Klondike rules)", () => {
  it("deals 7 columns of 1–7 cards with only the top face up, 24 in the stock", () => {
    const g = newGame(DEFAULTS, seeded(3));
    expect(g.tab.map((t) => t.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.tab.every((t) => t.every((c, i) => c.up === (i === t.length - 1)))).toBe(true);
    expect(g.stock).toHaveLength(24);
    expect(new Set([...g.stock, ...g.tab.flat()].map((c) => c.id)).size).toBe(52);
  });

  it("Draw Three turns three cards, Draw One one; the Ctrl+Alt+Shift click turns one in Draw Three", () => {
    const g = newGame(opts({ draw: 3 }), seeded(2));
    draw(g);
    expect(g.waste).toHaveLength(3);
    draw(g, 1);
    expect(g.waste).toHaveLength(4);
    const one = newGame(opts({ draw: 1 }), seeded(2));
    draw(one);
    expect(one.waste).toHaveLength(1);
    expect(one.waste[0].up).toBe(true);
  });

  it("Standard: Draw One costs 100 for every pass after the first, never below 0", () => {
    const g = newGame(opts({ draw: 1, timed: false }), seeded(4));
    g.score = 150;
    while (g.stock.length) draw(g);
    draw(g); // back to the stock: pass two
    expect(g.score).toBe(50);
    expect(g.stock).toHaveLength(24);
    expect(g.stock.every((c) => !c.up)).toBe(true);
    while (g.stock.length) draw(g);
    draw(g);
    expect(g.score).toBe(0);
  });

  it("Standard: Draw Three costs 20 for every pass after the third", () => {
    const g = newGame(opts({ draw: 3, timed: false }), seeded(4));
    g.score = 100;
    const pass = () => {
      while (g.stock.length) draw(g);
      draw(g);
    };
    pass();
    pass();
    expect(g.score).toBe(100);
    pass(); // pass four starts
    expect(g.score).toBe(80);
  });

  it("Vegas: $52 buy-in, $5 a card up, one pass in Draw One, three in Draw Three, Keep score carries", () => {
    const one = newGame(opts({ scoring: "vegas", draw: 1 }), seeded(5));
    expect(one.score).toBe(-52);
    while (one.stock.length) draw(one);
    expect(draw(one)).toBe(false);
    const three = newGame(opts({ scoring: "vegas", draw: 3 }), seeded(5));
    for (let p = 0; p < 2; p++) {
      while (three.stock.length) draw(three);
      expect(draw(three)).toBe(true);
    }
    while (three.stock.length) draw(three);
    expect(draw(three)).toBe(false);
    expect(newGame(opts({ scoring: "vegas", keepScore: true }), seeded(5), 100).score).toBe(48);
    expect(newGame(opts({ scoring: "vegas", keepScore: false }), seeded(5), 100).score).toBe(-52);
    const g = table({ scoring: "vegas" });
    g.tab[0] = [card("H", 1)];
    expect(move(g, { kind: "tab", i: 0 }, undefined, { kind: "found", i: 0 })).toBe(true);
    expect(g.score).toBe(5);
  });

  it("Standard move scores: +10 up, +5 waste→column, +5 turning a card, −15 foundation→column", () => {
    const g = table({ timed: false });
    g.waste = [card("S", 1)];
    move(g, { kind: "waste" }, undefined, { kind: "found", i: 0 });
    expect(g.score).toBe(10);
    g.tab[1] = [card("H", 9)];
    g.waste = [card("C", 8)];
    move(g, { kind: "waste" }, undefined, { kind: "tab", i: 1 });
    expect(g.score).toBe(15);
    g.tab[2] = [card("D", 5, false), card("C", 6)];
    g.tab[3] = [card("H", 7)];
    move(g, { kind: "tab", i: 2 }, 1, { kind: "tab", i: 3 });
    expect(g.score).toBe(15); // column to column: nothing
    flip(g, 2);
    expect(g.score).toBe(20);
    g.found[1] = [card("D", 1), card("D", 2)];
    g.tab[4] = [card("S", 3)];
    move(g, { kind: "found", i: 1 }, undefined, { kind: "tab", i: 4 });
    expect(g.score).toBe(5);
  });

  it("builds down in alternating colours; only a King goes into an empty column; foundations go up by suit", () => {
    const g = table();
    g.tab[0] = [card("H", 9)];
    expect(canPlace(g, [card("S", 8)], { kind: "tab", i: 0 })).toBe(true);
    expect(canPlace(g, [card("D", 8)], { kind: "tab", i: 0 })).toBe(false);
    expect(canPlace(g, [card("S", 7)], { kind: "tab", i: 0 })).toBe(false);
    expect(canPlace(g, [card("S", 12)], { kind: "tab", i: 1 })).toBe(false);
    expect(canPlace(g, [card("S", 13)], { kind: "tab", i: 1 })).toBe(true);
    expect(canPlace(g, [card("S", 2)], { kind: "found", i: 0 })).toBe(false);
    g.found[0] = [card("S", 1)];
    expect(canPlace(g, [card("S", 2)], { kind: "found", i: 0 })).toBe(true);
    expect(canPlace(g, [card("C", 2)], { kind: "found", i: 0 })).toBe(false);
    expect(canPlace(g, [card("S", 2), card("H", 1)], { kind: "found", i: 0 })).toBe(false);
  });

  it("moves a face-up run, never face-down cards", () => {
    const g = table();
    g.tab[0] = [card("C", 9, false), card("H", 8), card("S", 7)];
    g.tab[1] = [card("S", 9)];
    expect(move(g, { kind: "tab", i: 0 }, 0, { kind: "tab", i: 1 })).toBe(false);
    expect(move(g, { kind: "tab", i: 0 }, 1, { kind: "tab", i: 1 })).toBe(true);
    expect(g.tab[1].map((c) => c.rank)).toEqual([9, 8, 7]);
  });

  it("undo takes back one step only", () => {
    const g = newGame(opts({ draw: 1 }), seeded(8));
    draw(g);
    draw(g);
    expect(undo(g)).toBe(true);
    expect(g.waste).toHaveLength(1);
    expect(undo(g)).toBe(false);
  });

  it("right-click on the table sends everything possible up; double-click one card", () => {
    const g = table();
    g.tab[0] = [card("H", 2), card("H", 1)];
    g.waste = [card("S", 1)];
    expect(toFoundation(g, { kind: "tab", i: 0 })).toBe(true);
    expect(autoAll(g)).toBe(2);
    expect(g.found.flat()).toHaveLength(3);
    undo(g);
    expect(g.found.flat()).toHaveLength(1);
  });

  it("timed Standard: −2 every 10 seconds; win bonus 700,000 ÷ seconds after 30 s", () => {
    const g = table();
    g.score = 10;
    for (let s = 0; s < 20; s++) tick(g);
    expect(g.score).toBe(6);
    expect(bonus(g)).toBe(0); // 20 s: too quick for a bonus
    for (let s = 0; s < 80; s++) tick(g);
    expect(bonus(g)).toBe(7000);
    const untimed = table({ timed: false });
    for (let s = 0; s < 100; s++) tick(untimed);
    expect(bonus(untimed)).toBe(0);
  });

  it("is won when all four foundations hold 13", () => {
    const g = table();
    g.found = (["C", "D", "H", "S"] as Suit[]).map((s) => Array.from({ length: 13 }, (_, r) => card(s, r + 1)));
    expect(won(g)).toBe(true);
  });
});
