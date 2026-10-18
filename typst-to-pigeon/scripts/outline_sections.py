"""Conservative section boundaries from repeated, list-only outline pages."""
import re
from slide_artwork import normalized

MARKER = re.compile(r'^\s*(?:[•●◦▪▸‣–—−-]|\d+[.)]|\(\d+\))\s*(.*)$')


def outline_items(slide, geometry):
    if slide['title'].strip().casefold().rstrip(':') not in {'overview', 'outline'}:
        return []
    height = slide['height']
    lines = sorted(geometry['lines'], key=lambda line: (round(line['y'], 1), line['x']))
    # Title words provide a reliable boundary even for a wrapped or decorated heading.
    title_lines = [line for line in lines if normalized(line['text']) == normalized(slide['title'])]
    if not title_lines: return []
    title_bottom = min(line['y']+line['height'] for line in title_lines)
    body = [dict(line) for line in lines if line['y'] >= title_bottom-1 and line['y'] < height*.91
            and line['text'].strip() and not re.fullmatch(r'\s*\d+\s*(?:/\s*\d+)?\s*', line['text'])]
    if any(r['kind'] in {'image', 'table'} and r['y'] > title_bottom
           and r['y']+r['height'] < height*.91 for r in slide['wandRegions']):
        return []
    # PDF writers sometimes emit the marker and its text as separate same-row lines.
    rows = []
    for line in body:
        if rows and abs(rows[-1]['y']-line['y']) < min(rows[-1]['height'],line['height'])*.4:
            rows[-1]['text'] += ' ' + line['text']
            rows[-1]['width'] = max(rows[-1]['width'], line['x']+line['width']-rows[-1]['x'])
        else: rows.append(line)
    items, start_x, previous = [], None, None
    for line in rows:
        text = line['text'].strip()
        match = MARKER.match(text)
        if match and match[1].strip():
            if start_x is not None and abs(line['x']-start_x) > max(12,line['height']*.8):
                return []  # Nested lists are not a flat section list.
            start_x = line['x'] if start_x is None else start_x
            items.append(match[1].strip())
        elif (items and previous and line['x'] > start_x+3
              and line['y']-previous['y']-previous['height'] <= line['height']*.9):
            items[-1] += ' ' + text
        else:
            return []  # An ordinary paragraph on an Overview page is not an outline.
        previous = line
    return items if 1 <= len(items) <= 40 and all(len(item) <= 240 for item in items) else []


def assign_sections(slides, geometry, explicit, warnings):
    canonical, number, active = [], 0, None
    found = []
    for slide, geo in zip(slides, geometry):
        items = outline_items(slide, geo)
        if items:
            slide['outlineItems'] = items
            if not canonical: canonical = items
            if [normalized(x) for x in items] != [normalized(x) for x in canonical]:
                warnings.append(f'Page {slide["page"]}: outline list differs from the first outline; section boundary was not inferred.')
            else:
                number += 1
                label = canonical[number-1] if number <= len(canonical) else f'Section {number}'
                if number > len(canonical):
                    warnings.append(f'Page {slide["page"]}: more outline occurrences than section items; using Section {number}.')
                active = f'{number}. {label}' if number <= len(canonical) else label
                slide['isOutline'] = True
                slide['outlineSectionNumber'] = number
                found.append(dict(page=slide['page'], sectionNumber=number, label=label))
        if active and slide['id'] not in explicit:
            slide['section'] = active
            slide['sectionNumber'] = number
    if found:
        for slide in slides:
            if slide['page'] >= found[0]['page']: break
            if slide['id'] not in explicit: slide['section'] = 'Introduction'
    return found
