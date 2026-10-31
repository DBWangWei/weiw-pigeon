"""Validate explicit Typst semantic markers and map points to SVG coordinates.

Query rows have the same physical-page envelope as slide-record metadata:
``{page: 1, value: {id: null, target: "_fig", x: ..., ..., visible: true}}``.
The queried location is authoritative; logical page counters are never used.
"""
from __future__ import annotations

from collections import Counter
import math


def _number(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{field} must be a finite number')
    return float(value)


def normalize_semantic_records(records, pages):
    """Return ``(regions_by_physical_page, report)`` in native SVG units.

    Each page supplies SVG ``width``/``height`` and PDF point dimensions
    ``pointWidth``/``pointHeight``. Hidden records count toward the report but
    their artwork bounds are intentionally ignored. IDs must be unique within
    a physical page; the same explicit ID can recur across reveal pages.
    """
    if not isinstance(records, list):
        raise ValueError('Semantic query must return a list')
    by_page = {page: [] for page in range(1, len(pages) + 1)}
    scales = {}
    for page, spec in enumerate(pages, 1):
        dims = {key: _number(spec.get(key), f'Page {page}: {key}')
                for key in ('width', 'height', 'pointWidth', 'pointHeight')}
        if any(value <= 0 for value in dims.values()):
            raise ValueError(f'Page {page}: semantic page dimensions must be positive')
        scales[page] = (_number(dims['width'] / dims['pointWidth'], f'Page {page}: x scale'),
                        _number(dims['height'] / dims['pointHeight'], f'Page {page}: y scale'))
    hidden = 0
    occurrences = Counter()
    targets = Counter()
    used_ids = {page: set() for page in by_page}
    for row in records:
        if not isinstance(row, dict):
            raise ValueError('Semantic query rows must be objects')
        page = row.get('page')
        if isinstance(page, bool) or not isinstance(page, int) or page not in by_page:
            raise ValueError(f'Semantic marker has invalid physical page: {page!r}')
        value = row.get('value')
        if not isinstance(value, dict):
            raise ValueError(f'Page {page}: semantic marker value must be an object')
        visible = value.get('visible', True)
        if not isinstance(visible, bool):
            raise ValueError(f'Page {page}: semantic marker visible must be a boolean')
        occurrences[page] += 1
        if not visible:
            hidden += 1
            continue
        target = value.get('target')
        if not isinstance(target, str) or not target.strip() or target != target.strip():
            raise ValueError(f'Page {page}: semantic marker target must be a nonempty trimmed string')
        marker_id = value.get('id')
        if marker_id is None:
            marker_id = f'{target}-{occurrences[page]}'
        if not isinstance(marker_id, str) or not marker_id.strip() or marker_id != marker_id.strip():
            raise ValueError(f'Page {page}: semantic marker id must be a nonempty trimmed string')
        if marker_id in used_ids[page]:
            raise ValueError(f'Page {page}: duplicate semantic marker id: {marker_id!r}')
        rect = {key: _number(value.get(key), f'Page {page}: semantic marker {key}')
                for key in ('x', 'y', 'width', 'height')}
        spec = pages[page - 1]
        # pdftotext serializes page dimensions to millipoints. Absorb that
        # rounding and floating-point noise at an edge, never a real crop.
        epsilon = 0.001
        if (rect['width'] <= 0 or rect['height'] <= 0 or
                rect['x'] < -epsilon or rect['y'] < -epsilon or
                rect['x'] + rect['width'] > spec['pointWidth'] + epsilon or
                rect['y'] + rect['height'] > spec['pointHeight'] + epsilon):
            raise ValueError(f'Page {page}: semantic marker {marker_id!r} has invalid in-page bounds')
        sx, sy = scales[page]
        x, y = max(0.0, rect['x']), max(0.0, rect['y'])
        right = min(spec['pointWidth'], rect['x'] + rect['width'])
        bottom = min(spec['pointHeight'], rect['y'] + rect['height'])
        by_page[page].append(dict(id=marker_id, target=target, x=x * sx, y=y * sy,
                                  width=(right - x) * sx, height=(bottom - y) * sy))
        ancestry = value.get('tierAncestry', [])
        if not isinstance(ancestry, list) or any(not isinstance(uid, str) for uid in ancestry):
            raise ValueError(f'Page {page}: semantic tier ancestry must contain UID strings')
        if ancestry:
            by_page[page][-1]['tierAncestry'] = ancestry
        used_ids[page].add(marker_id)
        targets[target] += 1
    report = dict(total=len(records), visible=sum(map(len, by_page.values())), hidden=hidden,
                  pagesWithRegions=sum(bool(regions) for regions in by_page.values()), byTarget=dict(targets))
    return by_page, report
