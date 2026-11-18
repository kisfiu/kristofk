// Playing cards shared by the XP card games (Solitaire, FreeCell, Spider, Hearts, Spades). Pure, no DOM.
export type Suit = "C" | "D" | "H" | "S";
export const SUITS: Suit[] = ["C", "D", "H", "S"];
export interface Card {
  /** 0..51, stable within a deal (two-deck games: 0..103). */
  id: number;
  suit: Suit;
  /** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King. */
  rank: number;
  up: boolean;
}

export const red = (c: Card) => c.suit === "D" || c.suit === "H";

export function deck(decks = 1, suits: Suit[] = SUITS): Card[] {
  const out: Card[] = [];
  // Spider's one- and two-suit games still use 104 cards: repeat the chosen suits to fill both decks
  const perDeck = SUITS.map((_, i) => suits[i % suits.length]);
  for (let d = 0; d < decks; d++)
    for (const suit of perDeck)
      for (let rank = 1; rank <= 13; rank++) out.push({ id: out.length, suit, rank, up: false });
  return out;
}

/** Fisher–Yates, in place. */
export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANK = ["", "Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];
const SUIT_NAME: Record<Suit, string> = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };
export const rankText = (r: number) => (r === 1 ? "A" : r > 10 ? "JQK"[r - 11] : String(r));
/** "Queen of Hearts", or "face-down card". */
export const cardName = (c: Card) => (c.up ? `${RANK[c.rank]} of ${SUIT_NAME[c.suit]}` : "face-down card");
