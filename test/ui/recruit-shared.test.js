import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setRecruitChoice,setRecruitSelection,effectiveChoice} from '../../public/js/ui/loadoutModel.js';
const chess=JSON.parse(readFileSync('content/production/data/chess.json'));
const get=id=>chess[id];
const a=Object.values(chess).find(c=>c.optionalRecruit&&!c.isGolden&&c.chessId.endsWith('_a')&&!c.recruitPrototype&&c.tier===5&&get(c.chessId.replace('_5_a','_6_a'))?.charId===c.charId&&c.skills?.length===3);
const b=get(a.chessId.replace('_5_a','_6_a'));
test('recruit skill/module settings are shared both ways without selecting another tier',()=>{
 let entries={[a.chessId]:{selected:true}};
 entries=setRecruitChoice(entries,a,{skill:0,module:'none'},get);
 for(const c of [a,b]) {const value=effectiveChoice(entries,c,get(c.goldenId));assert.equal(value.skill,0);assert.equal(value.module,'none');}
 assert.equal(entries[a.chessId].selected,true);assert.equal(entries[b.chessId].selected,undefined);
 entries=setRecruitChoice(entries,b,{skill:1},get);
 assert.equal(effectiveChoice(entries,a,get(a.goldenId)).skill,1);
 entries=setRecruitSelection(entries,a,6,get);
 assert.equal(entries[a.chessId]?.selected,undefined);assert.equal(entries[b.chessId].selected,true);
 assert.equal(effectiveChoice(entries,b,get(b.goldenId)).skill,1);
});
test('switching tier migrates an existing tier-only choice',()=>{
 const entries=setRecruitSelection({[a.chessId]:{selected:true,skill:0,module:'none'}},a,6,get);
 assert.equal(effectiveChoice(entries,b,get(b.goldenId)).skill,0);
 assert.equal(effectiveChoice(entries,b,get(b.goldenId)).module,'none');
});
test('prototype tiers retain independent selection flags when sharing legal choices',()=>{
 const p=Object.values(chess).find(c=>c.optionalRecruit&&c.recruitPrototype&&!c.isGolden&&c.chessId.endsWith('_5_a')&&get(c.chessId.replace('_5_a','_6_a')));
 assert.ok(p);
 const q=get(p.chessId.replace('_5_a','_6_a'));
 let entries=setRecruitSelection({},p,5,get);
 entries=setRecruitSelection(entries,q,6,get);
 assert.equal(entries[p.chessId].selected,true);assert.equal(entries[q.chessId].selected,true);
 entries=setRecruitChoice(entries,p,{module:'none'},get);
 assert.equal(entries[p.chessId].selected,true);assert.equal(entries[q.chessId].selected,true);
 entries=setRecruitSelection(entries,p,5,get);
 assert.equal(entries[p.chessId]?.selected,undefined);assert.equal(entries[q.chessId].selected,true);
});
