---
name: typst-to-pigeon
description: Turn a Typst slide source or PDF deck into a portable Pigeon HTML presentation with an infinite canvas, non-linear navigation, keyboard tools, and a source-grounded concept graph.
---

# Typst to Pigeon

Use this skill when the user has a Typst slide source or PDF deck and wants the Pigeon presentation system generated beside it. The skill preserves the source file, compiles Typst pages or renders PDF pages to SVG, extracts slide metadata and visual wand targets, builds a revisioned manifest and graph, embeds the assets for offline `file://` opening, and writes a portable release folder plus ZIP.

Run the entry point from this skill directory. Both formats require Python 3.11+ and Node.js 20.11+. Typst input also requires Typst with `eval` support and Poppler. PDF input requires `python3 -m pip install -r requirements-pdf.txt`; it does not require Typst or Poppler:

```sh
python3 scripts/typst_to_pigeon.py /path/to/talk.typ
python3 scripts/typst_to_pigeon.py /path/to/talk.pdf
```

The shell launcher in `scripts/typst-to-pigeon.sh` also accepts both formats.
It uses this local skill when run in place; a standalone copy on PATH uses the
globally installed skill. `PIGEON_SKILL_DIR` explicitly overrides either choice.

The default output is `pigeon-{FILENAME}` beside the input source, where `FILENAME` is the basename with its last suffix removed (for example, `/talks/my.talk.pdf` produces `/talks/pigeon-my.talk/`); `--output` overrides it. An optional `pigeon.toml` beside the source stores persistent build settings; see [references/config.md](references/config.md). CLI values take precedence over TOML values. Use `--config FILE` to choose another config file, and use `--deck-id`, `--title`, and `--navigation /path/to/talk.navigation.json` when those values should be explicit. The output directory must be empty unless `--force` is supplied. Rebuilds stage the new presentation and keep the previous output until compilation, graph generation and bundling succeed.

**`--graph local` is the default.** It is deterministic, offline and does not require credentials. `--graph model` explicitly sends the compiled slide text and every slide rendering to a Responses API provider at build time. The default provider, `codex-config`, honors an explicit provider `env_key`; otherwise it prefers the saved Codex API key over a generic shell key. It respects `CODEX_HOME` and prints the endpoint and credential source without showing the key. Alternatively use `--graph-provider env` with `OPENAI_API_KEY`, optionally `OPENAI_BASE_URL` and `OPENAI_MODEL`. Failed model extraction stops the build; it never silently falls back to a lexical graph. Read [references/graph.md](references/graph.md) for evidence validation, repair and caching.

The **Title effect** selector defaults to **Text Type**, with None, Split Text, Blur Text, Shiny Text and Gradient Text also available. `--title-effect none` disables effects. Effects animate original SVG title glyphs, so no browser font substitution is needed; these are independent adaptations of selected React Bits designs. Unmatched or image-only titles remain static and are reported in `build-report.json`.

Pigeon is currently version **1.0.2**. Every generated release includes an **About Pigeon** dialog with the Pigeon icon, author/contact information, and a link to it from the `?` keyboard guide.

The original **Camera** slide transition remains the default. `--slide-transition NAME` overrides `slide_transition` in `pigeon.toml`; choices are `camera`, `none`, `fade`, `blur`, `slide`, `zoom`, `pixel`, `staggered-wipe`, and `stack`. The runtime Transition selector changes the current viewing session. Read [references/transitions.md](references/transitions.md) for the React Bits review and supported patterns.

The generated Pigeon runtime already includes the supported presentation behavior: infinite-canvas and hierarchical/graph overviews, non-linear route detours, keyword and slide-number search, presentation/fullscreen layout, persistent laser, pen, highlighter, eraser, magic-wand emphasis for text/images/tables/takeaways, whiteboards/blackboards, zoom and pan, session import/export, and keyboard navigation. Read [references/runtime.md](references/runtime.md) when changing the runtime or explaining those controls. Read [references/talk-v5-template-map.md](references/talk-v5-template-map.md) to see which hard-won talk-v5 files became reusable template assets and how to shape optional navigation JSON.

PDF input preserves the original page artwork and PDF. Titles are inferred conservatively from top placement and font size; uncertain pages stay untitled. Text blocks, embedded images, ruled tables, strongly aligned borderless tables and vector illustrations become wand targets. There is no automatic PDF takeaway recognition. Optional English OCR needs local Tesseract language data; without it, scans retain visual navigation but may lack searchable text. Inspect each page in `build-report.json`. Read [references/input-contract.md](references/input-contract.md) for details.

In Pen mode (`P`), backtick toggles **Pen down mode**: pointer movement draws without holding a button. A compact notice stays at the top right. A single backtick toggles the mode after a 300 ms double-tap window; double-backtick undoes the last drawing in Pen or Diagram mode without changing the tool or Pen down setting. Navigation retains the setting, while switching tools or losing window focus lifts the pen.

Outline pages titled `Overview` or `Outline` are recognized when their body is only a flat bullet or numbered list. Each repeated matching page advances the inferred section number; the list item becomes the current section label. Explicit navigation section metadata wins, and mismatched repeated lists are reported in `build-report.json`.

Press `D` for Diagram mode. It provides an offline Excalidraw-style editor: `V/1` selection, `R/2` rectangle, `D/3` diamond, `O/4` ellipse, `A/5` arrow, `L/6` line, `T/8` text, `H` hand, `S` stroke color, `G` fill, `Shift+T` triangle, `Shift+P` parallelogram, centered shape labels, attached connector endpoints, move/resize handles, and `Cmd/Ctrl+C/V/X/D` copy/paste/cut/duplicate. Diagram operations use the existing undo, session, board, PNG and PDF paths. Escape clears a selection before exiting the mode.

For page geometry, partial/absent metadata, title matching, custom wand targets and linked resources, read [references/input-contract.md](references/input-contract.md). Each page keeps its native dimensions; portrait and mixed-size decks are supported. Custom or computed Typst macros may require explicit navigation overrides. For release verification, use [references/qa-checklist.md](references/qa-checklist.md). The reusable Pigeon shell and icon live in `assets/pigeon-template/`; do not copy generated deck assets or talk-specific demos from an earlier release.

After generation, inspect `build-report.json`, check that `public/deck/manifest.json` and `public/deck/knowledge-graph.json` have the same revision, confirm `public/deck/embedded-deck.js` exists, and check the output's `index.html` contains no template placeholders. Run `node --check` on the generated JavaScript and serve the folder with `python3 scripts/serve.py` for a Safari/Firefox rehearsal. Report the checks actually performed; DOM tests and compilation do not prove browser rendering.

Export the whole annotated deck through **Save and export → Export slides and drawings as PDF**. Original PDF artwork stays sharp; annotation overlays and inserted white/black boards (including drafts) are included. The bundled PDF library works offline. Transparent PDF wand regions have an opaque backing to prevent doubled text.
