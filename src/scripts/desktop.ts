const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = matchMedia("(max-width: 600px)");
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const tasks = $("#tasks")!;

/** Run a full-screen change (boot, shut down) as a View Transition. Not used for windows: a transition swallows clicks while it runs. */
function vt(change: () => void) {
  if (!reduced && document.startViewTransition) {
    // An aborted transition (e.g. before first paint) still applies the change; don't report it as an error.
    const t = document.startViewTransition(change);
    t.ready.catch(() => {});
    t.finished.catch(() => {});
  } else change();
}

const store = {
  get: (s: Storage, k: string) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set: (s: Storage, k: string, v: string) => {
    try {
      s.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// ---------- windows ----------
let z = 10;
let cascade = 0;
const win = (id: string) => document.getElementById(`win-${id}`);
const taskFor = (w: HTMLElement) => tasks.querySelector<HTMLButtonElement>(`[data-win="${w.id}"]`);
const visible = () => [...document.querySelectorAll<HTMLElement>(".window:not([hidden])")];

function focusWin(w: HTMLElement) {
  w.style.zIndex = String(++z);
  for (const o of document.querySelectorAll(".window.active")) o.classList.remove("active");
  w.classList.add("active");
  for (const b of tasks.children) b.setAttribute("aria-pressed", String(b === taskFor(w)));
}

function topWin() {
  return visible().sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
}

/** Like the real thing: when a window goes away, the one below it becomes active. */
function activateTop() {
  const next = topWin();
  if (next) {
    focusWin(next);
    next.focus({ preventScroll: true });
  }
}

function place(w: HTMLElement) {
  const step = (cascade++ % 8) * 26;
  const left = Math.min(110 + step, Math.max(0, innerWidth - w.offsetWidth - 8));
  const top = Math.min(16 + step, Math.max(0, innerHeight - w.offsetHeight - 40));
  w.style.left = `${left}px`;
  w.style.top = `${top}px`;
  w.dataset.placed = "1";
}

function show(w: HTMLElement) {
  w.hidden = false;
  if (!w.dataset.placed) place(w);
  focusWin(w);
  w.focus({ preventScroll: true });
}

export function open(id: string) {
  const w = win(id);
  if (!w) return;
  if (w.hidden) {
    if (!taskFor(w)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.win = w.id;
      b.textContent = w.querySelector(".title-bar-text")?.textContent?.trim() ?? id;
      tasks.append(b);
    }
    show(w);
  } else focusWin(w);
  history.replaceState(null, "", `#${id}`);
}

function minimize(w: HTMLElement) {
  w.hidden = true;
  w.classList.remove("active");
  taskFor(w)?.setAttribute("aria-pressed", "false");
  activateTop();
}

function close(w: HTMLElement) {
  w.hidden = true;
  w.classList.remove("active", "max");
  taskFor(w)?.remove();
  activateTop();
  if (location.hash === `#${w.id.slice(4)}`) history.replaceState(null, "", location.pathname);
}

function toggleMax(w: HTMLElement) {
  const max = w.classList.toggle("max");
  w.querySelector('[data-act="max"]')?.setAttribute("aria-label", max ? "Restore" : "Maximize");
}

document.addEventListener("click", (e) => {
  const t = e.target as Element;
  const act = t.closest<HTMLElement>("[data-act]");
  const w = t.closest<HTMLElement>(".window");
  if (act && w) {
    ({ min: minimize, max: toggleMax, close })[act.dataset.act as "min" | "max" | "close"](w);
    return;
  }
  const opener = t.closest<HTMLElement>("[data-open]");
  if (opener) {
    // Desktop/folder icons open on double-click like the real thing; touch and keyboard open on one.
    const single =
      !opener.classList.contains("icon") ||
      e.detail === 0 ||
      (e as PointerEvent).pointerType === "touch" ||
      narrow.matches;
    if (single) {
      $("#start-menu")?.hidePopover();
      open(opener.dataset.open!);
    }
    return;
  }
  const task = t.closest<HTMLElement>("[data-win]");
  if (task) {
    const tw = document.getElementById(task.dataset.win!)!;
    if (tw.hidden) show(tw);
    else if (tw.classList.contains("active")) minimize(tw);
    else focusWin(tw);
  }
});

document.addEventListener("dblclick", (e) => {
  const opener = (e.target as Element).closest<HTMLElement>(".icon[data-open]");
  if (opener && !narrow.matches) open(opener.dataset.open!);
});

document.addEventListener("pointerdown", (e) => {
  const w = (e.target as Element).closest<HTMLElement>(".window");
  if (w && !w.classList.contains("active")) focusWin(w);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || document.querySelector(":popover-open")) return;
  const w = topWin();
  if (w) close(w);
});

/** Clamp so part of the title bar stays reachable; shared by pointer, keyboard and resize. */
function moveTo(w: HTMLElement, left: number, top: number) {
  w.style.left = `${Math.min(Math.max(left, 80 - w.offsetWidth), innerWidth - 80)}px`;
  w.style.top = `${Math.min(Math.max(top, 0), innerHeight - 60)}px`;
}
const movable = (w: HTMLElement) => !narrow.matches && !w.classList.contains("max");

// Drag by the title bar (mouse, pen and touch through Pointer Events); its window icon is the keyboard handle.
document.addEventListener("pointerdown", (e) => {
  const t = e.target as Element;
  const bar = t.closest<HTMLElement>(".title-bar");
  const control = t.closest("button, input, a");
  if (!bar || e.button !== 0 || (control && !control.matches("[data-move]"))) return;
  const w = bar.closest<HTMLElement>(".window")!;
  if (!movable(w)) return;
  const dx = e.clientX - w.offsetLeft;
  const dy = e.clientY - w.offsetTop;
  bar.setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    bar.classList.add("dragging");
    moveTo(w, m.clientX - dx, m.clientY - dy);
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener(
    "lostpointercapture",
    () => {
      bar.classList.remove("dragging");
      bar.removeEventListener("pointermove", move);
    },
    { once: true },
  );
});

const STEP = 15;
const arrows: Record<string, [number, number, string]> = {
  ArrowLeft: [-STEP, 0, "left"],
  ArrowRight: [STEP, 0, "right"],
  ArrowUp: [0, -STEP, "up"],
  ArrowDown: [0, STEP, "down"],
};
document.addEventListener("keydown", (e) => {
  const handle = (e.target as Element).closest?.("[data-move]");
  const step = arrows[e.key];
  const w = handle?.closest<HTMLElement>(".window");
  if (!step || !w || !movable(w)) return;
  e.preventDefault();
  moveTo(w, w.offsetLeft + step[0], w.offsetTop + step[1]);
  announce(`${w.querySelector(".title-bar-text")?.textContent?.trim()} moved ${step[2]}`);
});

// Keep windows reachable when the browser window shrinks; on phones windows are full-screen, so no move handle.
addEventListener("resize", () => {
  for (const w of visible()) if (movable(w)) moveTo(w, w.offsetLeft, w.offsetTop);
});
const syncHandles = () => {
  for (const h of document.querySelectorAll<HTMLButtonElement>("[data-move]")) h.disabled = narrow.matches;
};
narrow.addEventListener("change", syncHandles);
syncHandles();

// ---------- taskbar clock ----------
const clock = $("#clock")!;
const tick = () => {
  clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
tick();
setInterval(tick, 15_000);

// ---------- e-mail, assembled here so scrapers reading the HTML don't get it ----------
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-email]")) {
  const [user, domain] = a.dataset.email!.split("|");
  a.href = `mailto:${user}@${domain}`;
  a.textContent = `${user}@${domain}`;
}

// ---------- fake visitor counter: grows a little every day, plus this browser's own visits ----------
const visits = Number(store.get(localStorage, "kk-visits") ?? 0) + 1;
store.set(localStorage, "kk-visits", String(visits));
const days = Math.max(0, Math.floor((Date.now() - Date.UTC(2026, 10, 15)) / 864e5));
$("#counter")!.textContent = String(1337 + days * 3 + visits).padStart(6, "0");

// ---------- balloon notifications ----------
type Role = "recruiter" | "nonprofit" | "guest";
const generic = [
  { title: "New resume available", text: "Click here to open My Resume.", open: "resume" },
  {
    title: "Mentors wanted",
    text: "The Invisible School is looking for volunteers. Click to read more.",
    open: "invisible-school",
  },
  { title: "Tip of the day", text: "Your pipeline is red. Can you make it green?", open: "pipeline-green" },
];
const greeting: Record<Role, (typeof generic)[number]> = {
  recruiter: {
    title: "Welcome, recruiter!",
    text: "My resume is open. The PDF download is in its top-right corner.",
    open: "resume",
  },
  nonprofit: {
    title: "Welcome, partner!",
    text: "The Invisible School is looking for mentors. Click to read more.",
    open: "invisible-school",
  },
  guest: { title: "Welcome, guest!", text: "Your pipeline is red. Can you make it green?", open: "pipeline-green" },
};
const role = () => store.get(sessionStorage, "kk-role") as Role | null;
const balloonsFor = (r: Role | null) => {
  const first = r ? greeting[r] : undefined;
  return first ? [first, ...generic.filter((g) => g.open !== first.open)] : generic;
};
const balloon = $("#balloon")!;
const announcer = $("#announcer")!;

/** Tell screen readers: ariaNotify() where supported, else the live region that exists since page load. */
function announce(message: string) {
  const doc = document as Document & { ariaNotify?: (message: string) => void };
  if (doc.ariaNotify) return doc.ariaNotify(message);
  announcer.textContent = message;
  setTimeout(() => {
    if (announcer.textContent === message) announcer.textContent = "";
  }, 1_000);
}

let balloonTimer = 0;
let nextTimer = 0;
let focusBefore: Element | null = null;
const nextBalloon = () => Number(store.get(sessionStorage, "kk-balloon") ?? 0);
function showBalloon(i: number) {
  const b = balloonsFor(role())[i];
  // never pop up over the boot or welcome screen
  if (!b || !balloon.showPopover || root.dataset.boot || root.dataset.welcome) return;
  store.set(sessionStorage, "kk-balloon", String(i + 1));
  balloon.querySelector("[data-title]")!.textContent = b.title;
  const text = balloon.querySelector<HTMLElement>("[data-text]")!;
  text.textContent = b.text;
  text.dataset.open = b.open;
  focusBefore = document.activeElement;
  balloon.showPopover(); // shown without taking focus
  announce(`${b.title}. ${b.text}`);
  balloonTimer = window.setTimeout(() => balloon.hidePopover(), 12_000);
}
const startBalloons = (delay = 5_000) => {
  clearTimeout(nextTimer);
  nextTimer = window.setTimeout(() => showBalloon(nextBalloon()), delay);
};
// However it closes (×, timeout, clicking its text, log off): give focus back if it was inside, queue the next tip.
balloon.addEventListener("beforetoggle", (e) => {
  if ((e as ToggleEvent).newState !== "closed") return;
  clearTimeout(balloonTimer);
  if (balloon.contains(document.activeElement) && focusBefore instanceof HTMLElement) focusBefore.focus();
  startBalloons(30_000);
});
balloon.querySelector("[data-text]")!.addEventListener("click", () => balloon.hidePopover());

// ---------- shut down / restart ----------
const shutdown = $("#shutdown")!;
$("#shutdown-btn")!.addEventListener("click", () => {
  $("#start-menu")?.hidePopover();
  vt(() => {
    shutdown.hidden = false;
  });
});
shutdown.querySelector("button")!.addEventListener("click", () => {
  try {
    sessionStorage.removeItem("kk-booted");
  } catch {
    /* ignore */
  }
  location.replace(location.pathname);
});

// ---------- boot → welcome (choose a user) → desktop ----------
const firstWindow: Record<Role, string | undefined> = { recruiter: "resume", nonprofit: "ngos", guest: undefined };
const firstUser = () => document.querySelector<HTMLButtonElement>("[data-role]")?.focus();

function finishBoot() {
  if (!root.dataset.boot) return;
  vt(() => {
    delete root.dataset.boot;
  });
  firstUser();
}

function logOn(r: Role) {
  store.set(sessionStorage, "kk-booted", "1");
  store.set(sessionStorage, "kk-role", r);
  store.set(sessionStorage, "kk-balloon", "0");
  vt(() => {
    delete root.dataset.welcome;
    const id = firstWindow[r];
    if (id) open(id);
  });
  startBalloons(2_000);
}

function logOff() {
  $("#start-menu")?.hidePopover();
  if (balloon.matches(":popover-open")) balloon.hidePopover();
  for (const w of visible()) close(w);
  vt(() => {
    root.dataset.welcome = "1";
  });
  firstUser();
}

for (const b of document.querySelectorAll<HTMLElement>("[data-role]")) {
  b.addEventListener("click", () => logOn(b.dataset.role as Role));
}
$("#logoff-btn")!.addEventListener("click", logOff);
document.querySelector("[data-turn-off]")!.addEventListener("click", () => {
  vt(() => {
    shutdown.hidden = false;
  });
});

if (root.dataset.boot) {
  setTimeout(finishBoot, 3_200);
  $("#boot-skip")!.addEventListener("click", finishBoot);
} else if (root.dataset.welcome) firstUser();
else startBalloons();

if (location.hash.length > 1) open(decodeURIComponent(location.hash.slice(1)));
