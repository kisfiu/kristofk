// Card faces and backs, drawn for this site as SVG strings (no third-party card art).
// Court cards are the Hortobágy animals: Jack = stork, Queen = Racka sheep, King = grey cattle.
import { type Card, rankText, red, type Suit } from "./cards";

export const CW = 84,
  CH = 114;

/** Suit symbols in a 100×100 box. */
const PIP: Record<Suit, string> = {
  H: "M50 90C22 68 4 50 4 31A22 22 0 0 1 50 21a22 22 0 0 1 46 10c0 19-18 37-46 59z",
  D: "M50 3l38 47-38 47-38-47z",
  S: "M50 4C36 28 6 42 6 62a21 21 0 0 0 38 12l-6 22h24l-6-22a21 21 0 0 0 38-12C94 42 64 28 50 4z",
  C: "M50 6a20 20 0 0 1 17 30 20 20 0 1 1-9 33l6 27H36l6-27a20 20 0 1 1-9-33A20 20 0 0 1 50 6z",
};
const ink = (s: Suit) => (s === "D" || s === "H" ? "#c8102e" : "#111");
const pip = (s: Suit, x: number, y: number, size: number, flip = false) =>
  `<path d="${PIP[s]}" fill="${ink(s)}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})${flip ? " rotate(180 50 50)" : ""}"/>`;

/** Pip spots for 2–10: [column 0|1|2, row 0..1]. */
const SPOTS: Record<number, [number, number][]> = {
  2: [
    [1, 0],
    [1, 1],
  ],
  3: [
    [1, 0],
    [1, 0.5],
    [1, 1],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 0.5],
    [0, 1],
    [2, 1],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 0.5],
    [2, 0.5],
    [0, 1],
    [2, 1],
  ],
  7: [
    [0, 0],
    [2, 0],
    [1, 0.25],
    [0, 0.5],
    [2, 0.5],
    [0, 1],
    [2, 1],
  ],
  8: [
    [0, 0],
    [2, 0],
    [1, 0.25],
    [0, 0.5],
    [2, 0.5],
    [1, 0.75],
    [0, 1],
    [2, 1],
  ],
  9: [
    [0, 0],
    [2, 0],
    [0, 1 / 3],
    [2, 1 / 3],
    [1, 0.5],
    [0, 2 / 3],
    [2, 2 / 3],
    [0, 1],
    [2, 1],
  ],
  10: [
    [0, 0],
    [2, 0],
    [1, 1 / 6],
    [0, 1 / 3],
    [2, 1 / 3],
    [0, 2 / 3],
    [2, 2 / 3],
    [1, 5 / 6],
    [0, 1],
    [2, 1],
  ],
};

/** Animal busts for the court cards, drawn in a 52×40 box (the upper half; the lower half is the same, turned). */
const BUST: Record<number, string> = {
  // Jack: a white stork, red beak, black wing
  11: `<path d="M14 40c2-14 8-22 16-24" fill="none" stroke="#fff" stroke-width="9"/><path d="M8 40c4-8 10-12 18-12l10 12z" fill="#222"/><circle cx="30" cy="13" r="7" fill="#fff" stroke="#555"/><path d="M36 12l15 4-15 1z" fill="#e2401c"/><circle cx="31" cy="11" r="1.4"/>`,
  // Queen: Racka, the twisted-horn Hungarian sheep
  12: `<path d="M17 12c-6-8-14-4-12 3 2 5 8 3 7-1M35 12c6-8 14-4 12 3-2 5-8 3-7-1" fill="none" stroke="#6b5a44" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="26" cy="24" rx="11" ry="13" fill="#f3ead8" stroke="#4a3d2c"/><g fill="#f3ead8" stroke="#4a3d2c" stroke-width=".8"><circle cx="18" cy="13" r="4"/><circle cx="26" cy="10" r="4.5"/><circle cx="34" cy="13" r="4"/></g><circle cx="22" cy="23" r="1.4"/><circle cx="30" cy="23" r="1.4"/><path d="M23 30q3 2 6 0" fill="none" stroke="#000"/><path d="M19 7l3-5 4 4 4-4 3 5z" fill="#e8b923" stroke="#8a6a20"/>`,
  // King: Hungarian grey cattle with lyre horns and a crown
  13: `<path d="M16 16C8 14 3 6 6 1M36 16c8-2 13-10 10-15" fill="none" stroke="#d9d2c0" stroke-width="3.2" stroke-linecap="round"/><path d="M16 16C8 14 3 6 6 1M36 16c8-2 13-10 10-15" fill="none" stroke="#3a3428" stroke-width="1" stroke-linecap="round" stroke-dasharray="0 9 6"/><path d="M15 15h22l-3 20q-8 6-16 0z" fill="#b9b4a8" stroke="#4a4438"/><ellipse cx="26" cy="33" rx="7" ry="4.5" fill="#4a4438"/><circle cx="20" cy="22" r="1.5"/><circle cx="32" cy="22" r="1.5"/><path d="M18 14l2-7 6 4 6-4 2 7z" fill="#e8b923" stroke="#8a6a20"/>`,
};

