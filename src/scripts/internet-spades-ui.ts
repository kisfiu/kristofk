// Internet Spades inside the KK Game Zone: XP's rules (spades-logic.ts), you and a bot partner (Team Gold) against
// two bots (Team Blue). Table, Last Trick, Auto-Play and panels as in Internet Hearts, plus blind Double Nil and bidding.
import { back, face } from "./card-art";
import { type Card, cardName } from "./cards";
import { beep } from "./sound";
import {
  bid,
  botBid,
  botPlay,
  collect,
  dealHand,
  legal,
  NIL,
  newGame,
  play,
  type Spades,
  type TeamHand,
  teamOf,
} from "./spades-logic";
import type { ZoneApi } from "./zone-ui";

const TEAM = ["Gold", "Blue"];
const BOT_MS = 650;
const TRICK_MS = 1100;
const PANEL_MS = 4000;
const esc = (s: string) => s.replace(/[<&"]/g, "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function startSpades(host: HTMLElement, api: ZoneApi): () => void {
  const g: Spades = newGame();
  let stopped = false;
  let busy = false;
  let auto = false;
  /** Your cards stay face down until you choose Show Cards or Double Nil. */
  let hidden = true;
  let picked: number | null = null;
  let last: Spades["trick"] = [];
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
  const bidText = (p: number) =>
    g.bids[p] === NIL ? (g.blind[p] ? "Double Nil" : "Nil") : g.bids[p] === null ? "" : String(g.bids[p]);
  const members = (t: number) => (t === 0 ? `You and ${name(2)}` : `${name(1)} and ${name(3)}`);

  host.innerHTML = `
    <div class="rv-top">
      <span class="isp-score" data-isp-score></span>
      <span><button type="button" data-ih-last disabled>Last Trick</button> <button type="button" data-ih-auto aria-pressed="false">Auto-Play</button></span>
    </div>
    <div class="hz-table ih-table">
      ${[2, 1, 3].map((s) => `<div class="hz-seat hz-seat-${s}"><span class="hz-name isp-${TEAM[teamOf(s)].toLowerCase()}" data-name="${s}"></span><div class="hz-backs" data-backs="${s}" aria-hidden="true"></div></div>`).join("")}
      <div class="hz-trick" data-trick role="group" aria-label="Cards on the table"></div>
      <div class="hz-seat hz-seat-0">
        <div class="hz-me"><span class="hz-name isp-gold" data-name="0"></span><button type="button" class="hz-act" data-ih-act hidden>Play</button></div>
        <div class="hz-hand" data-hand role="group" aria-label="Your hand"></div>
      </div>
      <div class="ih-panel" data-panel role="status" hidden></div>
      <div class="ih-panel" data-ask role="group" aria-label="Your bid" hidden></div>
    </div>
    <dialog class="xp-dialog" data-history aria-labelledby="isp-hist-t">
      <div class="xp-dtitle" id="isp-hist-t">Score History</div>
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
  const askBox = $("[data-ask]");
  const history = $<HTMLDialogElement>("[data-history]");
  /** Answers the question in the ask box (Show Cards / Double Nil, or a bid). */
  let answer: ((v: string) => void) | null = null;
  /** What Auto-Play would answer to the waiting question. */
  let autoAnswer = () => "";

  /* ---------- Drawing ---------- */
  const bags = (t: number) =>
    `<span class="isp-bags" title="${plural(g.bags[t], "bag")}" aria-label="${plural(g.bags[t], "bag")}">${"●".repeat(g.bags[t])}${"○".repeat(10 - g.bags[t])}</span>`;

  function render() {
    for (const p of [0, 1, 2, 3])
      $(`[data-name="${p}"]`).textContent =
        `${name(p)}${p === 2 ? " (partner)" : ""}${g.bids[p] === null ? "" : ` · ${g.tricks[p]}/${bidText(p)}`}`;
    $("[data-isp-score]").innerHTML = [0, 1]
      .map((t) => `<b class="isp-${TEAM[t].toLowerCase()}">${TEAM[t]}</b> ${g.scores[t]} ${bags(t)}`)
      .join(" &nbsp; ");
    for (const p of [1, 2, 3])
      $(`[data-backs="${p}"]`).innerHTML = g.hands[p].map(() => `<span>${back("racka")}</span>`).join("");
    const ok = new Set(g.phase === "play" && g.turn === 0 && !busy ? legal(g, 0).map((c) => c.id) : []);
    $("[data-hand]").innerHTML = g.hands[0]
      .map((c) =>
        hidden
          ? `<span class="hz-card" aria-label="face-down card">${back("racka")}</span>`
          : `<button type="button" class="hz-card" data-card="${c.id}" aria-label="${cardName(c)}"${ok.has(c.id) ? "" : ' aria-disabled="true"'}>${face(c)}</button>`,
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

  /** Raise the clicked card without redrawing the hand (a redraw would eat a double-click). */
  function mark() {
    for (const b of host.querySelectorAll<HTMLElement>("[data-card]")) {
      b.classList.toggle("up", Number(b.dataset.card) === picked);
      b.setAttribute("aria-pressed", String(Number(b.dataset.card) === picked));
    }
  }

  /** Ask with buttons inside the table; Auto-Play answers with `byComputer()`. */
  function ask(html: string, buttons: string[], byComputer: () => string): Promise<string> {
    askBox.innerHTML = `${html}<div class="isp-buttons">${buttons.map((b) => `<button type="button" data-v="${b}">${b}</button>`).join("")}</div>`;
    askBox.hidden = false;
    return new Promise((done) => {
      answer = (v) => {
        answer = null;
        askBox.hidden = true;
        done(v);
      };
      autoAnswer = byComputer;
      if (auto) later(() => answer?.(autoAnswer()), BOT_MS);
    });
  }

  /* ---------- Flow ---------- */
  async function deal() {
    dealHand(g);
    hidden = true;
    picked = null;
    last = [];
    lastBtn.disabled = true;
    act.hidden = true;
    render();
    api.status("New hand. Show your cards, or bid Double Nil without looking.");
    const blind =
      (await ask(
        "<p>Team Gold: you and your partner.<br>Bid Double Nil before you see your cards?</p>",
        ["Show Cards", "Double Nil"],
        () => "Show Cards",
      )) === "Double Nil";
    hidden = false;
    render();
    await bidding(blind);
  }

  async function bidding(blind: boolean) {
    while (g.phase === "bid") {
      const p = g.turn;
      if (p === 0) {
        let n = NIL;
        if (!blind) {
          const v = await ask(
            `<p>${bidSoFar()}How many tricks will you take?</p>`,
            ["Nil", ...Array.from({ length: 13 }, (_, i) => String(i + 1))],
            () => {
              const b = botBid(g, 0);
              return b === NIL ? "Nil" : String(b);
            },
          );
          n = v === "Nil" ? NIL : Number(v);
        }
        bid(g, 0, n, blind);
        const partner = api.opponents[1];
        if (partner.chat && Math.random() < 0.25) later(() => api.chat(partner, "Nice bid, partner."), 900);
      } else {
        api.status(`Waiting for ${name(p)} to bid…`);
        await sleep(BOT_MS);
        bid(g, p, botBid(g, p, api.skill));
        api.chat(null, `${name(p)} bids ${bidText(p)}.`);
      }
      render();
    }
    api.status(`Team Gold bid ${g.bids[0]! + g.bids[2]!}, Team Blue ${g.bids[1]! + g.bids[3]!}.`);
    void run();
  }

  const bidSoFar = () =>
    [1, 2, 3]
      .filter((p) => g.bids[p] !== null)
      .map((p) => `${esc(name(p))} bid ${bidText(p)}.<br>`)
      .join("");

  /** The bots play until it's your turn, collecting tricks and scoring the hand on the way. */
  async function run() {
    if (busy) return;
    busy = true;
    while (g.phase === "play") {
      if (g.turn === -1) {
        await sleep(TRICK_MS);
        last = g.trick.slice();
        collect(g);
        lastBtn.disabled = false;
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
      if (!wasBroken && g.broken) beep("pop");
      render();
      // in a four-player game a leaving bot is replaced by a computer player and play goes on
      if (api.maybeLeave()) return;
    }
    busy = false;
    await handOver();
  }

  function yourTurn() {
    picked = null;
    act.hidden = false;
    act.disabled = true;
    api.status(
      g.trick.length
        ? "Your turn. Double-click a card, or click it and press Play."
        : "Your lead. Double-click a card, or click it and press Play.",
    );
    if (auto) later(() => auto && g.turn === 0 && !busy && playCard(botPlay(g, 0)), BOT_MS);
  }

  function playCard(card: Card) {
    if (!play(g, 0, card)) {
      beep("error");
      api.status(g.trick.length ? "You must follow suit." : "Spades have not been broken yet.");
      return;
    }
    picked = null;
    act.hidden = true;
    showLast = false;
    render();
    void run();
  }

  const nilText = (h: TeamHand) =>
    h.nils.map((n) => `${esc(name(n.p))}: ${n.blind ? "Double Nil" : "Nil"} ${n.made ? "made" : "failed"}`).join(", ");

  async function handOver() {
    const h = g.history[g.history.length - 1];
    const over = g.phase === "gameover";
    show(
      `<b>${over ? "Game Over" : "Hand Over"}</b>${table(
        [0, 1].map((t) => [
          `Team ${TEAM[t]}`,
          `${h[t].tricks}/${h[t].contract}`,
          `${h[t].points > 0 ? "+" : ""}${h[t].points}`,
          String(g.scores[t]),
          String(h[t].bags),
        ]),
        ["", "Tricks/Bid", "This hand", "Total", "Bags"],
      )}${[0, 1]
        .map((t) => nilText(h[t]))
        .filter(Boolean)
        .map((s) => `<p>${s}</p>`)
        .join("")}`,
    );
    api.status(over ? "Game over." : "Hand over. The next hand is being dealt…");
    const partner = api.opponents[1];
    if (!over && g.bags[0] >= 7 && partner.chat && Math.random() < 0.5) api.chat(partner, "Watch the bags!");
    await sleep(PANEL_MS);
    panel.hidden = true;
    if (!over) return void deal();
    const won = g.winner === 0;
    beep(won ? "fanfare" : "thud");
    api.end(
      `${won ? "Team Gold wins! You and your partner did it." : `Team Blue wins: ${members(1)}.`}\n\nGold ${g.scores[0]}, Blue ${g.scores[1]}`,
    );
  }

  function show(html: string) {
    panel.innerHTML = html;
    panel.hidden = false;
  }

  const table = (rows: string[][], head: string[]) =>
    `<table class="hz-sheet"><tr>${head.map((x) => `<th>${x}</th>`).join("")}</tr>${rows
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
    if (!b || stopped || g.phase !== "play" || g.turn !== 0 || busy) return;
    const id = Number(b.dataset.card);
    const card = g.hands[0].find((c) => c.id === id)!;
    // the second click of a double-click plays the card
    if (e.detail >= 2 && picked === id) return playCard(card);
    picked = id;
    act.disabled = false;
    mark();
  });
  act.addEventListener("click", () => {
    const card = g.hands[0].find((c) => c.id === picked);
    if (card && g.turn === 0 && !busy) playCard(card);
  });
  askBox.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-v]");
    if (b) answer?.(b.dataset.v!);
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
    api.status(auto ? "Auto-Play is on: the computer bids and plays your cards." : "Auto-Play is off.");
    if (!auto) return;
    // answer a waiting question, or play if it's your turn
    if (answer) later(() => answer?.(autoAnswer()), BOT_MS);
    else if (g.phase === "play" && g.turn === 0 && !busy) yourTurn();
  });
  // Game ▸ Show Score (sent by the Zone menu): tricks/bid, points, bags and nils per hand
  host.addEventListener("zone-score", () => {
    const cell = (x: TeamHand) =>
      `${x.tricks}/${x.contract}, ${x.points > 0 ? "+" : ""}${x.points}, ${plural(x.bags, "bag")}${x.nils.length ? `; ${nilText(x)}` : ""}`;
    $("[data-history-rows]").innerHTML = table(
      [
        ...g.history.map((h, i) => [`Hand ${i + 1}`, cell(h[0]), cell(h[1])]),
        ["Total", `${g.scores[0]} (${plural(g.bags[0], "bag")})`, `${g.scores[1]} (${plural(g.bags[1], "bag")})`],
      ],
      ["", `Gold: ${esc(members(0))}`, `Blue: ${esc(members(1))}`],
    );
    history.showModal();
  });

  void deal();
  return () => {
    stopped = true;
    auto = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (history.open) history.close();
  };
}
