import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildConfig } from './sikmasearchConfig.js';
import { performSearch } from './sikmasearchEngine.js';

// Pagination state: messageId -> { query, config, offset, totalEstimated }
const paginationCache = new Map();

const TRIGGER_KEYWORDS = ['carikan', 'cariin', 'cari', 'search', 'tolong carikan', 'coba cari', 'find'];

function extractQuery(content, clientId) {
  // Hapus mention bot
  let q = content.replace(new RegExp(`<@!?${clientId}>`, 'g'), '').trim();

  // Hapus trigger keywords di awal
  for (const kw of TRIGGER_KEYWORDS) {
    const re = new RegExp(`^${kw}\\s*`, 'i');
    if (re.test(q)) { q = q.replace(re, '').trim(); break; }
  }

  return q.trim();
}

function buildResultEmbed(searchResult, config, page = 1) {
  const { results, totalEstimated, errors, originalQuery, query } = searchResult;

  const sourcesUsed = [...new Set(results.map(r => r.source))].join(' + ') || 'Tidak ada';
  const modeLabel = config.searchMode === 'exact' ? '🎯 Exact Match' : '🔍 Smart Search';
  const totalPages = Math.ceil((totalEstimated || results.length) / config.maxResults);

  if (results.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('🔍 SikmaSearch')
      .setDescription(`Tidak ada hasil untuk **"${originalQuery.slice(0, 200)}"**.\n\nCoba kata kunci yang berbeda atau ganti mode pencarian.`)
      .addFields({ name: '⚙️ Mode', value: modeLabel, inline: true });

    if (errors.length > 0) embed.addFields({ name: '⚠️ Error', value: errors.join('\n').slice(0, 1000) });
    return embed;
  }

  const resultLines = results.slice(0, config.maxResults).map((r, i) => {
    const title = r.title.length > 60 ? r.title.substring(0, 60) + '…' : r.title;
    const snippet = r.snippet.length > 100 ? r.snippet.substring(0, 100) + '…' : r.snippet;
    return `**${i + 1}.** [**${title}**](${r.url})\n${snippet}\n\`${r.displayUrl}\` ${r.source}`;
  }).join('\n\n');

  // Truncate to 4096 (Discord embed description limit)
  const safeDescription = resultLines.length > 4000
    ? resultLines.slice(0, 4000) + '\n\n…(beberapa hasil dipotong karena panjang)'
    : resultLines;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ name: 'SikmaSearch', iconURL: 'https://cdn3.emoji.gg/emojis/8465-google.png' })
    .setTitle(`🔍 Hasil: "${originalQuery.slice(0, 200)}"`.slice(0, 256))
    .setDescription(safeDescription)
    .addFields(
      { name: '⚙️ Mode', value: modeLabel, inline: true },
      { name: '📊 Sumber', value: sourcesUsed, inline: true },
      { name: '📄 Halaman', value: totalPages > 0 ? `${page}/${Math.min(totalPages, 10)}` : '1/1', inline: true },
    )
    .setFooter({ text: `${totalEstimated > 0 ? `~${totalEstimated.toLocaleString('id-ID')} hasil` : `${results.length} hasil`} ditemukan` })
    .setTimestamp();

  if (errors.length > 0) embed.addFields({ name: '⚠️ Peringatan', value: errors.join('\n') });

  return embed;
}

