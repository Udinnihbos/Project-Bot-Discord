import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
  ChannelType, MessageFlags,
} from 'discord.js';
import {
  getGuildActivity, saveGuildActivity, recordMessage,
  getMemberActivity, getActivityRank, getSortedMembers,
  resetMember, resetGuild,
} from '../utils/activityConfig.js';
import {
  buildActivityProfile, buildLeaderboardEmbed, ACCENT, SUCCESS, DANGER, WARN, MUTED,
} from '../utils/activityUI.js';

const PAGE_SIZE = 10;

function isOwnerOrAdmin(interaction) {
  // Server Owner only (paling ketat sesuai spek)
  return interaction.guild?.ownerId === interaction.user.id;
}

function ownerOnlyEmbed(interaction) {
  return new EmbedBuilder()
    .setColor(DANGER)
    .setTitle('🔒 Akses Ditolak')
    .setDescription(`Maaf <@${interaction.user.id}>, command \`/activity settings\` hanya bisa dipakai oleh **Server Owner**.\n\nSilakan hubungi owner server (<@${interaction.guild?.ownerId}>) untuk melakukan perubahan.`);
}

// ════════════════════════════════════════
// PANEL BUILDERS
// ════════════════════════════════════════

function panelMain(data, guild, flash = null) {
  const tracked = data.trackedChannels.length;
  const membersCount = Object.keys(data.members).length;
  const lastMember = Object.entries(data.members)
    .sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0))[0];

  const descriptionLines = [
    '> Pantau & publikasi aktivitas chat member.',
    '> Semua perubahan langsung tersimpan otomatis.',
  ];
  if (flash) descriptionLines.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Activity Tracker`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle('⚙️ Activity — Settings')
    .setDescription(descriptionLines.join('\n'))
    .addFields(
      {
        name: '🟢 Status',
        value: data.enabled ? '✅ **Aktif**' : '❌ **Nonaktif**',
        inline: true,
      },
      {
        name: '📡 Channel Tracked',
        value: tracked ? `${tracked} channel` : '*Belum ada*',
        inline: true,
      },
      {
        name: '🏆 Leaderboard Channel',
        value: data.leaderboardChannelId ? `<#${data.leaderboardChannelId}>` : '❌ Belum diset',
        inline: true,
      },
      {
        name: '🚀 Published',
        value: data.publishedMessageId ? `✅ Dipublish` : '❌ Belum dipublish',
        inline: true,
      },
      {
        name: '🔄 Auto Update',
        value: data.autoUpdate ? '✅ Aktif' : '❌ Nonaktif',
        inline: true,
      },
      {
        name: '👥 Member Terdata',
        value: `${membersCount} orang`,
        inline: true,
      },
      {
        name: '⚡ Last Active Member',
        value: lastMember
          ? `<@${lastMember[0]}> — <t:${Math.floor((lastMember[1].lastActive || 0) / 1000)}:R>`
          : '*Belum ada*',
        inline: false,
      },
    )
    .setFooter({ text: 'Activity Tracker • Klik tombol di bawah untuk mengelola' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_set_toggle')
        .setLabel(data.enabled ? '🔴 Nonaktifkan' : '🟢 Aktifkan')
        .setStyle(data.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('act_set_channels')
        .setLabel('📡 Channel Tracked')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('act_set_leaderboard')
        .setLabel('🏆 Leaderboard')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_set_autoupdate')
        .setLabel(data.autoUpdate ? '🔴 Matikan Auto Update' : '🟢 Auto Update')
        .setStyle(data.autoUpdate ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(!data.leaderboardChannelId),
      new ButtonBuilder()
        .setCustomId('act_publish')
        .setLabel('🚀 Publish / Update')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!data.enabled || !data.leaderboardChannelId),
      new ButtonBuilder()
        .setCustomId('act_clear_message')
        .setLabel('🗑️ Reset Published')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!data.publishedMessageId),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_reset_menu')
        .setLabel('♻️ Reset Data')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('act_back_main')
        .setLabel('✖ Tutup Panel')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelChannels(data, guild, flash = null) {
  const trackedSet = new Set(data.trackedChannels);
  const allText = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const desc = [
    '> Hanya channel yang dipilih di sini yang akan dihitung aktivitasnya.',
    `> Saat ini: **${data.trackedChannels.length}** channel dipilih.`,
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('📡 Pilih Channel yang Di-track')
    .setDescription(desc.join('\n'))
    .setFooter({ text: 'Tip: Pilih channel lalu tekan Enter / klik di luar menu untuk menyimpan' });

  const rows = [];

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('act_set_channels_pick')
    .setPlaceholder('📡 Pilih channel… (bisa lebih dari 1)')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(Math.min(25, Math.max(1, allText.size)));

  if (data.trackedChannels.length) {
    channelSelect.setDefaultChannels(data.trackedChannels.slice(0, 25));
  }
  rows.push(new ActionRowBuilder().addComponents(channelSelect));

  const listLines = allText.size
    ? allText
      .map(c => `${trackedSet.has(c.id) ? '🟢 ✅' : '⚫ ❌'} <#${c.id}>`)
      .join('\n')
    : '*Tidak ada channel text*';

  embed.addFields({
    name: `📋 Daftar Channel (${allText.size})`,
    value: listLines.slice(0, 1024),
  });

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('act_set_channels_all').setLabel('✅ Pilih Semua').setStyle(ButtonStyle.Success).setDisabled(allText.size === 0),
    new ButtonBuilder().setCustomId('act_set_channels_none').setLabel('❌ Hapus Semua').setStyle(ButtonStyle.Danger).setDisabled(data.trackedChannels.length === 0),
    new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
  ));

  return { embed, rows };
}

function panelLeaderboard(data, guild, flash = null) {
  const desc = [
    '> Pilih channel tempat leaderboard akan di-publish.',
    '> Auto-update akan memperbarui pesan setiap ada pesan baru.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('🏆 Pengaturan Leaderboard')
    .setDescription(desc.join('\n'))
    .addFields(
      { name: '🏆 Channel Leaderboard', value: data.leaderboardChannelId ? `<#${data.leaderboardChannelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Auto Update', value: data.autoUpdate ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '🚀 Published Message', value: data.publishedMessageId ? '✅ Sudah dipublish' : '❌ Belum dipublish', inline: false },
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('act_set_lbchannel')
        .setPlaceholder(data.leaderboardChannelId ? `📍 Saat ini: #${guild.channels.cache.get(data.leaderboardChannelId)?.name || 'unknown'} — klik untuk ganti` : '🏆 Pilih channel leaderboard…')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_toggle_autoupdate')
        .setLabel(data.autoUpdate ? '🔴 Matikan Auto Update' : '🟢 Nyalakan Auto Update')
        .setStyle(data.autoUpdate ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(!data.leaderboardChannelId),
      new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelResetMenu(data, guild, flash = null) {
  const memberCount = Object.keys(data.members).length;
  const desc = [
    '> Pilih jenis reset yang ingin dilakukan.',
    '> **Aksi ini tidak dapat dibatalkan.**',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(WARN)
    .setTitle('♻️ Reset Data')
    .setDescription(desc.join('\n'))
    .addFields(
      { name: '👥 Member Terdata', value: `${memberCount} orang`, inline: true },
      { name: '⚠️ Peringatan', value: 'Data yang dihapus tidak bisa dikembalikan', inline: true },
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_reset_member')
        .setLabel('👤 Reset Member')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(memberCount === 0),
      new ButtonBuilder()
        .setCustomId('act_reset_server')
        .setLabel('🗑️ Reset Server')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(memberCount === 0),
      new ButtonBuilder()
        .setCustomId('act_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelResetMemberSelect(data, guild, flash = null) {
  const list = getSortedMembers(guild.id).slice(0, 25);

  const desc = [
    '> Pilih member dari menu, lalu konfirmasi di pop-up yang muncul.',
    '> Data aktivitas member yang dipilih akan dihapus total.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(WARN)
    .setTitle('👤 Pilih Member untuk di-Reset')
    .setDescription(desc.join('\n'));

  const rows = [];
  if (list.length === 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ));
  } else {
    const options = list.map((m, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`Rank #${i + 1} — ${(m.totalMessages || 0).toLocaleString('id-ID')} pesan`)
        .setDescription(`ID: ${m.id}`)
        .setValue(m.id)
        .setEmoji('👤')
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('act_reset_member_pick')
        .setPlaceholder('👤 Pilih member…')
        .addOptions(options),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ));
  }

  return { embed, rows };
}

function panelClosed() {
  const embed = new EmbedBuilder()
    .setColor(MUTED)
    .setTitle('✖ Panel Ditutup')
    .setDescription('Panel settings sudah ditutup.\n\nBuka lagi kapan saja dengan `/activity settings`.')
    .setFooter({ text: 'Activity Tracker' })
    .setTimestamp();
  return { embed, rows: [] };
}

// ════════════════════════════════════════
// PUBLISH / UPDATE LEADERBOARD
// ════════════════════════════════════════

async function publishLeaderboard(guild, channelId, data) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const rows = getSortedMembers(guild.id);
  const { embed, components } = buildLeaderboardEmbed({ guild, rows, page: 0, pageSize: PAGE_SIZE });

  if (data.publishedMessageId) {
    try {
      const msg = await channel.messages.fetch(data.publishedMessageId);
      await msg.edit({ embeds: [embed], components });
      return msg.id;
    } catch (_) {
      // Message not found, fall through to send new
    }
  }

  const newMsg = await channel.send({ embeds: [embed], components });
  return newMsg.id;
}

// ════════════════════════════════════════
// INTERACTION RENDER — edit in place
// ════════════════════════════════════════

/**
 * Render panel by editing the original interaction message IN PLACE.
 * `target` is the interaction; we call `editReply()` if we already replied,
 * otherwise we fall back to `update()`.
 */
async function renderInPlace(interaction, guildId, page, guild, flash = null) {
  const data = getGuildActivity(guildId);
  let panel;
  switch (page) {
    case 'channels': panel = panelChannels(data, guild, flash); break;
    case 'leaderboard': panel = panelLeaderboard(data, guild, flash); break;
    case 'reset': panel = panelResetMenu(data, guild, flash); break;
    case 'reset_member': panel = panelResetMemberSelect(data, guild, flash); break;
    case 'closed': panel = panelClosed(); break;
    default: panel = panelMain(data, guild, flash); break;
  }
  const payload = { embeds: [panel.embed], components: panel.rows };
  // Always use editReply since the message was created with deferUpdate/reply
  if (interaction.editReply) {
    await interaction.editReply(payload);
  } else {
    await interaction.update(payload);
  }
}

// ════════════════════════════════════════
// SLASH COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('activity')
  .setDescription('📊 Activity Tracker — lihat & kelola aktivitas chat member')
  .addSubcommand(sub =>
    sub.setName('settings')
      .setDescription('⚙️ [OWNER] Buka panel pengaturan Activity Tracker')
  )
  .addSubcommand(sub =>
    sub.setName('profile')
      .setDescription('📊 Lihat profil aktivitas chat')
      .addUserOption(opt => opt.setName('user').setDescription('User yang ingin dilihat (default: kamu)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('leaderboard')
      .setDescription('🏆 Lihat leaderboard aktivitas chat member')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'settings') {
    if (!isOwnerOrAdmin(interaction)) {
      return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
    }
    const data = getGuildActivity(guildId);
    const panel = panelMain(data, interaction.guild);
    return interaction.reply({ embeds: [panel.embed], components: panel.rows, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'profile') {
    const target = interaction.options.getUser('user') || interaction.user;
    const member = getMemberActivity(guildId, target.id);
    const data = getGuildActivity(guildId);

    if (!data.enabled) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(MUTED)
            .setTitle('📊 Activity Tracker — Nonaktif')
            .setDescription('Activity Tracker belum diaktifkan di server ini.\nMinta server owner untuk mengaktifkannya via `/activity settings`.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const rank = getActivityRank(guildId, target.id);
    const totalMembers = Object.keys(data.members).length;
    const embed = buildActivityProfile({
      guild: interaction.guild,
      targetUser: target,
      member,
      rank,
      totalMembers,
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'leaderboard') {
    const data = getGuildActivity(guildId);
    if (!data.enabled) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(MUTED)
            .setTitle('🏆 Leaderboard — Nonaktif')
            .setDescription('Activity Tracker belum diaktifkan di server ini.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    const rows = getSortedMembers(guildId);
    const { embed, components } = buildLeaderboardEmbed({ guild: interaction.guild, rows, page: 0, pageSize: PAGE_SIZE });
    return interaction.reply({ embeds: [embed], components });
  }
}

// ════════════════════════════════════════
// BUTTON HANDLER — edit in place
// ════════════════════════════════════════

export async function handleActivityComponent(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('act_')) return false;
  if (!isOwnerOrAdmin(interaction)) {
    return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;

  // Defer update first so we can safely edit the message
  // (must be done BEFORE any heavy work to avoid 3s timeout)
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch (_) { /* may already be deferred */ }

  const data = getGuildActivity(guildId);

  // ── Tutup panel ──
  if (interaction.customId === 'act_back_main' || interaction.customId === 'act_close') {
    // If we're on the main settings panel, close it; otherwise navigate to main.
    const e = interaction.message.embeds[0];
    const title = (e?.title || e?.data?.title || '');
    if (title.includes('Activity — Settings')) {
      return renderInPlace(interaction, guildId, 'closed', guild);
    }
    return renderInPlace(interaction, guildId, 'main', guild);
  }

  // ── Navigation ──
  if (interaction.customId === 'act_set_channels') {
    return renderInPlace(interaction, guildId, 'channels', guild);
  }
  if (interaction.customId === 'act_set_leaderboard') {
    return renderInPlace(interaction, guildId, 'leaderboard', guild);
  }
  if (interaction.customId === 'act_reset_menu') {
    return renderInPlace(interaction, guildId, 'reset', guild);
  }
  if (interaction.customId === 'act_reset_member') {
    return renderInPlace(interaction, guildId, 'reset_member', guild);
  }

  // ── Toggle Enable (langsung update di tempat) ──
  if (interaction.customId === 'act_set_toggle') {
    data.enabled = !data.enabled;
    saveGuildActivity(guildId, data);
    return renderInPlace(
      interaction, guildId, 'main', guild,
      data.enabled
        ? '🟢 **Activity diaktifkan** — bot sekarang melacak chat member.'
        : '🔴 **Activity dinonaktifkan** — pelacakan dihentikan, data tetap tersimpan.'
    );
  }

  // ── Auto Update Toggle ──
  if (interaction.customId === 'act_toggle_autoupdate' || interaction.customId === 'act_set_autoupdate') {
    if (!data.leaderboardChannelId) {
      return renderInPlace(interaction, guildId, 'leaderboard', guild, '⚠️ Pilih channel leaderboard dulu sebelum menyalakan auto update.');
    }
    data.autoUpdate = !data.autoUpdate;
    saveGuildActivity(guildId, data);
    return renderInPlace(
      interaction, guildId, 'leaderboard', guild,
      data.autoUpdate
        ? '🔄 **Auto Update aktif** — leaderboard akan ter-update otomatis.'
        : '⏸️ **Auto Update dimatikan** — leaderboard tidak akan auto-update.'
    );
  }

  // ── Pilih semua / hapus semua channel ──
  if (interaction.customId === 'act_set_channels_all') {
    const allText = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .map(c => c.id);
    data.trackedChannels = allText;
    saveGuildActivity(guildId, data);
    return renderInPlace(interaction, guildId, 'channels', guild, `✅ **${allText.length} channel** dipilih untuk di-track.`);
  }
  if (interaction.customId === 'act_set_channels_none') {
    data.trackedChannels = [];
    saveGuildActivity(guildId, data);
    return renderInPlace(interaction, guildId, 'channels', guild, '❌ Semua channeltracked telah dihapus.');
  }

  // ── Publish / Update Leaderboard ──
  if (interaction.customId === 'act_publish') {
    if (!data.enabled || !data.leaderboardChannelId) {
      return renderInPlace(interaction, guildId, 'main', guild, '⚠️ Aktifkan tracker dan pilih channel leaderboard dulu.');
    }
    const newMsgId = await publishLeaderboard(guild, data.leaderboardChannelId, data);
    if (newMsgId) {
      data.publishedMessageId = newMsgId;
      saveGuildActivity(guildId, data);
      return renderInPlace(interaction, guildId, 'main', guild, `🚀 **Leaderboard dipublish** ke <#${data.leaderboardChannelId}>.`);
    } else {
      return renderInPlace(interaction, guildId, 'main', guild, '❌ Gagal publish — bot tidak bisa mengirim pesan ke channel tersebut (cek permission).');
    }
  }

  if (interaction.customId === 'act_clear_message') {
    data.publishedMessageId = null;
    saveGuildActivity(guildId, data);
    return renderInPlace(interaction, guildId, 'main', guild, '🗑️ **Published message** direset. Klik "🚀 Publish" untuk publish ulang.');
  }

  // ── Reset server → tampilkan modal konfirmasi ──
  if (interaction.customId === 'act_reset_server') {
    // Modal CANNOT be shown after deferUpdate. So we need a different flow:
    // Edit the message with a "confirm" panel that has a confirm + cancel button.
    const embed = new EmbedBuilder()
      .setColor(DANGER)
      .setTitle('⚠️ Konfirmasi Reset Server')
      .setDescription(
        [
          '> Tindakan ini akan **menghapus total** data aktivitas **semua member** di server ini.',
          '> **Aksi ini tidak bisa dibatalkan!**',
          '',
          '> Tekan **Konfirmasi** untuk lanjut, atau **Batal** untuk membatalkan.',
        ].join('\n')
      )
      .setFooter({ text: 'Activity Tracker • Konfirmasi Reset' })
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('act_reset_server_confirm')
          .setLabel('✅ Konfirmasi Reset')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('act_reset_server_cancel')
          .setLabel('❌ Batal')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Reset server: konfirmasi (step 2) ──
  if (interaction.customId === 'act_reset_server_confirm') {
    const count = Object.keys(data.members).length;
    resetGuild(guildId);
    return renderInPlace(
      interaction, guildId, 'main', guild,
      `🗑️ **Server direset** — data **${count}** member telah dihapus total.`
    );
  }

  if (interaction.customId === 'act_reset_server_cancel') {
    return renderInPlace(interaction, guildId, 'reset', guild, '↩️ Dibatalkan.');
  }

  // ── Reset member: konfirmasi (step 2) ──
  if (interaction.customId.startsWith('act_reset_member_confirm:')) {
    const targetId = interaction.customId.split(':')[1];
    const before = getMemberActivity(guildId, targetId);
    const total = before?.totalMessages || 0;
    resetMember(guildId, targetId);
    return renderInPlace(
      interaction, guildId, 'main', guild,
      `♻️ **Member direset** — <@${targetId}> (${total.toLocaleString('id-ID')} pesan) telah dihapus.`
    );
  }

  if (interaction.customId === 'act_reset_member_cancel') {
    return renderInPlace(interaction, guildId, 'reset_member', guild, '↩️ Dibatalkan.');
  }

  // ── Leaderboard paging (public) ──
  if (interaction.customId === 'act_lb_prev' || interaction.customId === 'act_lb_next' || interaction.customId === 'act_lb_refresh') {
    const data2 = getGuildActivity(guildId);
    if (!data2.enabled) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(MUTED).setTitle('Tracker Nonaktif').setDescription('Activity Tracker sudah dinonaktifkan.')],
        components: [],
      });
    }
    const footerText = interaction.message.embeds[0]?.footer?.text || interaction.message.embeds[0]?.data?.footer?.text || '';
    const m = footerText.match(/Halaman\s+(\d+)\s*\/\s*(\d+)/);
    let page = 0;
    if (m) {
      page = parseInt(m[1], 10) - 1;
      if (interaction.customId === 'act_lb_next') page += 1;
      if (interaction.customId === 'act_lb_prev') page -= 1;
    }
    const rows = getSortedMembers(guildId);
    const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    page = Math.max(0, Math.min(maxPage, page));
    const { embed, components } = buildLeaderboardEmbed({ guild, rows, page, pageSize: PAGE_SIZE });
    return interaction.update({ embeds: [embed], components });
  }

  return false;
}

// ════════════════════════════════════════
// SELECT MENU HANDLER — edit in place
// ════════════════════════════════════════

export async function handleActivitySelect(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('act_')) return false;
  if (!isOwnerOrAdmin(interaction)) {
    return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const data = getGuildActivity(guildId);

  // Defer so we can editReply cleanly
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch (_) { /* */ }

  // ── Channel multi-select (tracked channels) ──
  if (interaction.isChannelSelectMenu() && interaction.customId === 'act_set_channels_pick') {
    data.trackedChannels = interaction.values;
    saveGuildActivity(guildId, data);
    return renderInPlace(
      interaction, guildId, 'channels', guild,
      `✅ **${data.trackedChannels.length} channel** dipilih untuk di-track.`
    );
  }

  // ── Channel select for leaderboard ──
  if (interaction.isChannelSelectMenu() && interaction.customId === 'act_set_lbchannel') {
    data.leaderboardChannelId = interaction.values[0];
    saveGuildActivity(guildId, data);
    return renderInPlace(
      interaction, guildId, 'leaderboard', guild,
      `🏆 **Channel leaderboard diset** ke <#${data.leaderboardChannelId}>. Sekarang bisa publish atau nyalakan auto update.`
    );
  }

  // ── Reset member select ──
  if (interaction.isStringSelectMenu() && interaction.customId === 'act_reset_member_pick') {
    const targetId = interaction.values[0];
    const target = await guild.members.fetch(targetId).catch(() => null);
    const tag = target ? `<@${targetId}>` : `\`${targetId}\``;
    const memberData = getMemberActivity(guildId, targetId);
    const total = memberData?.totalMessages || 0;

    // Show confirm panel in place (because we can't show modal after deferUpdate)
    const embed = new EmbedBuilder()
      .setColor(DANGER)
      .setTitle('⚠️ Konfirmasi Reset Member')
      .setDescription(
        [
          `> Tindakan ini akan **menghapus total** data aktivitas ${tag}.`,
          `> Total pesan saat ini: **${total.toLocaleString('id-ID')}**`,
          '> **Aksi ini tidak bisa dibatalkan!**',
          '',
          '> Tekan **Konfirmasi** untuk lanjut, atau **Batal** untuk membatalkan.',
        ].join('\n')
      )
      .setFooter({ text: 'Activity Tracker • Konfirmasi Reset Member' })
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`act_reset_member_confirm:${targetId}`)
          .setLabel('✅ Konfirmasi Reset')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('act_reset_member_cancel')
          .setLabel('❌ Batal')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    return interaction.editReply({ embeds: [embed], components: rows });
  }

  return false;
}

// ════════════════════════════════════════
// MODAL HANDLER (no longer used for resets, but keep for backward-compat safety)
// ════════════════════════════════════════

export async function handleActivityModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('act_')) return false;
  if (!isOwnerOrAdmin(interaction)) {
    return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }
  // Just acknowledge; current flow uses buttons instead of modals
  return interaction.reply({ content: 'ℹ️ Flow ini sudah diganti ke konfirmasi button. Silakan buka `/activity settings` lagi.', flags: MessageFlags.Ephemeral });
}

// ════════════════════════════════════════
// MESSAGE LISTENER (called by index.js)
// ════════════════════════════════════════

export async function handleActivityMessageCreate(message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.client) return;

  const data = getGuildActivity(message.guild.id);
  if (!data.enabled) return;
  if (!data.trackedChannels.includes(message.channelId)) return;

  recordMessage(message.guild.id, message.author.id, message.channelId);

  // Auto update published leaderboard
  if (data.autoUpdate && data.leaderboardChannelId && data.publishedMessageId) {
    try {
      const channel = await message.guild.channels.fetch(data.leaderboardChannelId);
      if (channel) {
        const rows = getSortedMembers(message.guild.id);
        const { embed, components } = buildLeaderboardEmbed({ guild: message.guild, rows, page: 0, pageSize: PAGE_SIZE });
        const msg = await channel.messages.fetch(data.publishedMessageId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [embed], components }).catch(() => {});
        }
      }
    } catch (e) {
      // Silent fail
    }
  }
}
