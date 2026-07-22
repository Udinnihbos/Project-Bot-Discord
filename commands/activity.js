import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, MessageFlags,
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

function panelMain(data, guild) {
  const tracked = data.trackedChannels.length;
  const membersCount = Object.keys(data.members).length;
  const lastMember = Object.entries(data.members)
    .sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0))[0];

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Activity Tracker`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle('⚙️ Activity — Settings')
    .setDescription(
      [
        '> Pantau & publikasi aktivitas chat member.',
        '> Semua perubahan langsung tersimpan otomatis.',
      ].join('\n')
    )
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
        value: data.publishedMessageId ? `✅ \`${data.publishedMessageId}\`` : '❌ Belum dipublish',
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
        .setLabel('◀ Tutup')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelChannels(data, guild) {
  const trackedSet = new Set(data.trackedChannels);
  const allText = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('📡 Pilih Channel yang Di-track')
    .setDescription(
      [
        '> Hanya channel yang dipilih di sini yang akan dihitung aktivitasnya.',
        `> Saat ini: **${data.trackedChannels.length}** channel dipilih.`,
      ].join('\n')
    )
    .setFooter({ text: 'Tip: Kosongkan pilihan untuk menonaktifkan tracking' });

  const rows = [];

  // Channel select
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('act_set_channels_pick')
    .setPlaceholder('📡 Pilih channel… (bisa lebih dari 1)')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(Math.min(25, allText.size));

  if (data.trackedChannels.length) {
    channelSelect.setDefaultChannels(data.trackedChannels.slice(0, 25));
  }
  rows.push(new ActionRowBuilder().addComponents(channelSelect));

  // Quick toggle select (sama tapi dengan select menu string untuk preview)
  const listLines = allText
    .map(c => {
      const on = trackedSet.has(c.id);
      return `${on ? '🟢' : '⚫'} ${on ? '✅' : '❌'} <#${c.id}>`;
    })
    .join('\n');

  embed.addFields({
    name: `📋 Daftar Channel (${allText.size})`,
    value: listLines.slice(0, 1024) || '*Tidak ada channel text*',
  });

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('act_set_channels_all').setLabel('✅ Pilih Semua').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('act_set_channels_none').setLabel('❌ Hapus Semua').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
  ));

  return { embed, rows };
}

