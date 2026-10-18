# QA checklist

After a build:

1. Inspect the page count and `build-report.json`. Review inferred titles, static-title warnings, custom wand targets and disabled local links.
2. Check manifest/graph deck IDs and revisions, slide SVG hashes, native dimensions, PDF and optional title-layer assets.
3. Run `node --check` on `src/app.js`, `src/bootstrap.js`, `src/title-effects.js` and `src/slide-transitions.js`, and compile-check `scripts/serve.py`.
4. Confirm `public/deck/embedded-deck.js` exists and `index.html` contains no unresolved template title.
5. Open `index.html` directly, then serve with `python3 scripts/serve.py` and rehearse in Safari or Firefox. Test both opening modes; do not use Chrome for this user's testing.
6. Check overview arrow selection, graph evidence jumps, search, presentation mode, help dismissal, repeated tool toggles, navigation with tools active, deep zoom, board recovery and magic-wand targets.
7. Select each title effect and slide transition, advance and jump rapidly, open About directly and from `?`, return to None/Camera, and check reduced motion. Confirm static title/background alignment, no duplicated title, no leftover animation, and intact PNG export. Check portrait pages and any multiline/non-Latin titles.
8. Review KG concepts and relation meanings against the deck. Valid evidence does not certify the model's interpretation.

Automated regression checks from the skill folder:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/typst_to_pigeon.py tests/fixtures/geometry.typ --output /tmp/pigeon-geometry-check --graph local --no-zip
PIGEON_FIXTURE_ROOT=/tmp/pigeon-geometry-check PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime.test.mjs
```

The Python tests use real Typst/Poppler with a loopback fake Responses API: TOML discovery, CLI precedence, offline defaults, configured model extraction, repair, cache reuse, transactional failure, Unicode/multiline title reconstruction, duplicate metadata IDs, blank pages, resource bundling and ZIP integrity. They make no external model calls. The runtime tests use Happy DOM, canvas/image/animation stubs and the generated file bundle; `PIGEON_TEST_DEPS` must point to a directory containing `happy-dom`. They check state and wiring, not actual browser rendering.

The ZIP includes static runtime/assets, title layers, mapped resources, notices, README, release metadata and `scripts/serve.py`. It must exclude source `.typ` files, caches, credentials, test fixtures and development dependencies. Report browser launch failures separately from successful static/DOM checks.
