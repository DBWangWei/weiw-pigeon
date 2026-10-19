"""Regenerate the mathematical illustrations; requires NumPy and Matplotlib."""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch
import numpy as np

ROOT = Path(__file__).resolve().parent
TEAL, VIOLET, INK, CORAL = "#007E87", "#7455A6", "#172C43", "#B6504A"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 15,
    "text.color": INK, "axes.labelcolor": INK,
    "xtick.color": INK, "ytick.color": INK,
    "axes.spines.top": False, "axes.spines.right": False,
    "svg.fonttype": "path", "axes.titlepad": 12,
})


def save(fig, name):
    fig.savefig(ROOT / name, format="svg", facecolor="white")
    plt.close(fig)


# The same constant-fit example is used in the slides and checks below.
y = np.array([1.0, 2.0, 4.0])
X = np.ones((3, 1))
beta = np.linalg.lstsq(X, y, rcond=None)[0]
residual = y - X @ beta
assert np.allclose(beta, [7 / 3])
assert np.allclose(residual, [-4 / 3, -1 / 3, 5 / 3])
assert np.allclose(X.T @ residual, 0)
assert np.isclose(residual @ residual, 14 / 3)
for delta in [-3, -.2, .5, 2]:
    assert np.isclose(np.sum((y - (beta[0] + delta))**2), 14 / 3 + 3 * delta**2)
assert np.isclose(np.sum((y - 1)**2), 10)
duplicate = np.ones((3, 2))
assert np.allclose(np.linalg.pinv(duplicate) @ y, [7 / 6, 7 / 6])
assert np.isclose(.02 / .01, 2)
assert np.isclose(.02 * .01 / (.01**2 + .01), .019801980198019802)

fig, ax = plt.subplots(figsize=(6.4, 4.3), layout="constrained")
ax.scatter([1, 2, 3], y, s=100, color=VIOLET, zorder=3)
for i, value in enumerate(y, 1):
    ax.annotate(f"{int(value)}", (i, value), xytext=(10, 4),
                textcoords="offset points", color=VIOLET)
ax.axhline(1.5, color=TEAL, linewidth=2.8, linestyle="--")
ax.text(.72, 1.65, "Any constant prediction: β", color=TEAL, fontsize=15)
ax.set(xlim=(.65, 3.4), ylim=(.5, 4.65), xticks=[1, 2, 3],
       xlabel="Observation index", ylabel="Response / prediction",
       title="One coefficient, three residuals")
ax.grid(axis="y", alpha=.15)
save(fig, "constant-fit.svg")

fig, ax = plt.subplots(figsize=(6.4, 4.3), layout="constrained")
origin, projection, response = (0, 0), (3.6, 0), (3.6, 2.5)
ax.axhline(0, color="#CBD6DE", linewidth=13, zorder=0)
ax.text(1.15, -.42, "col(X): feasible predictions", color=TEAL, fontsize=14)
for start, end, color in [(origin, response, VIOLET),
                          (origin, projection, TEAL),
                          (projection, response, CORAL)]:
    ax.add_patch(FancyArrowPatch(start, end, arrowstyle="-|>",
                                mutation_scale=18, color=color, linewidth=2.8))
ax.plot([3.35, 3.35, 3.6], [0, .25, .25], color=CORAL, linewidth=1.6)
ax.text(-.15, -.3, "0")
ax.text(1.4, 1.4, "y", color=VIOLET, fontsize=23)
ax.text(1.5, .18, "ŷ = Xβ̂", color=TEAL, fontsize=19)
ax.text(3.76, 1.25, "r", color=CORAL, fontsize=23)
ax.scatter([response[0]], [response[1]], color=VIOLET, s=45, zorder=4)
ax.set(xlim=(-.25, 4.25), ylim=(-.7, 3.05), aspect="equal",
       title="Schematic view in a two-dimensional plane")
ax.axis("off")
save(fig, "projection.svg")

singular = np.geomspace(.01, 1, 400)
penalty = .01
fig, axes = plt.subplots(1, 2, figsize=(12.5, 4.0), layout="constrained")
axes[0].plot(singular, 1 / singular, color=VIOLET, linewidth=2.5, label="OLS: 1/σ")
axes[0].plot(singular, singular / (singular**2 + penalty), color=TEAL,
             linewidth=2.5, label="Ridge: σ/(σ² + λ)")
axes[0].set(xscale="log", yscale="log", xlabel="Singular value σ",
            ylabel="Coefficient gain", title="Response → coefficients")
axes[0].legend(fontsize=12, loc="upper right")
axes[1].plot(singular, np.ones_like(singular), color=VIOLET,
             linewidth=2.5, label="OLS: 1")
axes[1].plot(singular, singular**2 / (singular**2 + penalty), color=TEAL,
             linewidth=2.5, label="Ridge: σ²/(σ² + λ)")
axes[1].set(xscale="log", xlabel="Singular value σ", ylabel="Fitted-value weight",
            title="Response → fitted values", ylim=(-.05, 1.12))
axes[1].legend(fontsize=12, loc="lower right")
for ax in axes:
    ax.grid(alpha=.18)
    ax.spines["left"].set_color("#CBD6DE")
    ax.spines["bottom"].set_color("#CBD6DE")
save(fig, "spectral-weights.svg")
print("Three SVG figures generated; numerical examples verified.")
