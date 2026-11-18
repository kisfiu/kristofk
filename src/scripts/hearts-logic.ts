// Hearts: Windows XP rules, and the computer players. Used by Hearts (offline) and Internet Hearts. Pure, no DOM.
// Seats: 0 = you (south), then clockwise: 1 = west (your left), 2 = north, 3 = east.
import { type Card, deck, type Suit, shuffle } from "./cards";

export type Pass = "left" | "right" | "across" | "none";
const PASSES: Pass[] = ["left", "right", "across", "none"];
const GAME_OVER_AT = 100;

export interface Hearts {
  hands: Card[][];
  hand: number;
  phase: "pass" | "play" | "handover" | "gameover";
  trick: { p: number; c: Card }[];
  /** Whose turn; -1 while a full trick waits to be collected. */
  turn: number;
  taken: Card[][];
  broken: boolean;
  firstTrick: boolean;
  scores: number[];
  /** Points of every finished hand, for the score sheet. */
  sheet: number[][];
  /** Who shot the moon in the last hand, or -1. */
  moon: number;
}

const ORDER: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 };
export const sortHand = (h: Card[]) => h.sort((a, b) => ORDER[a.suit] - ORDER[b.suit] || a.rank - b.rank);
/** Aces are high in Hearts. */
const hi = (c: Card) => (c.rank === 1 ? 14 : c.rank);
const isQS = (c: Card) => c.suit === "S" && c.rank === 12;
export const points = (c: Card) => (c.suit === "H" ? 1 : isQS(c) ? 13 : 0);

export const passOf = (hand: number): Pass => PASSES[hand % 4];
export const passTo = (p: number, pass: Pass) => (p + (pass === "left" ? 1 : pass === "right" ? 3 : 2)) % 4;

export function newGame(): Hearts {
  return {
    hands: [[], [], [], []],
    hand: -1,
    phase: "pass",
    trick: [],
    turn: -1,
    taken: [[], [], [], []],
    broken: false,
    firstTrick: true,
    scores: [0, 0, 0, 0],
    sheet: [],
    moon: -1,
  };
}

/** Deal the next hand. Passing comes first, except every fourth hand. */
export function dealHand(g: Hearts, rnd: () => number = Math.random) {
  const cards = shuffle(deck(), rnd).map((c) => ({ ...c, up: true }));
  g.hand++;
  g.hands = [0, 1, 2, 3].map((p) => sortHand(cards.slice(p * 13, p * 13 + 13)));
  g.taken = [[], [], [], []];
  g.trick = [];
  g.broken = false;
  g.firstTrick = true;
  g.moon = -1;
  g.phase = passOf(g.hand) === "none" ? "play" : "pass";
  if (g.phase === "play") g.turn = holderOf2C(g);
}

const holderOf2C = (g: Hearts) => g.hands.findIndex((h) => h.some((c) => c.suit === "C" && c.rank === 2));

/** Everyone hands over three cards at once. */
export function pass(g: Hearts, picks: Card[][]) {
  const dir = passOf(g.hand);
  const out = picks.map((p) => p.map((c) => c.id));
  const given = g.hands.map((h, p) => h.filter((c) => out[p].includes(c.id)));
  g.hands = g.hands.map((h, p) => h.filter((c) => !out[p].includes(c.id)));
  given.forEach((cards, p) => {
    g.hands[passTo(p, dir)].push(...cards);
  });
  g.hands.forEach(sortHand);
  g.phase = "play";
  g.turn = holderOf2C(g);
}

/** The cards seat `p` may play now. */
export function legal(g: Hearts, p: number): Card[] {
  const h = g.hands[p];
  if (!g.trick.length) {
    if (g.firstTrick) return h.filter((c) => c.suit === "C" && c.rank === 2);
    // no heart lead until hearts are broken, unless you hold nothing else
    const safe = h.filter((c) => c.suit !== "H");
    return g.broken || !safe.length ? h : safe;
  }
  const lead = g.trick[0].c.suit;
  const follow = h.filter((c) => c.suit === lead);
  if (follow.length) return follow;
  // no points on the first trick, unless the hand holds nothing else
  if (g.firstTrick) {
    const clean = h.filter((c) => !points(c));
    if (clean.length) return clean;
  }
  return h;
}

/** Finishing places as XP's Hearts names them, by places() index. */
export const PLACE = ["First Place", "Second Place", "Third Place", "Last Place"];

