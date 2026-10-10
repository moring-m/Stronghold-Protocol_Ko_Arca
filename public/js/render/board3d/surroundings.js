/** Scenery cells only; no changes to the placement or simulation grid. */
export function combatBorderAreas(stage, areas) {
  return stage.previewLayout ? [{r0:2,r1:5,c0:0,c1:20}]
    : [{r0:9,r1:12,c0:0,c1:areas.some(a=>a.c1===20)?20:10}];
}
export function borderCells(stage, areas) {
  const cells=new Map();
  for(const a of areas)for(let r=a.r0-1;r<=a.r1+1;r++)for(let c=a.c0-1;c<=a.c1+1;c++) {
    // Complete perimeter, including the bench-side edge.
    if(areas.some(b=>r>=b.r0&&r<=b.r1&&c>=b.c0&&c<=b.c1))continue;
    const pen=stage.previewLayout?.rect;
    if(pen && r>=pen.r0-1&&r<=pen.r1&&c>=pen.c0-1&&c<=pen.c1+1)continue;
    cells.set(`${r},${c}`,[r,c]);
  }
  if(stage.previewLayout)for(let c=0;c<=20;c++)cells.set(`6,${c}`,[6,c]);
  return [...cells.values()];
}

/** Copy the opposite native border in its existing order, with no random assets or new shapes. */
export function oppositeBorderRuns(cells, areas, {mirror=false}={}) {
  const byRow=new Map();
  for(const[r,c]of cells){if(!byRow.has(r))byRow.set(r,[]);byRow.get(r).push(c);}
  const runs=[];
  const maxCol=areas[0].c1;
  const sourceCol=c=>mirror ? maxCol-c : c<0?maxCol+1:c>maxCol?-1:c===10?10:c>10?c-11:c+11;
  for(const[r,cols]of byRow){
    cols.sort((a,b)=>a-b);
    let start=0;
    for(let i=1;i<=cols.length;i++)if(i===cols.length||cols[i]!==cols[i-1]+1||sourceCol(cols[i])!==sourceCol(cols[i-1])+(mirror?-1:1)){
      const c0=cols[start],c1=cols[i-1],source0=sourceCol(c0),source1=sourceCol(c1);
      runs.push(mirror ? {source:{r0:r,r1:r,c0:source1,c1:source0},axis:maxCol} : {source:{r0:r,r1:r,c0:source0,c1:source1},dx:c0-source0});start=i;
    }
  }
  return runs;
}

/** If the matching opposite segment also has a hole, use the closest complete
 * segment on that side, retaining its order rather than repeating one prop. */
export function completeOppositeRuns(runs, geometries) {
  return runs.map(run=>{
    const {source}=run,length=source.c1-source.c0+1;
    const available=(start)=>vacantBorderCells(Array.from({length},(_,i)=>[source.r0,start+i]),geometries).length===0;
    if(available(source.c0))return run;
    const starts=[];
    const half=source.c0<=10 ? [0,10] : [11,20];
    for(let c=half[0];c+length-1<=half[1];c++)if(available(c))starts.push(c);
    starts.sort((a,b)=>Math.abs(a-source.c0)-Math.abs(b-source.c0));
    if(!starts.length)return run;
    const c0=starts[0];
    return run.axis!=null ? {source:{...source,c0,c1:c0+length-1},axis:run.axis+c0-source.c0} : {source:{...source,c0,c1:c0+length-1},dx:run.dx+source.c0-c0};
  });
}

/** Do not place another block where an existing native surface already occupies the cell. */
export function vacantBorderCells(cells, geometries) {
  const vacant=new Map(cells.map(cell=>[cell.join(','),cell]));
  for(const g of geometries) {
    for(const b of g.footprints || [])for(let r=Math.ceil(b.y0);r<=Math.floor(b.y1);r++)for(let c=Math.ceil(b.x0);c<=Math.floor(b.x1);c++)vacant.delete(`${r},${c}`);
    for(let i=0;i<g.index.length;i+=3) {
      const [a,b,c]=Array.from(g.index.slice(i,i+3),id=>g.position.slice(id*3,id*3+3));
      if(Math.max(a[2],b[2],c[2])<-.04)continue;
      // A planter's centre may be sunken, and fences may have no horizontal
      // centre face. Reserve their footprint too instead of filling them in.
      if(!Array.isArray(g.footprints) && Math.max(a[2],b[2],c[2])>.08) {
        for(let r=Math.ceil(Math.min(a[1],b[1],c[1])-.49);r<=Math.floor(Math.max(a[1],b[1],c[1])+.49);r++)
        for(let col=Math.ceil(Math.min(a[0],b[0],c[0])-.49);col<=Math.floor(Math.max(a[0],b[0],c[0])+.49);col++)vacant.delete(`${r},${col}`);
      }
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(area<=1e-8)continue;
      for(let r=Math.ceil(Math.min(a[1],b[1],c[1]));r<=Math.floor(Math.max(a[1],b[1],c[1]));r++)
      for(let col=Math.ceil(Math.min(a[0],b[0],c[0]));col<=Math.floor(Math.max(a[0],b[0],c[0]));col++) {
        const key=`${r},${col}`;
        if(!vacant.has(key))continue;
        const u=((b[0]-col)*(c[1]-r)-(b[1]-r)*(c[0]-col))/area;
        const v=((c[0]-col)*(a[1]-r)-(c[1]-r)*(a[0]-col))/area;
        const w=1-u-v;
        if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6&&u*a[2]+v*b[2]+w*c[2]>=-.04)vacant.delete(key);
      }
    }
  }
  return [...vacant.values()];
}

