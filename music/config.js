import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../data/music-config.json');

/**
 * Per-guild music config.
 * shape: {
 *   [guildId]: {
 *     '247': boolean,
 *     'autoLeaveMinutes': number,  // 0 = never
 *     'djRoleId': string|null,
 *     'announceChannelId': string|null, // channel to announce new song
 *     'language': 'id'|'en',
 *   }
 * }
 */
function load() {
  if (!existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function save(data) { writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2)); }

export function getMusicConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = {
      '247': false,
      autoLeaveMinutes: 5,
      djRoleId: null,
      announceChannelId: null,
      language: 'id',
    };
    save(all);
  }
  return all[guildId];
}

export function saveMusicConfig(guildId, cfg) {
  const all = load();
  all[guildId] = { ...getMusicConfig(guildId), ...cfg };
  save(all);
  return all[guildId];
}

export function patchMusicConfig(guildId, patch) {
  return saveMusicConfig(guildId, patch);
}
