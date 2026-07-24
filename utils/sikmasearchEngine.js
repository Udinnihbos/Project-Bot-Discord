// ── Search Engine Integration ──
//
// Engines supported:
//   - DuckDuckGo Instant Answer  → ZERO config, default fallback, gratis unlimited
//   - Brave Search               → 2000 query/bulan gratis, no kartu kredit, signup via email
//   - Google Custom Search       → 100 query/hari gratis, perlu setup Google Cloud + Programmable Search Engine
//
// Priority order (configurable per guild):
//   1. Brave (if API key + enabled)
//   2. Google (if API key + enabled)
//   3. DuckDuckGo (always, as fallback)
//
// Auto-fallback behavior:
//   - If Brave/Google enabled but rate-limited / errored, automatically fall back to DuckDuckGo
//   - If no other source works, error message tells user how to enable DDG

// ────────────────────────────────────────────────────────────────────
// DuckDuckGo Instant Answer API (zero config)
// ────────────────────────────────────────────────────────────────────
//
// Docs: https://duckduckgo.com/api
// Returns JSON with abstract (Wikipedia), related topics, and a redirect URL.
// Best for: "apa itu X", "siapa Y", definisi, knowledge graph.
// Limited for: full web search, e-commerce, latest news.

async function searchDuckDuckGo(query, { maxResults = 5, safeSearch = true, offset = 0 } = {}) {
  // DDG Instant Answer has no pagination. Only first call returns useful data.
  if (offset > 0) return { results: [], totalEstimated: 0 };

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    no_redirect: '1',
    no_html: '1',
    skip_disambig: '1',
    t: 'sikma-discord-bot',
  });
  if (safeSearch) params.set('kp', '1'); // safe-search strict

  const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
    headers: { 'User-Agent': 'SikmaDiscordBot/1.0 (+https://github.com)' },
  });
  if (!res.ok) throw new Error(`DuckDuckGo API error: ${res.status}`);
  const data = await res.json();

  const results = [];
  // Main abstract (from Wikipedia)
  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      snippet: data.Abstract.replace(/\n/g, ' '),
      url: data.AbstractURL,
      displayUrl: safeUrl(data.AbstractURL),
      source: '🦆 DuckDuckGo',
    });
  }
  // Related topics (array of {Text, FirstURL, ...})
  for (const t of (data.RelatedTopics || []).slice(0, maxResults)) {
    if (t.Text && t.FirstURL) {
      results.push({
        title: (t.Text.split(' - ')[0] || t.Text).slice(0, 80),
        snippet: t.Text,
        url: t.FirstURL,
        displayUrl: safeUrl(t.FirstURL),
        source: '🦆 DuckDuckGo',
      });
    }
  }

  return {
    results: results.slice(0, maxResults),
    totalEstimated: results.length, // DDG doesn't give total count
  };
}

function safeUrl(u) {
  try { return new URL(u).hostname; } catch { return u; }
}

// ────────────────────────────────────────────────────────────────────
// Google Custom Search
// ────────────────────────────────────────────────────────────────────

