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

export function removeFromQueue(guildId, index) {
  const state = getGuildState(guildId);
  if (index < 0 || index >= state.queue.length) return null;
  const removed = state.queue.splice(index, 1)[0];
  patchGuildState(guildId, state);
  return removed;
}

export function moveInQueue(guildId, fromIdx, toIdx) {
  const state = getGuildState(guildId);
  if (fromIdx < 0 || fromIdx >= state.queue.length) return false;
  if (toIdx < 0 || toIdx >= state.queue.length) return false;
  const [item] = state.queue.splice(fromIdx, 1);
  state.queue.splice(toIdx, 0, item);
  patchGuildState(guildId, state);
  return true;
}

export function clearQueue(guildId) {
  const state = getGuildState(guildId);
  const count = state.queue.length;
  state.queue = [];
  patchGuildState(guildId, state);
  return count;
}

/**
 * Jump to track at index (1-based). The current track is stopped, the
 * target track becomes the new "current", and everything between is
 * removed.
 */
export async function jumpTo(guildId, index) {
  const state = getGuildState(guildId);
  if (index < 1 || index > state.queue.length) return false;
  // Take tracks 0..index-1, set them as new queue
  // The track at index-1 becomes the "current" after advance
  const targetIdx = index - 1;
  const before = state.queue.slice(0, targetIdx);
  state.queue = before;
  patchGuildState(guildId, state);
  // skip current — advance() will pick the target as next
  const live0 = getLive(guildId);
  if (live0) {
    live0.player.stop(); // triggers Idle -> advance
  }
  return true;
}

/**
 * Seek to a position in the currently playing track (in seconds).
 *
 * Re-streams the song via play-dl with seek option, then plays
 * from the new offset. If play-dl doesn't support seek for the
 * given source, returns { ok: false, reason }.
 */
export async function seek(guildId, seconds) {
  const live0 = getLive(guildId);
  if (!live0) return { ok: false, reason: 'Tidak ada playback aktif.' };
  const state = getGuildState(guildId);
  if (!state.currentSong) return { ok: false, reason: 'Tidak ada lagu yang sedang diputar.' };

  const total = state.currentSong.duration || 0;
  if (total && seconds > total) seconds = total;
  if (seconds < 0) seconds = 0;

  try {
    await initExtractors();
    let stream;
    try {
      stream = await playdl.stream(state.currentSong.url, { quality: 2, seek: seconds });
    } catch (e) {
      return { ok: false, reason: 'Seek belum didukung untuk source ini.' };
    }
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(Math.max(0, Math.min(2, (state.volume ?? 100) / 100)));
    live0.player.play(resource);
    return { ok: true, position: seconds };
  } catch (err) {
    return { ok: false, reason: 'Seek gagal: ' + (err.message?.slice(0, 100) || 'unknown') };
  }
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

/**
 * Parse a position string like "1:30" or "90" or "1h30m" into seconds.
 * Returns null if unparseable.
 *
 * Supported formats:
 *   90         → 90 seconds
 *   1:30       → 1 minute 30 seconds
 *   1:30:45    → 1 hour 30 min 45 sec
 *   1h30m      → 1 hour 30 min
 *   2m30s      → 2 min 30 sec
 */
export function parsePosition(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Math.max(0, Math.floor(input));
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  // Pure number = seconds
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // h/m/s patterns: 1h30m, 90s, 2m30s
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
  if (hms.test(s)) {
    const m = s.match(hms);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    const h = parseInt(m[1] || '0', 10);
    const min = parseInt(m[2] || '0', 10);
    const sec = parseInt(m[3] || '0', 10);
    return h * 3600 + min * 60 + sec;
  }
  // Colon format: 1:30 or 1:30:45
  const colon = s.split(':').map(p => p.trim());
  if (colon.every(p => /^\d+$/.test(p))) {
    const nums = colon.map(p => parseInt(p, 10));
    if (nums.length === 2) return nums[0] * 60 + nums[1];
    if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return null;
}
