import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelType, MessageFlags,
} from 'discord.js';
import {
  getMusicConfig, saveMusicConfig,
} from '../music/config.js';
import { getGuildState, patchGuildState } from '../music/state.js';
import { setLoop, setVolume, getPlayerStatus, formatDuration, isPaused } from '../music/player.js';
import { getFavorites } from '../music/favorites.js';
import { listPlaylists } from '../music/playlist.js';

const ACCENT = 0x1DB954;
const SUCCESS = 0x2ecc71;
const DANGER = 0xe74c3c;
const WARN = 0xf39c12;
const MUTED = 0x95a5a6;

const AUTO_LEAVE_OPTIONS = [
  { v: 0,  l: '🚫 Never' },
  { v: 1,  l: '1 menit' },
  { v: 5,  l: '5 menit' },
  { v: 10, l: '10 menit' },
  { v: 15, l: '15 menit' },
  { v: 30, l: '30 menit' },
];

function panelMain(data, guild, flash = null) {
  const state = getGuildState(guild.id);
  const desc = [
    '> Konfigurasi music player per-server.',
    '> Semua perubahan langsung tersimpan otomatis.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Music Settings`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle('⚙️ Music — Settings')
    .setDescription(desc.join('\n'))
    .addFields(
      {
        name: '🕐 24/7 Mode',
        value: data['247'] ? '✅ **Aktif** — bot stay di VC terus' : '❌ Nonaktif — bot leave saat queue kosong',
        inline: false,
      },
      {
        name: '⏱️ Auto-Leave',
        value: data.autoLeaveMinutes === 0
          ? '🚫 **Never** (bot stay)'
          : `⏱️ ${data.autoLeaveMinutes} menit setelah VC kosong`,
        inline: true,
      },
      {
        name: '👑 DJ Role',
        value: data.djRoleId
          ? `<@&${data.djRoleId}> (boleh kontrol playback)`
          : '*Belum diset* (cuma Owner & Admin)',
        inline: true,
      },
      {
        name: '📢 Announce Channel',
        value: data.announceChannelId
          ? `<#${data.announceChannelId}> (post info lagu baru)`
          : '*Off* (post di channel tempat /play)',
        inline: true,
      },
      {
        name: '🌐 Language',
        value: data.language === 'en' ? '🇬🇧 English' : '🇮🇩 Bahasa Indonesia',
        inline: true,
      },
      {
        name: '🎵 State Saat Ini',
        value: `Loop: \`${state.loop}\` • Volume: \`${state.volume}%\` • Queue: \`${state.queue.length}\``,
        inline: false,
      },
    )
    .setFooter({ text: '🎶 Music Player • Klik tombol di bawah untuk mengelola' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_247')
        .setLabel(data['247'] ? '🔴 Matikan 24/7' : '🟢 Nyalakan 24/7')
        .setStyle(data['247'] ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mset_autoleave')
        .setLabel('⏱️ Auto-Leave')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mset_djrole')
        .setLabel('👑 DJ Role')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_announce')
        .setLabel('📢 Announce Channel')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mset_language')
        .setLabel('🌐 Language')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mset_clear_dj')
        .setLabel('🗑️ Reset DJ Role')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!data.djRoleId),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_reset_confirm')
        .setLabel('♻️ Reset Music Config')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('mset_close')
        .setLabel('✖ Tutup Panel')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelAutoLeave(data, guild, flash = null) {
  const desc = [
    '> Pilih berapa lama bot akan leave VC setelah sendirian (gak ada user lain).',
    '> Tidak berlaku kalau 24/7 mode aktif.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('⏱️ Auto-Leave Settings')
    .setDescription(desc.join('\n'))
    .addFields({
      name: '⏱️ Durasi Saat Ini',
      value: data.autoLeaveMinutes === 0 ? '🚫 Never' : `${data.autoLeaveMinutes} menit`,
      inline: true,
    })
    .setFooter({ text: 'Pilih dari menu di bawah' });

  const select = new StringSelectMenuBuilder()
    .setCustomId('mset_autoleave_pick')
    .setPlaceholder('⏱️ Pilih durasi auto-leave…');

  for (const opt of AUTO_LEAVE_OPTIONS) {
    select.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(opt.l)
      .setValue(String(opt.v))
      .setDefault(String(data.autoLeaveMinutes) === String(opt.v))
      .setEmoji(opt.v === 0 ? '🚫' : '⏱️'),
    );
  }

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mset_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelDJRole(data, guild, flash = null) {
  const desc = [
    '> Pilih role yang boleh kontrol playback (skip/stop/loop/shuffle).',
    '> Cuma role ini, server owner, dan admin yang bisa.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('👑 DJ Role')
    .setDescription(desc.join('\n'))
    .addFields({
      name: '👑 Role Saat Ini',
      value: data.djRoleId ? `<@&${data.djRoleId}>` : '*Belum diset*',
      inline: false,
    })
    .setFooter({ text: 'Pilih role dari menu, atau kosongkan untuk reset' });

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('mset_djrole_pick')
    .setPlaceholder('👑 Pilih role…')
    .setMinValues(0)
    .setMaxValues(1);

  const rows = [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_clear_dj')
        .setLabel('🗑️ Reset DJ Role')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!data.djRoleId),
      new ButtonBuilder()
        .setCustomId('mset_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelAnnounce(data, guild, flash = null) {
  const desc = [
    '> Channel buat auto-post "Now Playing" info setiap ada lagu baru.',
    '> Kalau kosong, post di channel tempat user pakai `/play`.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('📢 Announce Channel')
    .setDescription(desc.join('\n'))
    .addFields({
      name: '📢 Channel Saat Ini',
      value: data.announceChannelId ? `<#${data.announceChannelId}>` : '*Off (post di channel /play)*',
      inline: false,
    })
    .setFooter({ text: 'Pilih channel dari menu, atau kosongkan untuk disable' });

  const chSelect = new ChannelSelectMenuBuilder()
    .setCustomId('mset_announce_pick')
    .setPlaceholder('📢 Pilih channel…')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0)
    .setMaxValues(1);

  const rows = [
    new ActionRowBuilder().addComponents(chSelect),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_clear_announce')
        .setLabel('🗑️ Disable Announce')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!data.announceChannelId),
      new ButtonBuilder()
        .setCustomId('mset_back_main')
        .setLabel('◀ Kembali')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelLanguage(data, guild, flash = null) {
  const desc = [
    '> Bahasa UI untuk panel Now Playing dan embed music.',
    '> Saat ini sebagian besar sudah Bahasa Indonesia.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle('🌐 Language')
    .setDescription(desc.join('\n'))
    .addFields({
      name: '🌐 Bahasa Saat Ini',
      value: data.language === 'en' ? '🇬🇧 English' : '🇮🇩 Bahasa Indonesia',
      inline: true,
    });

  const select = new StringSelectMenuBuilder()
    .setCustomId('mset_lang_pick')
    .setPlaceholder('🌐 Pilih bahasa…')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('🇮🇩 Bahasa Indonesia')
        .setValue('id')
        .setDefault(data.language === 'id'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🇬🇧 English')
        .setValue('en')
        .setDefault(data.language === 'en'),
    );

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mset_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelResetConfirm(data, guild) {
  const embed = new EmbedBuilder()
    .setColor(DANGER)
    .setTitle('⚠️ Konfirmasi Reset Music Config')
    .setDescription(
      [
        '> Tindakan ini akan **mengembalikan semua music config** ke default.',
        '> Data yang di-reset:',
        '> • 24/7 mode',
        '> • Auto-leave duration',
        '> • DJ Role',
        '> • Announce channel',
        '> • Language',
        '',
        '> **Queue & state music TIDAK ikut di-reset.**',
        '',
        '> Tekan **Konfirmasi** untuk lanjut, atau **Batal** untuk membatalkan.',
      ].join('\n')
    )
    .setFooter({ text: '🎶 Music Player • Konfirmasi Reset' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mset_reset_go')
        .setLabel('✅ Konfirmasi Reset')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('mset_back_main')
        .setLabel('❌ Batal')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelClosed() {
  return {
    embed: new EmbedBuilder()
      .setColor(MUTED)
      .setTitle('✖ Panel Ditutup')
      .setDescription('Panel settings music sudah ditutup.\n\nBuka lagi kapan saja dengan `/music settings`.')
      .setFooter({ text: '🎶 Music Player' })
      .setTimestamp(),
    rows: [],
  };
}

// ════════════════════════════════════════
// SLASH COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('🎶 Music Player commands')
  .addSubcommand(sub =>
    sub.setName('settings')
      .setDescription('⚙️ [ADMIN] Buka panel pengaturan music player')
  )
  .addSubcommand(sub =>
    sub.setName('help')
      .setDescription('📖 Lihat daftar semua command music player')
  )
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('🔍 Debug info: connection, queue, listeners, uptime')
  );

function buildHelpEmbed(guild) {
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: `${guild.name} • Music Help`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle('📖 Music Player — Daftar Command')
    .setDescription('Semua command music player. Klik tiap section untuk info lebih lanjut.')
    .addFields(
      {
        name: '▶️ **Playback**',
        value: [
          '`/play <query>` — Putar lagu (YouTube/Spotify URL atau judul)',
          '`/pause [mode]` — Pause / resume / toggle',
          '`/skip` — Skip lagu sekarang',
          '`/stop` atau `/disconnect` — Stop & leave VC',
          '`/nowplaying` — Lihat panel Now Playing',
          '`/queue` — Lihat antrian (dengan paging)',
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎛️ **Controls**',
        value: [
          '`/loop <off|song|queue>` — Set mode loop',
          '`/shuffle` — Acak antrian',
          '`/volume <0-200>` — Set volume',
          '`/247` — Toggle 24/7 mode',
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎵 **Advanced** (`/mextra`)',
        value: [
          '`/mextra seek <1:30>` — Lompat posisi',
          '`/mextra jump <n>` — Lompat ke track ke-N',
          '`/mextra remove <n>` — Hapus track',
          '`/mextra move <from> <to>` — Reorder',
          '`/mextra clearqueue` — Clear queue',
          '`/mextra lyrics` — Lirik lagu',
          '`/mextra favorite <action>` — Favorit',
          '`/mextra skipvote` — Vote skip',
        ].join('\n'),
        inline: false,
      },
      {
        name: '📋 **Playlist** (`/playlist`)',
        value: [
          '`/playlist list|create|delete|rename`',
          '`/playlist add <pl> <lagu>`',
          '`/playlist remove|clear|view|play`',
        ].join('\n'),
        inline: false,
      },
      {
        name: '⚙️ **Settings & Help**',
        value: [
          '`/music settings` — [ADMIN] Panel konfigurasi (DJ role, 24/7, announce, dll)',
          '`/music help` — Lihat help ini lagi',
          '`/music status` — Debug info',
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: '🎶 Music Player • Bot ini pakai play-dl (no Lavalink needed)' })
    .setTimestamp();
}

function buildStatusEmbed(guild) {
  const state = getGuildState(guild.id);
  const cfg = getMusicConfig(guild.id);
  const status = getPlayerStatus(guild.id);
  const paused = isPaused(guild.id);
  const stateLabel = !status.connected
    ? '🔴 Disconnected'
    : paused
      ? '⏸️ Paused'
      : '▶️ Playing';

  let elapsed = '0:00';
  if (state.currentStartedAt && state.currentSong && status.connected) {
    const sec = Math.floor((Date.now() - state.currentStartedAt) / 1000);
    elapsed = formatDuration(Math.min(sec, state.currentSong.duration || 0));
  }

  const voiceCh = state.voiceChannelId ? guild.channels?.cache?.get(state.voiceChannelId) : null;
  let humanCount = 0;
  if (voiceCh?.members) {
    if (typeof voiceCh.members.filter === 'function') {
      humanCount = voiceCh.members.filter(m => !m.user?.bot).size;
    } else if (voiceCh.members instanceof Map) {
      for (const m of voiceCh.members.values()) if (!m.user?.bot) humanCount++;
    }
  }

  const totalQueueSec = state.queue.reduce((s, t) => s + (t.duration || 0), 0);

  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: `${guild.name} • Music Status`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle('🔍 Music Status (Debug)')
    .addFields(
      { name: '🎵 State', value: stateLabel, inline: true },
      { name: '🔊 Volume', value: `${state.volume}%`, inline: true },
      { name: '🔁 Loop', value: state.loop, inline: true },
      { name: '🎤 Voice Channel', value: voiceCh ? `\`${voiceCh.name}\` (${humanCount} manusia)` : 'Tidak di VC', inline: true },
      { name: '📋 Queue', value: `${state.queue.length} lagu • ⏱️ ${formatDuration(totalQueueSec)}`, inline: true },
      { name: '🎶 Now Playing', value: state.currentSong ? `\`${state.currentSong.title.slice(0, 40)}\` (${elapsed}/${formatDuration(state.currentSong.duration)})` : '*idle*', inline: true },
      { name: '🕐 24/7', value: cfg['247'] ? '✅ On' : '❌ Off', inline: true },
      { name: '👑 DJ Role', value: cfg.djRoleId ? `<@&${cfg.djRoleId}>` : '*Belum diset*', inline: true },
      { name: '📢 Announce', value: cfg.announceChannelId ? `<#${cfg.announceChannelId}>` : '*Off*', inline: true },
    )
    .setFooter({ text: '🎶 Music Player • Status updated real-time' })
    .setTimestamp();
}

// ════════════════════════════════════════
// COMPONENT HANDLERS (called by index.js)
// ════════════════════════════════════════

async function renderInPlace(interaction, guildId, page, guild, flash = null) {
  const data = getMusicConfig(guildId);
  let panel;
  switch (page) {
    case 'autoleave': panel = panelAutoLeave(data, guild, flash); break;
    case 'djrole':     panel = panelDJRole(data, guild, flash); break;
    case 'announce':   panel = panelAnnounce(data, guild, flash); break;
    case 'language':   panel = panelLanguage(data, guild, flash); break;
    case 'reset':      panel = panelResetConfirm(data, guild); break;
    case 'closed':     panel = panelClosed(); break;
    default:           panel = panelMain(data, guild, flash); break;
  }
  await interaction.editReply({ embeds: [panel.embed], components: panel.rows });
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'settings') {
    // Only admins can open
    if (!interaction.member?.permissions?.has?.('Administrator') &&
        interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(DANGER)
          .setTitle('🔒 Akses Ditolak')
          .setDescription('Cuma Server Owner & Admin yang bisa buka music settings.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    const data = getMusicConfig(interaction.guildId);
    const panel = panelMain(data, interaction.guild);
    return interaction.reply({ embeds: [panel.embed], components: panel.rows, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'help') {
    return interaction.reply({
      embeds: [buildHelpEmbed(interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'status') {
    return interaction.reply({
      embeds: [buildStatusEmbed(interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleMusicSettingsButton(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('mset_')) return false;

  // Only admins/owner can interact
  if (!interaction.member?.permissions?.has?.('Administrator') &&
      interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(DANGER)
        .setTitle('🔒 Akses Ditolak')
        .setDescription('Cuma Server Owner & Admin yang bisa manage music settings.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const data = getMusicConfig(guildId);

  // ── Tutup / back ──
  if (interaction.customId === 'mset_close') {
    return renderInPlace(interaction, guildId, 'closed', guild);
  }
  if (interaction.customId === 'mset_back_main') {
    return renderInPlace(interaction, guildId, 'main', guild);
  }

  // ── 24/7 toggle ──
  if (interaction.customId === 'mset_247') {
    const newVal = !data['247'];
    saveMusicConfig(guildId, { '247': newVal });
    return renderInPlace(interaction, guildId, 'main', guild,
      newVal ? '🕐 **24/7 Mode aktif** — bot akan stay di VC.' : '🕐 **24/7 Mode nonaktif** — bot akan leave saat queue kosong.');
  }

  // ── Subpanel navigation ──
  if (interaction.customId === 'mset_autoleave') return renderInPlace(interaction, guildId, 'autoleave', guild);
  if (interaction.customId === 'mset_djrole')     return renderInPlace(interaction, guildId, 'djrole', guild);
  if (interaction.customId === 'mset_announce')   return renderInPlace(interaction, guildId, 'announce', guild);
  if (interaction.customId === 'mset_language')   return renderInPlace(interaction, guildId, 'language', guild);

  // ── Reset DJ / Announce ──
  if (interaction.customId === 'mset_clear_dj') {
    saveMusicConfig(guildId, { djRoleId: null });
    return renderInPlace(interaction, guildId, 'main', guild, '🗑️ DJ Role direset.');
  }
  if (interaction.customId === 'mset_clear_announce') {
    saveMusicConfig(guildId, { announceChannelId: null });
    return renderInPlace(interaction, guildId, 'announce', guild, '🗑️ Announce channel dinonaktifkan.');
  }

  // ── Reset confirm flow ──
  if (interaction.customId === 'mset_reset_confirm') {
    return renderInPlace(interaction, guildId, 'reset', guild);
  }
  if (interaction.customId === 'mset_reset_go') {
    saveMusicConfig(guildId, {
      '247': false,
      autoLeaveMinutes: 5,
      djRoleId: null,
      announceChannelId: null,
      language: 'id',
    });
    return renderInPlace(interaction, guildId, 'main', guild, '♻️ **Music config di-reset** ke default.');
  }

  return false;
}

export async function handleMusicSettingsSelect(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('mset_')) return false;

  // Admin check
  if (!interaction.member?.permissions?.has?.('Administrator') &&
      interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(DANGER).setTitle('🔒 Akses Ditolak')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  // ── Auto-leave duration ──
  if (interaction.customId === 'mset_autoleave_pick') {
    const minutes = parseInt(interaction.values[0], 10);
    saveMusicConfig(guildId, { autoLeaveMinutes: minutes });
    return renderInPlace(interaction, guildId, 'autoleave', guild,
      `⏱️ Auto-leave diset ke **${minutes === 0 ? 'Never' : minutes + ' menit'}**.`);
  }

  // ── DJ role ──
  if (interaction.customId === 'mset_djrole_pick') {
    const roleId = interaction.values[0] || null;
    saveMusicConfig(guildId, { djRoleId: roleId });
    return renderInPlace(interaction, guildId, 'djrole', guild,
      roleId ? `👑 DJ Role diset ke <@&${roleId}>.` : '🗑️ DJ Role dikosongkan.');
  }

  // ── Announce channel ──
  if (interaction.customId === 'mset_announce_pick') {
    const chId = interaction.values[0] || null;
    saveMusicConfig(guildId, { announceChannelId: chId });
    return renderInPlace(interaction, guildId, 'announce', guild,
      chId ? `📢 Announce channel diset ke <#${chId}>.` : '🗑️ Announce channel dikosongkan.');
  }

  // ── Language ──
  if (interaction.customId === 'mset_lang_pick') {
    const lang = interaction.values[0];
    saveMusicConfig(guildId, { language: lang });
    return renderInPlace(interaction, guildId, 'language', guild,
      `🌐 Bahasa diset ke **${lang === 'en' ? 'English' : 'Bahasa Indonesia'}**.`);
  }

  return false;
}
