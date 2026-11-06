#!/usr/bin/env python3
"""Create a portable Pigeon presentation from a Typst source or PDF deck."""
from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import zipfile
from urllib.parse import quote, unquote
from image_assets import ImageAssets, PNG_SIZES
from pathlib import Path

from voice_config import resolve_voice_config
from tier_config import resolve_tier_config
from qa_config import resolve_qa_config
from effects_config import resolve_effects_config

SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_ROOT / "assets" / "pigeon-template"
CONFIG_KEYS = {
    "output", "deck_id", "title", "navigation", "graph", "graph_provider",
    "embed_pdf", "png_size", "png_to_jpg", "jpg_quality", "title_effect", "slide_transition", "out_mode", "no_zip", "voice", "tiers", "qa", "effects",
}
GRAPH_MODES = {"local", "lexical", "model"}
GRAPH_PROVIDERS = {"codex-config", "env"}
OUTPUT_MODES = {"single", "multiple", "zip"}
TITLE_EFFECTS = {"none", "split-text", "blur-text", "shiny-text", "gradient-text", "text-type"}
SLIDE_TRANSITIONS = {"camera", "none", "fade", "blur", "slide", "zoom", "pixel", "staggered-wipe", "stack"}
PIGEON_VERSION = "1.0.4"
SINGLE_RUNTIME_SCRIPTS = (
    "src/ticker.js",
    "src/title-effects.js",
    "src/wand-effects.js",
    "src/particle-effects.js",
    "src/slide-transitions.js",
    "src/diagram.js",
    "src/pdf-export.js",
    "src/semantic-tiers.js",
    "src/tier-renderer.js",
    "src/graph-layout.js",
    "src/app.js",
)


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
Initial title effect: {manifest.get("titleEffect", "none")}. Select None,
Split Text, Blur Text, Shiny Text, Gradient Text or Text Type when title assets were included at build time.
Initial slide transition: {manifest.get("slideTransition", "camera")}.
Use the Transition selector to change it for this viewing session.
Particle morph runs by default when moving between sections. Configure the
[effects] table with particle_morph = "all" or "none", or
particle_morph_slides for exact destination IDs. Rack focus starts off and can
be enabled in Overview > Motion effects.
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
The slide source is {manifest.get("sourceType", "typst")}; PDF embedded: {manifest.get("pdfEmbedded", True)}.
With a companion PDF, keep it beside the HTML. Annotated PDF export requires an embedded PDF.
For file:// companion access, use Choose PDF fallback if the browser blocks discovery.
When the PDF is embedded, Export PDF beside Present preserves the original pages
and adds all ink and inserted white/black boards, including drafts. Works offline.
PDF and PNG exports use complete source artwork, including content hidden in tiers.
""", encoding="utf-8")
    (output / "release.json").write_text(json.dumps({
        "appName": "Pigeon", "version": PIGEON_VERSION, "icon": "public/icons/pigeon.png", "deckId": manifest["deckId"],
        "title": title, "revision": manifest["revision"], "slides": len(manifest["slides"]),
        "concepts": len(graph["concepts"]), "relationships": len(graph["relationships"]),
        "graphMode": graph.get("extraction", {}).get("mode", "unknown"),
        "titleEffect": manifest.get("titleEffect", "none"),
        "slideTransition": manifest.get("slideTransition", "camera"),
        "particleMorph": manifest.get("effects", {}).get("particleMorph", "sections"),
        "particleMorphSlides": manifest.get("effects", {}).get("particleMorphSlides", []),
        "particleMorphDurationMs": manifest.get("effects", {}).get("particleMorphDurationMs", 1400),
        "particleMorphCell": manifest.get("effects", {}).get("particleMorphCell", 10),
        "rackFocus": manifest.get("effects", {}).get("rackFocus", False),
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
    if manifest.get("pdfEmbedded") is False:
        allowed.append(unquote(manifest["pdf"]))
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


def _data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def write_single_file(staged: Path, target: Path) -> None:
    """Flatten a generated presentation into one self-contained HTML file.

    The deck bundle already embeds all deck-specific JSON, SVG, PDF and linked
    resource data. This function inlines the shell CSS, runtime sources, icons,
    and that bundle so the result can be opened directly with file://.
    """
    script_sources = {
        path: (staged / path).read_text(encoding="utf-8")
        for path in SINGLE_RUNTIME_SCRIPTS
    }
    # pdf-export loads pdf-lib lazily; make it available through the same inline
    # source map instead of requiring a vendor file beside the HTML.
    manifest = json.loads((staged / "public/deck/manifest.json").read_text())
    if manifest.get("pdfEmbedded", True):
        script_sources["src/vendor/pdf-lib.min.js"] = (staged / "src/vendor/pdf-lib.min.js").read_text(encoding="utf-8")
    encoded_sources = json.dumps(script_sources, ensure_ascii=False, separators=(",", ":"))
    encoded_sources = encoded_sources.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")

    def script(code: str) -> str:
        # Escape raw HTML script delimiters within JS strings and comments.
        return "<script>" + re.sub(r"</script", r"<\\/script", code, flags=re.IGNORECASE) + "</script>"

    inline_config = script("window.PIGEON_SINGLE_FILE_SCRIPTS=" + encoded_sources + ";window.PIGEON_SINGLE_FILE=true;")
    bundle = (staged / "public/deck/embedded-deck.js").read_text(encoding="utf-8")
    bootstrap = (staged / "src/bootstrap.js").read_text(encoding="utf-8")
    inline_runtime = script(bundle) + inline_config + script(bootstrap)
    document = (staged / "index.html").read_text(encoding="utf-8")
    styles = (staged / "styles.css").read_text(encoding="utf-8")
    document = re.sub(
        r'<link\s+rel="stylesheet"\s+href="styles\.css"\s*/?>',
        lambda _: "<style data-pigeon-inline-styles>" + styles + "</style>",
        document,
        count=1,
    )
    for filename in ("pigeon.png", "pigeon-32.png", "pigeon-180.png"):
        document = document.replace(f"public/icons/{filename}", _data_uri(staged / "public/icons" / filename))
    if '<script src="src/bootstrap.js"></script>' not in document:
        raise RuntimeError("Generated index.html is missing the bootstrap script tag")
    document = document.replace('<script src="src/bootstrap.js"></script>', inline_runtime, 1)
    # Retain semantic-tier help while removing controls unavailable in this
    # offline handoff. The runtime does not instantiate the voice panel.
    document = re.sub(r'<div>\s*<h3>(?:Voice and marked content|Live Q&amp;A)</h3>[\s\S]*?</div>', '', document)
    document = document.replace('aria-label="Voice and semantic actions"', 'aria-label="Semantic actions"')
    document = document.replace(', and local voice triggers for marked Typst content', '')
    notices = (staged / "THIRD_PARTY_NOTICES.txt").read_text(encoding="utf-8")
    notices += "\n\n" + (staged / "src/vendor/pdf-lib.LICENSE.md").read_text(encoding="utf-8")
    document = document.replace("</body>", '<template id="pigeon-third-party-notices">' + html.escape(notices) + "</template>\n</body>")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(document, encoding="utf-8")


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
        if "effects" in container:
            resolve_effects_config(container["effects"])
    return values, path


def validate_config(config: dict) -> None:
    resolve_voice_config(config.get("voice", {}))
    resolve_tier_config(config.get("tiers", {}))
    resolve_qa_config(config.get("qa", {}))
    resolve_effects_config(config.get("effects", {}))
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
    for key in ("embed_pdf", "png_to_jpg"):
        if key in config and type(config[key]) is not bool:
            raise ValueError(f"pigeon.toml {key} must be true or false")
    ImageAssets(config.get("png_size", "768p"), config.get("png_to_jpg", True), config.get("jpg_quality", 90))
    if "out_mode" in config and (not isinstance(config["out_mode"], str) or config["out_mode"] not in OUTPUT_MODES):
        raise ValueError("pigeon.toml out_mode must be single, multiple, or zip")


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
    parser.add_argument("--output", type=Path, default=None, help="Output HTML path (single) or directory (multiple/zip); default: pigeon-{source filename} beside the source")
    parser.add_argument("--deck-id", default=None)
    parser.add_argument("--mode", choices=["step", "slide"], default=None)
    parser.add_argument("--title", default=None)
    parser.add_argument("--navigation", type=Path, default=None)
    parser.add_argument("--graph", choices=sorted(GRAPH_MODES), default=None, help="Config value or local by default")
    parser.add_argument("--graph-provider", choices=sorted(GRAPH_PROVIDERS), default=None)
    parser.add_argument("--title-effect", choices=sorted(TITLE_EFFECTS), default=None, help="Config value or none by default; none omits title animation SVGs")
    parser.add_argument("--slide-transition", choices=sorted(SLIDE_TRANSITIONS), default=None, help="Config value or camera (original movement) by default")
    parser.add_argument("--embed-pdf", action=argparse.BooleanOptionalAction, default=None, help="Embed source PDF (default); --no-embed-pdf writes a companion PDF beside the HTML")
    parser.add_argument("--png-size", choices=sorted(PNG_SIZES), default=None, help="Embedded PNG bounds: 768p (1366x768, default), 1080p (1920x1080), original; never upscales")
    png_group = parser.add_mutually_exclusive_group()
    png_group.add_argument("--png", dest="png_to_jpg", action="store_false", default=None, help="Keep embedded slide images as PNG (JPEG is the default)")
    png_group.add_argument("--png-to-jpg", dest="png_to_jpg", action="store_true", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--quality", "--jpg-quality", dest="jpg_quality", type=int, default=None, help="JPEG quality, 1-100 (default 90)")
    output_group = parser.add_mutually_exclusive_group()
    output_group.add_argument("--out-mode", choices=sorted(OUTPUT_MODES), default=None, help="single (default): standalone HTML; multiple: folder; zip: folder plus ZIP")
    output_group.add_argument("--single-file", dest="out_mode", action="store_const", const="single", help="Alias for --out-mode single")
    output_group.add_argument("--no-zip", dest="out_mode", action="store_const", const="multiple", help="Compatibility alias for --out-mode multiple")
    output_group.add_argument("--zip", dest="out_mode", action="store_const", const="zip", help="Compatibility alias for --out-mode zip")
    voice_group = parser.add_mutually_exclusive_group()
    voice_group.add_argument("--voice", dest="voice_enabled", action="store_true", help="Enable local voice recognition controls (explicit start required)")
    voice_group.add_argument("--no-voice", dest="voice_enabled", action="store_false", help="Disable recognition; manual semantic actions remain available")
    parser.set_defaults(voice_enabled=None)
    parser.add_argument("--force", action="store_true", help="Replace an existing output file or presentation directory")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_file() or source.suffix.lower() not in {".typ", ".pdf"}:
        raise ValueError(f"Cannot read .typ or .pdf source: {source}")
    if source.suffix.lower() == '.pdf':
        from pdf_input import pdf_library
        pdf_library()  # Fail before creating output if the optional dependency is absent.
    config, config_path = load_pigeon_config(source, args.config)
    validate_config(config)
    legacy_mode = ("multiple" if config["no_zip"] else "zip") if "no_zip" in config else "single"
    out_mode = choose(args.out_mode, config, "out_mode", legacy_mode)
    if out_mode == "single" and args.voice_enabled:
        raise ValueError("--voice requires --out-mode multiple or --out-mode zip; single-file output is an offline presentation without voice or live Q&A")
    voice = resolve_voice_config(config.get("voice", {}), args.voice_enabled)
    tiers = resolve_tier_config(config.get("tiers", {}), args.mode)
    qa = resolve_qa_config(config.get("qa", {}))
    if out_mode == "single":
        voice["enabled"] = False
        qa["enabled"] = False
    configured_output = config_file_path(config, "output", config_path)
    requested_output = args.output.expanduser() if args.output is not None else configured_output or source.parent / f"pigeon-{source.stem}"
    if out_mode == "single" and requested_output.suffix.lower() not in {".html", ".htm"}:
        requested_output = Path(str(requested_output) + ".html")
    output = requested_output.resolve()
    if source.is_relative_to(output) or SKILL_ROOT.is_relative_to(output):
        raise ValueError("Output must not contain the source or skill directory")
    if requested_output.is_symlink():
        raise ValueError("Output cannot be a symlink")
    if output.exists():
        if out_mode == "single":
            if not output.is_file():
                raise ValueError(f"Single-file output must be a file path: {output}")
            if not args.force:
                raise ValueError(f"Output file already exists: {output}; use --force to rebuild")
        else:
            if not output.is_dir():
                raise ValueError(f"Output must be a directory for {out_mode} mode: {output}")
            if any(output.iterdir()) and not args.force:
                raise ValueError(f"Output directory is not empty: {output}; use --force to rebuild")
    deck_id = choose(args.deck_id, config, "deck_id", None)
    title = choose(args.title, config, "title", None)
    graph_mode = choose(args.graph, config, "graph", "local")
    graph_provider = choose(args.graph_provider, config, "graph_provider", "codex-config")
    title_effect = choose(args.title_effect, config, "title_effect", "none")
    slide_transition = choose(args.slide_transition, config, "slide_transition", "camera")
    embed_pdf = choose(args.embed_pdf, config, "embed_pdf", True)
    png_size = choose(args.png_size, config, "png_size", "768p")
    png_to_jpg = choose(args.png_to_jpg, config, "png_to_jpg", True)
    jpg_quality = choose(args.jpg_quality, config, "jpg_quality", 90)
    ImageAssets(png_size, png_to_jpg, jpg_quality)
    companion = output.parent / source.with_suffix(".pdf").name if out_mode == "single" else output / source.with_suffix(".pdf").name
    if not embed_pdf and out_mode == "single":
        if companion.is_symlink():
            raise ValueError(f"Companion PDF must not be a symlink: {companion}")
        if companion.exists() and not companion.is_file():
            raise ValueError(f"Companion PDF path must be a file: {companion}")
        if companion != source and companion.exists() and not args.force:
            raise ValueError(f"Companion PDF already exists: {companion}; use --force to rebuild")
    navigation = args.navigation.expanduser() if args.navigation is not None else config_file_path(config, "navigation", config_path)
    if navigation is not None and not navigation.is_file():
        raise ValueError(f"Cannot read navigation JSON: {navigation}")
    if config_path:
        print(f"Pigeon config: {config_path}", flush=True)
    print(f"Pigeon output: {output}; output mode: {out_mode}; graph: {graph_mode}; title effect: {title_effect}; transition: {slide_transition}", flush=True)
    if out_mode == "single":
        print("Single-file output embeds the offline runtime; voice and live Q&A require --out-mode multiple or zip.", flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Keep the previous presentation usable until the entire new build succeeds.
    with tempfile.TemporaryDirectory(prefix=".pigeon-build-", dir=output.parent) as temporary:
        staged = Path(temporary) / "presentation"
        copy_template(staged)
        if out_mode != "single" and (output / "cache").is_dir():
            shutil.copytree(output / "cache", staged / "cache")
        exporter = SKILL_ROOT / "scripts" / "export_deck.py"
        graph_builder = SKILL_ROOT / "scripts" / ("model_graph.py" if graph_mode == "model" else "extract_graph.py")
        tier_path = Path(temporary) / "tiers-config.json"
        tier_path.write_text(json.dumps(tiers))
        run([sys.executable, str(exporter), "--source", str(source), "--output", str(staged), "--tiers-config", str(tier_path),
             "--title-effect", title_effect, "--png-size", png_size, "--quality", str(jpg_quality),
             *([] if png_to_jpg else ["--png"]),
             *((["--deck-id", deck_id]) if deck_id else []),
             *((["--title", title]) if title else []),
             *((["--navigation", str(navigation.expanduser().resolve())]) if navigation else [])], cwd=source.parent)
        manifest_path = staged / "public/deck/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["pdfEmbedded"] = embed_pdf
        manifest["titleEffect"] = title_effect
        manifest["slideTransition"] = slide_transition
        manifest["pigeonVersion"] = PIGEON_VERSION
        manifest["voice"] = voice
        manifest["qa"] = qa
        effects = resolve_effects_config(config.get("effects", {}))
        slide_ids = {slide["id"] for slide in manifest.get("slides", [])}
        unknown_effect_slides = sorted(set(effects["particleMorphSlides"]) - slide_ids)
        if unknown_effect_slides:
            raise ValueError(
                "effects.particle_morph_slides contains unknown slide ID(s): "
                + ", ".join(unknown_effect_slides)
            )
        manifest["effects"] = effects
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        graph_args = [sys.executable, str(graph_builder), "--root", str(staged)]
        if graph_mode == "model":
            graph_args.extend(["--provider", graph_provider])
        else:
            graph_args.extend(["--mode", graph_mode])
        run(graph_args, cwd=staged)
        if not embed_pdf:
            if companion != source:
                shutil.move(staged / "public/deck" / manifest["pdf"], staged / companion.name)
            manifest["pdf"] = quote(companion.name, safe="")
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        run(["node", str(SKILL_ROOT / "scripts" / "build-file-bundle.mjs"), str(staged)], cwd=staged)
        graph = json.loads((staged / "public/deck/knowledge-graph.json").read_text())
        write_release(staged, manifest, graph)
        artifact = staged
        if out_mode == "single":
            artifact = Path(temporary) / "presentation.html"
            write_single_file(staged, artifact)
        pdf_backup = Path(temporary) / "previous.pdf"
        backup = Path(temporary) / "previous"
        installed_pdf = False
        try:
            if not embed_pdf and out_mode == "single" and companion != source:
                if companion.exists(): companion.rename(pdf_backup)
                (staged / companion.name).rename(companion)
                installed_pdf = True
            if output.exists(): output.rename(backup)
            artifact.rename(output)
        except BaseException:
            if backup.exists(): backup.rename(output)
            if installed_pdf: companion.unlink(missing_ok=True)
            if pdf_backup.exists(): pdf_backup.rename(companion)
            raise
    archive = write_zip(output, manifest) if out_mode == "zip" else None
    result = {"output": str(output), "outMode": out_mode, "deckId": manifest["deckId"], "slides": len(manifest["slides"]),
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
