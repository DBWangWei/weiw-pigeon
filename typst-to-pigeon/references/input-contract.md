# Input contract

For Typst input, the exporter accepts a `.typ` source that compiles with the installed Typst, its packages, local assets and fonts. Python 3.11+, Node.js 20.11+, Typst with `eval` support, and Poppler (`pdftotext`, `pdftoppm`) must be on PATH. It compiles PDF and one SVG per active physical page, then extracts text and positions from the PDF. It never edits the input.

Each slide retains its own SVG viewBox dimensions. Landscape, portrait and mixed-size decks use those dimensions for camera fitting, drawing, boards, magic-wand bounds and PNG export. There is no fixed 960×540 conversion.

PDF input (`.pdf`, case insensitive) uses PyMuPDF (`python3 -m pip install -r requirements-pdf.txt`), Python and Node; neither Typst nor Poppler is required, including for model-graph page renderings. It keeps the original PDF byte-for-byte, renders each page to SVG, and extracts native words, font sizes, images, vector drawings, links and table geometry. Crop boxes and page rotation are reflected in the displayed dimensions and region coordinates. Password-protected PDFs must be unlocked before conversion.

PDF title detection favors horizontal text in the top 30% of the page whose font is at least 1.24 times the body font, with an additional large-type cover-page rule. Similar adjacent lines are joined into wrapped titles. Bullets, numeric labels, repeated small headers and long paragraphs are excluded. A separator is not required. Uncertain pages retain an empty title, a `Slide N` navigation label and no title animation. Navigation JSON can supply a title or set `"title": ""` to force it off. Font thresholds are heuristics, and `build-report.json` records the decision for each page.

PDF wand extraction uses native text blocks split at font/gap/column boundaries, embedded-image bounds, populated ruled grids, repeated wide text-column alignments (at least three rows), and sufficiently complex vector clusters. Simple backgrounds and separators are excluded as graphics. Region `confidence` values describe heuristic strength, not calibrated probabilities. Complex charts may have several targets, and visual layout alone cannot always distinguish columns from a table; use navigation overrides when needed. PDF does not automatically identify `#takeaway` semantics.

Pages with almost no native text attempt local English OCR at 200 dpi. This needs Tesseract's `eng.traineddata` (set `TESSDATA_PREFIX` to its directory if necessary). OCR supplies search text and text-wand boxes; its titles remain static because OCR glyphs cannot be separated from the scan. If OCR is unavailable the build continues with a warning and the page's visual targets. Image-only PDFs cannot provide keyword search or text-derived concepts without readable text/OCR; their pages remain navigable by number and in the graph. Original raster images retain their original resolution. No OCR service is called.

Optional Typst slide metadata improves titles, section grouping and navigation labels:

```typst
#metadata((
  id: "03a",
  title: "A useful slide title",
  section: "Section A",
  source: [Citation or source note],
)) <slide-record>
```

Typst records are mapped by physical page. Pages without records remain in the deck; they receive numbered IDs and a title inferred from the largest text line in the top half of the page. Repeated IDs (for example, incremental reveal pages) receive a page suffix. IDs must be unique after suffixing and must not contain `::`, which separates board names in sessions. Blank pages are retained.

The exporter matches title text against PDF words and isolates its original SVG glyphs. A missing match leaves the original slide static and adds a build warning. For multiline titles without metadata, unusual reading order, or custom title macros, provide an explicit title or rectangle. Decorative non-glyph paths and image-only titles are not animated as text.

An optional sibling `<source-stem>.navigation.json` (or `--navigation FILE`) can supply:

```json
{
  "slides": {
    "2": {"title": "A multiline title", "titleRect": {"x": 30, "y": 20, "width": 630, "height": 100}}
  },
  "defaultRoute": ["01", "02"],
  "hierarchy": [
    {"id": "root", "label": "Talk", "children": ["section-a"]},
    {"id": "section-a", "label": "Section A", "children": ["01", "02"]}
  ],
  "focusRegions": [
    {"id": "loop", "slideId": "02", "label": "Important loop", "rect": {"x": 60, "y": 150, "width": 400, "height": 200}}
  ],
  "wandRegions": [
    {"page": 2, "id": "custom-takeaway", "kind": "takeaway", "rect": {"x": 30, "y": 400, "width": 600, "height": 70}}
  ],
  "resources": {"./example.html": "examples/self-contained.html"}
}
```

`slides` keys are physical page numbers. Rectangles use the page's native SVG units, with origin at the top left. `wandRegions` accepts `page` or `slideId` and kinds `text`, `image`, `table`, `takeaway`. These are optional overrides, not a second knowledge graph. `defaultRoute`, if supplied, must contain every resulting slide ID exactly once.

For Typst input, wand targets come from PDF text blocks, rendered images, connected bordered table grids, and source `#takeaway[...]` text matched to the PDF and nearby backgrounds. Takeaway detection is independent of fill color and scans local `.typ` imports. Complex computed macros, borderless tables and unusual graphics may need explicit `wandRegions`; this is heuristic extraction, not a complete Typst semantic parser. The original talk's takeaway gradient remains a compatibility fallback.

Web/mail links and supported physical-page links are enabled automatically. A local resource must be explicitly mapped by its original link destination; mapped files are resolved relative to the navigation JSON and copied into the deck. HTML should be self-contained, since linked scripts/images are not recursively copied. Unmapped local links are disabled and listed in `build-report.json`. No talk-specific demo is bundled automatically.

Manifest invariants:

- `schemaVersion` is `1.0`; each slide has a unique ID, physical page, dimensions, SVG asset and SHA-256.
- `sourceType` is `typst` or `pdf`.
- `pdf` identifies the compiled or original PDF; consumers must use this field rather than a fixed filename.
- `revision` includes SVG hashes, extracted text, metadata and regions. The graph must have the same deck ID and revision.
- Optional `titleLayer` identifies the glyph-only SVG, the slide with those glyphs removed, and the title bounds. The original SVG is retained for None, wand crops and exports.

Do not include source files or credentials in a release. Inspect build warnings before presenting; do not claim an unrecognized title or object was extracted successfully.
