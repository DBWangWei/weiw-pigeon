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

The same command accepts a `.typ` slide source. Open `pigeon-output/index.html`
beside the input. Add `--force` to rebuild an existing output. Defaults remain
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

Press `D` to enter Diagram mode. The overlay and toolbar show the active mode.
The editor uses familiar Excalidraw shortcuts:

- `V/1` select, `R/2` rectangle, `D/3` diamond, `O/4` ellipse, `A/5` arrow,
  `L/6` line, `T/8` text, `H` hand/pan.
- `S` stroke color and `G` fill color open keyboard-selectable palettes.
- `Shift+T` triangle and `Shift+P` parallelogram are Pigeon additions.
- `Cmd/Ctrl+C/V/X/D` copy, paste, cut and duplicate; arrows move; Delete removes;
  Tab cycles; Enter edits or creates; Escape clears selection before exiting.
- `Shift+L` switches between elbow and straight connectors.
  `Cmd/Ctrl+Alt+arrows` resizes; Shift increases the step size.

Shapes have editable centered labels, transparent or solid fills, color selection,
resize knobs, and basic smart connectors. Connector endpoints bind to shapes and
follow them when moved. Diagram data is saved with the existing slide/board ink,
undo history, session files and PNG exports. `PageUp/PageDown` continue slide
navigation. Copy/paste works within the current Pigeon window.

The supported shortcuts were checked against the [Excalidraw keyboard guide](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/HelpDialog.tsx).
Triangle, parallelogram, routing, keyboard creation and resizing are Pigeon
extensions. This editor does not import or export Excalidraw files.

## About and command-line help

About Pigeon shows the Pigeon icon, version, a short description, collaboration
invitation and `Wei Wang (weiwcs AT ust.hk)`. The command-line launcher help is
compact; dependency details remain in the README and skill docs.

## Validation

**25 Python tests and 26 DOM runtime tests passed.** The Python suite covers real
Typst and PDF outline inference alongside PDF,
configuration and pipeline regressions. The runtime suites cover diagram tools,
bindings, text, colors, clipboard operations, geometry, sessions and export drawing. DOM tests use
Happy DOM and stubs; they verify state and wiring but do not establish browser
rendering. The 16-slide Typst and 9-page PDF examples and ZIPs were rebuilt;
revision consistency, SVG hashes, embedded assets and template equality passed.
Firefox aborted during launch, so rendered visuals and real fullscreen behavior
remain unverified. The PDF scan fixture reports unavailable optional OCR data.
