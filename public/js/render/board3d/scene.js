import { borderCells, combatBorderAreas, oppositeBorderRuns, completeOppositeRuns, vacantBorderCells, reflectOppositeBorder, disjointAreas, uncoveredTileCells, uniqueCopiedFaces } from './surroundings.js';
import { applyNativeStageBlend } from './materials.js';
// render/board3d/scene.js — the official 卫戍协议 board as a real three.js scene (DESIGN §15), rendered on its own
// canvas UNDER the Pixi canvas (units, FX, highlights, HP bars stay in Pixi). One camera model drives both layers:
// render/projection.js `syncThreeCamera` makes the three.js PerspectiveCamera project exactly like the Pixi one.
//
//   const board = new BoardScene(THREE, pack, { canvas, quality })   (pack = load.js loadBoardPack)
//   board.setStage(stage)            geometry from the stage grid (layout.js) + devices + gates + terrain
//   board.setScenePack(id, pack)     the official scene of stage `id` (load.js loadScenePack): drawn instead of the
//                                    procedural tiles and background while that stage is set (null → procedural)
//   board.setArea(rects)             the built areas (layout.js AREAS / areaFor: normal field + pen, 联防, boss)
//   board.setFocus(rect)             the lit field (others fade, animated)
//   board.setBattleRect(rect|null)   crates / turrets inside a running battle are sim units: static ones hide
//   board.createDevice(spec)         → handle { update(cam, { x, y, z, size, height, top, side, alpha, rot }), mesh: null, destroy() }
//                                      (render/units.js DeviceView boxes, drawn as the official crate mesh)
//   board.flashObjective(r, c)       leak flash of a blue objective box
//   board.render(cam, timeSec)       sync the camera, animate, draw
//   board.resize(w, h, dpr) · board.stats() · board.destroy()
//
// Draw calls: board (tiles + blocks + platforms, merged, MT_autochess), the pen's glass hatches (glassMaterial),
// static crates and 射击台 as official models (trap_1105_accrate / trap_1106_achplat, merged, trapMaterial —
// the atlas box / layout.js slab stay the fallbacks without the local art),
// decals (MT_autochess_common), fence pipes, blowers (merged, unlit), gate boxes (additive + alpha, merged per
// material), cyan field edges, terrain overlays (≤ 4), background plane + its shadow catcher — ~12–16 in total.
// An official scene replaces the tiles, glass, decals, pipes and background (all but the device slabs, layout.js
// buckets.raised — GitHub #569) with one mesh per material and lightmap
// page of the parts the built areas show (load.js mergeSceneChunks). Devices, gates, edges and terrain stay.
// The key light's shadow map is rendered only when the geometry changes (autoUpdate off).

import { buildBoard, buildDeviceSlabs, objToBoard, boxProjectUV, ROWS, COLS, DEVICE_H, AREAS, heightOf } from './layout.js';
import { surfaceUV } from './atlas.js';
import { focusUniforms, addFocus, makeTexture, boardMaterial, glassMaterial, decalMaterial, pipeMaterial, unlitMaterial, gateMaterial, glowMaterial, waterMaterial, mireMaterial, infectionMaterial, infectionGlowMaterial, infectionRiseMaterial, smogMaterial, dashTexture, environmentMap, nativePhysicalLighting, addShadowContrast, sceneMaterial, sceneWaterMaterial, sceneEnvTexture, sceneWaterDecalMaterial, applyWaterMaterial, trapMaterial } from './materials.js';
import { syncThreeCamera } from '../projection.js';
import { mergeSceneChunks, sceneMaterialKey, sceneWaterInfo, isSceneWater } from './load.js';

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

/**
 * The gate boxes' _TintColor, from the client's 2 s clip (arts/effects/[pack]map.ab, controller `starting`,
 * `UVAnimation`): one renderer red (1, 0, 0) with alpha 0.134 → 0.229 → 0.134, the other blue (0, 0.0897, 1) with alpha
 * 0.16 → 0.097 → 0.16. The alpha-blended part has the material's own (1, 1, 1, 1).
 * [ASSUMED] the clip's renderer paths are hashes that match no name in the bundle: red is read as the start gate,
 * blue as the objective.
 */
export const GATE_TINT = Object.freeze({
  start: { rgb: [1, 0, 0], alpha: [0.134, 0.229] },
  end: { rgb: [0, 0.0897, 1], alpha: [0.16, 0.097] },
  endAb: { rgb: [1, 1, 1], alpha: [1, 1] },
});

/**
 * Gate pulse: a _TintColor.a curve [at 0 s and 2 s, at 1 s] of the 2 s loop. The clip's streamed keys are cubic
 * segments a·x³ + b·x² + c·x + d with flat ends (red: −0.19, 0.285, 0, 0.134 on 0–1 s, then the mirror), i.e. a
 * smoothstep between the two values.
 */
export function gatePulse(t, [from, mid] = GATE_TINT.start.alpha) {
  const u = ((t % 2) + 2) % 2;
  const x = u < 1 ? u : 2 - u;
  return from + (mid - from) * x * x * (3 - 2 * x);
}

/**
 * Is a named part of an official scene (its ground rect [x0, y0, x1, y1]) shown with the built `areas`? The official
 * scene keeps each field as a sub-graphic it switches on (HIDDEN@n: the left / right normal field, the boss field);
 * a part is shown when its centre lies in one of the areas.
 */
export function sceneGroupVisible(rect, areas) {
  if (!Array.isArray(rect) || rect.length < 4) return true;
  const cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2;
  return (areas || []).some((a) => cx >= a.c0 - 0.5 && cx <= a.c1 + 0.5 && cy >= a.r0 - 0.5 && cy <= a.r1 + 0.5);
}

const areaKey = (list) => (list || []).map((a) => `${a.r0},${a.r1},${a.c0},${a.c1}`).sort().join(';');

