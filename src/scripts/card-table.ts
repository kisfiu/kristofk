// The card table shared by Internet Hearts and Internet Spades: four seats, your hand, the trick, Last Trick,
// Auto-Play, a panel in the middle, the Score History dialog, the bots' turn loop, and timers that end with the game.
import { back, face } from "./card-art";
import { type Card, cardName } from "./cards";
import type { ZoneApi } from "./zone-ui";

export type Trick = { p: number; c: Card }[];
export const BOT_MS = 650;
const TRICK_MS = 1100;
export const esc = (s: string) => s.replace(/[<&"]/g, "");

/** A score table; the first cell of each row is its heading. */
export const sheet = (rows: string[][], head: string[]) =>
  `<table class="hz-sheet"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows
    .map(
      (r) =>
        `<tr><th>${esc(r[0])}</th>${r
          .slice(1)
          .map((v) => `<td>${v}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</table>`;

export interface TableOptions {
  /** The game state the table draws and the loop drives (Hearts and Spades share these fields). */
  g: { hands: Card[][]; trick: Trick; phase: string; turn: number };
  /** HTML at the left of the bar above the table. */
  top: string;
  /** More HTML laid over the table (Spades: the bid box). */
  extra?: string;
  /** An extra class for a seat's name (Spades: the team colour). */
  seatClass?: (p: number) => string;
  /** The seat's label; the nickname unless given. */
  title?: (p: number) => string;
  /** Shown after the name: the score, or tricks/bid. */
  stat: (p: number) => string;
  /** Card ids you may click now; the rest are dimmed. */
  playable: () => Set<number>;
  /** Card ids raised out of the hand, and the ones of them you picked. */
  raised: () => Set<number>;
  picked: () => Set<number>;
  /** Your cards face down (Spades, before Show Cards). */
  faceDown?: () => boolean;
  /** Auto-Play was switched on or off. */
  onAuto: (on: boolean) => void;
  /** The Score History table (Game ▸ Show Score). */
  history: () => string;
  /** The turn loop: a bot plays, the trick was collected, your turn came, the hand is over. */
  bot: (p: number) => void;
  collected?: () => void;
  yourTurn: () => void;
  handOver: () => Promise<void> | void;
}

export function cardTable(host: HTMLElement, api: ZoneApi, o: TableOptions) {
  const { g } = o;
  let stopped = false;
  let auto = false;
  let busy = false;
  let last: Trick = [];
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
  const seat = (p: number) => `<span class="hz-name ${o.seatClass?.(p) ?? ""}" data-name="${p}"></span>`;

  host.innerHTML = `
    <div class="rv-top">
      ${o.top}
      <span><button type="button" data-ih-last disabled>Last Trick</button> <button type="button" data-ih-auto aria-pressed="false">Auto-Play</button></span>
    </div>
    <div class="hz-table ih-table">
      ${[2, 1, 3].map((p) => `<div class="hz-seat hz-seat-${p}">${seat(p)}<div class="hz-backs" data-backs="${p}" aria-hidden="true"></div></div>`).join("")}
      <div class="hz-trick" data-trick role="group" aria-label="Cards on the table"></div>
      <div class="hz-seat hz-seat-0">
        <div class="hz-me">${seat(0)}<button type="button" class="hz-act" data-ih-act hidden></button></div>
        <div class="hz-hand" data-hand role="group" aria-label="Your hand"></div>
      </div>
      <div class="ih-panel" data-panel role="status" hidden></div>
      ${o.extra ?? ""}
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

  function render() {
    for (const p of [0, 1, 2, 3]) {
      const stat = o.stat(p);
      // the stat sits on its own line in the narrow side seats (see .ih-stat)
      $(`[data-name="${p}"]`).innerHTML =
        `${esc(o.title?.(p) ?? name(p))}${stat ? `<span class="ih-stat">${esc(stat)}</span>` : ""}`;
    }
    for (const p of [1, 2, 3])
      $(`[data-backs="${p}"]`).innerHTML = g.hands[p].map(() => `<span>${back("racka")}</span>`).join("");
    const ok = o.playable();
    const down = o.faceDown?.();
    $("[data-hand]").innerHTML = g.hands[0]
      .map((c) =>
        down
          ? `<span class="hz-card" aria-label="face-down card">${back("racka")}</span>`
          : `<button type="button" class="hz-card" data-card="${c.id}" aria-label="${cardName(c)}"${ok.has(c.id) ? "" : ' aria-disabled="true"'}>${face(c)}</button>`,
      )
      .join("");
    mark();
    $("[data-trick]").innerHTML = (showLast ? last : g.trick)
      .map(
        (t) =>
          `<div class="hz-played hz-at-${t.p}" aria-label="${esc(name(t.p))}: ${cardName(t.c)}">${face(t.c)}</div>`,
      )
      .join("");
    $("[data-trick]").classList.toggle("ih-last", showLast);
  }

  /** Raise the picked cards without redrawing the hand (a redraw would eat a double-click). */
  function mark() {
    const up = o.raised();
    const picked = o.picked();
    for (const b of host.querySelectorAll<HTMLElement>("[data-card]")) {
      const id = Number(b.dataset.card);
      b.classList.toggle("up", up.has(id));
      b.setAttribute("aria-pressed", String(picked.has(id)));
    }
  }

  /** The bots play until it's your turn, collecting tricks and ending the hand on the way. */
  async function run() {
    if (busy) return;
    busy = true;
    while (g.phase === "play") {
      if (g.turn === -1) {
        await sleep(TRICK_MS);
        last = g.trick.slice();
        o.collected?.();
        lastBtn.disabled = false;
        render();
        continue;
      }
      if (g.turn === 0) {
        busy = false;
        render();
        return o.yourTurn();
      }
      api.status(`Waiting for ${name(g.turn)} to play…`);
      await sleep(BOT_MS);
      o.bot(g.turn);
      render();
      // in a four-player game a leaving bot is replaced by a computer player and play goes on
      if (api.maybeLeave()) return;
    }
    busy = false;
    await o.handOver();
  }

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
    o.onAuto(auto);
  });
  // Game ▸ Show Score (sent by the Zone menu)
  host.addEventListener("zone-score", () => {
    $("[data-history-rows]").innerHTML = o.history();
    history.showModal();
  });

  return {
    $,
    act,
    name,
    later,
    sleep,
    render,
    mark,
    run,
    get auto() {
      return auto;
    },
    get busy() {
      return busy;
    },
    get stopped() {
      return stopped;
    },
    /** A new hand: forget the last trick. */
    newHand() {
      last = [];
      showLast = false;
      lastBtn.disabled = true;
    },
    /** You played a card: back to the trick on the table, and on with the game. */
    played() {
      showLast = false;
      act.hidden = true;
      render();
      void run();
    },
    show(html: string) {
      panel.innerHTML = html;
      panel.hidden = false;
    },
    hidePanel() {
      panel.hidden = true;
    },
    stop() {
      stopped = true;
      auto = false;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (history.open) history.close();
    },
  };
}
