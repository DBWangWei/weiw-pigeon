# Pigeon 1.0.3

Pigeon 1.0.3 adds local voice triggers for explicitly marked Typst content.
Voice is enabled by default in generated presentations and can be disabled with
`--no-voice` or `[voice] enabled = false`. Manual semantic actions remain
available when voice is disabled or unavailable.

## Mark content and configure triggers

Copy `typst-to-pigeon/assets/pigeon-sem.typ` beside a Typst source, import
`pigeon-sem`, and wrap the complete decorated result of each table, figure,
example, or takeaway. A marker records the rendered bounds without changing the
visible artwork. Rules in `pigeon.toml` map phrases to target names and choose
`pop`, `focus`, or `spotlight`; `multi = "ask"` chooses among several matches and
`multi = "stack"` emphasizes all matching targets.

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

See [ToAdaptToUseVoice.md](../../ToAdaptToUseVoice.md),
[the voice guide](../../typst-to-pigeon/references/voice.md), and
[the configuration reference](../../typst-to-pigeon/references/config.md) for
the complete authoring and troubleshooting contract.

## Local Whisper runtime

The default backend runs a pinned whisper.cpp helper and English model on the
presenting Mac. Install it once inside a generated presentation and serve that
folder through localhost:

```sh
python3 scripts/setup_voice.py
PIGEON_VOICE_DIR="$HOME/.cache/pigeon-voice" python3 scripts/serve.py --port 8767
```

Open the URL in Chrome, choose the microphone in **Voice**, and click **Start
microphone**. Capture and inference stay local; no recordings or transcripts
are persisted. `voice.backend = "browser"` selects Chrome's on-device
recognizer instead. The diagnostics panel separates input, speech detection,
transcription, phrase matching, target resolution, action, and artwork stages.

## Voice-enabled example

[`examples/voice-enabled/`](../../examples/voice-enabled/) contains the 20-slide
DSAA3073 Week 5 introduction deck, its compiled
[`week5-introduction-voice.pdf`](../../examples/voice-enabled/week5-introduction-voice.pdf),
semantic marker helper, configuration, shared Typst files, and local assets. It
marks seven takeaways, seven tables, four examples, and three figures so the
configured trigger rules can be rehearsed across single and multi-match slides.

Build it with:

```sh
./typst-to-pigeon.sh \
  examples/voice-enabled/week5-introduction-voice.typ \
  --config examples/voice-enabled/pigeon.toml \
  --output examples/voice-enabled/pigeon-week5-introduction-voice \
  --graph lexical --voice --force
```

## Validation

The release includes strict voice configuration and semantic-region tests,
mocked local speech lifecycle and capture tests, native helper integration
coverage when the pinned helper/model are available, runtime voice tests, and
the existing diagram, wand, PDF-export, and fullscreen regressions. The Week 5
source compiles to 20 slides and its generated build reports 21 semantic
targets with zero warnings. Live microphone accuracy and browser rendering still
require a Chrome rehearsal on the presenting machine.
