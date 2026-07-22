import playdl from 'play-dl';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let initialized = false;

/**
 * Initialize play-dl with optional YouTube cookies & Spotify credentials.
 * Safe to call multiple times — only runs once.
 */
export async function initExtractors() {
  if (initialized) return;
  initialized = true;

  // YouTube cookies (helps bypass bot detection on heavy servers)
  const cookiePath = join(__dirname, '../data/yt-cookies.txt');
  if (existsSync(cookiePath)) {
    try {
      const raw = readFileSync(cookiePath, 'utf8').trim();
      const clean = raw
        .replace(/[\r\n]+/g, '; ')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/;\s*;/g, ';')
        .trim();
      if (clean.length) {
        await playdl.setToken({ youtube: { cookie: clean } });
        console.log('🎵 YouTube cookies loaded');
      }
    } catch (e) {
      console.warn('⚠️  YouTube cookies failed:', e.message);
    }
  }

  // Spotify (optional)
  const spotifyPath = join(__dirname, '../data/spotify-auth.json');
  if (existsSync(spotifyPath)) {
    try {
      const s = JSON.parse(readFileSync(spotifyPath, 'utf8'));
      if (s.client_id && s.client_id !== 'ISI_CLIENT_ID_DISINI' &&
          s.refresh_token && s.refresh_token !== 'ISI_REFRESH_TOKEN_DISINI') {
        await playdl.setToken({
          spotify: {
            client_id: s.client_id,
            client_secret: s.client_secret,
            refresh_token: s.refresh_token,
            market: 'ID',
          },
        });
        console.log('🎵 Spotify auth loaded');
      }
    } catch (e) {
      console.warn('⚠️  Spotify auth failed:', e.message);
    }
  }
}

/**
 * Detect URL type and return one of: 'yt_video' | 'yt_playlist' | 'spotify_track' | 'spotify_playlist' | 'spotify_album' | 'search'
 */
export function detectQueryType(query) {
  const q = (query || '').trim();
  // playdl.yt_validate returns 'video' | 'playlist' | 'search' | false
  const v = playdl.yt_validate(q);
  if (v === 'video') return 'yt_video';
  if (v === 'playlist') return 'yt_playlist';
  if (/open\.spotify\.com\/track\//.test(q)) return 'spotify_track';
  if (/open\.spotify\.com\/playlist\//.test(q)) return 'spotify_playlist';
  if (/open\.spotify\.com\/album\//.test(q)) return 'spotify_album';
  return 'search';
}

/**
 * Resolve a query/URL into an array of track objects.
 * Returns: [{ title, url, duration, thumbnail, requestedBy, source }]
 * Throws on failure.
 */
export async function resolveTracks(query, requestedBy, { limit = 50 } = {}) {
  await initExtractors();
  query = (query || '').trim();
  if (!query) throw new Error('Query kosong.');
  const type = detectQueryType(query);
  const cap = Math.min(limit, 100);

  if (type === 'yt_video') {
    const info = await playdl.video_info(query);
    return [trackFromYtVideo(info.video_details, requestedBy)];
  }

  if (type === 'yt_playlist') {
    const playlist = await playdl.playlist_info(query, { incomplete: true });
    const videos = await playlist.all_videos();
    return videos.slice(0, cap).map(v => trackFromYtVideo(v, requestedBy));
  }

  if (type === 'spotify_track') {
    const t = await playdl.spotify(query);
    return [await spotifyTrackToYt(t, requestedBy)];
  }

  if (type === 'spotify_playlist' || type === 'spotify_album') {
    const data = await playdl.spotify(query);
    const tracks = await data.all_tracks();
    const out = [];
    for (const t of tracks.slice(0, cap)) {
      try { out.push(await spotifyTrackToYt(t, requestedBy)); } catch { /* skip */ }
    }
    return out;
  }

  // search
  const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!results.length) throw new Error(`Lagu "${query}" tidak ditemukan di YouTube.`);
  return [trackFromYtVideo(results[0], requestedBy)];
}

function trackFromYtVideo(v, requestedBy) {
  return {
    title: v.title || 'Unknown',
    url: v.url,
    duration: v.durationInSec || 0,
    thumbnail: v.thumbnails?.[0]?.url || null,
    requestedBy,
    source: 'youtube',
  };
}

async function spotifyTrackToYt(t, requestedBy) {
  const artist = t.artists?.[0]?.name || '';
  const search = await playdl.search(`${t.name} ${artist} audio`, { limit: 1, source: { youtube: 'video' } });
  if (!search.length) throw new Error(`Tidak menemukan "${t.name}" di YouTube.`);
  return {
    title: `${t.name} — ${artist}`,
    url: search[0].url,
    duration: t.durationInSec || search[0].durationInSec || 0,
    thumbnail: t.thumbnail?.url || search[0].thumbnails?.[0]?.url || null,
    requestedBy,
    source: 'spotify',
  };
}
