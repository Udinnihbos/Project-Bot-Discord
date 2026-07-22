import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, PermissionFlagsBits,
  ChannelSelectMenuBuilder, ChannelType,
} from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../utils/sikmasearchConfig.js';

// ════════════════════════════════════════
// PANEL BUILDERS
// ════════════════════════════════════════

function getSourceStatus(sourceName) {
  const envMap = {
    google: ['GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX'],
    brave: ['BRAVE_SEARCH_API_KEY'],
  };
  const vars = envMap[sourceName] || [];
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length > 0) return { ok: false, label: `❌ Belum dikonfigurasi (${missing.join(', ')})` };
  return { ok: true, label: '✅ API Key tersedia' };
}

function panelMain(config) {
  const googleStatus = getSourceStatus('google');
  const braveStatus = getSourceStatus('brave');

  const activeSourcesList = [
    config.sources.google ? '🔵 Google' : null,
    config.sources.brave ? '🟠 Brave' : null,
  ].filter(Boolean).join(' + ') || '❌ Tidak ada';

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? '#5865F2' : '#e74c3c')
    .setTitle('🔍 SikmaSearch — Settings')
    .setDescription('Sistem pencarian web langsung dari Discord seperti Google.')
    .addFields(
      { name: '🔌 Status', value: config.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '📺 Channel', value: config.channelId ? `<#${config.channelId}>` : '❌ Belum diset', inline: true },
      { name: '🎯 Mode', value: config.searchMode === 'exact' ? '🎯 Exact Match' : '🔍 Smart Search', inline: true },
      { name: '📊 Max Hasil', value: `${config.maxResults} hasil`, inline: true },
      { name: '🛡️ Safe Search', value: config.safeSearch ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '🌐 Sumber Aktif', value: activeSourcesList, inline: true },
      {
        name: '🔵 Google Custom Search',
        value: `${config.sources.google ? '✅ Aktif' : '⏸️ Nonaktif'} • ${googleStatus.label}\n100 query/hari gratis`,
        inline: false,
      },
      {
        name: '🟠 Brave Search',
        value: `${config.sources.brave ? '✅ Aktif' : '⏸️ Nonaktif'} • ${braveStatus.label}\n2000 query/bulan gratis`,
        inline: false,
      },
    )
    .setFooter({ text: 'Mention bot atau kirim pesan di channel yang diset untuk mencari' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ss_toggle')
        .setLabel(config.enabled ? '⏸️ Nonaktifkan' : '▶️ Aktifkan')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ss_toggle_mode')
        .setLabel(config.searchMode === 'exact' ? '🔍 Ganti ke Smart' : '🎯 Ganti ke Exact')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ss_toggle_safe')
        .setLabel(config.safeSearch ? '🛡️ Safe Search: ON' : '⚠️ Safe Search: OFF')
        .setStyle(config.safeSearch ? ButtonStyle.Success : ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ss_max_results')
        .setPlaceholder(`📊 Max Hasil: ${config.maxResults}`)
        .addOptions([1, 3, 5, 7, 10].map(n =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${n} hasil`)
            .setDescription(`Tampilkan ${n} hasil per halaman`)
            .setValue(String(n))
            .setDefault(config.maxResults === n)
        ))
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('ss_set_channel')
        .setPlaceholder('📺 Set channel pencarian...')
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ss_toggle_google')
        .setLabel(config.sources.google ? '🔵 Google: ON' : '🔵 Google: OFF')
        .setStyle(config.sources.google ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!getSourceStatus('google').ok),
      new ButtonBuilder()
        .setCustomId('ss_toggle_brave')
        .setLabel(config.sources.brave ? '🟠 Brave: ON' : '🟠 Brave: OFF')
        .setStyle(config.sources.brave ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!getSourceStatus('brave').ok),
      new ButtonBuilder()
        .setCustomId('ss_clear_channel')
        .setLabel('🗑️ Hapus Channel')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!config.channelId),
    ),
  ];

  return { embed, rows };
}

function panelSetup() {
  const googleOk = getSourceStatus('google');
  const braveOk = getSourceStatus('brave');

  const embed = new EmbedBuilder()
    .setColor('#f39c12')
    .setTitle('⚙️ Cara Setup SikmaSearch')
    .setDescription('Tambahkan API key ke file `.env` kamu untuk mengaktifkan sumber pencarian.')
    .addFields(
      {
        name: '🔵 Google Custom Search API (100 query/hari gratis)',
        value: [
          '1. Buka https://programmablesearchengine.google.com',
          '2. Buat Search Engine baru → copy **Search Engine ID**',
          '3. Buka https://console.cloud.google.com → Enable **Custom Search API** → buat API Key',
          '4. Tambahkan ke `.env`:',
          '```',
          'GOOGLE_SEARCH_API_KEY=api_key_kamu',
          'GOOGLE_SEARCH_CX=search_engine_id_kamu',
          '```',
          `Status: ${googleOk.label}`,
        ].join('\n'),
      },
      {
        name: '🟠 Brave Search API (2000 query/bulan gratis)',
        value: [
          '1. Buka https://brave.com/search/api',
          '2. Daftar dan dapatkan API key',
          '3. Tambahkan ke `.env`:',
          '```',
          'BRAVE_SEARCH_API_KEY=api_key_kamu',
          '```',
          `Status: ${braveOk.label}`,
        ].join('\n'),
      },
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ss_back_setup')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    )
  ];

  return { embed, rows };
}

// ── Render ──
async function render(target, guildId, page) {
  const config = getGuildConfig(guildId);
  const panel = page === 'setup' ? panelSetup() : panelMain(config);
  const payload = { embeds: [panel.embed], components: panel.rows };
  if (typeof target.update === 'function') await target.update(payload);
  else await target.editReply(payload);
}

// ════════════════════════════════════════
// COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('sikmasearch')
  .setDescription('🔍 SikmaSearch — Sistem pencarian web di Discord')
  .addSubcommand(sub => sub.setName('settings').setDescription('Buka panel pengaturan SikmaSearch'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'settings') return;

  const guildId = interaction.guild.id;
  let page = 'main';

  const config = getGuildConfig(guildId);
  const { embed, rows } = panelMain(config);

  const msg = await interaction.reply({
    embeds: [embed],
    components: rows,
    ephemeral: true,
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 300_000,
  });

  collector.on('collect', async i => {
    const id = i.customId;

    if (id === 'ss_back_setup') {
      page = 'main';
      return render(i, guildId, page);
    }

    if (id === 'ss_toggle') {
      const cur = getGuildConfig(guildId);
      updateGuildConfig(guildId, { enabled: !cur.enabled });
      return render(i, guildId, page);
    }

    if (id === 'ss_toggle_mode') {
      const cur = getGuildConfig(guildId);
      updateGuildConfig(guildId, { searchMode: cur.searchMode === 'smart' ? 'exact' : 'smart' });
      return render(i, guildId, page);
    }

    if (id === 'ss_toggle_safe') {
      const cur = getGuildConfig(guildId);
      updateGuildConfig(guildId, { safeSearch: !cur.safeSearch });
      return render(i, guildId, page);
    }

    if (id === 'ss_max_results') {
      updateGuildConfig(guildId, { maxResults: parseInt(i.values[0]) });
      return render(i, guildId, page);
    }

    if (id === 'ss_set_channel') {
      updateGuildConfig(guildId, { channelId: i.values[0] });
      return render(i, guildId, page);
    }

    if (id === 'ss_clear_channel') {
      updateGuildConfig(guildId, { channelId: null });
      return render(i, guildId, page);
    }

    if (id === 'ss_toggle_google') {
      const cur = getGuildConfig(guildId);
      updateGuildConfig(guildId, { sources: { ...cur.sources, google: !cur.sources.google } });
      return render(i, guildId, page);
    }

    if (id === 'ss_toggle_brave') {
      const cur = getGuildConfig(guildId);
      updateGuildConfig(guildId, { sources: { ...cur.sources, brave: !cur.sources.brave } });
      return render(i, guildId, page);
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
