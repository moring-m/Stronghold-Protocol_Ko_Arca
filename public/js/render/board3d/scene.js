import { borderCells, combatBorderAreas, oppositeBorderRuns, completeOppositeRuns, vacantBorderCells, reflectOppositeBorder, disjointAreas, uncoveredTileCells, uniqueCopiedFaces } from './surroundings.js';
import { applyNativeStageBlend } from './materials.js';
// render/board3d/scene.js — the official 卫戍协议 board as a real three.js scene (DESIGN §15), rendered on its own
// canvas UNDER the Pixi canvas (units, FX, highlights, HP bars stay in Pixi). One camera model drives both layers:
// render/projection.js `syncThreeCamera` makes the three.js PerspectiveCamera project exactly like the Pixi one.
//
//   const board = new BoardScene(THREE, pack, { canvas, quality })   (pack = load.js loadBoardPack)
//   board.setStage(stage)            geometry from the stage grid (layout.js) + devices + gates + terrain
//   board.setArea(rects)             the built areas (layout.js AREAS / areaFor: normal field + pen, 联防, boss)
//   board.setFocus(rect)             the lit field (others fade, animated)
//   board.setBattleRect(rect|null)   crates / turrets inside a running battle are sim units: static ones hide
//   board.createDevice()             → handle { update(cam, { x, y, z, size, height, top, side, alpha, rot }), mesh: null, destroy() }
//                                      (render/units.js DeviceView boxes, drawn as the official crate mesh)
//   board.flashObjective(r, c)       leak flash of a blue objective box
//   board.render(cam, timeSec)       sync the camera, animate, draw
//   board.resize(w, h, dpr) · board.stats() · board.destroy()
//
// Draw calls: board (tiles + blocks + platforms, merged, MT_autochess), the pen's glass hatches (glassMaterial),
// static crates (merged, same material),
// decals (MT_autochess_common), fence pipes, blowers (merged, unlit), gate boxes (additive + alpha, merged per
// material), cyan field edges, terrain overlays (≤ 4), background plane + its shadow catcher — ~12–16 in total.
// The key light's shadow map is rendered only when the geometry changes (autoUpdate off).

import { buildBoard, buildDeviceSlabs, objToBoard, boxProjectUV, ROWS, COLS, DEVICE_H, AREAS } from './layout.js';
import { surfaceUV } from './atlas.js';
import {
  focusUniforms, addFocus, makeTexture, boardMaterial, glassMaterial, decalMaterial, pipeMaterial, unlitMaterial, gateMaterial, glowMaterial,
  waterMaterial, mireMaterial, infectionMaterial, infectionGlowMaterial, smogMaterial, dashTexture, environmentMap, nativePhysicalLighting, addShadowContrast,
} from './materials.js';
import { syncThreeCamera } from '../projection.js';

/** Lighting rig (tuned against the official screenshots: bright even tops, darker sides, soft shadows). */
export const LIGHTING = Object.freeze({
  key: { color: 0xfff1df, intensity: 2.8, dir: [-5.2, -3.4, 10] },
  hemi: { sky: 0xe4ecf4, ground: 0x4a5058, intensity: 0.44 },
  // Native gamma direct light needs compensation for the web lighting pipeline.
  // Apply it to direct light only: ambient and baked shadow detail stay intact.
  nativeDirectGain: 1.8,
  env: 1.0,
  emissive: 0.25,
  roughness: 0.78,
  shadow: { size: 2048, radius: 3, bias: -0.0004, normalBias: 0.025 },
  exposure: 1.0,
  // the clear colour is the fog colour: the far background fades into the void without a visible edge
  clear: 0x0c1114,
  fog: { color: 0x0c1114, near: 17, far: 36 },
  // S_Background_common (100 × 0.4316 = 43.16 tiles); `tiles` × `tiles` mirrored copies around it so no framing
  // (21:9, 4:3, portrait fit, camera flights) sees past its edge
  bg: { z: -8, size: 43.16, color: 0.713, dim: 0.8, tiles: 3 },
});

/** Additive gain of the gate boxes at the curve's mean (tuned against the official screenshots). */
export const GATE_GAIN = 0.6;

/** Gate pulse: the official clip's _TintColor.a curve (2 s loop, 0.134 → 0.229 → 0.134) scaled to our intensity. */
export function gatePulse(t, phase = 0) {
  const k = 0.5 - 0.5 * Math.cos(((t / 2 + phase) % 1) * Math.PI * 2);
  return 0.134 + (0.229 - 0.134) * k;
}

const areaKey = (list) => (list || []).map((a) => `${a.r0},${a.r1},${a.c0},${a.c1}`).sort().join(';');

/** Discard unused vertices as well as faces before creating GPU geometry. */
export function compactGeometry(src) {
  if (!src?.position || !src.index) return src;
  const count=src.position.length/3;
  const attrs=Object.entries({position:3,normal:3,uv:2,uv1:2,color:3}).filter(([key,size])=>src[key]?.length===count*size);
  const out={...src,...Object.fromEntries(attrs.map(([key])=>[key,[]])),index:[]},map=new Map();
  for(const id of src.index){
    if(!map.has(id)){
      map.set(id,map.size);
      for(const [key,size] of attrs)out[key].push(...src[key].slice(id*size,(id+1)*size));
    }
    out.index.push(map.get(id));
  }
  return out;
}

/** Exclude inactive field platforms and props from both the visible pass and shadow pass.
 * Scenic background is handled separately by sceneryForArea; platform meshes outside the board envelope are still platforms.
 * Sub-floor triangles inside an inactive field are still platform geometry: depth alone must not preserve them. */
export function geometryForArea(src, areas, {support=false}={}) {
  const p = src.position, index = [];
  for (let i = 0; i < src.index.length; i += 3) {
    const ids = src.index.slice(i, i + 3);
    const x = ids.reduce((v, k) => v + p[k * 3], 0) / 3;
    const y = ids.reduce((v, k) => v + p[k * 3 + 1], 0) / 3;
    const inArea=areas.some(a => x >= a.c0 - 0.5 && x <= a.c1 + 0.5 && y >= a.r0 - 0.5 && y <= a.r1 + 0.5);
    // Native slabs extend below the field edge. Preserve their underground
    // support without exposing the top surfaces of another battlefield.
    const underEdge=support && ids.every(k=>p[k*3+2]<-.01) && areas.some(a=>
      x>=a.c0-1.5 && x<=a.c1+1.5 && y>=a.r0-1.5 && y<=a.r1+1.5);
    if (inArea || underEdge) index.push(...ids);
  }
  return { ...src, index };
}

// Water surfaces may be one connected mesh across both fields. Clip their
// triangles, preserving UVs, rather than treating the whole sheet as decoration.
// Complement in tile coordinates, so native replacement faces never overlap.
export function outsideTileAreas(holes) {
  let parts=[{r0:-100,r1:100,c0:-100,c1:100}];
  for(const h of holes)parts=parts.flatMap(a=>{
    const r0=Math.max(a.r0,h.r0),r1=Math.min(a.r1,h.r1),c0=Math.max(a.c0,h.c0),c1=Math.min(a.c1,h.c1);
    if(r0>r1 || c0>c1)return [a];
    return [{...a,r1:r0-1},{...a,r0:r1+1},{r0,r1,c0:a.c0,c1:c0-1},{r0,r1,c0:c1+1,c1:a.c1}].filter(b=>b.r0<=b.r1&&b.c0<=b.c1);
  });
  return parts;
}

export function surfaceForArea(src, areas) {
  areas=disjointAreas(areas);
  const attrs = Object.entries({position:3,normal:3,uv:2,uv1:2,color:3}).filter(([key,size])=>src[key]?.length === src.position.length/3*size);
  const output = Object.fromEntries(attrs.map(([key])=>[key,[]]));
  const index=[];
  const vertex=id=>Object.fromEntries(attrs.map(([key,size])=>[key,Array.from(src[key].slice(id*size,(id+1)*size))]));
  const mix=(a,b,t)=>Object.fromEntries(attrs.map(([key])=>[key,a[key].map((v,i)=>v+(b[key][i]-v)*t)]));
  for(let i=0;i<src.index.length;i+=3) {
    const ids=src.index.slice(i,i+3),p=src.position;
    const x0=Math.min(p[ids[0]*3],p[ids[1]*3],p[ids[2]*3]),x1=Math.max(p[ids[0]*3],p[ids[1]*3],p[ids[2]*3]);
    const y0=Math.min(p[ids[0]*3+1],p[ids[1]*3+1],p[ids[2]*3+1]),y1=Math.max(p[ids[0]*3+1],p[ids[1]*3+1],p[ids[2]*3+1]);
    let triangle;
    for(const area of areas) {
      // Most authored scenery lies outside a requested border strip. Reject
      // those triangles before allocating/interpolating all vertex attributes.
      if(x1<area.c0-.5 || x0>area.c1+.5 || y1<area.r0-.5 || y0>area.r1+.5)continue;
      triangle ||= Array.from(ids,vertex);
      let poly=triangle;
      for(const [axis,limit,sign] of [[0,area.c0-.5,1],[0,area.c1+.5,-1],[1,area.r0-.5,1],[1,area.r1+.5,-1]]) {
        const next=[];
        for(let j=0;j<poly.length;j++) {
          const a=poly[j],b=poly[(j+1)%poly.length];
          const insideA=sign*(a.position[axis]-limit)>=0,insideB=sign*(b.position[axis]-limit)>=0;
          if(insideA)next.push(a);
          if(insideA!==insideB)next.push(mix(a,b,(limit-a.position[axis])/(b.position[axis]-a.position[axis])));
        }
        poly=next;
      }
      for(let j=1;j+1<poly.length;j++) {
        const ids=[];
        for(const v of [poly[0],poly[j],poly[j+1]]) {
          ids.push(output.position.length/3);
          for(const [key] of attrs)output[key].push(...v[key]);
        }
        index.push(...ids);
      }
    }
  }
  return {...src,...output,index};
}

