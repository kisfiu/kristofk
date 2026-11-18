import { ask as askBox } from "./ask";
import { back, CH, CW, face } from "./card-art";
import { type Card, cardName } from "./cards";
import { initMenuBar } from "./menubar";
import { load, NO_STATS, record, save } from "./scores";
import { beep, soundOn, toggleSound } from "./sound";
import {
  canDeal,
  canMove,
  deal,
  hints,
  type Level,
  move,
  newGame,
  runStart,
  type Spider,
  top,
  undo,
  won,
} from "./spider-logic";

const KEY = "kk-spider";
const STATS = "kk-spider-stats";
const SAVED = "kk-spider-save";
const BACK = "rotary";

export function initSpider(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const table = $("[data-table]");
  const win = el.closest<HTMLElement>(".window");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const ask = (title: string, text: string, buttons: string[]) => askBox(el, title, text, buttons);
  const prefs = load(KEY, { level: 1 as Level, animate: true, winAnim: true, saveOnExit: false, openSaved: false });
  let stats = load(STATS, { ...NO_STATS, played: 0, best: 0 });
  let g: Spider = newGame(prefs.level);
  /** The deal as it started, for Restart This Game. */
  let start = structuredClone(g);
  let counted = false;
  let cw = CW;
  let ch = CH;
  let hintAt = 0;
  const where = new Map<number, { col: number; index: number; x: number; y: number }>();

  initMenuBar($("[data-menubar]"), command);

  const cardEls = new Map<number, HTMLElement>();
  const cardEl = (c: Card) => {
    let e = cardEls.get(c.id);
    if (!e) {
      e = document.createElement("div");
      e.className = "sol-card";
      e.dataset.id = String(c.id);
      e.setAttribute("aria-hidden", "true");
      table.append(e);
      cardEls.set(c.id, e);
    }
    const look = c.up ? `${c.suit}${c.rank}` : "back";
    if (e.dataset.look !== look) {
      e.dataset.look = look;
      e.innerHTML = c.up ? face(c) : back(BACK);
    }
    return e;
  };
  const slots = Array.from({ length: 10 }, (_, i) => {
    const s = document.createElement("div");
    s.className = "sol-slot";
    s.dataset.col = String(i);
    table.append(s);
    return s;
  });

  /* ---------- Layout: ten columns on top; finished runs bottom left, the deck bottom right ---------- */
  let colX = (i: number) => i;
  let colY = 0;
  function render() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    const gap = Math.max(3, Math.min(12, Math.round(w * 0.012)));
    cw = Math.min(84, Math.floor((w - gap * 11) / 10));
    ch = Math.round((cw * CH) / CW);
    table.style.setProperty("--cw", `${cw}px`);
    table.style.setProperty("--ch", `${ch}px`);
    table.classList.toggle("sp-animate", prefs.animate);
    const ox = Math.round((w - (10 * cw + 9 * gap)) / 2);
    colX = (i) => ox + i * (cw + gap);
    colY = gap;
    const bottom = h - gap - ch;
    where.clear();
    let z = 1;
    for (const e of cardEls.values()) e.hidden = true;
    g.cols.forEach((col, i) => {
      slots[i].style.transform = `translate(${colX(i)}px, ${colY}px)`;
      let down = ch * 0.08;
      let up = ch * 0.24;
      const ups = col.filter((c) => c.up).length;
      const tall = (col.length - ups) * down + Math.max(0, ups - 1) * up + ch;
      const room = bottom - gap - colY;
      if (tall > room) {
        const f = Math.max(0.15, (room - ch) / (tall - ch));
        down *= f;
        up *= f;
      }
      let y = colY;
      col.forEach((c, index) => {
        const e = cardEl(c);
        e.hidden = false;
        e.style.transform = `translate(${colX(i)}px, ${Math.round(y)}px)`;
        e.style.zIndex = String(z++);
        e.classList.remove("sol-lift", "sp-hint");
        where.set(c.id, { col: i, index, x: colX(i), y: Math.round(y) });
        y += c.up ? up : down;
      });
    });
    // finished runs: their Kings, fanned, bottom left
    const done = $("[data-done]");
    done.style.transform = `translate(${colX(0)}px, ${bottom}px)`;
    done.innerHTML = g.done
      .map(
        (s, k) =>
          `<div class="sol-card" style="transform:translate(${k * Math.round(cw * 0.3)}px,0)">${face({ id: -1, suit: s, rank: 13, up: true })}</div>`,
      )
      .join("");
    // the deck: one back per deal left, bottom right
    const stock = $("[data-stock]");
    const deals = g.stock.length / 10;
    stock.hidden = !deals;
    stock.style.transform = `translate(${colX(9) - (deals - 1) * Math.round(cw * 0.22)}px, ${bottom}px)`;
    stock.style.width = `${cw + (deals - 1) * Math.round(cw * 0.22)}px`;
    stock.innerHTML = Array.from(
      { length: deals },
      (_, k) => `<span style="left:${k * Math.round(cw * 0.22)}px">${back(BACK)}</span>`,
    ).join("");
    stock.setAttribute("aria-label", `Deal next row (${deals} left)`);
    const score = $("[data-score]");
    score.innerHTML = `Score: ${g.score}<br>Moves: ${g.moves}`;
    score.style.transform = `translate(${w / 2 - 60}px, ${bottom + ch / 2 - 22}px)`;
    showCursor();
  }

  const say = (t: string) => {
    $("[data-live]").textContent = t;
  };

  /* ---------- Game flow ---------- */
  function begin(next: Spider) {
    g = next;
    start = structuredClone(next);
    counted = false;
    held = null;
    hintAt = 0;
    render();
  }
  async function resign() {
    if (counted || !g.moves || won(g)) return true;
    if ((await ask("Spider", "Do you want to give up this game? It counts as a loss.", ["Yes", "No"])) !== "Yes")
      return false;
    tally(false);
    return true;
  }
  function tally(win: boolean) {
    if (counted) return;
    counted = true;
    stats = {
      ...stats,
      ...record(stats, win),
      played: stats.played + 1,
      best: win ? Math.max(stats.best, g.score) : stats.best,
    };
    save(STATS, stats);
  }

  function changed() {
    hintAt = 0;
    render();
    if (!won(g)) return;
    tally(true);
    beep("fanfare");
    say(`You won with ${g.score} points!`);
    (prefs.winAnim && !reduced.matches ? fireworks() : Promise.resolve()).then(async () => {
      if (
        (await ask("Spider", `Congratulations, you won! Score: ${g.score}.\nDo you want to play again?`, [
          "Yes",
          "No",
        ])) === "Yes"
      )
        begin(newGame(prefs.level));
    });
  }

  function tryMove(from: number, index: number, to: number) {
    const before = g.done.length;
    if (!move(g, from, index, to)) return false;
    beep(g.done.length > before ? "ding" : "pop");
    changed();
    return true;
  }

  async function dealRow() {
    if (!g.stock.length) return;
    if (!canDeal(g)) {
      await ask("Spider", "You can't deal a new row while any column is empty.", ["OK"]);
      return;
    }
    deal(g);
    beep("scrape");
    changed();
  }

  /* ---------- Mouse: drag runs, click the deck, click the score for a hint ---------- */
  let drag: { from: number; index: number; cards: Card[]; sx: number; sy: number; moved: boolean } | null = null;
  table.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const c = (e.target as Element).closest<HTMLElement>(".sol-card[data-id]");
    const at = c && where.get(Number(c.dataset.id));
    if (!at) return;
    const col = g.cols[at.col];
    if (!col[at.index]?.up || runStart(col) > at.index) return;
    e.preventDefault();
    drag = { from: at.col, index: at.index, cards: col.slice(at.index), sx: e.clientX, sy: e.clientY, moved: false };
  });
  table.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) table.setPointerCapture(e.pointerId);
    drag.moved = true;
    drag.cards.forEach((c, k) => {
      const w = where.get(c.id)!;
      const e2 = cardEls.get(c.id)!;
      e2.style.transform = `translate(${w.x + dx}px, ${w.y + dy}px)`;
      e2.style.zIndex = String(1000 + k);
      e2.classList.add("sol-lift");
    });
  });
  table.addEventListener("pointerup", (e) => {
    const d = drag;
    drag = null;
    if (!d?.moved) return;
    const first = where.get(d.cards[0].id)!;
    const x = first.x + e.clientX - d.sx;
    const y = first.y + e.clientY - d.sy;
    let best = -1;
    let area = 0;
    g.cols.forEach((col, i) => {
      if (!canMove(g, d.from, d.index, i)) return;
      const t = top(col);
      const tx = colX(i);
      const ty = t ? where.get(t.id)!.y : colY;
      const a = Math.max(0, cw - Math.abs(tx - x)) * Math.max(0, ch - Math.abs(ty - y));
      if (a > area) {
        area = a;
        best = i;
      }
    });
    if (best < 0 || !tryMove(d.from, d.index, best)) render();
  });
  table.addEventListener("pointercancel", () => {
    drag = null;
    render();
  });
  $("[data-stock]").addEventListener("click", () => void dealRow());
  $("[data-score]").addEventListener("click", hint);

  /** M: highlight the next possible move; with none left, point at the deck (or say there's nothing). */
  function hint() {
    render();
    const list = hints(g);
    if (!list.length) {
      if (canDeal(g)) {
        $("[data-stock]").classList.add("sp-hint");
        setTimeout(() => $("[data-stock]").classList.remove("sp-hint"), 1200);
      } else void ask("Spider", "There are no more moves available.", ["OK"]);
      return;
    }
    const h = list[hintAt++ % list.length];
    for (const c of g.cols[h.from].slice(h.index)) cardEls.get(c.id)?.classList.add("sp-hint");
    const t = top(g.cols[h.to]);
    (t ? cardEls.get(t.id)! : slots[h.to]).classList.add("sp-hint");
    say(`Move ${cardName(g.cols[h.from][h.index])} to column ${h.to + 1}.`);
    setTimeout(() => {
      for (const e of [...cardEls.values(), ...slots]) e.classList.remove("sp-hint");
    }, 1200);
  }

  /* ---------- Keyboard ---------- */
  let cursor = 0;
  let held: { from: number; index: number } | null = null;
  function showCursor() {
    for (const e of [...cardEls.values(), ...slots]) e.classList.remove("sol-cursor", "sol-held");
    if (document.activeElement !== table) return;
    const t = top(g.cols[cursor]);
    (t ? cardEls.get(t.id)! : slots[cursor]).classList.add("sol-cursor");
    if (held) for (const c of g.cols[held.from].slice(held.index)) cardEls.get(c.id)?.classList.add("sol-held");
  }
  table.addEventListener("focus", showCursor);
  table.addEventListener("blur", showCursor);
  table.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") cursor = (cursor + (e.key === "ArrowLeft" ? 9 : 1)) % 10;
    else if (e.key === "Escape" && held) {
      held = null;
      e.stopPropagation();
    } else if (e.key === "Enter" || e.key === " ") {
      const col = g.cols[cursor];
      if (held) {
        const from = held.from;
        let ok = false;
        // the longest part of the held run that fits
        for (let i = held.index; i < g.cols[from].length && !ok; i++) ok = tryMove(from, i, cursor);
        if (!ok) beep("error");
        say(ok ? "Moved." : "That can't go there.");
        held = null;
      } else if (col.length) {
        held = { from: cursor, index: runStart(col) };
        say(
          `Picked up ${cardName(col[held.index])}${col.length - held.index > 1 ? ` and ${col.length - held.index - 1} more` : ""}.`,
        );
      }
    } else return;
    e.preventDefault();
    if (e.key.startsWith("Arrow")) {
      const t = top(g.cols[cursor]);
      say(`Column ${cursor + 1}: ${t ? cardName(t) : "empty"}`);
    }
    showCursor();
  });

  /* ---------- Winning: fireworks, as in XP ---------- */
  function fireworks(): Promise<void> {
    return new Promise((done) => {
      const canvas = document.createElement("canvas");
      canvas.className = "sol-bounce";
      canvas.width = table.clientWidth;
      canvas.height = table.clientHeight;
      table.append(canvas);
      const ctx = canvas.getContext("2d")!;
      const sparks: { x: number; y: number; vx: number; vy: number; life: number; hue: number }[] = [];
      const t0 = performance.now();
      let next = 0;
      const frame = (now: number) => {
        if (now - t0 > 4000) {
          canvas.remove();
          return done();
        }
        if (now > next) {
          next = now + 350;
          const x = canvas.width * (0.2 + Math.random() * 0.6);
          const y = canvas.height * (0.15 + Math.random() * 0.35);
          const hue = Math.floor(Math.random() * 360);
          for (let k = 0; k < 60; k++) {
            const a = (k / 60) * Math.PI * 2;
            const v = 1.5 + Math.random() * 3;
            sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 60, hue });
          }
        }
        ctx.fillStyle = "rgb(0 60 0 / 0.25)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const s of sparks) {
          s.vy += 0.05;
          s.x += s.vx;
          s.y += s.vy;
          s.life--;
          ctx.fillStyle = `hsl(${s.hue} 100% 65% / ${s.life / 60})`;
          ctx.fillRect(s.x, s.y, 2.5, 2.5);
        }
        for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  /* ---------- Menus and dialogs ---------- */
  async function command(cmd: string) {
    if (cmd === "new") {
      if (await resign()) begin(newGame(prefs.level));
    } else if (cmd === "restart") begin(structuredClone(start));
    else if (cmd === "undo") {
      if (undo(g)) changed();
    } else if (cmd === "deal") void dealRow();
    else if (cmd === "hint") hint();
    else if (cmd === "difficulty") difficulty();
    else if (cmd === "stats") showStats();
    else if (cmd === "options") options();
    else if (cmd === "save") {
      save(SAVED, g);
      say("Game saved.");
    } else if (cmd === "open") {
      const saved = load(SAVED, {} as Partial<Spider>);
      if (!saved.cols) return void ask("Spider", "There is no saved game.", ["OK"]);
      begin(saved as Spider);
    } else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  function difficulty() {
    const d = $<HTMLDialogElement>("[data-difficulty]");
    const f = d.querySelector("form")!;
    (f.elements.namedItem("level") as RadioNodeList).value = String(prefs.level);
    d.addEventListener(
      "close",
      async () => {
        const level = Number((f.elements.namedItem("level") as RadioNodeList).value) as Level;
        if (d.returnValue !== "ok" || level === prefs.level || !(await resign())) return;
        prefs.level = level;
        save(KEY, prefs);
        begin(newGame(level));
      },
      { once: true },
    );
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
  }

  function showStats() {
    const pct = stats.won + stats.lost ? Math.round((100 * stats.won) / (stats.won + stats.lost)) : 0;
    const cur = stats.current > 0 ? `${stats.current} wins` : stats.current < 0 ? `${-stats.current} losses` : "none";
    $("[data-stats-rows]").innerHTML = `
      <tr><th>Games played:</th><td>${stats.played}</td></tr>
      <tr><th>Games won:</th><td>${stats.won} (${pct}%)</td></tr>
      <tr><th>High score:</th><td>${stats.best}</td></tr>
      <tr><th>Most wins in a row:</th><td>${stats.bestWins}</td></tr>
      <tr><th>Most losses in a row:</th><td>${stats.bestLosses}</td></tr>
      <tr><th>Current streak:</th><td>${cur}</td></tr>`;
    const d = $<HTMLDialogElement>("[data-stats]");
    if (!d.open) d.showModal();
  }
  $("[data-reset]").addEventListener("click", () => {
    stats = { ...NO_STATS, played: 0, best: 0 };
    save(STATS, stats);
    showStats();
  });

  function options() {
    const d = $<HTMLDialogElement>("[data-options]");
    const f = d.querySelector("form")!;
    const box = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
    box("sound").checked = soundOn();
    for (const k of ["animate", "winAnim", "saveOnExit", "openSaved"] as const) box(k).checked = prefs[k];
    d.addEventListener(
      "close",
      () => {
        if (d.returnValue !== "ok") return;
        if (box("sound").checked !== soundOn()) toggleSound();
        for (const k of ["animate", "winAnim", "saveOnExit", "openSaved"] as const) prefs[k] = box(k).checked;
        save(KEY, prefs);
        render();
      },
      { once: true },
    );
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
  }

  // Save game on exit: when the window closes (or the page goes away) mid-game
  const autosave = () => {
    if (prefs.saveOnExit && g.moves && !won(g)) save(SAVED, g);
  };
  addEventListener("pagehide", autosave);
  if (win)
    new MutationObserver(() => win.hidden && autosave()).observe(win, {
      attributes: true,
      attributeFilter: ["hidden"],
    });

  new ResizeObserver(() => {
    if (!drag) render();
  }).observe(table);
  const saved = prefs.openSaved ? load(SAVED, {} as Partial<Spider>) : {};
  begin(saved.cols ? (saved as Spider) : g);
}
