# Slide transitions

The transition work was guided by the React Bits repository and its component patterns, especially FadeContent, AnimatedContent, Carousel, PixelTransition, Stack and StaggeredMenu. Pigeon keeps the visual ideas that fit a dependency-free presentation runtime and implements them with the Web Animations API and a small SVG clip mask. React, GSAP and Motion are not bundled.

Supported names are:

- `camera`: the original Pigeon infinite-canvas camera movement; this remains the default.
- `none`: fit the destination immediately.
- `fade`, `blur`, `slide`, and `zoom`: compact page-level adaptations of common content and carousel entrances.
- `pixel`: a deterministic pixel-grid reveal inspired by PixelTransition.
- `staggered-wipe`: a row-by-row wipe inspired by staggered panel entrances.
- `stack`: an outgoing card lift and incoming card settle inspired by Stack.

Use a persistent setting:

```toml
slide_transition = "camera"
```

Or override it for one build:

```sh
typst-to-pigeon talk.typ --slide-transition pixel
```

The Transition selector in the top bar can change the session after the release is open. Navigation, keyboard tools, drawing canvases, whiteboards and title effects remain available while a transition runs. A new navigation, zoom, overview action, reduced-motion change or session action cancels the current transition and removes its temporary overlay.
