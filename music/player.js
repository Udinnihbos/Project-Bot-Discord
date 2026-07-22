import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { existsSync, readFileSync } from 'fs';
import { resolveTracks, initExtractors } from './extractors.js';
import { getGuildState, patchGuildState } from './state.js';

const SPOTIFY_PATH_HINT = 'data/spotify-auth.json';

// ── in-memory registry of live AudioPlayer/Connection per guild ──
const live = new Map(); // guildId -> { player, connection, textChannel }

function getLive(guildId) { return live.get(guildId) || null; }
function setLive(guildId, obj) { live.set(guildId, obj); }
function dropLive(guildId) { live.delete(guildId); }

function formatDuration(sec) {
  if (!sec || sec < 0) return 'LIVE';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── emit "now playing" update event to listeners (commands will subscribe) ──
const listeners = new Set();
export function onPlayerEvent(handler) { listeners.add(handler); return () => listeners.delete(handler); }
async function emit(event) {
  for (const fn of listeners) {
    try { await fn(event); } catch (e) { console.error('Listener error:', e.message); }
  }
}

// ── connection helpers ──
async function ensureConnection(guild, voiceChannel) {
  let conn = getVoiceConnection(guild.id);
  if (conn && conn.joinConfig.channelId === voiceChannel.id) return conn;
  if (conn) {
    try { conn.destroy(); } catch {}
  }
  conn = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  await entersState(conn, VoiceConnectionStatus.Ready, 15_000).catch(() => null);
  return conn;
}

// ── build a fresh AudioPlayer wired to queue advance ──
function buildPlayer(guildId) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  player.on(AudioPlayerStatus.Idle, () => {
    // Song finished — advance queue
    const live0 = getLive(guildId);
    if (!live0) return;
    const state = getGuildState(guildId);

    if (state.loop === 'song' && state.currentSong) {
      // requeue current
      state.queue.unshift(state.currentSong);
    } else if (state.loop === 'queue' && state.currentSong) {
      // move to end
      state.queue.push(state.currentSong);
    }

    state.currentSong = null;
    advance(guildId).catch(e => console.error('advance err:', e.message));
  });

  player.on('error', (err) => {
    console.error(`[${guildId}] player error:`, err.message);
    const state = getGuildState(guildId);
    state.currentSong = null;
    advance(guildId).catch(() => {});
  });

  return player;
}

// ── advance to next song (or pause if empty) ──
async function advance(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return;
  const state = getGuildState(guildId);

  if (!state.queue.length) {
    emit({ type: 'queueEmpty', guildId });
    return;
  }

  const next = state.queue.shift();
  state.currentSong = next;
  patchGuildState(guildId, state);

  try {
    await initExtractors();
    let stream;
    try {
      stream = await playdl.stream(next.url, { quality: 2 });
    } catch (e) {
      // fallback: lower quality
      stream = await playdl.stream(next.url, { quality: 0 });
    }
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(Math.max(0, Math.min(2, (state.volume ?? 100) / 100)));

    live0.player.play(resource);

    emit({ type: 'songStart', guildId, song: next, state });
  } catch (err) {
    console.error('Stream error:', err.message);
    // skip to next on failure
    setTimeout(() => advance(guildId), 1000);
  }
}

// ════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════

/**
 * Connect to voice + start playing the queue (or the first song if queue empty).
 */
export async function startPlayback({ guild, voiceChannel, textChannel, initialQuery, requestedBy }) {
  const state = getGuildState(guild.id);
  state.textChannelId = textChannel.id;
  state.voiceChannelId = voiceChannel.id;

  // ensure connection
  const connection = await ensureConnection(guild, voiceChannel);

  // ensure live player
  let live0 = getLive(guild.id);
  if (!live0) {
    const player = buildPlayer(guild.id);
    connection.subscribe(player);
    live0 = { player, connection, textChannel };
    setLive(guild.id, live0);

    // connection disconnect handler
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        // truly disconnected
        dropLive(guild.id);
        emit({ type: 'disconnected', guildId: guild.id });
      }
    });
  } else {
    live0.textChannel = textChannel;
  }

  if (initialQuery) {
    const tracks = await resolveTracks(initialQuery, requestedBy, { limit: 25 });
    state.queue.push(...tracks);
    patchGuildState(guild.id, state);
    emit({ type: 'tracksAdded', guildId: guild.id, tracks, state });
  }

  if (!state.currentSong) {
    await advance(guild.id);
  } else {
    emit({ type: 'songStart', guildId: guild.id, song: state.currentSong, state });
  }

  return { state, player: live0.player, connection };
}

