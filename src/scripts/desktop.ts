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
  // an open Start menu takes Esc itself; balloons (manual popovers) don't, so they must not block it
  if (e.key !== "Escape" || document.querySelector(":popover-open:not([popover=manual])")) return;
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
  const w = bar.closest<HTMLElement>(".window");
  if (!w || !movable(w)) return;
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

// ---------- rubber-band selection, like the XP desktop (also inside folder windows) ----------
const band = Object.assign(document.createElement("div"), { className: "marquee", hidden: true });
$(".desktop")!.append(band); // inside the desktop layer, so on the desktop it stays behind open windows
const desktopIcons = $(".desktop > .icons")!;
const iconsIn = (area: Element) => [...area.querySelectorAll<HTMLElement>(":scope > li > .icon")];
const clearSelection = (area?: Element) => {
  for (const i of (area ?? document).querySelectorAll(".icon.selected")) i.classList.remove("selected");
};

document.addEventListener("pointerdown", (e) => {
  const t = e.target as Element;
  if (e.button !== 0) return;
  const icon = t.closest<HTMLElement>(".icon");
  if (icon) {
    // plain click selects just this icon; Ctrl/⌘+click adds or removes it
    if (e.ctrlKey || e.metaKey) icon.classList.toggle("selected");
    else {
      clearSelection();
      icon.classList.add("selected");
    }
    return;
  }
  if (t.closest("button, a, input, .title-bar")) return;
  const area = t.closest(".icons") ?? (t.closest(".window") ? null : t.closest(".desktop") && desktopIcons);
  if (!area) return;
  e.preventDefault(); // no text selection or native drag from this press
  // ...which also keeps focus where it was, so drop it from a clicked icon: clicking the desktop unselects everything
  if (document.activeElement?.closest(".icon")) (document.activeElement as HTMLElement).blur();
  clearSelection();
  const icons = iconsIn(area);
  const x0 = e.clientX;
  const y0 = e.clientY;
  band.style.zIndex = String(area.closest(".window") ? z + 1 : 5);
  (area as HTMLElement).setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    const left = Math.min(x0, m.clientX);
    const top = Math.min(y0, m.clientY);
    const width = Math.abs(m.clientX - x0);
    const height = Math.abs(m.clientY - y0);
    if (band.hidden && width + height < 4) return; // a click, not a drag
    Object.assign(band.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    band.hidden = false;
    // like XP: only the picture or the label text count, not the empty cell around them
    const touches = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return !!r && r.left < left + width && r.right > left && r.top < top + height && r.bottom > top;
    };
    for (const i of icons)
      i.classList.toggle("selected", touches(i.querySelector(".ico")) || touches(i.querySelector("span")));
  };
  area.addEventListener("pointermove", move as EventListener);
  area.addEventListener(
    "lostpointercapture",
    () => {
      band.hidden = true;
      area.removeEventListener("pointermove", move as EventListener);
    },
    { once: true },
  );
});

// Enter opens every selected desktop icon, as on XP (only when no window or control has focus)
document.addEventListener("keydown", (e) => {
  const focus = document.activeElement;
  if (e.key !== "Enter" || !(focus === document.body || focus?.closest(".desktop > .icons"))) return;
  const chosen = iconsIn(desktopIcons).filter((i) => i.classList.contains("selected"));
  if (chosen.length < 2) return; // a single focused icon already opens through its own click
  e.preventDefault();
  for (const i of chosen) open(i.dataset.open!);
});

// ---------- taskbar clock ----------
const clock = $("#clock")!;
const cal = $("#calendar")!;
let month = new Date(); // the month the calendar shows

function drawMonth() {
  const y = month.getFullYear();
  const m = month.getMonth();
  cal.querySelector("[data-cal-title]")!.textContent = new Date(y, m, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1),
  ];
  while (cells.length < 42) cells.push(null); // always 6 weeks (the most a month spans), so the popup never changes size
  let html = "";
  for (let r = 0; r < cells.length; r += 7) {
    html += `<tr>${cells
      .slice(r, r + 7)
      .map((d) => {
        const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
        return `<td${isToday ? ' aria-current="date"' : ""}>${d ?? ""}</td>`;
      })
      .join("")}</tr>`;
  }
  cal.querySelector("[data-cal-days]")!.innerHTML = html;
}

const tick = () => {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  clock.title = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  if (!cal.matches(":popover-open")) return;
  const [h, mi, se] = [now.getHours(), now.getMinutes(), now.getSeconds()];
  const turn = (hand: string, deg: number) =>
    cal.querySelector(`[data-hand="${hand}"]`)!.setAttribute("transform", `rotate(${deg} 50 50)`);
  turn("h", (h % 12) * 30 + mi / 2);
  turn("m", mi * 6 + se / 10);
  turn("s", se * 6);
  cal.querySelector("[data-cal-time]")!.textContent = `${now.toLocaleTimeString()} · ${clock.title}`;
};
for (const b of cal.querySelectorAll<HTMLElement>("[data-cal]")) {
  b.addEventListener("click", () => {
    month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.cal), 1);
    drawMonth();
  });
}
cal.addEventListener("toggle", (e) => {
  if ((e as ToggleEvent).newState !== "open") return;
  month = new Date();
  drawMonth();
  tick();
});
tick();
setInterval(tick, 1_000);

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
