import { ask as askBox } from "./ask";
import { back, face } from "./card-art";
import { cardName } from "./cards";
import {
  botPass,
  botPlay,
  collect,
  dealHand,
  type Hearts,
  legal,
  newGame,
  pass,
  passOf,
  places,
  play,
  points,
} from "./hearts-logic";
import { initMenuBar } from "./menubar";
import { load, save } from "./scores";
import { beep, soundOn, toggleSound } from "./sound";

const KEY = "kk-hearts";
const SPEED = { slow: 900, normal: 550, fast: 250 } as const;
const PLACE = ["First Place", "Second Place", "Third Place", "Last Place"];
/** What the animals say, in the site's voice (seat 1 Racka, 2 stork, 3 grey cattle by default). */
const LINES: Record<number, { queen: string; broken: string; moon: string }> = {
  1: {
    queen: "Baa! Thirteen points. That's a lot of wool to lose.",
    broken: "Baa-d news: hearts are open.",
    moon: "Baa-rilliant. Every last one.",
  },
  2: {
    queen: "Klepp-klepp! I deliver babies, not Queens.",
    broken: "Klepp! Hearts are broken. Mind your step.",
    moon: "Klepp-klepp-klepp! The whole sky!",
  },
  3: {
    queen: "Mooo. The Queen. Steadier herds have fallen.",
    broken: "Moo! Hearts are out in the open now.",
    moon: "Mooo! All the hearts. Impressive.",
  },
};

