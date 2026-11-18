// Internet Hearts inside the KK Game Zone: offline Hearts' rules and bots (hearts-logic.ts) on the shared card table
// (card-table.ts): nickname seats, Last Trick, Auto-Play, Score History, a moon banner, self-closing panels.
import { BOT_MS, cardTable, esc, sheet } from "./card-table";
import type { Card } from "./cards";
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
const PANEL_MS = 3500;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function startHearts(host: HTMLElement, api: ZoneApi): () => void {
  const g: Hearts = newGame();
  /** Passing: the cards picked (up to three). Playing: the card clicked, waiting for Play. */
  let picked: number[] = [];
  let received: number[] = [];

  const t = cardTable(host, api, {
    g,
    top: "<span data-ih-info></span>",
    stat: (p) => String(g.scores[p]),
    playable: () =>
      new Set(
        g.phase === "pass" && !received.length
          ? g.hands[0].map((c) => c.id)
          : g.phase === "play" && g.turn === 0 && !t.busy
            ? legal(g, 0).map((c) => c.id)
            : [],
      ),
    raised: () => new Set([...picked, ...received]),
    picked: () => new Set(picked),
    onAuto: () => autoMove(),
    history: () =>
      sheet(
        [...g.sheet.map((h, i) => [`Hand ${i + 1}`, ...h.map(String)]), ["Total", ...g.scores.map(String)]],
        ["", ...[0, 1, 2, 3].map((p) => esc(t.name(p)))],
      ),
    bot(p) {
      const wasBroken = g.broken;
      play(g, p, botPlay(g, p, api.skill));
      if (!wasBroken && g.broken) {
        beep("pop");
        const o = api.opponents[p % 3]; // the next player along complains
        if (o.chat && Math.random() < 0.3) api.chat(o, "No hearts, please.");
      }
    },
    collected() {
      const queen = g.trick.some((c) => c.c.suit === "S" && c.c.rank === 12);
      const o = api.opponents[collect(g) - 1];
      if (queen && o?.chat && Math.random() < 0.5)
        api.chat(o, ["Argh!", "Uh-oh.", ":-("][Math.floor(Math.random() * 3)]);
    },
    yourTurn() {
      picked = [];
      button("Play", false);
      api.status(
        g.firstTrick && !g.trick.length
          ? "Your turn: lead the 2 of clubs."
          : "Your turn. Double-click a card, or click it and press Play.",
      );
      autoMove();
    },
    handOver,
  });
  const { $, act } = t;
  const name = t.name;
  const has = (p: number) => (p ? `${name(p)} has` : "You have");

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
    t.newHand();
    if (g.phase === "pass") {
      const dir = passOf(g.hand);
      $("[data-ih-info]").textContent = `Pass three cards to ${name(passTo(0, dir))}.`;
      button(`Pass ${cap(dir)}`, false);
      api.status(`Select three cards to pass ${dir}.`);
      t.render();
      autoMove();
    } else {
      $("[data-ih-info]").textContent = "No passing this hand.";
      act.hidden = true;
      t.render();
      void t.run();
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
    t.render();
    autoMove();
  }

  function accept() {
    received = [];
    act.hidden = true;
    $("[data-ih-info]").textContent = "";
    t.render();
    void t.run();
  }

  /** Auto-Play: the computer passes, accepts and plays your cards for you. */
  function autoMove() {
    if (!t.auto || t.stopped) return;
    t.later(() => {
      if (!t.auto) return;
      if (g.phase === "pass" && !received.length) {
        picked = botPass(g.hands[0]).map((c) => c.id);
        passNow();
      } else if (received.length) accept();
      else if (g.phase === "play" && g.turn === 0 && !t.busy) playCard(botPlay(g, 0));
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
    t.played();
  }

  async function handOver() {
    if (g.moon >= 0) {
      beep("fanfare");
      t.show(`<b class="ih-moon">${esc(has(g.moon))} shot the moon!</b>`);
      for (const o of api.opponents)
        if (o.chat && o !== api.opponents[g.moon - 1] && Math.random() < 0.4) api.chat(o, "Whew!");
      await t.sleep(2200);
    }
    const hand = g.sheet[g.sheet.length - 1];
    t.show(
      `<b>${g.phase === "gameover" ? "Game Over" : "Hand Over"}</b>${sheet(
        [0, 1, 2, 3].map((p) => [name(p), String(hand[p]), String(g.scores[p])]),
        ["", "This hand", "Total"],
      )}`,
    );
    api.status(g.phase === "gameover" ? "Game over." : "Hand over. The next hand is being dealt…");
    await t.sleep(PANEL_MS);
    t.hidePanel();
    if (g.phase !== "gameover") return deal();
    const pl = places(g);
    const order = [0, 1, 2, 3].sort((a, b) => g.scores[a] - g.scores[b]);
    const placings = order.map((p) => `${PLACE[pl[p]]}: ${name(p)} (${g.scores[p]})`).join("\n");
    beep(pl[0] === 0 ? "fanfare" : "thud");
    act.hidden = true;
    api.end(`${pl[0] === 0 ? "You win!" : `${name(order[0])} wins.`}\n\n${placings}`);
  }

  /* ---------- Input ---------- */
  $("[data-hand]").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!b || t.stopped) return;
    const id = Number(b.dataset.card);
    if (g.phase === "pass" && !received.length) {
      picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked;
      act.disabled = picked.length !== 3;
      return t.mark();
    }
    if (g.phase !== "play" || g.turn !== 0 || t.busy || received.length) return;
    const card = g.hands[0].find((c) => c.id === id)!;
    // the second click of a double-click plays the card
    if (e.detail >= 2 && picked[0] === id) return playCard(card);
    picked = [id];
    act.disabled = false;
    t.mark();
  });
  act.addEventListener("click", () => {
    if (g.phase === "pass" && !received.length && picked.length === 3) return passNow();
    if (received.length) return accept();
    const card = g.hands[0].find((c) => c.id === picked[0]);
    if (card && g.turn === 0 && !t.busy) playCard(card);
  });

  deal();
  return t.stop;
}
