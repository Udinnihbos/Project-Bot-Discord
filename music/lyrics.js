/**
 * Fetch lyrics from lyrics.ovh (free, no API key needed).
 * Strategy: clean query → fetch by artist/title, fall back to title only.
 */

function clean(s) {
  return (s || '')
    .replace(/\([^)]*\)/g, '')          // remove (...)
    .replace(/\[[^\]]*\]/g, '')         // remove [...]
    .replace(/official|video|lyric|hd|4k|m\/v|audio| remaster(ed)?/gi, '')
    .replace(/[^\w\sÀ-ɏ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArtistTitle(query) {
  const cleaned = clean(query);
  // Try "Artist - Title" pattern first
  const m = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  // Fallback: whole string is the title
  return ['', cleaned];
}

export async function fetchLyrics(query) {
  let [artist, title] = splitArtistTitle(query);
  if (!title) throw new Error('Tidak bisa mendeteksi judul lagu.');

  // Try multiple URL patterns
  const tries = [];
  if (artist) tries.push({ a: artist, t: title });
  tries.push({ a: '', t: title });
  // Try with first word of title as artist
  const words = title.split(/\s+/);
  if (words.length > 1) tries.push({ a: words[0], t: words.slice(1).join(' ') });

  for (const { a, t } of tries) {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(a || 'unknown')}/${encodeURIComponent(t)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'DiscordBot/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.lyrics && data.lyrics.trim().length > 20) {
        return { lyrics: data.lyrics.trim(), artist: a, title: t };
      }
    } catch (e) {
      // try next
    }
  }
  throw new Error(`Lirik tidak ditemukan untuk "${title}"${artist ? ` (${artist})` : ''}.`);
}
