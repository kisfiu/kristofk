// Renovator XP: one wall as a grid of cells; each cell holds the last layer put on it.
export const COLS = 32,
  ROWS = 20;
/** The wall check (and the patches) use a coarse grid: one coarse cell = 2×2 wall cells. */
export const GW = COLS / 2,
  GH = ROWS / 2;
export const BUDGET = 150_000;

export const L = {
  OLD: 0,
  BARE: 1,
  DUSTY: 2,
  BRICK: 3,
  DEEP: 4,
  HARD: 5,
  PUTTY1: 6,
  PUTTY2: 7,
  SANDED: 8,
  PRIMER: 9,
  PAINT1: 10,
  PAINT2: 11,
} as const;

export type Tool =
  | "hammer"
  | "scraper"
  | "chisel"
  | "broom"
  | "deepPrimer"
  | "trowel"
  | "putty"
  | "sander"
  | "primer"
  | "paint";

/** `early`: what happens when the tool is used before its turn. */
export const TOOLS: Record<Tool, { name: string; early: string; penalty: number }> = {
  hammer: { name: "Hammer", early: "", penalty: 0 },
  scraper: {
    name: "Scraper",
    early: "You started scraping before checking the walls. Now nobody knows where the plaster is hollow.",
    penalty: 5_000,
  },
  chisel: {
    name: "Chisel",
    early: "You chiselled out a piece of perfectly good plaster. Now that needs fixing too.",
    penalty: 10_000,
  },
  broom: { name: "Broom", early: "You swept a clean floor. The neighbours watched from the gang.", penalty: 2_000 },
  deepPrimer: {
    name: "Deep-penetration primer",
    early: "Deep primer on the wrong surface just soaks into nothing. A bucket wasted.",
    penalty: 8_000,
  },
  trowel: {
    name: "Trowel + hard plaster",
    early: "Fresh plaster on a bad base. It fell off by the evening.",
    penalty: 12_000,
  },
  putty: { name: "Putty knife", early: "Putty over a broken wall? It cracked again within a month.", penalty: 15_000 },
  sander: { name: "Sanding block", early: "Sanding now just makes dust. Lots of dust. Everywhere.", penalty: 3_000 },
  primer: { name: "Primer roller", early: "Primer on an unfinished wall. That's money in the bin.", penalty: 12_000 },
  paint: {
    name: "Paint roller",
    early: "You painted over the old wall. Lovely for a week, then it peeled off.",
    penalty: 25_000,
  },
};

export const STEPS = [
  "Check the walls",
  "Scrape the paint",
  "Fix the bad plaster",
  "Putty 2×",
  "Sand",
  "Prime + paint 2×",
];

/** Which mini-game a job is played with (see renovation-ui.ts). */
export type MiniGame = "sweeper" | "peel" | "chisel" | "dust" | "soak" | "timing" | "steady" | "sand" | "roller";

interface Job {
  step: number;
  tool: Tool;
  game: MiniGame;
  /** Shouted in the banner before the mini-game, WarioWare-style. */
  shout: string;
  to: number;
  /** Only the hollow patches, not the whole wall. */
  patch?: boolean;
  cost: number;
  /** Seconds the wall stays wet afterwards. */
  dries?: number;
  done: string;
}

export const JOBS: Job[] = [
  { step: 0, tool: "hammer", game: "sweeper", shout: "KNOCK!", to: L.OLD, cost: 0, done: "All hollow spots marked." },
  {
    step: 1,
    tool: "scraper",
    game: "peel",
    shout: "PEEL!",
    to: L.BARE,
    cost: 3_000,
    done: "Old paint is off.",
  },
  {
    step: 2,
    tool: "chisel",
    game: "chisel",
    shout: "CHISEL!",
    to: L.DUSTY,
    patch: true,
    cost: 0,
    done: "Bad plaster is out, down to the bricks.",
  },
  {
    step: 2,
    tool: "broom",
    game: "dust",
    shout: "SWEEP!",
    to: L.BRICK,
    patch: true,
    cost: 0,
    done: "Dust and rubble cleaned up.",
  },
  {
    step: 2,
    tool: "deepPrimer",
    game: "soak",
    shout: "SOAK IT!",
    to: L.DEEP,
    patch: true,
    cost: 8_000,
    done: "Bricks primed.",
  },
  {
    step: 2,
    tool: "trowel",
    game: "timing",
    shout: "PLASTER!",
    to: L.HARD,
    patch: true,
    cost: 12_000,
    dries: 4,
    done: "Holes plastered.",
  },
  {
    step: 3,
    tool: "putty",
    game: "steady",
    shout: "STEADY!",
    to: L.PUTTY1,
    cost: 15_000,
    dries: 3,
    done: "First putty coat on.",
  },
  {
    step: 3,
    tool: "putty",
    game: "steady",
    shout: "STEADY!",
    to: L.PUTTY2,
    cost: 15_000,
    dries: 3,
    done: "Second putty coat on.",
  },
  {
    step: 4,
    tool: "sander",
    game: "sand",
    shout: "SAND!",
    to: L.SANDED,
    cost: 4_000,
    done: "Smooth as an egg.",
  },
  { step: 5, tool: "primer", game: "roller", shout: "ROLL!", to: L.PRIMER, cost: 12_000, dries: 2, done: "Primed." },
  {
    step: 5,
    tool: "paint",
    game: "roller",
    shout: "PAINT!",
    to: L.PAINT1,
    cost: 25_000,
    dries: 3,
    done: "First coat of paint on.",
  },
  {
    step: 5,
    tool: "paint",
    game: "roller",
    shout: "PAINT!",
    to: L.PAINT2,
    cost: 25_000,
    done: "Second coat on. Done!",
  },
];

