# Pigeon 1.0.4

Pigeon 1.0.4 adds authored semantic tiers to the offline presentation runtime.
Typst authors can define question, answer, evidence, detail, takeaway and
background states while retaining the complete source-rendered page for export.

## Semantic-tier authoring

Copy [`pigeon-tiers.typ`](../../../typst-to-pigeon/assets/pigeon-tiers.typ) and
[`pigeon-sem.typ`](../../../typst-to-pigeon/assets/pigeon-sem.typ) beside a Typst
source when the deck needs semantic regions. The public helpers and their
metadata contract are documented in the
[semantic function reference](../../semantic-functions.html) and the
[semantic-tier reference](../../../typst-to-pigeon/references/semantic-tiers.md).

The released runtime supports:

- Slide mode, which enters each slide at its configured default tier.
- Step mode, which walks surviving tiers before changing slides.
- Comma/period tier changes, URL routes, exact-tier deep-link returns, and
  tier-aware voice and Wand target visibility.
- Tier-aware artwork, title layers, dimming and extraction effects while
  complete-source PDF and PNG exports remain intact.

Build the six-page example with:

```sh
./typst-to-pigeon.sh examples/semantic-tiers/semantic-tiers.typ \
  --output /tmp/pigeon-semantic-tiers --graph local --no-zip --force
```

See [`examples/semantic-tiers/TEST-THIS-DECK.md`](../../../examples/semantic-tiers/TEST-THIS-DECK.md)
for live browser checks. The example includes independent question/answer
states, a decorated table, nested figure support, deep navigation, opaque
replacement cards, page-fill changes and public/private notes.

## Validation

The 1.0.4 release was checked with the Python regression suite, JavaScript and
Python syntax checks, `git diff --check`, and a visible Chromium Playwright
smoke suite covering tier navigation, step mode, deep links, reload routing,
overview/search controls and a mobile viewport. Browser rendering and live
microphone accuracy remain separate from the automated checks.

Pigeon retains the local Whisper voice triggers, diagram editor, annotation
tools, PDF input and export behavior documented in
[`docs/versions/1.0.3/README.md`](../1.0.3/README.md).
