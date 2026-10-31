// Semantic tiers: import this module with `as sem` to avoid style-name clashes.
// Ordinary compilation shows the complete document. Pigeon supplies the inputs.
#let _roles = ("hook", "cue", "answer", "detail", "caveat", "takeaway", "contrast", "support")
#let _mode = sys.inputs.at("pigeon-mode", default: "full")
#let _show = sys.inputs.at("pigeon-tier-show", default: "*")
#let _dim = sys.inputs.at("pigeon-tier-dim", default: "").split(",")
#let _path = state("pigeon-tier-ancestry", ())
#let _counter = counter("pigeon-tier-identity")

#let _plain(c) = {
  if c == none { return "" }
  if type(c) == str { return c }
  if type(c) != content { return "" }
  if c.func() in ([ ].func(), linebreak, parbreak) { return " " }
  if c.has("text") { _plain(c.text) }
  else if c.has("children") { c.children.map(_plain).join() }
  else if c.has("body") { _plain(c.body) }
  else if c.has("child") { _plain(c.child) }
  else { "" }
}

// Use as the page/theme fill: fill: sem.background(default: white).
#let background(default: white) = {
  let value = sys.inputs.at("pigeon-tier-background", default: "")
  if value == "" { default } else { rgb(value) }
}

// The enclosing box prevents automatic wrapping. Reject explicit multiline
// structures recursively, independently of font size or inline math height.
#let _single-line(value) = {
  if type(value) == array { return value.all(_single-line) }
  if type(value) == dictionary { return value.values().all(_single-line) }
  if type(value) != content { return true }
  if value.func() in (linebreak, parbreak, pagebreak, block, table, grid, stack, columns, list, enum, terms) { return false }
  if value.func() == raw and (value.block or value.text.contains("\n") or value.text.contains("\r")) { return false }
  if value.func() == math.equation and value.block { return false }
  if value.func() == box and value.has("width") and value.width != auto { return false }
  value.fields().values().all(_single-line)
}

#let _wrap(role, body, inline, extra) = {
  let id = extra.at("id", default: none)
  let region = extra.at("region", default: none)
  assert(id == none or (type(id) == str and id.trim() != ""), message: "Tier id must be a nonempty string")
  if region != none {
    assert(type(region) == dictionary and ("x", "y", "w", "h").all(k => region.keys().contains(k)), message: "Tier region needs x, y, w, h")
    assert((region.x, region.y, region.w, region.h).all(v => type(v) in (int, float)), message: "Tier region must be numeric")
    assert(region.x >= 0 and region.y >= 0 and region.w > 0 and region.h > 0 and region.x + region.w <= 1 and region.y + region.h <= 1, message: "Tier region must lie inside its body")
  }
  let hidden = region == none and _mode != "full" and ((_show != "*" and not _show.split(",").contains(role)) or _dim.contains(role))
  let emit(size, render) = {
    _counter.step()
    context {
      let uid = "tier-" + str(_counter.get().first())
      let ancestors = _path.get()
      _path.update(ancestors + (uid,))
      place(top + left, context {
        let pos = here().position()
        let (x, y, w, h) = (pos.x.pt(), pos.y.pt(), size.width.pt(), size.height.pt())
        if region != none {
          (x, y, w, h) = (x + region.x * w, y + region.y * h, region.w * w, region.h * h)
        }
        [#metadata((kind: "role", uid: uid, role: role, id: id, ancestry: ancestors,
          hide: region == none, inline: inline, x: x, y: y, width: w, height: h,
          text: _plain(body), to: extra.at("to", default: none))) <pigeon-tier>]
      })
      if hidden { hide(render) } else { render }
      _path.update(ancestors)
    }
  }
  if inline {
    assert(_single-line(body), message: "Tier inline content must fit on one line; use a block wrapper")
    box(context {
      let size = measure(body)
      emit(size, body)
    })
  } else {
    layout(avail => {
      let size = measure(body, width: avail.width)
      block(width: size.width, height: size.height, breakable: false, above: 0pt, below: 0pt,
        emit(size, place(top + align.alignment.x, block(width: avail.width, above: 0pt, below: 0pt, body))))
    })
  }
}

#let hook(body, inline: false, ..x) = _wrap("hook", body, inline, x.named())
#let cue(body, inline: false, ..x) = _wrap("cue", body, inline, x.named())
#let answer(body, inline: false, ..x) = _wrap("answer", body, inline, x.named())
#let detail(body, inline: false, ..x) = _wrap("detail", body, inline, x.named())
#let caveat(body, inline: false, ..x) = _wrap("caveat", body, inline, x.named())
#let takeaway(id, body, inline: false, ..x) = _wrap("takeaway", body, inline, x.named() + (id: id))
#let contrast(group, body, inline: false, ..x) = _wrap("contrast", body, inline, x.named() + (id: group))
#let support(body, to: none, inline: false, ..x) = _wrap("support", body, inline, x.named() + (to: to))
#let tiers(preset: none, default: none, ..args) = {
  let positional = args.pos()
  assert(positional.len() <= 1, message: "tiers accepts at most one preset")
  let selected = if positional.len() == 1 { positional.first() } else { preset }
  [#metadata((kind: "settings", preset: selected, default: default)) <pigeon-tier>]
}
#let note(body, public: false) = [#metadata((kind: "note", text: _plain(body), public: public)) <pigeon-tier>]
#let deep(target, to: none) = context {
  [#metadata((kind: "deep", target: repr(target), targetPage: locate(target).page(), to: to)) <pigeon-tier>]
}
