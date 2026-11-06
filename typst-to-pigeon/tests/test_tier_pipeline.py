"""Real Typst contract checks for shared variants and canonical output."""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_deck import build
from tier_config import resolve_tier_config
from tier_records import merge_pdfpc_notes

ROOT=Path(__file__).resolve().parents[1]
@unittest.skipUnless(shutil.which('typst') and shutil.which('pdftotext'),'Typst/PDF tools required')
class TierPipelineTests(unittest.TestCase):
    def test_native_variants_background_nested_and_notes(self):
        with tempfile.TemporaryDirectory() as temp:
            temp=Path(temp); shutil.copy(ROOT/'assets/pigeon-tiers.typ',temp/'sem.typ')
            source=temp/'deck.typ'; source.write_text('''#import "sem.typ" as sem
#set page(width: 300pt, height: 200pt, margin: 20pt, fill: sem.background(default: white))
#sem.tiers("p", default: "full")
#sem.hook[Question]
#sem.detail[Detail #sem.answer(inline: true)[Nested answer]]
#sem.takeaway("message")[Message]
#sem.note[Private evidence]
#sem.note(public: true)[Public evidence]
#pagebreak()
Unwrapped page.
''')
            config=temp/'tiers.json'; config.write_text(json.dumps(resolve_tier_config({'presets':{'p':[dict(name='question',show=['hook']),dict(name='answer',show=['answer']),dict(name='full',show='*',dim=['detail']),dict(name='blue',show=[],background='#E5F1FA')]}})))
            manifest=build(source,temp/'out',tiers_config=config)
            candidates=manifest['slides'][0]['semanticTiers']['candidates']
            self.assertEqual(len(manifest['slides']),2)
            self.assertTrue(candidates[1]['skip']) # nested answer remains hidden under detail
            self.assertEqual(candidates[2]['asset'],manifest['slides'][0]['asset'])
            self.assertIn('backingAsset',candidates[2])
            self.assertFalse(candidates[3]['skip'])
            self.assertNotIn('semanticTiers',manifest['slides'][1])
            self.assertEqual([n['public'] for n in manifest['slides'][0]['semanticTiers']['notes']],[False,True])
            for candidate in candidates:
                self.assertTrue((temp/'out/public/deck'/candidate['asset']).is_file())
    def test_png_processing_reaches_variants_and_animated_title_backings(self):
        import base64, hashlib, re
        from io import BytesIO
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            temp=Path(tmp); shutil.copy(ROOT/'assets/pigeon-tiers.typ',temp/'sem.typ')
            Image.new('RGB',(2400,1600),'#4488bb').save(temp/'figure.png')
            original=(temp/'figure.png').read_bytes()
            source=temp/'images.typ'; source.write_text('''#import "sem.typ" as sem
#set page(width: 500pt, height: 400pt, margin: 20pt)
#metadata((id: "01", title: "Raster test")) <slide-record>
= Raster test
#sem.tiers("p")
#sem.hook[Question]
#sem.answer(image("figure.png", width: 180pt))
''')
            config=temp/'tiers.json'; config.write_text(json.dumps(resolve_tier_config({'presets':{'p':[dict(name='question',show=['hook']),dict(name='answer',show='*')]}})))
            manifest=build(source,temp/'out',tiers_config=config,title_effect='text-type',png_to_jpg=True)
            deck=temp/'out/public/deck'; found=0
            for path in deck.rglob('*.svg'):
                svg=path.read_text()
                self.assertNotIn('data:image/png;',svg)
                for payload in re.findall(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)',svg):
                    image=Image.open(BytesIO(base64.b64decode(payload)))
                    self.assertEqual(image.size,(1152,768)); found+=1
            self.assertGreaterEqual(found,2,'canonical SVG and title body must use optimized pixels')
            slide=manifest['slides'][0]
            for candidate in [slide,*slide['semanticTiers']['candidates']]:
                self.assertEqual(candidate['assetHash'],hashlib.sha256((deck/candidate['asset']).read_bytes()).hexdigest())
                if candidate.get('titleLayer'):
                    layer=candidate['titleLayer']
                    self.assertEqual(layer['baseAssetHash'],hashlib.sha256((deck/layer['baseAsset']).read_bytes()).hexdigest())
            self.assertEqual((temp/'figure.png').read_bytes(),original)

    def test_unnamed_recipes_and_pdfpc_notes(self):
        config=resolve_tier_config({'presets':{'p':[{'show':'*'},{'enter':'deep'}]}})
        self.assertEqual(config['presets']['p'][0]['name'],'tier-0')
        slides=[{}]
        merge_pdfpc_notes(slides,[{'value':{'pages':[{'idx':0,'label':'logical-99','note':'Speaker text'}]}}],config)
        self.assertEqual(slides[0]['semanticTiers']['notes'],[{'text':'Speaker text','public':False}])

if __name__=='__main__': unittest.main()
