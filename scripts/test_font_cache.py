"""缓存命中不能跳过字形/角色检查；用小型西文字体验证失效与损坏恢复。"""
import json
import os
import pathlib
import tempfile
import unittest
import font_assets as fonts

class FontCacheTest(unittest.TestCase):
    def test_cache_and_validation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            old = os.environ.get('FONT_CACHE_DIR')
            os.environ['FONT_CACHE_DIR'] = str(root / 'cache')
            try:
                payload = {'faces': ['inter-400'], 'text': 'AB', 'html': '<p>AB</p>',
                           'roleFamilies': {'body': ['Deck Inter'], 'title': ['Deck Inter']}}
                cold = fonts.package(payload)
                warm = fonts.package(payload)
                self.assertFalse(cold['timing']['faces'][0]['decodedCacheHit'])
                self.assertTrue(warm['timing']['faces'][0]['decodedCacheHit'])
                self.assertTrue(warm['timing']['faces'][0]['subsetCacheHit'])
                self.assertEqual(cold['faces'], warm['faces'])
                changed = fonts.package({**payload, 'text': 'ABC', 'html': '<p>ABC</p>'})
                self.assertTrue(changed['timing']['faces'][0]['decodedCacheHit'])
                self.assertFalse(changed['timing']['faces'][0]['subsetCacheHit'])
                # 摘要损坏不可以被当作字体；同一内容重建应得到相同产物。
                for file in (root / 'cache').iterdir():
                    file.write_bytes(b'broken')
                repaired = fonts.package(payload)
                self.assertEqual(cold['faces'], repaired['faces'])
                with self.assertRaisesRegex(ValueError, '缺失字形'):
                    fonts.package({**payload, 'text': 'AB\U0010ffff'})
                with self.assertRaisesRegex(ValueError, 'title 字体链缺失'):
                    fonts.package({**payload, 'html': '<h1 class="slide__title">AB</h1>', 'roleFamilies': {'body': ['Deck Inter'], 'title': []}})
                # 版本变化必须使两个缓存层一起失效。
                version = fonts.fontTools.__version__
                try:
                    fonts.fontTools.__version__ = version + '-test'
                    updated = fonts.package(payload)
                    self.assertFalse(updated['timing']['faces'][0]['decodedCacheHit'])
                    self.assertFalse(updated['timing']['faces'][0]['subsetCacheHit'])
                finally:
                    fonts.fontTools.__version__ = version
                source = fonts.ROOT / 'assets/fonts'
                manifest = json.loads((source / 'manifest.json').read_text())
                entry = next(e for e in manifest['faces'] if e['id'] == 'inter-400')
                (root / 'manifest.json').write_text(json.dumps({'faces': [entry]}))
                (root / entry['file']).write_bytes(b'corrupt source')
                with self.assertRaisesRegex(ValueError, '资源校验失败'):
                    fonts.package({**payload, 'assetDir': str(root)})
            finally:
                if old is None:
                    os.environ.pop('FONT_CACHE_DIR', None)
                else:
                    os.environ['FONT_CACHE_DIR'] = old

if __name__ == '__main__':
    unittest.main()
