import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('skin_fx', Path(__file__).resolve().parents[1] / 'tools/local-extract/skin_fx.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CostumeExport(unittest.TestCase):
    def setUp(self):
        self.skin = {'skinId': 'char_103_angel@epoque#2', 'charId': 'char_103_angel', 'battleSkin': {'skinOrPrefabId': 'char_103_angel_epoque#2'}}

    def test_default_is_not_costume(self):
        self.assertEqual(module.matching_skins('/char_103_angel/defaultskin.prefab', 'chararts/char_103_angel.ab', [self.skin]), [])

    def test_costume_container_and_costume_bundle_defaultskin(self):
        for container, bundle in [('/char_103_angel/epoque_2.prefab', 'chararts/char_103_angel.ab'), ('/char_103_angel_epoque#2/defaultskin.prefab', 'chararts/char_103_angel_epoque#2.ab'), ('/defaultskin.prefab', 'chararts/char_103_angel_epoque#2.ab')]:
            self.assertEqual(module.matching_skins(container, bundle, [self.skin]), [self.skin])
        self.assertEqual(module.matching_skins('/char_102_texas/epoque_2.prefab', 'chararts/char_102_texas.ab', [self.skin]), [])

    def test_strict_catalog_does_not_export_other_skins_from_shared_bundles(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game, kit, out = root/'game', root/'kit', root/'out'
            (game/'chararts').mkdir(parents=True)
            (game/'chararts/char_103_angel.ab').touch()
            kit.mkdir()
            (kit/'skin-catalog.json').write_text(json.dumps([self.skin]))
            (kit/'skin-baseline.json').write_text(json.dumps({'prefabs': [], 'graphics': {}}))
            class Env:
                def prefabs(self, *args, **kwargs):
                    return {'/char_103_angel/old_outfit.prefab': object(), '/char_103_angel/epoque_2.prefab': object()}
            with patch.object(module.fx, 'scan_cabs', return_value={}), patch.object(module.fx, 'container_index', return_value={}), patch.object(module.fx, 'AssetEnv', return_value=Env()), patch.object(module.fx, 'skin_points', return_value={}), patch.object(module, 'skin_components', return_value=([],set())) as components:
                report = module.export_skins(game,kit,out,log=lambda *a:None,strict_catalog=True)
            self.assertEqual(components.call_count,1)
            self.assertEqual(report['summary']['prefabRecords'],1)
            self.assertEqual(report['skins'][0]['skinIds'],[self.skin['skinId']])

    def test_prune_excludes_base_files_and_keeps_new_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'data').mkdir()
            fx = root / 'public/assets/local/fx'
            for d in ['prefabs', 'tex/half', 'mesh']:
                (fx / d).mkdir(parents=True, exist_ok=True)
            groups = {'fx': {'index': {}, 'textures': {}}, 'fx/prefabs': {k: {'path': f'/assets/local/fx/prefabs/{k}.json'} for k in ['base', 'added']}, 'fx/tex': {k: {'path': f'/assets/local/fx/tex/{k}.webp', 'half': f'/assets/local/fx/tex/half/{k}.webp'} for k in ['base', 'added']}, 'fx/mesh': {}}
            (root / 'data/local-fx.json').write_text(json.dumps({'groups': groups}))
            (fx / 'index.json').write_text(json.dumps({'prefabs': {'base': {}, 'added': {}}}))
            (fx / 'textures.json').write_text(json.dumps({'textures': {'base': {}, 'added': {}}}))
            for path in ['prefabs/base.json', 'prefabs/added.json', 'tex/base.webp', 'tex/half/base.webp', 'tex/added.webp', 'tex/half/added.webp']:
                (fx / path).write_bytes(b'test')
            module.prune_base(root, {'prefabs': ['base'], 'textures': ['base'], 'meshes': []})
            self.assertFalse((fx / 'prefabs/base.json').exists())
            self.assertFalse((fx / 'tex/base.webp').exists())
            self.assertTrue((fx / 'prefabs/added.json').exists())
            self.assertTrue((fx / 'tex/half/added.webp').exists())
            self.assertEqual(list(json.loads((fx / 'index.json').read_text())['prefabs']), ['added'])


if __name__ == '__main__':
    unittest.main()
