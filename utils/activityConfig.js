import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/activity-data.json');

function loadDB() {
  if (!existsSync(DB_PATH)) {
    writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
    return {};
  }
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Get per-guild activity config + members data.
 * Shape:
 * {
 *   enabled: boolean,
 *   trackedChannels: [channelId, ...],   // whitelist
 *   leaderboardChannelId: string|null,
 *   autoUpdate: boolean,
 *   publishedMessageId: string|null,
 *   members: {
 *     [userId]: {
 *       totalMessages: number,
 *       lastActive: number,           // ms epoch
 *       joinedServer: number,         // ms epoch
 *       channelMessages: { [channelId]: number },
 *     }
 *   }
 * }
 */
export function getGuildActivity(guildId) {
  const db = loadDB();
  if (!db[guildId]) {
    db[guildId] = {
      enabled: false,
      trackedChannels: [],
      leaderboardChannelId: null,
      autoUpdate: false,
      publishedMessageId: null,
      members: {},
    };
    saveDB(db);
  }
  // Migrate
  const g = db[guildId];
  if (g.enabled === undefined) g.enabled = false;
  if (!Array.isArray(g.trackedChannels)) g.trackedChannels = [];
  if (g.leaderboardChannelId === undefined) g.leaderboardChannelId = null;
  if (g.autoUpdate === undefined) g.autoUpdate = false;
  if (g.publishedMessageId === undefined) g.publishedMessageId = null;
  if (!g.members || typeof g.members !== 'object') g.members = {};
  return g;
}

export function saveGuildActivity(guildId, data) {
  const db = loadDB();
  db[guildId] = data;
  saveDB(db);
}

/**
 * Update member activity stats after a message is sent.
 * Increments totalMessages, channelMessages[channelId], updates lastActive.
 * Initializes joinedServer the first time the member is seen.
 */
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
