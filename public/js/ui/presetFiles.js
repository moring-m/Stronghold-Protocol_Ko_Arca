import {useState} from '../../vendor/hooks.module.js';
import {html,Button,Modal} from './components.js';
import {toast} from './toasts.js';
import {copyText} from './clipboard.js';
export function presetPayload(kind,state){return {kind,v:1,presets:state.presets,active:state.active};}
const PREFIX={'stronghold.favorites':'SHF1','stronghold.recruit-presets':'SHR1'};
export function presetCode(kind,state){
 if(!PREFIX[kind])throw Error('지원하지 않는 프리셋 종류입니다.');
 const bytes=new TextEncoder().encode(JSON.stringify(presetPayload(kind,state)));
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return PREFIX[kind]+'.'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function readPresetPayload(text,kind){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('프리셋 코드가 너무 깁니다.');
 text=text.trim();
 if(text.startsWith('SH')){
  const [prefix,encoded,...rest]=text.split('.');
  if(prefix!==PREFIX[kind])throw Error('이 종류의 프리셋 코드가 아닙니다.');
  if(rest.length||!encoded||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('올바른 프리셋 코드가 아닙니다.');
  try{const binary=atob(encoded.replaceAll('-','+').replaceAll('_','/'));text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{throw Error('올바른 프리셋 코드가 아닙니다.');}
 }
 let value;try{value=JSON.parse(text);}catch{throw Error('올바른 프리셋 코드가 아닙니다.');}
 if(value?.kind!==kind||value.v!==1||!Array.isArray(value.presets)||value.presets.length>30)throw Error('이 종류의 프리셋 코드가 아닙니다.');
 return value;
}
export function PresetFiles({kind,state,onImport,disabled=false}){
 const [mode,setMode]=useState(null),[text,setText]=useState(''),[error,setError]=useState('');
 const open=mode=>{setMode(mode);setText(mode==='export'?presetCode(kind,state):'');setError('');};
 const apply=()=>{try{onImport(readPresetPayload(text,kind));setMode(null);toast('프리셋 목록을 불러왔습니다.');}catch(e){setError(e.message);}};
 return html`<div class="favorites-toolbar preset-files"><${Button} disabled=${disabled} icon="save" onClick=${()=>open('export')}>코드 생성<//><${Button} disabled=${disabled} icon="load" onClick=${()=>open('import')}>코드 불러오기<//>
 <${Modal} open=${!!mode} title=${mode==='export'?'프리셋 코드 생성':'프리셋 코드 불러오기'} micro="PRESET CODE" onClose=${()=>setMode(null)} actions=${mode==='export'?html`<${Button} onClick=${()=>setMode(null)}>닫기<//><${Button} variant="primary" icon="copy" onClick=${async()=>{if(await copyText(text))toast('프리셋 코드를 복사했습니다.');else setError('코드를 선택해 직접 복사해주세요.');}}>코드 복사<//>`:html`<${Button} onClick=${()=>setMode(null)}>취소<//><${Button} variant="primary" disabled=${!text.trim()} onClick=${apply}>목록 불러오기<//>`}>
 <p>${mode==='export'?'현재 프리셋 목록을 담은 한 줄 코드입니다. 복사해 보관하거나 공유하세요.':'코드를 붙여넣으면 이 종류의 프리셋 목록을 교체합니다. 오퍼레이터 설정은 프리셋을 직접 적용할 때 반영됩니다.'}</p>
 <input class="preset-code" aria-label="프리셋 코드" value=${text} readOnly=${mode==='export'} spellcheck=${false} onFocus=${e=>mode==='export'&&e.currentTarget.select()} onInput=${e=>{setText(e.currentTarget.value);setError('');}} placeholder="한 줄 프리셋 코드를 붙여넣으세요."/>${error?html`<p role="alert">${error}</p>`:null}<//></div>`;
}
