# Pigeon configuration

Place an optional `pigeon.toml` beside the Typst or PDF input. The builder discovers
that file automatically. An explicit `--config FILE` selects another file.
Paths inside the TOML file are relative to the config file; paths supplied on
the command line are relative to the current working directory. A `[pigeon]`
table is also accepted for namespacing, and its values override same-named
top-level values.

```toml
# pigeon.toml
# Optional fixed output; omit to use pigeon-FILENAME.html beside each input.
# output = "my-presentation.html"
out_mode = "single" # single (default), multiple, or zip
navigation = "talk-v5.navigation.json"
graph = "local"
graph_provider = "codex-config"
title_effect = "none"
slide_transition = "camera"

# Optional metadata defaults
# deck_id = "my-talk"
# title = "My presentation"
```

Supported keys are `output`, `deck_id`, `title`, `navigation`, `graph`,
`graph_provider`, `embed_pdf`, `png_size`, `png_to_jpg`, `jpg_quality`, `title_effect`, `slide_transition`, `out_mode`, legacy `no_zip`, and the nested
`voice`, `qa`, `effects`, and `tiers` tables. Unknown keys are rejected so a
misspelling cannot silently change the build.
Copy [pigeon.example.toml](pigeon.example.toml) for a new deck. The portable
launcher is included at `scripts/typst-to-pigeon.sh`; copy it into a directory
on PATH if desired.
`PIGEON_SKILL_DIR` explicitly selects a skill. Otherwise a launcher within a
skill's `scripts/` directory or beside a bundled `typst-to-pigeon/` folder uses
that local copy. A standalone PATH launcher falls back to the global skill.

The precedence is:

1. A command-line option, when supplied;
2. the matching value in `pigeon.toml`; and
3. the built-in default.

The built-in defaults are `out_mode = "single"`, `pigeon-{FILENAME}.html` beside the source (its basename
without the last suffix; `my.talk.pdf` becomes `pigeon-my.talk.html`), `graph = "local"`,
`graph_provider = "codex-config"`, `title_effect = "none"`,
`slide_transition = "camera"`, and ZIP creation disabled.
`--force` is intentionally command-line-only because it replaces an existing
presentation.

The config file is read during generation and is not copied into the release.
Credentials remain controlled by the graph-provider configuration and are never
stored in `pigeon.toml` or the generated presentation.

## Output modes

`--out-mode single|multiple|zip` overrides `out_mode` in TOML:

- `single` (default): one standalone HTML file with CSS, icons, runtime, deck
  data, linked deck resources, PDF, PDF-export library, and license notices embedded.
  Double-click the file locally; it can also be hosted as one file. Voice and
  live Q&A are disabled and their UI/scripts are omitted. `--voice` requires
  `multiple` or `zip` instead.
- `multiple`: the existing portable folder with `index.html`, assets, build
  reports, server and voice helper scripts. No archive is created.
- `zip`: the same folder plus `DECK-ID-pigeon.zip` beside it.

For `single`, `output` / `--output` names the HTML file; `.html` is appended
unless the path ends in `.html` or `.htm`. For `multiple` and `zip`, it names the
directory. Defaults are `pigeon-FILENAME.html` and `pigeon-FILENAME/`, respectively.
`--force` replaces an existing file or folder only after the staged build succeeds.

`--single-file` aliases `--out-mode single`. Legacy `--no-zip` and `--zip` alias
`multiple` and `zip`; these CLI switches are mutually exclusive with `--out-mode`.
For existing TOML files, `no_zip = true` selects `multiple` and `false` selects
`zip` when `out_mode` is absent. `out_mode` takes precedence over legacy `no_zip`,
and an explicit CLI mode overrides both.

Standalone builds stage all intermediate files temporarily, leaving only the
HTML artifact (plus a companion PDF with `embed_pdf=false`). Use `multiple` when you need `build-report.json`, editable runtime
files, persistent model-graph caches, or the local server.

## Asset size and PDF options

```toml
title_effect = "none" # default: omit separate title animation SVGs
embed_pdf = true      # false: write companion PDF beside HTML
png_size = "768p"     # default; 1080p or original
png_to_jpg = true     # false: keep slide PNG payloads instead
jpg_quality = 90     # integer 1-100
```

