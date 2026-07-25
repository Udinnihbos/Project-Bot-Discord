/**
 * /notifier — YouTube + Twitch notifier admin panel.
 *
 * Subcommands:
 *   settings — open admin panel (manage YouTube/Twitch subscriptions)
 *
 * Pattern: ephemeral reply + collector (like /sikmasearch).
 */

import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../utils/notifierConfig.js';
import {
  resolveYouTubeId, getTwitchStreamStatus,
  youtubeConfigured, twitchConfigured,
} from '../utils/notifierEngine.js';

// ══════════════
// PANEL BUILDERS
// ══════════════

function ytStatus() {
  if (youtubeConfigured()) return '✅ API key OK';
  return '❌ YOUTUBE_API_KEY belum diset di .env';
}
function twStatus() {
  if (twitchConfigured()) return '✅ Client ID + Secret OK';
  return '❌ TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET belum diset di .env';
}

function panelMain(config) {
  const ytCreators = config.youtube.creators || [];
  const twStreamers = config.twitch.streamers || [];

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? '#5865F2' : '#e74c3c')
    .setTitle('📡 Notifier — YouTube & Twitch')
    .setDescription('Auto-post video baru & live stream ke channel Discord kamu.')
    .addFields(
      { name: '🔌 Status', value: config.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '📺 Channel', value: config.channelId ? `<#${config.channelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Interval', value: '5 menit', inline: true },
      {
        name: '🎥 YouTube',
        value: [
          `${config.youtube.enabled ? '✅ Aktif' : '⏸️ Nonaktif'} • ${ytStatus()}`,
          `Creators: **${ytCreators.length}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🟣 Twitch',
        value: [
          `${config.twitch.enabled ? '✅ Aktif' : '⏸️ Nonaktif'} • ${twStatus()}`,
          `Streamers: **${twStreamers.length}**`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: '📡 Notifier • Interval check 5 menit' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nt_toggle')
        .setLabel(config.enabled ? '⏸️ Nonaktifkan' : '▶️ Aktifkan')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('nt_toggle_yt')
        .setLabel(config.youtube.enabled ? '🎥 YouTube: ON' : '🎥 YouTube: OFF')
        .setStyle(config.youtube.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!youtubeConfigured()),
      new ButtonBuilder()
        .setCustomId('nt_toggle_tw')
        .setLabel(config.twitch.enabled ? '🟣 Twitch: ON' : '🟣 Twitch: OFF')
        .setStyle(config.twitch.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!twitchConfigured()),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('nt_set_channel')
        .setPlaceholder('📺 Set channel tujuan…')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nt_yt_manage')
        .setLabel('🎥 YouTube Creators')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!youtubeConfigured()),
      new ButtonBuilder()
        .setCustomId('nt_tw_manage')
        .setLabel('🟣 Twitch Streamers')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!twitchConfigured()),
      new ButtonBuilder()
        .setCustomId('nt_msg_yt')
        .setLabel('📝 YT Msg')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('nt_msg_tw')
        .setLabel('📝 TW Msg')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nt_test_yt')
        .setLabel('🧪 Test YT Post')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!config.youtube.creators?.length),
      new ButtonBuilder()
        .setCustomId('nt_test_tw')
        .setLabel('🧪 Test TW Post')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!config.twitch.streamers?.length),
      new ButtonBuilder()
        .setCustomId('nt_close')
        .setLabel('✖ Tutup')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelYouTubeList(config) {
  const creators = config.youtube.creators || [];
  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('🎥 YouTube Creators')
    .setDescription(
      creators.length
        ? creators.map((c, i) => `\`${i + 1}.\` **${c.name}** \`(${c.id})\``).join('\n').slice(0, 4000)
        : '*Belum ada creator.*\n\nKlik **➕ Tambah** lalu masukkan:\n• Channel ID (`UC...`)\n• Handle (`@username`)\n• URL YouTube\n• Playlist ID (`UU...` untuk uploads playlist)'
    )
    .setFooter({ text: '📡 YouTube • Post video baru otomatis' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nt_yt_add')
        .setLabel('➕ Tambah Creator')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('nt_yt_remove')
        .setLabel('🗑️ Hapus Creator')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(creators.length === 0),
      new ButtonBuilder()
        .setCustomId('nt_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embed, rows };
}

function panelTwitchList(config) {
  const streamers = config.twitch.streamers || [];
  const embed = new EmbedBuilder()
    .setColor('#9146ff')
    .setTitle('🟣 Twitch Streamers')
    .setDescription(
      streamers.length
        ? streamers.map((s, i) => `\`${i + 1}.\` **${s.name}** \`(@${s.login})\``).join('\n').slice(0, 4000)
        : '*Belum ada streamer.*\n\nKlik **➕ Tambah** lalu masukkan:\n• Username Twitch (mis. `pokimane`, `lirik`)\n• URL Twitch (`twitch.tv/username`)'
    )
    .setFooter({ text: '📡 Twitch • Post notif waktu streamer go live' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('nt_tw_add')
        .setLabel('➕ Tambah Streamer')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('nt_tw_remove')
        .setLabel('🗑️ Hapus Streamer')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(streamers.length === 0),
      new ButtonBuilder()
        .setCustomId('nt_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embed, rows };
}

// ── Modals ──

function modalAddYouTube() {
  return new ModalBuilder()
    .setCustomId('nt_modal_yt_add')
    .setTitle('Tambah YouTube Creator')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input')
          .setLabel('Channel ID / @handle / URL / Playlist')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setPlaceholder('UCxxxxxxxxx atau @username atau URL')
      ),
    );
}

function modalAddTwitch() {
  return new ModalBuilder()
    .setCustomId('nt_modal_tw_add')
    .setTitle('Tambah Twitch Streamer')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input')
          .setLabel('Username Twitch')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('pokimane atau https://twitch.tv/pokimane')
      ),
    );
}

function modalMessageYouTube(current) {
  return new ModalBuilder()
    .setCustomId('nt_modal_msg_yt')
    .setTitle('Custom Message YouTube')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Template (gunakan {creator} {title} {url})')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setValue(current || '🎥 **{creator}** uploaded: **{title}**\n{url}')
      ),
    );
}

