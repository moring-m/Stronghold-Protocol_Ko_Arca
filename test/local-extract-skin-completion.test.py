import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('complete_skin_fx', Path(__file__).resolve().parents[1] / 'tools/local-extract/complete_skin_fx.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Completion(unittest.TestCase):
    def test_reuses_original_output_and_exports_only_missing_definitions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            kit, source, output = root / 'kit', root / 'skin-output', root / 'followup'
            kit.mkdir()
            (source / 'data').mkdir(parents=True)
            (kit / 'skin-baseline.json').write_text(json.dumps({'prefabs': ['base_visual'], 'projectiles': ['base_projectile'], 'skills': [], 'textures': [], 'meshes': []}))
            raw = {'skins': [{'skinIds': ['skin_a'], 'components': [{'fields': {'old': 'base_projectile', 'new': 'costume_projectile'}}]}]}
            raw_path = source / 'skin-effects.json'
            raw_path.write_text(json.dumps(raw))
            before = raw_path.read_bytes()
            (source / 'data/local-fx.json').write_text(json.dumps({'groups': {'fx/prefabs': {'costume_visual': {}}, 'fx/tex': {}, 'fx/mesh': {}}}))
            class Environment:
                def prefabs(self, rel):
                    return {'base_projectile': {}, 'costume_projectile': {}} if rel == module.fx.PROJECTILES else {}
            records = {'base_projectile': {'effects': ['base_visual']}, 'costume_projectile': {'main': 'costume_visual', 'effects': ['costume_visual'], 'movement': {'class': 'StraightMovement'}}}
            with patch.object(module.fx, 'scan_cabs', return_value={}), patch.object(module.fx, 'container_index', return_value={'base_visual': '', 'costume_visual': ''}), patch.object(module.fx, 'AssetEnv', return_value=Environment()), patch.object(module.fx, 'projectile_entries', return_value=records), patch.object(module.fx, 'export_fx') as export:
                result = module.complete(root, kit, source, output, log=lambda _: None)
            export.assert_not_called()
            self.assertEqual(raw_path.read_bytes(), before)
            self.assertEqual(list(result['projectiles']), ['costume_projectile'])
            self.assertEqual(result['summary']['additionalVisualEffects'], 0)
            self.assertEqual(result['bindings'][0]['projectileReferences'], ['base_projectile', 'costume_projectile'])
            self.assertTrue((output / 'skin-projectiles.json').is_file())
            with self.assertRaisesRegex(RuntimeError, 'new follow-up'):
                module.complete(root, kit, source, output)


if __name__ == '__main__':
    unittest.main()
