# Voice targets in Typst

Voice rules select explicitly marked artwork on the current physical page. The
default target names are `takeaway`, `_table`, `_fig`, and `_example`. The builder
does not infer the identity of an arbitrary Typst function from its SVG.

Copy `assets/pigeon-sem.typ` into your Typst project and import its helpers. Wrap
the complete decorated result, inside any alignment wrapper, so the bounds
include its background and inset:

```typst
#import "pigeon-sem.typ": pigeon-sem, pigeon-hidden

#let takeaway(body) = pigeon-sem("takeaway", takeaway-style(body))
#let _table(..args) = align(center,
  pigeon-sem("_table", table-style(table(..args))))
#let _fig(..args) = align(center,
  pigeon-sem("_fig", fig-style(..args)))
#let _example(body) = pigeon-sem("_example", example-style(body))
```

The `*-style` functions above stand for your existing visual code. Keep that code
inside the marker. A marker around `align(center, ...)` would describe the
alignment container rather than the tight decorated object. Mark one object
that fits on one physical page; split content that spans pages into separate
markers. Use concrete page/grid widths for the surrounding layout. The helper
keeps the original available width when rendering percentage-sized bodies.

An optional `id: "loss-plot"` supplies a stable ID. IDs must be unique within a
physical page and may repeat on different reveal pages. Without an ID, the
exporter generates a deterministic page-local ID. Custom target names can match
custom voice rules.

Hidden reveal content needs an explicit visibility signal. Plain Typst `hide()`
can retain metadata, so replace it with `pigeon-hidden(body)` for marked content:

```typst
#let reveal(show, body) = if show { body } else { pigeon-hidden(body) }
#reveal(false, pigeon-sem("_example", example-style[Not visible yet]))
```

Nested `pigeon-hidden` calls are supported. Alternatively, pass
`visible: false` when your existing reveal helper hides the artwork. The
`visible` option controls semantic visibility; it does not paint or hide the
body itself:

```typst
#pigeon-sem("_fig", hide(fig-style()), visible: false)
```

Markers carry no visible paint. For an author-side comparison, compile the same
source with `--input pigeon-sem=on` and `--input pigeon-sem=off`; off returns the
original unwrapped body. The standard builder uses on and never rewrites source
files. Its query uses `<pigeon-sem>` and each marker's physical location, so
logical page counter resets and repeated reveal slide IDs do not merge targets.

Each manifest slide contains
`semanticRegions: [{id, target, x, y, width, height}]`. Coordinates use that
slide's native SVG units. Hidden entries are omitted; nonfinite, empty,
out-of-page, or duplicate visible bounds fail the export. PDF input has empty
semantic regions. `build-report.json` includes total/visible/hidden counts,
counts by target, and a semantic region count per physical page.


## Start and use voice

Generate a deck normally and use Chrome. In the generated presentation folder,
install the local speech helper once per presenting machine:

```sh
python3 scripts/setup_voice.py
python3 scripts/serve.py
```

Setup requires CMake and a C++ compiler (Xcode Command Line Tools on macOS). It
fetches pinned whisper.cpp v1.9.5 and the English `base.en` model (142 MiB), verifies
their SHA-256 checksums, and builds a persistent CPU decoder. The default install
location is `~/.cache/pigeon-voice`, shared by your decks. To choose a different
location, pass `--directory /path/to/voice` during setup and set
`PIGEON_VOICE_DIR=/path/to/voice` when running the server. Setup downloads code
and a model; microphone audio never goes to a remote service. The model/helper
are not duplicated in each deck's ZIP. The installed engine source includes its
MIT license. Once installed, inference works without an Internet connection.

The server prints **Local Whisper ready** or a concrete setup error. Open its
localhost URL, open **Voice**, and click **Start microphone**. Recognition uses
the selected stream, detects speech, waits for a brief pause (0.7 seconds), then
transcribes a short utterance locally. Sustained speech is split at eight seconds.
This backend returns final text after decoding; it does not produce interim text.
The panel shows speech detection, transcription in progress, decode duration,
and the returned words. Latency depends on your machine and utterance length.
A microphone test alone does not start transcription.

