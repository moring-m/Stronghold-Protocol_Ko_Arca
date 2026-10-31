/** Two ordinary cooperative-defense layouts joined into four consecutive fields. */
export const EIGHT_UNITE_RECT=Object.freeze({r0:9,r1:12,c0:0,c1:36});
export function eightUniteStageId(id){return `coop8_unite_${id}`;}
const stageCache=new WeakMap();
export function eightUniteStage(stage){
 if(!stage?.rows)return stage;
 if(stageCache.has(stage))return stageCache.get(stage);
 // Each pair has two eight-column fields plus its outer border. Share that
 // border at the join, keeping the same spacing and orientation in all fields.
 const rows=stage.rows.map((row,r)=>{
  const line=(row.slice(0,16)+row).split('');
  // Repeat the ordinary two-field divider between the second and third field.
  if(r>=9&&r<=12)for(let c=16;c<=18;c++)line[c]=row[c-8];
  for(let c=0;c<line.length;c++){
   if(/[aAI]/.test(line[c]))line[c]='#';
   else if(line[c]==='E')line[c]=c===2?'E':'R';
   // Keep each field's original entry markers; routes still spawn at the far right.
  }
  return line.join('');
 });
 // The field's devices, with those on its bottom border row 13 (act2 m01's blowers face up into the field).
 const devices=stage.devices||[],fieldDevices=devices.filter(d=>d.pos?.[0]>=9&&d.pos?.[0]<=13);
 const shifted=(d,offset,alias)=>({...d,pos:[d.pos[0],d.pos[1]+offset],alias:`${d.alias||d.key}:${alias}`,...(Array.isArray(d.rangeTiles)?{rangeTiles:d.rangeTiles.map(p=>[p[0],p[1]+offset])}:{})});
 const allDevices=[...devices,...fieldDevices.map(d=>shifted(d,16,'right'))].filter(d=>!(d.pos?.[0]>=9&&d.pos?.[0]<=13&&d.pos?.[1]>=16&&d.pos?.[1]<=18));
 allDevices.push(...fieldDevices.filter(d=>d.pos[1]>=8&&d.pos[1]<=10).map(d=>shifted(d,8,'middle')));
 const result={...stage,id:eightUniteStageId(stage.id),name:`${stage.name||stage.id} · 4인 협력방어`,active:false,coopEightStage:true,originalStageId:stage.id,size:[rows.length,37],rows,devices:allDevices,mapChars:[...(stage.mapChars||[]),...(stage.mapChars||[]).filter(m=>m.pos?.[0]>=9&&m.pos?.[0]<=12).map(m=>({...m,pos:[m.pos[0],m.pos[1]+16],alias:`${m.alias}:right`}))]};
 stageCache.set(stage,result);return result;
}
export function eightUniteRoutes(routes){
 return routes.map(route=>{
  const start=route.start||[10,18],end=route.end||[10,2],points=route.checkpoints||[];
  const shift=p=>[p[0],p[1]+16];
  return {...route,start:shift(start),end,checkpoints:[...points.map(shift),shift(end),start,...points]};
 });
}
