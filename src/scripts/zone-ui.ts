// KK Game Zone shell, inside the Internet window: lobby, the XP "connecting" screens, players, canned chat,
// skill level, "Play Again / New Opponent / Quit". Each game plugs in through `ZoneApi`.
import { ask as askBox } from "./ask";
import { initMenuBar } from "./menubar";
import { load, save } from "./scores";
import { beep } from "./sound";
import { bot, botReply, PHRASES, type Player, SKILLS, type Skill } from "./zone";

export interface ZoneApi {
  me: Player;
  opponents: Player[];
  skill: Skill;
  /** A line in the chat from a player (shown only with chat on), or from the system. */
  chat(from: Player | null, text: string): void;
  status(text: string): void;
  /** After a bot move, a bot may (rarely) leave. 2-player games: true, the game should stop.
   *  4-player games: the bot is replaced by a computer player in `opponents`, and play goes on (false). */
  maybeLeave(): boolean;
  /** The game is over: show the result and Play Again / New Opponent / Quit. */
  end(text: string): void;
  ask(title: string, text: string, buttons: string[]): Promise<string>;
}
export interface ZoneGame {
  title: string;
  players: 2 | 4;
  /** The site window that "<Game> on the Web" opens. */
  web: string;
  help: string;
  /** Game ▸ Show Score: the Zone sends a "zone-score" event to the game's host element. */
  score?: boolean;
  load(): Promise<(host: HTMLElement, api: ZoneApi) => () => void>;
}

const GAMES: Record<string, ZoneGame> = {
  reversi: {
    title: "Internet Reversi",
    players: 2,
    web: "resume",
    help: `<p>Black is Jenkins, White is GitLab CI. Flip the jobs over one line at a time — Kristóf moved 18 teams this way.</p><ul><li>Black moves first. Place a stone so that a straight line of your opponent's stones (across, down or diagonally) is trapped between it and one of yours: they all flip to your colour.</li><li>A move must flip at least one stone. With no legal move, your turn passes by itself.</li><li>The game ends when neither side can move. Most stones wins.</li></ul>`,
    load: () => import("./reversi-ui").then((m) => m.startReversi),
  },
  checkers: {
    title: "Internet Checkers",
    players: 2,
    web: "invisible-school",
    help: `<p>Debrecen against Budapest: the hometown versus the home. Jumps are compulsory, so think twice.</p><ul><li>Red moves first. Pieces move one square diagonally forward, onto dark squares.</li><li>Jump over an opponent's piece to capture it. If you can jump, you must, and you must keep jumping while you can (click each landing square in turn).</li><li>A piece reaching the far row is crowned king and may then move one square backward too.</li><li>You win when your opponent has no pieces or no move left. Offer Draw sends the offer with your next move.</li></ul>`,
    load: () => import("./checkers-ui").then((m) => m.startCheckers),
  },
  backgammon: {
    title: "Internet Backgammon",
    players: 2,
    web: "travel",
    help: `<p>Thirty-seven countries and counting. Race your fifteen stones home across a board tiled like Santarém, where Kristóf spent his Erasmus year.</p><ul><li>Each player rolls one die to start (a tie rolls again); the higher die goes first and plays both numbers. Your stones travel to your home board, bottom right.</li><li>Click a stone, then a green diamond to move it by one die. Use both dice if you can; if only one fits, it must be the higher. Doubles play four times. A stone on the bar must enter first.</li><li>Landing on a lone stone sends it to the bar. Once all fifteen are home, bear them off into the tray on the right.</li><li>The match is to 5 points. Before your roll you may double (up to 64): your opponent accepts or gives up the game. A gammon counts double, a backgammon triple. In the Crawford game, after someone first reaches 4, only that player may double.</li><li>Keys: Alt+L roll, Alt+D double, Alt+R resign; arrows move between points, Space or Enter picks and drops.</li></ul>`,
    load: () => import("./backgammon-ui").then((m) => m.startBackgammon),
  },
  hearts: {
    title: "Internet Hearts",
    players: 4,
    web: "invisible-school",
    score: true,
    help: `<p>Same table as offline Hearts, but your rivals are on the line from 2003. Somebody always tries to shoot the moon.</p><ul><li>Pass three cards: left, right, across, then no pass every fourth hand. The 2 of clubs leads the first trick.</li><li>Follow suit if you can. No hearts or Queen of Spades on the first trick, and no heart lead until hearts are broken.</li><li>Every heart you take costs 1 point, the Queen of Spades 13. Take all of them (shoot the moon) and everyone else gets 26.</li><li>The game ends when someone reaches 100. The lowest score wins.</li><li>Double-click a card, or click it and press Play. Auto-Play plays your cards for you, Last Trick shows the trick just taken, and Game ▸ Show Score lists every hand.</li></ul>`,
    load: () => import("./internet-hearts-ui").then((m) => m.startHearts),
  },
};

