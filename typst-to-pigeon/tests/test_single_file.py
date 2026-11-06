"""Standalone output, script embedding, and safe replacement checks."""
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
BUILDER = SKILL / 'scripts/typst_to_pigeon.py'


class PresentationHTML(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.scripts = []
        self.external_assets = []
        self.in_script = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.scripts.append('')
            self.in_script = True
        if tag in ('script', 'img', 'link'):
            uri = attrs.get('src') or attrs.get('href')
            if uri and not uri.startswith('data:'):
                self.external_assets.append(uri)

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts[-1] += data


def embedded_bundle(document):
    script = next(code for code in document.scripts if code.startswith('window.PIGEON_DECK_BUNDLE='))
    return json.loads(script.removeprefix('window.PIGEON_DECK_BUNDLE=').strip().removesuffix(';'))


class SingleFileTests(unittest.TestCase):
    def build(self, source, *options, launcher=None):
        command = ['bash', str(launcher)] if launcher else [sys.executable, str(BUILDER)]
        return subprocess.run([*command, str(source), *options], capture_output=True, text=True)

    def source(self, root):
        source = root / 'My talk.v2.typ'
        shutil.copy2(SKILL / 'tests/fixtures/geometry.typ', source)
        return source

    def test_default_is_only_one_html_with_offline_assets_and_safe_script_text(self):
        with tempfile.TemporaryDirectory(prefix='pigeon single ') as tmp:
            root = Path(tmp)
            source = self.source(root)
            source.write_text(source.read_text() + '\n#link("./demo.html")[Local demo]\n')
            resource = root / 'demo.html'
            resource.write_text('<!doctype html><p>Offline resource</p>')
            navigation = source.with_suffix('.navigation.json')
            navigation.write_text(json.dumps({'resources': {'./demo.html': 'demo.html'}}))
            title = 'Über Ω </ScRiPt><script>window.injected=true</script>'
            result = self.build(source, '--title', title, launcher=SKILL.parent / 'typst-to-pigeon.sh')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            target = root / 'pigeon-My talk.v2.html'
            self.assertEqual(set(root.iterdir()), {source, target, resource, navigation})
            document = PresentationHTML(target.read_text())
            self.assertFalse(document.external_assets)
            self.assertEqual(len(document.scripts), 3)
            bundle = embedded_bundle(document)
            manifest = bundle['json']['public/deck/manifest.json']
            self.assertEqual(manifest['title'], title)
            self.assertEqual(len(manifest['slides']), 3)
            self.assertFalse(manifest['voice']['enabled'])
            self.assertFalse(manifest['qa']['enabled'])
            self.assertIn(resource.read_text(), bundle['resources'].values())
            self.assertIn('data:application/pdf;base64,', ''.join(bundle['assets'].values()))
            self.assertIn('pigeon-third-party-notices', target.read_text())
            config = document.scripts[1].removeprefix('window.PIGEON_SINGLE_FILE_SCRIPTS=')
            runtime, _ = json.JSONDecoder().raw_decode(config)
            self.assertIn('src/vendor/pdf-lib.min.js', runtime)
            self.assertIn('src/app.js', runtime)
            self.assertNotIn('src/voice.js', runtime)
            for code in [*document.scripts, *runtime.values()]:
                checked = subprocess.run(['node', '--check'], input=code, capture_output=True, text=True)
                self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_companion_pdf_omits_bundle_and_library_and_preserves_failed_build(self):
        with tempfile.TemporaryDirectory(prefix='pigeon companion ') as tmp:
            root=Path(tmp); source=self.source(root)
            target=root/'A # talk.html'
            result=self.build(source, '--no-embed-pdf', '--output', str(target), launcher=SKILL.parent/'typst-to-pigeon.sh')
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            companion=root/'My talk.v2.pdf'
            self.assertTrue(companion.read_bytes().startswith(b'%PDF-'))
            self.assertFalse(target.with_suffix('.pdf').exists())
            document=PresentationHTML(target.read_text()); bundle=embedded_bundle(document)
            manifest=bundle['json']['public/deck/manifest.json']
            self.assertFalse(manifest['pdfEmbedded'])
            self.assertEqual(manifest['pdf'],'My%20talk.v2.pdf')
            self.assertFalse(any(uri.startswith('data:application/pdf') for uri in bundle['assets'].values()))
            self.assertFalse(any('/titles/' in key for key in bundle['assets']))
            self.assertFalse(bundle['titleSvgs'])
            runtime,_=json.JSONDecoder().raw_decode(document.scripts[1].removeprefix('window.PIGEON_SINGLE_FILE_SCRIPTS='))
            self.assertNotIn('src/vendor/pdf-lib.min.js',runtime)
            original=(target.read_bytes(),companion.read_bytes())
            source.write_text('#invalid-function()')
            failed=self.build(source, '--no-embed-pdf', '--output',str(target),'--force')
            self.assertNotEqual(failed.returncode,0)
            self.assertEqual((target.read_bytes(),companion.read_bytes()),original)

    def test_companion_pdf_is_beside_folder_html(self):
        with tempfile.TemporaryDirectory(prefix='pigeon companion ') as tmp:
            root=Path(tmp); source=self.source(root)
            (root/'pigeon.toml').write_text('embed_pdf=false\n')
            result=self.build(source,'--out-mode','multiple')
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            output=root/'pigeon-My talk.v2'
            manifest=json.loads((output/'public/deck/manifest.json').read_text())
            self.assertEqual(manifest['pdf'],'My%20talk.v2.pdf')
            self.assertTrue((output/'My talk.v2.pdf').is_file())
            self.assertFalse(list((output/'public/deck').glob('*.pdf')))
            result=self.build(source,'--zip','--force')
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            import zipfile
            with zipfile.ZipFile(root/'my-talk-v2-pigeon.zip') as archive:
                self.assertIn('pigeon-presentation/My talk.v2.pdf',archive.namelist())

    def test_output_modes_and_aliases_override_legacy_toml(self):
        with tempfile.TemporaryDirectory(prefix='pigeon single ') as tmp:
            root = Path(tmp)
            source = self.source(root)
            (root / 'pigeon.toml').write_text('out_mode="multiple"\nno_zip=false\noutput="configured"\n')
            result = self.build(source, '--out-mode=single', launcher=SKILL / 'scripts/typst-to-pigeon.sh')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / 'configured.html').is_file())
            self.assertFalse((root / 'configured').exists())
            (root / 'pigeon.toml').write_text('out_mode="single"\nno_zip=false\noutput="from-config.html"\n')
            result = self.build(source)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / 'from-config.html').is_file())
            result = self.build(source, '--out-mode', 'multiple', '--output', str(root / 'folder'))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / 'folder/index.html').is_file())
            self.assertFalse(list(root.glob('*.zip')))

    def test_single_replacement_requires_force_and_failed_build_preserves_file(self):
        with tempfile.TemporaryDirectory(prefix='pigeon single ') as tmp:
            root = Path(tmp)
            source = self.source(root)
            target = root / 'renamed.htm'
            result = self.build(source, '--single-file', '--output', str(target))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            original = target.read_bytes()
            result = self.build(source, '--output', str(target))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('--force', result.stderr)
            source.write_text('#undefined-function()')
            result = self.build(source, '--output', str(target), '--force')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_bytes(), original)
            self.assertFalse(list(root.glob('.pigeon-build-*')))

    def test_single_rejects_live_voice_and_conflicting_cli_modes(self):
        with tempfile.TemporaryDirectory(prefix='pigeon single ') as tmp:
            root = Path(tmp)
            source = self.source(root)
            result = self.build(source, '--voice')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('--out-mode multiple', result.stderr)
            result = self.build(source, '--out-mode', 'single', '--zip')
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(root.iterdir()), [source])

    def test_pdf_source_supports_default_single_output(self):
        try:
            import pymupdf  # noqa: F401 - PDF support is optional at installation time.
        except ImportError:
            self.skipTest('PyMuPDF is not installed')
        with tempfile.TemporaryDirectory(prefix='pigeon single PDF ') as tmp:
            root = Path(tmp)
            source = root / 'slides.PDF'
            shutil.copy2(SKILL / 'tests/fixtures/geometry.pdf', source)
            result = self.build(source)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            target = root / 'pigeon-slides.html'
            self.assertEqual(set(root.iterdir()), {source, target})
            bundle = embedded_bundle(PresentationHTML(target.read_text()))
            manifest = bundle['json']['public/deck/manifest.json']
            self.assertEqual(manifest['sourceType'], 'pdf')
            self.assertEqual(len(manifest['slides']), 9)

    def test_pdf_source_no_embed_uses_source_stem_without_replacing_source(self):
        try:
            import pymupdf  # noqa: F401 - PDF support is optional at installation time.
        except ImportError:
            self.skipTest('PyMuPDF is not installed')
        with tempfile.TemporaryDirectory(prefix='pigeon companion PDF ') as tmp:
            root = Path(tmp)
            source = root / 'slides.pdf'
            shutil.copy2(SKILL / 'tests/fixtures/geometry.pdf', source)
            original = source.read_bytes()
            result = self.build(source, '--no-embed-pdf')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            target = root / 'pigeon-slides.html'
            self.assertEqual(set(root.iterdir()), {source, target})
            self.assertEqual(source.read_bytes(), original)
            manifest = embedded_bundle(PresentationHTML(target.read_text()))['json']['public/deck/manifest.json']
            self.assertFalse(manifest['pdfEmbedded'])
            self.assertEqual(manifest['pdf'], 'slides.pdf')


if __name__ == '__main__':
    unittest.main()
