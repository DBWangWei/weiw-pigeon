"""Compile shared Typst visibility/background passes and attach native assets."""
import hashlib
import json
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET
from tier_records import normalize_tier_records, visible_roles
from slide_artwork import title_layers, match_words
from wand_regions import walk, bounds, line_segments

def _hash(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def _page_fill(svg, size):
    # Inspect native transformed artwork: a page-sized opaque paint must exist.
    for el,matrix in walk(ET.parse(svg).getroot()):
        color=el.get('fill','')
        if not color or color=='none': continue
        if float(el.get('opacity','1'))!=1 or float(el.get('fill-opacity','1'))!=1: continue
        tag=el.tag.split('}')[-1]
        if tag=='rect':
            rect=(float(el.get('x',0)),float(el.get('y',0)),float(el.get('width',0)),float(el.get('height',0)))
        elif tag=='path':
            segments=line_segments(el.get('d'))
            if len(segments)!=4 or segments[0][0]!=segments[-1][1] or any(a[0]!=b[0] and a[1]!=b[1] for a,b in segments): continue
            points=[p for segment in segments for p in segment]
            xs=[p[0] for p in points]; ys=[p[1] for p in points]
            rect=(min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys))
        else: continue
        box=bounds(matrix,*rect)
        if all(abs(a-b)<.05 for a,b in zip(box,(0,0,size['width'],size['height']))): return color
    return None

def _painted_background(svg, color, size):
    return (_page_fill(svg,size) or '').lower()==color.lower()

def _mask_regions(asset, regions, size, target):
    """Remove the union of marking-only dim regions from the backing paint.

    A native page-fill rectangle remains behind the mask, so dimming a figure
    subregion fades toward the authored page color rather than a CSS default.
    """
    ns='http://www.w3.org/2000/svg'
    tag=lambda name: f'{{{ns}}}{name}'
    root=ET.parse(asset).getroot()
    key=hashlib.sha256((_hash(asset)+json.dumps(regions,sort_keys=True)).encode()).hexdigest()[:16]
    mask_id='pigeon-dim-'+key
    defs=ET.Element(tag('defs'))
    mask=ET.SubElement(defs,tag('mask'),id=mask_id,maskUnits='userSpaceOnUse',x='0',y='0',width=str(size['width']),height=str(size['height']))
    ET.SubElement(mask,tag('rect'),width=str(size['width']),height=str(size['height']),fill='white')
    for region in regions:
        ET.SubElement(mask,tag('rect'),{key:str(region[key]) for key in ('x','y','width','height')},fill='black')
    artwork=ET.Element(tag('g'),mask=f'url(#{mask_id})')
    for child in list(root):
        root.remove(child)
        artwork.append(child)
    root.append(defs)
    ET.SubElement(root,tag('rect'),width=str(size['width']),height=str(size['height']),fill=_page_fill(asset,size) or 'white')
    root.append(artwork)
    output=target/f'{key}-dim.svg'
    ET.ElementTree(root).write(output,encoding='utf-8',xml_declaration=True)
    return output

def _effective_default(semantic, recipes):
    survivors=[]
    for candidate in semantic['candidates']:
        if not candidate['skip'] and (not survivors or survivors[-1]['key']!=candidate['key']): survivors.append(candidate)
    if not survivors: return None
    selected=semantic['defaultTier']
    if selected is None:
        selected=next((i for i,r in enumerate(recipes) if r.get('default')),None)
    if selected is None: return survivors[-1]
    original=selected if type(selected) is int else next((i for i,r in enumerate(recipes) if r['name']==selected),-1)
    return next((c for c in reversed(survivors) if c['k']<=original),survivors[0])

