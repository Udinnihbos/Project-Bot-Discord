import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/sikmasearch.json');

export const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null,
  searchMode: 'smart',   // smart | exact
  safeSearch: true,
  maxResults: 5,
  sources: {
    google: false,
    brave: false,
  },
};

function loadDB() {
  if (!existsSync(DB_PATH)) { writeFileSync(DB_PATH, JSON.stringify({}, null, 2)); return {}; }
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getGuildConfig(guildId) {
  const db = loadDB();
  return { ...DEFAULT_CONFIG, ...db[guildId], sources: { ...DEFAULT_CONFIG.sources, ...(db[guildId]?.sources || {}) } };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadDB();
  const current = getGuildConfig(guildId);
  const updated = { ...current, ...updates };
  db[guildId] = updated;
  saveDB(db);
  return updated;
}
