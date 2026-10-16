export const LAB_DUMMY_BOSS='boss_laboratory_jesselton';
export const LAB_DUMMY_ENEMY='enemy_laboratory_jesselton';
export const LAB_DUMMY_FIELDS=Object.freeze([
 {id:'maxHp',name:'최대 HP',min:1,max:1e12},{id:'atk',name:'공격력',min:0,max:1e9},{id:'def',name:'방어력',min:0,max:1e9},{id:'res',name:'마법 저항',min:0,max:100},
 {id:'elementRes',name:'원소 저항',min:0,max:100},{id:'elementDmgRes',name:'원소 대미지 저항',min:0,max:100},
]);
export function withLaboratoryDummy(raw,stats){
 const armor=raw.bosses?.boss_1||{enemyKey:'enemy_9013_acstmk'},model=raw.enemies?.enemy_1516_jakill,enemy=raw.enemies?.[armor?.enemyKey];if(!armor||!enemy||!model)return raw;
 return {...raw,bosses:{...raw.bosses,[LAB_DUMMY_BOSS]:{...structuredClone(armor),bossId:LAB_DUMMY_BOSS,name:'제셀톤 윌리엄스',enemyKey:LAB_DUMMY_ENEMY,handbookId:LAB_DUMMY_ENEMY,sortId:999,laboratoryDummy:true,abilities:['딜 측정용 대상입니다. 공격·이동·스킬을 사용하지 않습니다.'],parts:[],escortsByTemplate:{}}},enemies:{...raw.enemies,[LAB_DUMMY_ENEMY]:{...structuredClone(model),hitArea:structuredClone(enemy.hitArea),staticBody:true,key:LAB_DUMMY_ENEMY,name:'제셀톤 윌리엄스',spine:'enemy_1516_jakill',iconId:'enemy_1516_jakill',modelScale:(model.modelScale||1)*2.5,laboratoryDummy:true,stats:{...enemy.stats,...(validDummyStats(stats)?stats:{}),moveSpeed:0},skills:[],talents:[],summons:[],abilities:[],desc:'공격·이동·스킬을 사용하지 않는 딜 측정용 대상',descRaw:'공격·이동·스킬을 사용하지 않는 딜 측정용 대상'}}};
}
export function validDummyStats(value){return value&&typeof value==='object'&&LAB_DUMMY_FIELDS.every(f=>Number.isFinite(value[f.id])&&value[f.id]>=f.min&&value[f.id]<=f.max);}
