/**
 * SQLite wrapper with JSON-shaped API.
 *
 * Goals:
 * - Drop-in replacement for readFileSync/writeFileSync on data/*.json
 * - Auto-migrate from JSON on first init
 * - Backward compatible: keep reading/writing JSON files as fallback
 *   (only SQLite is primary; JSON becomes read-only cache for safety)
 *
 * Architecture:
 * - One file: data/bot.db
 * - Each JSON file becomes a SQLite table (name = file basename without .json)
 * - JSON content is stored as TEXT (raw JSON) under a single "data" column
 *   keyed by "key" — simplest possible schema that preserves full structure
 *   and is easy to read/write atomically.
 *
 * Tables created (one per JSON file):
 *   players              (key=userId,         data={...player})
 *   fish_data            (key="config",       data={fish, rarityConfig})
 *   rod_data             (key="config",       data={rods})
 *   bait_data            (key="config",       data={baits})
 *   mutation_data        (key="config",       data={mutations, rarityConfig})
 *   shop_data            (key="config",       data={items})
 *   mission_data         (key="config",       data={missions, announcementChannelId})
 *   event_data           (key="config",       data={activeEvent, presets, ...})
 *   gamepass_data        (key="config",       data={gamepasses, announcementChannelId})
 *   level_rewards        (key="config",       data={xpPerFish, xpPerRarity, ...})
 *   spawn_config         (key="config",       data={spawnInterval, activeSpawns})
 *   security_config      (key=guildId,        data={antiRaid, antiSpam, ...})
 *   reactionrole_data    (key=guildId,        data={panels})
 *   sikmatree            (key=guildId,        data={links, channelId, ...})
 *   sikmaticket          (key=guildId,        data={...})
 *   sikmasearch          (key=guildId,        data={...})
 *   zona_data            (key="config",       data={zonas})
 *   fishing_config       (key=guildId,        data={fishingRoleId})
 *   activity_config      (key=guildId,        data={...})
 *
 * API:
 *   initDB()                              — call once at bot startup
 *   read(table, key)                      — returns parsed object or null
 *   write(table, key, data)               — atomic upsert
 *   remove(table, key)                    — delete row
 *   readAll(table)                        — returns array of {key, data}
 *   readKeys(table)                       — returns array of keys
 *   raw()                                 — access underlying better-sqlite3 instance
 *   hasMigrated()                         — true if migration has been done
 */

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const DB_PATH = join(DATA_DIR, 'bot.db');
const MIGRATION_FLAG = join(DATA_DIR, '.sqlite-migrated');

// JSON file -> SQLite table mapping
// (key column type, value type)
const FILE_MAPPING = [
  // player / per-user data
  { file: 'players.json',           table: 'players',            key: 'userId', blob: true },
  { file: 'activity-data.json',     table: 'activity_data',      key: 'guildId' },

  // static reference data (read-only usually)
  { file: 'fish-data.json',         table: 'fish_data',          key: 'config' },
  { file: 'rod-data.json',          table: 'rod_data',           key: 'config' },
  { file: 'bait-data.json',         table: 'bait_data',          key: 'config' },
  { file: 'mutation-data.json',     table: 'mutation_data',      key: 'config' },
  { file: 'shop-data.json',         table: 'shop_data',          key: 'config' },
  { file: 'mission-data.json',      table: 'mission_data',       key: 'config' },
  { file: 'event-data.json',        table: 'event_data',         key: 'config' },
  { file: 'gamepass-data.json',     table: 'gamepass_data',      key: 'config' },
  { file: 'level-rewards.json',     table: 'level_rewards',      key: 'config' },
  { file: 'spawn-config.json',      table: 'spawn_config',       key: 'config' },
  { file: 'zona-data.json',         table: 'zona_data',          key: 'config' },

  // per-guild config
  { file: 'security-config.json',   table: 'security_config',    key: 'guildId' },
  { file: 'reactionrole-data.json', table: 'reactionrole_data',  key: 'guildId' },
  { file: 'sikmatree.json',         table: 'sikmatree',          key: 'guildId' },
  { file: 'sikmaticket.json',       table: 'sikmaticket',        key: 'guildId' },
  { file: 'sikmasearch.json',       table: 'sikmasearch',        key: 'guildId' },
  { file: 'fishing-config.json',    table: 'fishing_config',     key: 'guildId' },
  { file: 'activity-config.json',   table: 'activity_config',    key: 'guildId' },
];

let db = null;
let initialized = false;

export function raw() {
  if (!db) throw new Error('DB not initialized. Call initDB() first.');
  return db;
}

