import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkLoadout,resolveLoadout} from '../../shared/protocol.js';
import {loadoutRecord,resolveRecordLoadout} from '../../shared/loadoutRecord.js';
import {setChoice,parseStored,sanitizeEntries} from '../../public/js/ui/loadoutModel.js';
const skin={id:'skin_test',assets:{spine:'skin_test',avatar:'skin_test',portrait:'skin_test'},attackTiming:{front:{attack:{hit:.3,dur:1}}}};
const base={chessId:'chess_test',goldenId:'chess_test_b',tier:3,skill:{index:0},skills:[{index:0,isDefault:true}],assets:{spine:'char_test'},skins:[skin]};
const elite={...base,chessId:'chess_test_b',baseId:'chess_test',isGolden:true};
const get=id=>id===base.chessId?base:id===elite.chessId?elite:null;
test('skin choice persists, validates, reaches normal and elite model without changing combat stats',()=>{
 const entries=setChoice({},base,elite,{skin:'skin_test'});
 const restored=sanitizeEntries(parseStored(JSON.parse(JSON.stringify(entries))),get);
 assert.equal(restored.chess_test.skin,'skin_test');
 assert.equal(checkLoadout({chess_test:{skin:'unknown'}},get).error,'BAD_TARGET');
 for(const rec of [base,elite]){
  const selected=resolveLoadout(restored,rec,get);
  assert.equal(selected.skinId,'skin_test');
  const resolved=loadoutRecord(rec,resolveRecordLoadout(rec,selected));
  assert.equal(resolved.assets.spine,'skin_test');
  assert.deepEqual(resolved.attackTiming,skin.attackTiming);
  assert.equal(rec.assets.spine,'char_test','base data remains unchanged');
 }
 assert.deepEqual(setChoice(entries,base,elite,{skin:'default'}),{});
});

test('multi-effect garrisons display their shared description once',async()=>{
 const {garrisonTexts}=await import('../../public/js/ui/loadoutModel.js');
 const entries={a:{descRaw:'<획득 시> [염국] +6, [기적] +3'},b:{descRaw:'<획득 시> [염국] +6, [기적] +3'},c:{desc:'공격력 +2%'}};
 assert.deepEqual(garrisonTexts({garrisonIds:['a','b','c']},id=>entries[id]),['<획득 시> [염국] +6, [기적] +3','공격력 +2%']);
});

test('skin-only edits stay out of adjusted roster/count, but still persist and reset',async()=>{
 const {effectiveChoice,changedCount,filterRoster}=await import('../../public/js/ui/loadoutModel.js');
 const entries=setChoice({},base,elite,{skin:'skin_test'});
 assert.equal(effectiveChoice(entries,base,elite).changed,false);
 assert.equal(changedCount(entries,get),0);
 assert.deepEqual(filterRoster([base],{changedOnly:true},entries,get),[]);
 assert.equal(sanitizeEntries(entries,get).chess_test.skin,'skin_test');
});

test('shared appearance applies to purchase/ban/detail images and preserves explicit unit skins',async()=>{
 const {setAppearanceSource,appearanceRecord}=await import('../../public/js/ui/appearance.js');
 const {chessAvatarUrl,chessPortraitUrl}=await import('../../public/js/ui/assetUrls.js');
 const manifest={chars:{char_test:{avatar:'/default.png',portrait:'/default-portrait.png'},skin_test:{avatar:'/skin.png',portrait:'/skin-portrait.png'}}};
 setAppearanceSource(()=>({chess_test:{skin:'skin_test'}}));
 try{
  assert.equal(chessAvatarUrl(manifest,base),'/skin.png');
  assert.equal(chessPortraitUrl(manifest,elite),'/skin-portrait.png');
  const explicit={...base,assets:{spine:'skin_other',avatar:'skin_other'}};
  assert.equal(appearanceRecord(explicit),explicit,'another player’s explicit model is not replaced');
 }finally{setAppearanceSource(null);}
});

test('in-game loadout composition preserves selected costume',async()=>{
 const {chessLoadout}=await import('../../public/js/ui/gameLogic.js');
 const result=chessLoadout(base,{chess_test:{skin:'skin_test'}},get);
 assert.equal(result.record.assets.spine,'skin_test');
 assert.equal(result.changed,false);
});


