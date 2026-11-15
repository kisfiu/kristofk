import { E, flow, generate, type Level, N, rotate, S, solved, W } from "./pipeline-logic";

const LEVELS = [
  { size: 4, seconds: 60 },
  { size: 5, seconds: 75 },
  { size: 6, seconds: 90 },
];

const tile = (m: number) => {
  const arm = (bit: number, d: string) => (m & bit ? `<path d="${d}"/>` : "");
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${arm(N, "M20 20V0")}${arm(E, "M20 20H40")}${arm(S, "M20 20V40")}${arm(W, "M20 20H0")}<circle cx="20" cy="20" r="6"/></svg>`;
};

export function initPipeline(el: HTMLElement) {
  const grid = el.querySelector<HTMLElement>("[data-grid]")!;
  const msg = el.querySelector<HTMLElement>("[data-msg]")!;
  const time = el.querySelector<HTMLElement>("[data-time]")!;
  const levelLabel = el.querySelector<HTMLElement>("[data-level]")!;
  let index = 0;
  let level: Level;
  let left = 0;
  let timer = 0;
  let nextLevel = 0;
  let over = false;

  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };

  function draw() {
    const wet = flow(level);
    const { size, start, end, tiles } = level;
    grid.style.setProperty("--n", String(size));
    let html = "";
    for (let y = 0; y < size; y++) {
      html += `<span class="pipe-end">${y === start ? "commit ▶" : ""}</span>`;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        html += `<button type="button" class="pipe${wet.has(i) ? " wet" : ""}" data-i="${i}" aria-label="Pipe ${x + 1},${y + 1}" ${over ? "disabled" : ""}>${tile(tiles[i])}</button>`;
      }
      html += `<span class="pipe-end">${y === end ? "▶ deploy" : ""}</span>`;
    }
    grid.innerHTML = html;
  }

  function load(i: number) {
    stop();
    clearTimeout(nextLevel); // a New game during the 2 s pause must not be overtaken by the old level change
    index = i;
    over = false;
    level = generate(LEVELS[i].size).level;
    left = LEVELS[i].seconds;
    levelLabel.textContent = `Level ${i + 1}/${LEVELS.length}`;
    time.textContent = `Time: ${left}s`;
    msg.textContent = "Waiting for first commit… (the timer starts on your first click)";
    draw();
  }

  function startTimer() {
    timer = window.setInterval(() => {
      time.textContent = `Time: ${--left}s`;
      if (left > 0) return;
      stop();
      over = true;
      msg.textContent = "✗ Build failed: timeout. Press New game to retry.";
      draw();
    }, 1000);
  }

  grid.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-i]");
    if (!b || over) return;
    if (!timer) startTimer();
    const i = Number(b.dataset.i);
    level.tiles[i] = rotate(level.tiles[i]);
    draw();
    grid.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
    if (!solved(level)) return;
    stop();
    over = true;
    draw();
    if (index + 1 < LEVELS.length) {
      msg.textContent = "✔ Pipeline passed! Next stage in 2 seconds…";
      nextLevel = window.setTimeout(() => load(index + 1), 2000);
    } else msg.textContent = "✔ All pipelines green. Deployed to production. You're hired?";
  });

  el.querySelector("[data-new]")!.addEventListener("click", () => load(0));
  // Pause when the window is closed or minimised.
  new MutationObserver(() => {
    if (el.closest("[hidden]") && timer) {
      stop();
      msg.textContent = "Paused. Click a pipe to continue.";
    }
  }).observe(el.closest(".window") ?? el, { attributes: true, attributeFilter: ["hidden"] });
  load(0);
}
