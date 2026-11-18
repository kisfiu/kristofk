// One controller per Renovator XP mini-game. Rules live in renovation-games.ts; this file is input and drawing.
import {
  alive,
  BAND,
  bumps,
  cellTargets,
  drift,
  dust,
  edgeX,
  firstOpen,
  grabs,
  guideY,
  hollowAround,
  lumps,
  needle,
  type PaintStrip,
  paintStrips,
  peel,
  reveal,
  rollerMove,
  STRIPS,
  stripMid,
  sweeperDone,
  type Target,
  timingZone,
  touches,
} from "./renovation-games";
import { COLS, fine, type Game, GW, JOBS, L, MARK, type MiniGame, OPEN, ROWS, targets } from "./renovation-logic";
import { beep } from "./sound";

export const CELL = 16;
const C2 = CELL * 2;

/** What a controller may do to the outside world. */
export interface Env {
  g: Game;
  rnd: () => number;
  /** Fine the player now, with a short flash message. */
  fine(cost: number, text: string): void;
  say(text: string): void;
  shake(): void;
  /** Knock/Mark switch for touch screens. */
  markMode(): boolean;
}

export interface Ctl {
  /** Time limit in seconds; none = play until done. */
  seconds?: number;
  help: string;
  down(x: number, y: number, e: PointerEvent, now: number): void;
  move?(x: number, y: number, dist: number, dt: number, now: number): void;
  up?(): void;
  tick?(now: number, dt: number): void;
  draw(ctx: CanvasRenderingContext2D, now: number): void;
  /** 0..1 for untimed games. */
  progress(): number;
  done(now: number): boolean;
  /** Called once at the end: returns the result line, fining for anything left undone. */
  end(): string;
}

const setCells = (g: Game, cells: number[], layer: number) => {
  for (const i of cells) g.cells[i] = Math.max(g.cells[i], layer);
};
const near = (x: number, y: number, r: number) => {
  const out: number[] = [];
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(ROWS - 1, Math.floor(y + r)); yy++)
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(COLS - 1, Math.floor(x + r)); xx++)
      if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) <= r) out.push(yy * COLS + xx);
  return out;
};
const ftShort = (n: number) => `${n.toLocaleString("hu-HU")} Ft`;

/* ---------- Knock-sweeper ---------- */

const NUM_COLORS = ["", "#0000ff", "#007b00", "#ff0000", "#000084", "#840000", "#008284", "#000", "#808080"];

