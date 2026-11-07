// Ticker v1 authoring helpers.
//
// A tick is metadata and therefore has no inline footprint.  The band is
// ordinary slide content, so both the PDF and Pigeon's SVG compile reserve the
// same geometry.  Pigeon can paint the flat fill over the static band while it
// presents a live lower third.

#let _kinds = ("now", "next", "done")

#let tick(kind: "now", id: none, resolves: none, plain: none, body) = {
  assert(kind in _kinds, message: "tick: kind must be now, next or done")
  assert(resolves == none or kind == "done",
    message: "tick: only a done tick can resolve")
  [#metadata((v: 1, kind: kind, id: id, resolves: resolves,
    plain: plain, body: body)) <pigeon-tick>]
}

#let tick-render(kind, body) = {
  if kind == "done" {
    [#text(fill: rgb("#3f7d4b"), weight: "bold")[✓ DONE ] #body]
  }
  else if kind == "next" {
    [#text(fill: rgb("#276fbf"), weight: "bold")[→ NEXT ] #body]
  }
  else if kind == "now" {
    [#text(fill: rgb("#c43d32"), weight: "bold")[● NOW ] #body]
  }
  else if kind == "section" { text(fill: luma(90), weight: "medium")[#body] }
  else { body }
}

#let _section-at(pg) = {
  let records = query(<slide-record>).filter(it => it.location().page() <= pg)
  if records.len() == 0 { none }
  else { records.last().value.at("section", default: none) }
}

#let _state(pg) = {
  let ticks = query(<pigeon-tick>).enumerate().map(((i, it)) =>
    (..it.value, key: "t" + str(i + 1), page: it.location().page()))
  let mine = ticks.filter(it => it.page == pg)
  let lefts = mine.filter(it => it.kind != "next")
  let left = if lefts.len() > 0 { lefts.last() } else {
    let section = _section-at(pg)
    let closed = ticks.filter(it => it.kind == "done" and it.resolves != none
      and it.page <= pg).map(it => it.resolves)
    let previous = ticks.filter(it => it.kind == "now" and it.page < pg
      and _section-at(it.page) == section
      and (it.id == none or it.id not in closed))
    if previous.len() > 0 { previous.last() } else { none }
  }
  (left: left, right: mine.filter(it => it.kind == "next").at(-1, default: none))
}

#let tick-band(height: 28pt, fill: white, inset: 12pt, gap: 16pt,
  size: 15pt, fallback: "section", render: tick-render, enabled: true) = context {
  let pg = here().page()
  let final = counter(page).final().first()
  if enabled and query(<pigeon-tick>).len() > 0 and pg != final {
    let state = _state(pg)
    let section = _section-at(pg)
    let left-content = if enabled and state.left != none { render(state.left.kind, state.left.body) }
      else if enabled and fallback == "section" and section != none { render("section", section) }
      else { none }
    let right-content = if enabled and state.right != none { render("next", state.right.body) } else { none }
    set text(size: size)
    layout(size => {
      let lm = if left-content != none { measure(left-content) } else { none }
      let rm = if right-content != none { measure(right-content) } else { none }
      let used = if lm != none and rm != none {
        (lm.width / 1pt + rm.width / 1pt + gap / 1pt)
      } else if lm != none {
        lm.width / 1pt
      } else if rm != none {
        rm.width / 1pt
      } else { 0 }
      let left-part = if lm != none {
        (tick: if state.left != none { state.left.key },
          x: inset / 1pt,
          y: if rm != none {
            (height / 2 - lm.height) / 2 / 1pt
          } else {
            (height - lm.height) / 2 / 1pt
          },
          w: lm.width / 1pt, h: lm.height / 1pt)
      } else { none }
      let right-part = if rm != none {
        (tick: if state.right != none { state.right.key },
          // The next ticker is the second row, not a right-aligned column.
          x: inset / 1pt,
          y: if lm != none {
            (height / 2 + (height / 2 - rm.height) / 2) / 1pt
          } else {
            (height - rm.height) / 2 / 1pt
          },
          w: rm.width / 1pt, h: rm.height / 1pt)
      } else { none }
      block(width: 100%, height: height, fill: fill, clip: true,
        inset: (x: inset), {
          // Keep this metadata at the band's top-left location.  The build
          // normalizer adds the absolute page position to each part below.
          place(top + left, dx: -inset, [#metadata((v: 1, w: size.width / 1pt,
            h: height / 1pt, fill: if type(fill) == color { fill.to-hex() },
            overflow: used > size.width / 1pt - 2 * inset / 1pt, enabled: enabled,
            section: section, gap: gap, inset: inset / 1pt,
            left: left-part, right: right-part)) <pigeon-band>])
          if left-content != none and right-content != none {
            grid(columns: 1, rows: (1fr, 1fr), gutter: 0pt,
              align: left + horizon, left-content, right-content)
          } else if left-content != none {
            align(left + horizon, left-content)
          } else if right-content != none {
            align(left + horizon, right-content)
          }
        })
    })
  }
}
