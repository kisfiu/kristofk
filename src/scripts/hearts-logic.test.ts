import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import {
  botPass,
  botPlay,
  collect,
  dealHand,
  type Hearts,
  legal,
  newGame,
  pass,
  passOf,
  passTo,
  places,
  play,
} from "./hearts-logic";
import { seeded } from "./pipeline-logic";

let id = 900;
const c = (suit: Suit, rank: number): Card => ({ id: id++, suit, rank, up: true });
const playing = (hands: Card[][], o: Partial<Hearts> = {}): Hearts => ({
  ...newGame(),
  hand: 0,
  hands,
  phase: "play",
  turn: 0,
  firstTrick: false,
  ...o,
});

/** Play a whole game with four bots; returns the finished game. */
function botGame(seed: number, skill = 2) {
  const rnd = seeded(seed);
  const g = newGame();
  for (let guard = 0; guard < 100 && g.phase !== "gameover"; guard++) {
    dealHand(g, rnd);
    if (g.phase === "pass") pass(g, g.hands.map(botPass));
    while (g.phase === "play") {
      if (g.turn < 0) collect(g);
      else expect(play(g, g.turn, botPlay(g, g.turn, skill, rnd))).toBe(true);
    }
  }
  return g;
}

describe("Hearts (XP rules)", () => {
  it("passes left, right, across, then keeps; three cards each way", () => {
    expect([0, 1, 2, 3, 4].map(passOf)).toEqual(["left", "right", "across", "none", "left"]);
    expect(passTo(0, "left")).toBe(1);
    expect(passTo(0, "right")).toBe(3);
    expect(passTo(0, "across")).toBe(2);
    const g = newGame();
    dealHand(g, seeded(3));
    const mine = g.hands[0].slice(0, 3).map((x) => x.id);
    pass(
      g,
      g.hands.map((h) => h.slice(0, 3)),
    );
    expect(g.hands.every((h) => h.length === 13)).toBe(true);
    expect(g.hands[1].some((x) => mine.includes(x.id))).toBe(true);
  });

  it("the 2♣ leads the first trick, and nobody may throw points on it unless they hold nothing else", () => {
    const g = newGame();
    dealHand(g, seeded(4));
    pass(g, g.hands.map(botPass));
    expect(legal(g, g.turn).map((x) => x.suit + x.rank)).toEqual(["C2"]);
    const h = playing([[c("C", 2)], [c("H", 5), c("S", 12), c("D", 3)], [c("H", 2)], [c("C", 9)]], {
      firstTrick: true,
    });
    play(h, 0, h.hands[0][0]);
    expect(legal(h, 1).map((x) => x.suit + x.rank)).toEqual(["D3"]);
    play(h, 1, h.hands[1][2]);
    expect(legal(h, 2).map((x) => x.suit)).toEqual(["H"]); // only points left: allowed
  });

  it("you must follow suit; hearts can't be led until broken unless you hold only hearts", () => {
    const g = playing([[c("H", 4), c("D", 5)], [c("D", 9), c("H", 9)], [], []]);
    expect(legal(g, 0).map((x) => x.suit)).toEqual(["D"]);
    g.broken = true;
    expect(legal(g, 0)).toHaveLength(2);
    const only = playing([[c("H", 4), c("H", 6)], [], [], []]);
    expect(legal(only, 0)).toHaveLength(2);
    const follow = playing([[c("D", 5)], [c("D", 9), c("H", 9)], [], []]);
    play(follow, 0, follow.hands[0][0]);
    expect(legal(follow, 1).map((x) => x.suit)).toEqual(["D"]);
  });

  it("the Queen of Spades breaks hearts; the highest card of the suit led takes the trick", () => {
    const g = playing([[c("D", 2)], [c("S", 12)], [c("D", 1)], [c("D", 13)]]);
    play(g, 0, g.hands[0][0]);
    play(g, 1, g.hands[1][0]);
    expect(g.broken).toBe(true);
    play(g, 2, g.hands[2][0]);
    play(g, 3, g.hands[3][0]);
    expect(collect(g)).toBe(2); // the Ace is high
  });

  it("scores 1 a heart and 13 for the Queen; shooting the moon gives everyone else 26", () => {
    const g = playing([[c("H", 13)], [c("H", 3)], [c("H", 4)], [c("C", 5)]]);
    g.taken = [[c("S", 12), ...Array.from({ length: 10 }, (_, r) => c("H", r + 5))], [], [], []];
    for (let p = 0; p < 4; p++) play(g, p, g.hands[p][0]);
    collect(g);
    expect(g.sheet[0]).toEqual([0, 26, 26, 26]);
    expect(g.moon).toBe(0);
    const n = playing([[c("H", 2)], [c("C", 3)], [c("C", 4)], [c("C", 5)]]);
    n.taken = [[c("S", 12)], [], [], []];
    for (let p = 0; p < 4; p++) play(n, p, n.hands[p][0]);
    collect(n);
    expect(n.sheet[0]).toEqual([14, 0, 0, 0]);
  });

  it("ends when someone reaches 100; lowest wins and ties share a place", () => {
    const g = playing([[c("C", 2)], [c("H", 3)], [c("C", 4)], [c("C", 5)]], { scores: [10, 99, 10, 50], turn: 1 });
    for (const p of [1, 2, 3, 0]) play(g, p, g.hands[p][0]);
    collect(g);
    expect(g.phase).toBe("gameover");
    expect(places(g)).toEqual([0, 3, 0, 2]);
  });

  it("bots pass the Queen of Spades and play only legal cards through whole games", () => {
    expect(botPass([c("S", 12), c("C", 2), c("C", 3), c("D", 4), c("H", 13)]).map((x) => x.suit + x.rank)).toContain(
      "S12",
    );
    for (let seed = 1; seed <= 20; seed++) {
      const g = botGame(seed);
      expect(g.phase).toBe("gameover");
      expect(g.sheet.every((h) => h.reduce((a, b) => a + b, 0) === 26 || h.reduce((a, b) => a + b, 0) === 78)).toBe(
        true,
      );
    }
  });

  it("Internet Hearts: bots at every skill level play only legal cards, and their games finish", () => {
    for (const skill of [0, 1, 2])
      for (let seed = 1; seed <= 10; seed++) expect(botGame(seed * 7 + skill, skill).phase).toBe("gameover");
  });
});
