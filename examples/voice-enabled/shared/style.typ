#import "@preview/touying:0.6.1": *
#import themes.simple: simple-theme, slide

#let ink = rgb("172C43")
#let teal = rgb("007E87")
#let pale = rgb("EDF5F5")
#let muted = rgb("516071")
#let navy-pale = rgb("EAF0F6")
#let amber = rgb("C77919")
#let amber-pale = rgb("FFF6E7")
#let coral = rgb("B6504A")
#let coral-pale = rgb("FCEDEA")
#let violet = rgb("7455A6")
#let violet-pale = rgb("F3F0FA")

#let deck(body) = {
  show: simple-theme.with(
    config-common(handout: true),
    aspect-ratio: "16-9",
    primary: teal,
    header: none,
    header-right: none,
    footer: none,
    footer-right: none,
    subslide-preamble: none,
    config-page(
      width: 960pt,
      height: 540pt,
      margin: (left: 48pt, right: 48pt, top: 30pt, bottom: 14pt),
    ),
  )
  set text(font: "Libertinus Sans", size: 19pt, fill: ink)
  show link: underline
  show link: set text(fill: teal)
  set par(leading: 0.56em, spacing: 0.62em)
  set list(indent: 16pt, body-indent: 9pt, spacing: 12pt)
  set enum(indent: 18pt, body-indent: 9pt, spacing: 12pt)
  show list: set block(above: 6pt, below: 6pt)
  show enum: set block(above: 6pt, below: 6pt)
  set math.equation(block: true, supplement: none)
  set table(inset: 8pt, stroke: 0.45pt + rgb("CBD6DE"), align: left + horizon)
  body
}

#let s(id, title, section: "", source: "", logo: none, body) = slide[
  #metadata((id: id, title: title, section: section, source: source)) <slide-record>
  #text(size: 11pt, fill: teal, weight: "bold", tracking: 0.6pt)[#upper(section) #h(1fr) #id]
  #v(8pt)
  #text(size: 30pt, weight: "bold", title)
  #v(8pt)
  #line(length: 100%, stroke: 1pt + teal)
  #v(13pt)
  #body
  #v(1fr)
  #line(length: 100%, stroke: 0.4pt + rgb("D5DDE2"))
  #v(5pt)
  #if logo == none {
    text(size: 10.5pt, fill: muted)[#source]
  } else {
    grid(
      columns: (1fr, auto),
      gutter: 12pt,
      align: bottom,
      text(size: 10.5pt, fill: muted)[#source],
      image(logo, height: 22pt),
    )
  }
]

#let hook(body) = block(width: 100%, inset: (x: 12pt, y: 9pt), fill: pale, radius: 3pt)[#text(fill: teal, weight: "bold", body)]
#let takeaway(body) = block(
  width: 100%,
  fill: gradient.linear(
    angle: 135deg,
    rgb("EDF5F5"),
    rgb("E3F4F5"),
    rgb("D9F2F4"),
  ),
  stroke: (
    left: 4pt + teal,
    top: 1pt + rgb("A0E0E5"),
    right: 1pt + rgb("00565C"),
    bottom: 1pt + rgb("00565C"),
  ),
  radius: 6pt,
  inset: (left: 16pt, right: 14pt, top: 12pt, bottom: 12pt),
)[
  #grid(
    columns: (auto, 1fr),
    gutter: 12pt,
    align: horizon,
    text(size: 28pt, fill: teal)[💡],
    body,
  )
]
#let small(body) = text(size: 18pt, body)
#let tiny(body) = text(size: 15.5pt, body)
#let mark(body) = text(fill: red, body)
#let cols(a, b, ratio: (1fr, 1fr)) = grid(columns: ratio, gutter: 22pt, a, b)
#let arrow() = align(center + horizon)[#text(size: 24pt, fill: teal)[#sym.arrow.r]]
#let fig(path, width: 100%, height: 180pt) = align(center, image(path, width: width, height: height, fit: "contain"))
#let framebox(
  body,
  width: auto,
  height: auto,
  baseline: 0pt,
  alignment: center + horizon,
  inset: (x: 8pt, y: 4pt),
  outset: 0pt,
  radius: 4pt,
  stroke: auto,
  fill: auto,
  bevel: true,
  bevel-light: rgb("A0E0E5"),
  bevel-dark: rgb("003840"),
  clip: false,
) = {
  let frame-stroke = if bevel and stroke == auto {
    (
      top: 2.2pt + bevel-light,
      left: 2.2pt + bevel-light,
      bottom: 2.2pt + bevel-dark,
      right: 2.2pt + bevel-dark,
    )
  } else if stroke == auto {
    0.9pt + teal
  } else {
    stroke
  }
  let frame-fill = if fill == auto {
    if bevel { pale } else { none }
  } else {
    fill
  }
  box(
    width: width,
    height: height,
    baseline: baseline,
    inset: inset,
    outset: outset,
    radius: radius,
    stroke: frame-stroke,
    fill: frame-fill,
    clip: clip,
  )[
    #if width == auto and height == auto {
      body
    } else {
      align(alignment, body)
    }
  ]
}

#let card(title, body, color: teal, fill: pale) = block(
  width: 100%,
  fill: fill,
  stroke: 1.1pt + color,
  radius: 6pt,
  inset: 10pt,
)[#text(weight: "bold", fill: color)[#title] #v(4pt) #body]
#let label(text, color: teal, fill: pale) = box(fill: fill, stroke: 0.8pt + color, inset: (x: 8pt, y: 4pt), radius: 3pt)[#text(size: 15pt, weight: "bold", fill: color)[#text]]
#let quote(body) = block(width: 100%, fill: violet-pale, stroke: 1pt + violet, radius: 5pt, inset: 10pt)[#text(fill: violet, body)]
#let risk(body) = block(width: 100%, fill: coral-pale, stroke: 1pt + coral, radius: 5pt, inset: 10pt)[#body]
#let opportunity(body) = block(width: 100%, fill: pale, stroke: 1pt + teal, radius: 5pt, inset: 10pt)[#body]
#let note(body) = block(width: 100%, fill: amber-pale, stroke: 1pt + amber, radius: 5pt, inset: 10pt)[#body]
