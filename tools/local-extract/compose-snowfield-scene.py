#!/usr/bin/env python3
"""Native scene of the snow battlefield (custom_snowfield) composed from the chapter 8 scene level_main_08-01.

The official scene is cut into its authored pieces (one per renderer, board space like extract-original-maps.py) and
re-laid on the custom stage's grid: ground tiles (S_playground_gird) on the path / thicket tiles, the high-ground
blocks on 'h', the outworld rock blocks on the forbidden ring of the two fields; the surroundings (iceland, mountain
rocks, ice walls, outworld cubes, snow planes, land base) are moved to the sides of the wider autochess board. Tiles
the chapter has no piece for (benches, gates, objective, fence, works, preview pen, separators) are not covered: the
renderer draws them from the procedural board (scene `cover` = the covered tiles).

Usage: python -I compose-snowfield-scene.py <bundle dir> <stages.json> <out dir>
  bundle dir: level_main_08-01.ab, its lightingdata.ab, arts/maps/map_icewild/res.ab and the background mesh bundles
Writes custom_snowfield-v16.json.gz (+ .bin.gz), the lightmap, the textures and materials-icewild.json.
"""
import sys, json, gzip, hashlib, math
from pathlib import Path
from collections import defaultdict
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import aklz4, UnityPy  # noqa: F401  (aklz4 registers the bundle decompressor)
from UnityPy.helpers.MeshHelper import MeshHandler
from map_geometry import lightmap_uv
from pack_native_maps import pack

src, stages_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
STAGE = 'custom_snowfield'
stage = json.loads(stages_path.read_text())[STAGE]
bundles = sorted(str(p) for p in src.rglob('*.ab'))
scene_file = next(b for b in bundles if b.endswith('level_main_08-01.ab'))
env = UnityPy.load(*bundles)


def vec(v):
    return np.array([v.x, v.y, v.z], float)


def matrix(t):
    q = t.m_LocalRotation; x, y, z, w = q.x, q.y, q.z, q.w
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4); m[:3, :3] = r @ np.diag(vec(t.m_LocalScale)); m[:3, 3] = vec(t.m_LocalPosition)
    return matrix(t.m_Father.read()) @ m if t.m_Father.path_id else m


# ---- lighting, lightmap, textures, materials (as extract-original-maps.py) ----
lightmaps, lighting = [], None
for o in env.objects:
    if o.type.name == 'Light' and o.assets_file.parent.name.endswith('level_main_08-01.ab'):
        light = o.read()
        if light.m_Enabled and light.m_Type == 1:
            lighting = {'intensity': light.m_Intensity, 'color': [light.m_Color.r, light.m_Color.g, light.m_Color.b]}
            for c in light.m_GameObject.read().m_Component:
                if c.component.type.name == 'Transform':
                    d = -(matrix(c.component.read())[:3, :3] @ np.array([0., 0., 1.]))
                    lighting['dir'] = [float(d[0]), float(-d[2]), float(d[1])]
                    break
            break
for o in env.objects:
    if o.type.name == 'LightmapSettings' and o.assets_file.parent.name.endswith('level_main_08-01.ab'):
        from UnityPy.classes.PPtr import PPtr
        for lm in o.read_typetree()['m_Lightmaps']:
            if not lm['m_Lightmap']['m_PathID']:
                continue
            ptr = PPtr(m_FileID=lm['m_Lightmap']['m_FileID'], m_PathID=lm['m_Lightmap']['m_PathID'], assetsfile=o.assets_file)
            tex = ptr.read(); name = f'{STAGE}-{tex.m_Name}-rgbm-v1'
            tex.image.save(out / (name + '.png')); lightmaps.append(name)
materials, textures = {}, {}
for o in env.objects:
    if o.type.name == 'Texture2D':
        t = o.read(); textures[t.m_Name] = t
for o in env.objects:
    if o.type.name != 'Material':
        continue
    d = o.read(); tex, colors = {}, {}
    for k, v in d.m_SavedProperties.m_TexEnvs:
        if v.m_Texture.path_id:
            try:
                tex[k] = {'name': v.m_Texture.read().m_Name, 'scale': [v.m_Scale.x, v.m_Scale.y], 'offset': [v.m_Offset.x, v.m_Offset.y]}
            except FileNotFoundError:
                pass
    for k, v in d.m_SavedProperties.m_Colors:
        colors[k] = [v.r, v.g, v.b, v.a]
    try:
        shader = d.m_Shader.read().m_ParsedForm.m_Name
    except (FileNotFoundError, AttributeError):
        shader = None
    materials[d.m_Name] = {'shader': shader, 'keywords': list(getattr(d, 'm_ValidKeywords', None) or (getattr(d, 'm_ShaderKeywords', '') or '').split()),
                           'textures': tex, 'colors': colors, 'floats': dict(d.m_SavedProperties.m_Floats), 'gammaLighting': True}

