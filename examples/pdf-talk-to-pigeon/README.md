# PDF talk to Pigeon: Learning with Infinite Hypothesis Sets

This example converts a 42-page **Foundations of Machine Learning** lecture by
**Mehryar Mohri**, credited in the source to the Courant Institute and Google
Research. It covers Rademacher complexity, growth functions, VC dimension, and
lower bounds. The supplied source PDF and its attribution are preserved unchanged.

## Open the example

- [Original PDF](ml_learning_with_infinite_hypothesis_sets.pdf)
- [Pigeon presentation](pigeon-ml_learning_with_infinite_hypothesis_sets/index.html):
  open this file locally after downloading or cloning the repository.

Copy the complete `pigeon-ml_learning_with_infinite_hypothesis_sets/` folder to
present on another computer. Viewing and annotation work offline.

## Rebuild

Follow [How to run Pigeon](../../HowToRun.md) to install Python, Node.js, and
PyMuPDF. Then run from the repository root:

```bash
./typst-to-pigeon.sh examples/pdf-talk-to-pigeon/ml_learning_with_infinite_hypothesis_sets.pdf --force
```

The generated folder and ZIP are written beside the PDF. `pigeon.toml` gives the
presentation a readable title and selects local graph extraction, Text Type
titles, and Camera transitions. Command-line options override these settings.
PDF conversion does not require Typst or Poppler.

The sibling `ml_learning_with_infinite_hypothesis_sets.navigation.json` preserves
the lecture's section boundaries at its repeated “This lecture” pages. It also
selects the lecture title on the cover, leaves proof pages 8 and 37 untitled,
and supplies the visible heading on page 40. These reviewed overrides are
applied automatically on every rebuild and do not alter the source artwork.

## Extraction behavior

The rendered pages preserve the PDF's original appearance. Titles and magic-wand
regions are inferred from PDF geometry; this input has no Typst `#takeaway`
semantics. Search and the local concept graph use extracted text, whose reading
order, ligatures, and mathematical symbols may differ from the displayed PDF.
The graph exposes recurring terms and slide relationships rather than verified
mathematical implications. See
`pigeon-ml_learning_with_infinite_hypothesis_sets/build-report.json` for page-level
results and warnings.
