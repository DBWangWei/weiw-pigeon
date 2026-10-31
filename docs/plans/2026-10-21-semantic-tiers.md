# Semantic Tiers Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authored semantic reveals, configurable tier recipes, and Step/Slide navigation to Pigeon while retaining its canvas, voice, annotation, and portable presentation features.

**Architecture:** Extend the existing Typst exporter and classic-script player. Compile distinct visibility states with Typst, normalize their semantic metadata into the existing slide manifest, and use a pure navigation module to select states. Keep the original complete SVG/PDF as the canonical artwork for document exports.

**Tech Stack:** Typst 0.15-compatible helpers, Python 3.11+ and TOML, vanilla JavaScript classic scripts, SVG, the existing Python unittest and Node test suites.

---

## Status and scope

- Released in Pigeon 1.0.4 after merging `codex/semantic-tiers` into `main` via PR #1.
- Planning branch: `codex/semantic-tiers`, created from `main` at `3d6bfa6` (Pigeon 1.0.3).
- Draft specification: `/Users/weiwang/Code/tmp/_for_weiw-pigeon/semantic_feature-spec.md`.
- Temporary builds, renders, timing reports, and test outputs: `/Users/weiwang/Code/tmp/_for_weiw-pigeon/work/semantic-tiers/`.
- Approved implementation and runnable example are included in the Pigeon 1.0.4 release.

Deliver the semantic roles, named presets, slide defaults, both navigation modes, emphasis/dimming/extraction, semantic notes and deep links, HUD, URL state, validation, tests, documentation, and a runnable example. Existing Typst and PDF decks remain usable without semantic-tier annotations.

## 1. Adaptations to the draft

### Rendering choice

There are three plausible approaches:

| Approach | Benefit | Cost or limitation |
| --- | --- | --- |
| Full/base SVGs with rectangular full-image crops, as drafted | Two principal compilation passes; small authoring changes | A crop can include another hidden role. Nested wrappers can reveal children unintentionally and overlapping crops can repaint text. |
| **Compile distinct visibility states with Typst — recommended** | Preserves decorated boxes, source fonts, math, inline layout, and nesting; fits Pigeon's current SVG-per-page model | More compilation work and potentially more bundled SVGs. |
| Recreate semantic content as browser HTML | Flexible browser layout | Would require another typesetting/layout system and would lose source-rendered fidelity. |

Use compiled variants for visibility. Share a compile pass wherever the effective role filter is identical, and reuse the original full asset for full states. Do not compile once per slide per tier unnecessarily. Compile a dim-free backing variant where needed, then composite the visible dim regions at opacity 0.25, using a union mask to avoid repeated opacity in overlapping regions. Emphasis, pin rings, and takeaway extraction are browser decorations around the rendered artwork.

The first implementation task is a small rendering experiment with explicit acceptance checks. Record actual compile time and asset size before expanding the example; these figures are currently unknown.

### Existing architecture

- Extend `typst-to-pigeon/scripts/export_deck.py` and `typst_to_pigeon.py`; do not introduce the draft's separate `build.py`/player application.
- Retain `manifest.slides`, physical page identities, native SVG coordinates, `defaultRoute`, graph identity, and staged/atomic output replacement.
- Add a nested `tiers` configuration table and `manifest.tiers`, rather than generic top-level `default`, `preset`, and `mode` fields. The player already uses `state.mode` for its hierarchy/knowledge-graph overview; use a separate `tierMode`.
- Add a namespaced `pigeon-tiers.typ` authoring helper. Existing style files already define names such as `hook`, `takeaway`, and `note`, so importing new helpers with `*` would conflict.
- Keep `pigeon-sem.typ` and its voice targets compatible. Semantic roles describe presentation stages; voice target names describe objects to emphasize. They are related but separate data.
- Load new JavaScript as classic scripts through `src/bootstrap.js`, exposing a small `PigeonTiers` API. ES module imports would break Pigeon's supported direct `file://` opening.
- Keep PDF input as one full tier per physical page. Semantic tiers require authored Typst metadata in this feature.
- Keep the source's physical-page model. Do not silently force Touying handout mode or collapse existing reveal pages; document that authors should use their existing handout configuration to avoid combining two independent reveal systems.

### Default behavior

Use **Slide mode by default**, preserving Pigeon's current next/previous-slide behavior. Authors can select Step mode in TOML or with `--mode step`, and the presenter can toggle it in the player. Legacy manifests without tier data have one full state and retain current controls.

