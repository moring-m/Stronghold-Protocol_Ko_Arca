// i18n-ignore-file: language names and download notices deliberately use the target language.
// Display language and operator voice are independent preferences.
import {html,Button,Modal} from '../ui/components.js';
import {useState} from '../../vendor/hooks.module.js';
import {lang,setLang} from './i18n.js';
import {languagePackReady,downloadLanguagePack} from './languagePack.js';
import {LANGUAGE_PACKS} from '../../../shared/languagePacks.js';
const COPY={
 ko:['한국어 언어팩','화면 문구와 공식 게임 번역을 다운로드합니다. 음성은 변경되지 않습니다.','다운로드','취소','다운로드 중…','다운로드에 실패했습니다. 다시 시도해 주세요.'],
 zh:['中文语言包','下载界面文本及官方游戏译文。不会更改语音。','下载','取消','正在下载…','下载失败，请重试。'],
 en:['English language pack','Download interface text and official game translations. Voice language stays unchanged.','Download','Cancel','Downloading…','Download failed. Please try again.'],
 ja:['日本語言語パック','画面のテキストと公式のゲーム翻訳をダウンロードします。音声言語は変更されません。','ダウンロード','キャンセル','ダウンロード中…','ダウンロードに失敗しました。もう一度お試しください。'],
};
export function LangButton(){
 const [target,setTarget]=useState(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[error,setError]=useState('');
 const copy=COPY[target||lang];
 const choose=async code=>{if(code===lang)return;if(await languagePackReady(code).catch(()=>false)){setLang(code);return;}setProgress(null);setError('');setTarget(code);};
 const download=async()=>{setBusy(true);setError('');try{await downloadLanguagePack(target,setProgress);setLang(target);}catch(e){console.warn('[i18n] language download failed',e);setError(copy[5]);setBusy(false);}};
 const total=progress?.total??(LANGUAGE_PACKS[target]||[]).reduce((sum,f)=>sum+f.bytes,0);
 return html`<span class="language-entry" data-i18n-skip>
  <label class="set-seg lang-toggle"><select aria-label="Language / 언어" data-testid="display-language" value=${lang} onChange=${e=>{const code=e.currentTarget.value;e.currentTarget.value=lang;void choose(code);}}>
   ${[['ko','한국어'],['zh','中文'],['en','English'],['ja','日本語']].map(([code,name])=>html`<option value=${code} selected=${code===lang}>${name}</option>`)}
  </select></label>
  <${Modal} open=${!!target} onClose=${()=>{if(!busy)setTarget(null);}} title=${copy[0]} micro="LANGUAGE PACK" class="language-download" width="5.4rem"
   actions=${html`<${Button} variant="ghost" disabled=${busy} onClick=${()=>setTarget(null)}>${copy[3]}<//><${Button} variant="primary" disabled=${busy} data-testid="download-language" onClick=${download}>${busy?copy[4]:copy[2]}<//>`}>
   <div data-i18n-skip lang=${target}><p>${copy[1]}</p><p class="num">${progress?`${(progress.loaded/1048576).toFixed(1)} / `:''}${(total/1048576).toFixed(1)} MB</p>
    ${progress?html`<progress style="width:100%" max=${progress.total} value=${progress.loaded} aria-label=${copy[4]} />`:null}
    ${error?html`<p role="alert">${error}</p>`:null}
   </div>
  <//>
 </span>`;
}
