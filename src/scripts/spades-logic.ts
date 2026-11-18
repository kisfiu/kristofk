// Spades: the Windows XP Internet Spades rules, and the computer players. Pure, no DOM.
// Seats as in Hearts: 0 = you (south), then clockwise: 1 = west (your left), 2 = north (your partner), 3 = east.
// Teams: 0 = Gold (you and north), 1 = Blue (west and east).
import { type Card, deck, type Suit, shuffle } from "./cards";
import { sortHand } from "./hearts-logic";

export const WIN_AT = 500;
export const LOSE_AT = -200;
export const NIL = 0;

export interface NilResult {
  p: number;
  blind: boolean;
  made: boolean;
}
export interface TeamHand {
  /** The partners' bids added up, nil bids left out. */
  contract: number;
  /** Tricks taken by the partners who didn't bid nil. */
  tricks: number;
  points: number;
  /** The bag counter after this hand (0–9). */
  bags: number;
  nils: NilResult[];
}

export interface Spades {
  hands: Card[][];
  hand: number;
  dealer: number;
  phase: "bid" | "play" | "handover" | "gameover";
  /** null: not bid yet; 0: Nil. */
  bids: (number | null)[];
  /** Double Nil, bid before seeing the cards. */
  blind: boolean[];
  /** Whose turn; -1 while a full trick waits to be collected. */
  turn: number;
  trick: { p: number; c: Card }[];
  tricks: number[];
  broken: boolean;
  scores: number[];
  bags: number[];
  /** Every finished hand, per team, for the Score History. */
  history: TeamHand[][];
  /** The winning team, or -1. */
  winner: number;
}

export const teamOf = (p: number) => p % 2;
export const partnerOf = (p: number) => (p + 2) % 4;
const hi = (c: Card) => (c.rank === 1 ? 14 : c.rank);

export function newGame(dealer = 3): Spades {
  return {
    hands: [[], [], [], []],
    hand: -1,
    dealer: (dealer + 3) % 4, // dealHand moves the deal one seat on
    phase: "bid",
    bids: [null, null, null, null],
    blind: [false, false, false, false],
    turn: -1,
    trick: [],
    tricks: [0, 0, 0, 0],
    broken: false,
    scores: [0, 0],
    bags: [0, 0],
    history: [],
    winner: -1,
  };
}

/** Deal the next hand; the deal moves one seat clockwise, and bidding starts left of the dealer. */
export function dealHand(g: Spades, rnd: () => number = Math.random) {
  const cards = shuffle(deck(), rnd).map((c) => ({ ...c, up: true }));
  g.hand++;
  g.dealer = (g.dealer + 1) % 4;
  g.hands = [0, 1, 2, 3].map((p) => sortHand(cards.slice(p * 13, p * 13 + 13)));
  g.bids = [null, null, null, null];
  g.blind = [false, false, false, false];
  g.tricks = [0, 0, 0, 0];
  g.trick = [];
  g.broken = false;
  g.phase = "bid";
  g.turn = (g.dealer + 1) % 4;
}

/** Bid 1–13 or Nil (0); `blind` makes a Nil a Double Nil. After the fourth bid, the dealer's left leads. */
export function bid(g: Spades, p: number, n: number, blind = false): boolean {
  if (g.phase !== "bid" || g.turn !== p || !Number.isInteger(n) || n < 0 || n > 13 || (blind && n !== NIL))
    return false;
  g.bids[p] = n;
  g.blind[p] = blind;
  g.turn = (p + 1) % 4;
  if (g.bids.every((b) => b !== null)) {
    g.phase = "play";
    g.turn = (g.dealer + 1) % 4;
  }
  return true;
}

/** The team contract: the partners' bids added, nil bids count 0. */
export const contractOf = (g: Spades, team: number) => (g.bids[team] ?? 0) + (g.bids[team + 2] ?? 0);

/** The cards seat `p` may play now. */
export function legal(g: Spades, p: number): Card[] {
  const h = g.hands[p];
  if (!g.trick.length) {
    // no spade lead until spades are broken, unless you hold nothing else
    const other = h.filter((c) => c.suit !== "S");
    return g.broken || !other.length ? h : other;
  }
  const follow = h.filter((c) => c.suit === g.trick[0].c.suit);
  return follow.length ? follow : h;
}

export function play(g: Spades, p: number, card: Card): boolean {
  if (g.phase !== "play" || g.turn !== p || !legal(g, p).some((c) => c.id === card.id)) return false;
  g.hands[p] = g.hands[p].filter((c) => c.id !== card.id);
  g.trick.push({ p, c: card });
  if (card.suit === "S") g.broken = true;
  g.turn = g.trick.length === 4 ? -1 : (p + 1) % 4;
  return true;
}

/** The current winner of a (possibly unfinished) trick: the highest spade, else the highest card of the suit led. */
export function winning(trick: { p: number; c: Card }[]) {
  const suit: Suit = trick.some((t) => t.c.suit === "S") ? "S" : trick[0].c.suit;
  return trick.filter((t) => t.c.suit === suit).reduce((a, b) => (hi(b.c) > hi(a.c) ? b : a));
}

/** Take the finished trick; after the 13th, score the hand. Returns the winner. */
export function collect(g: Spades): number {
  const w = winning(g.trick).p;
  g.tricks[w]++;
  g.trick = [];
  g.turn = w;
  if (g.hands.every((h) => !h.length)) endHand(g);
  return w;
}

