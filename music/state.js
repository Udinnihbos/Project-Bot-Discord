import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '../data/music-state.json');

/**
 * Persistent state per guild.
 * shape: {
 *   [guildId]: {
 *     queue: Track[],          // pending songs
 *     currentSong: Track|null, // currently playing
 *     currentStartedAt: number, // ms epoch when current started
 *     loop: 'off' | 'song' | 'queue',
 *     volume: number,          // 0..200
 *     textChannelId: string|null,
 *     voiceChannelId: string|null,
 *     nowPlayingMessageId: string|null,
 *     lastUpdated: number,
 *   }
 * }
 */
function load() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  writeFileSync(STATE_PATH, JSON.stringify(data, null, 2));
}

export function getGuildState(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = {
      queue: [],
      currentSong: null,
      currentStartedAt: null,
      loop: 'off',
      volume: 100,
      textChannelId: null,
      voiceChannelId: null,
      nowPlayingMessageId: null,
      lastUpdated: Date.now(),
    };
    save(all);
  }
  return all[guildId];
}

export function saveGuildState(guildId, state) {
  const all = load();
  state.lastUpdated = Date.now();
  all[guildId] = state;
  save(all);
}

export function patchGuildState(guildId, patch) {
  const state = getGuildState(guildId);
  Object.assign(state, patch);
  saveGuildState(guildId, state);
  return state;
}

export function clearGuildState(guildId) {
  const all = load();
  delete all[guildId];
  save(all);
}
