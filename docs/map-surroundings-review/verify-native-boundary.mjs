import fs from 'node:fs/promises';
import P from 'puppeteer-core';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)), stages=JSON.parse(await fs.readFile(root+'data/stages.json'));
const preview=process.env.SP_PREVIEW_URL || 'http://127.0.0.1:3006';
const ids=Object.keys(stages).filter(id=>!['act2autochess_m01','act2autochess_m03'].includes(id));
const browser=await P.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();const report=[];
try{await p.goto(preview+'/dev/render-demo.html?scene=prep&stage='+ids[0]+'&quality=high&panel=0',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>__demo?.ready,{timeout:90000});await p.evaluate(()=>__demo.pause());
for(const id of ids){await p.evaluate(st=>__demo.view.setStage(st),stages[id]);await p.waitForFunction(id=>__demo.view.debug.board3d?.stats().originalStage===id,{timeout:90000},id);
for(const kind of ['unite','boss']){await p.evaluate(kind=>{__demo.view.enterBattle({fieldId:'audit',kind,units:[]});__demo.view.setCamera(kind,{side:'R',half:true,instant:true,shop:false});},kind);
const result=await p.evaluate(({id,kind})=>{const b=__demo.view.debug.board3d;const tri=[];const keys=[];for(const[key,m]of Object.entries(b.meshes)){
if(!m || !/^(original:|cooperative:|cooperative-functional:|opposite-border:|sand-rim:)/.test(key)||m.material?.isShaderMaterial)continue;
keys.push(key);const g=m.geometry,pos=g.attributes.position.array,ind=g.index.array;
for(let i=0;i<ind.length;i+=3){const v=Array.from(ind.slice(i,i+3),k=>[pos[k*3]+m.position.x,pos[k*3+1]+m.position.y,pos[k*3+2]+m.position.z]);const[a,c,d]=v;const area=(c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0]);if(area<=1e-9 || Math.max(...v.map(p=>p[2]))<-.04 || Math.min(...v.map(p=>p[2]))>2.5)continue;tri.push({v,area,key,x0:Math.min(...v.map(p=>p[0])),x1:Math.max(...v.map(p=>p[0])),y0:Math.min(...v.map(p=>p[1])),y1:Math.max(...v.map(p=>p[1]))});}}
const offset=kind==='unite'?7:0,cells=[];for(let rr=3;rr<=6;rr++){const r=rr+offset,c=19;const candidates=tri.filter(t=>t.x1>=c-.5&&t.x0<=c+.5&&t.y1>=r-.5&&t.y0<=r+.5);const missing=[];let covered=0;for(let iy=0;iy<21;iy++)for(let ix=0;ix<21;ix++){const x=c-.5+(ix+.5)/21,y=r-.5+(iy+.5)/21;let hit=false;for(const t of candidates){if(x<t.x0-1e-7||x>t.x1+1e-7||y<t.y0-1e-7||y>t.y1+1e-7)continue;const[a,b,c]=t.v,u=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/t.area,v=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/t.area,w=1-u-v;if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7&&u*a[2]+v*b[2]+w*c[2]>=-.04){hit=true;break;}}
if(hit)covered++;else missing.push([x,y]);}cells.push({row:r,col:c,samples:441,covered,missing});}
return{id,kind,original:b.stats().originalStage,keys,cells};},{id,kind});report.push(result);console.log(id,kind,result.cells.map(c=>`${c.row}:${c.covered}/${c.samples}`).join(' '));await fs.writeFile((process.argv[2] || '/tmp/direct-sand-mesh-final.json'),JSON.stringify(report,null,2));}}
}finally{await browser.close();}
console.log('Missing samples:',report.flatMap(x=>x.cells).reduce((n,c)=>n+c.missing.length,0));
