// Pipeline Pinball's table: everything in table units (10 wide, 18 long, y towards the player), shared by the
// physics and the 3D drawing. Our own layout, themed on Kristóf's DevEx work.
import { BANKS, type Bank } from "./pinball-logic";

export const COLORS: Record<Bank, string> = { BUILD: "#3d8bfd", TEST: "#f0b429", DEPLOY: "#c77dff" };
export const BANK_LIST = BANKS;
// ---------- the table, in table units (10 × 18, y down) ----------
export const W = 10;
export const H = 18;
export const R = 0.22;
export const STEP = 1 / 240; // small steps: a flipper tip moves less than a ball radius per step
export const PLUNGER = { x: 9.35, y: H - 1.1 };
export type P = { x: number; y: number };
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
const mirror = (ps: P[]) => ps.map((p) => ({ x: 9.3 - p.x, y: p.y }));
// the inlane guide: a narrow outlane (merge conflict) outside it, starting low, with a rubber post on top
const INLANE: P[] = [
  { x: 0.8, y: 13.1 },
  { x: 0.8, y: 14.7 },
  // ends inside the flipper's round pivot, so there is no pocket between them for the ball to sit in
  { x: 2.86, y: 15.64 },
];
export const WALLS: P[][] = [
  [{ x: 0.3, y: H }, ...arc(5, 5, 4.7, Math.PI, 2 * Math.PI, 32), { x: 9.7, y: H }],
  [
    { x: 9, y: H },
    { x: 9, y: 6 },
  ],
  [
    { x: 1.35, y: 7.4 },
    { x: 1.35, y: 4.6 },
  ], // Renovate orbit lane
  [
    { x: 7.95, y: 8 },
    { x: 7.95, y: 5 },
  ], // Helm spinner lane
  [
    { x: 5.5, y: 4.2 },
    { x: 5.5, y: 3.4 },
  ], // green pipeline ramp entrance
  [
    { x: 6.5, y: 4.2 },
    { x: 6.5, y: 3.4 },
  ],
  // code review rollover lanes
  ...[2.3, 3.1, 3.9, 4.7].map((x) => [
    { x, y: 1.95 },
    { x, y: 2.6 },
  ]),
  INLANE,
  mirror(INLANE),
];
export const GATE: [P, P] = [
  { x: 9.02, y: 5.95 },
  { x: 9.68, y: 5.2 },
];
const SLING: P[] = [
  { x: 1.85, y: 12.9 },
  { x: 1.85, y: 14.4 },
  { x: 2.55, y: 14.85 },
];
export const SLINGS = [SLING, mirror(SLING)];
/** Rubber posts on top of the inlane guides: they bounce a ball coming down the side back towards the middle. */
// on the inlane side of the guide's top, so the outlane beside it stays 0.5 wide (the ball is 0.44)
export const POSTS: P[] = [
  { x: 0.92, y: 13.1 },
  { x: 9.3 - 0.92, y: 13.1 },
];
export const POST_R = 0.1;
/** Rubber kickers on the outer walls just above the outlanes: a ball sliding down a wall is kicked back in. */
export const KICKERS = [
  { a: { x: 0.31, y: 11.4 }, b: { x: 0.31, y: 12.9 }, dir: 1 },
  { a: { x: 8.99, y: 11.4 }, b: { x: 8.99, y: 12.9 }, dir: -1 },
];
export const BUMPERS: P[] = [
  { x: 2.7, y: 4.5 },
  { x: 4.1, y: 3.7 },
  { x: 3.8, y: 5.6 },
];
export const BUMPER_R = 0.45;
export type Target = { bank: Bank; i: number; x: number; y: number; hw: number; hh: number };
export const TARGETS: Target[] = [
  ...[8.4, 9.1, 9.8].map((y, i) => ({ bank: "BUILD" as Bank, i, x: 0.4, y, hw: 0.08, hh: 0.28 })),
  ...[3.6, 4.3, 5.0].map((x, i) => ({ bank: "TEST" as Bank, i, x, y: 8.4, hw: 0.28, hh: 0.08 })),
  ...[8.9, 9.6, 10.3].map((y, i) => ({ bank: "DEPLOY" as Bank, i, x: 8.9, y, hw: 0.08, hh: 0.28 })),
];
export const SENSORS: { tag: string; x: number; y: number; hw: number; hh: number }[] = [
  { tag: "orbit", x: 0.82, y: 6, hw: 0.5, hh: 0.1 },
  { tag: "spinner", x: 8.47, y: 5.6, hw: 0.5, hh: 0.1 },
  { tag: "ramp", x: 6, y: 3.7, hw: 0.5, hh: 0.1 },
  { tag: "outlane", x: 0.55, y: 15.2, hw: 0.24, hh: 0.1 },
  { tag: "outlane", x: 8.75, y: 15.2, hw: 0.24, hh: 0.1 },
  { tag: "drain", x: 4.65, y: H - 0.2, hw: 4.35, hh: 0.1 },
];
/** A ramp: a raised channel (its own physics layer, so a ball on it only touches it), its centre line, the
 *  height of its floor at each point of that line, and its two side walls. */
