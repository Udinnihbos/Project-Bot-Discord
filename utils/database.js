/**
 * Player & reference data storage — SQLite-backed.
 *
 * Drop-in replacement for the old JSON-based database.js.
 * All public exports are unchanged so callers don't need to be modified.
 *
 * Storage strategy:
 *   - Static reference data (fish, rods, etc.)  → individual tables
 *   - Player data ({ players, trades })         → single blob row in `players`
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { read, write, readAll, readObject, readBlob, writeBlob, initDB as initSQLite, raw as rawDB } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize SQLite lazily on first call. Idempotent.
function ensureInit() {
  initSQLite();
}

function emptyPlayerData() {
  return { players: {}, trades: [] };
}

function getPlayerBlob() {
  ensureInit();
  const blob = readBlob('players', 'all');
  return blob || emptyPlayerData();
}

function savePlayerBlob(data) {
  ensureInit();
  // Signature: writeBlob(table, data, blobKey='all')
  writeBlob('players', data, 'all');
}

// ─── Static reference data ───
// These tables are pre-populated by migration from JSON.
// On first read, if the SQLite table is empty, we lazily load from
// the JSON file as a fallback. After migration runs, all reads come
// from SQLite.

function readJsonIfPresent(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch {}
  return null;
}

function getStaticTable(table, jsonFile, defaultValue = {}) {
  ensureInit();
  const obj = readObject(table);
  if (Object.keys(obj).length > 0) return obj;
  // Lazy fallback to JSON if SQLite empty (e.g. before migration)
  const jsonPath = join(__dirname, '../data', jsonFile);
  const json = readJsonIfPresent(jsonPath);
  if (json) {
    // Migrate on the fly: insert each top-level key
    for (const [k, v] of Object.entries(json)) {
      write(table, k, v);
    }
    return json;
  }
  return defaultValue;
}

export function getFishData() {
  return getStaticTable('fish_data', 'fish-data.json', { fish: [], rarityConfig: {} });
}
export function saveFishData(data) {
  ensureInit();
  // data is { fish: [...], rarityConfig: {...} } — split or store as blob?
  // Simpler: store as 2 rows: 'fish' and 'rarityConfig'
  write('fish_data', 'fish', data.fish || []);
  if (data.rarityConfig) write('fish_data', 'rarityConfig', data.rarityConfig);
  // Also keep JSON in sync for tooling that reads raw files (backward compat)
  // (writeJsonSync removed; JSON is just a one-time migration source now)
}

export function getRodData() {
  const obj = getStaticTable('rod_data', 'rod-data.json', { rods: [] });
  // Old API returned { rods: [...] }
  if (Array.isArray(obj.rods)) return obj;
  if (Array.isArray(obj.config)) return { rods: obj.config };
  return { rods: [] };
}
export function saveRodData(data) {
  ensureInit();
  write('rod_data', 'rods', data.rods || (Array.isArray(data) ? data : []));
}

export function getEventData() {
  return getStaticTable('event_data', 'event-data.json', {
    activeEvent: null, presets: [], announcementChannelId: null, activeEvents: []
  });
}
export function saveEventData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('event_data', k, v);
  }
}

export function getRRData() {
  return getStaticTable('reactionrole_data', 'reactionrole-data.json', { panels: {} });
}
export function saveRRData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('reactionrole_data', k, v);
  }
}

export function getGamepassData() {
  return getStaticTable('gamepass_data', 'gamepass-data.json', { gamepasses: [], announcementChannelId: null });
}
export function saveGamepassData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('gamepass_data', k, v);
  }
}

export function getMissionData() {
  return getStaticTable('mission_data', 'mission-data.json', { missions: [], announcementChannelId: null });
}
export function saveMissionData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('mission_data', k, v);
  }
}

// ─── Player data ───

export function getDB() {
  return getPlayerBlob();
}
export function saveDB(data) {
  savePlayerBlob(data);
}

export function getPlayer(userId) {
  const blob = getPlayerBlob();
  if (!blob.players[userId]) {
    blob.players[userId] = {
      id: userId,
      coins: 0,
      gems: 0,
      totalFishCaught: 0,
      inventory: {},
      discovered: [],
      lastFished: 0,
      totalEarned: 0,
      ownedRods: ['pancing_bambu'],
      equippedRod: 'pancing_bambu',
      gamepasses: [],
      dailyMissions: { date: '', progress: {}, claimed: [] },
    };
    savePlayerBlob(blob);
  }
  const player = blob.players[userId];
  // Migrate (legacy fields)
  if (!player.ownedRods) { player.ownedRods = ['pancing_bambu']; player.equippedRod = 'pancing_bambu'; }
  if (player.gems === undefined) player.gems = 0;
  if (!player.gamepasses) player.gamepasses = [];
  if (!player.dailyMissions) player.dailyMissions = { date: '', progress: {}, claimed: [] };
  if (!player.baitInventory) player.baitInventory = {};
  if (player.xp === undefined) player.xp = 0;
  if (player.activeBait === undefined) player.activeBait = null;
  if (!player.tickets) player.tickets = {};
  if (!player.items) player.items = {};
  if (!player.activeEffects) player.activeEffects = {};
  blob.players[userId] = player;
  savePlayerBlob(blob);
  return blob.players[userId];
}

export function savePlayer(userId, playerData) {
  const blob = getPlayerBlob();
  blob.players[userId] = playerData;
  savePlayerBlob(blob);
}

export function getAllPlayers() {
  return getPlayerBlob().players;
}

export function getTrades() {
  return getPlayerBlob().trades || [];
}

export function saveTrades(trades) {
  const blob = getPlayerBlob();
  blob.trades = trades;
  savePlayerBlob(blob);
}

export function getActiveEvent() {
  const data = getEventData();
  if (!data.activeEvent) return null;
  if (data.activeEvent.endsAt && Date.now() > data.activeEvent.endsAt) {
    data.activeEvent = null;
    saveEventData(data);
    return null;
  }
  return data.activeEvent;
}

export function hasGamepass(player, gamepassId) {
  if (!player.gamepasses) return false;
  const gp = player.gamepasses.find(g => g.id === gamepassId);
  if (!gp) return false;
  if (gp.expiresAt === null) return true;
  if (Date.now() > gp.expiresAt) return false;
  return true;
}

export function hasAfkUnlock(player) {
  if (!player.gamepasses) return false;
  const gpData = getGamepassData();
  for (const gp of player.gamepasses) {
    if (gp.expiresAt !== null && Date.now() > gp.expiresAt) continue;
    const gpInfo = gpData.gamepasses.find(g => g.id === gp.id);
    if (gpInfo?.unlockAfk) return true;
  }
  return false;
}

export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

export function checkAndResetMissions(player) {
  const today = getTodayString();
  if (player.dailyMissions.date !== today) {
    player.dailyMissions = { date: today, progress: {}, claimed: [] };
  }
  return player;
}

// ─── Additional reference data (bait, shop, spawn, level, zona, mutations) ───

export function getMutationData() {
  return getStaticTable('mutation_data', 'mutation-data.json', { mutations: [], rarityConfig: {} });
}
export function saveMutationData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('mutation_data', k, v);
  }
}

export function getBaitData() {
  return getStaticTable('bait_data', 'bait-data.json', { baits: [] });
}
export function saveBaitData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('bait_data', k, v);
  }
}

export function getShopData() {
  return getStaticTable('shop_data', 'shop-data.json', { items: [] });
}
export function saveShopData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('shop_data', k, v);
  }
}

export function getSpawnConfig() {
  return getStaticTable('spawn_config', 'spawn-config.json', { spawnInterval: 30, activeSpawns: [] });
}
export function saveSpawnConfig(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('spawn_config', k, v);
  }
}

export function getLevelData() {
  return getStaticTable('level_rewards', 'level-rewards.json', { xpPerFish: {}, xpPerRarity: {}, levelThresholds: [], rewards: {} });
}

export function getPlayerLevel(player) {
  const { levelThresholds } = getLevelData();
  const xp = player.xp || 0;
  let level = 0;
  for (let i = 0; i < levelThresholds.length; i++) {
    if (xp >= levelThresholds[i]) level = i;
    else break;
  }
  return Math.min(level, 65);
}

export function getXpForNextLevel(player) {
  const { levelThresholds } = getLevelData();
  const currentLevel = getPlayerLevel(player);
  if (currentLevel >= 65) return null;
  return levelThresholds[currentLevel + 1] || null;
}

export function addXp(player, amount) {
  if (!player.xp) player.xp = 0;
  const oldLevel = getPlayerLevel(player);
  player.xp += amount;
  const newLevel = getPlayerLevel(player);
  const levelUps = [];
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    levelUps.push(lvl);
  }
  return { levelUps, newLevel, oldLevel };
}

export function getZonaData() {
  return getStaticTable('zona_data', 'zona-data.json', { zonas: {} });
}
export function saveZonaData(data) {
  ensureInit();
  for (const [k, v] of Object.entries(data)) {
    write('zona_data', k, v);
  }
}

export function getZonaByChannel(channelId) {
  const { zonas } = getZonaData();
  return Object.values(zonas).find(z => z.channelId === channelId) || null;
}

// ─── Weather stack (max 3) ───
export function getActiveEvents() {
  const data = getEventData();
  if (!data.activeEvents) data.activeEvents = [];
  const now = Date.now();
  // Filter expired
  data.activeEvents = data.activeEvents.filter(e => !e.endsAt || now <= e.endsAt);
  return data.activeEvents;
}

export function addActiveEvent(event) {
  const data = getEventData();
  if (!data.activeEvents) data.activeEvents = [];
  if (data.activeEvents.length >= 3) return false;
  data.activeEvents.push(event);
  saveEventData(data);
  return true;
}

export function removeActiveEvent(eventId) {
  const data = getEventData();
  if (!data.activeEvents) data.activeEvents = [];
  data.activeEvents = data.activeEvents.filter(e => e.id !== eventId);
  saveEventData(data);
}

export function clearActiveEvents() {
  const data = getEventData();
  data.activeEvents = [];
  data.activeEvent = null;
  saveEventData(data);
}
