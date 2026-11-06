#!/usr/bin/env python3
"""Install the tested Week 5 runtime with a recoverable backup."""
from pathlib import Path
import argparse
import datetime
import json
import os
import shutil
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path(
        "/Users/weiwang/Library/CloudStorage/Dropbox/teaching/==HKUST-GZ_teaching/"
        "DSAA3073/DSAA3073-teaching/26Fall/slides/week5/pigeon-week5-introduction"))
    parser.add_argument("--check", action="store_true", help="Check the update without writing")
    args = parser.parse_args()
    source = Path(__file__).resolve().with_name("pigeon-week5-introduction")
    target = args.target.resolve()
    manifest = Path("public/deck/manifest.json")
    expected = json.loads((source / manifest).read_text())
    actual = json.loads((target / manifest).read_text())
    if any(expected[key] != actual[key] for key in ("deckId", "revision")):
        raise SystemExit("The destination is a different deck or revision. No files were changed.")
    names = [Path(name) for name in (
        "index.html", "styles.css", "src/app.js", "src/diagram.js", "src/slide-transitions.js")]
    pending = [name for name in names if (source / name).read_bytes() != (target / name).read_bytes()]
    if not pending:
        print(f"Already updated: {target / 'index.html'}")
        return
    if args.check:
        print(f"Ready to update {len(pending)} runtime files in {target}")
        return
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = target / f"runtime-backup-{stamp}"
    backup.mkdir()
    for name in pending:
        (backup / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target / name, backup / name)
    try:
        for name in pending:
            destination = target / name
            with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".pigeon-update-", delete=False) as handle:
                staged = Path(handle.name)
                handle.write((source / name).read_bytes())
            try:
                os.replace(staged, destination)
            finally:
                staged.unlink(missing_ok=True)
    except Exception:
        for name in pending:
            shutil.copy2(backup / name, target / name)
        raise
    for name in names:
        if (source / name).read_bytes() != (target / name).read_bytes():
            raise SystemExit(f"Verification failed: {name}")
    print(f"Updated: {target / 'index.html'}\nBackup: {backup}\nReload the presentation to load the new runtime.")


if __name__ == "__main__":
    main()
