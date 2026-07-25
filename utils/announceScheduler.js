/**
 * Announce Scheduler — interval loop to post scheduled messages.
 *
 * Runs every minute. For each guild with scheduled messages:
 *   - Once: post + remove
 *   - Daily: post + reschedule to next day (same HH:MM)
 *   - Weekly: post + reschedule to next week (same day, HH:MM)
 *
 * Timezone: Asia/Jakarta (WIB) for all scheduling logic.
 */

import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, removeScheduled, addHistory } from './announceConfig.js';
import { renderAnnounce, canUseAnnounce } from './announceRenderer.js';
import { nowWIB } from './announceVars.js';

let loopTimer = null;
let clientRef = null;

export function startAnnounceScheduler(client) {
  clientRef = client;
  if (loopTimer) {
    console.log('[announce-sched] Loop already running.');
    return;
  }
  loopTimer = setInterval(() => {
    tick().catch(e => console.error('[announce-sched] tick error:', e.message));
  }, 60_000); // every minute
  console.log('⏰ [announce-sched] Announce scheduler started (60s interval)');
}

export function stopAnnounceScheduler() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[announce-sched] Loop stopped.');
  }
}

async function tick() {
  if (!clientRef?.guilds) return;
  for (const [, guild] of clientRef.guilds.cache) {
    try {
      await processGuild(guild);
    } catch (e) {
      console.error(`[announce-sched] guild ${guild.id} error:`, e.message);
    }
  }
}

async function processGuild(guild) {
  const config = getGuildConfig(guild.id);
  if (!config.scheduled?.length) return;
  const now = Date.now();

  for (const entry of config.scheduled) {
    if (entry.when > now) continue; // not yet

    // Post
    const success = await postScheduled(guild, entry);
    if (!success) {
      removeScheduled(guild.id, entry.id);
      continue;
    }

    if (entry.type === 'once') {
      removeScheduled(guild.id, entry.id);
    } else if (entry.type === 'daily') {
      // Reschedule to next day, same HH:MM WIB
      const next = computeNextDaily(entry.when);
      const updated = { ...entry, when: next, lastSent: now };
      const newList = config.scheduled.map(s => s.id === entry.id ? updated : s);
      const { updateGuildConfig } = await import('./announceConfig.js');
      updateGuildConfig(guild.id, { scheduled: newList });
    } else if (entry.type === 'weekly') {
      const next = computeNextWeekly(entry.when);
      const updated = { ...entry, when: next, lastSent: now };
      const newList = config.scheduled.map(s => s.id === entry.id ? updated : s);
      const { updateGuildConfig } = await import('./announceConfig.js');
      updateGuildConfig(guild.id, { scheduled: newList });
    }
  }
}

function computeNextDaily(prevTimestamp) {
  // Add 24 hours
  return prevTimestamp + 24 * 60 * 60 * 1000;
}

function computeNextWeekly(prevTimestamp) {
  return prevTimestamp + 7 * 24 * 60 * 60 * 1000;
}

async function postScheduled(guild, entry) {
  try {
    // Render embed from entry.content
    const embed = renderAnnounce(entry.content, { guild });
    const content = entry.pingEveryone ? '@everyone' : null;

    // Post to first channel (scheduled entries have one channel typically)
    const channelId = entry.channelIds?.[0];
    if (!channelId) return false;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return false;

    await channel.send({
      content: content?.slice(0, 2000) || undefined,
      embeds: [embed],
      allowedMentions: { parse: content ? ['everyone'] : [] },
    });

    // Add to history
    addHistory(guild.id, {
      id: entry.id,
      title: entry.content.title,
      sentAt: Date.now(),
      sentBy: entry.createdBy,
      channelIds: entry.channelIds,
      scheduled: true,
    });

    return true;
  } catch (e) {
    console.error(`[announce-sched] post failed for entry ${entry.id}:`, e.message);
    return false;
  }
}
