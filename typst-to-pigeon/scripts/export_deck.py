#!/usr/bin/env python3
"""Export Typst or PDF pages, geometry, metadata and original title artwork."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit, unquote
from wand_regions import extract_visual_regions, walk, bounds
from slide_artwork import match_words, union, title_layers, takeaway_texts, enclosing_background
from semantic_regions import normalize_semantic_records
from ticker import build_ticker


def run(command, cwd):
    result = subprocess.run(command,cwd=cwd,text=True,capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f'Command failed: {command[0]}')
    return result.stdout


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def content_text(value):
    if isinstance(value,str): return value
    if isinstance(value,list): return ''.join(content_text(v) for v in value)
    if isinstance(value,dict):
        if value.get('func') == 'text': return value.get('text','')
        if value.get('func') == 'space': return ' '
        if value.get('func') in {'linebreak','parbreak'}: return '\n'
        return content_text(value.get('children',value.get('body','')))
    return ''


def query(source, selector, inputs=None):
    expression=f'query(<{selector}>).map(it => (value: it.value, page: it.location().page()))'
    return json.loads(run(['typst','eval',expression,'--in',str(source),'--format','json',*(inputs or [])],source.parent))


def query_ticker(source):
    """Read authored ticker metadata and absolute band geometry in one eval."""
    expression = '''(
      ticks: query(<pigeon-tick>).enumerate().map(((i, it)) => (..it.value,
        key: "t" + str(i + 1), page: it.location().page(),
        x: it.location().position().x / 1pt,
        y: it.location().position().y / 1pt)),
      bands: query(<pigeon-band>).map(it => (..it.value,
        page: it.location().page(), x: it.location().position().x / 1pt,
        y: it.location().position().y / 1pt)),
    )'''
    return json.loads(run(['typst', 'eval', expression, '--in', str(source), '--format', 'json'], source.parent))


def _inside_band(item, bands):
    cx = float(item.get('x', 0)) + float(item.get('width', 0)) / 2
    cy = float(item.get('y', 0)) + float(item.get('height', 0)) / 2
    return any(b['x'] <= cx <= b['x'] + b['w'] and b['y'] <= cy <= b['y'] + b['h'] for b in bands)


def mask_ticker_page(geo, page_text, page_data):
    """Remove the baked ticker copy from search/graph/wand evidence.

    The SVG retains the authored band for PDF output; Pigeon paints an opaque
    live lower-third over it. Keeping the lower-third out of semantic evidence
    prevents a carried tick from becoming a repeated slide message.
    """
    bands = []
    if page_data:
        raw = page_data.get('band') or {}
        if raw.get('enabled', True) is not False and raw.get('w', 0) > 0 and raw.get('h', 0) > 0:
            bands = [raw]
    if not bands:
        return page_text, geo
    for item in geo.get('words', []):
        item['_ticker'] = _inside_band(item, bands)
    geo['words'] = [item for item in geo.get('words', []) if not item.get('_ticker')]
    for line in geo.get('lines', []):
        line['words'] = [word for word in line.get('words', []) if not word.get('_ticker')]
        line['text'] = ' '.join(word['text'] for word in line['words']).strip()
    geo['regions'] = [region for region in geo.get('regions', []) if not _inside_band(region, bands)]
    lines = [line['text'] for line in geo.get('lines', []) if line.get('text')]
    return '\n'.join(lines) + ('\n' if lines else ''), geo


def text_geometry(pdf):
    root=ET.fromstring(run(['pdftotext','-bbox-layout',str(pdf),'-'],pdf.parent))
    ns={'x':'http://www.w3.org/1999/xhtml'}
    result=[]
    for page in root.findall('.//x:page',ns):
        words,lines,regions=[],[],[]
        def box(el):
            return dict(x=float(el.get('xMin')), y=float(el.get('yMin')),
                        width=float(el.get('xMax'))-float(el.get('xMin')),
                        height=float(el.get('yMax'))-float(el.get('yMin')))
        for line in page.findall('.//x:line',ns):
            line_words=[dict(text=w.text or '',**box(w)) for w in line.findall('x:word',ns)]
            words.extend(line_words)
            lines.append(dict(text=' '.join(w['text'] for w in line_words),words=line_words,**box(line)))
        for block in page.findall('.//x:block',ns):
            items=block.findall('x:line',ns) if box(block)['height'] > float(page.get('height'))*.2 else [block]
            for item in items:
                text=' '.join(w.text or '' for w in item.findall('.//x:word',ns)).strip()
                if not text: continue
                regions.append(dict(id=f'text-{len(regions)+1}',kind='text',text=text,**box(item)))
        result.append(dict(width=float(page.get('width')),height=float(page.get('height')),words=words,lines=lines,regions=regions))
    return result


def extract_links(svg, source):
    result=[]
    for el,matrix in walk(ET.parse(svg).getroot()):
        if el.tag.split('}')[-1] != 'a': continue
        href=el.get('href') or el.get('{http://www.w3.org/1999/xlink}href','')
        if not href: continue
        rect=next((child for child in el if child.tag.split('}')[-1]=='rect'),None)
        if rect is None: continue
        # Only enable web/mail links and physical-page links automatically.
        parsed=urlsplit(href)
        link={}
        if parsed.scheme in {'http','https','mailto'}:
            link['href']=href
        elif re.fullmatch(r'#(?:page=)?\d+',href):
            link['page']=int(re.search(r'\d+',href).group())
        else:
            # Preserve the destination for the build report; local resources
            # can be explicitly supplied via navigation JSON's resources map.
            link.update(href=href, local=True)
        x,y,right,bottom=bounds(matrix,float(rect.get('x',0)),float(rect.get('y',0)),float(rect.get('width',0)),float(rect.get('height',0)))
        result.append(dict(**link,x=x,y=y,width=right-x,height=bottom-y))
    return result


def build(source, output, deck_id=None, title=None, navigation=None, skip_compile=False, tiers_config=None, title_effect="none", png_size="768p", png_to_jpg=True, jpg_quality=90):
    from tier_config import resolve_tier_config
    tier_config=resolve_tier_config(json.loads(tiers_config.read_text()) if tiers_config else {})
    from image_assets import ImageAssets
    images=ImageAssets(png_size, png_to_jpg, jpg_quality)
    source=source.resolve(); output=output.resolve()
    if not source.is_file(): raise ValueError(f'Source does not exist: {source}')
    is_pdf=source.suffix.lower()=='.pdf'
    deck_id=deck_id or re.sub('[^a-z0-9]+','-',source.stem.lower()).strip('-') or 'pigeon-deck'
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*',deck_id): raise ValueError('deck-id must use letters, digits, hyphens or underscores')
    if not title and not is_pdf:
        match=re.search(r'#set\s+document\(\s*title:\s*"([^"]+)"',source.read_text())
        title=match.group(1) if match else source.stem
    deck=output/'public/deck'; slides_dir=deck/'slides'; thumbs=deck/'thumbs'
    for directory in [slides_dir,thumbs]: directory.mkdir(parents=True,exist_ok=True)
    if (deck/'titles').exists(): shutil.rmtree(deck/'titles')
    pdf=deck/f'{deck_id}.pdf'
    warnings=[]
    if is_pdf:
        from pdf_input import prepare_pdf
        geometry, pdf_title, warnings=prepare_pdf(source,pdf,slides_dir,thumbs)
        title=title or pdf_title
        texts=[geo['text'] for geo in geometry]
        text='\f'.join(texts)+'\f'
    elif not skip_compile:
        # Re-export safely into these generated subdirectories, removing stale pages.
        for directory,pattern in [(slides_dir,'page-*.svg'),(thumbs,'page-*.png')]:
            for old in directory.glob(pattern): old.unlink()
        run(['typst','compile',str(source),str(pdf)],source.parent)
        run(['typst','compile',str(source),str(slides_dir/'page-{0p}.svg')],source.parent)
    svgs=sorted(slides_dir.glob('page-*.svg'),key=lambda p:int(re.search(r'\d+',p.stem).group()))
    if not is_pdf:
        geometry=text_geometry(pdf)
        text=run(['pdftotext','-raw',str(pdf),'-'],source.parent)
        texts=text.split('\f')
        if texts and not texts[-1].strip(): texts.pop()
    (deck/f'{deck_id}.txt').write_text(text)
    if not svgs or len(svgs)!=len(geometry) or len(texts)!=len(svgs): raise ValueError('PDF/SVG/text page counts differ')
    records=[] if is_pdf else query(source,'slide-record')
    ticker_raw={} if is_pdf else query_ticker(source)
    ticker_records=[] if is_pdf else [dict(row.get('value') or {}, page=row.get('page')) for row in records]
    ticker=build_ticker(ticker_raw, ticker_records, slide_count=len(svgs)) if not is_pdf else None
    semantic_records=[] if is_pdf else query(source,'pigeon-sem')
    tier_records=[] if is_pdf else query(source,'pigeon-tier')
    page_sizes=[]
    for svg,geo in zip(svgs,geometry):
        vbox=[float(v) for v in ET.parse(svg).getroot().get('viewBox').split()]
        page_sizes.append(dict(width=vbox[2],height=vbox[3],pointWidth=geo['width'],pointHeight=geo['height']))
    semantic_by_page,semantic_report=normalize_semantic_records(semantic_records,page_sizes)
    by_page={}
    for row in records:
        by_page.setdefault(row['page'],[]).append(row['value'])
    nav_path=navigation or source.with_name(source.stem+'.navigation.json')
    nav=json.loads(nav_path.read_text()) if nav_path.exists() else {}
    snippets=[] if is_pdf else takeaway_texts(source)
    slides=[]; used_ids=set(); page_reports=[]; explicit_sections=set()
    resources={}
    for href,path in nav.get('resources',{}).items():
        local=(nav_path.parent/path).resolve()
        if not local.is_file(): raise ValueError(f'Missing linked resource: {local}')
        # HTML resources should be self-contained; no implicit copying of an
        # arbitrary source directory or external scripts into the release.
        name=f'{len(resources)+1:03d}-{local.name}'
        target=deck/'resources'/name; target.parent.mkdir(exist_ok=True)
        target.write_bytes(local.read_bytes()); resources[href]=f'resources/{name}'
    for page,(svg,geo,page_text) in enumerate(zip(svgs,geometry,texts),1):
        ticker_page = next((item for item in (ticker or {}).get('pages', []) if item.get('page') == page), None)
        page_text, geo = mask_ticker_page(geo, page_text, ticker_page)
        images.svg(svg)
        vbox=[float(v) for v in ET.parse(svg).getroot().get('viewBox').split()]
        width,height=vbox[2:]
        sx,sy=width/geo['width'],height/geo['height']
        for item in geo['words']+geo['lines']+geo['regions']:
            for key,scale in [('x',sx),('width',sx),('y',sy),('height',sy)]: item[key]*=scale
        entries=by_page.get(page,[])
        record=entries[0] if entries else {}
        sid=str(record.get('id') or f'{page:02d}')
        if sid in used_ids:
            base=f'{sid}-p{page}'
            sid=base; suffix=2
            while sid in used_ids:
                sid=f'{base}-{suffix}'; suffix+=1
        if '::' in sid: raise ValueError('Slide IDs cannot contain ::')
        used_ids.add(sid)
        overrides=nav.get('slides',{}).get(str(page),{})
        if overrides.get('section') or content_text(record.get('section','')): explicit_sections.add(sid)
        slide_title=overrides.get('title', geo.get('title','') if is_pdf else content_text(record.get('title',''))) or ''
        title_words=geo.get('titleWords',[]) if is_pdf and 'title' not in overrides else match_words(geo['words'],slide_title)
        if not slide_title and not is_pdf:
            candidates=[line for line in geo['lines'] if line['y']<height*.5 and line['text'].strip()]
            first=max(candidates,key=lambda line:(line['height'],-line['y'])) if candidates else None
            slide_title=first['text'] if first else f'Slide {page}'
            title_words=first['words'] if first else []
        if overrides.get('titleRect'):
            rect=overrides['titleRect']
            title_words=[w for w in geo['words'] if rect['x']<=w['x']<rect['x']+rect['width'] and rect['y']<=w['y']<rect['y']+rect['height']]
        layer=title_layers(svg,title_words,deck/'titles',svg.stem) if title_effect!='none' and geo.get('textMode')!='ocr' else None
        if title_effect!="none" and slide_title and not layer: warnings.append(f'Page {page}: no separable title glyphs; title remains static. Set slides.{page}.title/titleRect in navigation JSON if needed.')
        visual=geo['visual'] if is_pdf else extract_visual_regions(svg)
        key_messages=[]
        # Match the compiled words to active #takeaway content, independent of fill.
        for snippet in snippets:
            matched=match_words(geo['words'],snippet)
            if matched:
                rect=enclosing_background(svg,union(matched),(width,height))
                key_messages.append(dict(text=' '.join(w['text'] for w in matched),role='takeaway',origin='typst-source',region=rect))
                if not any(r['kind']=='takeaway' and abs(r['x']-rect['x'])<3 and abs(r['y']-rect['y'])<3 for r in visual):
                    visual.append(dict(id=f'takeaway-source-{len(visual)+1}',kind='takeaway',**rect))
        for region in nav.get('wandRegions',[]):
            if str(region.get('slideId'))==sid or region.get('page')==page:
                visual.append(dict(id=region.get('id',f'custom-{len(visual)}'),kind=region['kind'],**region['rect']))
        for region in geo['regions']+visual:
            if (region['kind'] not in {'text','table','image','takeaway'} or region['width']<=0 or region['height']<=0 or
                region['x']<-.01 or region['y']<-.01 or region['x']+region['width']>width+.1 or region['y']+region['height']>height+.1):
                raise ValueError(f'Page {page}: invalid {region["kind"]} region bounds')
        links=geo['links'] if is_pdf else extract_links(svg,source)
        for link in links:
            if link.get('local'):
                if link['href'] in resources:
                    link.update(resource=resources[link['href']],local=False)
                else: warnings.append(f'Page {page}: local link {link["href"]!r} needs a resources mapping; link is disabled.')
        slides.append(dict(id=sid,page=page,title=slide_title,navigationLabel=slide_title or f'Slide {page}',
            section=overrides.get('section') or content_text(record.get('section','')) or 'Talk',
            source=content_text(record.get('source','')),text=page_text,asset=f'slides/{svg.name}',assetHash=sha256(svg),
            width=width,height=height,links=links,imageDescriptions=[],textRegions=geo['regions'],
            wandRegions=geo['regions']+visual,semanticRegions=semantic_by_page[page],titleLayer=layer,
            **({'ticker': overrides['ticker']} if 'ticker' in overrides else {})))
        slides[-1]['_titleWords']=title_words
        if key_messages: slides[-1]['keyMessages']=key_messages
        page_report=dict(page=page,semanticRegions=len(semantic_by_page[page]))
        if is_pdf:
            detection=geo['titleDetection'] if 'title' not in overrides else {'status':'overridden'}
            slides[-1]['titleDetection']=detection
            page_report.update(dict(title=slide_title,titleDetection=detection,textMode=geo['textMode'],
                                     textBlocks=len(geo['regions']),images=sum(r['kind']=='image' for r in visual),
                                     tables=sum(r['kind']=='table' for r in visual)))
        page_reports.append(page_report)
    from tier_artwork import attach_tier_artwork
    attach_tier_artwork(source,deck,slides,page_sizes,tier_records,tier_config,run,query,warnings,title_effect=title_effect,images=images)
    if not is_pdf:
        from tier_records import merge_pdfpc_notes
        merge_pdfpc_notes(slides,query(source,"pdfpc-file"),tier_config,content_text)
    from outline_sections import assign_sections
    outlines = assign_sections(slides, geometry, explicit_sections, warnings)
    # Include metadata and geometry: edits to IDs/titles/regions also invalidate sessions/KG caches.
    revision=hashlib.sha256(json.dumps(dict(slides=slides,tiers=tier_config,ticker=ticker),sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]
    route=nav.get('defaultRoute',[s['id'] for s in slides])
    if len(route)!=len(slides) or set(route)!=used_ids: raise ValueError('defaultRoute must include each slide ID once')
    manifest=dict(titleEffect=title_effect,imageOptions=dict(pngSize=png_size,pngToJpg=png_to_jpg,jpgQuality=jpg_quality),schemaVersion='1.0',deckId=deck_id,title=title,revision=revision,pdf=f'{deck_id}.pdf',sourceType='pdf' if is_pdf else 'typst',
                  dimensions=dict(width=max(s['width'] for s in slides),height=max(s['height'] for s in slides)),
                  defaultRoute=route,hierarchy=nav.get('hierarchy') or None,focusRegions=nav.get('focusRegions',[]),
                  resources=list(resources.values()),slides=slides,tiers=tier_config,
                  ticker=ticker,mindMap={'enabled': True, 'source': 'knowledge-graph'})
    (deck/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    if not is_pdf: run(['pdftoppm','-png','-scale-to','320',str(pdf),str(thumbs/'page')],source.parent)
    report=dict(slides=len(slides),revision=revision,warnings=warnings,pages=page_reports,outlines=outlines,semanticRegions=semantic_report)
    if ticker:
        report['ticker']={'ticks':len(ticker['ticks']), 'pagesWithBand':sum(1 for page in ticker['pages'] if page.get('band')), 'warnings':ticker['warnings']}
    (output/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(slides=len(slides),revision=revision,warnings=len(warnings),output=str(output))))
    return manifest


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--deck-id');p.add_argument('--title');p.add_argument('--navigation',type=Path)
    p.add_argument('--skip-compile',action='store_true')
    p.add_argument('--tiers-config',type=Path)
    p.add_argument('--title-effect',default='none')
    p.add_argument('--png-size',choices=['original','768p','1080p'],default='768p')
    png_group = p.add_mutually_exclusive_group()
    png_group.add_argument('--png',dest='png_to_jpg',action='store_false',default=True,
                           help='Keep embedded slide images as PNG')
    png_group.add_argument('--png-to-jpg',dest='png_to_jpg',action='store_true',help=argparse.SUPPRESS)
    p.add_argument('--quality','--jpg-quality',dest='jpg_quality',type=int,default=90,
                   help='JPEG quality, 1-100 (default: 90)')
    args=p.parse_args(); build(**vars(args))

if __name__=='__main__':
    try: main()
    except (ValueError, RuntimeError, OSError) as error:
        raise SystemExit(f'Export failed: {error}') from None
