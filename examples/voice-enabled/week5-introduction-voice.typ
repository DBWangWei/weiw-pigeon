#import "shared/style.typ": *
#import "shared/notation.typ": *
#import "shared/mindmaps.typ": academic-map, information-map
#import "pigeon-sem.typ": pigeon-sem

#show: deck
#set document(
  title: "Introduction to Week 5 · DSAA3073 · 26Fall",
  author: "Wei Wang · HKUST(GZ)",
)
#let ws = s.with(logo: "../assets/HKUST-GZ.png")
#let vfill() = v(1fr)
#let source(pages) = [DSAA3073 · Week 5 learning sheet · PDF pp. #pages]

// Voice-target wrappers preserve the existing visual functions and add only
// invisible semantic bounds for Pigeon. Tables and takeaways use the built-in
// target names; the selected cards below are worked examples.
#let voice-table(..args) = pigeon-sem("_table", table(..args))
#let voice-image(path, ..args) = pigeon-sem("_fig", image(path, ..args))
#let voice-figure(body) = pigeon-sem("_fig", body)
#let voice-takeaway(body) = pigeon-sem("takeaway", takeaway(body))
#let voice-example(title, body, color: teal, fill: pale) = pigeon-sem("_example", card(title, body, color: color, fill: fill))

// Draft INTRODUCTION, not a replacement for the two tutorials in the sheet.
// Each ws() produces one physical page and one Pigeon <slide-record>.
// The microphone hook is new; all numbers are constructed, not empirical claims.

#ws("01", [Introduction to Week 5], section: "DSAA3073 · 26Fall", source: [DSAA3073 · Theories in Data Science · HKUST(GZ)])[
  #v(32pt)
  #text(size: 36pt, weight: "bold", fill: teal)[From Unstable Inversion to Ridge Regression]
  #v(24pt)
  #text(size: 23pt)[Bias–variance · inverse problems · Tikhonov regularization]
  #vfill()
  #text(size: 22pt, weight: "bold")[DSAA3073 · Theories in Data Science]
  #v(8pt)
  #text(size: 21pt)[26Fall · Wei Wang · HKUST(GZ)]
]

#ws("02", [Two voices, two microphones], section: "1 · A new hook", source: [Original toy example · dashed waves indicate reception of each voice at each microphone])[
  #set text(size: 20pt)
  #hook[Both microphones hear both voices. Can we recover the two voices from the recordings?]
  #voice-image("assets/two-voices-two-microphones.svg", width: 100%, height: 260pt, fit: "contain")
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    align(center)[Unknown source amplitudes: $#vf = (a, b)^"T"$],
    align(center)[Measured recordings: $#vy = (y_1, y_2)^"T"$],
  )
]

#ws("03", [From recordings to a linear inverse problem], section: "1 · A new hook", source: [Original calibrated mixing model · mechanism: learning sheet PDF pp. 6–8])[
  #set text(size: 20pt)
  At one instant, $a$ and $b$ are the signed source amplitudes. The mixing weights are known, but the recordings contain noise.
  $ #vy = #mA #vf + #veps. $
  #grid(columns: (1fr, 1.05fr), gutter: 24pt,
    card([Two scalar measurement equations], [
      $ y_1 = 0.51 a + 0.49 b + epsilon_1, $
      $ y_2 = 0.49 a + 0.51 b + epsilon_2. $
      Each microphone hears almost the same mixture.
    ]),
    card([One matrix equation], [
      $ #mA = mat(0.51, 0.49; 0.49, 0.51), quad #veps = vec(epsilon_1, epsilon_2). $
      Given $#mA$ and $#vy$, recover $#vf$.

      The actual measurement error $#veps$ is unknown.
    ], color: violet, fill: violet-pale),
  )
  #vfill()
  #text(size: 20pt, weight: "bold", fill: violet)[Predict: would a 0.01 change in each recording produce only a small change in the separated voices?]
]