// Authored geometry buffers are immutable. Border selection repeatedly asks for
// different cells of the same mesh; weld its seams and find components once.
// Weak keys let obsolete stages and their derived buffers be collected.
const sceneryComponents = new WeakMap();
function componentsForScenery(src) {
  let positions=sceneryComponents.get(src.index);
  if(!positions)sceneryComponents.set(src.index,positions=new WeakMap());
  const cached=positions.get(src.position);
  if(cached)return cached;
  const count = src.position.length / 3;
  const parent = Int32Array.from({length:count}, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const welded = new Map();
  for (const id of src.index) {
    const key = `${src.position[id*3]},${src.position[id*3+1]},${src.position[id*3+2]}`;
    const previous = welded.get(key);
    if (previous == null) welded.set(key,id); else parent[find(id)]=find(previous);
  }
  for (let i=0;i<src.index.length;i+=3) {
    const root=find(src.index[i]);
    parent[find(src.index[i+1])]=root; parent[find(src.index[i+2])]=root;
  }
  const bounds = new Map();
  for (const id of src.index) {
    const root=find(id), x=src.position[id*3], y=src.position[id*3+1];
    const b=bounds.get(root) || {x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity,z1:-Infinity};
    b.x0=Math.min(b.x0,x);b.x1=Math.max(b.x1,x);b.y0=Math.min(b.y0,y);b.y1=Math.max(b.y1,y);b.z1=Math.max(b.z1,src.position[id*3+2]);bounds.set(root,b);
  }
  const result={find,bounds};positions.set(src.position,result);return result;
}

/** Keep decorative mesh components whole. Only hide components wholly inside an
 * inactive board region; landscape and components crossing its boundary stay intact. */
export function sceneryForArea(src, areas, {interiorOnly=false, surroundOnly=false, decorationOnly=false}={}) {
  const {find,bounds}=componentsForScenery(src);
  // UV/material seams duplicate vertices at identical positions. Join those
  // copies so separate faces of one decorative object cannot be clipped apart.
  const keep = new Set();
  for (const [root,b] of bounds) {
    const landscape = b.x0 < -.5 || b.x1 > 20.5 || b.y0 < -.5 || b.y1 > 18.5;
    if (decorationOnly) {
      if (!landscape && b.z1 <= 2.5 && b.x1-b.x0 < 3.5 && b.y1-b.y0 < 2.5 && areas.some(a=>b.x0>=a.c0-.55 && b.x1<=a.c1+.55 && b.y0>=a.r0-.55 && b.y1<=a.r1+.55)) keep.add(root);
      continue;
    }
    if (interiorOnly && landscape && b.y1 > 6.5) continue;
    if (surroundOnly && landscape && b.y1 < 6.5) continue;
    // Rear rocks and the terrain supporting the pen extend into the last
    // cooperative row. Keep that overlap whole instead of opening a seam.
    if (surroundOnly && !landscape && b.y0 < 11.5 && b.x1 >= -.5 && b.x0 <= 20.5) continue;
    if (landscape || areas.some(a=>b.x1>=a.c0-.5 && b.x0<=a.c1+.5 && b.y1>=a.r0-.5 && b.y0<=a.r1+.5)) keep.add(root);
  }
  const index=[];
  for(let i=0;i<src.index.length;i+=3) if(keep.has(find(src.index[i]))) index.push(src.index[i],src.index[i+1],src.index[i+2]);
  return {...src,index,footprints:decorationOnly ? [...keep].map(root=>bounds.get(root)).filter(b=>b.z1>=-.04) : undefined};
}

/** Translate the complete cooperative background without changing UVs or lighting. */
export function translateEnvironment(src, offset) {
  return {...src,position:Array.from(src.position,(v,i)=>i%3===1?v-offset:v)};
}

const mergeInto = (list) => {
  // concatenate { position, normal, uv, color?, index } records
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.position.length / 3; ni += g.index.length; }
  const position = new Float32Array(nv * 3), normal = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), color = new Float32Array(nv * 3);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const uv1=list.some(g=>g.uv1?.length)?new Float32Array(nv*2):null;
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.position.length / 3;
    position.set(g.position, vo * 3);
    if (g.normal) normal.set(g.normal, vo * 3);
    if (g.uv) uv.set(g.uv, vo * 2);
    if (uv1 && g.uv1) uv1.set(g.uv1,vo*2);
    if (g.color) color.set(g.color, vo * 3); else color.fill(1, vo * 3, (vo + n) * 3);
    for (let i = 0; i < g.index.length; i++) index[io + i] = g.index[i] + vo;
    vo += n; io += g.index.length;
  }
  return { position, normal, uv, color, index, ...(uv1?{uv1}:{}) };
};

/** Apply a 4×4-free transform (scale s, rotate about z by `rot` quarter turns, translate) to board-space data. */
function placeMesh(src, { x = 0, y = 0, z = 0, s = 1, sz = s, rot = 0 }) {
  const p = src.position, n = src.normal;
  const pos = new Float32Array(p.length), nrm = n ? new Float32Array(n.length) : null;
  const a = rot * Math.PI / 2, ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
  for (let i = 0; i < p.length; i += 3) {
    const px = p[i] * s, py = p[i + 1] * s;
    pos[i] = x + px * ca - py * sa; pos[i + 1] = y + px * sa + py * ca; pos[i + 2] = z + p[i + 2] * sz;
    if (nrm) { nrm[i] = n[i] * ca - n[i + 1] * sa; nrm[i + 1] = n[i] * sa + n[i + 1] * ca; nrm[i + 2] = n[i + 2]; }
  }
  return { ...src, position: pos, normal: nrm };
}

/**
 * Grow a textured plane `k`× about (cx, cy) keeping its texel density: positions scale by k, UVs scale by k about
 * the texture centre (0..1 → (1−k)/2..(1+k)/2), so a MirroredRepeat texture tiles seamlessly around the original.
 */
export function extendPlane(src, cx, cy, k = 1) {
  if (!(k > 1) || !src || !src.position) return src;
  const p = src.position, pos = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { pos[i] = cx + (p[i] - cx) * k; pos[i + 1] = cy + (p[i + 1] - cy) * k; pos[i + 2] = p[i + 2]; }
  let uv = src.uv;
  if (uv) { uv = new Float32Array(src.uv.length); for (let i = 0; i < uv.length; i++) uv[i] = 0.5 + (src.uv[i] - 0.5) * k; }
  return { ...src, position: pos, uv };
}

/** Quarter turns (counter-clockwise about +z) that point the wind device's outlet (−x in the mesh) along `dir`. */
export const DIR_TURNS = Object.freeze({ LEFT: 0, DOWN: 1, RIGHT: 2, UP: 3 });

