import{test}from'node:test';import assert from'node:assert/strict';import{loadData}from'../../server/data.js';import{applyCustomExtensions}from'../../shared/customExtensions.js';import{makeBattle,enemyRec}from'../helpers/battleHarness.js';
import {specBounds} from '../../server/match/fields.js';
import {GameData} from '../../server/match/gamedata.js';
const data=applyCustomExtensions(loadData('content/production/data'),{bonds:['leithanien'],stages:[],rules:[]});
for(const elite of [false,true])for(const active of [false,true])test(`Viviana damage trait ${elite?'promoted':'normal'}, Leithanien ${active?'active':'inactive'}`,()=>{
 const id='chess_custom_leithanien_viviana_'+(elite?'b':'a'),bonds={leithanienShip:{count:active?3:0,tier:active?1:0,active,layers:0},kazimierzShip:{count:3,tier:1,active:true,layers:0},skillfulShip:{count:2,tier:1,active:true,layers:0}};
 const raw={...data,enemies:{...data.enemies,enemy_trait_dummy:enemyRec({key:'enemy_trait_dummy',hp:1e9,atk:0,def:0,res:0,speed:0})}};
 const h=makeBattle({data:raw,autoFinish:false,bonds,units:[{chessId:id,row:10,col:3}]});h.step();const u=h.unit(id);u.profile.noAttack=true;
 const e=h.spawn('enemy_trait_dummy',{pos:[10,8]}),ps=h.b.getPlayer('p1'),base=Object.fromEntries(Object.entries(ps.bonds).map(([id,b])=>[id,b.layers]));
 const hit=()=>h.b.dealDamage(u,e,{amount:1,type:'true'});
 for(let i=0;i<7;i++)hit();assert.equal(ps.bonds.kazimierzShip.layers,base.kazimierzShip);
 h.b.dealDamage(u,e,{amount:0,type:'true'});assert.equal(ps.bonds.kazimierzShip.layers,base.kazimierzShip);hit();
 const mul=elite?2:1;assert.equal(ps.bonds.kazimierzShip.layers-base.kazimierzShip,2*mul);assert.equal(ps.bonds.skillfulShip.layers-base.skillfulShip,1*mul);assert.equal(ps.bonds.leithanienShip.layers-base.leithanienShip,active?2*mul:0);
 for(let i=0;i<80;i++)hit();assert.equal(ps.bonds.kazimierzShip.layers-base.kazimierzShip,22*mul);assert.equal(ps.bonds.skillfulShip.layers-base.skillfulShip,11*mul);
 assert.match(data.garrisons[u.def.raw.garrisonIds[0]].desc,/대미지를 8회.*카시미어/);assert.equal(h.b.errorCount,0);
});

test('Viviana uncapped damage-trigger gains are accepted by client result layer budgets',()=>{
 const gd=new GameData(data,'mode_multi_hard');const spec={kind:'normal',round:1,spawns:[],players:[{playerId:'p1',units:[{uid:1,kind:'chess',chessId:'chess_custom_leithanien_viviana_a'}],bonds:{leithanienShip:{layers:0},kazimierzShip:{layers:0},skillfulShip:{layers:0}}}]};
 const bounds=specBounds(spec,gd);for(const id of ['leithanienShip','kazimierzShip','skillfulShip'])assert.equal(bounds.players.get('p1').layerAllow.get(id),Infinity);
});
