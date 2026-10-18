"""Pigeon TOML configuration precedence tests."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
BUILDER = SKILL / 'scripts/typst_to_pigeon.py'
FIXTURE = SKILL / 'tests/fixtures/geometry.typ'


class ConfigTests(unittest.TestCase):
    def run_builder(self, source, *options, cwd=None):
        # A regression must fail against a closed local endpoint, never invoke
        # the developer's real provider or credential.
        env = dict(os.environ, OPENAI_API_KEY='config-test-only', OPENAI_BASE_URL='http://127.0.0.1:9/v1')
        result = subprocess.run([sys.executable, str(BUILDER), str(source), '--graph-provider', 'env', *options],
                                cwd=cwd or source.parent, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def test_without_config_builds_offline_with_text_type(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            self.run_builder(source, '--no-zip', cwd=SKILL)
            output = root / 'pigeon-output'
            manifest = json.loads((output / 'public/deck/manifest.json').read_text())
            graph = json.loads((output / 'public/deck/knowledge-graph.json').read_text())
            release = json.loads((output / 'release.json').read_text())
            self.assertEqual(manifest['titleEffect'], 'text-type')
            self.assertEqual(manifest['slideTransition'], 'camera')
            self.assertEqual(manifest['pigeonVersion'], '1.0.1')
            self.assertEqual(release['version'], '1.0.1')
            self.assertTrue((output / 'src/slide-transitions.js').is_file())
            self.assertEqual(graph['extraction']['mode'], 'lexical')

    def test_adjacent_pigeon_toml_controls_build_defaults(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            (root / 'pigeon.toml').write_text('''
graph = "local"
title_effect = "blur-text"
slide_transition = "pixel"
output = "configured-output"
no_zip = true
''')
            self.run_builder(source, cwd=SKILL)
            output = root / 'configured-output'
            manifest = json.loads((output / 'public/deck/manifest.json').read_text())
            self.assertEqual(manifest['titleEffect'], 'blur-text')
            self.assertEqual(manifest['slideTransition'], 'pixel')
            release = json.loads((output / 'release.json').read_text())
            self.assertEqual(release['slideTransition'], 'pixel')
            self.assertTrue(output.is_dir())
            self.assertFalse((root / 'slides-pigeon.zip').exists())
            self.assertFalse((output / 'pigeon.toml').exists())

    def test_cli_values_override_toml_and_zip_switch_is_explicit(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            (root / 'pigeon.toml').write_text('''
graph = "model"
title_effect = "blur-text"
slide_transition = "pixel"
output = "configured-output"
no_zip = true
''')
            self.run_builder(source, '--graph', 'local', '--output', 'cli-output', '--title-effect', 'none', '--slide-transition', 'fade', '--zip')
            output = root / 'cli-output'
            manifest = json.loads((output / 'public/deck/manifest.json').read_text())
            self.assertEqual(manifest['titleEffect'], 'none')
            self.assertEqual(manifest['slideTransition'], 'fade')
            graph = json.loads((output / 'public/deck/knowledge-graph.json').read_text())
            self.assertEqual(graph['extraction']['mode'], 'lexical')
            self.assertTrue((root / 'cli-output').is_dir())
            self.assertTrue((root / 'slides-pigeon.zip').is_file())

    def test_pigeon_table_is_supported_and_unknown_keys_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            (root / 'pigeon.toml').write_text('[pigeon]\ngraph = "local"\ntitle_effect = "text-type"\n')
            self.run_builder(source)
            manifest = json.loads((root / 'pigeon-output/public/deck/manifest.json').read_text())
            self.assertEqual(manifest['titleEffect'], 'text-type')
            (root / 'pigeon.toml').write_text('graph = "local"\nunknown = true\n')
            failed = subprocess.run([sys.executable, str(BUILDER), str(source), '--force'],
                                    cwd=root, capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('unknown', failed.stderr)

    def test_explicit_config_and_launcher_keep_config_relative_paths(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            settings = root / 'settings'; settings.mkdir()
            (root / 'pigeon.toml').write_text('unknown = true\n')  # Must not be merged into the explicit config.
            (settings / 'navigation.json').write_text(json.dumps({'defaultRoute': ['03', 'portrait', 'intro']}))
            config = settings / 'custom.toml'
            config.write_text('graph="local"\noutput="presentation"\nnavigation="navigation.json"\ntitle_effect="blur-text"\nno_zip=false\n')
            env = dict(os.environ, PIGEON_SKILL_DIR=str(SKILL), OPENAI_API_KEY='config-test-only', OPENAI_BASE_URL='http://127.0.0.1:9/v1')
            launcher = SKILL / 'scripts/typst-to-pigeon.sh'
            result = subprocess.run(['bash', str(launcher), str(source), '--config', str(config), '--no-zip', '--graph-provider', 'env', '--slide-transition', 'staggered-wipe'],
                                    env=env, cwd=SKILL, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            output = settings / 'presentation'
            manifest = json.loads((output / 'public/deck/manifest.json').read_text())
            self.assertEqual(manifest['defaultRoute'], ['03', 'portrait', 'intro'])
            self.assertEqual(manifest['titleEffect'], 'blur-text')
            self.assertEqual(manifest['slideTransition'], 'staggered-wipe')
            self.assertFalse(list(settings.glob('*.zip')))

    def test_invalid_settings_fail_cleanly_before_creating_output(self):
        with tempfile.TemporaryDirectory(prefix='pigeon-config ') as tmp:
            root = Path(tmp); source = root / 'slides.typ'; source.write_text(FIXTURE.read_text())
            for content in ('graph = []', 'title_effect = 2', 'slide_transition = "bogus"', 'slide_transition = false', 'output = ""', 'no_zip = "yes"', 'pigeon = 3', 'force = true', 'graph = ['):
                with self.subTest(content=content):
                    (root / 'pigeon.toml').write_text(content)
                    result = subprocess.run([sys.executable, str(BUILDER), str(source)], capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertNotIn('Traceback', result.stderr)
                    self.assertFalse((root / 'pigeon-output').exists())
            result = subprocess.run([sys.executable, str(BUILDER), str(source), '--config', str(root / 'missing.toml')], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('does not exist', result.stderr)


if __name__ == '__main__':
    unittest.main()
