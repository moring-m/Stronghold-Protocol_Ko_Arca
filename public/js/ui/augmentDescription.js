import {tr} from '../i18n/i18n.js';
const terms=/속세의 음|Voice of Mundane|塵界の音|尘世之音|공격력|방어력|마법 저항|최대 HP|공격 속도|은신|냉각|빙결|ATK|DEF|RES|ASPD|Max HP|Invisible|Cold|Frozen|攻撃力|防御力|術耐性|最大HP|攻撃速度|ステルス|寒冷|凍結|攻击力|防御力|法术抗性|生命上限|攻击速度|隐匿|冻结/g;
export function formatAugmentDescription(source){
 // Exact dictionary lookup must happen before decoration changes the source string.
 const text=tr(String(source||''));
 return text.split(/(<[@$][^>]+>|<\/>)/g).map((part,i)=>i%2?part:part.split(/(\([^)]*\)|（[^）]*）)/g).map((chunk,k)=>{
  const highlighted=chunk.replace(/([+-]?\d+(?:\.\d+)?%?)/g,'<@ba.vup>$1</>').replace(terms,'<@ba.vup>$&</>');
  return k%2?`<@autochess.gray>${highlighted}</>`:highlighted;
 }).join('')).join('');
}
