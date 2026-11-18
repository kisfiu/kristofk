// Internet Reversi inside the KK Game Zone: Jenkins (Black) against GitLab CI (White).
import {
  BLACK,
  botMove,
  cellName,
  count,
  flips,
  moves,
  newBoard,
  nextTurn,
  other,
  play,
  type Side,
  WHITE,
} from "./reversi-logic";
import { load, save } from "./scores";
import { beep } from "./sound";
import type { ZoneApi } from "./zone-ui";

const KEY = "kk-zone-reversi";
const NAME: Record<Side, string> = { [BLACK]: "Jenkins (Black)", [WHITE]: "GitLab CI (White)" };
// our own glyphs: a butler's bow tie on Jenkins' stones, a three-stage pipeline on GitLab's
const GLYPH: Record<Side, string> = {
  [BLACK]: '<path d="M7 9l5 3-5 3zM17 9l-5 3 5 3z" fill="#eee"/><circle cx="12" cy="12" r="1.3" fill="#eee"/>',
  [WHITE]:
    '<path d="M6 12h12" stroke="#e8630a" stroke-width="1.6"/><circle cx="6" cy="12" r="2" fill="#e8630a"/><circle cx="12" cy="12" r="2" fill="#e8630a"/><circle cx="18" cy="12" r="2" fill="#fc6d26"/>',
};

export function startReversi(host: HTMLElement, api: ZoneApi): () => void {
  const prefs = load(KEY, { tell: true });
  const me: Side = Math.random() < 0.5 ? BLACK : WHITE;
  const bot = other(me);
  const opp = api.opponents[0];
  let b = newBoard();
  let turn: Side | null = BLACK;
  let done = false;
  let timer = 0;
  let focus = 19;

  host.innerHTML = `
    <div class="rv-top">
      <span class="rv-score" data-rv-score></span>
      <button type="button" data-rv-resign>Resign</button>
    </div>
    <div class="rv-board" role="grid" aria-label="Reversi board">${Array.from(
      { length: 8 },
      (_, r) =>
        `<div role="row">${Array.from({ length: 8 }, (_, c) => `<button type="button" role="gridcell" tabindex="-1" data-i="${r * 8 + c}"></button>`).join("")}</div>`,
    ).join("")}</div>
    <p class="rv-you">You play <b>${NAME[me]}</b> against ${opp.name} (${NAME[bot]}).</p>`;
  const cells = [...host.querySelectorAll<HTMLButtonElement>("[data-i]")];

  function render() {
    b.forEach((v, i) => {
      const c = cells[i];
      c.innerHTML = v
        ? `<svg viewBox="0 0 24 24" class="rv-stone rv-${v === BLACK ? "black" : "white"}"><circle cx="12" cy="12" r="10.5"/>${GLYPH[v as Side]}</svg>`
        : "";
      c.setAttribute("aria-label", `${cellName(i)}, ${v === BLACK ? "Jenkins" : v === WHITE ? "GitLab" : "empty"}`);
      c.tabIndex = i === focus ? 0 : -1;
    });
    host.querySelector("[data-rv-score]")!.textContent =
      `Jenkins (Black): ${count(b, BLACK)}   GitLab CI (White): ${count(b, WHITE)}`;
    if (done) return;
    api.status(turn === me ? "Your turn. Click a square to place a stone." : `${opp.name} is thinking…`);
  }

  function after(justMoved: Side) {
    const next = nextTurn(b, other(justMoved));
    if (next === null) return finish();
    // no legal move: the turn passes by itself
    if (next === justMoved) api.chat(null, `${justMoved === me ? opp.name : "You"} had no move, so the turn passed.`);
    turn = next;
    render();
    if (turn === bot) timer = window.setTimeout(botTurn, 600 + Math.random() * 900);
  }

  function botTurn() {
    if (done) return;
    const m = botMove(b, bot, api.skill);
    const flipped = flips(b, m, bot).length;
    b = play(b, m, bot)!;
    beep("knock");
    if (opp.chat && (m === 0 || m === 7 || m === 56 || m === 63) && Math.random() < 0.5) api.chat(opp, "Corner!");
    else if (opp.chat && flipped >= 5 && Math.random() < 0.4) api.chat(opp, "That's a lot of flips.");
    if (api.maybeLeave()) {
      done = true;
      return;
    }
    after(bot);
  }

  function finish() {
    done = true;
    turn = null;
    render();
    const nb = count(b, BLACK);
    const nw = count(b, WHITE);
    const head = nb === nw ? "Draw!" : nb > nw ? "Black Wins!" : "White Wins!";
    const mine = count(b, me);
    const theirs = count(b, bot);
    beep(mine > theirs ? "fanfare" : "thud");
    api.end(
      `${head} ${nb} to ${nw}.\n${mine > theirs ? "You win: pipeline green." : mine < theirs ? `${opp.name} wins.` : "Nobody wins."}`,
    );
  }

  async function tryMove(i: number, fromKeyboard: boolean) {
    if (done || turn !== me) return;
    const n = play(b, i, me);
    if (!n) {
      beep("error");
      // XP explains an illegal move (unless you ask it not to); from the keyboard it only beeps
      if (fromKeyboard || !prefs.tell) return;
      const d = host.closest(".ie")!.querySelector<HTMLDialogElement>("[data-zone-illegal]")!;
      const box = d.querySelector<HTMLInputElement>("[name=tell]")!;
      box.checked = prefs.tell;
      d.showModal();
      await new Promise((r) => d.addEventListener("close", r, { once: true }));
      prefs.tell = box.checked;
      save(KEY, prefs);
      return;
    }
    b = n;
    beep("knock");
    after(me);
  }

  host.querySelector(".rv-board")!.addEventListener("click", (e) => {
    const c = (e.target as Element).closest<HTMLElement>("[data-i]");
    if (c) void tryMove(Number(c.dataset.i), (e as MouseEvent).detail === 0);
  });
  host.querySelector(".rv-board")!.addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (!(k in step)) return;
    e.preventDefault();
    const n = focus + step[k];
    if (n < 0 || n > 63 || (Math.abs(step[k]) === 1 && Math.floor(n / 8) !== Math.floor(focus / 8))) return;
    focus = n;
    render();
    cells[focus].focus();
  });
  host.querySelector("[data-rv-resign]")!.addEventListener("click", async () => {
    if (done || (await api.ask("Internet Reversi", "Are you sure you want to resign?", ["Yes", "No"])) !== "Yes")
      return;
    done = true;
    clearTimeout(timer);
    api.end(`You resigned. ${opp.name} wins.`);
  });

  render();
  if (!moves(b, me).length || me === WHITE) timer = window.setTimeout(botTurn, 900);
  return () => {
    done = true;
    clearTimeout(timer);
  };
}
