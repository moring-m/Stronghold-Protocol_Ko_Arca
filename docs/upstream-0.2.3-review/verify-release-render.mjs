// Actual native mesh and camera audit. Requires the prepared local preview, not screenshots as evidence.
import P from 'puppeteer-core';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base=process.env.SP_PREVIEW_URL||'http://127.0.0.1:3008';
const stages=JSON.parse(await readFile(new URL('../../data/stages.json',import.meta.url)));
const out=new URL('./',import.meta.url);await mkdir(out,{recursive:true});
const browser=await P.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const reports=[],errors=[];
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:900});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.goto(base+'/dev/render-demo.html?scene=prep&stage='+Object.keys(stages)[0]+'&quality=high&panel=0',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__demo?.ready,{timeout:90000});await page.evaluate(()=>__demo.pause());
 for(const [id,stage]of Object.entries(stages)){
  await page.evaluate(stage=>__demo.view.setStage(stage),stage);
  await page.waitForFunction(id=>__demo.view.debug.board3d?.stats().originalStage===id,{timeout:90000},id);
  for(const kind of ['boss','unite']){
   await page.evaluate(kind=>{__demo.view.enterBattle({fieldId:'release-render',kind,units:[]});__demo.view.setCamera(kind,{side:'L',half:true,instant:true,shop:false});},kind);
   await new Promise(resolve=>setTimeout(resolve,250));

   const mesh=await page.evaluate(()=>{
    const board=__demo.view.debug.board3d,faces=new Map(),duplicates=[];let triangles=0,nonFinite=0;
    for(const [key,mesh]of Object.entries(board.meshes)){
     if(!mesh||mesh.material?.isShaderMaterial||!mesh.geometry?.index||!/^(original:|cooperative:|cooperative-functional:|opposite-border:|sand-rim:)/.test(key))continue;
     const positions=mesh.geometry.attributes.position.array,index=mesh.geometry.index.array;
     for(let i=0;i<index.length;i+=3){
      const points=Array.from(index.slice(i,i+3),n=>[positions[3*n]+mesh.position.x,positions[3*n+1]+mesh.position.y,positions[3*n+2]+mesh.position.z]);
      if(points.flat().some(x=>!Number.isFinite(x))){nonFinite++;continue;}
      const[a,b,c]=points,area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(area<=1e-9)continue;triangles++;
      const hash=points.map(p=>p.map(x=>Math.round(x*100000)).join(',')).sort().join('|'),previous=faces.get(hash);
      if(previous&&previous!==key)duplicates.push({first:previous,second:key});else faces.set(hash,key);
     }
    }
    return {triangles,nonFinite,duplicateFaces:duplicates.length,examples:duplicates.slice(0,8),stats:board.stats()};
   });
   assert.equal(mesh.nonFinite,0,`${id}/${kind}: finite mesh positions`);
   assert.equal(mesh.duplicateFaces,0,`${id}/${kind}: repeated coplanar faces: ${JSON.stringify(mesh.examples)}`);
   const cameras=[];
   for(const side of ['L','R','all']){
    await page.evaluate(({kind,side})=>__demo.view.setCamera(kind,{side:side==='all'?'L':side,half:side!=='all',instant:true,shop:false}),{kind,side});
    const cam=await page.evaluate(()=>{const c=__demo.view.debug.cam;return {params:c.params(),center:c.project(c.tx,c.ty,c.tz)};});
    assert.ok(Object.values(cam.params).every(Number.isFinite));assert.ok(Number.isFinite(cam.center.x)&&Number.isFinite(cam.center.y));
    cameras.push({side,...cam});
    if(side==='all'&&['act1autochess_m01','act2autochess_m01'].includes(id))await page.screenshot({path:new URL(`${id}-${kind}-${side}.jpg`,out).pathname,type:'jpeg',quality:82});
   }
   reports.push({id,kind,mesh,cameras});console.log(id,kind,JSON.stringify({triangles:mesh.triangles,duplicates:mesh.duplicateFaces}));
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(new URL('release-render-audit.json',out),JSON.stringify({reports,errors},null,2));
}finally{await browser.close();}
