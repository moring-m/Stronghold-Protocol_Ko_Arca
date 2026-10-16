import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRosterWarmer} from '../../public/js/render/rosterWarm.js';

test('shop models and images use the renderer cache before purchase, deduplicate updates and release resources',async()=>{
 const scheduled=[],images=[],loads=[],released=[];let holds=0,prep=true;
 const cache=new Set();
 const assets={avatar:id=>`/${id}.png`,picture:id=>`/${id}.png`,portrait:id=>`/${id}-portrait.png`,image:async url=>images.push(url),
 spineEntry:(id,o)=>({skel:`/${id}${o?.back?'-back':''}.skel`}),spine:{hold:()=>{holds++;return()=>holds--;},peek:e=>cache.has(e.skel),acquire:async e=>{loads.push(e.skel);cache.add(e.skel);},release:e=>released.push(e.skel)}};
 const warm=createRosterWarmer(assets,{canParse:()=>prep,schedule:fn=>{scheduled.push(fn);return fn;},cancel:()=>{}});
 warm.update([{spine:'char_shop',avatar:'char_shop'},{spine:'char_shop',avatar:'char_shop'}]);
 prep=false;await scheduled.shift()();assert.equal(loads.length,0,'combat does not start model parsing');
 prep=true;await scheduled.shift()();
 assert.deepEqual(images,['/char_shop.png','/char_shop-portrait.png']);
 assert.deepEqual(loads,['/char_shop.skel','/char_shop-back.skel']);assert.deepEqual(released,loads);
 warm.update([{spine:'char_shop',avatar:'char_shop'}]);assert.equal(scheduled.length,0,'unchanged prep state cannot restart the warm queue');
 warm.destroy();assert.equal(holds,0);
});
