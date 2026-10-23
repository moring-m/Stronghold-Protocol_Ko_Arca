import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('fx_mounts',Path(__file__).resolve().parents[1]/'tools/local-extract/fx.py')
fx=importlib.util.module_from_spec(spec);spec.loader.exec_module(fx)

class AnimatorSlotExtraction(unittest.TestCase):
 def test_transform_binding_wins_over_node_name_and_keeps_bone(self):
  asset=object()
  def obj(i,kind):return SimpleNamespace(path_id=i,assets_file=asset,type=SimpleNamespace(name=kind))
  root,anchor,misnamed=obj(1,'GameObject'),obj(2,'GameObject'),obj(3,'GameObject')
  animator,tr,bone,tr_wrong=obj(4,'MonoBehaviour'),obj(5,'Transform'),obj(6,'MonoBehaviour'),obj(7,'Transform')
  table={4:animator,5:tr,6:bone,7:tr_wrong}
  records={1:{'m_Name':'skin','m_Component':[{'component':{'id':4}}]},2:{'m_Name':'EmitterAnchor','m_Component':[{'component':{'id':5}},{'component':{'id':6}}]},3:{'m_Name':'Special1','m_Component':[{'component':{'id':7}}]},4:{'_front':{'specialPoint1':{'id':5}}},6:{'boneName':'F_OriginMuzzle','followBoneRotation':1}}
  class Env:
   def prefabs(self,*a,**k):return {'skin.prefab':root}
   def tt(self,o):return records.get(o.path_id,{})
   def resolve(self,sf,ptr):return asset,table.get((ptr or {}).get('id'))
   def script(self,o):return None,'CharacterAnimator' if o is animator else 'BoneFollower'
  with patch.object(fx,'go_children',side_effect=lambda env,go:[anchor,misnamed] if go is root else []),patch.object(fx,'go_transform',return_value=([.4,.2,0],[0,0,0,1],[1,1,1])):
   points=fx.skin_points(Env(),'bundle','skin.prefab',None)
  self.assertEqual(points['Special1']['front']['bone'],'F_OriginMuzzle')
  self.assertEqual(points['Special1']['front']['path'],'EmitterAnchor')

if __name__=='__main__':unittest.main()
