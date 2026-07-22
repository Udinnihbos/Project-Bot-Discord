import { getGuildState, patchGuildState } from './state.js';

/**
 * Skip vote system: members in VC can vote to skip current track.
 * If >50% of human listeners vote, song is skipped.
 * Owner/Admin/DJ can skip without voting.
 */

const VOTE_TIMEOUT_MS = 60_000;

export function startVote(guildId, userId) {
  const state = getGuildState(guildId);
  if (!state.currentSong) return { error: 'Tidak ada lagu yang sedang diputar.' };
  state._skipVote = { voters: [userId], startedAt: Date.now(), messageId: null };
  patchGuildState(guildId, state);
  return { ok: true, voters: 1 };
}

export function castVote(guildId, userId) {
  const state = getGuildState(guildId);
  if (!state._skipVote || (Date.now() - (state._skipVote.startedAt || 0) > VOTE_TIMEOUT_MS)) {
    return startVote(guildId, userId);
  }
  if (state._skipVote.voters.includes(userId)) {
    return { ok: false, reason: 'Kamu sudah vote.' };
  }
  state._skipVote.voters.push(userId);
  patchGuildState(guildId, state);
  return { ok: true, voters: state._skipVote.voters.length };
}

export function endVote(guildId) {
  const state = getGuildState(guildId);
  state._skipVote = null;
  patchGuildState(guildId, state);
}

export function getVote(guildId) {
  const state = getGuildState(guildId);
  return state._skipVote;
}

/**
 * Count humans in voice channel (excluding bots).
 * Handles both real Discord Collections and plain Map/Array.
 */
export function countHumanListeners(guild) {
  const state = getGuildState(guild.id);
  if (!state.voiceChannelId) return 0;
  const ch = guild.channels?.cache?.get?.(state.voiceChannelId);
  if (!ch || !ch.members) return 0;
  const members = ch.members;
  let count = 0;
  // Discord Collection has .filter; Map/Array don't
  if (typeof members.filter === 'function') {
    count = members.filter(m => !m.user?.bot).size;
  } else if (members instanceof Map) {
    for (const m of members.values()) if (!m.user?.bot) count++;
  } else if (Array.isArray(members)) {
    count = members.filter(m => !m.user?.bot).length;
  }
  return count;
}

/**
 * Check if vote passed (voters > humans/2, i.e. majority).
 */
export function votePassed(guild, voters) {
  const humans = countHumanListeners(guild);
  if (humans <= 0) return false;
  return voters > humans / 2;
}

export { VOTE_TIMEOUT_MS };