### Independent tiers and visual replacement

Tiers are independent presentation states, not cumulative reveals. Each recipe's `show` describes its complete role selection; it does not inherit the previous recipe's selection. For example, question-only → answer-only → figure-only → takeaway-only is valid, and going backward reconstructs the earlier state exactly.

Support covering/replacing earlier content with ordinary Typst placement and opaque shapes, controlled by semantic wrappers. Preserve Typst's source paint order; do not introduce an implicit browser stacking order based on the order in which tiers were visited. Authors can place alternative blocks in the same fixed region and select them in different tiers. The complete source/PDF still follows normal Typst paint order when all wrappers are visible.

Add an optional per-recipe `background = "#RRGGBB"` extension for changing the page fill. Authors opt in by using `sem.background(default: white)` as their page/theme fill; the exporter supplies the requested color to that helper for each compiled variant. Omitted `background` uses the source fill. Validate the color and require a detectable helper opt-in for an explicit override, so an opaque source page cannot silently ignore a CSS background change. Foreground colors remain authored Typst content.

Compile/cache keys and surviving-state signatures must include effective background and cover/replacement visibility, as well as the existing effects. Keep an intentional background-only tier even if it shows no semantic content. Verify expected whole-page pixel differences for background changes separately from layout/geometry invariance. The initial feature keeps fixed physical-page dimensions and reserved content layout; changing a tier does not reflow the page or move annotations.

## 2. Authoring and configuration contract

Create `typst-to-pigeon/assets/pigeon-tiers.typ` and use qualified imports:

```typst
#import "pigeon-tiers.typ" as sem
#import "shared/style.typ": *

#sem.tiers("result", default: "answer")
#sem.hook[What changes when we add regularization?]
#sem.answer[The estimate shrinks in unstable directions.]
#sem.detail[The derivation and assumptions go here.]
#sem.takeaway("stable-estimation")[
  #takeaway[Stability trades some bias for lower variance.]
]
```

Keep the draft's roles and signatures: `hook`, `cue`, `answer`, `detail`, `caveat`, `takeaway(id, body)`, `contrast(group, body)`, `support(body, to:)`, `note(body, public:)`, `deep(target, to:)`, and `tiers(preset?, default:)`. Add `background(default:)` for the explicitly opted-in page-fill extension described above. Support block and explicitly boxed single-line inline wrappers, and normalized figure subregions. Validate relative regions and reject unsupported multiline inline or page-spanning role boxes clearly.

Authoring invariants:

1. Normal Typst/PDF compilation shows the complete source by default.
2. Hidden content retains its layout through Typst `hide()`.
3. Unwrapped content stays visible in every tier.
4. A hidden parent hides its descendants. Showing a parent does not automatically show a child with a separately hidden role.
5. `region:` creates a marking-only region; it does not independently hide the underlying figure. The draft's nested `detail`/`support(region:)` example must work.
6. Assign stable per-page record identities and record wrapper ancestry. Physical query locations, rather than logical page counters, determine page mapping.
7. `tiers()` is per physical page; conflicting settings on one page are errors.
8. Helpers wrap the complete decorated body inside external alignment wrappers, following the existing voice-marker convention.
9. Role selections are independent between tiers. Removed content disappears even if an earlier tier displayed it; authored covers follow native Typst paint order.

Proposed TOML:

```toml
[tiers]
mode = "slide"
default_preset = "result"

[[tiers.presets.result]]
name = "question"
show = ["hook", "cue"]

[[tiers.presets.result]]
name = "answer"
show = ["hook", "cue", "answer"]

[[tiers.presets.result]]
name = "takeaway"
show = ["takeaway"]
fx = "extract"

[[tiers.presets.result]]
name = "full"
default = true
show = "*"
pin = "takeaway"
emph = ["support", "contrast"]
dim = ["detail"]

[[tiers.presets.flat]]
name = "full"
show = "*"
```

Also support `[pigeon.tiers]` with whole-table replacement, matching `[pigeon.voice]` precedence. Supply the above `result` and `flat` presets when the presets setting is omitted; an explicitly supplied presets table replaces that collection. `--mode step|slide` overrides the configured initial mode.

