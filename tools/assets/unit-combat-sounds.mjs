import {pickUnitSfx,pickModeAttacks,pickModeHits,SLOT_MODE_LETTER,skillModeLetter} from './audio.mjs';
import {skillCombatSounds} from './skill-combat-sounds.mjs';

// Resolve custom operators through the same official banks as base operators.
export function unitCombatSounds(audio,id,skills,existing={}) {
 const unit=structuredClone(existing),paths=new Set(),banks=audio.unitBanks.get(id),short=id.replace(/^char_\d+_/,'');
 const put=(target,key,bank)=>{if(bank?.length){target[key]=`/assets/audio/sfx/${bank[0]}`;paths.add(bank[0]);}};
 const base=pickUnitSfx(banks,{operator:true,projectile:{born:audio.bank(`battle.ON_PROJECTILE_BORN.projectile_chr_${short}`),hit:audio.bank(`battle.ON_PROJECTILE_HIT.projectile_chr_${short}`)}});
 for(const [role,bank] of Object.entries(base)){put(unit,role,bank);const mix=audio.mixOf(bank);if(mix)(unit.mix||={})[role]=mix;}
 const attacks=pickModeAttacks(banks),hits=pickModeHits(banks);
 unit.skills={};unit.skillCombat={};
 for(const skill of skills){
  const i=skill.index,start=audio.bank(`battle.ON_SKILL_START.${skill.skillId}`);
  unit.skills[i]=null;put(unit.skills,i,start);
  const mode=skillModeLetter(start[0])||SLOT_MODE_LETTER[i];
  for(const [role,table] of [['attack',attacks],['hit',hits]]){
   const bank=table[mode];if(!bank?.length)continue;
   put(unit[role==='attack'?'attacks':'hits']||={},i,bank);
   const mix=audio.mixOf(bank);if(mix)(unit[role+'Mix']||={})[i]=mix;
  }
  const combat=skillCombatSounds(audio,id,i);
  // AUTO next-attack skills expose their strike cue under the exact skill id.
  // This is an attack sound, not an activation cue or a numbered mode guess.
  if(skill.skillType==='AUTO' && !(skill.duration>0) && !combat.attack){
   const bank=audio.bank(`battle.ON_ABILITY_START.${skill.skillId}`);
   if(bank?.[0]?.startsWith('player/p_atk/'))combat.attack={path:bank[0],mix:audio.mixOf(bank)};
  }
  if(Object.keys(combat).length){unit.skillCombat[i]={};for(const [role,rec]of Object.entries(combat)){put(unit.skillCombat[i],role,[rec.path]);if(rec.mix)(unit.skillCombat[i].mix||={})[role]=rec.mix;}}
 }
 return {unit,paths:[...paths]};
}
