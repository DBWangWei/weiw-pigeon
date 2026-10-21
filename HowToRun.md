# Convert a PDF to Pigeon on a new Mac

This guide covers downloading [Pigeon from GitHub](https://github.com/DBWangWei/weiw-pigeon),
installing its dependencies, and converting a PDF into an offline presentation.
You do not need Codex, an API key, Typst, or Poppler for the default PDF conversion.

## 1. Install prerequisites

Install [Homebrew](https://brew.sh/) if needed, and follow its instructions to
add `brew` to your shell. Then open Terminal and run:

```bash
brew install git python@3.12 node
```

Pigeon requires Python 3.11+ and Node.js 20.11+. These instructions use Python 3.12.

## 2. Download Pigeon

```bash
mkdir -p ~/Code
cd ~/Code
git clone https://github.com/DBWangWei/weiw-pigeon.git
cd weiw-pigeon
```

## 3. Install PDF support

Create a Python environment inside the repository and install PyMuPDF:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r typst-to-pigeon/requirements-pdf.txt
```

Keep this environment active when running the converter. No global Codex skill
installation is required when using the launcher inside the repository.

## 4. Convert your PDF

Replace the example path with the full path to your PDF. Keep the quotes so
paths containing spaces work:

```bash
bash ./typst-to-pigeon.sh "$HOME/Documents/Lectures/lecture01.pdf"
```

By default, this creates:

```text
~/Documents/Lectures/pigeon-lecture01/
```

The output folder is beside the PDF and is named `pigeon-FILENAME`, with only
the final file suffix removed. For example, `lecture01.v2.pdf` produces
`pigeon-lecture01.v2/`. A ZIP archive is also generated, and the command prints
its location.

Defaults are local graph extraction, the Text Type title effect, and the Camera
slide transition. Default PDF conversion needs no internet after installation.
An optional `pigeon.toml` beside the PDF can override these defaults, including
the output location; explicit command-line options override the configuration.

To replace an existing generated presentation, add `--force`:

```bash
bash ./typst-to-pigeon.sh "$HOME/Documents/Lectures/lecture01.pdf" --force
```

## 5. Open and present

```bash
open "$HOME/Documents/Lectures/pigeon-lecture01/index.html"
```

Use arrows or Space to move, `O` for the overview, `/` to search, `F` for
presentation mode, and `?` for keyboard help.

Keep the complete generated folder together when copying it to another
computer, or share the generated ZIP and extract it there. Opening the
presentation requires only a browser and works offline. External website links
or online demos still need internet.

## Convert another PDF later

In a new Terminal window, activate the environment again:

```bash
cd ~/Code/weiw-pigeon
source .venv/bin/activate
bash ./typst-to-pigeon.sh "/full/path/to/another.pdf"
```

See the [README](README.md) for configuration, presentation tools, and annotated
PDF export.

## Run a voice-enabled Typst deck

The repository includes a complete example in
[`examples/voice-enabled/`](examples/voice-enabled/). Build it from the
repository root with:

```bash
./typst-to-pigeon.sh \
  examples/voice-enabled/week5-introduction-voice.typ \
  --config examples/voice-enabled/pigeon.toml \
  --output examples/voice-enabled/pigeon-week5-introduction-voice \
  --graph lexical --voice --force
```

Voice recognition is enabled by default for generated decks. Install the local
Whisper helper once on the presenting Mac, then serve the generated folder:

```bash
cd examples/voice-enabled/pigeon-week5-introduction-voice
python3 scripts/setup_voice.py
PIGEON_VOICE_DIR="$HOME/.cache/pigeon-voice" \
  python3 scripts/serve.py --port 8767
```

Open the printed `http://127.0.0.1:8767` URL in Chrome, open **Voice**, choose
the microphone, and click **Start microphone**. The `pigeon.toml` file maps
phrases such as “this table”, “this figure”, “this example”, and “key message”
to the marked Typst regions. Use `--no-voice` when building if recognition is
not needed; manual semantic actions remain available.
