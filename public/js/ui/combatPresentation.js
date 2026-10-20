// Display-only grouping. Each source row belongs to exactly one group; combat rules and saved records stay intact.
const JOBS={PIONEER:'뱅가드',WARRIOR:'가드',TANK:'디펜더',SNIPER:'스나이퍼',CASTER:'캐스터',MEDIC:'메딕',SUPPORT:'서포터',SPECIAL:'스페셜리스트'};
export const COMBAT_GROUPS=[['unit','개별 유닛'],['operator','같은 오퍼레이터'],['profession','직군별'],['tier','단계별'],['kind','오퍼레이터 / 소환물'],['player','참가자별']];
export function combatGroup(row,mode,lookup=()=>null){
 const def=lookup(row.defId)||{},token=row.kind==='token';
 if(mode==='player')return{key:'player:'+row.playerId,name:row.playerName||'참가자',kind:'group'};
 if(mode==='profession')return{key:token?'token':def.profession||'other',name:token?'소환물':JOBS[def.profession]||'기타',kind:'group'};
 if(mode==='tier')return{key:token?'token':'tier:'+(def.tier||0),name:token?'소환물':def.tier?`${def.tier}단계`:'기타',kind:'group'};
 if(mode==='kind')return{key:token?'token':'operator',name:token?'소환물':'오퍼레이터',kind:'group'};
 if(mode==='operator')return{key:JSON.stringify([row.kind,def.charId||row.name||row.defId]),name:def.name||row.name||row.defId,kind:row.kind,defId:row.defId};
 return{key:JSON.stringify([row.playerId,row.uid??row.key,row.kind,row.defId]),name:row.name||def.name||row.defId,kind:row.kind,defId:row.defId,uid:row.uid};
}
export function groupLiveCombat(rows,mode,lookup){
 if(mode==='operator')return rows;
 const groups=new Map();
 for(const row of rows){const group=combatGroup(row,mode,lookup),key=group.key;let out=groups.get(key);
 if(!out){out={...group,key,damage:0,healing:0,layers:0,seconds:0,types:{},layerBonds:{}};groups.set(key,out);}
 for(const k of ['damage','healing','layers'])out[k]+=Number(row[k])||0;
 out.seconds=Math.max(out.seconds,Number(row.seconds)||0);
 for(const k of ['types','layerBonds'])for(const [id,n] of Object.entries(row[k]||{}))out[k][id]=(out[k][id]||0)+(Number(n)||0);
 }
 return [...groups.values()].map(r=>({...r,dps:r.seconds?r.damage/r.seconds:0,hps:r.seconds?r.healing/r.seconds:0,lps:r.seconds?r.layers/r.seconds:0}));
}
export function combatShares(rows,metric,limit=7){
 const sorted=rows.map(r=>({...r,value:Math.max(0,Number(r[metric])||0)})).filter(r=>r.value>0).sort((a,b)=>b.value-a.value),total=sorted.reduce((n,r)=>n+r.value,0);
 const out=sorted.slice(0,limit);if(sorted.length>limit)out.push({name:'기타',value:sorted.slice(limit).reduce((n,r)=>n+r.value,0)});
 return out.map(r=>({...r,share:total?r.value/total:0}));
}
