#!/usr/bin/env bash
# Install the adjacent, verified skill; keep the previous installation as backup.
set -euo pipefail
if [[ ${1:-} == --help || $# -gt 1 ]]; then
  printf 'Usage: %s [DESTINATION_SKILL_DIRECTORY]\n' "$0"
  printf 'Default: ${CODEX_HOME:-$HOME/.codex}/skills/typst-to-pigeon\n'
  exit 0
fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
destination=${1:-${CODEX_HOME:-$HOME/.codex}/skills/typst-to-pigeon}
exec python3 - "$script_dir/typst-to-pigeon" "$destination" <<'PY'
from datetime import datetime
from pathlib import Path
import shutil
import sys
import tempfile

source = Path(sys.argv[1]).resolve()
requested = Path(sys.argv[2]).expanduser()
destination = requested.resolve()
required = ['SKILL.md', 'scripts/typst_to_pigeon.py', 'assets/pigeon-template/src/title-effects.js']
try:
    if requested.is_symlink():
        raise ValueError('Destination must be a directory, not a symlink')
    if source == destination or source.is_relative_to(destination) or destination.is_relative_to(source):
        raise ValueError('Source and destination must be separate directories')
    if not all((source / name).is_file() for name in required):
        raise ValueError('The complete updated skill must be beside this installer')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.pigeon-install-', dir=destination.parent) as temporary:
        stage = Path(temporary) / 'skill'
        shutil.copytree(source, stage, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
        backup = destination.with_name(destination.name + '.backup-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        if destination.exists(): destination.rename(backup)
        try:
            stage.rename(destination)
        except BaseException:
            if backup.exists(): backup.rename(destination)
            raise
    print(f'Installed: {destination}')
    if backup.exists(): print(f'Previous installation: {backup}')
except (OSError, ValueError) as error:
    print(f'Installation failed: {error}', file=sys.stderr)
    sys.exit(1)
PY
