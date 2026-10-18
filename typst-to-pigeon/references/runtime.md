# Pigeon runtime reference

The template is a dependency-free classic-script web app so that `index.html` works from `file://` as well as through the local Python server. SVG pages stay sharp when zoomed; raster content remains limited by the source image.

Core controls are:

| Keys | Behavior |
| --- | --- |
| Right / PageDown / Space; Left / PageUp / Shift+Space | Follow the route while retaining the selected tool |
| O; T in overview | Open overview; switch hierarchy/knowledge graph |
| Arrow keys / Tab / Enter | Select and open overview items |
| `/` or Cmd/Ctrl+K; `G` | Search; jump by source/physical slide label |
| `R`; `F`; `B` | Resume a detoured route; presentation mode; blackout |
| `V`; `L`; `P`; `H`; `E`; `M` | Navigation; laser; pen; highlighter; eraser; magic wand |
| Backtick (in Pen mode) | Toggle Pen down mode; move to draw without holding a button |
| `1`–`4` | Red, blue, dark green, yellow |
| `W`; Shift+W; `K` | Insert whiteboard; insert blackboard; keep current board |
| `+` / `-`; `0`; `Home` | Zoom; fit slide; fit whole talk |
| `?`; Escape | Open help; dismiss the open dialog before other actions |

Repeating a tool key turns that tool off; another tool key switches tools. The selected tool remains active while slide navigation advances. The laser dot stays visible while laser mode is selected. Magic wand targets include text, rendered images, connected bordered tables and recognized takeaways; takeaway regions receive the strongest spotlight. In presentation mode the wand keeps the pointer visible. Escape dismisses dialogs first. In native fullscreen Pigeon requests an Escape-only Keyboard Lock where supported and permitted, so the first press closes Help and a later press can leave fullscreen. Holding Escape retains the browser's emergency exit. Safari/Firefox and browsers that deny the lock may still exit native fullscreen; Pigeon keeps its presentation layout. Press `?` again or use Close to dismiss Help without invoking the browser's Escape behavior.

**Pen down mode** shows a prominent overlay in normal and presentation layouts. Backtick again (or Escape after closing overlays) lifts the pen and keeps Pen selected. Slide/board navigation retains the setting and finishes the previous stroke. Leaving a canvas, zooming, changing colors, undoing, holding Space to pan, or opening a dialog finishes the stroke; subsequent movement starts a new one. Switching tools, repeating P to turn Pen off, or losing window/tab focus disables the mode. It is never saved in sessions.

The **Title effect** selector offers Text Type (default), None, Split Text, Blur Text, Shiny Text and Gradient Text. The choice is saved per deck in browser storage. `title_effect` in `pigeon.toml` sets the initial release choice and `--title-effect NAME` overrides it; an already-saved browser preference takes precedence. None uses the untouched original slide SVG. Other choices swap to the body SVG plus an inline title glyph layer only after both are ready. Title fonts, line breaks and positions come from the original Typst/PDF artwork, not browser typesetting. Effects replay on entering a slide; Shiny and Gradient repeat while it is active. Reduced-motion preference suppresses animation. Boards and unmatched titles stay static. PNG exports use the original complete slide artwork.

Pigeon is version **1.0.2**. Open **About** in the top bar, or choose **About Pigeon** at the bottom of the `?` keyboard guide, for the icon, author and collaboration contact.

Diagram mode is entered with `D`. Within it, Pigeon follows Excalidraw’s familiar `V/1`, `R/2`, `D/3`, `O/4`, `A/5`, `L/6`, `T/8`, `H`, `S`, `G`, `Cmd/Ctrl+C/V/X/D`, arrow movement, Delete, Tab, Enter and Escape conventions. `Shift+T` adds a triangle and `Shift+P` a parallelogram. Shapes have centered editable text, solid or transparent fill, stroke/fill color palettes, selection handles, resize knobs, and connector endpoints that bind to shapes and follow their movement. Diagram operations are stored as diagram ink in the same slide/board session surfaces, so undo, import/export and PNG export include them. `D` is reserved for diagram mode only while that mode is active; `PageUp/PageDown` still navigate slides.

These are independent SVG adaptations of five React Bits designs, not the entire React Bits catalog or the upstream React components. Split and Blur stagger glyphs, Text Type reveals them once, Shiny sweeps a highlight, and Gradient moves colors through a title mask. No React, remote scripts or runtime dependencies are needed. See `THIRD_PARTY_NOTICES.txt`.

The default slide transition is the original **Camera** movement: **0.38 seconds**, `cubic-bezier(.2,.8,.2,1)`. The generated runtime also offers None, Fade, Blur, Slide, Zoom, Pixel, Staggered Wipe and Stack. The build-time default can be set with `slide_transition` in `pigeon.toml` or overridden with `--slide-transition NAME`; the in-app Transition selector changes the current viewing session. Reduced motion disables these effects. Each transition snapshots only the outgoing artwork and ink, so the destination slide remains the live, interactive page.

`embedded-deck.js` contains the manifest, graph, original SVGs, title layers, PDF and explicitly mapped resources for direct-file opening. Storage is namespaced by deck ID and revision so unrelated annotations are not silently applied. The manifest controls PDF/resource paths; no original talk filename or demo is required.
