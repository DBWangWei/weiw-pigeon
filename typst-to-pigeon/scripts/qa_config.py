"""Strict build-time Q&A configuration; output is the runtime manifest contract."""
from __future__ import annotations

import copy
import re


DEFAULTS = {
    "enabled": True,
    "target": "_qa",
    "model": "gpt-4.1-mini",
    "max_length": 4000,
    "max_items": 50,
}


def resolve_qa_config(config_table) -> dict:
    """Resolve a [qa] table (snake_case), validating disabled settings too."""
    if not isinstance(config_table, dict):
        raise ValueError("qa must be a TOML table")
    unknown = set(config_table) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown qa key(s): {', '.join(sorted(unknown))}")
    values = copy.deepcopy(DEFAULTS)
    values.update(copy.deepcopy(config_table))
    if type(values["enabled"]) is not bool:
        raise ValueError("qa.enabled must be true or false")
    if not isinstance(values["target"], str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", values["target"]):
        raise ValueError("qa.target must be a nonempty semantic target identifier")
    if not isinstance(values["model"], str) or not values["model"].strip() or len(values["model"]) > 120:
        raise ValueError("qa.model must be a nonempty model name")
    for key, low, high in (("max_length", 200, 12000), ("max_items", 1, 100)):
        value = values[key]
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f"qa.{key} must be an integer between {low} and {high}")
    return {
        "enabled": values["enabled"],
        "target": values["target"],
        "model": values["model"].strip(),
        "maxLength": values["max_length"],
        "maxItems": values["max_items"],
    }
