import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadData} from '../../server/data.js';import {normalAttackSfx} from '../../public/js/audio.js';
import {indexAudio} from '../../tools/assets/audio.mjs';import {unitCombatSounds} from '../../tools/assets/unit-combat-sounds.mjs';
const data=loadData('content/production/data'),resources=JSON.parse(fs.readFileSync('content/production/resources.json')),paths=new Set(resources.files.map(r=>r.path));
const official=indexAudio(JSON.parse(fs.readFileSync('.cache/gamedata/excel/audio_data.json')));
for(const c of Object.values(data.chess).filter(c=>c.chessId.startsWith('chess_custom_leithanien_')&&!c.isGolden))test(`${c.name}: official attack and skill sound files are indexed`,()=>{
 const unit=data.assets.audio.sfx.units[c.charId];assert.ok(unit?.attack);assert.ok(normalAttackSfx(c.charId,unit.attack));
 const resolved=unitCombatSounds(official,c.charId,c.skills,unit);assert.deepEqual(unit,resolved.unit);
 for(const file of resolved.paths)assert.ok(paths.has('/assets/audio/sfx/'+file),file);
});