function endHand(g: Spades) {
  const row = [0, 1].map((team): TeamHand => {
    const seats = [team, team + 2];
    const nils: NilResult[] = [];
    let points = 0;
    let bags = 0;
    let tricks = 0;
    for (const p of seats) {
      if (g.bids[p] === NIL) {
        const made = g.tricks[p] === 0;
        nils.push({ p, blind: g.blind[p], made });
        points += (made ? 100 : -100) * (g.blind[p] ? 2 : 1);
        // a nil bidder's tricks don't help the partner; they are bags
        bags += g.tricks[p];
      } else tricks += g.tricks[p];
    }
    const contract = contractOf(g, team);
    if (contract > 0) {
      if (tricks >= contract) {
        points += 10 * contract;
        bags += tricks - contract;
      } else points -= 10 * contract;
    } else bags += tricks;
    points += bags; // every bag is worth a point
    g.bags[team] += bags;
    // ten bags cost 100 points, and the counter starts again
    while (g.bags[team] >= 10) {
      g.bags[team] -= 10;
      points -= 100;
    }
    g.scores[team] += points;
    return { contract, tricks, points, bags: g.bags[team], nils };
  });
  g.history.push(row);
  g.turn = -1;
  const [a, b] = g.scores;
  // 500 wins, -200 loses; when both teams are past a line, the higher score wins; a tie plays on
  const over = a >= WIN_AT || b >= WIN_AT || a <= LOSE_AT || b <= LOSE_AT;
  g.winner = over && a !== b ? (a > b ? 0 : 1) : -1;
  g.phase = g.winner >= 0 ? "gameover" : "handover";
}

/* ---------- Computer players ---------- */

/** Likely tricks in a hand: high cards, spade length, and short suits to trump in. */
export function estimate(hand: Card[]): number {
  const of = (s: Suit) => hand.filter((c) => c.suit === s);
  const spades = of("S");
  const n = spades.length;
  let t = Math.max(0, n - 3);
  for (const c of spades)
    if (c.rank === 1) t += 1;
    else if (c.rank === 13) t += n >= 2 ? 1 : 0.4;
    else if (c.rank === 12) t += n >= 3 ? 0.7 : 0.2;
  for (const s of ["C", "D", "H"] as Suit[]) {
    const cs = of(s);
    const len = cs.length;
    for (const c of cs)
      if (c.rank === 1) t += len <= 5 ? 1 : 0.5;
      else if (c.rank === 13) t += len >= 2 && len <= 4 ? 0.7 : 0.2;
    if (len === 0 && n >= 2) t += 0.8;
    else if (len === 1 && n >= 3) t += 0.4;
  }
  return t;
}

/** A bid: Nil with a hopeless hand, else the likely tricks (never more than the partner leaves room for).
 *  `skill` 0 misjudges by a trick now and then. */
export function botBid(g: Spades, p: number, skill = 2, rnd: () => number = Math.random): number {
  const hand = g.hands[p];
  const est = estimate(hand);
  const highSpade = hand.some((c) => c.suit === "S" && (c.rank === 1 || c.rank >= 12));
  const partner = g.bids[partnerOf(p)];
  if (est < 1.2 && !highSpade && hand.filter((c) => c.suit === "S").length <= 3 && partner !== NIL) return NIL;
  let n = Math.round(est);
  if (skill < 2 && rnd() < (skill ? 0.15 : 0.4)) n += rnd() < 0.5 ? -1 : 1;
  return Math.max(1, Math.min(n, 13 - (partner ?? 0)));
}

/** Pick a card: a nil bidder ducks; otherwise win while the team (or a set of the other team) needs tricks,
 *  cheaply, and duck once the contract is made to keep bags away. `skill` 0 plays loosely now and then. */
export function botPlay(g: Spades, p: number, skill = 2, rnd: () => number = Math.random): Card {
  const ok = legal(g, p);
  if (skill < 2 && rnd() < (skill ? 0.1 : 0.3)) return ok[Math.floor(rnd() * ok.length)];
  const low = [...ok].sort((a, b) => (a.suit === "S" ? 20 : 0) + hi(a) - ((b.suit === "S" ? 20 : 0) + hi(b)));
  const team = teamOf(p);
  const left = g.hands[p].length;
  // tricks toward a contract: a nil bidder's don't count
  const taken = (t: number) => [t, t + 2].reduce((n, s) => n + (g.bids[s] === NIL ? 0 : g.tricks[s]), 0);
  const need = contractOf(g, team) - taken(team);
  const theyNeed = contractOf(g, 1 - team) - taken(1 - team);
  const nil = g.bids[p] === NIL;
  const partnerNil = g.bids[partnerOf(p)] === NIL && g.tricks[partnerOf(p)] === 0;
  const want = !nil && (need > 0 || partnerNil || (theyNeed > 0 && theyNeed >= left - 1));

  if (!g.trick.length) {
    if (!want) return low[0];
    // lead an ace or king of a side suit, else the lowest card of the longest side suit
    const top = ok.find((c) => c.suit !== "S" && (c.rank === 1 || c.rank === 13));
    if (top) return top;
    return low[0];
  }
  const best = winning(g.trick);
  const beats = (c: Card) => winning([...g.trick, { p, c }]).p === p;
  const winners = low.filter(beats);
  const losers = low.filter((c) => !beats(c));
  // protect a partner's nil: take the trick if the partner is winning it
  if (partnerNil && best.p === partnerOf(p) && winners.length) return winners[winners.length - 1];
  const partnerSafe = best.p === partnerOf(p) && !partnerNil && (g.trick.length === 3 || hi(best.c) >= 13);
  if (!want || partnerSafe) return losers.length ? losers[losers.length - 1] : low[0];
  // trump, or play last, as cheaply as possible; earlier in the suit led, use the highest card so it holds
  const follows = ok[0].suit === g.trick[0].c.suit;
  if (winners.length) return g.trick.length === 3 || !follows ? winners[0] : winners[winners.length - 1];
  return low[0];
}
