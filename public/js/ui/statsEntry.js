import { createStore } from '../store.js';
import { data } from '../data.js';
export const statsStore=createStore({open:false,tab:'overview',withModded:false});
export function openStats(){for(const key of ['config','bands','assets'])data.load(key);statsStore.set({open:true,tab:'overview',withModded:false});}
export const closeStats=()=>statsStore.set({open:false});