Validate unknown keys, exact types, supported roles/effects, optional background colors, nonempty recipes, unique tier names, at most one preset default, existing preset references, and valid per-slide defaults. Integer defaults refer to the original zero-based recipe-array index; an `enter` hook cannot be selected as a visible default. Accept only the documented `enter = "deep"` hook, exclude it from visible states, and retain deep navigation as an explicit presenter action rather than an automatic redirect.

Reject conflicting effect declarations such as the same role in `emph` and `dim`; treat `pin` as a ring on visible content rather than a command to reveal hidden content. Warn if an effective slide default is an extraction tier.

## 3. Manifest and tier resolution

Preserve the existing schema and add optional fields:

```text
manifest.tiers = { mode, defaultPreset, presets }
slide.semanticTiers = {
  preset, defaultTier,
  roles, notes, deep,
  candidates
}
```

Each role has a stable UID, optional author ID/group, role, ancestry, hide flag, text, and bounds converted into the slide's native SVG units. Each candidate refers to its original recipe index, effective visible/style sets, and compiled artwork assets/hashes. Keep `slide.asset` as the original complete slide. Candidate assets may also carry matching title-layer assets and a backing asset for dimming.

Export enough resolved candidate information that JavaScript can deduplicate and navigate without reimplementing Typst layout. The pure `states()`, `defaultIndex()`, `entry()`, and `step()` API implements these rules:

- Prune empty reveal states and extraction states without a visible takeaway, while retaining explicitly authored background-only states.
- A page without revealable roles or explicit background changes has exactly one full state.
- Deduplicate adjacent states only when visibility **and** all visible effects match, including `pin`, `emph`, `dim`, extraction, and background. Preserve recipe-to-survivor aliases. Visibility sets may shrink or be disjoint.
- Resolve defaults in this order: slide override, preset default, last visible recipe.
- A pruned default maps to the nearest earlier surviving recipe, or the first survivor if none precedes it. A duplicate default maps to its surviving alias.
- Leaving a slide discards its temporary tier adjustment; returning through normal navigation uses its mode-dependent entry. Explicit history/detour return restores the saved tier.
- The revision hash covers tier configuration, records, and variant artwork before graph generation, so graph/session identity cannot remain stale after a semantic-only change.

Private/public semantic notes remain metadata, not visible slide artwork. Preserve their distinction; only public notes participate in audience reading/search views. If Touying `<pdfpc-file>` notes are present, normalize and merge them without a mandatory Touying dependency. A note marked private is not a security boundary in a distributed presentation folder; document that distinction in the authoring reference.

Resolve deep destinations from physical query locations to final slide IDs, validate them, and retain optional `to` associations. Multiple destinations are selectable in a compact UI; Enter follows the first applicable destination.

## 4. Navigation and controls

Keep the draft's state transitions:

| Action | Step mode | Slide mode |
| --- | --- | --- |
| Next | Next surviving tier, then next slide at its first tier | Next slide at its default tier |
| Previous | Previous tier, then previous slide at its last tier | Previous slide at its default tier |
| Shifted next | Next slide at its first tier | Next tier on this slide; clamp at end |
| Shifted previous | Previous slide at its first tier | Previous tier on this slide; clamp at start |
| Explicit tier next/previous | Stay on this slide and clamp | Stay on this slide and clamp |
| Toggle mode | Preserve page and tier | Preserve page and tier |

Adapt the bindings to Pigeon's current controls:

| Input | Proposed binding |
| --- | --- |
| Right/Left, PageDown/PageUp, toolbar Next/Previous | Mode-dependent next/previous |
| Space / Shift+Space | Existing forward/back convention, routed through tier navigation; retain Space-drag panning |
| Shift+PageDown/PageUp; Shift-click on Next/Previous | Shifted next/previous |
| `.` / `,` | Explicit next/previous tier |
| `N`; mode button | Toggle Step/Slide; leave `M` as Wand and Shift+M as voice mute |
| Active-slide left/right click in presentation mode with Navigate selected | Next/previous; Shift swaps granularity |
| First/Last buttons in tier controls | First/last slide at its entry tier; keep Home as Fit whole talk |
| Enter, when the stage owns focus and Navigate is selected | Follow a semantic deep link |
| `R`; existing Resume control | Return from the latest semantic detour, then resume the existing route detour as applicable |
| Tier debug checkbox | Semantic boxes; leave `D` as Diagram and Shift+D as voice debug |

