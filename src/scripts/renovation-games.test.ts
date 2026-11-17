import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import {
  cellTargets,
  drift,
  edgeX,
  firstOpen,
  grabs,
  hollowAround,
  lumps,
  needle,
  paintStrips,
  peel,
  reveal,
  rollerMove,
  sweeperDone,
  timingZone,
  touches,
} from "./renovation-games";
import { COLS, GH, GW, MARK, newGame, OPEN, ROWS } from "./renovation-logic";

describe("knock-sweeper", () => {
  it("counts hollow neighbours and flood-opens from a zero", () => {
    const hollow = new Uint8Array(GW * GH);
    hollow[GW + 1] = 1; // (1,1)
    expect(hollowAround(hollow, 0)).toBe(1);
    expect(hollowAround(hollow, GW * 5 + 8)).toBe(0);
    const known = new Uint8Array(GW * GH);
    reveal(hollow, known, GW * GH - 1);
    // everything opens except the hollow cell and the three corner cells only reachable through numbered cells
    expect([...known].filter((k) => k === OPEN).length).toBe(GW * GH - 4);
    expect(known[0]).toBe(0);
    expect(known[GW + 1]).toBe(0);
    expect(sweeperDone(hollow, known)).toBe(false);
    known[GW + 1] = MARK;
    expect(sweeperDone(hollow, known)).toBe(true);
    // a wrong mark on a sound cell blocks it, until that cell is knocked open the classic way
    const marked = new Uint8Array(GW * GH);
    marked[GW + 1] = MARK;
    marked[0] = MARK;
    expect(sweeperDone(hollow, marked)).toBe(false);
    const opened = Uint8Array.from(hollow, (h) => (h ? 0 : OPEN));
    expect(sweeperDone(hollow, opened)).toBe(true);
  });

  it("always has a safe zero cell to start from", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = newGame(seeded(seed));
      const c = firstOpen(g.hollow, seeded(seed));
      expect(g.hollow[c]).toBe(0);
      expect(hollowAround(g.hollow, c)).toBe(0);
    }
  });
});

describe("skill games", () => {
  it("timing bar: the needle bounces and the middle is green", () => {
    expect(needle(0, 1)).toBe(0);
    expect(needle(500, 1)).toBeCloseTo(0.5);
    expect(needle(1500, 1)).toBeCloseTo(0.5);
    expect(timingZone(0.52)).toBe("green");
    expect(timingZone(0.65)).toBe("yellow");
    expect(timingZone(0.95)).toBe("red");
  });

  it("steady hand: more time off the guide leaves more lumps", () => {
    expect([0, 0.1, 0.3, 0.9].map(lumps)).toEqual([0, 1, 2, 3]);
  });

  it("roller: runs dry, and a fast flick drips", () => {
    const slow = rollerMove(1, 10, 1000);
    expect(slow.paints).toBe(true);
    expect(slow.drip).toBe(false);
    expect(slow.load).toBeCloseTo(0.83);
    expect(rollerMove(1, 10, 50).drip).toBe(true);
    const dry = rollerMove(0, 10, 1000);
    expect(dry.paints).toBe(false);
    expect(dry.drip).toBe(false);
  });

  it("paint peels from its curled edge as far as you drag, up or down doesn't matter", () => {
    const strips = paintStrips();
    expect(strips).toHaveLength(ROWS / 2);
    const [right, left] = strips;
    expect(edgeX(right)).toBe(0);
    expect(edgeX(left)).toBe(COLS);
    expect(grabs(right, 0.5, 1)).toBe(true);
    expect(grabs(right, 10, 1)).toBe(false);
    expect(peel(right, 12)).toBe("peel");
    expect(right.done).toBe(12);
    expect(peel(right, 5)).toBe("peel"); // dragging back doesn't un-peel
    expect(right.done).toBe(12);
    expect(grabs(right, 12, 1)).toBe(true);
    expect(peel(right, COLS + 3)).toBe("done");
    expect(peel(left, 10)).toBe("peel");
    expect(left.done).toBe(COLS - 10);
  });

  it("cell targets are hit anywhere inside their 2×2 square", () => {
    const g = newGame(seeded(4));
    const [t] = cellTargets(g.hollow, 2);
    expect(touches(t, t.x - 0.9, t.y + 0.9, 0)).toBe(true);
    expect(touches(t, t.x + 1.1, t.y, 5)).toBe(false);
  });

  it("drifting dust stays on the wall", () => {
    const t = { x: 1.2, y: ROWS - 1.2, hp: 1, born: 0, life: Infinity, vx: -0.01, vy: 0.01 };
    for (let i = 0; i < 100; i++) drift(t, 50);
    expect(t.x).toBeGreaterThanOrEqual(1);
    expect(t.y).toBeLessThanOrEqual(ROWS - 1);
  });
});
