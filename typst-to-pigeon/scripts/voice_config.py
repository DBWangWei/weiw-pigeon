"""Strict build-time voice configuration; output is the runtime manifest contract."""
from __future__ import annotations

import copy
import math
import re
import unicodedata

DEFAULTS = {
    "enabled": True, "backend": "whisper", "lang": "en-US", "boost": 3,
    "cooldown_ms": 3000, "stale_ms": 600, "resuppress_after_dismiss_ms": 10000,
    "restart_delay_ms": 250, "watchdog_ms": 90000, "pop_pad_pt": 6,
    "pop_max_fraction": .85, "pop_max_scale": 4, "auto_close_ms": 0,
    "rules": [
        {"id": "takeaway", "phrases": ["key message", "key messages", "takeaway", "takeaways", "take-away message", "takeaway message", "take away message", "conclusion", "conclusions"], "target": "takeaway", "action": "pop", "multi": "stack"},
        {"id": "table", "phrases": ["this table"], "target": "_table", "action": "pop", "multi": "ask"},
        {"id": "figure", "phrases": ["this figure", "this plot"], "target": "_fig", "action": "pop", "multi": "ask"},
        {"id": "example", "phrases": ["this example"], "target": "_example", "action": "pop", "multi": "ask"},
    ],
}
RANGES = {"boost": (0, 10), "cooldown_ms": (0, 3600000), "stale_ms": (0, 3600000),
          "resuppress_after_dismiss_ms": (0, 3600000), "restart_delay_ms": (0, 3600000),
          "watchdog_ms": (1, 3600000), "pop_pad_pt": (0, 1000),
          "pop_max_fraction": (.01, 1), "pop_max_scale": (1, 100), "auto_close_ms": (0, 3600000)}


def normalized_phrase(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in value).split())


def resolve_voice_config(config_table, enabled_override=None) -> dict:
    """Resolve a [voice] table (snake_case), validating even disabled settings."""
    if not isinstance(config_table, dict):
        raise ValueError("voice must be a TOML table")
    unknown = set(config_table) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown voice key(s): {', '.join(sorted(unknown))}")
    values = copy.deepcopy(DEFAULTS)
    values.update(copy.deepcopy(config_table))
    if type(values["enabled"]) is not bool:
        raise ValueError("voice.enabled must be true or false")
    if enabled_override is not None and type(enabled_override) is not bool:
        raise ValueError("voice enabled override must be true or false")
    if not isinstance(values["backend"], str) or values["backend"] not in {"whisper", "browser"}:
        raise ValueError("voice.backend must be whisper or browser")
    if not isinstance(values["lang"], str) or not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", values["lang"]):
        raise ValueError("voice.lang must be a nonempty language tag such as en-US")
    for key, (low, high) in RANGES.items():
        value = values[key]
        if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
            raise ValueError(f"voice.{key} must be finite and between {low} and {high}")
        if key.endswith("_ms") and type(value) is not int:
            raise ValueError(f"voice.{key} must be an integer number of milliseconds")
    if not isinstance(values["rules"], list):
        raise ValueError("voice.rules must be an array of tables")
    ids = set()
    for rule in values["rules"]:
        if not isinstance(rule, dict) or set(rule) != {"id", "phrases", "target", "action", "multi"}:
            raise ValueError("Each voice rule must contain only id, phrases, target, action, multi")
        for key in ("id", "target"):
            if not isinstance(rule[key], str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", rule[key]):
                raise ValueError(f"voice rule {key} must be a nonempty identifier")
        if rule["id"] in ids:
            raise ValueError(f"Duplicate voice rule id: {rule['id']}")
        ids.add(rule["id"])
        if not isinstance(rule["phrases"], list) or not rule["phrases"] or any(not isinstance(p, str) or not normalized_phrase(p) for p in rule["phrases"]):
            raise ValueError("voice rule phrases must contain nonempty normalized phrases")
        if not isinstance(rule["action"], str) or rule["action"] not in {"pop", "focus", "spotlight"}:
            raise ValueError("voice rule action must be pop, focus, or spotlight")
        if not isinstance(rule["multi"], str) or rule["multi"] not in {"ask", "stack"}:
            raise ValueError("voice rule multi must be ask or stack")
    if enabled_override is not None:
        values["enabled"] = enabled_override
    return {re.sub(r"_([a-z])", lambda m: m[1].upper(), key): value for key, value in values.items()}
