/**
 * Reaction Role V2 — Per-guild config storage.
 *
 * Schema per panel:
 *   {
 *     id: 'color',
 *     title: 'Pilih Warna',
 *     description: 'Klik untuk set warna nickname',
 *     color: '#3498db',
 *     type: 'dropdown' | 'button',
 *     template: 'color' | 'region' | 'game' | 'notification' | 'pronoun' | 'custom',
 *     mode: 'toggle' | 'add-only' | 'one-of',
 *     maxRolesPerUser: 1, // only applies to 'one-of' mode
 *     roles: [
 *       { roleId, label, emoji, description }
 *     ],
 *     messageId, channelId,
 *     createdBy, createdAt, updatedAt,
 *   }
 *
 * Templates (built-in shortcuts for mode + style):
 *   - color:      type=button, mode=one-of, maxRolesPerUser=1
 *   - region:     type=dropdown, mode=one-of, maxRolesPerUser=1
 *   - game:       type=dropdown, mode=toggle (multi)
 *   - notification: type=button, mode=toggle (multi)
 *   - pronoun:    type=button, mode=one-of, maxRolesPerUser=1
 *   - custom:     defaults
 */

import { readBlob, writeBlob } from './db.js';

export const TEMPLATES = {
  color: {
    name: '🎨 Color Roles',
    description: 'Pilih 1 warna untuk nickname kamu',
    type: 'button',
    mode: 'one-of',
    maxRolesPerUser: 1,
  },
  region: {
    name: '🌍 Region',
    description: 'Pilih region kamu',
    type: 'dropdown',
    mode: 'one-of',
    maxRolesPerUser: 1,
  },
  game: {
    name: '🎮 Game Roles',
    description: 'Pilih game yang kamu main',
    type: 'dropdown',
    mode: 'toggle',
    maxRolesPerUser: null, // unlimited
  },
  notification: {
    name: '🔔 Notification Roles',
    description: 'Toggle notifikasi yang kamu mau',
    type: 'button',
    mode: 'toggle',
    maxRolesPerUser: null,
  },
  pronoun: {
    name: '🏳️‍⚧️ Pronoun',
    description: 'Pilih pronoun kamu',
    type: 'button',
    mode: 'one-of',
    maxRolesPerUser: 1,
  },
  custom: {
    name: '⚙️ Custom',
    description: 'Custom configuration',
    type: 'button',
    mode: 'toggle',
    maxRolesPerUser: null,
  },
};

const DEFAULT_CONFIG = {
  panels: {},
};

function loadAll() { return readBlob('reactionrole', 'all') || {}; }
function saveAll(db) { writeBlob('reactionrole', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  const stored = db[guildId] || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    panels: stored.panels || {},
  };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  const updated = {
    ...current,
    ...updates,
    panels: updates.panels ?? current.panels,
  };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}

export function getPanel(guildId, panelId) {
  return getGuildConfig(guildId).panels[panelId] || null;
}

export function upsertPanel(guildId, panel) {
  const config = getGuildConfig(guildId);
  const now = Date.now();
  const existing = config.panels[panel.id];
  config.panels[panel.id] = {
    ...existing,
    ...panel,
    id: panel.id,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || panel.createdBy,
    updatedAt: now,
  };
  updateGuildConfig(guildId, { panels: config.panels });
  return config.panels[panel.id];
}

export function deletePanel(guildId, panelId) {
  const config = getGuildConfig(guildId);
  if (!config.panels[panelId]) return false;
  delete config.panels[panelId];
  updateGuildConfig(guildId, { panels: config.panels });
  return true;
}

export function addRoleToPanel(guildId, panelId, roleData) {
  const config = getGuildConfig(guildId);
  const panel = config.panels[panelId];
  if (!panel) return null;
  // Check duplicate
  if (panel.roles.find(r => r.roleId === roleData.roleId)) return null;
  panel.roles = panel.roles || [];
  panel.roles.push(roleData);
  panel.updatedAt = Date.now();
  updateGuildConfig(guildId, { panels: config.panels });
  return panel;
}

export function removeRoleFromPanel(guildId, panelId, roleId) {
  const config = getGuildConfig(guildId);
  const panel = config.panels[panelId];
  if (!panel) return null;
  const before = panel.roles.length;
  panel.roles = (panel.roles || []).filter(r => r.roleId !== roleId);
  if (panel.roles.length === before) return null; // no change
  panel.updatedAt = Date.now();
  updateGuildConfig(guildId, { panels: config.panels });
  return panel;
}
