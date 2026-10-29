import {MoteRing} from './motes.js';
import {skillAttackMode} from './skillAttack.js';
import {MANIFOLD,isManifold,manifoldCopyForm,manifoldAttackForm} from './manifold.js';
const loop=(name)=>({begin:null,loop:name,end:null});
import { rangeTileInside, clipRangeSegment } from './rangeClip.js';

import { unlimitedSkillRange } from '../../../shared/skillRangeDisplay.js';
// render/units.js — per-unit views for battle units and prep pieces (DESIGN §9).
//
// UnitView = shadow sprite (shadow layer) + body container (depth-sorted unit layer: elite aura, Spine actor or
// the avatar-in-rarity-diamond fallback) + HUD container (bar layer: HP bar with delayed "ghost" damage, SP bar
// with ready glow / draining skill bar — an ammo skill's segmented magazine, with its count under it when 设置「弹药数量」
// is on (PR #552) —, tier chip, status icons, blocked marker). The fallback shows at once and
// cross-fades to the Spine model when it has loaded (the game never blocks on Spine); an optional local-client model
// (assets.js spineEntry `fallback`, DESIGN §13: 灼热源石虫 / 炽焰源石虫) falls back to the web model first; that web alias
// (the plain 源石虫) is drawn tinted toward the slug's own colours (ALIAS_TINT). A model that failed or timed out is
// loaded again after SPINE_RETRY_MS (bounded), and `retryAssets()` re-resolves a view's picture and model when the
// asset manifest arrives after the view was built or the tab is shown again (render/app.js; public issue #8 item 5:
// after a reload whose manifest was slow or failed, every operator stayed the image-less placeholder for good) — and
// whenever the manifest changes under a view that is already drawn (a room's cosmetic plugins arriving after the board
// was built — a reconnect, a spectator joining a match —, a personal plugin switched during a match, a plugin file that
// failed and fell back: DESIGN §32 P1a): a picture or model other than the one the manifest names now is loaded again
// (the new model replaces the old in place, like a Front ⇄ Back swap); a load begun while the tab was hidden and still
// in flight SPINE_STUCK_MS after it is shown again is started again (assets.js spine.restart: GitHub #68, such a load
// may never settle — its view stayed the placeholder). Every bar is a tinted Texture.WHITE sprite, so HUDs batch into
// few draw calls.
//
// Placement: feet anchored at world (x, y, z); scale = camera px-per-tile at the feet × UNIT.modelScale, so
// chibis shrink with distance like the original. An enemy's model is also scaled by its official prefab factor
// (enemies.json `modelScale`, user playtest #6 item 9: the official battle prefab shrinks e.g. 威龙 to 0.16 / 0.27 of
// the standard size — tools/build-data.mjs MODEL_SCALES; `enemyModelScale`). Operators and summons face their deploy direction `dir`
// (research 09 §1.2, DESIGN §3: UP|RIGHT|DOWN|LEFT, chosen with the direction wheel; UnitInfo / piece `dir`, else
// the legacy `facing` ±1): the Back model for UP (when one exists, research 07 §5.5), the Front model for RIGHT and
// DOWN, mirrored for LEFT; the orange ground wedge "›" of prep board pieces points along `dir` (rotated on the ground
// plane). `setDir(dir)` re-orients a live view (swapping Front ⇄ Back without a fallback flash). Enemies flip by the
// sign of their horizontal velocity (with hysteresis). A dead or knocked-out operator facing UP falls and lies with its
// Front model — 131 of the 135 Back skeletons have no Die clip (GitHub issue #25: the Back model went on with its
// attack loop under the redeploy ring) — and stands up again with the Back model (`_wantsBack`, `_syncModel`).
//
// Knocked-out operators (user playtest #4 item 9, b.snap `down`): `setDown([id, respawnAt, respawnTime, state, row,
// col])` keeps a dead operator on the tile it lies on (row / col: where it fell, or its home — sim Battle._layBody,
// player report F5 after 0.1.0) in its knocked-down pose — the Spine Die clip played once and held on its last
// frame (the collapsed / kneeling pose with closed eyes; the Front model's for one facing UP unless its Back skeleton has its own Die clip, see above), slightly
// greyed — with a redeploy ring above its head:
// a dark disc, a mint arc filling as the respawn timer runs and the seconds left; once the timer is done and it still
// waits, a full amber ring with "DP" (not enough DP) or a red ring with "!" (its tile is taken). `onDeploy` (the
// redeploy) plays the deploy clip and restores the normal look; `setDown(null)` on a dead view lets it fade out.
// An operator that enters a battle already knocked out (联防, user playtest #5 item 2: sim 'die' reason 'forcedExit')
// goes down with `die(true)`: straight to the held end of the clip, no fall.
// Prep landings (PR #416 by @Cromemadnd): `land()` plays a prep piece's deploy clip (Start) again with its landing sound
// — the round start's replay of the own board (render/app.js replayDeploys), a purchase, a move onto or across the board.
// One landing, one sound: a piece whose Start still plays (on its model, owed to a model still loading, or cued less than
// a clip ago) keeps it and sounds nothing more, and only an idle prep piece is ever pulled into it — never a battle unit
// or one in an attack, skill, death or form clip. The sound is `ctx.audio.deployCue` (public/js/audio.js: the unit's own
// battle deploy sound through the SFX volume and mute, in landing voices of its own that hand the oldest one's voice to
// the newest instead of dropping it); `onDeploy` itself — the sim's 'deploy' events — stays silent:
// audio.handleBattleEvents sounds those.
// Enemy modes (the `form` of a sim fx — shared/protocol.js fxForm — → `setForm(form, fx)`): 掠海漂移体 dropping to 爬行模式
// (user playtest #5 item 1) plays its skeleton's 'Change' clip once, then the crawl set (*_02); 暴鸰 flies on without its
// bomb (*_2) after the drop (feedback D4); 转译基底's forms, the 逐火 embers, 再生's puppet, the leaders' 重生 and 守墓石像
// likewise (user report after 0.1.0) — FORMS; an operator's form is a 傀儡师's 替身 (GitHub issue #44). A view built later
// (`info.form` = UnitInfo `form`, the sim's current form, through render/app.js renderInfo) starts in the mode; a dead
// view keeps the form it died in (`_dieForm`) for a model built while it lies down.
// Element gauges (b.snap `elem` → sample `el` / `elFill` / `elUntil` / `elDur`), the official form (PRTS 元素: "模型
// 下部会显示对应的元素图标，并以白条显示剩余的元素值"; enemies "小尺寸图标（不显示元素图标，仅根据元素种类改变背景色）"): a row
// right under the unit's own HP / SP bars and inside their span — the element's disc at the left (operators with its
// glyph, enemies smaller and plain) and a white bar of the remaining 元素值 (1 − fill) that runs out right to left
// like the HP bar above it; during a 爆发冷却 the bar refills over the cooldown (PRTS: "元素条显示缓慢恢复至上限"), drawn in
// the element's colour with the disc pulsing [ASSUMED look], so a refill never reads as 元素值 still left while the
// burst's stun / damage / 凋亡 ticks hit the unit. User playtest #6 (report 11): the v2.3 ring right of the bars sat on
// the next operator's tier chip and bars (drawn under them) and read as that operator's gauge, a shrinking ring reads
// like a filling progress ring, and its refill was the same white as the 元素值 left. The disc comes from the hudRings
// atlas, the bars are tinted Texture.WHITE sprites; built on first use and hidden when idle.
//
// ItemView renders hand items as a floating icon plate; DeviceView renders battle devices (crates) as 3D boxes
// with an HP bar once damaged.
//
// Cost control (low-end devices): a unit whose body is outside the viewport (`ctx.viewport()`, with a margin) is not
// animated or drawn at all (its clock catches up, ≤ 0.5 s, when it comes back); `opts.lod: 'idle'` (the enemy preview
// pen: idle loops only) uses native frame cadence and direct rendering to preserve complete attachments; under the view's adaptive load level
// (`ctx.loadLevel()` 1–3, app.js) small / far units (< ~56 px per tile) animate every 2nd frame, and from level 2 on
// every unit does. An impostor's slot is sized from every clip the unit can play (`impostorBox`, GitHub #542: a slot sized
// from the first pose drawn cut 野鬃's idle flag and 浊心斯卡蒂's S3 flight, and what crossed its edge was left in the
// neighbouring slots); its skeleton's clips are measured once, a few frames after the model loads (spine.js clipBounds) —
// until then the unit is drawn directly —, and a clip too large for the box is drawn directly while it plays.
//
// Picking is by tile (render/pick.js, user playtest #4 item 1): views carry no hit shapes; `bounds()` is the drawn body's
// screen rect for tooltips and overlays (view.pieceScreenRect). A dragged (lifted) item plate is drawn centred on its
// ground point, i.e. on the pointer (render/app.js).


import { FORMS } from '../../../shared/animationForms.js';
import { skillVisualTheme } from './skillVisualTheme.js';
import { UF, ANIM } from '../../../shared/constants.js';
import { SpineActor } from './spine.js';
import { diamondTexture, shadowTexture, fxAtlas, tierChip, statusTexture, itemTexture, hudRings, ringArc, HUD_DISC, ELEMENT_RING, stealthMistTexture, downLabel } from './textures.js';
import { COLORS, TIER_COLORS, ENEMY_FRAME, UNIT, PROJ, statusIconKey, statusIconSuppressed } from './style.js';
import { drawCrate, rowDepthKey, ROW_KEY, deviceBoxOf, DEVICE_BOX } from './tiles.js';

// Art-directed operator colours, shared by skins; unknown operators use a
// neutral white until a representative colour is supplied, never a random hue.
const RANGE_PALETTE = {
  mlynar:0xf1c64f, svrash:0xb9def5, mostma:0x779bf0, mint:0x8fcec0,
  lisa:0xf1dd9c, angel:0xed795e, aglina:0xe99c6a, demkni:0xebc586,
  shining:0xcdd9ed, cgbird:0xaecbe7, indigo:0x9595e3, silent:0x92d2b3,
  skadi2:0xe78596, sora:0xf0ce79, heidi:0xbaca85, reed2:0xf09257,
  sntlla:0xaccce4, helage:0xdec9a7, glassb:0xdbc189, let:0xe67e75,
  roser:0xd79aab, istina:0xbfc088, botany:0x9ac485, botani:0x9ac485, absin:0x9bcbb5,
  texalt:0x9aa7e1, tex:0x9aa7e1, degen:0xdbbc72, surtr:0xee7166,
  eyjafj:0xe59f91, ami:0x7bbfea, lin:0xcf9fe4, carnel:0xe69173,
  beewax:0xeac47b, beeswx:0xeac47b, dusk:0x8abca8, rosmon:0x99bbd5, slbell:0xa59bd4,
  haini:0xe9c292, rmixer:0xc69bdf, wisdel:0xed8178, ascal:0xb296d0,
};
const ART_RANGE_COLORS = new Map();
const RANGE_COLOR_LOADING = new Set();
export function representativeArtColor(image) {
  try {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,24,24);
    const pixels=ctx.getImageData(0,0,24,24).data,buckets=new Map();
    for(let i=0;i<pixels.length;i+=4){
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);
      if(pixels[i+3]<128 || hi<60 || hi>245 || hi-lo<30)continue;
      const key=(r>>5)*64+(g>>5)*8+(b>>5),v=buckets.get(key)||{weight:0,r:0,g:0,b:0};
      const weight=(hi-lo)/255;v.weight+=weight;v.r+=r*weight;v.g+=g*weight;v.b+=b*weight;buckets.set(key,v);
    }
    const chosen=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];
    if(!chosen)return null;
    const channel=n=>Math.round(n/chosen.weight*.8+45);
    return (channel(chosen.r)<<16)|(channel(chosen.g)<<8)|channel(chosen.b);
  }catch{return null;}
}
export function loadRangeArtColor(info,assets) {
  const id=info.charId;if(!id || ART_RANGE_COLORS.has(id)||RANGE_COLOR_LOADING.has(id))return;
  const url=assets?.picture?.(id);if(!url || !assets.image)return;
  RANGE_COLOR_LOADING.add(id);
  Promise.resolve(assets.image(url)).then(image=>{const color=representativeArtColor(image);ART_RANGE_COLORS.set(id,color ?? 0xc7d4d9);}).catch(()=>ART_RANGE_COLORS.set(id,0xc7d4d9)).finally(()=>RANGE_COLOR_LOADING.delete(id));
}
export function skillRangeStyle(info) {
  const id = String(info.charId || info.defId || info.spine || '').replace(/^skin_/, '');
  const match = Object.entries(RANGE_PALETTE).find(([name]) => new RegExp(`_${name}(?:_|$)`).test(id));
  const theme=skillVisualTheme(info,match?.[1] ?? ART_RANGE_COLORS.get(info.charId) ?? 0xc7d4d9);
  const color=theme.color;
  const rgb=[color>>16&255,color>>8&255,color&255],high=Math.max(...rgb),low=Math.min(...rgb);
  const saturation=high>0?(high-low)/high:0;
  // Strengthen only bright, washed-out outlines. Preserve hue, brightness and fill.
  const pastel=high>=180 && saturation<.45;
  const vivid=pastel && saturation>0 ? rgb.map(c=>Math.round(high-(high-c)*(.60/saturation))) : rgb;
  const outlineColor=(vivid[0]<<16)|(vivid[1]<<8)|vivid[2];
  return {color,outlineColor,inset:.065,fillAlpha:theme.fillAlpha,glowAlpha:0,pulse:0,accent:theme.accent,source:theme.source};
}
// Offset each clockwise union edge towards its interior. The stroke never
// straddles the boundary; all operators share the same boundary inset.
export function skillRangeInset([x0,y0,x1,y1], inset) {
  const len=Math.hypot(x1-x0,y1-y0);if(!len)return [x0,y0,x1,y1];
  const dx=-(y1-y0)/len*inset,dy=(x1-x0)/len*inset;
  return [x0+dx,y0+dy,x1+dx,y1+dy];
}

/** Union boundary of skill tiles: shared tile edges never become outlines. */
export function skillRangeEdges(tiles, inset=0) {
  const key = (r,c) => `${Math.round(r*1e6)},${Math.round(c*1e6)}`;
  const occupied = new Set(tiles.map(([r,c]) => key(r,c)));
  const edges = new Map();
  for (const [r,c] of tiles) {
    const out=[];
    for (const [nr,nc,x0,y0,x1,y1] of [
      [r-1,c,-.5,-.5,.5,-.5], [r,c+1,.5,-.5,.5,.5],
      [r+1,c,.5,.5,-.5,.5], [r,c-1,-.5,.5,-.5,-.5],
    ]) if (!occupied.has(key(nr,nc))) out.push([x0,y0,x1,y1]);
    edges.set(`${r},${c}`,out);
  }
  if(inset>0){
    const records=[];const starts=new Map(),ends=new Map();
    for(const [r,c] of tiles)for(const edge of edges.get(`${r},${c}`)){
      const [x0,y0,x1,y1]=edge,len=Math.hypot(x1-x0,y1-y0);
      const rec={r,c,edge,nx:-(y1-y0)/len,ny:(x1-x0)/len};records.push(rec);
      for(const [map,x,y]of [[starts,c+x0,r+y0],[ends,c+x1,r+y1]]){const k=key(y,x);if(!map.has(k))map.set(k,[]);map.get(k).push(rec);}
    }
    const joint=(rec,list,x,y)=>{
      const other=list?.find(v=>v!==rec&&v.r===rec.r&&v.c===rec.c)||list?.find(v=>v!==rec);
      if(!other)return [x+rec.nx*inset,y+rec.ny*inset];
      const denominator=1+rec.nx*other.nx+rec.ny*other.ny;
      if(denominator<.01)return [x+rec.nx*inset,y+rec.ny*inset];
      return [x+(rec.nx+other.nx)*inset/denominator,y+(rec.ny+other.ny)*inset/denominator];
    };
    for(const rec of records){const [x0,y0,x1,y1]=rec.edge;
      const a=joint(rec,ends.get(key(rec.r+y0,rec.c+x0)),x0,y0);
      const b=joint(rec,starts.get(key(rec.r+y1,rec.c+x1)),x1,y1);
      rec.edge.splice(0,4,...a,...b);
    }
  }
  return edges;
}

