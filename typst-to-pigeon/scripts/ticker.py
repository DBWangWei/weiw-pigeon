"""Normalize compiled Typst ticker metadata for the offline player.

The Typst side emits two labelled metadata streams: ``pigeon-tick`` and
``pigeon-band``.  This module deliberately keeps the build contract pure
Python so it can be checked without a browser and so old decks with no ticker
metadata remain valid.
"""
from __future__ import annotations

from collections import defaultdict
import re
from typing import Any


KINDS = {"now", "next", "done"}


def flatten(value: Any) -> str:
    """Extract searchable text from Typst's serialized content tree."""
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "".join(flatten(item) for item in value)
    if isinstance(value, dict):
        if value.get("func") == "space":
            return " "
        if isinstance(value.get("text"), str):
            return value["text"] + flatten(value.get("children"))
        return flatten(value.get("children", value.get("body", value.get("value"))))
    return ""


def _number(value: Any, default: float | int | None = None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _page(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _section(records: list[dict], page: int | None) -> str | None:
    if page is None:
        return None
    current = None
    for record in sorted(records, key=lambda item: _page(item.get("page")) or 0):
        if (_page(record.get("page")) or 0) > page:
            break
        current = flatten(record.get("section")) or None
    return current


def _part(value: Any, band_x: float, band_y: float) -> dict | None:
    if not isinstance(value, dict):
        return None
    result = {key: value[key] for key in ("tick", "text", "x", "y", "w", "h") if key in value}
    if "x" in result:
        result["x"] = float(result["x"]) + band_x
    if "y" in result:
        result["y"] = float(result["y"]) + band_y
    return result or None


def _band(raw: dict, page: int) -> dict:
    x = _number(raw.get("x"), 0.0) or 0.0
    y = _number(raw.get("y"), 0.0) or 0.0
    result = {
        "x": x, "y": y,
        "w": _number(raw.get("w"), 0.0) or 0.0,
        "h": _number(raw.get("h"), 0.0) or 0.0,
        "fill": raw.get("fill"),
        "enabled": raw.get("enabled", True) is not False,
        "overflow": bool(raw.get("overflow", False)),
    }
    # Keep the metadata useful even when a Typst version serializes nulls.
    result["left"] = _part(raw.get("left"), x, y)
    result["right"] = _part(raw.get("right"), x, y)
    return result


def _state(ticks: list[dict], records: list[dict], page: int) -> tuple[dict | None, dict | None]:
    mine = [tick for tick in ticks if tick["page"] == page]
    lefts = [tick for tick in mine if tick["kind"] != "next"]
    left = lefts[-1] if lefts else None
    if left is None:
        section = _section(records, page)
        closed = {tick["resolves"] for tick in ticks
                  if tick["kind"] == "done" and tick.get("resolves")
                  and tick["page"] is not None and tick["page"] <= page}
        candidates = [tick for tick in ticks
                      if tick["kind"] == "now" and tick["page"] is not None and tick["page"] < page
                      and _section(records, tick["page"]) == section
                      and (not tick.get("id") or tick["id"] not in closed)]
        left = candidates[-1] if candidates else None
    if left is None:
        # A resolved point remains as a compact recap until the next thread
        # opens. This keeps the lower-third useful on bridge slides instead
        # of dropping immediately to a section label.
        section = _section(records, page)
        recaps = [tick for tick in ticks
                  if tick["kind"] == "done" and tick["page"] is not None
                  and tick["page"] < page and _section(records, tick["page"]) == section]
        left = recaps[-1] if recaps else None
    rights = [tick for tick in mine if tick["kind"] == "next"]
    return left, rights[-1] if rights else None


def build_ticker(raw: dict | None, records: list[dict], slide_count: int | None = None) -> dict | None:
    """Build ``pigeon-ticker/1`` data from one Typst eval result.

    ``None`` means the source contains no tick metadata, allowing callers to
    skip the ticker pipeline altogether.
    """
    if not raw or not isinstance(raw, dict) or not raw.get("ticks"):
        return None
    records = list(records or [])
    record_pages = {_page(record.get("page")): record for record in records if _page(record.get("page"))}
    warnings: list[dict] = []
    ticks: list[dict] = []
    ids: dict[str, dict] = {}
    for index, item in enumerate(raw.get("ticks", [])):
        item = item if isinstance(item, dict) else {}
        page = _page(item.get("page"))
        raw_kind = item.get("kind")
        kind = raw_kind if isinstance(raw_kind, str) and raw_kind in KINDS else "now"
        if raw_kind is not None and raw_kind != kind:
            warnings.append({"code": "tick.invalid-kind", "page": page, "kind": item.get("kind")})
        tick = {
            "v": 1,
            "key": item.get("key") or f"t{index + 1}",
            "id": item.get("id"),
            "kind": kind,
            "resolves": item.get("resolves"),
            "page": page,
            "slide": record_pages.get(page, {}).get("id"),
            "at": {key: item[key] for key in ("x", "y") if key in item},
            "plain": flatten(item.get("plain")) or flatten(item.get("body")),
            "shown": [],
            "art": None,
        }
        ticks.append(tick)
        if tick["id"]:
            if tick["id"] in ids:
                warnings.append({"code": "tick.duplicate-id", "id": tick["id"], "page": page})
            ids[tick["id"]] = tick
        if page not in record_pages:
            warnings.append({"code": "tick.off-slide", "page": page, "key": tick["key"]})

    for tick in ticks:
        target = tick.get("resolves")
        if target and target not in ids:
            warnings.append({"code": "tick.unknown-resolves", "page": tick["page"], "resolves": target})
        if target and target in ids and tick["page"] is not None and ids[target]["page"] is not None and tick["page"] < ids[target]["page"]:
            warnings.append({"code": "tick.resolves-before-open", "page": tick["page"], "resolves": target})

    raw_bands = {int(_page(item.get("page"))): item for item in raw.get("bands", [])
                 if isinstance(item, dict) and _page(item.get("page")) is not None}
    count = slide_count or len(records)
    pages: list[dict] = []
    by_key: defaultdict[str, list[int]] = defaultdict(list)
    for page in range(1, count + 1):
        record = record_pages.get(page, {})
        left, right = _state(ticks, records, page)
        band = _band(raw_bands[page], page) if page in raw_bands else None
        raw_band = raw_bands.get(page)
        if raw_band and isinstance(raw_band.get("left"), dict) and raw_band["left"].get("tick"):
            expected = left["key"] if left else None
            if raw_band["left"].get("tick") != expected:
                warnings.append({"code": "band.geometry-mismatch", "page": page, "part": "left"})
        if raw_band and isinstance(raw_band.get("right"), dict) and raw_band["right"].get("tick"):
            expected = right["key"] if right else None
            if raw_band["right"].get("tick") != expected:
                warnings.append({"code": "band.geometry-mismatch", "page": page, "part": "right"})
        entry = {
            "page": page, "slide": record.get("id"), "section": flatten(record.get("section")) or None,
            "band": band,
            "left": {"tick": left["key"]} if left and band and band.get("enabled", True) else None,
            "right": {"tick": right["key"]} if right and band and band.get("enabled", True) else None,
        }
        pages.append(entry)
        if band and band.get("enabled", True):
            for part, tick in (("left", left), ("right", right)):
                if tick:
                    by_key[tick["key"]].append(page)
                    if entry[part] is not None and band.get(part):
                        entry[part].update({key: band[part][key] for key in ("x", "y", "w", "h") if key in band[part]})

    for tick in ticks:
        tick["shown"] = by_key.get(tick["key"], [])
        if tick["shown"]:
            tick["art"] = {"page": tick["shown"][0], "part": "left"}
            # A next item is rendered on the right side.
            if tick["kind"] == "next":
                tick["art"]["part"] = "right"
        else:
            warnings.append({"code": "tick.never-shown", "severity": "info", "key": tick["key"], "page": tick["page"]})

    closed_ids = {tick["resolves"] for tick in ticks if tick["kind"] == "done" and tick.get("resolves")}
    open_at_end = [tick["id"] for tick in ticks if tick["kind"] == "now" and tick.get("id") and tick["id"] not in closed_ids]
    for identifier in open_at_end:
        warnings.append({"code": "tick.unresolved", "severity": "info", "id": identifier})
    for page in pages:
        if page["band"] and page["band"].get("overflow"):
            warnings.append({"code": "band.overflow", "page": page["page"], "slide": page["slide"]})
        fill = page["band"].get("fill") if page["band"] else None
        if page["band"] and not isinstance(fill, str):
            warnings.append({"code": "band.no-fill", "page": page["page"], "slide": page["slide"]})
        elif page["band"] and not re.fullmatch(r"(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([^)]*\))", fill.strip()):
            warnings.append({"code": "band.no-fill", "page": page["page"], "slide": page["slide"]})
    return {
        "schema": "pigeon-ticker/1", "version": 1, "enabled": True,
        "ticks": ticks, "pages": pages, "openAtEnd": open_at_end,
        "warnings": warnings,
    }
