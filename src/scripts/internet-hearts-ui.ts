// Internet Hearts inside the KK Game Zone: offline Hearts' rules and bots (hearts-logic.ts) with XP's Internet
// extras: nickname seats, Last Trick, Auto-Play, Score History, a moon banner, and panels that close by themselves.
import { back, face } from "./card-art";
import { type Card, cardName } from "./cards";
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
  passTo,
  places,
  play,
  points,
} from "./hearts-logic";
import { beep } from "./sound";
import type { ZoneApi } from "./zone-ui";

const PLACE = ["First Place", "Second Place", "Third Place", "Last Place"];
const BOT_MS = 650;
const TRICK_MS = 1100;
const PANEL_MS = 3500;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[<&"]/g, "");

export function startHearts(host: HTMLElement, api: ZoneApi): () => void {
  const g: Hearts = newGame();
  let stopped = false;
  let busy = false;
  let auto = false;
  /** Passing: the cards picked (up to three). Playing: the card clicked, waiting for Play. */
  let picked: number[] = [];
  let received: number[] = [];
  let last: Hearts["trick"] = [];
  let showLast = false;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  // after stop() the pending timer is cleared, so the promise never settles and the game loop just ends
  const sleep = (ms: number) => new Promise<void>((r) => later(r, ms));
  const name = (p: number) => (p === 0 ? api.me.name : api.opponents[p - 1].name);
  const has = (p: number) => (p ? `${name(p)} has` : "You have");

  host.innerHTML = `
    <div class="rv-top">
      <span data-ih-info></span>
      <span><button type="button" data-ih-last disabled>Last Trick</button> <button type="button" data-ih-auto aria-pressed="false">Auto-Play</button></span>
    </div>
    <div class="hz-table ih-table">
      ${[2, 1, 3].map((s) => `<div class="hz-seat hz-seat-${s}"><span class="hz-name" data-name="${s}"></span><div class="hz-backs" data-backs="${s}" aria-hidden="true"></div></div>`).join("")}
      <div class="hz-trick" data-trick role="group" aria-label="Cards on the table"></div>
      <div class="hz-seat hz-seat-0">
        <div class="hz-me"><span class="hz-name" data-name="0"></span><button type="button" class="hz-act" data-ih-act hidden></button></div>
        <div class="hz-hand" data-hand role="group" aria-label="Your hand"></div>
      </div>
      <div class="ih-panel" data-panel role="status" hidden></div>
    </div>
    <dialog class="xp-dialog" data-history aria-labelledby="ih-hist-t">
      <div class="xp-dtitle" id="ih-hist-t">Score History</div>
      <form method="dialog" class="xp-dialog-body">
        <div data-history-rows></div>
        <div class="xp-dialog-buttons"><button value="ok">OK</button></div>
      </form>
    </dialog>`;
  const $ = <T extends Element = HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const act = $<HTMLButtonElement>("[data-ih-act]");
  const lastBtn = $<HTMLButtonElement>("[data-ih-last]");
  const autoBtn = $<HTMLButtonElement>("[data-ih-auto]");
  const panel = $("[data-panel]");
  const history = $<HTMLDialogElement>("[data-history]");

  /* ---------- Drawing ---------- */
  function render() {
    for (const p of [0, 1, 2, 3]) $(`[data-name="${p}"]`).textContent = `${name(p)} · ${g.scores[p]}`;
    for (const p of [1, 2, 3])
      $(`[data-backs="${p}"]`).innerHTML = g.hands[p].map(() => `<span>${back("racka")}</span>`).join("");
    const mine = g.phase === "play" && g.turn === 0 && !busy;
    const ok = new Set(mine ? legal(g, 0).map((c) => c.id) : []);
    const passing = g.phase === "pass" && !received.length;
    $("[data-hand]").innerHTML = g.hands[0]
      .map(
        (c) =>
          `<button type="button" class="hz-card" data-card="${c.id}" aria-label="${cardName(c)}"${passing || ok.has(c.id) ? "" : ' aria-disabled="true"'}>${face(c)}</button>`,
      )
      .join("");
    mark();
    const shown = showLast ? last : g.trick;
    $("[data-trick]").innerHTML = shown
      .map(
        (t) =>
          `<div class="hz-played hz-at-${t.p}" aria-label="${esc(name(t.p))}: ${cardName(t.c)}">${face(t.c)}</div>`,
      )
      .join("");
    $("[data-trick]").classList.toggle("ih-last", showLast);
  }

  /** Raise the picked or received cards without redrawing the hand (a redraw would eat a double-click). */
  function mark() {
    for (const b of host.querySelectorAll<HTMLElement>("[data-card]")) {
      const id = Number(b.dataset.card);
      const up = picked.includes(id) || received.includes(id);
      b.classList.toggle("up", up);
      b.setAttribute("aria-pressed", String(picked.includes(id)));
    }
  }

  function button(text: string, enabled: boolean) {
    act.textContent = text;
    act.hidden = false;
    act.disabled = !enabled;
  }

  /* ---------- Flow ---------- */
  function deal() {
    dealHand(g);
    picked = [];
    received = [];
    last = [];
    lastBtn.disabled = true;
    if (g.phase === "pass") {
      const dir = passOf(g.hand);
      $("[data-ih-info]").textContent = `Pass three cards to ${name(passTo(0, dir))}.`;
      button(`Pass ${cap(dir)}`, false);
      api.status(`Select three cards to pass ${dir}.`);
      render();
      autoMove();
    } else {
      $("[data-ih-info]").textContent = "No passing this hand.";
      act.hidden = true;
      render();
      void run();
    }
    const o = api.opponents[Math.floor(Math.random() * 3)];
    if (o.chat && Math.random() < 0.15) api.chat(o, Math.random() < 0.5 ? "Who has the Queen?" : "Good luck!");
  }

  function passNow() {
    const before = new Set(g.hands[0].map((c) => c.id));
    const mine = g.hands[0].filter((c) => picked.includes(c.id));
    pass(g, [mine, botPass(g.hands[1]), botPass(g.hands[2]), botPass(g.hands[3])]);
    picked = [];
    received = g.hands[0].filter((c) => !before.has(c.id)).map((c) => c.id);
    button("OK", true);
    api.status("These are the cards passed to you. Press OK to accept them.");
    render();
    autoMove();
  }

  function accept() {
    received = [];
    act.hidden = true;
    $("[data-ih-info]").textContent = "";
    render();
    void run();
  }

  /** The bots play until it's your turn, collecting tricks and scoring the hand on the way. */
  async function run() {
    if (busy) return;
    busy = true;
    while (g.phase === "play") {
      if (g.turn === -1) {
        await sleep(TRICK_MS);
        last = g.trick.slice();
        const queen = g.trick.some((t) => t.c.suit === "S" && t.c.rank === 12);
        const w = collect(g);
        lastBtn.disabled = false;
        const o = api.opponents[w - 1];
        if (queen && o?.chat && Math.random() < 0.5)
          api.chat(o, ["Argh!", "Uh-oh.", ":-("][Math.floor(Math.random() * 3)]);
        render();
        continue;
      }
      if (g.turn === 0) {
        busy = false;
        render();
        return yourTurn();
      }
      api.status(`Waiting for ${name(g.turn)} to play…`);
      await sleep(BOT_MS);
      const p = g.turn;
      const wasBroken = g.broken;
      play(g, p, botPlay(g, p, api.skill));
      if (!wasBroken && g.broken) {
        beep("pop");
        const o = api.opponents[p % 3]; // the next player along complains
        if (o.chat && Math.random() < 0.3) api.chat(o, "No hearts, please.");
      }
      render();
      // in a four-player game a leaving bot is replaced by a computer player and play goes on
      if (api.maybeLeave()) return;
    }
    busy = false;
    await handOver();
  }

  function yourTurn() {
    picked = [];
    button("Play", false);
    api.status(
      g.firstTrick && !g.trick.length
        ? "Your turn: lead the 2 of clubs."
        : "Your turn. Double-click a card, or click it and press Play.",
    );
    autoMove();
  }

  /** Auto-Play: the computer passes, accepts and plays your cards for you. */
  function autoMove() {
    if (!auto || stopped) return;
    later(() => {
      if (!auto) return;
      if (g.phase === "pass" && !received.length) {
        picked = botPass(g.hands[0]).map((c) => c.id);
        passNow();
      } else if (received.length) accept();
      else if (g.phase === "play" && g.turn === 0 && !busy) playCard(botPlay(g, 0));
    }, BOT_MS);
  }

  function playCard(card: Card) {
    if (!play(g, 0, card)) {
      beep("error");
      api.status(
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
    picked = [];
    act.hidden = true;
    showLast = false;
    render();
    void run();
  }

  async function handOver() {
    if (g.moon >= 0) {
      beep("fanfare");
      show(`<b class="ih-moon">${esc(has(g.moon))} shot the moon!</b>`);
      for (const o of api.opponents)
        if (o.chat && o !== api.opponents[g.moon - 1] && Math.random() < 0.4) api.chat(o, "Whew!");
      await sleep(2200);
    }
    const hand = g.sheet[g.sheet.length - 1];
    show(
      `<b>${g.phase === "gameover" ? "Game Over" : "Hand Over"}</b>${table(
        [0, 1, 2, 3].map((p) => [name(p), String(hand[p]), String(g.scores[p])]),
        ["", "This hand", "Total"],
      )}`,
    );
    api.status(g.phase === "gameover" ? "Game over." : "Hand over. The next hand is being dealt…");
    await sleep(PANEL_MS);
    panel.hidden = true;
    if (g.phase !== "gameover") return deal();
    const pl = places(g);
    const order = [0, 1, 2, 3].sort((a, b) => g.scores[a] - g.scores[b]);
    const placings = order.map((p) => `${PLACE[pl[p]]}: ${name(p)} (${g.scores[p]})`).join("\n");
    beep(pl[0] === 0 ? "fanfare" : "thud");
    act.hidden = true;
    api.end(`${pl[0] === 0 ? "You win!" : `${name(order[0])} wins.`}\n\n${placings}`);
  }

  function show(html: string) {
    panel.innerHTML = html;
    panel.hidden = false;
  }

  const table = (rows: string[][], head: string[]) =>
    `<table class="hz-sheet"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows
      .map(
        (r) =>
          `<tr><th>${esc(r[0])}</th>${r
            .slice(1)
            .map((v) => `<td>${v}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</table>`;

  /* ---------- Input ---------- */
  $("[data-hand]").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!b || stopped) return;
    const id = Number(b.dataset.card);
    if (g.phase === "pass" && !received.length) {
      picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked;
      act.disabled = picked.length !== 3;
      return mark();
    }
    if (g.phase !== "play" || g.turn !== 0 || busy || received.length) return;
    const card = g.hands[0].find((c) => c.id === id)!;
    // the second click of a double-click plays the card
    if (e.detail >= 2 && picked[0] === id) return playCard(card);
    picked = [id];
    act.disabled = false;
    mark();
  });
  act.addEventListener("click", () => {
    if (g.phase === "pass" && !received.length && picked.length === 3) return passNow();
    if (received.length) return accept();
    const card = g.hands[0].find((c) => c.id === picked[0]);
    if (card && g.turn === 0 && !busy) playCard(card);
  });
  lastBtn.addEventListener("click", () => {
    showLast = true;
    render();
    api.status("The last trick. It goes away in a moment.");
    later(() => {
      showLast = false;
      render();
    }, 2500);
  });
  autoBtn.addEventListener("click", () => {
    auto = !auto;
    autoBtn.textContent = auto ? "Stop" : "Auto-Play";
    autoBtn.setAttribute("aria-pressed", String(auto));
    api.status(auto ? "Auto-Play is on: the computer plays your cards." : "Auto-Play is off.");
    autoMove();
  });
  // Game ▸ Show Score (sent by the Zone menu)
  host.addEventListener("zone-score", () => {
    $("[data-history-rows]").innerHTML = table(
      [...g.sheet.map((h, i) => [`Hand ${i + 1}`, ...h.map(String)]), ["Total", ...g.scores.map(String)]],
      ["", ...[0, 1, 2, 3].map((p) => esc(name(p)))],
    );
    history.showModal();
  });

  deal();
  return () => {
    stopped = true;
    auto = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (history.open) history.close();
  };
}
