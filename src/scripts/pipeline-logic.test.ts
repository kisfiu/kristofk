import { describe, expect, it } from "vitest";
import { E, generate, N, rotate, S, seeded, solved, W } from "./pipeline-logic";

describe("pipeline logic", () => {
  it("rotates clockwise and returns after four turns", () => {
    expect(rotate(N)).toBe(E);
    expect(rotate(W)).toBe(N);
    expect(rotate(N | E)).toBe(E | S);
    for (let m = 0; m < 16; m++) expect(rotate(rotate(rotate(rotate(m))))).toBe(m);
  });

  it("generates levels whose solution connects commit to deploy and whose start state does not", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const size = 4 + (seed % 4);
      const { level, solution } = generate(size, seeded(seed));
      expect(solved({ ...level, tiles: solution })).toBe(true);
      expect(solved(level)).toBe(false);
      // every scrambled tile is a rotation of its solved tile, so the level is solvable by clicking
      level.tiles.forEach((m, i) => {
        const turns = [m, rotate(m), rotate(rotate(m)), rotate(rotate(rotate(m)))];
        expect(turns).toContain(solution[i]);
      });
    }
  });
});
