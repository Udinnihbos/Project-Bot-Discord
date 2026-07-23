import { read, write, readAll, readObject } from './db.js';

/**
 * Per-guild activity config + members data.
 * shape:
 *   enabled, trackedChannels, leaderboardChannelId, autoUpdate,
 *   publishedMessageId, members: { [userId]: {...} }
 */

const DEFAULT = () => ({
  enabled: false,
  trackedChannels: [],
  leaderboardChannelId: null,
  autoUpdate: false,
  publishedMessageId: null,
  members: {},
});

function migrate(g) {
  if (g.enabled === undefined) g.enabled = false;
  if (!Array.isArray(g.trackedChannels)) g.trackedChannels = [];
  if (g.leaderboardChannelId === undefined) g.leaderboardChannelId = null;
  if (g.autoUpdate === undefined) g.autoUpdate = false;
  if (g.publishedMessageId === undefined) g.publishedMessageId = null;
  if (!g.members || typeof g.members !== 'object') g.members = {};
  return g;
}

export function getGuildActivity(guildId) {
  let g = read('activity_data', guildId);
  if (!g) {
    g = DEFAULT();
    write('activity_data', guildId, g);
  }
  return migrate(g);
}

export function saveGuildActivity(guildId, data) {
  write('activity_data', guildId, data);
}

export function recordMessage(guildId, userId, channelId) {
  const g = getGuildActivity(guildId);
  if (!g.members[userId]) {
    g.members[userId] = {
      totalMessages: 0,
      lastActive: 0,
      joinedServer: Date.now(),
      channelMessages: {},
    };
  }
  const m = g.members[userId];
  m.totalMessages += 1;
  m.lastActive = Date.now();
  m.channelMessages[channelId] = (m.channelMessages[channelId] || 0) + 1;
  saveGuildActivity(guildId, g);
  return m;
}

export function getMemberActivity(guildId, userId) {
  const g = getGuildActivity(guildId);
  return g.members[userId] || null;
}

export function getActivityRank(guildId, userId) {
  const g = getGuildActivity(guildId);
  const list = Object.entries(g.members)
    .map(([id, m]) => ({ id, total: m.totalMessages || 0 }))
    .sort((a, b) => b.total - a.total);
  const idx = list.findIndex(x => x.id === userId);
  return idx === -1 ? null : idx + 1;
}

export function getSortedMembers(guildId) {
  const g = getGuildActivity(guildId);
  return Object.entries(g.members)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0));
}

export function resetMember(guildId, userId) {
  const g = getGuildActivity(guildId);
  delete g.members[userId];
  saveGuildActivity(guildId, g);
}

export function resetGuild(guildId) {
  const g = getGuildActivity(guildId);
  g.members = {};
  g.publishedMessageId = null;
  saveGuildActivity(guildId, g);
}
