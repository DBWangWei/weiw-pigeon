#import "shared/style.typ": *

#show: deck
#set document(
  title: "OLS Beyond Memorization: Understanding the Normal Equations",
  author: "Wei Wang · The Hong Kong University of Science and Technology (Guangzhou)",
)
#set text(size: 20pt)
#set par(leading: 0.4em, spacing: 0.45em)
#set list(spacing: 8pt)
#set enum(spacing: 8pt)
#show math.equation.where(block: true): set block(above: 6pt, below: 6pt)

// Typst input example for Pigeon.
// Visual template: talk-v4.typ and shared/style.typ.
// Content source: DSAA3073, 26Summer/FAQ/OLS-beyond-memoization.typ.
// Numerical examples and figures are added for this slide adaptation.
#let RR = $bb(R)$
#let col = math.op("col")
#let rank = math.op("rank")
#let diag = math.op("diag")
#let argmin = math.op("argmin", limits: true)
#let sections = (
  "1 · The problem and its spaces",
  "2 · Projection and optimization",
  "3 · Gram matrices and the adjoint",
  "4 · Rank, stability and ridge",
)
#let branded-s = s.with(
  logo: "../assets/HKUST-GZ.png",
  source: [DSAA3073 · Theories of Data Science · 26Summer · Week 4],
)
#let outline-slide(id, part) = branded-s(id, [Outline], section: sections.at(part))[
  #set text(size: 22pt)
  #set enum(spacing: 24pt)
  + The problem and its spaces
  + Projection and optimization
  + Gram matrices and the adjoint
  + Rank, stability and ridge
]

#slide[
  #metadata((id: "01", title: "OLS Beyond Memorization", section: "Introduction", source: [DSAA3073 · Theories of Data Science · 26Summer · Week 4 FAQ])) <slide-record>
  #block(width: 100%, height: 100%, fill: navy-pale, radius: 12pt, inset: 28pt)[
    #align(center + horizon)[
      #text(size: 13pt, weight: "bold", tracking: 1.2pt, fill: teal)[DSAA3073 · THEORIES OF DATA SCIENCE]
      #v(22pt)
      #block(width: 100%, fill: teal, radius: 8pt, inset: (x: 30pt, y: 25pt))[
        #text(size: 35pt, weight: "bold", fill: white)[OLS Beyond Memorization]
        #v(8pt)
        #text(size: 25pt, fill: white)[Understanding the Normal Equations]
      ]
      #v(20pt)
      #text(size: 22pt, weight: "bold", fill: violet)[Why does $X^top$ appear in least squares?]
      #v(16pt)
      #text(size: 23pt)[$X^top (y - X hat(beta)) = 0$]
      #v(18pt)
      #line(length: 62%, stroke: 1.2pt + violet)
      #v(16pt)
      #grid(columns: (1fr, auto), gutter: 20pt, align: bottom,
        [#text(size: 16pt)[Wei Wang

        The Hong Kong University of Science and Technology (Guangzhou)]],
        [#align(right)[#text(size: 17pt, weight: "bold")[26Summer]

        #image("assets/HKUST-GZ.png", height: 24pt)]],
      )
    ]
  ]
]

#outline-slide("02", 0)

#branded-s("03", [Start from the least-squares problem], section: sections.at(0))[
  #hook[Why do we left-multiply by $X^top$? What makes this choice meaningful?]
  #v(10pt)
  #cols(
    card([Observed data and a linear model], [
      $ X in RR^(n times d), quad y in RR^n $

      A model may write $y = X beta_* + epsilon$.

      The noise $epsilon$ need not be orthogonal to the feature columns.
    ], color: violet, fill: violet-pale),
    card([The fitting problem], [
      $ hat(beta) in argmin_beta norm(y - X beta)^2 $

      Choose coefficients to minimize squared residuals.

      The fitted residual is $r = y - X hat(beta)$.
    ]),
  )
  #v(13pt)
  #takeaway[The normal equations characterize a least-squares fit. They do not follow by simply dropping the noise term.]
]

