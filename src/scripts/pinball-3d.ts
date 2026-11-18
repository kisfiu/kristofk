// Pipeline Pinball in 3D (three.js): the floor art is a texture drawn here in 2D, every part standing on it is a
// lit mesh (chrome, plastic, rubber), with shadows and reflections. The physics stays 2D (pinball-ui.ts): table
// x is three's X, table y is Z (towards the player), height is Y.
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BANKS } from "./pinball-logic";
import {
  APRON,
  arc,
  BUMPER_R,
  BUMPERS,
  CACHES,
  COLORS,
  FLIP_LEN,
  FLIPPERS,
  GATE,
  H,
  KICKERS,
  LAMPS,
  LIFT,
  MID,
  MULT_Y,
  type P,
  PLUNGER,
  POD_R,
  PODS,
  POST_R,
  POSTS,
  R,
  RAMPS,
  SLINGS,
  SMOKE,
  SPINNER,
  STAGE_FLIP_LEN,
  STAGE_FLIPPERS,
  STAGE_H,
  STAGE_WALL,
  TARGETS,
  TRACES,
  W,
  WALLS,
} from "./pinball-table";

export interface Frame {
  /** The two main flippers, then the staging table's two. */
  flippers: { x: number; y: number; angle: number }[];
  /** `h`: how high the bottom of the ball is (on a ramp, or below 0 in a cache hole). */
  balls: { x: number; y: number; h: number }[];
  bumpers: boolean[];
  slings: boolean[];
  kickers: boolean[];
  pods: boolean[];
  smoke: boolean[];
  targets: boolean[];
  /** One per LAMPS entry. */
  lamps: boolean[];
  spin: number;
  /** Plunger pull, 0–1. */
  plunger: number;
  tilted: boolean;
  rank: string;
}

const v3 = (p: P, h = 0) => new Vector3(p.x, h, p.y);

