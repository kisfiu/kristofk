// KK Game Zone: the pretend 2003 online lobby. Opponents are bots with made-up nicknames; chat is canned phrases
// only, as it was in the XP Internet games (the phrases here are our own). Pure, no DOM.

export const SKILLS = ["Beginner", "Intermediate", "Expert"] as const;
export type Skill = 0 | 1 | 2;

const NICK_A = [
  "stork",
  "puszta",
  "racka",
  "gulyas",
  "langos",
  "bogracs",
  "csarda",
  "paprika",
  "tanuki",
  "pipeline",
  "yaml",
  "kube",
  "commit",
  "dialup",
  "winamp",
  "napster",
  "tamagotchi",
  "nokia",
];
const NICK_B = ["_1999", "_2003", "_xp", "_hu", "_bp", "_dbn", "88", "_pro", "_kid", "4ever", "_rulez", "007"];
const LANGUAGES = [
  "English",
  "Magyar",
  "Deutsch",
  "Polski",
  "Español",
  "Français",
  "Italiano",
  "Nederlands",
  "Português",
  "Suomi",
  "Svenska",
  "Čeština",
];

export interface Player {
  name: string;
  language: string;
  skill: Skill;
  chat: boolean;
  bot: boolean;
}

const pick = <T>(a: readonly T[], rnd: () => number) => a[Math.floor(rnd() * a.length)];

/** A 2003-style nickname like "stork_1999"; never one of the names in `taken`. */
export function nickname(rnd: () => number = Math.random, taken: string[] = []): string {
  for (;;) {
    const n = pick(NICK_A, rnd) + pick(NICK_B, rnd);
    if (!taken.includes(n)) return n;
  }
}

export const bot = (skill: Skill, rnd: () => number = Math.random, taken: string[] = []): Player => ({
  name: nickname(rnd, taken),
  language: pick(LANGUAGES, rnd),
  skill,
  chat: rnd() > 0.15,
  bot: true,
});

/** The chat menu: shared phrases, then a few for the game. */
export const PHRASES = {
  common: [
    "Hello!",
    "Hi from Budapest!",
    "Good luck!",
    "Have fun!",
    "Your turn.",
    "I'm thinking…",
    "Nice move!",
    "Well played.",
    "You're good at this.",
    "Thank you!",
    "Oops!",
    "Argh!",
    "Whew!",
    "Hmm…",
    "Uh-oh.",
    "Be right back.",
    "Sorry, I have to go soon.",
    ":-)",
    ":-(",
    ";-)",
    ":-D",
    "Good game!",
    "Thanks for the game!",
    "Bye!",
  ],
  reversi: ["Corner!", "That's a lot of flips.", "Pipeline green!", "Jenkins never gives up."],
  checkers: ["King me!", "Jump!", "Debrecen forever!"],
  backgammon: ["Double six!", "Nice roll.", "Bad dice…", "Running home!"],
  hearts: ["Who has the Queen?", "Shoot the moon!", "No hearts, please."],
  spades: ["Nice bid, partner.", "We need one more trick.", "Watch the bags!"],
} as const;

const GREETING = /^(Hello!|Hi from|Good luck|Have fun)/;
const THANKS = /^(Good game|Thanks for the game|Well played|Nice move|You're good)/;

/** What a bot answers to your message, if anything. */
export function botReply(text: string, rnd: () => number = Math.random): string | null {
  if (GREETING.test(text)) return pick(["Hello!", "Hi!", "Good luck!", "Have fun!", ":-)"], rnd);
  if (THANKS.test(text)) return pick(["Thank you!", ":-D", "Thanks for the game!", "You too!"], rnd);
  if (text === "Your turn.") return pick(["I'm thinking…", "Hmm…", "OK, OK!"], rnd);
  if (text === "Be right back." || text === "Sorry, I have to go soon.")
    return pick(["OK!", "No problem.", ":-("], rnd);
  return rnd() < 0.3 ? pick([":-)", ";-)", "Hmm…"], rnd) : null;
}
