import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace
module_path = Path(__file__).resolve().parents[1] / 'tools/local-extract/missing_fx_audio.py'
with patch.dict(sys.modules, {'fx': SimpleNamespace(), 'cn_skins': SimpleNamespace(validate_payloads=lambda p: None)}):
    spec = importlib.util.spec_from_file_location('missing_fx_audio', module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
class Delta(unittest.TestCase):
    def test_exports_every_missing_component_without_operator_name_filter(self):
        self.assertEqual(mod.missing_keys({'old': {}, 'clem_end': {}, 'projectile_child': {}, 'unrelated_new': {}},
                                         {'prefabs': ['old']}, {'clem_end', 'projectile_child'}), ['clem_end', 'projectile_child'])
    def test_unimplemented_clementia_is_not_forced(self):
        self.assertEqual(mod.missing_keys({'clemnt_new': {}}, {}, set()), [])
    def test_refreshes_all_clementia_components_even_if_previously_exported(self):
        self.assertEqual(mod.missing_keys({'clemnt_skill_02_start_01': {}},
                                         {'prefabs': ['clemnt_skill_02_start_01']}, {'clemnt_skill_02_start_01'}), ['clemnt_skill_02_start_01'])
    def test_does_not_treat_texture_names_as_existing_prefabs(self):
        self.assertEqual(mod.missing_keys({'shared_name': {}}, {'textures': ['shared_name']}, {'shared_name'}), ['shared_name'])
if __name__ == '__main__': unittest.main()
