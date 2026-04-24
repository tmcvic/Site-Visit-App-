# HARVEST FieldNotes

A kitchen-ready record of the field.

HARVEST FieldNotes is a mobile-first, offline PWA for HARVEST Clean Eats field teams. Log farm walks, supplier tours, and seasonal sourcing visits by capturing photos and videos with short notes, then deliver a HARVEST-branded PDF report to the kitchen in one tap.

Everything runs on the phone. No account, no cloud, no server logic.

---

## What's in this folder

| File | Purpose |
|---|---|
| `index.html` | The UI shell — HTML + CSS with the approved HARVEST design system |
| `app.js` | All app logic (IndexedDB storage, routing, capture, editing, PDF export) |
| `manifest.json` | PWA metadata (name, icons, start URL, theme color) |
| `sw.js` | Service worker — caches the app, logos, and fonts for offline use |
| `brand/harvest-logo-green.png` | Approved HARVEST Clean Eats logo (dark green on transparent) |
| `brand/harvest-logo-white.png` | Approved HARVEST logo, white version (for dark backgrounds) |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | Home-screen icons |
| `design-brief.md`, `design-prompts.md` | Design system source-of-truth, kept in the repo for reference |

No build step, no npm, no server.

---

## Design system

The app uses the approved HARVEST Clean Eats identity (Pantone 343C / 366C, Oswald + Source Sans 3). The brand tokens are defined as CSS variables at the top of `index.html`:

- `--ink` `#185641` — primary (Harvest Dark Green, Pantone 343C)
- `--accent` `#B5DB78` — secondary / accent (Harvest Light Green, Pantone 366C)
- `--paper` `#FFFFFF` — background
- `--paper-alt` `#EDF4E2` — surface wash
- `--ink-muted` `#4B6B5A` — secondary text
- `--stone` `#9FB48A` — tertiary / eyebrow
- `--rule` `#D5E5BF` — borders
- `--danger` `#A03524` — destructive actions (sparingly)

Type: **Oswald** for display headings (uppercase, semibold), **Source Sans 3** for all UI text.

The logo is the approved HARVEST PNG — never recreated, recolored, cropped, or stylized.

---

## Deploy it

The app is a folder of static files. Easiest path: **GitHub Pages**.

1. `git push` the repo to GitHub.
2. **Settings → Pages → Branch: `main` / `/ (root)` → Save.**
3. GitHub gives you a URL like `https://<user>.github.io/site-visit-app/`.

HTTPS is required for camera access and the service worker. GitHub Pages handles this automatically. Cloudflare Pages, Netlify Drop, and Vercel work the same way.

---

## Install on iPhone

1. Open the deploy URL in **Safari** (only Safari installs PWAs on iOS).
2. Share → **Add to Home Screen** → Add.
3. The app launches fullscreen from the home screen with its own icon.
4. Open it once while online so the service worker caches everything. After that it works fully offline.

---

## How to use it

- **Start a tour** on Home to begin a new walk. Give the farm/site a name, and optionally a location.
- **Capture** — tap Photo or Video to invoke the camera, write a short title and note, then **Save & next** for the next record. Fields and text can be updated later.
- **Close tour** — the prominent green button finishes the walk and flips to the report view.
- **Report** — project header with photo/video/record counts, then a numbered grid of records. Tap a record to edit its title and notes. Tap the handle (⋮⋮) top-right to reorder by drag. Tap **Add more** to resume capturing.
- **Export report** — generates the HARVEST-branded PDF. On iPhone this opens the Share sheet; Save to Files → iCloud Drive gets it into a persistent folder automatically.

## Voice

Copy is grounded and practical — "Logged.", "No walks logged yet. Start one when you get to the farm.", "Field report ready." Never cute, never salesy. Written like a farmer, not a marketer.

---

## Where the data lives

All tours and media live in **IndexedDB** on the device. Photos and videos are stored as raw Blobs. Nothing leaves the phone unless the user explicitly exports and shares the PDF.

iOS Safari caps PWA storage around **1 GB** before prompting. A 1-minute 4K video is ~350 MB, so long videos fill storage fast. Mitigation: export the PDF after each tour, then delete old tours from the home screen (long-press a card).

---

## Offline behavior

- First load requires internet so the service worker can cache the app shell, HARVEST logos, jsPDF, and Google Fonts.
- After that: capture, edit, reorder, and PDF export all work offline.
- On each `CACHE_VERSION` bump in `sw.js`, existing installs pull the new code on next launch.

---

## PDF report template

Letter-size, HARVEST-branded, built for client delivery:

- **Top masthead bar** — 8pt Harvest Light Green across the top of every page.
- **Cover** — approved logo top-left, "Farm visit report" eyebrow, hero image (first photo of the tour), uppercase display title, address and context line, four-column meta grid (Prepared by · Visit date · Photographs · Videos).
- **Photographs section** — "Field records" display heading with accent bar, 2-column 4:3 grid, each cell numbered ("No. 01") with title and notes.
- **Video record section** — identical grid with VIDEO chip on each still. A PDF can't play video, so the still + caption is the representation.
- **Page footer on every interior page** — unaltered HARVEST logo, tour name centered, page number right.

The PDF is the primary artifact users share — it's treated as a premium deliverable, not a printout.

---

## Known limitations

- Photos are stored and embedded at scaled resolution (down-sampled to ~1400px long edge for PDF to keep file sizes reasonable).
- Videos are represented in the PDF as a still frame + caption. Delivering actual footage is a future enhancement.
- No multi-device sync. Export regularly.
- Single-user, single-device.
