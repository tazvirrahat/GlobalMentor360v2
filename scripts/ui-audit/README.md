# UI audit

Checks the running app against the project's WCAG 2.2 AA accessibility and layout bar.

Needs the dev server on `http://localhost:3000` (override with `BASE=`) and a seeded
database (`npm run db:seed`). Signs in as the three seed accounts through the auth API.

| Command | What it does |
|---|---|
| `npm run ui-audit` | Every route × 1440px and 375px, as the role that can see it. Writes `design-review/ui-audit/results.json` and full-page screenshots in `design-review/ui-audit/shots/` (gitignored). `ONLY=home,catalog` limits the routes. |
| `npm run ui-audit:summary` | One screen of findings from the last run. |
| `npm run ui-audit:keyboard` | Tab order, focus visibility and reflow on seven key pages. Exits non-zero on any problem. |

What is checked:

- axe-core with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags.
- 1.4.10 Reflow: horizontal overflow at 375px, and at 320px in the keyboard pass.
- 2.5.8 Target Size (Minimum): interactive elements under 24×24. Inline links in running text are exempt.
- Text under 13px (the project minimum; WCAG sets no size, this is the spec's floor).
- One `h1` and a `<main>` per page.
- Console errors and 4xx/5xx responses.
- 2.4.3 / 2.4.7 / 2.4.11: first Tab reaches the skip link, every stop shows focus, and nothing covers it.

Automated checks catch roughly a third of accessibility problems. Screen-reader and
zoom passes are still manual.