def attach_tier_artwork(source, deck, slides, pages, records, config, run, query, warnings):
    by_page=normalize_tier_records(records,pages,config)
    passes={}; jobs=[]
    for slide in slides:
        semantic=by_page[slide['page']]
        if not any(row['page']==slide['page'] for row in records):
            slide.pop('_titleWords',None)
            continue
        slide['semanticTiers']=semantic
        for deep in semantic['deep']: deep['slideId']=slides[deep['targetPage']-1]['id']
        roles=semantic['roles']; recipes=config['presets'][semantic['preset']]
        flat=not any(r['hide'] for r in roles) and not any('background' in r for r in recipes)
        if flat: recipes=[dict(name='full',show='*',pin=[],emph=[],dim=[])]
        candidates=[]
        for k,recipe in enumerate(recipes):
            shown=recipe['show']; visible=visible_roles(roles,shown); selected=[r for r in roles if r['uid'] in visible]
            candidate=dict(k=k,name=recipe['name'],tier=recipe,visible=visible,background=recipe.get('background'),extract=recipe.get('fx')=='extract',fx=recipe.get('fx'))
            for effect in ('emph','dim','pin'): candidate[effect]=[r['uid'] for r in selected if r['role'] in recipe.get(effect,[])]
            candidate['skip']=bool(recipe.get('enter')) or (not flat and not any(r['hide'] for r in selected) and 'background' not in recipe) or (candidate['extract'] and not any(r['role']=='takeaway' for r in selected))
            candidate['key']=hashlib.sha256(json.dumps({key:candidate[key] for key in ('visible','emph','dim','pin','extract','background')},sort_keys=True).encode()).hexdigest()[:20]
            # Full visibility reuses the canonical asset, even if show is a role list.
            full=all(not r['hide'] or r['uid'] in visible for r in roles)
            combination=None if full and not candidate['background'] else (tuple(sorted(shown)) if shown!='*' else ('*',),candidate['background'])
            jobs.append((slide,candidate,combination,False))
            if candidate['dim']:
                dim_roles={r['role'] for r in selected if r['uid'] in candidate['dim']}
                all_roles={r['role'] for r in roles} if shown=='*' else set(shown)
                backing=(tuple(sorted(all_roles-dim_roles)),candidate['background'])
                jobs.append((slide,candidate,backing,True))
            candidates.append(candidate)
        semantic['candidates']=candidates
        if not flat:
            item=_effective_default(semantic,recipes)
            if item and item['extract']: warnings.append(f'Page {slide["page"]}: effective tier default is extraction')
    target=deck/'tiers'; target.mkdir(exist_ok=True)
    combinations={combo for _,_,combo,_ in jobs if combo is not None}
    with tempfile.TemporaryDirectory(prefix='.tier-passes-',dir=deck.parent.parent) as temp:
        for combo in sorted(combinations,key=repr):
            shown,bg=combo; key=hashlib.sha256(repr(combo).encode()).hexdigest()[:16]; folder=Path(temp)/key; folder.mkdir()
            inputs=['--input','pigeon-mode=tier','--input','pigeon-tier-show='+','.join(shown)]
            if bg: inputs+=['--input','pigeon-tier-background='+bg]
            run(['typst','compile',*inputs,str(source),str(folder/'page-{0p}.svg')],source.parent)
            files=sorted(folder.glob('page-*.svg'),key=lambda p:int(p.stem.split('-')[-1]))
            if len(files)!=len(slides): raise ValueError('Tier variant changed physical page count')
            variant_records=query(source,'pigeon-tier',inputs)
            normalized=normalize_tier_records(variant_records,pages,config)
            if normalized!=by_page_without_candidates(by_page): raise ValueError('Tier variant changed semantic metadata or geometry')
            for index,(svg,size) in enumerate(zip(files,pages),1):
                vbox=[float(v) for v in ET.parse(svg).getroot().get('viewBox').split()]
                if abs(vbox[2]-size['width'])>.001 or abs(vbox[3]-size['height'])>.001: raise ValueError('Tier variant changed physical page geometry')
                name=f'{key}-p{index}.svg'; (target/name).write_bytes(svg.read_bytes()); passes[(combo,index)]=target/name
    for slide,candidate,combo,backing in jobs:
        asset=deck/slide['asset'] if combo is None else passes[(combo,slide['page'])]
        if candidate['background'] and not _painted_background(asset,candidate['background'],pages[slide['page']-1]): raise ValueError(f'Page {slide["page"]}: tier background override was not painted; use sem.background() for the page fill')
        if backing:
            regions=[r for r in slide['semanticTiers']['roles'] if not r['hide'] and r['uid'] in candidate['dim']]
            if regions: asset=_mask_regions(asset,regions,pages[slide['page']-1],target)
            candidate['backingAsset']=asset.relative_to(deck).as_posix(); candidate['backingAssetHash']=_hash(asset); candidate['backingHash']=candidate['backingAssetHash']
        else:
            candidate['asset']=asset.relative_to(deck).as_posix(); candidate['assetHash']=_hash(asset)
            # Use only selected artwork for title separation; no full-source backing leaks.
            candidate['titleLayer']=slide.get('titleLayer') if combo is None else title_layers(asset,slide.get('_titleWords',[]),deck/'titles',asset.stem)
            if candidate['titleLayer']:
                layer=candidate['titleLayer']
                layer['assetHash']=_hash(deck/layer['asset'])
                layer['baseAssetHash']=_hash(deck/layer['baseAsset'])
    for slide in slides: slide.pop('_titleWords',None)

def by_page_without_candidates(by_page):
    return {p:{k:v for k,v in data.items() if k!='candidates'} | {'deep':[{k:v for k,v in d.items() if k!='slideId'} for d in data['deep']]} for p,data in by_page.items()}