/** Fixed world-space dash lengths keep the border steady while the camera moves. */
export function skillRangeDashes([x0,y0,x1,y1], closeCorner=false, offset=0) {
  const length=Math.hypot(x1-x0,y1-y0),segments=[];
  if(!length)return segments;
  const phase=((offset%(1/3))+(1/3))%(1/3);
  for(let distance=-phase;distance<length;distance+=1/3){
    if(distance+.22<=0)continue;
    const a=Math.max(0,distance)/length,b=Math.min(length,distance+.22)/length;
    segments.push([x0+(x1-x0)*a,y0+(y1-y0)*a,x0+(x1-x0)*b,y0+(y1-y0)*b]);
  }
  if(closeCorner && segments.length){
    const last=segments.at(-1),gap=Math.hypot(x1-last[2],y1-last[3]);
    if(gap<=.09){last[2]=x1;last[3]=y1;}
    else{const t=Math.max(0,1-.08/length);segments.push([x0+(x1-x0)*t,y0+(y1-y0)*t,x1,y1]);}
  }
  return segments;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
/** Deploy direction of an ally from a UnitInfo / piece: `dir` (any case), else the legacy `facing` sign. */
export function unitDir(info) {
  const d = typeof info?.dir === 'string' ? info.dir.toUpperCase() : null;
  if (d && DIRS.includes(d)) return d;
  return info?.facing === -1 ? 'LEFT' : 'RIGHT';
}
/**
 * Official size factor of an enemy's model (enemies.json `modelScale`: its battle prefab's scale / the standard 0.27;
 * 1 when absent or unusable) — applied on top of UNIT.modelScale to the skeleton and to the head (bar) height.
 */
export function enemyModelScale(rec) {
  const k = Number(rec && rec.modelScale);
  return Number.isFinite(k) && k > 0.05 && k < 20 ? k : 1;
}
/**
 * Seconds of the death clip of a manifest Spine entry (`anims.die`, else a 'Die' clip, as SpineActor.dieClip; its
 * `animations` duration), 0 when it has none — 131 of the 135 operator Back models (GitHub issue #25).
 */
export function dieClipDur(entry) {
  const durs = entry && entry.animations && typeof entry.animations === 'object' ? entry.animations : null;
  if (!durs) return 0;
  const name = (entry.anims && typeof entry.anims.die === 'string' && entry.anims.die) || 'Die';
  const d = Object.hasOwn(durs, name) ? Number(durs[name]) : NaN;
  return Number.isFinite(d) && d > 0 ? d : 0;
}
/**
 * render/app.js syncBattle's step for one view and its interpolated sample `s` at render time `t`: a living view (or a
 * device) takes the whole sample; a dying one only the position — its DIE window in the snapshots; one shown alive
 * again (redeployed without an event) stands up first.
 */
export function syncView(v, s, t) {
  if (v.alive || v.info?.kind === 'device') v.sync(s, t);
  else if (v.dying > 0) { if (typeof v.followSample === 'function') v.followSample(s, t); else { v.x = s.x; v.y = s.y; } }
  else if (s.anim !== ANIM.DIE && s.hp > 0) { v.revive?.(); v.sync(s, t); }
}
/** World step (x = col, y = row) of a direction. */
export const DIR_STEP = Object.freeze({ UP: [0, 1], RIGHT: [1, 0], DOWN: [0, -1], LEFT: [-1, 0] });
const nowMs = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
/** Units with no art in the game data drawn as an ice diamond: 圣聆初雪 S2's frozen protection point (保护目标（冻结状态）, PRTS
 *  无头像; data/assets.json has no avatar or model for it, so the token fallback showed 圣聆初雪's own face) — the marker of a
 *  frozen gate. */
const ICE_TOKENS = new Set(['token_10058_sbell2_icetgt']);
/** A token with no model and no avatar in the manifest (the official client gives it an EmptyAnimator, its visuals are
 *  its effects: 乌尔比安's 方向, 塑心's 迷狂牢笼, 贝洛内's 牵绊, 予愿安洁莉娜's “一会儿见！”) draws no fallback diamond either.
 *  ICE_TOKENS keep their deliberate ice diamond. */
const isBodylessToken = (id) => typeof id === 'string' && id.startsWith('token_') && !ICE_TOKENS.has(id);
/**
 * Units that never show an HP bar: 琳琅诗怀雅's 香槟炸弹 — PRTS 香槟炸弹 备注 "即使自身生命值未满，模型下方也不会显示生命值槽"
 * (the owner's report of 2026-10-08, 「香槟会掉血，会被治疗」: the bar showed every change). Only the bar: its HP, the
 * damage it takes (活性源石 hurts what stands on it) and healing are unchanged — no source makes it invulnerable.
 */
const NO_HP_BAR = new Set(['token_10031_swire2_gdtrap']);
const ICE_FRAME = 0x9fe6ff;
/** How long a view waits for its avatar before showing the image-less placeholder diamond. */
const PIC_WAIT_MS = 400;
/**
 * Waits (ms, real time) before a view loads its Spine model again after the load failed or timed out (assets.js, 20 s)
 * — bounded: after the last one the view keeps its diamond until `retryAssets` (a manifest that arrived late, the tab
 * shown again). Counted from the failure; a hidden tab runs no frames, so nothing is retried while hidden.
 */
export const SPINE_RETRY_MS = Object.freeze([2000, 6000, 15000, 30000]);
/**
 * A Spine load begun while the tab was hidden and still in flight this long (ms, real time) after the tab is shown again
 * is started again (`retryAssets` arms it, `update` fires it; GitHub #68: such a load — a request the hidden tab left
 * hanging — may never settle, and the view stayed the placeholder). A load that finishes within it is never doubled.
 * [ASSUMED] the length: a healthy load finishes within a few seconds once the tab is visible.
 */
export const SPINE_STUCK_MS = 5000;
/**
 * Seconds a prep landing (UnitView.land) counts as playing when the model's Start clip length is unknown (no manifest entry
 * yet): the operators' Start clips run 0.77–1.2 s, most of them 1 s (data/assets.json). [ASSUMED]
 */
export const START_CLIP_FALLBACK = 1;

/** Heights above this count as standing on a raised top (bench pads are the lowest raised tiles, 0.16). */
const RAISED_Z = 0.12;
/**
 * Flying units hover this many tiles up (PR #211 by @xcdoge; the owner's decision of 2026-10-06;
 * docs/research/12-flying-visuals-official.md): an enemy flyer above the road (z 0) whatever tile it crosses — a raised
 * block under it is no step (GitHub #277) —, an operator or summon above its tile.
 *
 * The official client's fly offset is a **single constant, `Vector3(0, 0.35f, 0)`**: `Torappu.Battle.CharacterAnimator`'s
 * constructor stores it in the instance field at +0x114 (`GameAssembly.dll` 0x180600555 reads the constant at 0x186a78a50 =
 * 0x3EB33333; x and z are 0), and `_SetFlyMountPointOffset` / `_SetFlyHitOffset` add it to the mount / hit transforms
 * while the unit flies and add its negation when it lands (the sign flips through the −0.0 mask at 0x186a77e00). It is
 * model-independent: no store to that field exists anywhere in the binary except the constructor.
 *
 * `0.35` is that constant in the client's own (character) space, whose unit is the standard battle-prefab scale **0.27**
 * (our `enemies.json modelScale` is a multiple of it — units.js `enemyModelScale`), so the lift is **0.35 / 0.27 ≈ 1.3
 * tiles** [ASSUMED: the hierarchy that yields the 1 / 0.27 factor]. An official screenshot (帝国炮火先兆者 over a tile)
 * measures the same: the drone's art bottom sits 1.2–1.4 tiles above the ground it crosses.
 *
 * **No per-model term** — (a) the binary never rewrites the offset; (b) the battle prefabs carry no per-model vertical
 * correction for flyers (their `Graphic` node sits at local (0,0,0), or at the (0,−0.2,−0.06) their ground-unit prefab
 * family shares — unrelated to how far each model's art hangs below its pivot). So a model whose art hangs below its
 * origin keeps that hang in the official too: 妖怪 flies with its rotors ≈ 0.9 tiles up, 帝国炮火先兆者 with its art
 * bottom ≈ 1.3. It replaced a flat 0.32 (player report 2026-10-05: 无人机等飞行单位位置明显偏低 — every flyer was ~1 tile
 * too low). The shadow stays on the ground under the unit; the HP bar, damage numbers, projectile hits and skill rings
 * ride the body (`hover`); range highlights are tiles.
 */
export const FLY_HOVER = 1.3;
/**
 * A push / pull slide (推拉, PR #380 by @xcdoge). The sim displaces at once — server/sim/battle/displacement.js walks its
 * 0.1-tile steps inside one call — and then holds the enemy in its 失衡 (UNBALANCE) state (PR #392's idea): a push for the
 * 位移时间 of its 受力等级 (PRTS 游戏数据基础 推力-位移近似对应表: 0.2 … 35/30 game s), a pull for its force window (推与拉:
 * 0.5 / 1 s). The snapshots only ever show the destination, so the view slides there under a constant deceleration
 * (UnitView.slideTo) for that same span: the `displace` fx carries it (`dur`, game seconds) and the view divides it by the
 * playback rate (ctx.animRate — 2 game s per real second by default: a 0.8 s push slides 0.4 real s) — it lands as the
 * sim's state ends. v0 = 2D/T, a = v0/T then run the distance in exactly T. DISPLACE_SLIDE (real s per √tile, kept in
 * 0.12–0.45 s) is only the fallback for an fx without `dur` (a recording made before 0.2.2) [ASSUMED].
 */
export const DISPLACE_SLIDE = 0.14;
/**
 * Terrain friction factor of a slide: 1 = normal land, < 1 = slippery (ICE_LAND) slides longer. Every tile of this mode
 * is normal land (its 11 maps have no ice or slime), so it is always 1.
 */
export const SLIDE_FRICTION = 1;
/**
 * Seconds of the death fade that follows the Die clip in `dying` (die(): the clip, then this tail). A flying unit keeps
 * its lift for the whole clip and drops only inside this tail (PR #380: the official client removes its fly offset in
 * `CharacterAnimator.OnFinish`, when the finish state ends — docs/research/14-death-animations.md).
 */
const DIE_FADE_TAIL = 0.55;
/**
 * Game s within which an 'atk' handed out after an enemy's `cast` of a `strike` slot is that cast's attack (UnitView.onCast):
 * the sim sends both in one tick (the cast from the attack's `before` hook, the 'atk' of each target right after), so one
 * render batch hands them out together; the window only covers a batch split by a late frame.
 */
export const STRIKE_WINDOW = 0.25;
/**
 * Longest Die clip a death plays out (s): the longest enemy Die clip of data/assets.json is 盐风主教昆图斯's 7.97 s (234
 * enemy Die clips; the old 1.6 s cap cut 25 of them short — the bosses' most), and the official client plays its clip
 * out (PR #380). It only bounds a view whose data lies.
 */
export const DIE_CLIP_MAX = 8;

/** b.snap `down` entry states (server/sim/constants.js DOWN_STATE). */
export const DOWN_STATE = Object.freeze({ COUNTING: 0, WAIT_DP: 1, WAIT_TILE: 2 });
/** Knocked-down look: model tint and alpha; redeploy ring colours per state; ring size (tiles) and height. */
export const DOWN_LOOK = Object.freeze({
  tint: 0xb4b4b4, alpha: 0.92,
  ring: Object.freeze({ [DOWN_STATE.COUNTING]: 0x4ed8af, [DOWN_STATE.WAIT_DP]: 0xffc600, [DOWN_STATE.WAIT_TILE]: 0xff4b3e }),
  size: 0.42, height: 1.02,
});
/**
 * An enemy drawn with another enemy's web model because its own is only in the local client (manifest `spineAliasOf`
 * + `spineLocal`: 灼热 / 炽焰源石虫 → the plain 源石虫's skeleton, feedback D3 after 0.1.0): a multiply tint toward its own
 * lava colours (orange / red-orange), so it reads apart from the plain slug where the local art was not extracted
 * (research 07 §5.6 "a hue shift") [ASSUMED look]. Never on its official (local) model; status tints win over it.
 */
export const ALIAS_TINT = Object.freeze({ enemy_1305_mhslim: 0xffc48a, enemy_1305_mhslim_2: 0xff9070 });
/**
 * Element gauge row under the bars (see header): the disc's diameter in tiles and its pixel clamp (enemies × `enemy`),
 * the gap under the bars (px). The white bar is as tall as the SP bar and fills the rest of the bars' width. During a
 * 爆发冷却 the refilling bar takes the element's colour (textures.js ELEMENT_RING `tint`) and the disc's alpha pulses
 * between `pulse` and 1 at `pulseHz` (real time).
 */
export const EL_BAR = Object.freeze({ icon: 0.15, min: 8, max: 15, enemy: 0.8, gap: 1, pulse: 0.45, pulseHz: 1.5 });

/** The share of a model's height a bar is placed above (the head is not the very top of the silhouette). */
export const HEAD_TOP_K = 0.92;
/** Enemies whose model is taller than this many tiles keep their bar at the cap — a bar must stay on screen. */
export const HEAD_TILES_CAP = 2.2;
export const HEAD_TILES_CAP_BOSS = 3.2;

/**
 * Tiles above the feet where a unit's HP bar / name tag sits.
 *
 * Operators and tokens are uniform chibis (UNIT.headroom). Enemies vary: with a known model they use **how far the model
 * reaches above its own origin** (spine.js `top` = `bounds.y + bounds.height`, not the box's raw height — a body whose
 * origin sits mid-model, 逐腐兽, would otherwise push its bar ~a tile too high), scaled by the official model factor and
 * the vertical-stretch quirk; without bounds they fall back to the chibi headroom × that factor.
 * @param {{ isEnemy:boolean, isBoss:boolean, spineShown:boolean, bounds?:{y?:number,height?:number}|null, modelK:number, modelKY:number }} o
 * @returns {number} tiles
 */
export function headTilesForUnit(o) {
  const k = (Number.isFinite(o.modelK) ? o.modelK : 1) * (Number.isFinite(o.modelKY) ? o.modelKY : 1);
  if (!o.isEnemy) return UNIT.headroom;
  const cap = o.isBoss ? HEAD_TILES_CAP_BOSS : HEAD_TILES_CAP;
  const b = o.spineShown ? o.bounds : null;
  if (b && Number.isFinite(b.height) && b.height > 20) {
    // how far the box reaches *above the origin*: 猎狗pro −3.7, 大鲍勃 −2.6 (feet-anchored, ≈ height), 逐腐兽 −404.7 of
    // 722.6 and 锏 −798 of 1183 (origin mid-body). Using the raw height there put the bar about a tile too high.
    const top = Number.isFinite(b.y) ? b.y + b.height : b.height;
    return clamp(Math.min(Math.max(top, 20), 900) * UNIT.modelScale * k * HEAD_TOP_K, 0.55, cap);
  }
  if (o.isBoss) return HEAD_TILES_CAP;
  if (o.spineShown) return clamp(UNIT.headroom * k, 0.55, HEAD_TILES_CAP);
  return UNIT.headroom;
}
/**
 * The HP-bar readouts under the bars (b.snap `ammo`, `wolves`, `neg`; render/interp.js header):
 *  - AMMO_BAR — the ammo skill's segmented bar replaces the SP bar: a cell per round, `height` of the HP bar's thickness
 *    (the SP bar's is 0.6), cells drawn only while they are at least `minCell` px wide;
 *  - WOLF_PIPS — 伺夜's 狼影 count as `size` (tiles) wide diamonds, clamped to `min`…`max` px, `gap` px apart, `pad` px
 *    below the rows above; a lit diamond is a 狼影 left, a dim one a spent slot (`dim` alpha).
 * [ASSUMED] the look: the count is data (skill_table `attack@trigger_time` 14 for 隐现's S2; the talent text 「至多3只」), the
 * official HUD art of neither is in the game data.
 */
export const AMMO_BAR = Object.freeze({ height: 0.85, minCell: 2 });
export const WOLF_PIPS = Object.freeze({ size: 0.1, min: 5, max: 9, gap: 2, pad: 1.5, dim: 0.25 });

/**
 * Enemy modes drawn with another clip set of the same skeleton (the `form` of a sim fx — shared/protocol.js fxForm —
 * → UnitView.setForm), per Spine id; the mode's roles override the manifest's (data/assets.json anims), `change` plays
 * once first:
 * - 掠海漂移体 (PRTS: 受晕眩/沉睡/冻结影响后进入爬行模式 — for good) crawls on its *_02 clips after 'Change';
 * - 假想敌：骨刺 (GitHub #296, PR #365): not an fx — its form follows the snapshot's stealth bit (STEALTH_FORMS): the
 *   manifest's *_A (the three-headed snake) while its 隐匿 is on, 'revealed' *_B the moment it is blocked or revealed, *_A
 *   again when the 隐匿 is back; no change clip, a running attack / stun pose carried over (SpineActor.syncFormPose);
 * - 暴鸰 flies on its bomb-less *_2 clips once its one bomb left (the official prefab's mode S1: Move→Move_2, Idle→Idle_2,
 *   Die→Die_2; user feedback after 0.1.0, D4: the bomb used to stay under the drone — no change clip, the drop is its
 *   Attack clip);
 * - 转译基底·α (user report after 0.1.0, #5): its 2 s change clip A_Die_B / _C / _D, then 寻仇者 B_*, 幽灵 C_* (no attack
 *   clip: it never attacks) or 特战术师 D_* — its manifest roles are the original form's A_Idle / A_Move;
 * - 深池逐火战士 / 精锐战士 / 护卫 (#8): knocked out → 'Die' (the 1 s 重生), the 余烬 on Idle_2 / Move_2 and its death on
 *   Die_2 (also while 'Revive' plays: the ember can still be beaten); standing up again → 'Revive', then the warrior's
 *   manifest clips;
 * - 假想敌：再生: knocked out → A_Die, the 傀儡 on B_Idle / B_Move / B_Die; back → B_Revive, then the A_* manifest clips;
 *   (both: the stand-up clip (`end`) is timed from the 'ember' fx's `dur` to end as the husk stands up — the 'revive'
 *   fx then only lands in the manifest clips);
 * - the leaders' 重生 (sim reborn(): forms 'reborn' → 'form2'): 锏 Revive1, Revive2 held, Revive3, then B_*; 扎罗 A_revive_1 /
 *   _2 / _3, then B_* (its double-hit attack); “复仇者” Revive_Begin / _Loop / _End; 杰斯顿 C1_Die (its 4 s 重生), then
 *   C2_* — their manifests mix the forms (锏 / 扎罗 died on B_Die from the A model, the look of report #5). The closing
 *   clip (`end`) is timed from the 重生's `dur` (the 'telegraph' fx) to end with it, so the second form walks and
 *   attacks on its own clips at once (a view that missed the timing — built mid-重生 — skips the closing clip);
 * - 守墓石像 (forms 'stone' → 'fly'): the statue on Sleep [ASSUMED by name], then the flyer's *_2 clips.
 * - the 傀儡师 operators' <替身> (sim professions.js installDollkeeper: form 'doll' from the start of the switch to it
 *   until the switch back starts, GitHub issue #44): the skeletons draw it on their *_B clips (their own slots — the
 *   本体's are hidden). 归溟幽灵鲨: Start_B fades it in (the 1 s switch), Idle_B (it never attacks), Die_B breaks it
 *   apart over its last second (`end`, timed from the 'substitute' fx's `dur`), the 本体 comes back on Start_2 (`leave`:
 *   played when the form ends); knocked out as the 替身 it collapses on Die_B_2 and stays down so. 风丸: Start_B, then
 *   Idle_B / Attack_B (her 替身 attacks), Die_B; the 本体 comes back on Start. Facing UP: 归溟幽灵鲨's Back skeleton has
 *   only Idle_B and Start_2, 风丸's Start_B, Idle_B and Attack_B — the clips a Back skeleton lacks are skipped; neither has
 *   the 替身's death clip, so a 替身 knocked out lies on the Front model like every knocked-out operator facing UP
 *   (_wantsBack). The sim resets the form right after the 'die' event; the form it died in (`_dieForm`) gives the model
 *   built for the knock-out — and one rebuilt while it is down — the 替身's death clip; it stands up as the 本体.
 * A kind without a clip set of this skeleton (barriers, charges, …) changes nothing. 吉兆飞鳞's 晕眩模式 is its Stun clip.
 */
export { FORMS } from '../../../shared/animationForms.js';
/**
 * Enemy forms that follow the snapshot's stealth bit (UF.STEALTH: the sim sends it only while the enemy's 隐匿 is on —
 * not blocked, not revealed) instead of a sim fx, per Spine id: the FORMS kind drawn while the bit is OFF; the manifest's
 * clips while it is on. Switched at once (UnitView.sync, and for a model loaded later the load callback).
 */
export const STEALTH_FORMS = Object.freeze({ enemy_9008_acbunn: 'revealed' });

/**
 * The clips a unit can play, clip name → true for a one-off clip (GitHub #542: its impostor box is sized from them,
 * `impostorBox`): every role of its manifest entry (`anims`, with every skill's set — `skills` — and the Run cycle) and of
 * its model forms (`forms` = FORMS[id]: their clip sets and their change, closing and leaving clips). One-off = the deploy
 * clip, a skill's, stun's, move's or run's begin and end clips and a form's change, closing and leaving clips; everything
 * else loops or is held (idle, attack — its begin and end come with every attack —, a skill's loop and idle, the move and
 * run loops, the stun loop, the death clip a knocked-out operator lies in). A name with both kinds of role loops.
 * @returns {Map<string, boolean>}
 */
export function playedClips(anims, forms = null) {
  const out = new Map();
  const add = (name, once) => { if (typeof name === 'string' && name) out.set(name, out.has(name) ? out.get(name) && once : once); };
  const clip = (c, endsOnce) => {
    if (!c || typeof c !== 'object') return;
    add(c.loop, false); add(c.idle, false); add(c.begin, endsOnce); add(c.end, endsOnce);
  };
  const roles = (r) => {
    if (!r || typeof r !== 'object') return;
    add(r.idle, false); add(r.deploy, true); add(r.die, false);
    clip(r.attack, false); clip(r.skill, true); clip(r.move, true); clip(r.run, true); clip(r.stun, true);
    if (r.skills && typeof r.skills === 'object') for (const s of Object.values(r.skills)) clip(s, true);
  };
  roles(anims);
  if (forms && typeof forms === 'object') {
    for (const f of Object.values(forms)) {
      if (!f || typeof f !== 'object') continue;
      add(f.change, true); add(f.end, true); add(f.leave, true);
      for (const name of f.sequence || []) add(name, true);
      roles(f.roles);
    }
  }
  return out;
}

/**
 * Impostor box limits (GitHub #542, `impostorBox`): a clip enters a unit's box while the box stays within `steady` × the
 * area of its idle clip (a looping or held clip), `transient` × for a one-off clip; `pad` × the box's longer side +
 * `padMin` skeleton units is added on every side for the poses between two samples (spine.js CLIP_SAMPLE_HZ).
 * [ASSUMED] the values: on the current roster they keep every looping / held clip of 668 of the 681 skeletons in the box
 * (the 13 others hold a screen-wide skill, attack or death effect: 帕拉斯, 诗怀雅's attack …; at 4 × the attack or skill
 * loops of 39 would be drawn directly whenever they play) and leave out 355 of the 681 deploy clips (mostly the drop from
 * above, up to 1700 units tall); the boxes add up to 1.26 × the area of boxes sized from the idle's first frame (the
 * median skeleton's 1.13 ×).
 */
export const IMP_BOX = Object.freeze({ steady: 5, transient: 2, pad: 0.03, padMin: 8 });

/**
 * A unit's impostor box (GitHub #542) in skeleton space, from rects [x0, y0, x1, y1] (y down; null = nothing drawn): its
 * idle clip always (the core); then each other clip the unit plays (`clips`: [name, rect, once], `playedClips`) in the
 * order of the area it adds, taken while the box stays within IMP_BOX.steady × the core's area (IMP_BOX.transient × for a
 * one-off clip). A clip that does not fit and is not inside the box anyway is `over`: its unit is drawn directly while it
 * plays (units.js _updateImpostor), so a rare huge clip (a deploy drop from above, a screen-wide sweep) does not grow every
 * refresh of the unit's slot. Padded by IMP_BOX.pad. The setup pose needs no room: no model shows it (spine.js
 * SpineActor.update poses one frozen before its first update at its clip's first frame). A clip whose rect is `false`
 * (its sampling threw, spine.js clipBounds) is `over` as well — drawn directly, never taken as drawing nothing. Without an
 * idle clip that draws anything, the looping clips make the core. null when nothing is drawn.
 * @returns {{ x0: number, y0: number, w: number, h: number, over: Set<string> } | null}
 */
export function impostorBox(idle, clips = []) {
  const ok = (r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] <= r[2] && r[1] <= r[3];
  const join = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  const area = (r) => Math.max(1, r[2] - r[0]) * Math.max(1, r[3] - r[1]);
  let core = ok(idle) ? idle.slice() : null;
  if (!core) for (const [, r, once] of clips) if (!once && ok(r)) core = core ? join(core, r) : r.slice();
  if (!core) return null;
  const limit = area(core);
  const order = clips.filter(([, r]) => ok(r)).map(([name, r, once]) => ({ name, r, once, grow: area(join(core, r)) }))
    .sort((a, b) => a.grow - b.grow || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let box = core;
  const left = [];
  for (const c of order) {
    const u = join(box, c.r);
    if (area(u) <= (c.once ? IMP_BOX.transient : IMP_BOX.steady) * limit) box = u;
    else left.push(c);
  }
  const over = new Set(clips.filter(([, r]) => r === false).map(([name]) => name));
  for (const c of left) if (c.r[0] < box[0] || c.r[1] < box[1] || c.r[2] > box[2] || c.r[3] > box[3]) over.add(c.name);
  const pad = IMP_BOX.pad * Math.max(box[2] - box[0], box[3] - box[1]) + IMP_BOX.padMin;
  return { x0: box[0] - pad, y0: box[1] - pad, w: box[2] - box[0] + 2 * pad, h: box[3] - box[1] + 2 * pad, over };
}
/** No clip is drawn past the box (a pen figure; the legacy box of a runtime that cannot be sampled). Never added to. */
const NO_CLIPS = new Set();

/**
 * Keep `obj` in the right layer: the surface container of block row round(y) when it lies on a raised top at
 * height `z` (drawn after that row's blocks), else `fallback`. Reparents only on change.
 */
export function placeOnGround(ctx, obj, fallback, y, z) {
  let layer = fallback;
  if (z > RAISED_Z && ctx.surfaceLayer) layer = ctx.surfaceLayer(Math.round(y)) || fallback;
  if (obj.parent !== layer) layer.addChild(obj);
}

/** Units stand a little below the tile top's centre (operators and enemies alike, every map): the models read as
 * standing in the tile rather than floating on its plane. */
const STAND_SINK = 0.08;

/** Standing height of a world point (tile top incl. raised devices); 0 off-grid / without a stage. */
export function groundZ(ctx, x, y) {
  if (!ctx.heightAt) return 0;
  const h = ctx.heightAt(Math.round(y), Math.round(x));
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** Native deep-sea tiles lower ground bodies; raised devices and airborne units remain above water. */
export function submergedVisual(ctx, unit) {
  const tile = ctx.tileAt?.(Math.round(unit.y), Math.round(unit.x));
  return !!(tile?.drawn && tile.glyph === 'd' && !tile.devH && !unit.flying && !unit.info?.preview);
}

/** Enemy Spine models face right by default like operators (verified by eye on Ark-Models skeletons). */
export const ENEMY_MODEL_FACES_LEFT = false;

/**
 * Leaders the official draws one way only (1 = right, the authored way), by enemy key (GitHub #648). The Hidden Core's
 * 假想敌：管: its prefab enemy_9021_acduml_2 differs from the Final Assault's enemy_9021_acduml only in the BoxCollider2D
 * offset (+1, +1 — data/enemies.json hitArea dx 1) and the boss HUD offset `_bossHudOffset` (+1.4, 0) (local client,
 * 2026-10-15). Both lie right of its spawn tile (row 3, col 9), where its body lies when the model faces right as
 * authored; mirrored to the left it reached 2½ tiles onto the left half (the report's screenshot), while the
 * maintainer's official recording shows it over the boss block. The maintainer also saw the Hidden Core's 假想敌：胄
 * face right; enemy_9013_acstmk_2 is the Final Assault 胄's own prefab, and the Final Assault 管's prefab differs from
 * the hidden one in the collider and the HUD alone, so both Final Assault copies face right as well. [ASSUMED] they
 * never turn (self-bound, SELF_BOUND in server/sim/content/bosses.js); their FaceSwitcher `_defaultLOrR` is 1 (regular
 * enemies 3), read as "right". 阿利斯泰尔, “萨米的意志” and 假想敌：弦 share that 1 but nothing has shown their look yet,
 * so they keep the regular start (left) and their turns.
 */
const FIXED_FACING = Object.freeze({ enemy_9013_acstmk: 1, enemy_9013_acstmk_2: 1, enemy_9021_acduml: 1, enemy_9021_acduml_2: 1 });
/** The official boss HUD's sideways offset from the unit position, tiles (the prefab's `_bossHudOffset.x`), by key. */
const BOSS_HUD_DX = Object.freeze({ enemy_9021_acduml_2: 1.4 });

let _whiteTex = null;
const white = () => (_whiteTex || (_whiteTex = globalThis.PIXI.Texture.WHITE));

function bar(P, parent, color, alpha = 1) {
  const s = new P.Sprite(white());
  s.tint = color;
  s.alpha = alpha;
  s.anchor.set(0, 0.5);
  parent.addChild(s);
  return s;
}

/**
 * Shared context handed to every view by app.js (`audio`: the audio manager of public/js/audio.js — prep landings, land()).
 * @typedef {{ P: any, layers: { shadow: any, units: any, bars: any, groundFx: any },
 *   assets: any, audio?: any, cam: () => any, heightAt: (r:number,c:number)=>number, fx: any, time: () => number,
 *   settings: { damageNumbers: boolean, quality: string, ammoEnergyCount?: boolean } }} ViewCtx
 */

/** Scratch skeletons per skeleton data (bonePose): one pose is computed and read at a time. */
const POSE_SKELETONS = new WeakMap();
/** Bones by name per skeleton (spine's findBone walks every bone): a skeleton's bones keep their identity. */
const BONES = new WeakMap();

/** A skeleton's bone by name (cached), or null. */
function boneOf(sk, name) {
  let m = BONES.get(sk);
  if (!m) { m = new Map(); BONES.set(sk, m); }
  let b = m.get(name);
  if (b === undefined) { b = (typeof sk.findBone === 'function' && sk.findBone(name)) || null; m.set(name, b); }
  return b;
}

/**
 * A bone of a Spine display posed by one clip alone at a time — `anim` / `time`, else its first track's clip at the
 * track's time — on a scratch skeleton of the same data, so the model drawn (and its cross-fade) is untouched; null
 * when there is no clip or the runtime's shape is unknown.
 * @param {any} sp a PIXI.spine Spine
 * @param {any} bone a bone of its skeleton
 * @param {any} [anim] a spine Animation
 * @param {number} [time] seconds into it
 */
export function bonePose(sp, bone, anim, time) {
  try {
    const tr = sp.state && sp.state.tracks ? sp.state.tracks[0] : null;
    const a = anim || (tr && tr.animation);
    if (!a || typeof a.apply !== 'function') return null;
    let s = POSE_SKELETONS.get(sp.spineData);
    if (!s) { s = new sp.skeleton.constructor(sp.spineData); POSE_SKELETONS.set(sp.spineData, s); }
    const t = Number.isFinite(time) ? time : typeof tr.getAnimationTime === 'function' ? tr.getAnimationTime() : tr.trackTime;
    const loop = !anim && !!tr.loop;
    // one pose serves every point read of it (a shot and its muzzle flash read the same strike frame)
    if (s._poseOf !== a || s._poseAt !== t || s._poseLoop !== loop) {
      s.setToSetupPose();
      // MixBlend.setup (0), MixDirection.mixIn (0): the clip over the setup pose, as a track's first application does
      a.apply(s, t, t, loop, null, 1, 0, 0);
      s.updateWorldTransform();
      s._poseOf = a; s._poseAt = t; s._poseLoop = loop;
    }
    return boneOf(s, bone.data ? bone.data.name : bone.name);
  } catch { return null; }
}

export class UnitView {
  /**
   * @param {ViewCtx} ctx
   * @param {object} info UnitInfo-like: { id, uid?, kind, side, defId, spine, avatar, tier, golden, facing, maxHp, boss?, motion?, name? }
   * @param {{ prep?: boolean }} [opts]
   */
  constructor(ctx, info, opts = {}) {
    const P = ctx.P;
    this.ctx = ctx;
    this.P = P;
    this.info = { ...info };
    const record=ctx.lookupDef?.(info),selected=record?.skills?.find(s=>s.index===info.skillIndex)||record?.skill;
    this.info.charId ||= record?.charId;
    this.info.skillId ||= selected?.skillId;
    this.info.skillName ||= selected?.name;
    this.info.skillDescription ||= selected?.description || selected?.desc;
    this.info.skillUnlimitedRange = unlimitedSkillRange(selected || {description:this.info.skillDescription,rangeGrid:info.skillZoneGrid});
    if(info.side==='enemy') {
      const icon=ctx.assets?.enemyIcon?.(info.defId);
      if(icon&&ctx.assets.image)Promise.resolve(ctx.assets.image(icon)).then(image=>{
        if(!this.destroyed)this.info.projectileColor=representativeArtColor(image)??0xc7d4d9;
      }).catch(()=>{});
    } else loadRangeArtColor(this.info,ctx.assets);
    this.id = info.id;
    this.uid = info.uid ?? null;
    this._cast = null;
    this.prep = !!opts.prep;
    this.lodIdle = opts.lod === 'idle';
    this.culled = false;          // outside the viewport this frame (not animated, not drawn)
    this._offDt = 0;              // animation time skipped while culled
    this._faceHold = 0;           // how long a cast keeps the Front model round after its flag (game s; _skillFacesFront)
    this._far = false;            // small on screen (adaptive LOD, with hysteresis)
    this.isEnemy = info.side === 'enemy';
    this.isBoss = !!info.boss;
    // Giant models can have an off-centre skeleton origin (notably the organ boss).
    // Keep simulation coordinates intact; align their idle body to the authored hit-area centre.
    this.bossArea = this.isBoss && this.isEnemy ? info.hitArea ?? record?.hitArea ?? null : null;
    this.bossModelCenter = 0;
    // a leader drawn one way only, and its boss HUD beside the model (FIXED_FACING / BOSS_HUD_DX, GitHub #648)
    this.fixedFacing = (this.isEnemy && FIXED_FACING[info.defId]) || 0;
    this.hudDx = (this.isEnemy && BOSS_HUD_DX[info.defId]) || 0;
    // a boss that does not walk (move speed ≤ 0.1: 盐风主教昆图斯, 假想敌：胄 …) — its official HP bar spans its body
    { const ms = Number((ctx.lookupDef ? ctx.lookupDef(info) : null)?.stats?.moveSpeed); this.fixedBoss = this.isBoss && Number.isFinite(ms) && ms <= 0.1; }
    // enemies: the official prefab's size factor (1 for operators, summons and enemies at the standard size)
    this.modelK = this.isEnemy ? Number(info.modelScale)>0?Number(info.modelScale):enemyModelScale(ctx.lookupDef ? ctx.lookupDef(info) : null) : 1;
    this.isToken = info.kind === 'token';
    this.golden = !!info.golden;
    this.tier = clamp(Number(info.tier) || 1, 1, 6);
    this.x = Number(info.x) || 0; this.y = Number(info.y) || 0; this.z = 0;
    this.zTarget = null;          // battle: standing height the feet ease towards (tile top under the unit; 0 for enemies)
    this.slide = null;            // a push / pull slide (slideTo): held, then easing into the sim's position (update)
    /** @type {number|null} */
    this.shadowZ = null;          // an enemy flyer's shadow height (the tile top under it), else null: the shadow is at z
    /** @type {number|null} */
    this.shadowZTarget = null;
    this.flying = !!info.flying || info.motion === 'FLY';
    this.flightBaseZ = this.flying ? 0 : null;
    this.hover = this.flying ? (this.airHeight ?? FLY_HOVER) : 0;               // flying: body height above the road / the ground under it
    this.dir = this.isEnemy ? null : unitDir(info);
    // whether the direction is known (UnitInfo / piece `dir`), not just the legacy ±1: battle and scouting views show
    // the ground wedge only then (a derived RIGHT would mislabel an UP / DOWN operator)
    this.hasDir = !this.isEnemy && typeof info.dir === 'string' && DIRS.includes(info.dir.toUpperCase());
    this.facing = this.dir === 'LEFT' ? -1 : 1;
    this.visFacing = this.isEnemy ? -1 : this.facing;
    this.hp = Number(info.maxHp) || 1; this.maxHp = Number(info.maxHp) || 1; this.ghostHp = this.hp;
    this.sp = 0; this.spMax = 0;
    this.ammo = null;             // [rounds left, rounds in the magazine] while an ammo skill runs (sync; b.snap `ammo`)
    this.wolves = null;           // [狼影 left, the talent's maximum] of a 狼群 (sync; b.snap `wolves`)
    this.coins = null;            // [balance, cap] of 琳琅诗怀雅's skill purse, including zero
    this.coinHud = null;
    this.energy = null;           // [stored energies, the trait's maximum] of a 秘术师, including zero (sync; b.snap `energy`)
    this.energyHud = null;
    this.neg = 0;                 // the share of its cap a negative-HP pool holds, 0 = none (sync; b.snap `neg`, 斩业星熊's 我执)
    this.layers = 0;              // hit-negating 护盾 layers (sync; b.snap `layers`: the official layer effect, vfx/talentfx.js)
    this.charges = null;          // [stored, maximum] of a charge skill (sync; b.snap `charges`: vfx/skillfx.js)
    this.flags = info.preview && info.previewStealth ? UF.STEALTH : 0; this.anim = ANIM.IDLE;
    this.statuses = new Set();
    this.alive = true;
    this.dying = 0;               // seconds left of the death fade (0 = not dying)
    this.dieT = 0;                // seconds since die() (the Die clip's clock; a late Spine model catches up)
    this.remove = false;          // set when the death fade ended (owner removes the view)
    this.down = null;             // knocked out, waiting to redeploy: { until, total, state } (setDown) — no fade meanwhile
    this.gameT = 0;               // battle game time of the frame (render clock), for the redeploy ring's countdown and the element bar's refill
    this.el = null; this.elFill = 0; this.elUntil = 0; this.elDur = 0;   // shown element gauge (sync)
    this._elBar = null;           // { root, disc, bg, fill } sprites of the element gauge row, built on first use
    this._wolfPips = null;        // { root, back[], lit[] } diamonds of the 狼影 row, built on first use
    this.ammoCuts = [];           // the thin separators between the ammo bar's cells (_updateAmmoCuts)
    this._downRing = null;        // { disc, track, arc, text } sprites (text: the shared label, textures.js downLabel), built on first use
    this.alpha = 1; this.fadeIn = this.prep ? 1 : 0;
    this.lunge = 0; this.lungeDir = { x: 1, y: 0 };
    this.flash = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.hovered = false; this.dimmed = false; this.lift = 0;
    this.lastAtk = -1; this.atkInterval = defaultInterval(ctx, info);
    this.shake = 0;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this.placed = false;          // set by the first update's projection: until then `screen` is not on screen (bounds)
    this.destroyed = false;
    this.form = typeof info.form === 'string' ? info.form : null;   // the unit's model form: an enemy's mode, a 傀儡师's 替身 (setForm, FORMS)
    this._dieForm = null;         // the form it died in (die): a model built while it lies down shows that form's death

    // --- display objects
    this.snowTiles = [];
    this.snowFx = new P.Graphics();ctx.layers.groundFx.addChild(this.snowFx);
    (ctx._rangeViews ||= new Set()).add(this);
    this.skillZone = info.skillZoneGrid?.length ? new P.Graphics() : null;
    if(this.skillZone)ctx.layers.groundFx.addChild(this.skillZone);
    this.skillZoneExtra = new Map();
    this.attackRange = (Number(info.rangeRadius)>0 || info.hitArea) ? new P.Graphics() : null;
    if(this.attackRange)ctx.layers.groundFx.addChild(this.attackRange);
    this.shadow = new P.Sprite(ctx.shadowTex || shadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.55;
    ctx.layers.shadow.addChild(this.shadow);

    this.root = new P.Container();
    this.root.sortableChildren = false;
    ctx.layers.units.addChild(this.root);

    const fx = fxAtlas();
    this.aura = null;
    if (this.golden) {
      this.aura = new P.Sprite(fx.tex.glow);
      this.aura.anchor.set(0.5, 0.62);
      this.aura.tint = 0xffc94a;
      this.aura.blendMode = P.BLEND_MODES.ADD;
      this.root.addChild(this.aura);
    }
    this.stateFx = new P.Graphics();
    this.body = new P.Container();
    this.root.addChild(this.body);
    // Ice/refraction must cover the body: drawing behind the opaque Spine erases most of the effect.
    this.root.addChild(this.stateFx);
    this.stealthMist = null;
    this.fallback = new P.Sprite(P.Texture.EMPTY);
    this.fallback.anchor.set(0.5, 1);
    this.body.addChild(this.fallback);
    this.actor = null;
    this.spineReady = false;
    this._modelDirty = false;            // died / stood up since the last frame: update() checks Front ⇄ Back (_syncModel)
    this._pendingDeployElapsed = null;  // elapsed game seconds until a late model can continue Start
    this._landUntil = 0;                 // a prep landing (land) owns the Start clip until then (ms, performance clock)
    this._spineBusy = false;             // a Spine load of this view is in flight
    this._spineTries = 0;                // failed loads since the last model (SPINE_RETRY_MS)
    this._retryAt = 0;                   // when the next retry is due (ms, performance clock; 0 = none)
    this._spineHidden = false;           // the load in flight began while the tab was hidden (SPINE_STUCK_MS)
    this._stuckAt = 0;                   // when that load is started again unless it settled (ms; 0 = none)
    this.baseTint = 0xffffff;            // the drawn model's own tint (ALIAS_TINT), under the status tints

    this.hud = new P.Container();
    ctx.layers.bars.addChild(this.hud);
    this._buildHud();

    this.facingArrow = null;
    this._loadPicture();
    this._loadSpine();
  }

  // ---- loading ---------------------------------------------------------------------------------------------

  _frameColor() {
    if (this.isEnemy) return this.isBoss ? ENEMY_FRAME.boss : this.tier >= 2 ? ENEMY_FRAME.elite : ENEMY_FRAME.normal;
    if (ICE_TOKENS.has(this.info.defId)) return ICE_FRAME;
    if (this.golden) return 0xffc600;
    return TIER_COLORS[this.tier] || TIER_COLORS[1];
  }

  // The fallback portrait (avatar in a rarity diamond, a 160×160 canvas cached by textures.js) is built lazily, on
  // the first frame it is actually visible: never for a unit whose Spine model is ready before that, and never as
  // an image-less placeholder that the avatar replaces a moment later (the placeholder only shows when the avatar
  // is missing or still loading after PIC_WAIT_MS).
  /** The picture the manifest names for this unit now (an ICE_TOKENS unit takes none: the token fallback would be its
   *  owner's face — assets.js tokenAvatarUrl). `info.skin` (docs/SKINS.md): an appearance of the operator that ships its
   *  own avatar; the retry path compares the URL, so a switch to another skin re-resolves the diamond (a view stays up
   *  only while its info does not change — render/app.js applyInfo). */
  _pictureUrl() {
    const a = this.ctx.assets;
    const o = this.info.skin ? { skin: this.info.skin } : undefined;
    return ICE_TOKENS.has(this.info.defId) ? null : a && (a.picture ? a.picture(this.info.avatar, o) || a.picture(this.info.defId, o) || a.picture(this.info.spine, o) : null) || null;
  }

  /** @param {boolean} [replace] another picture replaces a shown one: the old one stays on the diamond until it is there */
  _loadPicture(replace = false) {
    const a = this.ctx.assets;
    const url = this._pictureUrl();
    const old = replace && this._pic && this._pic.state === 'img' ? this._pic : null;
    // the key carries the skinId too (docs/SKINS.md): a switch otherwise keeps the previous appearance's portrait
    this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown') + (this.info.skin ? `|${this.info.skin}` : ''), color: this._frameColor(), img: null, state: 'none', shown: null, t0: nowMs(), url, prev: !!old };
    this._noBody = !url && isBodylessToken(this.info.defId) && !this._modelEntry(false);
    if (!url || !a.image) return;
    const cached = typeof a.imageNow === 'function' ? a.imageNow(url) : null;
    if (cached) { this._pic.img = cached; this._pic.state = 'img'; return; }
    this._pic.state = 'wait';
    const pic = this._pic;
    Promise.resolve().then(() => a.image(url)).then((img) => {
      if (img) { pic.img = img; pic.state = 'img'; } else pic.state = 'none';
    }, () => { pic.state = 'none'; });
  }

  /**
   * No picture any more (the manifest names none: its layer went away): a fresh record — a load still in flight resolves
   * into the old one and is never drawn — and nothing of the old picture on the diamond (the placeholder comes back with
   * _ensurePicture while no model shows).
   */
  _clearPicture() {
    this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown'), color: this._frameColor(), img: null, state: 'none', shown: null, t0: nowMs(), url: null, prev: false };
    try { this.fallback.texture = this.P.Texture.EMPTY; } catch { /* ignore */ }
  }

  /**
   * No model any more (the manifest names none: a plugin's model for a slot the installation leaves empty, its layer gone):
   * the model shown is dropped and released, a load in flight superseded (`_spineReq`: it releases its entry when it
   * lands, never shown), the retries stopped — and the diamond shows again.
   */
  _dropModel() {
    this._spineReq = (this._spineReq || 0) + 1;
    if (this.actor) this._dropActor();
    this._spineBusy = false;
    this._spineHidden = false;
    this._resolved = null;
    this.entry = null;
    this._retryAt = 0;
    this._stuckAt = 0;
    this.swapT = 0;
    this.fallback.visible = true;
    this.fallback.alpha = 1;
  }

  /** Put the right diamond on the fallback sprite (called while the fallback is visible). */
  _ensurePicture() {
    const pic = this._pic;
    if (!pic || this.destroyed) return;
    let want = pic.state === 'img' ? 'img' : 'placeholder';
    // still loading: nothing new yet (a replaced picture keeps the old one meanwhile; else the placeholder after a while)
    if (pic.state === 'wait' && (pic.prev || nowMs() - pic.t0 < PIC_WAIT_MS)) want = null;
    if (!want || pic.shown === want) return;
    // a drawn picture is cached by its URL too: another picture of the same unit (a cosmetic plugin's) is another diamond
    const key = want === 'img' && pic.url ? `${pic.key}|${pic.url}` : pic.key;
    this.fallback.texture = diamondTexture(key, want === 'img' ? pic.img : null, pic.color, { enemy: this.isEnemy, golden: this.golden, ice: ICE_TOKENS.has(this.info.defId) });
    pic.shown = want;
  }

  /**
   * The Spine entry the manifest names for this unit now — Front/Back rule (research 07 §5.5 / 09 §1.2): Front facing
   * right/down (mirrored for left), Back facing up — while standing (a knocked-out operator lies with the model that has
   * a fall: _wantsBack) —, or null.
   * @param {boolean} [back]
   */
  _modelEntry(back = this._wantsBack()) {
    const a = this.ctx.assets;
    const id = this.info.spine || this.info.defId;
    // 皮肤 (docs/SKINS.md): `info.skin` is the owner's chosen appearance; sparkineEntry falls back to the operator's own
    // model when the manifest holds no such skin (or no model for it), so a view always resolves something to draw
    return a && a.spineEntry && id ? a.spineEntry(id, this.info.skin ? { back, skin: this.info.skin } : { back }) || null : null;
  }

  /** @param {boolean} [retry] load again even after a remembered failure (assets.js acquire `{ retry }`) */
  _loadSpine(retry = false) {
    const a = this.ctx.assets;
    if (!a || !a.spineEntry || !a.spine) return;
    const id = this.info.spine || this.info.defId;
    const back = this._wantsBack();
    const entry = this._modelEntry(back);
    if (!entry || this.ctx.settings?.quality === 'low' && this.isEnemy && !this.isBoss && this.ctx.crowded?.()) return;
    this.entryBack = back;
    this._resolved = entry; // what the manifest named (the model drawn may be its `fallback`)
    this._acquireSpine(entry, id, retry);
  }

  /**
   * Re-resolve what this view draws (public issue #8 item 5; DESIGN §32 P1a): the picture when it has none (no avatar URL —
   * the asset manifest arrived after the view was built — or the image failed) or when the manifest names another one now,
   * and, at once, the Spine model when none is shown and none is loading (no manifest entry then, or a load that failed /
   * timed out) or when the manifest names another model than the one shown or loading — a room's cosmetic plugins that
   * arrived after the board was built, a personal plugin switched during a match, a plugin file that failed and fell back
   * (the new model replaces the old in place, no fallback diamond in between). render/app.js calls it for every view when
   * the manifest changes (assets.js onChange) and when the tab is shown again. A load still in flight that began while the
   * tab was hidden gets SPINE_STUCK_MS from now (the tab visible) to finish, then `update` starts it again (GitHub #68).
   * Nothing to do otherwise.
   */
  retryAssets() {
    if (this.destroyed) return;
    const url = this._pictureUrl();
    if (!this._pic || this._pic.state === 'none') this._loadPicture();
    else if (url && url !== this._pic.url) this._loadPicture(true);
    // the picture came from a layer that is gone — the manifest names none now (a plugin's art for a slot the installation
    // leaves empty): off the diamond, and a load still in flight lands in the old record, never this view's
    else if (!url && this._pic.url) this._clearPicture();
    // another model than the one shown / loading (compared by skeleton URL: the same file is the same model), for the
    // side it was resolved for (Front ⇄ Back stays _syncModel's); the optional local-client model that only arrived now
    // (data/local-assets.json late: its `fallback` is the model shown) is no change — a view keeps its model then, as
    // before cosmetic plugins (DESIGN §13)
    const want = this._modelEntry(this._resolved ? !!this.entryBack : this._wantsBack());
    // the model likewise: none named now → none drawn, a load in flight dropped (it releases its entry when it lands)
    if (!want && this._resolved) { this._dropModel(); return; }
    const moved = !!want && !!this._resolved && want.skel !== this._resolved.skel
      && !(want.local && want.fallback && want.fallback.skel === this._resolved.skel);
    if (this.actor) {
      if (moved) { this._retryAt = 0; this._loadSpine(true); }
      return;
    }
    if (!this._spineBusy || moved) { this._retryAt = 0; this._loadSpine(true); return; }
    if (this._spineHidden && !this._stuckAt && !globalThis.document?.hidden) this._stuckAt = nowMs() + SPINE_STUCK_MS;
  }

  /**
   * Load `entry` and show it. Every acquire is paired with exactly one release: a superseded / failed / post-destroy
   * load releases its own entry; the displayed model's entry (`_actorEntry`) is released when that model is replaced or
   * destroyed. A model that fails to load falls back to the entry's `fallback` (an optional local-client model,
   * assets.js spineEntry: DESIGN §13) when it names one; otherwise the view keeps its fallback diamond and — while no
   * model is shown — loads again after SPINE_RETRY_MS (a timed-out or failed download used to stay a diamond for good).
   */
  _acquireSpine(entry, id, retry = false) {
    const a = this.ctx.assets;
    this.entry = entry;
    const req = this._spineReq = (this._spineReq || 0) + 1;
    this._spineBusy = true;
    this._spineHidden = !!globalThis.document?.hidden;
    this._stuckAt = 0;
    a.spine.acquire(entry, retry ? { retry: true } : undefined).then((data) => {
      if (req === this._spineReq) { this._spineBusy = false; this._stuckAt = 0; }
      if (this.destroyed || req !== this._spineReq) { this._releaseEntry(entry); return; }
      this._spineTries = 0;
      this._retryAt = 0;
      let actor = null;
      try {
        actor = new SpineActor(data, entry);
        actor.setSkillIndex(this.info.skillIndex);
        // Play each attack once; enemies with an authored ready stance keep it between attacks.
        actor.clipPerAttack = true;
        actor.enemyModel=this.isEnemy;
        actor.holdStunPose=this.info.charId==='char_4217_makoto'||String(this.info.spine||'').includes('4217_makoto');
        actor.attackFromStrike = this.isEnemy;
        actor.continuousAttacks = !this.isEnemy;
        actor.authoredAttackReady = this.isEnemy;
      } catch (err) {
        console.warn('[render] spine build failed', id, err?.message || err);
        this._releaseEntry(entry);
        // a cosmetic plugin's model the renderer cannot build falls back like one that did not load (assets.js `failed`:
        // the manifest changes, retryAssets loads the installation's); the installation's own: no change
        try { a.failed?.(entry.skel); } catch { /* ignore */ }
        return;
      }
      // a Front ⇄ Back swap (setDir, or knocked out / standing again: _syncModel) replaces the previous model in place:
      // no fallback diamond in between; a deploy clip it was playing goes on on the new model (an operator facing UP
      // redeployed: its Back model takes over from the Front model it lay down with)
      const swap = !!this.actor;
      const deployed = swap && this.alive ? this.actor.deployElapsed() : this._pendingDeployElapsed;
      this._pendingDeployElapsed = null;
      if (swap) this._dropActor();
      this.actor = actor;
      if (this.bossArea) {
        actor.spine.update(0);
        const bounds = actor.spine.getLocalBounds();
        this.bossModelCenter = Number.isFinite(bounds?.x) && bounds.width > 0 ? bounds.x + bounds.width / 2 : 0;
      }
      this._actorEntry = entry;
      this.baseTint = (!entry.local && ALIAS_TINT[id]) || 0xffffff;   // the web alias of a local-only model
      this.body.addChild(this.actor.spine);
      this.spineReady = true;
      this.swapT = swap ? 1 : 0;
      this.actor.spine.alpha = swap ? 1 : 0;
      // measure the clips it can play now (sampled over the next frames, render/app.js stepClipBounds): its impostor box
      // is ready before a crowd needs it (_impBox)
      try { this.actor.clipBounds([...this._clipNames().keys()]); } catch { /* _impBox asks again */ }
      // a mode the unit is already in (a model built or rebuilt after the change): its clip set, no change clip — a dead
      // one lies in the form it died in (a 替身 knocked out: the sim resets the form at once, but the Front model it lies
      // down with facing UP, §22.1, is built a frame later; a model rebuilt while it is down)
      const f = this._formSpec() || (this.alive ? null : this._dieForm);
      if (f) {
        const resume=this.info.charId==='char_4217_makoto'&&this._formElapsed!=null;
        const elapsed=resume?this._formElapsed:0;
        const change=resume&&f.change&&elapsed<this.actor.dur(f.change)?f.change:null;
        this.actor.setForm(f.roles,change,null,resume?{sequence:f.sequence||[f.change].filter(Boolean),elapsed}:null);
      }
      // replay current state (a dead model resumes its Die clip where it would be — a knocked-down one holds its end)
      if (!this.alive) {
        const d = this.actor.die();
        const at = Math.min(d, this.dieT * (this.ctx.animRate?.() || 1));
        if (at > 0) this.actor.update(at);
      } else {
        // the skill stance: the flag still on, or its clip's window not yet over — an instant skill's UF.SKILL lasts a
        // single snapshot while the Front model is only being loaded now (剑雨's clip is 2.17 s), and a model built after
        // the flag dropped used to stand in its idle on the Front model: the turn happened, the skill animation did not
        if (this.flags & UF.SKILL || (this._faceHold > 0 && this._skillFacesFront())) {
          this.actor.setSkill(true,{instant:this.info.skillDuration===0 && !this.info.skillNextAttack});
          // a late Front model starts the clip from its beginning: keep it on screen for the clip's own length (and its
          // End) instead of the window the flag left
          const d = this._skillFaceDur(false) + this._skillFaceDur(true);
          if (d > 0) this._faceHold = Math.max(this._faceHold, d);
        }
        this.actor.setBase(this._baseFromAnim());
        const deployElapsed=deployed ?? this._pendingDeployElapsed;
        if (deployElapsed != null && deployElapsed < this.actor.dur(this.actor.roles.deploy)) {
          this.actor.deploy(); if (deployElapsed > 0) this.actor.update(deployElapsed);
        }
        if (STEALTH_FORMS[id]) this.actor.syncFormPose();
        if(this.info.charId==='char_4217_makoto')this._resumeMakotoAttack();
      }
    }, () => {
      if (req === this._spineReq) { this._spineBusy = false; this._stuckAt = 0; }
      this._releaseEntry(entry);
      if (this.destroyed || req !== this._spineReq) return;
      if (entry.fallback) { this._acquireSpine(entry.fallback, id, retry); return; }
      // keep the fallback diamond (or the model already shown: a failed Front ⇄ Back swap) — and try again later
      if (!this.actor && this._spineTries < SPINE_RETRY_MS.length) this._retryAt = nowMs() + SPINE_RETRY_MS[this._spineTries++];
    });
  }

  _formSpec() {
    const form = this.form || (isManifold(this.info) ? 'Default' : null);
    const f = form ? (FORMS[this.info.spine || this.info.defId] || FORMS[this.info.charId])?.[form] || null : null;
    if (f?.combat && this._manifoldCombat) return { ...f, roles: { ...f.roles, attack: loop(f.combat), skill: { ...f.roles.skill, loop: f.combat } } };
    return f;
  }

  /** Existing 'copy' fx: select one official form, before its next attack (both board renderers). */
  copyFrom(rec) {
    if (!isManifold(this.info)) return;
    const form = manifoldCopyForm(rec);
    if (form) this.setForm(form);
  }

  _selectMakotoAttack() {
    if (this.info.charId !== 'char_4217_makoto' || !this.actor) return;
    const prefix = !this.form ? 'Attack_' : this.form === 'makoto_s3a' ? 'Doll_Skill_3_P1_Attack_' : null;
    const name = prefix && prefix + ((this._makotoAttackN || 0) % 2 ? 'B' : 'A');
    this.actor.attackAnimation = name && this.actor.has(name) ? name : null;
  }

  _attackForm(kind) {
    if (!isManifold(this.info)) return;
    const form = manifoldAttackForm(kind);
    const combat = kind === 'none' && !!(this.flags & UF.BLOCKED), changed = combat !== this._manifoldCombat;
    this._manifoldCombat = combat;
    // A late join / split clone has no copy event. Do not replay a transformation over its attack.
    if (form && form !== this.form) this.setForm(form, { late: Infinity });
    else if (changed && this.actor) this.actor.setForm(this._formSpec()?.roles || null);
  }

  /**
   * The unit changed mode (the `form` of a sim fx — shared/protocol.js fxForm; `fx` = that fx's extra): the mode's clip
   * set (FORMS) after its change clip, and its closing clip (`end`, landing in the `next` form's clips) timed to end
   * `fx.dur` game s later — the unit is still in this mode while it plays (an ember can be beaten in its last second),
   * so this mode's death clip stays until the next mode's fx; null goes back to the manifest clips (through the old
   * mode's `leave` clip when it has one: a 替身's 本体 coming back); a kind this skeleton has no clip set for (an arts
   * barrier, a broken charge …) changes nothing. Kept for a model built later.
   */
  setForm(kind, fx = null) {
    const k = typeof kind === 'string' ? kind : null;
    if (k === this.form) return;
    if (k && !(FORMS[this.info.spine || this.info.defId] || FORMS[this.info.charId])?.[k]) return;
    const prev = this._formSpec();
    this.form = k;
    this.info.form = k;
    if(this.info.charId==='char_4217_makoto'){this._makotoAttackPlayback=null;this._formElapsed=k?Math.max(0,Number(fx?.late)||0):null;this._modelDirty=true;}
    if (this.imp) this.imp.dirty=true;
    const f = this._formSpec();
    if (!this.actor) return;
    const dur = fx && Number(fx.dur);
    let next = f && f.next ? (FORMS[this.info.spine || this.info.defId] || FORMS[this.info.charId])?.[f.next]?.roles || null : null;
    if (next && typeof f.roles.die === 'string') next = { ...next, die: f.roles.die };
    // an fx handed out late (render/app.js: a stall, a hidden tab) skips a change clip that would already have ended
    const late = fx && Number(fx.late) > 0 ? Number(fx.late) : 0;
    const change = f && f.change && !(late > 0 && late >= (this.actor.dur?.(f.change) ?? Infinity)) ? f.change : null;
    if (f) this.actor.setForm(f.roles, change, f.end && dur > 0 ? { clip: f.end, in: dur, roles: next } : null, f.sequence ? {sequence:f.sequence,elapsed:late} : null);
    else if (prev) this.actor.setForm(null, prev.leave && !(late > 0 && late >= (this.actor.dur?.(prev.leave) ?? Infinity)) ? prev.leave : null, null, fx && this.info.charId==='char_4217_makoto' ? {complete:true} : null);
  }

  // ---- HUD -------------------------------------------------------------------------------------------------

  _buildHud() {
    const P = this.P, h = this.hud;
    // official bars: a soft drop shadow behind the HP (+ SP) bars
    this.barShadow = bar(P, h, 0x000000, 0.32); this.barShadow.visible = false;
    this.hpBg = bar(P, h, COLORS.hpBack, 1);
    this.hpGhost = bar(P, h, COLORS.hpGhost, 0.9);
    this.hpFill = bar(P, h, this.isEnemy ? (this.isBoss ? COLORS.hpBoss : COLORS.hpEnemy) : COLORS.hpAlly);
    this.negFill = bar(P, h, COLORS.hpNeg);
    this.shieldBar = bar(P, h, 0xffffff, 1);
    this.spBg = bar(P, h, COLORS.hpBack, 1);
    this.spFill = bar(P, h, COLORS.sp);
    this.ammoDividers = new P.Graphics(); h.addChild(this.ammoDividers);
    this.spGlow = new P.Sprite(fxAtlas().tex.glow);
    this.spGlow.anchor.set(0.5);
    this.spGlow.tint = COLORS.spReady;
    this.spGlow.blendMode = P.BLEND_MODES.ADD;
    h.addChild(this.spGlow);
    // nothing shows until the first HUD update decides (a culled or prep view never draws bars)
    for (const b of [this.hpBg, this.hpGhost, this.hpFill, this.negFill, this.shieldBar, this.spBg, this.spFill, this.spGlow]) b.visible = false;
    this.chip = null;
    // operators only: summon tokens have no tier (hand and field alike)
    if (!this.isEnemy && !this.isToken && this.info.kind !== 'device') {
      this.chip = new P.Sprite(tierChip(this.tier, this.golden));
      this.chip.anchor.set(0.5);
      h.addChild(this.chip);
    }
    this.icons = [];
    for (let i = 0; i < 4; i++) {
      const s = new P.Sprite(P.Texture.EMPTY);
      s.anchor.set(0.5);
      s.visible = false;
      h.addChild(s);
      this.icons.push(s);
    }
    this.blockIcon = new P.Sprite(statusTexture('blocked'));
    this.blockIcon.anchor.set(0.5);
    this.blockIcon.visible = false;
    this.ctx.layers.groundFx.addChild(this.blockIcon);
    this.countText = null;
    this.ammoText = null;          // 设置「弹药数量」: the magazine's count under the ammo bar (_updateAmmoCount)
    this.itemPips = [];
  }

  /** Show a stack count (token stacks in the hand) — BitmapText-free: a tiny canvas-less chip via Text. */
  setCount(n) {
    const P = this.P;
    if (!(n > 1)) { if (this.countText) this.countText.visible = false; return; }
    if (!this.countText) {
      this.countText = new P.Text('', { fontFamily: 'Bender, Oxanium, sans-serif', fontSize: 22, fontWeight: '700', fill: '#ffffff', stroke: '#0b0f0e', strokeThickness: 5 });
      this.countText.anchor.set(0.5);
      this.hud.addChild(this.countText);
    }
    this.countText.text = `×${n}`;
    this.countText.visible = true;
  }

  /** Persistent corrosion haze follows the target, never the camera. */
  setCorrosion(n){
    this.corrosionStacks=Math.max(0,Number(n)||0);
    if(this.corrosionFx)this.corrosionFx.visible=this.corrosionStacks>0;
    if(!this.corrosionStacks)return;
    if(!this.corrosionFx){
      const P=this.P,fx=new P.Container(),g=new P.Graphics();
      g.lineStyle(2,0xa4e85e,.7);g.drawEllipse(0,-6,38,10);
      for(const [x,y]of [[-27,-30],[24,-52],[6,-75]]){g.beginFill(0x87c54b,.7);g.drawPolygon([x,y-10,x-4,y,x,y+5,x+4,y]);g.endFill();}
      fx.addChild(g);const glow=new P.Sprite(fxAtlas().tex.glow);glow.anchor.set(.5);glow.width=72;glow.height=90;glow.y=-36;glow.tint=0x76b850;glow.alpha=.15;glow.blendMode=P.BLEND_MODES.ADD;fx.addChild(glow);this.root.addChild(fx);this.corrosionFx=fx;
    }
    this.corrosionFx.visible=true;
  }

  /** Compact note count directly above the target HP bar. */
  setNoteStacks(n) {
    this.noteStacks=Math.max(0,Math.floor(Number(n)||0));
    if(this.noteFx)this.noteFx.visible=this.noteStacks>0;
    if(!this.noteStacks){if(this.noteText)this.noteText.visible=false;if(this.noteIcon)this.noteIcon.visible=false;return;}
    if(!this.noteFx){
      const P=this.P,fx=new P.Container(),glow=new P.Sprite(fxAtlas().tex.glow);
      glow.anchor.set(.5);glow.tint=0xac60f0;glow.alpha=.18;glow.width=92;glow.height=100;glow.x=36;glow.y=-46;glow.blendMode=P.BLEND_MODES.ADD;fx.addChild(glow);
      const clef=new P.Sprite(P.Texture.from('/icons/leithanien-clef.svg'));clef.anchor.set(.5,1);clef.width=32;clef.height=64;clef.x=36;clef.y=-12;fx.addChild(clef);
      const ring=new P.Graphics();ring.lineStyle(1.5,0xb775ed,.65);ring.drawEllipse(0,-8,42,12);fx.addChild(ring);
      // Draw over the opaque enemy model so the active debuff remains visible.
      this.root.addChild(fx);this.noteFx=fx;this.noteClef=clef;
    }
    this.noteFx.visible=true;
    if(!this.noteText){this.noteText=new this.P.Text('',{fontFamily:'Bender, sans-serif',fontSize:12,fontWeight:'700',fill:'#b7a5ed',stroke:'#08120f',strokeThickness:3});this.noteText.anchor.set(0,1);this.hud.addChild(this.noteText);this.noteIcon=new this.P.Sprite(this.P.Texture.from('/icons/leithanien-note.svg'));this.noteIcon.anchor.set(0,1);this.hud.addChild(this.noteIcon);}
    this.noteText.text=String(this.noteStacks);
  }

  /** Equipped item pips (prep): list of item icon URLs. */
  setItems(urls) {
    const P = this.P;
    // morphPairing plus can carry two ordinary items and one zero-slot morph (DESIGN §34.15).
    const list = Array.isArray(urls) ? urls.slice(0, 3) : [];
    while (this.itemPips.length > list.length) this.itemPips.pop().destroy(); // loop-cap: at most three item pips
    list.forEach((u, i) => {
      let s = this.itemPips[i];
      if (!s) { s = new P.Sprite(P.Texture.EMPTY); s.anchor.set(0.5); this.hud.addChild(s); this.itemPips[i] = s; }
      if (s._url === u) return;
      s._url = u;
      const a = this.ctx.assets;
      s.texture = itemTexture(u || 'none', null, 0x4ed8af);
      if (u && a?.image) a.image(u).then((img) => { if (!s.destroyed && s._url === u) s.texture = itemTexture(u, img, 0x4ed8af); }, () => {});
    });
  }

  // ---- state input ---------------------------------------------------------------------------------------

  _baseFromAnim() {
    if (this.statuses.has('stun') || this.anim === ANIM.STUN || (this.flags & (UF.STUNNED | UF.FROZEN | UF.SLEEP))) return 'stun';
    if (this.anim === ANIM.MOVE) return 'move';
    return 'idle';
  }

  /** Apply an interpolated sample (render/interp.js); `t` = the render clock's game time (ring countdowns). */
  sync(s, t) {
    if (!s) return;
    if (Number.isFinite(t)) this.gameT = t;
    // the element gauge shown (b.snap `elem`): element, fill 0..1, cooldown end (game s) and length
    this.el = typeof s.el === 'string' ? s.el : null;
    this.elValue=Number.isFinite(s.elValue)?s.elValue:null;
    this.elFill = this.el ? s.elFill || 0 : 0; this.elUntil = this.el ? s.elUntil || 0 : 0; this.elDur = this.el ? s.elDur || 0 : 0;
    this.followSample(s,t);
    // Snapshots carry the current airborne state, including temporary flight and landing.
    this.airHeight = Number.isFinite(s.airHeight) ? s.airHeight : null;
    const wasFlying = this.flying;
    this.flying = !!(s.flags & UF.FLYING);
    if (this.flying && !wasFlying) this.flightBaseZ = this._airStateSeen ? this.z : this.airHeight != null && !this.isEnemy ? groundZ(this.ctx,s.x,s.y) : 0;
    if (!this.flying) this.flightBaseZ = null;
    if (!this._airStateSeen) {
      this._airStateSeen = true;
      if (this.flying) this.hover = this.airHeight ?? FLY_HOVER;
    }
    // ground enemies only ever walk low tiles (a rounding step onto a block edge must not pop them up)
    const gz = this.flying ? this.flightBaseZ ?? 0 : this.isEnemy ? 0 : groundZ(this.ctx, s.x, s.y);
    if (this.zTarget == null || (this.flying && gz > this.z)) this.z = gz;
    this.zTarget = gz;
    if (s.maxHp > 0 && s.maxHp !== this.maxHp) {
      this.maxHp=s.maxHp;
      // A skill changing max HP is not a hit. Reset the damage trail baseline.
      this.ghostHp=clamp(s.hp,0,this.maxHp);this._trailHp=this.ghostHp;this._trailRemaining=0;
    }
    const hp = clamp(s.hp, 0, this.maxHp);
    if (hp < this.hp - 0.5 && this.isBoss) this.shake = 0.25;
    this.hp = hp;
    this.sp = s.sp; this.spMax = s.spMax;
    this.shieldHp = Math.max(0, s.shieldHp || 0);
    if(this.info.defId==='token_custom_ursus_drone'){
      this.modelK=s.modelScale??1;
      if(s.attackRangeRadius>0)this.info.rangeRadius=s.attackRangeRadius;
    }
    this.snowTiles = s.snowTiles || [];
    this.skillTiles = s.skillTiles;
    this.ammoLeft = s.ammoLeft; this.ammoMax = s.ammoMax || 0;
    if (Array.isArray(s.states)) { const skill = this.statuses.has('skill'); this.statuses = new Set(s.states); if (skill) this.statuses.add('skill'); }
    this.ammo = s.ammo || null; this.wolves = s.wolves || null; this.neg = s.neg > 0 ? Math.min(1, s.neg) : 0;
    this.coins = s.coins || null;
    this.energy = s.energy || null;
    if(Array.isArray(this.energy))this.setEnergy(this.energy[0]);
    this.layers = s.layers > 0 ? s.layers | 0 : 0; this.charges = s.charges || null;
    const prevFlags = this.flags;
    this.flags = s.flags | 0;
    this.anim = s.anim | 0;
    this.moveAnimRate = this.isEnemy && Number.isFinite(s.moveAnimRate) ? Math.max(0,s.moveAnimRate) : 1;
    if (this.isEnemy && this.anim===ANIM.MOVE && !['attack','skillCast'].includes(this.actor?.mode) && Math.abs(s.vx) > 0.08) this.visFacing = s.vx < 0 ? -1 : 1;
    this.coins = s.coins || null;
    this.ammo = s.ammo || null; this.wolves = s.wolves || null; this.neg = s.neg > 0 ? Math.min(1, s.neg) : 0;
    // a stealth-driven form (STEALTH_FORMS: 假想敌：骨刺) follows this snapshot's stealth bit at once — before a DIE in the
    // same snapshot, so it dies in the form it had
    const stealthForm = this.isEnemy && this.alive ? STEALTH_FORMS[this.info.spine || this.info.defId] : null;
    if (stealthForm) {
      const form = this.flags & UF.STEALTH ? null : stealthForm;
      if (form !== this.form) {
        this.setForm(form);
        this.actor?.syncFormPose();
        if (this.imp) this.imp.dirty = true;
      }
    }
    if (this.isEnemy && !this.slide?.keepFacing && Math.abs(s.vx) > 0.08) this.visFacing = s.vx < 0 ? -1 : 1;
    // a scripted sign (心虚设计师, b.snap face) wins while the unit stands: a block freezes vx, so velocity never turns it
    if (this.isEnemy && (s.face === -1 || s.face === 1) && !this.slide) this.visFacing = s.face;
    if ((prevFlags ^ this.flags) & UF.SKILL) this.setSkill(!!(this.flags & UF.SKILL));
    if (this.anim === ANIM.DIE && this.alive) this.die();
    if (this.actor && this.alive && !(this.flags & UF.FROZEN)) this.actor.setBase(this._baseFromAnim());
  }

  /** The way the model looks (−1 left, 1 right); a FIXED_FACING leader keeps its own way whatever turn it is given. */
  get visFacing() { return this.fixedFacing || this._visFacing; }
  set visFacing(v) { this._visFacing = v; }

  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }

  /**
   * The sampled position: the view's — unless a push / pull slide owns it (slideTo), which only anchors where it eases
   * to on it, from the snapshot that carries the destination on (`at`; before that the sample is still sliding or
   * snapping there). sync() starts with it; a dying view gets nothing else (syncView: the DIE window of the snapshots),
   * so a unit killed on the step of its push still lands where the sim put the body (Grok's review of fb7-render).
   */
  followSample(s, t) {
    const sl = this.slide;
    if (!sl) { this.x = s.x; this.y = s.y; }
    else if (!(t < sl.at)) { sl.lx = s.x; sl.ly = s.y; sl.live = true; }
  }

  /**
   * Slide to a displacement's destination (推拉, the `displace` fx at (x, y)) instead of appearing there: `opts.dur` = the
   * fx's 失衡 time in game seconds (real seconds = dur / ctx.animRate), else the DISPLACE_SLIDE·√D fallback.
   * `at` (game s): the time of the snapshot that carries the destination — render/app.js starts the slide as soon as the
   * interpolator shows the interval before it, and until the render clock reaches `at` the view holds where it stood
   * (the sample in between is a lerp or a snap towards the destination). From then on it eases from there into the
   * sampled position — the destination, and the walk the enemy resumes from it —, so it lands without a jump. Without
   * `at` the destination counts as shown. A unit that dies on the way finishes the slide: its body lies where the push
   * put it (the sim's position); a dead one is placed there, a knocked-down one is left to setDown.
   */
  slideTo(x, y, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // already on the way there: app.js starts the slide ahead of the event, then the event itself asks again
    if (this.slide && this.slide.x1 === x && this.slide.y1 === y) return;
    if (this.down) { this.slide = null; return; }
    const dx = x - this.x, dy = y - this.y;
    const D = Math.hypot(dx, dy);
    if (!this.alive || !(D > 0.05)) { this.x = x; this.y = y; this.slide = null; return; }
    const f = Number.isFinite(opts.friction) && opts.friction > 0 ? opts.friction : SLIDE_FRICTION;
    // the sim's 失衡 time (game s) at the playback rate; a slippery tile (f < 1) slides longer
    const rate = this.ctx.animRate?.() || 1;
    const T = Math.max(0.05, (opts.dur > 0 ? opts.dur / rate : clamp(DISPLACE_SLIDE * Math.sqrt(D), 0.12, 0.45)) / f);
    // v0 = 2D/T and a = v0/T run the distance in exactly T with the velocity reaching 0 there, integrated in update().
    // Push and pull fx carry keepFacing by default: the victim retains its pre-hit facing through the slide. Raw
    // displacements have no flag and still face their travel; snapshots take over when the slide ends.
    if (this.isEnemy && !opts.keepFacing) this.visFacing = dx < 0 ? -1 : 1;
    const v0 = 2 * D / T;
    const at = Number.isFinite(opts.at) ? opts.at : -Infinity;
    this.slide = {
      x1: x, y1: y, sx: this.x, sy: this.y, ux: dx / D, uy: dy / D, D, done: 0, v: v0, a: v0 / T, t: 0, dur: T,
      at, live: at === -Infinity, lx: x, ly: y, ox: 0, oy: 0, run: false, wait: 0, keepFacing: opts.keepFacing === true,
    };
  }

  setFacing(f) {
    if (this.isEnemy) { this.facing = f === -1 ? -1 : 1; return; }
    // the legacy ±1 only speaks about left / right: an UP / DOWN operator keeps its direction
    if (f === -1) this.setDir('LEFT');
    else if (this.dir === 'LEFT') this.setDir('RIGHT');
  }

  /**
   * Whether this unit should show its Back model: facing UP and a Back model exists — while it stands. A dead or
   * knocked-out one keeps the Back model only when that skeleton has a fall of its own (4 of the 135 Back models); the
   * others have no Die clip, so the Front model shows the fall and the held knocked-down pose (GitHub issue #25: the
   * Back model went on with its attack loop under the redeploy ring) [ASSUMED: no source says which model the official
   * client lies down with; a Back skeleton without a Die clip cannot show a fall].
   * A skill cast is the same story with the skill clip: while the skill runs (or its clip is still on screen) and only
   * the Front model has an animation for it, the Front model shows it — see _skillFacesFront.
   */
  _wantsBack() {
    const a = this.ctx.assets;
    const id = this.info.spine || this.info.defId;
    // Eyjafjalla's Back skeleton has no Volcano animation, including both skins.
    if (!this.isEnemy && this.info.skillIndex===2 && (this.flags & UF.SKILL) && String(this.info.charId || id).includes('char_180_amgoat')) return false;
    if (this.isEnemy || this.dir !== 'UP' || !id || !a || typeof a.hasBack !== 'function' || !a.hasBack(id,this.info.skin)) return false;
    if ((this.flags & UF.SKILL || this._faceHold > 0) && this._skillFacesFront()) return false;
    if(this.info.charId==='char_4217_makoto'&&this.actor?.mode==='change'&&!this.entryBack)return false;
    if(this.info.charId==='char_4217_makoto'&&this.form){
      const f=FORMS.char_4217_makoto[this.form],back=a.spineEntry?.(id,{back:true,...(this.info.skin?{skin:this.info.skin}:{})});
      if(f){
        // SwitchIn/Out exist only on Front, but the stable persona attacks have
        // authored Back clips. Do not require entry clips for the whole form.
        const required=[f.roles?.idle,f.roles?.attack?.loop].filter(Boolean);
        if(required.some(clip=>!back?.animations?.[clip]))return false;
        const sequence=f.sequence||[f.change].filter(Boolean);
        const front=this._modelEntry(false)?.animations||{};
        const entryDuration=sequence.reduce((n,clip)=>n+(front[clip]||0),0);
        if(this._formElapsed!=null&&this._formElapsed<entryDuration&&sequence.some(clip=>!back?.animations?.[clip]))return false;
      }
    }
    return this.alive || dieClipDur(typeof a.spineEntry === 'function' ? a.spineEntry(id, { back: true }) : null) > 0;
  }

  /**
   * Whether the skill this unit casts is drawn by its Front model: the Back model's role for that skill — `anims.skill`,
   * or `anims.skills[skillIndex]` — is borrowed from the attack triple (`via: 'attack'`: the resolver had no Skill clip
   * to name, tools/assets/anim-roles.mjs) while the Front model's role is a clip of its own. Then the official client
   * cannot show it on the Back model, and turns the Front round for the cast — the maintainer's report of 2026-10-18
   * ("开技能转正面"). That is 10 of the 209 operators (德克萨斯 S2 剑雨, 推进之王, 蛇屠箱, 初雪, 艾雅法拉, 塞雷娅, 年 S1,
   * 铃兰 S3, 斥罪 S2, 耀骑士临光 S2); the 164 Back models with a skill clip of their own keep playing it in place
   * (灰烬's Back skeleton has Skill_Loop_Up / Skill_Idle_Up, excu's has Skill_Up_Begin/Loop/End — the official client
   * does author skills for the up direction), and 75 more have the attack triple on both sides (the skill IS the attack).
   * [ASSUMED] no source names the model for a cast (the data only proves the Back skeleton has nothing to show).
   */
  _skillFacesFront() {
    if (!this.alive || this.isEnemy || this.dir !== 'UP') return false;
    if (!this.ctx.assets || typeof this.ctx.assets.spineEntry !== 'function') return false;
    const role = (e) => {
      const a = e && e.anims;
      if (!a) return null;
      const s = (Number.isInteger(this.info.skillIndex) && a.skills && a.skills[this.info.skillIndex]) || a.skill;
      return s && typeof s === 'object' ? s : null;
    };
    const b = role(this._modelEntry(true));
    const f = role(this._modelEntry(false));
    return !!b && !!f && b.via === 'attack' && f.via !== 'attack' && typeof f.loop === 'string' && f.loop !== '';
  }

  /**
   * How long the Front model stays for a cast (game seconds): the clip an instant skill shows after the flag went off
   * (spine.js plays such a clip once for its own length), else its End clip. 0 = the skill flag alone decides.
   */
  _skillFaceDur(afterFlag) {
    const front = this._modelEntry(false);
    const a = front && front.anims;
    if (!a) return 0;
    const s = (Number.isInteger(this.info.skillIndex) && a.skills && a.skills[this.info.skillIndex]) || a.skill;
    if (!s || typeof s !== 'object' || s.via === 'attack') return 0;
    const durs = (front && front.animations) || {};
    const dur = (n) => (typeof n === 'string' && Number.isFinite(durs[n]) ? durs[n] : 0);
    if (!afterFlag) return !s.begin && !s.end && s.loop !== a.idle ? dur(s.loop) : 0;
    return dur(s.end);
  }

  /**
   * Load the model the unit wants when it is not the one shown or loading (Front ⇄ Back: its direction, or it went down /
   * stood up again). A swap replaces the model in place (_acquireSpine: no diamond in between; a fall or a deploy clip
   * goes on where it is). Nothing before the first model was asked for (no manifest entry yet).
   */
  _syncModel() {
    if (this.entry && this._wantsBack() !== !!this.entryBack) this._loadSpine();
  }

  /** The model's horizontal draw sign: −1 when it is drawn mirrored (facing left; an enemy's own quirks applied). */
  modelFlip() {
    return (this.isEnemy ? (ENEMY_MODEL_FACES_LEFT ? -this.visFacing : this.visFacing) : this.visFacing) * (this.mirrorX ? -1 : 1);
  }

  /**
   * Where a bone of the model is drawn now (render/vfx/mounts.js: the client's BoneFollower mount points — Muzzle, the
   * Special points — move with the skeleton): the first of `names` the skeleton has, as `out.x` tiles along the
   * screen's right from the feet (the facing applied), `out.up` tiles up the model (UNIT.modelScale and the enemy factors
   * applied: the scale the model is drawn at), `out.angle` the bone's angle in the skeleton (degrees counter-clockwise
   * from its x axis, before the facing) and `out.flip` the draw sign; null when no model is drawn or none of the names
   * is a bone of it. `strike`: the bone as the attack clip playing now poses it at its strike frame (SpineActor
   * strikePose — a shot leaves the muzzle at the attack's OnAttack frame, whatever frame the model was last posed in:
   * a swung staff moves 0.3 tiles in a frame); else a clip started since the model was last posed (an attack nobody
   * wound up starts at its strike frame, a wind-up just began) is read at its own pose at its track time (bonePose:
   * not the previous clip's the cross-fade still shows).
   * @param {string|string[]} names
   * @param {{ x: number, up: number, angle: number, flip: number }} [out]
   * @param {boolean} [strike]
   */
  boneOffset(names, out = { x: 0, up: 0, angle: 0, flip: 1 }, strike = false) {
    const a = this.actor;
    const sp = a && this.spineReady && !this.destroyed ? a.spine : null;
    const sk = sp && sp.skeleton;
    if (!sk || typeof sk.findBone !== 'function') return null;
    let b = null;
    for (const n of Array.isArray(names) ? names : [names]) if (n && (b = boneOf(sk, n))) break;
    if (!b) return null;
    const hit = strike && typeof a.strikePose === 'function' ? a.strikePose() : null;
    if (hit) b = bonePose(sp, b, hit.anim, hit.time) || b;
    else if (!a._applied && !a.frozen) b = bonePose(sp, b) || b;
    // pixi-spine keeps the bone's world transform in `matrix` (skeleton space, y down; spine-ts's worldX / worldY else)
    const m = b.matrix;
    const tx = m ? m.tx : b.worldX, ty = m ? m.ty : b.worldY;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const flip = this.modelFlip();
    const k = UNIT.modelScale * this.modelK;
    out.x = tx * k * flip;
    out.up = -ty * k * (this.modelKY ?? 1);
    out.angle = m ? Math.atan2(-m.b, m.a) * (180 / Math.PI) : (typeof b.getWorldRotationX === 'function' ? -b.getWorldRotationX() : 0);
    out.flip = flip;
    return out;
  }

  /**
   * Re-orient an operator / summon (UP|RIGHT|DOWN|LEFT, any case; the direction wheel's live preview and the stored
   * m.private `dir`). Mirrors for LEFT, swaps to the Back model for UP (and back) when the model differs.
   */
  setDir(dir) {
    if (this.isEnemy || this.destroyed) return;
    const d = unitDir({ dir, facing: this.facing });
    if (typeof dir !== 'string' || d === this.dir) return;
    this.dir = d;
    this.info.dir = d;
    this.hasDir = true;
    this.facing = d === 'LEFT' ? -1 : 1;
    this.visFacing = this.facing;
    if (this.imp) this.imp.dirty = true;
    this._syncModel();
  }

  _releaseEntry(entry) {
    try { this.ctx.assets?.spine?.release(entry); } catch { /* ignore */ }
  }

  /** Keep the official mote ring on the battle clock, outside the impostor cache. */
  setMoteState(state) {
    const at=this.ctx.ofx?.time||0;
    this._moteState={...state,at,until:at+(state.ttl||.75)};
    if(this.moteRing&&Number.isFinite(state.phase))this.moteRing.phase=state.phase;
  }

  _syncMoteRing() {
    const st=this._moteState;
    if(!st||!this.alive||this.down||!this.ctx.ofx?.active||(this.ctx.ofx.time||0)>=st.until){
      this.moteRing?.destroy();this.moteRing=null;return;
    }
    if(!this.actor||!this.spineReady)return;
    if(!this.moteRing){
      this.moteRing=new MoteRing({PIXI:this.P,getTexture:()=>this.actor?.effectTexture('C_Eff_Moire_B','C_Eff_Moire_B')});
      this.moteRing.phase=Number(st.phase)||0;
      // A sibling stays live when the body skeleton is parked in the impostor atlas.
      this.body.addChild(this.moteRing.root);
    }
    this.moteRing.phase=(Number(st.phase)||0)+Math.max(0,(this.ctx.ofx.time||0)-st.at)*(Number(st.speed)||30)*Math.PI/180;
    this.moteRing.setState(st.slots?.length||0,st.radius>1.5);
    this.moteRing.sprites.forEach((sprite,i)=>{sprite.visible=!!st.slots[i];});
  }

  /** Destroy the current Spine actor and release its asset entry. */
  _dropActor() {
    this.moteRing?.destroy();this.moteRing=null;
    if (this.imp) {
      try { if (this.imp.slot) this.ctx.impostors?.free(this.imp.slot); this.imp.sprite.destroy(); if (this.imp.rt) this.imp.rt.destroy(true); } catch { /* ignore */ }
      this.imp = null;
    }
    this._box = null;
    this._tint = undefined;   // the next model gets the current tint on its first frame (a knocked-down one its grey)
    const old = this.actor;
    this.actor = null;
    this.spineReady = false;
    if (old) { try { old.destroy(); } catch { /* ignore */ } }
    if (this._actorEntry) this._releaseEntry(this._actorEntry);
    this._actorEntry = null;
  }

  /** An attack was made (b.ev 'atk'). `target` = view or null. */
  onAttack(target, now, kind, allInRange=false, attackInterval=null) {
    if (!this.alive) return;
    this._attackForm(kind);
    this._selectMakotoAttack();
    this._pendingDeployElapsed = null;
    // a one-off cast (PROJ[kind].once: 暴鸰's bomb drop) is no attack rhythm: its clip plays once at its own speed
    const once = !!PROJ[kind]?.once;
    if(attackInterval>0)this.atkInterval=attackInterval;
    if(!once && this.lastAtk === now)return;
    if (!once) {
      if (this.lastAtk >= 0) {
        const d = now - this.lastAtk;
        if (d > 0.05 && d < 6 && !this.hasAttackInterval) this.atkInterval = d;
      }
      this.lastAtk = now;
    }
    if(!this.hasAttackInterval && !allInRange)this.faceTarget(target);
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y, len = Math.hypot(dx, dy) || 1;
      this.lungeDir.x = dx / len; this.lungeDir.y = dy / len;
    }
    this.lunge = 1;
    if(this._makotoAttackPlayback&&this._makotoAttackPlayback.form===this.form)this._makotoAttackPlayback.struck=true;
    if (this.actor) {this.actor.castStrike?.(this._takeStrike(now));this.actor.attack(this.atkInterval, once);}
    if (this.info.charId === 'char_4217_makoto' && !once) this._makotoAttackN = (this._makotoAttackN || 0) + 1; // game seconds: the actor's clock runs in game time
    if (this.imp) this.imp.dirty = true;
  }

  /**
   * An attack by this unit is `lead` game seconds ahead in the snapshot buffer: start the Spine attack wind-up now
   * so the strike frame lines up with the attack. True once started (then stop calling for that attack). `kind` = the
   * 'atk' projKind (a one-off cast winds up at the clip's own speed).
   */
  windUp(lead, kind, castSlot = null, interval = null) {
    if(Number.isFinite(interval)&&interval>0){this.atkInterval=interval;this.hasAttackInterval=true;}
    if (!this.alive || !this.actor || !this.spineReady) return false;
    this._attackForm(kind);
    this._selectMakotoAttack();
    this.actor.castStrike?.(this._strikeClip(castSlot));
    const ok = this.actor.windUp(this.atkInterval, lead, !!PROJ[kind]?.once);
    if (!ok) this.actor.castStrike?.(null);
    if (ok && this.imp) this.imp.dirty = true;
    return ok;
  }

  faceTarget(target) {
    if (target && !this.info.fixedFacing && !this.info.omnidirectional && this.info.kind !== 'device' && Math.abs(target.x-this.x)>.25)
      this.visFacing = target.x<this.x ? -1 : 1;
  }

  onAttackStart(target, lead, interval, allInRange=false, attackMode, at=this.gameT) {
    this.atkInterval = interval;
    this.hasAttackInterval = true;
    if(!allInRange)this.faceTarget(target);
    this._selectMakotoAttack();
    if(this.info.charId==='char_4217_makoto'){
      const prefix=!this.form?'Attack_':this.form==='makoto_s3a'?'Doll_Skill_3_P1_Attack_':null;
      const clip=prefix?prefix+((this._makotoAttackN||0)%2?'B':'A'):this.form==='makoto_s1'?'Doll_Skill_1_Attack':null;
      this._makotoAttackPlayback={at,lead,interval,clip,form:this.form,struck:false};
    }
    if (this.actor) {
      this._prepareMakotoAttackActor();
      this.actor.fortressMelee=attackMode==='melee';this.actor.beginAttack(interval, lead);
    }
    if (this.imp) this.imp.dirty = true;
  }

  _prepareMakotoAttackActor(){
    if(this.info.charId==='char_4217_makoto'&&this.actor?.mode==='change'&&(!this.form||['makoto_s1','makoto_s3a'].includes(this.form))){
      // The authoritative attack start means the protected transition has ended, even if the last render tick lags.
      this.actor.setForm(this._formSpec()?.roles||null,null,null,{complete:true});
    }
  }

  /** Model replacement resumes the current swing; it must not replay its start or lose its strike. */
  _resumeMakotoAttack() {
    const r=this._makotoAttackPlayback,a=this.actor;
    if(!r||!a||!r.clip||r.form!==this.form||!a.has(r.clip)||this.flags&(UF.STUNNED|UF.FROZEN))return false;
    const elapsed=Math.max(0,this.gameT-r.at),hit=a._hitTime(r.clip,a.dur(r.clip)),speed=r.lead>0?hit/r.lead:Math.max(1,Math.min(4,a.dur(r.clip)/r.interval));
    if(!(speed>0)||elapsed>=a.dur(r.clip)/speed)return false;
    a.attackAnimation=r.clip;
    this._prepareMakotoAttackActor();
    if(!a.beginAttack(r.interval,r.lead))return false;
    a.update(elapsed);
    if(r.struck)a.wound=false;
    return true;
  }

  onAttackCancel() {
    this._makotoAttackPlayback=null;
    this.actor?.cancelAttack();
    if (this.imp) this.imp.dirty = true;
  }

  setEnergy(n) {
    this.energyCount=Math.min(this.info.energyMax || 3,Math.max(0,Math.floor(Number(n)||0)));
    if(!this.energyText){
      this.energyText=new this.P.Text('',{fontFamily:'Bender, Oxanium, sans-serif',fontSize:12,fontWeight:'700',fill:'#ba9bff',stroke:'#080a10',strokeThickness:2});
      this.energyText.anchor.set(.5);this.hud.addChild(this.energyText);
    }
    this.energyText.text='●'.repeat(this.energyCount)+'○'.repeat(Math.max(0,(this.info.energyMax||3)-this.energyCount));
    this.energyText.visible=this.alive&&!this.prep&&!(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active);
  }

  onHit() { this.flash = 1; }

  setSkill(on) {
    if (this.imp) this.imp.dirty=true;
    this.flags = on ? this.flags | UF.SKILL : this.flags & ~UF.SKILL;
    if (on) this.statuses.add('skill'); else {
      this.statuses.delete('skill');
      this.skillTiles = undefined;
      if (this.skillZone) { this.skillZone.clear(); this.skillZone.visible = false; }
      for (const extra of this.skillZoneExtra.values()) { extra.clear(); extra.visible = false; }
    }
    if(this.isEnemy&&on&&this.actor?.roles.skill?.via==='attack')this.actor.skillOn=true;
    else if (this.actor) this.actor.setSkill(on,{instant:this.isEnemy || this.info.skillDuration===0 && !this.info.skillNextAttack});
    if (this._skillFacesFront()) {
      const d = this._skillFaceDur(!on);
      if (d > 0) this._faceHold = Math.max(this._faceHold, d);
      this._modelDirty = true;
    }
  }

  /**
   * The sim's `cast` event at render time `now` (render/app.js, after setSkillSlot): a slot whose clip is `strike`
   * (tools/assets/spine.mjs PREFAB_SPINE_ROLES: an attack-class skill the sim casts in its attack's `before` hook —
   * 杰斯顿·威廉姆斯, “碎铳之簧”) is the attack of the same tick, so the next attack (onAttack, within STRIKE_WINDOW) plays that
   * clip in place of the attack clip. Any other slot changes nothing here.
   */
  setSkillSlot(index) {
    if(!Number.isInteger(index)||index<0||this.info.skillIndex===index)return;
    this.info.skillIndex=index;
    this.actor?.setSkillIndex(index);
  }

  onCast(index, now, turnClip = null) {
    this._cast = this._strikeClip(index) ? { index, t: now } : null;
    if (turnClip != null) this._turnCast(index, turnClip);
  }

  /** The `strike` clip of skill slot `index` in this unit's model (`anims.skills`), else null. */
  _turnClip(index, clip) {
    if (!(clip > 0) || !this.actor) return null;
    const an = this.actor.entry?.anims || {};
    const c = an.skills?.[String(index)] || an.skill;
    return c && this.actor.has?.(c.loop) ? c : null;
  }

  _turnCast(index, clip) {
    if (!this.alive || !this.actor) return;
    this._pendingDeployElapsed = null;
    const c = this._turnClip(index, clip);
    this.actor.castStrike?.(c);
    this.actor.attack(this.atkInterval, !!c);
    if (this.imp) this.imp.dirty = true;
  }

  windUpCast(lead, index, clip) {
    if (!this.alive || !this.actor || !this.spineReady) return false;
    const c = this._turnClip(index, clip);
    this.actor.castStrike?.(c);
    const ok = this.actor.windUp(this.atkInterval, lead, !!c);
    if (!ok) this.actor.castStrike?.(null);
    if (ok && this.imp) this.imp.dirty = true;
    return ok;
  }

  _strikeClip(index) {
    if (!Number.isInteger(index) || index < 0) return null;
    const c = this.actor?.entry?.anims?.skills?.[String(index)];
    return c && c.strike ? c : null;
  }

  /** The strike clip of the cast this attack (at `now`) makes — every target's 'atk' of that tick —; null for a plain attack. */
  _takeStrike(now) {
    const c = this._cast;
    if (c && now - c.t > STRIKE_WINDOW) this._cast = null;
    return c && now - c.t >= 0 && now - c.t <= STRIKE_WINDOW ? this._strikeClip(c.index) : null;
  }

  onDeploy() {
    this._pendingDeployElapsed = 0;
    this.fadeIn = 0;
    if (!this.alive) this.revive();
    this._pendingDeployElapsed = this.actor ? null : 0;
    if (this.actor) this.actor.deploy();
  }

  /**
   * A prep piece lands (PR #416 by @Cromemadnd; see the header): its Start clip again — a model still loading continues it
   * by the time gone (onDeploy, 0.2.3) — and its landing sound, once. Refused (false) for anything but an idle prep piece
   * (a battle unit, one dying, lifted by a drag, or in another clip) and for a piece whose Start already plays: a second
   * trigger of the same landing — a purchase then a move, the round start's replay over a piece just put down — changes
   * nothing and sounds nothing. Refused in a hidden tab too: no frame shows it there, and the clip and the suspended audio
   * would only play it, stale, once the tab is back.
   * @returns {boolean} whether the Start clip started and the landing sound was asked for
   */
  land() {
    if (this.destroyed || !this.prep || this.isEnemy || !this.alive || this.dying > 0 || this.lift > 0) return false;
    if (globalThis.document?.hidden) return false;
    if (this.deploying()) return false;
    if (this.actor && this.actor.mode !== 'base') return false;
    this.onDeploy();
    this._landUntil = nowMs() + this._startDur() * 1000;
    try { this.ctx.audio?.deployCue?.({ def: this.info.spine || this.info.defId, defId: this.info.defId, kind: this.info.kind }, this.id); } catch { /* the sound never stops the landing */ }
    return true;
  }

  /**
   * Whether the Start clip plays now: on the model, owed to a model still loading (onDeploy), or a landing (land) cued less
   * than a clip ago — the last covers a model without a Start clip and a view without a model.
   */
  deploying() {
    if (this.actor && this.actor.deployElapsed() != null) return true;
    if (!this.actor && this._pendingDeployElapsed != null && this._pendingDeployElapsed < this._startDur()) return true;
    return nowMs() < this._landUntil;
  }

  /** Seconds of the Start clip of the model asked for (its manifest entry), START_CLIP_FALLBACK without one. */
  _startDur() {
    const e = this.entry;
    const name = e && e.anims && typeof e.anims.deploy === 'string' ? e.anims.deploy : null;
    const d = name && e.animations && Object.hasOwn(e.animations, name) ? Number(e.animations[name]) : NaN;
    return Number.isFinite(d) && d > 0 ? d : START_CLIP_FALLBACK;
  }

  onStatus(key, on) {
    if (typeof key !== 'string') return;
    if (on) this.statuses.add(key); else this.statuses.delete(key);
    if (key === 'stun' && this.alive && !(this.flags & UF.FROZEN)) this.actor?.setBase(on ? 'stun' : this._baseFromAnim(this.anim));
  }

  /**
   * The unit died: its Die clip plays, then it fades (unless it stays down, setDown). `instant`: it starts on the held
   * end of the clip — a unit that is already down (a field joined mid-battle, an operator entering 联防 knocked out).
   * An operator facing UP whose Back model has no Die clip (GitHub issue #25) falls with its Front model: the swap is
   * made by this frame's update (`_modelDirty` → _syncModel, after every event and snapshot of the frame, so a death
   * and a redeploy in one frame — a 突袭 jump, a 不屈 revive, a backlog after a hidden tab — load nothing); meanwhile the
   * Back model holds still (SpineActor.die), and the Front model's Die clip times the fade. The form it dies in
   * (`_dieForm`: a 傀儡师's 替身, which the sim resets right after the 'die' event) gives that model — and any built while
   * it lies down — its death clip, until it stands up again.
   */
  die(instant = false) {
    if (!this.alive) return;
    this._pendingDeployElapsed = null;
    this.alive = false;
    this.statuses.delete('skill');
    this.skillTiles = undefined;
    if (this.skillZone) { this.skillZone.clear(); this.skillZone.visible = false; }
      for (const extra of this.skillZoneExtra.values()) { extra.clear(); extra.visible = false; }
    this.snowFx.clear();
    this._modelDirty = true;
    this._dieForm = this._formSpec();
    let d = this.actor ? this.actor.die() : 0;
    if (this.actor && !d) d = this._fallDur();
    const rate = this.ctx.animRate?.() || 1;
    this.dieT = 0;
    this.dying = clamp(d / rate, 0.35, DIE_CLIP_MAX) + DIE_FADE_TAIL;
    this.dieDur = this.dying;
    if (instant) { this.dieT = 30; if (this.actor) this.actor.update(30); }
  }

  /** Seconds of the fall of the model the unit wants now (its manifest entry's Die clip), 0 without one. */
  _fallDur() {
    const a = this.ctx.assets;
    const id = this.info.spine || this.info.defId;
    return a && typeof a.spineEntry === 'function' && id ? dieClipDur(a.spineEntry(id, { back: this._wantsBack() })) : 0;
  }

  /** Standing again (a redeploy, a revive): an operator facing UP gets its Back model back (this frame's update). */
  revive() {
    this.alive = true;
    this._modelDirty = true;
    // a model built while it lay in a form's death pose (_dieForm) stands up on the unit's own clips
    if (this._dieForm && this.actor && !this._formSpec()) this.actor.setForm(null);
    this._dieForm = null;
    this.dying = 0; this.remove = false; this.alpha = 1;
    this.down = null;
    this.hp = this.maxHp; this.ghostHp = this.hp;
    if (this.actor) this.actor.revive();
  }

  /**
   * Knocked-out state (b.snap `down` entry `[id, respawnAt, respawnTime, state, row?, col?]`, render/interp.js downAt)
   * or null; `t` = the render clock's game time. A living view is knocked down first (its Die clip plays; `instant`: a
   * view made for a unit that is already down — a field joined mid-battle — starts on the held end of the clip). While
   * down the view never fades: the Die clip's last frame stays on the tile the entry names (the view moves there when
   * it stands elsewhere: a body that went back to its home, a view built from the unit's deploy info) under the
   * redeploy ring. null on a view still down (it left for good) starts the fade; the redeploy itself comes through
   * onDeploy / revive.
   */
  setDown(d, t, instant = false) {
    if (Number.isFinite(t)) this.gameT = t;
    if (!d) {
      if (!this.down) return;
      this.down = null;
      if (!this.alive) { this.dying = DIE_FADE_TAIL; this.dieDur = DIE_FADE_TAIL; }
      return;
    }
    if (this.alive) this.die(instant);
    if (Number.isInteger(d[4]) && Number.isInteger(d[5]) && (this.x !== d[5] || this.y !== d[4])) {
      this.x = d[5]; this.y = d[4];
      this.z = this.zTarget = groundZ(this.ctx, this.x, this.y);
    }
    if (this.zTarget == null) this.z = this.zTarget = groundZ(this.ctx, this.x, this.y); // never synced: its tile top
    this.dying = 0; // no death fade while down
    const dn = this.down || (this.down = { until: 0, total: 0, state: DOWN_STATE.COUNTING });
    dn.until = Number(d[1]) || 0;
    dn.total = Math.max(0, Number(d[2]) || 0);
    dn.state = d[3] | 0;
  }

  // ---- per frame -------------------------------------------------------------------------------------------

  /** @param {number} dt real seconds @param {any} cam camera @param {number} t real clock */
  update(dt, cam, t) {
    if (this.destroyed) return;
    this._syncMoteRing();
    this._updateHpTrail(dt);
    if(this._formElapsed!=null)this._formElapsed+=dt*(this.ctx.animRate?.()||1);
    if(this.info.charId==='char_4217_makoto'&&this.dir==='UP')this._modelDirty=true;
    if(this._pendingDeployElapsed != null)this._pendingDeployElapsed += dt*(this.ctx.animRate?.() || 1);
    // a displacement's slide (slideTo): held where it stood until the snapshot with the destination is shown, then
    // eased into the sampled position (sync keeps `lx, ly` current) under a constant deceleration
    if (this.slide) {
      const sl = this.slide;
      if (this.down) this.slide = null;   // a knocked-down view lies on its tile (setDown)
      else if (!sl.live) {
        this.x = sl.sx; this.y = sl.sy;
        // the destination's snapshot never shown (the unit left the snapshots, a stalled stream): it slides to the
        // destination the fx named
        if ((sl.wait += dt) > 0.5) sl.live = true;
      } else {
        if (!sl.run) { sl.run = true; sl.ox = sl.sx - sl.lx; sl.oy = sl.sy - sl.ly; }
        const step = Math.min(dt, 0.1);                // a hidden tab's catch-up frame must not overshoot
        const v0 = sl.v;
        sl.v = Math.max(0, sl.v - sl.a * step);        // friction: the velocity decays every frame
        // the step's mean velocity — exact under a constant deceleration (the end-of-step speed fell ~D·dt/T short:
        // 9 % of a 0.18 s slide at 60 fps, then a jump onto the end)
        sl.done = Math.min(sl.D, sl.done + (v0 + sl.v) / 2 * step);
        sl.t += step;
        if (this.isEnemy && !sl.keepFacing) this.visFacing = sl.ux < 0 ? -1 : 1;
        const k = 1 - sl.done / sl.D;                  // the share of the way still to go
        this.x = sl.lx + sl.ox * k; this.y = sl.ly + sl.oy * k;
        // the clock or the spent velocity lands it on the sampled position
        if (sl.t >= sl.dur - 1e-9 || sl.done >= sl.D - 1e-9 || sl.v <= 1e-9) { this.x = sl.lx; this.y = sl.ly; this.slide = null; }
      }
    }
    const P = this.P;
    // Ground overlays have their own layer: invalidate before any off-screen early return.
    if (this.skillZone && (this.ctx.settings?.skillRanges === false || !this.alive || this.down || (!this.statuses.has('skill') && !this.skillTiles?.length))) { this.skillZone.clear(); this.skillZone.visible = false; }
    if (!this.alive) this.snowFx.clear();
    if (!this.skillZone && this.skillTiles?.length) { this.skillZone = new P.Graphics(); this.ctx.layers.groundFx.addChild(this.skillZone); }
    // the cast's clip still on screen: once it played out and the skill is off, the Back model comes back (_skillFacesFront)
    if (this._faceHold > 0) {
      this._faceHold = Math.max(0, this._faceHold - dt * (this.ctx.animRate?.() ?? 1));
      if (!this._faceHold && !(this.flags & UF.SKILL)) this._modelDirty = true;
    }
    // the model for the state the frame's events and snapshot left (Front ⇄ Back when it went down / stood up: die, revive)
    if (this._modelDirty) { this._modelDirty = false; this._syncModel(); }
    // a failed / timed-out model load is tried again once its wait is over (SPINE_RETRY_MS; frames only: never hidden)
    if (this._retryAt && nowMs() >= this._retryAt) { this._retryAt = 0; if (!this.actor && !this._spineBusy) this._loadSpine(true); }
    // a load begun in a hidden tab and still in flight SPINE_STUCK_MS after it came back: started again (GitHub #68)
    if (this._stuckAt && nowMs() >= this._stuckAt) {
      this._stuckAt = 0;
      if (!this.actor && this._spineBusy && this.entry) { this._spineHidden = false; this.ctx.assets?.spine?.restart?.(this.entry); }
    }
    if (this.zTarget != null && this.z !== this.zTarget) {
      const d = this.zTarget - this.z;
      this.z = Math.abs(d) < 1e-3 ? this.zTarget : this.z + d * Math.min(1, dt * 12);
    }
    if (this.shadowZTarget != null && this.shadowZ !== this.shadowZTarget) {
      const d = this.shadowZTarget - this.shadowZ;
      this.shadowZ = Math.abs(d) < 1e-3 ? this.shadowZTarget : this.shadowZ + d * Math.min(1, dt * 12);
    }
    // a flyer keeps its lift through the Die clip and drops only as it fades out: the client removes the fly offset in
    // CharacterAnimator.OnFinish, when the finish state ends; a knocked-down flyer lies on the ground
    const hoverTo = this.flying && (this.alive || (this.dying > DIE_FADE_TAIL && !this.down)) ? (this.airHeight ?? FLY_HOVER) : 0;
    if (this.hover !== hoverTo) this.hover = Math.abs(hoverTo - this.hover) < 1e-3 ? hoverTo : this.hover + (hoverTo - this.hover) * Math.min(1, dt * 6);
    const submerged = submergedVisual(this.ctx, this);
    const sinkTo = submerged ? (this.isEnemy ? -.28 : -.18) : 0;
    this.waterSink = (this.waterSink || 0) + (sinkTo - (this.waterSink || 0)) * Math.min(1, dt * 12);
    if (Math.abs(this.waterSink - sinkTo) < .001) this.waterSink = sinkTo;
    this.placed = true;
    const visualX = this.x + (this.bossArea?.dx || 0);
    const p = cam.project(visualX, this.y, this.z - STAND_SINK + this.hover + this.lift + this.waterSink, this.screen);
    const s = p.s;
    // State effects follow the projected unit, including flying height, rather than the camera.
    const visualStates = this._iconKeys(Infinity).filter(k=>['freeze','cold','burn','poison','shield','refraction','stealth','stun','sleep','invuln','bind','slow','silence','fear','fragile','weaken','healFree','neural','necrosis'].includes(k));
    if ((this.flags & UF.SHIELD) && !visualStates.includes('shield')) visualStates.push('shield');
    if (this.statuses.has('ab:rockCharge')) visualStates.push('rage');
    if (this.statuses.has('ab:mirrorCrack2')) visualStates.push('mirrorCrack2');
    else if (this.statuses.has('ab:mirrorCrack1')) visualStates.push('mirrorCrack1');
    if (this.statuses.has('ab:rage') || this.statuses.has('ab:lowhp')) visualStates.push('rage');
    const authoredStates = [...(this.form ? [this.form] : []), ...visualStates.filter(k => k !== 'stealth'), ...[...this.statuses].map(k => k.split(':').at(-1)).filter(k => !/stealth|invisible/i.test(k))];
    if (this.statuses.has('skill')) authoredStates.push(`skill${(this.info.skillIndex ?? 0)+1}`);
    const authoredState = this.actor?.setVisualStates(authoredStates);
    this.stateFx.clear();
    if (this.alive && !this.down && visualStates.length) {
      const colors = {stun:0xf1ce76,sleep:0xbab7e8,invuln:0xf7dfab,freeze:0x74cfff,cold:0xcfe6ff,burn:0xff8e51,poison:0xb899d7,shield:0x80d9c4,refraction:0x7820cc,stealth:0xaaaaaa,rage:0xff5941,bind:0xccaa72,slow:0x709bd1,silence:0xd7bf90,fear:0x925ca8,fragile:0xe9bd83,weaken:0xb39baa,healFree:0xd57777,neural:0xdcba55,necrosis:0x9562bd,mirrorCrack1:0xb9d8eb,mirrorCrack2:0xe1eefa};
      for (const state of visualStates) {
        if((this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active))continue; // official status art only; Notes/corrosion live separately
        if (state !== 'stealth' && (this.actor?.authoredVisualStates?.has(state) || (authoredState && !this.actor?.authoredVisualStates))) continue;
        this.stateFx.lineStyle(Math.max(1.2,s*.018),colors[state],.64);
        if (state === 'freeze') {
          this.stateFx.beginFill(0x9fdcff,.29);
          this.stateFx.drawPolygon([-s*.4,0,-s*.44,-s*.55,-s*.24,-s*.98,s*.12,-s*1.02,s*.42,-s*.55,s*.4,0]);
          this.stateFx.endFill();
          this.stateFx.moveTo(-s*.24,-s*.98).lineTo(0,-s*.35).lineTo(s*.4,0);
          this.stateFx.moveTo(s*.12,-s*1.02).lineTo(0,-s*.35).lineTo(-s*.4,0);
        } else if (state === 'stealth') {
          // The textured mist is animated separately; no circular geometry.
        } else if (state === 'shield') {
          this.stateFx.beginFill(0x80d9c4,.14);
          this.stateFx.drawEllipse(0,-s*.42,s*.4,s*.52);
          this.stateFx.endFill();
        }
        else if (state === 'refraction') {
          // Original Refraction is a purple hexagonal membrane, not a blue shield.
          this.stateFx.lineStyle(Math.max(1.8,s*.024),0x7820cc,.58+.08*Math.sin(t*4));
          this.stateFx.beginFill(0x471080,.18);
          this.stateFx.drawPolygon([0,-s*.96,s*.39,-s*.72,s*.39,-s*.19,0,s*.06,-s*.39,-s*.19,-s*.39,-s*.72]);
          this.stateFx.endFill();
          for (let i=0;i<3;i++) {
            const y=-s*(.2+i*.24),x=Math.sin(t*.7+i*2)*s*.17,r=s*.105;
            this.stateFx.drawPolygon(Array.from({length:6},(_,j)=>[x+Math.cos(j*Math.PI/3)*r,y+Math.sin(j*Math.PI/3)*r]).flat());
          }
        } else if (state === 'rage') {
          for (let i=0;i<3;i++) { const x=(i-1)*s*.18;
            this.stateFx.moveTo(x,-s*.1).lineTo(x+s*.03*Math.sin(t*7+i),-s*(.4+.1*Math.sin(t*5+i)));
          }
        } else if (state.startsWith('mirrorCrack')) {
          const count=state==='mirrorCrack2'?5:2;
          for(let i=0;i<count;i++) { const x=(i-(count-1)/2)*s*.12,y=-s*(.2+i*.1);
            this.stateFx.moveTo(x-s*.06,y+s*.13).lineTo(x+s*.03,y).lineTo(x-s*.02,y-s*.15);
          }
        } else if (state === 'bind') {
          this.stateFx.drawEllipse(0,-s*.05,s*.35,s*.1);
          this.stateFx.moveTo(-s*.25,-s*.04).lineTo(s*.25,-s*.25);
          this.stateFx.moveTo(s*.25,-s*.04).lineTo(-s*.25,-s*.25);
        } else if (['silence','healFree'].includes(state)) {
          this.stateFx.drawCircle(0,-s*.85,s*.09);
          this.stateFx.moveTo(-s*.07,-s*.92).lineTo(s*.07,-s*.78);
        } else if (['slow','weaken','fragile'].includes(state)) {
          const y=-s*(.14+Math.sin(t*3)*.02);
          this.stateFx.moveTo(-s*.13,y-s*.07).lineTo(0,y).lineTo(s*.13,y-s*.07);
          this.stateFx.moveTo(-s*.13,y+s*.03).lineTo(0,y+s*.1).lineTo(s*.13,y+s*.03);
        } else if (state === 'stun' || state === 'sleep' || state === 'fear') {
          for (let i=0;i<3;i++) {
            const a=t*2+i*Math.PI*2/3;
            this.stateFx.drawCircle(Math.cos(a)*s*.2,-s*.9+Math.sin(a)*s*.05,s*.035);
          }
        } else if (state === 'cold') {
          for (let i=0;i<3;i++) { const x=(i-1)*s*.2, y=-s*(.2+i*.19);
            this.stateFx.moveTo(x-s*.06,y).lineTo(x+s*.06,y);
            this.stateFx.moveTo(x,y-s*.06).lineTo(x,y+s*.06);
          }
        } else if (['burn','poison','neural','necrosis'].includes(state)) {
          for (let i=0;i<4;i++) { const x=(i-1.5)*s*.16,y=-s*(.1+((t*.7+i*.23)% .65));
            this.stateFx.drawCircle(x,y,s*.04);
          }
        } else this.stateFx.drawEllipse(0,-s*.38,s*.38,s*.48);
      }
    }
    // fades
    if (this.fadeIn < 1) this.fadeIn = Math.min(1, this.fadeIn + dt * 4);
    let alpha = this.fadeIn;
    if (this.down) {
      // knocked down: the Die clip ends and holds its last frame (the actor keeps its clock), no fade
      this.dieT += dt;
      alpha *= DOWN_LOOK.alpha;
    } else if (this.dying > 0) {
      this.dieT += dt;
      this.dying -= dt;
      const tail = DIE_FADE_TAIL;
      if (this.dying < tail) alpha *= Math.max(0, this.dying / tail);
      if (this.dying <= 0) { this.dying = 0; this.remove = true; alpha = 0; }
    }
    if (this.dimmed) alpha *= 0.35;
    this.alpha = alpha;

    const previewAuthoredStealth = this.info.preview && (this.actor?.authoredVisualStates?.has('stealth') || STEALTH_FORMS[this.info.spine || this.info.defId]);
    const mistOn = this.alive && !this.down && !!(this.flags & UF.STEALTH) && !previewAuthoredStealth && !(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active);
    const mistTexture = mistOn ? stealthMistTexture(this.ctx.assets) : null;
    if (mistTexture && !this.stealthMist) {
      this.stealthMist = Array.from({length:4}, () => {
        const sp = new this.P.Sprite(mistTexture);sp.anchor.set(.5);this.root.addChild(sp);return sp;
      });
    }
    if (this.stealthMist) this.stealthMist.forEach((sp,i) => {
      sp.visible = mistOn;
      if (!mistOn) return;
      sp.position.set(Math.sin(t*.55+i*2.1)*s*.16, -s*(.22+i*.20)+Math.sin(t*.4+i)*s*.035);
      sp.width=s*(1.50+i*.07)*.8;sp.height=s*(.82+i*.035)*.8;
      sp.rotation=Math.sin(t*.16+i)*.16;
      sp.alpha=.82+.07*Math.sin(t*.65+i);
    });

    // body placement
    const lungeK = 0;
    this.lunge = Math.max(0, this.lunge - dt * 5);
    const lx = this.lungeDir.x * lungeK, ly = this.lungeDir.y * lungeK;
    let bx = p.x, by = p.y;
    if (lungeK) { const q = cam.project(this.x + lx, this.y + ly, this.z - STAND_SINK + this.hover + this.lift + this.waterSink, LG_P); bx = q.x; by = q.y; }
    this.root.position.set(bx, by);
    if(this.corrosionFx){this.corrosionFx.visible=this.corrosionStacks>0&&this.alive&&!this.down;this.corrosionFx.scale.set(s/100);this.corrosionFx.alpha=.8+.12*Math.sin(t*2);}
    if(this.noteFx){this.noteFx.visible=this.noteStacks>0&&this.alive&&!this.down;this.noteFx.scale.set(s/100);this.noteFx.alpha=.85+.1*Math.sin(t*1.8);if(this.noteClef)this.noteClef.y=-12-3*Math.sin(t*1.8);}
    this.root.alpha = alpha;
    this.root.zIndex = unitDepthKey(cam, this.x, this.y, this.lift, this.flying, this.bossArea);
    // off-screen: nothing to animate or draw (bounds / hit-testing still follow `screen`)
    if (this._cull(bx, by, s, (this.alive && (this.flags & UF.FROZEN)) ? 0 : dt)) return;
    const flipTarget = this.info.fixedFacing ? 1 : this.modelFlip();
    if(this.flipValue == null)this.flipValue=flipTarget;
    this.flipValue += Math.sign(flipTarget-this.flipValue)*Math.min(Math.abs(flipTarget-this.flipValue),dt*2/.1);
    const flip=this.flipValue;


    // shadow (on a raised top it is drawn with that block row, else in the shadow layer under everything)
    const shz=this.shadowZ??this.z;
    placeOnGround(this.ctx, this.shadow, this.ctx.layers.shadow, this.y, shz);
    const sh = cam.project(visualX, this.y, shz, SH_P);
    this.shadow.position.set(sh.x, sh.y);
    const shw = s * (this.isBoss ? 1.6 : 0.95) / this.shadow.texture.width;
    this.shadow.scale.set(shw, shw * (this.shadow.texture === shadowTexture() ? 1 : 1.05));
    this.shadow.alpha = this.ctx.settings?.shadows === false ? 0 : 0.5 * alpha * (this.lift > 0 ? 0.6 : 1);

    this.snowFx.clear();
    if(this.alive && this.snowTiles.length){
      placeOnGround(this.ctx,this.snowFx,this.ctx.layers.groundFx,this.y,this.z);
      for(const [r,c,n] of this.snowTiles){
        this.snowFx.lineStyle(Math.max(.6,s*.009),0xcceeff,.5);
        this.snowFx.beginFill(0xc5e9ff,Math.min(.35,.09+n*.04));
        const points=[];for(const [dx,dy]of [[-.46,-.46],[.46,-.46],[.46,.46],[-.46,.46]]){const q=cam.project(c+dx,r+dy,.025);points.push(q.x,q.y);}
        this.snowFx.drawPolygon(points);this.snowFx.endFill();
      }
    }
    if(this.skillZone){
      const g=this.skillZone;g.clear();g.visible=!(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active) && this.ctx.settings?.skillRanges !== false && this.alive&&!this.down&&!this.info.skillUnlimitedRange&&(this.statuses.has('skill')||!!this.skillTiles?.length);
      for(const extra of this.skillZoneExtra.values()){extra.clear();extra.visible=false;}
      if(g.visible){
        placeOnGround(this.ctx,g,this.ctx.layers.groundFx,this.y,0);
        loadRangeArtColor(this.info,this.ctx.assets);
        const style = skillRangeStyle(this.info);
        style.inset=.065;
        const edgeWidth = clamp(s*.043, 3, 5);
        const tiles=(this.skillTiles || this.info.skillZoneGrid || []).map(([dr,dc])=>this.skillTiles ? [dr-this.y,dc-this.x] : this.dir==='UP'?[dc,-dr]:this.dir==='LEFT'?[-dr,-dc]:this.dir==='DOWN'?[-dc,dr]:[dr,dc]).filter(([r,c]) => rangeTileInside(this.ctx.rangeRect?.(),this.y+r,this.x+c));
        const boundary=skillRangeEdges(tiles,style.inset);
        for(const [r,c] of tiles){
          const tileX=this.x+c,tileY=this.y+r,z=groundZ(this.ctx,tileX,tileY),h=.5;
          let tileGraphics=g;
          if(z>RAISED_Z){
            const key=Math.round(tileY);tileGraphics=this.skillZoneExtra.get(key);
            if(!tileGraphics){tileGraphics=new this.P.Graphics();this.skillZoneExtra.set(key,tileGraphics);}
            tileGraphics.visible=true;placeOnGround(this.ctx,tileGraphics,this.ctx.layers.groundFx,tileY,z);
          }
          const pts=[];for(const [dx,dy]of [[-h,-h],[h,-h],[h,h],[-h,h]]){const q=cam.project(tileX+dx,tileY+dy,z+.02);pts.push(q.x,q.y);}
          tileGraphics.lineStyle(0);
          tileGraphics.beginFill(style.color,(style.fillAlpha+style.pulse*Math.sin(t*1.6))*alpha);tileGraphics.drawPolygon(pts);tileGraphics.endFill();
          // A restrained continuous haze under the dashed boundary preserves
          // the original skill atmosphere without hatching or hiding the tiles.
          if(style.glowAlpha){
            tileGraphics.lineStyle(edgeWidth*1.8,style.color,style.glowAlpha*alpha);
            for(const [x0,y0,x1,y1] of (boundary.get(`${r},${c}`)||[])){
              const a=cam.project(tileX+x0,tileY+y0,z+.02),b=cam.project(tileX+x1,tileY+y1,z+.02);
              tileGraphics.moveTo(a.x,a.y);tileGraphics.lineTo(b.x,b.y);
            }
          }
          // A dark under-stroke follows the same dashes, leaving gaps and fill
          // intact while keeping pale outlines readable against bright terrain.
          const dashes = (boundary.get(`${r},${c}`) || []).flatMap(edge=>skillRangeDashes(edge,false,t*.16));
          tileGraphics.lineStyle(edgeWidth + 3,0x080b10,.6*alpha);
          for(const [x0,y0,x1,y1] of dashes){
            const a=cam.project(tileX+x0,tileY+y0,z+.02),b=cam.project(tileX+x1,tileY+y1,z+.02);
            tileGraphics.moveTo(a.x,a.y+1);tileGraphics.lineTo(b.x,b.y+1);
          }
          // Two soft under-strokes create a restrained glow around each dash.
          // Keep the core crisp and preserve gaps instead of lighting the whole tile.
          for (const [extraWidth, glowAlpha] of [[12,.14],[6,.28],[2,.4]]) {
            tileGraphics.lineStyle(edgeWidth + extraWidth,style.outlineColor,glowAlpha*alpha);
            for(const [x0,y0,x1,y1] of dashes){
              const a=cam.project(tileX+x0,tileY+y0,z+.02),b=cam.project(tileX+x1,tileY+y1,z+.02);
              tileGraphics.moveTo(a.x,a.y);tileGraphics.lineTo(b.x,b.y);
            }
          }
          tileGraphics.lineStyle(edgeWidth,style.outlineColor,.92*alpha);
          for(const [x0,y0,x1,y1] of dashes){
            const a=cam.project(tileX+x0,tileY+y0,z+.02),b=cam.project(tileX+x1,tileY+y1,z+.02);
            tileGraphics.moveTo(a.x,a.y);tileGraphics.lineTo(b.x,b.y);
          }

        }
      }
    }
    if(this.attackRange){
      const g=this.attackRange,r=Number(this.info.rangeRadius);g.clear();g.visible=this.ctx.settings?.unitRanges !== false && this.alive&&!this.down && !((this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active) && /emppnt/.test(this.info.spine||this.info.defId||''));
      if(g.visible){
        placeOnGround(this.ctx,g,this.ctx.layers.groundFx,this.y,this.z);
        const segment=(x0,y0,x1,y1)=>{
          const p=clipRangeSegment(this.ctx.rangeRect?.(),x0,y0,x1,y1);
          if(!p)return;
          const a=cam.project(p[0],p[1],this.z+.015),b=cam.project(p[2],p[3],this.z+.015);
          g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);
        };
        if(this.info.hitArea){
          const a=this.info.hitArea,x=this.x+(a.dx||0),y=this.y+(a.dy||0);
          const points=[[x-a.w/2,y-a.h/2],[x+a.w/2,y-a.h/2],[x+a.w/2,y+a.h/2],[x-a.w/2,y+a.h/2]];
          g.lineStyle(2,0xff9c33,.8*alpha);
          for(let i=0;i<4;i++)segment(...points[i],...points[(i+1)%4]);
        }else{
          const drone=/emppnt|ursus_drone/.test(this.info.spine||this.info.defId||'');
          const color=drone&&this.info.side==='enemy'?0xff654a:0x4ed8af;
          g.lineStyle(1.5,color,(drone?.95:.65)*alpha);
          for(let i=0;i<96;i++){
            const a=i/96*Math.PI*2,b=(i+1)/96*Math.PI*2;
            segment(this.x+Math.cos(a)*r,this.y+Math.sin(a)*r,this.x+Math.cos(b)*r,this.y+Math.sin(b)*r);
          }
        }
      }
    }
    // model / fallback
    const spineShown = this.actor && this.spineReady;
    if (spineShown) {
      if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt * 5);
      this.fallback.alpha = 1 - this.swapT;
      this.fallback.visible = this.swapT < 1;
      const sc = s * UNIT.modelScale * this.modelK;
      if(this.moteRing){this.moteRing.root.scale.set(sc*flip,sc*(this.modelKY||1));this.moteRing.root.alpha=this.swapT;}
      this.body.position.x = -this.bossModelCenter * sc * flip;
      const flashK = this.flash > 0 ? this.flash : 0;
      let tint = this.baseTint;
      if (this.down) tint = DOWN_LOOK.tint;
      else if (this.alive && (this.flags & UF.FROZEN)) tint = 0x9fd4ff;
      else if (this.flags & UF.COLD) tint = 0xcfe6ff;
      if (submerged) tint = mixTint(tint, 0x275d69, .3);
      if ((this.flags & UF.STEALTH) && !previewAuthoredStealth) tint = mixTint(tint,0x26333f,.6);
      if (flashK > 0) tint = mixTint(tint, 0xff8a80, flashK * 0.8);
      this.actor.moveRate = this.moveAnimRate ?? 1;
      let animDt = dt * (this.ctx.animRate?.() || 1);
      if (this._offDt > 0) { animDt += Math.min(0.5, this._offDt); this._offDt = 0; }
      if (this.alive && (this.flags & UF.FROZEN)) animDt = 0;
      let interval = this.ctx.impostorInterval ? this.ctx.impostorInterval() : 0;
      // Preview skeletons retain their full attachments and native frame cadence.
      // Shared atlas masking can erase neighbouring clipped skeletons in a crowded pen.
      const preview = this.info.preview === true;
      const lvl = this.ctx.loadLevel ? this.ctx.loadLevel() : 0;
      if (lvl > 0) {
        this._far = this._far ? s < 60 : s < 52;
        if (lvl >= 2 || this._far) interval = Math.max(interval, 2);
      }
      // Persona entry/change is a short one-shot, not an idle pose to refresh sparsely in a crowd.
      if (this.info.charId === 'char_4217_makoto' && this.actor.mode === 'change') interval = Math.min(interval, 1);
      let clipFlip = false;
      if (this.actor.clipped) {
        const clip = preview || (this.ctx.clipAllowed ? this.ctx.clipAllowed() : true);
        const was = this.actor.clipOn;
        this.actor.setClipping(clip);
        clipFlip = was !== this.actor.clipOn;
        if (clip && this.ctx.impostors) interval = Math.max(1, interval);
      }
      const held = !clipFlip && this.actor.poseHeld();
      if (preview || this.prep) interval = 0;
      // (an impostor needs its box: while its model's clips are still being measured the unit is drawn directly)
      if (interval > 0 && this.ctx.renderer && this._impBox()) {
        if (clipFlip && this.imp) this.imp.dirty = true;   // masks on / off: the slot is redrawn either way
        this._updateImpostor(sc, flip, tint, animDt, interval, held);
      } else {
        if (this.imp) this._leaveImpostor();
        this._drawDirect(sc, flip, tint, animDt, held);
      }
    }
    // the diamond is only needed while no model shows (a cross-fade keeps whatever diamond was already up); a token the
    // official client draws with no model at all shows its effects only
    if (!spineShown && this._noBody) this.fallback.visible = false;
    else if (!spineShown) this._ensurePicture();
    if (!spineShown || this.swapT < 1) {
      const size = s * UNIT.diamond * (this.isBoss ? 1.5 : 1);
      const bob = this.alive && this.isEnemy ? Math.sin(t * 2.4 + this.bob) * s * 0.03 : 0;
      this.fallback.scale.set(size / 160);
      this.fallback.position.set(0, -s * 0.08 + bob);
      this.fallback.tint = this.down ? DOWN_LOOK.tint : this.flash > 0 ? mixTint(0xffffff, 0xff8a80, this.flash) : (this.flags & UF.FROZEN ? 0x9fd4ff : 0xffffff);
      if (!this.alive) this.fallback.alpha = Math.max(0, this.fallback.alpha);
    }
    this.flash = Math.max(0, this.flash - dt * 4.5);

    if (!spineShown && submerged) this.fallback.tint = mixTint(this.fallback.tint, 0x275d69, .3);
    // facing chevron on the ground, like the original's orange › (research 09 §1.2: prep and combat): own prep pieces
    // on the board (app.js sets _showFacing; bench pieces have none); battle / scouting allies whose dir is known
    const wedge = this._showFacing !== undefined ? this._showFacing && this.prep : this.hasDir && this.info.kind !== 'device';
    if (wedge && this.alive) {
      if (!this.facingArrow) {
        this.facingArrow = new P.Sprite(fxAtlas().tex.chevron);
        this.facingArrow.anchor.set(0.5);
        this.facingArrow.tint = 0xff9c33;
        this.ctx.layers.groundFx.addChild(this.facingArrow);
      }
      placeOnGround(this.ctx, this.facingArrow, this.ctx.layers.groundFx, this.y, this.z);
      // on the ground ring, 0.36 tile out along the deploy direction; rotated to the projected direction and
      // foreshortened along it (the chevron texture points right: local x = the pointing axis)
      const [sx, sy] = DIR_STEP[this.dir] || DIR_STEP.RIGHT;
      const c0 = cam.project(this.x, this.y, this.z + 0.01, FA_C);
      const fa = cam.project(this.x + 0.36 * sx, this.y + 0.36 * sy, this.z + 0.01, FA_P);
      const vx = fa.x - c0.x, vy = fa.y - c0.y;
      const len = Math.hypot(vx, vy) || 1;
      this.facingArrow.visible = this.lift <= 0;
      this.facingArrow.position.set(fa.x, fa.y);
      this.facingArrow.rotation = Math.atan2(vy, vx);
      const fs = (s * 0.22) / 64;
      const along = clamp(len / (s * 0.36 || 1), 0.35, 1.2);
      this.facingArrow.scale.set(fs * along, fs * (sy ? 1 : 0.8));
      this.facingArrow.alpha = 0.9 * alpha;
    } else if (this.facingArrow) this.facingArrow.visible = false;

    // elite aura
    if (this.aura) {
      const k = 0.35 + 0.12 * Math.sin(t * 2.2 + this.bob);
      this.aura.alpha = k;
      this.aura.scale.set((s * 1.3) / 128, (s * 1.9) / 128);
    }

    // keep the original short-circuit: many views never build an actor (prep chips, diamonds, tests), so the model
    // only counts when a spine is actually shown
    const actor = spineShown ? this.actor : null;
    const headTiles = this._headTiles = headTilesForUnit({
      isEnemy: this.isEnemy, isBoss: this.isBoss, spineShown,
      bounds: actor && actor.entry ? actor.entry.bounds : null,
      modelK: this.modelK, modelKY: this.modelKY,
    });
    this.screen.top = by - headTiles * s;
    // the boss HUD `hudDx` tiles beside the model, where the official prefab puts it (BOSS_HUD_DX)
    const hx = this.hudDx ? cam.project(this.x + this.hudDx, this.y, this.z - STAND_SINK + this.hover + this.lift, HUD_P).x : bx;
    this._feetY = by;
    this._updateHud(dt, s, hx, by - headTiles * s, alpha, t);
  }

  /**
   * Viewport culling: true (and everything hidden) while the unit's body lies outside the viewport with a margin.
   * Dying units are never culled (their fade must finish and remove the view).
   */
  _cull(bx, by, s, dt) {
    const vp = this.ctx.viewport ? this.ctx.viewport() : null;
    let off = false;
    if (vp && !(this.dying > 0) && !this.lift) {
      const m = s * 1.3;
      off = bx < -m || bx > vp.width + m || by < -m * 0.5 || by - s * 3.6 > vp.height;
    }
    if (off !== this.culled) {
      this.culled = off;
      this.root.visible = !off;
      this.hud.visible = !off;
      this.shadow.visible = !off;
      if (off) { if (this.facingArrow) this.facingArrow.visible = false; this.blockIcon.visible = false; }
    }
    if (off) this._offDt += dt * (this.ctx.animRate?.() || 1);
    return off;
  }

  _updateHpTrail(dt) {
    const hp = clamp(this.hp, 0, this.maxHp);
    if(this._trailMaxHp!=null&&this._trailMaxHp!==this.maxHp){this.ghostHp=hp;this._trailHp=hp;this._trailRemaining=0;}
    this._trailMaxHp=this.maxHp;
    const previous = this._trailHp ?? this.maxHp;
    this.ghostHp = clamp(this.ghostHp, hp, this.maxHp);
    if (hp < previous - .000001) this._trailRemaining = .3;
    if (hp >= this.ghostHp) this._trailRemaining = 0;
    const remaining = this._trailRemaining || 0;
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (remaining > 0) {
      this.ghostHp += (hp - this.ghostHp) * Math.min(1, step / remaining);
      this._trailRemaining = Math.max(0, remaining - step);
    } else this.ghostHp = hp;
    this._trailHp = hp;
  }

  _updateHud(dt, s, x, y, alpha, t) {
    const prep = this.prep;
    const showBars = !prep && this.alive && this.info.kind !== 'item';
    if(this.info.energyMax && !this.energyText)this.setEnergy(this.info.energy || 0);

    const damaged = this.hp < this.maxHp - 0.5;
    const showHp = showBars && !(this.isToken && (this.flags & UF.INVULN)) && (!this.isEnemy || damaged || this.isBoss || this.shieldHp > 0 || this.noteStacks > 0) && !NO_HP_BAR.has(this.info.defId);
    // 设置「HP 바 표시 방식」 official: the client's flat bars (OFFICIAL_BARS) — no frame, no tier chip in battle
    const off = this.ctx.settings?.hpBarStyle === 'official';
    const leader = off && this.isEnemy && !this.isBoss && this.info.tier >= 3;
    // official geometry (measured on the client's battle screens): the bars sit under the unit's feet, about a tile wide
    // (a fixed boss — one that does not walk — spans its body: OFFICIAL_BARS.fixedBossWidth; a walking boss = a leader)
    const fixedBoss = off && this.isBoss && this.fixedBoss;
    const bw = off ? s * (fixedBoss ? OFFICIAL_BARS.fixedBossWidth : OFFICIAL_BARS.width) : clamp(s * (this.isBoss ? UNIT.bossBarWidth : UNIT.barWidth), 24, this.isBoss ? 260 : 96);
    const bh = off ? Math.max(2.5, s * (this.isBoss || leader ? OFFICIAL_BARS.leaderH : OFFICIAL_BARS.hpH)) : clamp(s * (this.isBoss ? 0.09 : 0.065), 3, this.isBoss ? 9 : 6);
    // a knocked-down operator's HUD is its redeploy ring alone, drawn at full strength over the greyed model
    this.hud.alpha = this.down ? this.fadeIn : this.dying > 0 ? 0 : alpha;
    let sx = this.shake > 0 ? Math.sin(t * 90) * this.shake * 10 : 0;
    this.shake = Math.max(0, this.shake - dt);
    const x0 = x - bw / 2 + sx;
    let cy = off ? (this._feetY ?? y) + s * OFFICIAL_BARS.belowFeet : y - 4;
    if(this.noteText){this.noteText.visible=showBars&&this.noteStacks>0;this.noteText.scale.set(clamp(s/90,.65,1));this.noteText.position.set(x0-1+18*clamp(s/90,.65,1),cy-3);this.noteIcon.visible=this.noteText.visible;this.noteIcon.width=this.noteIcon.height=16*clamp(s/90,.65,1);this.noteIcon.position.set(x0-1,cy-3);}
    // HP
    this.hpBg.visible = this.hpFill.visible = showHp;
    this.hpGhost.visible = showHp && !off && this.ghostHp > this.hp + .5;
    if (showHp) {
      const k = this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0;
      const g = this.maxHp > 0 ? clamp(this.ghostHp / this.maxHp, 0, 1) : 0;
      this.hpGhost.position.set(x0, cy); this.hpGhost.width = bw * g; this.hpGhost.height = bh;
      this.hpBg.position.set(x0 - (off ? 0 : 1), cy); this.hpBg.width = bw + (off ? 0 : 2); this.hpBg.height = bh + (off ? 0 : 2);
      this.hpFill.position.set(x0, cy); this.hpFill.width = bw * k; this.hpFill.height = bh;
      if (off) {
        this.hpFill.tint = !this.isEnemy ? OFFICIAL_BARS.ally : this.isBoss || leader ? OFFICIAL_BARS.leader : OFFICIAL_BARS.enemy;
        this.hpBg.tint = leader || this.isBoss ? OFFICIAL_BARS.leaderBack : OFFICIAL_BARS.back;
        this.hpBg.alpha = leader || this.isBoss ? 0.85 : 0.55;
      } else {
        this.hpBg.tint = COLORS.hpBack; this.hpBg.alpha = 1;
        this.hpFill.tint = !this.isEnemy ? COLORS.hpAlly : this.isBoss ? COLORS.hpBoss : COLORS.hpEnemy;
      }
    }
    // 业火 我执: her HP sits on the 1-HP floor and the damage past it fills a pool — the red bar over the drained green one
    const neg = showHp ? this.neg : 0;
    this.negFill.visible = neg > 0;
    if (neg > 0) { this.negFill.position.set(x0, cy); this.negFill.width = bw * neg; this.negFill.height = bh; }
    const shielded = showHp && this.shieldHp > 0;
    this.shieldBar.visible = !!shielded;
    if (shielded) {
      const shieldH = Math.max(1.5, bh * 0.35);
      // Sprite bars use a centred vertical anchor: leave a full pixel above the black HP frame.
      this.shieldBar.position.set(x0, cy - (bh + 2) / 2 - 1 - shieldH / 2);
      this.shieldBar.width = bw * clamp(this.shieldHp / this.maxHp, 0, 1);
      this.shieldBar.height = shieldH;
    }
    // SP
    const ammo = !this.isEnemy ? (this.ammo || ((this.flags & UF.SKILL) && this.ammoMax > 0 ? [this.ammoLeft, this.ammoMax] : null)) : null;
    const showSp = showBars && !this.isEnemy && (this.spMax > 0 || !!ammo);
    this.spBg.visible = this.spFill.visible = showSp;
    this.ammoDividers.clear(); this.ammoDividers.visible = showSp && !!ammo;
    // official: the SP bar is the HP bar's height, right under it (no gap)
    const spH = off ? bh : Math.max(2, bh * 0.55);
    let ready = false;
    let sy = 0;
    if (showSp) {
      let active = !!(this.flags & UF.SKILL) || this.form === 'doll' || /^makoto_(s[123]|change)/.test(this.form || '');
      // a skill that waited for its next attack (b.snap: full while it waits) ends as that attack starts: its duration is
      // the attack's animation — the bar drains over the clip that plays now
      const A = this.actor;
      if (this._wasSkill && !active && this._lastSpK > 0.95 && A && A.mode === 'attack' && A.clock < A.attackUntil) this._skillHold = { until: A.attackUntil, total: Math.max(0.05, A.attackUntil - A.clock) };
      this._wasSkill = active;
      const hold = !active && this._skillHold && A && A.clock < this._skillHold.until ? this._skillHold : null;
      if (!hold) this._skillHold = null;
      if (hold) active = true;
      // a charge skill with a charge stored is ready (full), whatever the next charge's SP; while it runs, its duration
      const stored = Array.isArray(this.charges) && Number(this.charges[0]) >= 1;
      const k = hold ? clamp((hold.until - A.clock) / hold.total, 0, 1) : ammo ? ammo[0] / ammo[1] : !active && stored ? 1 : clamp(this.sp / this.spMax, 0, 1);
      if (!hold) this._lastSpK = k;
      ready = !active && k >= 0.999;
      sy = cy + bh / 2 + spH / 2 + (off ? 0 : 1.5);
      this.spBg.position.set(x0 - (off ? 0 : 1), sy); this.spBg.width = bw + (off ? 0 : 2); this.spBg.height = spH + (off ? 0 : 2);
      this.spBg.tint = off ? OFFICIAL_BARS.back : COLORS.hpBack; this.spBg.alpha = off ? 0.55 : 1;
      this.spFill.position.set(x0, sy); this.spFill.width = bw * k; this.spFill.height = spH;
      this.spFill.tint = (this.flags & UF.OVERHEATED) ? (off ? OFFICIAL_BARS.overload : 0xf04444) : off ? (active ? OFFICIAL_BARS.skill : OFFICIAL_BARS.sp) : ammo ? COLORS.ammo : active ? COLORS.spActive : ready ? COLORS.spReady : COLORS.sp;
      const shownAmmo = ammo ? ((this.flags & UF.OVERDRIVE) ? ammo[1] / 2 : ammo[1]) : 0;
      if (shownAmmo > 1) {
        this.ammoDividers.lineStyle(Math.min(.7, bw / shownAmmo * .3), COLORS.hpBack, .9);
        for (let i = 1; i < shownAmmo; i++) {
          const bx = x0 + bw * i / shownAmmo;
          this.ammoDividers.moveTo(bx, sy - spH / 2).lineTo(bx, sy + spH / 2);
        }
      }
      this._spY = sy;
    }
    this.spGlow.visible = ready && !off;
    this._updateChargeCount(showSp && !prep, off, x0, bw, sy, spH, y, s, t);
    if (ready) {
      const pulse = 0.18 + 0.08 * Math.sin(t * 6);
      this.spGlow.position.set(x0 + bw, this._spY);
      this.spGlow.scale.set((spH * 3) / 128);
      this.spGlow.alpha = pulse;
    }
    // tier chip (left of the bars in battle; above the head in prep)
    if (this.chip) {
      const cs = clamp(s * (prep ? 0.24 : 0.19), 11, 28) / 44;
      this.chip.scale.set(cs);
      this.chip.visible = this.alive && !(off && !prep);
      if (prep) this.chip.position.set(x, y - this.chip.height / 2 + 2);
      else this.chip.position.set(x0 - this.chip.width / 2 - 1, cy + (showSp ? spH / 2 : 0));
    }
    // status icons row above the bars; with the official effects on, a status the client shows with its own effect on the
    // unit (generic.status: 隐匿, 晕眩, 冻结, 沉睡 … — render/vfx/wiring.js status loops) is that effect, not an icon
    const official = !!(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active);
    const icons = official && this.ctx.officialStatusKey ? this._iconKeys(Infinity).filter((k) => !this.ctx.officialStatusKey(k === 'invuln' ? 'invulnerable' : k)).slice(0, 4) : this._iconKeys();
    const isz = clamp(s * 0.26, 12, 26);
    const iy = cy - bh / 2 - isz / 2 - 3;
    for (let i = 0; i < this.icons.length; i++) {
      const ic = this.icons[i];
      const key = icons[i];
      if (!key || !this.alive || prep) { ic.visible = false; continue; }
      const tex = statusTexture(key);
      if (!tex) { ic.visible = false; continue; }
      ic.texture = tex;
      ic.visible = true;
      ic.width = ic.height = isz;
      ic.position.set(x - ((icons.length - 1) * (isz + 2)) / 2 + i * (isz + 2), iy);
    }
    // 狼影 pips under the bars (b.snap `wolves`), then the element gauge row under them (b.snap `elem`); redeploy ring above a
    // knocked-down operator (b.snap `down`)
    const rowsTop = cy + bh / 2 + (showSp ? spH + 1.5 : 0);
    const ammoH = this._updateAmmoCount(showSp && !!ammo && this.ctx.settings?.ammoCount === true, x0 + bw / 2, rowsTop, s);
    const gaugeTop = rowsTop + ammoH;
    let energyH = 0;
    if (this.energyText) {
      this.energyText.visible = showBars && !(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active);
      this.energyText.scale.set(clamp(s / 90, .55, .85));
      if (this.energyText.width > bw) this.energyText.scale.set(this.energyText.scale.x * bw / this.energyText.width);
      // Left aligned with the wolf-life row, below SP; reserve room for other gauges.
      energyH = this.energyText.visible ? this.energyText.height + 2 : 0;
      this.energyText.position.set(x0 + this.energyText.width / 2, gaugeTop + energyH / 2);
    }
    const wolfH = this._updateWolfPips(showBars && !this.isEnemy && !!this.wolves, x0, gaugeTop + energyH, s);
    const coinH = this._updateCoins(showBars && !this.isEnemy && !!this.coins, x0, gaugeTop + energyH + wolfH, s);
    if (this.barShadow) {
      const shadowH = (showHp ? bh : 0) + (showSp ? spH : 0);
      this.barShadow.visible = off && shadowH > 0;
      if (this.barShadow.visible) {
        const top = showHp ? cy - bh / 2 : sy - spH / 2;
        this.barShadow.position.set(x0 - 0.5 + s * 0.012, top + shadowH / 2 + s * 0.016);
        this.barShadow.width = bw + 1; this.barShadow.height = shadowH + 1;
      }
    }
    this._updateElementBar(showBars && !!this.el, x0, bw, gaugeTop + energyH + wolfH + coinH + 1, spH, s, t, off ? { x: x0, y: cy - s * OFFICIAL_BARS.elementAbove } : null);
    this._updateDownRing(!prep && !!this.down && !this.alive, x, this.screen.y - DOWN_LOOK.height * s, s, t);
    // blocked marker at the feet (enemies held by a blocker)
    const blocked = !prep && this.alive && this.isEnemy && (this.flags & UF.BLOCKED);
    this.blockIcon.visible = !!blocked;
    if (blocked) {
      const f = this.screen;
      this.blockIcon.position.set(f.x + (this.visFacing < 0 ? -1 : 1) * s * 0.34, SH_P.y - s * 0.04);
      this.blockIcon.scale.set(clamp(s * 0.22, 9, 22) / 32 * (this.visFacing < 0 ? -1 : 1), clamp(s * 0.22, 9, 22) / 32);
      this.blockIcon.alpha = 0.85 * alpha;
    }
    // count badge & item pips (prep)
    if (this.countText && this.countText.visible) {
      this.countText.scale.set(clamp(s / 90, 0.5, 1.2));
      this.countText.position.set(x + s * 0.32, this.screen.y - s * 0.12);
    }
    for (let i = 0; i < this.itemPips.length; i++) {
      const pip = this.itemPips[i];
      const ps = clamp(s * 0.26, 12, 30);
      pip.width = pip.height = ps;
      pip.position.set(this.screen.x - s * 0.36 + i * (ps + 1), this.screen.y - s * 0.05);
      pip.visible = this.alive;
    }
  }

  /**
   * 设置「弹药数量」 (PR #552 by @IceCodeNew; off by default — the official HUD has no such number, the maintainer's decision
   * of 2026-10-13): the rounds left / the rounds in the magazine (b.snap `ammo`: the exact counts, 拉特兰's extra rounds
   * and refills included) centred at `x` under the ammo bar, its top at `top`, in the bar's yellow — readable even where the
   * cells are too narrow for their cuts. Built on first use, hidden otherwise (the skill over, the prep view, a death, an
   * older snapshot without the row). Returns the height it takes (0 while hidden) so the rows under the bars move down.
   */
  _updateAmmoCount(show, x, top, s) {
    let text = this.ammoText;
    if (!show) { if (text) text.visible = false; return 0; }
    if (!text) {
      text = this.ammoText = new this.P.Text('', { fontFamily: 'Bender, Oxanium, sans-serif', fontSize: 16, fontWeight: '700', fill: COLORS.ammo, stroke: '#0b0f0e', strokeThickness: 3 });
      text.anchor.set(0.5, 0);
      this.hud.addChild(text);
    }
    const label = `${this.ammo[0]}/${this.ammo[1]}`;
    if (text.text !== label) text.text = label;
    text.scale.set(clamp(s * 0.2, 10, 16) / 16);
    text.position.set(x, top + 3);
    text.visible = true;
    return text.height + 6;
  }

  /**
   * The thin dark separators between the ammo bar's cells (see _updateHud): one at every round boundary of the `n`-round
   * magazine across the bar `x0` … `x0 + bw` at height `y`, `h` tall; none while a cell would be under AMMO_BAR.minCell px
   * (the fill keeps its exact width). Sprites are built as the magazines need them and hidden when not in use.
   */
  _updateAmmoCuts(show, ammo, x0, y, bw, h) {
    const cuts = this.ammoCuts;
    const n = show ? ammo[1] : 0;
    const step = n > 1 ? bw / n : 0;
    const want = step >= AMMO_BAR.minCell ? n - 1 : 0;
    while (cuts.length < want) cuts.push(bar(this.P, this.hud, COLORS.hpBack, 0.9));
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i];
      c.visible = i < want;
      if (c.visible) { c.position.set(x0 + (i + 1) * step - 0.5, y); c.width = 1; c.height = h; }
    }
  }

  /**
   * 伺夜's 狼群 count (b.snap `wolves`, [left, maximum]): a row of diamonds from `x0`, its top at `top`, one per 狼影 the
   * talent allows, the first `left` of them lit. Built on the first count, hidden without one. Returns the height the row
   * takes (0 while hidden) so the element gauge row can sit below it.
   */
  _updateWolfPips(show, x0, top, s) {
    let r = this._wolfPips;
    if (!show) { if (r) r.root.visible = false; return 0; }
    const P = this.P;
    const [left, max] = this.wolves;
    if (!r) {
      r = this._wolfPips = { root: new P.Container(), back: [], lit: [] };
      this.hud.addChild(r.root);
    }
    const mk = (list, color, alpha) => {
      const d = new P.Sprite(white());
      d.anchor.set(0.5); d.rotation = Math.PI / 4; d.tint = color; d.alpha = alpha;
      r.root.addChild(d);
      list.push(d);
    };
    while (r.lit.length < max) { mk(r.back, COLORS.hpBack, 0.85); mk(r.lit, COLORS.wolf, 1); }
    const d = clamp(s * WOLF_PIPS.size, WOLF_PIPS.min, WOLF_PIPS.max);   // a diamond's diagonal
    const side = d / Math.SQRT2;
    const cy = top + WOLF_PIPS.pad + d / 2 + 1;
    for (let i = 0; i < r.lit.length; i++) {
      const on = i < max;
      const b = r.back[i], l = r.lit[i];
      b.visible = l.visible = on;
      if (!on) continue;
      const cx = x0 + d / 2 + 1 + i * (d + 2 + WOLF_PIPS.gap);
      b.position.set(cx, cy); b.width = b.height = side + 2;
      l.position.set(cx, cy); l.width = l.height = side;
      l.alpha = i < left ? 1 : WOLF_PIPS.dim;
    }
    r.root.visible = true;
    return d + 2 + WOLF_PIPS.pad;
  }

  /** Coin icon and balance/cap, read from the current snapshot rather than transient FX. */
  _updateCoins(show, x, top, s) {
    let r = this.coinHud;
    if (!show) { if (r) r.root.visible = false; return 0; }
    if (!r) {
      const P = this.P, root = new P.Container(), icon = new P.Sprite(fxAtlas().tex.coin);
      icon.width = icon.height = 16;
      const text = new P.Text('', { fontFamily: 'Bender, Oxanium, sans-serif', fontSize: 16, fontWeight: '700', fill: '#ffd04a', stroke: '#0b0f0e', strokeThickness: 3 });
      text.position.set(19, -2); root.addChild(icon, text); this.hud.addChild(root);
      r = this.coinHud = { root, text, label: '' };
    }
    const label = `${this.coins[0]}/${this.coins[1]}`;
    if (r.label !== label) { r.label = label; r.text.text = label; }
    const size = clamp(s * 0.2, 10, 16);
    r.root.scale.set(size / 16); r.root.position.set(x, top + 3); r.root.visible = true;
    // Text includes font metrics and stroke beyond its nominal 16 px size; reserve the measured row so the next
    // elemental gauge cannot overlap it (especially with a substituted browser font).
    return Math.max(16, r.root.getLocalBounds?.().height || 24) * (size / 16) + 8;
  }

  /**
   * Energy orb and stored/cap of a 秘术师, read from the current snapshot (b.snap `energy`, snapshot.js mysticView):
   * the trait stores one attack's energy whenever the attack finds no target and empties the lot into the next one, so
   * the count sits in the same row stack as the purse above, in a violet of its own — no other HUD state uses one, and
   * the orb is told apart from 琳琅诗怀雅's coin at a glance. Zero is shown: it is a count, not an absent state.
   * 设置「秘术师能量」 (PR #636 by @zasx77771) turns it on — off by default: the official HUD has no such number and shows
   * the energies as an effect on the operator (the maintainer's decision of 2026-10-15, GitHub #633).
   */
  _updateEnergy(show, x, top, s) {
    show = show && !(this.ctx.officialFor?.(this) ?? this.ctx.ofx?.active);
    let r = this.energyHud;
    if (!show) { if (r) r.root.visible = false; return 0; }
    if (!r) {
      const P = this.P, root = new P.Container(), icon = new P.Sprite(fxAtlas().tex.orb);
      icon.width = icon.height = 16;
      icon.tint = COLORS.energy;
      const text = new P.Text('', { fontFamily: 'Bender, Oxanium, sans-serif', fontSize: 16, fontWeight: '700', fill: '#b07dff', stroke: '#0b0f0e', strokeThickness: 3 });
      text.position.set(19, -2); root.addChild(icon, text); this.hud.addChild(root);
      r = this.energyHud = { root, text, label: '' };
    }
    const label = `${this.energy[0]}/${this.energy[1]}`;
    if (r.label !== label) { r.label = label; r.text.text = label; }
    const size = clamp(s * 0.2, 10, 16);
    r.root.scale.set(size / 16); r.root.position.set(x, top + 3); r.root.visible = true;
    // Text includes font metrics and stroke beyond its nominal 16 px size; reserve the measured row so the next
    // elemental gauge cannot overlap it (especially with a substituted browser font).
    return Math.max(16, r.root.getLocalBounds?.().height || 24) * (size / 16) + 8;
  }

  /** True while the shown gauge is in its 爆发冷却 (b.snap `elem` carries the cooldown's end and length). */
  elementCooling() {
    return !!this.el && this.elDur > 0 && this.elUntil > 0;
  }

  /**
   * The share of the element bar drawn (0..1): the remaining 元素值 (1 − fill), or during a 爆发冷却 the part of the
   * cooldown already run (the bar refills to full, PRTS 元素 "元素条显示缓慢恢复至上限"). 0 without a gauge.
   */
  elementLeft() {
    if (!this.el) return 0;
    if (this.elementCooling()) return clamp(1 - (this.elUntil - this.gameT) / this.elDur, 0, 1);
    return clamp(1 - this.elFill, 0, 1);
  }

  /**
   * Element gauge row (see header) under the bars spanning x0 … x0 + bw, its top at `top`: the element's disc at the
   * left (operators with its glyph; enemies plain, × EL_BAR.enemy) and, beside it to the bars' right end, a bar of
   * `elementLeft()` on a dark track `h` px tall — white for the 元素值 left; in the element's colour, the disc pulsing
   * (clock `t`), while it refills over a 爆发冷却. Built on the first gauge, hidden while there is none.
   */
  /**
   * A charge skill's stored charges (b.snap `charges`, ≥ 1 stored): the client's counter — the number in a ring of amber
   * dashes turning around it. Official HP bars: above the head (where the client draws it); else right of the SP bar's end,
   * clear of the bars, the icons above them and the gauges below.
   */
  _updateChargeCount(show, off, x0, bw, sy, spH, headY, s, t) {
    const n = show && Array.isArray(this.charges) && Number(this.charges[1]) > 1 ? Number(this.charges[0]) | 0 : 0;
    let c = this._chargeCount;
    if (n < 1) { if (c) c.root.visible = false; return; }
    const P = this.P;
    if (!c) {
      const root = new P.Container(), ring = new P.Graphics();
      const text = new P.Text('', { fontFamily: 'Bender, sans-serif', fontWeight: '700', fontSize: 30, fill: 0xffd23f, stroke: 0x1a1a1a, strokeThickness: 4 });
      text.anchor.set(0.5);
      // dashes on a 20-unit ring (drawn once, turned each frame)
      ring.lineStyle(4, 0xffd23f, 1);
      for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI * 2, a1 = a0 + Math.PI * 2 / 6 * 0.62; ring.moveTo(Math.cos(a0) * 20, Math.sin(a0) * 20); ring.arc(0, 0, 20, a0, a1); }
      root.addChild(ring, text);
      c = this._chargeCount = { root, ring, text, n: -1 };
      this.hud.addChild(root);
    }
    if (c.n !== n) { c.text.text = String(n); c.n = n; }
    const d = off ? s * 0.26 : clamp(s * 0.2, 12, 22);
    const k = d / 44;
    c.root.scale.set(k);
    c.ring.rotation = t * 1.6;
    if (off) c.root.position.set(x0 + bw / 2, headY - d * 0.15);
    else c.root.position.set(x0 + bw + d / 2 + 3, sy);
    c.root.visible = true;
  }

  /** `at` (HP bar style official): the client's gauge — its disc with a ring filling around it, left of the unit above
   *  the bars' left end (no bar). */
  _updateElementBar(show, x0, bw, top, h, s, t = 0, at = null) {
    let r = this._elBar;
    if (!show) { if (r) r.root.visible = false; return; }
    const tex = hudRings();
    if (!r) {
      const P = this.P;
      const root = new P.Container();
      const bg = bar(P, root, COLORS.hpBack, 1);
      const fill = bar(P, root, 0xffffff);
      const disc = new P.Sprite(tex.disc.burn);
      disc.anchor.set(0.5);
      root.addChild(disc);
      r = this._elBar = { root, disc, bg, fill };
      this.hud.addChild(root);
    }
    const d = clamp(s * EL_BAR.icon, EL_BAR.min, EL_BAR.max) * (this.isEnemy ? EL_BAR.enemy : 1);
    if (at) {
      if (!r.ring) { r.ring = new this.P.Sprite(this.P.Texture.EMPTY); r.ring.anchor.set(0.5); r.root.addChild(r.ring); }
      const k = this.elementLeft();
      r.bg.visible = r.fill.visible = false; if (r.value) r.value.visible = false;
      r.disc.texture = (this.isEnemy ? tex.discEnemy : tex.disc)[this.el] || tex.disc.burn;
      r.disc.width = r.disc.height = d / HUD_DISC;
      r.disc.position.set(at.x, at.y);
      r.ring.texture = ringArc(clamp(k, 0, 1));
      r.ring.tint = (ELEMENT_RING[this.el] || ELEMENT_RING.burn).tint;
      r.ring.width = r.ring.height = d * 1.35 / HUD_DISC;
      r.ring.position.set(at.x, at.y);
      r.ring.visible = k > 0;
      r.disc.alpha = this.elementCooling() ? EL_BAR.pulse + (1 - EL_BAR.pulse) * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * EL_BAR.pulseHz)) : 1;
      r.root.visible = true;
      return;
    }
    r.bg.visible = true; if (r.ring) r.ring.visible = false; if (r.value) r.value.visible = true;
    const cy = top + EL_BAR.gap + d / 2;
    r.disc.texture = (this.isEnemy ? tex.discEnemy : tex.disc)[this.el] || tex.disc.burn;
    r.disc.width = r.disc.height = d / HUD_DISC;   // the disc fills HUD_DISC of its atlas cell
    r.disc.position.set(x0 + d / 2, cy);
    const bx = x0 + d + 2, w = Math.max(4, x0 + bw - bx);
    r.bg.position.set(bx - 1, cy); r.bg.width = w + 2; r.bg.height = h + 2;
    const k = this.elementLeft();
    r.fill.visible = k > 0;
    r.fill.position.set(bx, cy); r.fill.width = w * k; r.fill.height = h;
    if (this.elementCooling()) {
      r.fill.tint = (ELEMENT_RING[this.el] || ELEMENT_RING.burn).tint;
      r.disc.alpha = EL_BAR.pulse + (1 - EL_BAR.pulse) * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * EL_BAR.pulseHz));
    } else {
      r.fill.tint = 0xffffff;
      r.disc.alpha = 1;
    }
    if(this.isBoss){
      if(!r.value){r.value=new this.P.Text('',{fontFamily:'Bender, sans-serif',fontSize:13,fill:0xffffff,stroke:0x10151b,strokeThickness:3});r.value.anchor.set(.5);r.root.addChild(r.value);}
      r.value.text=this.elementCooling() ? `${Math.ceil(Math.max(0,this.elUntil-this.gameT))}s` : `${Math.round(this.elValue ?? ((1-k)*(this.info.gaugeMax || 2000)))} / ${this.info.gaugeMax || 2000}`;
      r.value.position.set(bx+w/2,cy+12);
    }
    r.root.visible = true;
  }

  /**
   * Redeploy ring above a knocked-down operator (see header), centred on (cx, cy): a mint arc filling as its respawn
   * timer runs with the seconds left; a full pulsing amber ring with "DP" / red ring with "!" once it only waits.
   */
  _updateDownRing(show, cx, cy, s, t) {
    let r = this._downRing;
    if (!show) { if (r) r.root.visible = false; return; }
    const tex = hudRings();
    if (!r) {
      const P = this.P;
      const root = new P.Container();
      const mk = (tx) => { const sp = new P.Sprite(tx); sp.anchor.set(0.5); root.addChild(sp); return sp; };
      const disc = mk(tex.downDisc), track = mk(tex.track), arc = mk(tex.arcs[0]);
      const text = mk(P.Texture.EMPTY);
      r = this._downRing = { root, disc, track, arc, text, label: null, res: 0 };
      this.hud.addChild(root);
    }
    const dn = this.down;
    const counting = dn.state === DOWN_STATE.COUNTING;
    const left = Math.max(0, dn.until - this.gameT);
    r.arc.texture = ringArc(counting ? (dn.total > 0 ? clamp(1 - left / dn.total, 0, 1) : 1) : 1);
    const color = DOWN_LOOK.ring[dn.state] ?? DOWN_LOOK.ring[DOWN_STATE.COUNTING];
    r.arc.tint = color;
    const label = counting ? String(Math.ceil(left - 1e-6)) : dn.state === DOWN_STATE.WAIT_DP ? 'DP' : '!';
    const res = this.ctx.renderer?.resolution || 1;
    if (r.label !== label || r.res !== res) {
      r.label = label;
      r.res = res;
      r.text.texture = downLabel(label, counting ? '#ffffff' : '#' + color.toString(16).padStart(6, '0'), res);
    }
    const d = clamp(s * DOWN_LOOK.size, 22, 52);
    const k = d / tex.size;
    r.disc.scale.set(k); r.track.scale.set(k); r.arc.scale.set(k);
    r.text.scale.set((d * (label.length > 2 ? 0.34 : 0.44)) / 32);
    r.root.position.set(cx, cy);
    r.root.alpha = counting ? 1 : 0.72 + 0.28 * Math.sin(t * 5);
    r.root.visible = true;
  }

  // ---- impostor mode (crowded fields, clipped skeletons): the skeleton is rendered into a slot of the shared
  // impostor atlas (render/impostor.js) every `interval` frames (staggered per unit; every frame for clipped
  // skeletons, whose stencil masks must stay out of the main pass) and shown as one sprite. Without a free atlas
  // slot the unit keeps a private RenderTexture (same visuals, one extra framebuffer switch).
  // The slot is sized from the unit's box (GitHub #542, `impostorBox`): every clip it can play, as measured once per
  // skeleton (spine.js clipBounds) — no pose it plays is cut, and the atlas clips every slot to itself. A clip too large
  // for the box (`over`) is drawn directly while it plays; the slot stays the unit's (_impBypass).

  /** The impostor box ({ x0, y0, w, h, over } in skeleton units), null while the model's clips are still measured. */
  _impBox() {
    if (this._box) return this._box;
    const a = this.actor;
    const names = this._clipNames();
    const rects = typeof a.clipBounds === 'function' ? a.clipBounds([...names.keys()]) : false;
    if (rects === null) return null;
    let box = null;
    const unmeasured = new Set();   // clips whose sampling threw (false): drawn directly while they play
    if (rects) {
      const idle = this._idleClip();
      const rect = (name) => (rects.has(name) ? rects.get(name) : null);
      const rest = [];
      for (const [name, once] of names) {
        if (rect(name) === false) unmeasured.add(name);
        if (name !== idle) rest.push([name, rect(name), once]);
      }
      box = impostorBox(idle && rect(idle) !== false ? rect(idle) : null, rest);
      if (box && idle && unmeasured.has(idle)) box.over.add(idle);
    }
    this._box = box || this._legacyBox(unmeasured);
    return this._box;
  }

  /**
   * The idle clip of the model's own roles (the impostor box's core), as SpineActor picks it: the role's, else 'Idle',
   * else the skeleton's first clip; null for a skeleton without clips.
   */
  _idleClip() {
    const a = this.actor, idle = a.entry && a.entry.anims ? a.entry.anims.idle : null;
    if (a.has(idle)) return idle;
    if (a.has('Idle')) return 'Idle';
    const first = a.names && a.names.values().next().value;
    return typeof first === 'string' ? first : null;
  }

  /**
   * The clips this view's model can play that its skeleton has (`playedClips` of its entry and FORMS, the actor's
   * fallbacks — its idle clip, 'Die' — included), name → one-off; a pen figure (lod idle) plays its idle clip only.
   */
  _clipNames() {
    const a = this.actor;
    if (this._clipsOf === a && this._clipsIdle === this.lodIdle) return this._clips;
    const anims = (a.entry && a.entry.anims) || {};
    const idle = this._idleClip();
    const out = new Map();
    if (idle) out.set(idle, false);
    if (!this.lodIdle) {
      for (const [name, once] of playedClips(anims, FORMS[this.info.spine || this.info.defId] || FORMS[this.info.charId] || null)) {
        if (a.has(name)) out.set(name, out.has(name) ? out.get(name) && once : once);
      }
      if (!anims.die && a.has('Die')) out.set('Die', false);
      if (this.info.charId === 'char_4217_makoto') for (const name of ['Attack_A','Attack_B','Doll_Skill_3_P1_Attack_A','Doll_Skill_3_P1_Attack_B']) if (a.has(name)) out.set(name, false);
    }
    this._clipsIdle = this.lodIdle;
    this._clipsOf = a;
    this._clips = out;
    return out;
  }

  /**
   * The box sized from the pose drawn now, for a runtime whose clips cannot be measured (the pre-#542 rule); `over` =
   * clips that could not be measured (drawn directly while they play).
   */
  _legacyBox(over = NO_CLIPS) {

    let b = null;
    try { b = this.actor.spine.getLocalBounds(); } catch { b = null; }
    let x0 = -220, y0 = -420, x1 = 220, y1 = 40;
    if (b && Number.isFinite(b.width) && b.width > 10 && b.height > 10) {
      const padX = Math.max(60, b.width * 0.3), padY = Math.max(50, b.height * 0.22);
      x0 = Math.min(b.x - padX, -140); x1 = Math.max(b.x + b.width + padX, 140);
      y0 = Math.min(b.y - padY, -260); y1 = Math.max(b.y + b.height + padY * 0.4, 30);
    }
    return { x0, y0, w: x1 - x0, h: y1 - y0, over: over && over.size ? over : NO_CLIPS };
  }

  /** Is a clip outside the box (`over`) on screen — the track's clip or one it is still mixing out of? */
  _impOver() {
    const box = this._box;
    if (!box) return false;
    const tracks = this.actor.spine && this.actor.spine.state ? this.actor.spine.state.tracks : null;
    for (let e = tracks && tracks[0], d = 0; e && d < 4; e = e.mixingFrom, d++) if (e.animation && box.over?.has(e.animation.name)) return true;
    const version=this.actor.poseVersion, cached=this._liveBoundsCheck;
    if(Number.isFinite(version)&&cached?.actor===this.actor&&cached.box===box&&cached.version===version)return cached.over;
    let over=false;
    // Sampled animation bounds do not include every mixed/procedural attachment pose. Never crop the live pose to
    // that cached rectangle: render it directly until it fits again (including embedded skill/attack effects).
    try {
      const b = this.actor.spine.getLocalBounds();
      if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && b.width > 0 && b.height > 0) {
        over = b.x < box.x0 - 1 || b.y < box.y0 - 1 || b.x + b.width > box.x0 + box.w + 1 || b.y + b.height > box.y0 + box.h + 1;
      }
    } catch { /* runtimes without measurable bounds keep the precomputed clip fallback */ }
    if(Number.isFinite(version))this._liveBoundsCheck={actor:this.actor,box,version,over};
    return over;
  }

  /**
   * Draw the skeleton directly while a clip too large for the box plays (`on`), back to the impostor after it: the
   * skeleton leaves the atlas' parking lot for the body and the impostor sprite hides; the slot stays allocated, and is
   * redrawn on the way back.
   */
  _impBypass(on) {
    const imp = this.imp, sp = this.actor.spine, atlas = this.ctx.impostors || null;
    if (!imp || !!imp.bypass === on) return;
    imp.bypass = on;
    if (on) {
      if (atlas) atlas.unpark(sp);
      sp.visible = true;
      sp.position.set(0, 0);
      this.body.addChild(sp);
      imp.sprite.visible = false;
    } else {
      if (sp.parent === this.body) this.body.removeChild(sp);
      if (atlas) atlas.park(sp);
      imp.sprite.visible = true;
      imp.dirty = true;
      imp.acc = 0;
    }
  }

  /** Draw the skeleton itself this frame (no impostor, or bypassing it): posed by `animDt` unless `held` / `posed`. */
  _drawDirect(sc, flip, tint, animDt, held, posed = false) {
    const sp = this.actor.spine;
    sp.alpha = this.swapT;
    sp.scale.set(sc * flip, sc * (this.modelKY || 1));
    if (!posed) {
      if (held) this.actor.clock += animDt;
      else this.actor.update(animDt);
    }
    if (this._tint !== tint) { this._tint = tint; sp.tint = tint; }
  }

  _updateImpostor(sc, flip, tint, animDt, interval, held = false) {
    const P = this.P;
    // Keep Spine stencil masks in a private target: they must not affect other slots or HUDs.
    const atlas = this.actor.clipped && this.actor.clipOn ? null : this.ctx.impostors || null;
    if (!this.imp) {
      const sprite = new P.Sprite(P.Texture.EMPTY);
      if (this.actor.spine.parent) this.actor.spine.parent.removeChild(this.actor.spine);
      if (atlas) atlas.park(this.actor.spine);
      this.body.addChild(sprite);
      this.imp = { sprite, slot: null, rt: null, sc: 0, acc: 0, phase: (Math.random() * 64) | 0, dirty: true, last: 0, bypass: false };
    }
    const imp = this.imp;
    // a clip too large for the box plays: drawn directly until it is over (then redrawn into the slot)
    if (this._impOver()) {
      this._impBypass(true);
      this._drawDirect(sc, flip, tint, animDt, held);
      return;
    }
    if (imp.bypass) this._impBypass(false);
    imp.acc += animDt;
    const frame = this.ctx.frameNo ? this.ctx.frameNo() : 0;
    // the view's slot in this frame's update order (app.js impostorSlot) spreads the refreshes evenly over the interval;
    // a context without slots keeps the random phase. A unit whose slot keeps moving with the frame (the units before it
    // culled on and off in step) is still refreshed after 2 intervals at the latest.
    const turn = this.ctx.impostorSlot ? this.ctx.impostorSlot() : imp.phase;
    const rescale=Math.abs(sc-imp.sc)>imp.sc*.12;
    const still=held&&!imp.dirty&&!rescale&&!imp.slot?.freed&&!(imp.rt&&imp.rt.baseTexture?.resolution!==this.ctx.renderer.resolution);
    if(still){this.actor.clock+=imp.acc;imp.acc=0;}
    const due = !still && (imp.dirty || imp.slot?.freed || (imp.rt && imp.rt.baseTexture?.resolution !== this.ctx.renderer.resolution) || interval <= 1 || (frame + turn) % interval === 0 || frame - imp.last >= 2 * interval
      || rescale);
    if (due) {
      this.actor.update(imp.acc);
      imp.acc = 0;
      imp.dirty = false;
      imp.last = frame;
      // the update reached a clip too large for the box (a queued clip began): this frame already draws it directly
      if (this._impOver()) {
        this._impBypass(true);
        this._drawDirect(sc, flip, tint, 0, held, true);
        return;
      }
      this._renderImpostor(sc, atlas);
    }
    const k = imp.sc > 0 ? sc / imp.sc : 1;
    imp.sprite.scale.set(k * flip, k);
    imp.sprite.alpha = this.swapT;
    imp.sprite.tint = tint;
  }

  _renderImpostor(sc, atlas) {
    const P = this.P, R = this.ctx.renderer, imp = this.imp;
    if(!atlas&&imp.slot){this.ctx.impostors?.free(imp.slot);imp.slot=null;}
    const box = this._impBox();
    const w = Math.max(8, Math.ceil(box.w * sc)), h = Math.max(8, Math.ceil(box.h * sc));
    const sp = this.actor.spine;
    sp.alpha = 1;
    if (this._tint !== 0xffffff) { this._tint = 0xffffff; sp.tint = 0xffffff; }
    const ox = -box.x0 * sc, oy = -box.y0 * sc;
    if (atlas) {
      let slot = imp.slot;
      const clip = !!(this.actor.clipped && this.actor.clipOn);
      if (!slot || slot.freed || w > slot.w || h > slot.h || w < slot.w * 0.6 || h < slot.h * 0.6 || slot.clip !== clip) {
        if (slot) atlas.free(slot);
        slot = imp.slot = atlas.alloc(w, h, { clip });
        if (slot && imp.rt) { imp.rt.destroy(true); imp.rt = null; }
      }
      if (slot) {
        atlas.draw(slot, sp, { a: sc, d: sc, tx: ox, ty: oy });
        if (imp.sprite.texture !== slot.tex) imp.sprite.texture = slot.tex;
        imp.sprite.anchor.set(ox / slot.w, oy / slot.h);
        imp.sc = sc;
        return;
      }
    }
    // private render target (no atlas / atlas full)
    let rt = imp.rt;
    if (!rt || rt.baseTexture?.resolution !== R.resolution || w > rt.width || h > rt.height || w < rt.width * 0.6 || h < rt.height * 0.6) {
      if (rt) rt.destroy(true);
      rt = imp.rt = P.RenderTexture.create({ width: Math.ceil(w / 8) * 8, height: Math.ceil(h / 8) * 8, resolution: R.resolution });
      imp.sprite.texture = rt;
    }
    const parent = sp.parent;
    sp.position.set(0, 0);
    sp.scale.set(1, 1);
    sp.visible = true;
    const m = this._m || (this._m = new P.Matrix());
    m.set(sc, 0, 0, sc, ox, oy);
    try { R.render(sp, { renderTexture: rt, clear: true, transform: m }); } catch { /* lost context etc. */ }
    if (parent === atlas?.parked) sp.visible = false;
    imp.sprite.anchor.set(ox / rt.width, oy / rt.height);
    imp.sc = sc;
  }

  _leaveImpostor() {
    const imp = this.imp;
    this.imp = null;
    if (!imp) return;
    const atlas = this.ctx.impostors || null;
    if (imp.slot && atlas) atlas.free(imp.slot);
    imp.sprite.destroy();
    if (imp.rt) imp.rt.destroy(true);
    if (this.actor && this.actor.spine) {
      if (atlas) atlas.unpark(this.actor.spine);
      this.actor.spine.visible = true;
      this.actor.spine.position.set(0, 0);
      this.body.addChild(this.actor.spine);
    }
  }

  _iconKeys(limit = 4) {
    const out = ICON_TMP;
    out.length = 0;
    const f = this.flags;
    const push = (k) => { if (k && !out.includes(k) && out.length < limit) out.push(k); };
    if (f & UF.FROZEN) push('freeze');
    else if (f & UF.STUNNED) push('stun');
    if (f & UF.SLEEP) push('sleep');
    if (f & UF.COLD && !(f & UF.FROZEN)) push('cold');
    if ((f & UF.INVULN) && !this.isToken) push('invuln');
    if (f & UF.STEALTH) push('stealth');
    for (const k of this.statuses) {
      if (out.length >= limit) break;
      if (k === 'skill') continue;
      // a burst's lock ('burnBurst', 'neuralBurst' … — the 爆发冷却) is shown by the element gauge row under the bars
      // (b.snap `elem`); only a feed without gauges (an older recording) shows it as a status
      if (this.el && k.endsWith('Burst')) continue;
      if (statusIconSuppressed(k, this.statuses)) continue; // 折射 while silenced
      const icon = statusIconKey(k);
      // flag-driven states are authoritative (a stale 'stun' status must not outlive the flag)
      if (!icon || icon === 'stun' || icon === 'freeze' || icon === 'sleep' || icon === 'stealth' || icon === 'invuln') continue;
      if (icon === 'cold' && (f & UF.FROZEN)) continue;
      push(icon);
    }
    return out;
  }

  /** Canvas-space bounds (CSS px) of the body: 0.7 tile wide, from its head (UNIT.headroom; enemies: their model) down
   * to just below the feet — tooltips and overlays (view.pieceScreenRect), not picking (render/pick.js is by tile). */
  bounds() {
    const s = this.screen.s || 1;
    const h = (this._headTiles || UNIT.headroom) * s;
    const w = s * 0.7;
    return { x: this.screen.x - w / 2, y: this.screen.y - h, width: w, height: h + s * 0.1 };
  }

  setHover(on) { this.hovered = !!on; }

  destroy() {
    this.ctx._rangeViews?.delete(this);
    if (this.destroyed) return;
    this.destroyed = true;
    this._dropActor();
    this.shadow.destroy();
    if(this.attackRange)this.attackRange.destroy();
    this.snowFx?.destroy();
    if(this.skillZone)this.skillZone.destroy();
    for(const extra of this.skillZoneExtra.values())extra.destroy();this.skillZoneExtra.clear();
    this.blockIcon.destroy();
    if (this.facingArrow) this.facingArrow.destroy();
    this.hud.destroy({ children: true });
    this.root.destroy({ children: true });
    this.stealthMist = null;
  }
}

