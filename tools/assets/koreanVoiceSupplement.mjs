// Fill missing Korean lines only. Existing Korean and Japanese selections are unchanged.
export function supplementKoreanVoices(manifest, resources, supplement) {
  const files = new Map(resources.files.map(file => [file.path, file]));
  const changed = [];
  for (const [charId, slots] of Object.entries(manifest.audio?.voice?.kr || {})) {
    const found = [];
    for (const [slot, value] of Object.entries(slots)) {
      const replace = path => {
        if (typeof path !== 'string' || path.includes('/voice_kr/')) return path;
        const filename = path.split('/').at(-1);
        const extra = supplement.lines?.[`${charId}/${filename}`];
        if (!extra) return path;
        files.set(extra.path, { ...extra });
        found.push({ slot, before: path, after: extra.path });
        return extra.path;
      };
      slots[slot] = Array.isArray(value) ? value.map(replace) : replace(value);
    }
    if (!found.length) continue;
    const lines = Object.values(slots).flat();
    manifest.audio.voiceAvailability ||= {};
    manifest.audio.voiceAvailability[charId] = {
      krLines: lines.filter(path => path.includes('/voice_kr/')).length,
      jpFallback: lines.filter(path => !path.includes('/voice_kr/')).length,
    };
    changed.push({ charId, lines: found });
  }
  resources.files = [...files.values()];
  return changed;
}
