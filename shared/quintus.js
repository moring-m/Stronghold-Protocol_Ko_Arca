// Official ability animation keys, not skill-slot numbering (upstream dev §35.19 / §35.55).
export const QUINTUS_CLIP = Object.freeze({Tidewater:1.667,Rockfall:3,SummonTentac:2,Doom:4.467});
export const QUINTUS_ANIMATION = Object.freeze({Tidewater:'Skill_02',Rockfall:'Skill_01',SummonTentac:'Skill_03',Doom:'Skill_04'});
const ORDER=['Tidewater','Rockfall','SummonTentac','TidewaterG1','RockfallG1','SummonTentacG1','TidewaterG2','RockfallG2','SummonTentacG2','Doom'];
export function quintusRoles(roles,animations){
 const skills={...roles.skills};
 for(const [index,name]of ORDER.entries()){
  const loop=QUINTUS_ANIMATION[name.replace(/G\d$/,'')];if(!(animations[loop]>0))throw Error('Missing Quintus animation '+loop);
  skills[index]={begin:null,loop,end:null,index,idle:null};
 }
 return {...roles,skills,skill:skills[0]};
}
