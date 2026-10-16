import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeCooperativeGeometry} from '../../public/js/render/board3d/scene.js';
import {eightUniteStage} from '../../shared/cooperativeEight.js';

test('four-field native geometry reuses the matching source, duplicates both fields, and preserves UV/lightmap data',()=>{
 const g={position:[],normal:[],uv:[],uv1:[],index:[],platform:true,material:'sand',lightMap:'sand-baked'};
 for(const c of [3,11]){const n=g.position.length/3;g.position.push(c-.4,10-.4,0,c+.4,10-.4,0,c,10+.4,0);g.normal.push(0,0,1,0,0,1,0,0,1);g.uv.push(0,0,1,0,.5,1);g.uv1.push(.1,.2,.3,.4,.5,.6);g.index.push(n,n+1,n+2);}
 const before=JSON.stringify(g),joined=nativeCooperativeGeometry(g);
 assert.equal(joined.index.length,12);assert.equal(joined.lightMap,g.lightMap);assert.equal(joined.material,g.material);assert.equal(joined.uv1.length,joined.position.length/3*2);
 const columns=new Set(Array.from(joined.index,i=>Math.round(joined.position[i*3])));assert.deepEqual([...columns].sort((a,b)=>a-b),[3,11,19,27]);
 assert.equal(JSON.stringify(g),before);assert.equal(nativeCooperativeGeometry(g),joined);
 const stage=eightUniteStage({id:'original',rows:Array(19).fill('R'.repeat(21)),devices:[]});assert.equal(stage.originalStageId,'original');
});

test('native join preserves the ordinary middle divider, including raised geometry, without a background gap',()=>{
 const g={position:[],normal:[],uv:[],index:[],platform:true};
 const triangle=(x,y,z)=>{const n=g.position.length/3;g.position.push(x-.49,y-.49,z,x+.49,y-.49,z,x,y+.49,z);g.normal.push(0,0,1,0,0,1,0,0,1);g.uv.push(0,0,1,0,.5,1);g.index.push(n,n+1,n+2);};
 for(let r=9;r<=12;r++)for(let c=8;c<=10;c++)triangle(c,r,c===10?.43:-.04);
 triangle(16,16,-1);triangle(17,16,-1);
 const joined=nativeCooperativeGeometry(g),cells=new Set(Array.from(joined.index,i=>`${Math.round(joined.position[i*3])},${Math.round(joined.position[i*3+1])},${Math.round(joined.position[i*3+2]*100)/100}`));
 for(let r=9;r<=12;r++)for(let c=16;c<=18;c++)assert.ok(cells.has(`${c},${r},${c===18?.43:-.04}`),`divider ${c},${r}`);
 assert.ok(cells.has('16,16,-1'));assert.ok(cells.has('17,16,-1'));
});

test('new middle divider repeats the ordinary cooperative tile types and devices',()=>{
 const rows=Array(19).fill('R'.repeat(21));rows[10]='R'.repeat(8)+'rf#'+'R'.repeat(10);
 const stage=eightUniteStage({id:'source',rows,devices:[{key:'device',pos:[10,9],rangeTiles:[[10,9]]},{key:'outer',pos:[10,17]}]});
 assert.equal(stage.rows[10].slice(16,19),'rf#');
 assert.ok(stage.devices.some(d=>d.key==='device'&&d.pos[1]===17&&d.rangeTiles[0][1]===17));
 assert.ok(!stage.devices.some(d=>d.key==='outer'&&d.pos[1]===17));
});

import {blendCooperativeBackground} from '../../public/js/render/board3d/scene.js';
test('scenic seam joins elevations smoothly while leaving play tiles and texture coordinates intact',()=>{
 const make=z=>({position:[17.5,14,z,17.5,16,z,15,14,z,17.5,10,z],uv:[0,0,1,1,0,1,1,0],index:[0,1,2]});
 const left=make(2),right=make(6),before=JSON.stringify([left,right]),[a,b]=blendCooperativeBackground(left,right);
 assert.equal(a.position[2],4);assert.equal(b.position[2],4);assert.equal(a.position[11],2);assert.equal(b.position[11],6);assert.equal(a.position[8],2);assert.deepEqual(a.uv,left.uv);assert.equal(JSON.stringify([left,right]),before);
});

import {sceneryForArea} from '../../public/js/render/board3d/scene.js';
test('four-field rear preview props are hidden rather than mistaken for scenery outside a 21-column board',()=>{
 const g={position:[25,15,0,26,15,0,25,16,0,40,15,0,41,15,0,40,16,0],index:[0,1,2,3,4,5]};
 assert.deepEqual(sceneryForArea(g,[{r0:6,r1:13,c0:0,c1:36}],{cols:37}).index,[3,4,5]);
});

import {loadData} from '../../server/data.js';
import {buildBoard} from '../../public/js/render/board3d/layout.js';
import {eightUniteRoutes} from '../../shared/cooperativeEight.js';
test('every production four-field map shows entry gates for all four fields without changing enemy routes',()=>{
 const data=loadData('content/production/data');let count=0;
 for(const stage of Object.values(data.stages)){
  if(!stage.rows?.some((row,r)=>r>=9&&r<=12&&row[18]==='S'))continue;
  const expanded=eightUniteStage(stage),board=buildBoard(expanded);
  for(const col of [10,18,26,34])for(const row of [9,12])assert.ok(board.gates.some(g=>g.kind==='start'&&g.r===row&&g.c===col),`${stage.id}: entry ${row},${col}`);
  const routes=eightUniteRoutes([{start:[9,18],end:[9,2],checkpoints:[]}]);assert.deepEqual(routes[0].start,[9,34]);assert.deepEqual(routes[0].end,[9,2]);count++;
 }
 assert.equal(count,13);
});
