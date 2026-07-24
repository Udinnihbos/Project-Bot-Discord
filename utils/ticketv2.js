/**
 * Ticket System V2 — data layer.
 *
 * Schema (per-guild, in SQLite via db.js):
 *
 * ticketv2_panels        (panelId, guildId, data)   — panel definitions
 * ticketv2_tickets       (ticketId, guildId, data)  — active + historical tickets
 * ticketv2_analytics     (guildId, data)            — aggregated stats
 * ticketv2_settings      (guildId, data)            — guild settings (rate limit, auto features)
 *
 * V1 backward compat: existing sikmaticket.json data still works via
 * sikmaticketConfig.js — V2 functions here are independent and additive.
 */

import { read, write, readAll, readObject, readBlob, writeBlob, remove as dbRemove } from './db.js';
import { generateId } from './sikmaticketConfig.js';

// ─── DEFAULT SHAPES ─────────────────────────────────────────

const DEFAULT_PANEL = {
  id: '',
  guildId: '',
  name: 'Support Panel',
  description: 'Pilih kategori bantuan yang kamu butuhkan.',
  color: '#5865F2',
  bannerUrl: '',
  thumbnailUrl: '',
  footerText: '🎫 Ticket System',
  categoryId: null,          // parent category for new ticket channels
  archiveCategoryId: null,   // where closed channels move to (for archive mode)
  logChannelId: null,        // for transcript (later) and analytics
  panelMessageChannelId: null,
  panelMessageId: null,
  displayType: 'button',     // 'button' | 'select'
  staffRoles: [],            // array of role IDs that can see/handle tickets
  allowedUserIds: [],        // optional allowlist; empty = everyone
  cooldownSeconds: 300,      // 5 min between ticket creations per user
  maxTicketsPerUser: 1,      // max active tickets
  autoClaim: false,          // auto-claim first staff who responds
  autoCloseHours: 48,        // auto-close after N hours of inactivity
  reminderHours: 24,         // remind staff after N hours
  ticketTypes: [],           // [{ id, name, emoji, description, buttonStyle, modalFields: [], ... }]
  createdAt: 0,
  updatedAt: 0,
};

const DEFAULT_TICKET_TYPE = {
  id: '',
  name: 'General',
  emoji: '🎫',
  description: 'Pertanyaan umum',
  buttonStyle: 'Primary',     // Primary | Secondary | Success | Danger
  modalFields: [],            // [{ name, label, style, required, placeholder, minLength, maxLength }]
  order: 0,
};

const DEFAULT_TICKET = {
  id: '',
  panelId: '',
  typeId: '',
  guildId: '',
  userId: '',
  channelId: null,
  number: 0,                 // sequential per guild
  status: 'open',            // open | claimed | waiting | closed
  claimedBy: null,           // userId of staff
  subject: '',
  formData: {},              // user input from modal fields
  messagesCount: 0,
  firstResponseAt: null,     // ms epoch when staff first responded
  lastActivityAt: 0,
  closedAt: null,
  closedBy: null,
  closeReason: '',           // solved | user_inactive | spam | other
  closeNote: '',             // staff's note when closing
  rating: null,              // 1-5 user rating
  createdAt: 0,
};

const DEFAULT_SETTINGS = {
  guildId: '',
  totalTickets: 0,
  enableAnalytics: true,
  enableAutoReminder: true,
  enableAutoClose: true,
};

// ─── PANELS ──────────────────────────────────────────────

export function getPanels(guildId) {
  const all = readAll('ticketv2_panels');
  return all.filter(p => p.data.guildId === guildId).map(p => p.data);
}

export function getPanel(guildId, panelId) {
  return read('ticketv2_panels', panelId);
}

export function addPanel(guildId, overrides = {}) {
  const id = generateId();
  const now = Date.now();
  const panel = {
    ...DEFAULT_PANEL,
    ...overrides,
    id,
    guildId,
    ticketTypes: (overrides.ticketTypes || []).map(t => ({ ...DEFAULT_TICKET_TYPE, ...t, id: t.id || generateId() })),
    createdAt: now,
    updatedAt: now,
  };
  write('ticketv2_panels', id, panel);
  return panel;
}

export function updatePanel(guildId, panelId, updates) {
  const current = read('ticketv2_panels', panelId);
  if (!current || current.guildId !== guildId) return null;
  const updated = { ...current, ...updates, updatedAt: Date.now() };
  if (updates.ticketTypes) {
    updated.ticketTypes = updates.ticketTypes.map(t => ({ ...DEFAULT_TICKET_TYPE, ...t, id: t.id || generateId() }));
  }
  write('ticketv2_panels', panelId, updated);
  return updated;
}

export function deletePanel(guildId, panelId) {
  const current = read('ticketv2_panels', panelId);
  if (!current || current.guildId !== guildId) return false;
  // Soft-delete: move to archive
  const archived = { ...current, _archivedAt: Date.now() };
  write('ticketv2_panels_archived', panelId, archived);
  // Remove from active
  dbRemove('ticketv2_panels', panelId);
  return true;
}

