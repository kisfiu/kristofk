// XP-style menu bar: one Tab stop, ←/→ between menus, ↑/↓ inside, hover switches an open menu, Esc closes,
// and the shortcut keys (F2, Ctrl+Z, M…) work while the game's window is the active one.
// Menus are popovers placed from script (anchor positioning isn't in every browser yet).

export interface MenuBar {
  /** Tick or untick a check/radio item (radio: unticks the rest of its group). */
  set(id: string, on: boolean): void;
  isOn(id: string): boolean;
  disable(id: string, off: boolean): void;
}

const typing = (t: EventTarget | null) => (t as Element)?.closest?.("input, textarea, select, [contenteditable]");

export function initMenuBar(bar: HTMLElement, run: (cmd: string) => void): MenuBar {
  const triggers = [...bar.querySelectorAll<HTMLButtonElement>(":scope > [data-menu-trigger]")];
  const menuOf = (t: HTMLElement) => t.nextElementSibling as HTMLElement;
  const isOpen = (m: HTMLElement) => m.matches(":popover-open");
  const items = (m: HTMLElement) => [...m.querySelectorAll<HTMLButtonElement>("[data-cmd]:not(:disabled)")];
  const item = (id: string) => bar.querySelector<HTMLButtonElement>(`[data-cmd="${id}"]`)!;
  const win = bar.closest<HTMLElement>(".window");

  const closeAll = () => {
    for (const t of triggers) if (isOpen(menuOf(t))) menuOf(t).hidePopover();
  };

  function open(t: HTMLButtonElement, enter: boolean) {
    const m = menuOf(t);
    for (const o of triggers) if (o !== t && isOpen(menuOf(o))) menuOf(o).hidePopover();
    for (const o of triggers) o.tabIndex = o === t ? 0 : -1;
    if (!isOpen(m)) {
      m.showPopover({ source: t } as ShowPopoverOptions);
      // below the title, kept inside the viewport
      const r = t.getBoundingClientRect();
      m.style.left = `${Math.max(0, Math.min(r.left, innerWidth - m.offsetWidth))}px`;
      m.style.top = `${r.bottom + m.offsetHeight > innerHeight ? Math.max(0, r.top - m.offsetHeight) : r.bottom}px`;
      t.setAttribute("aria-expanded", "true");
    }
    if (enter) items(m)[0]?.focus();
  }

  /** ←/→: the next menu, opened if one was open, else just the focus moves (one Tab stop). */
  function step(from: HTMLButtonElement, dir: number) {
    const next = triggers[(triggers.indexOf(from) + dir + triggers.length) % triggers.length];
    const wasOpen = triggers.some((t) => isOpen(menuOf(t)));
    closeAll();
    for (const t of triggers) t.tabIndex = t === next ? 0 : -1;
    next.focus();
    if (wasOpen) open(next, false);
  }

  function activate(b: HTMLButtonElement) {
    if (b.disabled) return;
    if (b.dataset.group) api.set(b.dataset.cmd!, true);
    else if (b.getAttribute("role") === "menuitemcheckbox") api.set(b.dataset.cmd!, !api.isOn(b.dataset.cmd!));
    closeAll();
    if (b.dataset.cmd === "exit") return win?.querySelector<HTMLElement>('[data-act="close"]')?.click();
    run(b.dataset.cmd!);
  }

  for (const t of triggers) {
    const m = menuOf(t);
    // a press on the title of an open menu closes it (light dismiss would otherwise close and the click reopen it)
    let wasOpen = false;
    t.addEventListener("pointerdown", () => {
      wasOpen = isOpen(m);
    });
    t.addEventListener("click", (e) => {
      if (wasOpen || (e.detail === 0 && isOpen(m))) {
        wasOpen = false;
        return m.hidePopover();
      }
      open(t, e.detail === 0); // keyboard (Enter/Space) goes straight into the menu
    });
    t.addEventListener("pointerenter", () => {
      if (triggers.some((o) => o !== t && isOpen(menuOf(o)))) {
        open(t, false);
        t.focus({ focusVisible: false } as FocusOptions);
      }
    });
    m.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState !== "closed") return;
      t.setAttribute("aria-expanded", "false");
      if (m.contains(document.activeElement)) t.focus();
    });
    m.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-cmd]");
      if (b) activate(b);
    });
  }

  bar.addEventListener("keydown", (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>("[data-menu-trigger]");
    const inMenu = (e.target as Element).closest<HTMLElement>(".menu");
    const from = t ?? (inMenu?.previousElementSibling as HTMLButtonElement | null);
    if (!from) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      step(from, e.key === "ArrowLeft" ? -1 : 1);
    } else if (t && e.key === "ArrowDown") {
      e.preventDefault();
      open(t, true);
    } else if (inMenu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const list = items(inMenu);
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const n =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? list.length - 1
            : (i + (e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
      list[n]?.focus();
    } else if (e.key === "Tab") closeAll();
  });

  // shortcut keys, only while this window is the active one and no dialog is up
  const keys = new Map(
    [...bar.querySelectorAll<HTMLButtonElement>("[data-key]")].map((b) => [b.dataset.key!.toLowerCase(), b]),
  );
  document.addEventListener("keydown", (e) => {
    if (
      !win ||
      win.hidden ||
      !win.classList.contains("active") ||
      typing(e.target) ||
      document.querySelector("dialog[open]")
    )
      return;
    const k = `${e.ctrlKey ? "ctrl+" : ""}${e.shiftKey && e.key.length > 1 ? "shift+" : ""}${e.key.toLowerCase()}`;
    const b = keys.get(k);
    if (!b || e.altKey || e.metaKey || (e.key.length === 1 && e.shiftKey)) return;
    e.preventDefault();
    activate(b);
  });

  const api: MenuBar = {
    set(id, on) {
      const b = item(id);
      if (b.dataset.group && on)
        for (const o of bar.querySelectorAll(`[data-group="${b.dataset.group}"]`))
          o.setAttribute("aria-checked", "false");
      b.setAttribute("aria-checked", String(on));
    },
    isOn: (id) => item(id).getAttribute("aria-checked") === "true",
    disable(id, off) {
      item(id).disabled = off;
    },
  };
  return api;
}
