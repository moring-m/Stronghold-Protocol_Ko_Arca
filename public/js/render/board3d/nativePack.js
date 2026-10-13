/** Native binary geometry keeps the existing material, lighting and field metadata. */
export function parseNativePack(buffer) {
  const view=new DataView(buffer);
  if(view.byteLength<8 || view.getUint32(0,true)!==0x314e5053)throw Error('Invalid native map header');
  const length=view.getUint32(4,true),start=8+length+((-length)&3);
  if(start>buffer.byteLength)throw Error('Truncated native map header');
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,length)));
  for(const bucket of Object.values(doc.buckets||{})){
    for(const [key,[offset,count,type]] of Object.entries(bucket.arrays||{})){
      if(!Number.isSafeInteger(offset)||offset<0||offset%4||!Number.isSafeInteger(count)||count<0||start+offset+count*(type==='<f8'?8:4)>buffer.byteLength)throw Error('Invalid native map attribute');
      if(type!=='<u4'&&type!=='<f8')throw Error('Invalid native map type');
      const bytes=type==='<u4'?4:8,at=start+offset,ArrayType=type==='<u4'?Uint32Array:Float64Array;
      bucket[key]=at%bytes?new ArrayType(buffer.slice(at,at+count*bytes)):new ArrayType(buffer,at,count);
    }
    delete bucket.arrays;
  }
  return doc;
}
export async function fetchNativePack(url) {
  try {
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)return null;
    const decoded=url.endsWith('.gz')?new Response(response.body.pipeThrough(new DecompressionStream('gzip'))):response;
    return parseNativePack(await decoded.arrayBuffer());
  }catch{return null;}
}
