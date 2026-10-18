#!/usr/bin/env python3
"""Optional provider-backed semantic KG extraction for a generated deck."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tomllib
import unicodedata
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path


def normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def validate(graph: dict, manifest: dict) -> None:
    if not isinstance(graph, dict) or not isinstance(graph.get("concepts"), list) or not isinstance(graph.get("relationships"), list):
        raise ValueError("Model graph must contain concepts and relationships arrays")
    for item in graph["concepts"] + graph["relationships"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"].strip():
            raise ValueError("Graph IDs must be nonempty strings")
    slides = {slide["id"]: slide for slide in manifest["slides"]}
    concepts = {concept["id"]: concept for concept in graph.get("concepts", [])}
    if not concepts or not isinstance(graph.get("relationships"), list):
        raise ValueError("Model graph must contain concepts and a relationships array")
    if len(concepts) != len(graph["concepts"]): raise ValueError("Duplicate concept IDs")
    if len({r["id"] for r in graph["relationships"]}) != len(graph["relationships"]): raise ValueError("Duplicate relationship IDs")
    for concept in concepts.values():
        if not isinstance(concept.get("label"), str) or not concept["label"].strip(): raise ValueError("Missing concept label")
        if not isinstance(concept.get("mentions"), list) or not concept["mentions"]:
            raise ValueError(f"Concept has no evidence: {concept.get('id')}")
        for reference in concept["mentions"]:
            check_reference(reference, slides)
    for relation in graph["relationships"]:
        if not isinstance(relation.get("predicate"),str) or not relation["predicate"].strip(): raise ValueError("Missing relation predicate")
        if relation.get("source") not in concepts or relation.get("target") not in concepts:
            raise ValueError(f"Dangling relationship: {relation.get('id')}")
        if not isinstance(relation.get("evidence"), list) or not relation["evidence"]:
            raise ValueError(f"Relationship has no evidence: {relation.get('id')}")
        for reference in relation["evidence"]:
            check_reference(reference, slides)


def check_reference(reference: dict, slides: dict) -> None:
    if not isinstance(reference, dict) or not isinstance(reference.get("evidence"), str):
        raise ValueError("Evidence must contain a string quote or visual description")
    slide = slides.get(reference.get("slideId"))
    if not slide:
        raise ValueError(f"Unknown evidence slide: {reference.get('slideId')}")
    kind = reference.get("kind", "text")
    if kind == "text":
        quote = normalize(reference.get("evidence", ""))
        if not quote or quote not in normalize(slide.get("text", "")):
            raise ValueError(f"Unmatched text evidence on {slide['id']}")
    elif kind == "visual":
        region = reference.get("region")
        if not isinstance(region, list) or len(region) != 4 or not all(isinstance(value, (int, float)) and 0 <= value <= 1 for value in region):
            raise ValueError(f"Invalid visual region on {slide['id']}")
        if region[2] <= 0 or region[3] <= 0 or region[0] + region[2] > 1.001 or region[1] + region[3] > 1.001:
            raise ValueError(f"Visual region exceeds slide on {slide['id']}")
        if not reference.get("evidence"):
            raise ValueError(f"Missing visual description on {slide['id']}")
    else:
        raise ValueError(f"Unknown evidence kind: {kind}")
    reference["page"] = slide["page"]
    if kind == "visual":
        reference["asset"] = slide["asset"]


def endpoint_label(base: str) -> str:
    """Readable endpoint without URL credentials, query strings or fragments."""
    parsed = urlsplit(base)
    host = parsed.hostname or 'unknown-host'
    port = f':{parsed.port}' if parsed.port else ''
    return f'{parsed.scheme}://{host}{port}{parsed.path.rstrip("/")}/responses'


def provider_config(provider: str, *, diagnostics: bool = False) -> tuple[str, str, str]:
    if provider == "env":
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise ValueError("OPENAI_API_KEY is not set")
        base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.environ.get("OPENAI_MODEL", "gpt-4.1")
        credential_source = 'environment OPENAI_API_KEY'
    else:
        codex_dir = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser()
        config_path = codex_dir / "config.toml"
        if not config_path.exists():
            raise ValueError("No Codex provider configuration was found; use --graph-provider env")
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
        configured = config.get("model_providers", {}).get(config.get("model_provider"), {})
        if configured.get("wire_api", "responses") != "responses":
            raise ValueError("Expected a Responses API provider")
        base = configured.get("base_url", "https://api.openai.com/v1")
        model = config.get("model", "gpt-4.1")
        key_name = configured.get("env_key")
        if key_name:
            # An explicitly configured variable belongs to this provider. Never
            # fall back to an unrelated saved credential when it is missing.
            key = os.environ.get(key_name)
            if not key:
                raise ValueError(f"Codex provider requires environment variable {key_name}; it is not set")
            credential_source = f'environment {key_name} (configured env_key)'
        elif configured.get("experimental_bearer_token"):
            key = configured["experimental_bearer_token"]
            credential_source = 'configured bearer token'
        else:
            auth_path = codex_dir / "auth.json"
            auth = json.loads(auth_path.read_text(encoding="utf-8")) if auth_path.exists() else {}
            key = auth.get("OPENAI_API_KEY")
            if key:
                credential_source = f'{auth_path} (saved Codex API key)'
                if diagnostics and os.environ.get('OPENAI_API_KEY') and os.environ['OPENAI_API_KEY'] != key:
                    print('Ignoring a different OPENAI_API_KEY in this shell; --graph-provider env explicitly selects it.', file=sys.stderr)
            else:
                key = os.environ.get("OPENAI_API_KEY")
                credential_source = 'environment OPENAI_API_KEY (no saved Codex API key)'
        if not key:
            raise ValueError("The configured provider has no reusable API key. OAuth login alone is insufficient; use --graph-provider env with a provider API key.")
    if diagnostics:
        print(f'Model graph: {endpoint_label(base)}; model {model}; credential: {credential_source}', file=sys.stderr, flush=True)
    return base, key, model


def response_text(response: dict) -> str:
    chunks = []
    for item in response.get("output", []):
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                chunks.append(part.get("text", ""))
    return "".join(chunks) or response.get("output_text", "")


def request_model(base: str, key: str, model: str, content: list[dict], prompt: str) -> dict:
    body = {"model": model, "instructions": prompt, "input": [{"role": "user", "content": content}], "max_output_tokens": 18000, "store": False}
    if model.startswith(("gpt-5", "gpt-6", "o3", "o4")):
        body["reasoning"] = {"effort": "low"}
    request = urllib.request.Request(base.rstrip("/") + "/responses", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = ''
        try:
            payload = json.loads(error.read(65536))
            issue = payload.get('error', payload)
            parts = [issue] if isinstance(issue, str) else [issue.get('code'), issue.get('message')]
            detail = '; '.join(part for part in parts if isinstance(part, str))
            # Providers sometimes echo the rejected token in their message.
            detail = ' '.join(detail.replace(key, '[redacted]').split())[:600]
        except (ValueError, AttributeError, TypeError):
            pass
        message = f'Model provider returned HTTP {error.code} at {endpoint_label(base)}'
        if detail: message += f': {detail}'
        if error.code in (401, 403):
            message += '. Verify that the credential source printed above belongs to this endpoint; --graph-provider env uses OPENAI_API_KEY and OPENAI_BASE_URL explicitly.'
        raise RuntimeError(message) from None
    text = response_text(payload).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    return json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--provider", choices=["codex-config", "env"], default="codex-config")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    deck = root / "public" / "deck"
    manifest = json.loads((deck / "manifest.json").read_text(encoding="utf-8"))
    prompt_path = root / "prompts" / "concept-extraction.md"
    prompt = prompt_path.read_text(encoding="utf-8")
    base, key, model = provider_config(args.provider, diagnostics=True)
    fingerprint = hashlib.sha256((manifest["revision"] + manifest["deckId"] + prompt + model + base).encode()).hexdigest()
    cache = root / "cache" / "kg" / fingerprint
    cache.mkdir(parents=True, exist_ok=True)
    destination = deck / "knowledge-graph.json"
    cached = cache / "knowledge-graph.json"
    if cached.exists() and not args.force:
        graph = json.loads(cached.read_text(encoding="utf-8"))
        validate(graph, manifest)
        destination.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Loaded validated model graph cache")
        return 0
    content = [{"type": "input_text", "text": json.dumps({"slides": [{key: slide[key] for key in ("id", "page", "title", "section", "text", "source")} for slide in manifest["slides"]]}, ensure_ascii=False)}]
    visual_slides = manifest["slides"]  # Include vector diagrams and image-only pages too.
    for slide in visual_slides:
        image_path = cache / f"page-{slide['page']}.png"
        subprocess.run(["pdftoppm", "-f", str(slide["page"]), "-l", str(slide["page"]), "-singlefile", "-scale-to", "1200", "-png", str(deck / manifest.get("pdf", f"{manifest['deckId']}.pdf")), str(image_path.with_suffix(""))], check=True, capture_output=True)
        content.append({"type": "input_text", "text": f"Rendered slide {slide['id']}; use visible diagrams only when relevant. Visual evidence requires normalized [x,y,width,height]."})
        content.append({"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(image_path.read_bytes()).decode()})
    graph = request_model(base, key, model, content, prompt)
    (cache / "candidate.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2))
    try:
        validate(graph, manifest)
    except (ValueError, KeyError, TypeError) as error:
        # One bounded source-aware repair; never silently replace a semantic
        # graph request with lexical extraction.
        content.append({"type":"input_text", "text":"Repair the graph against the supplied slides. Validation error: " + str(error) + "\nCandidate: " + json.dumps(graph, ensure_ascii=False)})
        graph = request_model(base, key, model, content, prompt)
        validate(graph, manifest)
    graph.update({"schemaVersion": "1.0", "deckId": manifest["deckId"], "revision": manifest["revision"]})
    graph["extraction"] = {"mode": "model-assisted", "provider": args.provider, "model": model, "inputRevision": manifest["revision"], "promptHash": hashlib.sha256(prompt.encode()).hexdigest(), "fingerprint": fingerprint, "reviewRequired": True, "visualSlides": [slide["id"] for slide in visual_slides]}
    cached.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    destination.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"concepts": len(graph["concepts"]), "relationships": len(graph["relationships"]), "mode": "model-assisted", "revision": manifest["revision"]}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Model graph extraction failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
