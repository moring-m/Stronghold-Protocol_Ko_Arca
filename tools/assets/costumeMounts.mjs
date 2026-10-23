// Animator slots refer to Transforms, whose GameObject names need not match SpecialPoint<N>.
export function costumeMountBindings(row) {
 const animator=row.components?.find(c=>c.class==='CharacterAnimator')?.fields;
 if(!animator)return {};
 const out={};
 for(const [facing,field]of [['front','_front'],['back','_back']]){
  const missing=[];
  for(const [key,ref]of Object.entries(animator[field]||{})){
   if(!/^specialPoint\d+$/.test(key)||!ref)continue;
   const n=key.slice('specialPoint'.length),names=['Special'+n,'SpecialPoint'+n,'Special_'+n];
   const named=ref.reference;
   if(named&&(row.points?.[named]?.[facing]||row.points?.[named]?.all)){
    (out['s'+n]||={})[facing]=named;continue;
   }
   if(!names.some(name=>row.points?.[name]?.[facing]||row.points?.[name]?.all))missing.push(n);
  }
  // Older uploads lost Transform names. Recover only the unambiguous one-slot/one-point case.
  const origins=Object.keys(row.points||{}).filter(name=>/originmuzzle/i.test(name)&&(row.points[name][facing]||row.points[name].all));
  if(missing.length===1&&origins.length===1)(out['s'+missing[0]]||={})[facing]=origins[0];
 }
 return out;
}
