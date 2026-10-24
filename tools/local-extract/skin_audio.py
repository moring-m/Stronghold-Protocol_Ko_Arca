"""Export requested skin AudioClips from an already prepared client view; never modify client files."""
import argparse, gc, hashlib, json, re
from pathlib import Path

def audio_names(catalog):
    return {Path(s['asset'].replace('\\','/')).name.lower().removesuffix('.mp3') for row in catalog for bank in (row.get('banks') or []) for s in (bank.get('sounds') or []) if s.get('asset')}

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--out',required=True);p.add_argument('--banks',required=True);args=p.parse_args()
    root,out=Path(args.root).resolve(),Path(args.out).resolve()
    if not root.is_dir():raise SystemExit('Client view not found: '+str(root))
    if out.exists():raise SystemExit('Choose a new output folder; existing files are preserved.')
    import aklz4  # registers the prepared client's Arknights LZ4 variant
    import UnityPy
    requested=audio_names(json.loads(Path(args.banks).read_text(encoding='utf-8-sig')))
    out.mkdir(parents=True);found=set();files=[];errors=[]
    bundles=sorted(p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in ('.ab','.bundle','.unity3d','.bin','.dat'))
    audio=[p for p in bundles if any(s in p.as_posix().lower() for s in ('audio','sound','aud_'))]
    # Obfuscated views may have no audio directory names, so scan all bundles in that case.
    jobs=audio or bundles
    for n,path in enumerate(jobs,1):
        env=None
        try:
            env=UnityPy.load(str(path))
            for obj in env.objects:
                kind=obj.type.name
                if kind=='AudioClip':
                    clip=obj.read();name=clip.m_Name.lower().removesuffix('.mp3').removesuffix('.wav')
                    if name not in requested:continue
                    samples=clip.samples
                    if not samples:raise RuntimeError('AudioClip has no decoded samples: '+clip.m_Name)
                    for leaf,data in samples.items():
                        safe=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',Path(leaf).name)
                        dest=out/'audio'/safe
                        if dest.exists():dest=dest.with_name(dest.stem+'-'+str(obj.path_id)+dest.suffix)
                        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
                        files.append({'name':clip.m_Name,'file':dest.relative_to(out).as_posix(),'bundle':path.relative_to(root).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
                    found.add(name)
                elif kind=='TextAsset':
                    text=obj.read()
                    if 'audio_data' in text.m_Name.lower():
                        data=text.m_Script
                        (out/'audio_data.txt').write_bytes(data if isinstance(data,bytes) else data.encode('utf-8','surrogateescape'))
        except Exception as e:errors.append({'bundle':path.relative_to(root).as_posix(),'error':str(e)})
        finally:del env
        if n%20==0 or n==len(jobs):print(f'Audio bundles {n}/{len(jobs)}; matched clips {len(found)}/{len(requested)}',flush=True);gc.collect()
    report={'requested':len(requested),'found':len(found),'files':files,'missing':sorted(requested-found),'errors':errors}
    (out/'audio-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Output: '+str(out),flush=True)
    if not found:raise SystemExit('No requested clips found. Keep audio-report.json; the prepared client view may omit audio bundles.')
if __name__=='__main__':main()
