// Browser-local dub preferences. Every variant of an operator shares its charId; absent entries follow the global dub.
export const VOICE_LANGS = Object.freeze(['kr', 'jp']);
export const VOICE_PICKS=VOICE_LANGS;
export const VOICE_TREES={kr:'voiceKr',jp:'voiceJp'};
const TREE=VOICE_TREES;
export function sanitizeVoiceOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, lang] of Object.entries(raw).slice(0, 512)) {
    if (/^char_[0-9]+_[a-z0-9]+$/.test(id) && id.length <= 80 && VOICE_PICKS.includes(lang)) out[id] = lang;
  }
  return out;
}

/** This server's manifest lists at least one line of `charId` in `lang`. */
function hasTree(audio, charId, lang) {
  const slots = audio?.[TREE[lang]]?.[charId];
  return !!slots && typeof slots === 'object' && !Array.isArray(slots) && Object.keys(slots).length > 0;
}

/**
 * The dub `charId` speaks.
 * Without `opts.audio` (tests and callers from before the extra dubs) the 0.2.3 rule stands: an own 'cn' or 'jp'
 * wins, otherwise the global language is 'jp' or 'cn'. 'en' / 'kr' / 'native' are not applied on that path.
 * With `audio` (including an empty object): the operator's own choice when this server has that tree, else the
 * own-language dub when `opts.native` is on and the operator has one, else the global language when that tree is
 * present (中文 always), else 'cn'.
 * @param {string} charId
 * @param {string} globalLang
 * @param {Record<string, string>|null|undefined} overrides
 * @param {{ native?: boolean, audio?: any }|null} [opts]
 * @returns {'cn'|'jp'|'en'|'kr'|'native'}
 */
export function voiceLangFor(charId, globalLang, overrides, opts) {
  const own = Object.hasOwn(overrides || {}, charId) ? overrides[charId] : null;
  return VOICE_LANGS.includes(own) ? own : VOICE_LANGS.includes(globalLang) ? globalLang : 'kr';
}
