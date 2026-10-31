import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from tier_config import resolve_tier_config, validate_default
from tier_records import normalize_tier_records, visible_roles
from typst_to_pigeon import load_pigeon_config
import tempfile

class TierConfigTests(unittest.TestCase):
    def test_defaults_and_override(self):
        c=resolve_tier_config(mode='step')
        self.assertEqual(c['mode'],'step'); self.assertEqual(c['defaultPreset'],'result')
        self.assertEqual(resolve_tier_config({'presets':{'only':[{'name':'one','show':'*'}]}})['defaultPreset'],'only')
    def test_invalid_recipes(self):
        bad=[{'name':'x','show':['unknown']},{'name':'x','background':'red'},{'name':'x','emph':['detail'],'dim':['detail']},{'name':'x','enter':'other'},{'name':'x','default':1}]
        for recipe in bad:
            with self.subTest(recipe=recipe),self.assertRaises(ValueError): resolve_tier_config({'presets':{'p':[recipe]}})
        for recipes in ([{'name':'x'},{'name':'x'}],[{'name':'x','default':True},{'name':'y','default':True}],[{'name':'x','enter':'deep'}]):
            with self.assertRaises(ValueError): resolve_tier_config({'presets':{'p':recipes}})
    def test_defaults(self):
        recipes=[{'name':'a'},{'name':'enter','enter':'deep'}]
        validate_default('a',recipes); validate_default(0,recipes)
        for value in (True,-1,2,'unknown',1):
            with self.assertRaises(ValueError): validate_default(value,recipes)
    def test_namespaced_replaces_and_validates_overridden_table(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); source=root/'deck.typ'; source.write_text('')
            config=root/'pigeon.toml'; config.write_text('[tiers]\nmode="step"\n[pigeon.tiers]\nmode="slide"\n')
            self.assertEqual(load_pigeon_config(source,None)[0]['tiers'],{'mode':'slide'})
            config.write_text('[tiers]\nmode="bad"\n[pigeon.tiers]\nmode="slide"\n')
            with self.assertRaises(ValueError): load_pigeon_config(source,None)

class TierRecordsTests(unittest.TestCase):
    def setUp(self):
        self.pages=[dict(width=200,height=100,pointWidth=100,pointHeight=50)]
        self.config=resolve_tier_config()
    def role(self,uid,role,ancestry=[],hide=True):
        return {'page':1,'value':dict(kind='role',uid=uid,role=role,ancestry=ancestry,hide=hide,x=1,y=2,width=10,height=5,text=uid)}
    def test_nested_mark_only_and_independent_visibility(self):
        data=normalize_tier_records([self.role('p','detail'),self.role('c','support',['p'],False),self.role('a','answer')],self.pages,self.config)[1]
        self.assertEqual(data['roles'][0]['width'],20)
        self.assertEqual(visible_roles(data['roles'],['support']),[])
        self.assertEqual(visible_roles(data['roles'],['detail']),['p','c'])
        self.assertEqual(visible_roles(data['roles'],['answer']),['a'])
    def test_invalid_bounds_ancestry_and_deep(self):
        records=[self.role('p','detail')]; records[0]['value']['width']=200
        with self.assertRaises(ValueError): normalize_tier_records(records,self.pages,self.config)
        with self.assertRaises(ValueError): normalize_tier_records([self.role('p','detail',['missing'])],self.pages,self.config)
        with self.assertRaises(ValueError): normalize_tier_records([{'page':1,'value':dict(kind='deep',targetPage=2)}],self.pages,self.config)
    def test_settings_notes_and_deep(self):
        rows=[{'page':1,'value':dict(kind='settings',preset='flat',default='full')},{'page':1,'value':dict(kind='note',text='Private',public=False)},{'page':1,'value':dict(kind='deep',targetPage=1,target='self',to='a')}]
        data=normalize_tier_records(rows,self.pages,self.config)[1]
        self.assertFalse(data['notes'][0]['public']); self.assertEqual(data['deep'][0]['targetPage'],1)
        rows.append({'page':1,'value':dict(kind='settings',preset='result')})
        with self.assertRaises(ValueError): normalize_tier_records(rows,self.pages,self.config)

    def test_malformed_rows_types_and_inconsistent_ancestry_fail_clearly(self):
        bad=[[None],[{'page':1,'value':dict(kind='settings',preset=[])}],
             [{'page':1,'value':dict(kind='settings',preset='')}]]
        for key,value in [('id',[]),('text',False),('to',3)]:
            row=self.role('p','detail'); row['value'][key]=value; bad.append([row])
        bad += [[self.role('a','detail',['b']),self.role('b','answer',['a'])],
                [self.role('a','detail'),self.role('b','answer',['a']),self.role('c','support',['b'])]]
        for rows in bad:
            with self.subTest(rows=rows),self.assertRaises(ValueError): normalize_tier_records(rows,self.pages,self.config)

if __name__=='__main__': unittest.main()
