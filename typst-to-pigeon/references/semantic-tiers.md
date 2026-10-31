# Semantic tiers

Semantic tiers are authored, independent presentation states of each physical Typst page. They preserve the source layout and use compiled SVG variants. Ordinary Typst compilation and the bundled PDF show the complete source. PDF input and unmarked Typst pages have one complete state.

## Authoring

Copy `assets/pigeon-tiers.typ` beside your source and import it with a namespace:

```typst
#import "pigeon-tiers.typ" as sem
#sem.tiers("result", default: "answer")
#sem.hook[What changes with regularization?]
#sem.answer[Unstable directions shrink.]
#sem.detail[Derivation and assumptions.]
#sem.takeaway("stability")[Stability can trade bias for variance.]
```

Use `hook`, `cue`, `answer`, `detail`, `caveat`, `takeaway(id, body)`, `contrast(group, body)`, and `support(body, to: none)`. Wrap the complete decorated body inside external alignment wrappers. Hidden bodies reserve their layout. Unwrapped content stays visible. A hidden ancestor hides descendants; showing a parent does not automatically show a separately hidden child.

`inline: true` reserves an unbroken box for single-line text/math, including mixed font sizes and tall inline math. Explicit line/paragraph breaks, block constructs and fixed-width inner boxes require block wrappers. Role boxes must fit one physical page. `region: (x: 0.1, y: 0.2, w: 0.4, h: 0.5)` marks a normalized subregion without independently hiding its body; nested `detail` and `support(region: ...)` can mark figure evidence. `support(to: "takeaway-id")` associates evidence with a takeaway.

`sem.note[Private presenter note]` and `sem.note(public: true)[Audience note]` create metadata, not slide artwork. Only public notes belong in audience reading/search views. Private notes remain in the distributed presentation files and are not a confidentiality boundary. Touying PDFPC notes are merged when available.

`sem.deep(<destination>, to: "takeaway-id")` creates an explicit detour to a labelled physical page. An associated destination is available while the role with that author ID is visible; an unassociated destination is always available. Enter follows the first applicable destination; multiple destinations can be selected in the HUD. R restores the saved page and tier.

For same-position alternatives, use ordinary Typst `place` and opaque blocks inside different role wrappers. Recipes select their visibility independently; the source paint order determines covers in all states, including the complete PDF. To permit page-fill changes, set `page(fill: sem.background(default: white))` or use that helper in your theme's fill. An explicit background override requires this opt-in. Foreground colors remain authored.

## Configuration and generation

```toml
[tiers]
mode = "slide"
default_preset = "result"

[[tiers.presets.result]]
name = "question"
show = ["hook", "cue"]

[[tiers.presets.result]]
name = "answer"
show = ["answer"]
default = true

[[tiers.presets.result]]
name = "takeaway"
show = ["takeaway"]
fx = "extract"

[[tiers.presets.result]]
name = "full"
show = "*"
pin = "takeaway"
emph = ["support", "contrast"]
dim = ["detail"]
# background = "#FFF8E8"
```

Each `show` is a complete selection, never an addition to the previous state. `emph` outlines visible regions, `pin` rings visible regions without revealing hidden content, and `dim` dims selected visible roles. The same role cannot be both emphasized and dimmed. `fx = "extract"` centers one or more visible takeaways while dimming the current artwork. Background colors use `#RRGGBB`.

Omitting `presets` supplies `result` (question, answer, takeaway extraction, full) and `flat` (full). An explicit presets table replaces the collection; include `flat` yourself if you use it. `[pigeon.tiers]` replaces the whole top-level `[tiers]` table. Unknown keys/types, duplicate names, conflicting defaults/effects, missing presets, and invalid colors are errors. `enter = "deep"` is an optional non-visible hook; it does not automatically redirect or qualify as a visible default.

`sem.tiers("name", default: "tier-name")` overrides the page preset/default. Integer defaults use the original zero-based recipe index. Default priority is page override, preset default, then last visible recipe. Empty states and extraction states without a visible takeaway are pruned, except explicitly authored background-only states. Adjacent states with identical visibility and visible effects collapse. A removed default maps to the nearest earlier survivor, or the first survivor; a duplicate maps to its surviving alias. An extraction default produces a warning.

From the repository root:

```sh
./typst-to-pigeon.sh examples/semantic-tiers/semantic-tiers.typ --output ../tmp/_for_weiw-pigeon/work/semantic-tiers/demo --graph local --no-zip --force
# Override initial navigation mode:
./typst-to-pigeon.sh examples/semantic-tiers/semantic-tiers.typ --output ../tmp/_for_weiw-pigeon/work/semantic-tiers/demo-step --mode step --graph local --no-zip --force
```

See the [self-contained example](../../examples/semantic-tiers/README.md) and its [live checklist](../../examples/semantic-tiers/TEST-THIS-DECK.md).

## Presenting and exporting

Slide mode is the default: ordinary next/previous enters the next/previous page at its default tier. Step mode advances through tiers before crossing pages; forward page entry uses the first tier and backward entry uses the last. Shift+PageDown/PageUp or Shift-click Next/Previous swaps granularity: Step mode changes slides at their first tier; Slide mode changes tiers and clamps at boundaries. Comma/period always changes the current tier. N or the mode button toggles modes without changing the current page/tier. M remains Wand; D remains Diagram.

Arrows, PageDown/PageUp, Space/Shift+Space and toolbar controls follow the selected mode. In presentation mode, Navigate-tool left/right clicks advance/reverse; Shift swaps granularity. Drawing, typing, links, HUD interactions and panning retain their own behavior. Tier controls show the current state, default marker and boundaries; semantic debug boxes are a checkbox, not D. First/Last tier-control buttons go to the first/last slide; Home still fits the whole talk.

Explicit keyboard navigation, including comma/period, keeps the selected drawing tool and finishes any active ink stroke before changing the view. Diagram's own keys, text input and browser modifier shortcuts keep their existing ownership.

URLs use `?mode=step#12.3` for physical page 12, surviving tier 3 (both one-based). Missing tiers use the mode's entry state. Explicit URLs override restored view state. Normal navigation resets temporary tier adjustments; history and semantic detour return restore the saved state. Inserted boards remain single-state views.

Voice markers (`pigeon-sem.typ`) identify objects, while tier roles define presentation stages. Nest voice markers inside semantic wrappers; voice and Wand can emphasize only currently visible content and never advance tiers. The table, figure and takeaway targets in the example use the ordinary voice rules. Search and concept-graph evidence use the complete document, but jumps enter at the normal mode-dependent tier.

Overview thumbnails and PNG/PDF document exports use the complete source artwork plus annotations/boards. Tiers, extraction, rings and transient emphasis are presentation state and are not baked into exports. Ink coordinates remain fixed across tiers.

Different role filters, dim backing and page fills require extra Typst compilation and SVG assets. Shared variants are reused; expect build time and bundle size to grow with distinct filters. Keep existing Touying handout settings if you want one physical page per logical slide: Pigeon does not silently collapse Touying reveal pages or force handout mode. Avoid combining two independent reveal systems unintentionally.
