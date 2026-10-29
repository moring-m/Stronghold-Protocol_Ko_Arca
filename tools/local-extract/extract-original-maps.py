#!/usr/bin/env python3
"""Convert original Arknights Unity stage meshes, UVs and transforms to board-space JSON.
Input: matching archived scene + res bundles; never use the web game's reconstructed tile meshes.
Unity's custom shaders are approximated by the web renderer, not exported byte-for-byte.
"""
import json, sys, hashlib, gzip, math
from pathlib import Path
from collections import Counter
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import aklz4, UnityPy
from pack_native_maps import pack
from UnityPy.helpers.MeshHelper import MeshHandler
from extract import derive_rough_from_gloss
from map_geometry import lightmap_uv
root=Path(__file__).resolve().parents[2]
src=root/'.cache/original-map-bundles'
verify='--verify' in sys.argv
out=root/('public/assets/local/map/original-verify' if verify else 'public/assets/local/map/original');out.mkdir(parents=True,exist_ok=True)
manifest_path=root/'.cache/ursus-local-assets.json'
manifest=json.loads(manifest_path.read_text());group={};materials={};report=[]
resources=list((src/'arts').rglob('*.ab'))+list((src/'shaders').glob('*.ab'))
def register(name,path,kind):
 group[name]={'path':'/'+str(path.relative_to(root/'public')),'kind':kind}
 if kind=='original-unity-scene':
  binary=path.with_name(path.name.replace('.json.gz','.bin.gz'))
  binary.write_bytes(gzip.compress(pack(json.loads(gzip.decompress(path.read_bytes()))),mtime=0))
  group[name]['binaryPath']='/'+str(binary.relative_to(root/'public'))
def finite_json(value):
 if isinstance(value,dict):return {k:finite_json(v) for k,v in value.items()}
 if isinstance(value,list):return [finite_json(v) for v in value]
 return 0 if isinstance(value,float) and not math.isfinite(value) else value
