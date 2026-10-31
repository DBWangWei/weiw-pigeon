"""Strict semantic-tier configuration normalization."""
from copy import deepcopy
import re

ROLES = {'hook', 'cue', 'answer', 'detail', 'caveat', 'takeaway', 'contrast', 'support'}
DEFAULT_PRESETS = {
    'result': [dict(name='question', show=['hook','cue']), dict(name='answer', show=['hook','cue','answer']),
               dict(name='takeaway', show=['takeaway'], fx='extract'),
               dict(name='full', default=True, show='*', pin=['takeaway'], emph=['support','contrast'], dim=['detail'])],
    'flat': [dict(name='full', show='*')],
}

def roles(value, field, star=False):
    if star and value == '*': return '*'
    if isinstance(value, str): value = [value]
    if not isinstance(value, list) or any(not isinstance(v,str) or v not in ROLES for v in value):
        raise ValueError(f'{field} must contain supported semantic roles')
    if len(set(value)) != len(value): raise ValueError(f'{field} contains duplicate roles')
    return value

def resolve_tier_config(raw=None, mode=None):
    raw = {} if raw is None else raw
    if not isinstance(raw,dict): raise ValueError('tiers must be a table')
    if set(raw)-{'mode','default_preset','defaultPreset','presets'}: raise ValueError('Unknown tiers key: '+', '.join(sorted(set(raw)-{'mode','default_preset','defaultPreset','presets'})))
    selected_mode = mode or raw.get('mode','slide')
    if selected_mode not in ('slide','step'): raise ValueError('tiers.mode must be slide or step')
    source=raw.get('presets',deepcopy(DEFAULT_PRESETS))
    if not isinstance(source,dict) or not source: raise ValueError('tiers.presets must be a nonempty table')
    presets={}
    for name, recipes in source.items():
        if not isinstance(name,str) or not name.strip() or not isinstance(recipes,list) or not recipes:
            raise ValueError('Tier presets require a name and nonempty recipe array')
        names=set(); defaults=0; normalized=[]
        for k, recipe in enumerate(recipes):
            label=f'tiers.presets.{name}[{k}]'
            if not isinstance(recipe,dict): raise ValueError(f'{label} must be a table')
            unknown=set(recipe)-{'name','show','default','pin','emph','dim','fx','background','enter'}
            if unknown: raise ValueError(f'{label}: unknown keys {sorted(unknown)}')
            r=deepcopy(recipe)
            r.setdefault('name', f'tier-{k}')
            if not isinstance(r.get('name'),str) or not r['name'].strip() or r['name'] in names: raise ValueError(f'{label}: tier names must be nonempty and unique')
            names.add(r['name'])
            if 'default' in r and type(r['default']) is not bool: raise ValueError(f'{label}.default must be boolean')
            defaults += r.get('default',False)
            if defaults>1: raise ValueError(f'{label}: duplicate preset default')
            if 'enter' in r and r['enter']!='deep': raise ValueError(f'{label}.enter only supports deep')
            if r.get('enter') and r.get('default'): raise ValueError(f'{label}: enter hook cannot be default')
            r['show']=roles(r.get('show',[]),label+'.show',True)
            for effect in ('pin','emph','dim'): r[effect]=roles(r.get(effect,[]),label+'.'+effect)
            if set(r['emph']) & set(r['dim']): raise ValueError(f'{label}: emph and dim conflict')
            if r.get('fx') not in (None,'extract'): raise ValueError(f'{label}.fx only supports extract')
            if 'background' in r and (not isinstance(r['background'],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',r['background'])): raise ValueError(f'{label}.background must be #RRGGBB')
            normalized.append(r)
        if not any(not r.get('enter') for r in normalized): raise ValueError(f'{name}: preset requires a visible recipe')
        presets[name]=normalized
    default=raw.get('default_preset',raw.get('defaultPreset','result' if 'result' in presets else next(iter(presets))))
    if not isinstance(default,str) or default not in presets: raise ValueError('tiers.default_preset references an unknown preset')
    return dict(mode=selected_mode,defaultPreset=default,presets=presets)

def validate_default(value, recipes):
    if value is None: return
    if type(value) is int: index=value
    elif isinstance(value,str): index=next((k for k,r in enumerate(recipes) if r['name']==value),-1)
    else: raise ValueError('Slide tier default must be a tier name or zero-based integer')
    if index<0 or index>=len(recipes) or recipes[index].get('enter'): raise ValueError(f'Invalid visible slide tier default: {value!r}')
