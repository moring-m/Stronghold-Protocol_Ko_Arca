#!/usr/bin/env python3
"""Translate the audited public UI corpus after official/upstream reuse.
Uses Google's public translation endpoint for missing custom text only. Keeps a resumable
cache and validates markup/placeholders. No game source/logic is rewritten.
"""
import sys,json,re,urllib.request,urllib.parse,time,hashlib,concurrent.futures,threading
from pathlib import Path
corpus=json.loads(Path('.cache/translation-inventory.json').read_text())
reuse=json.loads(Path('.cache/translation-reuse.json').read_text())
cachepath=Path('.cache/custom-translation-cache.json')
cache=json.loads(cachepath.read_text()) if cachepath.exists() else {}
lock=threading.Lock();failed=[]
rate_lock=threading.Lock();next_request=0
def protect(text,code):
    tokens=[]
    def add(s):
        key=f'QQP{len(tokens)}QQ';tokens.append(s);return key
    text=re.sub(r'<[^>]*>|\{[^{}]*\}|\\[nrt]|\n',lambda m:add(m[0]),text)
    return text,tokens
def restore(text,tokens):
    for i,value in enumerate(tokens):text=re.sub(r'QQP\s*'+str(i)+r'\s*QQ',lambda _:value,text,flags=re.I)
    if re.search(r'QQP\s*\d+\s*QQ',text,re.I):raise ValueError('Unrestored placeholder')
    return text

def translate_batch(job):
    code,rows=job;masked=[];maps={}
    for i,source in enumerate(rows):
        t,tokens=protect(source,code);masked.append(f'ZXQ{i}X\n{t}\nZXE{i}X');maps[i]=(source,tokens)
    query='\n'.join(masked)
    sl='ko' if any(re.search('[가-힣]',s) for s in rows) else 'zh-CN'
    payload=urllib.parse.urlencode({'client':'gtx','sl':sl,'tl':{'zh':'zh-CN'}.get(code,code),'dt':'t','q':query}).encode()
    url='https://translate.googleapis.com/translate_a/single'
    error=None
    for attempt in range(3):
        try:
            global next_request
            with rate_lock:
                delay=max(0,next_request-time.monotonic())
                if delay:time.sleep(delay)
                next_request=time.monotonic()+1.2
            req=urllib.request.Request(url,data=payload,headers={'User-Agent':'Mozilla/5.0','Content-Type':'application/x-www-form-urlencoded'})
            result=json.loads(urllib.request.urlopen(req,timeout=25).read())
            out=''.join(part[0] or '' for part in result[0] if part)
            values={};invalid=[]
            for i,(source,tokens) in maps.items():
                match=re.search(r'ZXQ\s*'+str(i)+r'\s*X\s*([\s\S]*?)\s*ZXE\s*'+str(i)+r'\s*X',out,re.I)
                try:
                    if not match:raise ValueError('Missing batch boundary')
                    body=restore(match[1].strip(),tokens)
                    if not body:raise ValueError('Empty translation')
                    if sorted(re.findall(r'<[^>]*>|\{[^{}]*\}',source))!=sorted(re.findall(r'<[^>]*>|\{[^{}]*\}',body)):raise ValueError('Markup changed')
                    values[source]=body
                except ValueError:invalid.append(source)
            with lock:
                cache.setdefault(code,{}).update(values)
                cachepath.write_text(json.dumps(cache,ensure_ascii=False))
            if invalid:
                if len(rows)>1:
                    return len(values)+sum(translate_batch((code,[source])) for source in invalid)
                error=ValueError('Markup/boundary changed');break
            return len(values)
        except Exception as e:
            error=e
            if getattr(e,'code',0)==429:
                with rate_lock:next_request=max(next_request,time.monotonic()+30)
            if attempt==0:print('Retry',code,len(rows),str(e)[:100],flush=True)
            if isinstance(e,ValueError) or getattr(e,'code',0) in [400,413,414]:break
            time.sleep(min(1+attempt*2,8))
    if len(rows)>1:
        middle=len(rows)//2;return translate_batch((code,rows[:middle]))+translate_batch((code,rows[middle:]))
    # A rich-text tag has no linguistic meaning and may be omitted by a translator.
    # Translate only its text spans in that case; preserve every tag/placeholder verbatim.
    source=rows[0]
    pieces=re.split(r'(<[^>]*>|\{[^{}]*\}|\\[nrt]|\n)',source)
    if len(pieces)>1:
        fragments=list(dict.fromkeys(p.strip() for i,p in enumerate(pieces) if i%2==0 and re.search('[一-鿿가-힣]',p)))
        need=[p for p in fragments if not reuse[code].get(p) and not cache.get(code,{}).get(p) and not(code=='zh' and not re.search('[가-힣]',p)) and not(code=='ko' and re.search('[가-힣]',p))]
        if need:translate_batch((code,need))
        def part(p):
            core=p.strip();target=reuse[code].get(core) or cache.get(code,{}).get(core)
            if not target:
                if not re.search('[一-鿿가-힣]',core) or (code=='zh' and not re.search('[가-힣]',core)) or (code=='ko' and re.search('[가-힣]',core)):return p
                raise ValueError('Missing rich-text fragment')
            return p[:len(p)-len(p.lstrip())]+target+p[len(p.rstrip()):]
        try:
            body=''.join(part(p) if i%2==0 else p for i,p in enumerate(pieces))
            with lock:
                cache.setdefault(code,{})[source]=body
                cachepath.write_text(json.dumps(cache,ensure_ascii=False))
            return 1
        except ValueError:pass
    with lock:failed.append({'lang':code,'source':rows[0],'error':str(error)})
    return 0
codes=sys.argv[1:] or ['en','ja','zh']
jobs=[]
for code in codes:
    missing=[r['source'] for r in corpus if not reuse[code].get(r['source']) and not cache.get(code,{}).get(r['source']) and (code!='zh' or re.search('[가-힣]',r['source'])) and (code!='ko' or not re.search('[가-힣]',r['source']))]
    # One source language per batch prevents Chinese labels being read as Korean names.
    for korean in [True,False]:
        batch=[];size=0
        for text in [s for s in missing if bool(re.search('[가-힣]',s))==korean]:
            if batch and size+len(text)>2500:jobs.append((code,batch));batch=[];size=0
            batch.append(text);size+=len(text)+15
        if batch:jobs.append((code,batch))
print('Batches:',len(jobs),'texts:',sum(len(rows) for _,rows in jobs),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    count=0
    for i,result in enumerate(pool.map(translate_batch,jobs)):
        count+=result
        if i%20==0:print('Progress',i+1,'/',len(jobs),'texts',count,'failures',len(failed),flush=True)
# Supplement files only; curated fork entries still override these at runtime.
for code in codes:
    out={r['source']:reuse[code].get(r['source']) or cache.get(code,{}).get(r['source']) for r in corpus}
    out={k:v for k,v in out.items() if v and v!=k}
    Path(f'public/i18n/{code}/audit.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
Path('.cache/translation-failures.json').write_text(json.dumps(failed,ensure_ascii=False,indent=2))
print('Done; failures',len(failed),flush=True)
