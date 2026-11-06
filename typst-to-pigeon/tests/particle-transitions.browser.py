"""Browser regression for camera/particle placement (requires Playwright Chromium).

Run against a generated standalone HTML deck with at least one section boundary:
    python3 particle-transitions.browser.py /path/to/pigeon-talk.html
    python3 particle-transitions.browser.py /path/to/pigeon-talk.html --presentation

Each run opens a fresh browser context, preserving the initial Camera selection.
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("deck", type=Path)
parser.add_argument("--presentation", action="store_true")
parser.add_argument("--width", type=int, default=1600)
parser.add_argument("--height", type=int, default=900)
parser.add_argument("--screenshot", type=Path)
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": args.width, "height": args.height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(args.deck.resolve().as_uri(), wait_until="domcontentloaded")
    page.wait_for_function("typeof booting !== 'undefined' && !booting && state.deck.slides.length > 1")
    assert page.locator("#slideTransitionSelect").input_value() == "camera"
    if args.presentation:
        # Same layout as presentation mode without native fullscreen resizing the test viewport.
        page.evaluate("reconcilePresentation(true)")
        page.wait_for_timeout(500)

    slides = page.evaluate("state.deck.slides.map(s => ({id:s.id, section:s.section, page:s.page}))")
    boundaries = [(a, b) for a, b in zip(slides, slides[1:]) if a["section"] != b["section"]]
    assert boundaries, "Deck needs a section boundary to exercise particle morph"
    # Reproduce the reported p7 -> p8 first; also cover every other section and reverse direction.
    boundaries.sort(key=lambda pair: pair[1].get("page") != 8)
    for source, target in boundaries + [(boundaries[0][1], boundaries[0][0])]:
        page.evaluate("id => navigateTo(id)", source["id"])
        page.wait_for_function("!pageTransitions.active && !pageTransitionPending")
        page.wait_for_timeout(450)
        page.evaluate("id => navigateTo(id)", target["id"])
        page.wait_for_selector(".particle-morph-overlay[data-particle-count]", state="attached")
        page.wait_for_timeout(450)
        geometry = page.evaluate("""() => {
            const particle = document.querySelector('.particle-morph-page');
            const overlay = document.querySelector('.particle-morph-overlay');
            const canvas = particle?.querySelector('canvas');
            return {
                particle: particle?.getBoundingClientRect().toJSON(),
                target: document.querySelector('.slide-frame.current').getBoundingClientRect().toJSON(),
                stage: els.stage.getBoundingClientRect().toJSON(),
                count: Number(overlay?.dataset.particleCount),
                drawn: canvas && canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i) => i%4===3 && v>0)
            };
        }""")
        assert geometry["particle"], "Particle overlay must still be animating"
        actual, expected, stage = geometry["particle"], geometry["target"], geometry["stage"]
        for key in ("x", "y", "width", "height"):
            assert abs(actual[key] - expected[key]) < 1, (
                f"{source['id']} -> {target['id']}: particle {key}={actual[key]:.2f}, "
                f"destination {key}={expected[key]:.2f}; morph captured moving camera geometry"
            )
        assert stage["left"] - 1 <= actual["left"] and actual["right"] <= stage["right"] + 1
        assert stage["top"] - 1 <= actual["top"] and actual["bottom"] <= stage["bottom"] + 1
        assert geometry["count"] > 0 and geometry["drawn"], "Particles must actually render"
        if args.screenshot and target.get("page") == 8:
            page.screenshot(path=str(args.screenshot))
        page.wait_for_function("!pageTransitions.active && !pageTransitionPending")
        assert page.locator(".page-transition-overlay").count() == 0
        assert page.locator(".slide-frame.current").get_attribute("data-slide-id") == target["id"]
        print(f"PASS visible morph {source['id']} -> {target['id']} ({geometry['count']} particles)", flush=True)

    same = next(((a, b) for a, b in zip(slides, slides[1:]) if a["section"] == b["section"]), None)
    if same:
        page.evaluate("id => navigateTo(id)", same[0]["id"])
        page.wait_for_function("!pageTransitions.active && !pageTransitionPending")
        page.wait_for_timeout(450)
        transition = page.evaluate("""id => {
            navigateTo(id);
            return {transition: els.world.style.transition, overlays: document.querySelectorAll('.page-transition-overlay').length};
        }""", same[1]["id"])
        assert "transform" in transition["transition"] and transition["overlays"] == 0
        print("PASS same-section Camera still animates", flush=True)

    # Cancelling and the app's reduced-motion control must not retain a stale overlay.
    page.evaluate("ids => { navigateTo(ids[0]); navigateTo(ids[1]); zoomAt(1.1); }", [boundaries[0][0]["id"], boundaries[0][1]["id"]])
    page.wait_for_timeout(200)
    assert page.locator(".page-transition-overlay").count() == 0
    page.evaluate("document.querySelector('#motionButton').click()")
    assert page.evaluate("state.reducedMotion")
    page.evaluate("id => navigateTo(id)", boundaries[0][0]["id"])
    assert page.locator(".page-transition-overlay").count() == 0
    print("PASS cancellation and reduced motion", flush=True)
    assert not errors, errors
    context.close()
    browser.close()
