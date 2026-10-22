import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {startServer} from '../../server/index.js';
import {bountyText} from '../../server/match/choices.js';
import {PATCH_NOTES} from '../../shared/patchNotes.js';
import {createAugmentCatalog,AUGMENT_ROUNDS} from '../../shared/augments.js';
import {AUGMENT_SOURCES} from '../../shared/augmentSources.js';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const bonds=load('content/production/data/bonds.json');
const choices=load('content/production/data/choices.json'),effects=load('content/production/data/effects.json');
const bounties=choices.cards.bounty.flatMap(c=>[c.name,bountyText(c.desc,c),bountyText(effects[c.effectId]?.descRaw,c)]).filter(Boolean);
const notes=PATCH_NOTES.flatMap(p=>[p.title,...p.sections.flatMap(s=>[s.title,...s.items])]);
const generatedData={bonds,chess:load('content/production/data/chess.json'),items:load('content/production/data/items.json')};
const generatedAugments=AUGMENT_ROUNDS.flatMap(round=>createAugmentCatalog(generatedData,round)).flatMap(a=>[a.name,a.description]);
const augments=[...AUGMENT_SOURCES.flatMap(a=>[a.name,a.description]),...new Set(generatedAugments)];
const visible=s=>s.replace(/<[@$][^>]*>|<\/>/g,'');
test('all release notes and augment descriptions have three language translations; augment quantities remain intact',()=>{
 for(const lang of ['en','ja','zh']){
  const d={...load(`public/i18n/${lang}/audit.json`),...load(`public/i18n/${lang}/fork.json`)};
  for(const s of [...notes,...augments]){assert.ok(d[s],`${lang}: ${s}`);assert.ok(!/[가-힣]/.test(d[s]),`${lang}: ${s}`);}
  for(const a of AUGMENT_SOURCES){
   // Worded unit counts (one Operator / one tier higher) are legitimate; all explicit numeric effect values must survive.
   const nums=s=>(s.match(/\d+(?:\.\d+)?/g)||[]).filter(n=>n!=='1').sort();
   assert.deepEqual(nums(d[a.description]),nums(a.description),`${lang}: ${a.description}`);
  }
 }
});
test('official terms are consistent in every custom description and historical note',()=>{
 const terms=load('tools/i18n/official-terms.json');
 for(const lang of ['en','ja','zh']){
  const d={...load(`public/i18n/${lang}/audit.json`),...load(`public/i18n/${lang}/fork.json`)};
  for(const[source,target]of Object.entries(d))if(source.includes('속세의 음'))assert.ok(target.includes(terms['속세의 음'][lang]),`${lang}: ${source}`);
  assert.equal(d['속세의 음'],terms['속세의 음'][lang]);
 }
});
test('rewritten multi-round bounty translations describe two battles in plain and highlighted text',()=>{
 for(const lang of ['ko','en','ja']){
  const d=load(`public/i18n/${lang}/${lang==='ko'?'manual':'fork'}.json`);
  for(const card of choices.cards.bounty)for(const raw of [card.desc,effects[card.effectId]?.descRaw]){
   const rendered=bountyText(raw,card);if(!raw||raw===rendered)continue;
   assert.match(d[rendered],lang==='ko'?/두 번/:lang==='ja'?/2回/:/two/i,`${lang}: ${rendered}`);
  }
 }
});
test('actual translator renders every bounty description and all release notes without source-language leakage',{skip:process.env.SP_E2E!=='1'},async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false});let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const lang of ['ko','en','ja','zh']){
   const page=await browser.newPage();await page.setBypassServiceWorker(true);
   await page.evaluateOnNewDocument(code=>{localStorage.setItem('sp.pref.lang',JSON.stringify(code));localStorage.setItem('sp.resources.downloadConsent','1');localStorage.setItem('sp.patchNotes.seenVersion','0.3.1e');},lang);
   await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).hostname!=='127.0.0.1'||r.url().endsWith('resource-worker.js')?r.abort():r.continue());
   await page.goto(srv.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__SP__);
   if(['en','ja'].includes(lang)){
    const mismatches=await page.evaluate(async code=>{const{tr}=await import('/js/i18n/i18n.js');const[official,korean]=await Promise.all([fetch(`/i18n/${code}/data.json`).then(r=>r.json()),fetch('/i18n/ko/compiled.json').then(r=>r.json())]);const aliases=new Map();for(const[source,value]of Object.entries(official.names||{})){const alias=korean.messages?.[source];if(!alias)continue;if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(value);}return [...aliases].filter(([alias,values])=>values.size===1&&tr(alias)!==[...values][0]).map(([alias,values])=>({alias,expected:[...values][0],actual:tr(alias)}));},lang);
    assert.deepEqual(mismatches,[],`${lang} official Korean aliases override machine translations`);
   }
   const sources=lang==='ko'?bounties:[...bounties,...notes,...augments];
   const rendered=await page.evaluate(async sources=>{const {tr}=await import('/js/i18n/i18n.js');return sources.map(s=>tr(s));},sources);
   const bad=rendered.flatMap((text,i)=>((lang==='ko'||lang==='en')?/[一-鿿]/.test(visible(text)):/[가-힣]/.test(text))?[{source:sources[i],text}]:[]);
   assert.deepEqual(bad,[],`${lang} runtime translations`);
   const dynamic=await page.evaluate(async bonds=>{
    const {tr}=await import('/js/i18n/i18n.js');
    const {formatBondEffect}=await import('/js/ui/richText.js');
    const {bondReportDescription}=await import('/js/screens/sweep.js');
    return Object.values(bonds).flatMap(b=>[tr(bondReportDescription(b)),...[0,25,137].map(l=>formatBondEffect(b,l,6))]);
   },bonds);
   if(lang!=='ko')assert.deepEqual(dynamic.filter(text=>/[가-힣]/.test(text)),[],`${lang} generated Bond descriptions`);
   const leith=await page.evaluate(async b=>{const {formatBondEffect}=await import('/js/ui/richText.js');return [formatBondEffect(b,25,3),formatBondEffect(b,25,6)];},bonds.leithanienShip);
   const term={ko:'속세의 음',en:'Voice of Mundane',ja:'塵界の音',zh:'尘世之音'}[lang];
   for(const text of leith){assert.ok(text.includes(term),text);assert.ok(text.includes('1.25%'),text);assert.ok(!/\{(?:0|leithDuration)/.test(text),text);}
   assert.match(visible(leith[0]),lang==='ko'?/5초/:lang==='en'?/5 seconds/:/5秒/);
   assert.match(visible(leith[1]),lang==='ko'?/11초/:lang==='en'?/11 seconds/:/11秒/);
   await page.close();
  }
 }finally{await browser?.close();await srv.close();}
});