function sweeper(env: Env): Ctl {
  const { g } = env;
  if (!g.known.some((k) => k)) reveal(g.hollow, g.known, firstOpen(g.hollow, env.rnd));
  const total = g.hollow.reduce((s, h) => s + h, 0);
  const marks = () => g.known.reduce((s, k) => s + (k === MARK ? 1 : 0), 0);
  return {
    help: "Left-click knocks: a number tells how many hollow cells touch it. Right-click marks a hollow cell (on a phone, switch to Mark). Mark them all!",
    down(x, y, e) {
      const c = Math.floor(y / 2) * GW + Math.floor(x / 2);
      if (g.known[c] === OPEN) return;
      if (e.button === 2 || env.markMode()) {
        // marking a marked cell again takes the mark off
        if (g.known[c] === MARK) {
          g.known[c] = 0;
          beep("pop");
          env.say("Mark removed.");
        } else {
          // like the real game: mark any cell, right or wrong, no telling which
          g.known[c] = MARK;
          beep("pop");
          env.say(`Marked. ${marks()} marks for ${total} hollow cells.`);
        }
        return;
      }
      if (g.known[c] === MARK) return; // knocking a marked cell does nothing
      if (g.hollow[c]) {
        g.known[c] = MARK;
        beep("thud");
        env.shake();
        env.fine(2_000, "It crumbled! Found that one the hard way.");
        return;
      }
      reveal(g.hollow, g.known, c);
      beep("knock");
      const n = hollowAround(g.hollow, c);
      env.say(n ? `Knock… ${n} hollow next to it.` : "Knock… solid all around.");
    },
    draw(ctx) {
      ctx.font = "bold 18px Tahoma, Verdana, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let c = 0; c < g.known.length; c++) {
        const x = (c % GW) * C2;
        const y = Math.floor(c / GW) * C2;
        const k = g.known[c];
        if (!k || k === MARK) {
          // raised tile, see-through so the old wall shows
          ctx.fillStyle = "rgba(236,233,216,.55)";
          ctx.fillRect(x, y, C2, C2);
          ctx.fillStyle = "rgba(255,255,255,.8)";
          ctx.fillRect(x, y, C2, 2);
          ctx.fillRect(x, y, 2, C2);
          ctx.fillStyle = "rgba(90,90,80,.7)";
          ctx.fillRect(x, y + C2 - 2, C2, 2);
          ctx.fillRect(x + C2 - 2, y, 2, C2);
        }
        if (k === MARK) {
          ctx.fillStyle = "#222";
          ctx.fillRect(x + 15, y + 7, 2, 18);
          ctx.fillStyle = "#e01b10";
          ctx.beginPath();
          ctx.moveTo(x + 17, y + 7);
          ctx.lineTo(x + 26, y + 11);
          ctx.lineTo(x + 17, y + 15);
          ctx.fill();
        } else if (k) {
          const n = hollowAround(g.hollow, c);
          if (n) {
            ctx.fillStyle = "rgba(255,255,255,.55)";
            ctx.fillRect(x + 6, y + 6, C2 - 12, C2 - 12);
            ctx.fillStyle = NUM_COLORS[n];
            ctx.fillText(String(n), x + C2 / 2, y + C2 / 2 + 1);
          }
        }
      }
    },
    progress: () => g.known.reduce((s, k, c) => s + (k === MARK && g.hollow[c] ? 1 : 0), 0) / total,
    done: () => sweeperDone(g.hollow, g.known),
    end: () => "",
  };
}

/* ---------- Target games: flakes, chisel, dust, soak, bumps ---------- */

interface TargetOpts {
  seconds: number;
  help: string;
  list: Target[];
  radius: number;
  /** Damage per tap; 0 = taps do nothing. */
  tap: number;
  /** A drag through a target hits it too. */
  swipe?: boolean;
  /** Damage per wall cell of rubbing over it. */
  rub?: number;
  /** Fine for tapping next to every target. */
  offFine?: [number, string];
  /** Fine per target left at the end. */
  leftFine: number;
  noun: string;
  sound: Parameters<typeof beep>[0];
  onKill?(t: Target): void;
  drawOne(ctx: CanvasRenderingContext2D, t: Target, now: number): void;
}

function targetGame(env: Env, o: TargetOpts): Ctl {
  const hit = (t: Target, dmg: number) => {
    t.hp -= dmg;
    if (t.hp > 0) return beep("knock");
    beep(o.sound);
    o.onKill?.(t);
  };
  const left = () => o.list.filter((t) => t.hp > 0).length;
  return {
    seconds: o.seconds,
    help: o.help,
    down(x, y, _e, now) {
      const t = o.list.find((t) => alive(t, now) && touches(t, x, y, o.radius));
      if (t && o.tap) hit(t, o.tap);
      // tapping a target already done is fine; only plain good wall counts as a miss
      else if (!t && o.offFine && !o.list.some((t) => touches(t, x, y, o.radius))) env.fine(...o.offFine);
    },
    move(x, y, dist, _dt, now) {
      for (const t of o.list) {
        if (!alive(t, now) || !touches(t, x, y, o.radius)) continue;
        if (o.rub) hit(t, dist * o.rub);
        else if (o.swipe) hit(t, t.hp);
      }
    },
    tick(_now, dt) {
      for (const t of o.list) if (t.vx || t.vy) drift(t, dt);
    },
    draw(ctx, now) {
      for (const t of o.list) if (alive(t, now)) o.drawOne(ctx, t, now);
    },
    progress: () => 1 - left() / o.list.length,
    // done early once nothing is left to hit (flakes: once the last one has come and gone)
    done: (now) => o.list.every((t) => t.hp <= 0 || now >= t.born + t.life),
    end() {
      const n = left();
      if (n) env.fine(n * o.leftFine, "");
      const got = o.list.length - n;
      return `${got}/${o.list.length} ${o.noun}.`;
    },
  };
}