Retain click-to-select behavior on other frames and ordinary canvas browsing. Suppress the context menu only for the presentation navigation gesture. Drawing/Diagram tools, links, HUD controls, typing, IME composition, browser modifier shortcuts, and dragged/panned gestures must not trigger tier navigation.

The pure navigation module uses route positions and receives board entries from a thin app adapter; it has no DOM access. Inserted boards remain single-state views in their existing positions. Record mode/tier in history, detour trail, and session payloads, with optional defaults when importing old schema-v2 sessions. Guard late voice/render callbacks with a presentation-context generation that changes on tier transitions as well as slide transitions.

Use conventional URL state, e.g. `index.html?mode=slide#12.3`, where page and tier are 1-based physical-page/surviving-tier numbers. A missing tier uses the selected mode's entry tier. An explicit URL overrides restored view state; mode-only URLs override just the mode. Validate/clamp malformed or outdated references without breaking startup. Keep parsed URL state separate from custom route order; replace history on state changes and handle explicit hash navigation.

## 5. Rendering and integration behavior

- Display the selected compiled variant at the original frame size; tier changes never move ink or board coordinates.
- Add a compact mode label, surviving-tier buttons/dots, marked default tier, page count, and applicable deep/back controls. Boundary feedback lasts 300 ms and is also available as text/ARIA status.
- Fade same-slide tier changes; enter a different slide directly at its resolved entry tier. Respect reduced motion and cancel stale image/animation requests during rapid navigation.
- Render `emph`/`pin` rings and dimming from the active candidate. Extract one or more visible takeaways into a centered, fitted group and dim the underlying slide to 0.12. Use current-tier artwork for crops and original glyphs, including math.
- Generate/select title layers for the active variant. Never swap back to the full-slide title backing while hidden answers are present.
- Transition snapshots must capture the active tier composition, not the original full asset.
- Voice and Wand may act only on content visible in the current tier. Associate voice markers with semantic ancestry; use conservative containment checks for legacy geometric Wand regions. Report hidden/no-visible targets in diagnostics. These actions emphasize content without advancing tiers.
- Keep full-text search/knowledge-graph evidence based on the complete document. A search/deep-link jump enters at the normal mode-dependent tier; the audience is not implicitly shown a hidden answer.
- Preserve current PNG/PDF export semantics: complete source slide plus annotations, all boards as today. Tier reveals, extraction, and rings are presentation state and are not baked into document exports. Label/document that behavior.
- Keep original full thumbnails in overview. Verify both HTTP and direct-file bundles include every referenced variant/backing/title asset and reject stale or missing assets clearly.

## 6. Implementation tasks

### Task 1: Prove the Typst rendering contract

**Files:**
- Create: `typst-to-pigeon/assets/pigeon-tiers.typ`
- Create: `typst-to-pigeon/tests/fixtures/semantic-tiers.typ`
- Create: `typst-to-pigeon/tests/fixtures/semantic-tiers-touying.typ`
- Create: `typst-to-pigeon/tests/test_semantic_tiers.py`

Add a failing integration check, implement the smallest helper, then compile full and filtered variants. Test centered/right-aligned blocks, inline sentence/math, decorated tables/figures, nested roles, the nested marking-only region, shrinking/disjoint role selections, same-region alternatives, opaque covers, changed page backgrounds, mixed page dimensions, and blank/unwrapped pages. Compare physical page counts, page sizes, role identities/geometry, and pixel differences outside changed-role bounds (allowing explicit background changes over the whole page). Verify the full default looks identical to equivalent unwrapped source. Reject page-spanning and invalid boxes clearly. Record compile time and bytes under the task working directory.

**Checkpoint:** Correct visibility and unchanged geometry, including no nested-answer leakage. Resolve any rendering-contract failure before extending the runtime.

### Task 2: Normalize configuration and semantic records

**Files:**
- Create: `typst-to-pigeon/scripts/tier_config.py`
- Create: `typst-to-pigeon/scripts/tier_records.py`
- Modify: `typst-to-pigeon/scripts/typst_to_pigeon.py`
- Modify: `typst-to-pigeon/assets/pigeon-sem.typ`
- Create: `typst-to-pigeon/tests/test_tier_config.py`
- Extend: `typst-to-pigeon/tests/test_semantic_tiers.py`
- Extend: `typst-to-pigeon/tests/test_config.py`
- Extend: `typst-to-pigeon/tests/test_semantic_regions.py`

