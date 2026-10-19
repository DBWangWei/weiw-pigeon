"""Text matching must not pull unrelated punctuation into an emphasis region."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from slide_artwork import match_words, union


class TextRegionTests(unittest.TestCase):
    def test_callout_bounds_exclude_punctuation_from_the_previous_block(self):
        words = [
            {'text': '.', 'x': 770, 'y': 280, 'width': 4, 'height': 20},
            {'text': '💡', 'x': 64, 'y': 340, 'width': 20, 'height': 28},
            {'text': 'The', 'x': 104, 'y': 346, 'width': 30, 'height': 20},
            {'text': 'fit', 'x': 140, 'y': 346, 'width': 24, 'height': 20},
            {'text': 'is', 'x': 170, 'y': 346, 'width': 15, 'height': 20},
            {'text': 'unique.', 'x': 191, 'y': 346, 'width': 55, 'height': 20},
        ]
        matched = match_words(words, 'The fit is unique.')
        self.assertEqual(matched, words[2:])
        self.assertEqual(union(matched), {'x': 104, 'y': 346, 'width': 142, 'height': 20})

    def test_punctuation_inside_math_content_is_retained(self):
        words = [{'text': value} for value in ['.', '𝑋', '+', 'returns', 'coefficients;']]
        self.assertEqual(match_words(words, '$X^+$ returns coefficients;'), words[1:])


if __name__ == '__main__':
    unittest.main()
