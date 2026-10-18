"""Conservative PDF geometry extraction; preserve the original page artwork.

All boxes use the displayed, cropped/rotated page coordinate system. Confidence
values describe heuristic strength, not statistically calibrated probabilities.
"""
from collections import Counter
from pathlib import Path
import math
import re
import shutil
import statistics

from slide_artwork import union


def pdf_library():
    try:
        import pymupdf
    except ImportError:
        raise ValueError('PDF input requires PyMuPDF. Install it with: python3 -m pip install "PyMuPDF>=1.24.4,<2"') from None
    return pymupdf


def weighted_size(lines):
    samples = sorted((line['fontSize'], max(1, len(line['text'].strip()))) for line in lines)
    middle = sum(n for _, n in samples) / 2
    for size, count in samples:
        middle -= count
        if middle <= 0:
            return size
    return 0


def infer_title(geo, repeated):
    lines = [line for line in geo['lines'] if line['text'].strip() and line['horizontal']]
    if not lines:
        return '', [], {'status': 'absent', 'reason': 'No readable horizontal text.'}
    width, height = geo['width'], geo['height']
    body = weighted_size([l for l in lines if .25 * height < l['y'] < .9 * height]) or weighted_size(lines)
    candidates = []
    for line in lines:
        text = line['text'].strip()
        if (line['y'] > height * .3 or line['height'] > height * .22 or len(text) > 220
                or not any(c.isalpha() for c in text) or re.match(r'^[•●▪\-–]\s|^\d+[.)]\s', text)):
            continue
        if text.casefold() in repeated and line['fontSize'] < body * 1.4:
            continue
        ratio = line['fontSize'] / max(body, 1)
        sparse_cover = len(lines) <= 3 and len(text) <= 100 and line['fontSize'] >= height * .07
        if ratio >= 1.24 or sparse_cover:
            candidates.append(line)
    if not candidates:
        return '', [], {'status': 'absent', 'reason': 'No confident large-font heading near the top.', 'bodyFontSize': round(body, 2)}
    first = max(candidates, key=lambda line: (line['fontSize'], -line['y']))
    # Wraps belong to the title only if they share font size, alignment and a
    # close baseline. Do not absorb a subtitle or a column heading below it.
    group = [first]
    for line in sorted(lines, key=lambda item: item['y']):
        if line is first:
            continue
        previous = group[-1]
        gap = line['y'] - (previous['y'] + previous['height'])
        aligned = abs(line['x'] - first['x']) < width * .04 or abs(line['x'] + line['width']/2 - first['x'] - first['width']/2) < width * .05
        if (line['y'] > previous['y'] and -.45 * first['fontSize'] <= gap <= .65 * first['fontSize']
                and abs(line['fontSize'] / first['fontSize'] - 1) < .08 and aligned
                and line['y'] + line['height'] < height * .43 and len(group) < 3):
            group.append(line)
    title = ' '.join(line['text'].strip() for line in group)
    return title, [w for line in group for w in line['words']], {
        'status': 'inferred', 'method': 'top-position-and-font-ratio',
        'fontSize': round(first['fontSize'], 2), 'bodyFontSize': round(body, 2),
        'fontRatio': round(first['fontSize']/max(body, 1), 2),
        'confidence': .93 if first['fontSize'] >= body * 1.45 else .82,
    }


def borderless_tables(words, dimensions):
    """Require three closely spaced rows with repeatable wide column gaps."""
    rows = []
    for word in sorted(words, key=lambda w: (w['y'] + w['height']/2, w['x'])):
        center = word['y'] + word['height']/2
        row = next((r for r in reversed(rows[-3:]) if abs(r['center']-center) <= word['height']*.35), None)
        if row is None:
            row = {'center': center, 'words': []}; rows.append(row)
        row['words'].append(word)
    groups = []
    current = []
    for row in rows:
        ws = sorted(row['words'], key=lambda w:w['x'])
        size = statistics.median(w['height'] for w in ws)
        cells = [[ws[0]]]
        for word in ws[1:]:
            previous = cells[-1][-1]
            if word['x'] - previous['x'] - previous['width'] > size * 1.5:
                cells.append([])
            cells[-1].append(word)
        labels = [' '.join(w['text'] for w in cell) for cell in cells]
        valid = (2 <= len(cells) <= 8 and all(len(label) <= 55 for label in labels)
                 and not any(re.match(r'^[•●▪\-–]\s|^\d+[.)]\s', label) for label in labels))
        starts = [cell[0]['x'] for cell in cells]
        matches = (current and len(starts) == len(current[-1]['starts'])
                   and row['center'] - current[-1]['center'] < size * 3
                   and all(abs(a-b) < max(4, size*.45) for a,b in zip(starts,current[-1]['starts'])))
        if not valid or (current and not matches):
            if len(current) >= 3: groups.append(current)
            current = []
        if valid: current.append(dict(row, starts=starts))
    if len(current) >= 3: groups.append(current)
    return [dict(kind='table', confidence=.82, method='aligned-text-columns',
                 **union([w for row in group for w in row['words']], pad=3, dimensions=dimensions)) for group in groups]


