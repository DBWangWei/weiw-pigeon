# QA checklist

After a build:

1. Inspect the page count and `build-report.json`. Review inferred titles, static-title warnings, custom wand targets and disabled local links. For PDF input, inspect per-page title detection, text mode (native/OCR/visual-only) and image/table counts.
2. Check manifest/graph deck IDs and revisions, slide SVG hashes, native dimensions, PDF and optional title-layer assets.
3. Run `node --check` on `src/app.js`, `src/bootstrap.js`, `src/title-effects.js`, `src/wand-effects.js`, `src/voice-diagnostics.js`, `src/voice-local.js`, `src/voice-capture-worklet.js`, `src/voice.js`, `src/slide-transitions.js` and `src/diagram.js`, and compile-check the Python server/setup/worker scripts.
4. Confirm `public/deck/embedded-deck.js` exists and `index.html` contains no unresolved template title.
5. Open `index.html` directly, then serve with `python3 scripts/serve.py` and rehearse in Chrome. Voice supports Chrome; use the server for the local Whisper backend. Other browsers are outside the voice release target. Report any unavailable browser automation separately from live rehearsal.
6. Check overview arrow selection, graph evidence jumps, search, presentation mode, help dismissal (Escape with Keyboard Lock, repeated Escape, lock denial, fullscreen event ordering, and `?` toggling), repeated tool toggles, navigation with tools active, deep zoom, board recovery and magic-wand targets. Check P then backtick: no-button drawing, compact top-right mode notices, single backtick retaining Pen, double-backtick undo without changing tool/Pen down state (including held-key repeats and cancelled pending taps), navigation splitting strokes, undo, modal pauses and focus loss. Check Overview/Outline pages, repeated section numbering, mismatched-list warnings and explicit section overrides.
7. Enter Diagram mode with `D`. Check shape shortcuts, Shift+T/Shift+P, sticky placement of every shape/connector, blue stroke/yellow fill defaults, centered shape labels and top-left free text, all nine horizontal/vertical alignment combinations, sharp SVG text after editing at different zoom levels and display densities, double-click editing without extra shapes, fill/stroke palette keyboard selection, selection/marquee, arrow/line connectors with and without bindings, move/resize knobs, copy/paste/cut/duplicate, Delete, undo/redo, board/session/PNG persistence, PageUp/PageDown navigation and Escape’s clear-then-exit behavior.
8. Select each title effect and slide transition, advance and jump rapidly, open About directly and from `?`, return to None/Camera, and check reduced motion. Confirm static title/background alignment, no duplicated title, no leftover animation, and intact PNG export. Check portrait pages and any multiline/non-Latin titles.
9. Review KG concepts and relation meanings against the deck. Valid evidence does not certify the model's interpretation.

Automated regression checks from the skill folder:

Also check the **Text** toolbar button and `T` outside Overview/Diagram: click-to-type
20 pt Arial Italic, default red/shared `1`–`4` colors, repeat placement, existing-label
editing, empty drafts, single-step undo, slide/board/session persistence and sharp
SVG/PNG/PDF text. Escape or Cmd/Ctrl+Enter finishes editing; `T` again exits the tool.

```sh
python3 -m pip install -r requirements-pdf.txt
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/typst_to_pigeon.py tests/fixtures/geometry.typ --output /tmp/pigeon-geometry-check --graph local --no-zip
PIGEON_FIXTURE_ROOT=/tmp/pigeon-geometry-check PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime.test.mjs tests/runtime-text.test.mjs tests/runtime-diagram.test.mjs tests/runtime-fullscreen.test.mjs tests/runtime-backtick.test.mjs tests/runtime-wand.test.mjs tests/wand-effects.test.mjs
# PDF runtime smoke, using the nine-page geometry regression fixture:
python3 scripts/typst_to_pigeon.py tests/fixtures/geometry.pdf --output /tmp/pigeon-pdf-geometry-check --graph local --no-zip --force
PIGEON_FIXTURE_ROOT=/tmp/pigeon-pdf-geometry-check PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime-pdf.test.mjs
```