/* ---------- Peel the paint (scraper) ---------- */

function peelGame(env: Env): Ctl {
  const { g } = env;
  const strips = paintStrips();
  let held: PaintStrip | null = null;
  const bare = (s: PaintStrip) => {
    const from = s.dir === 1 ? 0 : Math.ceil(COLS - s.done);
    const to = s.dir === 1 ? Math.floor(s.done) : COLS;
    const cells: number[] = [];
    for (let r = s.row; r < s.row + 2; r++) for (let c = from; c < to; c++) cells.push(r * COLS + c);
    setCells(g, cells, L.BARE);
  };
  const peeled = () => strips.reduce((n, s) => n + s.done, 0) / (COLS * strips.length);
  return {
    seconds: 60,
    help: "Grab a curled paint edge (the light roll with ▶ or ◀) and drag it across the wall.",
    down(x, y) {
      held = strips.find((s) => grabs(s, x, y)) ?? null;
      if (held) beep("scrape");
      else env.say("Grab a curled edge: the light roll at the end of each strip.");
    },
    move(x) {
      if (!held) return;
      const r = peel(held, x);
      bare(held);
      if (r === "done") {
        held = null;
        beep("ding");
        env.say("Strip off! Grab the next one.");
      }
    },
    up() {
      held = null;
    },
    draw(ctx) {
      for (const s of strips) {
        if (s.done >= COLS) continue;
        // the curled edge: a light roll of paint with an arrow showing which way to pull
        const x = edgeX(s) * CELL;
        const y = s.row * CELL;
        const grad = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
        grad.addColorStop(0, "#5e8a73");
        grad.addColorStop(0.5, "#f4f8f2");
        grad.addColorStop(1, "#5e8a73");
        ctx.fillStyle = grad;
        ctx.fillRect(x - 5, y + 2, 10, C2 - 4);
        ctx.fillStyle = s === held ? "#c41f12" : "#1d3f8f";
        ctx.font = "bold 14px Tahoma, Verdana, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.dir === 1 ? "▶" : "◀", x + s.dir * 14, stripMid(s) * CELL);
      }
    },
    progress: peeled,
    done: () => strips.every((s) => s.done >= COLS),
    end() {
      const left = strips.filter((s) => s.done < COLS).length;
      if (left) env.fine(left * 500, "");
      return `${strips.length - left}/${strips.length} strips peeled.`;
    },
  };
}

const cellBox = (t: Target) => [(t.cell! % GW) * C2, Math.floor(t.cell! / GW) * C2] as const;

function chiselGame(env: Env): Ctl {
  return targetGame(env, {
    seconds: 30,
    help: "Tap each marked cell twice to break the bad plaster out. Don't hit the good plaster!",
    list: cellTargets(env.g.hollow, 2),
    radius: 0,
    tap: 1,
    offFine: [1_000, "Ouch, that was good plaster."],
    leftFine: 1_000,
    noun: "cells chiselled",
    sound: "thud",
    onKill: (t) => setCells(env.g, fine(t.cell!), L.DUSTY),
    drawOne(ctx, t) {
      const [x, y] = cellBox(t);
      ctx.strokeStyle = "#ffd34d";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, C2 - 4, C2 - 4);
      if (t.hp === 1) {
        ctx.strokeStyle = "#3a2a1a";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 6);
        ctx.lineTo(x + 16, y + 16);
        ctx.lineTo(x + 12, y + 26);
        ctx.moveTo(x + 16, y + 16);
        ctx.lineTo(x + 26, y + 12);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    },
  });
}

