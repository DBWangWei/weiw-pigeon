# Geometry regression fixtures

`geometry.typ` is the three-page Typst fixture used by the general runtime tests.

`geometry.pdf` is the nine-page PDF fixture formerly stored in `examples/pdf/`.
It covers titled and untitled pages, wrapped titles, tables, images, a blank
page, an image-only page, rotation, cropping, and links. Its generator is
`fixture()` in `tests/test_pdf.py`. It is a regression fixture, not a sample of
OCR recognition quality.

Generate a temporary PDF presentation from the skill directory:

```bash
python3 scripts/typst_to_pigeon.py tests/fixtures/geometry.pdf --output /tmp/pigeon-pdf-geometry-check --graph local --no-zip --force
PIGEON_FIXTURE_ROOT=/tmp/pigeon-pdf-geometry-check PIGEON_TEST_DEPS=/path/to/node_modules node --test tests/runtime-pdf.test.mjs
```

`PIGEON_TEST_DEPS` must contain Happy DOM. The PDF fixture may report an optional
OCR warning for its flat gray image-only page. See the
[QA checklist](../../references/qa-checklist.md) for the full test procedure.
