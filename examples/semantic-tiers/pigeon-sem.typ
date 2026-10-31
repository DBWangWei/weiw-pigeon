// Explicit, invisible bounds for Pigeon's semantic voice targets.
// Wrap the complete decorated body INSIDE alignment wrappers. The body must
// fit on one physical page; use separate markers for separate pages.
// `--input pigeon-sem=off` returns the unwrapped body for layout comparisons.

#let pigeon-hidden-depth = state("pigeon-sem-hidden-depth", 0)

// Unlike plain hide(), this also tells semantic markers that the artwork is
// absent on this reveal page. Nested calls are supported.
#let pigeon-hidden(body) = {
  pigeon-hidden-depth.update(n => n + 1)
  hide(body)
  pigeon-hidden-depth.update(n => n - 1)
}

#let pigeon-sem(target, body, id: none, visible: true) = {
  assert(type(target) == str and target.trim() != "", message: "pigeon-sem target must be a nonempty string")
  assert(id == none or (type(id) == str and id.trim() != ""), message: "pigeon-sem id must be a nonempty string or none")
  assert(type(visible) == bool, message: "pigeon-sem visible must be a boolean")
  if sys.inputs.at("pigeon-sem", default: "on") == "off" {
    body
  } else {
    layout(avail => {
      let size = measure(body, width: avail.width)
      block(width: size.width, height: size.height, breakable: false, above: 0pt, below: 0pt, {
        place(top + left, context {
          let p = here().position()
          [#metadata((
            id: id, target: target,
            x: p.x.pt(), y: p.y.pt(),
            width: size.width.pt(), height: size.height.pt(),
            visible: visible and pigeon-hidden-depth.get() == 0,
            tierAncestry: state("pigeon-tier-ancestry", ()).get(),
          )) <pigeon-sem>]
        })
        // Keep the original available width when rendering. Rendering in the
        // measured width would resolve percentage widths a second time.
        // Preserve inherited horizontal alignment, including table-cell
        // alignment, while aligning this original-width frame to the bounds.
        place(top + align.alignment.x, block(width: avail.width, above: 0pt, below: 0pt, body))
      })
    })
  }
}
