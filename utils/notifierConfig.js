/**
 * Notifier — Per-guild config storage (SQLite).
 *
 * Tracks YouTube channels/playlists + Twitch streamers to watch.
 * Plus per-guild message template and destination channel.
 */

import { readBlob, writeBlob } from './db.js';

export const DEFAULT_CONFIG = {
  enabled: false,
  // Destination channel for notif messages (where posts go)
  channelId: null,

  // YouTube
  youtube: {
    enabled: false,
    // Array of { id, type: 'channel'|'playlist', name }
    creators: [],
    // Message template. Placeholders: {creator} {title} {url} {thumbnail}
    message: '🎥 **{creator}** uploaded: **{title}**\n{url}',
  },

  // Twitch
  twitch: {
    enabled: false,
    // Array of { login, name }
    streamers: [],
    // Message template
    message: '🔴 **{streamer}** is now live!\n{url}',
  },

  // Internal state (not user-editable) — for scheduler to track
  state: {
    youtube: {
      // lastVideoId per creator id
      lastVideoIds: {},
    },
    twitch: {
      // live state per streamer login
      liveStates: {},
    },
  },
};

function loadAll() { return readBlob('notifier', 'all') || {}; }
function saveAll(db) { writeBlob('notifier', db, 'all'); }

export function getGuildConfig(guildId) {
  const db = loadAll();
  const stored = db[guildId] || {};
  // Deep merge with defaults
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    youtube: { ...DEFAULT_CONFIG.youtube, ...(stored.youtube || {}) },
    twitch: { ...DEFAULT_CONFIG.twitch, ...(stored.twitch || {}) },
    state: {
      youtube: { ...DEFAULT_CONFIG.state.youtube, ...(stored.state?.youtube || {}) },
      twitch: { ...DEFAULT_CONFIG.state.twitch, ...(stored.state?.twitch || {}) },
    },
  };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadAll();
  const current = getGuildConfig(guildId);
  // Deep merge for nested objects
  const updated = {
    ...current,
    ...updates,
    youtube: updates.youtube ? { ...current.youtube, ...updates.youtube } : current.youtube,
    twitch: updates.twitch ? { ...current.twitch, ...updates.twitch } : current.twitch,
    state: updates.state ? {
      youtube: updates.state.youtube ? { ...current.state.youtube, ...updates.state.youtube } : current.state.youtube,
      twitch: updates.state.twitch ? { ...current.state.twitch, ...updates.state.twitch } : current.state.twitch,
    } : current.state,
  };
  db[guildId] = updated;
  saveAll(db);
  return updated;
}
