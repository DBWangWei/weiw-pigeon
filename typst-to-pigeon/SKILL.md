---
name: typst-to-pigeon
description: Turn a Typst slide source or PDF deck into a portable Pigeon HTML presentation with an infinite canvas, non-linear navigation, keyboard tools, and a source-grounded concept graph.
---

# Typst to Pigeon

Use this skill when the user has a Typst slide source or PDF deck and wants the Pigeon presentation system generated beside it. The skill preserves the source file, compiles Typst pages or renders PDF pages to SVG, extracts slide metadata and visual wand targets, builds a revisioned manifest and graph, and embeds the assets for offline `file://` opening. It writes one standalone HTML file plus a companion PDF by default; `--embed-pdf` opts into embedding the PDF. `--out-mode multiple` writes the portable folder; `--out-mode zip` writes the folder plus an archive.

Run the entry point from this skill directory. Both formats require Python 3.11+ and Node.js 20.11+. Install `requirements.txt` for Pillow PNG resizing; PDF requirements include it. Typst input also requires Typst with `eval` support and Poppler. PDF input requires `python3 -m pip install -r requirements-pdf.txt`; it does not require Typst or Poppler:

```sh
python3 scripts/typst_to_pigeon.py /path/to/talk.typ
python3 scripts/typst_to_pigeon.py /path/to/talk.pdf
```

The shell launcher in `scripts/typst-to-pigeon.sh` also accepts both formats.
It uses this local skill when run in place; a standalone copy on PATH uses the
globally installed skill. `PIGEON_SKILL_DIR` explicitly overrides either choice.

The default output is `pigeon-{FILENAME}.html` beside the input source, where `FILENAME` is the basename with its last suffix removed (for example, `/talks/my.talk.pdf` produces `/talks/pigeon-my.talk.html`). In `multiple`/`zip` modes, it is the directory `pigeon-{FILENAME}/`. `--output` overrides the file or directory path; single mode appends `.html` unless the path ends in `.html` or `.htm`. An optional `pigeon.toml` beside the source stores persistent build settings, including `out_mode`; see [references/config.md](references/config.md). CLI values take precedence over TOML values. `--single-file` aliases `single`; legacy `--no-zip`/`--zip` select `multiple`/`zip`, and legacy TOML `no_zip` selects those modes if `out_mode` is absent. Use `--config FILE` to choose another config file, and use `--deck-id`, `--title`, and `--navigation /path/to/talk.navigation.json` when those values should be explicit. Replacing an existing file or nonempty directory requires `--force`. Rebuilds stage the new presentation and keep the previous output until compilation, graph generation and bundling succeed.

**`--graph local` is the default.** It is deterministic, offline and does not require credentials. `--graph model` explicitly sends the compiled slide text and every slide rendering to a Responses API provider at build time. The default provider, `codex-config`, honors an explicit provider `env_key`; otherwise it prefers the saved Codex API key over a generic shell key. It respects `CODEX_HOME` and prints the endpoint and credential source without showing the key. Alternatively use `--graph-provider env` with `OPENAI_API_KEY`, optionally `OPENAI_BASE_URL` and `OPENAI_MODEL`. Failed model extraction stops the build; it never silently falls back to a lexical graph. Read [references/graph.md](references/graph.md) for evidence validation, repair and caching.

Title animation defaults to **None**. This omits title-body and title-glyph SVGs entirely. Use `--title-effect text-type` (or split-text, blur-text, shiny-text, gradient-text) to include animation assets. The selector is gray when no title layers are available, and saved browser preferences cannot re-enable omitted assets. Effects animate original SVG title glyphs, so no browser font substitution is needed; these are independent adaptations of selected React Bits designs. Unmatched or image-only titles remain static and are reported in `build-report.json`.

Embedded raster payloads use JPEG quality 90 by default for opaque images and fit within 1366×768 (`--png-size 768p`). `1080p` uses 1920×1080; `original` skips resizing. Pass `--png` to keep PNG payloads, or `--quality N` to change JPEG quality from 1–100. Transparent source images remain PNG automatically so logos and icons retain alpha. Canonical and semantic-tier images share the same processing before hashes/title separation; source PNGs and PDF bytes remain unchanged. Install Pillow via `requirements.txt`.

