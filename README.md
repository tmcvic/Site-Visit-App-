# Site Visit

A tiny, neutral, offline-first PWA for capturing photos and videos on site visits, writing short captions, reordering, and exporting a PDF report (bundled in a ZIP with the original media).

Everything runs on your phone. No account, no cloud, no server logic.

---

## What's in this folder

| File | Purpose |
|---|---|
| `index.html` | The UI shell — HTML + CSS |
| `app.js` | All app logic (IndexedDB storage, routing, capture, editing, export) |
| `manifest.json` | PWA metadata (name, icons, start URL) |
| `sw.js` | Service worker — caches the app for offline use |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | Home-screen icons |

That's the entire app. No build step, no npm, no server.

---

## Deploy it (free, 5 minutes)

The app is a folder of static files, so any static host works. Easiest path: **GitHub Pages**.

1. Create a new GitHub repository — call it whatever, e.g. `site-visit-app`.
2. Drag every file from this folder into the repo (or `git push` them).
3. In the repo on GitHub: **Settings → Pages → Branch: `main` / `/ (root)` → Save**.
4. Wait ~30 seconds. GitHub gives you a URL like `https://<your-username>.github.io/site-visit-app/`.

The app needs to be served over **HTTPS** for camera access and service workers to work. GitHub Pages handles this automatically.

Other free options that work the same way: **Cloudflare Pages**, **Netlify Drop** (drag-and-drop the folder at `app.netlify.com/drop`), or **Vercel**.

---

## Install on iPhone

1. Open the GitHub Pages URL in **Safari** (not Chrome — only Safari can install PWAs on iOS).
2. Tap the **Share** button → **Add to Home Screen** → Add.
3. The app now lives on your home screen with its own icon. Launches fullscreen, hides the Safari UI.
4. Open it once while online so the service worker caches everything. After that, it works completely offline.

---

## How to use it

- **New Project** on the home screen creates a project. Give it a name and (optionally) an address. The visit date is auto-stamped.
- The **Capture screen** is where you take photos and videos. Each one gets a title and description. Tap **Save & Next** to add another. Tap the **✓** in the top-right to finish the project.
- The **Report view** shows all media in a grid. Tap any tile to edit its title/description, swipe Back/Next through the collection, or delete it.
- Tap **⇅** in the report view top-right to enter reorder mode. **Long-press and drag** a tile to move it. Tap **⇅** again to save the new order.
- Tap **+ Add More** to resume capturing in a finished project.
- **Export Report** produces a ZIP file:
  - `report.pdf` — cover with project name, address, date, then a 2-column grid of photos with captions. Videos show a thumbnail with a VIDEO badge and a reference to the file in the `media/` folder.
  - `media/` — all originals (photos + videos), renamed with their order and title.

On iPhone, tapping Export Report opens Apple's **Share sheet** directly. From there:
- **Save to Files → iCloud Drive → [pick a folder]** backs the ZIP up to iCloud automatically (syncs to your Mac).
- **Mail / Messages / AirDrop** sends the ZIP to someone.
- **Dropbox / Google Drive** (if installed) uploads directly.

If you want every export to land in the same iCloud folder, make a folder once (e.g. `iCloud Drive / Site Visits`) and just tap it each time the Share sheet opens.

---

## Where the data lives

All projects and media live in **IndexedDB** inside Safari's storage for this app, on your phone. Specifically:
- Photos and videos are stored as raw **Blobs**, not re-encoded.
- Nothing leaves your phone unless you explicitly export and share the ZIP.

### Storage limits to be aware of

iOS Safari roughly caps PWA storage around **1 GB** before prompting. A 1-minute 4K video can be ~350 MB. If you're capturing long videos, you'll hit the ceiling fast.

Mitigations baked into the workflow:
1. **Export after each site visit.** Once you've got the ZIP, you have the originals in iCloud / Files / email — you don't need them in the app anymore.
2. **Delete finished projects.** Long-press (desktop) or right-click a project card on the home screen to delete it. (On iOS, you can add a delete button to the detail page later if needed.)

If you want a harder limit removal, the fallback is a native iOS app built in Xcode — happy to build that as v2 if you outgrow the PWA.

---

## Offline behavior

- **First load requires internet** so the service worker can cache the app and its two external libraries (jsPDF, JSZip).
- After that, everything works offline: capturing, editing, reordering, PDF export, ZIP export.
- Updates: when you push new code to the repo, the service worker picks up the new version on next launch (give it one refresh).

---

## Known limitations (v1)

- Photos are stored at full resolution — storage fills quickly with lots of 4K photos. Could add a "compress on capture" setting later.
- Videos in the PDF show a thumbnail but aren't playable *inside* the PDF — you share the video file separately from the ZIP's `media/` folder. This is intentional (embedded video in PDF is unreliable across readers).
- No multi-device sync. If you wipe the app, the projects are gone. Export your ZIP regularly.
- No auth, no sharing links, no team features. Single-user, single-device.

---

## If you want to change the design

Everything visual lives in the `<style>` block at the top of `index.html`. The color tokens are CSS variables at the top (`--bg`, `--text`, `--accent`, etc.) — change the accent once and the whole app reflects it. Fonts are stacked system fonts by default.
