// ── Search Engine Integration ──
// Google Custom Search: 100 query/hari gratis
// Brave Search: 2000 query/bulan gratis

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
    }
  });

  if (!res.ok) throw new Error(`Brave API error: ${res.status}`);
  const data = await res.json();

  return {
    results: (data.web?.results || []).map(item => ({
      title: item.title,
      snippet: item.description?.replace(/\n/g, ' ') || '',
      url: item.url,
      displayUrl: item.meta_url?.hostname || new URL(item.url).hostname,
      source: '🟠 Brave',
    })),
    totalEstimated: data.web?.totalCount || 0,
  };
}

export async function performSearch(query, config, { offset = 0 } = {}) {
  const { sources, maxResults, safeSearch, searchMode } = config;

  // Exact mode: wrap in quotes
  const finalQuery = searchMode === 'exact' ? `"${query}"` : query;

  const activeSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k);
  if (activeSources.length === 0) throw new Error('Tidak ada sumber pencarian yang aktif! Aktifkan di `/sikmasearch settings`.');

  const promises = activeSources.map(src => {
    if (src === 'google') return searchGoogle(finalQuery, { maxResults, safeSearch, offset }).catch(e => ({ results: [], error: e.message, source: 'Google' }));
    if (src === 'brave') return searchBrave(finalQuery, { maxResults, safeSearch, offset }).catch(e => ({ results: [], error: e.message, source: 'Brave' }));
    return Promise.resolve({ results: [] });
  });

  const allResponses = await Promise.all(promises);
  const errors = allResponses.filter(r => r.error).map(r => r.error);

  // Merge & deduplicate by URL
  const seen = new Set();
  const merged = [];
  for (const resp of allResponses) {
    for (const r of resp.results || []) {
      if (!seen.has(r.url)) { seen.add(r.url); merged.push(r); }
    }
  }

  const totalEstimated = allResponses.reduce((a, r) => a + (r.totalEstimated || 0), 0);

  return { results: merged, totalEstimated, errors, query: finalQuery, originalQuery: query };
}
