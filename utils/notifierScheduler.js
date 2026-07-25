/**
 * Notifier Scheduler — interval loop to check for new content.
 *
 * Runs every 5 minutes (configurable). For each guild with notifier enabled:
 *   - YouTube: check all subscribed channels, post new videos
 *   - Twitch: check all subscribed streamers, post when they go live
 *
 * State (lastVideoId per creator, liveState per streamer) is stored in
 * guild config to avoid duplicate posts across restarts.
 */

import { EmbedBuilder } from 'discord.js';
import {
  getGuildConfig, updateGuildConfig,
} from './notifierConfig.js';
import {
  getLatestYouTubeVideos,
  getTwitchStreamStatus,
  youtubeConfigured, twitchConfigured,
} from './notifierEngine.js';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let loopTimer = null;
let clientRef = null;

export function startNotifierLoop(client) {
  clientRef = client;
  if (loopTimer) {
    console.log('[notifier] Loop already running.');
    return;
  }
  // Run immediately, then on interval
  tick().catch(e => console.error('[notifier] tick error:', e.message));
  loopTimer = setInterval(() => {
    tick().catch(e => console.error('[notifier] tick error:', e.message));
  }, CHECK_INTERVAL);
  console.log(`⏰ [notifier] Scheduler started (every ${CHECK_INTERVAL / 60_000} min)`);
}

export function stopNotifierLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[notifier] Loop stopped.');
  }
}

async function tick() {
  if (!clientRef?.guilds) return;
  for (const [, guild] of clientRef.guilds.cache) {
    try {
      await processGuild(guild);
    } catch (e) {
      console.error(`[notifier] guild ${guild.id} error:`, e.message);
    }
  }
}

async function processGuild(guild) {
  const config = getGuildConfig(guild.id);
  if (!config.enabled) return;
  if (!config.channelId) return;

  // ── YouTube check ──
  if (config.youtube.enabled && config.youtube.creators.length > 0 && youtubeConfigured()) {
    await checkYouTube(guild, config);
  }

  // ── Twitch check ──
  if (config.twitch.enabled && config.twitch.streamers.length > 0 && twitchConfigured()) {
    await checkTwitch(guild, config);
  }
}

async function checkYouTube(guild, config) {
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const lastIds = { ...config.state.youtube.lastVideoIds };

  for (const creator of config.youtube.creators) {
    try {
      const videos = await getLatestYouTubeVideos(creator, 3);
      const knownLastId = lastIds[creator.id];
      const newVideos = [];

      for (const v of videos) {
        if (v.id === knownLastId) break; // already seen (videos are newest-first)
        newVideos.push(v);
      }

      if (newVideos.length === 0) continue;

      // Post in reverse order (oldest first) so channel feed makes sense
      for (const v of newVideos.reverse()) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle(`🎥 ${v.title.length > 256 ? v.title.slice(0, 253) + '…' : v.title}`)
          .setURL(v.url)
          .setAuthor({ name: creator.name, iconURL: 'https://cdn3.emoji.gg/emojis/2527-youtube.png' })
          .setTimestamp(new Date(v.publishedAt))
          .setFooter({ text: '📺 YouTube Notifier' });

        if (v.thumbnail) embed.setImage(v.thumbnail);

        const content = config.youtube.message
          .replace('{creator}', creator.name)
          .replace('{title}', v.title)
          .replace('{url}', v.url)
          .replace('{thumbnail}', v.thumbnail || '');

        try {
          await channel.send({
            content: content.slice(0, 2000),
            embeds: [embed],
            allowedMentions: { parse: [] }, // no @everyone/@here by default
          });
        } catch (e) {
          console.error(`[notifier] YT send failed for ${creator.name}:`, e.message);
        }
      }

      // Update last seen
      lastIds[creator.id] = videos[0]?.id;
    } catch (e) {
      console.error(`[notifier] YT check failed for ${creator.name}:`, e.message);
    }
  }

  // Persist state
  updateGuildConfig(guild.id, {
    state: { youtube: { lastVideoIds: lastIds }, twitch: config.state.twitch },
  });
}

async function checkTwitch(guild, config) {
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const logins = config.twitch.streamers.map(s => s.login);
  let liveStatuses;
  try {
    liveStatuses = await getTwitchStreamStatus(logins);
  } catch (e) {
    console.error(`[notifier] Twitch API error:`, e.message);
    return;
  }

  const liveStates = { ...config.state.twitch.liveStates };
  const streamerMap = new Map(config.twitch.streamers.map(s => [s.login.toLowerCase(), s]));

  for (const [login, status] of Object.entries(liveStatuses)) {
    const wasLive = liveStates[login] === true;
    const isLive = status.isLive;

    // Post only on transition offline → online
    if (isLive && !wasLive) {
      const streamer = streamerMap.get(login);
      const streamerName = streamer?.name || login;

      const embed = new EmbedBuilder()
        .setColor('#9146ff')
        .setTitle(status.title || '🔴 Live now!')
        .setURL(status.url)
        .setAuthor({ name: streamerName, iconURL: 'https://cdn3.emoji.gg/emojis/2667-twitch.png' })
        .addFields(
          { name: '🎮 Game', value: status.game || 'Unknown', inline: true },
          { name: '👁️ Viewers', value: 'N/A', inline: true },
        )
        .setFooter({ text: '🔴 Twitch Notifier' })
        .setTimestamp();

      if (status.thumbnail) embed.setImage(status.thumbnail);

      const content = config.twitch.message
        .replace('{streamer}', streamerName)
        .replace('{title}', status.title || '')
        .replace('{game}', status.game || '')
        .replace('{url}', status.url);

      try {
        await channel.send({
          content: content.slice(0, 2000),
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
      } catch (e) {
        console.error(`[notifier] Twitch send failed for ${streamerName}:`, e.message);
      }

      liveStates[login] = true;
    } else if (!isLive && wasLive) {
      // Mark as offline (don't post)
      liveStates[login] = false;
    }
    // If wasLive && isLive, do nothing (already posted)
    // If !wasLive && !isLive, do nothing
  }

  // Persist state
  updateGuildConfig(guild.id, {
    state: { youtube: config.state.youtube, twitch: { liveStates } },
  });
}
