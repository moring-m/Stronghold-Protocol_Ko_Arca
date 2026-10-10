import {test} from 'node:test';import assert from 'node:assert/strict';
import {projectileStyle} from '../../public/js/render/projectileStyle.js';
import {PROJ} from '../../public/js/render/style.js';
test('weapons get distinct visuals without changing projectile timing',()=>{
 const bow=projectileStyle('arrow',{charId:'char_126_shotst'}),gun=projectileStyle('arrow',{charId:'char_103_angel'});
 assert.equal(bow.weaponSprite,undefined);assert.equal(bow.look,'dart');assert.equal(gun.look,'tracer');assert.equal(bow.speed,PROJ.arrow.speed);assert.equal(gun.speed,PROJ.arrow.speed);
 const enemyArts=projectileStyle('enemy',{attackType:'arts',name:'术师'},true),enemyBow=projectileStyle('enemy',{attackType:'phys',name:'弩手'},true);
 assert.equal(enemyArts.hit,'arts');assert.equal(enemyBow.weaponSprite,undefined);assert.equal(enemyArts.speed,PROJ.enemy.speed);
 assert.equal(projectileStyle('boomerang'),PROJ.boomerang);assert.equal(projectileStyle('mortar'),PROJ.mortar);
});

import {meleeStyle} from '../../public/js/render/projectileStyle.js';
test('melee weapon families distinguish thrusts, blunt hits, claws, blades and arts',()=>{
 assert.equal(meleeStyle({subProf:'charger'}),'thrust');assert.equal(meleeStyle({subProf:'fighter'}),'impact');assert.equal(meleeStyle({name:'猎犬'}),'claw');assert.equal(meleeStyle({subProf:'sword'}),'blade');assert.equal(meleeStyle({},'arts'),'arts');
});

test('healing projectiles use one quarter of their original visual size with unchanged travel speed',()=>{
 const p=projectileStyle('orb');assert.equal(p.head,.48*.25);assert.equal(p.width,.3*.25);assert.equal(p.len,.55*.25);assert.equal(p.speed,10);assert.equal(p.hit,'heal');
});
