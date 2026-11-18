# KK · Kristóf Kovács

Kristóf Kovács's personal site, styled as an early-2000s desktop: boot screen, user chooser, desktop icons you can drag, windows you can move and resize, taskbar with clock and calendar, Start menu, Racka the helper sheep, a Hortobágy wallpaper that follows the live weather, talking animals, and a mini game (Pipeline Green).

Live: https://kisfiu.github.io/kristofk/

## Edit content
Every window is one Markdown file in `src/content/items/`. The front matter (checked by the schema in `src/content.config.ts`):

| Field | Meaning |
|---|---|
| `title` | window title |
| `label` | text under the icon (defaults to `title`) |
| `icon` | an icon id from `src/components/Icons.astro` |
| `parent` | where the icon sits: `desktop`, `hobbies`, `ngos`, `other`, `games` |
| `order` | sort order inside its parent |
| `folder` | makes this item a folder that lists the items with that `parent`; any text in the file shows as a note above the icons |
| `opens` | shortcut: opens another item instead |
| `app` | a built-in app instead of text: `pipeline`, `internet`, `renovation` (hidden: no item uses it), `sweeper` |
| `width`, `links` | window width in px; link buttons pinned at the bottom |

Deep links open a window directly and skip the boot screen, e.g. https://kisfiu.github.io/kristofk/#resume

## Update the CV
The public PDF hides the phone number ("Tel: on request"). Make it from the original:
```bash
python3 tools/make-public-cv.py ~/Downloads/your-cv.pdf
```

## Commands
```bash
npm run dev        # http://localhost:4321
npm test           # lint, type check, unit tests, build, Playwright
```

## Deploy
Push to `main`; `.github/workflows/deploy.yml` builds, tests, runs Lighthouse and publishes to GitHub Pages (Settings → Pages → Source: GitHub Actions). The base path (`/kristofk/`) comes from the repository name.

Window styles: [XP.css](https://github.com/botoxparty/XP.css) (MIT). Icons and Racka are drawn for this site; the Hortobágy wallpapers are AI-generated for it. Live weather: [Open-Meteo](https://open-meteo.com/).
