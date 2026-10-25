import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||'.'), output=resolve(process.argv[3]||'parity-output');
fs.mkdirSync(output,{recursive:true});
const at=p=>pathToFileURL(resolve(root,p)).href;
const {loadData,setData}=await import(at('server/data.js'));
const {makeBattle}=await import(at('test/helpers/battleHarness.js'));
const {setGameData}=await import(at('server/sim/content/support/index.js'));
import {createHash} from 'node:crypto';
const data=loadData(root+'/content/production/data');setData(data);setGameData(data);
const keys=Object.keys(data.chess).filter(k=>k.startsWith('chess_char_')&&k.endsWith('_a')).sort();const results=[];
for(const [n,id]of keys.entries()){
 const key='enemy_1001_bigbo',rec=data.enemies[key];const enemy={...rec,stats:{...rec.stats,maxHp:1e8,atk:0,moveSpeed:0}};
 const h=makeBattle({data:{...data,enemies:{...data.enemies,[key]:enemy}},seed:12345+n,stage:data.stages.act2autochess_m01,stageId:'act2autochess_m01',autoFinish:false,timeLimit:20,
 units:[{chessId:id,row:10,col:5,dir:n%3===0?'UP':'RIGHT'}],enemies:[{key,time:0,route:{motion:'WALK',start:[10,6],end:[10,4],checkpoints:[]},mods:{hp:1000,speed:0}}]});
 const hash=createHash('sha256');let filled=false;
 while(h.b.time<12){h.b.step();const u=h.b.allyUnits[0];if(h.b.time>=3&&!filled){filled=true;u?.skill?.gainSp(1000);}hash.update(JSON.stringify({snap:h.b.snapshot(),ev:h.b.drainEvents()}));}
 results.push({id,hash:hash.digest('hex'),errors:h.b.errorCount});
}
fs.writeFileSync(output+'/roster.json',JSON.stringify(results,null,2));console.log(results.length,'scenarios',results.filter(x=>x.errors).length,'with errors');
