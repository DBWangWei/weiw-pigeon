"""Page geometry, PDF text matching and original SVG title layers."""
from __future__ import annotations
import copy
import re
import unicodedata
import xml.etree.ElementTree as ET
from wand_regions import walk, point, bounds, IDENTITY, HREF

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def union(boxes, pad=0, dimensions=None):
    x = min(b['x'] for b in boxes) - pad
    y = min(b['y'] for b in boxes) - pad
    right = max(b['x'] + b['width'] for b in boxes) + pad
    bottom = max(b['y'] + b['height'] for b in boxes) + pad
    if dimensions:
        x, y = max(0, x), max(0, y)
        right, bottom = min(dimensions[0], right), min(dimensions[1], bottom)
    return dict(x=round(x, 3), y=round(y, 3), width=round(right-x, 3), height=round(bottom-y, 3))


def match_words(words, text):
    target = normalized(text)
    if not target:
        return []
    # Match sequences, preserving the actual PDF word positions and Unicode.
    for start, word in enumerate(words):
        first = normalized(word['text'])
        # A preceding block's period or decorative icon is not part of the match.
        if not first or not target.startswith(first):
            continue
        collected = ''
        for end in range(start, min(len(words), start + 160)):
            collected += normalized(words[end]['text'])
            if collected == target:
                return words[start:end+1]
            if not target.startswith(collected):
                break
    return []


def title_layers(svg, title_words, directory, basename):
    """Isolate glyph uses by their baseline/word bounds, retaining SVG definitions.

    Never erase a rectangular piece of the slide: only the matched glyph uses
    are removed from the animation base. This preserves photos, gradients and
    decorations behind the title. The original SVG remains the default/export.
    """
    if not title_words:
        return None
    root = ET.parse(svg).getroot()
    width, height = [float(v) for v in root.get('viewBox').split()][2:]
    definitions = {el.get('id') for el in root.iter() if el.get('id')}
    parents = {child: el for el in root.iter() for child in el}
    chosen = []
    for el, matrix in walk(root):
        if el.tag.split('}')[-1] != 'use':
            continue
        href = el.get('href') or el.get(HREF, '')
        if not href.startswith('#') or href[1:] not in definitions:
            continue
        x, y = point(matrix, float(el.get('x', 0)), float(el.get('y', 0)))
        if any(w['x'] - 1 <= x < w['x'] + w['width'] + .1 and
               w['y'] - 1 <= y <= w['y'] + w['height'] + 1 for w in title_words):
            # Retain the original transform, paint, opacity and clipping chain.
            # Flattening paint attributes loses nested opacity and clip paths.
            chain, ancestor = [], parents.get(el)
            while ancestor is not None and ancestor is not root:
                chain.append(ancestor)
                ancestor = parents.get(ancestor)
            group = ET.Element(f'{{{SVG}}}g')
            container = group
            for ancestor in reversed(chain):
                container = ET.SubElement(container, ancestor.tag,
                                          {k: v for k, v in ancestor.attrib.items() if k != 'id'})
            container.append(copy.deepcopy(el))
            chosen.append((el, group))
    if not chosen:
        return None
    title_root = ET.Element(root.tag, root.attrib)
    for el in root:
        if el.tag.split('}')[-1] == 'defs':
            title_root.append(copy.deepcopy(el))
    for index, (el, group) in enumerate(chosen):
        wrapper = ET.SubElement(title_root, f'{{{SVG}}}g', {'class': 'pigeon-title-glyph', 'data-order': str(index)})
        wrapper.append(group)
        parents[el].remove(el)
    directory.mkdir(parents=True, exist_ok=True)
    base_path = directory / f'{basename}-body.svg'
    title_path = directory / f'{basename}-title.svg'
    ET.ElementTree(root).write(base_path, encoding='utf-8')
    ET.ElementTree(title_root).write(title_path, encoding='utf-8')
    return {'baseAsset': f'titles/{base_path.name}', 'asset': f'titles/{title_path.name}',
            'glyphs': len(chosen), 'rect': union(title_words, pad=2, dimensions=(width, height))}


def strip_comments(text):
    return re.sub(r'/\*[\s\S]*?\*/|//[^\n]*', '', text)


def takeaway_texts(source):
    """Find active #takeaway[...] calls in the entry source and local imports.

    Complex computed content can supply an explicit region in navigation JSON.
    Matches must also occur in the compiled PDF, excluding inactive slides.
    """
    pending, seen, snippets = [source], set(), []
    while pending:
        path = pending.pop().resolve()
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        text = strip_comments(path.read_text(encoding='utf-8'))
        for relative in re.findall(r'#(?:import|include)\s+"([^"\n]+\.typ)"', text):
            if not relative.startswith('@'):
                pending.append(path.parent / relative)
        for match in re.finditer(r'#takeaway\s*(?:\([^\n]*?\))?\s*\[', text):
            depth, i, start = 1, match.end(), match.end()
            while i < len(text) and depth:
                if text[i] == '[': depth += 1
                elif text[i] == ']': depth -= 1
                i += 1
            if depth:
                continue
            body = text[start:i-1]
            body = re.sub(r'#[\w.-]+(?:\([^\[\]]*?\))?', '', body)
            body = re.sub(r'[\[\]*_`]', '', body)
            snippets.append(' '.join(body.split()))
    return snippets


def enclosing_background(svg, text_rect, dimensions):
    """Prefer a nearby filled SVG rectangle to text-only bounds for callouts."""
    candidates = []
    for el, matrix in walk(ET.parse(svg).getroot()):
        tag = el.tag.split('}')[-1]
        if el.get('fill', 'none') == 'none':
            continue
        box = None
        if tag == 'rect':
            box = bounds(matrix, float(el.get('x', 0)), float(el.get('y', 0)), float(el.get('width', 0)), float(el.get('height', 0)))
        elif tag == 'path':
            # Typst's filled rectangles and rounded boxes use M/L/H/V/C/Z.
            from wand_regions import NUMBER
            commands = re.findall(r'([A-Za-z])([^A-Za-z]*)', el.get('d', ''))
            x = y = 0
            coords = []
            valid = True
            for command, data in commands:
                values = [float(v) for v in re.findall(NUMBER, data)]
                relative = command.islower()
                if command.upper() in {'M','L','C','Q'} and len(values) % 2 == 0:
                    pairs = [(values[j] + (x if relative else 0), values[j+1] + (y if relative else 0)) for j in range(0,len(values),2)]
                    coords.extend(pairs)
                    if pairs: x,y = pairs[-1]
                elif command.upper() == 'H':
                    for v in values: x = v + (x if relative else 0); coords.append((x,y))
                elif command.upper() == 'V':
                    for v in values: y = v + (y if relative else 0); coords.append((x,y))
                elif command.upper() != 'Z': valid = False; break
            if valid and len(coords) >= 4:
                points = [point(matrix,*p) for p in coords]
                box = min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)
        if box:
            x,y,right,bottom = box
            area = (right-x)*(bottom-y)
            if (x <= text_rect['x']+1 and y <= text_rect['y']+1 and
                right >= text_rect['x']+text_rect['width']-1 and bottom >= text_rect['y']+text_rect['height']-1 and
                area < dimensions[0]*dimensions[1]*.75 and
                area < max(1,text_rect['width']*text_rect['height'])*8):
                candidates.append(dict(x=x,y=y,width=right-x,height=bottom-y))
    return min(candidates,key=lambda r:r['width']*r['height']) if candidates else union([text_rect],pad=8,dimensions=dimensions)