function dustGame(env: Env): Ctl {
  return targetGame(env, {
    seconds: 20,
    help: "Sweep the broom through the brown dust clouds!",
    list: dust(env.rnd, env.g.hollow),
    radius: 2,
    tap: 1,
    swipe: true,
    leftFine: 300,
    noun: "dust clouds",
    sound: "pop",
    drawOne(ctx, t, now) {
      // dark brown puffs with a light rim, gently swirling, so they stand out on brick and plaster alike
      const x = t.x * CELL;
      const y = t.y * CELL;
      const wob = Math.sin(now / 200 + t.x) * 2;
      for (const [dx, dy, r] of [
        [0, 0, 14],
        [-12, 5 + wob, 10],
        [12, 4 - wob, 10],
        [2, -9, 9],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(92,70,48,.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,240,210,.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    },
  });
}

function soakGame(env: Env): Ctl {
  const seconds = 20;
  return targetGame(env, {
    seconds,
    help: "Tap every brick cell before the wet primer glow fades!",
    list: cellTargets(env.g.hollow, 1),
    radius: 0,
    tap: 1,
    leftFine: 1_000,
    noun: "cells primed",
    sound: "pop",
    onKill: (t) => setCells(env.g, fine(t.cell!), L.DEEP),
    drawOne(ctx, t, now) {
      const [x, y] = cellBox(t);
      ctx.fillStyle = `rgba(80,160,255,${0.15 + 0.55 * Math.max(0, 1 - now / (seconds * 1000))})`;
      ctx.fillRect(x + 2, y + 2, C2 - 4, C2 - 4);
    },
  });
}

/* ---------- Sand the whole wall ---------- */

const MASK_W = 256,
  MASK_H = 160;

/** Sanding block radius in mask pixels (about 3.5 wall cells, a big block). */
const SAND_R = 28;

function sandGame(env: Env): Ctl {
  // Two smooth layers 8× finer than the wall grid, so nothing looks blocky; the wall itself keeps its look:
  // `sanded` collects where the block has been (shown as a faint sheen), `lumps` holds the bumps to rub away.
  const layer = () => {
    const c = document.createElement("canvas");
    c.width = MASK_W;
    c.height = MASK_H;
    return [c, c.getContext("2d", { willReadFrequently: true })!] as const;
  };
  const [sandedC, sanded] = layer();
  const [lumpsC, lumpsX] = layer();
  // lumps from sloppy plaster and putty (plus a few always): raised spots that take extra passes
  const extra = Math.min(12, env.g.bumps);
  for (const b of bumps(env.rnd, extra)) {
    const x = (b.x / COLS) * MASK_W;
    const y = (b.y / ROWS) * MASK_H;
    const grad = lumpsX.createRadialGradient(x - 2, y - 2, 1, x, y, 10);
    grad.addColorStop(0, "rgba(255,254,246,1)");
    grad.addColorStop(1, "rgba(160,150,128,0)");
    lumpsX.fillStyle = grad;
    for (let k = 0; k < 3; k++) lumpsX.fillRect(x - 10, y - 10, 20, 20);
  }
  const scale = MASK_W / COLS;
  const stamp = (c: CanvasRenderingContext2D, x: number, y: number, alpha: number) => {
    const grad = c.createRadialGradient(x, y, 0, x, y, SAND_R);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = grad;
    c.fillRect(x - SAND_R, y - SAND_R, SAND_R * 2, SAND_R * 2);
  };
  const rub = (x0: number, y0: number, x1: number, y1: number) => {
    lumpsX.globalCompositeOperation = "destination-out";
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.6) + 1;
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 1 : i / (steps - 1);
      const x = (x0 + (x1 - x0) * t) * scale;
      const y = (y0 + (y1 - y0) * t) * scale;
      stamp(sanded, x, y, 0.3);
      stamp(lumpsX, x, y, 0.06);
    }
    lumpsX.globalCompositeOperation = "source-over";
  };
  let smooth = 0;
  let checked = -1_000;
  const measure = (now: number) => {
    if (now - checked < 250) return smooth;
    checked = now;
    const a = sanded.getImageData(0, 0, MASK_W, MASK_H).data;
    const b = lumpsX.getImageData(0, 0, MASK_W, MASK_H).data;
    let ok = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] >= 128 && b[i] < 26) ok++;
    smooth = ok / (MASK_W * MASK_H);
    return smooth;
  };
  let last: [number, number] | null = null;
  let nowT = 0;
  return {
    seconds: 40,
    help: extra
      ? `Sand the whole wall with the big block. Your plaster and putty left ${extra} lumps: they take extra rubbing.`
      : "Sand the whole wall with the big block. Nice clean putty work, only a few lumps!",
    down(x, y) {
      last = [x, y];
      rub(x, y, x, y);
    },
    move(x, y) {
      if (last) rub(last[0], last[1], x, y);
      last = [x, y];
    },
    up() {
      last = null;
    },
    tick(now) {
      nowT = now;
      measure(now);
    },
    draw(ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(sandedC, 0, 0, COLS * CELL, ROWS * CELL);
      ctx.globalAlpha = 1;
      ctx.drawImage(lumpsC, 0, 0, COLS * CELL, ROWS * CELL);
    },
    progress: () => smooth,
    done: () => measure(nowT) >= 0.97,
    end() {
      const c = measure(nowT + 1_000);
      const cost = c < 0.9 ? Math.ceil((0.9 - c) * 10) * 1_000 : 0;
      if (cost) env.fine(cost, "");
      return `Sanded ${Math.round(c * 100)}%${cost ? `: the rough spots cost ${ftShort(cost)} to redo.` : "."}`;
    },
  };
}

