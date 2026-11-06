# Graph extraction

`--graph local` is the default. It creates a deterministic, offline graph centered on important slide messages. `--graph model` explicitly supplies every slide's extracted text, metadata and 1200-pixel rendering to a Responses API model using `prompts/concept-extraction.md`. The model proposes important concepts, aliases and directed semantic relations with slide evidence. This runs during the build; the presentation itself is static and makes no model calls. Large decks can exceed a provider's context or image limits; extraction is currently one deck-wide request, not chunked processing.

The default `--graph-provider codex-config` reads `${CODEX_HOME:-~/.codex}/config.toml`. If the provider explicitly declares `env_key`, that variable is required. Otherwise it uses a configured bearer token, then the saved API key in the same Codex directory's `auth.json`, then `OPENAI_API_KEY` only when no saved API key exists. A generic shell key cannot override the saved Codex key; use `--graph-provider env` when that override is intended. A ChatGPT OAuth login alone is not a reusable API key. For explicit configuration:

```sh
export OPENAI_API_KEY=...
# Optional: OPENAI_BASE_URL (including /v1), OPENAI_MODEL (default gpt-4.1)
python3 scripts/typst_to_pigeon.py source.typ --graph model --graph-provider env
```

Validation requires unique concept/relationship IDs, known slide references and relation endpoints, nonempty evidence, exact normalized text quotes, and positive visual rectangles within the slide. A failed evidence/structure check receives one source-aware repair attempt. Evidence matching proves provenance, not semantic correctness: `extraction.reviewRequired` remains true. Relations can be empty for a simple deck; the model is not forced to invent edges.

Model output is cached by deck ID, revision, prompt, model and endpoint. `--force` rebuilds the presentation while retaining validated cache entries. No credentials enter the graph, bundle or ZIP. If credentials, the provider or validation fail, the build fails and the previous output stays intact. There is no silent lexical fallback.

The default `--graph local` (alias `lexical`) runs offline and selects messages in this order:

1. Authored Typst semantic roles: takeaways, answers, contrasts, questions and caveats. Each slide contributes at most two primary messages.
2. Source-level `#takeaway[...]` calls and marked takeaway regions. The exporter matches these against compiled PDF words, including calls from local imports.
3. One informative body statement, ranked by distinctive vocabulary, statement cues and relevance to the title. Repeated headers/footers, page counters, URLs and contact text are suppressed. Sparse or visual pages fall back to their titles or visual evidence.

Exact repeated messages merge and retain evidence from every contributing slide. A bounded set of recurring topics comes from selected messages and titles, rather than the whole slide's vocabulary. Section edges group messages. Explicit `sem.support(to: ...)`, hook/answer, contrast/answer and `sem.deep(...)` associations produce directed edges labeled `authored structure`. Source-only text and presenter notes are excluded.

Cross-slide `shares topic` edges require distinctive shared vocabulary in the selected content, including between nonadjacent slides. These and topic associations are labeled `heuristic` with their basis in the relationship details. Similarity does not establish causation, support, contradiction or entailment. There is no local paraphrasing model or automatic understanding of diagrams. English salience cues limit unmarked multilingual decks; explicit semantic roles and takeaways help. Both graph modes preserve exact normalized text evidence or visual references and set `reviewRequired`.

The graph view uses a deterministic clustered layout with relationship-aware ordering and separate card bounds. Its canvas grows with the graph instead of compressing nodes into a fixed rectangle. Scroll to explore; use **− / +**, **Fit** or **100%** above the graph. Arrow keys select concepts and scroll them into view; Enter opens evidence. Labels wrap, and the evidence panel retains the complete selected message. Edge crossings can remain in dense graphs; focusing a node highlights its incident relationships.

Rebuild an existing presentation to apply extraction/layout changes:

```sh
./typst-to-pigeon.sh source.typ --graph local --force
```

The default produces a standalone HTML file; retain your existing `--out-mode multiple` or TOML setting if you use a folder release. Previously generated releases retain their bundled runtime and graph until rebuilt.

Each model build prints the selected endpoint, model and credential source without the key. An HTTP 401/403 means that endpoint rejected the selected credential. Provider error details are shown with the key redacted; a failed build exits cleanly without a Python traceback. Do not retry with different credentials or silently change graph mode.
