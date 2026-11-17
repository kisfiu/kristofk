import {
  COLS,
  coarse,
  finished,
  finishJob,
  type Game,
  HINT_COST,
  hint,
  JOBS,
  L,
  MARK,
  newGame,
  penalize,
  ROWS,
  STEPS,
  stars,
  start,
  stepOf,
  type Tool,
  wet,
} from "./renovation-logic";
import { CELL, type Ctl, makeGame } from "./renovation-play";
import { beep, soundOn, toggleSound } from "./renovation-sound";

const ft = (n: number) => `${n.toLocaleString("hu-HU")} Ft`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** Stable 0..1 noise per cell so the wall texture doesn't flicker between redraws. */
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const shade = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};
const mix = (hex: string, w: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v + (255 - v) * w);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

const FLAT: Partial<Record<number, string>> = {
  [L.OLD]: "#8fb3a0",
  [L.BARE]: "#cbbfa9",
  [L.HARD]: "#a3a19b",
  [L.PUTTY1]: "#ddd8cc",
  [L.PUTTY2]: "#ebe8df",
  [L.SANDED]: "#f4f2ec",
  [L.PRIMER]: "#fbfbf8",
};

function drawWall(
  ctx: CanvasRenderingContext2D,
  cells: Uint8Array,
  g: Game,
  color: string,
  isWet: boolean,
  marks = true,
) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL;
    const y = row * CELL;
    const n = noise(i);
    if (c === L.DUSTY || c === L.BRICK || c === L.DEEP) {
      const brick = row * 100 + Math.floor((col + (row % 2)) / 2);
      ctx.fillStyle = shade(c === L.DEEP ? "#7d3524" : "#a8492f", 0.9 + noise(brick) * 0.2);
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = "#cfc6b6";
      ctx.fillRect(x, y, CELL, 2);
      if ((col + (row % 2)) % 2 === 0) ctx.fillRect(x, y, 2, CELL);
      if (c === L.DUSTY) {
        ctx.fillStyle = "rgba(220,214,200,.8)";
        for (let d = 0; d < 4; d++) ctx.fillRect(x + noise(i + d * 7) * 14, y + noise(i + d * 13) * 14, 2, 2);
      }
    } else {
      const base = c >= L.PAINT1 ? null : FLAT[c]!;
      ctx.fillStyle = base
        ? shade(base, (c >= L.SANDED ? 0.98 : 0.94) + n * (c >= L.SANDED ? 0.03 : 0.1))
        : c === L.PAINT1
          ? mix(color, 0.35 - n * 0.1)
          : color;
      ctx.fillRect(x, y, CELL, CELL);
      if (c === L.OLD && n < 0.3) {
        // flaking paint shows the plaster underneath
        ctx.fillStyle = "#d8cfbd";
        ctx.fillRect(x + n * 30, y + noise(i + 3) * 10, 4 + noise(i + 5) * 6, 3 + noise(i + 9) * 4);
      }
    }
    const p = g.patch[i];
    if (marks && p >= 0 && g.known[coarse(i)] === MARK && c < L.DUSTY) {
      ctx.fillStyle = "rgba(220,30,20,.18)";
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = "#d21e14";
      if (g.patch[i - COLS] !== p) ctx.fillRect(x, y, CELL, 2);
      if (g.patch[i + COLS] !== p) ctx.fillRect(x, y + CELL - 2, CELL, 2);
      if (col === 0 || g.patch[i - 1] !== p) ctx.fillRect(x, y, 2, CELL);
      if (col === COLS - 1 || g.patch[i + 1] !== p) ctx.fillRect(x + CELL - 2, y, 2, CELL);
    }
  }
  if (isWet) {
    ctx.fillStyle = "rgba(40,60,110,.16)";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
  }
}