const SH_P = { x: 0, y: 0, s: 0, depth: 0 };
const FA_P = { x: 0, y: 0, s: 0, depth: 0 };
const FA_C = { x: 0, y: 0, s: 0, depth: 0 };
const LG_P = { x: 0, y: 0, s: 0, depth: 0 };
const HUD_P = { x: 0, y: 0, s: 0, depth: 0 };
const ICON_TMP = [];
/** 设置「HP 바 표시 방식」 official: the client's bar colours (read off its battle screens): operator HP light blue, SP
 *  yellow-green charging / amber while the skill runs, enemy HP orange, a leader's (悬赏 leaders, the bosses) red on grey. */
const OFFICIAL_BARS = Object.freeze({ elementAbove: 0.28, width: 0.82, fixedBossWidth: 4, hpH: 0.05, leaderH: 0.068, belowFeet: 0.2,
  ally: 0x6cb2d2, sp: 0x8aa43f, skill: 0xc3991c, overload: 0xb04516, enemy: 0xd46c3a, leader: 0xcf2a33, back: 0x1c1c1c, leaderBack: 0x7d8088 });

/**
 * Unit-layer zIndex of a unit / piece whose feet are at (x, y): farther rows first (so raised block rows, keyed by
 * tiles.rowDepthKey, hide units behind them); lifted (dragged) pieces on top; ties broken by column.
 */
