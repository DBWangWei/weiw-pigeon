# QA checklist

After a build:

1. Inspect the page count and `build-report.json`. Review inferred titles, static-title warnings, custom wand targets and disabled local links. For PDF input, inspect per-page title detection, text mode (native/OCR/visual-only) and image/table counts.
2. Check manifest/graph deck IDs and revisions, slide SVG hashes, native dimensions, PDF and optional title-layer assets.
3. Run `node --check` on `src/app.js`, `src/bootstrap.js`, `src/title-effects.js`, `src/wand-effects.js`, `src/slide-transitions.js` and `src/diagram.js`, and compile-check `scripts/serve.py`.
4. Confirm `public/deck/embedded-deck.js` exists and `index.html` contains no unresolved template title.
5. Open `index.html` directly, then serve with `python3 scripts/serve.py` and rehearse in Safari or Firefox. Test both opening modes; do not use Chrome for this user's testing.
6. Check overview arrow selection, graph evidence jumps, search, presentation mode, help dismissal (Escape with Keyboard Lock, repeated Escape, lock denial, fullscreen event ordering, and `?` toggling), repeated tool toggles, navigation with tools active, deep zoom, board recovery and magic-wand targets. Check P then backtick: no-button drawing, compact top-right mode notices, single backtick retaining Pen, double-backtick undo without changing tool/Pen down state (including held-key repeats and cancelled pending taps), navigation splitting strokes, undo, modal pauses and focus loss. Check Overview/Outline pages, repeated section numbering, mismatched-list warnings and explicit section overrides.
7. Enter Diagram mode with `D`. Check shape shortcuts, Shift+T/Shift+P, centered labels, fill/stroke palette keyboard selection, selection/marquee, arrow/line connectors with and without bindings, move/resize knobs, copy/paste/cut/duplicate, Delete, undo/redo, board/session/PNG persistence, PageUp/PageDown navigation and Escape’s clear-then-exit behavior.
8. Select each title effect and slide transition, advance and jump rapidly, open About directly and from `?`, return to None/Camera, and check reduced motion. Confirm static title/background alignment, no duplicated title, no leftover animation, and intact PNG export. Check portrait pages and any multiline/non-Latin titles.
9. Review KG concepts and relation meanings against the deck. Valid evidence does not certify the model's interpretation.

Automated regression checks from the skill folder:

```sh
python3 -m pip install -r requirements-pdf.txt
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/typst_to_pigeon.py tests/fixtures/geometry.typ --output /tmp/pigeon-geometry-check --graph local --no-zip
PIGEON_FIXTURE_ROOT=/tmp/pigeon-geometry-check PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime.test.mjs tests/runtime-diagram.test.mjs tests/runtime-fullscreen.test.mjs tests/runtime-backtick.test.mjs tests/runtime-wand.test.mjs tests/wand-effects.test.mjs
# PDF runtime smoke, using the repository's generated PDF example:
PIGEON_FIXTURE_ROOT=/path/to/weiw-pigeon/examples/pdf/pigeon-geometry PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime-pdf.test.mjs
```

The Python tests use real Typst/Poppler with a loopback fake Responses API: TOML discovery, CLI precedence, offline defaults, configured model extraction, repair, cache reuse, transactional failure, Unicode/multiline title reconstruction, duplicate metadata IDs, blank pages, resource bundling and ZIP integrity. PDF tests additionally exercise title/no-title/cover/repeated-header cases, wrapped titles, image/table/vector targets, crop and rotation coordinates, title-artwork raster reconstruction, optional OCR failure and mocked OCR geometry, source-byte preservation, PDF builds without Typst/Poppler, model image preparation and transactional malformed/encrypted-input failures. Without PyMuPDF the PDF tests are skipped; a 1.0.2 release requires running them with that dependency installed. They make no external model calls. The runtime tests use Happy DOM, canvas/image/animation stubs and the generated file bundle; `PIGEON_TEST_DEPS` must point to a directory containing `happy-dom`. They check state and wiring, not actual browser rendering.

The ZIP includes static runtime/assets, title layers, mapped resources, notices, README, release metadata and `scripts/serve.py`. It must exclude source `.typ` files, caches, credentials, test fixtures and development dependencies. Report browser launch failures separately from successful static/DOM checks.

12. Export an annotated PDF using Export PDF beside Present in the top bar. Check all slide ink, diagram text,
    draft/kept/empty white and black boards, omitted removed boards, original text
    extraction, page order, mixed sizes, crops and all four quarter-turn rotations.
    Verify export errors restore the button and allow retry. Open from `file://`
    without network access and check that the bundled PDF library loads on demand.
13. Hover PDF text with the magic wand, particularly transparent text artwork.
    The enlarged region must cover the original text without ghosting, while
    preserving any explicit colored background in the source artwork.
14. While a text/image/table/takeaway is lit, cycle Pop-out → Focus → Spotlight
    with backtick. Focus must cover the whole canvas and keep the target fixed.
    Check equations, transparent PDF text, colored text panels, images and tables;
    uncertain text must retain its original artwork. Check Escape, pointer leave,
    rapid cycling, fullscreen, reduced motion and unchanged ink/PDF exports.
    Test the glyph mask with `wand-effects.test.mjs`; with `PIGEON_CANVAS_DEPS`
    set, `wand-rendering.test.mjs` exercises real SVG decoding and crop rendering.

PDF export regression tests additionally use `@napi-rs/canvas` and a Python with
PyMuPDF. Set `PIGEON_CANVAS_DEPS` to that installation's `node_modules` and
`PIGEON_PYTHON` to the Python executable, then run `runtime-export-pdf.test.mjs`
with the usual `PIGEON_FIXTURE_ROOT` and `PIGEON_TEST_DEPS` variables.
