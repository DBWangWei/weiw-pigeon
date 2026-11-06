# Pigeon 1.0.4

Pigeon 1.0.4 adds authored semantic tiers to the offline presentation runtime.
Typst authors can define question, answer, evidence, detail, takeaway and
background states while retaining the complete source-rendered page for export.

## Output formats

New builds default to `--out-mode single`, producing one standalone
`pigeon-FILENAME.html` file that recipients can open locally. It embeds the
runtime, deck assets, icons, styles, PDF export library and license notices.
Voice and live Q&A use `--out-mode multiple` (a folder) or `--out-mode zip`
(the folder plus an archive). `out_mode` in `pigeon.toml` sets the persistent
choice; legacy `--no-zip`, `--zip`, and `no_zip` remain compatible.
See the [output-mode reference](../../../typst-to-pigeon/references/config.md#output-modes).

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

## Voice navigation and live Q&A

The release also includes built-in voice commands for page navigation,
fullscreen, hierarchy/graph overview, and switching among Pen, Highlighter,
Wand, Diagram and Navigate modes. Say `take questions now` or `take any
questions now` after repeating an audience question, then answer it. Final
transcript segments are displayed in an authored `_qa` semantic region and
organized through the local `/api/qa/organize` endpoint. The default organizer
uses DashScope Chat Completions with `qwen3.7-flash`, saves each raw transcript
under `.qa-transcripts/`, and returns a direct response in fewer than 100 words.
Set `DASHSCOPE_API_KEY` or use the masked key field in the Voice window. Press
`Q` to insert a white Q&A page containing the numbered list. Configure the
model, target and bounds with `[qa]`; see the [Q&A configuration reference](../../../typst-to-pigeon/references/config.md#live-qa-capture).

## Motion effects

Pigeon 1.0.4 also includes a dependency-free particle morph transition. It is
used by default when navigation crosses between sections; `[effects]` can set
`particle_morph = "all"` or `"none"`, or provide `particle_morph_slides` for
exact destination slide IDs. Rack focus starts disabled and can be enabled in
the existing Overview panel under **Motion effects**. It focuses the slide's
semantic or Wand regions one at a time before advancing. See the [motion-effects
configuration reference](../../../typst-to-pigeon/references/config.md#motion-effects).

## Validation

The 1.0.4 release was checked with the Python regression suite, JavaScript and
Python syntax checks, `git diff --check`, and a visible Chromium Playwright
smoke suite covering tier navigation, step mode, deep links, reload routing,
overview/search controls and a mobile viewport. Browser rendering and live
microphone accuracy remain separate from the automated checks.

Pigeon retains the local Whisper voice triggers, diagram editor, annotation
tools, PDF input and export behavior documented in
[`docs/versions/1.0.3/README.md`](../1.0.3/README.md).
