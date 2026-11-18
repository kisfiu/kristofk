import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { seeded } from "./pipeline-logic";
import {
  bid,
  botBid,
  botPlay,
  collect,
  contractOf,
  dealHand,
  estimate,
  legal,
  NIL,
  newGame,
  play,
  type Spades,
} from "./spades-logic";

let id = 900;
const c = (suit: Suit, rank: number): Card => ({ id: id++, suit, rank, up: true });
const playing = (hands: Card[][], o: Partial<Spades> = {}): Spades => ({
  ...newGame(),
  hand: 0,
  hands,
  phase: "play",
  turn: 0,
  bids: [3, 3, 3, 3],
  ...o,
});

/** The last trick of a hand: seat 0 leads the ace of spades and takes it. Team Gold bid 4+3, Blue 3+2. */
function lastTrick(o: Partial<Spades> = {}) {
  const g = playing([[c("S", 1)], [c("H", 2)], [c("H", 3)], [c("H", 4)]], {
    broken: true,
    bids: [4, 3, 3, 2],
    tricks: [4, 3, 4, 1],
    ...o,
  });
  for (const p of [0, 1, 2, 3]) expect(play(g, p, g.hands[p][0])).toBe(true);
  collect(g);
  return g;
}

/** A whole game with four bots; every bid and card must be legal. */
function botGame(seed: number, skill: number) {
  const rnd = seeded(seed);
  const g = newGame();
  for (let guard = 0; guard < 200 && g.phase !== "gameover"; guard++) {
    dealHand(g, rnd);
    while (g.phase === "bid") expect(bid(g, g.turn, botBid(g, g.turn, skill, rnd))).toBe(true);
    while (g.phase === "play") {
      if (g.turn < 0) collect(g);
      else expect(play(g, g.turn, botPlay(g, g.turn, skill, rnd))).toBe(true);
    }
  }
  return g;
}

describe("Spades (XP Internet Spades rules)", () => {
  it("bids once round, from the dealer's left: 1–13 or Nil; partners' bids add up to the team contract", () => {
    const g = newGame();
    dealHand(g, seeded(1));
    expect(g.dealer).toBe(3);
    expect(bid(g, 1, 3)).toBe(false); // not your turn
    expect(bid(g, 0, 14)).toBe(false);
    expect(bid(g, 0, 4, true)).toBe(false); // only a Nil can be blind
    expect(bid(g, 0, 4)).toBe(true);
    expect(bid(g, 1, NIL)).toBe(true);
    expect(bid(g, 2, 3)).toBe(true);
    expect(g.phase).toBe("bid");
    expect(bid(g, 3, 5)).toBe(true);
    expect(g.phase).toBe("play");
    expect([contractOf(g, 0), contractOf(g, 1)]).toEqual([7, 5]);
  });

  it("the deal moves clockwise, and the player left of the dealer leads", () => {
    const g = newGame();
    dealHand(g, seeded(2));
    dealHand(g, seeded(3));
    expect(g.dealer).toBe(0);
    for (const n of [2, 3, 4, 2]) bid(g, g.turn, n);
    expect(g.turn).toBe(1);
  });

  it("you must follow suit, and spades can't be led until broken (unless you hold only spades)", () => {
    const g = playing([[c("S", 5), c("H", 3)], [], [], []]);
    expect(legal(g, 0).map((x) => x.suit)).toEqual(["H"]);
    g.hands[0] = [c("S", 5), c("S", 9)];
    expect(legal(g, 0)).toHaveLength(2);
    g.hands[0] = [c("S", 5), c("H", 3)];
    g.broken = true;
    expect(legal(g, 0)).toHaveLength(2);
    g.trick = [{ p: 3, c: c("H", 10) }];
    g.hands[0] = [c("H", 9), c("S", 2), c("D", 3)];
    expect(legal(g, 0).map((x) => x.suit)).toEqual(["H"]);
    g.hands[0] = [c("S", 2), c("D", 3)];
    expect(legal(g, 0)).toHaveLength(2);
  });

  it("a spade breaks spades; the highest spade takes the trick, else the highest card of the suit led", () => {
    const g = playing([[c("H", 10)], [c("H", 1)], [c("S", 2)], [c("H", 13)]]);
    for (const p of [0, 1, 2, 3]) play(g, p, g.hands[p][0]);
    expect(g.broken).toBe(true);
    expect(collect(g)).toBe(2);
    const h = playing([[c("D", 5)], [c("D", 1)], [c("C", 13)], [c("D", 10)]]);
    for (const p of [0, 1, 2, 3]) play(h, p, h.hands[p][0]);
    expect(collect(h)).toBe(1); // aces are high
  });

  it("a made contract scores 10 a bid trick plus 1 a bag; a missed one loses 10 a bid trick", () => {
    const g = lastTrick();
    expect(g.scores).toEqual([72, -50]);
    expect(g.bags).toEqual([2, 0]);
    expect(g.history[0][0]).toMatchObject({ contract: 7, tricks: 9, points: 72, bags: 2 });
  });

  it("every 10 bags cost 100 points, and the counter starts again", () => {
    const g = lastTrick({ bags: [9, 0] });
    expect(g.bags[0]).toBe(1);
    expect(g.scores[0]).toBe(-28);
  });

  it("Nil is ±100 and Double Nil ±200; a nil bidder's tricks are bags and don't help the partner", () => {
    const g = playing([[c("H", 2)], [c("H", 3)], [c("S", 1)], [c("H", 4)]], {
      broken: true,
      turn: 2,
      bids: [NIL, NIL, 4, 3],
      blind: [false, true, false, false],
      tricks: [0, 1, 4, 7],
    });
    for (const p of [2, 3, 0, 1]) play(g, p, g.hands[p][0]);
    collect(g);
    // Gold: nil made +100, 4 bid and 5 taken: 40 + 1 bag. Blue: double nil lost -200, 3 bid and 7 taken: 30 + 4 bags, +1 nil bag
    expect(g.scores).toEqual([141, -165]);
    expect(g.history[0][1].nils).toEqual([{ p: 1, blind: true, made: false }]);
    expect(g.history[0][0].nils).toEqual([{ p: 0, blind: false, made: true }]);
  });

  it("500 wins (the higher score if both pass it), -200 loses, and a tie plays on", () => {
    expect(lastTrick({ scores: [430, 0] })).toMatchObject({ phase: "gameover", winner: 0 });
    expect(lastTrick({ scores: [0, -150] })).toMatchObject({ phase: "gameover", winner: 0 });
    expect(lastTrick({ scores: [440, 560] })).toMatchObject({ phase: "gameover", winner: 0 });
    expect(lastTrick({ scores: [428, 550] })).toMatchObject({ phase: "handover", winner: -1 });
  });

  it("bots count tricks to bid, bid Nil on a hopeless hand, and play legal cards through whole games", () => {
    const strong = [c("S", 1), c("S", 13), c("S", 12), c("S", 10), c("S", 8), c("H", 1), c("D", 1), c("C", 1)];
    const weak = [c("H", 2), c("H", 4), c("D", 3), c("D", 6), c("C", 2), c("C", 5), c("S", 3)];
    expect(estimate(strong)).toBeGreaterThan(6);
    const g = playing([weak, strong, [], []], { phase: "bid", bids: [null, null, null, null] });
    expect(botBid(g, 0)).toBe(NIL);
    expect(botBid(g, 1)).toBeGreaterThanOrEqual(6);
    for (const skill of [0, 1, 2])
      for (let seed = 1; seed <= 8; seed++) expect(botGame(seed * 5 + skill, skill).phase).toBe("gameover");
  });
});