The Python tests use real Typst/Poppler with a loopback fake Responses API: TOML discovery, CLI precedence, offline defaults, configured model extraction, repair, cache reuse, transactional failure, Unicode/multiline title reconstruction, duplicate metadata IDs, blank pages, resource bundling and ZIP integrity. PDF tests additionally exercise title/no-title/cover/repeated-header cases, wrapped titles, image/table/vector targets, crop and rotation coordinates, title-artwork raster reconstruction, optional OCR failure and mocked OCR geometry, source-byte preservation, PDF builds without Typst/Poppler, model image preparation and transactional malformed/encrypted-input failures. Without PyMuPDF the PDF tests are skipped; a 1.0.3 release requires running them with that dependency installed. They make no external model calls. The runtime tests use Happy DOM, canvas/image/animation stubs and the generated file bundle; `PIGEON_TEST_DEPS` must point to a directory containing `happy-dom`. They check state and wiring, not actual browser rendering.

The ZIP includes static runtime/assets, title layers, mapped resources, notices, README, release metadata and the server, speech worker, setup script and small native bridge sources. It must exclude the downloaded engine/model, source `.typ` files, caches, credentials, test fixtures and development dependencies. Report browser launch failures separately from successful static/DOM checks.

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

The real diagram rendering tests (`runtime-diagram-rendering.test.mjs`) use
`@napi-rs/canvas` with the usual fixture and DOM dependencies. Set
`PIGEON_CANVAS_DEPS` to that installation's `node_modules`; these tests check
SVG text pixels, every alignment in SVG and PNG, zoom alignment and active pen
redraws without a browser.

PDF export regression tests additionally use `@napi-rs/canvas` and a Python with
PyMuPDF. Set `PIGEON_CANVAS_DEPS` to that installation's `node_modules` and
`PIGEON_PYTHON` to the Python executable, then run `runtime-export-pdf.test.mjs`
with the usual `PIGEON_FIXTURE_ROOT` and `PIGEON_TEST_DEPS` variables.


Voice regression: `test_voice_config.py` checks strict TOML settings, CLI
precedence, both launchers and manifest/file-bundle/ZIP propagation.
`test_semantic_regions.py` checks physical pages, hidden entries, native coordinate
conversion, malformed bounds and real Typst marker on/off raster identity.
`voice.test.mjs` checks mocked local speech lifecycle, matching and resolution;
`voice-local.test.mjs` checks capture resampling, silence/utterance gating, local
responses, cancellation and real trigger wiring with simulated hardware.
`test_voice_server.py` checks same-origin/Host/token validation, input bounds and
memory-only responses. Set `PIGEON_WHISPER_HELPER`, `PIGEON_WHISPER_MODEL` and
`PIGEON_SPEECH_SAMPLE` (mono PCM16 16 kHz public speech WAV) to include the real
persistent decoder integration test. Its default skip is not a native-engine pass.
`runtime-voice.test.mjs` checks app normalization, SVG crops, navigation,
transient session state, and shortcut conflicts. Use a generated geometry fixture
from the current template and the usual Happy DOM dependency path.

For live voice rehearsal, use Chrome and install the Whisper helper/model first.
Check that missing setup is visible and manual controls still work. For the
optional browser backend, do not infer support from `webkitSpeechRecognition`
alone; confirm its local API and language pack. Confirm explicit start, offline operation, input-device
failure, mute/resume, media pauses, long silence recovery, current-page-only
resolution, 0/1/many targets, custom actions/phrases, Escape/backdrop dismissal,
reduced motion, and unchanged ink/session/PDF exports. Actual microphone latency
and false-trigger rates must be measured separately from mocked tests.

## Semantic tiers

- Build the [self-contained example](../../examples/semantic-tiers/README.md) and follow its [live rehearsal checklist](../../examples/semantic-tiers/TEST-THIS-DECK.md).
- Check independent/shrinking states, nested hiding, marking-only support regions, opaque paint order, background overrides, multiple takeaway extraction and fixed ink geometry.
- Verify defaults/pruning/aliases, both modes, URLs, boards, exact deep/back return, current-tier title/voice/Wand safety and rapid navigation.
- Check direct-file and HTTP assets, complete-source exports, helper-copy equality, and old Typst/PDF single-state behavior. Record compilation/bundle costs; report live browser/microphone checks separately from automated tests.
