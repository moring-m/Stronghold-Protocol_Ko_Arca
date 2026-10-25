/** b.snap uses `t` for its message type and `gt` for elapsed game seconds. */
export function endBattleFields(fieldId,snapshot){
 const fields={fieldId},gt=snapshot?.gt;
 if(Number.isFinite(gt)&&gt>=0&&gt<=3700)fields.gt=gt;
 return fields;
}
