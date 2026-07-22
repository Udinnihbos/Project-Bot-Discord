import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/players.json');
const FISH_DB_PATH = join(__dirname, '../data/fish-data.json');
const ROD_DB_PATH = join(__dirname, '../data/rod-data.json');
const EVENT_DB_PATH = join(__dirname, '../data/event-data.json');
const RR_DB_PATH = join(__dirname, '../data/reactionrole-data.json');
const GAMEPASS_DB_PATH = join(__dirname, '../data/gamepass-data.json');
const MISSION_DB_PATH = join(__dirname, '../data/mission-data.json');

if (!existsSync(DB_PATH)) {
  writeFileSync(DB_PATH, JSON.stringify({ players: {}, trades: [] }, null, 2));
}

export function getFishData() { return JSON.parse(readFileSync(FISH_DB_PATH, 'utf8')); }
export function saveFishData(data) { writeFileSync(FISH_DB_PATH, JSON.stringify(data, null, 2)); }
export function getRodData() { return JSON.parse(readFileSync(ROD_DB_PATH, 'utf8')); }
export function saveRodData(data) { writeFileSync(ROD_DB_PATH, JSON.stringify(data, null, 2)); }
export function getEventData() { return JSON.parse(readFileSync(EVENT_DB_PATH, 'utf8')); }
export function saveEventData(data) { writeFileSync(EVENT_DB_PATH, JSON.stringify(data, null, 2)); }
export function getRRData() { return JSON.parse(readFileSync(RR_DB_PATH, 'utf8')); }
export function saveRRData(data) { writeFileSync(RR_DB_PATH, JSON.stringify(data, null, 2)); }
export function getGamepassData() { return JSON.parse(readFileSync(GAMEPASS_DB_PATH, 'utf8')); }
export function saveGamepassData(data) { writeFileSync(GAMEPASS_DB_PATH, JSON.stringify(data, null, 2)); }
export function getMissionData() { return JSON.parse(readFileSync(MISSION_DB_PATH, 'utf8')); }
export function saveMissionData(data) { writeFileSync(MISSION_DB_PATH, JSON.stringify(data, null, 2)); }

export function getDB() { return JSON.parse(readFileSync(DB_PATH, 'utf8')); }
export function saveDB(data) { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

export function getPlayer(userId) {
  const db = getDB();
  if (!db.players[userId]) {
    db.players[userId] = {
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
      gamepasses: [],       // [{ id, expiresAt }] expiresAt null = permanent
      dailyMissions: {      // { date: 'YYYY-MM-DD', progress: { missionId: current } }
        date: '',
        progress: {},
        claimed: []
      }
    };
    saveDB(db);
  }
  const player = db.players[userId];
  // Migrate
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
  db.players[userId] = player;
  saveDB(db);
  return db.players[userId];
}

export function savePlayer(userId, playerData) {
  const db = getDB();
  db.players[userId] = playerData;
  saveDB(db);
}

export function getAllPlayers() {
  const db = getDB();
  return db.players;
}

export function getTrades() {
  const db = getDB();
  return db.trades || [];
}

export function saveTrades(trades) {
  const db = getDB();
  db.trades = trades;
  saveDB(db);
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

// Check if player has an active gamepass
export function hasGamepass(player, gamepassId) {
  if (!player.gamepasses) return false;
  const gp = player.gamepasses.find(g => g.id === gamepassId);
  if (!gp) return false;
  if (gp.expiresAt === null) return true; // permanent
  if (Date.now() > gp.expiresAt) return false; // expired
  return true;
}

// Check if player has any gamepass with unlockAfk
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

// Get today's date string
export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

// Reset daily missions if new day
export function checkAndResetMissions(player) {
  const today = getTodayString();
  if (player.dailyMissions.date !== today) {
    player.dailyMissions = { date: today, progress: {}, claimed: [] };
  }
  return player;
}

const MUTATION_DB_PATH = join(__dirname, '../data/mutation-data.json');
export function getMutationData() { return JSON.parse(readFileSync(MUTATION_DB_PATH, 'utf8')); }
export function saveMutationData(data) { writeFileSync(MUTATION_DB_PATH, JSON.stringify(data, null, 2)); }

// ── CUACA STACK (max 3) ──
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
  // Max 3 stack
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
  // Keep backward compat
  data.activeEvent = null;
  saveEventData(data);
}

// ── BAIT ──
const BAIT_DB_PATH = join(__dirname, '../data/bait-data.json');
export function getBaitData() { return JSON.parse(readFileSync(BAIT_DB_PATH, 'utf8')); }
export function saveBaitData(data) { writeFileSync(BAIT_DB_PATH, JSON.stringify(data, null, 2)); }

const SHOP_DB_PATH = join(__dirname, '../data/shop-data.json');
export function getShopData() { return JSON.parse(readFileSync(SHOP_DB_PATH, 'utf8')); }
export function saveShopData(data) { writeFileSync(SHOP_DB_PATH, JSON.stringify(data, null, 2)); }

const SPAWN_CONFIG_PATH = join(__dirname, '../data/spawn-config.json');
export function getSpawnConfig() { return JSON.parse(readFileSync(SPAWN_CONFIG_PATH, 'utf8')); }
export function saveSpawnConfig(data) { writeFileSync(SPAWN_CONFIG_PATH, JSON.stringify(data, null, 2)); }

// ── LEVEL ──
const LEVEL_DB_PATH = join(__dirname, '../data/level-rewards.json');
export function getLevelData() { return JSON.parse(readFileSync(LEVEL_DB_PATH, 'utf8')); }

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

// ── ZONA ──
const ZONA_DB_PATH = join(__dirname, '../data/zona-data.json');
export function getZonaData() { return JSON.parse(readFileSync(ZONA_DB_PATH, 'utf8')); }
export function saveZonaData(data) { writeFileSync(ZONA_DB_PATH, JSON.stringify(data, null, 2)); }

export function getZonaByChannel(channelId) {
  const { zonas } = getZonaData();
  return Object.values(zonas).find(z => z.channelId === channelId) || null;
}