function buildPaginationRow(hasNext, hasPrev, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ss_prev')
      .setLabel('◀ Sebelumnya')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasPrev),
    new ButtonBuilder()
      .setCustomId('ss_next')
      .setLabel('Selanjutnya ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !hasNext),
    new ButtonBuilder()
      .setCustomId('ss_close')
      .setLabel('✖ Tutup')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function sendSearchResult(message, query, config) {
  const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
  await message.channel.sendTyping();

  let searchResult;
  try {
    searchResult = await performSearch(query, config, { offset: 0 });
  } catch (err) {
    clearInterval(typingInterval);
    // Detect common error patterns and give actionable advice
    const msg = err.message || '';
    let advice = '';
    if (msg.includes('GOOGLE_SEARCH_API_KEY') || msg.includes('BRAVE_SEARCH_API_KEY')) {
      advice = '\n\n💡 **Tip:** Setup Brave/Google API di `/sikmasearch settings` untuk hasil lebih lengkap. Tanpa itu, bot pakai DuckDuckGo (zero-config, hasil lebih sedikit).';
    } else if (msg.includes('Tidak ada sumber')) {
      advice = '\n\n💡 Aktifkan minimal 1 sumber di `/sikmasearch settings`.';
    }
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Pencarian Gagal')
        .setDescription((msg + advice).slice(0, 4000))
      ]
    });
  }
  clearInterval(typingInterval);

  const embed = buildResultEmbed(searchResult, config, 1);
  const totalPages = Math.ceil((searchResult.totalEstimated || searchResult.results.length) / config.maxResults);
  const hasNext = totalPages > 1 && searchResult.results.length >= config.maxResults;

  const reply = await message.reply({
    embeds: [embed],
    components: [buildPaginationRow(hasNext, false)],
    allowedMentions: { repliedUser: false },
  });

  // Cache pagination state
  paginationCache.set(reply.id, {
    query,
    config,
    offset: 0,
    page: 1,
    totalEstimated: searchResult.totalEstimated,
  });

  // Collector for pagination
  const collector = reply.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id,
    time: 120_000,
  });

  collector.on('collect', async i => {
    const state = paginationCache.get(reply.id);
    if (!state) return i.deferUpdate();

    if (i.customId === 'ss_close') {
      collector.stop();
      await reply.delete().catch(() => {});
      paginationCache.delete(reply.id);
      return;
    }

    const newOffset = i.customId === 'ss_next'
      ? state.offset + state.config.maxResults
      : Math.max(0, state.offset - state.config.maxResults);
    const newPage = i.customId === 'ss_next' ? state.page + 1 : state.page - 1;

    await i.deferUpdate();

    let newResult;
    try {
      newResult = await performSearch(state.query, state.config, { offset: newOffset });
    } catch {
      return;
    }

    const newTotalPages = Math.ceil((newResult.totalEstimated || newResult.results.length) / state.config.maxResults);
    const newHasNext = newPage < Math.min(newTotalPages, 10) && newResult.results.length >= state.config.maxResults;
    const newHasPrev = newPage > 1;

    paginationCache.set(reply.id, { ...state, offset: newOffset, page: newPage, totalEstimated: newResult.totalEstimated });

    await reply.edit({
      embeds: [buildResultEmbed(newResult, state.config, newPage)],
      components: [buildPaginationRow(newHasNext, newHasPrev)],
    });
  });

  collector.on('end', () => {
    reply.edit({ components: [buildPaginationRow(false, false, true)] }).catch(() => {});
    paginationCache.delete(reply.id);
  });
}

export async function handleSikmasearch(message, client) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const config = getGuildConfig(message.guild.id);
  const isMention = message.mentions.has(client.user);

  // If bot is mentioned but search is disabled, hint to admin
  if (isMention && !config.enabled) {
    return message.reply({
      content: '🔍 SikmaSearch belum diaktifkan. Admin: jalankan `/sikmasearch settings` untuk mengaktifkan.',
      allowedMentions: { repliedUser: false },
    });
  }

  if (!config.enabled) return;

  const isSearchChannel = config.channelId && message.channel.id === config.channelId;
  if (!isMention && !isSearchChannel) return;

  const query = extractQuery(message.content, client.user.id);
  if (!query || query.length < 2) {
    if (isMention) {
      return message.reply({
        content: '🔍 Mau cari apa? Contoh: `@Bot carikan sodium mods`',
        allowedMentions: { repliedUser: false }
      });
    }
    return;
  }

  await sendSearchResult(message, query, config);
}
