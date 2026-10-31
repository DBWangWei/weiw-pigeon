# Semantic tiers example

Six self-contained Typst pages demonstrate independent question/answer states, a decorated voice-target table, nested detail/support figure regions, multiple extracted takeaways, deep/back navigation, opaque same-position replacement, page-fill changes, public/private notes, page defaults, and a flat page.

The maintained `pigeon-tiers.typ` and `pigeon-sem.typ` are copied beside the source. No external images, styles or Typst packages are needed. `semantic-tiers.pdf` is the complete source document, including all authored roles in normal paint order.

From the repository root:

```sh
typst compile examples/semantic-tiers/semantic-tiers.typ examples/semantic-tiers/semantic-tiers.pdf
./typst-to-pigeon.sh examples/semantic-tiers/semantic-tiers.typ --output ../tmp/_for_weiw-pigeon/work/semantic-tiers/demo --graph local --no-zip --force
open ../tmp/_for_weiw-pigeon/work/semantic-tiers/demo/index.html
```

The TOML starts in Slide mode. Add `--mode step` to override it, or press N during presentation. For local voice recognition, run `python3 scripts/setup_voice.py` once, then `python3 scripts/serve.py` inside the generated folder and open the printed localhost URL. Microphone startup remains an explicit action; the manual target actions also work without recognition.

Read [TEST-THIS-DECK.md](TEST-THIS-DECK.md) for live checks and the [authoring reference](../../typst-to-pigeon/references/semantic-tiers.md) for the complete contract. Compilation and automated checks do not establish live browser appearance or microphone behavior.
