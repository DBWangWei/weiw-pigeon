"""Strict build-time motion-effects configuration."""
from __future__ import annotations

import copy


DEFAULTS = {
    "particle_morph": "sections",
    "particle_morph_slides": [],
    "particle_morph_duration_ms": 1400,
    "particle_morph_cell": 10,
    "rack_focus": False,
}


def resolve_effects_config(config_table) -> dict:
    """Resolve an [effects] table into the runtime manifest contract."""
    if not isinstance(config_table, dict):
        raise ValueError("effects must be a TOML table")
    unknown = set(config_table) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown effects key(s): {', '.join(sorted(unknown))}")
    values = copy.deepcopy(DEFAULTS)
    values.update(copy.deepcopy(config_table))
    if values["particle_morph"] not in {"sections", "all", "none"}:
        raise ValueError("effects.particle_morph must be sections, all, or none")
    slides = values["particle_morph_slides"]
    if not isinstance(slides, list) or any(not isinstance(value, str) or not value.strip() or len(value) > 120 for value in slides):
        raise ValueError("effects.particle_morph_slides must be an array of nonempty slide IDs")
    if type(values["particle_morph_duration_ms"]) is not int or not 250 <= values["particle_morph_duration_ms"] <= 6000:
        raise ValueError("effects.particle_morph_duration_ms must be an integer between 250 and 6000")
    if type(values["particle_morph_cell"]) is not int or not 4 <= values["particle_morph_cell"] <= 32:
        raise ValueError("effects.particle_morph_cell must be an integer between 4 and 32")
    if type(values["rack_focus"]) is not bool:
        raise ValueError("effects.rack_focus must be true or false")
    return {
        "particleMorph": values["particle_morph"],
        "particleMorphSlides": [value.strip() for value in values["particle_morph_slides"]],
        "particleMorphDurationMs": values["particle_morph_duration_ms"],
        "particleMorphCell": values["particle_morph_cell"],
        "rackFocus": values["rack_focus"],
    }