// ─── TICKET TYPES ─────────────────────────────────────────

export function getTicketType(panelId, typeId) {
  const panel = read('ticketv2_panels', panelId);
  return panel?.ticketTypes?.find(t => t.id === typeId) || null;
}

export function addTicketType(panelId, overrides) {
  const panel = read('ticketv2_panels', panelId);
  if (!panel) return null;
  const newType = { ...DEFAULT_TICKET_TYPE, id: generateId(), order: panel.ticketTypes.length, ...overrides };
  panel.ticketTypes.push(newType);
  panel.updatedAt = Date.now();
  write('ticketv2_panels', panelId, panel);
  return newType;
}

export function updateTicketType(panelId, typeId, updates) {
  const panel = read('ticketv2_panels', panelId);
  if (!panel) return null;
  const idx = panel.ticketTypes.findIndex(t => t.id === typeId);
  if (idx < 0) return null;
  panel.ticketTypes[idx] = { ...panel.ticketTypes[idx], ...updates };
  panel.updatedAt = Date.now();
  write('ticketv2_panels', panelId, panel);
  return panel.ticketTypes[idx];
}

export function deleteTicketType(panelId, typeId) {
  const panel = read('ticketv2_panels', panelId);
  if (!panel) return;
  panel.ticketTypes = panel.ticketTypes.filter(t => t.id !== typeId);
  panel.ticketTypes.forEach((t, i) => { t.order = i; });
  panel.updatedAt = Date.now();
  write('ticketv2_panels', panelId, panel);
}

// ─── TICKETS ─────────────────────────────────────────────

function getNextTicketNumber(guildId) {
  const settings = getSettings(guildId);
  return (settings.totalTickets || 0) + 1;
}

export function createTicket({ guildId, panelId, typeId, userId, subject = '', formData = {} }) {
  const number = getNextTicketNumber(guildId);
  const id = generateId();
  const now = Date.now();
  const ticket = {
    ...DEFAULT_TICKET,
    id, panelId, typeId, guildId, userId,
    number, subject, formData,
    status: 'open',
    lastActivityAt: now,
    createdAt: now,
  };
  write('ticketv2_tickets', id, ticket);
  // Update counter
  const settings = getSettings(guildId);
  settings.totalTickets = number;
  write('ticketv2_settings', guildId, settings);
  return ticket;
}

export function getTicket(ticketId) {
  return read('ticketv2_tickets', ticketId);
}

export function getTicketByChannelId(channelId) {
  const all = readAll('ticketv2_tickets');
  return all.find(t => t.data.channelId === channelId)?.data || null;
}

export function getActiveTickets(guildId) {
  const all = readAll('ticketv2_tickets');
  return all
    .map(t => t.data)
    .filter(t => t.guildId === guildId && t.status !== 'closed');
}

export function getUserActiveTickets(guildId, userId) {
  return getActiveTickets(guildId).filter(t => t.userId === userId);
}

