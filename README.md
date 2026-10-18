# weiw-pigeon

Pigeon **1.0.2** converts a Typst slide source or PDF deck into an offline HTML presentation
with an infinite canvas, non-linear navigation, a concept graph, search and
annotation tools. The original page appearance is preserved as SVG artwork.

## Generate a presentation

Both formats require Python 3.11+ and Node.js 20.11+. Typst input also needs
Typst with `eval` support and Poppler (`pdftotext` and `pdftoppm`). For PDF input,
install PyMuPDF in the Python environment used by the launcher:

```bash
python3 -m pip install -r typst-to-pigeon/requirements-pdf.txt
```

PDF conversion does not need Typst or Poppler.

From this repository:

```bash
./typst-to-pigeon.sh /path/to/talk.typ
# Or use a PDF:
./typst-to-pigeon.sh /path/to/talk.pdf
```

Open `pigeon-FILENAME/index.html` beside the input source, where `FILENAME` is
the basename without its last suffix
(for example, `talk.v2.pdf` produces `pigeon-talk.v2/`). Defaults are local graph
extraction, the Text Type title effect and the original Camera transition.
Optional `pigeon.toml` settings beside the source are overridden by explicit CLI
options. Add `--force` when replacing an existing output.

To install the global Codex skill, run `bash ./install-typst-to-pigeon.sh`.
Copy `typst-to-pigeon.sh` to a directory on PATH, optionally naming it
`typst-to-pigeon`, to use `typst-to-pigeon talk.typ` or `typst-to-pigeon talk.pdf`
from any folder. Re-run the installer to upgrade an older skill installation.
Launchers inside this repository or a skill folder use their bundled skill;
a standalone launcher on PATH uses the global installation. An explicit
`PIGEON_SKILL_DIR` overrides either choice.

## Present

Use arrows or Space to move, `O` for the overview, `/` to search, `F` for
presentation mode and `?` for the keyboard guide. About Pigeon shows the icon, version and author contact.

The `M` magic wand outlines, brightens and gently enlarges detected text blocks,
images and tables. Recognized `#takeaway(message)` regions pop forward with a
stronger glow while the surrounding slide dims. Pen, highlighter, eraser,
laser, inserted whiteboards/blackboards, zoom and pan are also available.

Pages titled **Overview** or **Outline** that contain only flat bullet or numbered
items become section boundaries. Repeated outline pages advance through those
sections, and the hierarchy overview groups slides accordingly. Review inferred
boundaries in `build-report.json`; explicit navigation sections take precedence.

In Pen mode (`P`), press backtick (`` ` ``) to enter **Pen down mode**. Move the
pointer to draw without holding a mouse button; a compact notice at the top right
shows the mode. A single backtick toggles it after a 300 ms double-tap window.
Double-tap backtick in Pen or Diagram mode to undo the last drawing or edit,
while keeping the tool and Pen down setting. Another single tap lifts the pen. Slide
navigation retains the mode and starts separate strokes. Switching tools or
leaving the window lifts the pen automatically.

Choose a slide transition with `--slide-transition NAME` or the in-app selector:
`camera`, `none`, `fade`, `blur`, `slide`, `zoom`, `pixel`, `staggered-wipe`, `stack`.

## Export an annotated PDF

Open **Save and export → Export slides and drawings as PDF**. The downloaded
`DECK-annotated.pdf` includes all slides in deck order and all inserted whiteboards
and blackboards immediately after their parent slides, including draft boards.
Removed boards are excluded. Source PDF pages keep their original text and vector
artwork; drawings, highlights, diagram shapes and labels are composited as transparent
high-resolution overlays (3× canvas size, capped at 4096 pixels per side).
The source PDF is unchanged. Export works offline.

## PDF behavior

Titles are inferred from font size relative to body text and placement near the
top, including wrapped titles and headings without separators. Uncertain pages
remain untitled and use `Slide N` in navigation. Native text, images, ruled tables,
strongly aligned borderless tables and vector illustrations supply wand targets.
PDFs use the ordinary wand effect; Typst's automatic takeaway effect is unchanged.
The original PDF is included unchanged.

Scan-only pages attempt optional local English OCR when Tesseract language data
is available. Without it, pages remain viewable and navigable but may lack
searchable text and text-derived concepts. OCR-only titles stay static. Inspect
`build-report.json` for per-page detection details and warnings; navigation JSON
can correct titles or regions. See [the input contract](typst-to-pigeon/references/input-contract.md).

## Included files

- `typst-to-pigeon/`: reusable skill, builder, runtime template, icon, references
  and regression tests.
- `typst-to-pigeon.sh`: portable launcher.
- `install-typst-to-pigeon.sh`: global skill installer, with an installation backup.
- `examples/talk-v5/`: current talk source, required inputs, configuration and
  the generated 16-slide presentation in `pigeon-talk-v5/`.
- `examples/pdf/`: a nine-page PDF fixture and its generated presentation.

Rebuild the example from this repository:

```bash
./typst-to-pigeon.sh examples/talk-v5/talk-v5.typ --force
```

## Development checks

```bash
python3 -m pip install -r typst-to-pigeon/requirements-pdf.txt
python3 -m unittest discover -s typst-to-pigeon/tests -p 'test_*.py' -v
```

See [the QA checklist](typst-to-pigeon/references/qa-checklist.md) for runtime
tests and Safari/Firefox rehearsal. These checks do not establish browser
rendering or OCR recognition quality. Animation design references are documented in
`typst-to-pigeon/assets/pigeon-template/THIRD_PARTY_NOTICES.txt`.

Version 1.0.2 extends the editor with an offline diagram mode (`D`) using
Excalidraw-style shortcuts for selection, rectangles, diamonds, ellipses,
triangles, parallelograms, arrows, lines, centered labels, color/fill palettes,
copy/paste/duplicate, connected endpoints, move and resize handles. Diagram ink
is included in undo, sessions, PNG and PDF exports. Validation covers outline
inference, diagram editing, connector bindings, keyboard controls, sessions,
double-backtick undo, and PDF overlays on cropped/rotated pages. Both example releases and ZIP archives were refreshed and verified.
Firefox aborted during browser launch in the test environment; rendered visuals
and real fullscreen interaction still need a Safari/Firefox rehearsal.

## Version documentation

- [1.0.2](docs/versions/1.0.2/README.md): outline sections and diagram mode.
- [1.0.1](docs/versions/1.0.1/README.md): PDF input, conservative extraction and Pen down mode.
- [1.0.0](docs/versions/1.0.0/README.md): original Typst-based release.

Each release keeps its own README under `docs/versions/VERSION/`; update this
current README and add the next version's README when releasing. Historical
READMEs describe their version's behavior and validation.