Initially, capture uses Chrome's default microphone. For an external or USB
microphone, click **Find microphones**, allow microphone access, then select it
under **Microphone device**. Changing devices stops recognition; click
**Start microphone** again. The live meter describes the same captured stream
sent to Whisper. A failed device request stops with an error and never silently
selects another device. Device choices last for this page visit. Capture and
pending responses are cancelled on mute, slide changes, inactive views or page
exit. An inference already running may finish, but its late reply cannot act on
a new slide. Audio buffers, queue and diagnostic history are bounded.

Recognition is enabled in newly generated decks by default, but capture starts
only after a click. `--no-voice` or `[voice] enabled = false` disables recognition;
`--voice` overrides the file. Server `--no-voice` skips loading the native worker.
Missing setup leaves manual controls available. Direct-file/static hosting cannot
invoke the native helper; use Pigeon's server for Whisper.

For Chrome's on-device recognizer instead, configure `[voice] backend = "browser"`.
That backend checks/installs the browser-managed language pack on Start, requires
`processLocally = true`, and never falls back to cloud recognition. Some Chrome
installations detect speech but return no words; the default Whisper backend
avoids that browser decoder. `boost` applies only to browser phrase hints.

The supplied model supports English (`lang = "en-US"`). For another language,
use a compatible multilingual whisper.cpp model via server `--voice-model`,
and configure the matching `lang` and phrases. English-only models reject other
languages explicitly. `--voice-helper` and `--voice-threads` also configure the
server; model paths and native binaries are machine settings, outside deck TOML.

Open the Voice panel for status, recent words, a bounded trigger log, rule
buttons, ambiguity choices and semantic bounds. These are transient memory only;
audio and transcripts are not saved in the deck, sessions, or PDF/PNG exports.
The existing graph-generation option is independent of recognition.

## Diagnose a voice problem

Open **Voice** to see the five stages and **Artwork**. The panel shows browser
backend, page protocol, secure-context status, model/pack, raw recognized text,
interim/final result counts, phrase matches, current-page target IDs, and the
action outcome. Cooldown, slide-change delay, recent dismissal and inactive-view
rejections are shown explicitly. Audio/sound/speech events are reported separately;
a recognizer that has started is not proof that it has received sound or words.

1. Click **Test microphone** and speak. This stops recognition first and leaves
   it stopped until you click **Start microphone**. Use **Find microphones** to
   unlock device names and select your external microphone. The input meter
   and dBFS value show whether the chosen microphone receives sound. The test
   stops after 15 seconds or on Stop; it does not record, play back, upload or
   store audio. It runs separately from recognition and is available even when
   this browser lacks local recognition. It reports the actual device name,
   track enabled/muted status, sample rate, and AudioContext state. A suspended
   meter is reported as unmeasured. A signal can be noise rather than speech.
2. Click **Start microphone** and say a trigger. **Recognition** shows capture and
   speech events; **Recognized text** shows the latest raw interim/final result.
   No result means recognition has not delivered text. Wrong text points to
   recognition or input quality; correct text with no match points to the phrase list.
   The meter stays active during recognition and reports
   that the same track feeds the recognizer. Whisper shows “Transcribing” after a
   pause, followed by decode duration and text (or “no words decoded”). A local
   service error stops recognition and leaves the input/action stages visible.
   For the optional browser backend, three consecutive `aborted` errors
   without results stop automatic retries; input may be silent or the local
   recognition service may be failing. The report keeps the last five sessions'
   durations, result counts, sound/speech events, and errors.
3. **Phrase match**, **Target on current slide**, **Action**, and **Artwork** show
   what happened after recognition. An artwork error identifies a failed image
   load; a loaded image and attached overlay still need a visual check.
4. Enter “this table” in **Test a phrase without the microphone** and click
   **Test phrase** on demo page 1. This uses the real phrase matcher, target
   resolver and effect, bypassing recognition and voice cooldowns. Typed tests
   are labelled so they cannot be confused with recognition results. The manual
   rule buttons test the resolver/effect directly.

