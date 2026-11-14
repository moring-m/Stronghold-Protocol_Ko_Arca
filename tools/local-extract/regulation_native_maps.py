#!/usr/bin/env python3
"""规程 scenes (regulation_scenes.py → scene/<stageId>/) → the fork's native map format (map/original), so a 규정
battlefield is drawn by the same native renderer and materials as the 맹약 maps (board3d/scene.js originalMaterials:
the sand / Syracuse metro / icewild shaders), not by the scene renderer's generic material.

Both formats are board space already (x = column, y = row, z = height, see regulation_scenes / extract-original-maps),
so the geometry is copied as is. Differences handled here:
  * buckets: one per material and lightmap page; every bucket is `platform: false` (scenery — the native renderer keeps
    each component that touches the visible area and hides only components wholly inside a hidden area, which is what
    the scene's HIDDEN@ groups did). [ASSUMED] the prefab ground tiles need no clipping to the play area.
  * normals int8×4 → float xyz; vertex colour u8 rgba → float rgb.
  * lightmap: the scene page is gamma-encoded with range `lightRange` (texel × range); the native shader decodes Unity
    RGBM (rgb × 5a), so the page is written as PNG with a constant alpha of range / 5.
A stage is converted only when the native material table (map/original materials-*.json) has every material it uses;
the others stay on the scene renderer.

Usage: python3 tools/local-extract/regulation_native_maps.py ASSET_PUBLIC_ROOT MATERIALS_JSON OUT_MANIFEST_JSON
  ASSET_PUBLIC_ROOT  the assets repository's public/ (reads assets/local/scene/, writes assets/local/map/original/)
  MATERIALS_JSON     the native material table the game uses (its path under ASSET_PUBLIC_ROOT)
  OUT_MANIFEST_JSON  written: the map/original group rows to add to data/local-assets.json
"""
import gzip
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_native_maps import pack  # noqa: E402
from regulation_scenes import REGULATION_IDS  # noqa: E402

VERSION = 16
VERTEX_BYTES = 36


def chunks_of(doc, buf):
    for c in doc['chunks']:
        n, m, o = c['verts'], c['tris'] * 3, c['offset']
        p = o
        pos = np.frombuffer(buf, '<f4', n * 3, p).reshape(-1, 3); p += n * 12
        uv = np.frombuffer(buf, '<f4', n * 2, p).reshape(-1, 2); p += n * 8
        uv1 = np.frombuffer(buf, '<f4', n * 2, p).reshape(-1, 2); p += n * 8
        nrm = np.frombuffer(buf, '<i1', n * 4, p).reshape(-1, 4); p += n * 4
        col = np.frombuffer(buf, '<u1', n * 4, p).reshape(-1, 4); p += n * 4
        idx = np.frombuffer(buf, '<u4' if c.get('index32') else '<u2', m, p).astype(np.int64)
        yield c, pos, uv, uv1, nrm, col, idx


def convert(public, stage, materials, out_rows):
    sdir = public / 'assets/local/scene' / stage
    doc = json.loads((sdir / 'scene.json').read_text(encoding='utf-8'))
    used = set(doc['materials'])
    missing = sorted(used - set(materials))
    if missing:
        return {'stage': stage, 'skipped': 'materials not in the native table: ' + ', '.join(missing)}
    buf = (sdir / 'scene.bin').read_bytes()
    out = public / 'assets/local/map/original'
    out.mkdir(parents=True, exist_ok=True)
    rng = float(doc.get('lightRange') or 3.0)
    alpha = max(1, min(255, round(255 * rng / 5)))
    pages = {}
    for i in range(int(doc.get('lightmaps') or 0)):
        src = sdir / f'lm{i}.webp'
        if not src.exists():
            continue
        img = Image.open(src).convert('RGB')
        rgba = Image.merge('RGBA', (*img.split(), Image.new('L', img.size, alpha)))
        name = f'{stage}-Lightmap-{i}-scene-rgbm-v1'
        path = out / (name + '.png')
        bio = io.BytesIO(); rgba.save(bio, 'PNG', optimize=True); path.write_bytes(bio.getvalue())
        pages[i] = name
        out_rows[name] = {'path': '/assets/local/map/original/' + path.name, 'kind': 'Texture2D'}
    buckets = {}
    tris = 0
    for c, pos, uv, uv1, nrm, col, idx in chunks_of(doc, buf):
        page = c.get('lightmap', -1)
        key = c['material'] + (f'@lightmap{page}' if page >= 0 else '') + '@scenery'
        b = buckets.setdefault(key, {'material': c['material'], 'platform': False,
                                     'lightMap': pages.get(page), 'position': [], 'normal': [], 'uv': [], 'uv1': [],
                                     'color': [], 'index': []})
        base = len(b['position']) // 3
        n = nrm[:, :3].astype(np.float64) / 127.0
        n /= np.maximum(1e-12, np.linalg.norm(n, axis=1))[:, None]
        b['position'].extend(np.round(pos.astype(np.float64), 5).ravel().tolist())
        b['normal'].extend(np.round(n, 5).ravel().tolist())
        b['uv'].extend(np.round(uv.astype(np.float64), 7).ravel().tolist())
        b['uv1'].extend(np.round(uv1.astype(np.float64), 7).ravel().tolist())
        b['color'].extend(np.round(col[:, :3].astype(np.float64) / 255.0, 4).ravel().tolist())
        b['index'].extend((idx + base).tolist())
        tris += len(idx) // 3
    allp = np.array([v for b in buckets.values() for v in b['position']]).reshape(-1, 3)
    scene = {'version': VERSION, 'lighting': doc.get('light') and {
                 'intensity': doc['light'].get('intensity', 1.0), 'color': doc['light'].get('color', [1, 1, 1]),
                 # scene.json dir is (x, y, z-up); the native table stores (x, z, y) — the same sun reads
                 # [.361, .446, .819] in a 규정 scene and [.361, .819, .446] in act1autochess_m01's native record
                 'dir': doc['light']['dir'] and [doc['light']['dir'][0], doc['light']['dir'][2], doc['light']['dir'][1]]},
             'stageId': stage, 'sourceBundle': doc.get('bundle'), 'md5': None, 'buckets': buckets,
             'stats': {'renderers': len(doc['chunks']), 'triangles': tris,
                       'bounds': [allp.min(0).tolist(), allp.max(0).tolist()],
                       'materials': {m: 1 for m in sorted(used)}, 'source': 'regulation scene/' + stage}}
    binary = out / f'{stage}-v{VERSION}.bin.gz'
    binary.write_bytes(gzip.compress(pack(scene), mtime=0))
    out_rows[stage] = {'path': '/assets/local/map/original/' + binary.name, 'kind': 'original-unity-scene',
                       'binaryPath': '/assets/local/map/original/' + binary.name}
    return {'stage': stage, 'buckets': len(buckets), 'triangles': tris, 'lightmaps': len(pages)}


def main():
    public, materials_path, out_manifest = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    materials = json.loads(materials_path.read_text(encoding='utf-8'))
    rows, report = {}, []
    for stage in REGULATION_IDS:
        if (public / 'assets/local/scene' / stage / 'scene.json').exists():
            r = convert(public, stage, materials, rows)
            report.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
    out_manifest.write_text(json.dumps({'map/original': rows, 'report': report}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
