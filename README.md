<img src="typst-to-pigeon/assets/pigeon-icon.png" alt="Pigeon icon" width="128">

# weiw-pigeon

Pigeon **1.0.5** converts a Typst slide source or PDF deck into an offline HTML presentation
with an infinite canvas, non-linear navigation, a concept graph, search and
annotation tools. The original page appearance is preserved as SVG artwork.

New computer? Follow [How to run Pigeon](HowToRun.md) for macOS setup, downloading
from GitHub, and converting your first PDF.

## Generate a presentation

Both formats require Python 3.11+ and Node.js 20.11+. Typst input also needs
Typst with `eval` support and Poppler (`pdftotext` and `pdftoppm`). For PDF input,
install PyMuPDF and Pillow in the Python environment used by the launcher:

```bash
python3 -m pip install -r typst-to-pigeon/requirements-pdf.txt
```

For Typst input, install `typst-to-pigeon/requirements.txt` for Pillow raster optimization. PDF conversion does not need Typst or Poppler.

From this repository:

```bash
./typst-to-pigeon.sh /path/to/talk.typ
# Or use a PDF:
./typst-to-pigeon.sh /path/to/talk.pdf
```

By default, this creates one self-contained `pigeon-FILENAME.html` beside the source, where
`FILENAME` is the basename without its last suffix. For example,
`/talks/week5.typ` produces `/talks/pigeon-week5.html`. Send that HTML file to a
recipient, who can double-click it in a current browser. The default build also
writes `week5.pdf` beside the HTML; keep those two files together. Use
`--embed-pdf` when the PDF must be included in one standalone HTML file.
Navigation, overview, graphs, annotations, motion effects, and semantic tiers
work offline.

```bash
open /path/to/pigeon-talk.html       # macOS; or open in Safari or Firefox
```

Choose the output format with `--out-mode`:

| Mode | Output | Voice and live Q&A |
| --- | --- | --- |
| `single` (default) | One standalone `pigeon-FILENAME.html` | Excluded |
| `multiple` | Portable `pigeon-FILENAME/` folder | Available through the local server |
| `zip` | The folder plus `DECK-ID-pigeon.zip` beside it | Available after extraction and server setup |

`--single-file` is an alias for `--out-mode single`. Existing `--no-zip` and
`--zip` flags map to `multiple` and `zip`. ZIP archives are created only when
requested. For voice/Q&A, use `--out-mode multiple` or `zip`; single-file builds
disable recognition and live Q&A, and omit the voice panel and its scripts.
External website links still need an Internet connection.

Rebuild an existing presentation with `--force`, choose another output path
with `--output`, and use an adjacent `pigeon.toml` (or `--config`) for
persistent settings:

```bash
./typst-to-pigeon.sh /path/to/talk.typ --force
./typst-to-pigeon.sh /path/to/talk.typ --output /tmp/pigeon-talk.html --force
./typst-to-pigeon.sh /path/to/talk.typ --out-mode multiple --voice --force
./typst-to-pigeon.sh /path/to/talk.typ --out-mode=zip --force
./typst-to-pigeon.sh /path/to/talk.typ --config /path/to/pigeon.toml --force
```

Defaults are local graph extraction, no title animation, the original
Camera transition, and `out_mode = "single"`. Use `out_mode = "multiple"` or
`"zip"` in `pigeon.toml` for persistent settings. Legacy `no_zip = true/false`
still selects `multiple/zip` when `out_mode` is absent. Explicit CLI options
override TOML settings. In single mode, `--output` names the HTML file (`.html`
is appended unless it ends in `.html` or `.htm`); in other modes it names a directory.

The local knowledge graph powers the **Mind map** overview. It prioritizes authored takeaways and semantic roles,
then selects informative slide statements and recurring topics. It preserves
explicit support and detour links and labels inferred topic similarities as
heuristic. Repeated headers and footers are suppressed. Open **Overview → Mind
map** to explore; the mind map is selected by default when the graph loads.
Use **− / +**, **Fit** and **100%** to inspect it. If the graph cannot load,
Overview falls back to the slide hierarchy.
The canvas grows with the graph so concept cards have separate space. Rebuild
older presentations to apply these changes. See the [graph guide](typst-to-pigeon/references/graph.md)
for selection rules, evidence and limitations.

