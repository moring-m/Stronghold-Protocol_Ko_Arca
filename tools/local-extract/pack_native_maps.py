"""Pack existing native map geometry without changing material/lighting metadata."""
import gzip,json,struct,sys
from pathlib import Path
import numpy as np

def pack(scene):
    doc={**scene,'buckets':{}};parts=[];offset=0
    for name,bucket in scene['buckets'].items():
        entry={k:v for k,v in bucket.items() if k not in ('position','normal','uv','uv1','color','index')};entry['arrays']={}
        for key in ('position','normal','uv','uv1','color','index'):
            if key not in bucket:continue
            dtype='<u4' if key=='index' else '<f8'
            array=np.asarray(bucket[key],dtype=dtype);raw=array.tobytes()
            entry['arrays'][key]=[offset,len(array),dtype];parts.append(raw);offset+=len(raw)
        doc['buckets'][name]=entry
    header=json.dumps(doc,separators=(',',':')).encode();padding=(-len(header))%4
    return b'SPN1'+struct.pack('<I',len(header))+header+b'\0'*padding+b''.join(parts)

if __name__=='__main__':
    root=Path(__file__).resolve().parents[2]
    for filename in sys.argv[1:]:
        manifest_path=Path(filename);manifest=json.loads(manifest_path.read_text())
        for entry in manifest.get('groups',{}).get('map/original',{}).values():
            if entry.get('kind')!='original-unity-scene':continue
            source=root/'public'/entry['path'].lstrip('/');target=source.with_name(source.name.replace('.json.gz','.bin.gz'))
            target.write_bytes(gzip.compress(pack(json.loads(gzip.decompress(source.read_bytes()))),mtime=0))
            entry['binaryPath']='/'+str(target.relative_to(root/'public'))
        manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
