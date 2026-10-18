# Pigeon configuration

Place an optional `pigeon.toml` beside the Typst or PDF input. The builder discovers
that file automatically. An explicit `--config FILE` selects another file.
Paths inside the TOML file are relative to the config file; paths supplied on
the command line are relative to the current working directory. A `[pigeon]`
table is also accepted for namespacing, and its values override same-named
top-level values.

```toml
# pigeon.toml
output = "pigeon-output"
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
`graph_provider`, `title_effect`, `slide_transition`, and `no_zip`. Unknown keys are rejected so a
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

The built-in defaults are `pigeon-output` beside the source, `graph = "local"`,
`graph_provider = "codex-config"`, `title_effect = "text-type"`,
`slide_transition = "camera"`, and ZIP creation enabled. `--no-zip` and
`--zip` explicitly override `no_zip`.
`--force` is intentionally command-line-only because it replaces an existing
presentation.

The config file is read during generation and is not copied into the release.
Credentials remain controlled by the graph-provider configuration and are never
stored in `pigeon.toml` or the generated presentation.