#branded-s("04", [1 · Dimensions locate the transpose], section: sections.at(0))[
  #table(columns: (1.1fr, 1.2fr, 2.3fr),
    [*Object*], [*Space / size*], [*Meaning*],
    [$beta$], [$RR^d$], [One coefficient per feature],
    [$X beta$ and $y$], [$RR^n$], [One prediction or response per sample],
    [$X$], [$n times d$], [Maps coefficients to predictions],
    [$X^top$], [$d times n$], [Maps a data vector to feature inner products],
  )
  #v(12pt)
  #align(center)[$beta std.sym.arrow.r^X X beta quad quad r std.sym.arrow.r^(X^top) X^top r$]
  #v(9pt)
  #takeaway[Dimensions explain where $X^top r$ lives. They do not yet explain why its value must be zero at the fit.]
]

#branded-s("05", [A running example: fit one constant], section: sections.at(0))[
  #cols([
    We observe three responses and predict the same value for each:

    $ X = mat(1; 1; 1), quad y = mat(1; 2; 4), quad beta in RR. $

    $ L(beta) = (1-beta)^2 + (2-beta)^2 + (4-beta)^2. $

    #hook[Which constant gives the smallest squared error?]
  ], [
    #fig("../assets/constant-fit.svg", height: 250pt)
  ])
  #v(10pt)
  #takeaway[The feasible predictions form a line in $RR^3$: every vector of the form $(beta, beta, beta)^top$.]
]

#outline-slide("06", 1)

#branded-s("07", [2 · Least squares is orthogonal projection], section: sections.at(1))[
  #cols([
    All predictions lie in $col(X)$.

    At the closest prediction $hat(y) = X hat(beta)$,
    $r = y - hat(y)$ is perpendicular to this entire subspace.

    $ X^top r = 0 $
    $ X^top X hat(beta) = X^top y $

    #small[“Normal” here means perpendicular.]
  ], [
    #fig("../assets/projection.svg", height: 255pt)
  ])
  #v(9pt)
  #takeaway[$y = hat(y) + r$: the fitted part lies in $col(X)$; the unexplained part is orthogonal to it.]
]

#branded-s("08", [Why orthogonality guarantees the minimum], section: sections.at(1))[
  Suppose $X^top r = 0$, with $r = y - X hat(beta)$. Move to any coefficients $hat(beta) + h$.
  #v(8pt)
  #card([Compare the losses], [
    $ L(hat(beta) + h) &= norm(r - X h)^2 \
      &= norm(r)^2 - 2 r^top X h + norm(X h)^2 \
      &= L(hat(beta)) + norm(X h)^2 >= L(hat(beta)). $
  ])
  #v(10pt)
  The cross term vanishes because $r^top X h = (X^top r)^top h = 0$.
  #v(10pt)
  #takeaway[Every feasible change can only increase the loss or leave it unchanged. Full column rank makes every nonzero coefficient change increase it.]
]

#branded-s("09", [3 · The gradient yields the same condition], section: sections.at(1))[
  #cols([
    *Differentiate the squared loss*

    $ L(beta) = (y - X beta)^top (y - X beta) $
    $ nabla L(beta) = -2 X^top (y - X beta) $

    At a stationary point:

    $ nabla L(hat(beta)) = 0 $
    $ X^top X hat(beta) = X^top y. $
  ], [
    #card([Why this is a global minimum], [
      The Hessian is positive semidefinite:

      $ nabla^2 L = 2 X^top X, $
      $ h^top nabla^2 L h = 2 norm(X h)^2 >= 0. $

      The loss is convex. With full column rank, it is strictly convex.
    ], color: violet, fill: violet-pale)
  ])
  #v(10pt)
  #takeaway[Setting the gradient to zero solves the optimality condition. It is not generally one gradient-descent step.]
]

