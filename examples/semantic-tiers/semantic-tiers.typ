#import "pigeon-tiers.typ" as sem
#import "pigeon-sem.typ": pigeon-sem
#set document(title: "Semantic tiers: independent presentation states")
#set page(width: 720pt, height: 405pt, margin: 36pt, fill: sem.background(default: white))
#set text(font: "Libertinus Sans", size: 20pt, fill: rgb("#172437"))
#set par(spacing: 12pt)
#let title(t) = text(size: 29pt, weight: "bold", t)
#let card(body, fill: rgb("#edf4fa")) = block(width: 100%, inset: 14pt, radius: 8pt, fill: fill, body)

#sem.tiers("independent", default: "answer")
#title[1 · Independent states]
#sem.hook[#card[Question: does a larger sample remove measurement bias?]]
#v(14pt)
#sem.answer[#card[Answer: more observations reduce sampling variation; systematic measurement bias can remain.]]
#v(14pt)
#sem.cue[Use comma/period to switch tiers without changing slides.]
#sem.note[Ask for a prediction before showing the answer.]
#sem.note(public: true)[The question and answer are deliberately separate states.]

#pagebreak()
#sem.tiers("evidence", default: 1)
#title[2 · A decorated table]
#sem.hook[Which estimator is more stable?]
#sem.answer[
  #pigeon-sem("_table", block(stroke: 1pt + rgb("#416788"), radius: 6pt, inset: 10pt)[
    #table(columns: (2fr, 1fr, 1fr), inset: 9pt,
      [*Estimator*], [*Bias*], [*Variance*],
      [Unregularized], [0], [9], [Regularized], [1], [2])
  ])
]
#sem.detail[These are illustrative squared-error components, not empirical measurements.]
#sem.caveat[Lower variance alone does not establish lower total error.]

#pagebreak()
#sem.tiers("figure")
#title[3 · Figure and nested support]
#sem.detail[
  #sem.support(to: "stability", region: (x: 0.53, y: 0.12, w: 0.40, h: 0.70))[
    #pigeon-sem("_fig", block(width: 100%, height: 130pt, fill: rgb("#eef3f7"), inset: 14pt)[
      #grid(columns: (1fr, 1fr), gutter: 18pt,
        block(height: 95pt, fill: rgb("#c6d9eb"), inset: 12pt)[Noisy observations],
        block(height: 95pt, fill: rgb("#c7e4da"), inset: 12pt)[Stable estimate])
    ])
  ]
]
#sem.takeaway("stability")[#pigeon-sem("takeaway", card[Stability depends on how the observations constrain the estimate.])]
#sem.note(public: true)[The support region marks the right part of the figure. It does not hide or crop its body.]

#pagebreak()
#sem.tiers("summary")
#title[4 · Multiple takeaways and a detour]
#sem.takeaway("bias")[#pigeon-sem("takeaway", card[More data need not remove systematic bias.])]
#v(16pt)
#sem.takeaway("variance")[#pigeon-sem("takeaway", card[Regularization can trade bias for lower variance.])]
#sem.detail[Enter follows the derivation detour. R restores this slide and its saved tier.]
#sem.deep(<derivation>, to: "variance")

#pagebreak()
#sem.tiers("replacement")
#title[5 · Same-position opaque replacement]
#v(20pt)
#box(width: 100%, height: 150pt)[
  #place(top + left)[#sem.answer[#block(width: 640pt, height: 135pt, fill: rgb("#d9e9fa"), inset: 20pt)[Initial claim: choose the least variable estimator.]]]
  #place(top + left)[#sem.contrast("correction")[#block(width: 640pt, height: 135pt, fill: rgb("#fff0ce"), inset: 20pt)[Correction: compare total error, including squared bias.]]]
]
#sem.cue[Opaque alternatives follow Typst paint order. The amber cover is on top in the complete PDF.]

#pagebreak()
#sem.tiers("flat")
#title[6 · Derivation detour] <derivation>
$ "MSE"(hat(theta)) = "Var"(hat(theta)) + "Bias"(hat(theta))^2 $
This page selects the flat preset: one complete state.

Press R after arriving through Enter to return to the exact saved tier.
#sem.note[Private presenter notes are metadata, not confidential storage.]