/** Why player 0 can't play `card` now (it isn't in legal()), in XP's words; both Hearts games show it. */
export function whyNot(g: Hearts, card: Card): string {
  if (g.firstTrick && !g.trick.length) return "You must lead the 2 of clubs.";
  if (g.trick.length && g.hands[0].some((c) => c.suit === g.trick[0].c.suit)) return "You must follow suit.";
  if (g.firstTrick && points(card)) return "You can't play a point card on the first trick.";
  return "Hearts have not been broken yet.";
}

export function play(g: Hearts, p: number, card: Card): boolean {
  if (g.phase !== "play" || g.turn !== p || !legal(g, p).some((c) => c.id === card.id)) return false;
  g.hands[p] = g.hands[p].filter((c) => c.id !== card.id);
  g.trick.push({ p, c: card });
  if (points(card)) g.broken = true; // the Queen of Spades breaks hearts too
  g.turn = g.trick.length === 4 ? -1 : (p + 1) % 4;
  return true;
}

/** The highest card of the suit led takes the trick. */
const trickWinner = (g: Hearts) => {
  const lead = g.trick[0].c.suit;
  return g.trick.filter((t) => t.c.suit === lead).reduce((a, b) => (hi(b.c) > hi(a.c) ? b : a)).p;
};

/** Take the finished trick; after the 13th, score the hand. Returns the winner. */
export function collect(g: Hearts): number {
  const w = trickWinner(g);
  g.taken[w].push(...g.trick.map((t) => t.c));
  g.trick = [];
  g.firstTrick = false;
  g.turn = w;
  if (g.hands.every((h) => !h.length)) endHand(g);
  return w;
}

function endHand(g: Hearts) {
  let pts = g.taken.map((t) => t.reduce((s, c) => s + points(c), 0));
  g.moon = pts.indexOf(26);
  // shooting the moon: the shooter scores 0, everyone else 26
  if (g.moon >= 0) pts = pts.map((_, p) => (p === g.moon ? 0 : 26));
  g.sheet.push(pts);
  g.scores = g.scores.map((s, p) => s + pts[p]);
  g.turn = -1;
  g.phase = g.scores.some((s) => s >= GAME_OVER_AT) ? "gameover" : "handover";
}

/** Places after the game: 0 = first. Equal scores share a place; a tie for the lowest still counts as your win. */
export const places = (g: Hearts) => g.scores.map((s) => g.scores.filter((o) => o < s).length);

/* ---------- Computer players ---------- */

/** Three cards to pass: the Queen of Spades and high spades, high hearts, then the highest cards. */
export function botPass(hand: Card[]): Card[] {
  const spades = hand.filter((c) => c.suit === "S").length;
  const danger = (c: Card) =>
    isQS(c) ? 100 : c.suit === "S" && hi(c) > 12 ? (spades < 5 ? 90 : 10) : c.suit === "H" ? 20 + hi(c) * 2 : hi(c);
  return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}

/** Pick a card. `skill` 0 (Beginner) plays any legal card often, 1 (Intermediate) now and then; 2 (Expert) always plays the heuristic. */
export function botPlay(g: Hearts, p: number, skill = 2, rnd: () => number = Math.random): Card {
  const ok = legal(g, p);
  if (skill < 2 && rnd() < (skill ? 0.12 : 0.35)) return ok[Math.floor(rnd() * ok.length)];
  const lowFirst = [...ok].sort((a, b) => hi(a) - hi(b));
  if (!g.trick.length) {
    // lead low, and not from hearts if there's a choice
    const nonHeart = lowFirst.filter((c) => c.suit !== "H" && !isQS(c));
    return (nonHeart.length ? nonHeart : lowFirst)[0];
  }
  const lead = g.trick[0].c.suit;
  if (ok[0].suit === lead) {
    const best = Math.max(...g.trick.filter((t) => t.c.suit === lead).map((t) => hi(t.c)));
    const under = lowFirst.filter((c) => hi(c) < best);
    // duck with the highest card that still loses; last to play on a clean trick: take it with the highest
    const clean = !g.trick.some((t) => points(t.c));
    if (g.trick.length === 3 && clean && !(lead === "S" && ok.some(isQS))) return lowFirst[lowFirst.length - 1];
    if (under.length) return under[under.length - 1];
    return lead === "S" ? (lowFirst.find((c) => !isQS(c)) ?? lowFirst[0]) : lowFirst[0];
  }
  // void in the suit led: get rid of the Queen of Spades, then high hearts, then the highest card
  const qs = ok.find(isQS);
  if (qs) return qs;
  const hearts = lowFirst.filter((c) => c.suit === "H");
  return hearts.length ? hearts[hearts.length - 1] : lowFirst[lowFirst.length - 1];
}
