import { readBlob, writeBlob, readAll } from './db.js';

export function getGuildData(guildId) {
  const db = readBlob('sikmatree', 'all') || {};
  return db[guildId] || {
    links: [],
    channelId: null,
    messageId: null,
    autoUpdate: false,
  };
}

export function saveGuildData(guildId, data) {
  const db = readBlob('sikmatree', 'all') || {};
  db[guildId] = data;
  writeBlob('sikmatree', db, 'all');
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
