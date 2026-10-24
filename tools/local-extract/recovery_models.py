"""Export all active/inactive Spine and mesh renderers below selected client prefab roots."""
import hashlib
import json
from pathlib import Path
import fx
from skin_fx import matching_skins, skin_components


def resolve_obj(env, owner, ptr):
    sf,obj=env.resolve(owner.assets_file,ptr)
    return obj if obj is not None and sf!='builtin' else None


def write_skeleton(env,sda,out,sub,groups):
    from extract import _text_bytes, merge_alpha, normalize_atlas, atlas_pages
    d=env.tt(sda);skeleton=resolve_obj(env,sda,d.get('skeletonJSON'))
    if skeleton is None:raise ValueError('Unresolved skeleton TextAsset')
    texts,pages=[],{}
    for ptr in d.get('atlasAssets') or []:
        atlas=resolve_obj(env,sda,ptr)
        if atlas is None:raise ValueError('Unresolved Spine AtlasAsset')
        at=env.tt(atlas);text=resolve_obj(env,atlas,at.get('atlasFile'))
        if text is not None:texts.append(_text_bytes(text.read()).decode('utf-8','replace'))
        for material_ptr in at.get('materials') or []:
            material=resolve_obj(env,atlas,material_ptr)
            if material is None:raise ValueError('Unresolved Spine material')
            props=env.tt(material).get('m_SavedProperties') or {};tex=dict(props.get('m_TexEnvs') or [])
            main=resolve_obj(env,material,(tex.get('_MainTex') or {}).get('m_Texture'))
            alpha=resolve_obj(env,material,(tex.get('_AlphaTex') or {}).get('m_Texture'))
            if main is None:raise ValueError('Unresolved Spine texture')
            mt=main.read();straight=dict(props.get('m_Floats') or []).get('_StraightAlphaInput')==1
            pages[mt.m_Name+'.png']=merge_alpha(mt.image,alpha.read().image if alpha is not None else None,straight)
    if not texts or not pages:raise ValueError('Spine atlas/pages missing')
    atlas='\n\n'.join(t.strip('\n') for t in texts)+'\n';names=atlas_pages(atlas)
    if set(names)!=set(pages):
        if len(names)!=1 or len(pages)!=1:raise ValueError('Spine page names do not match textures')
        pages={names[0]:next(iter(pages.values()))}
    # Client-supplied atlas names must never be allowed to leave the output folder.
    safe_pages={}
    for name,image in pages.items():
        leaf=name.replace('\\','/').rsplit('/',1)[-1]
        safe=fx.fx_file(leaf.removesuffix('.png'))+'.png'
        atlas=atlas.replace(name,safe);safe_pages[safe]=image
    dest=Path(out)/sub;dest.mkdir(parents=True,exist_ok=True)
    stem=fx.fx_file(getattr(skeleton.read(),'m_Name','skeleton').removesuffix('.skel'))
    files={stem+'.skel':_text_bytes(skeleton.read()),stem+'.atlas':normalize_atlas(atlas,{k:v.size for k,v in safe_pages.items()}).encode()}
    for name,data in files.items():(dest/name).write_bytes(data)
    for name,img in safe_pages.items():img.save(dest/name,format='PNG')
    paths=[]
    for p in sorted(dest.iterdir()):
        url='/assets/local/'+sub+'/'+p.name;groups.setdefault(sub,{})[p.name]={'path':url};paths.append(url)
    return {'files':paths,'skeleton':'/assets/local/'+sub+'/'+stem+'.skel','atlas':'/assets/local/'+sub+'/'+stem+'.atlas'}