def prepare_pdf(source, pdf, slides_dir, thumbs):
    fitz = pdf_library()
    try:
        document = fitz.open(source)
    except Exception as error:
        raise ValueError(f'Cannot open PDF: {error}') from None
    warnings, pages = [], []
    with document:
        if document.needs_pass:
            raise ValueError('PDF is password protected; provide an unlocked copy.')
        if not document.is_pdf or not len(document):
            raise ValueError('Input must be a PDF containing at least one page.')
        document_title = (document.metadata or {}).get('title') or source.stem
        shutil.copy2(source, pdf)
        for index, page in enumerate(document, 1):
            display_rect = page.rect
            width, height = display_rect.width, display_rect.height
            matrix = page.rotation_matrix
            def box(raw, displayed=False):
                rect = fitz.Rect(raw)
                if not displayed: rect = rect * matrix
                rect = rect & display_rect
                if rect.is_empty or not all(math.isfinite(v) for v in rect): return None
                return dict(x=round(rect.x0, 3), y=round(rect.y0, 3), width=round(rect.width, 3), height=round(rect.height, 3))
            svg = slides_dir / f'page-{index:02d}.svg'
            svg.write_text(page.get_svg_image(text_as_path=True), encoding='utf-8')
            page.get_pixmap(matrix=fitz.Matrix(320/max(width,height),320/max(width,height)), alpha=False).save(thumbs/f'page-{index:02d}.png')
            textpage = page.get_textpage()
            native_text = page.get_text('text', textpage=textpage).strip()
            mode = 'native'
            images = page.get_image_info()
            # Scans and flattened PDFs may have no usable text. OCR is local and
            # optional; its boxes support search/wand but cannot isolate SVG glyphs.
            if len(re.sub(r'\W', '', native_text)) < 8 and (images or page.get_drawings()):
                try:
                    textpage = page.get_textpage_ocr(language='eng', dpi=200, full=True)
                    mode = 'ocr'
                except Exception:
                    mode = 'visual-only'
                    warnings.append(f'Page {index}: OCR unavailable; install Tesseract language data (TESSDATA_PREFIX). Only embedded text and visual regions are searchable/selectable.')
            raw = page.get_text('dict', textpage=textpage, flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)
            words = []
            for w in page.get_text('words', textpage=textpage):
                bounds = box(w[:4])
                if bounds and w[4].strip(): words.append(dict(text=w[4], block=w[5], line=w[6], **bounds))
            lines, regions = [], []
            for block in raw['blocks']:
                if block['type'] != 0: continue
                block_lines = []
                for number, line in enumerate(block['lines']):
                    spans = [s for s in line['spans'] if s.get('text','').strip() and s.get('alpha',255) > 0]
                    bounds = box(line['bbox'])
                    if not spans or not bounds: continue
                    direction = fitz.Point(line['dir']) * fitz.Matrix(matrix.a,matrix.b,matrix.c,matrix.d,0,0)
                    item = dict(text=''.join(s['text'] for s in spans), **bounds,
                                fontSize=weighted_size([dict(fontSize=s['size'],text=s['text']) for s in spans]),
                                horizontal=abs(direction.y) < .12,
                                words=[w for w in words if w['block']==block['number'] and w['line']==number])
                    block_lines.append(item); lines.append(item)
                # Split blocks across font changes, generous vertical gaps or
                # column breaks. Native blocks otherwise stay useful as a unit.
                group = []
                for line in block_lines:
                    previous = group[-1] if group else None
                    column_break = previous and (
                        line['y'] < previous['y'] - line['fontSize']*.5 or
                        (abs(line['y']-previous['y']) < line['fontSize']*.5 and
                         abs(line['x']-previous['x']) > line['fontSize']*2) or
                        min(line['x']+line['width'], previous['x']+previous['width']) < max(line['x'],previous['x']))
                    if group and (column_break or abs(line['fontSize']/max(1,previous['fontSize'])-1) > .18 or
                                  line['y']-previous['y']-previous['height'] > line['fontSize']*.9):
                        regions.append(dict(kind='text',text=' '.join(l['text'] for l in group), confidence=.95 if mode=='native' else .8, **union(group))); group=[]
                    group.append(line)
                if group: regions.append(dict(kind='text',text=' '.join(l['text'] for l in group), confidence=.95 if mode=='native' else .8, **union(group)))
            visual = []
            for image in images:
                bounds = box(image['bbox'])
                if bounds and bounds['width'] >= width*.06 and bounds['height'] >= height*.06:
                    visual.append(dict(kind='image',confidence=.99,method='embedded-image',**bounds))
            # A ruled grid is strong evidence; alignment alone needs at least
            # three rows. Both paths exclude empty decorative boxes.
            try:
                # Unlike text/drawings, find_tables uses displayed coordinates.
                # Analyze unrotated pages explicitly, then transform once.
                rotation = page.rotation
                try:
                    page.set_rotation(0)
                    tables = [(t.bbox, t.row_count, t.col_count, t.extract())
                              for t in page.find_tables(strategy='lines_strict').tables]
                finally:
                    page.set_rotation(rotation)
                for bbox, rows, cols, values in tables:
                    count=sum(bool((v or '').strip()) for row in values for v in row)
                    bounds=box(bbox)
                    if bounds and rows>=2 and cols>=2 and count >= rows*cols*.55:
                        visual.append(dict(kind='table',confidence=.96,method='ruled-grid',**bounds))
            except Exception as error:
                warnings.append(f'Page {index}: ruled-table analysis unavailable ({type(error).__name__}); text alignment still checked.')
            for table in borderless_tables(words,(width,height)):
                if not any(v['kind']=='table' and overlap(table,v)>.5 for v in visual): visual.append(table)
            # Cluster vector illustrations, rejecting full-page backgrounds,
            # text cards, separators and already recognized tables.
            drawings = [d for d in page.get_drawings() if d['rect'].get_area() < page.rect.get_area()*.8]
            if hasattr(page,'cluster_drawings'):
                for cluster in page.cluster_drawings(drawings=drawings):
                    bounds=box(cluster)
                    if not bounds or bounds['width'] < width*.1 or bounds['height'] < height*.08: continue
                    members=[d for d in drawings if cluster.contains(d['rect'])]
                    complexity=sum(len(d['items']) for d in members)
                    text_area=sum(r['width']*r['height'] for r in regions if overlap(r,bounds)>.85)
                    if complexity < 5 or text_area > bounds['width']*bounds['height']*.3: continue
                    if any(overlap(bounds,v)>.55 for v in visual): continue
                    visual.append(dict(kind='image',confidence=.85,method='vector-cluster',**bounds))
            links=[]
            for link in page.get_links():
                # get_links already returns cropped/rotated display coordinates.
                bounds=box(link['from'], displayed=True)
                if not bounds: continue
                if link['kind']==fitz.LINK_GOTO and link.get('page',-1)>=0:
                    links.append(dict(page=link['page']+1,**bounds))
                elif link.get('uri') or link.get('file'):
                    href=link.get('uri') or link['file']
                    links.append(dict(href=href,local=not bool(re.match(r'^(https?:|mailto:)',href,re.I)),**bounds))
            for number, region in enumerate(regions+visual,1): region['id']=f'{region["kind"]}-{number}'
            pages.append(dict(width=width,height=height,words=words,lines=lines,regions=regions,visual=visual,
                              text=page.get_text('text',textpage=textpage,sort=True),links=links,textMode=mode))
        headers=Counter(line['text'].strip().casefold() for geo in pages for line in geo['lines'] if line['y']<geo['height']*.12)
        repeated={text for text,count in headers.items() if len(pages)>=3 and count>=max(3,len(pages)*.6)}
        for geo in pages:
            geo['title'],geo['titleWords'],geo['titleDetection']=infer_title(geo,repeated)
    return pages, document_title, warnings


def overlap(a,b):
    area=max(0,min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x']))*max(0,min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y']))
    return area/max(1,min(a['width']*a['height'],b['width']*b['height']))
