#!/usr/bin/env python3
"""规程 battlefield devices that have an official map model the fork does not draw yet: the 盐坨子炮 (trap_196_cnnon,
act3autochess_m10) from arts/maps/common/trap/trap_19.ab.

Writes the same native device record as extract-original-maps.py writes for the crate / 高台 (map/original
`<key>-v1.json`, kind original-unity-device: board-space position / normal / uv / index / bounds, Unity cm → tiles,
x,-z,y) and the material in the native table's form (textures as PNG; the RGB normal map as is, Unity metallic-gloss →
three.js metal-roughness), added to a copy of the native material table.

Usage: python3 tools/local-extract/regulation_devices.py TRAP_19_AB ASSET_PUBLIC_ROOT MATERIALS_IN MATERIALS_OUT OUT_ROWS_JSON
  TRAP_19_AB  the bundle (the official CDN serves it; md5-checked against the hot-update list it came from)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aklz4  # noqa: F401,E402  (LZ4AK decoder)
import UnityPy  # noqa: E402
from UnityPy.helpers.MeshHelper import MeshHandler  # noqa: E402

DEVICES = {'trap_196_cnnon': 'cannon'}


def material_record(mat, out, rows):
    d = mat.read()
    textures = {}
    for slot, env in d.m_SavedProperties.m_TexEnvs:
        if not env.m_Texture or not env.m_Texture.path_id:
            continue
        tex = env.m_Texture.read()
        img = tex.image
        name = tex.m_Name
        if slot == '_MetallicGlossMap':
            a = img.convert('RGBA').getchannel('A').point(lambda v: 255 - v)
            img, name = Image.merge('RGB', (Image.new('L', img.size, 255), a, Image.new('L', img.size, 0))), name + '_metalrough-v2'
        elif slot == '_BumpMap':
            img, name = img.convert('RGB'), name + '_normal-rgb-v2'
        path = out / (name + '.png')
        img.save(path, 'PNG', optimize=True)
        rows[name] = {'path': '/assets/local/map/original/' + path.name, 'kind': 'Texture2D'}
        textures[slot] = {'name': name, 'scale': [env.m_Scale.x, env.m_Scale.y], 'offset': [env.m_Offset.x, env.m_Offset.y]}
    shader = None
    try:
        shader = d.m_Shader.read().m_ParsedForm.m_Name
    except Exception:  # noqa: BLE001 (the shader bundle is not loaded: the name is informative only)
        pass
    return {'shader': shader or 'Torappu/Scene/StandardRealtimeShadow',
            'keywords': list(getattr(d, 'm_ValidKeywords', None) or (getattr(d, 'm_ShaderKeywords', '') or '').split()),
            'textures': textures, 'colors': {k: [v.r, v.g, v.b, v.a] for k, v in d.m_SavedProperties.m_Colors},
            'floats': dict(d.m_SavedProperties.m_Floats), 'gammaLighting': True}


def main():
    bundle, public, mat_in, mat_out, rows_out = (Path(a) for a in sys.argv[1:6])
    out = public / 'assets/local/map/original'
    materials = json.loads(mat_in.read_text(encoding='utf-8'))
    rows = {}
    env = UnityPy.load(str(bundle))
    for o in env.objects:
        if o.type.name != 'Mesh':
            continue
        mesh = o.read()
        key = DEVICES.get(mesh.m_Name)
        if not key:
            continue
        h = MeshHandler(mesh); h.process()
        p = np.array(h.m_Vertices)[:, :3][:, [0, 2, 1]] * .01; p[:, 1] *= -1
        n = np.array(h.m_Normals)[:, :3][:, [0, 2, 1]]; n[:, 1] *= -1
        tris = np.concatenate([np.array(t).ravel() for t in h.get_triangles()])
        data = {'position': p.ravel().tolist(), 'normal': n.ravel().tolist(), 'uv': np.array(h.m_UV0)[:, :2].ravel().tolist(),
                'index': tris.tolist(), 'bounds': {'x0': float(p[:, 0].min()), 'x1': float(p[:, 0].max()),
                                                   'z0': float(p[:, 2].min()), 'z1': float(p[:, 2].max())}}
        path = out / f'{key}-v1.json'
        path.write_text(json.dumps(data, separators=(',', ':')))
        rows[key] = {'path': '/assets/local/map/original/' + path.name, 'kind': 'original-unity-device'}
        print(mesh.m_Name, '→', path.name, 'verts', len(p), 'tris', len(tris) // 3, 'bounds', data['bounds'], flush=True)
    for o in env.objects:
        if o.type.name == 'Material':
            name = o.read().m_Name
            if name.startswith('MT_trap_196'):
                materials[name] = material_record(o, out, rows)
                print('material', name, list(materials[name]['textures']), flush=True)
    mat_out.write_text(json.dumps(materials, ensure_ascii=False), encoding='utf-8')
    rows['materials'] = {'path': '/' + str(mat_out.relative_to(public)).replace('\\', '/'), 'kind': 'original-unity-materials'}
    Path(rows_out).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
