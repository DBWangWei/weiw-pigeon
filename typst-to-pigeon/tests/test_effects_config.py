"""Motion-effects build configuration contract tests."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from effects_config import resolve_effects_config


class EffectsConfigTests(unittest.TestCase):
    def test_defaults_are_section_morph_and_disabled_rack_focus(self):
        effects = resolve_effects_config({})
        self.assertEqual(effects, {
            "particleMorph": "sections",
            "particleMorphSlides": [],
            "particleMorphDurationMs": 1400,
            "particleMorphCell": 10,
            "rackFocus": False,
        })

    def test_explicit_destination_slides_override_mode(self):
        effects = resolve_effects_config({
            "particle_morph": "none",
            "particle_morph_slides": ["07", " 12a "],
            "particle_morph_duration_ms": 900,
            "particle_morph_cell": 16,
            "rack_focus": True,
        })
        self.assertEqual(effects["particleMorph"], "none")
        self.assertEqual(effects["particleMorphSlides"], ["07", "12a"])
        self.assertEqual(effects["particleMorphDurationMs"], 900)
        self.assertEqual(effects["particleMorphCell"], 16)
        self.assertTrue(effects["rackFocus"])

    def test_validation_is_strict_and_does_not_mutate_defaults(self):
        for settings in (
            {"unknown": True},
            {"particle_morph": "section"},
            {"particle_morph_slides": [""]},
            {"particle_morph_duration_ms": 249},
            {"particle_morph_cell": 33},
            {"rack_focus": 1},
        ):
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                resolve_effects_config(settings)
        original = copy.deepcopy(resolve_effects_config({}))
        self.assertEqual(resolve_effects_config({}), original)


if __name__ == "__main__":
    unittest.main()
