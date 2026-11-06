# Voice-enabled Pigeon presentations

This is the shortest path from a new Typst source to a local Pigeon deck with
voice navigation and live Q&A.

## 1. Create the Typst source

Start a talk directory and copy the shared Typst helpers. The `pigeon-sem.typ`
helper marks regions that voice and Q&A can target without changing their
visual layout.

```sh
mkdir -p my-talk
cp -R examples/voice-enabled/shared my-talk/shared
cp examples/voice-enabled/pigeon-sem.typ my-talk/pigeon-sem.typ
```

Import the helper in `my-talk/talk.typ`. Add a semantic `_qa` region to the
slide where the live list should appear. For example, with the voice-enabled
example's `ws` slide wrapper:

```typst
#import "shared/style.typ": *
#import "pigeon-sem.typ": pigeon-sem

#show: deck
#set document(title: "My talk", author: "Presenter")
#let ws = s

#ws("01", [Questions], section: "Q&A")[
  #pigeon-sem("_qa", rect(width: 100%, height: 180pt, fill: white))
]
```

Keep the rest of the slide source and its assets beside `talk.typ`. If your
source uses a different slide wrapper, put `pigeon-sem("_qa", ...)` around the
authored box or other area reserved for the live Q&A panel.

## 2. Configure the build

Create `my-talk/pigeon.toml`:

```toml
graph = "local"
out_mode = "multiple" # voice/Q&A require the local server; single is for offline sharing
title_effect = "text-type"

[voice]
enabled = true
backend = "whisper"
lang = "en-US"

[qa]
enabled = true
target = "_qa"
model = "qwen3.7-flash"
max_length = 4000
max_items = 50
```

Build from the repository root (or use the installed `typst-to-pigeon` launcher):

```sh
./typst-to-pigeon.sh my-talk/talk.typ \
  --config my-talk/pigeon.toml \
  --output my-talk/pigeon-talk \
  --out-mode multiple --graph local --voice --force
```

The generated presentation is in `my-talk/pigeon-talk`. The output directory
contains its own `scripts/setup_voice.py` and `scripts/serve.py` files.

## 3. Start voice recognition

Install the local Whisper helper once on the presenting machine, then start the
loopback server:

```sh
cd my-talk/pigeon-talk
python3 scripts/setup_voice.py
python3 scripts/serve.py
```

Open the printed `http://127.0.0.1:8765` URL in Chrome, open **Voice**, and
click **Start microphone**. Recognition is local to the machine. The built-in
commands include:

- `next page` and `previous page`
- `go to page N` (numbers outside the deck clamp to the nearest valid page)
- `full screen`, `go to overview`, and `go to graph view`
- `pen mode`, `highlight mode`, `wand mode`, `diagram mode`, and `default mode`

## 4. Capture and organize Q&A

After an audience member asks a question, repeat or paraphrase it and say
`take questions now` (or `take any questions now`). Give the answer, then press
`Q` or `q`. The next trigger starts the next item. Each item is shown in the
`_qa` region and is also included when the white Q&A page is created.

Before calling the organizer, Pigeon saves the raw bounded transcript as a
UTF-8 file under:

```text
my-talk/pigeon-talk/.qa-transcripts/qa-YYYYMMDD-HHMMSS-*.txt
```

The default organizer uses DashScope's OpenAI-compatible Chat Completions API
with `qwen3.7-flash`. It identifies the audience question and presenter answer,
removes filler, directly addresses the question, and returns fewer than 100
words, preferably as one to three Markdown bullets. If organization is
unavailable, the raw transcript remains on the slide and the local file is
still kept.

Set the API key before starting the server:

```sh
export DASHSCOPE_API_KEY='your-key'
python3 scripts/serve.py
```

Alternatively, open the Voice window and enter the key in **DashScope API key**.
The field is a password input: the value is masked, held only in page memory,
sent only to the same-origin local organizer request, and cleared when the
page is destroyed. It is never written to the manifest, session export, raw
transcript, or logs. Use `DASHSCOPE_BASE_URL` when a regional or workspace
DashScope endpoint is required.

For the full configuration and rehearsal details, see
[`typst-to-pigeon/references/voice.md`](typst-to-pigeon/references/voice.md),
[`typst-to-pigeon/references/config.md`](typst-to-pigeon/references/config.md),
and [`typst-to-pigeon/references/runtime.md`](typst-to-pigeon/references/runtime.md).