function modalMessageTwitch(current) {
  return new ModalBuilder()
    .setCustomId('nt_modal_msg_tw')
    .setTitle('Custom Message Twitch')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Template (gunakan {streamer} {title} {url})')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setValue(current || '🔴 **{streamer}** is now live!\n{url}')
      ),
    );
}

// ── Render helper ──
async function render(target, guildId, page = 'main') {
  const config = getGuildConfig(guildId);
  let panel;
  if (page === 'yt') panel = panelYouTubeList(config);
  else if (page === 'tw') panel = panelTwitchList(config);
  else panel = panelMain(config);

  const payload = { embeds: [panel.embed], components: panel.rows };
  if (typeof target.update === 'function') await target.update(payload);
  else await target.editReply(payload);
}

// ── Helper: pick creator/streamer to remove ──
function buildRemoveSelect(items, customId) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('🗑️ Pilih untuk hapus…');
  for (let i = 0; i < Math.min(items.length, 25); i++) {
    const it = items[i];
    sel.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel((it.name || it.login).slice(0, 100))
      .setValue(it.id || it.login)
      .setEmoji('🗑️'));
  }
  return sel;
}

// ══════════════
// COMMAND
// ══════════════

export const data = new SlashCommandBuilder()
  .setName('notifier')
  .setDescription('📡 Notifier — YouTube & Twitch live updates')
  .addSubcommand(sub => sub.setName('settings').setDescription('⚙️ Buka panel pengaturan notifier'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'settings') return;

  const guildId = interaction.guild.id;
  const config = getGuildConfig(guildId);
  const { embed, rows } = panelMain(config);

  const msg = await interaction.reply({
    embeds: [embed],
    components: rows,
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 600_000, // 10 min
  });

  let currentPage = 'main';

  collector.on('collect', async i => {
    const id = i.customId;
    const config = getGuildConfig(guildId);

    try {
      // ── Main page buttons ──
      if (id === 'nt_close') {
        collector.stop();
        await i.update({ embeds: [{ color: 0x95a5a6, title: '✖ Panel ditutup' }], components: [] });
        return;
      }
      if (id === 'nt_toggle') {
        updateGuildConfig(guildId, { enabled: !config.enabled });
        return render(i, guildId, currentPage);
      }
      if (id === 'nt_toggle_yt') {
        updateGuildConfig(guildId, { youtube: { ...config.youtube, enabled: !config.youtube.enabled } });
        return render(i, guildId, currentPage);
      }
      if (id === 'nt_toggle_tw') {
        updateGuildConfig(guildId, { twitch: { ...config.twitch, enabled: !config.twitch.enabled } });
        return render(i, guildId, currentPage);
      }
      if (id === 'nt_set_channel') {
        if (!i.values?.length) return;
        updateGuildConfig(guildId, { channelId: i.values[0] });
        return render(i, guildId, currentPage);
      }
      if (id === 'nt_yt_manage') {
        currentPage = 'yt';
        return render(i, guildId, 'yt');
      }
      if (id === 'nt_tw_manage') {
        currentPage = 'tw';
        return render(i, guildId, 'tw');
      }
      if (id === 'nt_back_main') {
        currentPage = 'main';
        return render(i, guildId, 'main');
      }
      if (id === 'nt_yt_add') {
        return i.showModal(modalAddYouTube());
      }
      if (id === 'nt_tw_add') {
        return i.showModal(modalAddTwitch());
      }
      if (id === 'nt_yt_remove') {
        if (!config.youtube.creators.length) {
          return i.update({ content: '⚠️ Tidak ada creator.', embeds: [], components: [] });
        }
        const sel = buildRemoveSelect(config.youtube.creators, 'nt_yt_remove_pick');
        return i.update({
          embeds: [{ color: 0xe74c3c, title: '🗑️ Hapus YouTube Creator', description: 'Pilih creator yang mau dihapus:' }],
          components: [new ActionRowBuilder().addComponents(sel),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('nt_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }
      if (id === 'nt_tw_remove') {
        if (!config.twitch.streamers.length) {
          return i.update({ content: '⚠️ Tidak ada streamer.', embeds: [], components: [] });
        }
        const sel = buildRemoveSelect(config.twitch.streamers, 'nt_tw_remove_pick');
        return i.update({
          embeds: [{ color: 0xe74c3c, title: '🗑️ Hapus Twitch Streamer', description: 'Pilih streamer yang mau dihapus:' }],
          components: [new ActionRowBuilder().addComponents(sel),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('nt_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }
      if (id === 'nt_yt_remove_pick') {
        const pick = i.values[0];
        const newCreators = config.youtube.creators.filter(c => c.id !== pick);
        updateGuildConfig(guildId, { youtube: { ...config.youtube, creators: newCreators } });
        currentPage = 'yt';
        return render(i, guildId, 'yt');
      }
      if (id === 'nt_tw_remove_pick') {
        const pick = i.values[0];
        const newStreamers = config.twitch.streamers.filter(s => s.login !== pick);
        updateGuildConfig(guildId, { twitch: { ...config.twitch, streamers: newStreamers } });
        currentPage = 'tw';
        return render(i, guildId, 'tw');
      }
      if (id === 'nt_msg_yt') {
        return i.showModal(modalMessageYouTube(config.youtube.message));
      }
      if (id === 'nt_msg_tw') {
        return i.showModal(modalMessageTwitch(config.twitch.message));
      }
      if (id === 'nt_test_yt') {
        return testYouTubePost(i, guildId);
      }
      if (id === 'nt_test_tw') {
        return testTwitchPost(i, guildId);
      }
    } catch (e) {
      console.error('[notifier] handler error:', e.message);
      // Try to send error reply
      try {
        const errPayload = { content: `❌ Error: ${e.message?.slice(0, 200)}`, embeds: [], components: [] };
        if (i.replied) await i.followUp(errPayload);
        else await i.update(errPayload);
      } catch {}
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

// ══════════════
// MODAL HANDLERS
// ══════════════

export async function handleNotifierModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('nt_modal_')) return false;

  const cid = interaction.customId;
  const guildId = interaction.guildId;
  const config = getGuildConfig(guildId);

  try {
    if (cid === 'nt_modal_yt_add') {
      const input = interaction.fields.getTextInputValue('input').trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const creator = await resolveYouTubeId(input);
      // Check for duplicate
      if (config.youtube.creators.some(c => c.id === creator.id)) {
        return interaction.editReply(`❌ **${creator.name}** sudah ada di list.`);
      }
      const newCreators = [...config.youtube.creators, creator].slice(0, 25);
      updateGuildConfig(guildId, { youtube: { ...config.youtube, creators: newCreators } });
      return interaction.editReply(`✅ Berhasil tambah **${creator.name}** (\`${creator.id}\`)`);
    }

    if (cid === 'nt_modal_tw_add') {
      let input = interaction.fields.getTextInputValue('input').trim();
      // Extract username from URL if needed
      const urlMatch = input.match(/twitch\.tv\/([\w-]+)/i);
      if (urlMatch) input = urlMatch[1];
      input = input.replace(/^@/, '').toLowerCase();
      if (!/^[\w-]{3,25}$/.test(input)) {
        return interaction.reply({
          embeds: [{ color: 0xe74c3c, title: '❌ Format username Twitch invalid' }],
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      // Verify with Twitch API
      const statuses = await getTwitchStreamStatus([input]);
      const status = statuses[input];
      // If isLive, we got info; if not, we get {isLive: false} but no display name.
      // Twitch /streams only returns online users, so we can't get display name for offline users.
      // Use login as name; will be auto-updated when they go live.
      const streamerName = status?.isLive ? input : input;
      if (config.twitch.streamers.some(s => s.login === input)) {
        return interaction.editReply(`❌ **@${input}** sudah ada di list.`);
      }
      const newStreamers = [...config.twitch.streamers, { login: input, name: streamerName }].slice(0, 25);
      updateGuildConfig(guildId, { twitch: { ...config.twitch, streamers: newStreamers } });
      return interaction.editReply(`✅ Berhasil tambah **@${input}**${status?.isLive ? ' (saat ini LIVE)' : ''}`);
    }

    if (cid === 'nt_modal_msg_yt') {
      const message = interaction.fields.getTextInputValue('message').trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      updateGuildConfig(guildId, { youtube: { ...config.youtube, message } });
      return interaction.editReply('✅ Template pesan YouTube diupdate.');
    }

    if (cid === 'nt_modal_msg_tw') {
      const message = interaction.fields.getTextInputValue('message').trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      updateGuildConfig(guildId, { twitch: { ...config.twitch, message } });
      return interaction.editReply('✅ Template pesan Twitch diupdate.');
    }
  } catch (e) {
    const isReplied = interaction.replied || interaction.deferred;
    const errPayload = {
      embeds: [{ color: 0xe74c3c, title: '❌ Gagal', description: e.message?.slice(0, 500) }],
      flags: MessageFlags.Ephemeral,
    };
    if (isReplied) await interaction.editReply(errPayload);
    else await interaction.reply(errPayload);
  }
  return false;
}

// ══════════════
// TEST POSTS
// ══════════════

async function testYouTubePost(interaction, guildId) {
  const config = getGuildConfig(guildId);
  if (!config.channelId) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Set channel dulu!' }], components: [] });
  }
  const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Channel invalid!' }], components: [] });
  }

  const creator = config.youtube.creators[0];
  if (!creator) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Tambah creator dulu!' }], components: [] });
  }

  try {
    const videos = await getLatestYouTubeVideos(creator, 1);
    if (!videos.length) {
      return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Tidak ada video ditemukan.' }], components: [] });
    }
    const v = videos[0];
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle(`🧪 [TEST] ${v.title.length > 256 ? v.title.slice(0, 253) + '…' : v.title}`)
      .setURL(v.url)
      .setAuthor({ name: creator.name, iconURL: 'https://cdn3.emoji.gg/emojis/2527-youtube.png' })
      .setTimestamp(new Date(v.publishedAt))
      .setFooter({ text: '🧪 Test post — YouTube Notifier' });
    if (v.thumbnail) embed.setImage(v.thumbnail);
    const content = config.youtube.message
      .replace('{creator}', creator.name)
      .replace('{title}', v.title)
      .replace('{url}', v.url)
      .replace('{thumbnail}', v.thumbnail || '');
    await channel.send({ content: content.slice(0, 2000), embeds: [embed], allowedMentions: { parse: [] } });
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: `✅ Test post dikirim ke <#${config.channelId}>` }], components: [] });
  } catch (e) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Test gagal', description: e.message }], components: [] });
  }
}

async function testTwitchPost(interaction, guildId) {
  const config = getGuildConfig(guildId);
  if (!config.channelId) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Set channel dulu!' }], components: [] });
  }
  const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Channel invalid!' }], components: [] });
  }

  const streamer = config.twitch.streamers[0];
  if (!streamer) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Tambah streamer dulu!' }], components: [] });
  }

  try {
    const statuses = await getTwitchStreamStatus([streamer.login]);
    const status = statuses[streamer.login];
    if (!status?.isLive) {
      return interaction.update({ embeds: [{ color: 0xe74c3c, title: `❌ @${streamer.login} tidak sedang live sekarang.`, description: 'Coba lagi waktu mereka live.' }], components: [] });
    }
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder()
      .setColor('#9146ff')
      .setTitle(`🧪 [TEST] ${status.title || '🔴 Live now!'}`)
      .setURL(status.url)
      .setAuthor({ name: streamer.name, iconURL: 'https://cdn3.emoji.gg/emojis/2667-twitch.png' })
      .addFields(
        { name: '🎮 Game', value: status.game || 'Unknown', inline: true },
      )
      .setFooter({ text: '🧪 Test post — Twitch Notifier' })
      .setTimestamp();
    if (status.thumbnail) embed.setImage(status.thumbnail);
    const content = config.twitch.message
      .replace('{streamer}', streamer.name)
      .replace('{title}', status.title || '')
      .replace('{game}', status.game || '')
      .replace('{url}', status.url);
    await channel.send({ content: content.slice(0, 2000), embeds: [embed], allowedMentions: { parse: [] } });
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: `✅ Test post dikirim ke <#${config.channelId}>` }], components: [] });
  } catch (e) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Test gagal', description: e.message }], components: [] });
  }
}
