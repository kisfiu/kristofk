# KK · kisfiu.github.io

Kristóf Kovács's personal site, styled as an early-2000s desktop: boot screen, desktop icons, draggable windows, taskbar, Start menu, and a mini game (Pipeline Green).

Live: https://kisfiu.github.io

## Edit content
Every window is one Markdown file in `src/content/items/`. The front matter (checked by the schema in `src/content.config.ts`):

| Field | Meaning |
|---|---|
| `title` | window title |
| `label` | text under the icon (defaults to `title`) |
| `icon` | an icon id from `src/components/Icons.astro` |
| `parent` | where the icon sits: `desktop`, `hobbies`, `ngos`, `other` |
| `order` | sort order inside its parent |
| `folder` | makes this item a folder that lists the items with that `parent` |
| `opens` | shortcut: opens another item instead |
| `width`, `links` | window width in px; link buttons at the bottom |

Deep links work: `/#resume` opens the resume directly and skips the boot screen.

## Commands
```bash
npm run dev        # http://localhost:4321
npm test           # lint, type check, unit tests, build, Playwright
```

## Deploy
Push to `main`; `.github/workflows/deploy.yml` builds, tests, runs Lighthouse and publishes to GitHub Pages (Settings → Pages → Source: GitHub Actions).

Window styles: [XP.css](https://github.com/botoxparty/XP.css) (MIT). Icons and wallpaper are drawn for this site.
