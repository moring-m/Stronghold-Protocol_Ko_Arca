import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA,makeMatch} from './harness.js';
import {customExtensionCatalog,normalizeCustomExtensions,modeExtensionSelection,extensionSelectionShape} from '../../shared/customExtensions.js';
test('eight-player explicit operator bans survive settings and block all acquisition forms',t=>{
 const entry=customExtensionCatalog(DATA).bannedOperators.find(e=>!DATA.chess[e.id].optionalRecruit);assert.ok(entry);
 const selection={bonds:[],stages:[],bannedOperators:[entry.id]};assert.ok(extensionSelectionShape(selection));assert.deepEqual(modeExtensionSelection(normalizeCustomExtensions(selection,DATA),'coop8').bannedOperators,[entry.id]);
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:selection});t.after(()=>h.m.dispose());const m=h.m,p=m.order[0];
 assert.deepEqual(m.disabledBonds,[]);assert.deepEqual(m.bannedChess,[entry.id]);assert.equal(m.pool.has(entry.id),false);assert.equal(p.canRecruit(entry.id),false);assert.equal(p.acquireChess(entry.id,{fromPool:false}),null);assert.equal(m.augments.operatorAvailable(entry.id,p),false);
 const elite=Object.values(m.data.chess).find(c=>c.isGolden&&c.baseId===entry.id);if(elite){assert.equal(p.canRecruit(elite.chessId),false);assert.equal(p.acquireChess(elite.chessId,{fromPool:false}),null);}
});
