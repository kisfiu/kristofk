# Agent guide: KK, Kristóf's 2000s-desktop site

Read this first. It replaces a full read of the repo: the map tells you which file to open, and the
gotchas below each cost an earlier session real time. Keep it current when you change how things work.

## What it is
- A personal site styled as an early-2000s desktop. Audience: recruiters, NGO/Rotary contacts, friends. **English only.**
- Live: https://kisfiu.github.io/kristofk/ (GitHub user `kisfiu`, repo `kristofk`; the repo name is kept on purpose).
- Static Astro 7 + TypeScript strict + XP.css. No framework, no backend. Plain TS modules and platform APIs
  (Popover, View Transitions, Pointer Events, `@starting-style`, container queries, `:has()`, `@layer xp, os`).
- Load: one visitor per tab, low traffic. The only third-party call is Open-Meteo from the visitor's browser.

## Owner rules (non-negotiable)
1. **Ask before every commit and push.** Stage explicit paths, never `git add -A`.
   If other work is in progress in the tree, stage only your own hunks (`git apply --cached <patch>`).
2. **No phone number anywhere public.** The public CV says "Tel: on request" (`tools/make-public-cv.py`).
3. Commits are authored with his GitHub noreply address (repo-local git config). Never put work emails in the repo.
4. `.npmrc` pins public npm. `package-lock.json` must only reference `registry.npmjs.org`
   (the machine's default registry is a private mirror; CI can't reach it).
5. No sound that plays by itself. Keep Estonian low-key, no GitHub profile link, "Arrange icons" only in the
   desktop right-click menu (not the Start menu).

## Commands
```bash
npm run lint && npm run check && npm run test:unit      # Biome, astro check, Vitest (src/**/*.test.ts)
npm run build && npx playwright test                     # e2e runs against dist/ via astro preview :4322
BASE_PATH=/kristofk npm run build && BASE_PATH=/kristofk npx playwright test   # as deployed
npm run build && npm run lighthouse                      # perf/a11y/BP/SEO must each be >= 0.9
```
- **Always build before Playwright.** It serves whatever is in `dist/`. Build last with the base path you test.
- Playwright reuses a server already on port 4322. If another session is testing at the same time, you test
  their build. Check `curl localhost:4322` first, or run your own copy in a worktree on another port.
- Some skipped tests are normal: phone-only or desktop-only cases, and the screenshot helper.
  `SHOTS=<dir> npx playwright test -g screenshots` saves review screenshots.
- Dev server: `npm run dev` (port 4321), or `.claude/launch.json` entry `kk-site` in the parent playground.

