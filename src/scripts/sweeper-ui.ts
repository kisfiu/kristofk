import { initMenuBar } from "./menubar";
import { load, save } from "./scores";
import { beep, soundOn, toggleSound } from "./sound";
import {
  type Board,
  chord,
  clampCustom,
  count,
  cycleMark,
  FLAG,
  isLevel,
  isRecord,
  LEVELS,
  type Level,
  minesLeft,
  neighbours,
  newBoard,
  OPEN,
  open,
  QUESTION,
} from "./sweeper-logic";

const OPTS = "kk-sweeper";
const BEST = "kk-sweeper-best";
const STD = ["beginner", "intermediate", "expert"] as const;
type Std = (typeof STD)[number];
const NO_RECORD = { t: 999, name: "Anonymous" };

/** Three red seven-segment digits, like XP's LED counters (a leading "-" when negative). */
const SEG: Record<string, string> = {
  a: "M1.6 .6h7.8l-1.8 1.8H3.4z",
  b: "M10 1.6v7.6l-1.8 1V3.4z",
  c: "M10 11.4v7.6l-1.8-1.8v-4.8z",
  d: "M1.6 20.4h7.8l-1.8-1.8H3.4z",
  e: "M1 11.4v7.6l1.8-1.8v-4.8z",
  f: "M1 1.6v7.6l1.8 1V3.4z",
  g: "M1.8 10.5l1.4-1h4.6l1.4 1-1.4 1H3.2z",
};
const DIGIT: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
};
function led(n: number) {
  const s = n < 0 ? `-${String(Math.min(99, -n)).padStart(2, "0")}` : String(Math.min(999, n)).padStart(3, "0");
  return `<svg viewBox="0 0 37 21" aria-hidden="true">${[...s]
    .map(
      (ch, i) =>
        `<g transform="translate(${i * 13} 0)">${Object.entries(SEG)
          .map(([k, d]) => `<path d="${d}" class="${DIGIT[ch].includes(k) ? "on" : ""}"/>`)
          .join("")}</g>`,
    )
    .join("")}</svg>`;
}