#ws("04", [A tiny recording error becomes a large source error], section: "1 · A new hook", source: [Original calculation · mechanism: learning sheet PDF pp. 6–8])[
  #set text(size: 20pt)
  Suppose the true amplitudes are $#vf ^star = (1, 0)^"T"$.
  #v(8pt)
  #voice-table(columns: (1.3fr, 1fr, 1fr),
    [*Recording*], [*Observed $#vy $*], [*Exact solution $#mA ^(-1) #vy $*],
    [No measurement error], [$(0.51, 0.49)^"T"$], [$(1, 0)^"T"$],
    [Add $(0.01, -0.01)^"T"$], [$(0.52, 0.48)^"T"$], [$(1.5, -0.5)^"T"$],
  )
  #v(12pt)
  #grid(columns: (1fr, 1fr), gutter: 22pt,
    voice-example([The sum is easy to observe], [Noiseless: $y_1 + y_2 = a + b$.

    The added noise cancels in this sum.]),
    voice-example([The difference is weakly observed], [Noiseless: $y_1 - y_2 = 0.02(a - b)$.

    Inversion multiplies difference noise by *50*.], color: violet, fill: violet-pale),
  )
  #vfill()
  #voice-takeaway[Agreement with noisy measurements does not guarantee agreement with the true sources.]
]

#ws("05", [Why the obvious fixes do not settle the problem], section: "1 · A new hook", source: [Original hook analysis · learning sheet PDF pp. 7–12, 28–30])[
  #set text(size: 19pt)
  #voice-table(columns: (1fr, 2.2fr),
    [*First idea*], [*What remains unresolved*],
    [Solve with more precision], [This error came from measurement noise. Exact arithmetic still amplifies it.],
    [Use the pseudoinverse], [For this invertible matrix it equals the inverse. Small positive singular values still give large gains.],
    [Drop the difference entirely], [Both voices share the sum. Discarding their difference also discards real separation information.],
    [Always use stronger shrinkage], [Shrinkage reduces coefficients toward zero. A larger penalty reduces noise amplification but can also suppress true signal, so expected error can rise.],
  )
  #vfill()
  #voice-takeaway[Identify which errors come from the measurements and which directions amplify them. Then calculate how reducing amplification changes bias and variance.]
]

#ws("06", [Four ideas that apply beyond this example], section: "2 · The plan", source: source("3–14, 24–30"))[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 18pt,
    card([1 · Separate error sources], [Bias, variation across training samples, and noise in a new response need different explanations.]),
    card([2 · Change coordinates], [The SVD exposes directions that the observations determine strongly, weakly, or not at all.], color: violet, fill: violet-pale),
    card([3 · Change the objective], [Penalize large coefficients to control amplification. Calculate the signal lost in return.], color: amber, fill: amber-pale),
    card([4 · Check what each result proves], [Existence, uniqueness, stability, and prediction accuracy require different arguments.]),
  )
  #vfill()
  #text(fill: violet, weight: "bold")[Route: error decomposition → sensitive directions → Tikhonov and ridge → bias–variance tradeoff and limits.]
]

#ws("07", [The problem: recover a signal from noisy observations], section: "2 · The plan", source: source("6–11, 20–21"))[
  #set text(size: 20pt)
  $ #vy = #mA #vf ^star + #veps , quad #mA in bb(R)^(n times d), quad #vf ^star in bb(R)^d. $
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    card([What is given?], [The known matrix $#mA$ maps hidden source amplitudes to noiseless measurements; $#vy$ is the observed data.

    The hidden target $#vf ^star$ and the measurement error are unknown.]),
    card([What do we want?], [A recovered signal or predictor that remains useful when observations change slightly.

    Are we trying to recover the hidden parameters, or predict outputs accurately?], color: violet, fill: violet-pale),
  )
  #v(14pt)
  #text(weight: "bold", fill: teal)[Regression is the same optimization pattern:]
  $ #mA = #mX , quad #vf = #vbeta , quad #vy approx #mX #vbeta . $
  #text(size: 17pt, fill: muted)[Centering means subtracting each sample mean from the predictors and response. In the later moment calculation, the predictor matrix is fixed while response noise varies across repetitions; the intercept is unpenalized.]
]

