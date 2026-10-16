import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolveOfficialFx} from '../../public/js/render/vfx/tier.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
test('production effects manifest is installed and every listed effect remains downloadable',()=>{
 const source=read('data/local-fx.json'),installed=read('content/production/data/local-fx.json');
 assert.deepEqual(installed,source);
 const prefabs=installed.groups['fx/prefabs'];assert.ok(Object.keys(prefabs).length>4000);
 const indexed=new Set(read('public/vendor/browser-resources.json').files.map(f=>f.path));
 for(const group of Object.values(installed.groups))for(const entry of Object.values(group))if(entry?.path)assert.ok(indexed.has(entry.path),'missing download entry '+entry.path);
 assert.equal(resolveOfficialFx('full',true),'full');assert.equal(resolveOfficialFx('off',true),'off');
});
test('preview data directory includes the same official effects when present',()=>{
 if(!existsSync(new URL('../../.cache/leithanien-data',import.meta.url)))return;
 assert.deepEqual(read('.cache/leithanien-data/local-fx.json'),read('data/local-fx.json'));
});
