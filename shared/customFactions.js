/** Per-match data view: never mutate the shared configuration catalogue. */
export function customFactionData(raw, enabled) {
  if (enabled) return raw;
  const custom = id => /custom_ursus/.test(id);
  const chess = Object.fromEntries(Object.entries(raw.chess || {}).filter(([id]) => !custom(id)).map(([id,c]) => [id,{...c,bonds:(c.bonds || []).filter(b=>b!=='ursusShip')}]));
  const bonds = Object.fromEntries(Object.entries(raw.bonds || {}).filter(([id])=>id!=='ursusShip').map(([id,b])=>[id,{...b,members:b.members?.filter(x=>!custom(x)),visibleMembers:b.visibleMembers?.filter(x=>!custom(x))}]));
  const items = Object.fromEntries(Object.entries(raw.items || {}).filter(([id])=>!custom(id)).map(([id,item])=>[id,item.giveBondId==='ursusShip'?{...item,giveBondId:null}:item]));
  const bands = Object.fromEntries(Object.entries(raw.bands || {}).filter(([id]) => !custom(id)));
  const choices=raw.choices?{...raw.choices,cards:{...raw.choices.cards,tactic:(raw.choices.cards?.tactic||[]).filter(c=>!custom(c.effectId))}}:raw.choices;
  return {...raw,chess,bonds,items,bands,choices};
}
