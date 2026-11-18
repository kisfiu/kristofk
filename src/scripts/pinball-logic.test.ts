import { describe, expect, it } from "vitest";
import {
  BALL_SAVE,
  BANKS,
  drain,
  hit,
  insertScore,
  LANES,
  launchSpeed,
  multiplier,
  newGame,
  nudge,
  POINTS,
  placeOf,
  plungerStrength,
  RANKS,
  REPLAY_EVERY,
  rampLit,
  shiftLanes,
  TABLE_SIZE,
  TICKETS,
} from "./pinball-logic";

const clearAll = (g: ReturnType<typeof newGame>) =>
  BANKS.flatMap((bank) => [0, 1, 2].flatMap((i) => hit(g, { kind: "target", bank, i })));

describe("Pipeline Pinball rules", () => {
  it("has the nine ranks from Intern to CTO", () => {
    expect(RANKS).toHaveLength(9);
    expect([RANKS[0], RANKS[8]]).toEqual(["Intern", "CTO"]);
  });

  it("a drop target scores once; a full bank lights its progress light and stands back up", () => {
    const g = newGame(1);
    hit(g, { kind: "target", bank: "BUILD", i: 0 });
    hit(g, { kind: "target", bank: "BUILD", i: 0 });
    expect(g.players[0].score).toBe(POINTS.target);
    hit(g, { kind: "target", bank: "BUILD", i: 1 });
    expect(hit(g, { kind: "target", bank: "BUILD", i: 2 })).toEqual(["BUILD passed"]);
    expect(g.players[0].lit.BUILD).toBe(true);
    expect(g.players[0].down.BUILD).toEqual([false, false, false]);
  });

  it("Build, Test and Deploy light the green pipeline; the ramp pays the jackpot and promotes", () => {
    const g = newGame(1);
    expect(clearAll(g)).toContain("Green pipeline lit");
    const p = g.players[0];
    expect(rampLit(p)).toBe(true);
    const before = p.score;
    expect(hit(g, { kind: "ramp" })).toEqual(["GREEN PIPELINE! Jackpot 100,000", "Promoted to Junior"]);
    expect(p.score - before).toBe(POINTS.jackpot);
    expect(rampLit(p)).toBe(false);
    // unlit, the ramp pays only its own points
    expect(hit(g, { kind: "ramp" })).toEqual([]);
  });

  it("the Renovate orbit steps ×1 → 2 → 3 → 5 → 10, then gives extra balls", () => {
    const g = newGame(1);
    const seen = [1, 2, 3, 4].map(() => {
      hit(g, { kind: "orbit" });
      return multiplier(g.players[0]);
    });
    expect(seen).toEqual([2, 3, 5, 10]);
    expect(hit(g, { kind: "orbit" })).toEqual(["Extra Ball"]);
    hit(g, { kind: "orbit" });
    expect(g.players[0].extraBalls).toBe(2);
  });

  it("tilt meter: careful above 0.5, tilt above 1.0, and it drains over time", () => {
    const g = newGame(1);
    expect(nudge(g, 10)).toBe("ok");
    expect(nudge(g, 10.1)).toBe("careful");
    expect(nudge(g, 20)).toBe("ok"); // ten seconds later the meter has emptied
    nudge(g, 20.1);
    expect(nudge(g, 20.2)).toBe("tilt");
    expect(hit(g, { kind: "bumper" })).toEqual([]);
  });

  it("a tilt drains with no bonus and no ball save", () => {
    const g = newGame(1);
    hit(g, { kind: "target", bank: "TEST", i: 0 });
    for (const t of [1, 1.1, 1.2]) nudge(g, t);
    const d = drain(g, 2);
    expect(d).toMatchObject({ bonus: 0, again: false });
    expect(g.ball).toBe(2);
    expect(g.tilted).toBe(false);
  });

  it("ball save: a drain within 15 s gives the ball back", () => {
    const g = newGame(2);
    expect(drain(g, BALL_SAVE - 1)).toEqual({ msgs: ["Player 1 Shoot Again"], bonus: 0, again: true });
    expect([g.current, g.ball]).toEqual([0, 1]);
    // once per ball: the ball it gave back drains for good, and the next ball has its own save
    expect(drain(g, 1).again).toBe(false);
    expect(g.current).toBe(1);
    expect(drain(g, 1).again).toBe(true);
  });

  it("bonus × multiplier on the drain; rank and progress lights stay, the rest resets", () => {
    const g = newGame(1);
    const p = g.players[0];
    hit(g, { kind: "orbit" });
    hit(g, { kind: "target", bank: "DEPLOY", i: 0 });
    for (const i of [0, 1, 2]) hit(g, { kind: "target", bank: "BUILD", i });
    p.rank = 3;
    expect(drain(g, 60).bonus).toBe((4 * POINTS.target + POINTS.bank) * 2);
    expect([p.mult, p.rank, p.lit.BUILD, p.down.DEPLOY[0]]).toEqual([0, 3, true, false]);
  });

  it("players rotate each ball and the game ends after three balls each", () => {
    const g = newGame(2);
    const order: string[] = [];
    while (!g.over) {
      order.push(`${g.current + 1}/${g.ball}`);
      drain(g, 60);
    }
    expect(order).toEqual(["1/1", "2/1", "1/2", "2/2", "1/3", "2/3"]);
  });

  it("extra balls are played straight away; a replay is held one at a time", () => {
    const g = newGame(1);
    const p = g.players[0];
    p.extraBalls = 1;
    expect(drain(g, 60)).toMatchObject({ msgs: ["Player 1 Shoot Again"], again: true });
    p.score = REPLAY_EVERY * 3 - 1;
    expect(hit(g, { kind: "bumper" })).toEqual(["Replay"]);
    expect(p.shootAgain).toBe(true);
    expect(drain(g, 60).again).toBe(true);
    expect(drain(g, 60).again).toBe(false);
    expect(g.ball).toBe(2);
  });

  it("plunger strength builds every 0.025 s up to the maximum; launch is ±10%", () => {
    expect(plungerStrength(0)).toBe(0);
    expect(plungerStrength(0.025)).toBe(1 / 40);
    expect(plungerStrength(5)).toBe(1);
    const full = launchSpeed(1, () => 0.5);
    expect(launchSpeed(1, () => 0)).toBeCloseTo(full * 0.9);
    expect(launchSpeed(1, () => 1)).toBeCloseTo(full * 1.1);
  });

  it("high scores keep five; a tie ranks below the older score", () => {
    let table = [500, 400, 300, 200, 100].map((score, i) => ({ name: `Old ${i}`, score }));
    expect(placeOf(table, 50)).toBe(-1);
    expect(placeOf(table, 100)).toBe(-1);
    const r = insertScore(table, { name: "Player 1", score: 300 });
    table = r.table;
    expect(r.at).toBe(3);
    expect(table.map((e) => e.name)).toEqual(["Old 0", "Old 1", "Old 2", "Player 1", "Old 3"]);
    expect(table).toHaveLength(TABLE_SIZE);
    expect(placeOf([], 0)).toBe(-1);
  });

  it("all three review lanes light Parallel jobs; a cache hole then starts the multiball", () => {
    const g = newGame(1);
    const p = g.players[0];
    hit(g, { kind: "rollover", i: 0 });
    shiftLanes(p, 1);
    expect(p.lanes).toEqual([false, true, false]);
    hit(g, { kind: "rollover", i: 1 }); // already lit after the shift: no change
    hit(g, { kind: "rollover", i: 0 });
    expect(hit(g, { kind: "rollover", i: 2 })).toContain("Parallel jobs ready");
    expect(p.lanes).toEqual(Array(LANES).fill(false));
    expect(hit(g, { kind: "cache" })).toContain("Parallel jobs!");
    expect([g.startMultiball, p.multiballLit]).toEqual([true, false]);
  });

  it("tickets close after their goal, pay, open the next, and every third is an extra ball", () => {
    const g = newGame(1);
    const p = g.players[0];
    for (let i = 0; i < TICKETS[0].goal - 1; i++) hit(g, { kind: "bumper" });
    const before = p.score;
    expect(hit(g, { kind: "bumper" })).toEqual(["Ticket closed: Fix flaky tests", "New ticket: Speed up the build"]);
    expect(p.score - before).toBe(POINTS.bumper + POINTS.ticket);
    hit(g, { kind: "orbit" }); // not this ticket's shot
    expect(p.progress).toBe(0);
    for (const i of [0, 1, 2]) hit(g, { kind: "target", bank: "BUILD", i });
    for (let i = 0; i < 3; i++) hit(g, { kind: "orbit" });
    expect([p.closed, p.extraBalls, TICKETS[p.ticket].name]).toEqual([3, 1, "Clear the cache"]);
  });

  it("staging: three smoke tests make staging green, pay by rank and close its ticket", () => {
    const g = newGame(1);
    const p = g.players[0];
    p.ticket = TICKETS.findIndex((t) => t.on === "staging");
    p.rank = 1;
    expect(hit(g, { kind: "stage" })).toEqual(["Deployed to staging"]);
    hit(g, { kind: "smoke", i: 0 });
    hit(g, { kind: "smoke", i: 0 }); // already lit
    hit(g, { kind: "smoke", i: 1 });
    const before = p.score;
    const msgs = hit(g, { kind: "smoke", i: 2 });
    expect(msgs).toContain("Staging is green! 50,000");
    expect(msgs).toContain("Ticket closed: Test on staging");
    expect(p.score - before).toBe(POINTS.smoke + POINTS.staging * 2 + POINTS.ticket * 2);
    expect(p.smoke).toEqual([false, false, false]);
  });
});
