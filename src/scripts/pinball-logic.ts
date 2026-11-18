// Pipeline Pinball rules: XP 3D Pinball's flow (balls, players, tilt, replay, ball save, high scores) on our own
// DevEx table. No DOM and no physics here; pinball-ui.ts reports what the ball hit and shows the messages.

export const RANKS = [
  "Intern",
  "Junior",
  "Medior",
  "Senior",
  "Staff",
  "Principal",
  "DevEx Engineer",
  "Platform Lead",
  "CTO",
] as const;
/** The Renovate bot orbit steps the field multiplier through these; one more orbit at ×10 is an extra ball. */
export const MULTIPLIERS = [1, 2, 3, 5, 10] as const;
export const BANKS = ["BUILD", "TEST", "DEPLOY"] as const;
export type Bank = (typeof BANKS)[number];
export const BALLS = 3;
/** Seconds after the launch in which a drain gives the ball back. */
export const BALL_SAVE = 15;
/** Seconds after a tilt before the ball is drained anyway. */
export const TILT_TIMEOUT = 30;
export const REPLAY_EVERY = 1_000_000;
export const POINTS = {
  bumper: 500,
  target: 1_000,
  bank: 5_000,
  orbit: 2_500,
  spin: 100,
  ramp: 5_000,
  stage: 5_000,
  pod: 1_000,
  smoke: 2_500,
  staging: 25_000,
  outlane: 2_000,
  jackpot: 100_000,
  rollover: 1_000,
  review: 10_000,
  cache: 5_000,
  ticket: 25_000,
} as const;

/** Code review rollover lanes at the top; all lit = approved, which lights Parallel jobs (multiball). */
export const LANES = 3;
/** Balls in play during Parallel jobs. */
export const MULTIBALL = 3;
/** Tickets are our missions: one is open at a time, in this order. Every third one closed is an extra ball. */
export const TICKETS = [
  { name: "Fix flaky tests", goal: 10, on: "bumper" },
  { name: "Speed up the build", goal: 1, on: "BUILD" },
  { name: "Bump dependencies", goal: 3, on: "orbit" },
  { name: "Clear the cache", goal: 2, on: "cache" },
  { name: "Fix the test suite", goal: 1, on: "TEST" },
  { name: "Roll out the chart", goal: 2, on: "spin" },
  { name: "Review the PR", goal: 1, on: "review" },
  { name: "Test on staging", goal: 1, on: "staging" },
  { name: "Ship it", goal: 1, on: "DEPLOY" },
] as const;
type TicketEvent = (typeof TICKETS)[number]["on"];

/** Plunger: strength builds one step every 0.025 s while the key is held, up to a maximum. */
export const PLUNGE_STEP = 0.025;
export const PLUNGE_STEPS = 40;
/** Launch speed range (table units per second) at no and at full strength. */
export const LAUNCH = [12, 34] as const;

/** Each nudge adds this to the tilt meter, which drains by TILT_DECAY a second. */
export const NUDGE = 0.4;
export const TILT_DECAY = 0.25;

export interface Player {
  score: number;
  /** Index into RANKS. Stays through a drain. */
  rank: number;
  /** Index into MULTIPLIERS; back to ×1 after each ball. */
  mult: number;
  /** Which drop targets are down, per bank. */
  down: Record<Bank, boolean[]>;
  /** Banks cleared since the last green pipeline. Progress lights: they stay through a drain. */
  lit: Record<Bank, boolean>;
  /** Bonus collected this ball, paid × multiplier on the drain. */
  bonus: number;
  extraBalls: number;
  /** A replay held: the next drain is played again. One at a time. */
  shootAgain: boolean;
  nextReplay: number;
  /** Smoke tests passed on the staging table. Stay through a drain. */
  smoke: boolean[];
  /** Code review lanes lit. Stay through a drain. */
  lanes: boolean[];
  /** The cache holes start Parallel jobs. */
  multiballLit: boolean;
  /** The open ticket (index into TICKETS), its progress and how many are closed. */
  ticket: number;
  progress: number;
  closed: number;
}