/* ---------- Timing bar (hard plaster) ---------- */

function timingGame(env: Env): Ctl {
  const { g } = env;
  const patches = [...new Set([...g.patch].filter((p) => p >= 0))];
  let cur = 0;
  let from = 0;
  let nowT = 0;
  const speed = () => 0.5 + cur * 0.1;
  const BAR = { x: 56, y: 284, w: 400, h: 22 };
  // the bar moves to the top when the current patch sits low on the wall, so it never hides it
  const barY = () => {
    const rows = [...g.patch.keys()].filter((i) => g.patch[i] === patches[cur]).map((i) => Math.floor(i / COLS));
    return Math.max(...rows) >= 15 ? 14 : BAR.y;
  };
  return {
    help: "Tap anywhere when the needle is in the green. Each patch is a bit faster.",
    down(_x, _y, _e, now) {
      if (cur >= patches.length) return;
      const zone = timingZone(needle(now - from, speed()));
      from = now;
      if (zone === "red") {
        beep("error");
        env.shake();
        env.fine(2_000, "Splat! The plaster fell off. Again!");
        return;
      }
      if (zone === "yellow") {
        g.bumps++;
        beep("pop");
        env.say("A bit lumpy. That's one more bump to sand.");
      } else {
        beep("ding");
        env.say("Perfect!");
      }
      setCells(
        g,
        targets(g).filter((i) => g.patch[i] === patches[cur]),
        L.HARD,
      );
      cur++;
    },
    tick(now) {
      nowT = now;
    },
    draw(ctx) {
      if (cur >= patches.length) return;
      ctx.strokeStyle = `rgba(255,211,77,${0.6 + 0.4 * Math.sin(nowT / 120)})`;
      ctx.lineWidth = 3;
      g.patch.forEach((p, i) => {
        if (p === patches[cur])
          ctx.strokeRect((i % COLS) * CELL + 1, Math.floor(i / COLS) * CELL + 1, CELL - 2, CELL - 2);
      });
      ctx.lineWidth = 1;
      const y = barY();
      ctx.fillStyle = "#c41f12";
      ctx.fillRect(BAR.x, y, BAR.w, BAR.h);
      ctx.fillStyle = "#f2c200";
      ctx.fillRect(BAR.x + BAR.w * 0.3, y, BAR.w * 0.4, BAR.h);
      ctx.fillStyle = "#2f9a1c";
      ctx.fillRect(BAR.x + BAR.w * 0.42, y, BAR.w * 0.16, BAR.h);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(BAR.x, y, BAR.w, BAR.h);
      const nx = BAR.x + BAR.w * needle(nowT - from, speed());
      ctx.fillStyle = "#000";
      ctx.fillRect(nx - 2, y - 6, 4, BAR.h + 12);
    },
    progress: () => cur / patches.length,
    done: () => cur >= patches.length,
    end: () => (g.bumps ? "A few lumps, though." : "Perfectly flat."),
  };
}

