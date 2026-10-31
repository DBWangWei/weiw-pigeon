# Live rehearsal checklist

These checks require a person in a browser; they are not claimed by compilation or DOM tests.

- Open the generated `index.html` directly, then through its `scripts/serve.py` server. Confirm every tier asset loads on both paths.
- In Slide mode, page 1 enters at answer-only. Press comma: the question replaces the answer. Press period: it disappears again. Returning normally restores the configured default.
- Press N for Step mode. Next traverses surviving tiers, then the next page; Previous crosses to the previous page's last tier. Shift+PageDown changes slides at their first tier. In Slide mode it changes only the tier. Comma/period clamp on the current page.
- Page 2: compare table position across question/table/full states. The caveat stays visible with the table; the full state's detail is dimmed. Use Shift+T or the configured “this table” phrase: only a visible table can be selected.
- Page 3: the detail parent hides the complete figure in takeaway-only state. Evidence state shows the figure and emphasizes its right support region. “This figure” must not reveal a hidden figure.
- Page 4: extraction shows both takeaways without retypesetting glyphs. “Key messages” or Shift+K selects only visible targets. Enter follows the derivation detour to page 6; R returns to page 4 at the exact saved tier.
- Page 5: initial and correction cards occupy the same position. The correction is opaque. Warm/background-only states visibly change the entire page fill; no hidden prior card leaks through. The complete PDF shows normal source paint order.
- Page 6 has one flat state. Confirm private notes are absent from audience reading views and public notes remain distinguishable; do not treat private notes as confidential files.
- Draw a mark beside a table cell, change tiers and return: ink stays aligned. Try pen, diagram, Space-drag, links and text input; none should accidentally trigger tier navigation.
- Set a page/tier URL, reload, then toggle modes. Confirm page/tier and default marker, deep/back controls and reduced-motion behavior. Try rapid navigation; old titles or voice highlights must not appear over a new state.
- Overview thumbnails, PNG and annotated PDF exports show complete source artwork with annotations/boards, without baking in extraction or rings. Compare the source PDF and exported page geometry.
