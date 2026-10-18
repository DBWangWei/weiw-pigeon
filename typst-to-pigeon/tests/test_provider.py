"""Credential isolation and readable provider failures; no real secrets/network."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import model_graph


class ProviderTests(unittest.TestCase):
    def config(self, root, extra=''):
        folder = root / '.codex'
        folder.mkdir()
        (folder / 'config.toml').write_text('''model = "example-model"
model_provider = "example"
[model_providers.example]
base_url = "https://provider.example/v1"
wire_api = "responses"
requires_openai_auth = true
''' + extra)
        (folder / 'auth.json').write_text(json.dumps({'OPENAI_API_KEY': 'saved-provider-key'}))

    def test_codex_auth_is_not_replaced_by_unrelated_environment_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.config(root)
            with patch.object(Path, 'home', return_value=root), patch.dict(os.environ, {'OPENAI_API_KEY': 'unrelated-provider-key'}, clear=True):
                _, key, _ = model_graph.provider_config('codex-config')
                self.assertEqual(key, 'saved-provider-key')

    def test_explicit_provider_env_key_is_required_not_replaced_by_auth_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.config(root, 'env_key = "EXAMPLE_API_KEY"\n')
            with patch.object(Path, 'home', return_value=root), patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(ValueError, 'EXAMPLE_API_KEY'):
                    model_graph.provider_config('codex-config')

    def test_explicit_environment_mode_uses_environment_key(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'explicit-env-key', 'OPENAI_BASE_URL': 'https://env.example/v1', 'OPENAI_MODEL': 'env-model'}, clear=True):
            self.assertEqual(model_graph.provider_config('env'), ('https://env.example/v1', 'explicit-env-key', 'env-model'))

    def test_authentication_error_explains_endpoint_without_leaking_key(self):
        secret = 'secret-test-key'
        error = HTTPError('https://provider.example/v1/responses', 401, 'Unauthorized', {},
                          io.BytesIO(json.dumps({'error': {'message': 'Invalid token: ' + secret, 'code': 'invalid_api_key'}}).encode()))
        with patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                model_graph.request_model('https://provider.example/v1', secret, 'example-model', [], 'Example')
        message = str(raised.exception)
        self.assertIn('401', message)
        self.assertIn('provider.example', message)
        self.assertIn('invalid_api_key', message)
        self.assertNotIn(secret, message)

    def test_build_failure_has_no_traceback(self):
        builder = Path(__file__).resolve().parents[1] / 'scripts/typst_to_pigeon.py'
        result = subprocess.run([sys.executable, str(builder), '/nonexistent/pigeon-source.typ'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Cannot read Typst source', result.stderr)
        self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__': unittest.main()
