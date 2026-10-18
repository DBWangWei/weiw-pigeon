"""Object bounds from Typst SVGs, without changing the original artwork."""
import math
import re
import xml.etree.ElementTree as ET

IDENTITY = (1, 0, 0, 1, 0, 0)
NUMBER = r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?"
HREF = "{http://www.w3.org/1999/xlink}href"


def multiply(a, b):
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])


def transform(value):
    result = IDENTITY
    for name, raw in re.findall(r"([A-Za-z]+)\(([^)]*)\)", value or ""):
        v = [float(x) for x in re.findall(NUMBER, raw)]
        if name == "matrix" and len(v) == 6:
            item = tuple(v)
        elif name == "translate":
            item = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale":
            item = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "rotate":
            angle = math.radians(v[0]); c, s = math.cos(angle), math.sin(angle)
            item = (c, s, -s, c, 0, 0)
            if len(v) == 3:
                item = multiply(multiply((1, 0, 0, 1, v[1], v[2]), item), (1, 0, 0, 1, -v[1], -v[2]))
        elif name in ("skewX", "skewY"):
            skew = math.tan(math.radians(v[0]))
            item = (1, 0, skew, 1, 0, 0) if name == "skewX" else (1, skew, 0, 1, 0, 0)
        else:
            raise ValueError(f"Unsupported SVG transform: {name}")
        result = multiply(result, item)
    return result


def point(matrix, x, y):
    a, b, c, d, e, f = matrix
    return a*x+c*y+e, b*x+d*y+f


def walk(element, matrix=IDENTITY):
    # Glyph/emoji definitions are not independent rendered images or tables.
    if element.tag.split('}')[-1] in {"defs", "symbol", "clipPath", "pattern", "mask"}:
        return
    matrix = multiply(matrix, transform(element.get("transform")))
    yield element, matrix
    for child in element:
        yield from walk(child, matrix)


def bounds(matrix, x, y, width, height):
    corners = [point(matrix, a, b) for a, b in [(x, y), (x+width, y), (x, y+height), (x+width, y+height)]]
    return min(p[0] for p in corners), min(p[1] for p in corners), max(p[0] for p in corners), max(p[1] for p in corners)


def region(kind, box, index, dimensions=(960, 540)):
    x1, y1, x2, y2 = box
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(dimensions[0], x2), min(dimensions[1], y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return {"id": f"{kind}-{index}", "kind": kind, "x": round(x1, 3), "y": round(y1, 3),
            "width": round(x2-x1, 3), "height": round(y2-y1, 3)}


def line_segments(path):
    """Read only straight paths; curved card/glyph outlines are not grid rules."""
    tokens = re.findall(r"[A-Za-z]|" + NUMBER, path or "")
    if any(t.isalpha() and t not in "MmLlHhVvZz" for t in tokens):
        return []
    output, index, command = [], 0, None
    x = y = start_x = start_y = 0
    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]; index += 1
            if command in "Zz":
                output.append(((x, y), (start_x, start_y)))
                x, y = start_x, start_y
                continue
        if command is None or command in "Zz": return []
        count = 2 if command in "MmLl" else 1
        values = [float(t) for t in tokens[index:index+count]]
        if len(values) != count: return []
        index += count
        nx, ny = x, y
        if command in "MmLl":
            nx, ny = values
            if command.islower(): nx, ny = nx+x, ny+y
        elif command in "Hh": nx = values[0] + (x if command.islower() else 0)
        elif command in "Vv": ny = values[0] + (y if command.islower() else 0)
        if command in "Mm":
            start_x, start_y = nx, ny
            command = "l" if command == "m" else "L"
        else: output.append(((x, y), (nx, ny)))
        x, y = nx, ny
    return output


def table_regions(elements, dimensions=(960, 540)):
    lines = []
    for element, matrix in elements:
        tag = element.tag.split('}')[-1]
        if element.get("stroke", "none") == "none": continue
        if tag == "path": segments = line_segments(element.get("d"))
        elif tag == "line":
            segments = [((float(element.get("x1", 0)), float(element.get("y1", 0))),
                         (float(element.get("x2", 0)), float(element.get("y2", 0))))]
        else: continue
        for a, b in segments:
            a, b = point(matrix, *a), point(matrix, *b)
            if math.dist(a, b) < 8: continue
            if abs(a[1]-b[1]) < .1 or abs(a[0]-b[0]) < .1:
                lines.append((min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])))
    def touches(a, b):
        return a[0] <= b[2]+1 and b[0] <= a[2]+1 and a[1] <= b[3]+1 and b[1] <= a[3]+1
    groups = []
    while lines:
        group = [lines.pop()]
        changed = True
        while changed:
            changed = False
            for line in lines[:]:
                if any(touches(line, other) for other in group):
                    group.append(line); lines.remove(line); changed = True
        groups.append(group)
    output = []
    for group in groups:
        horizontal = [line for line in group if line[2]-line[0] > 8]
        vertical = [line for line in group if line[3]-line[1] > 8]
        # At least a 2x2 ruled grid. Separate aligned cards/text are excluded.
        if len({round(line[1], 1) for line in horizontal}) < 3 or len({round(line[0], 1) for line in vertical}) < 3:
            continue
        box = (min(line[0] for line in group), min(line[1] for line in group),
               max(line[2] for line in group), max(line[3] for line in group))
        if box[2]-box[0] < 40 or box[3]-box[1] < 20: continue
        value = region("table", box, len(output)+1, dimensions)
        if value: output.append(value)
    return output


def extract_visual_regions(svg):
    root = ET.parse(svg).getroot()
    viewbox = [float(v) for v in root.get("viewBox", "0 0 960 540").split()]
    dimensions = tuple(viewbox[2:4])
    elements = list(walk(root))
    definitions = {element.get("id"): element for element in root.iter() if element.get("id")}
    output = []
    counts = {"image": 0, "takeaway": 0}
    for element, matrix in elements:
        tag = element.tag.split('}')[-1]
        kind, box = None, None
        if tag == "image":
            width, height = float(element.get("width", 0)), float(element.get("height", 0))
            box = bounds(matrix, float(element.get("x", 0)), float(element.get("y", 0)), width, height)
            # Exclude small branding; SVG and PDF-imported diagrams are included.
            if box[2]-box[0] >= 120 and box[3]-box[1] >= 50: kind = "image"
        elif tag == "path" and element.get("fill", "").startswith("url(#"):
            gradient = definitions.get(element.get("fill")[5:-1])
            if gradient is None: continue
            palette = gradient
            href = gradient.get("href") or gradient.get(HREF)
            if href: palette = definitions.get(href.lstrip('#'), gradient)
            colors = [stop.get("stop-color", "").lower() for stop in palette]
            # This is the fill emitted by shared/style.typ's takeaway component.
            if colors == ["#edf5f5", "#e3f4f5", "#d9f2f4"]:
                fill_matrix = transform(gradient.get("gradientTransform"))
                box = bounds(multiply(matrix, fill_matrix), 0, 0, 1, 1)
                if box[2]-box[0] > 100 and box[3]-box[1] > 20: kind = "takeaway"
        if kind:
            value = region(kind, box, counts[kind]+1, dimensions)
            if value:
                counts[kind] += 1
                output.append(value)
    return output + table_regions(elements, dimensions)
