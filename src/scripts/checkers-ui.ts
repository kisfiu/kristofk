// Internet Checkers inside the KK Game Zone: Debrecen (Red) against Budapest (White).
import {
  acceptsDraw,
  botMove,
  isKing,
  lost,
  type Move,
  moves,
  newBoard,
  other,
  play,
  RED,
  type Side,
  sideOf,
  WHITE,
} from "./checkers-logic";
import { beep } from "./sound";
import type { ZoneApi } from "./zone-ui";

const NAME: Record<Side, string> = { [RED]: "Debrecen (Red)", [WHITE]: "Budapest (White)" };
const CROWN = '<path d="M7 15l-1-6 3.5 3L12 7l2.5 5L18 9l-1 6z" fill="#f2c230" stroke="#8a6a20" stroke-width=".6"/>';
const piece = (v: number) =>
  `<svg viewBox="0 0 24 24" class="ck-piece ck-${sideOf(v) === RED ? "red" : "white"}"><circle cx="12" cy="12" r="10.5"/><circle cx="12" cy="12" r="7" class="ring"/>${isKing(v) ? CROWN : ""}</svg>`;

export function startCheckers(host: HTMLElement, api: ZoneApi): () => void {
  const me: Side = Math.random() < 0.5 ? RED : WHITE;
  const bot = other(me);
  const opp = api.opponents[0];
  // your pieces are always at the bottom of the board
  const flip = me === WHITE;
  const view = (i: number) => (flip ? 63 - i : i);
  let b = newBoard();
  let turn: Side = RED;
  let done = false;
  let timer = 0;
  let path: number[] = [];
  let drawOffer = false;
  let focus = view(40);

  host.innerHTML = `
    <div class="rv-top">
      <span class="rv-score" data-ck-score></span>
      <span><button type="button" data-ck-draw aria-pressed="false">Offer Draw</button> <button type="button" data-ck-resign>Resign</button></span>
    </div>
    <div class="ck-board" role="grid" aria-label="Checkers board">${Array.from(
      { length: 8 },
      (_, r) =>
        `<div role="row">${Array.from({ length: 8 }, (_, c) => `<button type="button" role="gridcell" tabindex="-1" class="${(r + c) % 2 ? "dark" : "light"}" data-v="${r * 8 + c}"></button>`).join("")}</div>`,
    ).join("")}<div class="ck-ghost" data-ck-ghost hidden></div></div>
    <p class="rv-you">You play <b>${NAME[me]}</b> against ${opp.name} (${NAME[bot]}). Red moves first.</p>`;
  const cells = [...host.querySelectorAll<HTMLButtonElement>("[data-v]")];
  const ghost = host.querySelector<HTMLElement>("[data-ck-ghost]")!;
  const boardEl = host.querySelector<HTMLElement>(".ck-board")!;

  /** The board with your unfinished multi-jump shown: the piece on its last square, the jumped pieces gone. */
  function shown() {
    if (path.length < 2) return b;
    const n = b.slice();
    n[path[path.length - 1]] = n[path[0]];
    n[path[0]] = 0;
    for (let k = 1; k < path.length; k++) n[(path[k] + path[k - 1]) / 2] = 0;
    return n;
  }
  const matching = () => moves(b, me).filter((m) => path.every((p, k) => m.path[k] === p));

  function render() {
    const s = shown();
    for (const c of cells) {
      const i = flip ? 63 - Number(c.dataset.v) : Number(c.dataset.v);
      const v = s[i];
      c.innerHTML = v ? piece(v) : "";
      c.classList.toggle("sel", path.length > 0 && i === path[path.length - 1]);
      c.tabIndex = Number(c.dataset.v) === focus ? 0 : -1;
      const name = `${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}`;
      c.setAttribute(
        "aria-label",
        `${name}, ${v ? `${sideOf(v) === RED ? "Debrecen" : "Budapest"}${isKing(v) ? " king" : ""}` : "empty"}`,
      );
    }
    const n = (side: Side) => b.filter((v) => sideOf(v) === side).length;
    host.querySelector("[data-ck-score]")!.textContent = `Debrecen (Red): ${n(RED)}   Budapest (White): ${n(WHITE)}`;
    if (!done)
      api.status(
        turn === me
          ? path.length
            ? "Keep jumping: click the next square."
            : "Your turn. Click a piece, then where it goes."
          : `${opp.name} is thinking…`,
      );
  }

  function finish(text: string, win: boolean | null) {
    done = true;
    clearTimeout(timer);
    render();
    beep(win ? "fanfare" : win === false ? "thud" : "ding");
    api.end(text);
  }

  function next() {
    if (lost(b, turn)) {
      const winner = other(turn);
      return finish(
        `${NAME[winner]} wins!\n${winner === me ? "Debrecen pride: you win." : `${opp.name} wins.`}`,
        winner === me,
      );
    }
    render();
    if (turn === bot) timer = window.setTimeout(botTurn, 700 + Math.random() * 900);
  }

  function botTurn() {
    if (done) return;
    const m = botMove(b, bot, api.skill)!;
    const wasMan = !isKing(b[m.path[0]]); // read before the move empties the start square
    b = play(b, m);
    beep("knock");
    if (opp.chat && m.captured.length > 1 && Math.random() < 0.6) api.chat(opp, "Jump!");
    else if (opp.chat && wasMan && isKing(b[m.path[m.path.length - 1]]) && Math.random() < 0.6)
      api.chat(opp, "King me!");
    api.maybeLeave();
    turn = me;
    next();
  }

  function myMove(m: Move) {
    b = play(b, m);
    path = [];
    ghost.hidden = true;
    beep("knock");
    turn = bot;
    // a draw offer travels with your move; the bot says yes when it isn't ahead
    if (drawOffer) {
      drawOffer = false;
      host.querySelector("[data-ck-draw]")!.setAttribute("aria-pressed", "false");
      // a move that wins the game is a win, whatever offer went with it
      if (!lost(b, bot)) {
        if (acceptsDraw(b, bot)) return finish(`${opp.name} accepted your draw offer.\nDraw!`, null);
        api.chat(null, `${opp.name} declined your draw offer.`);
      }
    }
    next();
  }

  function pick(i: number) {
    if (done || turn !== me) return;
    const v = b[i];
    // clicking the picked-up piece again puts it back, so you can choose another one
    if (path.length === 1 && i === path[0]) {
      path = [];
      ghost.hidden = true;
      api.status("Piece put back. Your turn. Click a piece, then where it goes.");
      return render();
    }
    // start (or restart) with one of your pieces, unless a jump is half done
    if (path.length <= 1 && sideOf(v) === me) {
      path = [i];
      if (!matching().length) {
        path = [];
        beep("error");
        api.status(moves(b, me)[0].captured.length ? "You must jump your opponent's piece." : "That piece can't move.");
        return;
      }
      ghost.innerHTML = piece(v);
      ghost.hidden = false;
      return render();
    }
    if (!path.length) return;
    const tried = [...path, i];
    const fits = moves(b, me).filter((m) => tried.every((p, k) => m.path[k] === p));
    if (!fits.length) {
      beep("error");
      if (moves(b, me)[0].captured.length) api.status("You must jump your opponent's piece.");
      return;
    }
    path = tried;
    const whole = fits.find((m) => m.path.length === path.length);
    if (whole) return myMove(whole);
    render(); // a multi-jump: keep going, hop by hop
  }

  boardEl.addEventListener("click", (e) => {
    const c = (e.target as Element).closest<HTMLElement>("[data-v]");
    if (!c) return;
    focus = Number(c.dataset.v);
    pick(flip ? 63 - focus : focus);
  });
  // the picked-up piece follows the mouse, as in XP
  boardEl.addEventListener("pointermove", (e) => {
    if (ghost.hidden) return;
    const r = boardEl.getBoundingClientRect();
    ghost.style.translate = `${e.clientX - r.left - ghost.offsetWidth / 2}px ${e.clientY - r.top - ghost.offsetHeight / 2}px`;
  });
  boardEl.addEventListener("keydown", (e) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return pick(flip ? 63 - focus : focus);
    }
    if (!(e.key in step)) return;
    e.preventDefault();
    const n = focus + step[e.key];
    if (n < 0 || n > 63 || (Math.abs(step[e.key]) === 1 && Math.floor(n / 8) !== Math.floor(focus / 8))) return;
    focus = n;
    render();
    cells[focus].focus();
  });
  host.querySelector("[data-ck-draw]")!.addEventListener("click", (e) => {
    if (done) return;
    drawOffer = !drawOffer;
    (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(drawOffer));
    api.status(drawOffer ? "Your draw offer goes with your next move." : "Draw offer taken back.");
  });
  host.querySelector("[data-ck-resign]")!.addEventListener("click", async () => {
    // the Zone's ask answers "" if the bot ended the game while the box was open
    if (done || (await api.ask("Internet Checkers", "Are you sure you want to resign?", ["Yes", "No"])) !== "Yes")
      return;
    finish(`You resigned. ${opp.name} wins.`, false);
  });

  next();
  return () => {
    done = true;
    clearTimeout(timer);
  };
}