#ws("08", [First separate two sources of randomness], section: "2 · The plan", source: source("3–5"))[
  #set text(size: 19pt)
  #text(size: 15.5pt, fill: muted)[At a fixed input $x_0$, let $S$ be the random training sample; $hat(f)_S (x_0)$ is the prediction fitted from $S$; $f^star (x_0)$ is the true mean response; and $m(x_0)$ is the average fitted prediction over possible $S$.]
  #text(size: 15.5pt, fill: muted)[A new response is $Y = f^star (x_0) + epsilon$, where $epsilon$ is independent of $S$, has mean zero, and represents noise in that new response.]
  #v(6pt)
  $ #Exp _(S, epsilon) [ (Y - hat(f)_S (x_0))^2 ] =
 underbrace((m(x_0) - f^star (x_0))^2, "squared bias") +
 underbrace(#Var _S (hat(f)_S (x_0)), "variance across training samples") +
 underbrace(sigma^2 (x_0), "noise in a new response"), $
  #text(size: 15pt, fill: muted)[$m(x_0) = #Exp _S [hat(f)_S (x_0)]$. The identity assumes squared loss and finite second moments.]
  #v(8pt)
  #grid(columns: (1fr, 1fr, 1fr), gutter: 14pt,
    card([Bias], [The average fitted prediction differs from the true mean response.]),
    card([Variance across training samples], [The fitted prediction changes when the training sample changes.], color: violet, fill: violet-pale),
    card([Noise in a new response], [A new response varies even when its mean is known.], color: amber, fill: amber-pale),
  )
  #vfill()
  #text(size: 18pt, weight: "bold")[The identity names the error components. Geometry will explain one mechanism of instability.]
]

#ws("09", [An inverse can exist and still be unreliable], section: "2 · The plan", source: source("6–8"))[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    card([Hadamard: three separate questions], [
      + Does a solution exist for every admissible observation?
      + Is that solution unique?
      + Does it depend continuously on the observation?
    ]),
    card([SVD: how much does each direction change?], [
      $ #mA #vv _j = sigma_j #vu _j. $
      A change along source direction $#vv _j$ produces an observation change scaled by $sigma_j$.

      If $sigma_j$ is small, that source change is hard to distinguish from measurement noise. Inversion divides by $sigma_j$ and amplifies the noise.

      *Zero:* measurements do not detect that direction.
    ], color: violet, fill: violet-pale),
  )
  #vfill()
  #voice-takeaway[Our inverse exists and varies continuously, but its smallest singular value is 0.02. The difference-direction noise is multiplied by 50.]
]

#ws("10", [Tikhonov changes the objective; ridge specializes it], section: "2 · The plan", source: source("9–11, 20–22"))[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    voice-example([General finite-dimensional inverse], [
      $ #vf _lambda = #argmin _(#vf) (norm(#mA #vf - #vy )^2 + lambda norm(#vf )^2). $
      #text(size: 16pt, fill: muted)[Squared measurement error + penalty on coefficient size. A squared norm sums the squared components; $lambda > 0$ controls penalty strength.]

      $ (#mA ^"T" #mA + lambda #mI ) #vf _lambda = #mA ^"T" #vy . $
    ]),
    voice-example([Centered linear regression: ridge], [
      $ hat(#vbeta )_lambda = #argmin _(#vbeta) (norm(#vy - #mX #vbeta )^2 + lambda norm(#vbeta )^2). $
      $ hat(#vbeta )_lambda = (#mX ^"T" #mX + lambda #mI )^(-1) #mX ^"T" #vy . $
      #text(size: 16pt, fill: muted)[The same derivation with $#mA = #mX $.]
    ], color: violet, fill: violet-pale),
  )
  #v(12pt)
  #text(size: 16.5pt, fill: muted)[The displayed residual term is a sum, with no $1/n$, and all displayed coefficients are penalized. With an averaged residual convention, $lambda = n lambda'$ gives the same estimator.]
  #vfill()
  #voice-takeaway[The penalty changes which solution we prefer. It does not remove the measurement noise.]
]

#ws("11", [The mechanism: damp weak directions more strongly], section: "2 · The plan", source: source("10–11, 23–24"))[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    [
      *Data-to-solution gain*
      $ frac(1, sigma_j) quad -> quad frac(sigma_j, sigma_j^2 + lambda). $
      Acts on the measured coordinate $#vu _j^"T" #vy $ to produce an estimated source coordinate.
    ],
    [
      *Fraction of the ordinary least-squares (OLS) coefficient retained*
      $ s_j (lambda) = frac(mu_j, mu_j + lambda), quad mu_j = sigma_j^2 > 0. $
      This compares the ridge coefficient with the OLS coefficient in the same direction. In regression, $mu_j$ is the corresponding eigenvalue of $#mX ^"T" #mX $: a squared singular value.
    ],
  )
  #v(12pt)
  For the microphones, set $lambda = 0.0004$:
  #voice-table(columns: (1.4fr, 1fr, 1fr, 1fr),
    [*Direction*], [*Exact gain*], [*Ridge gain*], [*Fraction kept*],
    [Sum: $sigma = 1$], [1], [0.9996], [99.96%],
    [Difference: $sigma = 0.02$], [50], [25], [50%],
  )
  #vfill()
  #text(size: 19pt, weight: "bold", fill: teal)[Ridge reduces both noise amplification and true signal in the weak direction.]
]

