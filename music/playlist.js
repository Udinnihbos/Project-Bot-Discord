import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/music-playlists.json');

/**
 * Per-user playlist storage.
 * shape: {
 *   [userId]: {
 *     [playlistName]: {
 *       createdAt: number,
 *       updatedAt: number,
 *       tracks: [
 *         { title, url, duration, source, thumbnail, addedAt }
 *       ]
 *     }
 *   }
 * }
 */

const MAX_PLAYLISTS_PER_USER = 10;
const MAX_TRACKS_PER_PLAYLIST = 50;
const MAX_NAME_LENGTH = 30;

function load() {
  if (!existsSync(DB_PATH)) return {};
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}
function save(data) { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function getUserPlaylists(userId) {
  const all = load();
  return all[userId] || {};
}

export function listPlaylists(userId) {
  const user = getUserPlaylists(userId);
  return Object.entries(user)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPlaylist(userId, name) {
  const user = getUserPlaylists(userId);
  return user[name] || null;
}

export function createPlaylist(userId, name) {
  // Validate raw name BEFORE trimming
  if (!name || !name.trim()) throw new Error('Nama playlist kosong.');
  if (name.length > MAX_NAME_LENGTH) throw new Error(`Nama max ${MAX_NAME_LENGTH} karakter.`);
  name = name.trim().slice(0, MAX_NAME_LENGTH);

  const all = load();
  if (!all[userId]) all[userId] = {};
  if (all[userId][name]) throw new Error(`Playlist **${name}** sudah ada.`);

  const userPlaylists = Object.keys(all[userId]).length;
  if (userPlaylists >= MAX_PLAYLISTS_PER_USER) {
    throw new Error(`Kamu sudah punya ${MAX_PLAYLISTS_PER_USER} playlist. Hapus dulu yang lama.`);
  }

  all[userId][name] = {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tracks: [],
  };
  save(all);
  return all[userId][name];
}

export function deletePlaylist(userId, name) {
  const all = load();
  if (!all[userId]?.[name]) throw new Error(`Playlist **${name}** tidak ditemukan.`);
  delete all[userId][name];
  save(all);
}

export function renamePlaylist(userId, oldName, newName) {
  if (!newName || !newName.trim()) throw new Error('Nama baru kosong.');
  if (newName.length > MAX_NAME_LENGTH) throw new Error(`Nama max ${MAX_NAME_LENGTH} karakter.`);
  newName = newName.trim().slice(0, MAX_NAME_LENGTH);
  const all = load();
  if (!all[userId]?.[oldName]) throw new Error(`Playlist **${oldName}** tidak ditemukan.`);
  if (all[userId][newName]) throw new Error(`Playlist **${newName}** sudah ada.`);
  all[userId][newName] = { ...all[userId][oldName], updatedAt: Date.now() };
  delete all[userId][oldName];
  save(all);
}

export function addTrack(userId, playlistName, track) {
  const all = load();
  if (!all[userId]?.[playlistName]) throw new Error(`Playlist **${playlistName}** tidak ditemukan.`);
  const pl = all[userId][playlistName];
  if (pl.tracks.length >= MAX_TRACKS_PER_PLAYLIST) {
    throw new Error(`Playlist **${playlistName}** sudah penuh (max ${MAX_TRACKS_PER_PLAYLIST} lagu).`);
  }
  // Dedup: same URL = skip
  if (pl.tracks.some(t => t.url === track.url)) {
    throw new Error(`Lagu **${track.title}** sudah ada di playlist.`);
  }
  pl.tracks.push({ ...track, addedAt: Date.now() });
  pl.updatedAt = Date.now();
  save(all);
  return pl;
}

export function removeTrack(userId, playlistName, index) {
  const all = load();
  if (!all[userId]?.[playlistName]) throw new Error(`Playlist **${playlistName}** tidak ditemukan.`);
  const pl = all[userId][playlistName];
  if (index < 0 || index >= pl.tracks.length) throw new Error('Index lagu tidak valid.');
  const removed = pl.tracks.splice(index, 1)[0];
  pl.updatedAt = Date.now();
  save(all);
  return removed;
}

export function clearPlaylist(userId, playlistName) {
  const all = load();
  if (!all[userId]?.[playlistName]) throw new Error(`Playlist **${playlistName}** tidak ditemukan.`);
  all[userId][playlistName].tracks = [];
  all[userId][playlistName].updatedAt = Date.now();
  save(all);
}

export { MAX_PLAYLISTS_PER_USER, MAX_TRACKS_PER_PLAYLIST, MAX_NAME_LENGTH };
