import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';

test('served laboratory data module exports config and mode getters with server semantics',async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true});
 try{
  const response=await fetch(`http://127.0.0.1:${server.port}/data.js`);
  assert.equal(response.status,200);
  const source=(await response.text()).replace("'./sim/simdata.js'",JSON.stringify(new URL('../server/sim/simdata.js',import.meta.url).href));
  const shim=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const config={modes:{laboratory:{id:'laboratory'}}},raw={config};
  assert.equal(shim.getConfig(raw),config);
  assert.equal(shim.getMode('laboratory',raw),config.modes.laboratory);
  assert.equal(shim.getMode('constructor',raw),null);
  assert.equal(shim.getConfig({config:[]}),null);
 }finally{await server.close();}
});