test('Korean trait descriptions translate whole records before deduplication across the complete roster', async () => {
 const {readFile,access}=await import('node:fs/promises');
 const {garrisonTexts}=await import('../../public/js/ui/loadoutModel.js');
 const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
 let root='../../data/';
 try { await access(new URL('../../.cache/ursus-data/chess.json',import.meta.url)); root='../../.cache/ursus-data/'; } catch {}
 const [chess,gs]=await Promise.all([read(root+'chess.json'),read(root+'garrisons.json')]);
 const dictionary=Object.assign({},...await Promise.all(['official','data','manual','ui','patterns'].map(n=>read('../../public/i18n/ko/'+n+'.json'))));
 const translate=s=>dictionary[s]||dictionary[s.replace(/\\n/g,'\n')]||s;
 for(const c of Object.values(chess)) {
  const text=garrisonTexts(c,id=>gs[id],translate).join('\n');
  assert.ok(!/[\u3400-\u9fff]/u.test(text),c.chessId+': '+text);
 }
 const gravel=Object.values(chess).find(c=>c.charId==='char_237_gravel'&&!c.isGolden);
 assert.ok(gravel);
 const text=garrisonTexts(gravel,id=>gs[id],translate).join('\n');
 assert.equal((text.match(/배치 시/g)||[]).length,1,'Gravel does not repeat the deployment clause');
 assert.ok(text.includes('쓰러질 시'));
});

test('Santalla combined rest triggers and Vigil shared clauses are shown once without losing distinct effects',async()=>{
 const {garrisonTexts}=await import('../../public/js/ui/loadoutModel.js');
 const {readFile}=await import('node:fs/promises');
 const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
 const [cs,gs,ko]=await Promise.all([read('../../data/chess.json'),read('../../data/garrisons.json'),read('../../public/i18n/ko/data.json')]);
 for(const elite of [false,true]){
  const santalla=Object.values(cs).find(c=>c.charId==='char_464_sntlla'&&c.isGolden===elite) || Object.values(cs).find(c=>c.charId?.includes('sntlla')&&!!c.isGolden===elite);
  const text=garrisonTexts(santalla,id=>gs[id],s=>ko[s]||s).join('\n');
  assert.equal((text.match(/휴식 기간 진입 시/g)||[]).length,1);
  assert.equal((text.match(/휴식 기간 종료 시/g)||[]).length,1);
  assert.ok(text.includes(elite?'+8':'+4'));
  const luna=cs['chess_char_3_19_'+(elite?'b':'a')];
  assert.ok(luna);
  const lt=garrisonTexts(luna,id=>gs[id],s=>ko[s]||s).join('\n');
  assert.equal((lt.match(/약점 대미지로 변경/g)||[]).length,1);
  assert.ok(lt.includes('첫 3회'));
 }
 const entries={end:{desc:'<휴식 기간 종료 시> 맹약 중첩 +4'},both:{desc:'<휴식 기간 진입 시> <휴식 기간 종료 시> 맹약 중첩 +4'}};
 assert.deepEqual(garrisonTexts({garrisonIds:['end','both']},id=>entries[id]),['<휴식 기간 종료 시> 맹약 중첩 +4','<휴식 기간 진입 시> 맹약 중첩 +4']);
});

test('Executor, Radiant Nearl and Degenbrecher present combined traits once while keeping independent triggers',async()=>{
 const {garrisonTexts}=await import('../../public/js/ui/loadoutModel.js');
 const {readFile}=await import('node:fs/promises');
 const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
 const [cs,gs,ko]=await Promise.all([read('../../content/production/data/chess.json'),read('../../content/production/data/garrisons.json'),read('../../public/i18n/ko/data.json')]);
 const text=id=>garrisonTexts(cs[id],key=>gs[key],s=>ko[s]||s).join('\n');
 for(const suffix of ['a','b']) {
  const exe=text('chess_char_5_01_'+suffix);assert.equal((exe.match(/탄약을/g)||[]).length,1);assert.ok(exe.includes('라테라노'));assert.ok(exe.includes('예견'));
  const nearl=text('chess_char_6_17_'+suffix);assert.equal((nearl.match(/특질 획득/g)||[]).length,1);assert.equal((nearl.match(/재배치 시간/g)||[]).length,1);assert.ok(nearl.includes('재배치 시간'));assert.ok(nearl.includes('공격 속도'));
  const degen=text('chess_char_6_19_'+suffix);assert.equal((degen.match(/획득 시/g)||[]).length,1);assert.equal((degen.match(/배치 시/g)||[]).length,1);assert.ok(degen.includes('맹약 활성화 불필요'));
 }
});
