import sys
import unittest
from pathlib import Path
import tempfile
import json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from tier_artwork import attach_tier_artwork, _painted_background, _effective_default
from tier_config import resolve_tier_config

class TierArtworkTests(unittest.TestCase):
    def test_warning_uses_the_surviving_default_alias(self):
        candidates=[dict(k=0,key='a',skip=False,extract=True),dict(k=1,key='b',skip=True,extract=False)]
        semantic=dict(defaultTier=1,candidates=candidates)
        self.assertTrue(_effective_default(semantic,[dict(name='message'),dict(name='empty')])['extract'])
        candidates[0]['extract']=False; candidates[1]['extract']=True
        self.assertFalse(_effective_default(semantic,[dict(name='full'),dict(name='empty')])['extract'])

    def test_shared_pass_full_reuse_and_native_background_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            deck=Path(temp)/'public/deck'; (deck/'slides').mkdir(parents=True)
            svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ffffff"/></svg>'
            for p in (1,2): (deck/f'slides/page-{p}.svg').write_text(svg)
            slides=[dict(page=p,id=str(p),asset=f'slides/page-{p}.svg',titleLayer=None,_titleWords=[]) for p in (1,2)]
            pages=[dict(width=200,height=100,pointWidth=200,pointHeight=100)]*2
            records=[dict(page=p,value=dict(kind='role',uid='a',role='answer',ancestry=[],x=20,y=20,width=30,height=20,hide=True)) for p in (1,2)]
            config=resolve_tier_config({'presets':{'p':[dict(name='question',show=['hook']),dict(name='answer',show='*')]}})
            calls=[]
            def run(args,cwd):
                calls.append(args); pattern=args[-1]
                for p in (1,2): Path(pattern.replace('{0p}',str(p))).write_text(svg)
            attach_tier_artwork(Path(temp)/'deck.typ',deck,slides,pages,records,config,run,lambda *a:records,[])
            self.assertEqual(len(calls),1)
            self.assertEqual(slides[0]['semanticTiers']['candidates'][1]['asset'],slides[0]['asset'])
            self.assertTrue(slides[0]['semanticTiers']['candidates'][0]['skip'])
            self.assertTrue(_painted_background(deck/slides[0]['asset'],'#ffffff',pages[0]))
            self.assertFalse(_painted_background(deck/slides[0]['asset'],'#000000',pages[0]))
    def test_page_count_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            deck=Path(temp)/'public/deck'; deck.mkdir(parents=True)
            slides=[dict(page=1,id='a',asset='full.svg')]
            records=[dict(page=1,value=dict(kind='role',uid='a',role='answer',x=1,y=1,width=2,height=2))]
            config=resolve_tier_config({'presets':{'p':[dict(name='hidden',show=[])]}})
            with self.assertRaisesRegex(ValueError,'page count'):
                attach_tier_artwork(Path(temp)/'deck.typ',deck,slides,[dict(width=20,height=20,pointWidth=20,pointHeight=20)],records,config,lambda *a:None,lambda *a:records,[])

if __name__=='__main__': unittest.main()