/** Discard unused vertices as well as faces before creating GPU geometry. */
export function compactGeometry(src) {
  if (!src?.position || !src.index) return src;
  const count=src.position.length/3;
  const attrs=Object.entries({position:3,normal:3,uv:2,uv1:2,color:3}).filter(([key,size])=>src[key]?.length===count*size);
  const map=new Int32Array(count).fill(-1), used=[];
  for(const id of src.index)if(map[id]===-1){map[id]=used.length;used.push(id);}
  const out={...src,index:used.length>65535?new Uint32Array(src.index.length):new Uint16Array(src.index.length)};
  for(const [key,size] of attrs){
    const values=out[key]=new Float64Array(used.length*size);
    for(let i=0;i<used.length;i++)for(let j=0;j<size;j++)values[i*size+j]=src[key][used[i]*size+j];
  }
  for(let i=0;i<src.index.length;i++)out.index[i]=map[src.index[i]];
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
export function sceneryForArea(src, areas, {interiorOnly=false, surroundOnly=false, decorationOnly=false,cols=21}={}) {
  const {find,bounds}=componentsForScenery(src);
  // UV/material seams duplicate vertices at identical positions. Join those
  // copies so separate faces of one decorative object cannot be clipped apart.
  const keep = new Set();
  for (const [root,b] of bounds) {
    const landscape = b.x0 < -.5 || b.x1 > cols-.5 || b.y0 < -.5 || b.y1 > 18.5;
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

/** Blend the height of the two scenic cuts while retaining their UVs and board geometry. */
export function blendCooperativeBackground(left,right){
 const edge=17.5,width=2.5;
 const samples=g=>{const m=new Map();for(let i=0;i<g.position.length;i+=3)if(Math.abs(g.position[i]-edge)<.0001){const y=Math.round(g.position[i+1]*20)/20;m.set(y,Math.max(m.get(y)??-Infinity,g.position[i+2]));}return [...m].sort((a,b)=>a[0]-b[0]);};
 const a=samples(left),b=samples(right);if(!a.length||!b.length)return [left,right];
 const height=(list,y)=>{let lo=0,hi=list.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(list[mid][0]<y)lo=mid+1;else hi=mid;}const upper=list[lo],lower=list[Math.max(0,lo-1)];return upper[0]===lower[0]?upper[1]:lower[1]+(upper[1]-lower[1])*Math.max(0,Math.min(1,(y-lower[0])/(upper[0]-lower[0])));};
 const warp=(g,own)=>{const position=Array.from(g.position);for(let i=0;i<position.length;i+=3){const x=position[i],y=position[i+1],distance=Math.abs(x-edge);if(distance>=width||(y>=8.5&&y<=12.5))continue;const target=(height(a,y)+height(b,y))/2,delta=target-height(own,y),weight=(1+Math.cos(Math.PI*distance/width))/2;position[i+2]+=delta*weight;}return {...g,position};};
 return [warp(left,a),warp(right,b)];
}

const cooperativeGeometryCache=new WeakMap();

/** Reuse the matching native cooperative map, preserving textures and baked lighting. */
export function nativeCooperativeGeometry(src) {
  if(cooperativeGeometryCache.has(src))return cooperativeGeometryCache.get(src);
  const left=surfaceForArea(src,[{r0:-1000,r1:1000,c0:-1000,c1:17}]);
  const right=surfaceForArea(src,[{r0:-1000,r1:1000,c0:2,c1:1000}]);
  const shifted={...right,position:Array.from(right.position,(v,i)=>i%3===0?v+16:v)};
  const [blendedLeft,blendedRight]=blendCooperativeBackground(left,shifted);
  const joined={...src,...mergeInto([blendedLeft,blendedRight]),footprints:[]};
  // Remove the former outer rim before inserting the authored middle divider.
  const opened=surfaceForArea(joined,outsideTileAreas([{r0:9,r1:12,c0:16,c1:18}]));
  // Reuse the existing divider between the two ordinary cooperative fields,
  // including its raised blocks and floor, at the new middle boundary.
  const divider=surfaceForArea(src,[{r0:9,r1:12,c0:8,c1:10}]);
  const bridge={...divider,position:Array.from(divider.position,(v,i)=>i%3===0?v+8:v)};
  const result=compactGeometry({...src,...mergeInto([opened,bridge]),footprints:[]});
  cooperativeGeometryCache.set(src,result);return result;
}

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
    this.envMap = null;
    this.envRT = null;
    if (opts.environment !== false) {
      try {
        this.envMap = environmentMap(T, R);
        this.envRT = this.envMap?.userData?.pmremTarget || null;
        if (this.envMap) {
          this.scene.environment = this.envMap;
          this.scene.environmentIntensity = LIGHTING.env;
          this.scene.environmentRotation?.set?.(-Math.PI / 2, 0, 0);
        }
      } catch { this.envMap = null; this.envRT = null; }
    }
    this.focusTarget = null;
    const aniso = Math.min(8, R.capabilities?.getMaxAnisotropy?.() || 1);
    const img = pack?.images || {};
    this.tex = {
      D: makeTexture(T, img.D, { aniso }), N: makeTexture(T, img.N, { srgb: false, aniso }), R: makeTexture(T, img.R, { srgb: false, aniso }),
      E: makeTexture(T, img.E, { aniso }), common: makeTexture(T, img.common, { aniso }), commonE: makeTexture(T, img.commonE, { aniso }),
      BG: makeTexture(T, img.BG, { aniso }), wind: makeTexture(T, img.wind, { aniso }), gate: makeTexture(T, img.gate, { srgb: false }),
      waterN: makeTexture(T, img.waterN, { srgb: false, repeat: true }), caustics: makeTexture(T, img.caustics, { srgb: false, repeat: true }),
      noise: makeTexture(T, img.noise, { srgb: false, repeat: true }),
      platform: makeTexture(T, img.platform, { aniso }),
      crate: makeTexture(T, img.crate, { aniso }),
    };
    if (this.tex.BG) { this.tex.BG.wrapS = T.MirroredRepeatWrapping; this.tex.BG.wrapT = T.MirroredRepeatWrapping; }
    this.mat = {
      board: boardMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      glass: glassMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      decal: this.tex.common ? decalMaterial(T, this.tex, this.focus) : null,
      pipe: pipeMaterial(T, this.focus),
      bg: this.tex.BG ? unlitMaterial(T, this.tex.BG, new T.Color().setScalar(LIGHTING.bg.color * LIGHTING.bg.dim)) : new T.MeshBasicMaterial({ color: 0x1a1d1f }),
      platform: this.tex.platform ? trapMaterial(T, this.tex.platform, this.focus, pack?.materials?.trap?.MT_trap_1106_achplat) : null,
      crate: this.tex.crate ? trapMaterial(T, this.tex.crate, this.focus, pack?.materials?.trap?.MT_trap_1105_accrate || { floats: { _Ambient: 0.809, _Diffuse: 0.271 } }, LIGHTING.key.dir) : null,
      wind: this.tex.wind ? unlitMaterial(T, this.tex.wind) : null,
      gateStartAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true, tint: GATE_TINT.start.rgb }) : null,
      gateEndAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true, tint: GATE_TINT.end.rgb }) : null,
      gateEndAb: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: false, tint: GATE_TINT.endAb.rgb }) : null,
      edge: glowMaterial(T, dashTexture(T)),
      water: waterMaterial(T, this.tex, this.focus),
      mire: mireMaterial(T, this.tex, this.focus),
      infection: infectionMaterial(T, this.tex, this.focus),
      infectionGlow: infectionGlowMaterial(T, this.tex, this.focus),
      infectionRise: infectionRiseMaterial(T, this.focus),
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
    this.scenePacks = new Map();   // stage id → official scene pack (setScenePack)
    this.sceneRes = new Map();     // pack key → { tex, lm, mats } GPU resources (kept across rebuilds)
    this.official = null;
    this.sceneWater = [];
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
    this._crateGeom = undefined;
    this._boxGeom = null;
    this._platformGeom = undefined;
  }

  // ---- geometry ----------------------------------------------------------------------------------------------

  _geometry(data) {
    const T = this.THREE;
    const g = new T.BufferGeometry();
    const floats = (a) => a instanceof Float32Array ? a : new Float32Array(a);
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
      originalStage:this.originalStage,stageLightDir:this.stageLightDir,official:this.official,sceneWater:this.sceneWater,
      keyIntensity:this.key.intensity,keyColor:this.key.color.clone(),hemiIntensity:this.hemi.intensity};
    for(const child of layout.children)this.root.remove(child);
    this.lightmapMaterials=[];this.lightmapTextures={};this.meshes={};
    this.layoutCache.set(this.activeLayoutKey,layout);
    while(this.layoutCache.size>this.layoutCacheSize-1){
      const [key,old]=this.layoutCache.entries().next().value;
      this.layoutCache.delete(key);this._disposeLayout(old);
    }
  }

  async prewarmLayouts(entries) {
    if(this.layoutCacheSize<2 || this.destroyed || this.lost)return;
    const generation=this.warmGeneration=(this.warmGeneration||0)+1;
    const current=()=>!this.destroyed && !this.lost && generation===this.warmGeneration;
    const idle=()=>new Promise(resolve=>{
      if(globalThis.requestIdleCallback)requestIdleCallback(()=>setTimeout(resolve,75),{timeout:1500});
      else setTimeout(resolve,100);
    });
    // Let the initial field and HUD finish before using idle slices for optional maps.
    await new Promise(resolve=>setTimeout(resolve,2000));
    if(!current())return;
    for(const {stage,area} of entries){
      await idle();if(!current())return;
      if(this.mapQuality!=='low' && this.pack?.original?.loadStage && !this.pack.original.scenes[stage.originalStageId || stage.id]){
        await this.pack.original.loadStage(stage.originalStageId || stage.id);if(!current())return;
      }
      const stageKey=`${stage.id || ''}|${(stage.rows || []).join('/')}|${JSON.stringify((stage.devices || []).map(d=>[d.key,d.pos,d.active,d.dir]))}|${stage.previewLayout ? stage.previewLayout.worldOffset || 0 : 'native'}`;
      const layoutKey=`${stageKey}|${areaKey(area)}|${this.mapQuality}|${!!this.pack?.original?.scenes?.[stage.originalStageId || stage.id]}`;
      if(layoutKey===this.activeLayoutKey || this.layoutCache.has(layoutKey))continue;
      const scratch=Object.assign(Object.create(Object.getPrototypeOf(this)),this,{
        root:new this.THREE.Group(),key:this.key.clone(),hemi:this.hemi.clone(),
        stage:null,stageKey:null,activeLayoutKey:null,meshes:{},lightmapMaterials:[],lightmapTextures:{},
        layoutCache:new Map(),layoutCacheSize:0,staticCrates:[],destroyed:false,
      });
      const steps=scratch._stageSteps(stage,area);
      try{
        let done=false;
        while(current() && !done){await idle();if(!current())break;done=steps.next().done;}
        if(!current() || !done)continue;
        const key=scratch.activeLayoutKey;
        if(!key || key===this.activeLayoutKey || this.layoutCache.has(key))continue;
        // Compile offscreen shaders without switching the visible field.
        if(this.renderer.compileAsync){
          const scene=new this.THREE.Scene();scene.environment=this.scene.environment;
          scene.add(scratch.root,scratch.key,scratch.key.target,scratch.hemi);
          await this.renderer.compileAsync(scene,this.camera);
          if(!current())continue;
        }
        const layout={children:[...scratch.root.children],meshes:scratch.meshes,board:scratch.board,staticCrates:scratch.staticCrates,
          lightmapMaterials:scratch.lightmapMaterials,lightmapTextures:scratch.lightmapTextures,
          originalStage:scratch.originalStage,stageLightDir:scratch.stageLightDir,
          keyIntensity:scratch.key.intensity,keyColor:scratch.key.color.clone(),hemiIntensity:scratch.hemi.intensity};
        for(const child of layout.children)scratch.root.remove(child);
        scratch.lightmapMaterials=[];scratch.lightmapTextures={};
        this.layoutCache.set(key,layout);
        while(this.layoutCache.size>this.layoutCacheSize-1){const [oldKey,old]=this.layoutCache.entries().next().value;this.layoutCache.delete(oldKey);this._disposeLayout(old);}
      }finally{steps.return();scratch.destroyed=true;scratch._clear();}
    }
  }

  /** The crate mesh in board space (s_common_box_01 when loaded, else a unit chamfer-free box), UVs on D. */
  boxGeometry() {
    if (this._boxGeom) return this._boxGeom;
    const uv = this.pack?.uv || {};
    const obj = this.pack?.meshes?.box;
    let base;
    if (obj && obj.normal) base = objToBoard(obj, 0.01);
    else base = boxData(0.9, 0.675);
    this._boxGeom = boxProjectUV(base, uv.crateTop || { src: 'D', rect: [1222, 1938, 134, 108] }, uv.crateSide || { src: 'D', rect: [1087, 1938, 134, 108] });
    this._boxGeom.color = null;
    return this._boxGeom;
  }

  /**
   * 阻隔工事: battle prefab Graphic/Mesh/trap_1105_accrate has identity parents, X rotation −90°, scale 0.01.
   * Undo OBJ's mirrored X, apply that rotation, then battle −z → board height: (−x, z, y) × 0.01 = objToBoard.
   * Keep the authored UVs and pivot (base ~0.002, top ~0.838, footprint ~1.013 × 1.019 tiles), no recentering.
   */
  clientCrateGeometry() {
    if (this._crateGeom !== undefined) return this._crateGeom;
    const obj = this.pack?.meshes?.crate;
    this._crateGeom = obj?.normal && obj?.uv && this.mat.crate ? objToBoard(obj, 0.01) : null;
    return this._crateGeom;
  }

  crateGeometry() { return (this.originalMaterials.MT_trap_1105_accrate && this.pack?.original?.crate) || this.clientCrateGeometry() || this.boxGeometry(); }

  /** DeviceView's dimensions follow the active model; 2D and missing-art boxes keep their old spec. */
  deviceSpec(spec) {
    if (spec?.top !== 'crateTop' || !this.clientCrateGeometry()) return spec;
    if (!this._crateSpec) {
      const { min, max } = this.pack.meshes.crate.bounds;
      this._crateSpec = { ...spec, size: (max[0] - min[0]) * 0.01, height: max[1] * 0.01 };
    }
    return this._crateSpec;
  }

  /**
   * The official 射击台 model in board space (trap_1106_achplat at its prefab scale 0.01: 1.05 tiles square, 0.465
   * high — render/style.js TILE_H.platform is its top), or null without the local art (layout.js draws the slab).
   */
  platformGeometry() {
    if (this._platformGeom !== undefined) return this._platformGeom;
    const obj = this.pack?.meshes?.platform;
    this._platformGeom = obj && obj.normal && obj.uv && this.mat.platform ? objToBoard(obj, 0.01) : null;
    return this._platformGeom;
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
    for(const ignored of this._stageSteps(stage,area)) { /* foreground builds remain immediate */ }
  }

  *_stageSteps(stage, area) {
    if (this.destroyed) return;
    if (area) this.setArea(area, { rebuild: false });
    // The custom native stage owns its terrain/material treatment. A late static
    // scene pack must not replace it with the upstream shader path.
    const native = this.mapQuality !== 'low' && stage ? this.pack?.original?.scenes?.[stage.originalStageId || stage.id] : null;
    const nativeReady = native && Object.keys(native.buckets).length > 0
      && Object.entries(native.buckets).every(([k,g]) => this.originalMaterials[g.material || k]);
    const official = stage && !nativeReady ? this.scenePacks.get(stage.id) || null : null;
    const key = stage ? `${stage.id || ''}|${official ? official.key : ''}|${stage.previewLayout ? stage.previewLayout.worldOffset || 0 : 'native'}|${(stage.rows || []).join('/')}|${JSON.stringify((stage.devices || []).map((d) => [d.key, d.pos, d.active, d.dir]))}` : '';
    if (key === this.stageKey) return;
    const layoutKey=stage ? `${key}|${this.areaKey}|${this.mapQuality}|${!!this.pack?.original?.scenes?.[stage.originalStageId || stage.id]}` : null;
    const cached=this.layoutCache.get(layoutKey);
    if(cached)this.layoutCache.delete(layoutKey);
    this._stashLayout();
    this.stageKey = key;
    this.stage = stage || null;
    this._clear();
    this.activeLayoutKey=layoutKey;
    if (!stage) { this.official = null; this.sceneWater = []; applyWaterMaterial(this.mat.water, null); return; }
    if(cached){
      for(const child of cached.children)this.root.add(child);
      for(const prop of ['meshes','board','staticCrates','lightmapMaterials','lightmapTextures','originalStage','stageLightDir','official','sceneWater'])this[prop]=cached[prop];
      this.key.intensity=cached.keyIntensity;this.key.color.copy(cached.keyColor);this.hemi.intensity=cached.hemiIntensity;
      this._applyActiveWater();
      this._fitShadow(this.board);this._rebuildCrates();
      this.renderer.shadowMap.needsUpdate=true;this.layoutCacheHits++;
      return;
    }
    if (this.mapQuality !== 'low' && this.pack?.original?.loadStage && !this.pack.original.scenes[stage.originalStageId || stage.id]) {
      this.pack.original.loadStage(stage.originalStageId || stage.id).then((scene) => {
        if (scene && !this.destroyed && this.stage?.id === stage.id) {
          this.stageKey = null;
          this.setStage(this.stage);
        }
      });
    }
    yield;
    const worldOffset=stage.previewLayout?.worldOffset || 0;
    const structuralStage=stage.structuralSource || stage;
    const board = buildBoard(stage, { uv: this.pack?.uv || null, area: this.area, platformMesh: !!this.platformGeometry() });
    this.board = board;
    const M = this.meshes = {};
    this.official = !stage.coopEightStage && !stage.previewLayout && official && this._buildScene(official) ? official : null;
    this._applyActiveWater();
    if(this.official){if(board.buckets.raised?.vertexCount)M.raised=this._mesh(board.buckets.raised,this.mat.board);if(board.buckets.raisedDecal?.vertexCount)M.raisedDecal=this._mesh(board.buckets.raisedDecal,this.mat.decal,{cast:false});}
    const borderSurfaces=[], borderSources=[], nativeParts=[];
    const candidate = this.official || this.mapQuality === 'low' ? null : this.pack?.original?.scenes?.[stage.originalStageId || stage.id];
    // Missing/invalid material metadata must retain the working reconstructed board.
    const original = candidate && Object.entries(candidate.buckets).every(([k,g]) => this.originalMaterials[g.material || k]) ? candidate : null;
    this.originalStage = original?.stageId || null;
    // The city bundle's serialized grazing light is a baking setting; its
    // runtime screenshot has short wall shadows and illuminated floor faces.
    // Preserve the azimuth, but match that elevation only for the city theme.
    this.stageLightDir = original?.lighting?.dir || null;
    if (original && (stage.originalStageId||stage.id) === 'act2autochess_m01' && this.stageLightDir) {
      this.stageLightDir = [this.stageLightDir[0], this.stageLightDir[1], 1.05];
    }
    // Retain a restrained sky contribution for the native reflection/probe
    // lighting that is not represented by the exported static lightmaps.
    this.hemi.intensity = LIGHTING.hemi.intensity;
    this.key.intensity = original?.lighting?.intensity != null ? original.lighting.intensity * LIGHTING.nativeDirectGain : LIGHTING.key.intensity;
    if (original?.lighting?.color) this.key.color.setRGB(...original.lighting.color);
    else this.key.color.setHex(LIGHTING.key.color);
    const nativeLightMaterials=new Map();
    if (original) {
      for (const [material, sourceGeometry] of Object.entries(original.buckets)) {
        // Allow background preparation to yield between native material buckets.
        yield;
        const geometry = stage.coopEightStage ? nativeCooperativeGeometry(sourceGeometry) : sourceGeometry;
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
          const materialKey=sourceName+"|"+name;
          if(nativeLightMaterials.has(materialKey))runtimeMaterial=nativeLightMaterials.get(materialKey);
          else {
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
          nativeLightMaterials.set(materialKey,runtimeMaterial);
          }
        }
        const waterSurface = /Dosshore_UI/i.test(sourceName) || !!runtimeMaterial.uniforms?.uDeep;
        // City scenery beside the preview pen is environment, not a second field.
        // Retain it only for normal/cooperative framing; never add platform tiles.
        const scenicArea = stage.id === 'act2autochess_m01' && this.area.some(a=>a.r1 >= 13)
          ? [...this.area, {r0:14,r1:18,c0:0,c1:5}] : this.area;
        const nativeArea = stage.previewLayout ? AREAS.boss : this.area;
        let visibleGeometry;
        if (waterSurface) {
          // A native water plane is continuous background, not a tile or hill.
          // Keep one authored plane; splitting/moving it produces rectangular seams.
          visibleGeometry=geometry;
        } else if (structuralStage.previewLayout && !geometry.platform) {
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
          visibleGeometry=waterSurface ? surfaceForArea(geometry,nativeArea) : geometry.platform ? surfaceForArea(geometry,nativeArea) : sceneryForArea(geometry,scenicArea,{cols:stage.coopEightStage?37:21});
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
        yield;
      }
    } else if (!this.official) {
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
    if (original && !stage.coopEightStage && !['act2autochess_m01','act2autochess_m03'].includes(stage.id) && this.area.some(a=>a.c1>=20)) {
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
        yield;
      }
    }
    yield;
    if (original && !stage.coopEightStage) {
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
    if(original)this._batchNativeMeshes();
    yield;
    this._buildDevices(board);
    yield;
    this._buildGates(board);
    if (!original) this._buildEdges(board);
    yield;
    this._buildTerrain(board);
    if (!this.official) this._buildBackground(board);
    this._fitShadow(board);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Batch only static, opaque native environment with identical render state.
   * Keep water, devices and transparent overlays independent for their sorting/updates. */
  _batchNativeMeshes() {
    const groups=new Map();
    for(const [name,mesh] of Object.entries(this.meshes)) {
      if(!/^(original|cooperative|cooperative-functional|preview|sand-rim|opposite-border):/.test(name) || !mesh || mesh.material.transparent || mesh.material.isShaderMaterial)continue;
      const signature=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,Array.from(mesh.matrix.elements).join(',')].join('|');
      const list=groups.get(signature)||[];list.push(mesh);groups.set(signature,list);
    }
    for(const list of groups.values()) {
      if(list.length<2)continue;
      const first=list[0],attributes=Object.keys(first.geometry.attributes).sort().join(',');
      if(list.some(m=>Object.keys(m.geometry.attributes).sort().join(',')!==attributes))continue;
      const records=list.map(m=>Object.fromEntries([...Object.entries(m.geometry.attributes).map(([k,v])=>[k,v.array]),['index',m.geometry.index.array]]));
      const merged=this._geometry(mergeInto(records));
      first.geometry.dispose();first.geometry=merged;
      for(const mesh of list.slice(1)){this.root.remove(mesh);mesh.geometry.dispose();for(const key of Object.keys(this.meshes))if(this.meshes[key]===mesh)this.meshes[key]=first;}
    }
  }

  _applyActiveWater() {
    const pack = this.official;
    applyWaterMaterial(this.mat.water, sceneWaterInfo(pack?.doc), pack ? {
      env: this._sceneResources(pack).env, envRange: pack.doc?.env?.range, envMips: pack.doc?.env?.mips,
    } : {});
  }

  nativeDevice(d) {
    return d.kind === 'platform' && this.pack?.original?.platform && this.originalMaterials.MT_trap_1106_achplat
      ? {geometry:this.pack.original.platform,material:this.originalMaterials.MT_trap_1106_achplat} : null;
  }

  /** Use (or drop, with null) the official scene of stage `id`; rebuilds when that stage is the current one. */
  setScenePack(id, pack) {
    if (this.destroyed || typeof id !== 'string' || !id) return false;
    const prev = this.scenePacks.get(id) || null;
    if (prev === (pack || null)) return false;
    if (prev) this._disposeScene(prev);
    if (pack) this.scenePacks.set(id, pack); else this.scenePacks.delete(id);
    if (this.stage && this.stage.id === id) { this.stageKey = null; this.setStage(this.stage); }
    return true;
  }

  /** Textures and materials of a scene pack (created once per pack, kept across rebuilds). */
  _sceneResources(pack) {
    let res = this.sceneRes.get(pack.key);
    if (res) return res;
    const T = this.THREE;
    const aniso = Math.min(8, this.renderer.capabilities?.getMaxAnisotropy?.() || 1);
    const tex = {}, data = {}, lm = [];
    for (const [name, img] of Object.entries(pack.images?.tex || {})) tex[name] = makeTexture(T, img, { aniso, repeat: true });
    for (const [name, img] of Object.entries(pack.images?.data || {})) data[name] = makeTexture(T, img, { srgb: false, aniso, repeat: true });
    for (const img of pack.images?.lm || []) lm.push(img ? makeTexture(T, img, { srgb: false }) : null);
    res = { tex, data, lm, env: sceneEnvTexture(T, pack.images?.env, pack.doc?.env), mats: new Map() };
    this.sceneRes.set(pack.key, res);
    return res;
  }

  _disposeScene(pack) {
    const res = this.sceneRes.get(pack.key);
    if (!res) return;
    for (const m of res.mats.values()) m.dispose();
    for (const t of [...Object.values(res.tex), ...Object.values(res.data), ...res.lm, res.env]) t?.dispose?.();
    this.sceneRes.delete(pack.key);
  }

  /**
   * The official scene's meshes: the base plus the fields of the built areas, one mesh per material and lightmap
   * page (`mergeSceneChunks`). A switched-off HIDDEN part is left out before the merge.
   */
  _buildScene(pack) {
    const T = this.THREE;
    const res = this._sceneResources(pack);
    const infos = pack.doc?.materials || {};
    this.sceneWater = [];
    const buckets = new Map();
    for (const c of pack.chunks || []) {
      if (c.group && !sceneGroupVisible(pack.groups?.[c.group], this.area)) continue;
      const info = infos[c.material] || null;
      const mk = sceneMaterialKey(c, info);
      let bucket = buckets.get(mk);
      if (!bucket) { bucket = { info, chunks: [] }; buckets.set(mk, bucket); }
      bucket.chunks.push(c);
    }
    let n = 0;
    for (const [mk, bucket] of buckets) {
      const c = mergeSceneChunks(bucket.chunks);
      const info = bucket.info;
      const surface = isSceneWater(info, c.material);
      const water = surface || info?.kind === 'water';
      let mat = res.mats.get(mk);
      if (!mat) {
        mat = surface
          ? sceneWaterMaterial(T, this.tex, this.focus, info)
          : water ? sceneWaterDecalMaterial(T, this.tex, this.focus, info)
          : sceneMaterial(T, {
            map: res.tex[info?.map] || null, lightMap: c.lightmap >= 0 ? (res.lm[c.lightmap] || null) : null, info,
            light: pack.doc?.light || null, lightRange: pack.doc?.lightRange, lightEncoding: pack.doc?.lightEncoding,
            normalMap: res.data[info?.normalMap] || null, glossMap: res.data[info?.glossMap] || null,
            // sRGB. sceneMaterial samples it only when _EMISSION is on, so a map without the keyword stays unlit.
            emissionMap: res.tex[info?.emissionMap] || null,
            env: res.env, envRange: pack.doc?.env?.range,
          }, this.focus);
        res.mats.set(mk, mat);
      }
      if (water) this.sceneWater.push(mat);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(c.position, 3));
      g.setAttribute('normal', new T.BufferAttribute(c.normal, 4, true));
      g.setAttribute('uv', new T.BufferAttribute(c.uv, 2));
      g.setAttribute('aLm', new T.BufferAttribute(c.uv1, 2));
      g.setAttribute('aColor', new T.BufferAttribute(c.color, 4, true));
      g.setIndex(new T.BufferAttribute(c.index, 1));
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.renderOrder = water ? 1 : mat.userData.blend === 'blend' ? 2 : mat.userData.blend === 'cutout' ? -3 : -4;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.root.add(mesh);
      this.meshes[`scene${n++}`] = mesh;
    }
    return n > 0;
  }

  _buildDevices(board) {
    const crates = [], blowers = [], platforms = [];
    this.staticCrates = [];
    const wind = this.pack?.meshes?.blower ? objToBoard(this.pack.meshes.blower, 1) : null;
    const nativePlatforms=[];
    const plat = this.platformGeometry();
    for (const mat of [this.mat.platform, this.mat.crate]) if (mat) {
      // lit by the official scene's own key light when one is drawn, else by the procedural board's
      const dir = this.official?.doc?.light?.dir;
      mat.uniforms.uLightDir.value.set(...(Array.isArray(dir) && dir.length === 3 ? dir : LIGHTING.key.dir)).normalize();
    }
    for (const d of board.devices) {
      const native=this.nativeDevice(d);
      if(native){
        const height=native.geometry.bounds?.z1 || .26;
        nativePlatforms.push(placeMesh(native.geometry,{x:d.c,y:d.r,z:d.z0,sz:.26/height,rot:DIR_TURNS[d.dir]??0}));
        continue;
      }
      if (d.kind === 'crate') this.staticCrates.push(d);
      else if (d.kind === 'platform' && plat) platforms.push(placeMesh(plat, { x: d.c, y: d.r, z: d.z0 }));
      else if (d.kind === 'blower' && wind && this.mat.wind) blowers.push(placeMesh(wind, { x: d.c, y: d.r, z: d.z0 + 0.078, rot: DIR_TURNS[d.dir] ?? 0 }));
      else if (d.kind === 'blower' || d.kind === 'turret') crates.push(placeMesh(boxWithTop(this.pack?.uv, d.kind), { x: d.c, y: d.r, z: d.z0 }));
      else if (d.kind === 'mound') crates.push(placeMesh(this.boxGeometry(), { x: d.c, y: d.r, z: d.z0, s: 0.95, sz: 0.55 }));
      else if (d.kind === 'bush') crates.push(placeMesh(bushData(), { x: d.c, y: d.r, z: d.z0 }));
    }
    if(nativePlatforms.length)this.meshes.platforms=this._mesh(mergeInto(nativePlatforms),this.originalMaterials.MT_trap_1106_achplat);
    if (blowers.length) this.meshes.blowers = this._mesh(mergeInto(blowers), this.mat.wind, { receive: false });
    if (crates.length) this.meshes.props = this._mesh(mergeInto(crates), this.mat.board);
    if (platforms.length) this.meshes.platforms = this._mesh(mergeInto(platforms), this.mat.platform);
    this._rebuildCrates();
  }

  _rebuildCrates() {
    if (this.meshes.crates) { this.root.remove(this.meshes.crates); this.meshes.crates.geometry.dispose(); this.meshes.crates = null; }
    const R = this.battleRect;
    const inside = (d) => !!R && d.r >= R.r0 && d.r <= R.r1 && d.c >= R.c0 && d.c <= R.c1;
    const list = (this.staticCrates || []).filter((d) => !inside(d)).map((d) => placeMesh(this.crateGeometry(), { x: d.c, y: d.r, z: d.z0 }));
    if (list.length) this.meshes.crates = this._mesh(mergeInto(list), this.originalMaterials.MT_trap_1105_accrate || (this.clientCrateGeometry() ? this.mat.crate : this.mat.board));
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

  _nativeTileHeight(board,r,c){
    let top=null;
    const T=this.THREE,ray=new T.Ray(new T.Vector3(c,r,100),new T.Vector3(0,0,-1));
    const a=new T.Vector3(),b=new T.Vector3(),d=new T.Vector3(),hit=new T.Vector3();
    for(const [key,mesh] of Object.entries(this.meshes)){
      if(!/^(original:|cooperative-functional:|preview:|sand-rim:|scene\d+$)/.test(key) || !mesh?.geometry?.index || (mesh.material?.isShaderMaterial && !/^scene\d+$/.test(key)))continue;
      const pos=mesh.geometry.attributes.position,indices=mesh.geometry.index;
      mesh.updateMatrix();
      for(let i=0;i<indices.count;i+=3){
        a.fromBufferAttribute(pos,indices.getX(i)).applyMatrix4(mesh.matrix);
        b.fromBufferAttribute(pos,indices.getX(i+1)).applyMatrix4(mesh.matrix);
        d.fromBufferAttribute(pos,indices.getX(i+2)).applyMatrix4(mesh.matrix);
        if(c<Math.min(a.x,b.x,d.x)||c>Math.max(a.x,b.x,d.x)||r<Math.min(a.y,b.y,d.y)||r>Math.max(a.y,b.y,d.y))continue;
        if(ray.intersectTriangle(a,b,d,false,hit) && (top==null || hit.z>top))top=hit.z;
      }
    }
    return top??heightOf(board.grid || this.board?.grid || [],r,c);
  }

  _buildTerrain(board) {
    const quads = (tiles, z, inset = 0) => {
      const pos = [], uv = [], idx = [];
      for (const [r, c] of tiles) {
        const a = 0.5 - inset, b = pos.length / 3, h=typeof z==='function'?z(r,c):z;
        pos.push(c - a, r - a, h, c + a, r - a, h, c + a, r + a, h, c - a, r + a, h);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
      return { position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) };
    };
    const infectionHeights=new Map();
    if((this.originalStage || this.official))for(const [r,c]of board.terrain.infection)infectionHeights.set(`${r},${c}`,this._nativeTileHeight(board,r,c));
    if ((this.originalStage || this.official) && board.terrain.infection.length) this.meshes.infectionGlow = this._mesh(quads(board.terrain.infection, (r,c)=>infectionHeights.get(`${r},${c}`)+.025, 0.025), this.mat.infectionGlow, {cast:false,receive:false,order:3});
    if((this.originalStage || this.official) && board.terrain.infection.length){
      const position=[],uv=[],index=[];
      // Four upright curtains follow the tile outline; no crossed billboards
      // through the middle of the tile (which obscure the original artwork).
      for(const [r,c] of board.terrain.infection)for(const [ax,ay,bx,by] of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]]){
        const b=position.length/3,w=.475,z=infectionHeights.get(`${r},${c}`)+.03,h=.60;
        position.push(c+ax*w,r+ay*w,z,c+bx*w,r+by*w,z,c+bx*w,r+by*w,z+h,c+ax*w,r+ay*w,z+h);
        uv.push(0,0,1,0,1,1,0,1);index.push(b,b+1,b+2,b,b+2,b+3);
      }
      this.meshes.infectionRise=this._mesh({position:new Float32Array(position),normal:new Float32Array(position.length),uv:new Float32Array(uv),index:new Uint16Array(index)},this.mat.infectionRise,{cast:false,receive:false,order:4});
    }
    // Native stage meshes already contain these environmental tile surfaces.
    if ((this.originalStage || this.official)) return;
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
    const cx = ((board.grid?.[0]?.length ?? COLS) - 1) / 2, cy = ((board.grid?.length ?? ROWS) - 1) / 2;
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
    const b = (board && board.bounds) || {};
    // [ASSUMED] an empty or non-finite board box (no tiles yet) centres the shadow camera at the origin
    // with a 30-tile span. A finite box keeps the previous centre and span.
    const finite = [b.x0, b.x1, b.y0, b.y1].every((v) => Number.isFinite(v));
    const cx = finite ? (b.x0 + b.x1) / 2 : 0;
    const cy = finite ? (b.y0 + b.y1) / 2 : 0;
    const span = finite ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 30;
    const d = this.stageLightDir || LIGHTING.key.dir;
    const len = Math.hypot(d[0], d[1], d[2]);
    const dist = 30;
    k.position.set(cx + (d[0] / len) * dist, cy + (d[1] / len) * dist, (d[2] / len) * dist);
    k.target.position.set(cx, cy, 0);
    k.target.updateMatrixWorld();
    const cam = k.shadow.camera;
    // light-space box covering the island and its shadow on the background plane
    const half = span / 2 + 9;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = dist + 30;
    cam.updateProjectionMatrix();
    k.updateMatrixWorld();
  }

  // ---- dynamic devices (battle) ------------------------------------------------------------------------------

  /** A crate / device box driven by render/units.js DeviceView (see header). */
  createDevice(spec = { top: 'crateTop' }) {
    const T = this.THREE;
    const self = this;
    const originalCrate = spec.top === 'crateTop' && this.originalMaterials.MT_trap_1105_accrate && this.pack?.original?.crate;
    const clientGeometry = !originalCrate && spec.top === 'crateTop' ? this.clientCrateGeometry() : null;
    const geom = this._geometry({ ...(originalCrate || clientGeometry || this.boxGeometry()), color: null });
    const sourceMaterial = originalCrate ? this.originalMaterials.MT_trap_1105_accrate : clientGeometry ? this.mat.crate : this.mat.board;
    const mat = sourceMaterial.clone();
    mat.transparent = true;
    mat.vertexColors = false;
    // Custom original geometry stays first; the new client-mesh fallback keeps
    // live focus/light uniforms while each fading device owns its opacity.
    const clientCrate = sourceMaterial === this.mat.crate;
    if (clientCrate) Object.assign(mat.uniforms, this.focus, { uMap: sourceMaterial.uniforms.uMap, uLightDir: sourceMaterial.uniforms.uLightDir });
    else mat.onBeforeCompile = sourceMaterial.onBeforeCompile;
    const mesh = new T.Mesh(geom, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.dynamic.add(mesh);
    geom.computeBoundingBox();
    const { min, max } = geom.boundingBox;
    const baseSize = Math.max(0.01, max.x - min.x), baseH = Math.max(0.01, clientCrate ? max.z : max.z - min.z);
    let dead = false;
    const h = {
      mesh: null,
      board: this,
      get destroyed() { return dead; },
      update(cam, b) {
        if (!b || dead) return;
        mesh.visible = (b.alpha ?? 1) > 0.01;
        mesh.position.set(b.x, b.y, b.z);
        const s = b.nativeScale ?? (b.size || baseSize) / baseSize;
        mesh.scale.set(s, s, Math.max(0.001, b.nativeScale ?? (b.height ?? baseH) / baseH));
        mat.opacity = Math.max(0, Math.min(1, b.alpha ?? 1));
        if (clientCrate) mat.uniforms.uOpacity.value = mat.opacity;
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
    // gate pulses (the official clip's _TintColor.a curves), objective leak flashes
    if (this.mat.gateStartAdd) this.mat.gateStartAdd.uniforms.uAlpha.value = gatePulse(t, GATE_TINT.start.alpha);
    if (this.mat.gateEndAdd) this.mat.gateEndAdd.uniforms.uAlpha.value = gatePulse(t, GATE_TINT.end.alpha);
    if (this.mat.gateEndAb) this.mat.gateEndAb.uniforms.uAlpha.value = gatePulse(t, GATE_TINT.endAb.alpha);
    let flash = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > 1.2) this.flashes.splice(i, 1); else flash = Math.max(flash, 1 - f.t / 1.2); }
    for (const m of [this.mat.gateEndAdd, this.mat.gateEndAb]) if (m) m.uniforms.uFlash.value.setRGB(flash, flash * 0.12, flash * 0.1);
    for (const k of ['water', 'mire', 'infection', 'infectionGlow', 'infectionRise', 'smog']) this.mat[k].uniforms.uTime.value = t;
    for (const m of Object.values(this.originalMaterials)) if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
    for (const k of ['water', 'mire', 'infection', 'smog']) this.mat[k].uniforms.uTime.value = t;
    if (this.official) for (const m of this.sceneWater || []) m.uniforms.uTime.value = t;
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
    this.warmGeneration=(this.warmGeneration||0)+1;
    for (const d of [...this.devices]) d.destroy();
    this._clear();
    for(const layout of this.layoutCache.values())this._disposeLayout(layout);
    this.layoutCache.clear();
    for (const p of [...this.scenePacks.values()]) this._disposeScene(p);
    this.scenePacks.clear();
    this.mat.edge?.map?.dispose?.(); // canvas dash texture (not in this.tex)
    for (const m of Object.values(this.mat)) m?.dispose?.();
    for (const t of Object.values(this.tex)) t?.dispose?.();
    for (const m of Object.values(this.originalMaterials)) m?.dispose?.();
    for (const t of Object.values(this.originalTextures)) t?.dispose?.();
    // PMREM's render target owns the environment texture. Disposing the texture alone leaks the framebuffer.
    // app.js rebuilds 3D by destroy() then a new BoardScene. [ASSUMED] the target's dispose frees the texture too.
    if (this.envRT) {
      try { this.envRT.dispose(); } catch { /* ignore */ }
    } else {
      this.envMap?.dispose?.();
    }
    this.envRT = null;
    this.envMap = null;
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
