# Design prompts — paste into Claude Design in sequence

Run these in order. Paste each prompt verbatim, review the output, make a decision, then move to the next. Do NOT skip ahead — each stage depends on the one before it.

---

## Stage 1 — kickoff + brand exploration

**What to do:** Open a brand-new Claude chat. Paste the entire contents of `design-brief.md` first. Then paste the prompt below in the same message.

```
Above is the full design brief for the product I'm building. Read it carefully — every constraint matters.

Before we design anything, I want to explore brand directions. For this first response, give me:

1. **Name candidates — 8 options.** For each, write the name, a two-word descriptor (e.g. "quiet / editorial"), and one sentence explaining why it fits a premium property-visit tool. Range widely: some serious, some more poetic, some single-word, some two-word. Avoid anything with "Site", "Snap", "Scan", "Pro", "Kit", "Hub", or "App" in it. Don't defend your favorites yet — give me the spread.

2. **Palette directions — 3 distinct options.** For each, give it a name (e.g. "Warm Stone", "Ink & Bone"), 5 hex values with roles (background, surface, text, muted text, accent), and one sentence on the mood. These should feel meaningfully different from each other, not variations of the same idea.

3. **Type pairings — 3 options.** Each pairing = one display serif + one UI sans. Give the actual typeface names (use faces I can get via Google Fonts or open-source equivalents — no paid-only faces). One sentence on why the pairing works.

Do NOT design any screens yet. Do NOT produce a logo yet. I want to pick directions first, then you'll build the full system in the next step.

Output as three clearly-separated sections. Keep it scannable.
```

**After you get the response:** Pick one name, one palette, and one type pairing. Reply telling it your picks, then move to Stage 2.

---

## Stage 2 — lock the brand system

**What to do:** After you've told it your picks in Stage 1, paste this prompt.

```
Good. Now build the full brand system around those choices. I need:

1. **Final name + tagline.** Confirm the name and propose 3 tagline options (under 8 words each). Pick one as the primary recommendation.

2. **Voice & tone.** 5 adjectives. Then rewrite these five pieces of microcopy in the voice:
   - Home empty state: currently "No projects yet. Tap + New Project to start one."
   - Save toast: currently "Saved"
   - Delete confirm title: currently "Delete project?"
   - Export success toast: currently "Report shared"
   - Finish Project button label: currently "✓ Finish Project"

3. **Full color palette — 7 tokens with hex.** Expand the direction I picked to: background, surface, surface-2, text, text-muted, text-subtle, border, border-strong, accent, accent-contrast, success, danger. Note which are for light mode and whether this palette could support dark mode later.

4. **Type system.** Confirm the two faces. Then give me a mobile type scale with: use case, font family, weight, size (px), line-height. Include: display (page titles), title (section), body, caption, micro.

5. **Design tokens block.** At the very end, output a CSS custom-properties block I can drop straight into my stylesheet. Use these exact variable names:

--bg, --surface, --surface-2, --border, --border-strong, --text, --text-muted, --text-subtle, --accent, --accent-contrast, --success, --danger, --font-display, --font-ui, --radius, --radius-sm

Make --radius and --radius-sm feel right for the editorial direction (not the generic 14px/10px I'm using now). Every variable must have a value.

Still no logo, still no screens. Just the system.
```

**After you get the response:** Copy the tokens block and the microcopy rewrites into a reply to me (in the Cowork chat) — I'll wire them into the CSS immediately so the app is already half-reskinned before you move on.

---

## Stage 3 — logo, wordmark, and app icon

**What to do:** Paste this next.

```
Now design the visual identity. I need three things, delivered as SVG code I can paste into files:

1. **Wordmark.** The full product name, set in the display serif we chose, with any subtle treatment you think appropriate (custom ligature, slight letterspacing, small decorative element). Single-color. Give me the SVG with viewBox set so it scales cleanly. Include both a black version (for light backgrounds) and a white version (for dark/reversed use).

2. **Compact mark / monogram.** A square-safe mark — could be a monogram, a glyph, or a minimal symbol — that works as an app icon and PDF header. Must read at 32×32. Give me the SVG, viewBox "0 0 512 512", centered with ~12% safe padding on all sides.

3. **Maskable app icon.** Same mark, but with safe-zone padding respected (content fits inside a centered 80%-diameter circle) and a full-bleed brand-color background. viewBox "0 0 512 512". This is what becomes the iPhone home-screen icon, so it has to look confident at small sizes.

For each SVG, output it inside a fenced code block with a filename as the first line comment, e.g.:

```svg
<!-- wordmark-black.svg -->
<svg ...>...</svg>
```

Filenames I want:
- wordmark-black.svg
- wordmark-white.svg
- mark.svg
- icon-maskable.svg

Keep paths clean — no raster embeds, no filter effects that won't render in a PDF, no gradients unless they're essential to the identity. These need to be production assets, not sketches.
```

