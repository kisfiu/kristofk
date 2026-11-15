// Pipe tiles are bitmasks of their openings.
export const N = 1,
  E = 2,
  S = 4,
  W = 8;
const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
] as const;

export interface Level {
  size: number;
  start: number;
  end: number;
  tiles: number[];
}

/** Rotate a tile 90° clockwise. */
export const rotate = (m: number) => ((m << 1) | (m >> 3)) & 15;

/** Small seeded PRNG so tests are repeatable. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spin = (m: number, n: number) => {
  for (let i = 0; i < n; i++) m = rotate(m);
  return m;
};

/** Build a solvable level: a random path from the left edge (row `start`) to the right edge (row `end`), then scramble every tile. */
export function generate(size: number, rnd: () => number = Math.random): { level: Level; solution: number[] } {
  const pick = () => Math.floor(rnd() * size);
  const start = pick();
  const end = pick();
  const at = (x: number, y: number) => y * size + x;

  // Randomised DFS; cells are never unvisited, so it is linear and always finds the goal.
  const seen = new Set<number>([at(0, start)]);
  const path: number[] = [at(0, start)];
  const walk = (x: number, y: number): boolean => {
    if (x === size - 1 && y === end) return true;
    const order = [...DIRS].sort(() => rnd() - 0.5);
    for (const d of order) {
      const nx = x + d.dx,
        ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen.has(at(nx, ny))) continue;
      seen.add(at(nx, ny));
      path.push(at(nx, ny));
      if (walk(nx, ny)) return true;
      path.pop();
    }
    return false;
  };
  walk(0, start);

  const shapes = [N | S, N | E, N | E | S];
  const solution = Array.from({ length: size * size }, () =>
    spin(shapes[Math.floor(rnd() * 3)], Math.floor(rnd() * 4)),
  );
  for (const i of path) solution[i] = 0;
  solution[path[0]] |= W;
  solution[path[path.length - 1]] |= E;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k],
      b = path[k + 1];
    const dx = (b % size) - (a % size),
      dy = Math.floor(b / size) - Math.floor(a / size);
    const d = DIRS.find((d) => d.dx === dx && d.dy === dy)!;
    solution[a] |= d.bit;
    solution[b] |= d.opp;
  }

  const level: Level = { size, start, end, tiles: solution.map((m) => spin(m, Math.floor(rnd() * 4))) };
  while (solved(level)) level.tiles[path[0]] = rotate(level.tiles[path[0]]);
  return { level, solution };
}

/** Indices of tiles connected to the source (left edge, row `start`). */
export function flow({ size, start, tiles }: Level): Set<number> {
  const first = start * size;
  const wet = new Set<number>();
  if (!(tiles[first] & W)) return wet;
  const queue = [first];
  wet.add(first);
  while (queue.length) {
    const i = queue.shift()!;
    const x = i % size,
      y = Math.floor(i / size);
    for (const d of DIRS) {
      const nx = x + d.dx,
        ny = y + d.dy;
      if (!(tiles[i] & d.bit) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (tiles[j] & d.opp && !wet.has(j)) {
        wet.add(j);
        queue.push(j);
      }
    }
  }
  return wet;
}

export function solved(level: Level): boolean {
  const last = level.end * level.size + level.size - 1;
  return Boolean(level.tiles[last] & E) && flow(level).has(last);
}
