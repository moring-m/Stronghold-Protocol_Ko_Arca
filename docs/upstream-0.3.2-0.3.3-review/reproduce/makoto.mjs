import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||'.'), output=resolve(process.argv[3]||'parity-output');
fs.mkdirSync(output,{recursive:true});
const at=p=>pathToFileURL(resolve(root,p)).href;
const {loadData}=await import(at('server/data.js'));
const {makeBattle}=await import(at('test/helpers/battleHarness.js'));
const {setGameData}=await import(at('server/sim/content/support/index.js'));
const data=loadData(root+'/content/production/data');setGameData(data);
for(const skill of [0,1,2])for(const skin of[null,'skin_char_4217_makoto_p3r_1']){
const id='chess_custom_recruit_makoto_6_b',key=Object.keys(data.enemies).find(k=>k.startsWith('enemy_1001')),enemy=data.enemies[key];
const rec={...enemy,stats:{...enemy.stats,maxHp:1e7,atk:0,moveSpeed:0},attributes:{...enemy.attributes,maxHp:1e7,atk:0,moveSpeed:0}};
const h=makeBattle({data:{...data,enemies:{...data.enemies,[key]:rec}},stage:data.stages.act2autochess_m01,stageId:'act2autochess_m01',autoFinish:false,units:[{chessId:id,row:10,col:5,dir:'RIGHT',skillIndex:skill,...(skin?{skinId:skin}:{})}],enemies:[{key,time:0,route:{motion:'WALK',start:[10,6],end:[10,4],checkpoints:[]},mods:{hp:1000,speed:0}}],timeLimit:40});
const frames=[];let flipped=false,activated=false;while(h.b.time<31){h.b.step();const u=h.b.allyUnits[0];if(u?.deployed&&h.b.time>3&&!activated){activated=true;u.skill.gainSp(1000);}if(activated&&skill===2&&h.b.time>9&&!flipped){flipped=true;h.b.loseHp(u,u.hp+1);}if(activated&&skill===0&&h.b.time>5&&h.b.time<15)u.hp=Math.min(u.hp,u.s.maxHp*.4);if(activated&&skill===2&&u.mem.makoto.phase==='s3b')u.hp=Math.min(u.hp,u.s.maxHp*.5);frames.push({snap:h.b.snapshot(),ev:h.b.drainEvents()});}
const field=h.b.fieldMeta();const spawn=new Map(frames.flatMap(f=>f.ev.filter(e=>e[0]==='spawn').map(e=>[e[1].id,e[1]])));field.units=[...spawn.values()];const out={kind:'normal',stageId:'act2autochess_m01',field,frames,skill,skin};fs.writeFileSync(output+'/'+skill+(skin?'-skin':'-base')+'.json',JSON.stringify(out));console.log(skill,skin,field.units.map(u=>({id:u.id,spine:u.spine,skin:u.skinId})),h.b.errorCount);
}
