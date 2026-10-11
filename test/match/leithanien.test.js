import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {Match} from '../../server/match/Match.js';
import {VirtualScheduler} from '../../server/match/scheduler.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {createRegistry} from '../../server/match/effectsMeta.js';
const data=loadData(new URL('../../.cache/leithanien-data/',import.meta.url).pathname);
function create(t){setGameData(data);const m=new Match({data,mode:'solo',difficulty:'NORMAL',roomCode:'TEST',seed:1,scheduler:new VirtualScheduler(),customExtensions:{bonds:['leithanien'],stages:[],protectedBonds:['leithanienShip']},seats:[{seat:0,playerId:'p',name:'test'}],registry:createRegistry(),send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());return {m,ps:m.players.get('p')};}
test('acquisition and Bassline preparation trait use active bonds and per-operator contribution',t=>{
 const {m,ps}=create(t);
 ps.acquireChess('chess_custom_leithanien_earthspirit_a',{fromPool:false});assert.equal(ps.layers.leithanienShip,3);
 ps.board.clear();ps.hand.fill(null);ps.bandId=null;
 for(const [r,c,id]of [[10,3,'bassline'],[10,4,'viviana'],[10,5,'ebenholz']])ps.board.set(`${r},${c}`,ps.newPiece('chess',`chess_custom_leithanien_${id}_a`));
 ps.bondCountBonus.skillfulShip=3;ps.bondCountBonus.arcaneShip=3;ps.recompute();const before=ps.layers.leithanienShip;
 m.dispatch(ps,'onPrepEnd',{});assert.equal(ps.layers.leithanienShip,before+6);assert.equal(ps.layers.skillfulShip,2);assert.equal(ps.layers.arcaneShip,2);assert.equal(m.errorCount,0);
});
test('Witch King rewards each 40-layer milestone once, below shop tier, without shared stock',t=>{
 const {m,ps}=create(t);ps.bandId='band_custom_leithanien_witchking';ps.shop.level=3;
 ps.addLayers('leithanienShip',80);const gifts=[...ps.hand,...ps.temp].filter(p=>p?.kind==='chess');assert.equal(gifts.length,1);for(const p of gifts){assert.ok(m.gd.chess(p.id).tier<3);assert.equal(p.poolCopies,0);}
 m.dispatch(ps,'onPrepStart',{});assert.equal([...ps.hand,...ps.temp].filter(p=>p?.kind==='chess').length,1);m.round++;m.dispatch(ps,'onPrepStart',{});assert.equal([...ps.hand,...ps.temp].filter(p=>p?.kind==='chess').length,2);assert.equal(m.errorCount,0);
});
