/**
 * Announce V2 — Per-guild config storage.
 *
 * Stores:
 *   - Templates (reusable announce configs)
 *   - Custom permissions (which roles can /announce besides OWNER)
 *   - Scheduled announces (one-time + recurring)
 *   - History (last 20 sends)
 */

import { readBlob, writeBlob } from './db.js';

export const DEFAULT_CONFIG = {
  enabled: true,
  // Roles (besides OWNER_ID) that can use /announce
  allowedRoles: [],

  // Reusable templates
  templates: {
    // Built-in defaults (always present)
    maintenance: {
      id: 'maintenance',
      name: '🔧 Maintenance',
      emoji: '🔧',
      color: '#f39c12',
      title: 'Maintenance Terjadwal',
      description: 'Bot akan mengalami maintenance pada:\n**{date}** jam **{time} WIB**\n\nMohon maaf atas ketidaknyamanannya.',
      footer: '🔧 Status Bot',
    },
    event: {
      id: 'event',
      name: '🎉 Event',
      emoji: '🎉',
      color: '#e74c3c',
      title: 'EVENT SPESIAL!',
      description: 'Hai {server}! 🎊\n\nAda event spesial yang bisa kamu ikuti.\nCek detail di channel #event untuk info lebih lanjut!',
      footer: '🎉 Jangan sampai kelewat!',
    },
    update: {
      id: 'update',
      name: '📦 Update',
      emoji: '📦',
      color: '#3498db',
      title: 'Update Bot v{version}',
      description: 'Bot baru saja di-update!\n\n• Fitur baru\n• Bug fix\n• Performance improvements\n\nCek `/help` untuk command list terbaru.',
      footer: '📦 {date}',
    },
  },

  // Scheduled messages (in-memory mirror of scheduler state)
  scheduled: [],

  // History (last 20 sends, ring buffer)
  history: [],
};

function loadAll() { return readBlob('announce', 'all') || {}; }
function saveAll(db) { writeBlob('announce', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  const stored = db[guildId] || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    templates: { ...DEFAULT_CONFIG.templates, ...(stored.templates || {}) },
    allowedRoles: stored.allowedRoles || [],
    scheduled: stored.scheduled || [],
    history: stored.history || [],
  };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  const updated = {
    ...current,
    ...updates,
    templates: updates.templates
      ? { ...current.templates, ...updates.templates }
      : current.templates,
    allowedRoles: updates.allowedRoles ?? current.allowedRoles,
    scheduled: updates.scheduled ?? current.scheduled,
    history: updates.history ?? current.history,
  };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}

/**
 * Add a scheduled message to config.
 * @param {string} guildId
 * @param {object} entry { id, type: 'once'|'recurring', channelIds: [], content: {...}, when: ms timestamp, cronExpr?: 'daily'|'weekly', createdBy, createdAt }
 */
export function addScheduled(guildId, entry) {
  const config = getGuildConfig(guildId);
  const newList = [...config.scheduled, entry].slice(-50); // cap at 50
  updateGuildConfig(guildId, { scheduled: newList });
  return entry;
}

export function removeScheduled(guildId, id) {
  const config = getGuildConfig(guildId);
  const newList = config.scheduled.filter(s => s.id !== id);
  updateGuildConfig(guildId, { scheduled: newList });
}

/**
 * Add to history (ring buffer, max 20).
 */
export function addHistory(guildId, entry) {
  const config = getGuildConfig(guildId);
  const newList = [entry, ...config.history].slice(0, 20);
  updateGuildConfig(guildId, { history: newList });
}
