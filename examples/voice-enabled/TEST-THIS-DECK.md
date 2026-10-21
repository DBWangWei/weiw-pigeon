# Rehearse the voice-enabled Week 5 deck

1. Build the example from the repository root using the command in `README.md`.
2. Run `python3 scripts/setup_voice.py` once, then start `scripts/serve.py`.
3. Open the printed localhost URL in Chrome, choose the USB or built-in
   microphone, and click **Start microphone** in the Voice panel.
4. Say a phrase, pause briefly, and watch the panel stages: input, speech,
   transcription, phrase match, target resolution, and action.

Useful checks:

- “this table” on slides 4, 5, 11, 13, 15, 16, or 17 → Focus.
- “this figure” or “show the diagram” on slides 2, 18, or 19 → Spotlight.
- “this example” on slides 4 or 10 → Pop-out.
- “key message” or “take away message” on slides 4, 5, 9, 10, 12, 13, or 20
  → stacked Pop-outs.

If a phrase matches several targets, choose the numbered target shown in the
Voice panel. **Copy diagnostic report** separates microphone capture,
recognition, matching, action, and artwork failures for troubleshooting.