export interface Game {
  players: Player[];
  current: number;
  /** Ball number, 1–BALLS, shared by the rotation. */
  ball: number;
  over: boolean;
  tilt: number;
  lastNudge: number;
  tilted: boolean;
  /** Set by a hit that starts Parallel jobs; the table launches the extra balls and clears it. */
  startMultiball: boolean;
  /** The ball save gave this ball back already: once per ball. */
  saveUsed: boolean;
}

const fresh = (): Player => ({
  score: 0,
  rank: 0,
  mult: 0,
  down: { BUILD: [false, false, false], TEST: [false, false, false], DEPLOY: [false, false, false] },
  lit: { BUILD: false, TEST: false, DEPLOY: false },
  bonus: 0,
  extraBalls: 0,
  shootAgain: false,
  nextReplay: REPLAY_EVERY,
  lanes: [false, false, false],
  smoke: [false, false, false],
  multiballLit: false,
  ticket: 0,
  progress: 0,
  closed: 0,
});

export function newGame(players: number): Game {
  return {
    players: Array.from({ length: Math.min(4, Math.max(1, players)) }, fresh),
    current: 0,
    ball: 1,
    over: false,
    tilt: 0,
    lastNudge: 0,
    tilted: false,
    startMultiball: false,
    saveUsed: false,
  };
}

export const fmt = (n: number) => n.toLocaleString("en-US");
export const player = (g: Game) => g.players[g.current];
export const multiplier = (p: Player) => MULTIPLIERS[p.mult];
export const rampLit = (p: Player) => BANKS.every((b) => p.lit[b]);

function add(g: Game, points: number, msgs: string[]) {
  const p = player(g);
  p.score += points;
  while (p.score >= p.nextReplay) {
    p.nextReplay += REPLAY_EVERY;
    if (!p.shootAgain) {
      p.shootAgain = true;
      msgs.push("Replay");
    }
  }
}

/** The open ticket moves on when its kind of shot is made; closing it pays and opens the next one. */
function work(g: Game, on: TicketEvent, msgs: string[]) {
  const p = player(g);
  const t = TICKETS[p.ticket];
  if (t.on !== on || ++p.progress < t.goal) return;
  add(g, POINTS.ticket * (p.rank + 1), msgs);
  msgs.push(`Ticket closed: ${t.name}`);
  p.closed++;
  if (p.closed % 3 === 0) {
    p.extraBalls++;
    msgs.push("Extra Ball");
  }
  p.ticket = (p.ticket + 1) % TICKETS.length;
  p.progress = 0;
  msgs.push(`New ticket: ${TICKETS[p.ticket].name}`);
}

/** Lane change: the flipper keys move the lit review lanes one step left (-1) or right (1). */
export function shiftLanes(p: Player, dir: -1 | 1) {
  p.lanes = dir < 0 ? [...p.lanes.slice(1), p.lanes[0]] : [p.lanes[LANES - 1], ...p.lanes.slice(0, -1)];
}

export type Hit =
  | { kind: "bumper" }
  | { kind: "target"; bank: Bank; i: number }
  | { kind: "orbit" }
  | { kind: "spin"; n: number }
  | { kind: "ramp" }
  | { kind: "outlane" }
  | { kind: "rollover"; i: number }
  | { kind: "cache" }
  | { kind: "stage" }
  | { kind: "pod" }
  | { kind: "smoke"; i: number };