/* ---------- Steady hand (putty) ---------- */

function steadyGame(env: Env): Ctl {
  const { g } = env;
  const to = JOBS[g.job].to;
  const phase = env.rnd() * 6;
  let strip = 0;
  /** Points of the current drag; the flag says whether the point was inside the band. */
  let trail: [number, number, boolean][] | null = null;
  let outside = 0;
  let lumpsAdded = 0;
  let redos = 0;
  const rowsPer = ROWS / STRIPS;
  const inside = (x: number, y: number) => Math.abs(y - guideY(strip, x, phase)) <= BAND;
  return {
    help: "Drag the putty knife from the ▶ along the wavy band to the right edge. Stay inside the band: red means you're off it!",
    down(x, y) {
      if (strip >= STRIPS) return;
      if (x > 3 || !inside(x, y)) return env.say("Start at the ▶ on the left, inside the band.");
      trail = [[x, y, true]];
      outside = 0;
    },
    move(x, y) {
      if (!trail) return;
      const ok = inside(x, y);
      if (!ok) outside++;
      if (!ok && trail[trail.length - 1][2]) {
        beep("error");
        env.say("Off the line! Get back inside the band.");
      }
      trail.push([x, y, ok]);
      if (x < COLS - 1.5) return;
      const off = outside / trail.length;
      trail = null;
      if (off > 0.3) {
        redos++;
        beep("error");
        env.shake();
        env.say(`Too wobbly: ${Math.round(off * 100)}% off the line. Scrape it off and do that strip again.`);
        return;
      }
      const l = lumps(off);
      g.bumps += l;
      lumpsAdded += l;
      const rows: number[] = [];
      for (let r = strip * rowsPer; r < (strip + 1) * rowsPer; r++)
        for (let c = 0; c < COLS; c++) rows.push(r * COLS + c);
      setCells(g, rows, to);
      beep(l ? "pop" : "ding");
      env.say(l ? `Done, but lumpy: ${l} more to sand.` : "Smooth! Next strip.");
      strip++;
    },
    up() {
      if (!trail) return;
      trail = null;
      env.say("Keep the knife on the wall all the way to the right edge! Try that strip again.");
    },
    draw(ctx) {
      if (strip >= STRIPS) return;
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.beginPath();
      for (let x = 0; x <= COLS; x += 0.5) ctx.lineTo(x * CELL, (guideY(strip, x, phase) - BAND) * CELL);
      for (let x = COLS; x >= 0; x -= 0.5) ctx.lineTo(x * CELL, (guideY(strip, x, phase) + BAND) * CELL);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(44,111,209,.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#2c6fd1";
      ctx.font = "bold 16px Tahoma, Verdana, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", 2, guideY(strip, 0.5, phase) * CELL);
      if (!trail) return;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) {
        const [x0, y0] = trail[i - 1];
        const [x1, y1, ok] = trail[i];
        ctx.strokeStyle = ok ? "#fffdf5" : "#e01b10";
        ctx.beginPath();
        ctx.moveTo(x0 * CELL, y0 * CELL);
        ctx.lineTo(x1 * CELL, y1 * CELL);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      ctx.lineWidth = 1;
    },
    progress: () => strip / STRIPS,
    done: () => strip >= STRIPS,
    end: () =>
      `${lumpsAdded ? `${lumpsAdded} lumps to sand later.` : "Smooth as glass."}${redos ? ` ${redos} strip${redos > 1 ? "s" : ""} redone.` : ""}`,
  };
}

