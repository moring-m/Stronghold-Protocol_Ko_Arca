#!/usr/bin/env python3
"""Snow battlefield (custom_snowfield) meshes from the chapter 8 scene level_main_08-01: tile kit and surroundings.

The official scene is cut into its authored pieces (one per renderer, board space like extract-original-maps.py).
  side 'kit':   the tile meshes by role (ground, ice, dirt, block, rocks, high, fence; see role()), each centred on its
                tile — the renderer (render/board3d/scene.js _buildThemeKit) lays one per tile of whatever board it
                builds (normal field, cooperative / boss arena, the four-field co-op board) by the tile glyph
                (load.js BOARD_THEMES.snow.kit); tiles without a role (benches' gates, works, preview pen, ...) stay
                the procedural board in the themed atlas (compose-snowfield-atlas.py)
  side 'around': the surroundings as authored (snow terrain, land planes, mountain rocks, ice walls, rock cubes, snow
                planes) about the board's centre; the renderer presses the terrain under the board and moves each
                piece reaching over the board it builds just clear of it (the official island is as large as the
                autochess board, so most pieces would stand on it as authored)
Nothing is placed over a tile the board draws, so no field, bench or the enemy preview pen is covered.

Usage: python -I compose-snowfield-scene.py <bundle dir> <out dir>
  bundle dir: level_main_08-01.ab, its lightingdata.ab, arts/maps/map_icewild/res.ab
Writes snowfield-scenery-v16.json.gz (+ .bin.gz), its lightmap, the icewild textures and materials-icewild.json.
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

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
STAGE = 'snowfield-scenery'
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

buckets = {}


def bucket(mat, light, side):
    key = mat + (f'@lightmap{light}' if light is not None else '') + '@' + side
    return buckets.setdefault(key, {'material': mat, 'platform': False, 'side': side,
                                    'lightMap': lightmaps[light] if light is not None else None,
                                    'position': [], 'normal': [], 'uv': [], 'uv1': [], 'color': [], 'index': []})


def add(b, p, n, uv, uv1, col, tri):
    off = len(b['position']) // 3
    b['position'] += np.round(p, 5).ravel().tolist(); b['normal'] += np.round(n, 5).ravel().tolist()
    b['uv'] += np.round(uv, 7).ravel().tolist(); b['uv1'] += np.round(uv1, 7).ravel().tolist()
    b['color'] += np.round(col, 4).ravel().tolist(); b['index'] += (np.asarray(tri) + off).ravel().tolist()


def prototype(pc):
    """A piece moved to its own footprint centre with its base on z = 0."""
    p = pc['p'].copy(); p[:, :2] -= (p[:, :2].min(0) + p[:, :2].max(0)) / 2; p[:, 2] -= p[:, 2].min()
    return {**pc, 'p': p}


FIELD_X0, FIELD_X1, FIELD_CY = 4.5, 15.5, 9.0  # the official field (cols 5–15) and its centre row, board space
SURROUNDINGS = ('iceland', 'mountain_rock', 'S_outworld_icewall', 'S_outworld_cube', 'S_outworld_rock', 'decore_rock',
                'pPlane', 'ouworld_rock', 'land_base')
cx0 = (FIELD_X0 + FIELD_X1) / 2
for k_, pc in enumerate(pieces):
    if not pc['name'].startswith(SURROUNDINGS):
        continue
    # as authored, about the official field's centre: the snow terrain (pressed under the board by the renderer), the
    # land planes (the ground everywhere beyond) and the pieces (moved just clear of the board by the renderer)
    cut = 'terrain' if pc['name'].startswith('iceland') else 'none' if pc['name'].startswith('land_base') else 'piece'
    key = f'around:{k_}:' + pc['material'] + (f'@lightmap{pc["light"]}' if pc['light'] is not None else '')
    b = buckets.setdefault(key, {'material': pc['material'], 'platform': False, 'side': 'around', 'cut': cut,
                                 'lightMap': lightmaps[pc['light']] if pc['light'] is not None else None,
                                 'position': [], 'normal': [], 'uv': [], 'uv1': [], 'color': [], 'index': []})
    add(b, pc['p'] - np.array([cx0, FIELD_CY, 0]), pc['n'], pc['uv'], pc['uv1'], pc['col'], pc['tri'])

# ---- the tile kit: the official tile meshes, one prototype per piece, centred on its tile (x, y about 0) ----
# role ← piece (matched against the official field of the screenshot): white snow slab = ground, dark-blue slab = ice
# (the bench row by the camera), dirt-rimmed raised snow block = block (the outer forbidden ring, the bench row by the
# field, separators), snow-capped rock cubes = rocks (forbidden tiles inside a field), ice-topped raised block = high,
# blue-rimmed frame = fence. The renderer picks a role per tile glyph (load.js BOARD_THEMES.snow.kit).
from PIL import Image as _Image
albedo = np.asarray(textures['TX_icewild_A'].image.convert('RGB'), float)


def luminance(pc):
    uv = pc['uv'][pc['tri']].mean(axis=1)
    h_, w_ = albedo.shape[:2]
    px = albedo[((1 - uv[:, 1] % 1) * (h_ - 1)).astype(int), ((uv[:, 0] % 1) * (w_ - 1)).astype(int)]
    return float(px.mean())


def role(pc):
    n, top = pc['name'], pc['p'][:, 2].max()
    if pc['p'][:, 2].min() > 0:
        return None  # a slab resting on another piece (S_playground_stone8): it would float on its own
    if n.startswith('S_playground_import304'):
        return 'fence'
    if n.startswith('S_playground_fixhighground') or (n.startswith('S_playground_gird') and top > 0.3):
        return 'high'
    if n.startswith('S_playground_bake2'):
        return 'iceblock'  # the ice-topped slab block: the bench row by the camera
    if n.startswith(('S_playground_import268', 'S_playground_import302', 'S_playground_stone6')):
        return 'dirt'  # the dirt-rimmed raised snow slab: the temporary bench and the outer forbidden ring
    if n.startswith(('S_playground_import', 'S_playground_stone', 'S_playground_bake')) and top > 0.3:
        return 'block'
    if n.startswith('S_playground_gird') and top < 0.05 and len(pc['p']) == 28:
        # the ice slabs sample the atlas' blue ice cells (texel mean ≈ 109); the snow slabs its snow cells (60–81)
        return 'ice' if luminance(pc) > 95 else 'ground'
    if n.startswith('S_outworld_rock') and abs(np.ptp(pc['p'][:, 0]) - 1.06) < 0.12:
        return 'rocks'
    return None


variants = defaultdict(int)
for pc in pieces:
    r_ = role(pc)
    if r_ is None:
        continue
    cx, cy = round(pc['centre'][0]), round(pc['centre'][1])
    i = variants[r_]; variants[r_] += 1
    key = f'kit:{r_}:{i}:' + pc['material'] + (f'@lightmap{pc["light"]}' if pc['light'] is not None else '')
    b = buckets.setdefault(key, {'material': pc['material'], 'platform': True, 'side': 'kit', 'role': r_, 'variant': i,
                                 'lightMap': lightmaps[pc['light']] if pc['light'] is not None else None,
                                 'position': [], 'normal': [], 'uv': [], 'uv1': [], 'color': [], 'index': []})
    add(b, pc['p'] - np.array([cx, cy, 0]), pc['n'], pc['uv'], pc['uv1'], pc['col'], pc['tri'])
print('kit', dict(variants))

if lighting is None:
    lighting = {'intensity': 1, 'color': [1, 1, 1]}
md5 = hashlib.md5(Path(scene_file).read_bytes()).hexdigest()
allp = np.concatenate([np.array(b['position']).reshape(-1, 3) for b in buckets.values()])
data = {'version': 16, 'lighting': lighting, 'stageId': STAGE, 'sourceBundle': 'scenes/obt/main/level_main_08-01/level_main_08-01.ab', 'md5': md5,
        'composed': 'tools/local-extract/compose-snowfield-scene.py',
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
print(json.dumps({'triangles': data['stats']['triangles'], 'buckets': list(buckets), 'lighting': lighting, 'lightmaps': lightmaps}))
