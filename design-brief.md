# Design Brief — Property Visit App (working title)

## One-liner
A mobile-first, offline-capable PWA that helps real-estate and property professionals document site visits with photos, videos, and notes — then export a polished, client-ready PDF report in a single tap.

## Target user
Property managers, real-estate agents, home inspectors, landlords, and leasing coordinators walking a unit or building and documenting its condition. Used on-site, on an iPhone, single-handed, often with spotty cellular. Common scenarios: pre-lease walkthroughs, move-out condition reports, pre-listing property surveys, turnover inspections.

## Core flows (already built — needs redesign, not re-architecture)
1. **Home** — list of projects, each project = one site visit. "+ New Project" primary action; new-project modal asks for name + optional address. Projects have status `in_progress` or `finished`.
2. **Capture** — the working screen during a visit. Tap Photo or Video to invoke the native camera, add title + description, Save or Save & Next. A prominent "Finish Project" button closes the visit. All media is saved locally the moment it's captured.
3. **Report** — grid view of all captured media for a project. Drag to reorder (with long-press on touch). Tap a tile to open Detail. "Export Report" generates a PDF; "Add More" reopens capture.
4. **Detail** — full-bleed media view of one item with editable title/description, prev/next navigation, delete.

## Technical constraints (non-negotiable)
- **iOS-installed PWA.** Must feel like a native app, not a website. Respect safe areas (notch, home indicator).
- **Offline-first.** All data lives in IndexedDB; photos/videos are stored as Blobs. No backend (yet).
- **Vanilla HTML/CSS/JS, single page.** No React, no build step. CSS variables for theming are welcome.
- **Touch targets ≥44pt.** One-handed portrait use is the default.
- **Primary device: iPhone.** Layout assumes 390–430px wide. Desktop is nice-to-have, not a requirement.

## Visual direction
**Premium / editorial.** Reference aesthetic: The Modern House, Kinfolk, Cereal magazine, Compass's editorial side, Airbnb Plus photography. Cues:
- Serif display typography (think Canela, Tiempos, GT Super, or a capable free alternative like Fraunces).
- A restrained sans for UI (Inter, Söhne, or system-ui done well).
- Warm off-white backgrounds, deep charcoals for text, one confident accent — a muted terracotta, deep forest, or ink navy.
- Generous whitespace; photography-forward layouts where the user's captured media is the hero.
- Feels like something a boutique brokerage would hand a high-end client — not a contractor's checklist app.

## Deliverables
### 1. Brand identity
- **Name + tagline.** 2–4-word product name. Premium, real-estate-adjacent, not cheesy. Avoid "Site", "Snap", "Scan", "Pro", "Kit".
- **Logo.** Wordmark + compact mark (for app icon and PDF header). Black, white, reversed.
- **Color palette.** 4–6 colors with hex and usage notes: background, surface, text, muted text, accent, border.
- **Typography.** One display serif, one UI face. Mobile type scale (display, title, body, caption, micro) with weights and line-heights.
- **Voice + tone.** 3–5 adjectives plus example microcopy for: empty state on Home, save toast, delete confirmation, export success.
- **App icon.** 512×512 square + 512×512 maskable (safe zone respected).

### 2. UI redesign
Mobile mockups (390×844) for every screen below. Include happy path, empty state, and one loading/error state per screen. Short interaction notes per screen.
- **Home** — project list (grid or list — propose which is better and why), new-project modal, empty state, long-press delete confirmation.
- **Capture** — media stage with live preview, photo/video capture row, title + description fields, Save + Save & Next, and the "Finish Project" button (must feel decisive and earned, not alarming).
- **Report** — project header (name, address, date, count), media grid, reorder mode affordance, export and add-more actions, delete-project option.
- **Detail** — full-bleed media, editable caption, prev/next, delete.
- Plus: toast, spinner overlay, confirmation modal.

### 3. PDF report template
The PDF is the primary artifact users share with clients — it must look better than the app itself. Letter-size. Structure:
- **Cover** — project name in display serif, address, visit date, item count, brand mark. Hero cover image (first captured photo) optional.
- **Photos section** — "Photos" heading, 2-column grid. Each cell: image + title (bold) + description. Continues across pages with "(continued)" heading.
- **Videos section** — same grid layout, with a "VIDEO" badge on each still (videos can't play in PDF; the thumbnail + caption is the representation).
- **Footer** — small and muted: product name · timestamp · page X of Y.

## Current state (grounding)
The app is live and functional with a neutral placeholder aesthetic — off-white background (#fafaf9), black text, system fonts. The HTML structure is stable; elements have stable IDs (`#view-home`, `#view-capture`, `#view-report`, `#view-detail`, `.btn`, `.btn.primary`, `.btn.success`, `.project-card`, `.report-grid`, etc.) so styling can be rebuilt without touching JS. Feel free to propose structural tweaks if they meaningfully improve the design, but call them out explicitly.

## What would make this excellent
- A strong, defended point of view on typography. Name the faces; don't hedge.
- The PDF template should feel gift-wrapped — like a premium deliverable, not a printout.
- Restraint over features. Fewer, better screens.
- Designs that show empty, loading, and error states, not just happy paths.
- A real icon, not a placeholder glyph.

## Out of scope (for now)
- Authentication, accounts, cloud sync.
- Multi-user or team features.
- Desktop-optimized layouts (mobile is primary).
- Dark mode (but note whether your palette could support it later).
