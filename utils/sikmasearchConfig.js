import { readBlob, writeBlob } from './db.js';

export const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null,
  searchMode: 'smart',
  safeSearch: true,
  maxResults: 5,
  sources: {
    google: false,
    brave: false,
  },
};

function loadAll() { return readBlob('sikmasearch', 'all') || {}; }
function saveAll(db) { writeBlob('sikmasearch', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  return { ...DEFAULT_CONFIG, ...db[guildId], sources: { ...DEFAULT_CONFIG.sources, ...(db[guildId]?.sources || {}) } };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  const updated = { ...current, ...updates };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}