function textCanvas(lines: string[], w: number, h: number, color: string, font: string, bg?: string) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [i, l] of lines.entries()) g.fillText(l, w / 2, (h * (i + 0.5)) / lines.length);
  return c;
}
const texture = (c: HTMLCanvasElement) => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// ---------- the printed playfield ----------
function drawFloor(c: CanvasRenderingContext2D, S: number) {
  const path = (ps: P[], close = false) => {
    c.beginPath();
    for (const [i, p] of ps.entries()) c[i ? "lineTo" : "moveTo"](p.x * S, p.y * S);
    if (close) c.closePath();
  };
  const text = (s: string, x: number, y: number, size: number, color: string, angle = 0) => {
    c.save();
    c.translate(x * S, y * S);
    c.rotate(angle);
    c.fillStyle = color;
    c.font = `bold ${size * S}px Tahoma, Verdana, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(s, 0, 0);
    c.restore();
  };
  c.fillStyle = "#1a1d24";
  c.fillRect(0, 0, W * S, H * S);
  c.save();
  path(WALLS[0], true);
  c.clip();
  // a deep blue night, lighter in the middle
  const bg = c.createRadialGradient(4.6 * S, 10 * S, 0, 4.6 * S, 10 * S, 11 * S);
  bg.addColorStop(0, "#2a66bf");
  bg.addColorStop(0.45, "#133a78");
  bg.addColorStop(1, "#071230");
  c.fillStyle = bg;
  c.fillRect(0, 0, W * S, H * S);
  // circuit traces, as on a server board
  c.strokeStyle = "rgb(120 190 255 / 0.18)";
  c.fillStyle = "rgb(120 190 255 / 0.25)";
  c.lineWidth = 0.04 * S;
  for (const t of TRACES) {
    path(t);
    c.stroke();
    for (const e of [t[0], t[t.length - 1]]) {
      c.beginPath();
      c.arc(e.x * S, e.y * S, 0.08 * S, 0, 7);
      c.fill();
    }
  }
  // the big picture in the middle: a pipeline status ring, one arc per stage, with tick marks
  const cx = MID * S;
  const cy = 10.75 * S;
  c.lineWidth = 0.05 * S;
  c.strokeStyle = "rgb(160 210 255 / 0.25)";
  for (const r of [1.85, 1.35]) {
    c.beginPath();
    c.arc(cx, cy, r * S, 0, 7);
    c.stroke();
  }
  for (const [i, b] of BANKS.entries()) {
    c.beginPath();
    c.arc(
      cx,
      cy,
      1.6 * S,
      -Math.PI / 2 + (i * 2 * Math.PI) / 3 + 0.08,
      -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / 3 - 0.08,
    );
    c.strokeStyle = `${COLORS[b]}66`;
    c.lineWidth = 0.32 * S;
    c.stroke();
  }
  c.strokeStyle = "rgb(160 210 255 / 0.3)";
  c.lineWidth = 0.03 * S;
  for (let a = 0; a < 2 * Math.PI; a += Math.PI / 18) {
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 1.85 * S, cy + Math.sin(a) * 1.85 * S);
    c.lineTo(cx + Math.cos(a) * 2.02 * S, cy + Math.sin(a) * 2.02 * S);
    c.stroke();
  }
  // the plunger lane
  c.fillStyle = "rgb(190 225 255 / 0.08)";
  c.fillRect(9 * S, 6 * S, 0.7 * S, (H - 6) * S);
  // the cache holes
  for (const h of CACHES) {
    c.beginPath();
    c.arc(h.x * S, h.y * S, 0.3 * S, 0, 7);
    const g = c.createRadialGradient(h.x * S, (h.y - 0.08) * S, 0, h.x * S, h.y * S, 0.3 * S);
    g.addColorStop(0, "#000");
    g.addColorStop(0.8, "#05080e");
    g.addColorStop(1, "#2a303b");
    c.fillStyle = g;
    c.fill();
    text("CACHE", h.x, h.y + 0.68, 0.2, "#cfe6ff");
  }
  // labels
  text("CODE REVIEW", 3.5, 1.6, 0.22, "#cfe6ff");
  text("RENOVATE", 0.82, 3.95, 0.2, "#cfe6ff", -Math.PI / 2);
  for (const [i, m] of ["×2", "×3", "×5", "×10"].entries()) text(m, 0.82, MULT_Y[i], 0.15, "#e9fff0");
  text("HELM UPGRADE", 8.72, 6.9, 0.2, "#cfe6ff", -Math.PI / 2);
  text("STAGING", 2.75, 9.75, 0.22, "#a8e4ff");
  // the lift hole that takes the ball up to the staging table
  {
    const h = LIFT;
    c.beginPath();
    c.arc(h.x * S, h.y * S, 0.3 * S, 0, 7);
    const g = c.createRadialGradient(h.x * S, (h.y - 0.08) * S, 0, h.x * S, h.y * S, 0.3 * S);
    g.addColorStop(0, "#000");
    g.addColorStop(0.8, "#05080e");
    g.addColorStop(1, "#2a303b");
    c.fillStyle = g;
    c.fill();
  }
  text("git push", 9.35, 11.5, 0.26, "#cfe6ff", -Math.PI / 2);
  text("MERGE CONFLICT", 0.55, 14.4, 0.15, "#ff9c9c", -Math.PI / 2);
  text("MERGE CONFLICT", 8.75, 14.4, 0.15, "#ff9c9c", Math.PI / 2);
  text("TICKET", MID, 13.75, 0.17, "#9fd8ff");
  text("SHOOT AGAIN", MID, 15.62, 0.15, "#ffb0b0");
  for (const [b, x, y, a] of [
    ["BUILD", 1.0, 9.1, -Math.PI / 2],
    ["TEST", 4.3, 7.85, 0],
    ["DEPLOY", 8.6, 9.6, Math.PI / 2],
  ] as const)
    text(b, x, y, 0.3, COLORS[b], a);
  c.fillStyle = "rgb(0 0 0 / 0.45)";
  c.beginPath();
  c.roundRect(3.25 * S, 10.25 * S, 2.8 * S, 0.95 * S, 0.2 * S);
  c.fill();
  text("RANK", MID, 10.48, 0.2, "#9fb8d8");
  c.restore();
}

export interface View {
  draw(f: Frame): void;
  resize(): void;
}

/** Throws when the browser has no WebGL; the caller shows a message instead. */
export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  // 1.5× is sharp enough for the table and much less work per frame on phones and GPU-less machines
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color("#000000");
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new PerspectiveCamera(30, 1, 0.5, 80);

  // light: a key from the front left that casts the shadows, a cool sky fill, a warm glow at the flippers
  const key = new DirectionalLight("#ffffff", 2.2);
  key.position.set(-3, 16, 20);
  key.target.position.set(W / 2, 0, H / 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: 5, far: 50 });
  key.shadow.bias = -0.0004;
  scene.add(key, key.target, new HemisphereLight("#c8dcff", "#0b0d14", 0.6));
  const glow = new PointLight("#ffd9a0", 6, 9, 1.6);
  glow.position.set(MID, 2.2, 15.5);
  scene.add(glow);

  const chrome = new MeshStandardMaterial({ color: "#e4e9f0", metalness: 1, roughness: 0.18 });
  const darkMetal = new MeshStandardMaterial({ color: "#2b303a", metalness: 0.7, roughness: 0.45 });
  const white = new MeshStandardMaterial({ color: "#f4f6fb", metalness: 0, roughness: 0.3 });
  const rubber = new MeshStandardMaterial({ color: "#d63a2a", metalness: 0, roughness: 0.6 });
  const add = <T extends Mesh | Group>(m: T, shadow = true) => {
    m.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = shadow;
        o.receiveShadow = true;
      }
    });
    scene.add(m);
    return m;
  };
  /** A solid standing on the table with outline `ps` (table units), `h` high, from height `base`. */
  const prism = (ps: P[], h: number, mat: Material, base = 0, bevel = 0.02) => {
    const shape = new Shape(ps.map((p) => ({ x: p.x, y: p.y }) as never));
    const g = new ExtrudeGeometry(shape, {
      depth: h - 2 * bevel,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
    });
    g.rotateX(Math.PI / 2);
    g.translate(0, base + h - bevel, 0);
    return new Mesh(g, mat);
  };

  // the floor and the cabinet around it
  const FS = 100;
  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = W * FS;
  floorCanvas.height = H * FS;
  drawFloor(floorCanvas.getContext("2d")!, FS);
  const floor = new Mesh(
    new PlaneGeometry(W, H),
    new MeshStandardMaterial({ map: texture(floorCanvas), roughness: 0.42, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const wood = new MeshStandardMaterial({ color: "#3b2a1e", metalness: 0.1, roughness: 0.55 });
  for (const [x, z, w, d] of [
    [-0.3, H / 2, 0.6, H + 0.6],
    [W + 0.3, H / 2, 0.6, H + 0.6],
    [W / 2, -0.3, W + 1.2, 0.6],
  ]) {
    const m = new Mesh(new BoxGeometry(w, 1.3, d), wood);
    m.position.set(x, 0.55, z);
    add(m);
    const trim = new Mesh(new BoxGeometry(w + 0.02, 0.06, d + 0.02), darkMetal);
    trim.position.set(x, 1.22, z);
    add(trim);
  }

  // walls: chrome guides, taller round the outside
  for (const [i, wall] of WALLS.entries()) {
    const h = i === 0 ? 0.65 : 0.42;
    for (const [j, a] of wall.slice(0, -1).entries()) {
      const b = wall[j + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const m = new Mesh(new BoxGeometry(len + 0.1, h, i === 0 ? 0.16 : 0.11), chrome);
      m.position.set((a.x + b.x) / 2, h / 2, (a.y + b.y) / 2);
      m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      add(m);
    }
  }
  {
    const len = Math.hypot(GATE[1].x - GATE[0].x, GATE[1].y - GATE[0].y);
    const gate = new Mesh(new BoxGeometry(len, 0.3, 0.04), chrome);
    gate.position.set((GATE[0].x + GATE[1].x) / 2, 0.3, (GATE[0].y + GATE[1].y) / 2);
    gate.rotation.y = -Math.atan2(GATE[1].y - GATE[0].y, GATE[1].x - GATE[0].x);
    add(gate);
  }
  for (const h of [...CACHES, LIFT]) {
    const ring = new Mesh(new TorusGeometry(0.31, 0.04, 10, 32), chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(h.x, 0.02, h.y);
    add(ring, false);
  }

  // red rubber kickers on the outer walls
  const kickMats = KICKERS.map((k) => {
    const m = rubber.clone();
    const len = Math.hypot(k.b.x - k.a.x, k.b.y - k.a.y);
    const strip = new Mesh(new BoxGeometry(0.1, 0.3, len), m);
    strip.position.set((k.a.x + k.b.x) / 2 + k.dir * 0.09, 0.2, (k.a.y + k.b.y) / 2);
    add(strip);
    return m;
  });

  // rubber posts on the inlane guides
  for (const p of POSTS) {
    const ring = new Mesh(new CylinderGeometry(POST_R, POST_R, 0.2, 20), rubber);
    ring.position.set(p.x, 0.22, p.y);
    const pin = new Mesh(new CylinderGeometry(0.05, 0.05, 0.5, 10), chrome);
    pin.position.set(p.x, 0.25, p.y);
    add(ring);
    add(pin);
  }

  // slingshots: white plastic with red rubber on the kicking edge
  const slingMats = SLINGS.map(() => rubber.clone());
  for (const [i, s] of SLINGS.entries()) {
    add(prism(s, 0.38, white));
    const len = Math.hypot(s[2].x - s[0].x, s[2].y - s[0].y);
    const band = new Mesh(new BoxGeometry(len, 0.2, 0.09), slingMats[i]);
    const mid = { x: (s[0].x + s[2].x) / 2, y: (s[0].y + s[2].y) / 2 };
    // just outside the edge, on the side that faces the middle
    const n = { x: (s[2].y - s[0].y) / len, y: -(s[2].x - s[0].x) / len };
    const side = n.x * (MID - mid.x) > 0 ? 1 : -1;
    band.position.set(mid.x + n.x * side * 0.05, 0.2, mid.y + n.y * side * 0.05);
    band.rotation.y = -Math.atan2(s[2].y - s[0].y, s[2].x - s[0].x);
    add(band);
  }

  // flaky-test bumpers: a chrome skirt, a red body, a cap that lights, FLAKY on top
  const capTop = texture(
    textCanvas(["FLAKY"], 128, 128, "#ffffff", "bold 30px Tahoma, Verdana, sans-serif", "#c0201a"),
  );
  const bumperCaps = BUMPERS.map((b) => {
    const skirt = new Mesh(new CylinderGeometry(BUMPER_R, BUMPER_R * 1.05, 0.12, 40), chrome);
    skirt.position.set(b.x, 0.06, b.y);
    const body = new Mesh(
      new CylinderGeometry(BUMPER_R * 0.72, BUMPER_R * 0.8, 0.34, 40),
      new MeshStandardMaterial({ color: "#a3150f", roughness: 0.35 }),
    );
    body.position.set(b.x, 0.29, b.y);
    const side = new MeshStandardMaterial({
      color: "#e02a20",
      emissive: "#ffcc33",
      emissiveIntensity: 0,
      roughness: 0.25,
    });
    const top = new MeshStandardMaterial({ map: capTop, emissive: "#ffcc33", emissiveIntensity: 0, roughness: 0.25 });
    const cap = new Mesh(new CylinderGeometry(BUMPER_R * 0.95, BUMPER_R * 0.95, 0.12, 40), [side, top, side]);
    cap.position.set(b.x, 0.52, b.y);
    add(skirt);
    add(body);
    add(cap);
    return [side, top];
  });

  // drop targets
  const targets = TARGETS.map((t) => {
    const m = new Mesh(
      new BoxGeometry(2 * t.hw, 0.36, 2 * t.hh),
      new MeshStandardMaterial({ color: COLORS[t.bank], roughness: 0.3, metalness: 0.1 }),
    );
    m.position.set(t.x, 0.18, t.y);
    return add(m);
  });

  // flippers: a red rubber bat under a white one, on a chrome bolt
  /** Bat outline: `s` scales its thickness, `inset` shrinks it for the white top over the red rubber. */
  const bat = (dir: number, len: number, s: number, inset: number): P[] => [
    ...arc(0, 0, 0.2 * s * inset, Math.PI / 2, (3 * Math.PI) / 2, 12).map((q) => ({ x: q.x * dir, y: q.y })),
    ...arc(0, 0, 0.09 * s * inset, -Math.PI / 2, Math.PI / 2, 8).map((q) => ({ x: dir * (len + q.x), y: q.y })),
  ];
  const flipperAt = (dir: number, len: number, s: number, base: number) => {
    const g = new Group();
    g.add(prism(bat(dir, len, s, 1), 0.2 * s, rubber, base));
    g.add(prism(bat(dir, len, s, 0.72), 0.27 * s, white, base));
    const bolt = new Mesh(new CylinderGeometry(0.08 * s, 0.08 * s, 0.06, 16), chrome);
    bolt.position.y = base + 0.29 * s;
    g.add(bolt);
    return add(g);
  };
  const flippers = [
    ...FLIPPERS.map(({ dir }) => flipperAt(dir, FLIP_LEN, 1, 0)),
    ...STAGE_FLIPPERS.map(({ dir }) => flipperAt(dir, STAGE_FLIP_LEN, 0.65, STAGE_H)),
  ];

  // the staging table: clear blue plastic on chrome posts, its own wall, pods, smoke tests and flippers
  {
    const outline = new Shape(STAGE_WALL.map((p) => ({ x: p.x, y: p.y }) as never));
    const g = new ShapeGeometry(outline);
    g.rotateX(Math.PI / 2);
    g.translate(0, STAGE_H, 0);
    const deck = new Mesh(
      g,
      new MeshStandardMaterial({
        color: "#4fb3ff",
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    deck.receiveShadow = true;
    scene.add(deck);
    for (const [j, a] of STAGE_WALL.slice(0, -1).entries()) {
      const b = STAGE_WALL[j + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const m = new Mesh(new BoxGeometry(len + 0.08, 0.3, 0.09), chrome);
      m.position.set((a.x + b.x) / 2, STAGE_H + 0.15, (a.y + b.y) / 2);
      m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      add(m);
    }
    for (const i of [0, 2, 10, 20, STAGE_WALL.length - 1]) {
      const q = STAGE_WALL[i];
      const post = new Mesh(new CylinderGeometry(0.05, 0.05, STAGE_H, 10), chrome);
      post.position.set(q.x, STAGE_H / 2, q.y);
      add(post);
    }
    const label = new Mesh(
      new PlaneGeometry(2.4, 0.5),
      new MeshStandardMaterial({
        map: texture(textCanvas(["STAGING"], 512, 108, "#ffffff", "bold 80px Tahoma, Verdana, sans-serif")),
        transparent: true,
        depthWrite: false,
      }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(2.6, STAGE_H + 0.01, 5.1);
    scene.add(label);
    // the lift: a clear tube from the hole up to the table
    const tube = new Mesh(
      new CylinderGeometry(0.32, 0.32, STAGE_H, 24, 1, true),
      new MeshStandardMaterial({
        color: "#bfe9ff",
        transparent: true,
        opacity: 0.16,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    tube.position.set(LIFT.x, STAGE_H / 2, LIFT.y);
    scene.add(tube);
  }
  const podMats = PODS.map((p) => {
    const skirt = new Mesh(new CylinderGeometry(POD_R, POD_R * 1.05, 0.1, 28), chrome);
    skirt.position.set(p.x, STAGE_H + 0.05, p.y);
    const m = new MeshStandardMaterial({
      color: "#3d8bfd",
      emissive: "#9fe0ff",
      emissiveIntensity: 0,
      roughness: 0.25,
    });
    const body = new Mesh(new CylinderGeometry(POD_R * 0.85, POD_R * 0.85, 0.3, 28), m);
    body.position.set(p.x, STAGE_H + 0.25, p.y);
    add(skirt);
    add(body);
    return m;
  });
  const smokeMats = SMOKE.map((t) => {
    const m = new MeshStandardMaterial({ color: "#f4f6fb", emissive: "#2ee86f", emissiveIntensity: 0, roughness: 0.3 });
    const box = new Mesh(new BoxGeometry(2 * t.hw, 0.3, 2 * t.hh), m);
    box.position.set(t.x, STAGE_H + 0.15, t.y);
    add(box);
    return m;
  });

  // the ramps: clear coloured plastic on posts, chrome rails along the side walls
  for (const rp of RAMPS) {
    const colour = rp.tag === "rampEnd" ? "#2ee86f" : "#7fd8ff";
    const [L, Rt] = rp.sides;
    const WALL = 0.3;
    const strip = (a: P[], b: P[], ha: number, hb: number) => {
      const pos: number[] = [];
      for (let i = 1; i < a.length; i++) {
        const q = [
          v3(a[i - 1], rp.heights[i - 1] + ha),
          v3(a[i], rp.heights[i] + ha),
          v3(b[i], rp.heights[i] + hb),
          v3(b[i - 1], rp.heights[i - 1] + hb),
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k].x, q[k].y, q[k].z);
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const plastic = new MeshStandardMaterial({
      color: colour,
      transparent: true,
      opacity: 0.42,
      roughness: 0.15,
      side: DoubleSide,
      depthWrite: false,
    });
    const clear = new MeshStandardMaterial({
      color: "#e8fff2",
      transparent: true,
      opacity: 0.18,
      roughness: 0.1,
      side: DoubleSide,
      depthWrite: false,
    });
    scene.add(new Mesh(strip(L, Rt, 0.02, 0.02), plastic));
    for (const side of [L, Rt]) {
      scene.add(new Mesh(strip(side, side, 0, WALL), clear));
      const curve = new CatmullRomCurve3(side.map((q, i) => v3(q, rp.heights[i] + WALL)));
      add(new Mesh(new TubeGeometry(curve, side.length * 6, 0.035, 8), chrome));
    }
    for (let i = 2; i < rp.path.length - 2; i += 4) {
      const h = rp.heights[i];
      const post = new Mesh(new CylinderGeometry(0.035, 0.035, h, 8), chrome);
      post.position.set(rp.path[i].x, h / 2, rp.path[i].y);
      add(post);
    }
    if (!rp.name) continue;
    // the name, lying on the ramp floor along its way down
    const at = rp.path.length - 3;
    const label = new Mesh(
      new PlaneGeometry(2.2, 0.38),
      new MeshStandardMaterial({
        map: texture(textCanvas([rp.name], 512, 88, "#ffffff", "bold 56px Tahoma, Verdana, sans-serif")),
        transparent: true,
        depthWrite: false,
      }),
    );
    label.rotation.set(-Math.PI / 2, 0, Math.PI / 2, "YXZ");
    label.position.set((rp.path[at].x + rp.path[at - 1].x) / 2, rp.heights[at] + 0.05, rp.path[at].y - 1.4);
    scene.add(label);
  }

  // lamp inserts: coloured plastic in the floor, glowing when lit
  const lamps = LAMPS.map((l) => {
    const shape = new Shape(l.shape.map((p) => ({ x: p.x, y: p.y }) as never));
    if (l.hole) shape.holes.push(new Shape(l.hole.map((p) => ({ x: p.x, y: p.y }) as never)));
    const g = new ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    const m = new MeshStandardMaterial({
      color: l.color,
      emissive: l.color,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(g, m);
    mesh.position.y = 0.012;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return m;
  });

  // spinner plate, plunger, apron
  const spinner = add(new Mesh(new BoxGeometry(0.85, 0.32, 0.03), chrome));
  spinner.position.set(SPINNER.x, 0.42, SPINNER.y);
  const plunger = new Group();
  const knob = new Mesh(new CylinderGeometry(0.17, 0.17, 0.3, 24), rubber);
  knob.rotation.x = Math.PI / 2;
  const rod = new Mesh(new CylinderGeometry(0.05, 0.05, 1.2, 12), chrome);
  rod.rotation.x = Math.PI / 2;
  rod.position.z = 0.7;
  plunger.add(knob, rod);
  plunger.position.set(PLUNGER.x, 0.2, 0);
  add(plunger);
  add(prism(APRON, 0.32, darkMetal));
  const apronText = new Mesh(
    new PlaneGeometry(4.2, 0.42),
    new MeshStandardMaterial({
      map: texture(textCanvas(["PIPELINE PINBALL"], 1024, 104, "#b9cff0", "bold 64px Tahoma, Verdana, sans-serif")),
      transparent: true,
    }),
  );
  apronText.rotation.x = -Math.PI / 2;
  apronText.position.set(MID, 0.33, 17.75);
  scene.add(apronText);

  // the rank on its plaque
  const rankCanvas = document.createElement("canvas");
  rankCanvas.width = 512;
  rankCanvas.height = 96;
  const rankTex = texture(rankCanvas);
  const rankPlate = new Mesh(
    new PlaneGeometry(2.6, 0.5),
    new MeshStandardMaterial({ map: rankTex, transparent: true }),
  );
  rankPlate.rotation.x = -Math.PI / 2;
  rankPlate.position.set(MID, 0.015, 10.88);
  scene.add(rankPlate);
  let rankShown = "";

  // the balls: polished steel reflecting the room
  const steel = new MeshStandardMaterial({ color: "#ffffff", metalness: 1, roughness: 0.06 });
  const balls = [0, 1, 2].map(() => add(new Mesh(new SphereGeometry(R, 32, 24), steel)));

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // from behind the flippers, looking up the table; move back until the whole cabinet fits
    const target = new Vector3(W / 2, 0, H / 2 + 1);
    const dir = new Vector3(0, Math.sin(0.8), Math.cos(0.8));
    const corners = [0, W].flatMap((x) => [0.2, H].flatMap((z) => [0, 0.6].map((y) => new Vector3(x, y, z))));
    let lo = 5;
    let hi = 80;
    for (let k = 0; k < 24; k++) {
      const d = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) <= 1.02 && Math.abs(p.y) <= 0.985;
      });
      if (fits) hi = d;
      else lo = d;
    }
    camera.position.copy(target).addScaledVector(dir, hi);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function draw(f: Frame) {
    for (const [i, fl] of f.flippers.entries()) {
      flippers[i].rotation.y = -fl.angle;
      flippers[i].position.set(fl.x, 0, fl.y);
    }
    for (const [i, m] of podMats.entries()) m.emissiveIntensity = f.pods[i] ? 1.6 : 0;
    for (const [i, m] of smokeMats.entries()) {
      m.emissiveIntensity = f.smoke[i] ? 1.8 : 0;
      m.color.set(f.smoke[i] ? "#2ee86f" : "#f4f6fb");
    }
    for (const [i, m] of balls.entries()) {
      const b = f.balls[i];
      m.visible = !!b;
      if (b) m.position.set(b.x, b.h + R, b.y);
    }
    for (const [i, [side, top]] of bumperCaps.entries())
      side.emissiveIntensity = top.emissiveIntensity = f.bumpers[i] ? 1.6 : 0;
    for (const [i, m] of slingMats.entries()) m.color.set(f.slings[i] ? "#ffe066" : "#d63a2a");
    for (const [i, m] of kickMats.entries()) m.color.set(f.kickers[i] ? "#ffe066" : "#d63a2a");
    for (const [i, m] of targets.entries()) m.visible = f.targets[i];
    for (const [i, m] of lamps.entries()) {
      m.emissiveIntensity = f.lamps[i] ? 2.4 : 0.05;
      m.opacity = f.lamps[i] ? 0.95 : 0.38;
    }
    spinner.rotation.x = f.spin;
    plunger.position.z = H - 0.62 + f.plunger * 0.55;
    white.color.set(f.tilted ? "#8a93a6" : "#f4f6fb");
    if (f.rank !== rankShown) {
      rankShown = f.rank;
      const g = rankCanvas.getContext("2d")!;
      g.clearRect(0, 0, 512, 96);
      g.fillStyle = "#ffffff";
      g.font = "bold 54px Tahoma, Verdana, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(f.rank.toUpperCase(), 256, 52);
      rankTex.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  resize();
  return { draw, resize };
}