export const MATERIALS = JOBS.reduce((s, j) => s + j.cost, 0);
const WET_PENALTY = 5_000;
const LATE_PENALTY = 2_000;
export const HINT_COST = 1_000;

export interface Game {
  cells: Uint8Array;
  /** Hollow patch id per wall cell, -1 for sound plaster. */
  patch: Int8Array;
  /** Per coarse cell: 1 = hollow. */
  hollow: Uint8Array;
  /** Per coarse cell: 0 = not checked, 1 = knocked (sound), 2 = marked hollow. */
  known: Uint8Array;
  job: number;
  paid: number;
  budget: number;
  wetUntil: number;
  mistakes: number;
  /** Lumps left by sloppy plastering and putty; they turn into bumps to sand. */
  bumps: number;
}

export const OPEN = 1,
  MARK = 2;

/** Six small hollow spots: spread out enough to make the knock-sweeper a real puzzle. */
export function newGame(rnd: () => number = Math.random, patches = 6): Game {
  const cpatch = new Int8Array(GW * GH).fill(-1);
  for (let n = 0; n < patches; ) {
    const w = 1 + Math.floor(rnd() * 2);
    const h = 1 + Math.floor(rnd() * 2);
    const x = Math.floor(rnd() * (GW - w + 1));
    const y = Math.floor(rnd() * (GH - h + 1));
    const rect = (pad: number) => {
      const out: number[] = [];
      for (let yy = Math.max(0, y - pad); yy < Math.min(GH, y + h + pad); yy++)
        for (let xx = Math.max(0, x - pad); xx < Math.min(GW, x + w + pad); xx++) out.push(yy * GW + xx);
      return out;
    };
    if (rect(1).some((i) => cpatch[i] >= 0)) continue; // keep patches apart so each one is its own find
    for (const i of rect(0)) cpatch[i] = n;
    n++;
  }
  const patch = new Int8Array(COLS * ROWS);
  for (let i = 0; i < patch.length; i++) patch[i] = cpatch[coarse(i)];
  return {
    cells: new Uint8Array(COLS * ROWS),
    patch,
    hollow: Uint8Array.from(cpatch, (p) => (p >= 0 ? 1 : 0)),
    known: new Uint8Array(GW * GH),
    job: 0,
    paid: 0,
    budget: BUDGET,
    wetUntil: 0,
    mistakes: 0,
    bumps: 0,
  };
}

/** Coarse cell index of a wall cell. */
export const coarse = (i: number) => Math.floor(Math.floor(i / COLS) / 2) * GW + Math.floor((i % COLS) / 2);
/** The four wall cells of a coarse cell. */
export const fine = (c: number) => {
  const x = (c % GW) * 2;
  const y = Math.floor(c / GW) * 2;
  return [y * COLS + x, y * COLS + x + 1, (y + 1) * COLS + x, (y + 1) * COLS + x + 1];
};

export const finished = (g: Game) => g.job >= JOBS.length;
export const stepOf = (g: Game) => (finished(g) ? STEPS.length : JOBS[g.job].step);
export const wet = (g: Game, now: number) => now < g.wetUntil;

/** Wall cells a job works on. */
export const targets = (g: Game, j = JOBS[g.job]) => {
  const out: number[] = [];
  for (let i = 0; i < g.cells.length; i++) if (!j.patch || g.patch[i] >= 0) out.push(i);
  return out;
};

export type Start = { ok: true } | { ok: false; text: string; cost: number };

export function penalize(g: Game, cost: number) {
  if (cost <= 0) return;
  g.budget -= cost;
  g.mistakes++;
}

/** Touch the wall with a tool. Wrong tool or wet wall costs money and changes nothing. */
export function start(g: Game, tool: Tool, now: number): Start {
  if (finished(g)) return { ok: false, text: "The room is finished. Put the kettle on!", cost: 0 };
  const fail = (text: string, cost: number): Start => {
    penalize(g, cost);
    return { ok: false, text, cost };
  };
  if (wet(g, now)) return fail("The wall is still wet! You left marks in it and had to redo a patch.", WET_PENALTY);
  const j = JOBS[g.job];
  if (tool !== j.tool) {
    const early = JOBS.some((x, i) => i > g.job && x.tool === tool);
    return early
      ? fail(TOOLS[tool].early, TOOLS[tool].penalty)
      : fail(`${TOOLS[tool].name}? That part is already done. Half an hour lost.`, LATE_PENALTY);
  }
  if (g.paid <= g.job) {
    g.budget -= j.cost;
    g.paid = g.job + 1;
  }
  return { ok: true };
}

/** End the current mini-game: whatever the player missed is finished off, and the wall may need to dry. */
export function finishJob(g: Game, now: number) {
  const j = JOBS[g.job];
  for (const i of targets(g, j)) g.cells[i] = Math.max(g.cells[i], j.to);
  if (j.game === "sweeper") for (let c = 0; c < g.known.length; c++) if (g.hollow[c]) g.known[c] = MARK;
  if (j.dries) g.wetUntil = now + j.dries * 1000;
  g.job++;
}

export function hint(g: Game) {
  g.budget -= HINT_COST;
  return TOOLS[JOBS[g.job].tool].name;
}

export const stars = (g: Game, seconds: number) => (g.budget >= 20_000 && seconds <= 300 ? 3 : g.budget >= 0 ? 2 : 1);
