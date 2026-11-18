// Pipeline Pinball: the table (planck.js physics, canvas drawing), keys and touch buttons, menus and dialogs.
// The rules live in pinball-logic.ts. Loaded on the window's first open (lazy.ts), so planck stays out of startup.
import {
  type Body,
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
  type Entry,
  fmt,
  type Game,
  type Hit,
  insertScore,
  launchSpeed,
  MULTIBALL,
  MULTIPLIERS,
  newGame,
  nudge,
  player,
  plungerStrength,
  RANKS,
  rampLit,
  shiftLanes,
  TICKETS,
  TILT_TIMEOUT,
  drain as toDrain,
  hit as toHit,
} from "./pinball-logic";
import { load, save } from "./scores";

type Action = "left" | "right" | "plunger" | "nudgeR" | "nudgeL" | "nudgeU";
const ACTIONS: Action[] = ["left", "right", "plunger", "nudgeR", "nudgeL", "nudgeU"];
const DEFAULT_KEYS: Record<Action, string> = {
  left: "a",
  right: "d",
  plunger: " ",
  nudgeR: "x",
  nudgeL: ".",
  nudgeU: "n",
};
const OPTS = "kk-pinball";
/** Messages waiting to be shown at most (the one on screen and the newest ones). */
const MESSAGES_KEPT = 4;
const SCORES = "kk-pinball-scores";
const keyName = (k: string) =>
  ({ " ": "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" })[k] ??
  (k.length === 1 ? k.toUpperCase() : k);
const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
const actionFor = (keys: Record<Action, string>, key: string) => ACTIONS.find((a) => norm(keys[a]) === norm(key));
/** Keys a control can't use: the menu's F-keys, and modifiers (a press with Ctrl, Alt or ⌘ is left to the browser). */
const RESERVED = /^(F\d+|Control|Alt|AltGraph|Meta|Shift|OS)$/;

