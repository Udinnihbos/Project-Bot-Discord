import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/sikmatree.json');

function loadDB() {
  if (!existsSync(DB_PATH)) { writeFileSync(DB_PATH, JSON.stringify({}, null, 2)); return {}; }
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getGuildData(guildId) {
  const db = loadDB();
  return db[guildId] || {
    links: [],
    channelId: null,
    messageId: null,
    autoUpdate: false,
  };
}

export function saveGuildData(guildId, data) {
  const db = loadDB();
  db[guildId] = data;
  saveDB(db);
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