#branded-s("10", [Check the fit in the same example], section: sections.at(1))[
  #cols(
    card([Normal equation and residual], [
      $ X^top X = 3, quad X^top y = 7 $
      $ hat(beta) = 7/3 $
      $ r = mat(-4/3; -1/3; 5/3) $
      $ X^top r = -4/3 - 1/3 + 5/3 = 0 $
    ]),
    card([Gradient and loss], [
      $ L'(beta) = 6 beta - 14 $
      $ L'(7/3) = 0 $
      $ L(7/3) = 14/3 $
      $ L(7/3 + delta) = 14/3 + 3 delta^2 $
    ], color: violet, fill: violet-pale),
  )
  #v(13pt)
  #takeaway[The mean, the projection, and the zero-gradient solution agree. Here the residuals sum to zero because $X$ contains the constant feature.]
]

#outline-slide("11", 2)

#branded-s("12", [4 · The Gram matrix records feature geometry], section: sections.at(2))[
  Let $X_j$ be column $j$ of $X$. The Gram matrix $G = X^top X$ satisfies
  $ G_(j k) = X_j^top X_k = sum_(i=1)^n X_(i j) X_(i k). $
  #v(7pt)
  #cols(
    card([Its entries], [
      - $G_(j j) = norm(X_j)^2$: feature magnitude.
      - $G_(j k)$: alignment between two feature columns.
      - $G$ is symmetric and positive semidefinite.
    ]),
    card([Its action], [
      $ h^top G h = norm(X h)^2 $

      This measures how much a coefficient change alters the predictions.

      $G$ is invertible exactly when $rank(X) = d$.
    ], color: violet, fill: violet-pale),
  )
  #v(10pt)
  #takeaway[The normal equations are square, but their significance comes from feature geometry. Square does not imply invertible.]
]

#branded-s("13", [5 · Match the feature inner products], section: sections.at(2))[
  #hook[Each normal equation matches one observed inner product with its fitted counterpart.]
  #v(10pt)
  $ X_j^top y = X_j^top X hat(beta) = sum_(k=1)^d (X_j^top X_k) hat(beta)_k $
  #v(8pt)
  #table(columns: (1.15fr, 2.6fr),
    [*Quantity*], [*Interpretation*],
    [$X_j^top y$], [Alignment of feature $j$ with the observed response],
    [$X_j^top X_k$], [Alignment between features $j$ and $k$],
    [$X_j^top r = 0$], [No residual component along feature $j$],
  )
  #v(10pt)
  #takeaway[Inner products depend on scale and centering. They are not automatically Pearson correlations or individual causal contributions.]
]

#branded-s("14", [Making a square system is not enough], section: sections.at(2))[
  For the constant-fit example, choose a different $1 times 3$ map $A = mat(1, 0, 0)$.
  #v(10pt)
  #cols(
    card([Arbitrary compression], [
      $ A X beta = A y $
      $ beta = 1 $

      This square system has a unique solution, but

      $ L(1) = 0^2 + 1^2 + 3^2 = 10. $
    ], color: coral, fill: coral-pale),
    card([Least-squares compression], [
      $ X^top X beta = X^top y $
      $ beta = 7/3 $

      The residual is orthogonal to the model space, and

      $ L(7/3) = 14/3 < 10. $
    ]),
  )
  #v(12pt)
  #takeaway[Many maps have the right dimensions. $X^top$ is special because it tests the residual against every feasible prediction direction.]
]

#branded-s("15", [6 · The adjoint explains why the transpose], section: sections.at(2))[
  Under the standard Euclidean inner products, the adjoint of $X$ is $X^top$:
  $ lr(chevron.l X h, r chevron.r)_(RR^n) = lr(chevron.l h, X^top r chevron.r)_(RR^d). $
  #v(10pt)
  #cols([
    #card([A direction in each space], [
      A parameter direction $h$ produces a prediction direction $X h$.

      Pairing the residual with $X h$ gives exactly the same scalar as pairing $X^top r$ with $h$.
    ])
  ], [
    #card([The optimality condition], [
      $ X^top r = 0 $
      $ std.sym.arrow.l.r $
      $ lr(chevron.l X h, r chevron.r) = 0 quad forall h $

      Thus the residual is orthogonal to $col(X)$.
    ], color: violet, fill: violet-pale)
  ])
  #v(10pt)
  #takeaway[The transpose preserves the pairing between parameter and data directions. The choice of inner products matters.]
]

