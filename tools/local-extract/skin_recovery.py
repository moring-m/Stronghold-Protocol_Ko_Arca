"""Bounded CN recovery: missing playable costumes + Makoto's complete visual/audio graph."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
sys.path.insert(0,str(Path(__file__).resolve().parent))
import fx
from cn_skins import latest_catalog, discover_client, package, validate_payloads
from skin_fx import export_skins
from complete_skin_fx import complete
from recovery_models import export_models, export_sprites

MAKOTO='char_4217_makoto'

def write(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    def encode_binary(obj):
        if isinstance(obj,(bytes,bytearray)):return {'encoding':'base64','data':base64.b64encode(obj).decode('ascii')}
        raise TypeError(type(obj).__name__)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2,default=encode_binary),encoding='utf-8')


def plan_skins(table,plan):
    allowed=set(plan['implementedOperators'])|{MAKOTO};available=set(plan['modelSkinIds']);bound=set(plan['fxSkinIds'])
    rows=[]
    for skin in table.get('charSkins',{}).values():
        cid=skin.get('charId');sid=skin.get('skinId')
        if cid not in allowed:continue
        named=bool((skin.get('displaySkin') or {}).get('skinName'))
        if cid==MAKOTO or (named and (sid not in available or sid not in bound)):rows.append(skin)
    return rows


def select_audio(data,characters,extra_refs=()):
    codes={cid.split('_',2)[2] for cid in characters}
    pattern=re.compile(r'(?<![a-z0-9])(?:'+'|'.join(re.escape(x) for x in sorted(set(characters)|codes,key=len,reverse=True))+r')(?![a-z0-9])',re.I)
    refs={s.lower().replace('\\','/') for s in extra_refs}
    return [b for b in (data.get('soundFXBanks') or []) if b.get('name','').startswith('battle.') and
            (pattern.search(b['name']) or b['name'].lower() in refs or b['name'].lower().removeprefix('battle.') in refs
             or any((s.get('asset') or '').lower().replace('\\','/') in refs for s in (b.get('sounds') or []) if s.get('asset')))]


def references(value):
    out=set();fx.string_values(value,out);fx.all_strings(value,out)
    # Odin action graphs are JSON strings inside typetrees. Traverse their fields too, without executing them.
    pending=list(out);seen=set()
    while pending:
        text=pending.pop()
        if not isinstance(text,str) or text in seen:continue
        seen.add(text)
        if text.lstrip()[:1] not in ('{','[') or len(text)>16*1024*1024:continue
        try:decoded=json.loads(text)
        except ValueError:continue
        values=set();fx.string_values(decoded,values);fx.all_strings(decoded,values)
        pending.extend(values-out);out.update(values)
    return {s.lower().replace('\\','/') for s in out if isinstance(s,str)}


def run(kit,game,output,table,catalog_source,reference_video=None):
    kit,game,output=map(Path,(kit,game,output))
    if output.exists():raise ValueError('Use a fresh output directory')
    plan=json.loads((kit/'recovery-plan.json').read_text(encoding='utf-8'))
    selected=plan_skins(table,plan);output.mkdir(parents=True)
    run_root=output/'work';run_root.mkdir()
    baseline=json.loads((kit/'baseline.snapshot.json').read_text())
    write(run_root/'skin-catalog.json',selected);write(run_root/'skin-baseline.json',baseline)
    write(output/'requested-skins.json',selected)
    import shutil
    if (kit/'references').is_dir():shutil.copytree(kit/'references',output/'references')
    errors=[];results={};models={};skin_result={};wiring={};needed=set();raw_audio_refs=set()
    def attempt(name,fn):
        print('STAGE: '+name,flush=True)
        try:results[name]=fn();return results[name]
        except Exception as e:errors.append({'stage':name,'error':str(e)});print('ERROR: '+name+': '+str(e),flush=True);return None
    def diagnostic_log(line):
        print(line,flush=True)
        if re.match(r'^\s*(warn|FAIL)\b',str(line),re.I):errors.append({'stage':'resource export','error':str(line)})
    missing_frames=[]
    def graphic_frames():
        cabs=fx.scan_cabs(game,dirs=fx.CAB_DIRS+('refs/arts','chararts','charpack'))
        env=fx.AssetEnv(game,cabs)
        for cid in sorted({s['charId'] for s in selected}):
            if cid in baseline.get('graphics',{}):continue
            rel='charpack/'+cid+'.ab'
            if not (game/rel).is_file():missing_frames.append(cid);continue
            try:
                unit=fx.parse_unit(env,rel,cid,'char')
                if unit and unit.get('graphic'):baseline.setdefault('graphics',{})[cid]=unit['graphic']
                else:missing_frames.append(cid)
            except Exception as e:errors.append({'stage':'graphic coordinate frame','charId':cid,'error':str(e)})
        write(run_root/'skin-baseline.json',baseline)
        return {'missing':missing_frames}
    attempt('base graphic coordinate frames for skin muzzle/attachment alignment',graphic_frames)
    skins_dir=output/'costumes'
    skin_result=attempt('costume FX graph',lambda:export_skins(game,run_root,skins_dir,log=diagnostic_log,strict_catalog=True,jobs=1)) or {}
    if skin_result:
        needed.update(skin_result.get('newEffectKeys',[]))
        raw_audio_refs.update(references(skin_result))
        attempt('costume projectile and skill dependencies',lambda:complete(game,run_root,skins_dir,output/'costume-wiring',log=diagnostic_log,jobs=1))
    # Existing operators remain bounded; Makoto and Clementia's base graphics are explicit exceptions.
    chars=sorted({s['charId'] for s in selected}|{MAKOTO,'char_4231_clemnt'})
    models=attempt('all model renderers including inactive persona/substitute forms',lambda:export_models(game,output/'models',selected,chars)) or {}
    model_refs=set()
    for row in models.get('models',[]):
        component_file=output/'models'/row['components']
        model_refs.update(references(json.loads(component_file.read_text(encoding='utf-8'))))
    raw_audio_refs.update(model_refs)
    sprite_report=attempt('portraits, avatars, Makoto skill/module sprites',lambda:export_sprites(game,output/'sprites',selected)) or {}
    missing_units=[]
    def unit_graph():
        nonlocal wiring
        cabs=fx.scan_cabs(game,dirs=fx.CAB_DIRS+('refs/arts','chararts','charpack'))
        eff=fx.container_index(game,fx.EFFECT_GLOBS,run_root/'.cache/effects.json',2,print)
        gd=fx.game_data(kit);official=json.loads((kit/'tables/character_table.json').read_text())
        gd['chars']=chars;gd['enemies']=[];gd['skills']={cid:[s['skillId'] for s in official.get(cid,{}).get('skills',[]) if s] for cid in chars}
        # Extra token references declared by the selected operators are included; no unrelated operator is crawled.
        tokens={s for cid in chars for s in references(official.get(cid,{})) if s.startswith('token_')}
        gd['tokens']=sorted(tokens)
        equips=json.loads((kit/'tables/battle_equip_table.json').read_text());uniequips=json.loads((kit/'tables/uniequip_table.json').read_text())
        gd['talentKeys']=fx.talent_keys(chars+gd['tokens'],official,equips,uniequips)
        token_idx=fx.container_index(game,(fx.TOKEN_GLOB,),run_root/'.cache/tokens.json',2,print)
        units,projectiles,skills,skins,refs=fx.crawl_units(game,cabs,chars+gd['tokens'],gd,eff,{},token_idx,print)
        missing_units.extend(cid for cid in chars if cid not in units)
        wiring={'units':units,'projectiles':projectiles,'skills':skills,'skins':skins}
        write(output/'unit-skill-projectiles.json',wiring);raw_audio_refs.update(references(wiring))
        # Keep the original buff action graphs: FX summaries alone omit gameplay state transitions.
        env=fx.AssetEnv(game,cabs);templates={};owners={}
        for sf in env.load_rel(fx.BUFF_TEMPLATES):
            for obj in sf.objects.values():
                if obj.type.name!='MonoBehaviour':continue
                for row in env.tt(obj).get('_templates') or []:
                    if isinstance(row,dict) and row.get('templateKey'):
                        templates[row['templateKey']]=row;owners[row['templateKey']]=obj
        prefix=re.compile(r'(?<![a-z0-9])(?:'+'|'.join(re.escape(cid.split('_',2)[2]) for cid in chars)+r')(?![a-z0-9])',re.I)
        template_lookup={k.lower():k for k in templates}
        todo={k for k in templates if prefix.search(k) or k.lower() in references(wiring) or k.lower() in model_refs};kept={}
        while todo:
            key=todo.pop()
            if key in kept:continue
            row=templates[key];obj=owners[key]
            def pointer(ptr,owner=obj):
                sf,target=env.resolve(owner.assets_file,ptr)
                return {'reference':env.tt(target).get('m_Name'),'type':target.type.name} if target is not None and sf!='builtin' else None
            kept[key]=fx.enc_value(row,pointer)
            todo.update(template_lookup[k] for k in references(row) if k in template_lookup and template_lookup[k] not in kept)
        write(output/'buff-action-graphs.json',kept)
        raw_audio_refs.update(references(kept));model_refs.update(references(kept))
        wanted=sorted((set(refs)|needed|(model_refs & set(eff)))-set(baseline.get('prefabs',[])))
        if wanted:fx.export_fx(game,output/'unit-fx/public/assets/local',{},diagnostic_log,selection='keys',keys=wanted,jobs=1,root=run_root,fx_manifest=output/'unit-fx/data/local-fx.json')
        return {'units':len(units),'projectiles':len(projectiles),'skills':len(skills),'requestedFX':wanted}
    attempt('Makoto/base unit graph and complete FX dependency closure',unit_graph)
    audio_data=json.loads((kit/'tables/audio_data.json').read_text())
    banks=select_audio(audio_data,chars,raw_audio_refs)
    controls=select_audio({'soundFXBanks':audio_data.get('soundFXCtrlBanks',[])},chars,raw_audio_refs)
    by_name={b['name']:b for b in (audio_data.get('soundFXBanks') or [])}
    aliases=audio_data.get('bankAlias') or {};wanted={b['name'] for b in banks}|{b.get('targetBank') for b in controls if b.get('targetBank')}
    pending=list(wanted);seen_banks=set()
    while pending:
        name=pending.pop()
        if name in seen_banks:continue
        seen_banks.add(name)
        if aliases.get(name):pending.append(aliases[name])
    banks=[by_name[name] for name in sorted(seen_banks) if name in by_name]
    write(output/'audio-banks.json',{'banks':banks,'controlBanks':controls,'aliases':{k:v for k,v in aliases.items() if k in seen_banks}})
    write(run_root/'audio-banks.json',[{'banks':banks}])
    def audio():
        result=subprocess.run([sys.executable,'-X','utf8','-u',str(Path(__file__).with_name('skin_audio.py')),'--root',str(game),
                               '--out',str(output/'sfx'),'--banks',str(run_root/'audio-banks.json')],check=False)
        if result.returncode:raise RuntimeError('Audio extraction failed; keep sfx/audio-report.json')
        return json.loads((output/'sfx/audio-report.json').read_text())
    audio_report=attempt('selected operator and costume battle SFX',audio) or {}
    attempt('FX payload integrity',lambda:validate_payloads(output))
    if reference_video:
        def copy_reference_video():
            source=Path(reference_video)
            if not source.is_file():raise ValueError('Reference video file not found')
            target=output/'references'/('reference-video'+source.suffix.lower())
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
            return target.relative_to(output).as_posix()
        attempt('user-supplied reference video',copy_reference_video)
    exported_indexes=[json.loads(p.read_text(encoding='utf-8')) for p in output.rglob('index.json') if p.parent.name=='fx']
    known=set(baseline.get('prefabs',[]))|{k for index in exported_indexes for k in index.get('prefabs',{})}
    unresolved=sorted({key for index in exported_indexes for entry in index.get('prefabs',{}).values() for key in entry.get('refs',[]) if key not in known})
    if unresolved:errors.append({'stage':'FX dependency closure','missingEffectReferences':unresolved})
    # Preserve official tables needed to reconstruct rank/potential/module/skill rules later.
    selected_tables={}
    official=json.loads((kit/'tables/character_table.json').read_text())
    selected_tables['characters']={cid:official[cid] for cid in chars if cid in official}
    for table_name in ('skill_table','range_table','battle_equip_table','uniequip_table'):
        data=json.loads((kit/'tables'/f'{table_name}.json').read_text());selected_tables[table_name]=data
    write(output/'official-tables.json',selected_tables)
    report={'format':'cn-skin-recovery','version':1,'referenceVideoIncluded':bool(results.get('user-supplied reference video')),'catalogueSource':catalog_source,'requestedSkins':[s['skinId'] for s in selected],
            'operators':chars,'missingGraphicFrames':missing_frames,'missingUnits':missing_units,'modelDiagnostics':models.get('errors',[]),
            'missingSkinModels':models.get('missingSkinModels',[]),'missingSkinFXMetadata':skin_result.get('unmatchedSkinIds',[]),
            'missingSprites':sprite_report.get('missing',[]),'spriteErrors':sprite_report.get('errors',[]),
            'audioMissing':audio_report.get('missing',[]),'audioErrors':audio_report.get('errors',[]),'errors':errors}
    report['complete']=not (errors or missing_units or missing_frames or report['modelDiagnostics'] or report['missingSkinModels'] or report['missingSkinFXMetadata'] or report['audioMissing'] or report['audioErrors'] or report['missingSprites'] or report['spriteErrors'])
    write(output/'recovery-report.json',report)
    # Inventory every exported component; never update the game's completion baseline from a partial client.
    inventory=[]
    for p in sorted(output.rglob('*')):
        if p.is_file() and 'work' not in p.relative_to(output).parts:
            data=p.read_bytes();inventory.append({'path':p.relative_to(output).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    write(output/'inventory.json',inventory)
    # Working caches contain no deliverable; remove them from packaging, not from the client's prepared view.
    import shutil;shutil.rmtree(run_root)
    package(output)
    print('COMPLETE' if report['complete'] else 'PARTIAL: upload the output and recovery-report.json even if some client assets are absent.',flush=True)
    return report


def run_models_only(kit,game,output,table,catalog_source):
    """Retry the broken model stage without repeating successful FX or audio extraction."""
    kit,game,output=map(Path,(kit,game,output))
    if output.exists():raise ValueError('Use a fresh output directory')
    plan=json.loads((kit/'recovery-plan.json').read_text(encoding='utf-8'))
    selected=plan_skins(table,plan);output.mkdir(parents=True)
    write(output/'requested-skins.json',selected)
    chars=sorted({s['charId'] for s in selected}|{'char_4231_clemnt'})
    try:models=export_models(game,output/'models',selected,chars)
    except Exception as e:models={'errors':[{'stage':'models','error':str(e)}],'missingSkinModels':[s['skinId'] for s in selected]}
    report={'format':'cn-skin-model-repair','version':1,'catalogueSource':catalog_source,
            'requestedSkins':[s['skinId'] for s in selected],
            'modelDiagnostics':models.get('errors',[]),'missingSkinModels':models.get('missingSkinModels',[]),
            'fxAndAudioReusedFromPreviousUpload':True}
    report['complete']=not(report['modelDiagnostics'] or report['missingSkinModels'])
    write(output/'model-repair-report.json',report)
    inventory=[]
    for p in sorted(output.rglob('*')):
        if p.is_file():
            data=p.read_bytes();inventory.append({'path':p.relative_to(output).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    write(output/'inventory.json',inventory);package(output)
    print('COMPLETE' if report['complete'] else 'PARTIAL: some client models remain absent; upload the result and model-repair-report.json.',flush=True)
    return report


def main():
    p=argparse.ArgumentParser();p.add_argument('--root');p.add_argument('--client');p.add_argument('--catalog');p.add_argument('--out');p.add_argument('--reference-video');p.add_argument('--models-only',action='store_true');a=p.parse_args()
    kit=Path(__file__).resolve().parents[2]
    stamp=time.strftime('%Y%m%d-%H%M%S')+'-'+str(time.time_ns())[-6:]
    if a.root:game=Path(a.root)
    elif a.client:
        sys.path.insert(0,str(kit));from prepare_client import prepare
        base,updates=discover_client(a.client);game=kit/'work'/('cn-client-'+stamp);prepare(base,updates,game)
    else:raise SystemExit('Supply the prepared CN client with --root, or the installed CN game with --client.')
    if not game.is_dir():raise SystemExit('CN client folder not found')
    table,source=latest_catalog(kit,a.catalog)
    if a.models_only:report=run_models_only(kit,game,Path(a.out) if a.out else kit/('cn-skin-models-'+stamp),table,source)
    else:report=run(kit,game,Path(a.out) if a.out else kit/('cn-skin-recovery-'+stamp),table,source,a.reference_video)
    if not report['complete']:raise SystemExit(2)
if __name__=='__main__':main()