Write focused tests for precedence, invalid recipes/defaults, physical locations, bounds, ancestry, notes/deep records, and no-tier compatibility. Implement strict normalization and `--mode`; preserve validation of overridden tables before creating output. Extend voice markers with optional tier ancestry while retaining the old marker format.

**Checkpoint:** Invalid source/config yields actionable errors and leaves an existing generated deck intact.

### Task 3: Build variant assets and extend packaging

**Files:**
- Create: `typst-to-pigeon/scripts/tier_artwork.py`
- Modify: `typst-to-pigeon/scripts/export_deck.py`
- Modify: `typst-to-pigeon/scripts/typst_to_pigeon.py`
- Modify: `typst-to-pigeon/scripts/build-file-bundle.mjs`
- Extend: `typst-to-pigeon/tests/test_pipeline.py`
- Extend: `typst-to-pigeon/tests/test_semantic_tiers.py`

Plan compile passes from effective role sets and backgrounds, retain selected per-page SVGs, generate backing/title assets, query/check full and variant geometry, and add normalized candidates to each slide. Include hashes/configuration in revision calculation before graph generation. Test complete file bundles/ZIPs, shared asset reuse, unchanged PDF inputs, and failed replacement recovery.

**Checkpoint:** A generated presentation contains all candidate assets with matching geometry and consistent deck/graph revision.

### Task 4: Implement the pure tier state machine

**Files:**
- Create: `typst-to-pigeon/assets/pigeon-template/src/semantic-tiers.js`
- Create: `typst-to-pigeon/tests/semantic-tiers.test.mjs`

Expose pure state enumeration, default/entry resolution, immutable navigation, and URL parsing/serialization. Test all actions in both modes, adjacent aliases, empty/extract pruning, effect/background-sensitive deduplication, noncumulative visibility, string/integer defaults, boundary no-ops, reordered routes, boards, nested detours, and exact return positions. Include a page with no semantic roles, an intentional background-only state, and a default pointing to a skipped recipe.

**Checkpoint:** Navigation is correct independently of DOM and rendering.

### Task 5: Integrate the player and HUD

**Files:**
- Create: `typst-to-pigeon/assets/pigeon-template/src/tier-renderer.js`
- Modify: `typst-to-pigeon/assets/pigeon-template/src/bootstrap.js`
- Modify: `typst-to-pigeon/assets/pigeon-template/src/app.js`
- Modify: `typst-to-pigeon/assets/pigeon-template/index.html`
- Modify: `typst-to-pigeon/assets/pigeon-template/styles.css`
- Modify: `typst-to-pigeon/tests/runtime-harness.mjs`
- Create: `typst-to-pigeon/tests/runtime-tiers.test.mjs`
- Create: `typst-to-pigeon/tests/tier-rendering.test.mjs`

Connect existing navigation entry points through the tier adapter; render variants/effects, update HUD and URL, and extend history/session restoration. Implement the control table above. Test rapid navigation, asset failure, input ownership, mode switches, drawing alignment, board ordering, direct-file startup, explicit URLs versus stored sessions, and reduced motion.

**Checkpoint:** Tier changes alter only the intended presentation content and retain working tools/route navigation.

### Task 6: Verify voice, Wand, transitions, and export integration

**Files:**
- Modify: `typst-to-pigeon/assets/pigeon-template/src/voice.js`
- Modify: `typst-to-pigeon/assets/pigeon-template/src/voice-diagnostics.js`
- Modify as needed: `typst-to-pigeon/assets/pigeon-template/src/slide-transitions.js`
- Extend: `typst-to-pigeon/tests/runtime-voice.test.mjs`
- Extend: `typst-to-pigeon/tests/runtime-wand.test.mjs`
- Extend: `typst-to-pigeon/tests/runtime-export-pdf.test.mjs`
- Extend: `typst-to-pigeon/tests/runtime-tiers.test.mjs`

Test that hidden answers cannot appear through voice crops, Wand crops, title animation, or outgoing transition snapshots. Invalidate stale recognition actions across tier changes; dismiss emphasis for departing tiers. Verify complete-slide PNG/PDF export and unchanged annotation/session data. Use synthetic recognizer events for automated tests; live microphone behavior is a separate manual check.

**Checkpoint:** Existing 1.0.3 features still work on old decks and tier-aware decks.

### Task 7: Add the example and documentation

