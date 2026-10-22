export const ROOM_TITLE_MAX=15;
export const ROOM_TITLE_LOCALES=['ko','en','ja','zh'];
export const isRoomTitle=value=>typeof value==='string'&&[...value].length<=ROOM_TITLE_MAX&&!/[\u0000-\u001f\u007f]/.test(value);
export function defaultRoomTitle(mode,name='',locale='ko'){
 const n=mode==='coop8'?8:mode==='coop'?4:1;
 if(locale==='en')return `${name||'Host'}'s ${n}-Player Simulation`;
 if(locale==='ja')return `${name||'ホスト'}ドクターの${n}人シミュレーション`;
 if(locale==='zh')return `${name||'房主'}博士的${n}人模拟`;
 return `${name||'방장'}박사님의 ${n}인 시뮬레이션`;
}
