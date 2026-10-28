"""Board atlas for the snow battlefield (custom_snowfield): TX_autochessi_D/_N/_E/_M_rough with the floor, high-ground and
side-panel cells (and one free cell, the snow rock top) replaced by pieces of the chapter 8 snow tileset (map_icewild: TX_icewild_A/_N, the scene of
main_08-01), so the procedural board keeps its UV table (render/board3d/atlas.js) and only swaps textures.

Usage: python -I compose-snowfield-atlas.py <autochess dir> <icewild dir> <out dir>
  autochess dir: public/assets/local/map/autochess (TX_autochessi_D.png, _N_rgb.png, _E.png, _M_rough.png)
  icewild dir:   TX_icewild_A.png (2048²) and TX_icewild_N.png (1024²) extracted from map_icewild
"""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance

ac, iw, out = (Path(p) for p in sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)

# icewild atlas pieces (TX_icewild_A px): two snow slabs, the white-rimmed ice block, a basalt column face
SLAB_A = (304, 40, 200, 200)
SLAB_B = (552, 40, 200, 200)
ICE = (800, 28, 196, 196)
ROCK = (1725, 1580, 272, 384)
ROCK_TOP = (482, 805, 176, 176)
# autochess cells (TX_autochessi_D px, atlas.js SURFACES) → piece
CELLS = [((x, 256, 256, 256), SLAB_A if (x // 256) % 2 == 0 else SLAB_B) for x in range(0, 1024, 256)]
CELLS += [((x, 512, 256, 256), SLAB_B if (x // 256) % 2 == 0 else SLAB_A) for x in range(0, 1024, 256)]
CELLS += [((x, 0, 256, 256), ICE) for x in range(0, 1024, 256)]
CELLS += [((0, 1664, 272, 384), ROCK), ((272, 1664, 272, 384), ROCK)]
# a free cell of the stock atlas (no board surface samples it) → atlas.js SURFACES.snowRock, the forbidden blocks' top
CELLS += [((1792, 0, 256, 256), ROCK_TOP)]


def box(r, k=1.0):
    x, y, w, h = r
    return tuple(round(v * k) for v in (x, y, x + w, y + h))


def snow(img):
    """Lift the slabs toward packed snow (the scene lights them far brighter than the raw albedo) with a cold cast."""
    img = ImageEnhance.Brightness(img).enhance(1.6)
    r, g, b = img.split()
    return Image.merge('RGB', (r.point(lambda v: v * 0.93), g.point(lambda v: v * 0.97), b))


A = Image.open(iw / 'TX_icewild_A.png').convert('RGB')
N = Image.open(iw / 'TX_icewild_N.png').convert('RGB')
D = Image.open(ac / 'TX_autochessi_D.png').convert('RGBA')
DN = Image.open(ac / 'TX_autochessi_N_rgb.png').convert('RGB')
DE = Image.open(ac / 'TX_autochessi_E.png').convert('RGB')
DR = Image.open(ac / 'TX_autochessi_M_rough.png').convert('RGB')
# the roughness of the stock concrete slab (its stock cells carry the panel relief of the old pieces)
FLAT = DR.resize((1, 1), Image.BOX, box=box((256, 512, 256, 256), DR.width / D.width)).getpixel((0, 0))
for dst, src in CELLS:
    piece = A.crop(box(src))
    if src not in (ROCK, ROCK_TOP):
        piece = snow(piece)
    d = box(dst)
    D.paste(piece.resize((d[2] - d[0], d[3] - d[1]), Image.LANCZOS).convert('RGBA'), d[:2])
    n = box(dst, DN.width / D.width)
    DN.paste(N.crop(box(src, N.width / A.width)).resize((n[2] - n[0], n[3] - n[1]), Image.LANCZOS), n[:2])
    e = box(dst, DE.width / D.width)
    DE.paste((0, 0, 0), e)
    DR.paste(FLAT, box(dst, DR.width / D.width))
D.save(out / 'TX_snowfield_D.png', optimize=True)
DN.save(out / 'TX_snowfield_N_rgb.png', optimize=True)
DE.save(out / 'TX_snowfield_E.png', optimize=True)
DR.save(out / 'TX_snowfield_M_rough.png', optimize=True)
print('written', *(p.name for p in sorted(out.glob('*.png'))))