export function skip(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return false;
  live0.player.stop(); // triggers Idle -> advance
  return true;
}

export function pause(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return false;
  if (live0.player.state.status === AudioPlayerStatus.Playing) {
    live0.player.pause();
    return true;
  }
  return false;
}

export function resume(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return false;
  if (live0.player.state.status === AudioPlayerStatus.Paused) {
    live0.player.unpause();
    return true;
  }
  return false;
}

export function stop(guildId) {
  const live0 = getLive(guildId);
  const state = getGuildState(guildId);
  state.queue = [];
  state.currentSong = null;
  patchGuildState(guildId, state);
  if (live0) {
    live0.player.stop();
    // destroy connection so we actually leave VC
    try { live0.connection.destroy(); } catch {}
    dropLive(guildId);
    emit({ type: 'stopped', guildId });
  }
}

/**
 * Enqueue pre-resolved tracks to a guild's queue.
 * If nothing is currently playing, advances to the first track.
 * Returns the updated state.
 */
export async function enqueueTracks({ guild, voiceChannel, textChannel, tracks, requestedBy }) {
  if (!tracks.length) throw new Error('Tidak ada lagu untuk di-enqueue.');

  const state = getGuildState(guild.id);
  state.textChannelId = textChannel.id;
  state.voiceChannelId = voiceChannel.id;
  if (requestedBy) state._requestedById = requestedBy;

  const connection = await ensureConnection(guild, voiceChannel);

  let live0 = getLive(guild.id);
  if (!live0) {
    const player = buildPlayer(guild.id);
    connection.subscribe(player);
    live0 = { player, connection, textChannel };
    setLive(guild.id, live0);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        dropLive(guild.id);
        emit({ type: 'disconnected', guildId: guild.id });
      }
    });
  } else {
    live0.textChannel = textChannel;
  }

  state.queue.push(...tracks);
  patchGuildState(guild.id, state);
  emit({ type: 'tracksAdded', guildId: guild.id, tracks, state });

  if (!state.currentSong) {
    await advance(guild.id);
  } else {
    emit({ type: 'songStart', guildId: guild.id, song: state.currentSong, state });
  }

  return getGuildState(guild.id);
}

export function setLoop(guildId, mode) {
  if (!['off', 'song', 'queue'].includes(mode)) return false;
  const state = getGuildState(guildId);
  state.loop = mode;
  patchGuildState(guildId, state);
  return mode;
}

export function setVolume(guildId, vol) {
  const v = Math.max(0, Math.min(200, Math.round(vol)));
  const state = getGuildState(guildId);
  state.volume = v;
  patchGuildState(guildId, state);
  const live0 = getLive(guildId);
  if (live0) {
    const resource = live0.player.state.resource;
    if (resource?.volume) resource.volume.setVolume(v / 100);
  }
  return v;
}

export function shuffle(guildId) {
  const state = getGuildState(guildId);
  if (state.queue.length < 2) return false;
  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }
  patchGuildState(guildId, state);
  return true;
}

export function getPlayerStatus(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return { connected: false, status: 'disconnected' };
  return { connected: true, status: live0.player.state.status };
}

export function isPaused(guildId) {
  const live0 = getLive(guildId);
  if (!live0) return false;
  return live0.player.state.status === AudioPlayerStatus.Paused;
}

export function is247(guildId) {
  // 24/7 mode lives in music-config.json — read directly to avoid circular dep
  try {
    const path = new URL('../data/music-config.json', import.meta.url);
    if (!existsSync(path)) return false;
    const cfg = JSON.parse(readFileSync(path, 'utf8'));
    return cfg[guildId]?.['247'] === true;
  } catch { return false; }
}

export { formatDuration };
