// Native Typst text and vector lines: editable and searchable in the PDF.
#import "style.typ": ink, teal, pale, muted, amber, amber-pale, coral, coral-pale, violet, violet-pale, navy-pale

#let edge(x1, y1, x2, y2, color: muted) = place(
  top + left, dx: x1, dy: y1,
  line(start: (0pt, 0pt), end: (x2 - x1, y2 - y1), stroke: 1.3pt + color),
)

#let node(x, y, w, h, title, body, color: teal, fill: pale) = place(
  top + left, dx: x, dy: y,
  block(width: w, height: h, inset: 8pt, radius: 5pt, fill: fill, stroke: 1pt + color)[
    #set text(size: 15.5pt, fill: ink)
    #set par(leading: 0.25em, spacing: 0.25em)
    #text(weight: "bold", fill: color, title)
    #parbreak()
    #body
  ],
)

#let academic-map() = block(width: 864pt, height: 340pt)[
  #edge(145pt, 170pt, 185pt, 50pt)
  #edge(145pt, 170pt, 185pt, 170pt)
  #edge(145pt, 170pt, 185pt, 290pt)
  #edge(390pt, 50pt, 425pt, 50pt)
  #edge(390pt, 170pt, 425pt, 170pt)
  #edge(390pt, 290pt, 425pt, 290pt)
  #edge(625pt, 50pt, 665pt, 170pt)
  #edge(625pt, 170pt, 665pt, 170pt)
  #edge(625pt, 290pt, 665pt, 170pt)
  #edge(287pt, 220pt, 287pt, 240pt, color: violet)
  #node(0pt, 101pt, 145pt, 138pt, [Prediction accuracy], [Training fit alone does not ensure accurate predictions on new data.])
  #node(185pt, 0pt, 205pt, 100pt, [1 · Statistical diagnosis], [Random samples → bias–variance])
  #node(425pt, 0pt, 200pt, 100pt, [What is the error?], [Squared bias + variance across training samples + noise in a new response])
  #node(185pt, 120pt, 205pt, 100pt, [2 · Inverse geometry], [Hadamard criteria → SVD], color: violet, fill: violet-pale)
  #node(425pt, 120pt, 200pt, 100pt, [Where is sensitivity?], [Zero ≠ small; inverse gain $1 / sigma_j$], color: violet, fill: violet-pale)
  #node(185pt, 240pt, 205pt, 100pt, [3 · Modified objective], [Tikhonov → ridge], color: amber, fill: amber-pale)
  #node(425pt, 240pt, 200pt, 100pt, [How does it act?], [Gain $frac(sigma_j, sigma_j^2 + lambda)$; fraction $frac(mu_j, mu_j + lambda)$], color: amber, fill: amber-pale)
  #node(665pt, 95pt, 195pt, 150pt, [Which conclusion?], [Unique + stable for fixed $lambda > 0$.

  These guarantees alone do not establish prediction accuracy.])
]

#let information-map() = block(width: 864pt, height: 340pt)[
  #edge(246pt, 53pt, 330pt, 170pt, color: coral)
  #edge(246pt, 170pt, 330pt, 170pt, color: teal)
  #edge(246pt, 287pt, 330pt, 170pt, color: violet)
  #edge(534pt, 170pt, 611pt, 53pt, color: coral)
  #edge(534pt, 170pt, 611pt, 170pt, color: amber)
  #edge(534pt, 170pt, 611pt, 287pt, color: violet)
  #node(0pt, 0pt, 246pt, 106pt, [Missing information], [$sigma_j = 0$: coefficient undetermined by measurements. The squared-norm penalty chooses zero.], color: coral, fill: coral-pale)
  #node(0pt, 117pt, 246pt, 106pt, [Weak information], [Small $sigma_j > 0$: inversion amplifies noise. Ridge reduces this amplification.])
  #node(0pt, 234pt, 246pt, 106pt, [Variation across training samples], [Do fitted coefficients vary strongly in directions with small $sigma_j$?], color: violet, fill: violet-pale)
  #node(330pt, 117pt, 204pt, 106pt, [What can the data reveal?], [Identify what the measurements determine before changing the estimator.], fill: navy-pale)
  #node(611pt, 0pt, 249pt, 106pt, [Systematic model error], [Can the model represent the relationship being predicted? Stability alone does not ensure accuracy.], color: coral, fill: coral-pale)
  #node(611pt, 117pt, 249pt, 106pt, [Noise in a new response], [A new response varies even when its mean is known. Shrinkage cannot remove this noise.], color: amber, fill: amber-pale)
  #node(611pt, 234pt, 249pt, 106pt, [Unknown best penalty], [Training fit alone cannot choose the best penalty for new data. Later: compare choices on validation data.], color: violet, fill: violet-pale)
]
