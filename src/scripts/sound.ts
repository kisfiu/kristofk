// Tiny Web Audio beeps for the games, no sound files. Off until the player turns it on; one switch for all games.
type Kind = "knock" | "thud" | "pop" | "scrape" | "ding" | "error" | "fanfare";
const NOTES: Record<Kind, [freq: number, ms: number, wave: OscillatorType][]> = {
  knock: [[220, 50, "square"]],
  thud: [[90, 120, "triangle"]],
  pop: [[880, 40, "sine"]],
  scrape: [[140, 60, "sawtooth"]],
  ding: [
    [880, 90, "sine"],
    [1320, 140, "sine"],
  ],
  error: [
    [300, 120, "square"],
    [220, 180, "square"],
  ],
  fanfare: [
    [523, 120, "triangle"],
    [659, 120, "triangle"],
    [784, 120, "triangle"],
    [1047, 300, "triangle"],
  ],
};
const KEY = "kk-sound";

let on = false;
try {
  on = localStorage.getItem(KEY) === "on";
} catch {}
let ctx: AudioContext | null = null;

export const soundOn = () => on;

export function toggleSound() {
  on = !on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) beep("ding");
  return on;
}

export function beep(kind: Kind) {
  if (!on) return;
  ctx ??= new AudioContext();
  let t = ctx.currentTime;
  for (const [freq, ms, wave] of NOTES[kind]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000);
    t += ms / 1000;
  }
}