#ws("12", [What we can prove before testing prediction quality], section: "2 · The plan", source: source("10–12, 21–22"))[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    card([A unique finite-dimensional solution], [
      For every nonzero $#vz $,
      $ #vz ^"T" (#mA ^"T" #mA + lambda #mI ) #vz = norm(#mA #vz )^2 + lambda norm(#vz )^2 > 0. $
      The Hessian is positive definite. Normal equations give a solution; strict convexity shows no other minimizer exists.
    ]),
    card([An explicit stability bound], [
      For fixed $lambda > 0$, let $Delta #vy$ be a change in the observed measurements:
      $ norm(#vf _lambda (#vy + Delta #vy ) - #vf _lambda (#vy )) <= frac(norm(Delta #vy ), 2 sqrt(lambda)). $
      At $lambda = 0.0004$, amplification is at most *25*, even with zero singular values.
    ], color: violet, fill: violet-pale),
  )
  #vfill()
  #voice-takeaway[A unique, stable estimate can still have large prediction error.]
]

#ws("13", [A little bias can buy a useful variance reduction], section: "2 · The plan", source: [Constructed weak-direction calculation · moment formulas: learning sheet PDF pp. 24–27])[
  #set text(size: 19pt)
  #set par(leading: 0.45em, spacing: 0.35em)
  In one weak direction, $t = 0.02 theta + eta$: $t$ measures source coefficient $theta$ with measurement noise $eta$.
  #text(size: 16pt, fill: muted)[For this calculation, $theta = 1$ and $eta$ has mean 0 and variance $0.0004$.]
  $ hat(theta)_lambda = frac(0.02, 0.0004 + lambda) t, quad s = frac(0.0004, 0.0004 + lambda). $
  Coefficient MSE = squared bias $(1-s)^2$ + variance $s^2$.
  #v(5pt)
  #voice-table(columns: (1.2fr, 1fr, 1fr, 1fr, 1fr),
    [*Penalty $lambda$*], [*Fraction $s$*], [*Squared bias*], [*Variance*], [*MSE*],
    [0], [1], [0], [1], [1],
    [0.0004], [0.5], [0.25], [0.25], [*0.50*],
    [0.0036], [0.1], [0.81], [0.01], [0.82],
  )
  #v(9pt)
  #text(size: 16pt, fill: muted)[The table measures coefficient error. Prediction error measures errors in predicted outputs; predicting a new response also includes its noise variance.]
  #vfill()
  #voice-takeaway[A moderate penalty improves this example. Stronger shrinkage reduces variance further but can make total error worse.]
]

#ws("14", [Three limits to keep in view], section: "2 · The plan", source: source("11–12, 22, 28–31"))[
  #set text(size: 20pt)
  #set enum(spacing: 15pt)
  + *Missing information stays missing.* A null direction is a coefficient change that produces no change in the measurements. The squared-norm penalty chooses zero for a coefficient the data do not determine; it does not recover that coefficient.
  + *Noise in a new response remains.* A penalty cannot remove response variance left even when the conditional mean is known.
  + *The best penalty is still unknown.* Training residuals do not select the best predictive tradeoff. Later selection needs independent evidence or another justified criterion.
  #vfill()
  #note[
    As $lambda -> 0^+$, finite-dimensional ridge approaches the least-squares solution with the smallest Euclidean norm. It equals the usual OLS inverse formula only under full column rank.
  ]
]

