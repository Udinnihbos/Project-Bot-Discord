/**
 * Ticket V2 — Auto-feature scheduler.
 *
 * Runs every minute:
 *   - Auto-close: tickets with lastActivityAt older than panel.autoCloseHours
 *   - Auto-reminder: tickets without firstResponseAt older than panel.reminderHours
 *
 * State (to avoid spamming):
 *   - per-ticket `_remindedAt` flag is set on the ticket after reminder sent
 *   - auto-close sets status='closed' so it doesn't re-fire
 */

import { EmbedBuilder } from 'discord.js';
import {
  getActiveTickets, getPanel,
  updateTicket, closeTicket,
  getSettings, recordTicketClosed,
} from './ticketv2.js';

const ACCENT = '#5865F2';
const WARN = '#f39c12';
const MUTED = '#95a5a6';

function hexToInt(hex) { return parseInt(String(hex || ACCENT).replace('#', ''), 16); }

let loopTimer = null;
let clientRef = null;

export function startAutoFeatureLoop(client) {
  clientRef = client;
  if (loopTimer) {
    console.log('[tv2-auto] Loop already running.');
    return;
  }
  // Run every 60 seconds
  loopTimer = setInterval(() => {
    tick(client).catch(e => console.error('[tv2-auto] tick error:', e.message));
  }, 60_000);
  console.log('⏰ [tv2-auto] Auto-feature loop started (60s interval)');
}

export function stopAutoFeatureLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[tv2-auto] Loop stopped.');
  }
}

async function tick(client) {
  // Iterate each guild the bot is in
  if (!client.guilds) return;
  for (const [, guild] of client.guilds.cache) {
    await processGuild(guild);
  }
}

async function processGuild(guild) {
  const guildId = guild.id;
  const settings = getSettings(guildId);
  const tickets = getActiveTickets(guildId);
  if (tickets.length === 0) return;

  for (const ticket of tickets) {
    try {
      const panel = getPanel(guildId, ticket.panelId);
      if (!panel) continue; // orphaned ticket

      // ── Auto-close ──
      if (settings.enableAutoClose !== false && panel.autoCloseHours > 0) {
        const sinceActivity = Date.now() - (ticket.lastActivityAt || ticket.createdAt);
        if (sinceActivity >= panel.autoCloseHours * 3600_000) {
          await autoCloseTicket(guild, ticket, panel);
          continue; // don't run reminder after close
        }
      }

      // ── Auto-reminder ──
      if (settings.enableAutoReminder !== false && panel.reminderHours > 0 && !ticket.firstResponseAt) {
        const sinceCreated = Date.now() - ticket.createdAt;
        if (sinceCreated >= panel.reminderHours * 3600_000) {
          // Check if we already reminded (use _remindedAt on ticket)
          if (!ticket._remindedAt) {
            await sendReminder(guild, ticket, panel);
            updateTicket(ticket.id, { _remindedAt: Date.now() });
          }
        }
      }
    } catch (e) {
      console.error(`[tv2-auto] ticket ${ticket.id} error:`, e.message);
    }
  }
}

async function autoCloseTicket(guild, ticket, panel) {
  // Mark closed
  const closed = closeTicket(ticket.id, {
    closedBy: 'auto',
    reason: 'inactive',
    note: `Auto-closed after ${panel.autoCloseHours}h of inactivity`,
  });
  if (!closed) {
    // Already closed by another process — skip analytics + embed
    return;
  }

  // Analytics
  const settings = getSettings(guild.id);
  if (settings.enableAnalytics !== false) {
    recordTicketClosed(guild.id, closed);
  }

  // Post embed in ticket channel
  const channel = guild.channels.cache.get(ticket.channelId)
    || await guild.channels.fetch(ticket.channelId).catch(() => null);

  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(hexToInt(MUTED))
      .setTitle('⏰ Tiket Auto-Closed')
      .setDescription(
        `Tiket ini auto-close karena tidak ada aktivitas selama **${panel.autoCloseHours} jam**.\n` +
        `Channel akan dihapus dalam **5 detik**...`
      )
      .addFields(
        { name: '👤 Pembuat', value: `<@${ticket.userId}>`, inline: true },
        { name: '🔢 Tiket', value: `#${ticket.number}`, inline: true },
        { name: '🕐 Inaktif sejak', value: `<t:${Math.floor((ticket.lastActivityAt || ticket.createdAt) / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: '🎫 Auto-close • Ticket V2' })
      .setTimestamp();
    try {
      await channel.send({ embeds: [embed] });
      setTimeout(() => channel.delete().catch(() => {}), 5000);
    } catch (e) {
      console.error('[tv2-auto] send auto-close embed failed:', e.message);
    }
  }
}

async function sendReminder(guild, ticket, panel) {
  const channel = guild.channels.cache.get(ticket.channelId)
    || await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel) return;

  const hours = panel.reminderHours;
  const embed = new EmbedBuilder()
    .setColor(hexToInt(WARN))
    .setTitle('🔔 Reminder: Tiket Belum Ditangani')
    .setDescription(
      `Tiket ini sudah terbuka selama **${hours} jam** dan belum ada respon dari staff.\n` +
      `Mohon dicek ya! 🙏`
    )
    .addFields(
      { name: '👤 Pembuat', value: `<@${ticket.userId}>`, inline: true },
      { name: '🔢 Tiket', value: `#${ticket.number}`, inline: true },
      { name: '🕐 Dibuat', value: `<t:${Math.floor(ticket.createdAt / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: '🎫 Auto-reminder • Ticket V2' })
    .setTimestamp();

  // Build mention: ticket owner + staff roles
  const mentions = [`<@${ticket.userId}>`];
  if (panel.staffRoles?.length) {
    mentions.push(...panel.staffRoles.map(r => `<@&${r}>`));
  }
  const content = `🔔 **Reminder untuk tiket** — ${mentions.join(' ')}`;

  try {
    await channel.send({ content, embeds: [embed], allowedMentions: { parse: ['users', 'roles'] } });
  } catch (e) {
    console.error('[tv2-auto] send reminder failed:', e.message);
  }
}