#branded-s("16", [Six views, one optimality condition], section: sections.at(2))[
  #set text(size: 19pt)
  #table(columns: (1.1fr, 2.7fr), inset: 7pt,
    [*View*], [*What it explains*],
    [Dimensions], [$X^top r$ lives in parameter space $RR^d$.],
    [Geometry], [$r$ is perpendicular to all of $col(X)$.],
    [Optimization], [$nabla L(hat(beta)) = -2 X^top r = 0$.],
    [Gram matrix], [$X^top X$ encodes how coefficient changes affect predictions.],
    [Inner products], [$X_j^top y = X_j^top hat(y)$ for every feature $j$.],
    [Adjoint], [$lr(chevron.l X h, r chevron.r) = lr(chevron.l h, X^top r chevron.r)$.],
  )
  #v(12pt)
  #takeaway[To explain the normal equations, connect the spaces, the loss, and the residual. Each view answers a different part of the same question.]
]

#outline-slide("17", 3)

#branded-s("18", [Rank controls coefficient uniqueness], section: sections.at(3))[
  #cols(
    card([Full column rank: $rank(X) = d$], [
      $X^top X$ is positive definite.

      There is one coefficient vector:

      $ hat(beta) = (X^top X)^(-1) X^top y. $

      This formula requires full column rank.
    ]),
    card([Rank deficient: $rank(X) < d$], [
      $X^top X$ is singular, but least squares still has minimizers.

      If $X h = 0$, then $hat(beta) + h$ produces the same fitted values as $hat(beta)$.

      The fitted vector $hat(y)$ remains unique.
    ], color: violet, fill: violet-pale),
  )
  #v(11pt)
  #note[Example: duplicate the constant feature, $X = mat(1,1;1,1;1,1)$. Every pair with $beta_1 + beta_2 = 7/3$ gives the same fit to $(1,2,4)^top$.]
  #v(9pt)
  #takeaway[Different coefficient vectors can represent the same unique projection. Identifiability of parameters is a separate question.]
]

#branded-s("19", [Separate coefficients from fitted values], section: sections.at(3))[
  #table(columns: (1fr, 1.2fr, 2.2fr),
    [*Operator*], [*Map*], [*What it returns*],
    [$X^+$], [$RR^n -> RR^d$], [Minimum-norm least-squares coefficients],
    [$P_X = X X^+$], [$RR^n -> RR^n$], [Orthogonal projection onto $col(X)$],
  )
  #v(11pt)
  #cols([
    $ hat(beta)_"min" = X^+ y $

    With full column rank only:

    $ X^+ = (X^top X)^(-1) X^top. $
  ], [
    $ hat(y) = P_X y $

    The projector is symmetric and idempotent:

    $ P_X^top = P_X, quad P_X^2 = P_X. $
  ])
  #v(11pt)
  #takeaway[$X^+$ returns coefficients; $X X^+$ returns predictions. These operators have different domains and meanings.]
]

#branded-s("20", [Small singular values amplify response noise], section: sections.at(3))[
  Use the compact SVD $X = U_q Sigma_q V_q^top$, with $q = rank(X)$ and $sigma_i > 0$.
  $ X^+ y = sum_(i=1)^q frac(lr(chevron.l u_i, y chevron.r), sigma_i) v_i. $
  #v(8pt)
  #cols(
    card([Perturb one data direction], [
      If $Delta y = delta u_i$, then

      $ Delta hat(beta)_"min" = frac(delta, sigma_i) v_i. $

      Small $sigma_i$ means large coefficient sensitivity.
    ], color: coral, fill: coral-pale),
    card([A numerical scale], [
      Let $sigma_i = 0.01$ and $delta = 0.02$.

      $ norm(Delta hat(beta)_"min") = 2. $

      Yet $Delta hat(y) = delta u_i$: fitted training values need not change greatly.
    ]),
  )
  #v(10pt)
  #takeaway[Coefficient instability is not the same as instability of fitted training values. Small singular directions reveal the distinction.]
]