export function hasMigrated() {
  return existsSync(MIGRATION_FLAG);
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function createTables() {
  for (const m of FILE_MAPPING) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${m.table} (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )
    `);
  }
}

function migrateFromJson() {
  if (existsSync(MIGRATION_FLAG)) return;
  console.log('📦 [SQLite] Migrating from JSON (first run)...');
  let count = 0;
  for (const m of FILE_MAPPING) {
    const fp = join(DATA_DIR, m.file);
    if (!existsSync(fp)) continue;
    try {
      const raw = readFileSync(fp, 'utf8');
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw);

      // parsed could be:
      // 1. Object keyed by primary key (most common): { userId: {...}, ... }
      // 2. Single config object: { ... } (stored under synthetic key 'config')
      // 3. Array: [...] (stored under 'config' too, or iterate? skip arrays)
      if (Array.isArray(parsed)) {
        // Array of static data — store as single row
        const insert = db.prepare(`INSERT OR REPLACE INTO ${m.table} (key, data) VALUES (?, ?)`);
        insert.run('config', JSON.stringify(parsed));
        count++;
      } else if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed);
        if (m.blob) {
          // For files like players.json whose top-level is a composite
          // (e.g. { players, trades }), store the whole object under
          // a single reserved 'all' key.
          const insert = db.prepare(`INSERT OR REPLACE INTO ${m.table} (key, data) VALUES (?, ?)`);
          insert.run('all', JSON.stringify(parsed));
          count++;
        } else if (keys.length === 0) {
          // Empty object — store as config
          const insert = db.prepare(`INSERT OR REPLACE INTO ${m.table} (key, data) VALUES (?, ?)`);
          insert.run('config', '{}');
          count++;
        } else {
          // Insert each top-level key as a row
          const insert = db.prepare(`INSERT OR REPLACE INTO ${m.table} (key, data) VALUES (?, ?)`);
          const tx = db.transaction((entries) => {
            for (const [k, v] of entries) {
              insert.run(k, JSON.stringify(v));
            }
          });
          tx(Object.entries(parsed));
          count++;
        }
      }
    } catch (e) {
      console.warn(`  ⚠️  Skip ${m.file}: ${e.message?.slice(0, 100)}`);
    }
  }
  writeFileSync(MIGRATION_FLAG, new Date().toISOString());
  console.log(`📦 [SQLite] Migrated ${count} JSON files.`);
}

/**
 * Initialize the SQLite database. Call once at bot startup.
 * Creates data/bot.db if missing, runs schema, migrates JSON if first run.
 */
export function initDB() {
  if (initialized) return;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');     // better concurrency
  db.pragma('synchronous = NORMAL');   // balance safety/speed
  db.pragma('foreign_keys = ON');
  createTables();
  if (!hasMigrated()) migrateFromJson();
  initialized = true;
  console.log(`✅ [SQLite] Ready: ${DB_PATH}`);
}

/**
 * Read a record. Returns parsed object or null.
 */
export function read(table, key) {
  if (!initialized) initDB();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT data FROM ${table} WHERE key = ?`).get(String(key));
    if (!row) return null;
    return JSON.parse(row.data);
  } catch (e) {
    console.error(`[SQLite] read(${table}, ${key}) failed:`, e.message);
    return null;
  }
}

/**
 * Write/upsert a record. `data` must be JSON-serializable.
 */
export function write(table, key, data) {
  if (!initialized) initDB();
  if (!db) return;
  try {
    const json = JSON.stringify(data);
    db.prepare(`
      INSERT INTO ${table} (key, data, updated_at) VALUES (?, ?, strftime('%s','now'))
      ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = strftime('%s','now')
    `).run(String(key), json);
  } catch (e) {
    console.error(`[SQLite] write(${table}, ${key}) failed:`, e.message);
  }
}

/**
 * Delete a record.
 */
export function remove(table, key) {
  if (!initialized) initDB();
  if (!db) return;
  try {
    db.prepare(`DELETE FROM ${table} WHERE key = ?`).run(String(key));
  } catch (e) {
    console.error(`[SQLite] remove(${table}, ${key}) failed:`, e.message);
  }
}

/**
 * Read all records in a table. Returns array of { key, data, updatedAt }.
 */
export function readAll(table) {
  if (!initialized) initDB();
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT key, data, updated_at FROM ${table}`).all();
    return rows.map(r => ({ key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at }));
  } catch (e) {
    console.error(`[SQLite] readAll(${table}) failed:`, e.message);
    return [];
  }
}

/**
 * Get all keys in a table.
 */
export function readKeys(table) {
  if (!initialized) initDB();
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT key FROM ${table}`).all();
    return rows.map(r => r.key);
  } catch (e) {
    console.error(`[SQLite] readKeys(${table}) failed:`, e.message);
    return [];
  }
}

/**
 * Convenience: read whole JSON-shape (parses the rows back into the
 * original top-level object form: { key: data, ... }).
 */
export function readObject(table) {
  const all = readAll(table);
  const out = {};
  for (const r of all) out[r.key] = r.data;
  return out;
}

/**
 * For files whose top-level structure is NOT a simple key→data map
 * (e.g. { players: {...}, trades: [] }), use blob storage: single row
 * under a reserved key. readBlob/writeBlob handle it.
 */
export function readBlob(table, blobKey = 'all') {
  return read(table, blobKey);
}

export function writeBlob(table, data, blobKey = 'all') {
  return write(table, blobKey, data);
}

/**
 * Close the DB (for graceful shutdown / tests).
 */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
    initialized = false;
  }
}
