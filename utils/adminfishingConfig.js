/**
 * Adminfishing V2 — Per-guild config (small).
 * Most state lives in existing data layer (zonaData, fishData, etc).
 * This is for admin settings, recent actions log, and custom event templates.
 */

import { readBlob, writeBlob } from './db.js';

export const DEFAULT_CONFIG = {
  // Custom event templates (reusable, /setevent style)
  eventTemplates: {
    weekend_boost: {
      id: 'weekend_boost',
      name: '🎉 Weekend Boost',
      emoji: '🎉',
      color: '#e74c3c',
      description: 'Selamat weekend! Luck +50% untuk semua rarity. Selamat memancing!',
    },
    golden_hour: {
      id: 'golden_hour',
      name: '🌇 Golden Hour',
      emoji: '🌇',
      color: '#f39c12',
      description: 'Jam emas memancing! Rare fish chance 2x lipat.',
    },
    maintenance: {
      id: 'maintenance',
      name: '🔧 Maintenance',
      emoji: '🔧',
      color: '#95a5a6',
      description: 'Bot sedang maintenance. Kembali lagi nanti ya!',
    },
  },

  // Last 20 admin actions (audit log)
  history: [],
};

function loadAll() { return readBlob('adminfishing', 'all') || {}; }
function saveAll(db) { writeBlob('adminfishing', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  const stored = db[guildId] || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    eventTemplates: { ...DEFAULT_CONFIG.eventTemplates, ...(stored.eventTemplates || {}) },
    history: stored.history || [],
  };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  const updated = {
    ...current,
    ...updates,
    eventTemplates: updates.eventTemplates
      ? { ...current.eventTemplates, ...updates.eventTemplates }
      : current.eventTemplates,
    history: updates.history ?? current.history,
  };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}

export function addHistory(guildId, entry) {
  const config = getGuildConfig(guildId);
  const newList = [entry, ...config.history].slice(0, 20);
  updateGuildConfig(guildId, { history: newList });
}