#branded-s("21", [Ridge limits amplification in weak directions], section: sections.at(3))[
  Penalize all coefficients, with $lambda > 0$:
  $ hat(beta)_lambda = argmin_beta (norm(y - X beta)^2 + lambda norm(beta)^2). $
  #v(5pt)
  #cols([
    *The modified normal equations*

    $ (X^top X + lambda I) hat(beta)_lambda = X^top y $

    *The compact SVD form*

    $ hat(beta)_lambda = sum_(i=1)^q frac(sigma_i, sigma_i^2 + lambda) lr(chevron.l u_i, y chevron.r) v_i $
  ], [
    #card([The same perturbation], [
      For $sigma_i = 0.01$, $delta = 0.02$, and $lambda = 0.01$:

      OLS coefficient change: $2$.

      Ridge coefficient change:

      $ frac(0.01, 0.01^2 + 0.01) dot 0.02 approx 0.0198. $
    ], color: violet, fill: violet-pale)
  ])
  #v(10pt)
  #takeaway[Ridge trades shrinkage bias for reduced sensitivity. The penalty makes the coefficient solution unique even when $X$ is rank deficient.]
]

#branded-s("22", [Ridge fits are shrunk, not orthogonally projected], section: sections.at(3))[
  The fitted-value operator is
  $ S_lambda = X (X^top X + lambda I)^(-1) X^top
    = U_q diag(frac(sigma_i^2, sigma_i^2 + lambda)) U_q^top. $
  #v(9pt)
  #cols(
    card([Orthogonal projection], [
      $P_X$ keeps each direction in $col(X)$ with weight $1$.

      $ P_X^2 = P_X $

      Applying it again changes nothing.
    ]),
    card([Ridge smoothing], [
      $S_lambda$ uses weights strictly between $0$ and $1$ on nonzero singular directions.

      For nonzero $X$, $S_lambda^2 != S_lambda$.

      Applying it again shrinks further.
    ], color: violet, fill: violet-pale),
  )
  #v(10pt)
  #takeaway[The ridge residual satisfies $X^top (y - X hat(beta)_lambda) = lambda hat(beta)_lambda$. It is generally not orthogonal to $col(X)$.]
]

#branded-s("23", [Read the two kinds of spectral weights], section: sections.at(3))[
  #fig("../assets/spectral-weights.svg", height: 225pt)
  #v(6pt)
  #small[Illustration: $lambda = 0.01$. Left: how data components affect coefficients. Right: how much each fitted component is retained.]
  #v(9pt)
  #takeaway[For numerical computation, use QR or SVD-based solvers. Forming $X^top X$ squares the 2-norm condition number when $X$ has full column rank.]
]

#branded-s("24", [Explain the equations without memorizing them], section: sections.at(3))[
  #set text(size: 19pt)
  #grid(columns: (1fr, 1fr), gutter: 14pt,
    card([Why $X^top$?], [It tests residuals against all feasible prediction directions, via the adjoint identity.]),
    card([When is the inverse valid?], [Exactly when $X$ has full column rank. Otherwise use the pseudoinverse or describe all minimizers.], color: violet, fill: violet-pale),
    card([What is being projected?], [$y$ is projected to $hat(y) = X X^+ y$ in data space; coefficients live in parameter space.], color: amber, fill: amber-pale),
    card([What changes under ridge?], [Weak directions receive smaller weights. The fit is a linear smoother, with a different residual condition.], color: coral, fill: coral-pale),
  )
  #v(12pt)
  #takeaway[Reconstruct $X^top (y - X hat(beta)) = 0$ from the loss or from geometry. Then state the rank and regularization assumptions before using a formula.]
]
