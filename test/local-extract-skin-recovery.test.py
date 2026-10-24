import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace as NS
from unittest.mock import patch
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/local-extract'))
import skin_recovery as recovery
from skin_fx import matching_skins
from recovery_models import write_skeleton

class Recovery(unittest.TestCase):
 def skin(self,cid,sid,name='costume',prefab=None):
  return {'charId':cid,'skinId':sid,'displaySkin':{'skinName':name},'battleSkin':{'skinOrPrefabId':prefab or cid+'_outfit'}}
 def test_model_missing_is_selected_even_if_fx_was_exported_and_unimplemented_roster_is_excluded(self):
  a=self.skin('char_1_a','a@skin');b=self.skin('char_2_b','b@skin');c=self.skin('char_3_c','c@skin')
  table={'charSkins':{s['skinId']:s for s in [a,b,c]}}
  plan={'implementedOperators':['char_1_a','char_2_b'],'modelSkinIds':['b@skin'],'fxSkinIds':['a@skin','b@skin']}
  self.assertEqual(recovery.plan_skins(table,plan),[a])
 def test_all_makoto_base_e2_and_costumes_are_explicitly_included(self):
  skins=[self.skin(recovery.MAKOTO,'base',None,'DefaultSkin'),self.skin(recovery.MAKOTO,'e2',None,'DefaultSkin'),self.skin(recovery.MAKOTO,'outfit')]
  plan={'implementedOperators':[],'modelSkinIds':['base','e2','outfit'],'fxSkinIds':['base','e2','outfit']}
  self.assertEqual(recovery.plan_skins({'charSkins':{s['skinId']:s for s in skins}},plan),skins)
 def test_defaultskin_is_never_matched_to_another_operators_prefab(self):
  skin=self.skin(recovery.MAKOTO,'base',None,'DefaultSkin')
  self.assertEqual(matching_skins('assets/char_1_a/defaultskin.prefab','chararts/char_1_a.ab',[skin]),[])
  self.assertEqual(matching_skins('assets/char_4217_makoto/defaultskin.prefab','chararts/char_4217_makoto.ab',[skin]),[skin])
 def test_costume_defaultskin_does_not_get_mistaken_for_base_makoto(self):
  base=self.skin(recovery.MAKOTO,'base',None,'DefaultSkin');skin=self.skin(recovery.MAKOTO,'outfit',prefab=recovery.MAKOTO+'_p3r#1')
  self.assertEqual(matching_skins('assets/'+recovery.MAKOTO+'_p3r#1/defaultskin.prefab','chararts/'+recovery.MAKOTO+'_p3r#1.ab',[base,skin]),[skin])
  self.assertEqual(matching_skins('assets/'+recovery.MAKOTO+'_p3r#1/defaultskin.prefab','chararts/'+recovery.MAKOTO+'.ab',[base,skin]),[skin])
 def test_audio_bounds_match_complete_codenames_and_follow_explicit_shared_references(self):
  names=['battle.ON_SKILL_START.skchr_makoto_3','battle.ON_SKILL_START.skchr_makotoish_3','battle.ON_SKILL_START.skchr_other_3','battle.shared']
  data={'soundFXBanks':[{'name':n} for n in names]}
  self.assertEqual([b['name'] for b in recovery.select_audio(data,[recovery.MAKOTO],['battle.shared'])],[names[0],names[3]])
 def test_null_audio_lists_preserve_control_banks_and_extract_real_clips(self):
  from skin_audio import audio_names
  control={'name':'battle.ON_SKILL_START.skchr_makoto_3','sounds':None,'targetBank':'battle.shared'}
  shared={'name':'battle.shared','sounds':[{'asset':'Audio/shared_hit.mp3'}]}
  unrelated={'name':'battle.unrelated','sounds':None}
  self.assertEqual(recovery.select_audio({'soundFXBanks':[unrelated,control,shared]},[recovery.MAKOTO],['audio/shared_hit.mp3']),[control,shared])
  self.assertEqual(recovery.select_audio({'soundFXBanks':None},[recovery.MAKOTO]),[])
  self.assertEqual(audio_names([{'banks':None},{'banks':[control,shared]}]),{'shared_hit'})
 def test_serialized_action_graphs_keep_their_shared_audio_and_nested_effect_references(self):
  data={'SerializedState':json.dumps({'$type':'CreateEffect','key':'makoto_hit','child':json.dumps({'sound':'battle.ON_CUSTOM_TRIGGER.Shared'})})}
  refs=recovery.references(data)
  self.assertIn('makoto_hit',refs);self.assertIn('battle.on_custom_trigger.shared',refs)
  banks={'soundFXBanks':[{'name':'battle.ON_CUSTOM_TRIGGER.Shared'}]}
  self.assertEqual(len(recovery.select_audio(banks,[recovery.MAKOTO],refs)),1)
 def test_partial_stage_failure_still_collects_independent_stages_and_packages_diagnostics(self):
  with tempfile.TemporaryDirectory() as tmp:
   kit=Path(tmp)/'kit';kit.mkdir();game=Path(tmp)/'client';game.mkdir();out=Path(tmp)/'result'
   recovery.write(kit/'recovery-plan.json',{'implementedOperators':[],'modelSkinIds':[],'fxSkinIds':[]})
   recovery.write(kit/'baseline.snapshot.json',{'prefabs':[]})
   for name in ['character_table','battle_equip_table','uniequip_table','audio_data','skill_table','range_table']:recovery.write(kit/'tables'/f'{name}.json',{})
   stages=[];packaged=[]
   def audio_run(args,**kwargs):
    stages.append('audio');dest=Path(args[args.index('--out')+1]);recovery.write(dest/'audio-report.json',{'found':1,'missing':[],'errors':[]});return NS(returncode=0)
   def bad_skins(*args,**kwargs):raise RuntimeError('synthetic missing bundle')
   fake_env=NS(load_rel=lambda _:[])
   with patch.object(recovery,'export_skins',bad_skins),patch.object(recovery,'export_models',return_value={'models':[],'errors':[],'missingSkinModels':[]}),patch.object(recovery,'export_sprites',return_value={'missing':['portrait'],'errors':[]}),patch.object(recovery,'validate_payloads',lambda _:None),patch.object(recovery,'package',lambda path:packaged.append(path)),patch.object(recovery.subprocess,'run',audio_run),patch.object(recovery.fx,'scan_cabs',return_value={}),patch.object(recovery.fx,'container_index',return_value={}),patch.object(recovery.fx,'game_data',return_value={}),patch.object(recovery.fx,'talent_keys',return_value={}),patch.object(recovery.fx,'AssetEnv',return_value=fake_env),patch.object(recovery.fx,'crawl_units',return_value=({recovery.MAKOTO:{},'char_4231_clemnt':{}},{},{},{},set())):
    report=recovery.run(kit,game,out,{'charSkins':{}},'test')
   self.assertFalse(report['complete']);self.assertIn('audio',stages);self.assertEqual(packaged,[out]);self.assertTrue((out/'inventory.json').is_file());self.assertEqual(report['missingSprites'],['portrait']);self.assertFalse((out/'work').exists())
 def test_real_alpha_merger_accepts_material_mode_and_preserves_transparency(self):
  from extract import merge_alpha
  from PIL import Image
  rgb=Image.new('RGB',(1,1),(200,100,50));alpha=Image.new('L',(1,1),128)
  self.assertEqual(merge_alpha(rgb,alpha,True).getpixel((0,0)),(100,50,25,128))
  self.assertEqual(merge_alpha(rgb,alpha,False).getpixel((0,0)),(128,100,50,128))
  self.assertEqual(merge_alpha(Image.new('RGBA',(1,1),(200,100,50,128)),None,True).getpixel((0,0)),(100,50,25,128))
 def test_model_only_repair_never_repeats_audio_or_effect_exports(self):
  with tempfile.TemporaryDirectory() as tmp:
   kit=Path(tmp)/'kit';kit.mkdir();out=Path(tmp)/'result'
   recovery.write(kit/'recovery-plan.json',{'implementedOperators':[],'modelSkinIds':[],'fxSkinIds':[]})
   with patch.object(recovery,'export_models',return_value={'errors':[],'missingSkinModels':[]}) as models,patch.object(recovery,'export_skins',side_effect=AssertionError('FX must not repeat')),patch.object(recovery.subprocess,'run',side_effect=AssertionError('audio must not repeat')),patch.object(recovery,'package') as package:
    report=recovery.run_models_only(kit,Path(tmp)/'client',out,{'charSkins':{}},'test')
   self.assertTrue(report['complete']);models.assert_called_once();package.assert_called_once_with(out)
   self.assertTrue((out/'model-repair-report.json').is_file());self.assertTrue((out/'inventory.json').is_file())
 def test_cross_bundle_spine_dependencies_are_resolved_in_each_owners_file_and_names_are_safe(self):
  class Obj:
   def __init__(self,file,data,read=None):self.assets_file=file;self.data=data;self.value=read
   def read(self):return self.value
  def ptr(key):return {'key':key}
  from PIL import Image
  import extract as real_extract
  image=Image.new('RGBA',(2,2),(80,40,20,128))
  skel=Obj('F2',{},NS(m_Name='body',m_Script=b'SPINE'))
  atlas_text=Obj('F3',{},NS(m_Script=b'../../page#1.png\nsize: 2,2\n'))
  texture=Obj('F5',{},NS(m_Name='page#1',image=image))
  material=Obj('F4',{'m_SavedProperties':{'m_TexEnvs':[('_MainTex',{'m_Texture':ptr('texture')})]}})
  atlas=Obj('F2',{'atlasFile':ptr('atlasText'),'materials':[ptr('material')]})
  sda=Obj('F1',{'skeletonJSON':ptr('skel'),'atlasAssets':[ptr('atlas')]})
  edges={('F1','skel'):skel,('F1','atlas'):atlas,('F2','atlasText'):atlas_text,('F2','material'):material,('F4','texture'):texture}
  calls=[]
  def resolve(owner,p):
   calls.append((owner,p));obj=edges.get((owner,(p or {}).get('key')));return (obj.assets_file,obj) if obj else (None,None)
  env=NS(tt=lambda o:o.data,resolve=resolve)
  helper=NS(_text_bytes=lambda o:o.m_Script,merge_alpha=real_extract.merge_alpha,normalize_atlas=real_extract.normalize_atlas,atlas_pages=real_extract.atlas_pages)
  with tempfile.TemporaryDirectory() as tmp,patch.dict(sys.modules,{'extract':helper}):
   groups={};out=write_skeleton(env,sda,Path(tmp)/'out','models/body',groups)
   self.assertTrue((Path(tmp)/'out/models/body/body.skel').is_file())
   pages=list((Path(tmp)/'out/models/body').glob('*.png'));self.assertEqual(len(pages),1)
   with Image.open(pages[0]) as saved:self.assertEqual(saved.getpixel((0,0)),(80,40,20,128))
   self.assertTrue(pages[0].name.startswith('page_1-'));self.assertIn(pages[0].name,(Path(tmp)/'out/models/body/body.atlas').read_text())
   self.assertFalse((Path(tmp)/'page#1.png').exists())
   self.assertIn(('F4',ptr('texture')),calls)
   self.assertTrue(out['skeleton'].endswith('body.skel'))

if __name__=='__main__':unittest.main()
