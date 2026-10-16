import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedResources,normalizeResourceSelection,officialFxDownloaded} from '../../shared/resourceSelection.js';
import {aromaOriginOffset} from '../../public/js/render/vfx/wiring.js';
const files=['/assets/char/a.png','/assets/audio/voice/kr/a/x.mp3','/assets/audio/voice/jp/a/x.mp3','/assets/audio/sfx/a.mp3','/assets/local/fx/index.json','/assets/local/fx/prefabs/a.json'].map(path=>({path,bytes:10}));
test('default download excludes official effects and Japanese voices but retains models and battle SFX',()=>{
 const r=selectedResources({version:'test',files},null);
 assert.deepEqual(r.files.map(f=>f.path),[files[0].path,files[1].path,files[3].path]);assert.equal(r.estimatedBytes,30);
});
test('Japanese official selection includes that pack and excludes Korean voices, with its own completion marker',()=>{
 const r=selectedResources({version:'test',files},{voice:'jp',effects:'official'});
 assert.equal(r.files.length,5);assert.equal(r.files.some(f=>f.path===files[1].path),false);assert.equal(r.estimatedBytes,50);
 assert.equal(r.sourceVersion,'test');assert.equal(selectedResources(r,{voice:'jp',effects:'official'}).version,r.version);
 assert.notEqual(r.version,selectedResources({version:'test',files},null).version);
 assert.deepEqual(normalizeResourceSelection({voice:'bad',effects:'bad'}),{voice:'kr',effects:'simple'});
 assert.equal(officialFxDownloaded({getItem:()=>null}),false);assert.equal(officialFxDownloaded({getItem:()=>'1'}),true);
});
test('Aroma directional stream origin moves forward in every deployment direction without shifting hit and buff effects',()=>{
 for(const [dir,offset]of Object.entries({RIGHT:[1,0],LEFT:[-1,0],UP:[0,1],DOWN:[0,-1]})){
  for(const key of ['aroma_attack_start_01','aroma_skill_01_start_01','aroma_skill_02_range_02'])assert.deepEqual(aromaOriginOffset(key,dir),offset);
  for(const key of ['aroma_attack_hit_01','aroma_skill_02_buff_01','other_attack_start_01'])assert.deepEqual(aromaOriginOffset(key,dir),[0,0]);
 }
});

test('Aroma origin correction is retained when a held stream follows a moving operator',async()=>{
 const {FxWiring}=await import('../../public/js/render/vfx/wiring.js');
 const def={spawn:5,keep:true,isLoop:false,rotateType:0,rotY:-1};let captured;
 const ofx={active:true,lib:{has:()=>true,def:()=>def},spawn:(key,place,opts)=>{captured={key,place,opts};return captured;}};
 const wiring=new FxWiring(ofx);
 for(const [dir,offset]of Object.entries({RIGHT:[1,0],LEFT:[-1,0],UP:[0,1],DOWN:[0,-1]})){
  const v={id:1,x:5,y:10,z:0,dir,alive:true,info:{spine:'char_446_aroma'}};
  wiring.playOn('aroma_attack_start_01',v,{stick:true});
  assert.deepEqual(captured.place.pos,[-5+offset[0],1+offset[1],-0]);
  const fx={def,anchor:captured.place.pos.slice()};v.x+=2;captured.opts.track(fx);
  assert.deepEqual(fx.anchor,[-3+offset[0],1+offset[1],-0]);
 }
});

test('official combat art still allows SP recovery numbers and enemy animation commands, but not custom attack zones',async()=>{
 const {utilityFx}=await import('../../public/js/render/fx.js');
 assert.equal(utilityFx('spRecovered',{n:5}),true);assert.equal(utilityFx('enemySkill',{}),true);
 assert.equal(utilityFx('aoe',{}),false);assert.equal(utilityFx('zone',{}),false);assert.equal(utilityFx('chenDragonWave',{}),false);
});

test('optional pack space checks charge only missing bytes, keeping already downloaded base resources',async()=>{
 const {missingResourceBytes}=await import('../../shared/resourceSelection.js');
 const resources={files:[{path:'/base',bytes:1000},{path:'/extra',bytes:100}],estimatedBytes:1100};
 assert.equal(await missingResourceBytes(resources,{match:async path=>path==='/base'?{}:null}),100);
});