export interface Ramp {
  name: string;
  path: P[];
  heights: number[];
  half: number;
  sides: P[][];
  end: P;
  /** Sensor tag at the far end, where the ball comes back onto the field and the shot scores. */
  tag: "rampEnd" | "chuteEnd";
}
function ramp(name: string, path: P[], heights: number[], half: number, end: P, tag: Ramp["tag"]): Ramp {
  const sides = [-1, 1].map((side) =>
    path.map((p, i) => {
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: p.x + (side * half * (a.y - b.y)) / l, y: p.y + (side * half * (b.x - a.x)) / l };
    }),
  );
  return { name, path, heights, half, sides, end, tag };
}
const GREEN_PATH: P[] = [
  { x: 6, y: 4.2 },
  { x: 6, y: 2.4 },
  ...arc(6.95, 2.4, 0.95, Math.PI, 2 * Math.PI, 14).slice(1),
  { x: 7.9, y: 6 },
  { x: 7.85, y: 9 },
  { x: 7.75, y: 12 },
];
/** Up the lane to full height, across the top, then down towards a flipper. */
const rise = (path: P[], top: number, bottom: number) =>
  path.map((p, i) => (i === 0 ? 0.05 : p.y > top ? 0.1 + (0.9 * (bottom - p.y)) / (bottom - top) : 1));
export const RAMPS: Ramp[] = [
  // the green pipeline: up the lane right of the middle, over the top right, down into the right inlane
  ramp("GREEN PIPELINE", GREEN_PATH, rise(GREEN_PATH, 6, 12), 0.48, { x: 7.76, y: 11.6 }, "rampEnd"),
  // the chute from the staging table's drain down into the left inlane
  ramp(
    "",
    [
      { x: 2.6, y: 6.8 },
      { x: 2.6, y: 7.2 },
      { x: 2.1, y: 7.7 },
      { x: 1.7, y: 8.6 },
      { x: 1.6, y: 11.5 },
      { x: 1.55, y: 12.2 },
    ],
    [1.3, 1.22, 1.05, 0.85, 0.2, 0.1],
    0.42,
    { x: 1.57, y: 11.8 },
    "chuteEnd",
  ),
];
/** Rollover sensors between the lane posts, and the two kickout holes with the way they shoot out. */
export const LANE_X = [2.7, 3.5, 4.3];
export const CACHES = [
  { x: 2.55, y: 11, out: { x: 0.42, y: -1 } },
  { x: 6.75, y: 11, out: { x: -0.42, y: -1 } },
];
/** Printed playfield art: circuit traces with pads at their ends. */
export const TRACES: P[][] = [
  [
    { x: 2.2, y: 11.2 },
    { x: 2.2, y: 9.8 },
    { x: 2.9, y: 9.1 },
    { x: 2.9, y: 8.9 },
  ],
  [
    { x: 7.1, y: 11.2 },
    { x: 7.1, y: 9.6 },
    { x: 6.4, y: 8.9 },
    { x: 5.6, y: 8.9 },
  ],
  [
    { x: 3.3, y: 13.3 },
    { x: 4.1, y: 13.3 },
    { x: 4.6, y: 13.8 },
    { x: 4.6, y: 14.6 },
  ],
  [
    { x: 6.1, y: 13.3 },
    { x: 5.3, y: 13.3 },
    { x: 4.9, y: 12.9 },
  ],
  [
    { x: 4.9, y: 6.6 },
    { x: 5.6, y: 6.6 },
    { x: 6.3, y: 7.3 },
    { x: 7.2, y: 7.3 },
  ],
  [
    { x: 2.4, y: 2.6 },
    { x: 3.1, y: 2.6 },
    { x: 3.6, y: 2.1 },
    { x: 4.6, y: 2.1 },
  ],
  [
    { x: 1.9, y: 5.2 },
    { x: 1.9, y: 3.8 },
  ],
  [
    { x: 7.2, y: 2.4 },
    { x: 7.2, y: 4.3 },
    { x: 6.9, y: 4.6 },
  ],
];
export const FLIP_LEN = 1.6;
export const REST = 0.52;
export const FLIPPERS = [
  { pivot: { x: 2.9, y: 15.8 }, dir: 1 },
  { pivot: { x: 6.4, y: 15.8 }, dir: -1 },
];
export const WALL_BITS = 4; // flippers only hit the ball, not the walls around their pivots
export const RAMP_BITS = 8; // a ball on the ramp only touches the ramp
export const STAGE_BITS = 16; // a ball up on the staging table only touches that table
export const FIELD_MASK = 0xffff & ~RAMP_BITS & ~STAGE_BITS;