Use **Copy diagnostic report** to reveal a selectable report and copy it when
clipboard access is available. It includes browser capabilities, current target
bounds, configured rules, latest recognized text, and a bounded event trace. It
stays in memory until you explicitly copy it; Pigeon does not send it anywhere.
Report text is a snapshot at the time of the click. Recognition and all input-test
tracks stop when leaving the page.

Chrome microphone permission is scoped to the origin, including its port.
Use the address-bar site controls → **Site settings → Microphone → Allow**, and
keep the same localhost host and port between visits. Chrome's ordinary settings
have no switch to allow all localhost ports; managed installations can use the
`AudioCaptureAllowedUrls` policy. macOS microphone permission for Chrome is
separate from the permission granted to other apps.

## Rules and effects

See [config.md](config.md#local-voice-triggers) for all settings and defaults.
Rules map phrases to marked target names and one of three effects:

| Action | Display |
| --- | --- |
| `pop` | Enlarged SVG crop over a dimmed, blurred backdrop |
| `focus` | Enlarged original artwork on a navy backdrop with yellow outline |
| `spotlight` | Enlarged original artwork over a darker slide backdrop |

All crops use original SVG artwork and native page geometry. `multi = "stack"`
shows every match in page order with a shared scale. `multi = "ask"` offers
numbered choices; click any choice or use keys 1–9 for the first nine. No match
leaves the slide unchanged and records feedback.
Configure any marked function name as `target`, and use `phrases` for English,
Chinese, or another language supported by the selected local model/pack.
Change `lang` with the phrases.

The browser backend can trigger actions before a phrase is final. Revised interim
results are deduplicated; a later correction does not undo an action. Cooldowns,
a slide-change delay, and dismissal suppression reduce repeated or late actions.
Explicit manual controls bypass voice cooldowns. Dismiss with Escape, backdrop
click, navigation, or the same manual rule again. Different rules replace the
current crop. `auto_close_ms = 0` keeps it open until dismissed.

| Key outside Diagram mode | Action |
| --- | --- |
| `Shift+M` | Mute or resume recognition |
| `Shift+K/T/F/E` | Default takeaway/table/figure/example rule |
| `Shift+D` | Toggle marked bounds |
| `1`–`9` while choices are shown | Select a match |
| `Escape` | Dismiss choices, bounds or emphasis |

The four manual rule keys use rule IDs `takeaway`, `table`, `figure`, `example`.
Custom IDs have buttons in the Voice panel. `M` and `D` keep their existing Wand
and Diagram meanings. Diagram mode owns its Shift shortcuts; panel buttons
remain available. Typing in a field does not fire voice shortcuts. Recognition
pauses dispatch during media playback and while viewing overview, boards,
blackout or dialogs.

The built-in command phrases also control presentation state: “next page” and
“previous page” use normal deck navigation; “go to page N” selects a physical
page and clamps out-of-range numbers to the nearest page; “full screen” enters
presentation mode; “go to overview” opens the hierarchy; “go to graph view”
opens the graph overview; and “pen mode”, “highlight mode”, “wand mode”,
“diagram mode”, and “default mode” select the corresponding tool. `default mode`
returns to navigation and clears any active drawing tool. Custom commands use
`[[voice.commands]]` with `id`, `phrases`, and one of the supported `command`
values documented in [config.md](config.md#local-voice-triggers). The Q&A
command “take questions now” (also “take any questions now”) starts a bounded
in-memory transcript item when `[qa] enabled = true`.

## Rehearsal

The automated suite checks matcher revisions, lifecycle failure paths, local-only
API gating, exact Typst marker pixels and runtime controls. It cannot establish
microphone accuracy or latency. Install the local helper/model (or the optional
browser language pack) before the talk, confirm offline operation, rehearse every trigger and multi-match
choice, and test denied permission, missing input devices and prolonged silence.
Tune phrases (and browser-only boost) to reduce false triggers; use a close microphone and mute
during audience questions. The draft targets of under one second latency and at
most one false trigger per 30 minutes require measurement during that rehearsal.
