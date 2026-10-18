# Graph extraction

`--graph local` is the default. It creates a deterministic, offline graph from slide and section nodes plus recurring terms. `--graph model` explicitly supplies every slide's extracted text, metadata and 1200-pixel rendering to a Responses API model using `prompts/concept-extraction.md`. The model proposes important concepts, aliases and directed semantic relations with slide evidence. This runs during the build; the presentation itself is static and makes no model calls. Large decks can exceed a provider's context or image limits; extraction is currently one deck-wide request, not chunked processing.

The default `--graph-provider codex-config` reads `${CODEX_HOME:-~/.codex}/config.toml`. If the provider explicitly declares `env_key`, that variable is required. Otherwise it uses a configured bearer token, then the saved API key in the same Codex directory's `auth.json`, then `OPENAI_API_KEY` only when no saved API key exists. A generic shell key cannot override the saved Codex key; use `--graph-provider env` when that override is intended. A ChatGPT OAuth login alone is not a reusable API key. For explicit configuration:

```sh
export OPENAI_API_KEY=...
# Optional: OPENAI_BASE_URL (including /v1), OPENAI_MODEL (default gpt-4.1)
python3 scripts/typst_to_pigeon.py source.typ --graph model --graph-provider env
```

Validation requires unique concept/relationship IDs, known slide references and relation endpoints, nonempty evidence, exact normalized text quotes, and positive visual rectangles within the slide. A failed evidence/structure check receives one source-aware repair attempt. Evidence matching proves provenance, not semantic correctness: `extraction.reviewRequired` remains true. Relations can be empty for a simple deck; the model is not forced to invent edges.

Model output is cached by deck ID, revision, prompt, model and endpoint. `--force` rebuilds the presentation while retaining validated cache entries. No credentials enter the graph, bundle or ZIP. If credentials, the provider or validation fail, the build fails and the previous output stays intact. There is no silent lexical fallback.

The default `--graph local` (alias `lexical`) runs offline. This deterministic fallback creates slide/section nodes and recurring text terms; edges are `contains` and `mentions`. It supports Unicode labels and blank pages, with exact text evidence or a whole-page visual reference. It does not infer semantic relations. English stop words and token-length heuristics limit its usefulness for other languages. Both modes emit the same graph identity/evidence contract and keep review status visible.

Each model build prints the selected endpoint, model and credential source without the key. An HTTP 401/403 means that endpoint rejected the selected credential. Provider error details are shown with the key redacted; a failed build exits cleanly without a Python traceback. Do not retry with different credentials or silently change graph mode.
