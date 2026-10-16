import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioManager} from '../../public/js/audio.js';

test('decoding an existing audio cache entry does not rewrite or download it',async()=>{
 const savedFetch=globalThis.fetch,savedCaches=globalThis.caches;
 let writes=0,requests=0;
 globalThis.caches={open:async()=>({match:async()=>new Response('cached',{headers:{'content-type':'audio/mpeg'}}),put:async()=>{writes++;}})};
 globalThis.fetch=async()=>{requests++;throw Error('unexpected download');};
 try{
  const a=new AudioManager();
  a.ctx={decodeAudioData:(_bytes,resolve)=>resolve({duration:1,length:1,numberOfChannels:1})};
  assert.ok(await a._buffer('/cached.mp3'));
  assert.equal(writes,0);assert.equal(requests,0);
 }finally{globalThis.fetch=savedFetch;globalThis.caches=savedCaches;}
});

test('roster attack, hit and skill sounds decode before playback, with at most two concurrent requests', async()=>{
 const manifest={audio:{sfx:{battle:{deploy:'/deploy.mp3'},units:{char_a:{attack:'/attack.mp3',hit:'/hit.mp3',skills:{0:'/skill.mp3'},attackMix:{0:.5}},char_b:{attack:'/other.mp3'}}}}};
 const a=new AudioManager({getManifest:()=>manifest});
 const requested=[];let active=0,max=0;
 a._buffer=async url=>{requested.push(url);max=Math.max(max,++active);await new Promise(r=>setImmediate(r));active--;};
 a.warmEffects(['char_a']);assert.equal(requested.length,0,'no audio context before user gesture');
 a.ctx={};a.warmEffects();
 for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(new Set(requested),new Set(['/deploy.mp3','/attack.mp3','/hit.mp3','/skill.mp3']));
 assert.equal(max,2);a.warmEffects(['char_a']);assert.equal(requested.length,4,'duplicate state changes do not refetch');
});

test('menu background warmer caches compressed effects without an audio context or decoding', async()=>{
 const savedFetch=globalThis.fetch,savedCaches=globalThis.caches;
 const stored=new Map([['/cached.mp3',new Response('cached')]]),asked=[];
 globalThis.caches={open:async()=>({match:async u=>stored.get(u),put:async(u,r)=>{stored.set(u,r);}})};
 globalThis.fetch=async url=>{asked.push(url);return new Response('sound',{headers:{'content-type':'audio/mpeg'}});};
 try {
  const a=new AudioManager({getManifest:()=>({audio:{sfx:{battle:{deploy:'/cached.mp3'},units:{char_a:{attack:'/attack.mp3'}}}}})});
  await a.warmBackground();
  assert.equal(a.ctx,null);
  assert.equal(asked.length,1);assert.ok(stored.has('/attack.mp3'));
  assert.equal(a.buffers.size,0,'no decoded PCM bank retained');
 } finally {globalThis.fetch=savedFetch;globalThis.caches=savedCaches;}
});

test('already cached effects complete during combat without downloads or artificial per-file waits',async()=>{
 const savedFetch=globalThis.fetch,savedCaches=globalThis.caches;
 const files=Object.fromEntries(Array.from({length:10},(_,i)=>['effect'+i,`/cached-${i}.mp3`]));
 let reads=0,requests=0;
 globalThis.caches={open:async()=>({match:async()=>{reads++;return new Response('cached');}})};
 globalThis.fetch=async()=>{requests++;throw Error('cached files must not download');};
 let timer;
 try {
  const a=new AudioManager({getManifest:()=>({audio:{sfx:{battle:files}}})});a.inCombat=true;
  await Promise.race([a.warmBackground(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cached effects blocked during combat')),500);})]);
  assert.equal(reads,10);assert.equal(requests,0);
 }finally{clearTimeout(timer);globalThis.fetch=savedFetch;globalThis.caches=savedCaches;}
});
