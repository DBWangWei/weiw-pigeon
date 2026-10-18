#!/usr/bin/env bash
# Copy this file into a directory on PATH, optionally named typst-to-pigeon.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: typst-to-pigeon INPUT.typ|INPUT.pdf [OPTIONS]

Build Pigeon using pigeon.toml beside INPUT. Explicit options override that file.
Without a config, output defaults to INPUT's directory/pigeon-output.
Relative paths and paths containing spaces are supported.

Options:
  --config FILE            Pigeon TOML file (default: INPUT directory/pigeon.toml)
  --output DIR             Override output directory from pigeon.toml
  --force                  Replace an existing pigeon-output directory
  --title TEXT             Override the presentation title
  --deck-id ID             Override the deck identifier
  --navigation FILE        Use navigation JSON (relative to your current directory)
  --graph local|model      Graph extraction mode (default: local; pigeon.toml can override)
  --title-effect NAME      text-type (default), none, split-text, blur-text,
                           shiny-text, or gradient-text
  --slide-transition NAME  camera (default), none, fade, blur, slide, zoom,
                           pixel, staggered-wipe, or stack
  --graph-provider NAME    codex-config (default) or env
  --no-zip                 Do not create a ZIP archive
  --zip                    Create a ZIP archive
  -h, --help               Show this help

Examples:
  typst-to-pigeon talk.typ
  typst-to-pigeon talk.pdf
  typst-to-pigeon "/path/to/My Talk/slides.typ" --force
  typst-to-pigeon slides.typ --graph model --graph-provider env

Requires Python 3.11+ and Node.js 20.11+.

EOF
}

die() { printf 'typst-to-pigeon: %s\n' "$*" >&2; exit 1; }

if [[ $# -eq 0 ]]; then usage >&2; exit 2; fi
case "$1" in -h|--help) usage; exit 0 ;; esac

input=$1
shift
options=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --force) options+=("$1"); shift ;;
    --config|--output|--title|--deck-id|--navigation|--graph|--graph-provider|--title-effect|--slide-transition)
      [[ $# -ge 2 ]] || die "Missing value for $1"
      options+=("$1" "$2"); shift 2 ;;
    --zip|--no-zip) options+=("$1"); shift ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ -f "$input" && -r "$input" ]] || die "Cannot read source file: $input"
case "$input" in
  *.[tT][yY][pP]) dependencies=(python3 node typst pdftotext pdftoppm) ;;
  *.[pP][dD][fF]) dependencies=(python3 node) ;;
  *) die "Input must be a .typ or .pdf file: $input" ;;
esac
case "$input" in /*) ;; *) input="$PWD/$input" ;; esac
input_dir=$(cd -- "$(dirname -- "$input")" && pwd -P)
input="$input_dir/$(basename -- "$input")"
if [[ -n ${PIGEON_SKILL_DIR:-} ]]; then
  skill_dir=$PIGEON_SKILL_DIR
else
  launcher_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
  if [[ -r "$launcher_dir/typst_to_pigeon.py" && -r "$launcher_dir/../SKILL.md" ]]; then
    # Running the script inside a skill must use that same skill version.
    skill_dir=$(cd -- "$launcher_dir/.." && pwd -P)
  elif [[ -r "$launcher_dir/typst-to-pigeon/scripts/typst_to_pigeon.py" ]]; then
    skill_dir="$launcher_dir/typst-to-pigeon"
  else
    # A standalone copy on PATH continues to use the globally installed skill.
    skill_dir=${CODEX_HOME:-$HOME/.codex}/skills/typst-to-pigeon
  fi
fi
builder="$skill_dir/scripts/typst_to_pigeon.py"
[[ -r "$builder" ]] || die "Skill entry point not found: $builder"
for dependency in "${dependencies[@]}"; do
  command -v "$dependency" >/dev/null 2>&1 || die "Required command is missing from PATH: $dependency"
done

# The builder resolves config-relative paths beside the source and keeps the
# previous presentation until compilation and graph generation succeed.
# The conditional expansion also works with empty arrays in macOS Bash 3.2.
exec python3 "$builder" "$input" ${options[@]+"${options[@]}"}