#ws("15", [Six distinctions that beginners often find hard], section: "3 · How to study it", source: source("3–5, 7, 11–12, 24–31"))[
  #set text(size: 19pt)
  #voice-table(columns: (1fr, 1.65fr),
    [*Hard distinction*], [*Question to ask yourself*],
    [Training randomness / noise in a new response], [What is being redrawn, and what stays fixed inside this expectation?],
    [Zero / small singular value], [Is information absent, or present but easily overwhelmed?],
    [Gain / shrinkage fraction], [Does this factor multiply a measured coordinate, a fitted coordinate, or an OLS coefficient?],
    [Coefficient / prediction error], [Which directions does the test input emphasize? Where does noise in a new response enter?],
    [Unique / accurate solution], [Did the proof establish uniqueness, sensitivity to measurement changes, or expected prediction accuracy?],
    [Fixed penalty / selected penalty], [Is $lambda$ fixed in the theorem, or chosen after looking at data?],
  )
  #vfill()
  #text(weight: "bold", fill: teal)[For each formula, identify what is fixed, what is random, and which error is being measured.]
]

#ws("16", [Connections to the undergraduate mathematical core], section: "3 · How to study it", source: [Connections developed from learning sheet PDF pp. 3–12, 20–26])[
  #set text(size: 19pt)
  #voice-table(columns: (1fr, 1.7fr, 1.3fr),
    [*Course / topic*], [*Exact bridge*], [*Why it helps here*],
    [Linear algebra], [$#mA #vv _j = sigma_j #vu _j$; $mu_j = sigma_j^2$ for $#mX ^"T" #mX $], [Turn a coupled matrix problem into scalar directions.],
    [Numerical analysis], [Inverse norm, condition number, measurement error versus rounding error], [Measure how much input error can change the answer.],
    [Probability and statistics], [Conditional expectation; centered cross terms; covariance transforms], [Derive bias and variance without mixing random sources.],
    [Multivariable calculus and convex optimization], [Gradient, Hessian, positive definiteness; norm budgets and penalties], [Derive the estimator and prove that it is the unique minimum.],
  )
  #vfill()
  #text(size: 17pt, fill: muted)[The constrained-optimization/KKT correspondence is an optional extension; see the sheet’s PDF p. 15.]
]

#ws("17", [Connections to other CS, AI, and DS courses], section: "3 · How to study it", source: [Conceptual bridges · Bayesian and signal-processing interpretations are extensions])[
  #set text(size: 19pt)
  #set par(leading: 0.45em, spacing: 0.35em)
  #voice-table(columns: (1fr, 2.5fr),
    [*Neighboring topic*], [*Connection worth carrying forward*],
    [Signal processing / computational imaging], [Deblurring and source separation recover changes weakened by the measurement process. Ridge reduces amplification in each direction.],
    [Machine learning theory], [Norm-bounded linear classes illustrate fitting data while controlling coefficient size. A penalty alone does not change the VC dimension of an unchanged class.],
    [Experimental design / sensing], [Change the measurements to make weak directions more informative. This complements changing the estimator.],
    [Model evaluation], [Prediction risk means expected prediction error on new data. Selecting a penalty and evaluating the selected procedure need distinct evidence; keep the final test set untouched.],
  )
  #v(6pt)
  #text(size: 16pt, fill: muted)[Optional Bayesian connection: with Gaussian observation noise and an isotropic, zero-mean Gaussian prior, ridge gives the maximum a posteriori (MAP) estimate—the parameter value with highest posterior density.]
  #vfill()
  #text(size: 18pt, fill: muted)[These are conceptual links, not extra assessed prerequisites. Parameter-selection algorithms belong to the following chapter.]
]

#ws("18", [Mindmap 1 · The academic progression], section: "4 · Two views of the whole", source: source("3–14, 20–32"))[
  #voice-figure(academic-map())
]

#ws("19", [Mindmap 2 · What can the data actually reveal?], section: "4 · Two views of the whole", source: [Selected alternative: information audit · learning sheet PDF pp. 7–12, 28–31])[
  #voice-figure(information-map())
]

#ws("20", [Return to the microphones: what should we do?], section: "4 · Two views of the whole", source: [Original hook synthesis · learning sheet PDF pp. 28–32])[
  #set text(size: 20pt)
  #grid(columns: (1fr, 1fr), gutter: 24pt,
      card([What we know], [
      - The difference direction is weakly observed.
      - Exact inversion amplifies its measurement noise by 50.
      - Ridge reduces noise amplification but also shrinks the true source coefficients, introducing bias.
    ]),
    card([What we must still establish], [
      - How large is the noise relative to the weak signal?
      - Do we care about individual sources or only their sum?
      - What independent evidence supports the penalty choice?
    ], color: violet, fill: violet-pale),
  )
  #vfill()
  #voice-takeaway[The week's calculations show how a penalty changes bias, variance, and total expected error.]
]