# ---- the scene's pieces in board space ----
transforms, filters, renderers, handlers = {}, {}, [], {}
for o in env.objects:
    if not o.assets_file.parent.name.endswith('level_main_08-01.ab'):
        continue
    if o.type.name == 'Transform':
        d = o.read(); transforms[d.m_GameObject.path_id] = d
    elif o.type.name == 'MeshFilter':
        d = o.read(); filters[d.m_GameObject.path_id] = d
    elif o.type.name == 'MeshRenderer':
        renderers.append(o.read())
pieces = []
for r in renderers:
    gid = r.m_GameObject.path_id; name = r.m_GameObject.read().m_Name
    if gid not in filters or not r.m_Enabled:
        continue
    try:
        mats = [p.read().m_Name if p.path_id else None for p in r.m_Materials]
        mesh = filters[gid].m_Mesh.read()
    except (FileNotFoundError, ValueError):  # external effect meshes / empty references
        continue
    key = filters[gid].m_Mesh.path_id
    if key not in handlers:
        h = MeshHandler(mesh); h.process(); handlers[key] = (h, list(h.get_triangles()))
    h, subs = handlers[key]
    if not h.m_Vertices:
        continue
    batch = r.m_StaticBatchInfo
    if batch.subMeshCount:
        m = matrix(r.m_StaticBatchRoot.read()) if r.m_StaticBatchRoot.path_id else np.eye(4)
        subs = subs[batch.firstSubMesh:batch.firstSubMesh + batch.subMeshCount]
    else:
        m = matrix(transforms[gid])
    centre = matrix(transforms[gid])[:3, 3]
    light = r.m_LightmapIndex if r.m_LightmapIndex < len(lightmaps) else None
    for slot, tris in enumerate(subs):
        mat = mats[min(slot, len(mats) - 1)] if mats else None
        tris = np.array(tris, int)
        if mat is None or not len(tris):
            continue
        used, idx = np.unique(tris, return_inverse=True)
        v = np.array([h.m_Vertices[i] for i in used])[:, :3]; p = v @ m[:3, :3].T + m[:3, 3]
        p[:, 0] += 10; p[:, 1] += 9; p[:, 2] *= -1
        n = np.array([h.m_Normals[i] for i in used])[:, :3] if h.m_Normals else np.tile([0, 1, 0], (len(v), 1))
        n = n @ np.linalg.inv(m[:3, :3]); n[:, 2] *= -1; n /= np.maximum(1e-12, np.linalg.norm(n, axis=1))[:, None]
        uv = np.array([h.m_UV0[i] for i in used])[:, :2] if h.m_UV0 else np.zeros((len(v), 2))
        second = [h.m_UV1[i][:2] for i in used] if light is not None and h.m_UV1 else None
        st = r.m_LightmapTilingOffset
        tiling = (st.x, st.y, st.z, st.w) if light is not None and not batch.subMeshCount else None
        uv1 = np.array(lightmap_uv(uv.tolist(), second, tiling))
        col = np.array([h.m_Colors[i] for i in used])[:, :3] if h.m_Colors else np.ones((len(v), 3))
        if col.max(initial=0) > 1:
            col = col / 255
        tri = idx.reshape(-1, 3)
        if np.linalg.det(m[:3, :3]) > 0:
            tri = tri[:, ::-1]
        pieces.append({'name': name, 'material': mat, 'light': light, 'centre': (centre[0] + 10, centre[1] + 9),
                       'p': p, 'n': n, 'uv': uv, 'uv1': uv1, 'col': col, 'tri': tri})

kind = lambda n: n.rstrip('0123456789')
by = defaultdict(list)
for pc in pieces:
    by[kind(pc['name'])].append(pc)
# the official field: x 5..15 (cols), y 6..12 (rows) in board space; its pieces → prototypes keyed by tile
GROUND = [pc for pc in by['S_playground_gird'] if pc['material'] == 'MT_icewild' and pc['p'][:, 2].max() < 0.05 and len(pc['p']) == 28]
HIGH = [pc for pc in by['S_playground_gird'] + by['S_playground_fixhighground'] + by['S_playground_bake'] if pc['p'][:, 2].max() > 0.3]
ROCK = [pc for pc in by['S_outworld_rock'] if abs(np.ptp(pc['p'][:, 0]) - 1.06) < 0.1]
assert GROUND and HIGH and ROCK, (len(GROUND), len(HIGH), len(ROCK))

buckets = {}


def emit(pc, dx, dy, platform, keep=None):
    tri = pc['tri'] if keep is None else pc['tri'][keep]
    if not len(tri):
        return
    key = pc['material'] + (f'@lightmap{pc["light"]}' if pc['light'] is not None else '') + ('@platform' if platform else '@scenery')
    b = buckets.setdefault(key, {'material': pc['material'], 'platform': platform,
                                 'lightMap': lightmaps[pc['light']] if pc['light'] is not None else None,
                                 'position': [], 'normal': [], 'uv': [], 'uv1': [], 'color': [], 'index': []})
    off = len(b['position']) // 3
    p = pc['p'] + np.array([dx, dy, 0])
    b['position'] += np.round(p, 5).ravel().tolist(); b['normal'] += np.round(pc['n'], 5).ravel().tolist()
    b['uv'] += np.round(pc['uv'], 7).ravel().tolist(); b['uv1'] += np.round(pc['uv1'], 7).ravel().tolist()
    b['color'] += np.round(pc['col'], 4).ravel().tolist(); b['index'] += (tri + off).ravel().tolist()


