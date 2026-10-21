#!/usr/bin/env python3
"""Fill audited gaps with a local NLLB model; no game text is sent to a service.
Requires CTranslate2 + sentencepiece and a converted NLLB model (--model).
Official/upstream/curated strings always win. Models are not shipped with the app.
"""
import sys,json,re,time,argparse
from pathlib import Path
import ctranslate2,sentencepiece
p=argparse.ArgumentParser();p.add_argument('--model',required=True);args=p.parse_args()
root=Path('.');report=json.loads((root/'.cache/translation-coverage.json').read_text());reuse=json.loads((root/'.cache/translation-reuse.json').read_text())
cachepath=root/'.cache/custom-translation-cache.json';cache=json.loads(cachepath.read_text())
segmentpath=root/'.cache/offline-segment-cache.json';segments=json.loads(segmentpath.read_text()) if segmentpath.exists() else {}
# Treat formatting and substitutions as structure. Human-readable <conditions> are text.
tag=r'<(?:[@$][^>]*|/|/?(?:span|b|i|em|strong|br|p|div|small|a|sup|sub|mark)(?:\s[^>]*?)?/?)>'
placeholder=r'\{(?:\d+|[a-zA-Z_]\w*)(?::[^{}]*)?(?:\|[^{}]*)?\}'
split=re.compile('('+tag+'|'+placeholder+r'|\\[nrt]|\n|[<>{}"])')
strip=lambda s:re.sub(tag+'|'+placeholder,'',s)
def native(s,code):return (code=='ko'and not re.search('[一-鿿]',s))or(code=='zh'and not re.search('[가-힣]',s))or not re.search('[一-鿿가-힣]',s)
def usable(s,code):return bool(s)and not (code!='ko'and re.search('[가-힣]',strip(s)))and not(code in ['en','ko']and re.search('[一-鿿]',strip(s)))
def existing(s,code):
 for value in [reuse.get(code,{}).get(s),segments.get(code,{}).get(s),cache.get(code,{}).get(s)]:
  if value and usable(value,code):return value
 return None
work={};sources={}
for row in report['unresolved']:
 code,source=row['lang'],row['source']
 if native(source,code):continue
 pieces=split.split(source);sources[(code,source)]=pieces
 for i,text in enumerate(pieces):
  if i%2 or not text.strip() or native(text,code):continue
  text=text.strip()
  if not existing(text,code):work.setdefault(code,set()).add(text)
print('Offline pending segments', {k:len(v)for k,v in work.items()},flush=True)
sp=sentencepiece.SentencePieceProcessor(model_file=args.model+'/sentencepiece.bpe.model')
translator=ctranslate2.Translator(args.model,device='cpu',compute_type='int8',inter_threads=1,intra_threads=4)
codes={'ko':'kor_Hang','en':'eng_Latn','ja':'jpn_Jpan','zh':'zho_Hans'}
started=time.monotonic();done=0
for code,texts in work.items():
 segments.setdefault(code,{})
 for source_lang in ['kor_Hang','zho_Hans']:
  items=[(t,sp.encode(t,out_type=str))for t in texts if ('kor_Hang'if re.search('[가-힣]',t)else'zho_Hans')==source_lang]
  items.sort(key=lambda item:len(item[1]))
  for begin in range(0,len(items),32):
   batch=items[begin:begin+32]
   inputs=[[source_lang]+tokens[:768]+['</s>']for _,tokens in batch]
   results=translator.translate_batch(inputs,target_prefix=[[codes[code]]for _ in inputs],beam_size=1,max_decoding_length=512,repetition_penalty=1.05)
   for (source,_),result in zip(batch,results):
    tokens=result.hypotheses[0]
    if tokens and tokens[0]==codes[code]:tokens=tokens[1:]
    value=sp.decode(tokens).strip();segments[code][source]=value
   done+=len(batch)
   segmentpath.write_text(json.dumps(segments,ensure_ascii=False))
   print(code,begin+len(batch),'/',len(items),'segments',done,'seconds',round(time.monotonic()-started),flush=True)
 for (target,source),pieces in list(sources.items()):
  if target!=code:continue
  out=[]
  for i,text in enumerate(pieces):
   core=text.strip()
   if i%2 or not core or native(text,code):out.append(text);continue
   value=existing(core,code)
   if not value:out=[];break
   out.append(text[:len(text)-len(text.lstrip())]+value+text[len(text.rstrip()):])
  if out:cache.setdefault(code,{})[source]=''.join(out)
 cachepath.write_text(json.dumps(cache,ensure_ascii=False))
print('Offline pass complete',round(time.monotonic()-started),'seconds',flush=True)
