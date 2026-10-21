# Voice-enabled Typst example: Week 5 introduction

This 20-slide DSAA3073 deck is the smallest complete repository example for
Pigeon's semantic voice controls. It includes the editable Typst source, the
compiled PDF, `pigeon.toml`, the `pigeon-sem.typ` marker helper, and the local
assets needed to compile the source.

The repository also includes a generated presentation at
[`pigeon-week5-introduction-voice/index.html`](pigeon-week5-introduction-voice/index.html)
for immediate offline inspection. Use the rebuild command below after changing
the source or configuration.

## Voice targets

The source marks seven takeaways, seven tables, four worked examples, and three
figures. The adjacent configuration maps these phrases to actions:

| Phrase examples | Target | Action |
| --- | --- | --- |
| `key message`, `takeaway`, `conclusion` | `takeaway` | Pop-out all matching takeaways |
| `this table`, `show the table` | `_table` | Focus one selected table |
| `this figure`, `this plot`, `show the diagram` | `_fig` | Spotlight one selected figure |
| `this example`, `work through this example` | `_example` | Pop-out one selected example |

When a phrase matches more than one target on the current slide, the Voice panel
asks which target to use. On a slide with one target, the configured action runs
directly.

## Build and run

From the repository root, rebuild the source example with:

```sh
./typst-to-pigeon.sh \
  examples/voice-enabled/week5-introduction-voice.typ \
  --config examples/voice-enabled/pigeon.toml \
  --output examples/voice-enabled/pigeon-week5-introduction-voice \
  --graph lexical --voice --force
```

The generated folder includes a portable presentation and a ZIP beside it. For
local Whisper recognition, install the helper once on the presenting Mac, then
serve the generated folder:

```sh
cd examples/voice-enabled/pigeon-week5-introduction-voice
python3 scripts/setup_voice.py
PIGEON_VOICE_DIR="$HOME/.cache/pigeon-voice" \
  python3 scripts/serve.py --port 8767
```

Open `http://127.0.0.1:8767` in Chrome, open **Voice**, select the microphone,
and click **Start microphone**. Audio remains on the local machine. Use
`--no-voice` when building if recognition should be disabled while retaining
manual semantic actions. The browser-only backend is available by setting
`backend = "browser"` in `pigeon.toml`.

The compiled PDF is included as
[`week5-introduction-voice.pdf`](week5-introduction-voice.pdf) so the source and
its visual baseline can be compared directly.
