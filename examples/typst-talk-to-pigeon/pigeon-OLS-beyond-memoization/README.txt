Pigeon
Interactive canvas presentation · OLS Beyond Memorization: Understanding the Normal Equations
Version 1.0.3

Double-click index.html to open the presentation directly. Keep the extracted folder together.
For predictable browser storage, run: python3 scripts/serve.py
Then open http://127.0.0.1:8765 in Chrome for voice recognition.

Keys: O overview, T hierarchy/graph, arrows/Enter select/open, / search, G jump,
R resume the talk, F presentation, B blackout. V navigation, L laser, P pen,
H highlighter, E eraser, M magic wand. Repeat a tool key to turn it off.
With a wand object lit, ` cycles Pop-out, Focus (isolated navy), Spotlight.
Takeaways start at Spotlight. Escape dismisses emphasis and keeps Wand selected.
In pen mode, a single ` toggles Pen down after a 300 ms double-tap window.
Double-tap ` in Pen or Diagram mode to undo while keeping the current tool.
Pen down draws without holding a button; compact mode notices sit at top right.
1/2/3/4 select red/blue/dark green/yellow. ? opens the shortcut guide.
D enters Diagram mode: V select, R rectangle, D diamond, O ellipse, A arrow,
L line, T text, H pan, S stroke color, G fill; Shift+T triangle, Shift+P
parallelogram, Shift+L routing. Enter creates/edits; Cmd/Ctrl+D duplicates;
Cmd/Ctrl+C/V/X copies/pastes/cuts. Arrows move; Cmd/Ctrl+Alt+arrows resize.
PageUp/PageDown navigate. Escape clears editing/selection, then exits.
Repeated list-only Overview/Outline pages group slides into numbered sections.
W inserts a whiteboard, Shift+W a blackboard, K keeps a board.
+/- zoom from 3% to 3200%; 0 fits the slide; Home fits the whole talk.
Initial title effect: text-type. Select None,
Split Text, Blur Text, Shiny Text, Gradient Text or Text Type in the top toolbar.
Initial slide transition: camera.
Use the Transition selector to change it for this viewing session.
Voice recognition enabled: True.
Open Voice, then click Start microphone in a supported browser.
Default voice backend: local Whisper. First run python3 scripts/setup_voice.py
once per presenting machine (CMake and a C++ compiler required; 142 MiB English model).
Then restart scripts/serve.py. Configure voice.backend = "browser" to use
Chrome's on-device engine instead. No remote recognition fallback is used.
Manual semantic actions remain available when recognition is disabled or unsupported.
The graph was generated in lexical mode (53 concepts,
96 relationships). Review graph evidence before publishing claims.
The slide source is typst; the PDF is bundled.
Export PDF beside Present in the top bar preserves the original pages
and adds all ink and inserted white/black boards, including drafts. Works offline.
