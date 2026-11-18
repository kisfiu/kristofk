import { BACKS, back, CH, CW, face } from "./card-art";
import { type Card, cardName } from "./cards";
import { initMenuBar } from "./menubar";
import { load, save } from "./scores";
import {
  autoAll,
  bonus,
  canPlace,
  canRecycle,
  draw,
  flip,
  type Game,
  grab,
  move,
  newGame,
  type Options,
  type Pile,
  pileCards,
  type Scoring,
  tick,
  toFoundation,
  top,
  undo,
  won,
} from "./solitaire-logic";
import { beep } from "./sound";

const KEY = "kk-solitaire";
const VEGAS = "kk-solitaire-vegas";
/** Pile order: the top row (deck, waste, four foundations), then the seven columns. Also the keyboard grid. */
const PILES: Pile[] = [
  { kind: "stock" },
  { kind: "waste" },
  ...[0, 1, 2, 3].map((i) => ({ kind: "found", i }) as Pile),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ kind: "tab", i }) as Pile),
];
const pid = (p: Pile) => p.kind + ("i" in p ? p.i : "");
const same = (a: Pile, b: Pile) => pid(a) === pid(b);
/** Column (0–6) of each pile in the layout. */
const colOf = (p: Pile) => (p.kind === "stock" ? 0 : p.kind === "waste" ? 1 : p.kind === "found" ? 3 + p.i : p.i);

