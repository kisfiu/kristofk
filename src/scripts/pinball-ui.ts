// Pipeline Pinball: the table (planck.js physics, canvas drawing), keys and touch buttons, menus and dialogs.
// The rules live in pinball-logic.ts. Loaded on the window's first open (lazy.ts), so planck stays out of startup.
import {
  Box,
  Chain,
  Circle,
  type Contact,
  Edge,
  type Fixture,
  type FixtureOpt,
  Polygon,
  RevoluteJoint,
  type Shape,
  World,
} from "planck";
import { initMenuBar } from "./menubar";
import {
  BALL_SAVE,
  BANKS,
  type Bank,
  type Entry,
  fmt,
  type Game,
  type Hit,
  insertScore,
  launchSpeed,
  MULTIPLIERS,
  newGame,
  nudge,
  player,
  plungerStrength,
  RANKS,
  rampLit,
  TILT_TIMEOUT,
  drain as toDrain,
  hit as toHit,
} from "./pinball-logic";
import { load, save } from "./scores";

type Action = "left" | "right" | "plunger" | "nudgeR" | "nudgeL" | "nudgeU";
const ACTIONS: [Action, string][] = [
  ["left", "Left flipper"],
  ["right", "Right flipper"],
  ["plunger", "Plunger"],
  ["nudgeR", "Nudge right"],
  ["nudgeL", "Nudge left"],
  ["nudgeU", "Nudge up"],
];
const DEFAULT_KEYS: Record<Action, string> = {
  left: "z",
  right: "/",
  plunger: " ",
  nudgeR: "x",
  nudgeL: ".",
  nudgeU: "ArrowUp",
};
const OPTS = "kk-pinball";
const SCORES = "kk-pinball-scores";
const keyName = (k: string) =>
  ({ " ": "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" })[k] ??
  (k.length === 1 ? k.toUpperCase() : k);
const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);

// ---------- the table, in table units (10 × 18, y down) ----------
const W = 10;
const H = 18;
const R = 0.22;
const STEP = 1 / 120;
const PLUNGER = { x: 9.35, y: H - 1.1 };
type P = { x: number; y: number };
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
const mirror = (ps: P[]) => ps.map((p) => ({ x: 9.3 - p.x, y: p.y }));
const INLANE: P[] = [
  { x: 1.2, y: 12.4 },
  { x: 1.2, y: 14.7 },
  { x: 2.72, y: 15.62 },
];
const WALLS: P[][] = [
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
    { x: 5.4, y: 4.2 },
    { x: 5.4, y: 2.3 },
  ], // green pipeline lane
  [
    { x: 6.6, y: 4.2 },
    { x: 6.6, y: 2.3 },
  ],
  INLANE,
  mirror(INLANE),
];
const GATE: [P, P] = [
  { x: 9.02, y: 5.95 },
  { x: 9.68, y: 5.2 },
];
const SLING: P[] = [
  { x: 1.85, y: 12.9 },
  { x: 1.85, y: 14.4 },
  { x: 2.55, y: 14.85 },
];
const SLINGS = [SLING, mirror(SLING)];
const BUMPERS: P[] = [
  { x: 2.7, y: 4.5 },
  { x: 4.1, y: 3.7 },
  { x: 3.8, y: 5.6 },
];
const BUMPER_R = 0.45;
type Target = { bank: Bank; i: number; x: number; y: number; hw: number; hh: number };
const TARGETS: Target[] = [
  ...[8.4, 9.1, 9.8].map((y, i) => ({ bank: "BUILD" as Bank, i, x: 0.4, y, hw: 0.08, hh: 0.28 })),
  ...[3.2, 3.9, 4.6].map((x, i) => ({ bank: "TEST" as Bank, i, x, y: 8.4, hw: 0.28, hh: 0.08 })),
  ...[8.9, 9.6, 10.3].map((y, i) => ({ bank: "DEPLOY" as Bank, i, x: 8.9, y, hw: 0.08, hh: 0.28 })),
];
const SENSORS: { tag: string; x: number; y: number; hw: number; hh: number }[] = [
  { tag: "orbit", x: 0.82, y: 6, hw: 0.5, hh: 0.1 },
  { tag: "spinner", x: 8.47, y: 5.6, hw: 0.5, hh: 0.1 },
  { tag: "ramp", x: 6, y: 3.2, hw: 0.55, hh: 0.1 },
  { tag: "outlane", x: 0.75, y: 15.2, hw: 0.42, hh: 0.1 },
  { tag: "outlane", x: 8.55, y: 15.2, hw: 0.42, hh: 0.1 },
  { tag: "drain", x: 4.65, y: H - 0.2, hw: 4.35, hh: 0.1 },
];
/** Printed playfield art: circuit traces with pads at their ends. */
const TRACES: P[][] = [
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
const FLIP_LEN = 1.55;
const REST = 0.52;
const FLIPPERS = [
  { pivot: { x: 2.9, y: 15.8 }, dir: 1 },
  { pivot: { x: 6.4, y: 15.8 }, dir: -1 },
];
const WALL_BITS = 4; // flippers only hit the ball, not the walls around their pivots

// ---------- sounds: own tiny Web Audio, so the pinball's Sounds and Music items work on their own ----------
let audio: AudioContext | null = null;
function tone(freq: number, ms: number, wave: OscillatorType, at = 0, vol = 0.07) {
  audio ??= new AudioContext();
  const t = audio.currentTime + at;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + ms / 1000);
}
const SOUNDS = {
  bumper: () => tone(660, 50, "square"),
  target: () => tone(330, 60, "triangle"),
  launch: () => tone(140, 160, "sawtooth"),
  drain: () =>
    [300, 220, 150].forEach((f, i) => {
      tone(f, 160, "square", i * 0.16);
    }),
  jackpot: () =>
    [523, 659, 784, 1047].forEach((f, i) => {
      tone(f, 140, "triangle", i * 0.12);
    }),
  extra: () =>
    [880, 1320].forEach((f, i) => {
      tone(f, 120, "sine", i * 0.1);
    }),
  tilt: () => tone(110, 400, "sawtooth"),
};
const TUNE = [110, 110, 165, 110, 147, 110, 196, 165];