/** Translate the opposite arrangement without changing its height, shape, normals or UVs. */
export function copyOppositeBorder(src, dx) {
  return {...src,position:Array.from(src.position,(v,i)=>i%3===0?v+dx:v)};
}

/** Reflect the actual opposite layout; retain texture coordinates and outward faces. */
export function reflectOppositeBorder(src, axis) {
  const index=Array.from(src.index);
  for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];
  return {...src,index,position:Array.from(src.position,(v,i)=>i%3===0?axis-v:v),
    normal:src.normal && Array.from(src.normal,(v,i)=>i%3===0?-v:v)};
}

/** Disjoint world-space rectangles for a union: overlapping camera areas must not draw a face twice. */
export function disjointAreas(areas) {
  if(areas.length<2)return areas;
  const xs=[...new Set(areas.flatMap(a=>[a.c0-.5,a.c1+.5]))].sort((a,b)=>a-b);
  const ys=[...new Set(areas.flatMap(a=>[a.r0-.5,a.r1+.5]))].sort((a,b)=>a-b);
  const result=[];
  for(let j=0;j<ys.length-1;j++) {
    let start=null;
    for(let i=0;i<xs.length-1;i++) {
      const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
      const inside=areas.some(a=>x>a.c0-.5&&x<a.c1+.5&&y>a.r0-.5&&y<a.r1+.5);
      if(inside&&start===null)start=xs[i];
      if(start!==null&&(!inside||i===xs.length-2)) {
        const end=inside?xs[i+1]:xs[i];
        result.push({c0:start+.5,c1:end-.5,r0:ys[j]+.5,r1:ys[j+1]-.5});start=null;
      }
    }
  }
  return result;
}

/** Check the whole tile footprint, not just its centre or a prop's bounds. */
export function uncoveredTileCells(cells, geometries, samples=21) {
  const triangles=[];
  for(const g of geometries)for(let i=0;i<g.index.length;i+=3) {
    const [a,b,c]=Array.from(g.index.slice(i,i+3),id=>Array.from(g.position.slice(id*3,id*3+3)));
    const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    if(area<=1e-9 || Math.max(a[2],b[2],c[2])<-.04)continue;
    triangles.push({a,b,c,area,x0:Math.min(a[0],b[0],c[0]),x1:Math.max(a[0],b[0],c[0]),y0:Math.min(a[1],b[1],c[1]),y1:Math.max(a[1],b[1],c[1])});
  }
  return cells.filter(([r,col])=>{
    const nearby=triangles.filter(t=>t.x1>=col-.5&&t.x0<=col+.5&&t.y1>=r-.5&&t.y0<=r+.5);
    for(let iy=0;iy<samples;iy++)for(let ix=0;ix<samples;ix++) {
      const x=col-.5+(ix+.5)/samples,y=r-.5+(iy+.5)/samples;
      if(!nearby.some(({a,b,c,area,x0,x1,y0,y1})=>{
        if(x<x0-1e-7||x>x1+1e-7||y<y0-1e-7||y>y1+1e-7)return false;
        const u=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/area,v=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/area,w=1-u-v;
        return u>=-1e-7&&v>=-1e-7&&w>=-1e-7&&u*a[2]+v*b[2]+w*c[2]>=-.04;
      }))return true;
    }
    return false;
  });
}

// Reject identical copied faces already supplied by the native scenery. Keep all UV/lightmap attributes intact.
export function uniqueCopiedFaces(geometry, occupied = new Set()) {
  const position=geometry.position,index=geometry.index,next=[];
  for(let i=0;i<index.length;i+=3){
    const ids=Array.from(index.slice(i,i+3));
    const key=ids.map(n=>[0,1,2].map(k=>Math.round(position[n*3+k]*100000)).join(',')).sort().join('|');
    if(occupied.has(key))continue;
    occupied.add(key);next.push(...ids);
  }
  return {...geometry,index:next};
}