const KEY = "kk-zone";

export function initZone(
  root: HTMLElement,
  ctx: { address(url: string): void; status(text: string): void; wide(on: boolean): void },
) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const prefs = load(KEY, { notice: true, chatOnStart: true, skill: {} as Record<string, Skill> });
  const ask = (title: string, text: string, buttons: string[]) => askBox(root, title, text, buttons);
  let game: string | null = null;
  let stop: (() => void) | null = null;
  let timers: number[] = [];
  let chatOn = prefs.chatOnStart;
  let playing = false;
  const me: Player = { name: "You", language: "English", skill: 0, chat: chatOn, bot: false };
  let opponents: Player[] = [];

  const menu = initMenuBar($(".zone-room [data-menubar]"), command);
  menu.set("chatstart", prefs.chatOnStart);
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
  const skillOf = (g: string): Skill => prefs.skill[g] ?? 0;

  /* ---------- Pages ---------- */
  function home() {
    leaveGame();
    game = null;
    $("[data-zone-home]").hidden = false;
    $("[data-zone-room]").hidden = true;
    ctx.wide(false);
    ctx.address("kk://zone");
    ctx.status("KK Game Zone: choose a game.");
  }

  function leaveGame() {
    clearTimers();
    stop?.();
    stop = null;
    playing = false;
  }

  async function enter(id: string) {
    if (prefs.notice) {
      const d = $<HTMLDialogElement>("[data-zone-notice]");
      d.showModal();
      const answer = await new Promise<string>((done) =>
        d.addEventListener("close", () => done(d.returnValue), { once: true }),
      );
      prefs.notice = d.querySelector<HTMLInputElement>("[name=again]")!.checked;
      save(KEY, prefs);
      if (answer === "help") return showHelp(id);
      if (answer !== "play") return;
    }
    game = id;
    $("[data-zone-home]").hidden = true;
    $("[data-zone-room]").hidden = false;
    ctx.wide(true);
    ctx.address(`kk://zone/${id}`);
    menu.set(`skill${skillOf(id)}`, true);
    menu.disable("score", !GAMES[id].score);
    $('[data-cmd="find"] span').textContent = GAMES[id].players > 2 ? "Find New Opponents" : "Find New Opponent";
    const say = $<HTMLSelectElement>("[data-zone-say]");
    say.innerHTML = `<option value="">(Select a message to send)</option>${[
      ...PHRASES.common,
      ...(PHRASES[id as keyof typeof PHRASES] ?? []),
    ]
      .map((p) => `<option>${p}</option>`)
      .join("")}`;
    $("[data-zone-chat]").replaceChildren();
    connect();
  }

  /** XP's connecting screens, then a game against freshly found opponents. */
  function connect() {
    if (!game) return;
    leaveGame();
    const g = GAMES[game];
    const skill = skillOf(game);
    const list = $("[data-zone-connect]");
    list.replaceChildren();
    list.hidden = false;
    $("[data-zone-play]").hidden = true;
    const others = g.players - 1;
    const word = others === 1 ? "another" : "three";
    const lines = [
      "Connecting to the game server…",
      `Looking for ${word} ${SKILLS[skill]} ${g.title.replace("Internet ", "")} player${others > 1 ? "s" : ""}…`,
      `Found ${["", "one", "two", "three"][others]} player${others > 1 ? "s" : ""}…`,
      `Welcome to ${g.title}!`,
    ];
    let t = 0;
    lines.forEach((line, i) => {
      t += i === 1 ? 900 + Math.random() * 1200 : 600;
      later(() => {
        list.append(Object.assign(document.createElement("li"), { textContent: line }));
        ctx.status(line);
      }, t);
    });
    // the chat history clears with a new opponent
    $("[data-zone-chat]").replaceChildren();
    const taken: string[] = [];
    opponents = Array.from({ length: others }, () => {
      const b = bot(skill, Math.random, taken);
      taken.push(b.name);
      return b;
    });
    later(() => void start(), t + 500);
  }

  async function start() {
    if (!game) return;
    const g = GAMES[game];
    const run = await g.load();
    $("[data-zone-connect]").hidden = true;
    $("[data-zone-play]").hidden = false;
    playing = true;
    me.chat = chatOn;
    players();
    const host = $("[data-zone-board]");
    host.replaceChildren();
    stop = run(host, api(g));
    // bots say hello now and then
    for (const o of opponents)
      if (o.chat && Math.random() < 0.6)
        later(() => line(o, Math.random() < 0.5 ? "Hello!" : "Good luck!"), 800 + Math.random() * 2500);
  }

  function players() {
    $("[data-zone-players]").innerHTML = [me, ...opponents]
      .map(
        (p) =>
          `<li><b>${p.name}</b> <span>${p.bot ? `${p.language}, ${SKILLS[p.skill]}` : SKILLS[skillOf(game!)]}</span> <span title="${p.chat ? "Chat on" : "Chat off"}">${p.chat ? "💬" : "🚫"}</span></li>`,
      )
      .join("");
  }

  /** Add a chat line; players' lines show only with chat on, system lines always. */
  function line(from: Player | null, text: string) {
    if (from && (!chatOn || !from.chat)) return;
    const li = document.createElement("li");
    if (from) li.append(Object.assign(document.createElement("b"), { textContent: `${from.name}: ` }), text);
    else li.append(Object.assign(document.createElement("i"), { textContent: text }));
    const log = $("[data-zone-chat]");
    log.append(li);
    log.scrollTop = log.scrollHeight;
  }

  function api(g: ZoneGame): ZoneApi {
    let moves = 0;
    return {
      me,
      opponents,
      skill: skillOf(game!),
      chat: line,
      status: ctx.status,
      ask,
      maybeLeave() {
        moves++;
        if (g.players === 4) {
          const i = Math.floor(Math.random() * opponents.length);
          if (moves < 20 || Math.random() > 1 / 400 || opponents[i].name.startsWith("Computer ")) return false;
          line(null, `${opponents[i].name} left the game and has been replaced by a computer player.`);
          opponents[i] = {
            name: `Computer ${i + 1}`,
            language: "English",
            skill: opponents[i].skill,
            chat: false,
            bot: true,
          };
          players();
          return false;
        }
        if (moves < 6 || Math.random() > 1 / 150) return false;
        playing = false;
        stop?.();
        stop = null;
        line(null, `${opponents[0].name} has left the game.`);
        void ask(g.title, "Your opponent has left the game.", ["New Opponent", "Quit"]).then((a) =>
          a === "New Opponent" ? connect() : home(),
        );
        return true;
      },
      end(text) {
        playing = false;
        for (const o of opponents)
          if (o.chat && Math.random() < 0.7) line(o, Math.random() < 0.5 ? "Good game!" : "Thanks for the game!");
        later(async () => {
          const newOpp = g.players > 2 ? "New Opponents" : "New Opponent";
          const a = await ask(g.title, `${text}\n\nWould you like to play again?`, ["Play Again", newOpp, "Quit"]);
          if (a === "Play Again") {
            // the opponents decide too
            ctx.status(`${opponents.map((o) => o.name).join(", ")} ${opponents.length > 1 ? "are" : "is"} deciding…`);
            later(() => {
              if (Math.random() < 0.08) {
                line(null, `${opponents[0].name} has left the game.`);
                void ask(g.title, `${opponents[0].name} doesn't want to play again.`, ["New Opponent", "Quit"]).then(
                  (b) => (b === "New Opponent" ? connect() : home()),
                );
              } else void start();
            }, 1200);
          } else if (a === newOpp) connect();
          else home();
        }, 900);
      },
    };
  }

  function showHelp(id: string | null) {
    const g = id ? GAMES[id] : null;
    $("[data-zone-help-title]").textContent = g ? `${g.title} — How to play` : "KK Game Zone";
    $("[data-zone-help-text]").innerHTML =
      g?.help ??
      "<p>Pick a game. The Zone finds opponents at your skill level, and you chat with ready-made phrases only, the way it worked in 2003.</p>";
    $<HTMLDialogElement>("[data-zone-help]").showModal();
  }

  /* ---------- Menus and controls ---------- */
  async function command(cmd: string) {
    if (!game) return;
    const g = GAMES[game];
    if (cmd === "score") $("[data-zone-board]").dispatchEvent(new Event("zone-score"));
    else if (cmd === "find") {
      if (!playing || (await ask(g.title, "Leave this game and find a new opponent?", ["Yes", "No"])) === "Yes")
        connect();
    } else if (cmd.startsWith("skill")) {
      prefs.skill[game] = Number(cmd.slice(5)) as Skill;
      save(KEY, prefs);
      ctx.status(`In your next game, we will look for opponents at the ${SKILLS[prefs.skill[game]]} level.`);
    } else if (cmd === "chatstart") {
      prefs.chatOnStart = menu.isOn("chatstart");
      save(KEY, prefs);
    } else if (cmd === "leave") {
      if (!playing || (await ask(g.title, "Are you sure you want to leave this game?", ["Yes", "No"])) === "Yes")
        home();
    } else if (cmd === "help") showHelp(game);
    else if (cmd === "web") {
      // "<Game> on the Web": the page of the site this game is about
      const b = Object.assign(document.createElement("button"), { hidden: true });
      b.dataset.open = g.web;
      root.append(b);
      b.click();
      b.remove();
    } else if (cmd === "about")
      void ask(
        "About",
        `${g.title}, KK Game Zone 1.0.\nThe Windows XP Internet games' rules and flow, with bots instead of strangers. Not affiliated with Microsoft.`,
        ["OK"],
      );
  }

  $("[data-zone-home]").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-zone-game]");
    if (b) void enter(b.dataset.zoneGame!);
  });
  $("[data-zone-say]").addEventListener("change", (e) => {
    const s = e.target as HTMLSelectElement;
    const text = s.value;
    s.value = "";
    if (!text) return;
    if (!chatOn) return ctx.status("Chat is off. Turn it on to send messages.");
    line(me, text);
    beep("pop");
    for (const o of opponents) {
      const r = botReply(text);
      if (r && o.chat) later(() => line(o, r), 700 + Math.random() * 1500);
    }
  });
  root.querySelector(".zone-chaton")!.addEventListener("change", (e) => {
    chatOn = (e.target as HTMLInputElement).value === "on";
    me.chat = chatOn;
    if (playing) players();
    line(null, chatOn ? "You turned chat on." : "You turned chat off. You'll only see game messages.");
  });
  for (const r of root.querySelectorAll<HTMLInputElement>("[name=zone-chat]"))
    r.checked = (r.value === "on") === chatOn;

  return {
    home,
    /** Back button: from a game to the Zone; false when already on the Zone page. */
    async back() {
      if (!game) return false;
      if (
        !playing ||
        (await ask(GAMES[game].title, "Are you sure you want to leave this game?", ["Yes", "No"])) === "Yes"
      )
        home();
      return true;
    },
    leave: leaveGame,
  };
}
