/** Run `start` once, the first time the window around `el` is shown, so a game's code loads only when it's opened. */
export function whenOpen(el: HTMLElement, start: () => unknown) {
  const win = el.closest<HTMLElement>(".window");
  if (!win?.hidden) return void start();
  const mo = new MutationObserver(() => {
    if (win.hidden) return;
    mo.disconnect();
    start();
  });
  mo.observe(win, { attributes: true, attributeFilter: ["hidden"] });
}
