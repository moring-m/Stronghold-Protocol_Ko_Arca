import importlib.util
import tempfile
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('cn_skins', Path(__file__).resolve().parents[1] / 'tools/local-extract/cn_skins.py')
cn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cn)

class CnIncremental(unittest.TestCase):
    def test_catalog_is_full_cn_but_completed_skins_and_default_outfits_are_excluded(self):
        table={'charSkins':{'completed':{'charId':'char_1','displaySkin':{'skinName':'old'},'battleSkin':{'skinOrPrefabId':'old'}},'new-cn':{'charId':'char_999','displaySkin':{'skinName':'new'},'battleSkin':{'skinOrPrefabId':'new'}},'default':{'charId':'char_2','displaySkin':None}}}
        all_skins,pending=cn.select_catalog(table,['completed'])
        self.assertEqual([x['skinId']for x in all_skins],['completed','new-cn'])
        self.assertEqual([x['skinId']for x in pending],['new-cn'])
    def test_completion_state_advances_only_after_success_and_tracks_dependency_keys(self):
        with tempfile.TemporaryDirectory() as folder:
            kit=Path(folder);out=kit/'output';cn.write(kit/'known-skins.snapshot.json',['old']);cn.write(out/'public/assets/local/fx/index.json',{'prefabs':{'new-fx':{}},'projectiles':{},'skills':{}})
            report={'skins':[{'skinIds':['new']}],'diagnostics':[{'error':'incomplete'}]};baseline={'prefabs':['old-fx']}
            self.assertFalse(cn.update_state(kit,out,report,{},baseline));self.assertFalse((kit/'state/known-skins.json').exists())
            report['diagnostics']=[]
            self.assertTrue(cn.update_state(kit,out,report,{'projectiles':{'new-shot':{}}},baseline))
            self.assertEqual(cn.read(kit/'state/known-skins.json'),['new','old'])
            self.assertEqual(cn.read(kit/'state/baseline.json')['prefabs'],['new-fx','old-fx'])
            self.assertIn('new-shot',cn.read(kit/'state/baseline.json')['projectiles'])
    def test_missing_payload_is_never_marked_as_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder);cn.write(out/'data/local-fx.json',{'groups':{'fx/prefabs':{'x':{'path':'/assets/local/fx/prefabs/missing.json'}}}})
            with self.assertRaisesRegex(ValueError,'Incomplete export'):cn.validate_payloads(out)
    def test_pc_path_discovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);base=root/'Arknights_Data/StreamingAssets/AB/Windows';base.mkdir(parents=True)
            self.assertEqual(cn.discover_client(root),(base,root/'Arknights_Data/PersistentData/Bundles'))

if __name__=='__main__': unittest.main()
