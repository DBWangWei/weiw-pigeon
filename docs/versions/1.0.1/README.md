# Pigeon 1.0.1

This version adds PDF input and Pen down mode while retaining the existing
canvas, overview/graph, search, presentation, annotation, board, title-effect
and transition controls. Defaults remain local graph extraction, Text Type
titles and Camera transitions.

## Typical use

With the updated skill installed and launcher on PATH:

```bash
typst-to-pigeon talk.typ
# Or:
typst-to-pigeon talk.pdf
```

Open `pigeon-output/index.html` beside the input file. Optional `pigeon.toml`
settings beside the input are overridden by CLI options. Add `--force` to
rebuild existing output. From the repository root, use
`./typst-to-pigeon.sh talk.pdf`. Launchers inside the repository or skill folder
use the bundled version, avoiding an older global installation. A standalone
launcher on PATH uses the global skill; `PIGEON_SKILL_DIR` overrides either.

Requirements: Python 3.11+ and Node.js 20.11+. Typst input needs Typst with `eval`
support and Poppler; PDF input instead needs
`python3 -m pip install -r typst-to-pigeon/requirements-pdf.txt`, run from the
repository root. Re-run `bash ./install-typst-to-pigeon.sh` to update the global
skill; copy the new launcher to PATH as well.

## PDF input

- Preserves the source PDF unchanged and renders every page as SVG, including
  blank pages, cropped pages, rotated pages and mixed page sizes.
- Infers titles from top placement and font size relative to body text. Wrapped
  headings are supported; uncertain pages stay untitled and use `Slide N` for
  navigation. Original native title glyphs support the existing title effects.
- Extracts text blocks, embedded images, populated ruled tables, aligned
  borderless tables and vector illustrations for the ordinary magic-wand effect:
  outline, brighten and gently enlarge the pointed-to object.
- Does not infer Typst `#takeaway(message)` semantics from PDF. Typst takeaways
  still pop forward with a stronger glow while the surrounding slide dims.
- Attempts local English OCR for pages with almost no native text. Tesseract
  language data is optional; missing OCR emits a warning. Scans then remain
  viewable/navigable but can lack text search and text-derived graph concepts.
  OCR-only titles stay static; raster images retain their original resolution.

Detection is heuristic. Review `build-report.json` and correct titles or regions
with navigation JSON when needed. Details are in the
[input contract](../../../typst-to-pigeon/references/input-contract.md).

## Pen down mode

Press `P`, then backtick (`` ` ``). A prominent **Pen down mode** overlay appears,
and pointer movement draws without holding a mouse button. Backtick again lifts
the pen and keeps Pen selected. Escape first dismisses open overlays, then lifts
the pen. Switching tools or losing window/tab focus disables the mode.

Slide/board navigation retains Pen down mode and separates strokes. Pointer
exit, zoom, color changes, undo, dialogs and Space-to-pan also finish the current
stroke, preventing lines between unrelated positions. The setting is transient;
drawn strokes still support undo and session import/export.

## Validation

See the [QA checklist](../../../typst-to-pigeon/references/qa-checklist.md) for
commands and Safari/Firefox rehearsal. Automated checks cover PDF geometry and
title-artwork reconstruction, table/image targets, offline builds, configuration,
model image preparation, failure recovery, and sticky-pen runtime behavior.
DOM checks use stubs; they do not establish browser rendering. OCR geometry and
missing-language-data behavior are tested separately from recognition quality.

Verified with Python 3.12 and PyMuPDF 1.27.2.2: **20 Python tests and 17 DOM
runtime tests passed**. The 16-page Typst example rebuilt without warnings;
the nine-page PDF example reports the expected unavailable-OCR warning for its
image-only page. Safari/Firefox presentation rehearsal and real OCR recognition
were not performed.

The [1.0.0 README](../1.0.0/README.md) preserves the preceding release's guide.