export function getUserTicketHistory(guildId, userId, limit = 20) {
  const all = readAll('ticketv2_tickets');
  return all
    .map(t => t.data)
    .filter(t => t.guildId === guildId && t.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function getGuildTickets(guildId, { status = null, limit = 50 } = {}) {
  const all = readAll('ticketv2_tickets');
  let tickets = all.map(t => t.data).filter(t => t.guildId === guildId);
  if (status) tickets = tickets.filter(t => t.status === status);
  return tickets.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function updateTicket(ticketId, updates) {
  const current = read('ticketv2_tickets', ticketId);
  if (!current) return null;
  const updated = { ...current, ...updates };
  if (updates.status === 'closed' && !updated.closedAt) updated.closedAt = Date.now();
  write('ticketv2_tickets', ticketId, updated);
  return updated;
}

export function closeTicket(ticketId, { closedBy, reason = '', note = '', rating = null, mode = 'delete' } = {}) {
  const ticket = getTicket(ticketId);
  if (!ticket) return null;
  const updates = {
    status: 'closed',
    closedBy,
    closeReason: reason,
    closeNote: note,
    rating,
    closedAt: Date.now(),
  };
  // mode determines what happens to the channel (handled by caller)
  return updateTicket(ticketId, updates);
}

export function claimTicket(ticketId, staffUserId) {
  return updateTicket(ticketId, { status: 'claimed', claimedBy: staffUserId });
}

export function recordStaffResponse(ticketId) {
  const ticket = getTicket(ticketId);
  if (!ticket) return;
  const updates = {};
  if (!ticket.firstResponseAt) updates.firstResponseAt = Date.now();
  updates.lastActivityAt = Date.now();
  updateTicket(ticketId, updates);
}

export function incrementMessageCount(ticketId) {
  const ticket = getTicket(ticketId);
  if (!ticket) return;
  updateTicket(ticketId, {
    messagesCount: (ticket.messagesCount || 0) + 1,
    lastActivityAt: Date.now(),
  });
}

// ─── SETTINGS ────────────────────────────────────────────

export function getSettings(guildId) {
  let s = read('ticketv2_settings', guildId);
  if (!s) {
    s = { ...DEFAULT_SETTINGS, guildId };
    write('ticketv2_settings', guildId, s);
  }
  return s;
}

export function saveSettings(guildId, updates) {
  const current = getSettings(guildId);
  const updated = { ...current, ...updates };
  write('ticketv2_settings', guildId, updated);
  return updated;
}

// ─── ANALYTICS ───────────────────────────────────────────

export function getAnalytics(guildId) {
  return read('ticketv2_analytics', guildId) || {
    guildId,
    totalCreated: 0,
    totalClosed: 0,
    avgResponseTimeMs: null,
    avgLifetimeMs: null,
    byReason: {},
    byHelper: {},        // userId -> count
    byDay: {},           // YYYY-MM-DD -> count
    byHour: {},          // 0-23 -> count
  };
}

export function recordTicketCreated(guildId) {
  const a = getAnalytics(guildId);
  a.totalCreated = (a.totalCreated || 0) + 1;
  const day = new Date().toISOString().split('T')[0];
  a.byDay[day] = (a.byDay[day] || 0) + 1;
  const hour = new Date().getHours();
  a.byHour[hour] = (a.byHour[hour] || 0) + 1;
  write('ticketv2_analytics', guildId, a);
}

export function recordTicketClosed(guildId, ticket) {
  const a = getAnalytics(guildId);
  a.totalClosed = (a.totalClosed || 0) + 1;
  // Reason breakdown
  if (ticket.closeReason) {
    a.byReason[ticket.closeReason] = (a.byReason[ticket.closeReason] || 0) + 1;
  }
  // Helper breakdown
  if (ticket.claimedBy) {
    a.byHelper[ticket.claimedBy] = (a.byHelper[ticket.claimedBy] || 0) + 1;
  }
  // Avg response time (only if first response was set)
  if (ticket.firstResponseAt && ticket.createdAt) {
    const responseMs = ticket.firstResponseAt - ticket.createdAt;
    const total = a.totalClosed || 1;
    a.avgResponseTimeMs = a.avgResponseTimeMs
      ? Math.round((a.avgResponseTimeMs * (total - 1) + responseMs) / total)
      : responseMs;
  }
  // Avg lifetime
  if (ticket.closedAt && ticket.createdAt) {
    const lifeMs = ticket.closedAt - ticket.createdAt;
    const total = a.totalClosed || 1;
    a.avgLifetimeMs = a.avgLifetimeMs
      ? Math.round((a.avgLifetimeMs * (total - 1) + lifeMs) / total)
      : lifeMs;
  }
  write('ticketv2_analytics', guildId, a);
}

// ─── MIGRATION FROM V1 ───────────────────────────────────

/**
 * One-time migration: import existing sikmaticket data into V2 format.
 * Safe to call multiple times — checks _migrated flag.
 */
export function migrateFromV1(guildId) {
  const settings = getSettings(guildId);
  if (settings._v1Migrated) return { migrated: 0, skipped: true };

  const v1Config = read('sikmaticket', guildId);
  if (!v1Config || (!v1Config.panels?.length && !v1Config.activeTickets && Object.keys(v1Config).length <= 6)) {
    settings._v1Migrated = true;
    write('ticketv2_settings', guildId, settings);
    return { migrated: 0, skipped: false };
  }

  // Migrate panels
  const existingV2Panels = getPanels(guildId).filter(p => p._fromV1);
  const existingV2PanelNames = new Set(existingV2Panels.map(p => p.name));

  for (const v1Panel of (v1Config.panels || [])) {
    if (existingV2PanelNames.has(v1Panel.name)) continue;
    const v2Panel = addPanel(guildId, {
      name: v1Panel.name,
      description: v1Panel.description,
      color: v1Panel.embedColor || '#5865F2',
      bannerUrl: v1Panel.imageUrl,
      footerText: v1Panel.footer,
      categoryId: v1Panel.channelId ? null : null,  // V1 didn't have category concept
      displayType: v1Panel.displayType || 'button',
      staffRoles: [],
      ticketTypes: (v1Panel.ticketTypes || []).map(t => ({
        name: t.name,
        emoji: t.emoji,
        description: t.description,
        buttonStyle: t.buttonStyle,
        modalFields: [],  // V1 didn't have modal fields
        order: t.order,
      })),
      _fromV1: true,
    });
  }

  // Migrate active tickets
  let ticketCount = 0;
  for (const [channelId, t] of Object.entries(v1Config.activeTickets || {})) {
    const ticket = createTicket({
      guildId,
      panelId: null,
      typeId: null,
      userId: t.userId,
      subject: t.subject || '',
      formData: { _fromV1ChannelId: channelId },
    });
    // Update with channel info
    updateTicket(ticket.id, { channelId, number: t.number });
    ticketCount++;
  }

  // Migrate counter
  if (v1Config.ticketCounter) {
    settings.totalTickets = (settings.totalTickets || 0) + v1Config.ticketCounter;
  }

  settings._v1Migrated = true;
  write('ticketv2_settings', guildId, settings);
  return { migrated: 1 + ticketCount, skipped: false };
}
