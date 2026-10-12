const INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function matchesKoreanSearch(text,query){
 const name=String(text||'').toLowerCase(),q=String(query||'').trim().toLowerCase();
 if(!q||name.includes(q))return true;
 if(!/^[ㄱ-ㅎ\s]+$/.test(q))return false;
 const initials=[...name].map(c=>{const n=c.codePointAt(0)-0xAC00;return n>=0&&n<11172?INITIALS[Math.floor(n/588)]:c;}).join('');
 return initials.replace(/\s/g,'').includes(q.replace(/\s/g,''));
}
export function laboratoryEquipment(rec){return rec?.itemType==='EQUIP'&&rec.trapId!=='trap_1070_acarm070'&&!['ECONOMY','RECRUIT'].includes(rec.category);}
