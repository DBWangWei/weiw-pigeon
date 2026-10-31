"""Normalize physical-page semantic tier metadata, independently of visibility."""
import math
from tier_config import ROLES, validate_default

def _optional_string(value, field):
    if value is not None and (not isinstance(value, str) or not value.strip()):
        raise ValueError(f'Tier {field} must be a nonempty string or null')
    return value

def normalize_tier_records(records, pages, config):
    result={n:dict(preset=config['defaultPreset'],defaultTier=None,roles=[],notes=[],deep=[]) for n in range(1,len(pages)+1)}
    settings={}
    for row in records:
        if not isinstance(row, dict): raise ValueError('Tier metadata rows must be objects')
        page=row.get('page'); v=row.get('value')
        if type(page) is not int or page not in result or not isinstance(v,dict): raise ValueError('Invalid physical page in tier metadata')
        out=result[page]; kind=v.get('kind'); spec=pages[page-1]
        if kind in ('settings','tiers'):
            preset=_optional_string(v.get('preset'), 'preset')
            current=(config['defaultPreset'] if preset is None else preset,v.get('default'))
            if page in settings and settings[page]!=current: raise ValueError(f'Page {page}: conflicting tier settings')
            settings[page]=current; out['preset'],out['defaultTier']=current
        elif kind=='role':
            if v.get('role') not in ROLES or not isinstance(v.get('uid'),str) or not v['uid']: raise ValueError(f'Page {page}: invalid tier role/uid')
            if any(r['uid']==v['uid'] for r in out['roles']): raise ValueError(f'Page {page}: duplicate tier uid')
            r={key:v.get(key) for key in ('uid','role','id','text','to')}; r['ancestry']=v.get('ancestry',v.get('ancestors',[]))
            for key in ('id','to'): r[key]=_optional_string(r[key],key)
            r['text']=v.get('text','')
            if not isinstance(r['text'],str): raise ValueError('Tier text must be a string')
            if not isinstance(r['ancestry'],list) or any(not isinstance(a,str) for a in r['ancestry']): raise ValueError('Tier ancestors must be UID strings')
            for key in ('hide','inline'):
                r[key]=v.get(key,key=='hide')
                if type(r[key]) is not bool: raise ValueError(f'Tier {key} must be boolean')
            for key in ('x','y','width','height'):
                val=v.get(key)
                if type(val) not in (int,float) or not math.isfinite(val): raise ValueError(f'Tier {key} must be finite')
                r[key]=val
            if r['width']<=0 or r['height']<=0 or r['x']<-.001 or r['y']<-.001 or r['x']+r['width']>spec['pointWidth']+.01 or r['y']+r['height']>spec['pointHeight']+.01: raise ValueError(f'Page {page}: invalid tier role bounds (page-spanning boxes are unsupported)')
            for key in ('x','width'): r[key]*=spec['width']/spec['pointWidth']
            for key in ('y','height'): r[key]*=spec['height']/spec['pointHeight']
            out['roles'].append(r)
        elif kind=='note':
            if not isinstance(v.get('text'),str) or type(v.get('public',False)) is not bool: raise ValueError('Invalid semantic note')
            out['notes'].append(dict(text=v['text'],public=v.get('public',False)))
        elif kind=='deep':
            if type(v.get('targetPage')) is not int or v['targetPage'] not in result: raise ValueError('Deep destination is not a physical slide page')
            out['deep'].append(dict(targetPage=v['targetPage'],target=_optional_string(v.get('target'),'target'),to=_optional_string(v.get('to'),'to')))
        else: raise ValueError(f'Unknown semantic tier record kind: {kind!r}')
    for page,out in result.items():
        if out['preset'] not in config['presets']: raise ValueError(f'Page {page}: unknown tier preset {out["preset"]!r}')
        validate_default(out['defaultTier'],config['presets'][out['preset']])
        lookup={r['uid']:r for r in out['roles']}
        for r in out['roles']:
            path=r['ancestry']
            if r['uid'] in path or len(set(path))!=len(path) or any(a not in lookup for a in path): raise ValueError(f'Page {page}: invalid tier ancestry')
            if any(lookup[a]['ancestry']!=path[:i] for i,a in enumerate(path)): raise ValueError(f'Page {page}: inconsistent tier ancestry')
    return result

def visible_roles(roles, shown):
    lookup={r['uid']:r for r in roles}
    def visible(r):
        return (not r['hide'] or shown=='*' or r['role'] in shown) and all(not lookup[a]['hide'] or shown=='*' or lookup[a]['role'] in shown for a in r['ancestry'])
    return [r['uid'] for r in roles if visible(r)]

def merge_pdfpc_notes(slides, records, config, text_of=lambda value: value if isinstance(value,str) else ''):
    """Touying/pdfpc uses zero-based physical idx, independent of logical labels."""
    for row in records:
        value=row.get('value',{})
        if not isinstance(value,dict): continue
        for page in value.get('pages',[]):
            if not isinstance(page,dict) or not page.get('note'): continue
            index=page.get('idx')
            if type(index) is not int or not 0<=index<len(slides): raise ValueError('pdfpc note has invalid physical page index')
            text=text_of(page['note'])
            if not text: continue
            semantic=slides[index].setdefault('semanticTiers',dict(preset=config['defaultPreset'],defaultTier=None,roles=[],notes=[],deep=[],candidates=[]))
            note=dict(text=text,public=False)
            if note not in semantic['notes']: semantic['notes'].append(note)