/** Score what the ball hit; returns the messages to show. A tilted table scores nothing. */
export function hit(g: Game, h: Hit): string[] {
  const msgs: string[] = [];
  if (g.over || g.tilted) return msgs;
  const p = player(g);
  const m = multiplier(p);
  switch (h.kind) {
    case "bumper":
      add(g, POINTS.bumper * m, msgs);
      p.bonus += POINTS.bumper / 5;
      work(g, "bumper", msgs);
      break;
    case "target": {
      const bank = p.down[h.bank];
      if (bank[h.i]) break;
      bank[h.i] = true;
      add(g, POINTS.target * m, msgs);
      p.bonus += POINTS.target;
      if (bank.every(Boolean)) {
        bank.fill(false);
        add(g, POINTS.bank * m, msgs);
        p.bonus += POINTS.bank;
        msgs.push(`${h.bank} passed`);
        work(g, h.bank, msgs);
        if (!p.lit[h.bank]) {
          p.lit[h.bank] = true;
          if (rampLit(p)) msgs.push("Green pipeline lit");
        }
      }
      break;
    }
    case "orbit":
      if (p.mult < MULTIPLIERS.length - 1) {
        p.mult++;
        msgs.push(`Renovate bot ×${multiplier(p)}`);
      } else {
        p.extraBalls++;
        msgs.push("Extra Ball");
      }
      add(g, POINTS.orbit * m, msgs);
      work(g, "orbit", msgs);
      break;
    case "spin":
      add(g, POINTS.spin * h.n * m, msgs);
      msgs.push("Helm upgrade");
      work(g, "spin", msgs);
      break;
    case "ramp":
      if (rampLit(p)) {
        const jackpot = POINTS.jackpot * (p.rank + 1) * m;
        for (const b of BANKS) p.lit[b] = false;
        msgs.push(`GREEN PIPELINE! Jackpot ${fmt(jackpot)}`);
        add(g, jackpot, msgs);
        if (p.rank < RANKS.length - 1) {
          p.rank++;
          msgs.push(`Promoted to ${RANKS[p.rank]}`);
        }
      } else add(g, POINTS.ramp * m, msgs);
      break;
    case "outlane":
      add(g, POINTS.outlane * m, msgs);
      msgs.push("Merge conflict");
      break;
    case "rollover":
      if (p.lanes[h.i]) break;
      p.lanes[h.i] = true;
      add(g, POINTS.rollover * m, msgs);
      if (p.lanes.every(Boolean)) {
        p.lanes.fill(false);
        add(g, POINTS.review * m, msgs);
        msgs.push("Code review approved");
        if (!p.multiballLit) msgs.push("Parallel jobs ready");
        p.multiballLit = true;
        work(g, "review", msgs);
      }
      break;
    case "stage":
      add(g, POINTS.stage * m, msgs);
      msgs.push("Deployed to staging");
      break;
    case "pod":
      add(g, POINTS.pod * m, msgs);
      p.bonus += POINTS.pod / 5;
      break;
    case "smoke":
      if (p.smoke[h.i]) break;
      p.smoke[h.i] = true;
      add(g, POINTS.smoke * m, msgs);
      if (p.smoke.every(Boolean)) {
        p.smoke.fill(false);
        const pay = POINTS.staging * (p.rank + 1) * m;
        add(g, pay, msgs);
        p.bonus += POINTS.staging / 5;
        msgs.push(`Staging is green! ${fmt(pay)}`);
        work(g, "staging", msgs);
      }
      break;
    case "cache":
      add(g, POINTS.cache * m, msgs);
      msgs.push("Cache hit");
      work(g, "cache", msgs);
      if (p.multiballLit) {
        p.multiballLit = false;
        g.startMultiball = true;
        msgs.push("Parallel jobs!");
      }
      break;
  }
  return msgs;
}

export type TiltLevel = "ok" | "careful" | "tilt";

/** One shove of the table at time `now` (seconds). Above 0.5: careful; above 1.0: tilt. */
export function nudge(g: Game, now: number): TiltLevel {
  g.tilt = Math.max(0, g.tilt - (now - g.lastNudge) * TILT_DECAY) + NUDGE;
  g.lastNudge = now;
  if (g.tilt > 1) g.tilted = true;
  return g.tilted ? "tilt" : g.tilt > 0.5 ? "careful" : "ok";
}

export interface Drain {
  msgs: string[];
  bonus: number;
  /** The same player plays again (ball save, extra ball or replay). */
  again: boolean;
}

