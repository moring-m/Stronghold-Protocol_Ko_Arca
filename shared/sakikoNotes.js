// Visual projectile identity, captured when a note is released (mode switches do not recolor existing notes).
export function sakikoNoteProjectile(skillIndex,active,type,ordinal=0){
 if(skillIndex===0&&active&&ordinal>0)return `projectile_chr_oblvns_s1_${Math.min(8,ordinal)}`;
 if(skillIndex===2&&active)return `projectile_chr_oblvns_s3_${type==='arts'?'mag':'phy'}`;
 if(skillIndex===1)return `projectile_chr_oblvns_s2${type==='arts'?'_slow':''}`;
 return 'projectile_chr_oblvns';
}
