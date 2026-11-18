import { describe, expect, it } from "vitest";
import {
  acceptsResign,
  apply,
  BAR,
  BROWN,
  botDoubles,
  botMove,
  botTakes,
  canDouble,
  diceOf,
  legal,
  type Match,
  newMatch,
  newPos,
  OFF,
  over,
  type Pos,
  pips,
  plays,
  type Side,
  scoreGame,
  take,
  WHITE,
  winKind,
} from "./backgammon-logic";
import { seeded } from "./pipeline-logic";

/** A position from {point: stones} per side (own numbering); the rest of the 15 are borne off. */
function at(white: Record<number, number>, brown: Record<number, number>): Pos {
  const side = (m: Record<number, number>) => {
    const p = new Array(26).fill(0);
    for (const [i, n] of Object.entries(m)) p[Number(i)] = n;
    p[OFF] = 15 - p.reduce((a: number, b: number) => a + b, 0);
    return p;
  };
  return [side(white), side(brown)];
}
const moves = (pos: Pos, s: Side, dice: number[]) => legal(pos, s, dice).map((st) => `${st.from}-${st.to}/${st.die}`);

describe("Backgammon (XP Internet Backgammon rules)", () => {
  it("the standard setup: 15 stones each, 167 pips each", () => {
    const p = newPos();
    for (const s of [WHITE, BROWN] as Side[]) {
      expect(p[s].reduce((a, b) => a + b, 0)).toBe(15);
      expect(pips(p, s)).toBe(167);
    }
  });

  it("both dice must be used when they can: only the order that allows both is legal", () => {
    // White's last stone on 13; Brown holds White's 7 (Brown's 18). 6 first is blocked; 1 then 6 plays both.
    const p = at({ 13: 1 }, { 18: 2 });
    expect(moves(p, WHITE, [6, 1])).toEqual(["13-12/1"]);
    expect(plays(p, WHITE, [6, 1]).map((x) => x.steps.length)).toEqual([2]);
  });

  it("if only one die can be played, it must be the higher one", () => {
    // 13→7 (6) or 13→8 (5) each work alone, but White's 2 is blocked, so never both
    const p = at({ 13: 1 }, { 23: 2 });
    expect(moves(p, WHITE, [6, 5])).toEqual(["13-7/6"]);
  });

  it("doubles play four times", () => {
    const list = plays(newPos(), WHITE, diceOf(6, 6));
    expect(list.length).toBeGreaterThan(1);
    expect(list.every((x) => x.steps.length === 4 && x.steps.every((s) => s.die === 6))).toBe(true);
  });

  it("a stone on the bar enters first; a shut-out board means no move", () => {
    const p = at({ [BAR]: 1, 13: 3 }, { 1: 2, 2: 2 });
    expect(moves(p, WHITE, [3, 1])).toEqual(["25-22/3"]); // 24 (die 1) is Brown's 1, blocked
    const shut = at({ [BAR]: 1, 13: 3 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 });
    expect(legal(shut, WHITE, [6, 5])).toEqual([]);
    expect(plays(shut, WHITE, [6, 5])[0].steps).toEqual([]);
  });

  it("bearing off: exact point, else the highest stone; never with a stone outside home", () => {
    const p = at({ 5: 1, 3: 1 }, { 24: 1 });
    expect(moves(p, WHITE, [6])).toEqual(["5-0/6"]);
    expect(moves(p, WHITE, [4])).toEqual(["5-1/4"]); // 3 isn't the highest, so no bear-off with a 4
    expect(moves(p, WHITE, [3]).sort()).toEqual(["3-0/3", "5-2/3"]);
    const out = at({ 8: 1, 3: 1 }, { 24: 1 });
    expect(moves(out, WHITE, [3])).toEqual(["8-5/3"]);
  });

  it("landing on a lone stone hits it to the bar", () => {
    const p = apply(at({ 10: 1 }, { 18: 1 }), WHITE, { from: 10, to: 7, die: 3 });
    expect(p[BROWN][BAR]).toBe(1);
    expect(p[BROWN][18]).toBe(0);
    expect(p[WHITE][7]).toBe(1);
  });

  it("single, gammon and backgammon", () => {
    expect(winKind(at({}, { 3: 1 }), WHITE)).toBe(1); // Brown bore off 14
    expect(winKind(at({}, { 6: 15 }), WHITE)).toBe(2);
    expect(winKind(at({}, { 6: 14, 20: 1 }), WHITE)).toBe(3); // Brown's 20 is White's 5: in White's home
    expect(winKind(at({}, { 6: 14, [BAR]: 1 }), WHITE)).toBe(3);
    expect(over(at({}, { 6: 15 }))).toBe(WHITE);
  });

  it("the cube: the taker owns it, only the owner redoubles, up to 64", () => {
    const m = newMatch();
    let cube = { value: 1, owner: null as Side | null };
    expect(canDouble(cube, WHITE, m)).toBe(true);
    cube = take(cube, BROWN);
    expect(cube).toEqual({ value: 2, owner: BROWN });
    expect(canDouble(cube, WHITE, m)).toBe(false);
    expect(canDouble(cube, BROWN, m)).toBe(true);
    expect(canDouble({ value: 64, owner: BROWN }, BROWN, m)).toBe(false);
  });

  it("a 5-point match with XP's Crawford game after someone reaches 4", () => {
    let m: Match = scoreGame(newMatch(5), WHITE, 2);
    expect(m.crawford).toBe(false);
    m = scoreGame(m, WHITE, 2); // 4–0: the next game is the Crawford game
    expect(m.score).toEqual([4, 0]);
    expect(m.crawford).toBe(true);
    const cube = { value: 1, owner: null };
    expect(canDouble(cube, BROWN, m)).toBe(false);
    expect(canDouble(cube, WHITE, m)).toBe(true); // XP: only that player may double
    m = scoreGame(m, BROWN, 1);
    expect(m.crawford).toBe(false); // only once
    expect(canDouble(cube, BROWN, m)).toBe(true);
  });

  it("the bot's cube and resignations", () => {
    const race = at({ 1: 2 }, { 6: 5, 5: 5, 4: 5 }); // White is far ahead
    expect(botDoubles(race, WHITE, 2)).toBe(true);
    expect(botDoubles(race, WHITE, 1)).toBe(false);
    expect(botTakes(race, BROWN, 2)).toBe(false);
    expect(botTakes(race, BROWN, 0)).toBe(true);
    expect(botDoubles(newPos(), WHITE, 2)).toBe(false);
    expect(acceptsResign(newPos(), WHITE, 1)).toBe(true);
    // Brown has borne off nothing and is far behind: a single game isn't enough
    expect(acceptsResign(at({ 1: 2 }, { 13: 15 }), WHITE, 1)).toBe(false);
    expect(acceptsResign(at({ 1: 2 }, { 13: 15 }), WHITE, 2)).toBe(true);
  });

  it("whole bot games end, every bot play is legal, at every skill", () => {
    for (const skill of [0, 1, 2] as const) {
      const rnd = seeded(7 + skill);
      const die = () => 1 + Math.floor(rnd() * 6);
      let p = newPos();
      let s: Side = WHITE;
      let turns = 0;
      while (over(p) === null && turns < 400) {
        const dice = diceOf(die(), die());
        const m = botMove(p, s, dice, skill, rnd);
        if (m) {
          const left = dice.slice();
          for (const st of m.steps) {
            expect(legal(p, s, left)).toContainEqual(st);
            p = apply(p, s, st);
            left.splice(left.indexOf(st.die), 1);
          }
          expect(legal(p, s, left)).toEqual([]);
        } else expect(legal(p, s, dice)).toEqual([]);
        s = s === WHITE ? BROWN : WHITE;
        turns++;
      }
      expect(over(p)).not.toBeNull();
    }
  });
});
