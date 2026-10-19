# Typst talk to Pigeon: OLS Beyond Memorization

A 24-slide presentation for **DSAA3073: Theories of Data Science, 26Summer,
Week 4**, by Wei Wang, HKUST(GZ).

The content is adapted from the course FAQ, *Understanding the Normal Equations
Beyond Memorization*. The visual template comes from `talk-v4.typ`: the title
page, teal/violet palette, branded slide wrapper, cards, hooks, tables, and
`#takeaway[...]` macro. Four repeated Outline pages introduce the sections; 19
takeaway callouts demonstrate Pigeon's stronger magic-wand emphasis.

## Open the example

- [Editable Typst source](OLS-beyond-memoization.typ)
- [Compiled PDF](OLS-beyond-memoization.pdf)
- [Pigeon presentation](pigeon-OLS-beyond-memoization/index.html): open this file
  locally after downloading or cloning the repository.

The source, template, logo, and figures are all included. Copy the complete
`pigeon-OLS-beyond-memoization/` folder to present on another computer. No internet
connection is needed to view it.

## Rebuild

From the repository root, with the dependencies described in the main README:

```bash
./typst-to-pigeon.sh examples/typst-talk-to-pigeon/OLS-beyond-memoization.typ --force
```

The generated folder and ZIP are written beside the Typst source. `pigeon.toml`
selects local graph extraction, Text Type titles, and Camera transitions.
Command-line options override these settings.

To compile only the standalone PDF, run inside this example directory:

```bash
typst compile OLS-beyond-memoization.typ OLS-beyond-memoization.pdf
```

Figures are pre-generated SVG files. To regenerate them, run
`python3 assets/generate_figures.py` with NumPy and Matplotlib installed.
The script also verifies the numerical examples.

## Content

The deck connects dimensions, orthogonal projection, gradients, Gram matrices,
feature inner products, and the adjoint. It then distinguishes coefficient
uniqueness from fitted-value uniqueness, the pseudoinverse from the projector,
and ridge smoothing from orthogonal projection. A constant-fit example and
spectral-weight plots make these distinctions concrete.

The local knowledge graph uses titles, sections, and recurring terms; its edges
are navigation and mention relationships, not a verified map of mathematical
implications. Review `pigeon-OLS-beyond-memoization/build-report.json` for extraction
details.
