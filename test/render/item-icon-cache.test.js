import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { ItemView } from '../../public/js/render/units.js';
import { itemTexture } from '../../public/js/render/textures.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('the same bench item ID with changed artwork remains isolated in both content-switch directions',async()=>{
 const fake=installFakePixi();try{
  const ctx=fakeViewCtx(fake.P,{assets:{image:async()=>({width:128,height:128})}});
  const info={id:'same',defId:'same',color:0x9aa5a0};
  const first=new ItemView(ctx,{...info,icon:'/first.png'}),second=new ItemView(ctx,{...info,icon:'/second.png'}),again=new ItemView(ctx,{...info,icon:'/first.png'});
  await tick();assert.notEqual(first.plate.texture,second.plate.texture);assert.equal(first.plate.texture,again.plate.texture);
  for(const view of [first,second,again])view.destroy();
 }finally{fake.restore();}
});

test('item textures key by icon URL, load state and frame colour; aliases can share art', async () => {
  const fake = installFakePixi();
  try {
    const img = { width: 128, height: 128 };
    const a = itemTexture('/first.png', img, 0xffffff);
    assert.equal(a, itemTexture('/first.png', img, 0xffffff));
    assert.notEqual(a, itemTexture('/second.png', img, 0xffffff));
    assert.notEqual(a, itemTexture('/first.png', null, 0xffffff));
    assert.notEqual(a, itemTexture('/first.png', img, 0xffc600));
    const ctx = fakeViewCtx(fake.P, { assets: { image: async () => img } });
    const first = new ItemView(ctx, { id: 'one', defId: 'one', icon: '/alias.png', color: 0xffffff });
    const second = new ItemView(ctx, { id: 'two', defId: 'two', icon: '/alias.png', color: 0xffffff });
    await tick();
    assert.equal(first.plate.texture, second.plate.texture, 'IDs do not partition identical art');
    first.destroy(); second.destroy();
  } finally { fake.restore(); }
});

test('a changed or removed item icon supersedes pending art, and destroyed views ignore late loads', async () => {
  const fake = installFakePixi();
  const pending = new Map();
  try {
    const ctx = fakeViewCtx(fake.P, { assets: { image: url => new Promise(resolve => pending.set(url, resolve)) } });
    const v = new ItemView(ctx, { id: 1, defId: 'same-item', icon: '/old.png', color: 0xffffff });
    v.setIcon('/new.png');
    pending.get('/new.png')({ width: 128, height: 128 });
    await tick();
    const current = v.plate.texture;
    pending.get('/old.png')({ width: 128, height: 128 });
    await tick();
    assert.equal(v.plate.texture, current, 'late old art is ignored');
    v.setIcon(null);
    assert.notEqual(v.plate.texture, current, 'no stale icon when its manifest entry disappears');
    assert.equal(v.info.icon, null);
    v.setIcon('/late.png');
    const placeholder = v.plate.texture;
    v.destroy();
    pending.get('/late.png')({ width: 128, height: 128 });
    await tick();
    assert.equal(v.plate.texture, placeholder);
  } finally { fake.restore(); }
});
