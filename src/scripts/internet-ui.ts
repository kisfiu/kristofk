// Length of public/surf/away.webp: AWAY_FRAMES * AWAY_MS in tools/make-surf.py.
const AWAY_MS = 14 * 90;
const DIAL = [
  "Dialing 06-51-KK-SURF…",
  "♪ beeeee-krrrrr-shhhhhhh ♪",
  "Verifying username and password…",
  "Logging on to network…",
  "Connected at 56,000 bps",
];

type Screen = "dial" | "surf" | "away" | "favs" | "zone";
type Zone = ReturnType<typeof import("./zone-ui").initZone>;

export function initInternet(el: HTMLElement) {
  const win = el.closest<HTMLElement>(".window");
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const address = q<HTMLInputElement>("[data-ie-address]");
  const status = q("[data-ie-status]");
  const log = q("[data-ie-log]");
  const back = q<HTMLButtonElement>("[data-ie-back]");
  const awayImg = q<HTMLImageElement>("[data-ie-screen=away]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current: Screen | "new" = "new";
  let timers: number[] = [];
  let awayBlob: Promise<Blob | null> | undefined;
  // the Game Zone loads the first time someone opens it
  let zone: Promise<Zone> | undefined;
  const narrowWidth = win?.style.getPropertyValue("--w") ?? "";

  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
  const show = (screen: Screen, url: string, text: string) => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    current = screen;
    for (const s of el.querySelectorAll<HTMLElement>("[data-ie-screen]")) s.hidden = s.dataset.ieScreen !== screen;
    address.value = url;
    status.textContent = text;
    back.disabled = screen !== "favs" && screen !== "zone";
    if (screen !== "zone") {
      void zone?.then((z) => z.leave());
      wide(false);
    }
  };
  /** The games need more room than the surfer. */
  const wide = (on: boolean) => win?.style.setProperty("--w", on ? "800px" : narrowWidth);

  function dial() {
    if (reduced) return surf();
    show("dial", "kk://dialup", "Dialing…");
    log.replaceChildren();
    for (const [i, line] of DIAL.entries()) {
      later(() => {
        log.append(Object.assign(document.createElement("li"), { textContent: line }));
        if (i === DIAL.length - 1) later(surf, 700);
      }, i * 600);
    }
  }

  function surf() {
    show("surf", "kk://surf-with-me", "Connected. Click the surfer to start surfing.");
    // a fresh blob URL per play makes the one-shot animation start from its first frame
    awayBlob ??= fetch("surf/away.webp")
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);
  }

  async function away() {
    const blob = reduced ? null : await awayBlob;
    if (!blob) return favs();
    URL.revokeObjectURL(awayImg.src);
    awayImg.src = URL.createObjectURL(blob);
    show("away", "kk://surf-with-me", "Catching the wave…");
    later(favs, AWAY_MS + 150);
  }

  function favs() {
    show("favs", "kk://favorites", "Done");
  }

  async function openZone() {
    show("zone", "kk://zone", "Opening the KK Game Zone…");
    zone ??= import("./zone-ui").then((m) =>
      m.initZone(el, { address: (u) => (address.value = u), status: (t) => (status.textContent = t), wide }),
    );
    try {
      const z = await zone;
      if (current === "zone") z.home(); // not if the visitor went elsewhere while it loaded
    } catch {
      // the code didn't load (a deploy replaced it): forget the failure, so the next click tries again
      zone = undefined;
      favs();
      status.textContent = "Couldn't open the KK Game Zone. Reload the page and try again.";
    }
  }

  q("[data-ie-skip]").addEventListener("click", surf);
  q("[data-ie-screen=surf]").addEventListener("click", away);
  back.addEventListener("click", async () => {
    if (current !== "zone") return surf();
    if (!(await (await zone!).back())) favs();
  });
  q("[data-ie-zone]").addEventListener("click", openZone);
  q("[data-ie-home]").addEventListener("click", dial);

  // Start the intro when the window opens; if it was closed mid-animation, resume at the wave.
  const onToggle = () => {
    if (!win || win.hidden) {
      if (current === "dial" || current === "away") surf();
      return;
    }
    if (current === "new") dial();
  };
  if (win) new MutationObserver(onToggle).observe(win, { attributes: true, attributeFilter: ["hidden"] });
  onToggle();
}