Pigeon is currently version **1.0.5**. Every generated release includes an **About Pigeon** dialog with the Pigeon icon, author/contact information, and a link to it from the `?` keyboard guide.

Single-file releases omit voice and live Q&A, their scripts and the voice panel.
They embed CSS, icons, all offline runtime scripts, deck data and third-party
notices. PDF embedding is off by default: a companion PDF is written beside the
HTML and the PDF export library is omitted. `--embed-pdf` opts into embedding
the PDF and enables annotated PDF export. HTTP discovers the companion, while
local browsers may require Session → Choose PDF fallback. Missing PDFs must
never prevent slide navigation. For build reports, cached
model graphs, voice or live Q&A use `--out-mode multiple` or `zip`.

Voice recognition is enabled by default in `multiple` and `zip` releases. Mark Typst
content with `assets/pigeon-sem.typ`, configure phrase-to-target rules and
`pop`/`focus`/`spotlight` actions in `pigeon.toml`, and start the generated
folder through `scripts/serve.py` in Chrome. The default backend is local
Whisper; run `python3 scripts/setup_voice.py` once per presenting machine. Use
`--no-voice` to disable recognition while retaining manual actions, or select
the optional Chrome on-device backend with `voice.backend = "browser"`. Read
[references/voice.md](references/voice.md) for the marker, setup and diagnostic
contract.

The original **Camera** slide transition remains the default. `--slide-transition NAME` overrides `slide_transition` in `pigeon.toml`; choices are `camera`, `none`, `fade`, `blur`, `slide`, `zoom`, `pixel`, `staggered-wipe`, and `stack`. The runtime Transition selector changes the current viewing session. Read [references/transitions.md](references/transitions.md) for the React Bits review and supported patterns.

Motion effects are configured separately in `[effects]`. Particle morph defaults
to destination slides in a different section and can be set to `all`, `none`, or
an explicit `particle_morph_slides` list. Rack focus is off by default and can be
enabled from Overview → Motion effects; it steps through the current slide's
semantic or Wand regions while retaining Pigeon's existing overview design.

Typst sources may add a conditional lower-third ticker with
`assets/pigeon-tick.typ`. Import `tick` and `tick-band`; `#tick(kind: "now", ...)`
opens a thread, `tick(kind: "next", ...)` previews the next thread, and
`tick(kind: "done", resolves: "id", ...)` closes one. The supplied example
templates re-export these helpers and call `#tick-band()` from `s`. The band is
emitted only when at least one tick exists, so ticker-free sources keep the
larger body area. A ticker source reserves the same band in Typst/PDF and in
the live player. The live and PDF rows use compact status markers (`● NOW`,
`→ NEXT`, and `✓ DONE`) while keeping the message text left-aligned. Ticker
text is removed from graph/search evidence while the PDF keeps the authored
static copy.

The generated manifest enables the **Mind map** by default. It is the graph
overview selected after the knowledge graph loads; the hierarchy overview is
still available as a tab and is used when graph loading fails.

The generated Pigeon runtime already includes the supported presentation behavior: infinite-canvas and hierarchical/graph overviews, non-linear route detours, keyword and slide-number search, presentation/fullscreen layout, persistent laser, pen, highlighter, eraser, magic-wand emphasis for text/images/tables/takeaways, whiteboards/blackboards, zoom and pan, session import/export, and keyboard navigation. Read [references/runtime.md](references/runtime.md) when changing the runtime or explaining those controls. Read [references/talk-v5-template-map.md](references/talk-v5-template-map.md) to see which hard-won talk-v5 files became reusable template assets and how to shape optional navigation JSON.

The runtime also supports a live Q&A flow: the presenter says “take questions now” (or “take any questions now”) after repeating a question, final transcript segments are grouped and sent through the bounded local organizer API, and the result appears in an authored `_qa` semantic region. Press `Q` to finish the current item and insert a white Q&A page containing the captured list. See the `[qa]` and voice-command sections in [references/config.md](references/config.md).

