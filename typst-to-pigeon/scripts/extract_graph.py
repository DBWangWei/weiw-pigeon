#!/usr/bin/env python3
"""Build a source-grounded knowledge graph from a Pigeon manifest.

The default local extractor is deterministic and needs no API key. It treats slide
titles, sections and recurring content terms as concepts, then records exact
slide-text evidence for the relationships. Provider-backed extraction lives in
``model_graph.py`` so a static release never depends on credentials.
"""
from __future__ import annotations

import hashlib
import argparse
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

STOPWORDS = {
    "about", "after", "again", "against", "also", "among", "and", "are", "because", "been", "being",
    "before", "between", "both", "but", "can", "could", "course", "does", "each", "from", "have", "into",
    "more", "most", "much", "must", "only", "other", "over", "same", "should", "some", "such", "than",
    "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "very",
    "were", "what", "when", "where", "which", "while", "with", "would", "your", "will", "using", "used", "use",
    "from", "slide", "into", "without",
}


def normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def slug(value: str, fallback: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", normalize(value)).strip("-")
    return (result or fallback) + "-" + hashlib.sha256(value.encode()).hexdigest()[:6]


def quote_for(slide: dict, preferred: str = "") -> str:
    text = normalize(slide.get("text", ""))
    if preferred and normalize(preferred) in text and len(normalize(preferred)) >= 4:
        return preferred.strip()
    for line in re.split(r"[\n.!?]", slide.get("text", "")):
        line = " ".join(line.split())
        if len(line) >= 4:
            return line[:220]
    return slide.get("text", "").strip()


def evidence(slide: dict, preferred: str = "") -> dict:
    if not slide.get("text", "").strip():
        return {"slideId":slide["id"],"kind":"visual","evidence":"Rendered slide", "region":[0,0,1,1],"page":slide["page"]}
    return {"slideId": slide["id"], "kind": "text", "evidence": quote_for(slide, preferred), "page": slide["page"]}


def tokens(text: str) -> list[str]:
    return [token.casefold() for token in re.findall(r"[^\W\d_][\w'-]+", text)]


def validate(graph: dict, manifest: dict) -> None:
    slides = {slide["id"]: slide for slide in manifest["slides"]}
    concepts = {concept["id"]: concept for concept in graph["concepts"]}
    if not concepts or not graph["relationships"]:
        raise ValueError("The graph needs at least one concept and one relationship")
    relation_ids = set()
    for concept in concepts.values():
        if not concept.get("mentions"):
            raise ValueError(f"Concept has no evidence: {concept['id']}")
        for ref in concept["mentions"]:
            slide = slides.get(ref.get("slideId"))
            if not slide:
                raise ValueError(f"Unknown evidence slide: {ref.get('slideId')}")
            if ref.get("kind") != "visual" and normalize(ref.get("evidence", "")) not in normalize(slide.get("text", "")):
                raise ValueError(f"Evidence is not copied from slide {slide['id']}: {ref.get('evidence')}")
    for relation in graph["relationships"]:
        if relation["id"] in relation_ids:
            raise ValueError(f"Duplicate relationship: {relation['id']}")
        relation_ids.add(relation["id"])
        if relation["source"] not in concepts or relation["target"] not in concepts:
            raise ValueError(f"Dangling relationship: {relation['id']}")
        if not relation.get("evidence"):
            raise ValueError(f"Relationship has no evidence: {relation['id']}")
        for ref in relation["evidence"]:
            slide = slides.get(ref.get("slideId"))
            if not slide:
                raise ValueError(f"Unknown relationship evidence slide: {ref.get('slideId')}")
            if ref.get("kind") != "visual" and normalize(ref.get("evidence", "")) not in normalize(slide.get("text", "")):
                raise ValueError(f"Relationship evidence is not copied from slide {slide['id']}")


def build_local(manifest: dict) -> dict:
    slides = manifest["slides"]
    concepts: dict[str, dict] = {}
    relationships: list[dict] = []
    used_relationships: set[str] = set()

    def add_concept(concept: dict) -> None:
        concepts.setdefault(concept["id"], concept)

    def add_relation(source: str, target: str, predicate: str, slide: dict, preferred: str) -> None:
        rid = f"{source}-{predicate.replace(' ', '-')}-{target}-{slide['id']}"
        if rid in used_relationships:
            return
        used_relationships.add(rid)
        relationships.append({
            "id": rid, "source": source, "target": target,
            "predicate": predicate, "status": "observation", "qualification": "",
            "evidence": [evidence(slide, preferred)],
        })

    # Slide and section nodes are always useful in the overview, even when the
    # source deck is too short for meaningful term extraction.
    sections: dict[str, dict] = {}
    for slide in slides:
        sid = f"slide-{slug(slide['id'], 'slide')}"
        slide["_concept_id"] = sid
        add_concept({
            "id": sid, "label": slide.get("title") or f"Slide {slide['id']}",
            "aliases": [slide["id"]], "type": "slide", "description": f"Source slide {slide['id']} in the talk.",
            "importance": 3, "cluster": slide.get("section") or "Talk",
            "mentions": [evidence(slide, slide.get("title", ""))],
        })
        section_label = slide.get("section") or "Talk"
        section_id = f"section-{slug(section_label, 'talk')}"
        sections.setdefault(section_id, {"id": section_id, "label": section_label, "slides": []})["slides"].append(slide["id"])
    for section_id, section in sections.items():
        first = next(slide for slide in slides if slide["id"] in section["slides"])
        add_concept({
            "id": section_id, "label": section["label"], "aliases": [], "type": "section",
            "description": f"A section containing {len(section['slides'])} source slide(s).", "importance": 4,
            "cluster": section["label"], "mentions": [evidence(first, first.get("title", ""))],
        })
        for slide in slides:
            if slide["id"] in section["slides"]:
                add_relation(section_id, slide["_concept_id"], "contains", slide, slide.get("title", ""))

    # Recurring terms make the graph useful across slides without pretending
    # that a bag-of-words extractor understands a claim's causal meaning.
    document_frequency = Counter()
    term_slides: defaultdict[str, list[dict]] = defaultdict(list)
    display: dict[str, str] = {}
    for slide in slides:
        words = tokens(slide.get("text", ""))
        counts = Counter(word for word in words if len(word) >= 5 and word not in STOPWORDS and not word.isdigit())
        for word, count in counts.items():
            document_frequency[word] += 1
            term_slides[word].append(slide)
            display.setdefault(word, word)
    total = len(slides)
    scored = sorted(document_frequency, key=lambda word: (document_frequency[word] * math.log1p(total / document_frequency[word]), word), reverse=True)
    for word in scored[: min(24, max(6, len(scored)))]:
        mentions = term_slides[word][:3]
        term_id = f"concept-{slug(word, 'term')}"
        add_concept({
            "id": term_id, "label": display[word].replace("_", " "), "aliases": [], "type": "concept",
            "description": f"The source uses {display[word]} as a recurring talk concept.",
            "importance": min(5, 1 + document_frequency[word]), "cluster": "Across the talk",
            "mentions": [evidence(slide, word) for slide in mentions],
        })
        for slide in mentions:
            add_relation(slide["_concept_id"], term_id, "mentions", slide, word)

    if not relationships and len(slides) == 1:
        # A one-slide source can still expose a navigable graph.
        slide = slides[0]
        section_id = next(iter(sections))
        add_relation(section_id, slide["_concept_id"], "contains", slide, slide.get("title", ""))
    for slide in slides:
        slide.pop("_concept_id", None)
    return {
        "schemaVersion": "1.0", "deckId": manifest["deckId"], "revision": manifest["revision"],
        "extraction": {"mode": "lexical", "provider": "local", "reviewRequired": True,
                        "inputRevision": manifest["revision"], "method": "titles-sections-recurring-terms"},
        "concepts": list(concepts.values()), "relationships": relationships,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="Generated Pigeon output directory")
    parser.add_argument("--mode", choices=["local", "lexical"], default="local")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    deck = root / "public" / "deck"
    manifest = json.loads((deck / "manifest.json").read_text(encoding="utf-8"))
    graph = build_local(manifest)
    validate(graph, manifest)
    destination = deck / "knowledge-graph.json"
    destination.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"concepts": len(graph["concepts"]), "relationships": len(graph["relationships"]), "mode": graph["extraction"]["mode"], "revision": manifest["revision"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