CLI equivalents: `--title-effect`, `--embed-pdf` / `--no-embed-pdf`, `--png-size`,
`--png`, and `--quality`. Explicit flags override TOML. JPEG conversion is the
default; `--png` or `png_to_jpg = false` keeps PNG payloads.
PNG bounds are 1366×768 or 1920×1080; aspect ratio is preserved, images are never
upscaled, and SVG geometry/vector text is unchanged. Optimization covers PNG data
URIs in canonical and semantic-tier SVGs before title splitting/hashing. Opaque
images use JPEG by default; transparent source images remain PNG so alpha is
preserved. Source images/PDFs and shell icons are untouched.
Pillow is required for the default JPEG conversion and for resizing. It is not
needed when `png_size="original"` and `png_to_jpg=false`.

## Authored ticker and mind map

Import `assets/pigeon-tick.typ` in a Typst template and expose `tick` and
`tick-band`. A `#tick(kind: "now", id: "...")[...]` opens a lower-third thread;
`kind: "next"` places a preview on the right; and
`kind: "done", resolves: "id"` closes a previous thread. `#tick-band()` emits
the reserved footer only when the source contains at least one tick. This keeps
the body area larger for ticker-free sources and aligns the compiled PDF band
with the live runtime ticker. The exporter records the result under
`manifest.ticker` and excludes its baked words from graph/search evidence.

Generated manifests set `mindMap.enabled = true` and
`mindMap.source = "knowledge-graph"`. The graph view is selected by default
after a successful graph load; the hierarchy view remains available and is the
fallback when graph data is unavailable.

With `embed_pdf=false`, single mode writes `SOURCE-STEM.pdf` beside the HTML;
folder/ZIP modes put `SOURCE-STEM.pdf` beside `index.html`. The PDF bytes are
preserved. Keep the companion alongside the HTML; it is absent from the embedded
bundle. Single mode also omits pdf-lib. Annotated PDF export requires embedding.
The runtime grays PDF actions if the PDF is missing, checks relative companion
URLs over HTTP, and offers a local PDF picker if file security blocks discovery.
PNG/session exports continue to work. Replacing an existing companion also
requires `--force`; failed builds preserve the previous HTML and PDF.

## Motion effects

Use `[effects]` to configure the dependency-free particle morph and rack-focus
runtime effects:

```toml
[effects]
particle_morph = "sections"       # sections, all, or none
particle_morph_slides = []        # destination IDs; overrides the mode when nonempty
particle_morph_duration_ms = 1400
particle_morph_cell = 10
rack_focus = false
```

With the default `sections` mode, a particle morph runs when navigation crosses
from one inferred or authored section to another. Set `particle_morph = "all"`
to use it for every slide change, or `none` to disable it. A nonempty
`particle_morph_slides` list selects exact destination slide IDs and takes
precedence over the mode. The duration is 250–6000 ms and the sampling cell is
4–32 pixels. The builder rejects destination IDs that are absent from the deck.

Rack focus starts disabled unless `rack_focus = true` is set. Presenters can
toggle it in the existing Overview panel under **Motion effects**; it then uses
the slide's semantic or wand regions and advances through them before changing
slides. The compact control stays within Pigeon's current overview design.

## Local voice triggers

In `multiple` and `zip` modes, voice recognition controls are enabled by default. `--no-voice` disables recognition;
`--voice` enables it regardless of the config. Both switches leave manual semantic
rule actions available. Recognition starts only after an explicit click. The default
`whisper` backend uses Pigeon's loopback server and a locally installed helper/model.
The optional `browser` backend requires Chrome's on-device API and language pack.
There is no remote recognition fallback. See [voice.md](voice.md) for installation
and semantic markers.

Use `[voice]` or `[pigeon.voice]`. As with other namespaced options, a
`[pigeon.voice]` table replaces the entire top-level `[voice]` table. All settings
are validated, including overridden and disabled tables, before output creation.
TOML uses snake_case; generated `manifest.voice` uses camelCase.

```toml
[voice]
enabled = true
backend = "whisper" # or "browser" for Chrome's on-device recognition
lang = "en-US"
boost = 3
cooldown_ms = 3000
stale_ms = 600
resuppress_after_dismiss_ms = 10000
restart_delay_ms = 250
watchdog_ms = 90000
pop_pad_pt = 6
pop_max_fraction = 0.85
pop_max_scale = 4
auto_close_ms = 0

# Optional: supplying rules replaces all four built-in rules.
[[voice.rules]]
id = "result"
phrases = ["main result", "the conclusion"]
target = "takeaway"
action = "pop"
multi = "stack"

# Optional: commands add navigation and presentation controls.
[[voice.commands]]
id = "next-page"
phrases = ["next page"]
command = "next_page"
```

