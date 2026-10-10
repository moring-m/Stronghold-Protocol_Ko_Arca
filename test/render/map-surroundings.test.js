import {test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{gunzipSync}from'node:zlib';
import{borderCells,combatBorderAreas,oppositeBorderRuns,completeOppositeRuns,vacantBorderCells,copyOppositeBorder,reflectOppositeBorder,disjointAreas,uncoveredTileCells,uniqueCopiedFaces}from'../../public/js/render/board3d/surroundings.js';
import{AREAS}from'../../public/js/render/board3d/layout.js';
import{surfaceForArea,sceneryForArea,outsideTileAreas}from'../../public/js/render/board3d/scene.js';
import{bossPenStage,cooperativeBossStage}from'../../public/js/render/pen.js';
const stages=JSON.parse(readFileSync(new URL('../../data/stages.json',import.meta.url)));
for(const[id,stage]of Object.entries(stages))test(`${id}: cooperative structure is the boss structure translated without simulation mutation`,()=>{
 const source=JSON.stringify(stage),boss=bossPenStage(stage),coop=cooperativeBossStage(stage);
 assert.notEqual(coop.structuralSource,boss);
 assert.equal(coop.previewLayout.worldOffset,7);
 for(let r=0;r<=11;r++)for(let c=0;c<boss.rows[r].length;c++) {
   const patched=coop.previewLayout.cooperativePatches.some(a=>a.r0===r&&a.c0===c);
   assert.equal(coop.rows[r+7][c],patched?stage.rows[r+7][c]:boss.rows[r][c]);
 }
 for(let r=9;r<=12;r++)assert.equal(coop.rows[r].slice(9,12),stage.rows[r].slice(9,12));
 assert.equal(coop.rows[9][18],stage.rows[9][18]);
 assert.equal(coop.rows[12][18],stage.rows[12][18]);
 assert.deepEqual(coop.devices,stage.devices,'functional devices retain simulation coordinates');
 assert.equal(JSON.stringify(stage),source);
 const native=JSON.parse(gunzipSync(readFileSync(new URL(`../../public/assets/local/map/original/${id}-v16.json.gz`,import.meta.url))));
 assert.ok(Object.values(native.buckets).some(g=>g.platform));
 const cells=borderCells(boss,[{r0:0,r1:5,c0:0,c1:20}]);
 assert.ok(cells.some(([r])=>r===-1),'front perimeter has no omitted side');
 assert.ok(cells.some(([r,c])=>r===6&&c===17),'rear side gaps included');
 assert.ok(!cells.some(([r])=>r===7),'do not extend a second row of copies into the backdrop');
});
test('overlapping field/pen areas clip a triangle once and preserve exact boundaries',()=>{
 const areas=[{r0:0,r1:2,c0:0,c1:2},{r0:2,r1:4,c0:0,c1:2}];
 const parts=disjointAreas(areas);
 assert.equal(parts.reduce((n,a)=>n+(a.c1-a.c0+1)*(a.r1-a.r0+1),0),15);
 const g={position:[0,2,0,1,2,0,0,2.4,0],normal:[0,0,1,0,0,1,0,0,1],uv:[0,0,1,0,0,1],index:[0,1,2]};
 const clipped=surfaceForArea(g,areas);
 let area=0;
 for(let i=0;i<clipped.index.length;i+=3){const[a,b,c]=clipped.index.slice(i,i+3).map(k=>clipped.position.slice(k*3,k*3+3));area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;}
 assert.ok(Math.abs(area-.2)<1e-8,'no duplicated coplanar face in the overlap');
 const typed=surfaceForArea({...g,position:new Float32Array(g.position),normal:new Float32Array(g.normal),uv:new Float32Array(g.uv),index:new Uint16Array(g.index)},areas);
 assert.equal(typed.index.length,3,'fallback typed index buffers preserve triangle vertices');
 assert.ok(typed.position.every(Number.isFinite));
});

test('existing decoration is never covered by a duplicated border block',()=>{
 const cells=[[0,0],[0,1]],top={position:[-.5,-.5,.25,.5,-.5,.25,.5,.5,.25,-.5,.5,.25],index:[0,1,2,0,2,3]};
 assert.deepEqual(vacantBorderCells(cells,[top]),[[0,1]]);
 assert.deepEqual(vacantBorderCells(cells,[{position:new Float32Array(top.position),index:new Uint16Array(top.index)}]),[[0,1]],'typed buffers reserve existing fallback tiles too');
 assert.deepEqual(vacantBorderCells(cells,[{...top,position:top.position.map((v,i)=>i%3===2?-.5:v)}]),cells,'deep cliff geometry cannot count as a border tile');
});

test('reserve the footprint of raised vertical decorations, including hollow planters',()=>{
 const fence={position:[-.3,-.3,0,-.3,.3,.4,-.3,-.3,.4],index:[0,1,2]};
 assert.deepEqual(vacantBorderCells([[0,0],[0,1]],[fence]),[[0,1]]);
});

test('the opposite border retains its complete layout, heights and UVs without randomized props',()=>{
 const area=[{r0:2,r1:5,c0:0,c1:20}],cells=borderCells({},area);
 assert.ok(cells.every(([r,c])=>r>=1&&r<=6&&c>=-1&&c<=21));
 assert.ok(cells.every(([r,c])=>r===1||r===6||c===-1||c===21));
 const runs=oppositeBorderRuns([[6,12],[6,13],[6,14],[6,17]],area);
 assert.deepEqual(runs,[{source:{r0:6,r1:6,c0:1,c1:3},dx:11},{source:{r0:6,r1:6,c0:6,c1:6},dx:11}]);
 const tile={position:[1,6,0,2,6,.4,1,7,.4],normal:[0,0,1,0,0,1,0,0,1],uv:[.1,.2,.3,.4,.5,.6],uv1:[.2,.3,.4,.5,.6,.7],index:[0,1,2]};
 const copied=copyOppositeBorder(tile,11);
 assert.deepEqual(copied.position,[12,6,0,13,6,.4,12,7,.4]);
 assert.deepEqual(copied.uv,tile.uv);
 assert.deepEqual(copied.uv1,tile.uv1);
});

test('a missing opposite segment is replaced by a complete consecutive segment, not one repeated prop',()=>{
 const strips=[];
 for(let col=3;col<=5;col++) {
   const x=col-.5;
   strips.push({position:[x,5.5,.2,x+1,5.5,.2,x+1,6.5,.2,x,6.5,.2],index:[0,1,2,0,2,3]});
 }
 const runs=completeOppositeRuns([{source:{r0:6,r1:6,c0:0,c1:2},dx:11}],strips);
 assert.deepEqual(runs,[{source:{r0:6,r1:6,c0:3,c1:5},dx:8}]);
 assert.equal(runs[0].source.c0+runs[0].dx,11);
 assert.equal(runs[0].source.c1+runs[0].dx,13);
});

test('cooperative field and intel view share the translated boss envelope',async()=>{
 const {boardArea,boardAreaForView,bandFor}=await import('../../public/js/render/app.js');
 assert.deepEqual(boardArea('unite'),boardArea('boss').map(a=>({...a,r0:a.r0+7,r1:a.r1+7})));
 assert.deepEqual(boardAreaForView('pen','unite'),boardArea('unite'));
 assert.deepEqual(bandFor('unite'),[7,18]);
});

test('a tall cut mountain fragment is never treated as a small decorative prop',()=>{
 const mountain={position:[1.6,5.6,0,2.4,5.6,0,2,6.4,8],index:[0,1,2]};
 const area=[{r0:6,r1:6,c0:2,c1:2}];
 assert.equal(sceneryForArea(mountain,area,{decorationOnly:true}).index.length,0);
 const ornament={...mountain,position:mountain.position.map((v,i)=>i%3===2?v/8:v)};
 assert.equal(sceneryForArea(ornament,area,{decorationOnly:true}).index.length,3);
});

test('right rear gaps use the reflected left garden, with outward faces and unchanged UVs',()=>{
 const runs=oppositeBorderRuns([[6,12],[6,13],[6,14]],[{r0:0,r1:5,c0:0,c1:20}],{mirror:true});
 assert.deepEqual(runs,[{source:{r0:6,r1:6,c0:6,c1:8},axis:20}]);
 const g={position:[6,6,0,7,6,0,6,7,1],normal:[1,0,0,1,0,0,1,0,0],uv:[0,0,1,0,0,1],index:[0,1,2]};
 const mirrored=reflectOppositeBorder(g,20);
 assert.deepEqual(mirrored.position,[14,6,0,13,6,0,14,7,1]);
 assert.deepEqual(mirrored.index,[0,2,1]);
 assert.deepEqual(mirrored.normal,[-1,0,0,-1,0,0,-1,0,0]);
 assert.equal(mirrored.uv,g.uv);
});
test('an adjoining pen lip does not hide an actually vacant border cell',()=>{
 const lip={position:[11.5,6.49,.2,14.5,6.49,.2,14.5,6.55,.2],index:[0,1,2],footprints:[]};
 assert.deepEqual(vacantBorderCells([[6,12],[6,13],[6,14]],[lip]),[[6,12],[6,13],[6,14]]);
 const planter={...lip,footprints:[{x0:11.5,x1:14.5,y0:5.5,y1:6.5}]};
 assert.deepEqual(vacantBorderCells([[6,12],[6,13],[6,14]],[planter]),[],'whole authored planter footprint is still protected');
});

test('functional patch holes partition the shared map without overlapping the replacement',()=>{
 const hole={r0:2,r1:3,c0:9,c1:11};
 const parts=outsideTileAreas([hole]);
 for(let r=-2;r<=8;r++)for(let c=0;c<=20;c++)assert.equal(parts.filter(a=>r>=a.r0&&r<=a.r1&&c>=a.c0&&c<=a.c1).length,r>=2&&r<=3&&c>=9&&c<=11?0:1);
});

for(const[id,stage]of Object.entries(stages).filter(([id])=>!['act2autochess_m01','act2autochess_m03'].includes(id)))test(`${id}: opposite sand hill strip covers the right water notch with native heights and UVs`,()=>{
 const native=JSON.parse(gunzipSync(readFileSync(new URL(`../../public/assets/local/map/original/${id}-v16.json.gz`,import.meta.url))));
 const copies=[];
 for(const g of Object.values(native.buckets)) {
  if(/water|Dosshore_UI/i.test(g.material))continue;
  const low={...g,index:Array.from(g.index).filter((_,i,a)=>a.slice(i-i%3,i-i%3+3).every(id=>g.position[id*3+2]<=.85))};
  for(let r=3;r<=6;r++) {
   const sourceRow=r===4 || r===6 ? 5 : r;
   const part=surfaceForArea(low,[{r0:sourceRow,r1:sourceRow,c0:2,c1:2}]);
   copies.push({...reflectOppositeBorder({...part,position:part.position.map((v,i)=>i%3===1?v+r-sourceRow:v)},21),footprints:[]});
  }
 }
 const cells=[];for(let r=3;r<=6;r++)cells.push([r,19]);
 assert.deepEqual(uncoveredTileCells(cells,copies),[]);
});

test('a covered centre does not hide a gap at the edge of the tile',()=>{
 const g={position:[-.4,-.5,0,.5,-.5,0,.5,.5,0,-.4,.5,0],index:[0,1,2,0,2,3],footprints:[]};
 assert.deepEqual(vacantBorderCells([[0,0]],[g]),[]);
 assert.deepEqual(uncoveredTileCells([[0,0]],[g]),[[0,0]]);
});

test('copied decoration removes exact native overlap without losing its new face or lightmap',()=>{
 const native={position:new Float32Array([0,0,0,1,0,0,0,1,0]),index:new Uint16Array([0,1,2])}, occupied=new Set();
 uniqueCopiedFaces(native,occupied);
 const copy={position:[0,0,0,1,0,0,0,1,0,2,0,0],index:[2,1,0,1,3,2],uv:[0,0,1,0,0,1,2,0],uv1:[.1,.1,.2,.1,.1,.2,.3,.1]};
 const filtered=uniqueCopiedFaces(copy,occupied);assert.deepEqual(filtered.index,[1,3,2]);assert.equal(filtered.uv,copy.uv);assert.equal(filtered.uv1,copy.uv1);
 assert.deepEqual(uniqueCopiedFaces(copy,occupied).index,[]);
});
