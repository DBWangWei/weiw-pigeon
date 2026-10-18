# PDF input example · Pigeon 1.0.2

This nine-page PDF includes a large title without a separator, an untitled page,
a wrapped title, an image and ruled table, a borderless table, a blank page,
an image-only page, a rotated page with an internal link and table, and a cropped page.

Open `pigeon-geometry/index.html`. Rebuild from the repository root:

```bash
PIGEON_SKILL_DIR="$PWD/typst-to-pigeon" ./typst-to-pigeon.sh examples/pdf/geometry.pdf --force
```

Requires Python with `PyMuPDF` installed and Node.js. The flat gray image-only
page has no text to recognize; without OCR language data it produces a warning.
This is an extraction fixture, not a sample of OCR recognition quality.

The fixture source is the `fixture()` function in
`typst-to-pigeon/tests/test_pdf.py` (paths relative to the repository root).
