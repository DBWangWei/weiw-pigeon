# Pigeon runtime reference

The template is a self-contained classic-script web app so that `index.html` works from `file://` as well as through the local Python server. SVG pages stay sharp when zoomed; raster content remains limited by the source image.

Core controls are:

| Keys | Behavior |
| --- | --- |
| Right / PageDown / Space; Left / PageUp / Shift+Space | Follow the route while retaining the selected tool |
| O; T in overview | Open overview; switch hierarchy/knowledge graph |
| Arrow keys / Tab / Enter | Select and open overview items |
| `/` or Cmd/Ctrl+K; `G` | Search; jump by source/physical slide label |
| `R`; `F`; `B` | Resume a detoured route; presentation mode; blackout |
| `V`; `L`; `P`; `H`; `E`; `M` | Navigation; laser; pen; highlighter; eraser; magic wand |
| `T` outside Overview/Diagram | Toggle Text; click a slide or board to place a label |
| Backtick (in Pen mode) | Single tap toggles Pen down after a 300 ms double-tap window |
| Double backtick (Pen or Diagram mode) | Undo the last stroke/object/edit without changing tool or Pen down state |
| Backtick (with a wand object lit) | Cycle Pop-out → Focus → Spotlight → Pop-out; Escape dismisses emphasis |
| `1`–`4` | Red, blue, dark green, yellow |
| `W`; Shift+W; `K` | Insert whiteboard; insert blackboard; keep current board |
| `+` / `-`; `0`; `Home` | Zoom; fit slide; fit whole talk |
| `?`; Escape | Open help; dismiss the open dialog before other actions |

Repeating a tool key turns that tool off; another tool key switches tools. The selected tool remains active while slide navigation advances. The laser dot stays visible while laser mode is selected. Magic wand targets include text, rendered images, connected bordered tables and recognized takeaways; takeaway regions receive the strongest spotlight. In presentation mode the wand keeps the pointer visible. Escape dismisses dialogs first. In native fullscreen Pigeon requests an Escape-only Keyboard Lock where supported and permitted, so the first press closes Help and a later press can leave fullscreen. Holding Escape retains the browser's emergency exit. Safari/Firefox and browsers that deny the lock may still exit native fullscreen; Pigeon keeps its presentation layout. Press `?` again or use Close to dismiss Help without invoking the browser's Escape behavior.

**Text** is an annotation tool independent of Diagram mode. New labels use 20 pt Arial Italic, left/top alignment, transparent fill and the active annotation color (initially red). The toolbar swatches and `1`–`4` change the color before typing; numbers entered in the editor remain text. Finish with Escape, Cmd/Ctrl+Enter or blur. Click another position for a new label or an existing text label to edit it. Empty drafts are discarded; creating a label is one undo step. Font and color survive sessions and SVG/PNG/PDF rendering. Text stays selected across slide/board navigation. `T` retains its existing Overview and Diagram meanings.

**Pen down mode** and Diagram mode show compact notices at the top right in normal and presentation layouts. A single backtick (or Escape after closing overlays) lifts the pen and keeps Pen selected. Slide/board navigation retains the setting and finishes the previous stroke. Leaving a canvas, zooming, changing colors, undoing, holding Space to pan, or opening a dialog finishes the stroke; subsequent movement starts a new one. Switching tools, repeating P to turn Pen off, or losing window/tab focus disables the mode. It is never saved in sessions.

The **Title effect** selector offers Text Type (default), None, Split Text, Blur Text, Shiny Text and Gradient Text. The choice is saved per deck in browser storage. `title_effect` in `pigeon.toml` sets the initial release choice and `--title-effect NAME` overrides it; an already-saved browser preference takes precedence. None uses the untouched original slide SVG. Other choices swap to the body SVG plus an inline title glyph layer only after both are ready. Title fonts, line breaks and positions come from the original Typst/PDF artwork, not browser typesetting. Effects replay on entering a slide; Shiny and Gradient repeat while it is active. Reduced-motion preference suppresses animation. Boards and unmatched titles stay static. PNG exports use the original complete slide artwork.

Pigeon is version **1.0.4**. Open **About** in the top bar, or choose **About Pigeon** at the bottom of the `?` keyboard guide, for the icon, author and collaboration contact.

Diagram mode is entered with `D`. Within it, Pigeon follows Excalidraw’s familiar `V/1`, `R/2`, `D/3`, `O/4`, `A/5`, `L/6`, `T/8`, `H`, `S`, `G`, `Cmd/Ctrl+C/V/X/D`, arrow movement, Delete, Tab, Enter and Escape conventions. `Shift+T` adds a triangle and `Shift+P` a parallelogram. Drawing tools stay active for repeated placement; use `V` to select and move objects. Enter edits the selected object's text, and double-click edits an existing shape without adding another. Shapes default to centered labels; free text starts at the top-left. Horizontal (Left/Center/Right) and Vertical (Top/Middle/Bottom) controls apply to selected objects and carry forward to subsequent objects of the same category (free text or shape labels). Alignment survives undo, copying, session import/export and PNG/PDF export. New diagrams default to blue strokes and yellow fills, with solid or transparent fill, stroke/fill color palettes, selection handles, resize knobs, and connector endpoints that bind to shapes and follow their movement. Display labels use SVG text rather than canvas pixels so zoom does not enlarge a fixed text bitmap; PNG/PDF exports use the same layout. Diagram operations are stored in the same slide/board session surfaces as ink. `D` is reserved for diagram mode only while that mode is active; `PageUp/PageDown` still navigate slides.