const corner = (c: Card) =>
  `<text x="7" y="17" font-size="15" font-weight="bold" font-family="Georgia,serif" fill="${ink(c.suit)}" text-anchor="middle">${rankText(c.rank)}</text>${pip(c.suit, 7, 25, 10)}`;

const faces = new Map<string, string>();
export function face(c: Card): string {
  const key = c.suit + c.rank;
  const hit = faces.get(key);
  if (hit) return hit;
  let middle = "";
  if (c.rank === 1) middle = pip(c.suit, CW / 2, CH / 2, 34);
  else if (c.rank <= 10)
    middle = SPOTS[c.rank].map(([col, row]) => pip(c.suit, 26 + col * 16, 24 + row * 66, 15, row > 0.5)).join("");
  else {
    const tint = red(c) ? "#fbe4e0" : "#e3ebf7";
    const bust = BUST[c.rank];
    middle = `<rect x="15" y="14" width="54" height="86" rx="2" fill="${tint}" stroke="${ink(c.suit)}"/><g transform="translate(16 16)">${bust}</g><g transform="rotate(180 42 57) translate(16 16)">${bust}</g><path d="M15 57h54" stroke="${ink(c.suit)}" stroke-width=".6"/>${pip(c.suit, 22, 21, 9)}${pip(c.suit, 62, 93, 9, true)}`;
  }
  const svg = `<svg viewBox="0 0 ${CW} ${CH}" xmlns="http://www.w3.org/2000/svg"><rect x=".5" y=".5" width="${CW - 1}" height="${CH - 1}" rx="5" fill="#fff" stroke="#555"/>${corner(c)}<g transform="rotate(180 42 57)">${corner(c)}</g>${middle}</svg>`;
  faces.set(key, svg);
  return svg;
}