export function initPinball(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const win = el.closest<HTMLElement>(".window")!;
  const canvas = $<HTMLCanvasElement>("[data-canvas]");
  const g2 = canvas.getContext("2d")!;
  const opts = load(OPTS, { players: 1, sounds: true, music: false, controls: { ...DEFAULT_KEYS } });
  let scores = load(SCORES, { table: [] as Entry[] }).table;

  // ---------- physics ----------
  const world = new World({ gravity: { x: 0, y: 25 } });
  const ground = world.createBody();
  const fix = (shape: Shape, userData: unknown, extra: FixtureOpt = {}) =>
    ground.createFixture({
      shape,
      userData,
      filterCategoryBits: WALL_BITS,
      restitution: 0.3,
      friction: 0.05,
      ...extra,
    });
  for (const w of WALLS) fix(new Chain(w, false), "wall");
  fix(new Edge(...GATE), "gate");
  fix(new Box(0.35, 0.15, { x: PLUNGER.x, y: H - 0.65 }), "wall");
  for (const s of SLINGS) fix(new Polygon(s), "sling", { restitution: 0.6 });
  for (const b of BUMPERS) fix(new Circle(b, BUMPER_R), "bumper");
  for (const s of SENSORS) fix(new Box(s.hw, s.hh, { x: s.x, y: s.y }), s.tag, { isSensor: true });
  const targetBodies = TARGETS.map((t) => {
    const body = world.createBody({ position: { x: t.x, y: t.y } });
    body.createFixture({ shape: new Box(t.hw, t.hh), userData: t, filterCategoryBits: WALL_BITS, restitution: 0.2 });
    return body;
  });
  const flippers = FLIPPERS.map(({ pivot, dir }) => {
    const body = world.createDynamicBody({ position: pivot, angle: dir * REST, allowSleep: false, gravityScale: 0 });
    const f = { filterMaskBits: 1, density: 3, friction: 0.2, restitution: 0.1 };
    body.createFixture({
      ...f,
      shape: new Polygon([
        { x: 0, y: -0.2 },
        { x: dir * FLIP_LEN, y: -0.09 },
        { x: dir * FLIP_LEN, y: 0.09 },
        { x: 0, y: 0.2 },
      ]),
    });
    body.createFixture({ ...f, shape: new Circle({ x: 0, y: 0 }, 0.2) });
    body.createFixture({ ...f, shape: new Circle({ x: dir * FLIP_LEN, y: 0 }, 0.09) });
    const joint = world.createJoint(
      new RevoluteJoint(
        {
          enableLimit: true,
          lowerAngle: dir > 0 ? -2 * REST : 0,
          upperAngle: dir > 0 ? 0 : 2 * REST,
          enableMotor: true,
          maxMotorTorque: 2500,
        },
        ground,
        body,
        pivot,
      ),
    )!;
    return { body, joint, dir };
  });
  const ball = world.createDynamicBody({ position: PLUNGER, bullet: true, allowSleep: false });
  ball.createFixture({ shape: new Circle(R), density: 1, friction: 0.05, restitution: 0.3 });

  // ---------- state ----------
  let game: Game = newGame(opts.players);
  let phase: "ready" | "play" | "over" = "ready";
  let demo = false;
  let userPaused = false;
  let simTime = 0;
  let launchedAt = 0;
  let saveUsed = false;
  let tiltedAt = 0;
  let still = 0;
  let plungeHeld = 0;
  let spin = 0;
  let spinSpeed = 0;
  let nextNote = 0;
  let note = 0;
  const pressed: Record<Action, boolean> = {
    left: false,
    right: false,
    plunger: false,
    nudgeR: false,
    nudgeL: false,
    nudgeU: false,
  };
  const demoHold = [0, 0];
  let demoPlunge = 0;
  const flash = new Map<unknown, number>();
  const after: (() => void)[] = [];
  const messages: { text: string; until: number }[] = [];
  let lasting = "";

  const menu = initMenuBar($("[data-menubar]"), command);
  menu.set(`p${opts.players}`, true);
  menu.set("sounds", opts.sounds);
  menu.set("music", opts.music);

  const sound = (k: keyof typeof SOUNDS) => {
    if (opts.sounds && !demo) SOUNDS[k]();
  };

  function say(...texts: string[]) {
    for (const text of texts) messages.push({ text, until: 0 });
  }

  function resetBall() {
    ball.setTransform(PLUNGER, 0);
    ball.setLinearVelocity({ x: 0, y: 0 });
    ball.setAngularVelocity(0);
    plungeHeld = 0;
    for (const [i, t] of TARGETS.entries())
      after.push(() => targetBodies[i].setActive(!player(game).down[t.bank][t.i]));
  }

  function start(isDemo: boolean) {
    demo = isDemo;
    menu.set("demo", demo);
    game = newGame(demo ? 1 : opts.players);
    phase = "ready";
    saveUsed = false;
    userPaused = false;
    messages.length = 0;
    lasting = "";
    resetBall();
    say(demo ? "Demo" : "Player 1");
    lasting = demo ? "Demo" : `Hold ${keyName(opts.controls.plunger)} to git push`;
    paint();
    wake();
  }

  // ---------- contacts ----------
  const ballIn = (c: Contact) => {
    const a = c.getFixtureA();
    const b = c.getFixtureB();
    if (a.getBody() === ball) return { other: b, sign: 1 };
    if (b.getBody() === ball) return { other: a, sign: -1 };
    return null;
  };
  world.on("pre-solve", (c) => {
    const hit = ballIn(c);
    if (hit?.other.getUserData() === "gate" && ball.getLinearVelocity().y < 0) c.setEnabled(false);
  });
  world.on("begin-contact", (c) => {
    const hit = ballIn(c);
    if (hit) after.push(() => touch(hit.other, c, hit.sign));
  });

  function score(h: Hit) {
    const msgs = toHit(game, h);
    say(...msgs);
    if (msgs.some((m) => m.startsWith("GREEN"))) sound("jackpot");
    else if (msgs.includes("Extra Ball")) sound("extra");
  }

  function touch(f: Fixture, c: Contact, sign: number) {
    const tag = f.getUserData();
    const v = ball.getLinearVelocity();
    const up = v.y < 0;
    if (tag === "bumper") {
      const center = BUMPERS.find((b) => Math.hypot(b.x - ball.getPosition().x, b.y - ball.getPosition().y) < 1)!;
      const d = { x: ball.getPosition().x - center.x, y: ball.getPosition().y - center.y };
      const len = Math.hypot(d.x, d.y) || 1;
      const speed = Math.max(13, v.length());
      ball.setLinearVelocity({ x: (d.x / len) * speed, y: (d.y / len) * speed });
      flash.set(center, simTime);
      sound("bumper");
      score({ kind: "bumper" });
    } else if (tag === "sling") {
      const n = c.getWorldManifold(null)?.normal;
      // kick only off the long edge that faces the middle of the table
      const left = ball.getPosition().x < 4.65;
      if (n && -sign * n.x * (left ? 1 : -1) > 0.3) {
        ball.setLinearVelocity({ x: v.x + n.x * -sign * 9, y: v.y + n.y * -sign * 9 });
        flash.set(SLINGS[left ? 0 : 1], simTime);
        sound("bumper");
      }
    } else if (tag && typeof tag === "object") {
      const t = tag as Target;
      sound("target");
      score({ kind: "target", bank: t.bank, i: t.i });
      for (const [j, u] of TARGETS.entries())
        if (u.bank === t.bank) targetBodies[j].setActive(!player(game).down[u.bank][u.i]);
    } else if ((tag === "orbit" || tag === "spinner") && !lit(tag, 800)) {
      // a lane counts either way round the top, once per pass
      flash.set(tag, simTime);
      if (tag === "orbit") return score({ kind: "orbit" });
      const n = Math.min(12, Math.max(1, Math.round(v.length() / 3)));
      spinSpeed = n * 6;
      score({ kind: "spin", n });
    } else if (tag === "ramp" && up) {
      flash.set("ramp", simTime);
      score({ kind: "ramp" });
    } else if (tag === "outlane") score({ kind: "outlane" });
    else if (tag === "drain") onDrain();
  }

  function onDrain() {
    if (phase !== "play") return;
    const t = simTime - launchedAt;
    const saved = !saveUsed && !game.tilted && t < BALL_SAVE;
    const d = toDrain(game, saveUsed ? Number.POSITIVE_INFINITY : t);
    saveUsed = saved;
    if (lasting === "TILT!") lasting = "";
    if (!d.again) say("Build broken");
    say(...d.msgs);
    sound("drain");
    if (game.over) {
      phase = "over";
      lasting = "F2 Starts New Game";
      if (demo) setTimeout(() => demo && phase === "over" && start(true), 4000);
      else setTimeout(recordScores, 1200);
    } else phase = "ready";
    resetBall();
  }

  // ---------- input ----------
  function press(a: Action, on: boolean) {
    if (pressed[a] === on) return;
    pressed[a] = on;
    if (a === "plunger" && !on) release();
    if (!on || !a.startsWith("nudge") || phase !== "play" || game.tilted) return;
    const v = ball.getLinearVelocity();
    const kick = { nudgeR: { x: 3, y: 0 }, nudgeL: { x: -3, y: 0 }, nudgeU: { x: 0, y: -4 } }[a as "nudgeR"];
    ball.setLinearVelocity({ x: v.x + kick.x, y: v.y + kick.y });
    const level = nudge(game, simTime);
    if (level === "careful") say("Careful…");
    if (level === "tilt") {
      tiltedAt = simTime;
      lasting = "TILT!";
      say("TILT!");
      sound("tilt");
    }
  }

  const inLane = () =>
    ball.getPosition().x > 9 && ball.getPosition().y > H - 3 && ball.getLinearVelocity().length() < 1;

  function release() {
    const strength = plungerStrength(plungeHeld);
    plungeHeld = 0;
    if (!inLane() || phase === "over" || game.tilted) return;
    ball.setLinearVelocity({ x: 0, y: -launchSpeed(strength, Math.random) });
    if (phase === "ready") {
      phase = "play";
      launchedAt = simTime;
      if (lasting !== "F2 Starts New Game") lasting = "";
      messages.length = 0;
    }
    sound("launch");
  }

  const playing = () =>
    !win.hidden &&
    win.classList.contains("active") &&
    !document.hidden &&
    !el.querySelector("dialog[open]") &&
    !document.querySelector("dialog[open]");

  document.addEventListener("keydown", (e) => {
    if (!playing() || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element).closest?.(".menubar, input, textarea, select")) return;
    const a = ACTIONS.find(([k]) => norm(opts.controls[k]) === norm(e.key))?.[0];
    if (!a) return;
    e.preventDefault();
    if (!demo && !userPaused) press(a, true);
  });
  document.addEventListener("keyup", (e) => {
    const a = ACTIONS.find(([k]) => norm(opts.controls[k]) === norm(e.key))?.[0];
    if (a && !demo) press(a, false);
  });
  for (const b of el.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const a = b.dataset.hold as Action;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!demo && !userPaused) press(a, true);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"])
      b.addEventListener(ev, () => !demo && press(a, false));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ---------- the loop: runs only while the game can be played ----------
  let raf = 0;
  let last = 0;
  let acc = 0;
  const paused = () => userPaused || !playing();

  function frame(t: number) {
    raf = 0;
    if (paused()) {
      for (const a of Object.keys(pressed) as Action[]) pressed[a] = false;
      return paint();
    }
    acc += Math.min(0.05, (t - last) / 1000);
    last = t;
    let n = 0;
    while (acc >= STEP && n++ < 8) {
      tick();
      acc -= STEP;
    }
    music();
    paint();
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf || paused()) return paint();
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }
  new MutationObserver(wake).observe(win, { attributes: true, attributeFilter: ["hidden", "class"] });
  document.addEventListener("visibilitychange", wake);
  for (const d of el.querySelectorAll("dialog")) d.addEventListener("close", wake);

  function tick() {
    simTime += STEP;
    if (demo) think();
    if (pressed.plunger) plungeHeld += STEP;
    if (game.tilted && simTime - tiltedAt > TILT_TIMEOUT) onDrain();
    for (const [i, f] of flippers.entries()) {
      const up = (i === 0 ? pressed.left : pressed.right) && !game.tilted && phase !== "over";
      f.joint.setMotorSpeed(f.dir * (up ? -22 : 12));
    }
    world.step(STEP, 8, 3);
    for (const fn of after.splice(0)) fn();
    const p = ball.getPosition();
    const v = ball.getLinearVelocity();
    if (v.length() > 42) ball.setLinearVelocity({ x: (v.x * 42) / v.length(), y: (v.y * 42) / v.length() });
    if (p.y > H + 1 || p.x < 0 || p.x > W || p.y < 0) {
      if (phase === "play") onDrain();
      else resetBall();
    }
    // a ball resting somewhere on the field gets a small shake, so a game never sticks
    still = phase === "play" && v.length() < 0.05 && !inLane() && p.y < 14.5 ? still + STEP : 0;
    if (still > 3) {
      ball.setLinearVelocity({ x: Math.random() * 4 - 2, y: -3 });
      still = 0;
    }
    spin += spinSpeed * STEP;
    spinSpeed = Math.max(0, spinSpeed - 10 * STEP);
  }

  /** Demo: flip when the ball comes down onto a flipper, pull the plunger when the ball waits on it. */
  function think() {
    const p = ball.getPosition();
    const v = ball.getLinearVelocity();
    for (const [i, { pivot, dir }] of FLIPPERS.entries()) {
      const near = Math.hypot(p.x - (pivot.x + dir * 0.9), p.y - (pivot.y + 0.3)) < 0.95 && v.y > -1;
      if (near && demoHold[i] <= 0) demoHold[i] = 0.25;
      demoHold[i] -= STEP;
      press(i === 0 ? "left" : "right", demoHold[i] > 0);
    }
    if (inLane() && !pressed.plunger) {
      demoPlunge = 0.6 + Math.random() * 0.5;
      press("plunger", true);
    } else if (pressed.plunger && plungeHeld >= demoPlunge) press("plunger", false);
  }

  function music() {
    if (!opts.music || demo || phase !== "play") return;
    audio ??= new AudioContext();
    if (nextNote < audio.currentTime) nextNote = audio.currentTime + 0.05;
    while (nextNote < audio.currentTime + 0.15) {
      tone(TUNE[note++ % TUNE.length], 180, "triangle", nextNote - audio.currentTime, 0.04);
      nextNote += 0.22;
    }
  }

  // ---------- drawing: a cabinet seen from the player's end (the canvas is tilted in 3D by CSS) ----------
  const COLORS: Record<Bank, string> = { BUILD: "#3d8bfd", TEST: "#f0b429", DEPLOY: "#c77dff" };
  let S = 40;
  // static parts (cabinet, playfield art, rails, labels) are drawn once per size into their own canvas
  const layer = document.createElement("canvas");
  const g0 = layer.getContext("2d")!;
  new ResizeObserver(() => {
    // client size, not the bounding box: the 3D tilt makes that smaller
    if (!canvas.clientWidth) return;
    canvas.width = layer.width = Math.round(canvas.clientWidth * devicePixelRatio);
    canvas.height = layer.height = Math.round(canvas.clientHeight * devicePixelRatio);
    S = canvas.width / W;
    drawStill();
    paint();
  }).observe(canvas);

  const lit = (key: unknown, ms = 150) => simTime - (flash.get(key) ?? -9) < ms / 1000;
  const blink = (hz = 3) => Math.sin(simTime * hz * 2 * Math.PI) > 0;
  function text(s: string, x: number, y: number, size: number, color: string, angle = 0, c = g2) {
    c.save();
    c.translate(x * S, y * S);
    c.rotate(angle);
    c.fillStyle = color;
    c.font = `bold ${size * S}px Tahoma, Verdana, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(s, 0, 0);
    c.restore();
  }
  function path(ps: P[], close = false, c = g2) {
    c.beginPath();
    for (const [i, p] of ps.entries()) c[i ? "lineTo" : "moveTo"](p.x * S, p.y * S);
    if (close) c.closePath();
  }
  /** A chrome rail: shadow, dark edge, bright body, a thin highlight. */
  function rail(ps: P[], w: number, c = g2) {
    c.lineCap = "round";
    c.lineJoin = "round";
    c.save();
    c.translate(0.06 * S, 0.09 * S);
    path(ps, false, c);
    c.strokeStyle = "rgb(0 0 0 / 0.45)";
    c.lineWidth = w * S;
    c.stroke();
    c.restore();
    for (const [color, k] of [
      ["#4a515c", 1],
      ["#c9d0da", 0.62],
      ["#ffffff", 0.18],
    ] as const) {
      path(ps, false, c);
      c.strokeStyle = color;
      c.lineWidth = w * k * S;
      c.stroke();
    }
  }
  /** A lamp insert in the playfield: dim when off, glowing when on. */
  function lamp(ps: P[], on: boolean, color: string) {
    path(ps, true);
    g2.save();
    g2.globalAlpha = on ? 1 : 0.28;
    if (on) {
      g2.shadowColor = color;
      g2.shadowBlur = 0.5 * S;
    }
    g2.fillStyle = color;
    g2.fill();
    g2.restore();
    g2.strokeStyle = "rgb(0 0 0 / 0.5)";
    g2.lineWidth = 0.03 * S;
    g2.stroke();
  }
  const arrow = (x: number, y: number, a: number, s = 0.45): P[] =>
    [
      [0, -1],
      [0.8, 0.6],
      [0, 0.15],
      [-0.8, 0.6],
    ].map(([u, v]) => ({
      x: x + s * (u * Math.cos(a) - v * Math.sin(a)),
      y: y + s * (u * Math.sin(a) + v * Math.cos(a)),
    }));
  const disc = (x: number, y: number, r: number): P[] => arc(x, y, r, 0, 2 * Math.PI, 20);
  const shadow = (x: number, y: number, rx: number, ry: number, a = 0.45) => {
    g2.beginPath();
    g2.ellipse((x + 0.08) * S, (y + 0.13) * S, rx * S, ry * S, 0, 0, 7);
    g2.fillStyle = `rgb(0 0 0 / ${a})`;
    g2.fill();
  };

  function drawStill() {
    const c = g0;
    // the cabinet: dark brushed metal with a lit edge
    const cab = c.createLinearGradient(0, 0, W * S, 0);
    for (const [o, col] of [
      [0, "#14171d"],
      [0.015, "#6b7280"],
      [0.03, "#262b34"],
      [0.97, "#262b34"],
      [0.985, "#6b7280"],
      [1, "#14171d"],
    ] as const)
      cab.addColorStop(o, col);
    c.fillStyle = cab;
    c.fillRect(0, 0, W * S, H * S);
    // the playfield: a deep blue night, lighter in the middle
    c.save();
    path(WALLS[0], true, c);
    c.clip();
    const bg = c.createRadialGradient(4.6 * S, 9.5 * S, 0, 4.6 * S, 9.5 * S, 11 * S);
    bg.addColorStop(0, "#2459a8");
    bg.addColorStop(0.45, "#123266");
    bg.addColorStop(1, "#060f24");
    c.fillStyle = bg;
    c.fillRect(0, 0, W * S, H * S);
    // printed art: circuit traces, as on a server board
    c.strokeStyle = "rgb(120 190 255 / 0.16)";
    c.fillStyle = "rgb(120 190 255 / 0.22)";
    c.lineWidth = 0.04 * S;
    for (const t of TRACES) {
      path(t, false, c);
      c.stroke();
      for (const e of [t[0], t[t.length - 1]]) {
        c.beginPath();
        c.arc(e.x * S, e.y * S, 0.08 * S, 0, 7);
        c.fill();
      }
    }
    // the plunger lane and the green pipeline ramp: clear plastic over the field
    c.fillStyle = "rgb(190 225 255 / 0.1)";
    c.fillRect(5.4 * S, 2.3 * S, 1.2 * S, 1.9 * S);
    c.fillRect(9 * S, 6 * S, 0.7 * S, (H - 6) * S);
    text("GREEN PIPELINE", 6, 1.75, 0.3, "#b7ffcb", 0, c);
    text("RENOVATE BOT", 0.82, 6, 0.24, "#cfe6ff", -Math.PI / 2, c);
    text("HELM UPGRADE", 8.47, 6.9, 0.22, "#cfe6ff", -Math.PI / 2, c);
    text("git push", 9.35, 11.5, 0.26, "#cfe6ff", -Math.PI / 2, c);
    text("MERGE CONFLICT", 0.75, 14.2, 0.2, "#ff9c9c", -Math.PI / 2, c);
    text("MERGE CONFLICT", 8.55, 14.2, 0.2, "#ff9c9c", Math.PI / 2, c);
    for (const [b, x, y, a] of [
      ["BUILD", 1.0, 9.1, -Math.PI / 2],
      ["TEST", 3.9, 7.85, 0],
      ["DEPLOY", 8.35, 9.6, Math.PI / 2],
    ] as const)
      text(b, x, y, 0.3, COLORS[b], a, c);
    // the rank plaque
    c.fillStyle = "rgb(0 0 0 / 0.35)";
    c.beginPath();
    c.roundRect(3.25 * S, 10.25 * S, 2.8 * S, 0.95 * S, 0.2 * S);
    c.fill();
    text("RANK", 4.65, 10.5, 0.2, "#9fb8d8", 0, c);
    c.restore();
    for (const w of WALLS) rail(w, 0.16, c);
    rail(GATE, 0.07, c);
  }

  function paint() {
    const p = player(game);
    g2.drawImage(layer, 0, 0);
    // lamps: multiplier, lane arrows, the three stages, the ramp
    for (const [i, m] of MULTIPLIERS.slice(1).entries()) {
      lamp(disc(2.1, 6.55 + i * 0.5, 0.2), p.mult > i, "#7dff9b");
      text(`×${m}`, 2.1, 6.55 + i * 0.5, 0.17, p.mult > i ? "#05320f" : "#cfe6ff");
    }
    const maxed = p.mult === MULTIPLIERS.length - 1;
    lamp(arrow(1.75, 8.1, -0.35), maxed ? blink() : lit("orbit", 800), maxed ? "#ffd84d" : "#7dff9b");
    lamp(arrow(7.55, 8.7, 0.35), lit("spinner", 800), "#7fd8ff");
    const on = rampLit(p);
    for (const k of [0, 1, 2]) lamp(arrow(6, 3.75 - k * 0.55, 0, 0.32), on && (blink(4) || k === 1), "#2ee86f");
    lamp(arrow(6, 5, 0, 0.42), on || lit("ramp", 600), "#2ee86f");
    for (const [i, b] of BANKS.entries()) {
      const x = 3.75 + i * 0.9;
      lamp(
        [
          { x: x - 0.4, y: 11.75 },
          { x: x + 0.15, y: 11.75 },
          { x: x + 0.45, y: 12.15 },
          { x: x + 0.15, y: 12.55 },
          { x: x - 0.4, y: 12.55 },
          { x: x - 0.1, y: 12.15 },
        ],
        p.lit[b],
        COLORS[b],
      );
    }
    text(RANKS[p.rank].toUpperCase(), 4.65, 10.88, 0.3, "#ffffff");

    // the spinner plate
    const sy = 5.6;
    g2.strokeStyle = "#e9edf3";
    g2.lineWidth = 0.08 * S;
    path([
      { x: 8.05, y: sy + 0.18 * Math.sin(spin) },
      { x: 8.9, y: sy - 0.18 * Math.sin(spin) },
    ]);
    g2.stroke();
    // plunger: a spring that squeezes as the strength builds
    const k = plungerStrength(plungeHeld);
    const top = H - 0.85 + k * 0.55;
    g2.fillStyle = "#b9c0cc";
    g2.fillRect((PLUNGER.x - 0.06) * S, top * S, 0.12 * S, (H - top) * S);
    g2.strokeStyle = "#e9edf3";
    g2.lineWidth = 0.04 * S;
    path(
      Array.from({ length: 9 }, (_, i) => ({
        x: PLUNGER.x + (i % 2 ? 0.22 : -0.22),
        y: top + 0.2 + (i * (H - top - 0.2)) / 8,
      })),
    );
    g2.stroke();
    g2.fillStyle = "#c0392b";
    g2.beginPath();
    g2.roundRect((PLUNGER.x - 0.3) * S, top * S, 0.6 * S, 0.18 * S, 0.06 * S);
    g2.fill();

    // slingshots: white plastic, a red rubber on the kicking edge
    for (const s of SLINGS) {
      path(s, true);
      const pl = g2.createLinearGradient(s[0].x * S, s[0].y * S, s[2].x * S, s[2].y * S);
      pl.addColorStop(0, "#f7f9fc");
      pl.addColorStop(1, "#9aa6b8");
      g2.fillStyle = pl;
      g2.fill();
      path([s[0], s[2]]);
      g2.strokeStyle = lit(s) ? "#ffe066" : "#d63a2a";
      g2.lineWidth = 0.1 * S;
      g2.stroke();
    }
    // flaky-test bumpers: a shadow, a metal skirt and a lit cap
    for (const b of BUMPERS) {
      const on = lit(b);
      shadow(b.x, b.y, BUMPER_R * 1.05, BUMPER_R * 0.95);
      g2.beginPath();
      g2.arc(b.x * S, b.y * S, BUMPER_R * S, 0, 7);
      g2.fillStyle = "#8f1d1d";
      g2.fill();
      g2.lineWidth = 0.08 * S;
      g2.strokeStyle = "#d9dee6";
      g2.stroke();
      const cap = g2.createRadialGradient((b.x - 0.12) * S, (b.y - 0.15) * S, 0, b.x * S, b.y * S, BUMPER_R * 0.8 * S);
      cap.addColorStop(0, on ? "#fffbe0" : "#ff8c8c");
      cap.addColorStop(1, on ? "#ffc400" : "#c0201a");
      g2.beginPath();
      g2.arc((b.x - 0.03) * S, (b.y - 0.05) * S, BUMPER_R * 0.78 * S, 0, 7);
      g2.fillStyle = cap;
      if (on) {
        g2.shadowColor = "#ffd84d";
        g2.shadowBlur = 0.6 * S;
      }
      g2.fill();
      g2.shadowBlur = 0;
      text("FLAKY", b.x - 0.03, b.y - 0.05, 0.16, on ? "#6b1a00" : "#fff");
    }
    // drop targets: a raised block, or an empty slot when down
    for (const [i, t] of TARGETS.entries()) {
      const x = (t.x - t.hw) * S;
      const y = (t.y - t.hh) * S;
      if (!targetBodies[i].isActive()) {
        g2.fillStyle = "rgb(0 0 0 / 0.5)";
        g2.fillRect(x, y, 2 * t.hw * S, 2 * t.hh * S);
        continue;
      }
      g2.fillStyle = "rgb(0 0 0 / 0.5)";
      g2.fillRect(x + 0.06 * S, y + 0.09 * S, 2 * t.hw * S, 2 * t.hh * S);
      g2.fillStyle = COLORS[t.bank];
      g2.fillRect(x, y, 2 * t.hw * S, 2 * t.hh * S);
      g2.fillStyle = "rgb(255 255 255 / 0.45)";
      g2.fillRect(x, y, 2 * t.hw * S, 0.035 * S);
    }
    // flippers: white bats with red rubber and a bolt
    for (const f of flippers) {
      const pos = f.body.getPosition();
      g2.save();
      g2.translate(pos.x * S, pos.y * S);
      g2.rotate(f.body.getAngle());
      const bat: P[] = [
        ...arc(0, 0, 0.2, Math.PI / 2, (3 * Math.PI) / 2, 10).map((q) => ({ x: q.x * f.dir, y: q.y })),
        ...arc(f.dir * FLIP_LEN, 0, 0.09, -Math.PI / 2, Math.PI / 2, 8).map((q) => ({
          x: f.dir * FLIP_LEN + (q.x - f.dir * FLIP_LEN) * f.dir,
          y: q.y,
        })),
      ];
      g2.save();
      g2.translate(0.07 * S, 0.11 * S);
      path(bat, true);
      g2.fillStyle = "rgb(0 0 0 / 0.45)";
      g2.fill();
      g2.restore();
      path(bat, true);
      const body = g2.createLinearGradient(0, -0.2 * S, 0, 0.2 * S);
      body.addColorStop(0, game.tilted ? "#8a93a6" : "#ffffff");
      body.addColorStop(1, game.tilted ? "#4d5566" : "#b8c2d4");
      g2.fillStyle = body;
      g2.fill();
      g2.strokeStyle = game.tilted ? "#5b2a2a" : "#d63a2a";
      g2.lineWidth = 0.07 * S;
      g2.stroke();
      g2.beginPath();
      g2.arc(0, 0, 0.08 * S, 0, 7);
      g2.fillStyle = "#7d8696";
      g2.fill();
      g2.restore();
    }
    // the ball: chrome, with its shadow on the field
    const b = ball.getPosition();
    shadow(b.x, b.y, R * 1.05, R * 0.85, 0.5);
    const shine = g2.createRadialGradient((b.x - 0.08) * S, (b.y - 0.09) * S, 0, b.x * S, b.y * S, R * S);
    shine.addColorStop(0, "#ffffff");
    shine.addColorStop(0.35, "#dfe4ec");
    shine.addColorStop(0.8, "#7a8494");
    shine.addColorStop(1, "#3e4552");
    g2.beginPath();
    g2.arc(b.x * S, b.y * S, R * S, 0, 7);
    g2.fillStyle = shine;
    g2.fill();
    // the apron: the ball drains under it
    path(
      [
        { x: 0.3, y: 16.95 },
        { x: 3.4, y: 17.45 },
        { x: 5.9, y: 17.45 },
        { x: 9, y: 16.95 },
        { x: 9, y: H },
        { x: 0.3, y: H },
      ],
      true,
    );
    const ap = g2.createLinearGradient(0, 16.9 * S, 0, H * S);
    ap.addColorStop(0, "#3a4250");
    ap.addColorStop(1, "#151a22");
    g2.fillStyle = ap;
    g2.fill();
    rail(
      [
        { x: 0.3, y: 16.95 },
        { x: 3.4, y: 17.45 },
        { x: 5.9, y: 17.45 },
        { x: 9, y: 16.95 },
      ],
      0.08,
    );
    text("PIPELINE PINBALL", 4.65, 17.75, 0.26, "#9fb8d8");
    if (game.tilted) text("TILT", 4.65, 9, 1.2, "rgb(255 80 80 / 0.9)");
    if (userPaused) text("PAUSED", 4.65, 9, 0.9, "rgb(255 255 255 / 0.9)");
    panel();
  }

  // ---------- the score panel (HTML, read by screen readers) ----------
  const msgEl = $("[data-msg]");
  const scoresEl = $("[data-scores]");
  const ladder = RANKS.map((r) => Object.assign(document.createElement("li"), { textContent: r }));
  $("[data-ladder]").append(...[...ladder].reverse()); // CTO at the top
  let shown = "";
  function panel() {
    const now = performance.now();
    if (messages[0]?.until && messages[0].until < now) messages.shift();
    if (messages[0] && !messages[0].until) messages[0].until = now + 1600;
    const text = messages[0]?.text ?? lasting;
    if (text !== shown) msgEl.textContent = shown = text;
    const p = player(game);
    const html = game.players
      .map(
        (q, i) =>
          `<li${i === game.current ? ' class="on"' : ""}><span>Player ${i + 1}</span><b>${fmt(q.score)}</b></li>`,
      )
      .join("");
    if (scoresEl.innerHTML !== html) scoresEl.innerHTML = html;
    scoresEl.hidden = game.players.length < 2;
    $("[data-score]").textContent = fmt(p.score);
    $("[data-ball]").textContent = String(game.ball);
    $("[data-player]").textContent = String(game.current + 1);
    $("[data-rank]").textContent = RANKS[p.rank];
    for (const [i, li] of ladder.entries()) li.classList.toggle("on", i === p.rank);
    $("[data-mult]").textContent = `×${MULTIPLIERS[p.mult]}`;
    el.dataset.phase = demo ? "demo" : phase;
  }

  // ---------- menus and dialogs ----------
  function command(cmd: string) {
    if (cmd === "new") start(false);
    else if (cmd === "launch") {
      if (demo) return;
      plungeHeld = 0.75;
      press("plunger", true);
      press("plunger", false);
    } else if (cmd === "pause") {
      userPaused = !userPaused;
      wake();
    } else if (cmd === "scores") showScores([]);
    else if (cmd === "demo") start(!demo);
    else if (cmd === "fullscreen") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.().catch(() => {});
    } else if (/^p[1-4]$/.test(cmd)) {
      opts.players = Number(cmd[1]);
      save(OPTS, opts);
      start(false);
    } else if (cmd === "sounds" || cmd === "music") {
      opts[cmd] = menu.isOn(cmd);
      save(OPTS, opts);
    } else if (cmd === "controls") controls();
    else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  /** XP's High Scores box. `fresh` are rows just earned: their names can be typed, pre-filled "Player N". */
  function showScores(fresh: number[]) {
    const d = $<HTMLDialogElement>("[data-highscores]");
    const body = d.querySelector("tbody")!;
    let rows = scores.map((e) => ({ ...e }));
    const draw = () => {
      body.innerHTML = Array.from({ length: 5 }, (_, i) => {
        const e = rows[i];
        const name = !e
          ? ""
          : fresh.includes(i)
            ? `<input data-row="${i}" maxlength="24" aria-label="Your name, rank ${i + 1}">`
            : e.name.replace(/</g, "&lt;");
        return `<tr><td>${i + 1}</td><td>${name}</td><td>${e ? fmt(e.score) : ""}</td></tr>`;
      }).join("");
      for (const inp of body.querySelectorAll<HTMLInputElement>("input"))
        inp.value = rows[Number(inp.dataset.row)].name;
    };
    draw();
    d.querySelector<HTMLButtonElement>("[data-clear]")!.onclick = () => {
      rows = [];
      fresh = [];
      draw();
    };
    d.returnValue = "";
    d.showModal();
    body.querySelector("input")?.select();
    d.addEventListener(
      "close",
      () => {
        if (d.returnValue === "ok") {
          for (const inp of body.querySelectorAll<HTMLInputElement>("input"))
            rows[Number(inp.dataset.row)].name = inp.value.trim() || rows[Number(inp.dataset.row)].name;
          scores = rows;
        }
        // Cancel keeps the table as it was, but a score just earned stays with its pre-filled name
        save(SCORES, { table: scores });
      },
      { once: true },
    );
  }

  function recordScores() {
    const fresh: number[] = [];
    for (const [i, p] of game.players.entries()) {
      const r = insertScore(scores, { name: `Player ${i + 1}`, score: p.score });
      if (r.at < 0) continue;
      scores = r.table;
      for (const [k, f] of fresh.entries()) if (f >= r.at) fresh[k] = f + 1;
      fresh.push(r.at);
    }
    if (fresh.length) {
      save(SCORES, { table: scores });
      showScores(fresh.filter((f) => f < 5));
    }
  }

  function controls() {
    const d = $<HTMLDialogElement>("[data-controls]");
    const keys = { ...opts.controls };
    let waiting: Action | null = null;
    const draw = () => {
      for (const b of d.querySelectorAll<HTMLButtonElement>("[data-bind]")) {
        const a = b.dataset.bind as Action;
        b.textContent = waiting === a ? "Press a key…" : keyName(keys[a]);
      }
    };
    for (const b of d.querySelectorAll<HTMLButtonElement>("[data-bind]"))
      b.onclick = (e) => {
        e.preventDefault();
        waiting = b.dataset.bind as Action;
        draw();
      };
    d.querySelector<HTMLButtonElement>("[data-default]")!.onclick = (e) => {
      e.preventDefault();
      Object.assign(keys, DEFAULT_KEYS);
      waiting = null;
      draw();
    };
    d.onkeydown = (e) => {
      if (!waiting || e.key === "Escape" || e.key === "Tab" || e.key === "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      keys[waiting] = e.key;
      waiting = null;
      draw();
    };
    draw();
    d.returnValue = "";
    d.showModal();
    d.addEventListener(
      "close",
      () => {
        if (d.returnValue !== "ok") return;
        opts.controls = keys;
        save(OPTS, opts);
        if (phase === "ready" && !demo && game.ball === 1) lasting = `Hold ${keyName(keys.plunger)} to git push`;
      },
      { once: true },
    );
  }

  start(false);
}
