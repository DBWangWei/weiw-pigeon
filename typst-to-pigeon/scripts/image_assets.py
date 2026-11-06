"""Shrink PNG payloads in generated SVGs without changing their placement."""
from __future__ import annotations

import base64
from io import BytesIO
import re
from pathlib import Path

PNG_SIZES = {"original": None, "768p": (1366, 768), "1080p": (1920, 1080)}
# Match only the data URI, leaving SVG namespaces, geometry and vector paint intact.
PNG_URI = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=\r\n]+)")


class ImageAssets:
    def __init__(self, png_size="768p", png_to_jpg=True, jpg_quality=90):
        if not isinstance(png_size, str) or png_size not in PNG_SIZES:
            raise ValueError("png_size must be original, 768p, or 1080p")
        if type(png_to_jpg) is not bool:
            raise ValueError("png_to_jpg must be true or false")
        if type(jpg_quality) is not int or not 1 <= jpg_quality <= 100:
            raise ValueError("jpg_quality must be an integer from 1 to 100")
        self.size, self.jpeg, self.quality = PNG_SIZES[png_size], png_to_jpg, jpg_quality
        self.cache = {}

    def _convert(self, match):
        original = match.group(0)
        if original in self.cache:
            return self.cache[original]
        if not self.size and not self.jpeg:
            return original
        try:
            from PIL import Image
        except ImportError:
            raise RuntimeError("Raster optimization requires Pillow. Install with: python3 -m pip install -r typst-to-pigeon/requirements.txt; or use --png --png-size original") from None
        try:
            image = Image.open(BytesIO(base64.b64decode(match.group(1))))
            image.load()
            resized = bool(self.size and (image.width > self.size[0] or image.height > self.size[1]))
            if not resized and not self.jpeg:
                result = original
            else:
                if resized:
                    if image.mode == "P": image = image.convert("RGBA")
                    image.thumbnail(self.size, Image.Resampling.LANCZOS)
                stream = BytesIO()
                if self.jpeg:
                    rgba = image.convert("RGBA")
                    flat = Image.new("RGB", rgba.size, "white")
                    flat.paste(rgba, mask=rgba.getchannel("A"))
                    flat.save(stream, "JPEG", quality=self.quality, optimize=True)
                    mime = "image/jpeg"
                else:
                    image.save(stream, "PNG", optimize=True)
                    mime = "image/png"
                result = f"data:{mime};base64," + base64.b64encode(stream.getvalue()).decode("ascii")
        except (OSError, ValueError) as error:
            raise ValueError(f"Cannot optimize an embedded PNG: {error}") from None
        self.cache[original] = result
        return result

    def svg(self, path: Path):
        original = path.read_text(encoding="utf-8")
        updated = PNG_URI.sub(self._convert, original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
