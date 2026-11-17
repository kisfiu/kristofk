import { describe, expect, it } from "vitest";
import { seeded } from "./pipeline-logic";
import {
  BUDGET,
  coarse,
  finished,
  finishJob,
  GW,
  JOBS,
  L,
  MARK,
  MATERIALS,
  newGame,
  stars,
  start,
} from "./renovation-logic";

describe("renovation logic", () => {
  it("places six separate hollow patches, aligned to the coarse grid", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = newGame(seeded(seed));
      expect(new Set([...g.patch].filter((p) => p >= 0))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      g.patch.forEach((p, i) => {
        expect(p >= 0).toBe(g.hollow[coarse(i)] === 1);
      });
    }
  });

  it("finishes a correct playthrough paying only for materials", () => {
    const g = newGame(seeded(7));
    let now = 0;
    for (const j of JOBS) {
      now += 10_000; // always wait for the wall to dry
      expect(start(g, j.tool, now)).toEqual({ ok: true });
      finishJob(g, now);
    }
    expect(finished(g)).toBe(true);
    expect(g.budget).toBe(BUDGET - MATERIALS);
    expect(g.mistakes).toBe(0);
    expect(g.cells.every((c) => c === L.PAINT2)).toBe(true);
    expect(g.known.every((k, c) => (g.hollow[c] ? k === MARK : true))).toBe(true);
    expect(stars(g, 200)).toBe(3);
  });

  it("charges for the wrong tool and changes nothing", () => {
    const g = newGame(seeded(3));
    const r = start(g, "paint", 0);
    expect(r.ok).toBe(false);
    expect(g.budget).toBe(BUDGET - 25_000);
    expect(g.job).toBe(0);
    expect(g.cells.every((c) => c === L.OLD)).toBe(true);
  });

  it("charges for touching a wet wall", () => {
    const g = newGame(seeded(5));
    let now = 0;
    while (JOBS[g.job].tool !== "putty") {
      now += 10_000;
      start(g, JOBS[g.job].tool, now);
      finishJob(g, now);
    }
    // hard plaster just went on: it is wet for a few seconds
    const before = g.budget;
    expect(start(g, "putty", now + 1).ok).toBe(false);
    expect(g.budget).toBe(before - 5_000);
    expect(start(g, "putty", now + 10_000).ok).toBe(true);
  });

  it("chisels only the hollow patches", () => {
    const g = newGame(seeded(9));
    for (let now = 1; g.job < 3; now++) {
      start(g, JOBS[g.job].tool, now);
      finishJob(g, now);
    }
    g.cells.forEach((c, i) => {
      expect(c).toBe(g.patch[i] >= 0 ? L.DUSTY : L.BARE);
    });
    expect(GW).toBe(16);
  });
});