**After you get the response:** Save each SVG as its own file in your repo. Paste me a message saying "Logos are in the repo at `<paths>`" and I'll wire them into the header, regenerate the PNG icon files at the right sizes, and update the manifest.

---

## Stage 4 — UI screen redesign

**What to do:** Paste this next.

```
Now redesign the four app screens using the brand system we've locked in. The screens, their elements, and their interactions are documented in the brief.

For each screen, produce:

1. **Mockup.** Deliver as HTML + inline CSS in a single fenced code block I can preview. Target width 390px (iPhone), full-bleed. Use the CSS variables we defined (--bg, --accent, --font-display, etc.) so the theme is consistent. Use real placeholder content that feels like a property walkthrough — not lorem ipsum. For photos, use colored rectangles or linear-gradient backgrounds with representative captions ("Kitchen — north wall", "Bathroom ceiling stain", "Primary bedroom window"); do not hotlink external images.

2. **Notes.** Under each mockup, a short section: "Interactions" (what taps do what), "States" (what happens when empty / loading / errored), and "Why" (2-3 sentences on the design choices).

Screens to design, in this order:

**A. Home** — project list. Show both the populated state (4-5 projects, mix of in_progress and finished) and the empty state. Include the topbar, the "+ New Project" CTA, and the long-press-to-delete affordance if visible.

**B. Capture** — the working screen. Show three states:
   - Empty (no media captured yet, placeholder in stage)
   - With a photo loaded and title/description partially filled
   - The prominent "Finish Project" button must feel like a decisive, earned action — not a destructive one. Make sure it reads as the primary celebratory moment of a visit.

**C. Report** — project summary. Show the project header, the media grid (mix of photos and videos), the reorder-mode state, and the Export Report / Add More actions.

**D. Detail** — single media full-bleed with editable caption below, prev/next, delete.

Use the voice we established for every piece of copy. Use the type scale. Lean into the editorial aesthetic — generous whitespace, serif display type for screen headings, photography-as-hero.

One rule: do not invent new data fields or features that aren't already in the brief. Redesign what exists; don't scope-creep.
```

**After you get the response:** Paste the four HTML mockups back to me in the Cowork chat. I'll reshape `index.html` and the CSS to match, keeping the JS (IDs, event handlers, data flow) intact.

---

## Stage 5 — PDF report template

**What to do:** Paste this last.

```
Final piece. Design the PDF report template. This is the primary artifact users share with clients — it has to look better than the app itself.

Context: the PDF is generated by jsPDF in the browser. I draw primitives directly — text, rectangles, images. No HTML-to-PDF; no external assets at render time. So I need a spec I can translate into drawing calls, not a web mockup.

Deliver:

1. **Cover page layout** — draw it as an HTML/CSS approximation at letter size (816×1056px, 72dpi). Include: project name, address, visit date, item count, brand wordmark, and an optional hero photo block. Show exact positions (margin from top/left in px), font sizes, and colors using our tokens.

2. **Photos section** — show one full page of the photos grid. 2 columns. Each cell = image + title + description. Specify: column gap, row gap, image aspect ratio, caption spacing below image, title size/weight, description size/weight/color. Show how the section heading ("Photos") is styled and how it repeats as "Photos (continued)" on overflow pages.

3. **Videos section** — same treatment. The "VIDEO" badge on each still: specify position, size, padding, background, text color.

4. **Footer** — small muted line at bottom of every page. Specify exact text format, font size, color, distance from bottom edge.

5. **Spec table.** After the visuals, a table summarizing every measurement: margin-top, margin-bottom, margin-sides, column-gap, row-gap, image aspect ratio, heading font/size/weight, body font/size/weight, caption font/size/weight, footer font/size/weight, page background, heading color, body color, muted color.

The spec table is the most important deliverable — it's what I translate into jsPDF calls. Be exhaustive; don't leave anything to interpretation.
```

**After you get the response:** Paste the spec table back to me. I'll rewrite `buildPdf()` to match exactly. The PDF redesign is mostly a careful translation job once the spec is specific enough.

---

## After all five stages

You'll have, in order:
1. A chosen name, palette, and type pairing
2. A full design tokens block + microcopy + type scale
3. Four SVG brand files
4. Four HTML screen mockups with notes
5. A PDF layout spec

Paste each deliverable into the Cowork chat as you collect it. Don't wait until the end — it's faster for me to wire pieces in as they land so you can see the brand taking shape in the real app along the way.
