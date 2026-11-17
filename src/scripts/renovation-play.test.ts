import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import { GW, MARK, newGame, OPEN } from "./renovation-logic";
import { type Env, makeGame } from "./renovation-play";

describe("knock-sweeper clicks", () => {
  it("right-click marks any hidden cell, and right-clicking it again removes the mark", () => {
    const g = newGame(seeded(2));
    const said: string[] = [];
    const env: Env = {
      g,
      rnd: seeded(2),
      fine: () => {},
      say: (t) => said.push(t),
      shake: () => {},
      markMode: () => false,
    };
    const game = makeGame("sweeper", env, () => false);
    const c = g.hollow.indexOf(1);
    const [x, y] = [(c % GW) * 2 + 1, Math.floor(c / GW) * 2 + 1];
    const right = { button: 2 } as PointerEvent;
    game.down(x, y, right, 0);
    expect(g.known[c]).toBe(MARK);
    game.down(x, y, { button: 0 } as PointerEvent, 0); // a knock on a mark does nothing
    expect(g.known[c]).toBe(MARK);
    game.down(x, y, right, 0);
    expect(g.known[c]).toBe(0);
    expect(said.at(-1)).toBe("Mark removed.");
    expect(g.known.some((k) => k === OPEN)).toBe(true); // the board starts with an open area
    // a sound cell can be marked too, with no fine and no hint, and it blocks finishing until removed
    const s = g.known.findIndex((k, i) => !k && !g.hollow[i]);
    const [sx, sy] = [(s % GW) * 2 + 1, Math.floor(s / GW) * 2 + 1];
    game.down(sx, sy, right, 0);
    expect(g.known[s]).toBe(MARK);
    expect(g.budget).toBe(150_000);
    for (let h = 0; h < g.hollow.length; h++) if (g.hollow[h]) g.known[h] = MARK;
    expect(game.done(0)).toBe(false);
    game.down(sx, sy, right, 0);
    expect(game.done(0)).toBe(true);
  });
});
