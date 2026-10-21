<img src="typst-to-pigeon/assets/pigeon-icon.png" alt="Pigeon icon" width="128">

# weiw-pigeon

Pigeon **1.0.3** converts a Typst slide source or PDF deck into an offline HTML presentation
with an infinite canvas, non-linear navigation, a concept graph, search and
annotation tools. The original page appearance is preserved as SVG artwork.

New computer? Follow [How to run Pigeon](HowToRun.md) for macOS setup, downloading
from GitHub, and converting your first PDF.

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

To run `typst-to-pigeon` from any folder, save an executable wrapper named
`typst-to-pigeon` in a directory on PATH, such as `~/bin/`:

```bash
#!/usr/bin/env bash
exec "$HOME/code/weiw-pigeon/typst-to-pigeon.sh" "$@"
```

Adjust the repository path to match your checkout, then run
`chmod +x ~/bin/typst-to-pigeon`. The wrapper uses the skill bundled with that
repository. Launchers inside a skill folder use that folder's skill. An explicit
`PIGEON_SKILL_DIR` overrides the selected skill location.

## Present

Use arrows or Space to move, `O` for the overview, `/` to search, `F` for
presentation mode and `?` for the keyboard guide. About Pigeon shows the icon, version and author contact.

The `M` magic wand outlines, brightens and gently enlarges detected text blocks,
images and tables. Recognized `#takeaway(message)` regions pop forward with a
stronger glow while the surrounding slide dims. While an object is lit, press
backtick (`` ` ``) to cycle **Pop-out → Focus → Spotlight → Pop-out**.
Focus hides the surrounding canvas behind midnight navy, with a raised panel,
thin warm-yellow border and restrained glow. Confidently isolated text becomes
off-white without changing glyph positions; images, tables and uncertain text
crops retain their original artwork. Focus and cycled Spotlight keep the chosen
object fixed; Pop-out resumes hover selection. `Esc` dismisses emphasis while
keeping Wand selected. These effects do not change saved ink or PDF exports.
Pen, highlighter, eraser,
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

## Voice triggers for marked Typst content

Voice controls are enabled by default in newly generated presentations. Open
**Voice** in the toolbar, choose a microphone, and click **Start microphone** in Chrome. Voice uses a
local Whisper helper managed by Pigeon's server. In a generated presentation,
run `python3 scripts/setup_voice.py` once per machine, then
`python3 scripts/serve.py` (CMake and a C++ compiler required; 142 MiB English model).
Audio stays in memory on your computer. Configure `voice.backend = "browser"`
to use Chrome's on-device engine instead. Direct-file presentation and manual
actions still work offline; recognition uses localhost.

Copy [`pigeon-sem.typ`](typst-to-pigeon/assets/pigeon-sem.typ) beside your source
and use its marker helper inside the functions you want to target. Configure
phrases, target function names, and `pop`, `focus`, or `spotlight` actions in
`pigeon.toml`. Takeaways can stack; ambiguous targets offer numbered choices.
See the [voice guide](typst-to-pigeon/references/voice.md) for the complete setup,
visibility rules for reveals, config examples, and keyboard controls.

```bash
./typst-to-pigeon.sh talk.typ --no-voice  # disable recognition; retain manual actions
./typst-to-pigeon.sh talk.typ --voice     # override voice.enabled = false
```

Voice feedback stays in memory and is excluded from sessions and exports.
`M` remains Wand and `D` remains Diagram; voice uses `Shift+M` and `Shift+D`.
The default manual actions are `Shift+K/T/F/E` outside Diagram mode.

## Export an annotated PDF

Click **Export PDF** beside **Present** in the top bar. The downloaded
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
PDF objects start with ordinary Pop-out and support all three emphasis modes;
recognized Typst takeaways start with Spotlight.
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
- [`examples/typst-talk-to-pigeon/`](examples/typst-talk-to-pigeon/): the 24-slide
  **OLS Beyond Memorization** deck for DSAA3073: Theories of Data Science,
  26Summer, with editable Typst, compiled PDF, figures, configuration, and Pigeon
  output. It demonstrates repeated outlines, tables, diagrams, and 19 takeaway
  callouts.
- [`examples/pdf-talk-to-pigeon/`](examples/pdf-talk-to-pigeon/): Mehryar Mohri's
  42-page **Learning with Infinite Hypothesis Sets** PDF and its Pigeon output.
  The original PDF and its attribution are preserved.
- [`examples/voice-enabled/`](examples/voice-enabled/): the 20-slide **Week 5
  introduction** deck with editable Typst, compiled PDF, semantic markers,
  configurable voice rules, and all local assets needed to rebuild it.
- `typst-to-pigeon/tests/fixtures/`: Typst and PDF geometry samples used by the
  regression tests, separate from the presentation examples.

Rebuild either example from this repository:

```bash
./typst-to-pigeon.sh examples/typst-talk-to-pigeon/OLS-beyond-memoization.typ --force
./typst-to-pigeon.sh examples/pdf-talk-to-pigeon/ml_learning_with_infinite_hypothesis_sets.pdf --force
./typst-to-pigeon.sh examples/voice-enabled/week5-introduction-voice.typ --config examples/voice-enabled/pigeon.toml --output examples/voice-enabled/pigeon-week5-introduction-voice --graph lexical --voice --force
```

Open `pigeon-OLS-beyond-memoization/index.html` inside the Typst example, or
`pigeon-ml_learning_with_infinite_hypothesis_sets/index.html` inside the PDF
example. Keep each generated folder together for offline use. Rebuilds also
produce ZIP archives beside the inputs; those archives are ignored by Git.

## Write a Typst source that exposes Pigeon's features

Pigeon does not interpret an abstract slide model from Typst. For a `.typ` input
it first compiles the source to PDF and one SVG per physical page, then extracts
text, positions, images, tables, links and selected metadata. A source file must
therefore compile normally, and each intended slide must occupy one physical
page.

### Technical requirements

The minimum build requirements are Python 3.11+, Node.js 20.11+, Typst with
`eval` support, and Poppler (`pdftotext` and `pdftoppm`). The Typst source must
also be able to resolve its packages, local images and fonts from the machine
where it is converted. Pigeon keeps the native page dimensions, so 16:9 is a
useful convention but a fixed `960pt × 540pt` page is not required.

The following source conventions expose the full set of Typst-specific Pigeon
behaviors:

| Capability | Typst convention | What Pigeon can use it for |
| --- | --- | --- |
| Deck title | `#set document(title: "...")` | Supplies the generated presentation title when no CLI `--title` is given. |
| Slide identity and navigation | Put `#metadata((id: ..., title: ..., section: ..., source: ...)) <slide-record>` once on every slide. IDs should be unique and must not contain `::`. | Stable slide IDs, exact titles, section grouping, source notes and title effects. Pages without a record remain usable, but titles are inferred heuristically. |
| Animated titles | Render the title as ordinary Typst text and make it match the metadata `title`. | Pigeon can isolate the original title glyphs for Text Type, Split Text, Blur Text, Shiny Text and Gradient Text effects. Image-only or unmatched titles stay static. |
| Magic-wand takeaways | Use the source-level form `#takeaway[Important conclusion]`; the macro may live in a local imported `.typ` file. | The callout becomes a recognized `takeaway` wand region and starts in Spotlight mode. |
| Other wand targets | Use native text, rendered `image(...)`, and ordinary connected bordered tables. | Text, images and tables can be selected and enlarged without hand-authored regions. Complex computed macros, borderless tables and unusual graphics may need `*.navigation.json` `wandRegions`. |
| Graph and search evidence | Keep meaningful concepts in visible slide text and use `section`/`source` metadata. | Local graph extraction and search receive the compiled text and its slide/page evidence. Model graph extraction also receives each rendered page. |

Metadata is queried from the compiled source, so the label must be exactly
`<slide-record>`. A custom wrapper can emit the record, but computed or hidden
content may not match the rendered PDF; use a navigation JSON override when the
build report reports an uncertain title or region. See the [input contract](typst-to-pigeon/references/input-contract.md)
for the override format.

### Template already in this repository

The reusable Typst template is [`examples/typst-talk-to-pigeon/shared/style.typ`](examples/typst-talk-to-pigeon/shared/style.typ).
It defines `deck`, `s`, `takeaway`, `card`, `cols` and related helpers while
setting a Touying slide theme and page geometry. The complete source using that
template is [`OLS-beyond-memoization.typ`](examples/typst-talk-to-pigeon/OLS-beyond-memoization.typ),
and its companion README explains how to rebuild it. A minimal starter source
can look like this (save it beside the `shared/` directory):

```typst
#import "shared/style.typ": *

#show: deck
#set document(
  title: "How a Hash Table Finds a Key",
  author: "Your name",
)

#let talk-slide = s.with(source: [Pigeon demo])

#slide[
  #metadata((
    id: "01",
    title: "How a Hash Table Finds a Key",
    section: "Introduction",
    source: [Pigeon demo],
  )) <slide-record>
  #align(center + horizon)[
    #text(size: 38pt, weight: "bold")[How a Hash Table Finds a Key]
    #v(14pt)
    #text(size: 22pt, fill: teal)[From a key to a bucket]
  ]
]

#talk-slide("02", [The lookup pipeline], section: "Mechanism")[
  #cols(
    card([1. Hash], [Compute an integer from the key.], color: violet, fill: violet-pale),
    card([2. Probe], [Use that value to choose a bucket and inspect its entries.]),
  )
  #v(14pt)
  #takeaway[The hash function chooses where to look; equality checking decides whether the key is present.]
]

#talk-slide("03", [A useful trade-off], section: "Conclusion")[
  #hook[Fast average lookup depends on a good distribution of keys.]
  #v(14pt)
  #text(size: 24pt)[More buckets reduce collisions, but consume more memory.]
]
```

### Prompt for generating a simple talk

When asking an assistant to generate a talk for this repository, give it the
template path and the source contract explicitly. For example:

```text
Create a three-slide Typst talk on “How a Hash Table Finds a Key” in
examples/typst-talk-to-pigeon/hash-table.typ. From that file, import
`shared/style.typ` (the repository path is
`examples/typst-talk-to-pigeon/shared/style.typ`) and begin with `#show: deck`.
Use one physical page per slide and ordinary Typst text for every title. On
every slide emit exactly one
`#metadata((id: "...", title: "...", section: "...", source: [...] )) <slide-record>`
record; use IDs 01, 02 and 03. The supplied `s` helper already emits the record
for slides made with `s`, so do not add a duplicate. Use the supplied `s`,
`card`, `cols`, `hook` and `takeaway` helpers, and include one source-level
`#takeaway[...]` call. Keep the content readable at the template’s 16:9 size,
avoid image-only titles and computed/borderless tables, and set a document
title. Do not invent a new runtime or navigation schema. After writing the
file, run:

  ./typst-to-pigeon.sh examples/typst-talk-to-pigeon/hash-table.typ --force

Then report the generated slide count and any warnings in build-report.json.
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

Version 1.0.3 adds local Whisper voice triggers for explicitly marked Typst
content. Voice is enabled by default, while `--no-voice` disables recognition
without removing manual actions. Phrases, marked target names, `pop`, `focus`,
or `spotlight` actions, and `ask`/`stack` multi-match behavior are configured
in `pigeon.toml`. The included voice-enabled Week 5 example demonstrates tables,
figures, examples, and takeaways on real slides. Chrome is the supported live
voice browser; the optional browser backend uses Chrome's on-device recognizer.
The local Whisper backend keeps audio and transcripts on the presenting machine
and requires a one-time helper/model setup.

Version 1.0.2 added the offline diagram mode (`D`) using
Excalidraw-style shortcuts for selection, rectangles, diamonds, ellipses,
triangles, parallelograms, arrows, lines, centered labels, color/fill palettes,
copy/paste/duplicate, connected endpoints, move and resize handles. Diagram ink
is included in undo, sessions, PNG and PDF exports. Validation covers outline
inference, diagram editing, connector bindings, keyboard controls, sessions,
double-backtick undo, and PDF overlays on cropped/rotated pages. Both example releases and ZIP archives were refreshed and verified.
Firefox aborted during browser launch in the test environment; rendered visuals
and real fullscreen interaction still need a Safari/Firefox rehearsal.

## TODO

Live voice rehearsal currently targets Google Chrome on macOS. Manual presentation and annotation controls remain available in other browsers.

- [ ] Test voice recognition on other browsers, including Safari, Firefox, and Edge.
- [ ] Test on other operating systems, including Windows and Linux.

## Version documentation

- [1.0.3](docs/versions/1.0.3/README.md): local Whisper voice triggers, semantic Typst markers, configurable actions, and the voice-enabled Week 5 example.
- [1.0.2](docs/versions/1.0.2/README.md): outline sections and diagram mode.
- [1.0.1](docs/versions/1.0.1/README.md): PDF input, conservative extraction and Pen down mode.
- [1.0.0](docs/versions/1.0.0/README.md): original Typst-based release.

Each release keeps its own README under `docs/versions/VERSION/`; update this
current README and add the next version's README when releasing. Historical
READMEs describe their version's behavior and validation.
