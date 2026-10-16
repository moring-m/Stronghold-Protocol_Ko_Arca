import { html } from './components.js';
import { data, useData } from '../data.js';
import { useStore } from '../store.js';
import { chatFaction } from '../../../shared/chat.js';
import { bondIconUrl } from './assetUrls.js';

export function FactionBadge({playerId, faction = null}) {
  useData('assets');
  const selected = useStore(s => s.chatFactions?.[playerId] ?? s.chat?.findLast(m => m.playerId === playerId)?.faction ?? faction);
  const f = chatFaction(selected);
  return f ? html`<span class="profile-faction" title=${f.name} aria-label=${`선택 진영: ${f.name}`} style=${{'--faction-color': f.color}}><img src=${bondIconUrl(data.get('assets'), f.bondId)} /></span>` : null;
}
