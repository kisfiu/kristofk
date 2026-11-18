/** Run `start` once, the first time the window around `el` is shown, so a game's code loads only when it's opened. */
export function whenOpen(el: HTMLElement, start: () => unknown) {
  const win = el.closest<HTMLElement>(".window");
  // after a deploy the old code files are gone: say so, instead of leaving a dead window
  const run = () =>
    Promise.resolve()
      .then(start)
      .catch(() => {
        el.textContent = "Couldn't load the game. Reload the page to play.";
      });
  if (!win?.hidden) return void run();
  const mo = new MutationObserver(() => {
    if (win.hidden) return;
    mo.disconnect();
    void run();
  });
  mo.observe(win, { attributes: true, attributeFilter: ["hidden"] });
}
