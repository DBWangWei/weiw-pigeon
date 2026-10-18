#set page(width: 800pt, height: 600pt, margin: 36pt)
#set text(size: 22pt)
#let takeaway(body) = block(fill: rgb("321d55"), inset: 15pt, radius: 10pt, width: 100%)[#text(fill: white)[#body]]
#metadata((id: "intro", title: "Geometry and color", section: "Geometry")) <slide-record>
#text(size: 36pt, fill: rgb("1256a4"), weight: "bold")[Geometry and color]
#v(30pt)
Aspect ratios must preserve drawing alignment.
#takeaway[Takeaway colors can vary across decks.]
#table(columns: (160pt, 180pt), [Axis], [Length], [Width], [800])
#pagebreak()
#set page(width: 500pt, height: 850pt, margin: 35pt)
#metadata((id: "portrait", title: "Portrait details", section: "Geometry")) <slide-record>
#text(size: 32pt, fill: red)[Portrait details]
#v(20pt)
Annotations reach the bottom of a portrait page.
#link("https://example.org")[External reference]
#pagebreak()
#set page(width: 1024pt, height: 576pt, margin: 40pt)
= Metadata-free title
A page without slide records remains in the presentation.
