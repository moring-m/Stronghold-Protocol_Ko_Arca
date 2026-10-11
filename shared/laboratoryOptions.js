/** Use the same map and boss pools as a solo simulation at this difficulty. */
export function laboratoryOptions(config, bosses, difficulty) {
  const mode = Object.values(config?.modes || {}).find(m => m.type === 'SINGLE' && m.difficulty === difficulty);
  const available = weights => Object.keys(weights || {}).filter(id => Number(weights[id]) > 0 && bosses?.[id]?.templates?.[mode?.modeId]?.template);
  return { stageIds: mode?.stages || [], bossIds: available(mode?.bossWeights), hiddenBossIds: available(mode?.hiddenBossWeights) };
}