function panelLeaderboard(data, guild) {
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('🏆 Pengaturan Leaderboard')
    .setDescription('Pilih channel tempat leaderboard akan di-publish. Leaderboard akan di-post sebagai pesan baru dan dapat di-auto-update.')
    .addFields(
      { name: '🏆 Channel Leaderboard', value: data.leaderboardChannelId ? `<#${data.leaderboardChannelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Auto Update', value: data.autoUpdate ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '🚀 Published Message', value: data.publishedMessageId ? `✅ \`${data.publishedMessageId}\`` : '❌ Belum dipublish', inline: false },
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('act_set_lbchannel')
        .setPlaceholder('🏆 Pilih channel leaderboard…')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('act_toggle_autoupdate')
        .setLabel(data.autoUpdate ? '🔴 Matikan Auto Update' : '🟢 Nyalakan Auto Update')
        .setStyle(data.autoUpdate ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(!data.leaderboardChannelId),
      new ButtonBuilder()
        .setCustomId('act_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelResetMenu(data, guild) {
  const memberCount = Object.keys(data.members).length;
  const embed = new EmbedBuilder()
    .setColor(WARN)
    .setTitle('♻️ Reset Data')
    .setDescription('Pilih jenis reset yang ingin dilakukan. **Aksi ini tidak dapat dibatalkan.**')
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

function panelResetMemberSelect(data, guild) {
  const list = getSortedMembers(guild.id).slice(0, 25);

  const embed = new EmbedBuilder()
    .setColor(WARN)
    .setTitle('👤 Pilih Member untuk di-Reset')
    .setDescription('Data aktivitas member yang dipilih akan dihapus total.');

  const rows = [];
  if (list.length === 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('act_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ));
  } else {
    const options = list.map((m, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${m.id}`) // username akan kelihatan di UI sebagai mention
        .setDescription(`${(m.totalMessages || 0).toLocaleString('id-ID')} pesan • Rank #${i + 1}`)
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

// ════════════════════════════════════════
// PUBLISH / UPDATE LEADERBOARD
// ════════════════════════════════════════

async function publishLeaderboard(guild, channelId, data) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const rows = getSortedMembers(guild.id);
  const { embed, components } = buildLeaderboardEmbed({ guild, rows, page: 0, pageSize: PAGE_SIZE });

  // Try to edit existing message
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
// INTERACTION RENDER
// ════════════════════════════════════════

async function render(target, guildId, state, guild) {
  const data = getGuildActivity(guildId);
  let panel;
  switch (state.page) {
    case 'channels': panel = panelChannels(data, guild); break;
    case 'leaderboard': panel = panelLeaderboard(data, guild); break;
    case 'reset': panel = panelResetMenu(data, guild); break;
    case 'reset_member': panel = panelResetMemberSelect(data, guild); break;
    default: panel = panelMain(data, guild); break;
  }
  const payload = { embeds: [panel.embed], components: panel.rows, flags: MessageFlags.Ephemeral };
  if (typeof target.update === 'function') {
    await target.update(payload);
  } else if (typeof target.editReply === 'function') {
    await target.editReply(payload);
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
// COMPONENT HANDLERS (exported for index.js)
// ════════════════════════════════════════

function getStateFromMessage(message) {
  // Encode state in customId where possible; for ephemeral we use in-memory map
  return ephemeralStates.get(message.id) || { page: 'main' };
}

export const ephemeralStates = new Map();

function rememberState(messageId, state) {
  ephemeralStates.set(messageId, state);
  // auto-cleanup 30 menit
  setTimeout(() => ephemeralStates.delete(messageId), 30 * 60 * 1000).unref?.();
}

export async function handleActivityComponent(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('act_')) return false;
  if (!isOwnerOrAdmin(interaction)) {
    return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const data = getGuildActivity(guildId);

  // ── Navigation buttons ──
  if (interaction.customId === 'act_back_main') {
    rememberState(interaction.message.id, { page: 'main' });
    return render(interaction, guildId, { page: 'main' }, guild);
  }

  if (interaction.customId === 'act_set_channels') {
    rememberState(interaction.message.id, { page: 'channels' });
    return render(interaction, guildId, { page: 'channels' }, guild);
  }

  if (interaction.customId === 'act_set_leaderboard') {
    rememberState(interaction.message.id, { page: 'leaderboard' });
    return render(interaction, guildId, { page: 'leaderboard' }, guild);
  }

  if (interaction.customId === 'act_reset_menu') {
    rememberState(interaction.message.id, { page: 'reset' });
    return render(interaction, guildId, { page: 'reset' }, guild);
  }

  if (interaction.customId === 'act_reset_member') {
    rememberState(interaction.message.id, { page: 'reset_member' });
    return render(interaction, guildId, { page: 'reset_member' }, guild);
  }

  // ── Toggle Enable ──
  if (interaction.customId === 'act_set_toggle') {
    data.enabled = !data.enabled;
    saveGuildActivity(guildId, data);
    const embed = new EmbedBuilder()
      .setColor(data.enabled ? SUCCESS : WARN)
      .setTitle(data.enabled ? '🟢 Activity Diaktifkan' : '🔴 Activity Dinonaktifkan')
      .setDescription(
        data.enabled
          ? 'Bot sekarang akan melacak chat member di channel yang dipilih.'
          : 'Pelacakan chat dihentikan. Data tetap tersimpan.'
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return render(interaction, guildId, { page: 'main' }, guild);
  }

  // ── Auto Update Toggle (inside leaderboard panel) ──
  if (interaction.customId === 'act_toggle_autoupdate' || interaction.customId === 'act_set_autoupdate') {
    if (!data.leaderboardChannelId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(WARN).setTitle('⚠️ Channel Leaderboard Belum Diset').setDescription('Pilih channel leaderboard dulu.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    data.autoUpdate = !data.autoUpdate;
    saveGuildActivity(guildId, data);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(data.autoUpdate ? SUCCESS : MUTED).setTitle(data.autoUpdate ? '🔄 Auto Update Aktif' : '⏸️ Auto Update Nonaktif').setDescription(data.autoUpdate ? 'Leaderboard akan di-update otomatis setiap kali ada pesan baru.' : 'Leaderboard tidak akan di-update otomatis.')],
      flags: MessageFlags.Ephemeral,
    });
    return render(interaction, guildId, { page: 'main' }, guild);
  }

  // ── Quick select all / none ──
  if (interaction.customId === 'act_set_channels_all') {
    const allText = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .map(c => c.id);
    data.trackedChannels = allText;
    saveGuildActivity(guildId, data);
    return render(interaction, guildId, { page: 'channels' }, guild);
  }
  if (interaction.customId === 'act_set_channels_none') {
    data.trackedChannels = [];
    saveGuildActivity(guildId, data);
    return render(interaction, guildId, { page: 'channels' }, guild);
  }

  // ── Publish / Update Leaderboard ──
  if (interaction.customId === 'act_publish') {
    if (!data.enabled || !data.leaderboardChannelId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(WARN).setTitle('⚠️ Belum Lengkap').setDescription('Aktifkan tracker dan pilih channel leaderboard dulu.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    const newMsgId = await publishLeaderboard(guild, data.leaderboardChannelId, data);
    if (newMsgId) {
      data.publishedMessageId = newMsgId;
      saveGuildActivity(guildId, data);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('🚀 Leaderboard Dipublish').setDescription(`Leaderboard berhasil dikirim ke <#${data.leaderboardChannelId}>.\n\`messageId: ${newMsgId}\``)],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Gagal Publish').setDescription('Bot tidak bisa mengirim pesan ke channel tersebut.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    return render(interaction, guildId, { page: 'main' }, guild);
  }

  if (interaction.customId === 'act_clear_message') {
    data.publishedMessageId = null;
    saveGuildActivity(guildId, data);
    return render(interaction, guildId, { page: 'main' }, guild);
  }

  // ── Reset confirmations ──
  if (interaction.customId === 'act_reset_server') {
    // Show confirm modal
    const modal = new ModalBuilder()
      .setCustomId('act_reset_server_modal')
      .setTitle('Konfirmasi Reset Server');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm')
          .setLabel('Ketik "RESET" untuk konfirmasi')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('RESET')
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Leaderboard paging (public) ──
  if (interaction.customId === 'act_lb_prev' || interaction.customId === 'act_lb_next' || interaction.customId === 'act_lb_refresh') {
    const footerText = interaction.message.embeds[0]?.footer?.text || '';
    const m = footerText.match(/Halaman\s+(\d+)\s*\/\s*(\d+)/);
    // Decode from customId? we can re-render fresh
    const data2 = getGuildActivity(guildId);
    if (!data2.enabled) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUTED).setTitle('Tracker Nonaktif')], flags: MessageFlags.Ephemeral });
    }
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
// SELECT MENU & MODAL HANDLERS (also for index.js)
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

  // Channel multi-select (tracked channels)
  if (interaction.isChannelSelectMenu() && interaction.customId === 'act_set_channels_pick') {
    data.trackedChannels = interaction.values;
    saveGuildActivity(guildId, data);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('✅ Channel Diperbarui').setDescription(`${data.trackedChannels.length} channel dipilih untuk di-track.`)],
      flags: MessageFlags.Ephemeral,
    });
    return render(interaction.message, guildId, { page: 'channels' }, guild);
  }

  // Channel select for leaderboard
  if (interaction.isChannelSelectMenu() && interaction.customId === 'act_set_lbchannel') {
    data.leaderboardChannelId = interaction.values[0];
    saveGuildActivity(guildId, data);
    const okEmbed = new EmbedBuilder()
      .setColor(SUCCESS)
      .setTitle('🏆 Channel Leaderboard Diset')
      .setDescription(`Leaderboard channel: <#${data.leaderboardChannelId}>`)
      .setFooter({ text: 'Klik "🟢 Auto Update" untuk mengaktifkan auto update.' })
      .setTimestamp();
    await interaction.reply({ embeds: [okEmbed], flags: MessageFlags.Ephemeral });
    return render(interaction.message, guildId, { page: 'main' }, guild);
  }

  // Reset member select
  if (interaction.isStringSelectMenu() && interaction.customId === 'act_reset_member_pick') {
    const targetId = interaction.values[0];
    const target = await guild.members.fetch(targetId).catch(() => null);
    const tag = target ? `<@${targetId}>` : `\`${targetId}\``;
    const modal = new ModalBuilder()
      .setCustomId(`act_reset_member_modal:${targetId}`)
      .setTitle('Konfirmasi Reset Member');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm')
          .setLabel(`Ketik "RESET" untuk konfirmasi reset ${tag}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('RESET')
      ),
    );
    return interaction.showModal(modal);
  }

  return false;
}

export async function handleActivityModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('act_')) return false;
  if (!isOwnerOrAdmin(interaction)) {
    return interaction.reply({ embeds: [ownerOnlyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }
  const guildId = interaction.guildId;
  const data = getGuildActivity(guildId);

  if (interaction.customId === 'act_reset_server_modal') {
    const confirm = interaction.fields.getTextInputValue('confirm');
    if (confirm !== 'RESET') {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(WARN).setTitle('⚠️ Dibatalkan').setDescription('Konfirmasi salah. Ketik **RESET** (huruf besar semua).')], flags: MessageFlags.Ephemeral });
    }
    const count = Object.keys(data.members).length;
    resetGuild(guildId);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('♻️ Server Direset').setDescription(`Data aktivitas **${count}** member berhasil dihapus.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.customId.startsWith('act_reset_member_modal:')) {
    const targetId = interaction.customId.split(':')[1];
    const confirm = interaction.fields.getTextInputValue('confirm');
    if (confirm !== 'RESET') {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(WARN).setTitle('⚠️ Dibatalkan')], flags: MessageFlags.Ephemeral });
    }
    const before = getMemberActivity(guildId, targetId);
    const total = before?.totalMessages || 0;
    resetMember(guildId, targetId);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('♻️ Member Direset').setDescription(`Data aktivitas <@${targetId}> (${total.toLocaleString('id-ID')} pesan) telah dihapus.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  return false;
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
