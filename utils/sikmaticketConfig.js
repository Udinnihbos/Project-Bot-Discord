import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/sikmaticket.json');

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadDB() {
  if (!existsSync(DB_PATH)) { writeFileSync(DB_PATH, JSON.stringify({}, null, 2)); return {}; }
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const DEFAULT_GUILD = {
  ticketCounter: 0,
  staffRoles: [],
  transcriptChannelId: null,
  maxTicketsPerUser: 1,
  panels: [],
  activeTickets: {},   // channelId -> { panelId, typeId, userId, number, openedAt }
};

const DEFAULT_PANEL = {
  id: '',
  name: 'Support Panel',
  description: 'Pilih jenis bantuan yang kamu butuhkan.',
  embedColor: '#5865F2',
  thumbnail: '',
  imageUrl: '',
  footer: '',
  channelId: null,
  messageId: null,
  autoUpdate: false,
  displayType: 'button',  // button | select
  ticketTypes: [],
};

const DEFAULT_TYPE = {
  id: '',
  name: 'General',
  emoji: '🎫',
  description: 'Pertanyaan umum',
  buttonStyle: 'Primary',   // Primary | Secondary | Success | Danger
  categoryId: null,
  mentionRoles: [],
  mentionText: 'Halo {roles}! Ada tiket baru dari {user}.',
  welcomeMessage: 'Halo {user}! Ceritakan masalahmu dan tim kami akan segera membantu.',
  order: 0,
};

// ── Guild ──
export function getGuildConfig(guildId) {
  const db = loadDB();
  return { ...DEFAULT_GUILD, ...(db[guildId] || {}), panels: db[guildId]?.panels || [] };
}

export function updateGuildConfig(guildId, updates) {
  const db = loadDB();
  db[guildId] = { ...DEFAULT_GUILD, ...(db[guildId] || {}), ...updates };
  saveDB(db);
  return db[guildId];
}

// ── Panels ──
export function getPanels(guildId) {
  return getGuildConfig(guildId).panels;
}

export function getPanel(guildId, panelId) {
  return getGuildConfig(guildId).panels.find(p => p.id === panelId) || null;
}

export function addPanel(guildId, overrides = {}) {
  const config = getGuildConfig(guildId);
  const panel = { ...DEFAULT_PANEL, id: generateId(), order: config.panels.length, ...overrides };
  config.panels.push(panel);
  updateGuildConfig(guildId, { panels: config.panels });
  return panel;
}

export function updatePanel(guildId, panelId, updates) {
  const config = getGuildConfig(guildId);
  const idx = config.panels.findIndex(p => p.id === panelId);
  if (idx < 0) return null;
  config.panels[idx] = { ...config.panels[idx], ...updates };
  updateGuildConfig(guildId, { panels: config.panels });
  return config.panels[idx];
}

export function deletePanel(guildId, panelId) {
  const config = getGuildConfig(guildId);
  config.panels = config.panels.filter(p => p.id !== panelId);
  updateGuildConfig(guildId, { panels: config.panels });
}

// ── Ticket Types ──
export function getTicketType(guildId, panelId, typeId) {
  const panel = getPanel(guildId, panelId);
  return panel?.ticketTypes?.find(t => t.id === typeId) || null;
}

export function addTicketType(guildId, panelId, overrides = {}) {
  const config = getGuildConfig(guildId);
  const panelIdx = config.panels.findIndex(p => p.id === panelId);
  if (panelIdx < 0) return null;
  const types = config.panels[panelIdx].ticketTypes || [];
  const newType = { ...DEFAULT_TYPE, id: generateId(), order: types.length, ...overrides };
  types.push(newType);
  config.panels[panelIdx].ticketTypes = types;
  updateGuildConfig(guildId, { panels: config.panels });
  return newType;
}

export function updateTicketType(guildId, panelId, typeId, updates) {
  const config = getGuildConfig(guildId);
  const panelIdx = config.panels.findIndex(p => p.id === panelId);
  if (panelIdx < 0) return null;
  const typeIdx = config.panels[panelIdx].ticketTypes.findIndex(t => t.id === typeId);
  if (typeIdx < 0) return null;
  config.panels[panelIdx].ticketTypes[typeIdx] = { ...config.panels[panelIdx].ticketTypes[typeIdx], ...updates };
  updateGuildConfig(guildId, { panels: config.panels });
  return config.panels[panelIdx].ticketTypes[typeIdx];
}

export function deleteTicketType(guildId, panelId, typeId) {
  const config = getGuildConfig(guildId);
  const panelIdx = config.panels.findIndex(p => p.id === panelId);
  if (panelIdx < 0) return;
  config.panels[panelIdx].ticketTypes = config.panels[panelIdx].ticketTypes.filter(t => t.id !== typeId);
  config.panels[panelIdx].ticketTypes.forEach((t, i) => { t.order = i; });
  updateGuildConfig(guildId, { panels: config.panels });
}

export function reorderTicketType(guildId, panelId, typeId, direction) {
  const config = getGuildConfig(guildId);
  const panelIdx = config.panels.findIndex(p => p.id === panelId);
  if (panelIdx < 0) return;
  const types = config.panels[panelIdx].ticketTypes;
  const idx = types.findIndex(t => t.id === typeId);
  if (idx < 0) return;
  if (direction === 'up' && idx > 0) [types[idx], types[idx - 1]] = [types[idx - 1], types[idx]];
  if (direction === 'down' && idx < types.length - 1) [types[idx], types[idx + 1]] = [types[idx + 1], types[idx]];
  types.forEach((t, i) => { t.order = i; });
  updateGuildConfig(guildId, { panels: config.panels });
}

// ── Active Tickets ──
export function addActiveTicket(guildId, channelId, data) {
  const config = getGuildConfig(guildId);
  config.activeTickets[channelId] = { ...data, openedAt: Date.now() };
  updateGuildConfig(guildId, { activeTickets: config.activeTickets, ticketCounter: (config.ticketCounter || 0) + 1 });
  return config.ticketCounter + 1;
}

export function getActiveTicket(guildId, channelId) {
  return getGuildConfig(guildId).activeTickets?.[channelId] || null;
}

export function removeActiveTicket(guildId, channelId) {
  const config = getGuildConfig(guildId);
  delete config.activeTickets[channelId];
  updateGuildConfig(guildId, { activeTickets: config.activeTickets });
}

export function getUserActiveTickets(guildId, userId) {
  const config = getGuildConfig(guildId);
  return Object.entries(config.activeTickets || {})
    .filter(([, t]) => t.userId === userId)
    .map(([channelId, data]) => ({ channelId, ...data }));
}
