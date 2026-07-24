import { readBlob, writeBlob } from './db.js';

export const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null,
  searchMode: 'smart',
  safeSearch: true,
  maxResults: 5,
  // Sources (any with API key can be enabled).
  // duckduckgo is special — always available (zero config), used as fallback.
  sources: {
    duckduckgo: false,  // shown as "fallback" in UI; user can opt-out
    brave: false,
    google: false,
  },
  allowDuckDuckGoFallback: true,  // used when no other source has results / rate-limited
};

function loadAll() { return readBlob('sikmasearch', 'all') || {}; }
function saveAll(db) { writeBlob('sikmasearch', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  const stored = db[guildId] || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    sources: { ...DEFAULT_CONFIG.sources, ...(stored.sources || {}) },
  };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  // Deep merge: if updates has nested `sources`, merge with current sources
  const updated = {
    ...current,
    ...updates,
    sources: updates.sources
      ? { ...current.sources, ...updates.sources }
      : current.sources,
  };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}
