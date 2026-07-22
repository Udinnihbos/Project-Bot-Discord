import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/music-favorites.json');

/**
 * Per-user favorite songs.
 * shape: {
 *   [userId]: [
 *     { title, url, duration, source, thumbnail, addedAt }
 *   ]
 * }
 */
const MAX_FAVORITES = 100;

function load() {
  if (!existsSync(DB_PATH)) return {};
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}
function save(data) { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

export function getFavorites(userId) {
  const all = load();
  return all[userId] || [];
}

export function isFavorite(userId, url) {
  return getFavorites(userId).some(t => t.url === url);
}

export function addFavorite(userId, track) {
  const all = load();
  if (!all[userId]) all[userId] = [];
  if (all[userId].some(t => t.url === track.url)) {
    throw new Error('Lagu sudah ada di favorit.');
  }
  if (all[userId].length >= MAX_FAVORITES) {
    throw new Error(`Sudah punya ${MAX_FAVORITES} favorit. Hapus dulu yang lama.`);
  }
  all[userId].push({ ...track, addedAt: Date.now() });
  save(all);
  return all[userId];
}

export function removeFavorite(userId, url) {
  const all = load();
  if (!all[userId]) throw new Error('Belum ada favorit.');
  const before = all[userId].length;
  all[userId] = all[userId].filter(t => t.url !== url);
  if (all[userId].length === before) {
    throw new Error('Lagu tidak ada di favorit.');
  }
  save(all);
  return all[userId];
}

export function clearFavorites(userId) {
  const all = load();
  const before = (all[userId] || []).length;
  all[userId] = [];
  save(all);
  return before;
}

export { MAX_FAVORITES };