export function unitDepthKey(cam, x, y, lift = 0, airborne = false, footprint = null) {
  // Sort stationary bosses at the centre of their occupied ground area: rear
  // operator rows behind the boss, front rows over it (the five-layer ordering).
  if (footprint && !airborne) {x += footprint.dx || 0;y += footprint.dy || 0;}
  // +40 (< one row of depth at the official 30° pitch, 100·sin 30° = 50): a lifted piece never ties with the unit one
  // row in front of it (a tie flickers with the column tie-break)
  return (airborne ? 100000 : 0) - cam.depthOf(x, y, 0) * 100 + (lift > 0 ? 40 : 0) + x * 0.001;
}

function mixTint(a, b, k) {
  const t = clamp(k, 0, 1);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | ((ab + (bb - ab) * t) | 0);
}

/** Attack interval from data (bat × 100 / aspd), game seconds. */
function defaultInterval(ctx, info) {
  try {
    const rec = ctx.lookupDef ? ctx.lookupDef(info) : null;
    const st = rec?.stats;
    if (st && st.bat > 0) return clamp((st.bat * 100) / (st.aspd > 0 ? st.aspd : 100), 0.2, 6);
  } catch { /* ignore */ }
  return 1.2;
}

// =============================================================================================================

/**
 * Hand item: icon plate floating above its slot. While dragged (`lift` > 0) the plate is centred on its ground point —
 * the pointer (render/app.js moveDragVisual); it drops on (and equips the unit on) the tile under the pointer.
 */
