// Internet Spades inside the KK Game Zone: XP's rules (spades-logic.ts), you and a bot partner (Team Gold) against
// two bots (Team Blue), on the shared card table (card-table.ts), plus blind Double Nil and bidding.
import { BOT_MS, cardTable, esc, sheet } from "./card-table";
import type { Card } from "./cards";
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
const PANEL_MS = 4000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function startSpades(host: HTMLElement, api: ZoneApi): () => void {
  const g: Spades = newGame();
  /** Your cards stay face down until you choose Show Cards or Double Nil. */
  let hidden = true;
  let picked: number | null = null;
  /** Answers the question in the ask box (Show Cards / Double Nil, or a bid). */
  let answer: ((v: string) => void) | null = null;
  /** What Auto-Play would answer to the waiting question. */
  let autoAnswer = () => "";
  const bidText = (p: number) =>
    g.bids[p] === NIL ? (g.blind[p] ? "Double Nil" : "Nil") : g.bids[p] === null ? "" : String(g.bids[p]);
  const members = (team: number) => (team === 0 ? `You and ${t.name(2)}` : `${t.name(1)} and ${t.name(3)}`);
  const nilText = (h: TeamHand) =>
    h.nils
      .map((n) => `${esc(t.name(n.p))}: ${n.blind ? "Double Nil" : "Nil"} ${n.made ? "made" : "failed"}`)
      .join(", ");

  const t = cardTable(host, api, {
    g,
    top: '<span class="isp-score" data-isp-score></span>',
    extra: '<div class="ih-panel" data-ask role="group" aria-label="Your bid" hidden></div>',
    seatClass: (p) => `isp-${TEAM[teamOf(p)].toLowerCase()}`,
    title: (p) => `${t.name(p)}${p === 2 ? " (partner)" : ""}`,
    stat: (p) => (g.bids[p] === null ? "" : `${g.tricks[p]}/${bidText(p)}`),
    playable: () => new Set(g.phase === "play" && g.turn === 0 && !t.busy ? legal(g, 0).map((c) => c.id) : []),
    raised: () => new Set(picked === null ? [] : [picked]),
    picked: () => new Set(picked === null ? [] : [picked]),
    faceDown: () => hidden,
    onAuto(on) {
      // answer a waiting question, or play if it's your turn
      if (!on) return;
      if (answer) t.later(() => answer?.(autoAnswer()), BOT_MS);
      else if (g.phase === "play" && g.turn === 0 && !t.busy) yourTurn();
    },
    history() {
      const cell = (x: TeamHand) =>
        `${x.tricks}/${x.contract}, ${x.points > 0 ? "+" : ""}${x.points}, ${plural(x.bags, "bag")}${x.nils.length ? `; ${nilText(x)}` : ""}`;
      return sheet(
        [
          ...g.history.map((h, i) => [`Hand ${i + 1}`, cell(h[0]), cell(h[1])]),
          ["Total", `${g.scores[0]} (${plural(g.bags[0], "bag")})`, `${g.scores[1]} (${plural(g.bags[1], "bag")})`],
        ],
        ["", `Gold: ${esc(members(0))}`, `Blue: ${esc(members(1))}`],
      );
    },
    bot(p) {
      const wasBroken = g.broken;
      play(g, p, botPlay(g, p, api.skill));
      if (!wasBroken && g.broken) beep("pop");
      score();
    },
    collected() {
      collect(g);
    },
    yourTurn,
    handOver,
  });
  const { $, act, name } = t;
  const askBox = $("[data-ask]");

  /** The bar above the table: team scores and their 0–9 bag counters. */
  function score() {
    const bags = (team: number) =>
      `<span class="isp-bags" title="${plural(g.bags[team], "bag")}" aria-label="${plural(g.bags[team], "bag")}">${"●".repeat(g.bags[team])}${"○".repeat(10 - g.bags[team])}</span>`;
    $("[data-isp-score]").innerHTML = [0, 1]
      .map((team) => `<b class="isp-${TEAM[team].toLowerCase()}">${TEAM[team]}</b> ${g.scores[team]} ${bags(team)}`)
      .join(" &nbsp; ");
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
      if (t.auto) t.later(() => answer?.(autoAnswer()), BOT_MS);
    });
  }

  /* ---------- Flow ---------- */
  async function deal() {
    dealHand(g);
    hidden = true;
    picked = null;
    t.newHand();
    act.hidden = true;
    t.render();
    score();
    api.status("New hand. Show your cards, or bid Double Nil without looking.");
    const blind =
      (await ask(
        "<p>Team Gold: you and your partner.<br>Bid Double Nil before you see your cards?</p>",
        ["Show Cards", "Double Nil"],
        () => "Show Cards",
      )) === "Double Nil";
    hidden = false;
    t.render();
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
        if (partner.chat && Math.random() < 0.25) t.later(() => api.chat(partner, "Nice bid, partner."), 900);
      } else {
        api.status(`Waiting for ${name(p)} to bid…`);
        await t.sleep(BOT_MS);
        bid(g, p, botBid(g, p, api.skill));
        api.chat(null, `${name(p)} bids ${bidText(p)}.`);
      }
      t.render();
    }
    api.status(`Team Gold bid ${g.bids[0]! + g.bids[2]!}, Team Blue ${g.bids[1]! + g.bids[3]!}.`);
    void t.run();
  }

  const bidSoFar = () =>
    [1, 2, 3]
      .filter((p) => g.bids[p] !== null)
      .map((p) => `${esc(name(p))} bid ${bidText(p)}.<br>`)
      .join("");

  function yourTurn() {
    picked = null;
    act.textContent = "Play";
    act.hidden = false;
    act.disabled = true;
    api.status(
      g.trick.length
        ? "Your turn. Double-click a card, or click it and press Play."
        : "Your lead. Double-click a card, or click it and press Play.",
    );
    if (t.auto) t.later(() => t.auto && g.turn === 0 && !t.busy && playCard(botPlay(g, 0)), BOT_MS);
  }

  function playCard(card: Card) {
    if (!play(g, 0, card)) {
      beep("error");
      api.status(g.trick.length ? "You must follow suit." : "Spades have not been broken yet.");
      return;
    }
    picked = null;
    t.played();
  }

  async function handOver() {
    const h = g.history[g.history.length - 1];
    const over = g.phase === "gameover";
    score();
    t.show(
      `<b>${over ? "Game Over" : "Hand Over"}</b>${sheet(
        [0, 1].map((team) => [
          `Team ${TEAM[team]}`,
          `${h[team].tricks}/${h[team].contract}`,
          `${h[team].points > 0 ? "+" : ""}${h[team].points}`,
          String(g.scores[team]),
          String(h[team].bags),
        ]),
        ["", "Tricks/Bid", "This hand", "Total", "Bags"],
      )}${[0, 1]
        .map((team) => nilText(h[team]))
        .filter(Boolean)
        .map((s) => `<p>${s}</p>`)
        .join("")}`,
    );
    api.status(over ? "Game over." : "Hand over. The next hand is being dealt…");
    const partner = api.opponents[1];
    if (!over && g.bags[0] >= 7 && partner.chat && Math.random() < 0.5) api.chat(partner, "Watch the bags!");
    await t.sleep(PANEL_MS);
    t.hidePanel();
    if (!over) return void deal();
    const won = g.winner === 0;
    beep(won ? "fanfare" : "thud");
    api.end(
      `${won ? "Team Gold wins! You and your partner did it." : `Team Blue wins: ${members(1)}.`}\n\nGold ${g.scores[0]}, Blue ${g.scores[1]}`,
    );
  }

  /* ---------- Input ---------- */
  $("[data-hand]").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!b || t.stopped || g.phase !== "play" || g.turn !== 0 || t.busy) return;
    const id = Number(b.dataset.card);
    const card = g.hands[0].find((c) => c.id === id)!;
    // the second click of a double-click plays the card
    if (e.detail >= 2 && picked === id) return playCard(card);
    picked = id;
    act.disabled = false;
    t.mark();
  });
  act.addEventListener("click", () => {
    const card = g.hands[0].find((c) => c.id === picked);
    if (card && g.turn === 0 && !t.busy) playCard(card);
  });
  askBox.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-v]");
    if (b) answer?.(b.dataset.v!);
  });

  void deal();
  return t.stop;
}
