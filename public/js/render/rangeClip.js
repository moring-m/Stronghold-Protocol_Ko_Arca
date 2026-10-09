/** Clip range geometry in world coordinates, before camera projection. */
export function rangeTileInside(rect, row, col) {
  return !rect || (row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1);
}
export function clipRangeSegment(rect, x0, y0, x1, y1) {
  if (!rect) return [x0,y0,x1,y1];
  const dx=x1-x0,dy=y1-y0;
  let lo=0,hi=1;
  for (const [p,q] of [[-dx,x0-(rect.c0-.5)],[dx,rect.c1+.5-x0],[-dy,y0-(rect.r0-.5)],[dy,rect.r1+.5-y0]]) {
    if (!p) { if(q<0)return null; continue; }
    const t=q/p;
    if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [x0+lo*dx,y0+lo*dy,x0+hi*dx,y0+hi*dy];
}