export function initHearts(el: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const win = el.closest<HTMLElement>(".window");
  const ask = (title: string, text: string, buttons: string[]) => askBox(el, title, text, buttons);
  const prefs = load(KEY, {
    name: "",
    speed: "normal" as keyof typeof SPEED,
    names: ["Racka", "Stork", "Grey Cattle"],
  });
  let g: Hearts = newGame();
  let picked: number[] = [];
  let received: number[] = [];
  let busy = false;
  let started = false;

  const menu = initMenuBar($("[data-menubar]"), command);
  menu.set("sound", soundOn());

  const nameOf = (p: number) => (p === 0 ? prefs.name || "You" : prefs.names[p - 1]);
  const msg = (t: string) => {
    $("[data-msg]").textContent = t;
  };
  /** Wait, but not while the window is closed or minimised. */
  const sleep = async (ms: number) => {
    await new Promise((r) => setTimeout(r, ms));
    while (win?.hidden) await new Promise((r) => setTimeout(r, 250));
  };
  function talk(p: number, line: string) {
    if (p === 0) return;
    const b = $(`[data-say="${p}"]`);
    b.textContent = `${nameOf(p)}: ${line}`;
    b.hidden = false;
    setTimeout(() => (b.hidden = true), 2600);
  }

  /* ---------- Drawing ---------- */
  function render() {
    for (const p of [0, 1, 2, 3])
      $(`[data-name="${p}"]`).textContent = `${nameOf(p)}${started ? ` · ${g.scores[p]}` : ""}`;
    for (const p of [1, 2, 3])
      $(`[data-backs="${p}"]`).innerHTML = g.hands[p].map(() => `<span>${back("racka")}</span>`).join("");
    const ok = new Set(g.phase === "play" && g.turn === 0 ? legal(g, 0).map((c) => c.id) : []);
    const passing = g.phase === "pass" && !received.length;
    $("[data-hand]").innerHTML = g.hands[0]
      .map((c) => {
        const up = picked.includes(c.id) || received.includes(c.id);
        const playable = passing || ok.has(c.id);
        return `<button type="button" class="hz-card${up ? " up" : ""}" data-card="${c.id}" aria-label="${cardName(c)}"${passing ? ` aria-pressed="${picked.includes(c.id)}"` : ""}${playable ? "" : ' aria-disabled="true"'}>${face(c)}</button>`;
      })
      .join("");
    $("[data-trick]").innerHTML = g.trick
      .map(
        (t) => `<div class="hz-played hz-at-${t.p}" aria-label="${nameOf(t.p)}: ${cardName(t.c)}">${face(t.c)}</div>`,
      )
      .join("");
  }

  /* ---------- Flow: deal, pass, play tricks, score ---------- */
  function newMatch() {
    g = newGame();
    started = true;
    nextHand();
  }

  function nextHand() {
    dealHand(g);
    picked = [];
    received = [];
    const act = $<HTMLButtonElement>("[data-pass]");
    if (g.phase === "pass") {
      const dir = passOf(g.hand);
      act.textContent = `Pass ${dir[0].toUpperCase()}${dir.slice(1)}`;
      act.hidden = false;
      act.disabled = true;
      msg(`Select three cards to pass ${dir}.`);
      render();
    } else {
      act.hidden = true;
      msg("No passing this hand.");
      render();
      void run();
    }
  }

  function passNow() {
    const before = new Set(g.hands[0].map((c) => c.id));
    const mine = g.hands[0].filter((c) => picked.includes(c.id));
    pass(g, [mine, botPass(g.hands[1]), botPass(g.hands[2]), botPass(g.hands[3])]);
    picked = [];
    received = g.hands[0].filter((c) => !before.has(c.id)).map((c) => c.id);
    $("[data-pass]").textContent = "OK";
    msg("These are the cards passed to you. Press OK to accept them.");
    render();
  }

  /** Let the computer players play until it's your turn, collecting tricks and scoring hands on the way. */
  async function run() {
    if (busy) return;
    busy = true;
    const delay = () => SPEED[prefs.speed];
    while (g.phase === "play") {
      if (g.turn === -1) {
        await sleep(delay() * 1.6);
        const queen = g.trick.find((t) => t.c.suit === "S" && t.c.rank === 12);
        const w = collect(g);
        if (queen) talk(w, LINES[w]?.queen ?? "");
        render();
        if (g.phase !== "play") break;
        continue;
      }
      if (g.turn === 0) {
        msg(g.firstTrick && !g.trick.length ? "Lead the 2 of clubs to start." : "Click the card you want to play.");
        render();
        busy = false;
        return;
      }
      await sleep(delay());
      const p = g.turn;
      const card = botPlay(g, p);
      const wasBroken = g.broken;
      play(g, p, card);
      if (!wasBroken && g.broken) {
        beep("pop");
        talk(p, LINES[p]?.broken ?? "");
      }
      render();
    }
    busy = false;
    await handOver();
  }

  async function handOver() {
    if (g.moon >= 0) {
      beep("fanfare");
      if (g.moon === 0) msg("You shot the moon! Everyone else gets 26.");
      else talk(g.moon, LINES[g.moon]?.moon ?? "");
    }
    await showSheet();
    if (g.phase === "gameover") return gameOver();
    nextHand();
  }

  async function gameOver() {
    const pl = places(g);
    beep(pl[0] === 0 ? "fanfare" : "thud");
    const order = [0, 1, 2, 3].sort((a, b) => g.scores[a] - g.scores[b]);
    const table = order.map((p) => `${PLACE[pl[p]]}: ${nameOf(p)} (${g.scores[p]})`).join("\n");
    const head = pl[0] === 0 ? "Game Over — You Win!" : `Game Over. ${nameOf(order[0])} wins.`;
    msg("Press F2 to begin a new game.");
    if ((await ask("Hearts", `${head}\n\n${table}\n\nDo you want to play again?`, ["Yes", "No"])) === "Yes") newMatch();
  }

  function showSheet(): Promise<void> {
    const rows = g.sheet
      .map((h, i) => `<tr><th>Hand ${i + 1}</th>${h.map((n) => `<td>${n}</td>`).join("")}</tr>`)
      .join("");
    $("[data-sheet-rows]").innerHTML =
      `<tr><th></th>${[0, 1, 2, 3].map((p) => `<th>${nameOf(p).replace(/[<&]/g, "")}</th>`).join("")}</tr>${rows}<tr class="hz-total"><th>Total</th>${g.scores.map((s) => `<td>${s}</td>`).join("")}</tr>`;
    const d = $<HTMLDialogElement>("[data-sheet]");
    d.returnValue = ""; // Esc would otherwise keep the last button pressed
    d.showModal();
    return new Promise((done) => d.addEventListener("close", () => done(), { once: true }));
  }

  /* ---------- Input ---------- */
  $("[data-hand]").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!b) return;
    const id = Number(b.dataset.card);
    if (g.phase === "pass" && !received.length) {
      picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked;
      $<HTMLButtonElement>("[data-pass]").disabled = picked.length !== 3;
      render();
      $<HTMLElement>(`[data-card="${id}"]`).focus();
      return;
    }
    if (g.phase !== "play" || g.turn !== 0 || busy) return;
    const card = g.hands[0].find((c) => c.id === id)!;
    if (!play(g, 0, card)) {
      beep("error");
      msg(
        g.firstTrick && !g.trick.length
          ? "You must lead the 2 of clubs."
          : g.trick.length && g.hands[0].some((c) => c.suit === g.trick[0].c.suit)
            ? "You must follow suit."
            : g.firstTrick && points(card)
              ? "You can't play a point card on the first trick."
              : "Hearts have not been broken yet.",
      );
      return;
    }
    render();
    void run();
  });
  $("[data-pass]").addEventListener("click", () => {
    if (g.phase === "pass" && !received.length && picked.length === 3) return passNow();
    if (received.length) {
      received = [];
      $("[data-pass]").hidden = true;
      render();
      void run();
    }
  });
  // F2 begins a new game (XP has no menu item for it)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "F2" || !win?.classList.contains("active") || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    if (!busy) newMatch();
  });

  /* ---------- Menus ---------- */
  function command(cmd: string) {
    if (cmd === "sound") {
      if (menu.isOn("sound") !== soundOn()) toggleSound();
    } else if (cmd === "score") void showSheet();
    else if (cmd === "options") {
      const d = $<HTMLDialogElement>("[data-options]");
      const f = d.querySelector("form")!;
      const field = (n: string) => f.elements.namedItem(n) as HTMLInputElement & RadioNodeList;
      field("speed").value = prefs.speed;
      for (const [i, n] of prefs.names.entries()) field(`n${i + 1}`).value = n;
      d.addEventListener(
        "close",
        () => {
          if (d.returnValue !== "ok") return;
          prefs.speed = field("speed").value as keyof typeof SPEED;
          prefs.names = prefs.names.map((n, i) => field(`n${i + 1}`).value.trim() || n);
          save(KEY, prefs);
          render();
        },
        { once: true },
      );
      d.returnValue = ""; // Esc would otherwise keep the last button pressed
      d.showModal();
    } else if (cmd === "help") $<HTMLDialogElement>("[data-help]").showModal();
    else if (cmd === "about") $<HTMLDialogElement>("[data-about]").showModal();
  }

  // XP asks your name when Hearts starts, then deals
  const welcome = $<HTMLDialogElement>("[data-welcome]");
  const who = welcome.querySelector("input")!;
  who.value = prefs.name;
  welcome.addEventListener(
    "close",
    () => {
      if (welcome.returnValue !== "ok") {
        win?.querySelector<HTMLElement>('[data-act="close"]')?.click();
        msg("Press F2 to begin.");
        return;
      }
      prefs.name = who.value.trim() || "You";
      save(KEY, prefs);
      newMatch();
    },
    { once: true },
  );
  render();
  welcome.showModal();
}
