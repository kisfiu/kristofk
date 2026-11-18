import { ask as askBox } from "./ask";
import { CH, CW, face } from "./card-art";
import { type Card, cardName } from "./cards";
import {
  autoplay,
  cardsLeft,
  type FreeCell,
  type Loc,
  legalMoves,
  MAX_DEAL,
  maxRun,
  move,
  NO_STATS,
  newDeal,
  record,
  runLength,
  type Stats,
  top,
  undo,
  won,
} from "./freecell-logic";
import { initMenuBar } from "./menubar";
import { load, save } from "./scores";
import { beep } from "./sound";

const KEY = "kk-freecell";
const STATS = "kk-freecell-stats";
const lid = (l: Loc) => `${l.kind}${l.i}`;
const LOCS: Loc[] = [
  ...[0, 1, 2, 3].map((i) => ({ kind: "cell", i }) as Loc),
  ...[0, 1, 2, 3].map((i) => ({ kind: "home", i }) as Loc),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ kind: "col", i }) as Loc),
];
const randomDeal = () => 1 + Math.floor(Math.random() * MAX_DEAL);

export function initFreeCell(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const table = $("[data-table]");
  const win = el.closest<HTMLElement>(".window");
  const prefs = load(KEY, { messages: true, quick: false, dbl: true });
  let total: Stats = load(STATS, NO_STATS);
  let session: Stats = { ...NO_STATS };
  let g: FreeCell = newDeal(randomDeal());
  let sel: Loc | null = null;
  /** This deal's result is already in the statistics (won, lost, or resigned). */
  let counted = false;
  /** XP's Ctrl+Shift+F10 "Abort": the next move wins. */
  let cheat = false;
  let cw = CW;
  let ch = CH;
  const where = new Map<number, { loc: Loc; index: number }>();

  initMenuBar($("[data-menubar]"), command);

  const slots = new Map<string, HTMLElement>();
  for (const l of LOCS) {
    const s = document.createElement("div");
    s.className = `sol-slot fc-${l.kind}`;
    s.dataset.loc = lid(l);
    table.append(s);
    slots.set(lid(l), s);
  }
  const cardEls = new Map<number, HTMLElement>();
  const cardEl = (c: Card) => {
    let e = cardEls.get(c.id);
    if (!e) {
      e = document.createElement("div");
      e.className = "sol-card";
      e.dataset.id = String(c.id);
      e.dataset.look = `${c.suit}${c.rank}`;
      e.setAttribute("aria-hidden", "true");
      e.innerHTML = face(c);
      table.append(e);
      cardEls.set(c.id, e);
    }
    return e;
  };
  const cardAt = (l: Loc): Card | undefined =>
    l.kind === "cell" ? (g.cells[l.i] ?? undefined) : l.kind === "home" ? top(g.home[l.i]) : top(g.cols[l.i]);

  /* ---------- Layout ---------- */
  function render() {
    const w = table.clientWidth;
    const h = table.clientHeight;
    const gap = Math.max(4, Math.min(14, Math.round(w * 0.016)));
    // leave room at the sides so the top row can part around Racka
    cw = Math.min(92, Math.floor((w - gap * 7 - Math.min(90, w * 0.1)) / 8));
    ch = Math.round((cw * CH) / CW);
    table.style.setProperty("--cw", `${cw}px`);
    table.style.setProperty("--ch", `${ch}px`);
    table.classList.toggle("fc-quick", prefs.quick);
    const ox = Math.round((w - (8 * cw + 7 * gap)) / 2);
    // the top row parts in the middle to make room for Racka (XP's king), when there is room
    const part = Math.max(0, Math.min(26, ox - gap));
    const racka = $("[data-racka]");
    racka.style.display = part >= 14 ? "" : "none";
    racka.style.left = `${w / 2 - 18}px`;
    racka.style.top = `${gap + ch / 2 - 18}px`;
    const xy = (l: Loc): [number, number] =>
      l.kind === "col"
        ? [ox + l.i * (cw + gap), gap * 2 + ch]
        : l.kind === "cell"
          ? [ox - part + l.i * (cw + gap), gap]
          : [ox + part + (4 + l.i) * (cw + gap), gap];
    where.clear();
    let z = 1;
    const place = (c: Card, loc: Loc, index: number, x: number, y: number) => {
      const e = cardEl(c);
      e.style.transform = `translate(${x}px, ${y}px)`;
      e.style.zIndex = String(z++);
      e.classList.toggle("fc-sel", !!sel && lid(sel) === lid(loc) && c === cardAt(loc));
      where.set(c.id, { loc, index });
    };
    for (const l of LOCS) {
      const [x, y] = xy(l);
      slots.get(lid(l))!.style.transform = `translate(${x}px, ${y}px)`;
      if (l.kind === "cell") {
        const c = g.cells[l.i];
        if (c) place(c, l, 0, x, y);
      } else if (l.kind === "home") for (const [i, c] of g.home[l.i].entries()) place(c, l, i, x, y);
      else {
        const col = g.cols[l.i];
        let step = ch * 0.25;
        const room = h - y - gap;
        if ((col.length - 1) * step + ch > room) step = Math.max(6, (room - ch) / Math.max(1, col.length - 1));
        for (const [i, c] of col.entries()) place(c, l, i, x, Math.round(y + i * step));
      }
    }
    $("[data-left]").textContent = `Cards Left: ${cardsLeft(g)}`;
    $("[data-dealno]").textContent = `Game #${g.deal}`;
    const title = win?.querySelector(".title-bar-text span[id]");
    if (title) title.textContent = `FreeCell Game #${g.deal}`;
  }

  /* ---------- Dialogs ---------- */
  const ask = (title: string, text: string, buttons: string[]) => askBox(el, title, text, buttons);
  const say = (t: string) => {
    $("[data-live]").textContent = t;
  };
  function tally(win: boolean) {
    if (counted) return;
    counted = true;
    total = record(total, win);
    session = record(session, win);
    save(STATS, total);
  }

  /* ---------- Playing ---------- */
  function deal(n: number) {
    g = newDeal(n);
    sel = null;
    counted = false;
    cheat = false;
    render();
    say(`Game number ${n}.`);
  }
  /** Leaving a game in progress counts as a loss, as in XP (Restart doesn't). */
  async function resign() {
    if (counted || !g.moves || won(g)) return true;
    if ((await ask("FreeCell", "Do you want to resign this game? It counts as a loss.", ["Yes", "No"])) !== "Yes")
      return false;
    tally(false);
    return true;
  }

  function pick(l: Loc) {
    if (sel && lid(sel) === lid(l)) {
      sel = null;
      return render();
    }
    if (sel) return void tryMove(sel, l);
    const c = cardAt(l);
    if (!c || l.kind === "home") return;
    sel = l;
    render();
    say(`${cardName(c)} selected.`);
  }

  async function tryMove(from: Loc, to: Loc, quiet = false) {
    sel = null;
    let count: number | undefined;
    // an ordered run going to an empty column: XP asks whether to take the whole column
    if (to.kind === "col" && !g.cols[to.i].length && from.kind === "col") {
      const n = Math.min(runLength(g.cols[from.i]), maxRun(g, true));
      if (n > 1) {
        const a = await ask("Move to Empty Column", "Move the whole ordered column, or a single card?", [
          "Move column",
          "Move single card",
          "Cancel",
        ]);
        if (a !== "Move column" && a !== "Move single card") return render();
        count = a === "Move column" ? n : 1;
      }
    }
    if (!move(g, from, to, count)) {
      render();
      if (quiet) return;
      if (prefs.messages) await ask("FreeCell", "That move is not allowed.", ["OK"]);
      else beep("error");
      return;
    }
    if (cheat) {
      // everything goes home
      for (const c of [...g.cols.flat(), ...g.cells.filter((x): x is Card => !!x)].sort((a, b) => a.rank - b.rank)) {
        const from2 = g.cells.includes(c)
          ? ({ kind: "cell", i: g.cells.indexOf(c) } as Loc)
          : ({ kind: "col", i: g.cols.findIndex((col) => col.includes(c)) } as Loc);
        const col = from2.kind === "col" ? g.cols[from2.i] : null;
        if (col) col.splice(col.indexOf(c), 1);
        else g.cells[from2.i] = null;
        const i = g.home.findIndex((h) => h[0]?.suit === c.suit);
        g.home[i >= 0 ? i : g.home.findIndex((h) => !h.length)].push(c);
      }
    }
    beep("pop");
    autoplay(g);
    render();
    after();
  }

  async function after() {
    if (won(g)) {
      tally(true);
      beep("fanfare");
      if (
        (await ask("Game Won", "All services migrated. Coffee time.\nCongratulations, you win! Play again?", [
          "Yes",
          "No",
        ])) === "Yes"
      )
        deal(randomDeal());
      return;
    }
    const left = legalMoves(g).length;
    if (left === 1) {
      // XP flashes the title bar when exactly one move is left
      const bar = win?.querySelector(".title-bar");
      bar?.classList.remove("fc-flash");
      void (bar as HTMLElement | undefined)?.offsetWidth;
      bar?.classList.add("fc-flash");
      say("Only one move left.");
    } else if (!left) {
      tally(false);
      beep("error");
      if (
        (await ask("Game Over", "No moves left. This deal is stuck.\nPlay this game again?", ["Yes", "No"])) === "Yes"
      )
        deal(g.deal);
    }
  }

  /* ---------- Mouse ---------- */
  const locOf = (t: EventTarget | null): { loc: Loc; index: number } | undefined => {
    const c = (t as Element).closest<HTMLElement>(".sol-card");
    if (c) return where.get(Number(c.dataset.id));
    const s = (t as Element).closest<HTMLElement>(".sol-slot");
    const l = s && LOCS.find((x) => lid(x) === s.dataset.loc);
    return l ? { loc: l, index: -1 } : undefined;
  };
  table.addEventListener("click", (e) => {
    const h = locOf(e.target);
    if (h) pick(h.loc);
  });
  table.addEventListener("dblclick", (e) => {
    const h = locOf(e.target);
    if (!prefs.dbl || !h || h.loc.kind !== "col" || !g.cols[h.loc.i].length) return;
    const free = g.cells.findIndex((c) => !c);
    if (free >= 0) void tryMove(h.loc, { kind: "cell", i: free }, true);
  });
  // holding the right button on a covered card shows it whole
  table.addEventListener("contextmenu", (e) => e.preventDefault());
  table.addEventListener("pointerdown", (e) => {
    if (e.button !== 2) return;
    const c = (e.target as Element).closest<HTMLElement>(".sol-card");
    if (!c) return;
    const z = c.style.zIndex;
    c.style.zIndex = "999";
    addEventListener("pointerup", () => (c.style.zIndex = z), { once: true });
  });
  // Racka watches the mouse, like XP's king looks towards your side
  table.addEventListener("pointermove", (e) => {
    const r = table.getBoundingClientRect();
    $("[data-racka]").classList.toggle("right", e.clientX > r.left + r.width / 2);
  });

  /* ---------- Keyboard: XP's 1–8 columns, 0 free cells, 9 home ---------- */
  document.addEventListener("keydown", (e) => {
    if (!win?.classList.contains("active") || win.hidden || document.querySelector("dialog[open]")) return;
    if ((e.target as Element).closest?.("input, textarea")) return;
    if (e.ctrlKey && e.shiftKey && e.key === "F10") {
      e.preventDefault();
      void ask(
        "User-Friendly Debugging Aid",
        "Something unusual happened.\nAbort: you win with your next move. Retry or Ignore: carry on.",
        ["Abort", "Retry", "Ignore"],
      ).then((a) => {
        cheat = a === "Abort";
      });
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key >= "1" && e.key <= "8") pick({ kind: "col", i: Number(e.key) - 1 });
    else if (e.key === "0") {
      if (sel && sel.kind === "col") {
        const free = g.cells.findIndex((c) => !c);
        void tryMove(sel, { kind: "cell", i: Math.max(free, 0) });
      } else {
        // no selection, or a free cell selected: 0 cycles through the cards in the free cells
        const start = sel ? sel.i + 1 : 0;
        for (let k = 0; k < 4; k++) {
          const i = (start + k) % 4;
          if (g.cells[i]) {
            sel = null;
            pick({ kind: "cell", i });
            break;
          }
        }
      }
    } else if (e.key === "9" && sel) void tryMove(sel, { kind: "home", i: 0 });
    else return;
    e.preventDefault();
  });

  /* ---------- Menus ---------- */
  async function command(cmd: string) {
    if (cmd === "new") {
      if (await resign()) deal(randomDeal());
    } else if (cmd === "select") {
      const d = $<HTMLDialogElement>("[data-select]");
      const input = d.querySelector("input")!;
      input.value = String(randomDeal());
      d.addEventListener(
        "close",
        async () => {
          const n = Math.round(Number(input.value));
          if (d.returnValue === "ok" && n >= 1 && n <= MAX_DEAL && (await resign())) deal(n);
        },
        { once: true },
      );
      d.showModal();
      input.select();
    } else if (cmd === "restart") deal(g.deal);
    else if (cmd === "undo") {
      if (undo(g)) render();
    } else if (cmd === "stats") showStats();
    else if (cmd === "options") {
      const d = $<HTMLDialogElement>("[data-options]");
      const f = d.querySelector("form")!;
      const box = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
      box("messages").checked = prefs.messages;
      box("quick").checked = prefs.quick;
      box("dbl").checked = prefs.dbl;
      d.addEventListener(
        "close",
        () => {
          if (d.returnValue !== "ok") return;
          Object.assign(prefs, {
            messages: box("messages").checked,
            quick: box("quick").checked,
            dbl: box("dbl").checked,
          });
          save(KEY, prefs);
          render();
        },
        { once: true },
      );
      d.showModal();
    } else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  function showStats() {
    const pct = (s: Stats) => (s.won + s.lost ? Math.round((100 * s.won) / (s.won + s.lost)) : 0);
    const streak = (n: number) =>
      n > 0 ? `${n} win${n > 1 ? "s" : ""}` : n < 0 ? `${-n} loss${n < -1 ? "es" : ""}` : "none";
    $("[data-stats-rows]").innerHTML = `
      <tr><th>This session:</th><td>won ${session.won}, lost ${session.lost}</td><td>${pct(session)}%</td></tr>
      <tr><th>Total:</th><td>won ${total.won}, lost ${total.lost}</td><td>${pct(total)}%</td></tr>
      <tr><th>Streaks:</th><td>wins ${total.bestWins}, losses ${total.bestLosses}</td><td>current: ${streak(total.current)}</td></tr>`;
    const d = $<HTMLDialogElement>("[data-stats]");
    if (!d.open) d.showModal();
  }
  $("[data-clear]").addEventListener("click", () => {
    total = { ...NO_STATS };
    session = { ...NO_STATS };
    save(STATS, total);
    showStats();
  });

  new ResizeObserver(() => render()).observe(table);
  deal(g.deal);
}