export class ItemView {
  constructor(ctx, info) {
    const P = ctx.P;
    this.ctx = ctx; this.P = P;
    this.info = { ...info };
    this.id = info.id; this.uid = info.uid ?? null;
    this.x = info.x || 0; this.y = info.y || 0; this.z = 0;
    this.alive = true; this.remove = false; this.lift = 0; this.dimmed = false;
    this.bob = Math.random() * 6;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this.placed = false;
    this.shadow = new P.Sprite(ctx.shadowTex || shadowTexture());
    this.shadow.anchor.set(0.5);
    ctx.layers.shadow.addChild(this.shadow);
    this.root = new P.Container();
    ctx.layers.units.addChild(this.root);
    this.plate = new P.Sprite(itemTexture('none', null, info.color || 0x9aa5a0));
    this.plate.anchor.set(0.5, 1);
    this.root.addChild(this.plate);
    this.info.icon = null;
    this.setIcon(info.icon);
    this.hud = null;
  }
  /** Show the item's icon (an URL; the plain plate until it loads) — again when the asset manifest named it late. */
  setIcon(url) {
    if (this.destroyed || url === this.info.icon) return;
    this.info.icon = url;
    // Item ids are reused across official versions. Cache the resolved art, like equipped-item pips do.
    this.plate.texture = itemTexture(url || 'none', null, this.info.color || 0x9aa5a0);
    if (!url) return;
    const a = this.ctx.assets;
    if (a?.image) a.image(url).then((img) => { if (!this.destroyed && img && this.info.icon === url) this.plate.texture = itemTexture(url, img, this.info.color || 0x9aa5a0); }, () => {});
  }
  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }
  /** A battle snapshot sample (syncBattle syncs every unit of the field): a hand item on a scouted prep board rides
   *  the units as kind 'item' (Match.prepFieldMeta) — follow its position, there is nothing else to animate. */
  sync(s) { this.x = s.x; this.y = s.y; }
  update(dt, cam, t) {
    const lifted = this.lift > 0;
    const p = cam.project(this.x, this.y, lifted ? this.z : this.z + this.lift + 0.12 + Math.sin(t * 2 + this.bob) * 0.03, this.screen);
    this.placed = true;
    this.root.position.set(p.x, p.y);
    this.root.zIndex = unitDepthKey(cam, this.x, this.y, this.lift);
    const size = p.s * 0.62;
    this.plate.scale.set(size / 128);
    this.plate.anchor.set(0.5, lifted ? 0.5 : 1);
    this.root.alpha = this.dimmed ? 0.35 : 1;
    placeOnGround(this.ctx, this.shadow, this.ctx.layers.shadow, this.y, this.z);
    const sh = cam.project(this.x, this.y, this.z, SH_P);
    this.shadow.position.set(sh.x, sh.y);
    this.shadow.scale.set((p.s * 0.55) / this.shadow.texture.width);
    this.shadow.alpha = 0.35;
    this.screen.top = lifted ? p.y - size / 2 : p.y - size;
  }
  /** Canvas-space bounds (CSS px) of the plate (centred on the pointer while dragged). */
  bounds() {
    const w = (this.screen.s || 1) * 0.62;
    return { x: this.screen.x - w / 2, y: this.lift > 0 ? this.screen.y - w / 2 : this.screen.y - w, width: w, height: w };
  }
  setHover() {}
  destroy() { if (this.destroyed) return; this.destroyed = true; this.shadow.destroy(); this.root.destroy({ children: true }); }
}

