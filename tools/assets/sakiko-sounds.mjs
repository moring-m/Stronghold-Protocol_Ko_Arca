// Official audio_data banks: Sakiko uses ON_ABILITY_ON/custom triggers rather than standard skill-start banks.
export function sakikoSounds(audio){
 const paths=new Set(),unit={notes:{},skills:{}};
 const put=(to,key,name)=>{const bank=audio.bank(name);if(!bank?.length)return;const path=bank[0];paths.add(path);to[key]='/assets/audio/sfx/'+path;const mix=audio.mixOf(bank);if(mix)to[key+'Mix']=mix;};
 put(unit,'born','battle.ON_UNIT_BORN.char_4182_oblvns');put(unit,'die','battle.ON_UNIT_DEAD.char_4182_oblvns');
 put(unit.skills,0,'battle.ON_ABILITY_START.skchr_oblvns_1');
 put(unit.skills,1,'battle.ON_SKILL_START.skchr_oblvns_2.1');
 put(unit.skills,2,'battle.ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]');
 for(const key of ['projectile_chr_oblvns','projectile_chr_oblvns_talent','projectile_chr_oblvns_s2','projectile_chr_oblvns_s2_slow','projectile_chr_oblvns_s3_phy','projectile_chr_oblvns_s3_mag',...Array.from({length:8},(_,i)=>'projectile_chr_oblvns_s1_'+(i+1))]){
  const rec={};put(rec,'launch','battle.ON_PROJECTILE_BORN.'+key);
  if(!rec.launch)put(rec,'launch',key.includes('_s1_')?'battle.ON_ABILITY_START.skchr_oblvns_1':'battle.ON_ABILITY_ON.char_4182_oblvns.attack.0.1');
  put(rec,'hit',key.includes('_s1_')?'battle.ON_CUSTOM_TRIGGER.projectile_chr_oblvns_s1_hit':'battle.ON_PROJECTILE_HIT.'+key);
  unit.notes[key]=rec;
 }
 return {unit,paths:[...paths]};
}
