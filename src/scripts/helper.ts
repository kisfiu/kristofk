import { open, store } from "./desktop";

// Racka, Kristóf's helper and guide to the site: slides in from the bottom right, introduces itself,
// and offers a guided tour, a short intro to Kristóf, a shortcut for the visitor's role and tips.
type Role = "recruiter" | "nonprofit" | "guest";
type Choice = [label: string, run: () => void];

const shortcut: Record<Role, [label: string, window: string]> = {
  recruiter: ["Open his resume", "resume"],
  nonprofit: ["Show his NGOs", "ngos"],
  guest: ["Play Pipeline Green", "pipeline-green"],
};
const tips = [
  "The wallpaper follows the real weather at Hortobágy, right now. Come back at night!",
  "Drag icons to move them around, or drag on empty space to select several. Arrow keys work too, and Start → Arrange icons tidies up.",
  "Windows can be resized from their bottom-right corner, and moved by their title bar.",
  "The Nine-hole Bridge on the wallpaper has only eight holes. Don't tell anyone.",
  "The Internet icon has a surprise. Surf's up!",
];
const tour: { text: string; spot?: string }[] = [
  {
    text: "These are the desktop icons. Double-click one to open it (one tap on a phone), drag it to move it, or drag on empty space to select several.",
    spot: ".desktop > .icons",
  },
  { text: "The Start menu lists everything in one place, plus Log off and Shut down.", spot: ".start" },
  {
    text: "This is the live weather at Hortobágy. The wallpaper follows it, so come back when it rains, or at night!",
    spot: "#weather",
  },
  { text: "Click the clock for a calendar.", spot: "#clock" },
  { text: "Last secret: the cows and sheep on the wallpaper know a thing or two about Kristóf. Click one!" },
];

const root = document.documentElement;
const helper = document.getElementById("helper")!;
const bubble = document.getElementById("helper-bubble")!;
const part = (name: string) => helper.querySelector<HTMLElement>(`[data-helper="${name}"]`)!;
const role = () => store.get(sessionStorage, "kk-role") as Role | null;

function say(text: string, choices: Choice[]) {
  part("text").textContent = text;
  part("actions").replaceChildren(
    ...choices.map(([label, run]) =>
      Object.assign(document.createElement("button"), { type: "button", textContent: label, onclick: run }),
    ),
  );
  bubble.hidden = false;
}

function menu(text = "What would you like to do?") {
  clearSpot();
  const r = role();
  const choices: Choice[] = [
    ["Show me around", () => step(0)],
    ["Who is Kristóf?", who],
  ];
  if (r) {
    const [label, id] = shortcut[r];
    choices.push([label, () => go(id)]);
  }
  choices.push(["Give me a tip", tip], ["Bye, Racka", bye]);
  say(text, choices);
}
const intro = () => menu("Hey, I'm Racka, Kristóf's helper and the guide to this website. What would you like to do?");

function who() {
  say(
    "Kristóf is a Developer Experience Engineer in Budapest: he builds the tools and pipelines other developers use every day. He also co-founded the Invisible School and was Hungary's youngest Rotary club president.",
    [
      ["Open his resume", () => go("resume")],
      ["Back", () => menu()],
    ],
  );
}

let tipNo = 0;
function tip() {
  say(tips[tipNo++ % tips.length], [
    ["Another tip", tip],
    ["Back", () => menu()],
  ]);
}

// the tour points at real parts of the screen; steps whose target isn't shown (e.g. no weather yet) are skipped
let spot: Element | null = null;
function clearSpot() {
  spot?.classList.remove("tour-spot");
  spot = null;
}
function step(i: number) {
  const steps = tour.filter((s) => !s.spot || document.querySelector(s.spot)?.checkVisibility());
  const s = steps[i];
  clearSpot();
  spot = s.spot ? document.querySelector(s.spot) : null;
  spot?.classList.add("tour-spot");
  const last = i === steps.length - 1;
  say(
    `(${i + 1}/${steps.length}) ${s.text}`,
    last
      ? [
          ["Done", hush],
          ["Back to the menu", () => menu()],
        ]
      : [
          ["Next ›", () => step(i + 1)],
          ["Stop the tour", () => menu()],
        ],
  );
}

function go(id: string) {
  hush();
  open(id);
}
function hush() {
  clearSpot();
  bubble.hidden = true;
}
function bye() {
  hush();
  helper.hidden = true; // slides back out
  store.set(sessionStorage, "kk-helper", "off");
}

part("head").addEventListener("click", () => (bubble.hidden ? menu() : hush()));
// the little Racka head in the tray calls him back after "Bye", or opens his menu
document.getElementById("racka-call")!.addEventListener("click", () => {
  if (helper.hidden) {
    store.set(sessionStorage, "kk-helper", "greeted");
    helper.hidden = false; // slides back in
    setTimeout(() => menu("Welcome back! What would you like to do?"), 400);
  } else if (bubble.hidden) menu();
  else hush();
});
part("dismiss").addEventListener("click", bye);
// Esc closes the bubble first, before the desktop uses Esc to close a window
addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape" || bubble.hidden) return;
    hush();
    e.stopImmediatePropagation();
  },
  true,
);

// Racka slides in once the desktop is visible (after boot and the user chooser) and introduces
// itself once per visit; Log off hides it, and "Bye" sends it away for the rest of the visit
const sync = () => {
  const onDesktop = !root.dataset.boot && !root.dataset.welcome;
  helper.hidden = !onDesktop || store.get(sessionStorage, "kk-helper") === "off";
  if (helper.hidden) return hush();
  if (store.get(sessionStorage, "kk-helper") !== "greeted") {
    store.set(sessionStorage, "kk-helper", "greeted");
    setTimeout(() => !helper.hidden && intro(), 1_200);
  }
};
new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-boot", "data-welcome"] });
sync();
