import test from'node:test';import assert from'node:assert/strict';
import{SkillFx}from'../../public/js/render/vfx/skillfx.js';
import{enemyCoverOf}from'../../public/js/render/vfx/skills.js';
test('Quintus tide uses its official wave only when the window has a drawable effect',()=>{
 const win={plan:{skillId:'tidewaterg2',attacks:[{cast:[{key:'wave'}],range:[]}]},draws:false};
 const U={key:'enemy_1521_dslily',v:{},ewin:win};
 const s={units:new Map([[1,U]]),w:{ofx:{lib:{has:key=>key==='wave'}}},_ewinDraws:SkillFx.prototype._ewinDraws};
 assert.ok(enemyCoverOf(U.key,'TidewaterG2','tide'));assert.ok(SkillFx.prototype._covered.call(s,'tide',{id:1}));
 s.w.ofx.lib.has=()=>false;assert.equal(SkillFx.prototype._covered.call(s,'tide',{id:1}),false,'missing art retains simple tide');
 win.draws=true;assert.ok(SkillFx.prototype._covered.call(s,'tide',{id:1}));
 U.key='enemy_9013_acstmk';assert.equal(SkillFx.prototype._covered.call(s,'tide',{id:1}),false,'other bosses are unchanged');
});