def place(pc, r, c):
    cx, cy = pc['centre']
    emit(pc, c - round(cx), r - round(cy), True)


# ---- the two fields (normal rows 9–12, unite rows 2–5) ----
rows = stage['rows']
cover = []
FIELD = [range(2, 6), range(9, 13)]
for band in FIELD:
    for r in band:
        for c, g in enumerate(rows[r]):
            h = (r * 7 + c * 13) & 0xffff
            if g in 'rk':
                place(GROUND[h % len(GROUND)], r, c)
            elif g == 'h':
                place(HIGH[h % len(HIGH)], r, c)
            elif g == '#':
                place(ROCK[h % len(ROCK)], r, c)
            else:
                continue
            cover.append([r, c])

# ---- surroundings: the official field's left / right / far scenery moved to the board's sides ----
SCENERY = ['iceland', 'mountain_rock', 'S_outworld_icewall', 'S_outworld_cube', 'decore_rock', 'pPlane', 'ouworld_rock', 'land_base']
board_x0, board_x1 = -0.5, 20.5           # the autochess board (cols 0–20)
field_x0, field_x1, field_cy = 4.5, 15.5, 9.0  # the official field (cols 5–15) and its centre row
for name in SCENERY:
    for pc in by[name]:
        x, y = pc['centre']
        if name == 'iceland':
            # the snow ground / backdrop under everything, the board's own tiles cut out above it
            for dx in (0,):
                p = pc['p'] + np.array([dx, 1.5, 0])
                cen = p[pc['tri']].mean(axis=1)
                keep = ~((cen[:, 0] > board_x0) & (cen[:, 0] < board_x1) & (cen[:, 1] > 1.5) & (cen[:, 1] < 13.5) & (cen[:, 2] > -0.3))
                emit(pc, dx, 1.5, False, keep)
            continue
        if name == 'land_base':
            continue  # the backdrop plane: the renderer's ground takes its colour (scene `backdrop`)
        if (field_x0 <= x <= field_x1 and y < field_cy) or y + 1.5 < 8:
            continue  # in front of the field: the benches stand there and the camera looks over it
        dx = board_x0 - field_x0 if x < (field_x0 + field_x1) / 2 else board_x1 - field_x1
        emit(pc, dx, 1.5, False)

if lighting is None:
    lighting = {'intensity': 1, 'color': [1, 1, 1]}
md5 = hashlib.md5(Path(scene_file).read_bytes()).hexdigest()
allp = np.concatenate([np.array(b['position']).reshape(-1, 3) for b in buckets.values()])
data = {'version': 16, 'lighting': lighting, 'stageId': STAGE, 'sourceBundle': 'scenes/obt/main/level_main_08-01/level_main_08-01.ab', 'md5': md5,
        'composed': 'tools/local-extract/compose-snowfield-scene.py', 'cover': cover,
        'backdrop': materials.get('MT_LAND', {}).get('colors', {}).get('_Color', [0.78, 0.86, 0.95])[:3], 'buckets': buckets,
        'stats': {'triangles': sum(len(b['index']) // 3 for b in buckets.values()), 'bounds': [allp.min(0).tolist(), allp.max(0).tolist()]}}
path = out / f'{STAGE}-v16.json.gz'
path.write_bytes(gzip.compress(json.dumps(data, separators=(',', ':')).encode(), mtime=0))
(out / f'{STAGE}-v16.bin.gz').write_bytes(gzip.compress(pack(data), mtime=0))
# textures of the used materials (normal / gloss maps derived like extract-original-maps.py)
from PIL import Image, ImageOps
used = {b['material'] for b in buckets.values()}
mats = {k: v for k, v in materials.items() if k in used}
for rec in mats.values():
    for slot, ref in rec['textures'].items():
        if slot not in ('_MainTex', '_EmissionMap', '_BumpMap', '_MetallicGlossMap') or ref['name'] not in textures:
            continue
        img = textures[ref['name']].image
        if slot == '_BumpMap':
            ref['name'] += '_normal-rgb-v2'; img = img.convert('RGB')
        elif slot == '_MetallicGlossMap':
            ref['name'] += '_metalrough-v2'; r_, g_, b_, a_ = img.convert('RGBA').split(); img = Image.merge('RGB', (r_, ImageOps.invert(a_), r_))
        img.save(out / (ref['name'] + '.png'))
(out / 'materials-icewild.json').write_text(json.dumps(mats, separators=(',', ':')))
print(json.dumps({'cover': len(cover), 'triangles': data['stats']['triangles'], 'buckets': list(buckets), 'lighting': lighting, 'lightmaps': lightmaps}))
