import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSettings,shortcutFor} from '../../public/js/ui/gameLogic.js';
import {rebindHotkey,DEFAULT_HOTKEYS,facingSwallows} from '../../public/js/ui/gameLogic/shortcuts.js';
import {rowLp} from '../../public/js/ui/teamPanel.js';
test('saved shortcuts and shop side survive sanitization; rebinding swaps duplicate keys',()=>{
 const change=rebindHotkey(DEFAULT_HOTKEYS,'collapseShop','KeyR');
 const settings=sanitizeSettings({keys:change.keys,shopItemLeft:true});
 assert.equal(settings.shopItemLeft,true);assert.equal(settings.keys.refresh,'KeyC');
 assert.equal(shortcutFor({key:'r',code:'KeyR'},settings.keys),'collapseShop');
 assert.equal(shortcutFor({key:'c',code:'KeyC'},settings.keys),'refresh');
 assert.equal(shortcutFor({key:'r',code:'KeyR',repeat:true},settings.keys),null);
 assert.equal(shortcutFor({key:'r',target:{tagName:'INPUT'}},settings.keys),null);
 assert.equal(facingSwallows({key:'r',code:'KeyR'},settings.keys),true);
});
test('normal and cooperative leaks retain pending indicators and settled HP',()=>{
 for(const phase of ['COMBAT','UNITE']){
  const pub={phase,unite:{leakers:['p1']}};
  const p={playerId:'p1',lp:30,pendingLp:10,uniteLeft:12};
  assert.deepEqual(rowLp(p,pub,{lp:30,pending:10,unite:true,left:12}),{lp:30,pending:10,unite:true,left:phase==='UNITE'?12:null});
  assert.equal(rowLp(p,pub,{lp:20,pending:0}).lp,20);
 }
});
test('enemy preview has a persisted, rebindable shortcut and is disabled while typing',()=>{
 const legacy=sanitizeSettings({keys:{refresh:'KeyR',freeze:'KeyF',levelUp:'KeyD',retreat:'KeyQ',sell:'KeyX',ready:'Space',collapseShop:'KeyC'}});
 assert.equal(legacy.keys.enemyPreview,'KeyE');assert.equal(shortcutFor({key:'e',code:'KeyE'},legacy.keys),'enemyPreview');
 const changed=rebindHotkey(legacy.keys,'enemyPreview','KeyR');const saved=sanitizeSettings({keys:changed.keys});
 assert.equal(shortcutFor({key:'r',code:'KeyR'},saved.keys),'enemyPreview');assert.equal(saved.keys.refresh,'KeyE');
 assert.equal(shortcutFor({key:'r',code:'KeyR',target:{tagName:'INPUT'}},saved.keys),null);
});

test('adding preview shortcut preserves older custom bindings that already use E',()=>{
 const keys={...DEFAULT_HOTKEYS,refresh:'KeyE'};delete keys.enemyPreview;const saved=sanitizeSettings({keys});assert.equal(saved.keys.refresh,'KeyE');assert.notEqual(saved.keys.enemyPreview,'KeyE');assert.equal(new Set(Object.values(saved.keys)).size,Object.keys(DEFAULT_HOTKEYS).length);
});