## Map: where things live
| Job | File |
|---|---|
| Page shell, boot, welcome, taskbar, Start menu, wallpaper, windows | `src/pages/index.astro` |
| Windows, icons (drag, grid snap, selection), calendar, balloons, boot/log on/shut down, talking animals | `src/scripts/desktop.ts` (exports `open`, `store`, `Role`, `role`) |
| Racka the helper (menu, tour, tips, R key) | `src/scripts/helper.ts`, `src/components/Helper.astro` |
| Live weather fetch, tray, Weather window, lightning bolt mover | `src/scripts/weather.ts` |
| WMO code → look (`clear partly cloudy fog rain snow storm`), labels, icons | `src/scripts/weather-codes.ts` (+ test) |
| Pipeline Green game | `pipeline-logic.ts` (+ test), `pipeline-ui.ts`, `components/Pipeline.astro` |
| Games folder: the Windows XP games remade (plan: `~/.claude/plans/i-d-like-to-copy-effervescent-boole.md`; XP rules exactly, own art and text) | `content/items/games.md` + items with `parent: games`. Shared: `components/MenuBar.astro` + `menubar.ts` (XP menus, F-key shortcuts while the window is active), `lazy.ts` (`whenOpen`: a game's code loads on first open), `sound.ts` (beeps, off until turned on), `scores.ts` (records, own try/catch), `.xp-dialog` styles |
| Cards for the card games | `cards.ts` (deck, shuffle, names; pure), `card-art.ts` (faces and 6 backs as SVG strings, drawn at runtime: courts are stork/Racka/grey cattle) |
| Solitaire (XP Klondike, Standard/Vegas/None scoring) | `solitaire-logic.ts` (+ test, one per XP rule), `solitaire-ui.ts` (absolute-positioned cards, drag only captures once moved so double-click still hits the card, canvas bouncing-card win), `components/Solitaire.astro` |
| FreeCell (XP rules, our own deal numbers 1–1,000,000) | `freecell-logic.ts` (+ test: supermove formula, autoplay safety, legal moves, statistics), `freecell-ui.ts` (click to pick, click to drop; keys 1–8/0/9; Racka in the top row looks towards the mouse), `components/FreeCell.astro` |
| Wall Sweeper (XP Minesweeper) | `sweeper-logic.ts` (+ test, one per XP rule), `sweeper-ui.ts` (mouse chords via `buttons`, touch long-press marks), `components/Sweeper.astro` |
| Renovator XP game: **hidden** since 2026-11-18 (no content item), code kept for reuse | `renovation-logic.ts`, `renovation-games.ts`, `renovation-play.ts`, `renovation-ui.ts`, tests next to them, `components/Renovation.astro` |
| Internet window (dial-up → surf → favorites) | `internet-ui.ts`, `components/Internet.astro`, `public/surf/` (made by `tools/make-surf.py`) |
| All styles | `src/styles/os.css` (one file, sections marked `/* ---------- name ---------- */`) |
| Icon sprite | `src/components/Icons.astro` (`<symbol id="i-…">`) |
| Window content | `src/content/items/*.md`, schema in `src/content.config.ts`, fields in `README.md` |
| Browser tests | `tests/smoke.spec.ts` (desktop + Pixel 7 projects) |
| CI/deploy | `.github/workflows/deploy.yml`, `lighthouserc.json`, `.github/dependabot.yml` |

Storage keys: sessionStorage `kk-booted`, `kk-role`, `kk-balloon`, `kk-helper` (`off`/`greeted`);
localStorage `kk-visits`, `kk-icons` (`kk-icons-phone` on phones), `kk-sound` (`on`/`off`, all games), `kk-sweeper` (options), `kk-sweeper-best` (records), `kk-solitaire` (options, card back), `kk-solitaire-vegas` (Keep score total), `kk-freecell` (options), `kk-freecell-stats`; game keys use `scores.ts`/`sound.ts`, which have their own try/catch so the game modules stay testable without the desktop. Always go through `store.get/set` (private mode throws).

## How common requests are done
- **New window or text change:** add or edit a Markdown file in `src/content/items/`. A new icon goes in `Icons.astro`.
  The smoke test "every desktop icon and folder item opens its window" lists all icons, so update it.
- **New app window:** add the value to the `app` enum in `content.config.ts`, then a component and a branch in `index.astro`.
- **Wallpaper / weather look:** see the next section.
- **Talking animal lines:** `sayings` in `desktop.ts`. Racka's lines: `tips`, `tour`, `who` in `helper.ts`.
  Facts about Kristóf must come from his CV or what he said. Don't invent achievements.
- **After any visible change:** screenshot it with Playwright (mock the weather route) and show it.
  The owner checks visuals, and wording matters to him.

## Wallpaper system
- Six AI-generated photos in `src/assets/wallpaper/*.avif` (1689 × 931, **identical layout**):
  `sun`, `partly`, `overcast`, `snow`, `night`, `night-cloudy`. `os.css` picks one from `html[data-weather]`
  and `html[data-daylight]`, as the background of the inline click map `assets/wallpaper/animals.svg`.
- `animals.svg` has invisible `rect.animal.cow|sheep|black|stork` boxes in photo pixels. Clicks are found with
  `elementsFromPoint` because the desktop covers the wallpaper. `.storks` hide at night and in snow.
- Weather effects are overlays on `.weather` (`::before` tint, `::after` rain/snow tiles, `.bolt` + flash for storms).
  Night-specific tints exist for fog and storm.
- **Adding a photo:** generate it as an edit of `sun` ("keep every object in exactly the same place"), check
  alignment against the click boxes, convert with sharp (`.avif({ quality: 45, effort: 6 })`, ~40–110 KB),
  add the CSS rule, then update the Weather window text (`content/items/weather.md`) and the weather test.
  Big images fail Lighthouse: WebP at 270 KB scored performance 0.89.
- Screenshots of every look are kept locally in `samples/weather/` (git-ignored).

## Gotchas (each one cost a session time)
- Lightning CSS: XP.css has one invalid selector, so `errorRecovery` is on. Never put `font-stretch` in a `font` shorthand.
- View Transitions swallow clicks: use them only for boot/shutdown. Windows animate with `@starting-style`.
- Endless animations (Racka bob, rain) break "wait until animations finish". Use `settled()` in the tests.
- Tests mock Open-Meteo in `beforeEach` (clear day) and set `kk-helper=off` unless the URL has `?racka`.
  The `afterEach` fails on any console error.
- `decodeURIComponent` on the URL hash threw on `#%` and stopped every script. Window ids are plain slugs.
- CSS `url()` to `src/assets` gets the base path and hash. Files in `public/` need relative paths (no leading `/`).
- Lighthouse in CI needs `--no-sandbox` (already in `lighthouserc.json`).
- TypeScript 7 is blocked: `astro check` supports TS 5/6 only (Dependabot ignores TS majors).
- On phones, a tap near an icon snaps onto it, so animal tests pick points no icon covers.
- XP.css draws radios and checkboxes itself; the real inputs are invisible, so tests click the `<label>`, not `.check()`.
- Game dialogs (`<dialog>`) take Esc themselves: `desktop.ts` doesn't close the window while a `dialog[open]` exists.
- A key or click that starts an effect must not also hit the listener the effect adds: add "any key stops it" listeners on the next frame.

## Definition of done
1. Lint, type check and unit tests are clean. The e2e suite passes at `/` **and** `/kristofk`.
2. Lighthouse runs if you added assets or scripts that load at startup.
3. Tests cover new logic (one good test), and README / the Weather window / Racka text match what changed.
4. Screenshot shown, then ask to commit. After a push, check the GitHub run and the live site
   (deploy takes about 2–3 minutes).

Astro docs: https://docs.astro.build