def export_models(game,out,catalog,base_ids,log=print):
    game,out=Path(game),Path(out);out.mkdir(parents=True,exist_ok=True)
    chars={s['charId'] for s in catalog}|set(base_ids);cabs=fx.scan_cabs(game,dirs=fx.CAB_DIRS+('refs/arts','chararts','charpack'))
    rows,errors,groups=[],[],{};matched=set()
    def diagnostic_log(line):
        log(line)
        if str(line).strip().lower().startswith(('warn ','fail ')):errors.append({'exportWarning':str(line)})
    env=fx.AssetEnv(game,cabs);exporter=fx.Exporter(env,out/'raw-graphics',diagnostic_log)
    bundles=[p for p in sorted(game.rglob('*.ab')) if any(cid in p.as_posix().lower() for cid in chars)
             and any(part in p.as_posix().lower() for part in ('chararts','charpack','skin'))]
    for n,path in enumerate(bundles,1):
        rel=path.relative_to(game).as_posix()
        try:
            for container,root in env.prefabs(rel,full=True).items():
                skins=matching_skins(container,rel,catalog)
                base=next((cid for cid in base_ids if cid in (rel+'/'+container).lower() and
                           ('charpack/' in rel.lower() or container.lower().endswith('/defaultskin.prefab'))),None)
                if not skins and not base:continue
                key=fx.fx_file((skins[0]['skinId'] if skins else base)+'-'+hashlib.sha256((rel+container).encode()).hexdigest()[:10])
                components,_=skin_components(env,root,set())
                raw=out/'components'/(key+'.json');raw.parent.mkdir(parents=True,exist_ok=True)
                raw.write_text(json.dumps({'bundle':rel,'container':container,'components':components},ensure_ascii=False),encoding='utf-8')
                row={'bundle':rel,'container':container,'skinIds':[s['skinId'] for s in skins],
                     'baseCharId':base,'components':str(raw.relative_to(out)),'skeletons':[]}
                # Captures meshes/materials/AnimationClips even when there is no ParticleEffect component.
                try:
                    row['renderer']=exporter.prefab('model_'+key,root,rel)
                except Exception as e:
                    errors.append({'bundle':rel,'container':container,'rendererError':str(e)})
                    row['renderer']=None
                stack=[(root,'',True)];seen=set()
                while stack:
                    go,parent,active=stack.pop();identity=(id(go.assets_file),go.path_id)
                    if identity in seen:continue
                    seen.add(identity);d=env.tt(go);node=parent+d.get('m_Name','');active=active and bool(d.get('m_IsActive',1))
                    for entry in d.get('m_Component') or []:
                        obj=resolve_obj(env,go,entry.get('component'))
                        if obj is None or obj.type.name!='MonoBehaviour':continue
                        data=env.tt(obj);ptr=data.get('skeletonDataAsset') or data.get('_skeletonDataAsset')
                        if not ptr:continue
                        sda=resolve_obj(env,obj,ptr)
                        if sda is None:raise ValueError('Unresolved SkeletonDataAsset at '+node)
                        sub='recovery/spine/'+key+'/'+fx.fx_file(node)
                        model=write_skeleton(env,sda,out/'public/assets/local',sub,groups)
                        row['skeletons'].append({'node':node,'active':active,**model})
                    stack.extend((child,node+'/',active) for child in fx.go_children(env,go))
                rows.append(row)
                meshes=[]
                if row['renderer']:
                    desc=json.loads((exporter.out/row['renderer']['file']).read_text())
                    meshes=desc.get('meshes',[])
                if row['skeletons'] or meshes:matched.update(row['skinIds'])
        except Exception as e:errors.append({'bundle':rel,'error':str(e)})
        if n%10==0:log(f'Model bundles {n}/{len(bundles)}; records {len(rows)}')
    report={'models':rows,'textures':exporter.textures,'meshes':exporter.meshes,'groups':groups,'errors':errors,
            'missingSkinModels':[s['skinId'] for s in catalog if s['skinId'] not in matched]}
    (out/'models.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


def export_sprites(game,out,catalog,log=print):
    import UnityPy
    game,out=Path(game),Path(out);out.mkdir(parents=True,exist_ok=True)
    wanted={v.lower().removesuffix('.png') for s in catalog for k in ('avatarId','portraitId') if (v:=s.get(k))}
    wanted.update(['char_4217_makoto','char_4217_makoto_1','char_4217_makoto_2'])
    rows,errors,found=[],[],set()
    for path in sorted((game/'spritepack').glob('*.ab')):
        if not any(word in path.name.lower() for word in ('char','portrait','avatar','skill','equip')):continue
        env=None
        try:
            env=UnityPy.load(str(path))
            for obj in env.objects:
                if obj.type.name!='Sprite':continue
                sprite=obj.read();name=sprite.m_Name.lower().removesuffix('.png')
                if name not in wanted and 'makoto' not in name:continue
                image=sprite.image;digest=hashlib.sha256(image.tobytes()).hexdigest()[:12]
                dest=out/(fx.fx_file(sprite.m_Name)+'-'+digest+'.png');image.save(dest);found.add(name)
                rows.append({'name':sprite.m_Name,'file':dest.name,'bundle':path.relative_to(game).as_posix(),
                             'width':image.width,'height':image.height})
        except Exception as e:errors.append({'bundle':path.relative_to(game).as_posix(),'error':str(e)})
        finally:
            del env
            import gc;gc.collect()
    report={'sprites':rows,'missing':sorted(wanted-found),'errors':errors}
    (out/'sprites.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    log('Sprites: '+str(len(rows))+'; missing declared avatar/portrait IDs: '+str(len(report['missing'])))
    return report
