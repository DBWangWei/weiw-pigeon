# Pigeon 1.0.2

Pigeon 1.0.2 adds inferred outline sections, an offline diagram editor, and a
shorter About Pigeon panel. It retains PDF input, Pen down mode, the knowledge
graph, non-linear overview, search, boards, title effects, transitions and
annotation tools from 1.0.1.

## Use

From the repository, run:

```bash
./typst-to-pigeon.sh /path/to/slides.pdf
```

The same command accepts a `.typ` slide source. Open `pigeon-FILENAME/index.html`
beside the input, where `FILENAME` is its basename without the last suffix
(e.g. `slides.pdf` produces `pigeon-slides/`). Add `--force` to rebuild an
existing output. Defaults remain
local graph extraction, Text Type titles and Camera transitions; `pigeon.toml`
beside the source supplies settings, and CLI options override them.

## Outline sections

An **Overview** or **Outline** page is recognized only when its content after
the title is a flat bullet or numbered list. The first matching page starts
section 1; each later matching page advances to the next section. Its list item
becomes the section label and slides after that page are grouped under it in
the hierarchy overview. Mismatching lists are left in the current section and
reported in `build-report.json`. Explicit `section` metadata or navigation JSON
overrides an inferred boundary.

## Diagram mode

Press `D` to enter Diagram mode. A compact notice at the top right and the toolbar
show the active mode. The Pen down notice uses the same position and smaller type.
The editor uses familiar Excalidraw shortcuts:

- `V/1` select, `R/2` rectangle, `D/3` diamond, `O/4` ellipse, `A/5` arrow,
  `L/6` line, `T/8` text, `H` hand/pan.
- `S` stroke color and `G` fill color open keyboard-selectable palettes.
- `Shift+T` triangle and `Shift+P` parallelogram are Pigeon additions.
- `Cmd/Ctrl+C/V/X/D` copy, paste, cut and duplicate; arrows move; Delete removes;
  Tab cycles; Enter edits or creates; Escape clears selection before exiting.
- Double-tap backtick (within 300 ms) to undo the last drawing or edit in Diagram
  or Pen mode, including Pen down. The selected tool and Pen down state stay the
  same; a single backtick still toggles Pen down after the double-tap window.
- `Shift+L` switches between elbow and straight connectors.
  `Cmd/Ctrl+Alt+arrows` resizes; Shift increases the step size.

Shapes have editable centered labels, transparent or solid fills, color selection,
resize knobs, and basic smart connectors. Connector endpoints bind to shapes and
follow them when moved. Diagram data is saved with the existing slide/board ink,
undo history, session files, PNG and PDF exports. `PageUp/PageDown` continue slide
navigation. Copy/paste works within the current Pigeon window.

The supported shortcuts were checked against the [Excalidraw keyboard guide](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/HelpDialog.tsx).
Triangle, parallelogram, routing, keyboard creation and resizing are Pigeon
extensions. This editor does not import or export Excalidraw files.

## Annotated PDF export and PDF wand

**Export PDF** beside **Present** in the top bar downloads the entire deck
with annotations. Original PDF pages retain their text and vector artwork. Ink,
highlights, diagram objects and labels use transparent overlays at 3× canvas
resolution (up to 4096 pixels per side). Inserted whiteboards/blackboards, including
drafts and empty boards, appear after their parent slides; removed boards are omitted.
Cropped/rotated source pages and mixed page sizes are supported. The source and
current presentation are unchanged. The bundled pdf-lib 1.17.1 loads only when
export is requested; no network connection is needed.

Magic-wand regions now have an opaque paper backing. Transparent PDF text artwork
therefore stays legible when it pops forward instead of blending with the original
text underneath. Explicit colored background artwork remains visible.

With an object emphasized by the magic wand (`M`), backtick cycles
**Pop-out → Focus → Spotlight → Pop-out**. Recognized takeaways start at Spotlight.
Focus covers the entire canvas in midnight navy (`#0B1220`), with faint blue light
at the corners, a raised navy panel (`#141C2A`) and a thin warm-yellow border
(`#FFD86B`). Confidently isolated text becomes off-white while retaining its
original glyph layout and equations. Images, tables and uncertain text retain
the source artwork on opaque paper. Spotlight uses the existing takeaway glow
and dims the surrounding slide.

Focus and cycled Spotlight keep the target fixed; returning to Pop-out resumes
hover selection. Escape dismisses emphasis before exiting Wand. Navigation,
zoom/pan, overview, dialogs and tool changes clear the effect. It is transient
and does not appear in saved sessions or PDF exports. Pen/Diagram backtick
shortcuts keep their existing behavior.

## About and command-line help

About Pigeon shows a larger 160 × 160 Pigeon icon, version, and a short
description of browser-only offline use, familiar presentation/drawing tools,
and keyboard shortcuts. It includes the collaboration invitation and `Wei Wang (weiwcs AT ust.hk) · GPT-6-Astra/xhigh (in Codex)`.
The command-line launcher help is
compact; dependency details remain in the README and skill docs. The keyboard
guide uses the same key styling throughout, with separate Excalidraw-like tools
and editing, Pigeon additions, and presentation controls.

## Fullscreen help

Escape dismisses Help first when the browser permits Keyboard Lock (currently
Chrome/Edge). A later Escape can leave fullscreen, and holding Escape keeps the
browser's emergency exit. Safari/Firefox and denied locks may still let the
browser leave native fullscreen; Pigeon retains its presentation layout.
Press `?` again or use Close to dismiss Help without that browser shortcut.

## Validation

**25 Python tests and 31 DOM runtime tests passed.** The Python suite covers real
Typst and PDF outline inference alongside PDF,
configuration and pipeline regressions. The runtime suites cover diagram tools,
bindings, text, colors, clipboard operations, geometry, sessions and export drawing. DOM tests use
Happy DOM and stubs; they verify state and wiring but do not establish browser
rendering. The 16-slide Typst and 9-page PDF examples and ZIPs were rebuilt;
revision consistency, SVG hashes, embedded assets and template equality passed.
Firefox aborted during launch, so rendered visuals and real fullscreen behavior
remain unverified. The PDF scan fixture reports unavailable optional OCR data.

## Latest validation

25 Python tests and 41 runtime regression cases passed. PDF export was checked
against both Typst and PDF fixtures with real canvas rendering and independent
PyMuPDF text/pixel checks. The page-38 text region in `07.lecture-slides.pdf` was
reproduced and checked with opaque compositing. Full browser interaction and
fullscreen rendering still require a Safari/Firefox rehearsal.

The wand emphasis update passed 44 DOM runtime checks and 5 text-mask/SVG-rendering
checks, covering all three modes, fullscreen dismissal, drawing-shortcut isolation,
late rendering, source glyph geometry and conservative artwork fallbacks. The real
page-38 PDF crop was also rendered and inspected on navy. Both examples and the
41-page lecture output were refreshed, preserving deck revisions and SVG hashes;
ZIP runtime contents match their output folders. These checks do not establish
full browser rendering or native fullscreen behavior.