export function initSweeper(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const boardEl = $("[data-board]");
  const face = $("[data-face]");
  const win = el.closest<HTMLElement>(".window");
  const opts = load(OPTS, { level: "beginner" as Level, custom: { h: 9, w: 9, mines: 10 }, marks: true, color: true });
  const best = load(BEST, { beginner: NO_RECORD, intermediate: NO_RECORD, expert: NO_RECORD } as Record<
    Std,
    typeof NO_RECORD
  >);
  // stored values are only trusted in shape: a damaged one must not stop the game from opening
  if (!isLevel(opts.level)) opts.level = "beginner";
  opts.custom = clampCustom(Number(opts.custom?.h), Number(opts.custom?.w), Number(opts.custom?.mines));
  for (const l of STD) if (!isRecord(best[l])) best[l] = { ...NO_RECORD };
  let b: Board;
  let seconds = 0;
  let timer = 0;
  let focusCell = 0;

  const menu = initMenuBar($("[data-menubar]"), command);
  menu.set(opts.level, true);
  menu.set("marks", opts.marks);
  menu.set("color", opts.color);
  menu.set("sound", soundOn());

  const size = () => (opts.level === "custom" ? opts.custom : LEVELS[opts.level]);
  const stopTimer = () => {
    clearInterval(timer);
    timer = 0;
  };
  const startTimer = () => {
    if (timer || b.status !== "play") return;
    timer = window.setInterval(() => {
      if (seconds >= 999) return stopTimer();
      seconds++;
      beep("knock");
      top();
    }, 1000);
  };
  const top = () => {
    $("[data-left]").innerHTML = led(minesLeft(b));
    $("[data-left]").setAttribute("aria-label", `${minesLeft(b)} hollow spots left`);
    $("[data-time]").innerHTML = led(seconds);
    $("[data-time]").setAttribute("aria-label", `${seconds} seconds`);
  };

  function newGame() {
    stopTimer();
    seconds = 0;
    const { w, h, mines } = size();
    b = newBoard(w, h, mines);
    focusCell = 0;
    face.dataset.face = "smile";
    boardEl.style.setProperty("--cols", String(w));
    // XP sizes its window to the field
    win?.style.setProperty("--w", `${Math.max(330, w * 24 + 60)}px`);
    boardEl.innerHTML = Array.from(
      { length: h },
      (_, y) =>
        `<div role="row">${Array.from({ length: w }, (_, x) => `<div role="gridcell" tabindex="-1" data-i="${y * w + x}"></div>`).join("")}</div>`,
    ).join("");
    draw();
  }

  const cells = () => boardEl.querySelectorAll<HTMLElement>("[data-i]");
  function draw(pressed: number[] = []) {
    const over = b.status === "won" || b.status === "lost";
    for (const c of cells()) {
      const i = Number(c.dataset.i);
      const s = b.state[i];
      let cls = "h";
      let text = "";
      let label = "hidden";
      if (s === OPEN) {
        const n = count(b, i);
        cls = `o n${n}`;
        text = n ? String(n) : "";
        label = n ? String(n) : "empty";
      } else if (b.status === "lost" && b.mine[i]) {
        cls = i === b.boom ? "o mine boom" : s === FLAG ? "h flag" : "o mine";
        label = s === FLAG ? "marked hollow spot" : "hollow spot";
      } else if (b.status === "lost" && s === FLAG) {
        cls = "o mine bad";
        label = "wrong mark";
      } else if (s === FLAG) {
        cls = "h flag";
        label = "marked";
      } else if (s === QUESTION) {
        cls = pressed.includes(i) ? "o q" : "h q";
        text = "?";
        label = "question mark";
      } else if (pressed.includes(i) && !over) cls = "o";
      c.className = cls;
      c.textContent = text;
      c.setAttribute("aria-label", label);
      c.tabIndex = i === focusCell ? 0 : -1;
    }
    top();
  }

  function finish() {
    if (b.status === "lost") {
      stopTimer();
      face.dataset.face = "dead";
      beep("thud");
      say("You knocked through a hollow spot. Game over.");
    } else if (b.status === "won") {
      stopTimer();
      face.dataset.face = "cool";
      beep("fanfare");
      say(`Wall checked in ${seconds} seconds.`);
      const lvl = opts.level;
      if (lvl !== "custom" && seconds < best[lvl].t) {
        $("[data-name-text]").textContent =
          `You have the fastest time for the ${lvl} level. Please type your name for the plaster hall of fame.`;
        $<HTMLInputElement>("[data-name] input").value = best[lvl].name === "Anonymous" ? "" : best[lvl].name;
        const d = $<HTMLDialogElement>("[data-name]");
        d.addEventListener(
          "close",
          () => {
            best[lvl] = { t: seconds, name: $<HTMLInputElement>("[data-name] input").value.trim() || "Anonymous" };
            save(BEST, best);
            showBest();
          },
          { once: true },
        );
        d.returnValue = ""; // Esc would otherwise keep the last button pressed
        d.showModal();
      }
    }
  }
  const say = (t: string) => {
    $("[data-status]").textContent = t;
  };

  function showBest() {
    $("[data-best-rows]").innerHTML = STD.map(
      (l) =>
        `<tr><th>${l[0].toUpperCase()}${l.slice(1)}:</th><td>${best[l].t} seconds</td><td>${best[l].name.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</td></tr>`,
    ).join("");
    $<HTMLDialogElement>("[data-best]").showModal();
  }
  $("[data-reset]").addEventListener("click", () => {
    for (const l of STD) best[l] = { ...NO_RECORD };
    save(BEST, best);
    showBest();
  });

  function command(cmd: string) {
    if (cmd === "new") newGame();
    else if (cmd === "beginner" || cmd === "intermediate" || cmd === "expert") {
      opts.level = cmd;
      save(OPTS, opts);
      newGame();
    } else if (cmd === "custom") {
      const d = $<HTMLDialogElement>("[data-custom]");
      const f = d.querySelector("form")!;
      for (const k of ["h", "w", "mines"] as const)
        (f.elements.namedItem(k) as HTMLInputElement).value = String(opts.custom[k]);
      d.addEventListener(
        "close",
        () => {
          if (d.returnValue === "ok") {
            const v = (k: string) => Number((f.elements.namedItem(k) as HTMLInputElement).value);
            opts.custom = clampCustom(v("h"), v("w"), v("mines"));
            opts.level = "custom";
          }
          menu.set(opts.level, true);
          save(OPTS, opts);
          if (d.returnValue === "ok") newGame();
        },
        { once: true },
      );
      d.returnValue = ""; // Esc would otherwise keep the last button pressed
      d.showModal();
    } else if (cmd === "marks" || cmd === "color") {
      opts[cmd] = menu.isOn(cmd);
      save(OPTS, opts);
      el.classList.toggle("sw-mono", !opts.color);
    } else if (cmd === "sound") {
      if (menu.isOn("sound") !== soundOn()) toggleSound();
    } else if (cmd === "best") showBest();
    else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  /* ---------- Mouse: XP's buttons, including both-button chords (they arrive as pointermove) ---------- */
  const cellAt = (e: PointerEvent) => {
    const r = boardEl.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * b.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * b.h);
    return x >= 0 && x < b.w && y >= 0 && y < b.h ? y * b.w + x : -1;
  };
  const block = (i: number) => (i < 0 ? [] : [i, ...neighbours(b, i)]);
  let prev = 0; // buttons held on the last event
  let chording = false;
  let spent = false; // a chord already went off: ignore the rest until every button is up
  let hold = 0; // phones: long-press marks
  let held = false;

  const playing = () => b.status === "ready" || b.status === "play";
  function pressedView(e: PointerEvent, buttons: number) {
    const i = cellAt(e);
    if (!buttons || spent) return draw();
    draw(chording ? block(i) : buttons & 1 ? [i] : []);
  }

  function release(i: number, wasChord: boolean) {
    if (i < 0) return;
    if (wasChord) chord(b, i);
    else open(b, i);
    // XP's clock shows 1 the moment the first tile opens
    if (!seconds && b.status !== "ready") {
      seconds = 1;
      beep("knock");
    }
    startTimer();
    finish();
  }

  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  boardEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!playing()) return;
    boardEl.setPointerCapture(e.pointerId);
    const i = cellAt(e);
    focusCell = Math.max(0, i);
    if (e.pointerType === "touch") {
      held = false;
      hold = window.setTimeout(() => {
        held = true;
        cycleMark(b, i, opts.marks);
        draw();
      }, 450);
      return;
    }
    handle(e, e.buttons);
  });
  boardEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    if (e.buttons !== prev) handle(e, e.buttons);
    else if (prev && playing()) pressedView(e, prev);
  });
  boardEl.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      clearTimeout(hold);
      if (held || !playing()) return;
      const i = cellAt(e);
      if (i >= 0) release(i, b.state[i] === OPEN);
      return draw();
    }
    handle(e, 0);
  });
  boardEl.addEventListener("pointercancel", () => {
    clearTimeout(hold);
    prev = 0;
    chording = spent = false;
    face.dataset.face = playing() ? "smile" : face.dataset.face;
    draw();
  });

  /** One step of the button state machine: what changed between `prev` and `now`. */
  function handle(e: PointerEvent, now: number) {
    if (!playing()) {
      prev = now;
      return;
    }
    const i = cellAt(e);
    const added = now & ~prev;
    const removed = prev & ~now;
    // a right press on its own marks at once (XP marks on press; a later left press then starts a chord)
    if (added & 2 && !(now & 1) && !chording) {
      if (i >= 0) cycleMark(b, i, opts.marks);
    }
    if ((now & 1 && now & 2) || now & 4 || (now & 1 && e.shiftKey)) chording = true;
    if (removed && !spent) {
      if (chording && (removed & 1 || removed & 2 || removed & 4)) {
        spent = true;
        release(i, true);
      } else if (removed & 1 && !chording) release(i, false);
    }
    prev = now;
    if (!now) {
      chording = spent = false;
      if (playing()) face.dataset.face = "smile";
      return draw();
    }
    if (playing() && now & 5) face.dataset.face = "wow";
    pressedView(e, now);
  }

  /* ---------- Keyboard (not in XP, but the board must work without a mouse) ---------- */
  boardEl.addEventListener("keydown", (e) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -b.w, ArrowDown: b.w };
    if (e.key in moves) {
      e.preventDefault();
      const n = focusCell + moves[e.key];
      const sameRow = Math.floor(n / b.w) === Math.floor(focusCell / b.w);
      if (n >= 0 && n < b.w * b.h && (Math.abs(moves[e.key]) > 1 || sameRow)) focusCell = n;
      draw();
      boardEl.querySelector<HTMLElement>(`[data-i="${focusCell}"]`)?.focus();
    } else if ((e.key === "Enter" || e.key === " ") && playing()) {
      e.preventDefault();
      if (e.key === " ") cycleMark(b, focusCell, opts.marks);
      else release(focusCell, b.state[focusCell] === OPEN);
      draw();
      boardEl.querySelector<HTMLElement>(`[data-i="${focusCell}"]`)?.focus();
    }
  });

  face.addEventListener("click", newGame);

  // XYZZY then Shift: a dot in the corner shows whether the tile under the pointer is hollow (XP's one-pixel cheat)
  let typed = "";
  let cheat = false;
  document.addEventListener("keydown", (e) => {
    if (!win?.classList.contains("active") || e.target instanceof HTMLInputElement) return;
    if (e.key.length === 1) typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === "xyzzy") cheat = true;
  });
  boardEl.addEventListener("mousemove", (e) => {
    const dot = $("[data-xyzzy]");
    dot.hidden = !(cheat && e.shiftKey);
    const i = cellAt(e as PointerEvent);
    if (!dot.hidden && i >= 0) dot.classList.toggle("hit", !!b.mine[i]);
  });

  // pause the clock while the window is closed or minimised (XP does the same)
  if (win)
    new MutationObserver(() => (win.hidden ? stopTimer() : startTimer())).observe(win, {
      attributes: true,
      attributeFilter: ["hidden"],
    });

  el.classList.toggle("sw-mono", !opts.color);
  newGame();
}
