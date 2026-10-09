import { EMOTE_THEMES, EMOTE_CATALOG, ORIGINAL_EMOTES } from './constants.js';

// User-supplied replacement art. Keys retain the existing game protocol IDs.
// Protocol IDs come from constants.js; wheel pages sort the replacement filenames.
const ART = new Map([
  ["autochess_battle_happy", '/assets/emotes/c8.webp'],
  ["autochess_battle_scared", '/assets/emotes/b0.webp'],
  ["autochess_battle_sorry", '/assets/emotes/c3.webp'],
  ["autochess_battle_thanks", '/assets/emotes/c0.webp'],
  ["autochess_battle_thinking", '/assets/emotes/c6.webp'],
  ["autochess_battle_nice_cooperate", '/assets/emotes/c2.webp'],
  ["slug_autochess_battle_nice_work", '/assets/emotes/d0.webp'],
  ["slug_autochess_battle_thanks", '/assets/emotes/e7.webp'],
  ["slug_autochess_battle_sorry", '/assets/emotes/e9.webp'],
  ["slug_autochess_battle_bye", '/assets/emotes/f2.webp'],
  ["slug_autochess_battle_distrust", '/assets/emotes/e1.webp'],
  ["slug_autochess_battle_very_soon", '/assets/emotes/b2.webp'],
  ["autochess_battle_noproblem", '/assets/emotes/c11.webp'],
  ["autochess_battle_respect", '/assets/emotes/f3.webp'],
  ["autochess_battle_call", '/assets/emotes/a0.webp'],
  ["autochess_battle_playingcool", '/assets/emotes/g4.webp'],
  ["autochess_battle_sad", '/assets/emotes/e5.webp'],
  ["autochess_battle_dying", '/assets/emotes/c13.webp'],
  ["autochess_battle_fooldoctor_01", '/assets/emotes/b3.webp'],
  ["autochess_battle_fooldoctor_02", '/assets/emotes/b4.webp'],
  ["autochess_battle_fooldoctor_03", '/assets/emotes/e10.webp'],
  ["autochess_battle_fooldoctor_04", '/assets/emotes/e0.webp'],
  ["autochess_battle_fooldoctor_05", '/assets/emotes/c4.webp'],
  ["autochess_battle_fooldoctor_06", '/assets/emotes/c5.webp'],
  ["autochess_battle_foolamiya_01", '/assets/emotes/f0.webp'],
  ["autochess_battle_foolamiya_02", '/assets/emotes/a5.webp'],
  ["autochess_battle_foolamiya_03", '/assets/emotes/e4.webp'],
  ["autochess_battle_foolamiya_04", '/assets/emotes/e6.webp'],
  ["autochess_battle_foolamiya_05", '/assets/emotes/e8.webp'],
  ["autochess_battle_foolamiya_06", '/assets/emotes/h1.webp'],
  ["autochess_battle_foolwisdel_01", '/assets/emotes/c9.webp'],
  ["autochess_battle_foolwisdel_02", '/assets/emotes/c10.webp'],
  ["autochess_battle_foolwisdel_03", '/assets/emotes/c14.webp'],
  ["autochess_battle_foolwisdel_04", '/assets/emotes/f4.webp'],
  ["autochess_battle_foolwisdel_05", '/assets/emotes/g5.webp'],
  ["autochess_battle_foolwisdel_06", '/assets/emotes/e3.webp'],
]);
for (const e of ORIGINAL_EMOTES) ART.set(e.id, `/assets/emotes/original/${e.picId}.png`);
export const bundledEmoteArt = (id) => ART.get(id) || null;

// Natural filename order: c2 precedes c10, matching file managers. Six pictures per page.
const sorted = [...EMOTE_CATALOG].sort((a, b) => bundledEmoteArt(a.id).localeCompare(bundledEmoteArt(b.id), 'en', { numeric: true }));
export const EMOTE_PAGES = Object.freeze([Object.freeze({themeId:'emoticon_autochess_original',name:'위수협약 기본',emotes:ORIGINAL_EMOTES}),...EMOTE_THEMES.map((theme, i) => Object.freeze({
  themeId: theme.themeId,
  name: `소통 ${i + 1}`,
  emotes: Object.freeze(sorted.slice(i * 6, (i + 1) * 6)),
}))]);