/* ---------- Roller (primer and paint) ---------- */

export function rollerGame(env: Env, tray: () => boolean): Ctl {
  const { g } = env;
  const to = JOBS[g.job].to;
  const all = COLS * ROWS;
  let load = 1;
  let lastDrip = -1_000;
  let warned = false;
  const drips: [number, number, number][] = [];
  const covered = () => g.cells.reduce((s, c) => s + (c >= to ? 1 : 0), 0) / all;
  const roll = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5) + 1;
    for (let s = 0; s < steps; s++) {
      const t = steps === 1 ? 1 : s / (steps - 1);
      setCells(g, near(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.8), to);
    }
  };
  let last: [number, number] | null = null;
  return {
    seconds: 35,
    help: "Roll over the whole wall. Dip the roller in the tray when it runs dry. Don't flick too fast or it drips!",
    down(x, y) {
      last = [x, y];
      if (load > 0) roll(x, y, x, y);
    },
    move(x, y, dist, dt, now) {
      const r = rollerMove(load, dist, dt);
      load = r.load;
      if (r.paints && last) roll(last[0], last[1], x, y);
      last = [x, y];
      if (r.drip && now - lastDrip > 400) {
        lastDrip = now;
        drips.push([x, y, now]);
        env.fine(300, "Drip! Slow down.");
      }
      if (!load && !warned) {
        warned = true;
        env.say("The roller is dry: dip it in the tray!");
      }
    },
    up() {
      last = null;
    },
    draw(ctx, now) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      for (const [x, y, born] of drips) ctx.fillRect(x * CELL - 2, y * CELL, 4, Math.min(40, (now - born) / 20));
      // paint meter: green from the bottom, all red when the roller is dry
      ctx.fillStyle = load ? "#555" : "#c41f12";
      ctx.fillRect(COLS * CELL - 12, 8, 8, ROWS * CELL - 16);
      ctx.fillStyle = "#2f9a1c";
      const h = (ROWS * CELL - 16) * load;
      ctx.fillRect(COLS * CELL - 12, ROWS * CELL - 8 - h, 8, h);
    },
    progress: covered,
    done: () => covered() >= 0.97,
    end() {
      const c = covered();
      const cost = c < 0.9 ? Math.ceil((0.9 - c) * 10) * 1_000 : 0;
      if (cost) env.fine(cost, "");
      return `Covered ${Math.round(c * 100)}%${cost ? `: touch-ups cost ${ftShort(cost)}.` : ". Lovely!"}`;
    },
    // the tray button in renovation-ui.ts sets a flag; pick it up here
    tick() {
      if (tray()) {
        load = 1;
        warned = false;
      }
    },
  };
}

export function makeGame(kind: MiniGame, env: Env, tray: () => boolean): Ctl {
  switch (kind) {
    case "sweeper":
      return sweeper(env);
    case "peel":
      return peelGame(env);
    case "chisel":
      return chiselGame(env);
    case "dust":
      return dustGame(env);
    case "soak":
      return soakGame(env);
    case "timing":
      return timingGame(env);
    case "steady":
      return steadyGame(env);
    case "sand":
      return sandGame(env);
    case "roller":
      return rollerGame(env, tray);
  }
}
