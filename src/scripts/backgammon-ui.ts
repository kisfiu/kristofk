// Internet Backgammon inside the KK Game Zone: an azulejo board from Santarém, a 5-point match with the cube.
// The board is drawn from your side: your home board bottom right, the bear-off tray on the right.
import {
  acceptsResign,
  apply,
  BAR,
  BROWN,
  botDoubles,
  botMove,
  botTakes,
  type Cube,
  canDouble,
  diceOf,
  legal,
  type Match,
  matchWinner,
  newMatch,
  newPos,
  OFF,
  other,
  over,
  type Pos,
  pips,
  type Side,
  type Step,
  scoreGame,
  take,
  WHITE,
  winKind,
} from "./backgammon-logic";
import { beep } from "./sound";
import type { ZoneApi } from "./zone-ui";

const TITLE = "Internet Backgammon";
const COLOR: Record<Side, string> = { [WHITE]: "White", [BROWN]: "Brown" };
const KIND = ["", "a single game", "a gammon", "a backgammon"];
// the board from your side, left to right: top row 13–24, bottom row 12–1, with the bar and the tray in both
const ROWS: (number | "bar" | "tray")[][] = [
  [13, 14, 15, 16, 17, 18, "bar", 19, 20, 21, 22, 23, 24, "tray"],
  [12, 11, 10, 9, 8, 7, "bar", 6, 5, 4, 3, 2, 1, "tray"],
];
const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [
    [7, 7],
    [17, 17],
  ],
  3: [
    [7, 7],
    [12, 12],
    [17, 17],
  ],
  4: [
    [7, 7],
    [17, 7],
    [7, 17],
    [17, 17],
  ],
  5: [
    [7, 7],
    [17, 7],
    [12, 12],
    [7, 17],
    [17, 17],
  ],
  6: [
    [7, 6],
    [17, 6],
    [7, 12],
    [17, 12],
    [7, 18],
    [17, 18],
  ],
};
const dieSvg = (n: number, side: Side, used: boolean) =>
  `<svg viewBox="0 0 24 24" class="bg-die bg-${COLOR[side].toLowerCase()}${used ? " used" : ""}" role="img" aria-label="${n}${used ? ", used" : ""}"><rect x="1" y="1" width="22" height="22" rx="4"/>${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3"/>`).join("")}</svg>`;
const stone = (side: Side, label = "") => `<i class="bg-st bg-${COLOR[side].toLowerCase()}">${label}</i>`;

export function startBackgammon(host: HTMLElement, api: ZoneApi): () => void {
  const me: Side = Math.random() < 0.5 ? WHITE : BROWN;
  const bot = other(me);
  const opp = api.opponents[0];
  const skill = api.skill;
  let match: Match = newMatch(5);
  let pos: Pos = newPos();
  let cube: Cube = { value: 1, owner: null };
  /** opening: roll for who starts; roll: your turn, before the roll; move: your stones; bot; wait: dialogs and the end */
  let phase: "opening" | "roll" | "move" | "bot" | "wait" = "opening";
  let dice: number[] = [];
  let diceSide: Side[] = [];
  let left: number[] = [];
  let picked: number | null = null;
  let done = false;
  let timers: number[] = [];
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => !done && fn(), ms));

  host.innerHTML = `
    <div class="rv-top">
      <span class="rv-score" data-bg-score></span>
      <span><button type="button" data-bg-roll title="Alt+L">Roll</button> <button type="button" data-bg-double title="Alt+D">Double</button> <button type="button" data-bg-resign title="Alt+R">Resign</button></span>
    </div>
    <div class="bg-board" aria-label="Backgammon board">${ROWS.map((row, r) =>
      row
        .map((p, c) =>
          p === "bar"
            ? r
              ? ""
              : `<button type="button" class="bg-bar" data-bg="${BAR}" tabindex="-1"></button>`
            : p === "tray"
              ? r
                ? ""
                : `<button type="button" class="bg-tray" data-bg="${OFF}" tabindex="-1"></button>`
              : `<button type="button" class="bg-pt ${r ? "bottom" : "top"} ${(c - (c > 6 ? 1 : 0)) % 2 ? "odd" : "even"}" data-bg="${p}" tabindex="-1"></button>`,
        )
        .join(""),
    ).join(
      "",
    )}<div class="bg-dice" data-bg-dice></div><div class="bg-ghost" data-bg-ghost hidden>${stone(me)}</div></div>
    <p class="rv-you">You play <b>${COLOR[me]}</b> against ${opp.name} (${COLOR[bot]}). Match to 5 points.</p>`;
  const boardEl = host.querySelector<HTMLElement>(".bg-board")!;
  const cell = (p: number) => host.querySelector<HTMLButtonElement>(`[data-bg="${p}"]`)!;
  const ghost = host.querySelector<HTMLElement>("[data-bg-ghost]")!;
  const rollBtn = host.querySelector<HTMLButtonElement>("[data-bg-roll]")!;
  const doubleBtn = host.querySelector<HTMLButtonElement>("[data-bg-double]")!;
  const resignBtn = host.querySelector<HTMLButtonElement>("[data-bg-resign]")!;
  let focus: [number, number] = [1, 7];

  const focused = () => {
    const p = ROWS[focus[0]][focus[1]];
    return cell(p === "bar" ? BAR : p === "tray" ? OFF : p);
  };
  const name = (s: Side) => (s === me ? "You" : opp.name);
  const targets = () => (picked === null ? [] : legal(pos, me, left).filter((st) => st.from === picked));

  function stack(side: Side, n: number) {
    const shown = Math.min(n, 5);
    return Array.from({ length: shown }, (_, k) => stone(side, k === shown - 1 && n > 5 ? String(n) : "")).join("");
  }

  function render() {
    const to = new Set(targets().map((st) => st.to));
    for (let p = 1; p <= 24; p++) {
      const mine = pos[me][p];
      const theirs = pos[bot][25 - p];
      const c = cell(p);
      c.innerHTML =
        (mine ? stack(me, mine - (picked === p ? 1 : 0)) : stack(bot, theirs)) +
        (to.has(p) ? '<b class="bg-dia"></b>' : picked === p ? '<b class="bg-dia from"></b>' : "");
      const n = mine || theirs;
      c.setAttribute(
        "aria-label",
        `Point ${p}: ${n ? `${n} ${COLOR[mine ? me : bot]}` : "empty"}${to.has(p) ? ", legal move" : ""}`,
      );
    }
    const bar = cell(BAR);
    // the doubling cube sits on the bar: in the middle showing 64, or towards its owner
    const cubeAt = cube.owner === null ? "" : cube.owner === me ? " mine" : " theirs";
    const cubeTip =
      cube.owner === null
        ? "Doubling cube, in the middle"
        : `Doubling cube at ${cube.value}, owned by ${name(cube.owner)}`;
    bar.innerHTML = `<span>${stack(bot, pos[bot][BAR])}</span><span class="bg-cube${cubeAt}" title="${cubeTip}">${cube.value === 1 ? 64 : cube.value}</span><span>${stack(me, pos[me][BAR] - (picked === BAR ? 1 : 0))}${picked === BAR ? '<b class="bg-dia from"></b>' : ""}</span>`;
    bar.setAttribute("aria-label", `Bar: you ${pos[me][BAR]}, ${opp.name} ${pos[bot][BAR]}. ${cubeTip}`);
    const tray = cell(OFF);
    const slabs = (s: Side) =>
      `<span>${`<i class="bg-off bg-${COLOR[s].toLowerCase()}"></i>`.repeat(pos[s][OFF])}</span>`;
    tray.innerHTML = slabs(bot) + (to.has(OFF) ? '<b class="bg-dia"></b>' : "") + slabs(me);
    tray.setAttribute(
      "aria-label",
      `Borne off: you ${pos[me][OFF]}, ${opp.name} ${pos[bot][OFF]}${to.has(OFF) ? ", bear off here" : ""}`,
    );
    // used dice shrink
    const rest = left.slice();
    host.querySelector("[data-bg-dice]")!.innerHTML = dice
      .map((d, k) => {
        const i = rest.indexOf(d);
        if (i >= 0) rest.splice(i, 1);
        return dieSvg(d, diceSide[k], i < 0 && phase !== "opening");
      })
      .join("");
    for (const b of host.querySelectorAll<HTMLElement>("[data-bg]")) b.tabIndex = -1;
    focused().tabIndex = 0;
    host.querySelector("[data-bg-score]")!.textContent =
      `Match to 5: You ${match.score[me]}, ${opp.name} ${match.score[bot]}${match.crawford ? " (Crawford game)" : ""}\nPips: You ${pips(pos, me)}, ${opp.name} ${pips(pos, bot)}`;
    rollBtn.disabled = !(phase === "opening" || phase === "roll");
    doubleBtn.disabled = !(phase === "roll" && canDouble(cube, me, match));
    resignBtn.disabled = phase === "opening" || phase === "wait";
  }

  function newGame() {
    pos = newPos();
    cube = { value: 1, owner: null };
    dice = [];
    left = [];
    picked = null;
    phase = "opening";
    render();
    api.status(
      match.crawford
        ? "Crawford game: only the player one point from the match may double. Click Roll to see who goes first."
        : "Click Roll to see who goes first.",
    );
  }

  const die = () => 1 + Math.floor(Math.random() * 6);

  function roll() {
    if (done) return;
    if (phase === "opening") {
      const a = die();
      const b = die();
      dice = [a, b];
      diceSide = [me, bot];
      beep("scrape");
      if (a === b) {
        render();
        return api.status("Tie. Roll again.");
      }
      const first = a > b ? me : bot;
      left = [a, b];
      api.chat(null, `${name(first)} rolled higher and ${first === me ? "go" : "goes"} first.`);
      if (first === me) return startMoving();
      phase = "bot";
      render();
      return later(() => botPlay(), 900);
    }
    if (phase !== "roll") return;
    const a = die();
    const b = die();
    dice = diceOf(a, b);
    diceSide = dice.map(() => me);
    left = dice.slice();
    beep("scrape");
    if (a === b && opp.chat && Math.random() < 0.3) api.chat(opp, "Nice roll.");
    startMoving();
  }

  function startMoving() {
    phase = "move";
    picked = null;
    render();
    if (!legal(pos, me, left).length) {
      phase = "wait";
      render();
      api.status("You can't move with this roll.");
      return later(endMyTurn, 1500);
    }
    api.status("Your move. Click a stone, then a green diamond.");
  }

  function endMyTurn() {
    if (checkOver()) return;
    phase = "bot";
    picked = null;
    ghost.hidden = true;
    render();
    api.status(`${opp.name} is thinking…`);
    later(botTurn, 800 + Math.random() * 700);
  }

  async function botTurn() {
    if (canDouble(cube, bot, match) && botDoubles(pos, bot, skill)) {
      phase = "wait";
      render();
      const a = await api.ask(
        TITLE,
        `${opp.name} doubles the stakes to ${cube.value * 2} points.\nAccept, or resign and give up ${cube.value}?`,
        ["Accept", "Resign"],
      );
      if (done) return;
      if (a !== "Accept") return gameOver(bot, cube.value, "You declined the double.");
      cube = take(cube, me);
      phase = "bot";
      api.chat(null, `You accepted. The cube is at ${cube.value}.`);
    }
    const a = die();
    const b = die();
    dice = diceOf(a, b);
    diceSide = dice.map(() => bot);
    left = dice.slice();
    beep("scrape");
    if (a === 6 && b === 6 && opp.chat && Math.random() < 0.6) api.chat(opp, "Double six!");
    render();
    later(botPlay, 600);
  }

  function botPlay() {
    const m = botMove(pos, bot, left, skill);
    if (!m) {
      api.status(`${opp.name} can't move.`);
      if (opp.chat && Math.random() < 0.4) api.chat(opp, "Bad dice…");
      return later(botDone, 1200);
    }
    const firstOff = pos[bot][OFF] === 0 && m.steps.some((s) => s.to === OFF);
    for (const [k, st] of m.steps.entries())
      later(() => {
        pos = apply(pos, bot, st);
        left.splice(left.indexOf(st.die), 1);
        beep("knock");
        render();
        if (k === m.steps.length - 1) later(botDone, 400);
      }, k * 450);
    if (firstOff && opp.chat && Math.random() < 0.5) api.chat(opp, "Running home!");
  }

  function botDone() {
    if (checkOver()) return;
    if (api.maybeLeave()) {
      done = true;
      return;
    }
    phase = "roll";
    dice = [];
    left = [];
    render();
    api.status(canDouble(cube, me, match) ? "Your turn. Roll the dice, or double." : "Your turn. Roll the dice.");
  }

  function checkOver() {
    const w = over(pos);
    if (w === null) return false;
    const kind = winKind(pos, w);
    gameOver(w, kind * cube.value, `${name(w)} won ${KIND[kind]}.`);
    return true;
  }

  async function gameOver(winner: Side, points: number, why: string) {
    clearTimers();
    phase = "wait";
    picked = null;
    ghost.hidden = true;
    match = scoreGame(match, winner, points);
    render();
    beep(winner === me ? "fanfare" : "thud");
    const score = `Match score: You ${match.score[me]}, ${opp.name} ${match.score[bot]}.`;
    const mw = matchWinner(match);
    if (mw !== null) {
      done = true;
      return api.end(
        `${why} ${winner === me ? "You get" : `${opp.name} gets`} ${points} point${points > 1 ? "s" : ""}.\n${mw === me ? "You win the match!" : `${opp.name} wins the match.`} ${score}`,
      );
    }
    await api.ask(
      TITLE,
      `${why} ${winner === me ? "You get" : `${opp.name} gets`} ${points} point${points > 1 ? "s" : ""}.\n${score}`,
      ["OK"],
    );
    if (!done) newGame();
  }

  async function double() {
    if (done || phase !== "roll" || !canDouble(cube, me, match)) return;
    phase = "wait";
    render();
    api.status(`${opp.name} is deciding…`);
    await new Promise((r) => later(() => r(null), 900));
    if (done) return;
    if (!botTakes(pos, bot, skill)) {
      api.chat(null, `${opp.name} declined the double.`);
      return gameOver(me, cube.value, `${opp.name} resigned rather than accept your double.`);
    }
    cube = take(cube, bot);
    api.chat(null, `${opp.name} accepted. The cube is at ${cube.value}.`);
    phase = "roll";
    render();
    api.status("Your turn. Roll the dice.");
  }

  async function resign() {
    // on your turn only, so the bot's moves can't run on under the dialog
    if (done || (phase !== "roll" && phase !== "move")) return;
    const before = phase;
    phase = "wait";
    render();
    const v = cube.value;
    const a = await api.ask(TITLE, "Resign this game? Choose what to give up:", [
      `Cube value (${v})`,
      `Gammon (${2 * v})`,
      `Backgammon (${3 * v})`,
      "Cancel",
    ]);
    if (done) return;
    const kind = a.startsWith("Cube") ? 1 : a.startsWith("Gammon") ? 2 : a.startsWith("Backgammon") ? 3 : 0;
    if (kind && acceptsResign(pos, bot, kind)) return gameOver(bot, kind * v, `You resigned ${KIND[kind]}.`);
    if (kind) api.chat(null, `${opp.name} rejected your resignation.`);
    phase = before;
    render();
  }

  function click(p: number) {
    if (done || phase !== "move") return;
    if (picked === null) {
      if (p === OFF) return;
      if (!legal(pos, me, left).some((st) => st.from === p)) {
        if (pos[me][p] || p === BAR) {
          beep("error");
          api.status(
            pos[me][BAR] && p !== BAR ? "You must enter your stone from the bar first." : "That stone can't move.",
          );
        }
        return;
      }
      picked = p;
      ghost.hidden = false;
      return render();
    }
    if (p === picked) {
      picked = null;
      ghost.hidden = true;
      api.status("Stone put back. Click a stone, then a green diamond.");
      return render();
    }
    const st = targets()
      .filter((s) => s.to === p)
      .sort((x, y) => x.die - y.die)[0] as Step | undefined;
    if (!st) return beep("error");
    pos = apply(pos, me, st);
    left.splice(left.indexOf(st.die), 1);
    picked = null;
    ghost.hidden = true;
    beep("knock");
    render();
    if (over(pos) !== null || !legal(pos, me, left).length) {
      phase = "wait";
      render();
      later(endMyTurn, 500);
    }
  }

  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };

  // the picked-up stone follows the mouse, as in XP
  const follow = (e: MouseEvent) => {
    if (ghost.hidden || !e.clientX) return;
    const r = boardEl.getBoundingClientRect();
    ghost.style.translate = `${e.clientX - r.left - ghost.offsetWidth / 2}px ${e.clientY - r.top - ghost.offsetHeight / 2}px`;
  };
  boardEl.addEventListener("click", (e) => {
    const c = (e.target as Element).closest<HTMLElement>("[data-bg]");
    if (c) click(Number(c.dataset.bg));
    follow(e);
  });
  boardEl.addEventListener("pointermove", follow);
  boardEl.addEventListener("keydown", (e) => {
    const d: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    if (!(e.key in d)) return;
    e.preventDefault();
    const r = Math.min(1, Math.max(0, focus[0] + d[e.key][0]));
    const c = Math.min(13, Math.max(0, focus[1] + d[e.key][1]));
    focus = [r, c];
    render();
    focused().focus();
  });
  rollBtn.addEventListener("click", roll);
  doubleBtn.addEventListener("click", () => void double());
  resignBtn.addEventListener("click", () => void resign());
  // XP's keys: Alt+L roll, Alt+D double, Alt+R resign (while this window is the active one)
  const keys = (e: KeyboardEvent) => {
    if (!e.altKey || !host.isConnected || !host.closest(".window.active") || document.querySelector("dialog[open]"))
      return;
    const act = { KeyL: roll, KeyD: () => void double(), KeyR: () => void resign() }[e.code];
    if (!act) return;
    e.preventDefault();
    act();
  };
  document.addEventListener("keydown", keys);

  newGame();
  return () => {
    done = true;
    clearTimers();
    document.removeEventListener("keydown", keys);
  };
}