export class BoardScene {
  /**
   * @param {any} THREE three.js module
   * @param {any} pack load.js loadBoardPack result
   * @param {{ canvas?: HTMLCanvasElement, quality?: string, antialias?: boolean, renderer?: any }} [opts]
   */
  constructor(THREE, pack, opts = {}) {
    this.layoutCacheSize = Math.max(0, Math.min(4, opts.layoutCacheSize || 0));
    this.layoutCache = new Map();
    this.layoutCacheHits = 0;
    this.THREE = THREE;
    this.pack = pack;
    this.opts = opts;
    this.destroyed = false;
    this.lost = false;
    const T = THREE;
    this.renderer = opts.renderer || new T.WebGLRenderer({
      canvas: opts.canvas, antialias: opts.antialias ?? true, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    const R = this.renderer;
    R.outputColorSpace = T.SRGBColorSpace;
    R.toneMapping = T.NoToneMapping;
    R.setClearColor(LIGHTING.clear, 1);
    R.shadowMap.enabled = opts.shadows !== false;
    R.shadowMap.type = T.PCFShadowMap;
    R.shadowMap.autoUpdate = false;
    this.canvas = R.domElement;
    this._onLost = (e) => { e.preventDefault?.(); this.lost = true; };
    this.canvas.addEventListener?.('webglcontextlost', this._onLost);

    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(LIGHTING.fog.color, LIGHTING.fog.near, LIGHTING.fog.far);
    this.camera = new T.PerspectiveCamera(40, 16 / 9, 0.5, 120);
    this.focus = focusUniforms(T);
    if (opts.environment !== false) {
      try {
        this.envMap = environmentMap(T, R);
        if (this.envMap) {
          this.scene.environment = this.envMap;
          this.scene.environmentIntensity = LIGHTING.env;
          this.scene.environmentRotation?.set?.(-Math.PI / 2, 0, 0);
        }
      } catch { this.envMap = null; }
    }
    this.focusTarget = null;
    const aniso = Math.min(8, R.capabilities?.getMaxAnisotropy?.() || 1);
    const img = pack?.images || {};
    this.tex = {
      D: makeTexture(T, img.D, { aniso }), N: makeTexture(T, img.N, { srgb: false, aniso }), R: makeTexture(T, img.R, { srgb: false, aniso }),
      E: makeTexture(T, img.E, { aniso }), common: makeTexture(T, img.common, { aniso }), commonE: makeTexture(T, img.commonE, { aniso }),
      BG: makeTexture(T, img.BG, { aniso }), wind: makeTexture(T, img.wind, { aniso }), gate: makeTexture(T, img.gate, {}),
      waterN: makeTexture(T, img.waterN, { srgb: false, repeat: true }), caustics: makeTexture(T, img.caustics, { srgb: false, repeat: true }),
      noise: makeTexture(T, img.noise, { srgb: false, repeat: true }),
    };
    if (this.tex.BG) { this.tex.BG.wrapS = T.MirroredRepeatWrapping; this.tex.BG.wrapT = T.MirroredRepeatWrapping; }
    this.mat = {
      board: boardMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      glass: glassMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      decal: this.tex.common ? decalMaterial(T, this.tex, this.focus) : null,
      pipe: pipeMaterial(T, this.focus),
      bg: this.tex.BG ? unlitMaterial(T, this.tex.BG, new T.Color().setScalar(LIGHTING.bg.color * LIGHTING.bg.dim)) : new T.MeshBasicMaterial({ color: 0x1a1d1f }),
      wind: this.tex.wind ? unlitMaterial(T, this.tex.wind) : null,
      gateStartAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true }) : null,
      gateEndAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true }) : null,
      gateEndAb: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: false }) : null,
      edge: glowMaterial(T, dashTexture(T)),
      water: waterMaterial(T, this.tex, this.focus),
      mire: mireMaterial(T, this.tex, this.focus),
      infection: infectionMaterial(T, this.tex, this.focus),
      infectionGlow: infectionGlowMaterial(T, this.tex, this.focus),
      smog: smogMaterial(T, this.tex, this.focus),
      shadowCatcher: new T.ShadowMaterial({ opacity: 0.60, color: 0x000000 }),
    };
    this.mat.crateFade = null;
    this.originalTextures = {};
    this.originalMaterials = {};
    this.lightmapMaterials = [];
    this.lightmapTextures = {};
    for (const [name, rec] of Object.entries(pack?.original?.materials || {})) {
      const texture = (slot) => {
        const ref = rec.textures?.[slot];
        if (!ref) return null;
        // Materials can share an image while using different atlas transforms.
        const key = JSON.stringify([ref.name, slot, !!rec.gammaLighting, ref.scale || [1, 1], ref.offset || [0, 0]]);
        if (!(key in this.originalTextures)) {
          const t = makeTexture(T, pack.original.images[ref.name], { aniso, srgb: !rec.gammaLighting && !['_BumpMap', '_MetallicGlossMap'].includes(slot), repeat: true });
          if (t) { t.repeat.set(...(ref.scale || [1, 1])); t.offset.set(...(ref.offset || [0, 0])); }
          this.originalTextures[key] = t;
        }
        return this.originalTextures[key];
      };
      if (/StylizedWater|StandardWater/.test(rec.shader || '')) {
        this.originalMaterials[name] = waterMaterial(T, {waterN:texture('_BumpMap') || this.tex.waterN, caustics:texture('_CausticsTex') || this.tex.caustics}, this.focus, rec);
        continue;
      }
      const color = rec.colors?._Color || [1, 1, 1, 1];
      const emission = rec.keywords && !rec.keywords.includes('_EMISSION') ? [0,0,0,1] : rec.colors?._EmissionColor || [0, 0, 0, 1];
      const metalGloss = rec.keywords?.includes('_METALLICGLOSSMAP');
      const material = new T.MeshStandardMaterial({
        map: texture('_MainTex'), color: new T.Color(...color.slice(0, 3)),
        emissiveMap: texture('_EmissionMap'), emissive: new T.Color(...emission.slice(0, 3)),
        // These stage shaders use vertex colours as terrain blend masks, not albedo/AO.
        // Multiplying the diffuse by them would turn grass black and byte colours glaring white.
        emissiveIntensity: rec.gammaLighting ? 1 : LIGHTING.emissive, vertexColors: false,
        normalMap: rec.keywords && !rec.keywords.includes('_NORMALMAP') ? null : texture('_BumpMap'),
        normalScale: new T.Vector2(rec.floats?._BumpScale ?? 1, rec.floats?._BumpScale ?? 1),
        roughnessMap: metalGloss || !rec.keywords ? texture('_MetallicGlossMap') : null, metalnessMap: metalGloss ? texture('_MetallicGlossMap') : null, roughness: metalGloss ? 1 : 1-(rec.floats?._Glossiness ?? .1), metalness: metalGloss ? 1 : rec.floats?._Metallic ?? 0,
        alphaTest: rec.floats?._Mode === 1 || /grass|common|_UI$/i.test(name) ? (rec.floats?._Cutoff || 0.4) : 0,
        side: /grass|common/i.test(name) ? T.DoubleSide : T.FrontSide,
      });
      if (rec.gammaLighting) {
        material.userData.nativeGamma = true;
        material.defines = {...material.defines, SP_NATIVE_LIGHTING: 1};
        material.onBeforeCompile = shader => {
          shader.uniforms.spNativeShadowStrength={value:rec.floats?._ShadowStrength ?? 1};
          // The shipped GLES shader uses gamma F0=.220916 and RGBM alpha*5,
          // rather than a linear PBR BRDF. Keep those colour values through
          // lighting and do not encode them into sRGB a second time.
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', 'uniform float spNativeShadowStrength;\n#define BRDF_Lambert spLinearLambert\n#include <common>\n#undef BRDF_Lambert\nvec3 BRDF_Lambert(const in vec3 diffuseColor) { return diffuseColor * 0.779083729; }')
            .replace('#include <lights_fragment_begin>', T.ShaderChunk.lights_fragment_begin.replaceAll('directionalLightShadow.shadowIntensity','directionalLightShadow.shadowIntensity * spNativeShadowStrength'))
            .replace('#include <lights_physical_pars_fragment>', nativePhysicalLighting(T))
            .replace('#include <lights_physical_fragment>', T.ShaderChunk.lights_physical_fragment.replace('vec3( 0.04 )', 'vec3( 0.220916301 )'))
            .replace('#include <colorspace_fragment>', '');
        };
      }
      applyNativeStageBlend(T,material,rec);
      this.originalMaterials[name] = addFocus(material, this.focus);
      if (rec.gammaLighting) material.customProgramCacheKey = () => 'sp-focus-native-gamma';
    }
    // lights
    const hemi = new T.HemisphereLight(LIGHTING.hemi.sky, LIGHTING.hemi.ground, LIGHTING.hemi.intensity);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const key = new T.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
    key.castShadow = R.shadowMap.enabled;
    key.shadow.mapSize.set(LIGHTING.shadow.size, LIGHTING.shadow.size);
    key.shadow.radius = LIGHTING.shadow.radius;
    key.shadow.bias = LIGHTING.shadow.bias;
    key.shadow.normalBias = LIGHTING.shadow.normalBias;
    this.scene.add(key, key.target);
    this.key = key;
    this.hemi = hemi;
    // static board geometry (rebuilt by setStage / setArea) and the battle device meshes (owned by render/units.js
    // DeviceView handles: they must survive a rebuild — a camera flight between areas rebuilds mid-battle)
    this.root = new T.Group();
    this.dynamic = new T.Group();
    this.scene.add(this.root, this.dynamic);
    this.stageKey = null;
    this.stage = null;
    this.area = AREAS.normal;
    this.areaKey = areaKey(AREAS.normal);
    this.battleRect = null;
    this.devices = new Set();
    this.flashes = [];
    this.time = 0;
    this.size = { w: 1, h: 1, dpr: 1 };
    this.camVersion = -1;
    this.camRef = null;
    this.frames = 0;
    this.lastMs = 0;
    this._crateGeom = null;
  }

  // ---- geometry ----------------------------------------------------------------------------------------------

  _geometry(data) {
    const T = this.THREE;
    const g = new T.BufferGeometry();
    const floats = (a) => ArrayBuffer.isView(a) ? a : new Float32Array(a);
    g.setAttribute('position', new T.BufferAttribute(floats(data.position), 3));
    if (data.normal) g.setAttribute('normal', new T.BufferAttribute(floats(data.normal), 3));
    if (data.uv) g.setAttribute('uv', new T.BufferAttribute(floats(data.uv), 2));
    if (data.uv1?.length) g.setAttribute('uv1', new T.BufferAttribute(floats(data.uv1), 2));
    if (data.color) g.setAttribute('color', new T.BufferAttribute(floats(data.color), 3));
    const indices = ArrayBuffer.isView(data.index) ? data.index : (data.position.length / 3 > 65535 ? new Uint32Array(data.index) : new Uint16Array(data.index));
    g.setIndex(new T.BufferAttribute(indices, 1));
    if (!data.normal) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  _mesh(data, material, { cast = true, receive = true, order = 0 } = {}) {
    addShadowContrast(this.THREE, material);
    if (!data || !material || !(data.index?.length > 0)) return null;
    const m = new this.THREE.Mesh(this._geometry(compactGeometry(data)), material);
    m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = order;
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.root.add(m);
    return m;
  }

  _clear() {
    for (const m of this.lightmapMaterials) m.dispose();
    this.lightmapMaterials = [];
    for (const t of Object.values(this.lightmapTextures)) t.dispose();
    this.lightmapTextures = {};
    for (const ch of [...this.root.children]) {
      this.root.remove(ch);
      ch.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.meshes = {};
  }

  _disposeLayout(layout) {
    for(const m of layout.lightmapMaterials)m.dispose();
    for(const t of Object.values(layout.lightmapTextures))t.dispose();
    for(const child of layout.children)child.traverse?.(o=>o.geometry?.dispose());
  }

  _stashLayout() {
    if(!this.layoutCacheSize || !this.activeLayoutKey || !this.root.children.length)return;
    const layout={children:[...this.root.children],meshes:this.meshes,board:this.board,staticCrates:this.staticCrates,
      lightmapMaterials:this.lightmapMaterials,lightmapTextures:this.lightmapTextures,
      originalStage:this.originalStage,stageLightDir:this.stageLightDir,
      keyIntensity:this.key.intensity,keyColor:this.key.color.clone(),hemiIntensity:this.hemi.intensity};
    for(const child of layout.children)this.root.remove(child);
    this.lightmapMaterials=[];this.lightmapTextures={};this.meshes={};
    this.layoutCache.set(this.activeLayoutKey,layout);
    while(this.layoutCache.size>this.layoutCacheSize-1){
      const [key,old]=this.layoutCache.entries().next().value;
      this.layoutCache.delete(key);this._disposeLayout(old);
    }
  }

  /** The crate mesh in board space (s_common_box_01 when loaded, else a unit chamfer-free box), UVs on D. */
  crateGeometry() {
    if (this._crateGeom) return this._crateGeom;
    if (this.pack?.original?.crate && this.originalMaterials.MT_trap_1105_accrate) return this._crateGeom = this.pack.original.crate;
    const uv = this.pack?.uv || {};
    const obj = this.pack?.meshes?.crate;
    let base;
    if (obj && obj.normal) base = objToBoard(obj, 0.01);
    else base = boxData(0.9, 0.675);
    this._crateGeom = boxProjectUV(base, uv.crateTop || { src: 'D', rect: [1222, 1938, 134, 108] }, uv.crateSide || { src: 'D', rect: [1087, 1938, 134, 108] });
    this._crateGeom.color = null;
    return this._crateGeom;
  }

  /** Built areas (inclusive tile rects): rebuilds when they change. */
  setArea(rects, { rebuild = true } = {}) {
    const list = Array.isArray(rects) && rects.length ? rects : AREAS.normal;
    const k = areaKey(list);
    if (k === this.areaKey) return false;
    this.area = list;
    this.areaKey = k;
    this.stageKey = null;
    if (rebuild && this.stage) this.setStage(this.stage);
    return true;
  }

  /** Rebuild everything for a stage (no-op when the same stage object/grid is set again). */
  setStage(stage, area) {
    if (this.destroyed) return;
    if (area) this.setArea(area, { rebuild: false });
    const key = stage ? `${stage.id || ''}|${(stage.rows || []).join('/')}|${JSON.stringify((stage.devices || []).map((d) => [d.key, d.pos, d.active, d.dir]))}|${stage.previewLayout ? stage.previewLayout.worldOffset || 0 : 'native'}` : '';
    if (key === this.stageKey) return;
    const layoutKey=stage ? `${key}|${this.areaKey}|${this.mapQuality}|${!!this.pack?.original?.scenes?.[stage.id]}` : null;
    const cached=this.layoutCache.get(layoutKey);
    if(cached)this.layoutCache.delete(layoutKey);
    this._stashLayout();
    this.stageKey = key;
    this.stage = stage || null;
    this._clear();
    this.activeLayoutKey=layoutKey;
    if (!stage) return;
    if(cached){
      for(const child of cached.children)this.root.add(child);
      for(const prop of ['meshes','board','staticCrates','lightmapMaterials','lightmapTextures','originalStage','stageLightDir'])this[prop]=cached[prop];
      this.key.intensity=cached.keyIntensity;this.key.color.copy(cached.keyColor);this.hemi.intensity=cached.hemiIntensity;
      this._fitShadow(this.board);this._rebuildCrates();
      this.renderer.shadowMap.needsUpdate=true;this.layoutCacheHits++;
      return;
    }
    if (this.mapQuality !== 'low' && this.pack?.original?.loadStage && !this.pack.original.scenes[stage.id]) {
      this.pack.original.loadStage(stage.id).then((scene) => {
        if (scene && !this.destroyed && this.stage?.id === stage.id) {
          this.stageKey = null;
          this.setStage(this.stage);
        }
      });
    }
    const worldOffset=stage.previewLayout?.worldOffset || 0;
    const structuralStage=stage.structuralSource || stage;
    const board = buildBoard(stage, { uv: this.pack?.uv || null, area: this.area });
    this.board = board;
    const M = this.meshes = {};
    const borderSurfaces=[], borderSources=[], nativeParts=[];
    const candidate = this.mapQuality === 'low' ? null : this.pack?.original?.scenes?.[stage.id];
    // Missing/invalid material metadata must retain the working reconstructed board.
    const original = candidate && Object.entries(candidate.buckets).every(([k,g]) => this.originalMaterials[g.material || k]) ? candidate : null;
    this.originalStage = original?.stageId || null;
    // The city bundle's serialized grazing light is a baking setting; its
    // runtime screenshot has short wall shadows and illuminated floor faces.
    // Preserve the azimuth, but match that elevation only for the city theme.
    this.stageLightDir = original?.lighting?.dir || null;
    if (original && stage.id === 'act2autochess_m01' && this.stageLightDir) {
      this.stageLightDir = [this.stageLightDir[0], this.stageLightDir[1], 1.05];
    }
    // Retain a restrained sky contribution for the native reflection/probe
    // lighting that is not represented by the exported static lightmaps.
    this.hemi.intensity = LIGHTING.hemi.intensity;
    this.key.intensity = original?.lighting?.intensity != null ? original.lighting.intensity * LIGHTING.nativeDirectGain : LIGHTING.key.intensity;
    if (original?.lighting?.color) this.key.color.setRGB(...original.lighting.color);
    else this.key.color.setHex(LIGHTING.key.color);
    if (original) {
      for (const [material, geometry] of Object.entries(original.buckets)) {
        // Serialized Waterplane nodes carry a green runtime placeholder material.
        // Preserve their original geometry and provide the animated web water shader.
        const sourceName = geometry.material || material;
        // The UI highlight is above the actual sunken water surface. Rendering
        // both hides the basin rim and incorrectly raises the visible water.
        if (sourceName === 'MT_Dosshore_UI' && Object.values(original.buckets).some(g=>
          /water2$/i.test(g.material || '') && g.index?.length && this.originalMaterials[g.material]?.uniforms?.uDeep)) continue;
        const nativeWater = Object.values(original.buckets).map(g=>this.originalMaterials[g.material]).find(m=>m?.isShaderMaterial && m.uniforms?.uDeep);
        let runtimeMaterial = sourceName === 'MT_Dosshore_UI' ? (nativeWater || this.mat.water) : this.originalMaterials[sourceName];
        // Match the cyan water in the reference; the serialized basin material
        // carries a yellow/green editor tint. Keep the original basin geometry.
        if (sourceName === 'MT_AutochessSand_water2' && this.originalMaterials.MT_AutochessSand_water?.uniforms?.uDeep) {
          runtimeMaterial = this.originalMaterials.MT_AutochessSand_water;
        }
        if (!runtimeMaterial.isShaderMaterial && sourceName !== 'MT_Dosshore_UI' && geometry.lightMap && geometry.uv1?.length && this.pack.original.images[geometry.lightMap]) {
          const name = geometry.lightMap;
          const tex = this.lightmapTextures[name] ||= makeTexture(this.THREE, this.pack.original.images[name], { srgb: !runtimeMaterial.userData.nativeGamma });
          tex.channel = 1;
          runtimeMaterial = runtimeMaterial.clone();
          runtimeMaterial.lightMap = tex;
          // Unity mobile RGBM (range 5): alpha*5 in native gamma lighting,
          // and the linear decode plus PI only for linear fallback materials.
          const nativeGamma = runtimeMaterial.userData.nativeGamma;
          runtimeMaterial.lightMapIntensity = nativeGamma ? 1 : Math.PI;
          const T = this.THREE;
          const sourceCompile = this.originalMaterials[sourceName].onBeforeCompile;
          runtimeMaterial.onBeforeCompile = shader => {
            sourceCompile(shader);
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', T.ShaderChunk.lights_fragment_maps.replace(
              'lightMapTexel.rgb * lightMapIntensity',
              nativeGamma ? 'lightMapTexel.rgb * (5.0 * lightMapTexel.a) * lightMapIntensity' : 'lightMapTexel.rgb * (pow(5.0, 2.2) * pow(lightMapTexel.a, 2.2)) * lightMapIntensity'
            ));
          };
          runtimeMaterial.customProgramCacheKey = () => nativeGamma ? 'sp-focus-native-gamma-rgbm5' : 'sp-focus-unity-rgbm5';
          this.lightmapMaterials.push(runtimeMaterial);
        }
        const waterSurface = /Dosshore_UI/i.test(sourceName);
        // City scenery beside the preview pen is environment, not a second field.
        // Retain it only for normal/cooperative framing; never add platform tiles.
        const scenicArea = stage.id === 'act2autochess_m01' && this.area.some(a=>a.r1 >= 13)
          ? [...this.area, {r0:14,r1:18,c0:0,c1:5}] : this.area;
        const nativeArea = stage.previewLayout ? AREAS.boss : this.area;
        let visibleGeometry;
        if (structuralStage.previewLayout && !geometry.platform) {
          // Reuse the cooperative environment as one layout, translated into
          // boss world space. Combat tiles and simulation coordinates stay put.
          const environmentArea=stage.id==='act2autochess_m01'
            ? [...AREAS.unite,{r0:14,r1:18,c0:0,c1:5}] : AREAS.unite;
          const environment=waterSurface ? surfaceForArea(geometry,environmentArea) : sceneryForArea(geometry,environmentArea,{surroundOnly:true});
          // Native boss geometry owns the boundary through row 6.5.
          // The rear environment starts after it, never drawing a second copy
          // of the same boundary blocks on top of the native boss rim.
          const rear=surfaceForArea(environment,[{c0:-100,c1:100,r0:14,r1:100}]);
          const movedRear=translateEnvironment(rear,structuralStage.previewLayout.offset);
          M[`cooperative:${material}`]=this._mesh(movedRear,runtimeMaterial,{cast:!runtimeMaterial.isShaderMaterial});
          if(!waterSurface){borderSurfaces.push(sceneryForArea(movedRear,[{r0:6,r1:7,c0:-1,c1:21}],{decorationOnly:true}));borderSources.push({geometry:movedRear,ornamentGeometry:translateEnvironment(environment,structuralStage.previewLayout.offset),sourceArea:{r0:7,r1:100,c0:-100,c1:100},material:runtimeMaterial,platform:false});}
          visibleGeometry=waterSurface ? {...geometry,index:[]} : surfaceForArea(sceneryForArea(geometry,AREAS.boss),[{r0:-100,r1:6,c0:-100,c1:100}]);
        } else {
          visibleGeometry=waterSurface ? surfaceForArea(geometry,nativeArea) : geometry.platform ? surfaceForArea(geometry,nativeArea) : sceneryForArea(geometry,scenicArea);
        }
        const patches=stage.previewLayout?.cooperativePatches;
        if(patches?.length) {
          visibleGeometry=surfaceForArea(visibleGeometry,outsideTileAreas(patches));
          const sourceAreas=patches.map(a=>({...a,r0:a.r0+worldOffset,r1:a.r1+worldOffset}));
          const replacement=translateEnvironment(surfaceForArea(geometry,sourceAreas),worldOffset);
          M[`cooperative-functional:${material}`]=this._mesh(replacement,runtimeMaterial,{cast:!runtimeMaterial.isShaderMaterial});
        }
        nativeParts.push({key:`original:${material}`,geometry:visibleGeometry,source:geometry,material:runtimeMaterial});
        M[`original:${material}`] = this._mesh(visibleGeometry, runtimeMaterial, { cast: !runtimeMaterial.isShaderMaterial });
        if(!waterSurface){borderSurfaces.push(geometry.platform ? {...visibleGeometry,footprints:[]} : sceneryForArea(visibleGeometry,[{r0:6,r1:7,c0:-1,c1:21}],{decorationOnly:true}));borderSources.push({geometry:stage.previewLayout ? surfaceForArea(geometry,[{r0:-100,r1:6,c0:-100,c1:100}]) : visibleGeometry,ornamentGeometry:geometry,sourceArea:stage.previewLayout ? {r0:-100,r1:6,c0:-100,c1:100} : null,material:runtimeMaterial,platform:!!geometry.platform});}
        if (stage.previewLayout && geometry.platform) {
          const {source,offset}=structuralStage.previewLayout;
          const floor=surfaceForArea(geometry,[{...source,c0:source.c0-1,c1:source.c1+1}]);
          const moved={...floor,position:floor.position.map((v,i)=>i%3===1?v-offset:v)};
          M[`preview:${material}`]=this._mesh(moved,runtimeMaterial,{cast:!runtimeMaterial.isShaderMaterial});
          borderSurfaces.push({...moved,footprints:[]});
        }
      }
    } else {
      const fallback=stage.previewLayout ? buildBoard(structuralStage,{uv:this.pack?.uv || null,area:[...AREAS.boss,{r0:7,r1:11,c0:6,c1:14}]}) : board;
      const areas=stage.previewLayout ? [{r0:0,r1:5,c0:0,c1:20}] : combatBorderAreas(stage,this.area);
      const cells=stage.previewLayout ? vacantBorderCells(borderCells(structuralStage,areas),[fallback.buckets.board]) : [];
      const buckets=Object.fromEntries(['board','glass','decal','pipe'].map(key=>[key,[fallback.buckets[key]]]));
      oppositeBorderRuns(cells,areas,{mirror:true}).forEach(({source,axis})=>{
        for(const key of Object.keys(buckets)){
          const geometry=fallback.buckets[key];
          if(!geometry?.position?.length||!geometry?.index?.length)continue;
          const tile=surfaceForArea(geometry,[source]);
          if(tile.index.length)buckets[key].push(reflectOppositeBorder(tile,axis));
        }
      });
      for(const[key,list]of Object.entries(buckets))M[key]=this._mesh(mergeInto(list),this.mat[key],{cast:key!=='decal'});
    }
    if (original && !['act2autochess_m01','act2autochess_m03'].includes(stage.id) && this.area.some(a=>a.c1>=20)) {
      // The sand island has a water notch outside its right rim. Extend the
      // opposite authored hill strip only into uncovered cells; keep the sea
      // beyond the rim and the existing stairs/props intact in both modes.
      const rowOffset=stage.previewLayout ? 0 : 7;
      const candidates=[];
      for(let r=3+rowOffset;r<=6+rowOffset;r++)candidates.push([r,19]);
      const solid=nativeParts.filter(p=>!p.material.isShaderMaterial).map(({geometry:g})=>({...g,footprints:[],index:Array.from(g.index).filter((_,i,a)=>{
        const base=i-i%3;return a.slice(base,base+3).every(id=>g.normal?.[id*3+2]>.7);
      })}));
      const gaps=uncoveredTileCells(candidates,solid);
      const holes=gaps.map(([r,c])=>({r0:r,r1:r,c0:c,c1:c}));
      if(holes.length)for(const {key,geometry,source,material}of nativeParts) {
        if(material.isShaderMaterial)continue;
        const retained=surfaceForArea(geometry,outsideTileAreas(holes));
        this.root.remove(M[key]);M[key]?.geometry.dispose();
        M[key]=this._mesh(retained,material,{cast:true});
        const low={...source,index:Array.from(source.index).filter((_,i,a)=>{
          const base=i-i%3;return a.slice(base,base+3).every(id=>source.position[id*3+2]<=.85);
        })};
        const copied=holes.map(a=>{
          // The matching last hill has an open corner. Use the nearest complete
          // authored hill tile instead of importing that same notch again.
          const relativeRow=a.r0-rowOffset;
          const shift=relativeRow===4 || relativeRow===6 ? relativeRow-5 : 0;
          const sourceArea={...a,r0:a.r0-shift,r1:a.r1-shift,c0:21-a.c1,c1:21-a.c0};
          return reflectOppositeBorder(translateEnvironment(surfaceForArea(low,[sourceArea]),-shift),21);
        });
        const copy=mergeInto(copied);
        M[`sand-rim:${key}`]=this._mesh(copy,material,{cast:true});
        borderSurfaces.push({...copy,platform:true,footprints:[]});
      }
    }
    if (original) {
      const areas=structuralStage.previewLayout ? [{r0:0,r1:5,c0:0,c1:20}] : combatBorderAreas(stage,this.area);
      const raised=borderSurfaces.map(g=>g.platform ? g : ({...g,index:Array.from(g.index).filter((_,i,a)=>{const base=i-i%3;return Math.max(...a.slice(base,base+3).map(id=>g.position[id*3+2]))>.08 && a.slice(base,base+3).every(id=>g.normal?.[id*3+2]>.85);})}));
      const cells=stage.previewLayout ? vacantBorderCells(borderCells(structuralStage,areas),raised) : [];
      const sourceRaised=borderSources.filter(s=>!s.platform).map(({geometry,ornamentGeometry,sourceArea})=>{const g=sceneryForArea(ornamentGeometry || geometry,[sourceArea || {r0:-100,r1:100,c0:-100,c1:100}],{decorationOnly:true});return {...g,index:Array.from(g.index).filter((_,i,a)=>{const base=i-i%3;return Math.max(...a.slice(base,base+3).map(id=>g.position[id*3+2]))>.08 && a.slice(base,base+3).every(id=>g.normal?.[id*3+2]>.85);})};});
      const runs=completeOppositeRuns(oppositeBorderRuns(cells,areas,{mirror:true}),sourceRaised),copies=new Map();
      const addCopy=(geometry,axis,material)=>{
        if(!geometry.index.length)return;
        if(!copies.has(material))copies.set(material,[]);
        copies.get(material).push(reflectOppositeBorder(geometry,axis));
      };
      runs.forEach(({source,axis},i)=>{
        const footprints=sourceRaised.flatMap(g=>g.footprints || []).filter(b=>b.x0>=source.c0-.55 && b.x1<=source.c1+.55 && b.y0>=source.r0-.55 && b.y1<=source.r1+.55);
        const supportAreas=footprints.length ? [{...source,r0:source.r0-.03,r1:source.r1+.03,c0:source.c0-.03,c1:source.c1+.03}] : [];
        borderSources.forEach(({geometry,ornamentGeometry,sourceArea,material,platform},j)=>{
          const region=sourceArea ? {r0:Math.max(source.r0,sourceArea.r0),r1:Math.min(source.r1,sourceArea.r1),c0:Math.max(source.c0,sourceArea.c0),c1:Math.min(source.c1,sourceArea.c1)} : source;
          if(region.r0>region.r1 || region.c0>region.c1)return;
          // The native water already spans the background; copying it would
          // draw another transparent surface at exactly the same depth.
          if(material.isShaderMaterial)return;
          if(platform){
            if(!footprints.length && region.r0<=5 && region.c0>=0 && region.c1<=20)return;
            const tile=compactGeometry(surfaceForArea(geometry,[region]));
            addCopy(tile,axis,material);
          }else{
            const supportSource=ornamentGeometry || geometry;
            const ornament=sceneryForArea(supportSource,[region],{decorationOnly:true});
            addCopy(compactGeometry(ornament),axis,material);
            // Copy the authored floor only underneath complete native props.
            // This retains soil inside a planter without importing loose
            // landscape/pen fragments into otherwise empty background cells.
            if(supportAreas.length) {
              const used=new Set();
              for(let n=0;n<ornament.index.length;n+=3)used.add(Array.from(ornament.index.slice(n,n+3)).join(','));
              const index=[];
              for(let n=0;n<supportSource.index.length;n+=3) {
                const tri=Array.from(supportSource.index.slice(n,n+3));
                if(!used.has(tri.join(',')) && tri.every(id=>supportSource.position[id*3+2]<=.85))index.push(...tri);
              }
              const base=surfaceForArea({...supportSource,index},supportAreas);
              addCopy(compactGeometry(base),axis,material);
            }
          }
        });
      });
      const occupied=new Set();
      for(const mesh of Object.values(M))if(mesh && !mesh.material?.isShaderMaterial && mesh.geometry?.index) {
        uniqueCopiedFaces({position:mesh.geometry.attributes.position.array,index:mesh.geometry.index.array},occupied);
      }
      let copyIndex=0;
      for(const[material,list]of copies)M[`opposite-border:${copyIndex++}`]=this._mesh(uniqueCopiedFaces(mergeInto(list),occupied),material,{cast:!material.isShaderMaterial});
      // Original scenes already contain their theme-specific preview floor.
      // Procedural glass belongs only to the fallback board (above); adding it
      // here covers the native sand/city floor and its baked lighting.
      const slabs = buildDeviceSlabs(board.devices.filter(d=>!this.nativeDevice(d)), board.grid, this.pack?.uv);
      M.deviceSlabs = this._mesh(slabs.board, this.mat.board);
      M.deviceDecals = this._mesh(slabs.decal, this.mat.decal, { cast: false });

    }
    // Apply the same translation to every native structural mesh, including
    // copied supports and the preview pen. Devices retain gameplay positions.
    if(worldOffset)for(const mesh of Object.values(M)) {
      if(mesh?.position && mesh!==M.deviceSlabs && mesh!==M.deviceDecals){ mesh.position.y+=worldOffset; mesh.updateMatrix(); }
    }
    this._buildDevices(board);
    this._buildGates(board);
    if (!original) this._buildEdges(board);
    this._buildTerrain(board);
    this._buildBackground(board);
    this._fitShadow(board);
    this.renderer.shadowMap.needsUpdate = true;
  }

  nativeDevice(d) {
    return d.kind === 'platform' && this.pack?.original?.platform && this.originalMaterials.MT_trap_1106_achplat
      ? {geometry:this.pack.original.platform,material:this.originalMaterials.MT_trap_1106_achplat} : null;
  }

  _buildDevices(board) {
    const crates = [], blowers = [];
    this.staticCrates = [];
    const wind = this.pack?.meshes?.blower ? objToBoard(this.pack.meshes.blower, 1) : null;
    const nativePlatforms=[];
    for (const d of board.devices) {
      const native=this.nativeDevice(d);
      if(native){
        const height=native.geometry.bounds?.z1 || .26;
        nativePlatforms.push(placeMesh(native.geometry,{x:d.c,y:d.r,z:d.z0,sz:.26/height,rot:DIR_TURNS[d.dir]??0}));
        continue;
      }
      if (d.kind === 'crate') this.staticCrates.push(d);
      else if (d.kind === 'blower' && wind && this.mat.wind) blowers.push(placeMesh(wind, { x: d.c, y: d.r, z: d.z0 + 0.078, rot: DIR_TURNS[d.dir] ?? 0 }));
      else if (d.kind === 'blower' || d.kind === 'turret') crates.push(placeMesh(boxWithTop(this.pack?.uv, d.kind), { x: d.c, y: d.r, z: d.z0 }));
      else if (d.kind === 'mound') crates.push(placeMesh(this.crateGeometry(), { x: d.c, y: d.r, z: d.z0, s: 0.95, sz: 0.55 }));
      else if (d.kind === 'bush') crates.push(placeMesh(bushData(), { x: d.c, y: d.r, z: d.z0 }));
    }
    if(nativePlatforms.length)this.meshes.platforms=this._mesh(mergeInto(nativePlatforms),this.originalMaterials.MT_trap_1106_achplat);
    if (blowers.length) this.meshes.blowers = this._mesh(mergeInto(blowers), this.mat.wind, { receive: false });
    if (crates.length) this.meshes.props = this._mesh(mergeInto(crates), this.mat.board);
    this._rebuildCrates();
  }

  _rebuildCrates() {
    if (this.meshes.crates) { this.root.remove(this.meshes.crates); this.meshes.crates.geometry.dispose(); this.meshes.crates = null; }
    const R = this.battleRect;
    const inside = (d) => !!R && d.r >= R.r0 && d.r <= R.r1 && d.c >= R.c0 && d.c <= R.c1;
    const list = (this.staticCrates || []).filter((d) => !inside(d)).map((d) => placeMesh(this.crateGeometry(), { x: d.c, y: d.r, z: d.z0 }));
    if (list.length) this.meshes.crates = this._mesh(mergeInto(list), this.originalMaterials.MT_trap_1105_accrate || this.mat.board);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Battle rect (null in prep): static crates inside it are hidden (the sim spawns them as device units). */
  setBattleRect(rect) {
    const next = rect ? { r0: rect.r0, r1: rect.r1, c0: rect.c0, c1: rect.c1 } : null;
    if (JSON.stringify(next) === JSON.stringify(this.battleRect)) return;
    this.battleRect = next;
    if (this.board) this._rebuildCrates();
  }

  _buildGates(board) {
    const G = this.pack?.meshes?.gate || {};
    if (!this.tex.gate) return;
    const place = (slot) => {
      const rec = G[slot];
      if (!rec) return null;
      return objToBoard(rec.mesh, 0.01);
    };
    const parts = { startDown: place('startDown'), startUp: place('startUp'), startBack: place('startBack'), endDown: place('endDown'), endUp: place('endUp') };
    const startAdd = [], endAdd = [], endAb = [];
    for (const g of board.gates) {
      // the tile effect's prefab rotation (0, .707, −.707, 0) maps the mesh to (x', −z', y') of the exported OBJ:
      // objToBoard's frame turned half a turn — the warning glyph on the top face points north (the official look)
      const at = { x: g.c, y: g.r, z: g.z + 0.5 + 0.003, rot: 2 };
      if (g.kind === 'start') for (const k of ['startDown', 'startUp', 'startBack']) { if (parts[k]) startAdd.push(placeMesh(parts[k], at)); }
      else {
        if (parts.endDown) endAdd.push(placeMesh(parts.endDown, at));
        if (parts.endUp) endAb.push(placeMesh(parts.endUp, at));
      }
    }
    const opt = { cast: false, receive: false, order: 5 };
    if (startAdd.length) this.meshes.gateStart = this._mesh(mergeInto(startAdd), this.mat.gateStartAdd, opt);
    if (endAdd.length) this.meshes.gateEndAdd = this._mesh(mergeInto(endAdd), this.mat.gateEndAdd, opt);
    if (endAb.length) this.meshes.gateEndAb = this._mesh(mergeInto(endAb), this.mat.gateEndAb, { ...opt, order: 4 });
  }

  _buildEdges(board) {
    const pos = [], uv = [], idx = [];
    const w = 0.085, e = 0.018;
    for (const s of board.edges) {
      const x0 = s.c - 0.5, x1 = s.c + 0.5, y0 = s.r - 0.5, y1 = s.r + 0.5, z = s.z + 0.006;
      let q;
      switch (s.dir) {
        case 'S': q = [[x0, y0 + e, z], [x1, y0 + e, z], [x1, y0 + e + w, z], [x0, y0 + e + w, z]]; break;
        case 'N': q = [[x1, y1 - e, z], [x0, y1 - e, z], [x0, y1 - e - w, z], [x1, y1 - e - w, z]]; break;
        case 'E': q = [[x1 - e, y0, z], [x1 - e, y1, z], [x1 - e - w, y1, z], [x1 - e - w, y0, z]]; break;
        default: q = [[x0 + e, y1, z], [x0 + e, y0, z], [x0 + e + w, y0, z], [x0 + e + w, y1, z]]; break;
      }
      const b = pos.length / 3;
      for (const p of q) pos.push(...p);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      // winding: all strips face up
      const n = [(q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0])];
      if (n[0] >= 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    if (!pos.length) return;
    const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
    this.meshes.edges = this._mesh({ position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) }, this.mat.edge, { cast: false, receive: false, order: 3 });
  }

  _buildTerrain(board) {
    const quads = (tiles, z, inset = 0) => {
      const pos = [], uv = [], idx = [];
      for (const [r, c] of tiles) {
        const a = 0.5 - inset, b = pos.length / 3;
        pos.push(c - a, r - a, z, c + a, r - a, z, c + a, r + a, z, c - a, r + a, z);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
      return { position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) };
    };
    if (board.terrain.infection.length) this.meshes.infectionGlow = this._mesh(quads(board.terrain.infection, 0.025, 0.025), this.mat.infectionGlow, {cast:false,receive:false,order:3});
    // Native stage meshes already contain these environmental tile surfaces.
    if (this.originalStage) return;
    const T = board.terrain;
    const opt = { cast: false, receive: false, order: 2 };
    if (T.water.length && !Object.keys(this.meshes).some(k=>k.startsWith('original:') && k.includes('Dosshore_UI'))) this.meshes.water = this._mesh(quads(T.water, -0.035), this.mat.water, opt);
    if (T.mire.length) this.meshes.mire = this._mesh(quads(T.mire, 0.006, 0.02), this.mat.mire, opt);
    if (T.infection.length) this.meshes.infection = this._mesh(quads(T.infection, 0.007, 0.02), this.mat.infection, opt);
    if (T.smog.length) {
      // two crossed haze cards per grille tile, standing up
      const pos = [], uv = [], idx = [];
      for (const [r, c] of T.smog) {
        for (const [dx, dy] of [[1, 0], [0.7, 0.7]]) {
          const b = pos.length / 3, h = 0.95, w = 0.55;
          pos.push(c - dx * w, r - dy * w, 0.02, c + dx * w, r + dy * w, 0.02, c + dx * w, r + dy * w, h, c - dx * w, r - dy * w, h);
          uv.push(0, 0, 1, 0, 1, 1, 0, 1);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
      const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = -1;
      this.meshes.smog = this._mesh({ position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) }, this.mat.smog, { ...opt, order: 6 });
    }
  }

  _buildBackground(board) {
    const T = this.THREE;
    const B = LIGHTING.bg;
    const cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2;
    let plane = null;
    const obj = this.pack?.meshes?.bgPlane;
    if (obj) plane = objToBoard(obj, B.size / 100);
    const data = plane || { position: new Float32Array([-B.size / 2, -B.size / 2, 0, B.size / 2, -B.size / 2, 0, B.size / 2, B.size / 2, 0, -B.size / 2, B.size / 2, 0]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), index: new Uint16Array([0, 1, 2, 0, 2, 3]) };
    const placed = extendPlane(placeMesh(data, { x: cx, y: cy, z: B.z }), cx, cy, B.tiles);
    // the plane may face either way after the axis swap: make it face up
    if (placed.normal && placed.normal[2] < 0) {
      for (let i = 0; i < placed.normal.length; i++) placed.normal[i] = -placed.normal[i];
      const ix = placed.index;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    this.meshes.bg = this._mesh({ ...placed, color: null }, this.mat.bg, { cast: false, receive: false, order: -2 });
    // the key light's shadow of the island on the ground far below (S_Background_shadow's role)
    const s = B.size;
    const q = { position: new Float32Array([cx - s / 2, cy - s / 2, B.z + 0.02, cx + s / 2, cy - s / 2, B.z + 0.02, cx + s / 2, cy + s / 2, B.z + 0.02, cx - s / 2, cy + s / 2, B.z + 0.02]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), color: null, index: new Uint16Array([0, 1, 2, 0, 2, 3]) };
    this.meshes.bgShadow = this._mesh(q, this.mat.shadowCatcher, { cast: false, receive: true, order: -1 });
    void T;
  }

  _fitShadow(board) {
    const k = this.key;
    const b = board.bounds;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const d = this.stageLightDir || LIGHTING.key.dir;
    const len = Math.hypot(d[0], d[1], d[2]);
    const dist = 30;
    k.position.set(cx + (d[0] / len) * dist, cy + (d[1] / len) * dist, (d[2] / len) * dist);
    k.target.position.set(cx, cy, 0);
    k.target.updateMatrixWorld();
    const cam = k.shadow.camera;
    // light-space box covering the island and its shadow on the background plane
    const half = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 9;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = dist + 30;
    cam.updateProjectionMatrix();
    k.updateMatrixWorld();
  }

  // ---- dynamic devices (battle) ------------------------------------------------------------------------------

  /** A crate / device box driven by render/units.js DeviceView (see header). */
  createDevice() {
    const T = this.THREE;
    const self = this;
    const geom = this._geometry({ ...this.crateGeometry(), color: null });
    const sourceMaterial = this.originalMaterials.MT_trap_1105_accrate || this.mat.board;
    const mat = sourceMaterial.clone();
    mat.transparent = true;
    mat.vertexColors = false;
    // keep the focus falloff on the clone
    mat.onBeforeCompile = sourceMaterial.onBeforeCompile;
    const mesh = new T.Mesh(geom, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.dynamic.add(mesh);
    const bx = this.crateGeometry().bounds || { x0: -0.45, x1: 0.45, z0: 0, z1: 0.675 };
    const baseSize = Math.max(0.01, bx.x1 - bx.x0), baseH = Math.max(0.01, bx.z1 - bx.z0);
    let dead = false;
    const h = {
      mesh: null,
      board: this,
      get destroyed() { return dead; },
      update(cam, b) {
        if (!b || dead) return;
        mesh.visible = (b.alpha ?? 1) > 0.01;
        mesh.position.set(b.x, b.y, b.z);
        const s = (b.size || baseSize) / baseSize;
        mesh.scale.set(s, s, Math.max(0.001, (b.height ?? baseH) / baseH));
        mat.opacity = Math.max(0, Math.min(1, b.alpha ?? 1));
        mat.depthWrite = mat.opacity > 0.98;
      },
      destroy() {
        if (dead) return;
        dead = true;
        self.dynamic.remove(mesh); geom.dispose(); mat.dispose(); self.devices.delete(h);
        if (!self.destroyed) self.renderer.shadowMap.needsUpdate = true;
      },
    };
    this.devices.add(h);
    this.renderer.shadowMap.needsUpdate = true;
    return h;
  }

  /** Red leak flash on the objective box at (r, c). */
  flashObjective(r, c) {
    this.flashes.push({ r, c, t: 0 });
    if (this.flashes.length > 8) this.flashes.shift();
  }

  // ---- view ------------------------------------------------------------------------------------------------------

  /** The lit field rect ({ r0, r1, c0, c1 } tiles; null = everything lit). Animated in render(). */
  setFocus(rect) {
    this.focusTarget = rect ? [rect.c0 - 0.5, rect.r0 - 0.5, rect.c1 + 0.5, rect.r1 + 0.5] : [-50, -50, 70, 70];
  }

  /** Settings quality change: 'low' drops the key light's shadow (antialias is fixed at context creation). */
  setQuality(q) {
    const on = q !== 'low';
    const R = this.renderer;
    if (R.shadowMap.enabled === on && this.key.castShadow === on) return false;
    R.shadowMap.enabled = on;
    this.key.castShadow = on;
    R.shadowMap.needsUpdate = true;
    return true;
  }

  resize(w, h, dpr = 1) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (W === this.size.w && H === this.size.h && dpr === this.size.dpr) return;
    this.size = { w: W, h: H, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.camVersion = -1;
  }

  /** Draw a frame with projection camera `cam` at time `t` (seconds). */
  render(cam, t = 0) {
    if (this.destroyed || this.lost || !cam) return false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = Math.max(0, Math.min(0.1, t - this.time));
    this.time = t;
    if (cam !== this.camRef || cam.version !== this.camVersion) {
      this.camRef = cam; this.camVersion = cam.version;
      syncThreeCamera(cam, this.camera, this.size.w, this.size.h, { near: Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
    }
    // focus falloff (eased)
    const F = this.focus.uFocus.value;
    if (this.focusTarget) {
      const k = Math.min(1, dt * 5);
      const tg = this.focusTarget;
      if (Math.abs(F.x - tg[0]) + Math.abs(F.y - tg[1]) + Math.abs(F.z - tg[2]) + Math.abs(F.w - tg[3]) > 40) F.set(tg[0], tg[1], tg[2], tg[3]);
      else F.set(F.x + (tg[0] - F.x) * k, F.y + (tg[1] - F.y) * k, F.z + (tg[2] - F.z) * k, F.w + (tg[3] - F.w) * k);
    }
    // gate pulses (official 2 s curve → additive intensity), objective leak flashes
    const pulse = gatePulse(t);
    if (this.mat.gateStartAdd) this.mat.gateStartAdd.uniforms.uPulse.value = GATE_GAIN * pulse / 0.18;
    if (this.mat.gateEndAdd) this.mat.gateEndAdd.uniforms.uPulse.value = GATE_GAIN * gatePulse(t, 0.5) / 0.18;
    if (this.mat.gateEndAb) this.mat.gateEndAb.uniforms.uPulse.value = 0.9;
    let flash = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > 1.2) this.flashes.splice(i, 1); else flash = Math.max(flash, 1 - f.t / 1.2); }
    for (const m of [this.mat.gateEndAdd, this.mat.gateEndAb]) if (m) m.uniforms.uFlash.value.setRGB(flash, flash * 0.12, flash * 0.1);
    for (const k of ['water', 'mire', 'infection', 'infectionGlow', 'smog']) this.mat[k].uniforms.uTime.value = t;
    for (const m of Object.values(this.originalMaterials)) if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (t0) this.lastMs = this.lastMs * 0.9 + ((typeof performance !== 'undefined' ? performance.now() : t0) - t0) * 0.1;
    return true;
  }

  stats() {
    const info = this.renderer.info;
    return { calls: info?.render?.calls ?? 0, triangles: info?.render?.triangles ?? 0, textures: info?.memory?.textures ?? 0, geometries: info?.memory?.geometries ?? 0, frames: this.frames, cpuMs: Math.round(this.lastMs * 100) / 100, lost: this.lost, originalStage: this.originalStage || null, cachedLayouts:this.layoutCache.size,layoutCacheHits:this.layoutCacheHits };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const d of [...this.devices]) d.destroy();
    this._clear();
    for(const layout of this.layoutCache.values())this._disposeLayout(layout);
    this.layoutCache.clear();
    this.mat.edge?.map?.dispose?.(); // canvas dash texture (not in this.tex)
    for (const m of Object.values(this.mat)) m?.dispose?.();
    for (const t of Object.values(this.tex)) t?.dispose?.();
    for (const m of Object.values(this.originalMaterials)) m?.dispose?.();
    for (const t of Object.values(this.originalTextures)) t?.dispose?.();
    this.envMap?.dispose?.();
    this.canvas.removeEventListener?.('webglcontextlost', this._onLost);
    try { this.renderer.dispose(); } catch { /* ignore */ }
    try { this.renderer.forceContextLoss?.(); } catch { /* ignore */ }
  }
}

// ---- small procedural meshes (fallbacks / rare devices) ------------------------------------------------------------

/** Axis-aligned box on the ground, centred on the origin: size × size × height. */
export function boxData(size, height) {
  const a = size / 2, pos = [], nrm = [], uv = [], idx = [];
  const faces = [
    [[0, 0, 1], [[-a, -a, height], [a, -a, height], [a, a, height], [-a, a, height]]],
    [[0, -1, 0], [[-a, -a, 0], [a, -a, 0], [a, -a, height], [-a, -a, height]]],
    [[1, 0, 0], [[a, -a, 0], [a, a, 0], [a, a, height], [a, -a, height]]],
    [[0, 1, 0], [[a, a, 0], [-a, a, 0], [-a, a, height], [a, a, height]]],
    [[-1, 0, 0], [[-a, a, 0], [-a, -a, 0], [-a, -a, height], [-a, a, height]]],
  ];
  for (const [n, q] of faces) {
    const b = pos.length / 3;
    for (const p of q) { pos.push(...p); nrm.push(...n); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), uv: new Float32Array(uv), index: new Uint16Array(idx) };
}

/** Device box with an atlas top (blower fallback ▶▶ hatch, turret target plate) and grey sides. */
function boxWithTop(uvTable, kind) {
  const size = kind === 'turret' ? 0.72 : 0.86, h = kind === 'turret' ? 0.34 : DEVICE_H.platform;
  const b = boxData(size, h);
  const top = surfaceUV(uvTable?.mech || { src: 'D', rect: [1088, 708, 356, 310] });
  const side = surfaceUV(uvTable?.graySide || { src: 'D', rect: [272, 1664, 272, 120] });
  const uv = new Float32Array(b.uv.length);
  for (let f = 0; f < 5; f++) uv.set(f === 0 ? top : side, f * 8);
  return { ...b, uv, color: null };
}

/** Low green blob (act1 m07 bushes: inactive in 盟约, kept for completeness). */
function bushData() {
  const b = boxData(0.7, 0.32);
  return { ...b, uv: new Float32Array(b.uv.length).fill(0.02), color: new Float32Array((b.position.length / 3) * 3).fill(0).map((_, i) => [0.25, 0.48, 0.22][i % 3]) };
}
