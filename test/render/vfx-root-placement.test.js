import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {compileEffect,Effect} from '../../public/js/render/vfx/effect.js';
const node=(id,parent,pos)=>({id,name:'node'+id,parent,children:parent===null?[1]:[],active:true,pos,rot:[0,0,0,1],scale:[1,1,1]});
test('runtime root replaces editor placement while child offsets and animated root motion survive',()=>{
 const def=compileEffect({key:'editor-offset',nodes:[node(0,null,[.48,.775,-.262]),node(1,0,[.2,.3,.4])],materials:[],clips:[],textures:[],meshes:[]});
 const fx=new Effect(def).place({pos:[3,5,-1]});fx._matrices();
 assert.deepEqual([...fx.world[0].slice(12,15)],[3,5,-1]);
 for(const [i,expected]of [3.2,5.3,-.6].entries())assert.ok(Math.abs(fx.world[1][12+i]-expected)<1e-6);
 fx.loc[0]+=.5;fx._matrices();assert.ok(Math.abs(fx.world[0][12]-3.5)<1e-6);
});
for(const key of ['indigo_attack_01_trail','podego_attack_01_trail'])test(`${key} starts exactly at its supplied muzzle despite a saved prefab offset`,{skip:!existsSync(new URL('../../public/assets/local/fx/prefabs/'+key+'.json',import.meta.url))},()=>{
 const source=JSON.parse(readFileSync(new URL('../../public/assets/local/fx/prefabs/'+key+'.json',import.meta.url),'utf8'));
 assert.ok(source.nodes[0].pos.some(v=>Math.abs(v)>.1),'real prefab includes editor placement');
 const fx=new Effect(compileEffect(source)).place({pos:[2.4,3.2,-.5]});fx._matrices();
 for(const [i,v]of [2.4,3.2,-.5].entries())assert.ok(Math.abs(fx.world[0][12+i]-v)<1e-6);
});