// ---------- lamp inserts in the playfield (lit by the rules; drawn as glowing plastic) ----------
export const disc = (x: number, y: number, r: number): P[] => arc(x, y, r, 0, 2 * Math.PI, 24).slice(1);
/** An arrow insert pointing at angle `a` (0 = up the table), size `s`. */
export const arrow = (x: number, y: number, a: number, s = 0.45): P[] =>
  [
    [0, -1],
    [0.8, 0.6],
    [0, 0.15],
    [-0.8, 0.6],
  ].map(([u, v]) => ({
    x: x + s * (u * Math.cos(a) - v * Math.sin(a)),
    y: y + s * (u * Math.sin(a) + v * Math.cos(a)),
  }));
const chevron = (x: number, y: number): P[] => [
  { x: x - 0.4, y: y - 0.4 },
  { x: x + 0.15, y: y - 0.4 },
  { x: x + 0.45, y },
  { x: x + 0.15, y: y + 0.4 },
  { x: x - 0.4, y: y + 0.4 },
  { x: x - 0.1, y },
];
export interface LampDef {
  id: string;
  shape: P[];
  /** A ring: the inside is cut out. */
  hole?: P[];
  color: string;
}
export const MULT_Y = [5.15, 5.65, 6.15, 6.65];
export const TICKET_LAMPS = 10;
export const LAMPS: LampDef[] = [
  ...MULT_Y.map((y, i) => ({ id: `mult${i}`, shape: disc(0.82, y, 0.21), color: "#7dff9b" })),
  { id: "orbit", shape: arrow(0.82, 7.85, 0, 0.32), color: "#7dff9b" },
  { id: "spinner", shape: arrow(8.47, 8.45, 0, 0.3), color: "#7fd8ff" },
  ...[0, 1, 2].map((k) => ({ id: `green${k}`, shape: arrow(6, 4.75 + k * 0.55, 0, 0.3), color: "#2ee86f" })),
  ...[0, 1].map((k) => ({ id: `lift${k}`, shape: arrow(2.75, 8.75 + k * 0.5, 0, 0.28), color: "#7fd8ff" })),
  ...LANE_X.map((x, i) => ({ id: `lane${i}`, shape: disc(x, 2.95, 0.16), color: "#ffd84d" })),
  ...CACHES.map((h, i) => ({
    id: `cache${i}`,
    shape: disc(h.x, h.y, 0.5),
    hole: disc(h.x, h.y, 0.36),
    color: "#ff5ad1",
  })),
  ...BANKS.map((b, i) => ({ id: `stage${i}`, shape: chevron(3.75 + i * 0.9, 12.15), color: COLORS[b] })),
  ...Array.from({ length: TICKET_LAMPS }, (_, i) => ({
    id: `ticket${i}`,
    shape: disc(3.3 + i * 0.3, 13.35, 0.1),
    color: "#5ad1ff",
  })),
  { id: "again", shape: disc(4.65, 16.05, 0.2), color: "#ff4d4d" },
];

/** The apron across the bottom: the ball drains under it. */
export const APRON: P[] = [
  { x: 0.3, y: 16.95 },
  { x: 3.4, y: 17.45 },
  { x: 5.9, y: 17.45 },
  { x: 9, y: 16.95 },
  { x: 9, y: H },
  { x: 0.3, y: H },
];

// ---------- the staging table: a small raised table over the top left, with its own flippers ----------
export const STAGE_H = 1.3;
/** Its wall, an open chain from the left flipper round the top to the right flipper (the gap is the drain). */
export const STAGE_WALL: P[] = [
  { x: 1.25, y: 6.08 },
  { x: 0.65, y: 5.7 },
  ...arc(5, 5, 4.35, Math.PI, 4.62, 18),
  { x: 4.6, y: 5.7 },
  { x: 3.95, y: 6.08 },
];
export const STAGE_FLIP_LEN = 0.95;
export const STAGE_FLIPPERS = [
  { pivot: { x: 1.35, y: 6.15 }, dir: 1 },
  { pivot: { x: 3.85, y: 6.15 }, dir: -1 },
];
/** Pods: small bumpers. Smoke tests: three standup targets on the right wall. */
export const PODS: P[] = [
  { x: 1.7, y: 2.9 },
  { x: 3.3, y: 2.4 },
  { x: 2.4, y: 4.0 },
];
export const POD_R = 0.26;
export const SMOKE = [2.2, 2.9, 3.6].map((y) => ({ x: 4.5, y, hw: 0.06, hh: 0.22 }));
/** All along under the staging table: a ball that drops off it (mostly between the flippers) goes down the chute. */
export const STAGE_DRAIN = { x: 2.62, y: 6.95, hw: 2.0, hh: 0.12 };
/** The lift on the main table that takes the ball up, and where it comes out on top. */
export const LIFT = { x: 2.75, y: 7.9 };
export const STAGE_ENTRY = { x: 3.9, y: 1.5 };