These are independent SVG adaptations of five React Bits designs, not the entire React Bits catalog or the upstream React components. Split and Blur stagger glyphs, Text Type reveals them once, Shiny sweeps a highlight, and Gradient moves colors through a title mask. The title and transition effects need no React or remote scripts. See `THIRD_PARTY_NOTICES.txt`.

The default slide transition is the original **Camera** movement: **0.38 seconds**, `cubic-bezier(.2,.8,.2,1)`. The generated runtime also offers None, Fade, Blur, Slide, Zoom, Pixel, Staggered Wipe and Stack. The build-time default can be set with `slide_transition` in `pigeon.toml` or overridden with `--slide-transition NAME`; the in-app Transition selector changes the current viewing session. Reduced motion disables these effects. Each transition snapshots only the outgoing artwork and ink, so the destination slide remains the live, interactive page.

`embedded-deck.js` contains the manifest, graph, original SVGs, title layers, PDF and explicitly mapped resources for direct-file opening. Storage is namespaced by deck ID and revision so unrelated annotations are not silently applied. The manifest controls PDF/resource paths; no original talk filename or demo is required.

**PDF export:** the **Export PDF** button beside **Present** preserves the
original PDF pages and adds transparent PNG ink overlays (3×, maximum 4096 pixels
per side). It exports every slide and all inserted white/black boards in deck
order, including drafts and empty boards; removed boards are omitted. Overlays
respect page crops, rotations and mixed dimensions. Board pages match their
parent's displayed dimensions. The export snapshots the current work and does
not change the source PDF, selected tool or current slide. `src/pdf-export.js`
loads the bundled `src/vendor/pdf-lib.min.js` only on demand, with its MIT license
included. Everything works offline; keep the complete generated folder together.

Magic-wand Pop-out and Spotlight use the same opaque white backing as the slide
frame, under the original cropped SVG. This prevents transparent PDF text from
overlapping its original position during enlargement, while preserving explicit
background artwork. Ordinary targets start at Pop-out; takeaways start at Spotlight.
Backtick cycles through Pop-out, Focus and Spotlight. Focus covers the whole canvas
with midnight navy, subtle blue corner gradients, a raised navy panel and a thin
warm-yellow border with a restrained glow. It enlarges the source crop to fit the
viewport. `src/wand-effects.js` conservatively isolates text on uniform paper and
recolors its pixels off-white, preserving glyph geometry and equations. Images,
tables and uncertain text keep the original SVG with opaque backing. Canvas/decode
failure safely retains that original artwork. No remote service or font is needed.

Focus and Spotlight reached by cycling keep the selected target fixed, including
when the pointer leaves the canvas. Returning to Pop-out resumes hover selection.
Escape dismisses the effect while keeping Wand selected. Navigation, zoom/pan,
overview, dialogs, blackout and tool changes clear it. Held keys, modified
backticks and typing do not cycle. Reduced motion disables animations. These
effects are transient and excluded from annotations, sessions and exports.


## Voice and semantic emphasis

`src/voice.js` is a classic script loaded before `app.js`. `manifest.voice`
contains normalized runtime settings; per-slide `semanticRegions` contain exact
marked Typst bounds, independently of heuristic Wand targets. The app supplies
the active slide, asset resolver, camera scale, and dispatch context. Recognition
requires an explicit gesture. `src/voice-local.js` adapts local Whisper to the
same recognition event interface; its AudioWorklet downmixes/resamples the
selected input to mono PCM16 at 16 kHz. Silence gates utterances; a pause of
0.7 seconds ends one, and sustained speech splits at 8 seconds. At most two
segments wait behind the current request; overload is visible. The server
validates same-origin requests and bounded bodies, keeps one native decoder/model
loaded, and passes audio/text through anonymous pipes. Aborting cancels browser
capture/requests and discards late replies; an inference already running on the
server may finish. No recordings or transcript files are written. The optional
`browser` backend still requires `processLocally = true`. Voice status, words,
log, choices, debug bounds and crop overlays stay outside the saved session and
export paths. See [voice.md](voice.md) for setup and failure behavior.

`src/voice-diagnostics.js` loads before the voice runtime. It displays microphone
input tests, recognition events/text, matcher decisions, resolver outcomes and
artwork loading without changing session/export data. Input tests require their
own click, run separately from recognition, and close tracks/audio contexts on
Stop, cancellation, page exit, destruction or the 15-second limit. Typed phrase
tests call the production matcher and resolver with an explicit test source.

### Live Q&A

With `[qa] enabled = true`, say “take questions now” or “take any questions now”
after repeating an audience question. Final recognition segments are accumulated
in memory until the next trigger or `Q`; the configured `_qa` semantic region
shows the live list. Finishing an item sends its bounded transcript to the
same-origin `/api/qa/organize` endpoint, which uses the configured fast
OpenAI-compatible Responses model and falls back to the raw transcript when the
organizer is unavailable. `Q` inserts or refreshes a white `Q&A` board whose
diagram text is included in session and PDF export paths.

## Semantic-tier navigation

Slide mode enters pages at their default tiers; Step mode traverses tiers before crossing pages. N toggles without moving; comma/period always changes the current tier. Shift+PageDown/PageUp and Shift-click Next/Previous swap granularity. Enter follows a semantic detour and R restores its saved page/tier. URLs use `?mode=step#12.3` (one-based physical page/surviving tier). Boards remain single-state; Home remains Fit whole talk. The HUD exposes tier/default/deep/back controls and a semantic-debug checkbox. Drawing/typing/panning retain their normal behavior. Voice and Wand only target current-tier visible content. Complete-source exports and thumbnails do not bake in tier effects. See [semantic-tiers.md](semantic-tiers.md) for the full transition contract.