**Files:**
- Create: `examples/semantic-tiers/README.md`
- Create: `examples/semantic-tiers/semantic-tiers.typ`
- Create: `examples/semantic-tiers/semantic-tiers.pdf`
- Create: `examples/semantic-tiers/pigeon.toml`
- Create: `examples/semantic-tiers/TEST-THIS-DECK.md`
- Copy maintained helpers into the self-contained example as needed.
- Create: `typst-to-pigeon/references/semantic-tiers.md`
- Modify: `README.md`, `HowToRun.md`, `ToAdaptToUseVoice.md`
- Modify: `typst-to-pigeon/SKILL.md`
- Modify: `typst-to-pigeon/references/config.md`
- Modify: `typst-to-pigeon/references/pigeon.example.toml`
- Modify: `typst-to-pigeon/references/input-contract.md`
- Modify: `typst-to-pigeon/references/runtime.md`
- Modify: `typst-to-pigeon/references/qa-checklist.md`

Create a compact, self-contained demonstration with questions/answers, a decorated table, figure subregions, support/detail/caveat roles, multiple takeaways, noncumulative replacement/cover states, a changed background, per-slide defaults, a flat page, and a deep/back detour. Include both modes and voice targets. Build its runnable presentation under the requested temporary working directory for user testing. Do not alter the existing Week 5 voice example or the original Dropbox source as part of this feature.

Document the namespaced authoring pattern, exact commands, defaults/pruning, controls, export behavior, performance trade-off, and how tiers relate to voice markers and Touying handout mode. Check Markdown links and compare helper copies with the maintained assets.

## 7. Validation commands and acceptance

Run new tests first, then appropriate existing regressions. From the repository root, create test outputs only under the requested work directory (set `TMPDIR` there for commands using temporary files):

```sh
mkdir -p ../tmp/_for_weiw-pigeon/work/semantic-tiers/tmp

TMPDIR="$PWD/../tmp/_for_weiw-pigeon/work/semantic-tiers/tmp" \
  python3 -m unittest discover -s typst-to-pigeon/tests -p 'test_*tier*.py'

node --test typst-to-pigeon/tests/semantic-tiers.test.mjs

./typst-to-pigeon.sh examples/semantic-tiers/semantic-tiers.typ \
  --output ../tmp/_for_weiw-pigeon/work/semantic-tiers/demo \
  --graph local --no-zip --force

TMPDIR="$PWD/../tmp/_for_weiw-pigeon/work/semantic-tiers/tmp" \
  python3 -m unittest discover -s typst-to-pigeon/tests -p 'test_*.py'

git diff --check
```

Use the existing test Python environment with PyMuPDF where needed, or install the documented test dependencies into a task-local environment. Do not assume prior `/private/tmp` environments still exist.

Build a fresh copy of `tests/fixtures/geometry.typ` for ordinary runtime regressions and a separate PDF fixture for `runtime-pdf.test.mjs`; the suites expect different page counts/IDs. Run tier-specific integration tests against their own newly built fixture via `PIGEON_FIXTURE_ROOT`. Use `PIGEON_TEST_DEPS`/`PIGEON_CANVAS_DEPS` for the available Happy DOM/canvas dependencies and `PIGEON_PYTHON` for the test interpreter. Include the existing voice, drawing, fullscreen, backtick, Wand, diagram, and PDF export suites.

Acceptance requires:

1. Full/variant page count, geometry, nested visibility, and targeted raster checks pass.
2. Both navigation modes, defaults, aliases, URLs, boards, and exact detour return pass pure and runtime tests.
3. Invalid recipes and broken metadata fail clearly; failed builds preserve previous output.
4. Old Typst/PDF decks keep their current behavior.
5. Voice/Wand/transition/title paths cannot expose content hidden in the current tier.
6. HTTP and file bundles contain all assets; complete-slide exports remain correct.
7. The example has documented live checks for both modes, source-rendered appearance, drawing alignment, and voice on visible/hidden targets.

Automated DOM tests and raster checks establish their respective boundaries; report live browser/manual results separately. Final delivery should include the example's exact launch command, test totals, compile/size observations, and any remaining limitation.

## 8. Deferred work

Keep manual Touying-subslide playback, phone control, minimap, support-to-takeaway connectors, semantic LLM linting, automatically rewriting existing teaching sources, and automatic semantic extraction from PDFs out of this feature.
