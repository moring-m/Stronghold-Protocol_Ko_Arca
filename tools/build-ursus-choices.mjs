import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
/** Use the same event handlers, eligibility rules and fallback draw weights as the original faction cards. */
export async function buildUrsusChoices(dir){
 const read=async name=>JSON.parse(await readFile(join(dir,name+'.json'),'utf8'));
 const choices=await read('choices'),effects=await read('effects');
 const definitions=[
  {id:'allybuff_custom_ursus_oath',template:'allybuff_select_2_1',name:'지마의 맹세',desc:'자신의 우르수스, 기습, 불굴 맹약 중첩 +8. 다른 아군이 있으면 해당 아군도 획득.',team:true,params:{count:8,bond_list:'ursusShip,raidShip,indomShip'}},
  {id:'allybuff_custom_ursus_support',template:'allybuff_select_7_1',name:'우르수스 지원',desc:'우르수스 맹약의 무작위 오퍼레이터 1명 획득.',team:false,params:{count:1,bond:'ursusShip'}}
 ];
 for(const d of definitions){
  const source=structuredClone(effects[d.template]);
  Object.assign(source,{effectId:d.id,name:d.name,desc:d.desc,descRaw:d.desc,params:d.params});
  source.buffs[0].bb={count:d.params.count};source.buffs[0].bbStr=d.team?{bond_list:d.params.bond_list}:{bond:d.params.bond};
  effects[d.id]=source;
  choices.cards.tactic=choices.cards.tactic.filter(c=>c.effectId!==d.id);
  choices.cards.tactic.push({effectId:d.id,name:d.name,desc:d.desc,kind:'ally',stageId:null,team:d.team});
 }
 for(const [name,value]of Object.entries({choices,effects}))await writeFile(join(dir,name+'.json'),JSON.stringify(value,null,name==='choices'?2:undefined)+(name==='choices'?'\n':''));
}