With a wand object lit, backtick cycles Pop-out, Focus and Spotlight. Focus isolates the artwork on a navy canvas with a warm-yellow border; confidently separable text becomes off-white without reflowing glyphs. Images, tables and uncertain text preserve the original crop. Recognized takeaways start at Spotlight. Escape dismisses emphasis while keeping Wand selected; these transient effects are excluded from sessions and PDF exports.

PDF input preserves the original page artwork and PDF. Titles are inferred conservatively from top placement and font size; uncertain pages stay untitled. Text blocks, embedded images, ruled tables, strongly aligned borderless tables and vector illustrations become wand targets. There is no automatic PDF takeaway recognition. Optional English OCR needs local Tesseract language data; without it, scans retain visual navigation but may lack searchable text. Inspect each page in `build-report.json`. Read [references/input-contract.md](references/input-contract.md) for details.

In Pen mode (`P`), backtick toggles **Pen down mode**: pointer movement draws without holding a button. A compact notice stays at the top right. A single backtick toggles the mode after a 300 ms double-tap window; double-backtick undoes the last drawing in Pen or Diagram mode without changing the tool or Pen down setting. Navigation retains the setting, while switching tools or losing window focus lifts the pen.

Outline pages titled `Overview` or `Outline` are recognized when their body is only a flat bullet or numbered list. Each repeated matching page advances the inferred section number; the list item becomes the current section label. Explicit navigation section metadata wins, and mismatched repeated lists are reported in `build-report.json`.

Press `D` for Diagram mode. It provides an offline Excalidraw-style editor: `V/1` selection, `R/2` rectangle, `D/3` diamond, `O/4` ellipse, `A/5` arrow, `L/6` line, `T/8` text, `H` hand, `S` stroke color, `G` fill, `Shift+T` triangle, `Shift+P` parallelogram, centered shape labels, attached connector endpoints, move/resize handles, and `Cmd/Ctrl+C/V/X/D` copy/paste/cut/duplicate. Diagram operations use the existing undo, session, board, PNG and PDF paths. Escape clears a selection before exiting the mode.

For page geometry, partial/absent metadata, title matching, custom wand targets and linked resources, read [references/input-contract.md](references/input-contract.md). Each page keeps its native dimensions; portrait and mixed-size decks are supported. Custom or computed Typst macros may require explicit navigation overrides. For release verification, use [references/qa-checklist.md](references/qa-checklist.md). The reusable Pigeon shell and icon live in `assets/pigeon-template/`; do not copy generated deck assets or talk-specific demos from an earlier release.

For single-file generation, move the HTML and its companion PDF into an otherwise empty directory and open the HTML locally in Safari/Firefox; check navigation, artwork, overview, companion-PDF discovery, and the disabled annotated PDF action. Use `--embed-pdf` when testing embedded PDF export. For folder generation, inspect `build-report.json`, check that `public/deck/manifest.json` and `public/deck/knowledge-graph.json` have the same revision, confirm `public/deck/embedded-deck.js` exists, and check the output's `index.html` contains no template placeholders. Run `node --check` on the generated JavaScript and serve the folder with `python3 scripts/serve.py` for live voice rehearsal. Report the checks actually performed; DOM tests and compilation do not prove browser rendering.

Export the whole annotated deck through **Export PDF** beside **Present** in the top bar. Original PDF artwork stays sharp; annotation overlays and inserted white/black boards (including drafts) are included. The bundled PDF library works offline. Transparent PDF wand regions have an opaque backing to prevent doubled text.

## Semantic tiers

For authored Typst stages, read [references/semantic-tiers.md](references/semantic-tiers.md). Copy `assets/pigeon-tiers.typ`, import it with `as sem`, and preserve the complete source/PDF. `[tiers]` configures independent recipes; `--mode step|slide` selects initial navigation (Slide by default). Keep the existing physical-page and Touying handout model. Build the [self-contained example](../examples/semantic-tiers/README.md) for tier checks. Voice targets belong inside role wrappers; full-source exports and overview thumbnails remain complete. Report extra compilation/asset costs and distinguish automated checks from live rehearsal.