import { createView, type View } from "./pinball-3d";
import {
  BUMPER_R,
  BUMPERS,
  CACHES,
  FIELD_MASK,
  FLIP_LEN,
  FLIPPERS,
  GATE,
  H,
  KICKERS,
  LAMPS,
  LANE_X,
  LIFT,
  MID,
  type P,
  PLUNGER,
  POD_R,
  PODS,
  POST_R,
  POSTS,
  R,
  RAMP_BITS,
  RAMPS,
  REST,
  SENSORS,
  SLINGS,
  SMOKE,
  STAGE_BITS,
  STAGE_DRAIN,
  STAGE_ENTRY,
  STAGE_FLIP_LEN,
  STAGE_FLIPPERS,
  STAGE_H,
  STAGE_WALL,
  STEP,
  TARGETS,
  type Target,
  W,
  WALL_BITS,
  WALLS,
} from "./pinball-table";

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
  for (const p of POSTS) fix(new Circle(p, POST_R), "post", { restitution: 0.75 });
  for (const k of KICKERS) fix(new Edge(k.a, k.b), k);
  for (const s of SENSORS)
    fix(new Box(s.hw, s.hh, { x: s.x, y: s.y }), s.tag, {
      isSensor: true,
      filterCategoryBits: s.tag === "ramp" ? WALL_BITS | RAMP_BITS : WALL_BITS,
    });
  for (const rp of RAMPS) {
    for (const side of rp.sides) fix(new Chain(side.slice(1), false), "wall", { filterCategoryBits: RAMP_BITS });
    fix(new Box(0.4, 0.1, rp.end), rp.tag, { isSensor: true, filterCategoryBits: RAMP_BITS });
  }
  for (const [i, x] of LANE_X.entries()) fix(new Box(0.25, 0.08, { x, y: 2.3 }), { lane: i }, { isSensor: true });
  for (const [i, h] of CACHES.entries()) fix(new Circle(h, 0.26), { cache: i }, { isSensor: true });
  const targetBodies = TARGETS.map((t) => {
    const body = world.createBody({ position: { x: t.x, y: t.y } });
    body.createFixture({ shape: new Box(t.hw, t.hh), userData: t, filterCategoryBits: WALL_BITS, restitution: 0.2 });
    return body;
  });
  /** A flipper: a tapered bat on a motorised hinge. `k` scales the bat; `cat` is the layer it lives on. */
  const makeFlipper = ({ pivot, dir }: { pivot: P; dir: number }, len: number, k: number, cat: number) => {
    const body = world.createDynamicBody({ position: pivot, angle: dir * REST, allowSleep: false, gravityScale: 0 });
    const f = { filterMaskBits: 1, filterCategoryBits: cat, density: 3, friction: 0.2, restitution: 0.1 };
    body.createFixture({
      ...f,
      shape: new Polygon([
        { x: 0, y: -0.2 * k },
        { x: dir * len, y: -0.09 * k },
        { x: dir * len, y: 0.09 * k },
        { x: 0, y: 0.2 * k },
      ]),
    });
    body.createFixture({ ...f, shape: new Circle({ x: 0, y: 0 }, 0.2 * k) });
    body.createFixture({ ...f, shape: new Circle({ x: dir * len, y: 0 }, 0.09 * k) });
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
  };
  const flippers = FLIPPERS.map((f) => makeFlipper(f, FLIP_LEN, 1, 1));
  // the staging table: its wall, pods, smoke tests, drain, its own small flippers; the lift up to it
  fix(new Chain(STAGE_WALL, false), "wall", { filterCategoryBits: STAGE_BITS });
  for (const p of PODS) fix(new Circle(p, POD_R), "pod", { filterCategoryBits: STAGE_BITS });
  for (const [i, t] of SMOKE.entries())
    fix(new Box(t.hw, t.hh, t), { smoke: i }, { filterCategoryBits: STAGE_BITS, restitution: 0.4 });
  fix(new Box(STAGE_DRAIN.hw, STAGE_DRAIN.hh, STAGE_DRAIN), "stageDrain", {
    isSensor: true,
    filterCategoryBits: STAGE_BITS,
  });
  fix(new Circle(LIFT, 0.26), "lift", { isSensor: true });
  const minis = STAGE_FLIPPERS.map((f) => makeFlipper(f, STAGE_FLIP_LEN, 0.65, STAGE_BITS));
  // the balls: one, or three during Parallel jobs
  /** Where a ball is: on the field, on a ramp or the chute, or up on the staging table (each its own layer). */
  type Mode = "field" | "ramp" | "stage";
  type BallState = { mode: Mode; held: number; hole: number; still: number };
  const balls: Body[] = [];
  const state = new Map<Body, BallState>();
  function addBall(position: P) {
    const b = world.createDynamicBody({ position, bullet: true, allowSleep: false });
    b.createFixture({ shape: new Circle(R), density: 1, friction: 0.05, restitution: 0.3, filterMaskBits: FIELD_MASK });
    balls.push(b);
    state.set(b, { mode: "field", held: 0, hole: -1, still: 0 });
    return b;
  }
  function removeBall(b: Body) {
    world.destroyBody(b);
    balls.splice(balls.indexOf(b), 1);
    state.delete(b);
  }
  function setMode(b: Body, mode: Mode) {
    state.get(b)!.mode = mode;
    const maskBits = mode === "ramp" ? RAMP_BITS : mode === "stage" ? STAGE_BITS : FIELD_MASK;
    b.getFixtureList()!.setFilterData({ groupIndex: 0, categoryBits: 1, maskBits });
  }
  addBall(PLUNGER);
  const launches: number[] = [];
  /** When each cache hole (0, 1) and the lift (2) may take a ball again. */
  const holeFree = [0, 0, 0];

  // ---------- state ----------
  let game: Game = newGame(opts.players);
  let phase: "ready" | "play" | "over" = "ready";
  let demo = false;
  let userPaused = false;
  let simTime = 0;
  let launchedAt = 0;
  let tiltedAt = 0;
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
    // fast repeats (orbit, spinner) mustn't push news like Extra Ball seconds behind the game: keep the newest few
    if (messages.length > MESSAGES_KEPT) messages.splice(1, messages.length - MESSAGES_KEPT);
  }

  /** Let go of every key, the demo's held flippers and a half-pulled plunger. */
  function releaseAll() {
    for (const a of ACTIONS) pressed[a] = false;
    demoHold.fill(0);
    plungeHeld = 0;
  }

  function resetBall() {
    while (balls.length > 1) removeBall(balls[1]);
    launches.length = 0;
    const ball = balls[0];
    setMode(ball, "field");
    Object.assign(state.get(ball)!, { held: 0, hole: -1, still: 0 });
    ball.setActive(true);
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
    userPaused = false;
    releaseAll();
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
    if (state.has(a.getBody())) return { ball: a.getBody(), other: b, sign: 1 };
    if (state.has(b.getBody())) return { ball: b.getBody(), other: a, sign: -1 };
    return null;
  };
  world.on("pre-solve", (c) => {
    const hit = ballIn(c);
    if (hit?.other.getUserData() === "gate" && hit.ball.getLinearVelocity().y < 0) c.setEnabled(false);
  });
  world.on("begin-contact", (c) => {
    const hit = ballIn(c);
    if (hit) after.push(() => state.has(hit.ball) && touch(hit.other, c, hit.sign, hit.ball));
  });

  function score(h: Hit) {
    const msgs = toHit(game, h);
    say(...msgs);
    if (msgs.some((m) => m.startsWith("GREEN") || m === "Parallel jobs!")) sound("jackpot");
    else if (msgs.includes("Extra Ball")) sound("extra");
    if (game.startMultiball) {
      game.startMultiball = false;
      // the other jobs come up the plunger lane, one after another
      // (started again during Parallel jobs, it only tops up to MULTIBALL: the table draws that many)
      for (let i = balls.length + launches.length; i < MULTIBALL; i++) launches.push(simTime + 0.4 + i * 0.8);
    }
  }

  function touch(f: Fixture, c: Contact, sign: number, ball: Body) {
    const tag = f.getUserData() as unknown;
    const st = state.get(ball)!;
    const v = ball.getLinearVelocity();
    const up = v.y < 0;
    if (tag === "bumper" || tag === "pod") {
      const list = tag === "pod" ? PODS : BUMPERS;
      // the nearest centre: neighbouring bumpers are closer together than one bumper's reach
      const dist = (b: P) => Math.hypot(b.x - ball.getPosition().x, b.y - ball.getPosition().y);
      const center = list.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      const d = { x: ball.getPosition().x - center.x, y: ball.getPosition().y - center.y };
      const len = Math.hypot(d.x, d.y) || 1;
      const speed = Math.max(13, v.length());
      ball.setLinearVelocity({ x: (d.x / len) * speed, y: (d.y / len) * speed });
      flash.set(center, simTime);
      sound("bumper");
      score({ kind: tag });
    } else if (tag && typeof tag === "object" && "dir" in tag) {
      // a wall kicker: back towards the middle, a little up the table
      ball.setLinearVelocity({ x: (tag.dir as number) * 7, y: Math.min(v.y * 0.4, 0) - 3 });
      flash.set(tag, simTime);
      sound("bumper");
    } else if (tag === "sling") {
      const n = c.getWorldManifold(null)?.normal;
      // kick only off the long edge that faces the middle of the table
      const left = ball.getPosition().x < MID;
      if (n && -sign * n.x * (left ? 1 : -1) > 0.3) {
        ball.setLinearVelocity({ x: v.x + n.x * -sign * 9, y: v.y + n.y * -sign * 9 });
        flash.set(SLINGS[left ? 0 : 1], simTime);
        sound("bumper");
      }
    } else if (tag && typeof tag === "object" && "lane" in tag) {
      flash.set(`lane${tag.lane}`, simTime);
      score({ kind: "rollover", i: tag.lane as number });
    } else if (tag && typeof tag === "object" && "cache" in tag) {
      const i = tag.cache as number;
      if (st.mode !== "field" || st.held || simTime < holeFree[i]) return;
      // the hole takes the ball, keeps it a moment, and shoots it back out
      ball.setLinearVelocity({ x: 0, y: 0 });
      ball.setTransform(CACHES[i], 0);
      ball.setActive(false);
      Object.assign(st, { held: simTime + 1.2, hole: i });
      sound("target");
      score({ kind: "cache" });
    } else if (tag && typeof tag === "object" && "smoke" in tag) {
      flash.set(`smoke${tag.smoke}`, simTime);
      sound("target");
      score({ kind: "smoke", i: tag.smoke as number });
    } else if (tag === "lift") {
      if (st.mode !== "field" || st.held || simTime < holeFree[2]) return;
      // the lift takes the ball up to the staging table
      ball.setLinearVelocity({ x: 0, y: 0 });
      ball.setTransform(LIFT, 0);
      ball.setActive(false);
      Object.assign(st, { held: simTime + 0.9, hole: 2 });
      sound("launch");
      flash.set("lift", simTime);
      score({ kind: "stage" });
    } else if (tag === "stageDrain" && st.mode === "stage") {
      // into the chute, wherever along the bottom edge it dropped off
      setMode(ball, "ramp");
      ball.setTransform({ x: RAMPS[1].path[0].x, y: ball.getPosition().y }, 0);
      ball.setLinearVelocity({ x: 0, y: Math.max(2, v.y) });
    } else if (tag === "chuteEnd" && st.mode === "ramp") setMode(ball, "field");
    else if (tag && typeof tag === "object") {
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
    } else if (tag === "ramp") {
      // onto the ramp going up, back onto the field if it rolls back down
      if (up !== (st.mode === "ramp")) setMode(ball, up ? "ramp" : "field");
    } else if (tag === "rampEnd" && st.mode === "ramp") {
      setMode(ball, "field");
      flash.set("ramp", simTime);
      score({ kind: "ramp" });
    } else if (tag === "outlane") score({ kind: "outlane" });
    else if (tag === "drain") onDrain(ball);
  }

  function onDrain(ball: Body) {
    if (phase !== "play") return;
    if (balls.length > 1) {
      // a job of the multiball ends; the last ball left is the one that counts
      removeBall(ball);
      if (balls.length === 1 && !launches.length) say("Parallel jobs done");
      return;
    }
    const d = toDrain(game, simTime - launchedAt);
    if (lasting === "TILT!") lasting = "";
    if (!d.again) say("Build broken");
    say(...d.msgs);
    sound("drain");
    if (game.over) {
      phase = "over";
      lasting = "F2 Starts New Game";
      if (demo) setTimeout(() => demo && phase === "over" && start(true), 4000);
      else {
        // this game's scores, even if a new game has started by then (F2 straight away)
        const ended = game;
        setTimeout(() => recordScores(ended), 1200);
      }
    } else phase = "ready";
    resetBall();
  }

  // ---------- input ----------
  function press(a: Action, on: boolean) {
    if (pressed[a] === on) return;
    pressed[a] = on;
    if (a === "plunger" && !on) release();
    if (!on || phase !== "play" || game.tilted) return;
    // the flipper keys also move the lit code review lanes (lane change)
    if (a === "left" || a === "right") return shiftLanes(player(game), a === "left" ? -1 : 1);
    if (!a.startsWith("nudge")) return;
    const kick = { nudgeR: { x: 3, y: 0 }, nudgeL: { x: -3, y: 0 }, nudgeU: { x: 0, y: -4 } }[a as "nudgeR"];
    for (const ball of balls) {
      const v = ball.getLinearVelocity();
      ball.setLinearVelocity({ x: v.x + kick.x, y: v.y + kick.y });
    }
    const level = nudge(game, simTime);
    if (level === "careful") say("Careful…");
    if (level === "tilt") {
      tiltedAt = simTime;
      lasting = "TILT!";
      say("TILT!");
      sound("tilt");
    }
  }

  const inLane = (ball: Body) =>
    ball.getPosition().x > 9 && ball.getPosition().y > H - 3 && ball.getLinearVelocity().length() < 1;

  function release() {
    const strength = plungerStrength(plungeHeld);
    plungeHeld = 0;
    const ball = balls.find(inLane);
    if (!ball || phase === "over" || game.tilted) return;
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
    const a = actionFor(opts.controls, e.key);
    if (!a) return;
    e.preventDefault();
    if (!demo && !userPaused) press(a, true);
  });
  document.addEventListener("keyup", (e) => {
    const a = actionFor(opts.controls, e.key);
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
      releaseAll();
      return paint();
    }
    acc += Math.min(0.05, (t - last) / 1000);
    last = t;
    let n = 0;
    while (acc >= STEP && n++ < 16) {
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
    if (game.tilted && simTime - tiltedAt > TILT_TIMEOUT) {
      while (balls.length > 1) removeBall(balls[1]);
      onDrain(balls[0]);
    }
    if (launches.length && launches[0] <= simTime && phase === "play") {
      launches.shift();
      addBall({ x: PLUNGER.x, y: H - 2.5 }).setLinearVelocity({ x: 0, y: -30 });
      sound("launch");
    }
    // A and D work the main flippers and the staging table's together
    for (const set of [flippers, minis])
      for (const [i, f] of set.entries()) {
        const up = (i === 0 ? pressed.left : pressed.right) && !game.tilted && phase !== "over";
        f.joint.setMotorSpeed(f.dir * (up ? -22 : 12));
      }
    world.step(STEP, 10, 6);
    for (const fn of after.splice(0)) fn();
    for (const ball of [...balls]) {
      const st = state.get(ball)!;
      if (st.held) {
        if (st.held > simTime) continue;
        ball.setActive(true);
        holeFree[st.hole] = simTime + 0.6;
        st.held = 0;
        if (st.hole === 2) {
          // out on top of the staging table
          holeFree[2] = simTime + 2;
          setMode(ball, "stage");
          ball.setTransform(STAGE_ENTRY, 0);
          ball.setLinearVelocity({ x: -2.5, y: 0.5 });
          continue;
        }
        const out = CACHES[st.hole].out;
        const l = Math.hypot(out.x, out.y);
        ball.setActive(true);
        ball.setLinearVelocity({ x: (out.x / l) * 15, y: (out.y / l) * 15 });
        holeFree[st.hole] = simTime + 0.6;
        st.held = 0;
        continue;
      }
      const p = ball.getPosition();
      const v = ball.getLinearVelocity();
      if (v.length() > 36) ball.setLinearVelocity({ x: (v.x * 36) / v.length(), y: (v.y * 36) / v.length() });
      if (p.y > H + 1 || p.x < 0 || p.x > W || p.y < 0) {
        if (phase === "play") onDrain(ball);
        else resetBall();
        continue;
      }
      // a ball resting somewhere on the field gets a small shake, so a game never sticks
      // (a ball held up on a flipper is cradled on purpose, so not while a flipper key is down)
      const cradled = p.y > 14.5 && (pressed.left || pressed.right);
      st.still = phase === "play" && v.length() < 0.05 && !inLane(ball) && !cradled ? st.still + STEP : 0;
      if (st.still > 3) {
        ball.setLinearVelocity({ x: Math.random() * 4 - 2, y: -3 });
        st.still = 0;
      }
    }
    spin += spinSpeed * STEP;
    spinSpeed = Math.max(0, spinSpeed - 10 * STEP);
  }

  /** Demo: flip when the ball comes down onto a flipper, pull the plunger when the ball waits on it. */
  function think() {
    for (const [i, { pivot, dir }] of FLIPPERS.entries()) {
      const mini = STAGE_FLIPPERS[i];
      const near = balls.some((b) => {
        const p = b.getPosition();
        const down = b.getLinearVelocity().y > -1;
        if (state.get(b)!.mode === "stage")
          return down && Math.hypot(p.x - (mini.pivot.x + mini.dir * 0.55), p.y - (mini.pivot.y + 0.2)) < 0.6;
        return down && Math.hypot(p.x - (pivot.x + dir * 0.9), p.y - (pivot.y + 0.3)) < 0.95;
      });
      if (near && demoHold[i] <= 0) demoHold[i] = 0.25;
      demoHold[i] -= STEP;
      press(i === 0 ? "left" : "right", demoHold[i] > 0);
    }
    if (balls.some(inLane) && !pressed.plunger) {
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

  // ---------- drawing: the table in 3D (pinball-3d.ts, loaded with this module) ----------
  const lit = (key: unknown, ms = 150) => simTime - (flash.get(key) ?? -9) < ms / 1000;
  const blink = (hz = 3) => Math.sin(simTime * hz * 2 * Math.PI) > 0;
  let view: View | null = null;
  try {
    // check first: without WebGL three.js would log an error before it throws
    if (!document.createElement("canvas").getContext("webgl2")) throw new Error("no WebGL");
    view = createView(canvas);
    new ResizeObserver(() => {
      view?.resize();
      paint();
    }).observe(canvas);
  } catch {
    say("This browser can't draw the 3D table (WebGL is off).");
  }
  const overlay = $("[data-overlay]");

  /** Height of a ramp's floor under a point: that of the nearest point of any ramp's centre line. */
  function rampHeight(p: P) {
    let best = Number.POSITIVE_INFINITY;
    let h = 0;
    for (const rp of RAMPS)
      for (const [i, q] of rp.path.entries()) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < best) [best, h] = [d, rp.heights[i]];
      }
    return h;
  }

  function lampOn(id: string): boolean {
    const p = player(game);
    const n = Number(id.at(-1));
    if (id.startsWith("mult")) return p.mult > n;
    if (id === "orbit") return p.mult === MULTIPLIERS.length - 1 ? blink() : lit("orbit", 800);
    if (id === "spinner") return lit("spinner", 800);
    if (id.startsWith("green")) return (rampLit(p) && (blink(4) || n === 1)) || lit("ramp", 600);
    if (id.startsWith("lift")) return (TICKETS[p.ticket].on === "staging" && blink(2)) || lit("lift", 600);
    if (id.startsWith("lane")) return p.lanes[n] || lit(id, 300);
    if (id.startsWith("cache")) return p.multiballLit && blink(2);
    if (id.startsWith("stage")) return p.lit[BANKS[n]];
    if (id.startsWith("ticket")) return Number(id.slice(6)) < Math.round((p.progress / TICKETS[p.ticket].goal) * 10);
    if (id === "again")
      return p.shootAgain || (phase === "play" && !game.saveUsed && simTime - launchedAt < BALL_SAVE && blink(2));
    return false;
  }

  function paint() {
    const p = player(game);
    // the panel (score, ball, game state) first: on a slow computer the 3D frame can take a while
    panel();
    view?.draw({
      flippers: [...flippers, ...minis].map((f) => ({ ...f.body.getPosition(), angle: f.body.getAngle() })),
      pods: PODS.map((q) => lit(q)),
      smoke: p.smoke.map((on, i) => on || lit(`smoke${i}`, 300)),
      balls: balls.map((b) => {
        const st = state.get(b)!;
        const q = b.getPosition();
        const h = st.mode === "stage" ? STAGE_H : st.mode === "ramp" ? rampHeight(q) : 0;
        return { x: q.x, y: q.y, h: st.held ? -R * 0.8 : h };
      }),
      bumpers: BUMPERS.map((b) => lit(b)),
      slings: SLINGS.map((s) => lit(s)),
      kickers: KICKERS.map((k) => lit(k)),
      targets: targetBodies.map((t) => t.isActive()),
      lamps: LAMPS.map((l) => lampOn(l.id)),
      spin,
      plunger: plungerStrength(plungeHeld),
      tilted: game.tilted,
      rank: RANKS[p.rank],
    });
    const over = game.tilted ? "TILT" : userPaused ? "PAUSED" : "";
    if (overlay.textContent !== over) overlay.textContent = over;
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
    const t = TICKETS[p.ticket];
    $("[data-ticket]").textContent = `${t.name} ${p.progress}/${t.goal}`;
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

  function recordScores(ended: Game) {
    const fresh: number[] = [];
    for (const [i, p] of ended.players.entries()) {
      const r = insertScore(scores, { name: `Player ${i + 1}`, score: p.score });
      if (r.at < 0) continue;
      scores = r.table;
      for (const [k, f] of fresh.entries()) if (f >= r.at) fresh[k] = f + 1;
      fresh.push(r.at);
    }
    if (!fresh.length) return;
    save(SCORES, { table: scores });
    // a modal box in a closed or minimised window would block the whole page unseen; the names stay "Player N"
    if (!win.hidden) showScores(fresh.filter((f) => f < 5));
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
      if (RESERVED.test(e.key)) return;
      // a key already used by another control swaps with it, so no two controls share a key
      const other = ACTIONS.find((a) => a !== waiting && norm(keys[a]) === norm(e.key));
      if (other) keys[other] = keys[waiting];
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