async function searchGoogle(query, { maxResults = 5, safeSearch = true, offset = 0 }) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) throw new Error('Google Search API belum dikonfigurasi di .env (GOOGLE_SEARCH_API_KEY & GOOGLE_SEARCH_CX)');

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: Math.min(maxResults, 10),
    start: offset + 1,
    safe: safeSearch ? 'active' : 'off',
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (res.status === 429 || res.status === 403) {
    const err = new Error('Google API quota habis (limit 100/hari)');
    err.code = 'RATE_LIMIT';
    throw err;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google API error: ${res.status}`);
  }
  const data = await res.json();

  return {
    results: (data.items || []).map(item => ({
      title: item.title,
      snippet: item.snippet?.replace(/\n/g, ' ') || '',
      url: item.link,
      displayUrl: item.displayLink,
      source: '🔵 Google',
    })),
    totalEstimated: parseInt(data.searchInformation?.totalResults || '0'),
  };
}

// ────────────────────────────────────────────────────────────────────
// Brave Search
// ────────────────────────────────────────────────────────────────────

async function searchBrave(query, { maxResults = 5, safeSearch = true, offset = 0 }) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('Brave Search API belum dikonfigurasi di .env (BRAVE_SEARCH_API_KEY)');

  const params = new URLSearchParams({
    q: query,
    count: Math.min(maxResults, 20),
    offset,
    safesearch: safeSearch ? 'strict' : 'off',
    text_decorations: 0,
  });

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });
  if (res.status === 429) {
    const err = new Error('Brave API quota habis (limit 2000/bulan)');
    err.code = 'RATE_LIMIT';
    throw err;
  }
  if (!res.ok) throw new Error(`Brave API error: ${res.status}`);
  const data = await res.json();

  return {
    results: (data.web?.results || []).map(item => ({
      title: item.title,
      snippet: item.description?.replace(/\n/g, ' ') || '',
      url: item.url,
      displayUrl: item.meta_url?.hostname || safeUrl(item.url),
      source: '🟠 Brave',
    })),
    totalEstimated: data.web?.totalCount || 0,
  };
}

// ────────────────────────────────────────────────────────────────────
// Main entry — orchestrates all sources with auto-fallback
// ────────────────────────────────────────────────────────────────────

const ENGINE_FN = {
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
  google: searchGoogle,
};

export async function performSearch(query, config, { offset = 0 } = {}) {
  const { sources, maxResults, safeSearch, searchMode } = config;

  // Exact mode: wrap in quotes
  const finalQuery = searchMode === 'exact' ? `"${query}"` : query;

  // Determine enabled sources (config order: brave > google > duckduckgo)
  // DDG is special: always allowed as fallback, even if not "enabled" by user
  const enabledSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k);

  if (enabledSources.length === 0 && !config.allowDuckDuckGoFallback) {
    throw new Error('Tidak ada sumber pencarian yang aktif! Aktifkan di `/sikmasearch settings`.');
  }

  // Build priority list: configured sources first, then DDG as fallback
  const priorityList = [
    ...enabledSources,
    ...(config.allowDuckDuckGoFallback !== false && !enabledSources.includes('duckduckgo') ? ['duckduckgo'] : []),
  ];

  const errors = [];
  const seen = new Set();
  const merged = [];
  let totalEstimated = 0;

  for (const src of priorityList) {
    const fn = ENGINE_FN[src];
    if (!fn) continue;
    try {
      const resp = await fn(finalQuery, { maxResults, safeSearch, offset });
      for (const r of resp.results || []) {
        if (!seen.has(r.url)) { seen.add(r.url); merged.push(r); }
      }
      totalEstimated += resp.totalEstimated || 0;
      // If we got enough results from configured sources, don't need DDG fallback
      if (merged.length >= maxResults && enabledSources.includes(src)) break;
    } catch (e) {
      const label = src === 'duckduckgo' ? 'DuckDuckGo' : src === 'brave' ? 'Brave' : 'Google';
      errors.push({ source: label, message: e.message, code: e.code });
      // If it's a rate limit, skip to next source; otherwise also continue
      if (e.code !== 'RATE_LIMIT') {
        // Non-rate-limit error: still try fallback
      }
    }
  }

  if (merged.length === 0) {
    const errorMsgs = errors.map(e => `${e.source}: ${e.message}`).join('; ');
    if (errors.length > 0) {
      throw new Error(errorMsgs || 'Semua sumber pencarian gagal.');
    }
    return { results: [], totalEstimated: 0, errors: [], query: finalQuery, originalQuery: query };
  }

  return {
    results: merged.slice(0, maxResults),
    totalEstimated,
    errors: errors.map(e => `${e.source}: ${e.message}`),
    query: finalQuery,
    originalQuery: query,
  };
}
