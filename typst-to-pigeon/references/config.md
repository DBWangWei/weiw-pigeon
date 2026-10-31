# Pigeon configuration

Place an optional `pigeon.toml` beside the Typst or PDF input. The builder discovers
that file automatically. An explicit `--config FILE` selects another file.
Paths inside the TOML file are relative to the config file; paths supplied on
the command line are relative to the current working directory. A `[pigeon]`
table is also accepted for namespacing, and its values override same-named
top-level values.

```toml
# pigeon.toml
# Optional fixed output; omit to use pigeon-FILENAME beside each input.
# output = "my-presentation"
navigation = "talk-v5.navigation.json"
graph = "local"
graph_provider = "codex-config"
title_effect = "text-type"
slide_transition = "camera"
no_zip = true

# Optional metadata defaults
# deck_id = "my-talk"
# title = "My presentation"
```

Supported keys are `output`, `deck_id`, `title`, `navigation`, `graph`,
`graph_provider`, `title_effect`, `slide_transition`, `no_zip`, and the nested `voice` and `tiers` tables. Unknown keys are rejected so a
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

The built-in defaults are `pigeon-{FILENAME}` beside the source (its basename
without the last suffix; `my.talk.pdf` becomes `pigeon-my.talk`), `graph = "local"`,
`graph_provider = "codex-config"`, `title_effect = "text-type"`,
`slide_transition = "camera"`, and ZIP creation enabled. `--no-zip` and
`--zip` explicitly override `no_zip`.
`--force` is intentionally command-line-only because it replaces an existing
presentation.

The config file is read during generation and is not copied into the release.
Credentials remain controlled by the graph-provider configuration and are never
stored in `pigeon.toml` or the generated presentation.

## Local voice triggers

Voice recognition controls are enabled by default. `--no-voice` disables recognition;
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
```

Omit `rules` to keep defaults: `takeaway` targets `takeaway` with `stack`;
`table`, `figure`, and `example` target `_table`, `_fig`, and `_example` with
`ask`. All use `pop`. Takeaway phrases are “key message”, “key messages”,
“takeaway”, “takeaways”, “take-away message”, “takeaway message”, “take away
message”, “conclusion”, and “conclusions”. Others use “this table”, “this
figure” / “this plot”, and “this example”. `rules = []` creates no trigger rules.

Every custom rule requires exactly `id`, `phrases`, `target`, `action`, and
`multi`. IDs must be unique; IDs and targets start with an ASCII letter or
underscore, followed by letters, digits, underscores or hyphens. Phrase arrays
must contain at least one string, each retaining letters or digits after Unicode
normalization and punctuation removal. Actions are `pop`, `focus`, or
`spotlight`; multi-match behavior is `ask` or `stack`.

Unknown settings and invalid types are errors. `enabled` is Boolean; `lang` is a
language tag such as `en-US`. All numbers must be finite. Millisecond settings
are integers from 0 to 3,600,000, except `watchdog_ms`, whose minimum is 1.
`backend` is `whisper` (default) or `browser`. `boost` is 0–10 and affects only
browser phrase hints; Whisper uses unbiased decoding. `pop_pad_pt` is 0–1000; `pop_max_fraction` is 0.01–1;
`pop_max_scale` is 1–100. `auto_close_ms = 0` leaves emphasis open until dismissed.
Voice settings are embedded in the manifest, direct-file bundle and ZIP.

## Semantic tiers

`[tiers]` configures `mode = "slide"` (default) or `"step"`, `default_preset`, and named recipe arrays under `tiers.presets`. `[pigeon.tiers]` replaces the whole table; all supplied tables are validated. `--mode step|slide` overrides the initial mode. See [semantic-tiers.md](semantic-tiers.md) for the recipe schema, defaults, pruning and authoring requirements.
