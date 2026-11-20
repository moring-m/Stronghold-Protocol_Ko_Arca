import { normalizeRuleValues } from './customExtensions.js';

/** Room policy. Classic/augment rooms use the same defaults; custom rooms may override them. */
export function restartVotePolicy(room) {
  const v = normalizeRuleValues(room.gameplayMode === 'custom' ? room.customExtensions?.ruleValues : {});
  return { voteMs: Number(v.restartVoteSeconds) * 1000, roomCooldownMs: Number(v.restartRoomCooldown) * 1000,
    playerCooldownMs: Number(v.restartPlayerCooldown) * 1000, maxRequestsPerMatch: Number(v.restartRequestLimit),
    majority: v.restartAgreement === 1, includeEliminated: v.restartIncludeEliminated === 1 };
}
export function requiredRestartVotes(total, majority) { return majority ? Math.floor(total / 2) + 1 : total; }
