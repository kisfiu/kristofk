/** An XP message box. The game's markup has a <dialog data-ask> holding [data-ask-title], [data-ask-text] and
 *  [data-ask-buttons]; resolves with the label of the button pressed ("" on Esc). */
export async function ask(root: HTMLElement, title: string, text: string, buttons: string[]): Promise<string> {
  // a message box inside a minimised or closed window would be invisible yet block the whole page: wait until it's shown
  while (root.closest<HTMLElement>(".window")?.hidden) await new Promise((r) => setTimeout(r, 250));
  const d = root.querySelector<HTMLDialogElement>("[data-ask]")!;
  d.querySelector("[data-ask-title]")!.textContent = title;
  d.querySelector("[data-ask-text]")!.textContent = text;
  d.querySelector("[data-ask-buttons]")!.innerHTML = buttons.map((b) => `<button value="${b}">${b}</button>`).join("");
  d.returnValue = "";
  d.showModal();
  return new Promise((done) => d.addEventListener("close", () => done(d.returnValue), { once: true }));
}
