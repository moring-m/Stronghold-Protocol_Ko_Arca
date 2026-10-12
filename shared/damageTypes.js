// A single ordered legend for the live laboratory chart and saved battle reports.
export const DAMAGE_TYPES=Object.freeze([
 ['physicalDamage','물리 대미지','phys','#ec9296'],
 ['artsDamage','마법 대미지','arts','#8ab8ed'],
 ['elementalDamage','원소 대미지','element','#4ed8af'],
 ['noteDamage','속세의 음','note','#b49bd8'],
 ['trueDamage','트루 대미지','true','#ffffff'],
 ['unclassifiedDamage','유형 미기록 대미지','unclassified','#90999b'],
].map(([key,label,className,color])=>Object.freeze({key,label,className,color})));
export function damageValues(stats={}){
 const values=DAMAGE_TYPES.slice(0,-1).map(({key})=>Math.max(0,Number(stats[key])||0));
 values.push(Math.max(0,(Number(stats.dmg)||0)-values.reduce((a,b)=>a+b,0)));
 return values;
}
