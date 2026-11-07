# Pigeon 1.0.5

Pigeon 1.0.5 refines the authored Typst ticker and updates the generated
runtime version.

## Status-marker ticker

Ticker rows keep their existing fixed height and left alignment while using
compact broadcast-style markers:

- `● NOW` marks the current thread in red.
- `→ NEXT` marks the upcoming thread in blue.
- `✓ DONE` marks a resolved thread in green.

The markers are emitted by the shared Typst helper for PDF output and by the
HTML runtime as separate styled labels. The message text remains authored and
clickable, and the two rows retain the same geometry.

## Final-page rule

Cover and final pages are reserved for opening and Q&A/closing content. The
build pipeline therefore removes their ticker ticks and bands from the runtime
manifest and masks any stale static ticker copy from the compiled SVG/PDF.

## Validation

The release was checked with the ticker Python regression tests, Typst/PDF
fixture compilation, Python and JavaScript syntax checks, `git diff --check`,
and a visible Chromium CDP smoke check confirming marker text, colors, and
left-aligned two-row geometry. The optional Happy DOM test remains dependent on
the local `happy-dom` package.

Previous behavior is documented in
[`docs/versions/1.0.4/README.md`](../1.0.4/README.md).