def vector(v):return np.array([v.x,v.y,v.z],float)
def matrix(t):
 q=t.m_LocalRotation;x,y,z,w=q.x,q.y,q.z,q.w
 r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)], [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)], [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 m=np.eye(4);m[:3,:3]=r@np.diag(vector(t.m_LocalScale));m[:3,3]=vector(t.m_LocalPosition)
 if t.m_Father.path_id:m=matrix(t.m_Father.read())@m
 return m
for scene in sorted((src/'scenes').rglob('*.ab')):
 if 'lighting' in scene.name:continue
 stage_id=scene.stem.removeprefix('level_');print('Loading',stage_id,flush=True)
 lighting=scene.parent/scene.stem/'lightingdata.ab'
 e=UnityPy.load(*(str(p) for p in resources),str(scene),str(lighting))
 lightmaps=[]
 lighting_profile=None
 for o in e.objects:
  if o.type.name=='Light' and getattr(o.assets_file.parent,'name',None)==scene.name:
   light=o.read()
   if light.m_Enabled and light.m_Type==1:
    lighting_profile={'intensity':light.m_Intensity,'color':[light.m_Color.r,light.m_Color.g,light.m_Color.b]}
    for component in light.m_GameObject.read().m_Component:
     if component.component.type.name=='Transform':
      incoming=-(matrix(component.component.read())[:3,:3]@np.array([0.,0.,1.]));lighting_profile['dir']=[float(incoming[0]),float(-incoming[2]),float(incoming[1])]
      break
    break
 for o in e.objects:
  if o.type.name=='LightmapSettings' and getattr(o.assets_file.parent,'name',None)==scene.name:
   for lm in o.read_typetree()['m_Lightmaps']:
    from UnityPy.classes.PPtr import PPtr
    ptr=PPtr(**{'m_FileID':lm['m_Lightmap']['m_FileID'],'m_PathID':lm['m_Lightmap']['m_PathID'],'assetsfile':o.assets_file})
    tex=ptr.read();name=stage_id+'-'+tex.m_Name+'-rgbm-v1';path=out/(name+'.png');tex.image.save(path);register(name,path,'Texture2D');lightmaps.append(name)
 # Texture2D names are unique in these two matching theme packs.
 for o in e.objects:
  if o.type.name=='Texture2D':
   d=o.read();path=out/(d.m_Name+'.png')
   if not path.exists():d.image.save(path)
   register(d.m_Name,path,'Texture2D')
 for o in e.objects:
  if o.type.name!='Material':continue
  d=o.read();textures={};colors={}
  for k,v in d.m_SavedProperties.m_TexEnvs:
   if not v.m_Texture.path_id:continue
   try:textures[k]={'name':v.m_Texture.read().m_Name,'scale':[v.m_Scale.x,v.m_Scale.y],'offset':[v.m_Offset.x,v.m_Offset.y]}
   except FileNotFoundError:pass
  for k,v in d.m_SavedProperties.m_Colors:colors[k]=[v.r,v.g,v.b,v.a]
  try:shader=d.m_Shader.read().m_ParsedForm.m_Name
  except (FileNotFoundError,AttributeError):shader=None
  materials[d.m_Name]={'shader':shader,'keywords':list(getattr(d,'m_ValidKeywords',None) or (getattr(d,'m_ShaderKeywords','') or '').split()),'textures':textures,'colors':colors,'floats':dict(d.m_SavedProperties.m_Floats),'gammaLighting':True}
 existing=out/(stage_id+'-v16.json.gz')
 if existing.exists():
  cached=json.loads(gzip.decompress(existing.read_bytes()))
  if cached.get('md5')==hashlib.md5(scene.read_bytes()).hexdigest() and cached.get('version')==16:
   cached['lighting']=lighting_profile;existing.write_bytes(gzip.compress(json.dumps(cached,separators=(',',':')).encode(),mtime=0));register(stage_id,existing,'original-unity-scene');report.append({'id':stage_id,**cached['stats']});print(stage_id,'verified existing scene',flush=True);continue
 transforms={};filters={};renderers=[];mesh_handlers={}
 for o in e.objects:
  if getattr(o.assets_file.parent,'name',None)!=scene.name:continue
  if o.type.name=='Transform':
   d=o.read();transforms[d.m_GameObject.path_id]=d
  elif o.type.name=='MeshFilter':
   d=o.read();filters[d.m_GameObject.path_id]=d
  elif o.type.name=='MeshRenderer':renderers.append(o.read())
 buckets={};counts=Counter();skipped=Counter();bounds=[]
 for renderer in renderers:
  gid=renderer.m_GameObject.path_id;go=renderer.m_GameObject.read();name=go.m_Name
  if gid not in filters or not renderer.m_Enabled:skipped['disabled/no-filter']+=1;continue
  # Keep the existing animated gate/water/device system; exclude original background shadow catchers.
  if name.startswith('S_Background') or name=='pPlane1':skipped['background']+=1;continue
  try:mat_names=[p.read().m_Name if p.path_id else None for p in renderer.m_Materials]
  except FileNotFoundError:skipped['external-gate/device-material']+=1;continue
  if not mat_names or all(not n for n in mat_names):skipped['empty-material']+=1;continue
  try:mesh=filters[gid].m_Mesh.read()
  except FileNotFoundError:
   skipped['external/builtin-effect-mesh']+=1;continue
  ptr=filters[gid].m_Mesh;cache_key=(ptr.assetsfile.name,ptr.file_id,ptr.path_id)
  if cache_key not in mesh_handlers:
   h=MeshHandler(mesh);h.process();mesh_handlers[cache_key]=(h,list(h.get_triangles()))
  h,submeshes=mesh_handlers[cache_key]
  if not h.m_Vertices:continue
  batch=renderer.m_StaticBatchInfo
  if batch.subMeshCount:
   # Unity static batches store vertices in world space (or relative to a declared batch root).
   m=matrix(renderer.m_StaticBatchRoot.read()) if renderer.m_StaticBatchRoot.path_id else np.eye(4)
   submeshes=submeshes[batch.firstSubMesh:batch.firstSubMesh+batch.subMeshCount]
  else:m=matrix(transforms[gid])
  for slot,triangles in enumerate(submeshes):
   mat=mat_names[min(slot,len(mat_names)-1)]
   if mat is None:continue
   light_index=renderer.m_LightmapIndex if renderer.m_LightmapIndex<len(lightmaps) else None
   platform=name.startswith(('S_Ground','S_playground','S_patch','S_hide')) and '_out_' not in name.lower()
   bucket_key=mat+(('@lightmap'+str(light_index)) if light_index is not None else '')+('@platform' if platform else '@scenery')
   b=buckets.setdefault(bucket_key,{'material':mat,'platform':platform,'lightMap':lightmaps[light_index] if light_index is not None else None,'position':[],'normal':[],'uv':[],'uv1':[],'color':[],'index':[]});offset=len(b['position'])//3
   triangles=np.array(triangles,dtype=int)
   if not len(triangles):continue
   # Meshes may reference only a small submesh of a huge shared vertex buffer.
   used,indices=np.unique(triangles,return_inverse=True)
   v=np.array([h.m_Vertices[i] for i in used])[:,:3];p=v@m[:3,:3].T+m[:3,3]
   p[:,0]+=10;p[:,1]+=9;p[:,2]*=-1
   n=np.array([h.m_Normals[i] for i in used])[:,:3] if h.m_Normals else np.tile([0,1,0],(len(v),1))
   n=n@np.linalg.inv(m[:3,:3]);n[:,2]*=-1;n/=np.maximum(1e-12,np.linalg.norm(n,axis=1))[:,None]
   uv=np.array([h.m_UV0[i] for i in used])[:,:2] if h.m_UV0 else np.zeros((len(v),2))
   # Unity falls back to the primary UV stream when a mesh has no UV2.
   # The baked renderer ST is fitted to those atlas UVs (including negative offsets).
   # Sampling ST alone instead reads one unrelated texel across the entire tile.
   secondary=[h.m_UV1[i][:2] for i in used] if light_index is not None and h.m_UV1 else None
   st=renderer.m_LightmapTilingOffset
   tiling=(st.x,st.y,st.z,st.w) if light_index is not None and not batch.subMeshCount else None
   lmuv=np.array(lightmap_uv(uv.tolist(),secondary,tiling))
   b['uv1'].extend(np.round(lmuv,7).ravel().tolist())
   colors=np.array([h.m_Colors[i] for i in used])[:,:3] if h.m_Colors else np.ones((len(v),3))
   if colors.max(initial=0)>1:colors=colors/255
   b['position'].extend(np.round(p,5).ravel().tolist());b['normal'].extend(np.round(n,5).ravel().tolist());b['uv'].extend(np.round(uv,7).ravel().tolist());b['color'].extend(np.round(colors,4).ravel().tolist())
   bounds.append(p)
   # Reverse winding for the Unity→board handedness change.
   tri=indices.reshape(-1,3)
   if np.linalg.det(m[:3,:3])>0:tri=tri[:,::-1]
   b['index'].extend((tri+offset).ravel().tolist())
  for mat in set(mat_names):
   if mat:counts[mat]+=1
 bnd=np.concatenate(bounds)
 data={'version':16,'lighting':lighting_profile,'stageId':stage_id,'sourceBundle':str(scene.relative_to(src)),'md5':hashlib.md5(scene.read_bytes()).hexdigest(),'buckets':buckets,'stats':{'renderers':sum(counts.values()),'triangles':sum(len(b['index'])//3 for b in buckets.values()),'bounds':[bnd.min(axis=0).tolist(),bnd.max(axis=0).tolist()],'materials':dict(counts),'excluded':dict(skipped)}}
 path=out/(stage_id+'-v16.json.gz');path.write_bytes(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0));register(stage_id,path,'original-unity-scene');report.append({'id':stage_id,**data['stats']});print(stage_id,data['stats'],flush=True)
# The obstacle is its own trap model/material; it is not a wooden atlas tile.
crate_env=UnityPy.load(str(src/'arts/maps/common/trap/trap_110.ab'))
for o in crate_env.objects:
 if o.type.name=='Mesh' and o.read().m_Name in ('trap_1105_accrate','trap_1106_achplat'):
  h=MeshHandler(o.read());h.process();p=np.array(h.m_Vertices)[:,:3][:,[0,2,1]]*.01;p[:,1]*=-1
  n=np.array(h.m_Normals)[:,:3][:,[0,2,1]];n[:,1]*=-1
  # x,-z,y preserves handedness, so winding is unchanged.
  data={'position':p.ravel().tolist(),'normal':n.ravel().tolist(),'uv':np.array(h.m_UV0)[:,:2].ravel().tolist(),'index':np.array(list(h.get_triangles())[0]).ravel().tolist(),'bounds':{'x0':float(p[:,0].min()),'x1':float(p[:,0].max()),'z0':float(p[:,2].min()),'z1':float(p[:,2].max())}}
  key='crate' if o.read().m_Name=='trap_1105_accrate' else 'platform'
  path=out/(key+'-v1.json');path.write_text(json.dumps(data,separators=(',',':')));register(key,path,'original-unity-device')
used_materials={name for stage in report for name in stage['materials']}
used_materials.update(['MT_trap_1105_accrate','MT_trap_1106_achplat'])
materials={name:rec for name,rec in materials.items() if name in used_materials}
# Android ETC2 RGB normals already contain XYZ; gloss alpha stores smoothness.
# These are linear data maps, not sRGB colour maps.
for rec in materials.values():
 for slot, derive, suffix in [('_BumpMap', None, '_normal-rgb-v2'), ('_MetallicGlossMap', derive_rough_from_gloss, '_metalrough-v2')]:
  ref=rec['textures'].get(slot)
  if not ref:continue
  from PIL import Image
  source=out/(ref['name']+'.png');name=ref['name']+suffix;path=out/(name+'.png')
  if not path.exists():
   image=Image.open(source)
   if slot=='_BumpMap': image.convert('RGB').save(path)
   else:
    rgba=image.convert('RGBA');r,g,b,a=rgba.split();from PIL import ImageOps;Image.merge('RGB',(r,ImageOps.invert(a),r)).save(path)
  register(name,path,'Texture2D');ref['name']=name
used_textures={name for name in group if '-rgbm-v1' in name}
used_textures|={ref['name'] for rec in materials.values() for slot,ref in rec['textures'].items() if slot in ('_MainTex','_EmissionMap','_BumpMap','_MetallicGlossMap','_FlowMap','_BumpMapDetail','_FoamMask','_FoamTex','_DissolveTex','_CausticsTex','_WaterNoiseTex')}
group={name:rec for name,rec in group.items() if rec['kind']!='Texture2D' or name in used_textures}
path=out/'materials-v14.json';path.write_text(json.dumps(finite_json(materials),separators=(',',':'),allow_nan=False));register('materials',path,'original-unity-materials')
manifest['groups']['map/original']=group;manifest['count']=sum(map(len,manifest['groups'].values()))
manifest['originalMaps']={'repository':'ArknightsAssets/ArknightsAssets2','indexCommit':'7ddea107cef9ab24d55052f36bf984fcd1bff9ed','versionId':'26-04-14-11-12-01_cf554f','stages':report}
if verify:
 baseline=root/'public/assets/local/map/original'
 differences=[];checked=[]
 for filename in sorted({Path(entry['path']).name for entry in group.values()}):
  path=out/filename
  old=baseline/path.name
  if old.exists():
   same=old.read_bytes()==path.read_bytes();checked.append({'file':path.name,'matches':same})
   if not same:differences.append(path.name)
  else:differences.append(path.name)
 audit={'scope':'Reproducible resource extraction only; not proof of visual equivalence to the original game.','source':manifest['originalMaps'],'checked':checked,'differences':differences}
 (root/'docs/ORIGINAL-MAP-RESOURCE-AUDIT.json').write_text(json.dumps(audit,indent=2))
 print('Original resource verification:',len(checked),'files;',len(differences),'differences',differences,flush=True)
else:
 manifest_path.write_text(json.dumps(manifest));(root/'.cache/ursus-data/local-assets.json').write_text(json.dumps(manifest))