Omit `rules` to keep defaults: `takeaway` targets `takeaway` with `stack`;
`table`, `figure`, and `example` target `_table`, `_fig`, and `_example` with
`ask`. All use `pop`. Takeaway phrases are “key message”, “key messages”,
“takeaway”, “takeaways”, “take-away message”, “takeaway message”, “take away
message”, “conclusion”, and “conclusions”. Others use “this table”, “this
figure” / “this plot”, and “this example”. `rules = []` creates no trigger rules.

Omit `commands` to keep the built-in presentation commands. They recognize
“next page”, “previous page”, “go to page” followed by a digit or English number,
“full screen”, “go to overview”, “go to graph view”, “pen mode”, “highlight
mode”, “wand mode”, “diagram mode”, and “default mode”. Page requests are rounded
to the nearest physical page and clamped to the first or last page when the
requested number is outside the deck. `commands = []` disables these commands.

## Live Q&A capture

Use `[qa]` or `[pigeon.qa]` to enable the presenter Q&A workflow. It is enabled
by default in generated manifests, but it remains inert until the presenter
says “take questions now” or “take any questions now”. Final transcript segments
after the trigger are kept in memory; the next trigger or `Q` finishes one item.
The presenter can press `Q` at any time to finish the current item and create a
white `Q&A` page containing the organized list.

```toml
[qa]
enabled = true
target = "_qa"             # pigeon-sem target on the authored Q&A slide
model = "qwen3.7-flash"     # DashScope fast model used by the loopback organizer
max_length = 4000           # bounded transcript/paragraph characters
max_items = 50
```

The local presentation server proxies `/api/qa/organize` to DashScope's
OpenAI-compatible Chat Completions API. The default base URL is
`https://dashscope.aliyuncs.com/compatible-mode/v1`; set `DASHSCOPE_BASE_URL`
for another region or workspace, or use the compatibility variables
`PIGEON_QA_BASE_URL`/`OPENAI_BASE_URL`. Key precedence is the masked Voice-window
key, `DASHSCOPE_API_KEY`, `PIGEON_QA_API_KEY`, then `OPENAI_API_KEY`.
Credentials never enter the manifest, sessions, or logs. Before the API call,
the raw bounded transcript is saved as a UTF-8 file under the deck's hidden
`.qa-transcripts/` directory. The organizer asks for a direct question-and-answer
response in fewer than 100 words, preferably one to three Markdown bullets; the
raw transcript remains visible if organization fails.

Every custom rule requires exactly `id`, `phrases`, `target`, `action`, and
`multi`. IDs must be unique; IDs and targets start with an ASCII letter or
underscore, followed by letters, digits, underscores or hyphens. Phrase arrays
must contain at least one string, each retaining letters or digits after Unicode
normalization and punctuation removal. Actions are `pop`, `focus`, or
`spotlight`; multi-match behavior is `ask` or `stack`.

Every custom command requires exactly `id`, `phrases`, and `command`. Command
IDs must be unique across rules and commands. Supported command values are
`next_page`, `previous_page`, `go_to_page`, `fullscreen`, `overview`, `graph`,
`pen`, `highlighter`, `wand`, `diagram`, and `navigate`.

Unknown settings and invalid types are errors. `enabled` is Boolean; `lang` is a
language tag such as `en-US`. All numbers must be finite. Millisecond settings
are integers from 0 to 3,600,000, except `watchdog_ms`, whose minimum is 1.
`backend` is `whisper` (default) or `browser`. `boost` is 0–10 and affects only
browser phrase hints; Whisper uses unbiased decoding. `pop_pad_pt` is 0–1000; `pop_max_fraction` is 0.01–1;
`pop_max_scale` is 1–100. `auto_close_ms = 0` leaves emphasis open until dismissed.
Voice settings are embedded in the manifest, direct-file bundle and ZIP.

## Semantic tiers

`[tiers]` configures `mode = "slide"` (default) or `"step"`, `default_preset`, and named recipe arrays under `tiers.presets`. `[pigeon.tiers]` replaces the whole table; all supplied tables are validated. `--mode step|slide` overrides the initial mode. See [semantic-tiers.md](semantic-tiers.md) for the recipe schema, defaults, pruning and authoring requirements.
