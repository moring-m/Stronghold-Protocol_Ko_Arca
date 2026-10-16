import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {normalizeSnapshot} from '../../public/js/render/interp.js';
const data=loadData('content/production/data');
for(const id of ['chess_char_1_17_a','chess_custom_leithanien_ebenholz_a','chess_custom_leithanien_ebenholz_b'])test(`${id}: charge metadata preserves allied and enemy render frames`,()=>{
 const h=makeBattle({data:{...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0})}},autoFinish:false,units:[{uid:1,chessId:id,row:10,col:4},{uid:2,chessId:'chess_char_1_01_a',row:10,col:3}]});
 h.run(.2);h.spawn('dummy',{pos:[10,9]});
 for(let i=0;i<6;i++){
  h.run(.1);const wire=h.b.snapshot(),frame=normalizeSnapshot(wire);
  assert.ok(frame);assert.ok(frame.units.size>=3);assert.ok(Array.isArray(wire.energy));
  for(const row of wire.energy)assert.equal(row.length,3);
 }
 assert.equal(h.b.errorCount,0);
});
