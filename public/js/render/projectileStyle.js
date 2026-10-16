import { PROJ } from './style.js';
// Visual-only weapon families: never change server projectile speed or damage timing.
const BOW_USERS=new Set(['char_197_poca','char_126_shotst','char_332_archet','char_430_fartth','char_124_kroos','char_1021_kroos2','char_133_mm','char_158_milu','char_219_meteo','char_340_shwaz','char_118_yuki','char_145_prove','char_261_sddrag','char_366_acdrop','char_211_adnach','char_193_frostl']);
function weaponStyle(kind,info={},isEnemy=false){
 const base=PROJ[kind === 'arts' ? 'bolt' : kind];if(!base)return base;
 if(!['arrow','enemy','bolt'].includes(kind))return base;
 const name=String(info.name||''),id=info.charId||info.spine||'';
 let family=kind==='bolt'?'arts':isEnemy&&info.attackType==='arts'?'arts':'bullet';
 if(kind==='arrow'&&BOW_USERS.has(id)||isEnemy&&/弩|弓|箭/.test(name))family='bow';
 if((isEnemy&&/炮|投石|抛掷|박격|곡사|투척|포병/.test(name)) || /bombarder|siegesniper|fortress|splashcaster/.test(info.subProf||''))family='shell';
 if(kind==='arrow'&&info.charId==='char_1015_aglna2')return {...base,look:'dart',tint:0xb8f2e6,glow:0x64cbbb,len:.7,width:.08,head:.18,muzzle:null,trail:0x64cbbb,hit:'spark'};
 if(family==='bow')return {...base,look:'dart',tint:0xe6dcc4,glow:0xbcab82,len:.4,width:.065,head:.14,muzzle:null,trail:0xbcab82,hit:'spark'};
 if(family==='bullet')return {...base,look:'tracer',tint:0xfff0c8,glow:0xe6b46c,len:.65,width:.055,head:.13,muzzle:0xe6b46c,trail:null,hit:'spark'};
 if(family==='shell')return {...base,look:'shell',tint:0xd4c4a4,glow:0xc99763,len:.2,width:.09,head:.24,arc:.8,smoke:0x34302c,muzzle:0xc99763,hit:'boom'};
 const electric=isEnemy&&/电|磁/.test(name),fire=isEnemy&&/火|炎|燃/.test(name);
 const color=electric?0x77bfea:fire?0xe79b60:0xab83d1;
 return {...base,look:'orb',tint:color,glow:color,trail:color,len:.22,width:.1,head:.22,muzzle:color,hit:'arts'};
}

// Set from the enemy's actual icon palette; visual metadata never affects attack timing.
export function projectileStyle(kind,info={},isEnemy=false){
 const style=weaponStyle(kind,info,isEnemy);if(!style||!isEnemy)return style;
 const color=Number.isInteger(info.projectileColor)?info.projectileColor:null;
 return color===null?style:{...style,tint:color,glow:color,trail:style.trail===null?null:color,muzzle:style.muzzle===null?null:color};
}

export function meleeStyle(info={},damageType='phys') {
 const sub=info.subProf || '',name=String(info.name || ''),id=String(info.defId || '');
 if(damageType!=='phys' || /artsfghter|artsfighter/.test(sub))return 'arts';
 if(/charger|puller|lancer/.test(sub) || /矛|枪兵|창병/.test(name))return 'thrust';
 if(/fighter|brawler|protector|guardian|juggernaut|pusher/.test(sub) || /锤|拳|돌격병|분쇄자/.test(name))return 'impact';
 if(/獒|猎犬|狼|兽|사냥개|늑대/.test(name) || /hound|dog|beast|slime/.test(id))return 'claw';
 return 'blade';
}
