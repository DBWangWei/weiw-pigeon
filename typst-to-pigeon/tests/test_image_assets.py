"""Decode transformed rasters and verify placement, alpha, limits and quality."""
import base64
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from image_assets import ImageAssets

class ImageAssetTests(unittest.TestCase):
    def transform(self, size, options):
        image=Image.new('RGBA', size, (180,20,30,128))
        stream=BytesIO(); image.save(stream, 'PNG')
        uri='data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><image x="25" y="30" width="100" height="90" transform="rotate(3)" href="{uri}"/></svg>'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'slide.svg'; path.write_text(svg)
            processor=ImageAssets(**options); processor.svg(path)
            root=ET.parse(path).getroot(); el=list(root)[0]; href=el.attrib.pop('href')
            self.assertEqual(root.get('viewBox'),'0 0 800 600')
            self.assertEqual(el.attrib,dict(x='25',y='30',width='100',height='90',transform='rotate(3)'))
            self.assertEqual(processor.cache.get(uri,uri),href)
            decoded=Image.open(BytesIO(base64.b64decode(href.split(',')[1]))); decoded.load()
            return href,decoded

    def test_presets_preserve_aspect_ratio_and_alpha_without_upscaling(self):
        for preset, expected in [('768p',(1152,768)),('1080p',(1536,1024)),('original',(1536,1024))]:
            with self.subTest(preset=preset):
                uri,image=self.transform((1536,1024),dict(png_size=preset,png_to_jpg=False))
                self.assertEqual(image.size,expected); self.assertEqual(image.mode,'RGBA')
                self.assertEqual(image.getpixel((0,0))[3],128)
        _,wide=self.transform((3000,1000),dict(png_size='768p',png_to_jpg=False))
        self.assertEqual(wide.size,(1366,455))
        _,small=self.transform((160,160),dict(png_to_jpg=False))
        self.assertEqual(small.size,(160,160))

    def test_jpeg_is_the_default_and_png_is_opt_in(self):
        uri, image = self.transform((160, 160), {})
        self.assertTrue(uri.startswith('data:image/jpeg;'))
        self.assertEqual(image.mode, 'RGB')
        uri, image = self.transform((160, 160), dict(png_to_jpg=False))
        self.assertTrue(uri.startswith('data:image/png;'))
        self.assertEqual(image.mode, 'RGBA')

    def test_jpeg_quality_and_transparency(self):
        sizes=[]
        for quality in [25,90]:
            uri,image=self.transform((1536,1024),dict(png_to_jpg=True,jpg_quality=quality))
            self.assertTrue(uri.startswith('data:image/jpeg;'))
            self.assertEqual(image.size,(1152,768)); self.assertEqual(image.mode,'RGB')
            self.assertLess(max(abs(a-b) for a,b in zip(image.getpixel((0,0)),(217,137,142))),8)
            sizes.append(len(uri))
        self.assertGreaterEqual(sizes[1],sizes[0])

    def test_invalid_options(self):
        for options in [dict(png_size='bogus'),dict(png_size=[]),dict(jpg_quality=True),dict(jpg_quality=0),dict(png_to_jpg=1)]:
            with self.subTest(options=options), self.assertRaises(ValueError): ImageAssets(**options)
