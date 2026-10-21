export const ROOM_TITLE_MAX=15;
export const isRoomTitle=value=>typeof value==='string'&&[...value].length<=ROOM_TITLE_MAX&&!/[\u0000-\u001f\u007f]/.test(value);
export const defaultRoomTitle=(mode,name='')=>`${name||'방장'}박사님의 ${mode==='coop8'?8:mode==='coop'?4:1}인 시뮬레이션`;