/** The six card backs (XP had twelve; these are about Kristóf's places and causes). Some move, like XP's. */
export const BACKS: { id: string; name: string; art: string }[] = [
  {
    id: "storks",
    name: "Storks over the Hortobágy",
    art: `<defs><linearGradient id="bk-sky" x2="0" y2="1"><stop offset="0" stop-color="#5aa0e6"/><stop offset="1" stop-color="#cfe6ff"/></linearGradient></defs><rect width="76" height="106" fill="url(#bk-sky)"/><path d="M0 78q20-6 38-2t38-3v33H0z" fill="#9cbf4a"/><path d="M0 90q30-6 76 0v16H0z" fill="#c9b35a"/>${[
      [22, 32, 0],
      [50, 50, 0.4],
    ]
      .map(
        ([x, y, d]) =>
          `<g transform="translate(${x} ${y})"><path d="M-8 0h16" stroke="#fff" stroke-width="3"/><path d="M8 0l5 1" stroke="#e2401c" stroke-width="1.5"/><path d="M-2 0l-6-6M2 0l6-6" stroke="#222" stroke-width="2.4" stroke-linecap="round"><animateTransform attributeName="transform" type="scale" values="1 1;1 -1;1 1" dur="1.2s" begin="${d}s" repeatCount="indefinite"/></path></g>`,
      )
      .join("")}`,
  },
  {
    id: "school",
    name: "Invisible School: the light is on",
    art: `<rect width="76" height="106" fill="#2b5c8a"/><g fill="none" stroke="#5f8db8" stroke-width=".8">${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 12 + 6}h76"/>`).join("")}</g><path d="M14 56l24-20 24 20v30H14z" fill="#f3ead8" stroke="#1b3a5a" stroke-width="1.5"/><path d="M10 58l28-24 28 24" fill="none" stroke="#c8102e" stroke-width="4" stroke-linejoin="round"/><rect x="31" y="66" width="14" height="20" fill="#7a5230"/><rect x="20" y="62" width="9" height="9" fill="#ffd34d"><animate attributeName="fill" values="#ffd34d;#fff2a8;#ffd34d" dur="2.4s" repeatCount="indefinite"/></rect><rect x="47" y="62" width="9" height="9" fill="#ffd34d"/><circle cx="26" cy="24" r="3.5" fill="#fff"/><circle cx="50" cy="24" r="3.5" fill="#fff"/><path d="M20 34q6-6 12 0M44 34q6-6 12 0" stroke="#fff" stroke-width="2.4" fill="none"/>`,
  },
  {
    id: "rotary",
    name: "Rotary blue and gold",
    art: `<rect width="76" height="106" fill="#17458f"/><g stroke="#f7a81b" stroke-width="1.6">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 10 - 40} 0l60 106M${i * 10 - 20} 106l60-106"/>`).join("")}</g><circle cx="38" cy="53" r="13" fill="#17458f" stroke="#f7a81b" stroke-width="2.5"/><circle cx="38" cy="53" r="5" fill="#f7a81b"/>`,
  },
  {
    id: "bridge",
    name: "The Nine-hole Bridge at dusk",
    art: `<defs><linearGradient id="bk-dusk" x2="0" y2="1"><stop offset="0" stop-color="#2a2f6b"/><stop offset=".6" stop-color="#e8875a"/><stop offset="1" stop-color="#f6c66a"/></linearGradient></defs><rect width="76" height="106" fill="url(#bk-dusk)"/><circle cx="56" cy="30" r="7" fill="#fff4c2"/><path d="M0 70h76v10H0z" fill="#b8a27c"/>${Array.from({ length: 5 }, (_, i) => `<path d="M${i * 16 - 2} 80a8 8 0 0 1 16 0z" fill="#3a3a5a"/>`).join("")}<path d="M0 80h76v26H0z" fill="#41608a"/><path d="M6 90h20M40 96h24" stroke="#f6c66a" stroke-width="1.5"/>`,
  },
  {
    id: "racka",
    name: "Racka on the puszta",
    art: `<rect width="76" height="106" fill="#5f8f2e"/><g fill="#6fa236">${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 37) % 76}" cy="${(i * 53) % 106}" r="3"/>`).join("")}</g><g transform="translate(13 30) scale(1.3)">${BUST[12]}</g>`,
  },
  {
    id: "baseball",
    name: "The diamond",
    art: `<rect width="76" height="106" fill="#3d8b37"/><g fill="#45993e">${Array.from({ length: 6 }, (_, i) => `<rect y="${i * 18}" width="76" height="9"/>`).join("")}</g><path d="M38 34l26 26-26 26-26-26z" fill="#b5793f"/><path d="M38 40l20 20-20 20-20-20z" fill="#3d8b37"/><g fill="#fff"><rect x="35" y="31" width="6" height="6" transform="rotate(45 38 34)"/><rect x="61" y="57" width="6" height="6" transform="rotate(45 64 60)"/><rect x="9" y="57" width="6" height="6" transform="rotate(45 12 60)"/><path d="M34 84h8v4l-4 3-4-3z"/></g><circle cx="38" cy="60" r="4" fill="#fff" stroke="#c8102e"/>`,
  },
];

export function back(id: string): string {
  const b = BACKS.find((x) => x.id === id) ?? BACKS[0];
  return `<svg viewBox="0 0 ${CW} ${CH}" xmlns="http://www.w3.org/2000/svg"><rect x=".5" y=".5" width="${CW - 1}" height="${CH - 1}" rx="5" fill="#fff" stroke="#555"/><svg x="4" y="4" width="76" height="106" viewBox="0 0 76 106"><rect width="76" height="106" rx="3" fill="#fff"/>${b.art}</svg></svg>`;
}
