# weiw-pigeon

Pigeon **1.0.0** converts a Typst slide source into an offline HTML presentation
with an infinite canvas, non-linear navigation, a concept graph, search and
annotation tools. The original Typst appearance is preserved as SVG artwork.

## Generate a presentation

Requirements: Python 3.11+, Node.js 20.11+, Typst with `eval` support, and Poppler
(`pdftotext` and `pdftoppm`).

From this repository:

```bash
PIGEON_SKILL_DIR="$PWD/typst-to-pigeon" ./typst-to-pigeon.sh /path/to/talk.typ
```

Open `pigeon-output/index.html` beside the input source. Defaults are local graph
extraction, the Text Type title effect and the original Camera transition.
Optional `pigeon.toml` settings beside the source are overridden by explicit CLI
options. Add `--force` when replacing an existing output.

To install the global Codex skill, run `bash ./install-typst-to-pigeon.sh`.
Copy `typst-to-pigeon.sh` to a directory on PATH, optionally naming it
`typst-to-pigeon`, to use `typst-to-pigeon talk.typ` from any folder.

## Present

Use arrows or Space to move, `O` for the overview, `/` to search, `F` for
presentation mode and `?` for the keyboard guide. About Pigeon provides a short
usage guide and the version number.

The `M` magic wand outlines, brightens and gently enlarges detected text blocks,
images and tables. Recognized `#takeaway(message)` regions pop forward with a
stronger glow while the surrounding slide dims. Pen, highlighter, eraser,
laser, inserted whiteboards/blackboards, zoom and pan are also available.

Choose a slide transition with `--slide-transition NAME` or the in-app selector:
`camera`, `none`, `fade`, `blur`, `slide`, `zoom`, `pixel`, `staggered-wipe`, `stack`.

## Included files

- `typst-to-pigeon/`: reusable skill, builder, runtime template, icon, references
  and regression tests.
- `typst-to-pigeon.sh`: portable launcher.
- `install-typst-to-pigeon.sh`: global skill installer, with an installation backup.
- `examples/talk-v5/`: current talk source, required inputs, configuration and
  the generated 16-slide presentation in `pigeon-output/`.

Rebuild the example from this repository:

```bash
PIGEON_SKILL_DIR="$PWD/typst-to-pigeon" ./typst-to-pigeon.sh examples/talk-v5/talk-v5.typ --force
```

## Development checks

```bash
python3 -m unittest discover -s typst-to-pigeon/tests -p 'test_*.py' -v
```

See [the QA checklist](typst-to-pigeon/references/qa-checklist.md) for runtime
tests and Safari/Firefox rehearsal. Version 1.0.0 passed 13 Python tests and
10 DOM runtime tests before this repository snapshot. Those checks do not
establish browser rendering. Animation design references are documented in
`typst-to-pigeon/assets/pigeon-template/THIRD_PARTY_NOTICES.txt`.