export function initSolitaire(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const table = $("[data-table]");
  const win = el.closest<HTMLElement>(".window");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const prefs = load(KEY, {
    draw: 3 as 1 | 3,
    scoring: "standard" as Scoring,
    timed: true,
    keepScore: false,
    status: true,
    outline: false,
    back: BACKS[0].id,
  });
  const opts = (): Options => ({
    draw: prefs.draw,
    scoring: prefs.scoring,
    timed: prefs.timed,
    keepScore: prefs.keepScore,
  });
  let g: Game = newGame(opts());
  let timer = 0;
  let started = false;
  let celebrating = false;
  let cw = CW;
  let ch = CH;
  let gap = 12;
  /** Where every card sits after the last render, for hit-testing and drop targets. */
  const where = new Map<number, { pile: Pile; index: number; x: number; y: number }>();

  initMenuBar($("[data-menubar]"), command);

  // one element per pile (the empty-pile outline and click target) and one per card
  const slots = new Map<string, HTMLElement>();
  for (const p of PILES) {
    const s = document.createElement("div");
    s.className = `sol-slot sol-${p.kind}`;
    s.dataset.pile = pid(p);
    table.append(s);
    slots.set(pid(p), s);
  }
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
    const look = c.up ? `${c.suit}${c.rank}` : `back:${prefs.back}`;
    if (e.dataset.look !== look) {
      e.dataset.look = look;
      e.innerHTML = c.up ? face(c) : back(prefs.back);
    }
    return e;
  };

  /* ---------- Layout ---------- */
  const slotXY = (p: Pile): [number, number] => [gap + colOf(p) * (cw + gap), p.kind === "tab" ? gap * 2 + ch : gap];

  function render() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    gap = Math.max(4, Math.min(14, Math.round(w * 0.018)));
    cw = Math.min(96, Math.floor((w - gap * 8) / 7));
    ch = Math.round((cw * CH) / CW);
    table.style.setProperty("--cw", `${cw}px`);
    table.style.setProperty("--ch", `${ch}px`);
    where.clear();
    let z = 1;
    const place = (c: Card, pile: Pile, index: number, x: number, y: number) => {
      const e = cardEl(c);
      e.style.transform = `translate(${x}px, ${y}px)`;
      e.style.zIndex = String(z++);
      e.classList.remove("sol-lift");
      where.set(c.id, { pile, index, x, y });
    };
    for (const p of PILES) {
      const [x, y] = slotXY(p);
      const s = slots.get(pid(p))!;
      s.style.transform = `translate(${x}px, ${y}px)`;
      const cards = pileCards(g, p);
      if (p.kind === "stock") {
        // an empty deck shows a ring when it can be turned over again, a cross when the passes are used up
        s.classList.toggle("ring", !cards.length && canRecycle(g));
        s.classList.toggle("cross", !cards.length && !canRecycle(g));
        for (const [i, c] of cards.entries()) place(c, p, i, x + Math.floor(i / 8) * 2, y + Math.floor(i / 8) * 2);
      } else if (p.kind === "waste") {
        // Draw Three fans the last three turned cards
        const fan = g.opts.draw === 3 ? Math.min(3, cards.length) : 1;
        cards.forEach((c, i) => {
          const k = Math.max(0, i - (cards.length - fan));
          place(c, p, i, x + k * Math.round(cw * 0.22), y);
        });
      } else if (p.kind === "found") for (const [i, c] of cards.entries()) place(c, p, i, x, y);
      else {
        let down = ch * 0.1;
        let upStep = ch * 0.27;
        const ups = cards.filter((c) => c.up).length;
        const tall = (cards.length - ups) * down + Math.max(0, ups - 1) * upStep + ch;
        const room = h - y - gap;
        if (tall > room) {
          const f = Math.max(0.2, (room - ch) / (tall - ch));
          down *= f;
          upStep *= f;
        }
        let yy = y;
        cards.forEach((c, i) => {
          place(c, p, i, x, Math.round(yy));
          yy += c.up ? upStep : down;
        });
      }
    }
    // cards no longer on the table (never happens in Klondike, but keeps the map honest)
    for (const [id, e] of cardEls) e.hidden = !where.has(id);
    showCursor();
    status();
  }

  /* ---------- Status bar and clock ---------- */
  const money = (n: number) => (n < 0 ? `-$${-n}` : `$${n}`);
  function status() {
    const bar = $("[data-status]");
    bar.hidden = !prefs.status;
    $("[data-score]").hidden = g.opts.scoring === "none";
    $("[data-score]").textContent = `Score: ${g.opts.scoring === "vegas" ? money(g.score) : g.score}`;
    $("[data-score]").classList.toggle("sol-neg", g.opts.scoring === "vegas" && g.score < 0);
    $("[data-time]").hidden = !g.opts.timed;
    $("[data-time]").textContent = `Time: ${g.seconds}`;
  }
  const stopClock = () => {
    clearInterval(timer);
    timer = 0;
  };
  const startClock = () => {
    if (timer || !started || celebrating || win?.hidden) return;
    timer = window.setInterval(() => {
      tick(g);
      status();
    }, 1000);
  };
  const say = (t: string) => {
    $("[data-live]").textContent = t;
  };

  /** Run a game action; on success: start the clock, redraw, check for a win. */
  function act(fn: () => boolean | number) {
    if (celebrating) return false;
    const ok = !!fn();
    if (!ok) return false;
    started = true;
    startClock();
    if (g.opts.scoring === "vegas" && g.opts.keepScore) save(VEGAS, { total: g.score });
    render();
    if (won(g)) celebrate();
    return true;
  }

  function deal() {
    stopClock();
    celebrating = false;
    $("[data-bounce]")?.remove();
    // Vegas with Keep score: the money carries over and every deal costs another $52
    g = newGame(opts(), Math.random, prefs.keepScore ? load(VEGAS, { total: 0 }).total : 0);
    if (g.opts.scoring === "vegas" && g.opts.keepScore) save(VEGAS, { total: g.score });
    started = false;
    held = null;
    render();
    say("New deal.");
  }

  /* ---------- Mouse: drag, click, double-click, right-click ---------- */
  const hit = (t: EventTarget | null) => {
    const c = (t as Element).closest<HTMLElement>(".sol-card");
    if (c) return where.get(Number(c.dataset.id));
    const s = (t as Element).closest<HTMLElement>(".sol-slot");
    const p = s && PILES.find((x) => pid(x) === s.dataset.pile);
    return p ? { pile: p, index: pileCards(g, p).length - 1, x: 0, y: 0 } : undefined;
  };
  let drag: {
    from: Pile;
    index: number;
    cards: Card[];
    sx: number;
    sy: number;
    moved: boolean;
    outline: HTMLElement | null;
  } | null = null;

  table.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || celebrating) return;
    const h = hit(e.target);
    if (!h) return;
    const { pile, index } = h;
    if (pile.kind === "stock") {
      // XP's hidden extra: Ctrl+Alt+Shift turns a single card in Draw Three
      act(() => draw(g, e.ctrlKey && e.altKey && e.shiftKey ? 1 : undefined));
      return;
    }
    const cards = pileCards(g, pile);
    if (pile.kind === "tab" && cards[index] && !cards[index].up) {
      if (index === cards.length - 1) act(() => flip(g, pile.i));
      return;
    }
    if (pile.kind !== "tab" && index !== cards.length - 1) return;
    const moving = grab(g, pile, index);
    if (!moving.length) return;
    e.preventDefault();
    drag = { from: pile, index, cards: moving, sx: e.clientX, sy: e.clientY, moved: false, outline: null };
  });

  table.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    // capture only once it's a real drag: capturing on press would retarget a double-click to the table
    if (!drag.moved) table.setPointerCapture(e.pointerId);
    drag.moved = true;
    const first = where.get(drag.cards[0].id)!;
    if (prefs.outline) {
      // Outline dragging: a dotted frame moves, the cards stay until dropped
      if (!drag.outline) {
        drag.outline = document.createElement("div");
        drag.outline.className = "sol-outline";
        const last = where.get(drag.cards[drag.cards.length - 1].id)!;
        drag.outline.style.height = `${last.y - first.y + ch}px`;
        table.append(drag.outline);
      }
      drag.outline.style.transform = `translate(${first.x + dx}px, ${first.y + dy}px)`;
      return;
    }
    drag.cards.forEach((c, k) => {
      const w = where.get(c.id)!;
      const e2 = cardEls.get(c.id)!;
      e2.style.transform = `translate(${w.x + dx}px, ${w.y + dy}px)`;
      e2.style.zIndex = String(1000 + k);
      e2.classList.add("sol-lift");
    });
  });

  function drop(e: PointerEvent) {
    const d = drag;
    drag = null;
    d?.outline?.remove();
    if (!d?.moved) return;
    const first = where.get(d.cards[0].id)!;
    const x = first.x + e.clientX - d.sx;
    const y = first.y + e.clientY - d.sy;
    // the pile whose top card (or empty outline) the dragged card overlaps most, among those that take it
    let best: Pile | null = null;
    let bestArea = 0;
    for (const p of PILES) {
      if (p.kind !== "found" && p.kind !== "tab") continue;
      if (same(p, d.from) || !canPlace(g, d.cards, p)) continue;
      const t = top(pileCards(g, p));
      const [px, py] = t ? [where.get(t.id)!.x, where.get(t.id)!.y] : slotXY(p);
      const area = Math.max(0, cw - Math.abs(px - x)) * Math.max(0, ch - Math.abs(py - y));
      if (area > bestArea) {
        bestArea = area;
        best = p;
      }
    }
    if (!best || !act(() => move(g, d.from, d.index, best))) render();
  }
  table.addEventListener("pointerup", drop);
  table.addEventListener("pointercancel", () => {
    drag?.outline?.remove();
    drag = null;
    render();
  });

  table.addEventListener("dblclick", (e) => {
    const h = hit(e.target);
    if (h && h.pile.kind !== "stock" && h.pile.kind !== "found") act(() => toFoundation(g, h.pile));
  });
  table.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const h = hit(e.target);
    const card = h && pileCards(g, h.pile)[h.index];
    // right-click a card: that card goes up; right-click the table: everything that fits goes up
    if (h && card?.up && h.pile.kind !== "found" && h.index === pileCards(g, h.pile).length - 1)
      act(() => toFoundation(g, h.pile));
    else act(() => autoAll(g));
  });

  /* ---------- Keyboard (XP had its own; this one is simpler but complete) ---------- */
  let cursor = 0;
  let held: { from: Pile; index: number } | null = null;
  function showCursor() {
    for (const s of slots.values()) s.classList.remove("sol-cursor");
    for (const e of cardEls.values()) e.classList.remove("sol-cursor", "sol-held");
    if (document.activeElement !== table) return;
    const p = PILES[cursor];
    const t = top(pileCards(g, p));
    (t ? cardEls.get(t.id)! : slots.get(pid(p))!).classList.add("sol-cursor");
    if (held) for (const c of grab(g, held.from, held.index)) cardEls.get(c.id)?.classList.add("sol-held");
  }
  table.addEventListener("focus", showCursor);
  table.addEventListener("blur", showCursor);
  table.addEventListener("keydown", (e) => {
    if (celebrating) return;
    const top6 = [0, 1, 2, 3, 4, 5];
    const row = cursor < 6 ? 0 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const list = row ? [6, 7, 8, 9, 10, 11, 12] : top6;
      const i = list.indexOf(cursor) + (e.key === "ArrowLeft" ? -1 : 1);
      cursor = list[(i + list.length) % list.length];
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // between the rows by screen column
      const col = colOf(PILES[cursor]);
      cursor = row ? (top6.find((i) => colOf(PILES[i]) >= col) ?? 5) : 6 + col;
    } else if (e.key === "Escape" && held) {
      held = null;
      say("Put back.");
      e.stopPropagation();
    } else if (e.key === "Enter" || e.key === " ") {
      const p = PILES[cursor];
      const cards = pileCards(g, p);
      if (p.kind === "stock") act(() => draw(g));
      else if (held && same(held.from, p)) {
        act(() => toFoundation(g, p));
        held = null;
      } else if (held) {
        const from = held.from;
        const start = held.index;
        const n = pileCards(g, from).length;
        // the longest part of the held run that fits
        let ok = false;
        for (let i = start; i < n && !ok; i++) ok = act(() => move(g, from, i, p));
        say(ok ? "Moved." : "That can't go there.");
        if (!ok) beep("error");
        held = null;
      } else if (p.kind === "tab" && top(cards) && !top(cards).up) act(() => flip(g, p.i));
      else if (cards.length) {
        const index = p.kind === "tab" ? cards.findIndex((c) => c.up) : cards.length - 1;
        held = { from: p, index };
        say(
          `Picked up ${cardName(cards[index])}${cards.length - index > 1 ? ` and ${cards.length - index - 1} more` : ""}.`,
        );
      }
    } else return;
    e.preventDefault();
    const t = top(pileCards(g, PILES[cursor]));
    if (!held && e.key.startsWith("Arrow"))
      say(t ? cardName(t) : `empty ${PILES[cursor].kind === "found" ? "foundation" : "pile"}`);
    showCursor();
  });

  /* ---------- Winning: XP's bouncing cards ---------- */
  const imgs = new Map<string, HTMLImageElement>();
  const image = (c: Card) => {
    const k = c.suit + c.rank;
    let im = imgs.get(k);
    if (!im) {
      im = new Image();
      im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(face({ ...c, up: true }))}`;
      imgs.set(k, im);
    }
    return im;
  };

  function celebrate() {
    stopClock();
    celebrating = true;
    const b = bonus(g);
    status();
    beep("fanfare");
    say(
      `You won${b ? `, with a time bonus of ${b}` : ""}! Score ${g.opts.scoring === "vegas" ? money(g.score) : g.score}.`,
    );
    if (g.opts.scoring === "vegas" && g.opts.keepScore) save(VEGAS, { total: g.score });
    if (reduced.matches) return askAgain();
    const canvas = document.createElement("canvas");
    canvas.dataset.bounce = "";
    canvas.className = "sol-bounce";
    canvas.width = table.clientWidth;
    canvas.height = table.clientHeight;
    table.append(canvas);
    const ctx = canvas.getContext("2d")!;
    // Kings first, round the four foundations, down to the Aces
    const queue: { c: Card; i: number }[] = [];
    for (let r = 12; r >= 0; r--) for (let i = 0; i < 4; i++) queue.push({ c: g.found[i][r], i });
    let cur: { c: Card; x: number; y: number; vx: number; vy: number } | null = null;
    let raf = 0;
    const stop = async () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", stop);
      table.removeEventListener("pointerdown", stop);
      // a new deal already took over; and never open the question inside a hidden window (it would block the page)
      if (!canvas.isConnected) return;
      while (win?.hidden) await new Promise((r) => setTimeout(r, 250));
      if (canvas.isConnected) askAgain();
    };
    const frame = () => {
      if (!canvas.isConnected || win?.hidden) return void stop();
      if (!cur) {
        const next = queue.shift();
        if (!next) return void stop();
        const [x, y] = slotXY({ kind: "found", i: next.i });
        cardEls.get(next.c.id)!.hidden = true;
        cur = { c: next.c, x, y, vx: (2 + Math.random() * 5) * (Math.random() < 0.5 ? -1 : 1), vy: -Math.random() * 8 };
      }
      cur.vy += 0.7;
      cur.x += cur.vx;
      cur.y += cur.vy;
      if (cur.y + ch > canvas.height) {
        cur.y = canvas.height - ch;
        cur.vy = -cur.vy * 0.78;
      }
      ctx.drawImage(image(cur.c), cur.x, cur.y, cw, ch);
      if (cur.x + cw < 0 || cur.x > canvas.width) cur = null;
      raf = requestAnimationFrame(frame);
    };
    for (const { c } of queue) image(c);
    raf = requestAnimationFrame(frame);
    // from the next frame on: the key or click that won the game must not also stop its animation
    requestAnimationFrame(() => {
      addEventListener("keydown", stop, { once: true });
      table.addEventListener("pointerdown", stop, { once: true });
    });
  }

  function askAgain() {
    const d = $<HTMLDialogElement>("[data-again]");
    d.addEventListener("close", () => (d.returnValue === "yes" ? deal() : undefined), { once: true });
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
  }

  /* ---------- Menus and dialogs ---------- */
  function command(cmd: string) {
    if (cmd === "deal") deal();
    else if (cmd === "undo") {
      act(() => undo(g)); // act also saves the Vegas running total
    } else if (cmd === "deck") openDeck();
    else if (cmd === "options") openOptions();
    else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  function openOptions() {
    const d = $<HTMLDialogElement>("[data-options]");
    const f = d.querySelector("form")!;
    const field = (n: string) => f.elements.namedItem(n) as RadioNodeList & HTMLInputElement;
    field("draw").value = String(prefs.draw);
    field("scoring").value = prefs.scoring;
    field("timed").checked = prefs.timed;
    field("status").checked = prefs.status;
    field("outline").checked = prefs.outline;
    field("keep").checked = prefs.keepScore;
    // Keep score only means something in Vegas
    const sync = () => {
      field("keep").disabled = field("scoring").value !== "vegas";
    };
    sync();
    f.addEventListener("change", sync);
    d.addEventListener(
      "close",
      () => {
        f.removeEventListener("change", sync);
        if (d.returnValue !== "ok") return;
        const draw = Number(field("draw").value) as 1 | 3;
        const scoring = field("scoring").value as Scoring;
        const redeal = draw !== prefs.draw || scoring !== prefs.scoring || field("timed").checked !== prefs.timed;
        Object.assign(prefs, {
          draw,
          scoring,
          timed: field("timed").checked,
          status: field("status").checked,
          outline: field("outline").checked,
          keepScore: scoring === "vegas" && field("keep").checked,
        });
        save(KEY, prefs);
        g.opts.keepScore = prefs.keepScore;
        // Keep score switched on mid-game: the next deal goes on from this game's money, not an old total
        if (prefs.keepScore && !redeal) save(VEGAS, { total: g.score });
        // XP deals again when the draw or the scoring changes
        if (redeal) deal();
        else render();
      },
      { once: true },
    );
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
  }

  function openDeck() {
    const d = $<HTMLDialogElement>("[data-deck]");
    const box = $("[data-backs]");
    let pick = prefs.back;
    box.innerHTML = BACKS.map(
      (b) =>
        `<button type="button" role="radio" aria-checked="${b.id === pick}" aria-label="${b.name}" title="${b.name}" data-back="${b.id}">${back(b.id)}</button>`,
    ).join("");
    box.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-back]");
      if (!b) return;
      pick = b.dataset.back!;
      for (const o of box.querySelectorAll("[data-back]")) o.setAttribute("aria-checked", String(o === b));
    };
    box.ondblclick = () => d.close("ok");
    d.addEventListener(
      "close",
      () => {
        if (d.returnValue !== "ok") return;
        prefs.back = pick;
        save(KEY, prefs);
        render();
      },
      { once: true },
    );
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
  }

  // Alt+Shift+2: XP's secret instant win
  document.addEventListener("keydown", (e) => {
    if (!win?.classList.contains("active") || !e.altKey || !e.shiftKey || e.code !== "Digit2" || celebrating) return;
    e.preventDefault();
    const all = [...g.stock, ...g.waste, ...g.tab.flat(), ...g.found.flat()];
    g.stock = [];
    g.waste = [];
    g.tab = [[], [], [], [], [], [], []];
    g.found = ["C", "D", "H", "S"].map((s) =>
      all
        .filter((c) => c.suit === s)
        .sort((a, b) => a.rank - b.rank)
        .map((c) => ({ ...c, up: true })),
    );
    started = true;
    render();
    celebrate();
  });

  // pause the clock while the window is closed or minimised; re-lay out when the window changes size
  if (win)
    new MutationObserver(() => (win.hidden ? stopClock() : startClock())).observe(win, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  new ResizeObserver(() => {
    if (!drag && !celebrating) render();
  }).observe(table);
  deal();
}
