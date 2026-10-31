"""Voice contract validation and real portable-build coverage."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / 'scripts'))
from voice_config import resolve_voice_config
from typst_to_pigeon import load_pigeon_config


class VoiceConfigTests(unittest.TestCase):
    def test_local_backend_default_and_explicit_browser_backend(self):
        self.assertEqual(resolve_voice_config({})['backend'], 'whisper')
        self.assertEqual(resolve_voice_config({'backend': 'browser'})['backend'], 'browser')
        for invalid in ('cloud', '', [], False):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                resolve_voice_config({'backend': invalid})

    def test_defaults_and_overrides_preserve_manual_rules(self):
        voice = resolve_voice_config({})
        self.assertTrue(voice['enabled'])
        self.assertEqual(voice['cooldownMs'], 3000)
        self.assertEqual(voice['staleMs'], 600)
        self.assertEqual([r['target'] for r in voice['rules']], ['takeaway', '_table', '_fig', '_example'])
        self.assertEqual([r['multi'] for r in voice['rules']], ['stack', 'ask', 'ask', 'ask'])
        self.assertEqual([c['command'] for c in voice['commands']], [
            'next_page', 'previous_page', 'go_to_page', 'fullscreen', 'overview', 'graph',
            'pen', 'highlighter', 'wand', 'diagram', 'navigate', 'qa_start',
        ])
        self.assertEqual(resolve_voice_config({}, False)['rules'], voice['rules'])
        self.assertEqual(resolve_voice_config({}, False)['commands'], voice['commands'])
        self.assertTrue(resolve_voice_config({'enabled': False}, True)['enabled'])
        self.assertEqual(resolve_voice_config({'rules': []})['rules'], [])
        self.assertEqual(resolve_voice_config({'commands': []})['commands'], [])
        voice['rules'].clear()
        self.assertEqual(len(resolve_voice_config({})['rules']), 4)

    def test_strict_commands(self):
        command = resolve_voice_config({})['commands'][0]
        for patch in ({'id': ''}, {'id': 'bad id'}, {'phrases': ['---']}, {'phrases': []},
                      {'phrases': [False]}, {'command': 'eval'}, {'command': []}, {'extra': True}):
            invalid = dict(command, **patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                resolve_voice_config({'commands': [invalid]})
        with self.assertRaises(ValueError):
            resolve_voice_config({'rules': [resolve_voice_config({})['rules'][0]], 'commands': [dict(command, id='takeaway')]})

    def test_strict_values_and_rules(self):
        for settings in (None, [], {'enabled': 1}, {'lang': ''}, {'boost': float('nan')},
                         {'boost': True}, {'stale_ms': -1}, {'cooldown_ms': 2.5},
                         {'pop_max_fraction': 1.1}, {'pop_max_scale': .5}, {'unknown': 2}, {'rules': {}}):
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                resolve_voice_config(settings)
        rule = resolve_voice_config({})['rules'][0]
        for patch in ({'id': ''}, {'id': 'bad id'}, {'phrases': ['---']}, {'phrases': []},
                      {'phrases': [False]}, {'target': ''}, {'action': 'eval'}, {'action': []},
                      {'multi': 'all'}, {'extra': True}):
            invalid = dict(rule, **patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                resolve_voice_config({'rules': [invalid]})
        with self.assertRaises(ValueError):
            resolve_voice_config({'rules': [rule, copy.deepcopy(rule)]})

    def test_namespace_replaces_voice_table_and_validates_both(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'deck.typ'; config = root / 'pigeon.toml'
            config.write_text('[voice]\nlang="fr-FR"\n[pigeon.voice]\nenabled=false\n')
            values, _ = load_pigeon_config(source, None)
            voice = resolve_voice_config(values['voice'])
            self.assertFalse(voice['enabled'])
            self.assertEqual(voice['lang'], 'en-US')
            config.write_text('[voice]\nmisspelled=true\n[pigeon.voice]\nenabled=false\n')
            with self.assertRaises(ValueError):
                load_pigeon_config(source, None)

    def test_real_builder_launchers_bundle_and_zip(self):
        with tempfile.TemporaryDirectory(prefix='voice-build-') as tmp:
            root = Path(tmp); source = root / 'slides.typ'
            source.write_text((SKILL / 'tests/fixtures/geometry.typ').read_text())
            config = root / 'pigeon.toml'
            env = dict(os.environ, PIGEON_SKILL_DIR=str(SKILL), OPENAI_API_KEY='test-only', OPENAI_BASE_URL='http://127.0.0.1:9/v1')
            commands = [([sys.executable, str(SKILL / 'scripts/typst_to_pigeon.py')], '--no-voice', True),
                        (['bash', str(SKILL / 'scripts/typst-to-pigeon.sh')], '--voice', False),
                        (['bash', str(SKILL.parent / 'typst-to-pigeon.sh')], '--no-voice', True)]
            for index, (command, flag, configured) in enumerate(commands):
                config.write_text(f'[voice]\nenabled={str(configured).lower()}\n')
                output = root / f'output-{index}'
                result = subprocess.run([*command, str(source), '--output', str(output), '--graph', 'local', flag], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                manifest = json.loads((output / 'public/deck/manifest.json').read_text())
                self.assertEqual(manifest['voice']['enabled'], flag == '--voice')
                self.assertEqual(len(manifest['voice']['rules']), 4)
                bundle = (output / 'public/deck/embedded-deck.js').read_text()
                self.assertIn('cooldownMs', bundle)
                with zipfile.ZipFile(next(root.glob('*-pigeon.zip'))) as archive:
                    packed = json.loads(archive.read('pigeon-presentation/public/deck/manifest.json'))
                    self.assertEqual(packed['voice'], manifest['voice'])
                    for name in ('voice_worker.py', 'setup_voice.py', 'whisper-helper/main.cpp', 'whisper-helper/CMakeLists.txt'):
                        self.assertIn('pigeon-presentation/scripts/' + name, archive.namelist())
            config.write_text('[voice]\nstale_ms=-1\n')
            invalid = root / 'invalid'
            result = subprocess.run([sys.executable, str(SKILL / 'scripts/typst_to_pigeon.py'), str(source), '--output', str(invalid)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('Traceback', result.stderr)
            self.assertFalse(invalid.exists())


if __name__ == '__main__':
    unittest.main()