## Smaller presentations

Title animation is off by default, so title-body and title-glyph SVG copies are omitted.
Embedded slide images default to JPEG at quality 90, with `--png-size 768p`
(fit within 1366×768). Use `1080p` (1920×1080) or `original` to retain more
pixels. Aspect ratio and SVG placement are preserved; images are never enlarged.
Vector text stays vector. Pass `--png` to keep embedded images as PNG instead.

```bash
./typst-to-pigeon.sh talk.typ --no-embed-pdf --png-size 768p --quality 85
```

JPEG conversion is the default for opaque embedded raster payloads;
`--quality N` selects quality from 1–100, and `--png` keeps PNG payloads.
Transparent source images remain PNG automatically so logos and icons keep
their alpha channel. Conversion affects embedded raster payloads in canonical
and semantic-tier SVGs; it does not rewrite source PNGs, the source/companion
PDF, or shell icons.
The TOML setting `png_to_jpg = false` is equivalent to `--png`.

PDF embedding is off by default. The default writes the source-stem PDF, such as `talk.pdf`, beside
`pigeon-talk.html` (or the source
PDF filename beside folder-mode `index.html`) and omits the PDF from the bundle.
Single-file mode also omits the PDF export library. Keep the two files together.
The runtime checks the companion PDF; unavailable PDF actions are gray.
Annotated **Export PDF** requires embedding and stays gray in companion mode.
If local `file://` security blocks discovery, **Session → Choose PDF fallback…**
lets you select the companion for opening. HTTP hosting discovers it automatically.
PNG and session exports remain available. `--embed-pdf` opts into embedding.
See [configuration](typst-to-pigeon/references/config.md#asset-size-and-pdf-options)
for TOML equivalents.

## Files to keep

For the default single-file output, keep and send `pigeon-FILENAME.html` together
with its companion `FILENAME.pdf`. The HTML embeds the runtime, styles, icons,
deck data, slides, linked deck resources, and third-party notices. Use
`--embed-pdf` to produce a single file that also contains the source PDF and PDF
export library.

For `--out-mode multiple`, keep the `pigeon-FILENAME/` directory together.
The smallest set for direct offline opening of the presentation is:

```text
index.html
styles.css
src/                         # all runtime files, including src/vendor/
public/icons/                # Pigeon icon used by the shell
public/deck/embedded-deck.js # manifest, graph, SVGs and resources bundled here
```

The other files are optional for direct file opening. Keep `public/deck/` in
full if the presentation will also be served over HTTP, because HTTP mode reads
the manifest, graph and slide assets from that directory. With `embed_pdf = false`,
keep the companion source-stem PDF beside `index.html`; embedded builds keep it
in `public/deck/`. Keep
`scripts/` when using local Whisper voice or Q&A; keep `Start Presentation.command`
if you want the macOS launcher. `README.txt`, `release.json`, `build-report.json`,
`config/`, `prompts/`, and `schemas/` are documentation or build metadata and are
not required at presentation runtime.

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

Select **Text** (`T`), then click a slide or board to add a label without entering
Diagram mode. New labels use 20 pt Arial Italic and the active annotation color
(red by default); `1`–`4` choose red, blue, dark green or yellow before typing.
Finish with `Esc`, `Cmd/Ctrl+Enter`, or a click outside the editor. Text stays
selected with resize handles: drag the label to move it or drag a handle to
change its width and height. Double-click a label or select it and press `Enter`
to edit it. Click empty space for another label, or press `T` again to return
to navigation. In Overview, `T` still switches the overview layout.

The canvas fits the current slide to the available screen, including ultrawide
and portrait windows. Press `Home` to fit the whole talk or `0` to fit the
current slide; either fit follows window resizing. Overview and Graph use about
90% of the window width, with compact margins on small screens.

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

Motion effects can be configured in `[effects]` in `pigeon.toml`. Particle morph
runs by default when moving between sections; use `particle_morph_slides` for
specific destination IDs. Rack focus starts off and can be enabled in
**Overview → Motion effects** for a session. See the [motion-effects configuration
reference](typst-to-pigeon/references/config.md#motion-effects).

## Ticker and mind-map authoring

Typst sources can add a live lower-third ticker with the bundled
`pigeon-tick.typ` helper. The repository templates import and re-export
`tick`, so a source that imports `shared/style.typ` can write:

```typst
#s("02", [Why does this work?], section: "Mechanism")[
  #tick(id: "question-1")[What changes when the rank is deficient?]
  // ...main slide content...
]

#s("03", [Resolve the question], section: "Mechanism")[
  #tick(kind: "done", resolves: "question-1")[The fitted values remain unique.]
]
```

Use `#tick(kind: "now", ...)` (the default) for the current thread, `kind: "next"` for a
preview in the second ticker row, and `kind: "done"` with `resolves: "id"` to close a thread.
The template's `tick-band()` reserves the lower band only when the source has
at least one tick, so ticker-free slides retain the larger main-text area.
When a ticker is present, the compiled Typst band and the live Pigeon ticker
share the same geometry; the baked copy remains in the PDF while the player
updates the lower third as the talk progresses. The two rows use compact status
markers: a red `● NOW` marker for the current thread, a blue `→ NEXT` marker
for the upcoming thread, and a green `✓ DONE` marker for a resolved thread.
For a custom template, copy
[`typst-to-pigeon/assets/pigeon-tick.typ`](typst-to-pigeon/assets/pigeon-tick.typ),
import `tick` and `tick-band`, and call `#tick-band()` in the footer.

The **Mind map** is enabled by default in every generated manifest and uses the
knowledge graph as its source. It opens when the graph loads; the hierarchy
view remains available as a tab and as a fallback when graph data is missing.

## Voice triggers for marked Typst content

Voice controls are enabled by default in `multiple` and `zip` output. Open
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
./typst-to-pigeon.sh talk.typ --out-mode multiple --no-voice  # retain manual actions
./typst-to-pigeon.sh talk.typ --out-mode multiple --voice     # override voice.enabled = false
```

Voice feedback stays in memory and is excluded from sessions and exports.
`M` remains Wand and `D` remains Diagram; voice uses `Shift+M` and `Shift+D`.
The default manual actions are `Shift+K/T/F/E` outside Diagram mode.

The built-in voice commands also support `next page`, `previous page`, `go to
page N` (out-of-range pages clamp to the nearest valid page), `full screen`,
`go to overview`, `go to graph view`, `pen mode`, `highlight mode`, `wand mode`,
`diagram mode`, and `default mode`.

### Live Q&A capture

After an audience member asks a question, repeat or paraphrase it and say
`take questions now` or `take any questions now`, then give the answer. Final
transcript segments are grouped in memory and displayed in the authored Q&A
region on the slide. Add a semantic region with target `_qa` (or configure a
different `[qa] target`) where the live list should appear:

```toml
[qa]
enabled = true
target = "_qa"
model = "qwen3.7-flash"
max_length = 4000
max_items = 50
```

The default organizer is DashScope's OpenAI-compatible Chat Completions API
with `qwen3.7-flash`. Set `DASHSCOPE_API_KEY` before starting the local server,
or enter a key in the masked **DashScope API key** field in the Voice window.
The field is kept in page memory only and is sent as a same-origin request
header; it is never included in a session or manifest. `DASHSCOPE_BASE_URL`
can select a regional or workspace endpoint, while `PIGEON_QA_BASE_URL` remains
available for compatibility. Each completed item is saved as raw UTF-8 text in
the deck's hidden `.qa-transcripts/` directory before organization. The
organizer identifies the question and answer and returns a direct response in
fewer than 100 words, usually as Markdown bullets. If the provider is
unavailable, the raw transcript remains visible and the file is still saved.
Press `Q` to finish the current item and insert a white Q&A page containing the
numbered question-and-answer list. See the [configuration reference](typst-to-pigeon/references/config.md#live-qa-capture)
and [runtime reference](typst-to-pigeon/references/runtime.md#live-qa) for the
full contract. For a new Typst source, see [Voice_enabled_guide.md](Voice_enabled_guide.md).

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

Open `pigeon-OLS-beyond-memoization.html` inside the Typst example, or
`pigeon-ml_learning_with_infinite_hypothesis_sets/index.html` inside the PDF
example. The Typst example is checked in as a standalone one-file release; the
PDF and voice examples retain folder outputs for their server-backed features.
Use `--out-mode multiple` for a folder or `--out-mode zip` for an archive.

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
| Graph and search evidence | Mark main conclusions with `#takeaway[...]` or semantic roles such as `sem.takeaway`, `sem.answer` and `sem.contrast`; use `sem.support(to: ...)` and `sem.deep(...)` for authored associations. | Local graphs prioritize these messages and preserve authored links with compiled slide evidence. Unmarked slides use conservative text salience and topic similarity; model extraction also receives each rendered page. |
| Ticker | Import `tick` and call `tick(...)` for `now`, `next`, or `done` items; call `tick-band()` once in the slide footer. | The ticker band is conditional: sources without ticks keep the full body area, while ticker sources reserve the band in both the compiled PDF and live player. |

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

Version 1.0.5 adds the compact status-marker ticker: `● NOW`, `→ NEXT`, and
`✓ DONE` remain left-aligned in the fixed two-row lower third across Typst/PDF
and HTML output. Cover and final Q&A pages suppress ticker bands and ticker
content. It also updates the generated runtime and documentation to version
1.0.5.

Version 1.0.4 adds authored semantic tiers for explicitly marked Typst
content. Slide mode preserves ordinary navigation, while Step mode traverses
authored question, answer, evidence and takeaway states before moving to another
slide. Semantic deep links, exact return tiers, tier-aware voice and Wand targets,
and complete-source PDF/PNG exports are included. The six-page semantic-tier
example demonstrates the supported authoring contract.

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
double-backtick undo, and PDF overlays on cropped/rotated pages. Both example
releases were refreshed and verified; ZIP archives remain available through
the explicit `--zip` option.
Firefox aborted during browser launch in the test environment; rendered visuals
and real fullscreen interaction still need a Safari/Firefox rehearsal.

## TODO

Live voice rehearsal currently targets Google Chrome on macOS. Manual presentation and annotation controls remain available in other browsers.

- [ ] Test voice recognition on other browsers, including Safari, Firefox, and Edge.
- [ ] Test on other operating systems, including Windows and Linux.

## Version documentation

- [1.0.5](docs/versions/1.0.5/README.md): status-marker ticker styling, final-page ticker suppression, and the 1.0.5 runtime/documentation update.
- [1.0.4](docs/versions/1.0.4/README.md): authored semantic tiers, tier-aware navigation, and the six-page semantic-tier example.
- [1.0.3](docs/versions/1.0.3/README.md): local Whisper voice triggers, semantic Typst markers, configurable actions, and the voice-enabled Week 5 example.
- [1.0.2](docs/versions/1.0.2/README.md): outline sections and diagram mode.
- [1.0.1](docs/versions/1.0.1/README.md): PDF input, conservative extraction and Pen down mode.
- [1.0.0](docs/versions/1.0.0/README.md): original Typst-based release.

Each release keeps its own README under `docs/versions/VERSION/`; update this
current README and add the next version's README when releasing. Historical
READMEs describe their version's behavior and validation.

## Authored semantic tiers

Typst decks can define independent question, answer, evidence and takeaway states without changing layout. Slide mode preserves ordinary slide navigation; Step mode traverses tiers first. Press N to toggle, comma/period to change tiers, Enter for a semantic detour and R to return. See the [semantic-tier reference](typst-to-pigeon/references/semantic-tiers.md), the [semantic function HTML reference](docs/semantic-functions.html), and the [six-page example](examples/semantic-tiers/README.md). Complete-source PDF/PNG exports retain all artwork; presentation effects are not baked in.