// =============================================================================================================

/**
 * Battle device unit (kind 'device': crates, “双眼皮” turrets, unknown stage devices): a textured 3D box (the tile
 * atlas, render/tiles.js BoxMesh; 阻隔工事 uses its own client model on the 3D board when installed), a turret head
 * that turns to its target and flashes on attack, HP bar once damaged, and a break-apart on death.
 */
const GENERIC_DEVICE = Object.freeze({ size: 0.7, height: 0.36, top: 'platformTop', side: 'forbidSide' });
export class DeviceView {
  constructor(ctx, info) {
    const P = ctx.P;
    this.ctx = ctx; this.P = P;
    this.info = { ...info };
    this.id = info.id; this.uid = null;
    this.isEnemy = false;
    this.spec = deviceBoxOf(info.defId) || GENERIC_DEVICE;
    this.turret = this.spec === DEVICE_BOX.turret;
    this.x = Number(info.x) || 0; this.y = Number(info.y) || 0; this.z = 0;
    this.hp = Number(info.maxHp) || 100; this.maxHp = this.hp;
    this.alive = true; this.remove = false; this.dying = 0; this.flags = 0;
    this.facing = info.facing === -1 ? -1 : 1;
    this.aim = this.facing > 0 ? 0 : Math.PI; this.aimTo = this.aim; this.fire = 0;
    this.screen = { x: 0, y: 0, s: 1, top: 0 };
    this.placed = false;
    this._headTiles = this.spec.height + 0.2;
    this.box = ctx.createBox ? ctx.createBox(this.spec) : null;
    this.gfx = new P.Graphics();       // fallback body (no tile field) and the turret head
    ctx.layers.units.addChild(this.gfx);
    this.hud = new P.Container();
    ctx.layers.bars.addChild(this.hud);
    this.hpBg = bar(P, this.hud, COLORS.hpBack, 1);
    this.hpFill = bar(P, this.hud, this.turret ? COLORS.hpAlly : 0xe0b877);
    this.camVersion = -1;
  }
  sync(s) {
    if (!s) return;
    this.x = s.x; this.y = s.y; this.z = groundZ(this.ctx, s.x, s.y);
    if (s.maxHp > 0) this.maxHp = s.maxHp;
    this.hp = clamp(s.hp, 0, this.maxHp); this.flags = s.flags | 0;
  }
  setWorld(x, y, z = 0) { this.x = x; this.y = y; this.z = z; }
  onAttack(target) {
    if (!this.alive) return;
    if (target) this.aimTo = Math.atan2(target.y - this.y, target.x - this.x);
    this.fire = 1;
  }
  windUp() { return false; }
  onHit() { this.shake = 0.2; }
  onDeploy() {}
  onStatus() {}
  setSkill() {}
  setFacing() {}
  die() { if (!this.alive) return; this.alive = false; this.dying = 0.45; this.ctx.fx?.crateBreak?.(this.x, this.y, this.z, this.turret ? 0x6c777d : null); }
  revive() { this.alive = true; this.dying = 0; this.remove = false; }
  update(dt, cam, t) {
    const shake = this.shake > 0 ? Math.sin(t * 80) * this.shake * 0.05 : 0;
    this.shake = Math.max(0, (this.shake || 0) - dt);
    const k = this.dying > 0 ? Math.max(0, this.dying / 0.45) : 1;
    if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.remove = true; }
    const zKey = rowDepthKey(cam, Math.round(this.y)) + ROW_KEY.devices;
    const spec = this.box?.spec || this.spec;
    this._headTiles = spec.height + 0.2;
    const size = spec.size * (0.6 + 0.4 * k), height = spec.height * k;
    const g = this.gfx;
    if (this.box) {
      this.box.update(cam, { x: this.x + shake, y: this.y, z: this.z, size, height, nativeScale: this.spec === DEVICE_BOX.crate ? k : null, top: this.spec.top, side: this.spec.side, alpha: k });
      if (this.box.mesh) {
        if (!this.box.mesh.parent) this.ctx.layers.units.addChild(this.box.mesh);
        this.box.mesh.zIndex = zKey;
      }
    }
    const redraw = !this.box || this.turret || cam.version !== this.camVersion || shake || this.dying > 0 || this._lastShake;
    if (redraw) {
      this.camVersion = cam.version;
      this._lastShake = !!shake;
      g.clear();
      if (!this.box) drawCrate(g, cam, this.x + shake, this.y, this.z, size, height, 1);
      if (this.turret && height > 0.05) this._drawHead(g, cam, dt, height, k);
    }
    g.zIndex = zKey + 0.001;
    g.alpha = k;
    const p = cam.project(this.x, this.y, this.z + spec.height + 0.35, this.screen);
    this.placed = true;
    const show = this.alive && this.hp < this.maxHp - 0.5;
    this.hud.visible = show;
    if (show) {
      const bw = clamp(p.s * 0.7, 24, 90), bh = clamp(p.s * 0.06, 3, 6);
      this.hpBg.position.set(p.x - bw / 2 - 1, p.y); this.hpBg.width = bw + 2; this.hpBg.height = bh + 2;
      this.hpFill.position.set(p.x - bw / 2, p.y); this.hpFill.width = bw * clamp(this.hp / this.maxHp, 0, 1); this.hpFill.height = bh;
    }
    this.screen.top = p.y;
  }
  /** Turret head: a squat dome with a barrel aimed at the last target; muzzle flash on attack. */
  _drawHead(g, cam, dt, height, k) {
    let d = this.aimTo - this.aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.aim += d * Math.min(1, dt * 10);
    this.fire = Math.max(0, this.fire - dt * 5);
    const z = this.z + height;
    const c = cam.project(this.x, this.y, z + 0.08);
    const s = c.s;
    const ex = Math.cos(this.aim), ey = Math.sin(this.aim);
    const recoil = this.fire * 0.06;
    const tip = cam.project(this.x + ex * (0.42 - recoil), this.y + ey * (0.42 - recoil), z + 0.12);
    g.lineStyle(0);
    g.beginFill(0x1c2124, 0.95 * k); g.drawEllipse(c.x, c.y, s * 0.2, s * 0.13); g.endFill();
    g.lineStyle(Math.max(2, s * 0.07), 0x39444a, k);
    g.moveTo(c.x, c.y - s * 0.05); g.lineTo(tip.x, tip.y - s * 0.03);
    g.lineStyle(Math.max(1, s * 0.03), 0x9aa7ad, k);
    g.moveTo(c.x, c.y - s * 0.06); g.lineTo(tip.x, tip.y - s * 0.04);
    g.lineStyle(0);
    g.beginFill(0x4b565c, k); g.drawEllipse(c.x, c.y - s * 0.07, s * 0.14, s * 0.09); g.endFill();
    g.beginFill(this.fire > 0 ? 0xffd27a : 0xff5a4a, (0.6 + 0.4 * this.fire) * k); g.drawCircle(c.x, c.y - s * 0.09, s * 0.035); g.endFill();
    if (this.fire > 0.2) { g.beginFill(0xfff0c0, this.fire * 0.8 * k); g.drawCircle(tip.x, tip.y - s * 0.03, s * 0.08 * this.fire); g.endFill(); }
  }
  bounds() { const s = this.screen.s; return { x: this.screen.x - s * 0.45, y: this.screen.y, width: s * 0.9, height: s }; }
  hitTest(x, y) { const b = this.bounds(); return this.alive && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height; }
  setHover() {}
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.box) this.box.destroy();
    this.gfx.destroy();
    this.hud.destroy({ children: true });
  }
}
