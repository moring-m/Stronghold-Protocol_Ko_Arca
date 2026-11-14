#!/usr/bin/env python3
"""A 규정 battlefield that is a 맹약 map with a few cells changed: copy the 맹약 native map (map/original, the packed
`*-v16.bin.gz`) and rebuild those cells from a donor cell of the same map.

For each target cell every triangle whose centroid lies in the cell is removed (walls, props, the old ground) and
the triangles of the donor cell are copied there, moved by the cell offset (same height: both are ground cells of
that map). Triangles are not split: a mesh crossing a cell boundary goes with the cell holding its centroid.

Usage: python3 tools/local-extract/patch_native_map.py SRC.bin.gz OUT.bin.gz STAGE_ID 'r,c<-dr,dc' ...
  e.g. act2autochess_m01 → 규정 act3autochess_m05: '4,6<-4,8' '4,14<-4,8' '11,6<-4,8' '11,14<-4,8'
"""
import gzip
import json
import struct
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_native_maps import pack  # noqa: E402


def unpack(raw):
    n = struct.unpack('<I', raw[4:8])[0]
    doc = json.loads(raw[8:8 + n])
    start = 8 + n + ((-n) & 3)
    for b in doc['buckets'].values():
        for key, (off, count, dtype) in b.pop('arrays').items():
            b[key] = np.frombuffer(raw, dtype, count, start + off).copy()
    return doc


def in_cell(cent, r, c):
    return (np.abs(cent[:, 0] - c) <= 0.5) & (np.abs(cent[:, 1] - r) <= 0.5)


def main():
    src, out, stage = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    edits = []
    for spec in sys.argv[4:]:
        t, d = spec.split('<-')
        edits.append((tuple(map(int, t.split(','))), tuple(map(int, d.split(',')))))
    doc = unpack(gzip.decompress(src.read_bytes()))
    report = []
    for name, b in doc['buckets'].items():
        pos = b['position'].reshape(-1, 3)
        tri = b['index'].reshape(-1, 3).astype(np.int64)
        if not len(tri):
            continue
        cent = pos[tri].mean(axis=1)
        drop = np.zeros(len(tri), dtype=bool)
        for (r, c), _ in edits:
            drop |= in_cell(cent, r, c)
        extra = {k: [] for k in ('position', 'normal', 'uv', 'uv1', 'color')}
        extra_idx = []
        base = len(pos)
        for (r, c), (dr, dc) in edits:
            ids = np.nonzero(in_cell(cent, dr, dc))[0]
            if not len(ids):
                continue
            verts, inv = np.unique(tri[ids].ravel(), return_inverse=True)
            for key, size in (('position', 3), ('normal', 3), ('uv', 2), ('uv1', 2), ('color', 3)):
                if key not in b or not len(b[key]):
                    continue
                a = b[key].reshape(-1, size)[verts].copy()
                if key == 'position':
                    a[:, 0] += c - dc; a[:, 1] += r - dr
                extra[key].append(a)
            extra_idx.append(inv.reshape(-1, 3) + base)
            base += len(verts)
        kept = tri[~drop]
        if extra_idx:
            for key, size in (('position', 3), ('normal', 3), ('uv', 2), ('uv1', 2), ('color', 3)):
                if extra[key]:
                    b[key] = np.concatenate([b[key].reshape(-1, size)] + extra[key]).ravel()
            kept = np.concatenate([kept] + extra_idx)
        b['index'] = kept.ravel().astype(np.uint32)
        report.append((name, int(drop.sum()), sum(len(i) for i in extra_idx)))
    doc['stageId'] = stage
    doc['patchedFrom'] = {'source': src.name, 'cells': [f'{t[0]},{t[1]}<-{d[0]},{d[1]}' for t, d in edits]}
    for b in doc['buckets'].values():
        for key in ('position', 'normal', 'uv', 'uv1', 'color', 'index'):
            if key in b:
                b[key] = b[key].tolist()
    out.write_bytes(gzip.compress(pack(doc), mtime=0))
    for r in report:
        print(*r)


if __name__ == '__main__':
    main()