/** The ball went down the middle (or was drained by a tilt) `ballTime` seconds after its launch. */
export function drain(g: Game, ballTime: number): Drain {
  const p = player(g);
  const who = `Player ${g.current + 1}`;
  const tilted = g.tilted;
  g.tilt = 0;
  g.tilted = false;
  g.saveUsed = !tilted && !g.saveUsed && ballTime < BALL_SAVE;
  if (g.saveUsed) return { msgs: [`${who} Shoot Again`], bonus: 0, again: true };
  const msgs: string[] = [];
  const bonus = tilted ? 0 : p.bonus * multiplier(p);
  if (bonus) {
    msgs.push(`Bonus ${fmt(bonus)}`);
    add(g, bonus, msgs);
  }
  // the table resets, except the rank and the progress lights
  p.mult = 0;
  p.bonus = 0;
  for (const b of BANKS) p.down[b].fill(false);
  if (p.extraBalls > 0 || p.shootAgain) {
    if (p.extraBalls > 0) p.extraBalls--;
    else p.shootAgain = false;
    msgs.push(`${who} Shoot Again`);
    return { msgs, bonus, again: true };
  }
  g.current = (g.current + 1) % g.players.length;
  if (g.current === 0) g.ball++;
  if (g.ball > BALLS) {
    g.over = true;
    g.ball = BALLS;
    msgs.push("Game Over");
  } else if (g.players.length > 1) msgs.push(`Player ${g.current + 1}`);
  return { msgs, bonus, again: false };
}

export const plungerStrength = (held: number) =>
  Math.min(PLUNGE_STEPS, Math.floor(held / PLUNGE_STEP + 1e-9)) / PLUNGE_STEPS;

/** Launch speed for a plunger strength 0–1, with ±10% randomness (`rnd` returns 0–1). */
export const launchSpeed = (strength: number, rnd: () => number) =>
  (LAUNCH[0] + (LAUNCH[1] - LAUNCH[0]) * strength) * (0.9 + 0.2 * rnd());

export interface Entry {
  name: string;
  score: number;
}
export const TABLE_SIZE = 5;

/** Where a score would go in the high-score table (a tie ranks below the older score), or -1. */
export function placeOf(table: Entry[], score: number): number {
  if (score <= 0) return -1;
  const at = table.findIndex((e) => score > e.score);
  const i = at < 0 ? table.length : at;
  return i < TABLE_SIZE ? i : -1;
}

export function insertScore(table: Entry[], e: Entry): { table: Entry[]; at: number } {
  const at = placeOf(table, e.score);
  if (at < 0) return { table, at };
  return { table: [...table.slice(0, at), e, ...table.slice(at)].slice(0, TABLE_SIZE), at };
}

// ---------- Player Controls and the message queue ----------
/** Keys a control can't use: the menu's F-keys, and modifiers (a press with Ctrl, Alt or ⌘ is left to the browser). */
const RESERVED = /^(F\d+|Control|Alt|AltGraph|Meta|Shift|OS)$/;
/** The same key whatever the Shift or Caps Lock state ("A" is "a"). */
export const sameKey = (a: string, b: string) =>
  (a.length === 1 ? a.toLowerCase() : a) === (b.length === 1 ? b.toLowerCase() : b);

/** Player Controls: `action` gets `key`, and a control that already had that key gets `action`'s old one, so no two
 *  controls share a key. false (nothing changes) for a key no control may use. */
export function bindKey<A extends string>(keys: Record<A, string>, action: A, key: string): boolean {
  if (RESERVED.test(key)) return false;
  const other = (Object.keys(keys) as A[]).find((a) => a !== action && sameKey(keys[a], key));
  if (other) keys[other] = keys[action];
  keys[action] = key;
  return true;
}

/** Messages waiting at most: the one on screen and the newest ones. */
export const MESSAGES_KEPT = 4;
/** Fast repeats (orbit, spinner) mustn't push news like Extra Ball seconds behind the game: drop the oldest waiting. */
export function trimMessages(queue: unknown[]) {
  if (queue.length > MESSAGES_KEPT) queue.splice(1, queue.length - MESSAGES_KEPT);
}
