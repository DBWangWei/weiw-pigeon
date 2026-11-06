#!/usr/bin/env python3
"""Build a source-grounded knowledge graph from a Pigeon manifest.

The default local extractor is deterministic and needs no API key. It treats
authored semantic roles and takeaways as primary messages, with conservative
text salience and topic similarity as fallbacks. All nodes and links retain
compiled slide evidence. Provider-backed extraction lives in
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
    if not concepts:
        raise ValueError("The graph needs at least one concept")
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


# These words describe presentation furniture rather than subject matter.
STOPWORDS |= set("a an as at be by do for has how if in is it its may no not of on or our per so the to was we you us via et al page pages lecture university introduction overview summary takeaway answer question example figure table copyright www http https now here key important result show shows need needs make makes get gets".split())
ROLE_WEIGHTS = {"takeaway": 100, "answer": 90, "contrast": 85, "hook": 75, "caveat": 65, "support": 55, "detail": 40}
TOPIC_STOPWORDS = STOPWORDS | set("different every explain explains shown following first second third outline agenda background remarks consider observe observation result results holds let proof theorem definition proposition corollary example examples choose setting generally simply increase decrease reduce increases decreases reduces".split())
CLAIM_WORDS = re.compile(r"\b(is|are|means?|depends?|reduces?|increases?|requires?|because|therefore|instead|remains?|can|cannot|must|should|trade|explains?|predicts?|constrains?|defined|equals?|suffices|shattered|bounds?|denotes?|converges?|implies|exists?)\b", re.I)


def content_words(text: str) -> list[str]:
    return [word for word in tokens(text) if word not in STOPWORDS and len(word) >= 3]


def grounded(slide: dict, text: str) -> str:
    """Never substitute source markup or notes for visible, compiled evidence."""
    value = " ".join(text.split()).strip(" •·▪-\t")
    compiled = slide.get("text", "")
    if len(value) < 4:
        return ""
    if normalize(value) in normalize(compiled):
        return value
    # PDF layout and bbox text can disagree about spaces around math glyphs.
    # Align without whitespace, then quote the actual contiguous PDF span.
    chars, offsets = [], []
    for index, char in enumerate(compiled):
        for normalized in unicodedata.normalize("NFKC", char).casefold():
            if not normalized.isspace():
                chars.append(normalized); offsets.append(index)
    needle = "".join(normalize(value).split())
    start = "".join(chars).find(needle)
    if start < 0:
        return ""
    return " ".join(compiled[offsets[start]:offsets[start + len(needle) - 1] + 1].split())


def short_message(text: str, limit: int = 200) -> str:
    if len(text) <= limit:
        return text
    prefix = text[:limit]
    return prefix.rsplit(" ", 1)[0] if " " in prefix else prefix


def region_text(slide: dict, region: dict) -> str:
    if not all(key in region for key in ("x", "y", "width", "height")):
        return ""
    selected = []
    for item in slide.get("textRegions", []):
        x, y = item.get("x", 0) + item.get("width", 0) / 2, item.get("y", 0) + item.get("height", 0) / 2
        if region["x"] <= x <= region["x"] + region["width"] and region["y"] <= y <= region["y"] + region["height"]:
            selected.append(item)
    return grounded(slide, " ".join(item["text"] for item in sorted(selected, key=lambda r: (r.get("y", 0), r.get("x", 0)))))


def message_candidates(slide: dict, boilerplate: set[str], df: Counter, total: int) -> list[dict]:
    """Prefer authored roles, then callouts, then distinctive body statements."""
    candidates = []
    def add(text, role, weight, origin, author_id=None, to=None):
        text = grounded(slide, text)
        if not text or not content_words(text):
            return
        candidates.append(dict(text=text, role=role, score=weight, origin=origin, authorId=author_id, to=to))
    for role in slide.get("semanticTiers", {}).get("roles", []):
        if role.get("role") in ROLE_WEIGHTS:
            text = grounded(slide, role.get("text", "")) or region_text(slide, role)
            add(text, role["role"], ROLE_WEIGHTS[role["role"]], "typst-role", role.get("id"), role.get("to"))
    for hint in slide.get("keyMessages", []):
        add(hint.get("text", ""), "takeaway", 99, "typst-takeaway")
    for region in slide.get("semanticRegions", []) + slide.get("wandRegions", []):
        if region.get("target", region.get("kind")) == "takeaway":
            add(region.get("text") or region_text(slide, region), "takeaway", 95, "takeaway-region")
    authored = sorted(candidates, key=lambda c: (-c["score"], normalize(c["text"])))
    unique = []
    for item in authored:
        # Nested wrappers and multiple marker systems may quote the same callout.
        if not any(normalize(item["text"]) in normalize(c["text"]) or normalize(c["text"]) in normalize(item["text"]) for c in unique):
            unique.append(item)
    if unique:
        return unique
    title = normalize(slide.get("title", ""))
    section = normalize(slide.get("section", ""))
    title_words = set(content_words(slide.get("title", "")))
    if re.search(r"\b(?:references|bibliography)\b", title):
        return [dict(text=slide["title"], role="topic", score=1, origin="title", authorId=None, to=None)]
    if re.fullmatch(r"(?:\d+\s*[·.:-]\s*)?(?:outline|overview|agenda)", title):
        text = grounded(slide, slide.get("section", "")) or slide.get("title")
        return [dict(text=text, role="topic", score=1, origin="title", authorId=None, to=None)]
    chunks = [r.get("text", "") for r in slide.get("textRegions", [])
              if slide.get("height", 1000) * .075 <= r.get("y", 0) < slide.get("height", 1000) * .92]
    chunks += slide.get("text", "").splitlines()
    # Compiled text preserves formulas that bbox text sometimes separates into
    # different blocks. Join wrapped lines before sentence scoring so a fragment
    # cannot outrank the complete claim simply because its words are rarer.
    paragraphs, pending = [], []
    for line in slide.get("text", "").splitlines() + [""]:
        key = normalize(line)
        furniture = (key in {title, section, normalize(slide.get("source", ""))} or
                     re.sub(r"\d+", "#", key) in boilerplate or
                     bool(re.search(r"\b\d+\s*/\s*\d+\s*$|\bpage\s+\d+\s*$", line, re.I)))
        if not line.strip() or furniture:
            if pending: paragraphs.append(" ".join(pending)); pending = []
        else:
            pending.append(line.strip())
    chunks += paragraphs
    # Also consider a paragraph suffix beginning on each physical line. This
    # separates conclusions following formulas/tables from their numeric setup.
    raw_lines = slide.get("text", "").splitlines()
    for index, line in enumerate(raw_lines[:120]):
        if not re.match(r"\s*[A-Z][a-z]", line): continue
        if normalize(line) in {title, section, normalize(slide.get("source", ""))}: continue
        suffix = []
        for following in raw_lines[index:index+6]:
            if not following.strip(): break
            suffix.append(following.strip())
            if re.search(r"[.!?。！？]$", following.strip()): break
        if suffix: chunks.append(" ".join(suffix))
    for chunk in chunks:
        # Split paragraphs and bullets, retaining exact textual substrings.
        for sentence in re.split(r"(?<=[.!?。！？])\s+|[•▪]", chunk):
            # Parenthetical bibliographic attribution is evidence context, not
            # the message itself. The remainder remains an exact source quote.
            sentence = re.sub(r"^\s*\([^)]*\b(?:19|20)\d{2}[^)]*\)\s*", "", sentence)
            sentence = grounded(slide, sentence)
            words = content_words(sentence)
            key = normalize(sentence)
            if not words or len(sentence) < 14 or key in boilerplate or key in {title, section}:
                continue
            if re.search(r"https?://|www\.|copyright|©|\S+@\S+", sentence, re.I):
                continue
            if "\ufffd" in sentence or sum(c.isalpha() for c in sentence) < len(sentence) * .5:
                continue
            if re.fullmatch(r"\([^)]*\b(?:19|20)\d{2}[^)]*\)[.,]?", sentence) or re.search(r"\b\d{2}(?:Fall|Summer|Spring)\b", sentence):
                continue
            if re.search(r"\b\d+\s*/\s*\d+\s*$|\b(?i:press)\s+[A-Z`]|\b(?:switch tiers|saved tier|flat preset|this page selects|Enter follows)", sentence):
                continue
            if key == normalize(slide.get("source", "")) or re.search(r"\b(university|presented by|all rights reserved)\b", sentence, re.I):
                continue
            # Remove repeated page furniture even when its counter changes.
            if re.sub(r"\d+", "#", key) in boilerplate:
                continue
            rarity = sum(math.log((total + 1) / (df[w] + 1)) + 1 for w in set(words)) / len(set(words))
            score = 10 + rarity + min(len(words), 18) * .12 + bool(CLAIM_WORDS.search(sentence)) * 4
            score += min(2, len(title_words.intersection(words))) * .8
            if sentence[:1].islower(): score -= 5  # wrapped sentence fragments
            if re.search(r"\b(?:the|a|an|and|or|of|to|with|every|same)\s*$", sentence, re.I): score -= 4
            if re.match(r"(?:why|how|what|when|does|which)\b", sentence, re.I): score += 1.5
            score -= max(0, len(sentence) - 240) / 50
            score -= sum(c.isdigit() for c in sentence) * .3
            if sentence.endswith((':', ',', 'by', 'than', 'that', 'no')): score -= 4
            if re.search(r"[.!?。！？]$", sentence): score += 1
            add(sentence, "message", score, "salient-text")
    # A sparse/visual slide still has a useful title, without fabricated content.
    if not candidates:
        fallback = slide.get("title") or quote_for(slide) or f"Slide {slide['id']}"
        return [dict(text=fallback, role="topic", score=1, origin="title", authorId=None, to=None)]
    return sorted(candidates, key=lambda c: (-c["score"], normalize(c["text"])))


def build_local(manifest: dict) -> dict:
    slides = manifest["slides"]
    concepts: dict[str, dict] = {}
    relationships: dict[tuple, dict] = {}
    messages: dict[str, list[dict]] = {}
    authors: dict[tuple, dict] = {}
    total = len(slides)
    df = Counter(word for slide in slides for word in set(content_words(slide.get("text", ""))))
    line_df = Counter(line for slide in slides for line in {
        re.sub(r"\d+", "#", normalize(line)) for line in slide.get("text", "").splitlines() if line.strip()})
    boilerplate = {line for line, count in line_df.items() if total >= 3 and count >= max(3, math.ceil(total * .55))}

    def relation(source, target, predicate, refs, status="observation", qualification=""):
        if source == target:
            return
        key = source, target, predicate
        if key not in relationships:
            relationships[key] = dict(id=slug("|".join(key), "relation"), source=source, target=target,
                predicate=predicate, status=status, qualification=qualification, evidence=[])
        for ref in refs:
            if ref not in relationships[key]["evidence"]:
                relationships[key]["evidence"].append(ref)

    sections = {}
    for slide in slides:
        section = slide.get("section") or "Talk"
        section_id = "section-" + slug(section, "talk")
        ref = evidence(slide, slide.get("title", ""))
        if section_id not in concepts:
            concepts[section_id] = dict(id=section_id, label=section, aliases=[], type="section", importance=2,
                cluster=section, description="Source section; its edges group the selected slide messages.", mentions=[])
        concepts[section_id]["mentions"].append(ref)
        sections[slide["id"]] = section_id
        candidates = message_candidates(slide, boilerplate, df, total)
        # At most two authored main messages; one body-text inference per slide.
        chosen = candidates[:2 if candidates[0]["origin"] != "salient-text" else 1]
        messages[slide["id"]] = []
        for item in chosen:
            label = short_message(item["text"])
            # Merge exact repeated messages across reveal/summary slides.
            node_id = "message-" + slug(label, "message")
            if item["origin"] == "title" and normalize(label) == normalize(section):
                node_id = section_id  # An outline introduces its section, not a second copy of it.
            ref = evidence(slide, item["text"])
            if node_id not in concepts:
                concepts[node_id] = dict(id=node_id, label=label, aliases=[], type="message",
                    importance=5 if item["origin"] in {"typst-role", "typst-takeaway", "takeaway-region"} else 4,
                    cluster=section, description=("Authored " + item["role"] if item["origin"] != "salient-text" else "Heuristically selected slide message") + ". Read the quoted evidence in context.",
                    selection=dict(origin=item["origin"], role=item["role"]), mentions=[])
            if ref not in concepts[node_id]["mentions"]:
                concepts[node_id]["mentions"].append(ref)
            selected = dict(**item, id=node_id, ref=ref)
            messages[slide["id"]].append(selected)
            if item.get("authorId"):
                authors[(slide["id"], item["authorId"])] = selected
            relation(section_id, node_id, "contains", [ref], qualification="Section membership, not a semantic assertion.")

    # Retain explicit support/question/correction structure when its endpoints
    # are visible. Notes and hidden/source-only text never become evidence.
    for slide in slides:
        selected = messages[slide["id"]]
        answer = next((m for m in selected if m["role"] == "answer"), None)
        for item in selected:
            if answer and item["role"] == "hook":
                relation(item["id"], answer["id"], "answered by", [item["ref"], answer["ref"]], "authored structure")
            if answer and item["role"] == "contrast":
                relation(item["id"], answer["id"], "contrasts with", [item["ref"], answer["ref"]], "authored structure")
        for role in slide.get("semanticTiers", {}).get("roles", []):
            target = authors.get((slide["id"], role.get("to")))
            text = grounded(slide, role.get("text", "")) or region_text(slide, role)
            if role.get("role") != "support" or not target or not text or normalize(text) == normalize(target["text"]):
                continue
            label = short_message(text)
            sid = "message-" + slug(label, "support")
            ref = evidence(slide, text)
            concepts.setdefault(sid, dict(id=sid, label=label, aliases=[], type="message", importance=3,
                cluster=slide.get("section") or "Talk", description="Authored support for a selected takeaway.",
                selection=dict(origin="typst-role", role="support"), mentions=[]))
            if ref not in concepts[sid]["mentions"]: concepts[sid]["mentions"].append(ref)
            relation(sid, target["id"], "supports", [ref, target["ref"]], "authored structure", "Explicit sem.support(to: ...) association.")
        for deep in slide.get("semanticTiers", {}).get("deep", []):
            source = authors.get((slide["id"], deep.get("to"))) or (selected[0] if not deep.get("to") else None)
            targets = messages.get(deep.get("slideId"), [])
            if source and targets:
                relation(source["id"], targets[0]["id"], "has elaboration", [source["ref"], targets[0]["ref"]], "authored structure", "Explicit sem.deep destination; not an inferred entailment.")

    # Extract a small vocabulary from *selected messages/titles*, not every
    # footer or repeated term on the slide. Prefer repeated multiword phrases.
    phrase_slides = defaultdict(set)
    phrase_labels = {}
    for slide in slides:
        contexts = [slide.get("title", "")] + [m["text"] for m in messages[slide["id"]]]
        for context in contexts:
            words = tokens(context)
            for size in (1, 2, 3):
                for i in range(len(words) - size + 1):
                    phrase_words = words[i:i+size]
                    if any(word in TOPIC_STOPWORDS for word in phrase_words) or any(len(w) < 3 for w in phrase_words):
                        continue
                    if size == 1 and len(phrase_words[0]) < 5:
                        continue
                    phrase = " ".join(phrase_words)
                    if grounded(slide, phrase):
                        phrase_slides[phrase].add(slide["id"])
                        phrase_labels[phrase] = phrase
    candidates = [p for p, ids in phrase_slides.items() if len(ids) >= 2 and p not in boilerplate]
    candidates.sort(key=lambda p: (-len(phrase_slides[p]) * math.log1p(total / len(phrase_slides[p])) * (1 + .65 * (len(p.split()) - 1)), p))
    topics = []
    for phrase in candidates:
        ids = phrase_slides[phrase]
        if len(topics) >= 12: break
        if any((phrase in prior or prior in phrase) and len(ids & phrase_slides[prior]) / len(ids | phrase_slides[prior]) >= .6 for prior in topics):
            continue
        topics.append(phrase)
        refs = [evidence(slide, phrase) for slide in slides if slide["id"] in ids]
        counts = Counter(slide.get("section") or "Talk" for slide in slides if slide["id"] in ids)
        cluster = counts.most_common(1)[0][0] if len(counts) == 1 else "Across the talk"
        node_id = "concept-" + slug(phrase, "topic")
        concepts[node_id] = dict(id=node_id, label=phrase_labels[phrase], aliases=[], type="concept", importance=3,
            cluster=cluster, description="A repeated topic in selected slide messages or titles; not an automatically verified claim.", mentions=refs)
    for slide in slides:
        for message in messages[slide["id"]]:
            matching = [p for p in topics if normalize(p) in normalize(message["text"])]
            for phrase in matching[:2]:
                relation(message["id"], "concept-" + slug(phrase, "topic"), "addresses", [message["ref"]], "heuristic", "Topic occurs in the selected message.")
        # Title-only topics still need a navigable, explicitly qualified link.
        for phrase in topics:
            node_id = "concept-" + slug(phrase, "topic")
            if slide["id"] in phrase_slides[phrase] and not any(r[1] == node_id and any(e["slideId"] == slide["id"] for e in value["evidence"]) for r, value in relationships.items()):
                relation(messages[slide["id"]][0]["id"], node_id, "shares slide topic", [evidence(slide, phrase)], "heuristic", "Topic is in the slide title, not necessarily in this message.")

    # Direct cross-slide links use distinctive shared meaning-bearing words.
    # Deliberately do not guess causality, support, contradiction or entailment.
    salient = {slide["id"]: set(content_words(slide.get("title", "") + " " + " ".join(m["text"] for m in messages[slide["id"]]))) for slide in slides}
    sdf = Counter(word for words in salient.values() for word in words)
    weights = {word: math.log((total + 1) / (count + 1)) + 1 for word, count in sdf.items()}
    for index, slide in enumerate(slides):
        current = salient[slide["id"]]
        similar = []
        for earlier in slides[:index]:
            other = salient[earlier["id"]]
            shared = {w for w in current & other if total < 6 or sdf[w] <= total * .65}
            if len(shared) < 2: continue
            score = sum(weights[w] ** 2 for w in shared) / max(1, math.sqrt(sum(weights[w] ** 2 for w in current) * sum(weights[w] ** 2 for w in other)))
            if score >= .22: similar.append((score, earlier, shared))
        for score, earlier, shared in sorted(similar, key=lambda item: (-item[0], item[1]["page"]))[:2]:
            source, target = messages[earlier["id"]][0], messages[slide["id"]][0]
            # Exact repeated messages already share a node and all their evidence.
            relation(source["id"], target["id"], "shares topic", [source["ref"], target["ref"]], "heuristic",
                "Shared salient terms: " + ", ".join(sorted(shared)[:8]) + ". No causal or entailment claim.")
    return {
        "schemaVersion": "1.0", "deckId": manifest["deckId"], "revision": manifest["revision"],
        "extraction": {"mode": "lexical", "provider": "local", "reviewRequired": True,
            "inputRevision": manifest["revision"], "method": "structure-weighted-messages-and-topics",
            "semanticRelations": "authored associations plus explicitly qualified topic similarity"},
        "concepts": list(concepts.values()), "relationships": list(relationships.values()),
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
