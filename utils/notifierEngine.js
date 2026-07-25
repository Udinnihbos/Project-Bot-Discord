/**
 * Notifier Engine — API integrations for YouTube and Twitch.
 *
 * YouTube Data API v3 (free tier: 10,000 units/day):
 *   - channels.list: 1 unit per call
 *   - playlistItems.list: 1 unit per call
 *   - search.list: 100 units per call (avoid)
 *   - videos.list: 1 unit per call
 *
 * Twitch Helix API (free with OAuth):
 *   - streams (get user status): 1 request per call (max 100 logins per call)
 *
 * Setup:
 *   YOUTUBE_API_KEY=AIza...        (Google Cloud Console → YouTube Data API v3)
 *   TWITCH_CLIENT_ID=xxxxx          (Twitch Dev Console)
 *   TWITCH_CLIENT_SECRET=xxxxx      (Twitch Dev Console)
 */

// ─────────────────────────────────────────────
// YOUTUBE
// ─────────────────────────────────────────────

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Resolve a YouTube channel ID from various URL formats / handles.
 * Returns { id, type: 'channel'|'playlist', name } or null.
 *
 * Accepts:
 *   - Channel ID (UC...) → returns as channel
 *   - Handle (@username) → resolves to channel ID
 *   - Custom URL (c/username) → resolves to channel ID
 *   - Channel URL (youtube.com/channel/UC...) → channel
 *   - User URL (youtube.com/user/username) → resolves
 *   - Playlist ID (UU... = uploads playlist, PL... = any playlist)
 *   - Playlist URL
 */
export async function resolveYouTubeId(input) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY belum diset di .env');

  const cleaned = input.trim();

  // Direct channel ID
  if (/^UC[\w-]{20,}$/.test(cleaned)) {
    return await fetchYouTubeChannel(cleaned, apiKey);
  }

  // Uploads playlist (UU...)
  if (/^UU[\w-]{20,}$/.test(cleaned)) {
    const channelId = cleaned.replace(/^UU/, 'UC');
    const ch = await fetchYouTubeChannel(channelId, apiKey);
    if (ch) return { ...ch, type: 'playlist' };
  }

  // Generic playlist (PL..., OL..., FL...)
  if (/^(PL|OL|FL|UU|LL)[\w-]+$/.test(cleaned)) {
    return await fetchYouTubePlaylist(cleaned, apiKey);
  }

  // Handle (@username) or URL
  const handleMatch = cleaned.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (handleMatch) {
    return await resolveYouTubeHandle(handleMatch[1], apiKey);
  }

  // Custom URL (c/username) or User URL
  const customMatch = cleaned.match(/(?:youtube\.com\/(?:c|user)\/)([\w.-]+)/);
  if (customMatch) {
    return await resolveYouTubeUsername(customMatch[1], apiKey);
  }

  // Channel URL
  const chMatch = cleaned.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (chMatch) {
    return await fetchYouTubeChannel(chMatch[1], apiKey);
  }

  // Playlist URL
  const plMatch = cleaned.match(/youtube\.com\/playlist\?list=([\w-]+)/);
  if (plMatch) {
    return await fetchYouTubePlaylist(plMatch[1], apiKey);
  }

  throw new Error('Format tidak dikenali. Gunakan Channel ID (UC...), @handle, atau URL YouTube.');
}

async function resolveYouTubeHandle(handle, apiKey) {
  const url = `${YT_BASE}/channels?part=snippet&forHandle=${encodeURIComponent('@' + handle)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${res.status}`);
  }
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Channel @${handle} tidak ditemukan.`);
  const item = data.items[0];
  return {
    id: item.id,
    type: 'channel',
    name: item.snippet.title,
  };
}

async function resolveYouTubeUsername(username, apiKey) {
  const url = `${YT_BASE}/channels?part=snippet&forUsername=${encodeURIComponent(username)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${res.status}`);
  }
  const data = await res.json();
  if (!data.items?.length) throw new Error(`User "${username}" tidak ditemukan.`);
  const item = data.items[0];
  return {
    id: item.id,
    type: 'channel',
    name: item.snippet.title,
  };
}

async function fetchYouTubeChannel(channelId, apiKey) {
  const url = `${YT_BASE}/channels?part=snippet,contentDetails&id=${channelId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${res.status}`);
  }
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Channel ${channelId} tidak ditemukan.`);
  const item = data.items[0];
  // Use the uploads playlist for fetching latest videos
  const uploadsPlaylist = item.contentDetails?.relatedPlaylists?.uploads;
  return {
    id: uploadsPlaylist || channelId,
    type: uploadsPlaylist ? 'playlist' : 'channel',
    name: item.snippet.title,
  };
}

async function fetchYouTubePlaylist(playlistId, apiKey) {
  const url = `${YT_BASE}/playlists?part=snippet&id=${playlistId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${res.status}`);
  }
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Playlist ${playlistId} tidak ditemukan (atau private).`);
  const item = data.items[0];
  return {
    id: playlistId,
    type: 'playlist',
    name: `📋 ${item.snippet.title}`,
  };
}

/**
 * Get latest videos from a channel/playlist.
 * Returns array of { id, title, url, thumbnail, publishedAt } (max 5).
 */
export async function getLatestYouTubeVideos(creator, maxResults = 5) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY belum diset di .env');

  let playlistId;
  if (creator.type === 'playlist') {
    playlistId = creator.id;
  } else {
    // Need to fetch uploads playlist first
    const ch = await fetchYouTubeChannel(creator.id, apiKey);
    if (!ch) return [];
    playlistId = ch.id;
  }

  const url = `${YT_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${res.status}`);
  }
  const data = await res.json();

  return (data.items || []).map(item => ({
    id: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    url: `https://youtu.be/${item.snippet.resourceId.videoId}`,
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    publishedAt: item.snippet.publishedAt,
  })).filter(v => v.id); // filter out placeholder/deleted
}

// ─────────────────────────────────────────────
// TWITCH
// ─────────────────────────────────────────────

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API = 'https://api.twitch.tv/helix';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get app access token (cached).
 */
async function getTwitchToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET belum diset di .env');

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return { token: cachedToken, clientId };
  }

  const res = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Twitch token error: ${res.status}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return { token: cachedToken, clientId };
}

/**
 * Get live status for streamers. Returns map { login: { isLive, title, game, url, thumbnail } }
 * Max 100 logins per call.
 */
export async function getTwitchStreamStatus(logins) {
  if (!logins.length) return {};
  const { token, clientId } = await getTwitchToken();

  const params = new URLSearchParams();
  for (const login of logins) params.append('user_login', login);

  const res = await fetch(`${TWITCH_API}/streams?${params}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      // Token expired, reset
      cachedToken = null;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Twitch API error: ${res.status}`);
  }
  const data = await res.json();

  const result = {};
  for (const login of logins) {
    result[login] = { isLive: false };
  }
  for (const stream of (data.data || [])) {
    const login = stream.user_login?.toLowerCase();
    if (!login) continue;
    result[login] = {
      isLive: true,
      title: stream.title,
      game: stream.game_name,
      url: `https://twitch.tv/${login}`,
      thumbnail: stream.thumbnail_url?.replace('{width}', '640').replace('{height}', '360'),
    };
  }
  return result;
}

/**
 * Check if YouTube is configured.
 */
export function youtubeConfigured() {
  return !!process.env.YOUTUBE_API_KEY;
}

/**
 * Check if Twitch is configured.
 */
export function twitchConfigured() {
  return !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}