export function initRenovation(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const scenes = el.querySelectorAll<HTMLElement>("[data-scene]");
  const canvas = $<HTMLCanvasElement>(".reno-wall");
  const ctx = canvas.getContext("2d")!;
  const stage = $(".reno-stage");
  const banner = $("[data-banner]");
  const bar = $("[data-bar]");
  const msg = $("[data-note]");
  const bar$ = (s: string) => bar.querySelector<HTMLElement>(s)!;
  const prog = $<HTMLProgressElement>("[data-progress]");
  const steps = $("[data-steps]");
  const dialog = $<HTMLDialogElement>("[data-dialog]");
  const modeBtn = $<HTMLButtonElement>("[data-mode]");
  const trayBtn = $<HTMLButtonElement>("[data-tray]");
  const soundBtn = $<HTMLButtonElement>("[data-sound]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let g: Game;
  let before: Uint8Array;
  let tool: Tool | null = null;
  let color = "#efe3c8";
  let seconds = 0;
  let timer = 0;
  let dryTimer = 0;
  // the running mini-game, its own clock (ms, paused while the window is hidden) and the 3-2-1 before it
  let ctl: Ctl | null = null;
  let t = 0;
  let countdown = 0;
  let frameAt = 0;
  let fines = 0;
  let marking = false;
  let refill = false;
  let last: { x: number; y: number; at: number } | null = null;

  const show = (name: string) => {
    for (const s of scenes) s.hidden = s.dataset.scene !== name;
    bar.hidden = msg.hidden = name !== "room";
  };
  const say = (text: string) => {
    msg.textContent = text;
  };
  const stopTimer = () => {
    clearInterval(timer);
    timer = 0;
  };
  const startTimer = () => {
    if (timer || finished(g)) return;
    timer = window.setInterval(() => {
      bar$("[data-clock]").textContent = `Time: ${clock(++seconds)}`;
    }, 1000);
  };
  const shake = () => {
    if (reduced.matches) return;
    stage.classList.remove("reno-shake");
    void stage.offsetWidth; // restart the animation
    stage.classList.add("reno-shake");
  };
  const showSound = () => {
    const on = soundOn();
    soundBtn.textContent = on ? "🔊 Sound on" : "🔇 Sound off — click to turn on";
    soundBtn.setAttribute("aria-pressed", String(on));
  };

  function render() {
    const now = Date.now();
    drawWall(ctx, g.cells, g, color, wet(g, now));
    if (ctl && countdown <= 0) ctl.draw(ctx, t);
    bar$("[data-budget]").textContent = `Budget: ${ft(g.budget)}`;
    bar$("[data-budget]").classList.toggle("reno-neg", g.budget < 0);
    bar$("[data-clock]").textContent = `Time: ${clock(seconds)}`;
    const s = stepOf(g);
    steps.innerHTML = STEPS.map(
      (t, i) => `<li class="${i < s ? "done" : i === s ? "now" : ""}">${i < s ? "✔" : `${i + 1}.`} ${t}</li>`,
    ).join("");
    const drying = !ctl && wet(g, now);
    prog.value = ctl
      ? ctl.seconds
        ? 100 * Math.max(0, 1 - t / (ctl.seconds * 1000))
        : ctl.progress() * 100
      : drying
        ? 100 - ((g.wetUntil - now) / ((JOBS[g.job - 1].dries ?? 1) * 1000)) * 100
        : 0;
    prog.setAttribute(
      "aria-label",
      ctl ? (ctl.seconds ? "Time left" : "Job progress") : drying ? "Drying" : "Progress",
    );
    for (const b of el.querySelectorAll<HTMLButtonElement>("[data-color]"))
      b.disabled = g.job > JOBS.findIndex((j) => j.tool === "paint");
    bar$("[data-hint]").toggleAttribute("disabled", finished(g) || !!ctl);
    modeBtn.hidden = ctl === null || JOBS[g.job]?.game !== "sweeper";
    trayBtn.hidden = ctl === null || JOBS[g.job]?.game !== "roller";
  }

  function alertBox(title: string, text: string, end = false) {
    $("[data-dtitle]").textContent = title;
    $("[data-dtext]").textContent = text;
    $("[data-ba]").hidden = !end;
    $("[data-again]").hidden = !end;
    if (end) {
      for (const [sel, cells] of [
        ["[data-before]", before],
        ["[data-after]", g.cells],
      ] as const) {
        const c = $<HTMLCanvasElement>(sel).getContext("2d")!;
        c.setTransform(0.5, 0, 0, 0.5, 0, 0);
        drawWall(c, cells, g, color, false, false);
      }
    }
    dialog.showModal();
  }

  function dry() {
    clearInterval(dryTimer);
    dryTimer = window.setInterval(() => {
      render();
      if (wet(g, Date.now())) return;
      clearInterval(dryTimer);
      say("Dry. What's next?");
    }, 200);
  }

  function begin() {
    const j = JOBS[g.job];
    fines = 0;
    t = 0;
    ctl = makeGame(j.game, env, () => {
      const r = refill;
      refill = false;
      return r;
    });
    countdown = ctl.seconds ? 1500 : 800;
    banner.hidden = false;
    banner.textContent = j.shout;
    say(ctl.help);
    frameAt = performance.now();
    requestAnimationFrame(frame);
  }

  function frame(now: number) {
    if (!ctl) return;
    const dt = Math.min(100, now - frameAt);
    frameAt = now;
    if (!el.closest("[hidden]")) {
      if (countdown > 0) {
        countdown -= dt;
        banner.textContent =
          countdown > 0 && ctl.seconds ? `${JOBS[g.job].shout} ${Math.ceil(countdown / 500)}` : JOBS[g.job].shout;
        if (countdown <= 0) banner.hidden = true;
      } else {
        t += dt;
        ctl.tick?.(t, dt);
        if (ctl.done(t) || (ctl.seconds && t >= ctl.seconds * 1000)) return endGame();
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  function endGame() {
    const c = ctl!;
    ctl = null;
    last = null;
    const line = c.end();
    const j = JOBS[g.job];
    finishJob(g, Date.now());
    if (finished(g)) {
      stopTimer();
      render();
      beep("fanfare");
      const n = stars(g, seconds);
      alertBox(
        "Renovator XP Setup",
        `Setup has finished renovating the room. ${"★".repeat(n)}${"☆".repeat(3 - n)}\nBudget left: ${ft(g.budget)} · Time: ${clock(seconds)} · Mistakes: ${g.mistakes}`,
        true,
      );
      return;
    }
    beep("ding");
    const extra = fines ? ` Fines this job: −${ft(fines)}.` : " No fines!";
    say(`${j.done} ${line}${extra}${j.dries ? " Let it dry…" : ""}`.replace(/\s+/g, " ").trim());
    if (j.dries) dry();
    render();
  }

  const env = {
    get g() {
      return g;
    },
    rnd: Math.random,
    fine(cost: number, text: string) {
      penalize(g, cost);
      fines += cost;
      if (text) {
        beep("error");
        say(`${text} −${ft(cost)}`);
      }
    },
    say,
    shake,
    markMode: () => marking,
  };

  function reset() {
    stopTimer();
    clearInterval(dryTimer);
    ctl = null;
    banner.hidden = true;
    g = newGame();
    before = g.cells.slice();
    seconds = 0;
    tool = null;
    marking = false;
    modeBtn.textContent = "Mode: Knock 🔨";
    for (const b of el.querySelectorAll("[data-tool]")) b.setAttribute("aria-pressed", "false");
    say("Pick a tool on the left, then click the wall. Order matters!");
    render();
  }

  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * COLS, ((e.clientY - r.top) / r.height) * ROWS];
  };

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    // no mouse-down default: it would pull focus off a dialog opened by this press, so Enter couldn't close it
    e.preventDefault();
    if (dialog.open) return;
    const [x, y] = at(e);
    if (ctl) {
      if (countdown > 0) return;
      canvas.setPointerCapture(e.pointerId);
      last = { x, y, at: e.timeStamp };
      ctl.down(x, y, e, t);
      return render();
    }
    if (!tool) return say("Pick a tool first.");
    startTimer();
    const r = start(g, tool, Date.now());
    if (!r.ok) {
      beep("error");
      render();
      alertBox("Renovator XP", r.cost ? `${r.text}\n−${ft(r.cost)}` : r.text);
      return;
    }
    begin();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ctl || !last || countdown > 0) return;
    const [x, y] = at(e);
    // real pointer time, not the frame-stepped game clock, so drag speed is measured right
    ctl.move?.(x, y, Math.hypot(x - last.x, y - last.y), e.timeStamp - last.at, t);
    last = { x, y, at: e.timeStamp };
  });
  for (const ev of ["pointerup", "pointercancel"])
    canvas.addEventListener(ev, () => {
      if (!last) return;
      last = null;
      ctl?.up?.();
    });

  el.addEventListener("click", (e) => {
    const tg = e.target as Element;
    const go = tg.closest<HTMLElement>("[data-go]");
    if (go) {
      show(go.dataset.go!);
      if (go.dataset.go === "room") {
        startTimer();
        render();
      }
    }
    const sayBtn = tg.closest<HTMLElement>("[data-say]");
    if (sayBtn) $("[data-say-out]").textContent = sayBtn.dataset.say!;
    const tb = tg.closest<HTMLElement>("[data-tool]");
    if (tb && !ctl) {
      tool = tb.dataset.tool as Tool;
      for (const b of el.querySelectorAll("[data-tool]")) b.setAttribute("aria-pressed", String(b === tb));
      say(`${tb.querySelector("span")?.textContent} in hand. Click the wall to start.`);
    }
    const sw = tg.closest<HTMLButtonElement>("[data-color]");
    if (sw) {
      color = sw.dataset.color!;
      for (const b of el.querySelectorAll("[data-color]")) b.setAttribute("aria-pressed", String(b === sw));
      render();
    }
    if (tg.closest("[data-hint]") && !finished(g) && !ctl) {
      say(
        `Jóska bácsi from next door leans in: "Next you need the ${hint(g).toLowerCase()}, son." (−${ft(HINT_COST)})`,
      );
      render();
    }
    if (tg.closest("[data-mode]")) {
      marking = !marking;
      modeBtn.textContent = marking ? "Mode: Mark 🚩" : "Mode: Knock 🔨";
    }
    if (tg.closest("[data-tray]")) {
      refill = true;
      beep("pop");
      say("Roller full. Roll!");
    }
    if (tg.closest("[data-sound]")) {
      toggleSound();
      showSound();
    }
    if (tg.closest("[data-restart]")) reset();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "again") {
      reset();
      startTimer();
    }
  });
  // Esc closes this dialog only, not the whole window behind it
  dialog.addEventListener("keydown", (e) => e.key === "Escape" && e.stopPropagation());
  // Enter closes a fine message like OK, wherever focus is; a focused dialog button still gets its own Enter
  document.addEventListener("keydown", (e) => {
    if (!dialog.open || e.key !== "Enter" || (e.target as Element).closest?.(".reno-dialog button")) return;
    e.preventDefault();
    dialog.close("ok");
  });

  // Pause the clock while the window is closed or minimised (the mini-game clock checks this every frame).
  new MutationObserver(() => {
    if (el.closest("[hidden]")) stopTimer();
    else if (!$<HTMLElement>('[data-scene="room"]').hidden) startTimer();
  }).observe(el.closest(".window") ?? el, { attributes: true, attributeFilter: ["hidden"] });

  showSound();
  reset();
  show("gang");
}
