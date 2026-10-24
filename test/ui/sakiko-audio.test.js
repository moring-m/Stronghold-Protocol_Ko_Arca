import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {AudioManager} from '../../public/js/audio.js';
const manifest=JSON.parse(readFileSync('content/production/data/assets.json')),catalog=JSON.parse(readFileSync('content/production/resources.json'));
test('Sakiko official sound mapping covers every note mode and is included in resource downloads',()=>{
 const u=manifest.audio.sfx.units.char_4182_oblvns;assert.ok(u);for(const key of ['projectile_chr_oblvns','projectile_chr_oblvns_s2','projectile_chr_oblvns_s2_slow','projectile_chr_oblvns_s3_phy','projectile_chr_oblvns_s3_mag',...Array.from({length:8},(_,i)=>'projectile_chr_oblvns_s1_'+(i+1))])for(const role of ['launch','hit'])assert.ok(catalog.files.some(f=>f.path===u.notes[key][role]),key+' '+role);for(const i of [0,1,2])assert.ok(u.skills[i]);
});
test('note SFX use real launch/contact events without duplicate generic attack sounds',()=>{
 const a=new AudioManager({getManifest:()=>manifest,random:()=>0});a.ctx={};const played=[];a._play=(url,opts)=>played.push({url,opts});a._track({id:1,charId:'char_4182_oblvns',side:'ally',kind:'op',skillIndex:2});a._track({id:2,spine:'enemy_1006_shield',side:'enemy'});
 const p='projectile_chr_oblvns_s3_mag';a.handleBattleEvents([['atk',1,2,'arts'],['fx','sakikoNoteSound',4,10,{id:1,projectile:p,phase:'launch'}],['dmg',2,10,'arts',1],['fx','sakikoNoteHit',5,10,{id:1,target:2,projectile:p}]]);
 assert.deepEqual(played.map(p=>p.url),[manifest.audio.sfx.units.char_4182_oblvns.notes[p].launch,manifest.audio.sfx.units.char_4182_oblvns.notes[p].hit]);assert.ok(played.every(p=>p.opts.limited));
});
