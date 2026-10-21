# Adapt an existing Typst deck for Pigeon voice triggers

Voice targets need explicit semantic markers. Naming a Typst function `_table()`
does not mark its output by itself.

Copy the helper into the directory containing the source deck:

```sh
cp /Users/weiwang/Code/weiw-pigeon/typst-to-pigeon/assets/pigeon-sem.typ \
  "/path/to/your/talk/pigeon-sem.typ"
```

Import it in the Typst source and wrap the complete decorated content:

```typst
#import "pigeon-sem.typ": pigeon-sem

#let _table(..args) = align(center,
  pigeon-sem("_table", table(..args))
)

#_table(
  columns: 2,
  [Method], [Error],
  [Baseline], [0.32],
)
```

Keep an outer alignment wrapper outside `pigeon-sem`; the marker should contain
the complete table, figure, example, or takeaway artwork, including its styling.
Each marked object should fit on one physical page. Give repeated objects a
stable `id:` when that helps you identify them in diagnostics.

The built-in target names and trigger phrases are:

| Target | Example trigger | Default action |
| --- | --- | --- |
| `_table` | “this table” | Pop-out |
| `_fig` | “this figure”, “this plot” | Pop-out |
| `_example` | “this example” | Pop-out |
| `takeaway` | “take away message”, “key message”, “conclusion” | Pop-out |

Configure different actions and phrases in a `pigeon.toml` beside the source.
The supported actions are `pop`, `focus`, and `spotlight`:

```toml
[voice]
backend = "whisper"

[[voice.rules]]
id = "table"
phrases = ["this table", "show the table"]
target = "_table"
action = "focus"
multi = "ask"
```

Use `multi = "stack"` to show every matching target, or `multi = "ask"` when
the presenter should choose among multiple matches.

Build the source with the repository’s converter:

```sh
python3 /Users/weiwang/Code/weiw-pigeon/typst-to-pigeon/scripts/typst_to_pigeon.py \
  "/path/to/your/talk/slides.typ" \
  --output /path/to/your/talk/pigeon-slides \
  --graph lexical --voice
```

Add `--force` when rebuilding an existing output directory. The converter also
creates a ZIP beside the output unless `--no-zip` is supplied.

Start the generated presentation through its loopback server. The default voice
backend is local Whisper; it needs the one-time per-machine setup:

```sh
cd /path/to/your/talk/pigeon-slides
python3 scripts/setup_voice.py
PIGEON_VOICE_DIR="$HOME/.cache/pigeon-voice" python3 scripts/serve.py --port 8767
```

Open `http://127.0.0.1:8767` in Chrome, open **Voice**, select the microphone,
and click **Start microphone**. After saying a short trigger, pause briefly so
Whisper can finish the utterance. The panel shows microphone input, transcription,
recognized text, phrase matching, target resolution, and the resulting action.

Use `--no-voice` at build time, or `[voice] enabled = false`, to disable voice
while retaining manual semantic actions. Direct `index.html` opening supports
manual controls but cannot invoke the native Whisper backend.

For hidden reveal content, use `pigeon-hidden(...)` or pass `visible: false` to
`pigeon-sem(...)` so hidden targets do not become voice targets on that page.
