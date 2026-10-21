#!/usr/bin/env python3
"""Install Pigeon's pinned local English speech engine (CMake and C++ compiler required)."""
import argparse
import hashlib
import os
import platform
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

VERSION = '1.9.5'
SOURCE_SHA256 = 'ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720'
MODEL_SHA256 = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'


def checked_file(destination, url, checksum, supplied=None):
    if supplied:
        supplied = supplied.expanduser().resolve()
        if supplied != destination:
            shutil.copyfile(supplied, destination)
    if not destination.exists():
        temporary = destination.with_suffix('.download')
        print(f'Downloading {destination.name}…', flush=True)
        try:
            with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
                shutil.copyfileobj(response, output)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    digest = hashlib.sha256()
    with destination.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != checksum:
        raise ValueError(f'Checksum mismatch: {destination}. Remove this file and retry.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(os.environ.get('PIGEON_VOICE_DIR', Path.home() / '.cache/pigeon-voice')))
    parser.add_argument('--source-archive', type=Path, help='Reuse an already downloaded pinned archive')
    parser.add_argument('--model-file', type=Path, help='Reuse an already downloaded verified base.en model')
    args = parser.parse_args()
    directory = args.directory.expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    if not shutil.which('cmake'):
        parser.error('Install CMake and a C++ compiler first (on macOS: Xcode Command Line Tools).')
    archive = directory / f'whisper-{VERSION}.tar.gz'
    model = directory / 'ggml-base.en.bin'
    try:
        checked_file(archive, f'https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v{VERSION}', SOURCE_SHA256, args.source_archive)
        checked_file(model, 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin', MODEL_SHA256, args.model_file)
        source = directory / f'whisper.cpp-{VERSION}'
        if not source.exists():
            with tarfile.open(archive) as bundle:
                for member in bundle.getmembers():
                    target = (directory / member.name).resolve()
                    if not target.is_relative_to(directory) or member.issym() or member.islnk():
                        raise ValueError('Unexpected archive member')
                bundle.extractall(directory)
        build = directory / 'build'
        helper_source = directory / 'helper-src'
        helper_source.mkdir(exist_ok=True)
        for name in ('CMakeLists.txt', 'main.cpp'):
            shutil.copy2(Path(__file__).parent / 'whisper-helper' / name, helper_source / name)
        # A Rosetta Python otherwise makes CMake build an emulated x86 decoder.
        native_arm = platform.system() == 'Darwin' and subprocess.run(
            ['/usr/bin/arch', '-arm64', '/usr/bin/true'], capture_output=True).returncode == 0
        architecture = ['-DCMAKE_OSX_ARCHITECTURES=arm64'] if native_arm else []
        subprocess.run(['cmake', '-S', str(helper_source), '-B', str(build),
                        f'-DWHISPER_SOURCE={source}', '-DCMAKE_BUILD_TYPE=Release', *architecture], check=True)
        subprocess.run(['cmake', '--build', str(build), '--target', 'pigeon-whisper', '--parallel', '4'], check=True)
        print(f'Local Whisper installed in {directory}\nModel: base.en (English). Audio is not recorded.\n'
              f'Start a presentation with PIGEON_VOICE_DIR="{directory}" python3 scripts/serve.py', flush=True)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Local voice setup failed: {error}\n')


if __name__ == '__main__':
    main()
