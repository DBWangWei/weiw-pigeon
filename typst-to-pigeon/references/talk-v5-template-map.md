# Template provenance

The reusable shell originated in the completed `talk-v5.typ` release:

- `assets/pigeon-template/index.html`, `styles.css`, `src/app.js` and `src/bootstrap.js`: canvas, overview, keyboard tools, sessions and direct-file startup.
- `src/title-effects.js`: original SVG title animation, with Text Type as default and five React Bits design adaptations.
- `scripts/wand_regions.py` and `scripts/slide_artwork.py` in the skill: object bounds, native page geometry, text matching and title layers. These are build tools, not runtime scripts.
- Template `prompts/concept-extraction.md` and `schemas/knowledge-graph.schema.json`: domain-independent model extraction and evidence contract.
- Template `public/icons/pigeon*.png` and skill `assets/pigeon-icon.png`: supplied Pigeon branding.
- Template `scripts/serve.py` and `Start Presentation.command`: portable loopback serving; the embedded bundle also supports opening `index.html` directly.

PDFs, slide SVGs, title layers, thumbnails, manifest, graph, embedded bundle, model cache, navigation JSON and ZIP are generated per source. No IPF demo or other talk-specific resource belongs in the template. Link such resources explicitly with the navigation `resources` map described in [input-contract.md](input-contract.md).

The generalized runtime retains direct-file loading, overview arrow focus, tool toggles, persistent laser, boards inserted after their source slide, deep zoom and wand targets. It now uses per-page geometry and manifest-driven PDF/resource paths. The original 960×540 fallback remains only for older manifests; the graph's own layout coordinates are independent of slide dimensions. Future changes should modify this template and exporter, then regenerate a deck, rather than editing generated assets alone.
