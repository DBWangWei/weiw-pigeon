#!/usr/bin/env python3
"""Create a portable Pigeon presentation from a Typst source or PDF deck."""
from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
import sys
import tempfile
import tomllib
import zipfile
from pathlib import Path

from voice_config import resolve_voice_config
from tier_config import resolve_tier_config
from qa_config import resolve_qa_config

SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_ROOT / "assets" / "pigeon-template"
CONFIG_KEYS = {
    "output", "deck_id", "title", "navigation", "graph", "graph_provider",
    "title_effect", "slide_transition", "no_zip", "voice", "tiers", "qa",
}
GRAPH_MODES = {"local", "lexical", "model"}
GRAPH_PROVIDERS = {"codex-config", "env"}
TITLE_EFFECTS = {"none", "split-text", "blur-text", "shiny-text", "gradient-text", "text-type"}
SLIDE_TRANSITIONS = {"camera", "none", "fade", "blur", "slide", "zoom", "pixel", "staggered-wipe", "stack"}
PIGEON_VERSION = "1.0.4"


def run(command: list[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def copy_template(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    existing = list(output.iterdir())
    if existing:
        raise RuntimeError(f"Output directory is not empty: {output}; choose another path or pass --force")
    for source in TEMPLATE.iterdir():
        destination = output / source.name
        if source.is_dir():
            shutil.copytree(source, destination)
        else:
            shutil.copy2(source, destination)


def write_release(output: Path, manifest: dict, graph: dict) -> None:
    title = manifest["title"]
    (output / "index.html").write_text(
        (output / "index.html").read_text(encoding="utf-8").replace("{{DECK_TITLE}}", html.escape(title)),
        encoding="utf-8",
    )
    (output / "README.txt").write_text(f"""Pigeon
Interactive canvas presentation · {title}
Version {PIGEON_VERSION}

Double-click index.html to open the presentation directly. Keep the extracted folder together.
For predictable browser storage, run: python3 scripts/serve.py
Then open http://127.0.0.1:8765 in Chrome for voice recognition.

Keys: O overview, T hierarchy/graph, arrows/Enter select/open, / search, G jump,
R resume the talk, F presentation, B blackout. V navigation, L laser, P pen,
H highlighter, E eraser, M magic wand. Repeat a tool key to turn it off.
With a wand object lit, ` cycles Pop-out, Focus (isolated navy), Spotlight.
Takeaways start at Spotlight. Escape dismisses emphasis and keeps Wand selected.
In pen mode, a single ` toggles Pen down after a 300 ms double-tap window.
Double-tap ` in Pen or Diagram mode to undo while keeping the current tool.
Pen down draws without holding a button; compact mode notices sit at top right.
1/2/3/4 select red/blue/dark green/yellow. ? opens the shortcut guide.
D enters Diagram mode: V select, R rectangle, D diamond, O ellipse, A arrow,
L line, T text, H pan, S stroke color, G fill; Shift+T triangle, Shift+P
parallelogram, Shift+L routing. Enter creates/edits; Cmd/Ctrl+D duplicates;
Cmd/Ctrl+C/V/X copies/pastes/cuts. Arrows move; Cmd/Ctrl+Alt+arrows resize.
PageUp/PageDown navigate. Escape clears editing/selection, then exits.
Repeated list-only Overview/Outline pages group slides into numbered sections.
W inserts a whiteboard, Shift+W a blackboard, K keeps a board.
Voice Q&A: say “take questions now” (or “take any questions now”) after
repeating a question, then answer it. Press Q to finish the current item and
create a white Q&A page. Add a pigeon-sem target such as “_qa” to the slide
where live answers should appear; the optional [qa] config controls the target
and fast organizer model.
+/- zoom from 3% to 3200%; 0 fits the slide; Home fits the whole talk.
Initial title effect: {manifest.get("titleEffect", "text-type")}. Select None,
Split Text, Blur Text, Shiny Text, Gradient Text or Text Type in the top toolbar.
Initial slide transition: {manifest.get("slideTransition", "camera")}.
Use the Transition selector to change it for this viewing session.
Semantic tier navigation: {manifest.get("tiers", {}).get("mode", "slide")} mode initially.
On authored tier decks, N toggles Slide / Step mode. Slide mode enters the
slide's default tier; Step mode walks its tiers before moving to another slide.
Period/comma change tiers on this slide. Shift+PageDown/PageUp or Shift-click
Next/Previous swaps navigation granularity. Enter follows a semantic deep link
in Navigate mode; R restores the exact return tier. Tiers are independent states.
Voice recognition enabled: {manifest.get("voice", {}).get("enabled", True)}.
Open Voice, then click Start microphone in a supported browser.
Default voice backend: local Whisper. First run python3 scripts/setup_voice.py
once per presenting machine (CMake and a C++ compiler required; 142 MiB English model).
Then restart scripts/serve.py. Configure voice.backend = "browser" to use
Chrome's on-device engine instead. No remote recognition fallback is used.
Manual semantic actions remain available when recognition is disabled or unsupported.
The graph was generated in {graph.get("extraction", {}).get("mode", "unknown")} mode ({len(graph['concepts'])} concepts,
{len(graph['relationships'])} relationships). Review graph evidence before publishing claims.
The slide source is {manifest.get("sourceType", "typst")}; the PDF is bundled.
Export PDF beside Present in the top bar preserves the original pages
and adds all ink and inserted white/black boards, including drafts. Works offline.
PDF and PNG exports use complete source artwork, including content hidden in tiers.
""", encoding="utf-8")
    (output / "release.json").write_text(json.dumps({
        "appName": "Pigeon", "version": PIGEON_VERSION, "icon": "public/icons/pigeon.png", "deckId": manifest["deckId"],
        "title": title, "revision": manifest["revision"], "slides": len(manifest["slides"]),
        "concepts": len(graph["concepts"]), "relationships": len(graph["relationships"]),
        "graphMode": graph.get("extraction", {}).get("mode", "unknown"),
        "titleEffect": manifest.get("titleEffect", "text-type"),
        "slideTransition": manifest.get("slideTransition", "camera"),
        "sourceType": manifest.get("sourceType", "typst"),
        "voiceEnabled": manifest.get("voice", {}).get("enabled", True),
        "qaEnabled": manifest.get("qa", {}).get("enabled", False),
        "tierMode": manifest.get("tiers", {}).get("mode", "slide"),
    }, indent=2) + "\n", encoding="utf-8")


def write_zip(output: Path, manifest: dict) -> Path:
    archive = output.parent / f"{manifest['deckId']}-pigeon.zip"
    if archive.exists():
        archive.unlink()
    allowed = ["THIRD_PARTY_NOTICES.txt", "index.html", "styles.css", "Start Presentation.command", "README.txt", "release.json", "src", "public", "scripts"]
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for root_name in allowed:
            root = output / root_name
            if root.is_file():
                bundle.write(root, Path("pigeon-presentation") / root_name)
            elif root.is_dir():
                for path in sorted(root.rglob("*")):
                    if path.is_file() and (root_name != "scripts" or path.relative_to(root).as_posix() in {
                        "serve.py", "voice_worker.py", "setup_voice.py", "whisper-helper/main.cpp", "whisper-helper/CMakeLists.txt"}):
                        bundle.write(path, Path("pigeon-presentation") / path.relative_to(output))
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError("Generated ZIP failed its integrity check")
    return archive


def load_pigeon_config(source: Path, requested: Path | None) -> tuple[dict, Path | None]:
    """Load an adjacent pigeon.toml, with an optional [pigeon] namespace.

    Values in the optional table override same-named top-level values. Keeping
    the file beside the input makes a deck reproducible without putting
    presentation settings in the generated output.
    """
    path = requested.expanduser().resolve() if requested else source.parent / "pigeon.toml"
    if not path.exists():
        if requested:
            raise ValueError(f"Pigeon config does not exist: {path}")
        return {}, None
    if not path.is_file():
        raise ValueError(f"Pigeon config is not a file: {path}")
    try:
        raw = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"Cannot read Pigeon config {path}: {error}") from None
    if not isinstance(raw, dict):
        raise ValueError(f"Pigeon config must contain a TOML table: {path}")
    table = raw.get("pigeon", {})
    if not isinstance(table, dict):
        raise ValueError("The [pigeon] section must be a TOML table")
    unknown = (set(raw) - CONFIG_KEYS - {"pigeon"}) | (set(table) - CONFIG_KEYS)
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"Unknown Pigeon config key(s): {names}")
    values = {key: raw[key] for key in CONFIG_KEYS if key in raw}
    values.update({key: table[key] for key in CONFIG_KEYS if key in table})
    # A namespaced voice table replaces the top-level table, like other values.
    for container in (raw, table):
        if "voice" in container:
            resolve_voice_config(container["voice"])
        if "tiers" in container:
            resolve_tier_config(container["tiers"])
        if "qa" in container:
            resolve_qa_config(container["qa"])
    return values, path


def validate_config(config: dict) -> None:
    resolve_voice_config(config.get("voice", {}))
    resolve_tier_config(config.get("tiers", {}))
    resolve_qa_config(config.get("qa", {}))
    for key in ("output", "deck_id", "title", "navigation", "graph", "graph_provider", "title_effect", "slide_transition"):
        if key in config and (not isinstance(config[key], str) or not config[key].strip()):
            raise ValueError(f"pigeon.toml {key} must be a nonempty string")
    if "graph" in config and config["graph"] not in GRAPH_MODES:
        raise ValueError(f"Invalid pigeon.toml graph: {config['graph']!r}; choose local, lexical, or model")
    if "graph_provider" in config and config["graph_provider"] not in GRAPH_PROVIDERS:
        raise ValueError(f"Invalid pigeon.toml graph_provider: {config['graph_provider']!r}; choose codex-config or env")
    if "title_effect" in config and config["title_effect"] not in TITLE_EFFECTS:
        raise ValueError(f"Invalid pigeon.toml title_effect: {config['title_effect']!r}")
    if "slide_transition" in config and config["slide_transition"] not in SLIDE_TRANSITIONS:
        raise ValueError(f"Invalid pigeon.toml slide_transition: {config['slide_transition']!r}; choose {', '.join(sorted(SLIDE_TRANSITIONS))}")
    if "no_zip" in config and not isinstance(config["no_zip"], bool):
        raise ValueError("pigeon.toml no_zip must be true or false")


def config_file_path(config: dict, key: str, config_path: Path | None) -> Path | None:
    if key not in config:
        return None
    path = Path(config[key]).expanduser()
    return path if path.is_absolute() else config_path.parent / path


def choose(cli_value, config: dict, key: str, default):
    return cli_value if cli_value is not None else config.get(key, default)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Typst (.typ) source or PDF (.pdf) slide deck")
    parser.add_argument("--config", type=Path, default=None, help="Pigeon TOML file; default: pigeon.toml beside the source")
    parser.add_argument("--output", type=Path, default=None, help="Output directory; default: config value or pigeon-{source filename without suffix} beside the source")
    parser.add_argument("--deck-id", default=None)
    parser.add_argument("--mode", choices=["step", "slide"], default=None)
    parser.add_argument("--title", default=None)
    parser.add_argument("--navigation", type=Path, default=None)
    parser.add_argument("--graph", choices=sorted(GRAPH_MODES), default=None, help="Config value or local by default")
    parser.add_argument("--graph-provider", choices=sorted(GRAPH_PROVIDERS), default=None)
    parser.add_argument("--title-effect", choices=sorted(TITLE_EFFECTS), default=None, help="Config value or text-type by default")
    parser.add_argument("--slide-transition", choices=sorted(SLIDE_TRANSITIONS), default=None, help="Config value or camera (original movement) by default")
    zip_group = parser.add_mutually_exclusive_group()
    zip_group.add_argument("--no-zip", dest="no_zip", action="store_true")
    zip_group.add_argument("--zip", dest="no_zip", action="store_false")
    voice_group = parser.add_mutually_exclusive_group()
    voice_group.add_argument("--voice", dest="voice_enabled", action="store_true", help="Enable local voice recognition controls (explicit start required)")
    voice_group.add_argument("--no-voice", dest="voice_enabled", action="store_false", help="Disable recognition; manual semantic actions remain available")
    parser.set_defaults(no_zip=None, voice_enabled=None)
    parser.add_argument("--force", action="store_true", help="Replace an existing output directory")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_file() or source.suffix.lower() not in {".typ", ".pdf"}:
        raise ValueError(f"Cannot read .typ or .pdf source: {source}")
    if source.suffix.lower() == '.pdf':
        from pdf_input import pdf_library
        pdf_library()  # Fail before creating output if the optional dependency is absent.
    config, config_path = load_pigeon_config(source, args.config)
    validate_config(config)
    voice = resolve_voice_config(config.get("voice", {}), args.voice_enabled)
    tiers = resolve_tier_config(config.get("tiers", {}), args.mode)
    qa = resolve_qa_config(config.get("qa", {}))
    configured_output = config_file_path(config, "output", config_path)
    requested_output = args.output.expanduser() if args.output is not None else configured_output or source.parent / f"pigeon-{source.stem}"
    output = requested_output.resolve()
    if source.is_relative_to(output) or SKILL_ROOT.is_relative_to(output):
        raise ValueError("Output must not contain the source or skill directory")
    if requested_output.is_symlink():
        raise ValueError("Output cannot be a symlink")
    if output.exists() and any(output.iterdir()) and not args.force:
        raise ValueError(f"Output directory is not empty: {output}; use --force to rebuild")
    deck_id = choose(args.deck_id, config, "deck_id", None)
    title = choose(args.title, config, "title", None)
    graph_mode = choose(args.graph, config, "graph", "local")
    graph_provider = choose(args.graph_provider, config, "graph_provider", "codex-config")
    title_effect = choose(args.title_effect, config, "title_effect", "text-type")
    slide_transition = choose(args.slide_transition, config, "slide_transition", "camera")
    no_zip = choose(args.no_zip, config, "no_zip", False)
    navigation = args.navigation.expanduser() if args.navigation is not None else config_file_path(config, "navigation", config_path)
    if navigation is not None and not navigation.is_file():
        raise ValueError(f"Cannot read navigation JSON: {navigation}")
    if config_path:
        print(f"Pigeon config: {config_path}", flush=True)
    print(f"Pigeon output: {output}; graph: {graph_mode}; title effect: {title_effect}; transition: {slide_transition}", flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Keep the previous presentation usable until the entire new build succeeds.
    with tempfile.TemporaryDirectory(prefix=".pigeon-build-", dir=output.parent) as temporary:
        staged = Path(temporary) / "presentation"
        copy_template(staged)
        if (output / "cache").is_dir():
            shutil.copytree(output / "cache", staged / "cache")
        exporter = SKILL_ROOT / "scripts" / "export_deck.py"
        graph_builder = SKILL_ROOT / "scripts" / ("model_graph.py" if graph_mode == "model" else "extract_graph.py")
        tier_path = Path(temporary) / "tiers-config.json"
        tier_path.write_text(json.dumps(tiers))
        run([sys.executable, str(exporter), "--source", str(source), "--output", str(staged), "--tiers-config", str(tier_path),
             *((["--deck-id", deck_id]) if deck_id else []),
             *((["--title", title]) if title else []),
             *((["--navigation", str(navigation.expanduser().resolve())]) if navigation else [])], cwd=source.parent)
        manifest_path = staged / "public/deck/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["titleEffect"] = title_effect
        manifest["slideTransition"] = slide_transition
        manifest["pigeonVersion"] = PIGEON_VERSION
        manifest["voice"] = voice
        manifest["qa"] = qa
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        graph_args = [sys.executable, str(graph_builder), "--root", str(staged)]
        if graph_mode == "model":
            graph_args.extend(["--provider", graph_provider])
        else:
            graph_args.extend(["--mode", graph_mode])
        run(graph_args, cwd=staged)
        run(["node", str(SKILL_ROOT / "scripts" / "build-file-bundle.mjs"), str(staged)], cwd=staged)
        graph = json.loads((staged / "public/deck/knowledge-graph.json").read_text())
        write_release(staged, manifest, graph)
        backup = Path(temporary) / "previous"
        if output.exists(): output.rename(backup)
        try:
            staged.rename(output)
        except BaseException:
            if backup.exists(): backup.rename(output)
            raise
    archive = None if no_zip else write_zip(output, manifest)
    result = {"output": str(output), "deckId": manifest["deckId"], "slides": len(manifest["slides"]),
              "concepts": len(graph["concepts"]), "relationships": len(graph["relationships"])}
    if archive:
        result["zip"] = str(archive)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print("Pigeon build stopped after the error above; the previous output was not replaced.", file=sys.stderr)
        raise SystemExit(error.returncode or 1) from None
    except (ValueError, OSError) as error:
        print(f"Pigeon build failed: {error}", file=sys.stderr)
        raise SystemExit(1) from None
