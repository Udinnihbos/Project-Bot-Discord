import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import {
  getSecurityConfig, saveSecurityConfig,
  activateLockdown, deactivateLockdown, resetUserViolations
} from '../utils/security.js';

export const data = new SlashCommandBuilder()
  .setName('security')
  .setDescription('🛡️ Kelola sistem anti-spam & anti-raid server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // ── STATUS ──
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Lihat status sistem keamanan sekarang')
  )

  // ── ANTI SPAM ──
  .addSubcommand(sub =>
    sub.setName('antispam')
      .setDescription('Toggle anti-spam on/off')
      .addBooleanOption(opt => opt.setName('enabled').setDescription('Aktifkan atau nonaktifkan').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('spamconfig')
      .setDescription('Konfigurasi anti-spam')
      .addIntegerOption(opt => opt.setName('threshold').setDescription('Jumlah pesan sebelum dianggap spam (default: 5)').setMinValue(2).setMaxValue(20).setRequired(false))
      .addIntegerOption(opt => opt.setName('window').setDescription('Window waktu dalam detik (default: 5)').setMinValue(1).setMaxValue(30).setRequired(false))
      .addIntegerOption(opt => opt.setName('mention_limit').setDescription('Maks mention per pesan (default: 5)').setMinValue(1).setMaxValue(20).setRequired(false))
      .addStringOption(opt =>
        opt.setName('action').setDescription('Aksi saat spam terdeteksi').setRequired(false)
          .addChoices(
            { name: '⏳ Timeout', value: 'timeout' },
            { name: '👢 Kick', value: 'kick' }
          )
      )
      .addIntegerOption(opt => opt.setName('timeout_minutes').setDescription('Durasi timeout dalam menit (default: 10)').setMinValue(1).setMaxValue(1440).setRequired(false))
      .addChannelOption(opt => opt.setName('log_channel').setDescription('Channel untuk log anti-spam').setRequired(false))
  )

  // ── ANTI RAID ──
  .addSubcommand(sub =>
    sub.setName('antiraid')
      .setDescription('Toggle anti-raid on/off')
      .addBooleanOption(opt => opt.setName('enabled').setDescription('Aktifkan atau nonaktifkan').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('raidconfig')
      .setDescription('Konfigurasi anti-raid')
      .addIntegerOption(opt => opt.setName('join_threshold').setDescription('Jumlah join dalam window = raid (default: 5)').setMinValue(2).setMaxValue(20).setRequired(false))
      .addIntegerOption(opt => opt.setName('join_window').setDescription('Window waktu dalam detik (default: 10)').setMinValue(3).setMaxValue(60).setRequired(false))
      .addIntegerOption(opt => opt.setName('min_account_age').setDescription('Minimum usia akun dalam hari (default: 3)').setMinValue(0).setMaxValue(30).setRequired(false))
      .addStringOption(opt =>
        opt.setName('action').setDescription('Aksi saat raid terdeteksi').setRequired(false)
          .addChoices(
            { name: '👢 Kick', value: 'kick' },
            { name: '🔨 Ban', value: 'ban' }
          )
      )
      .addBooleanOption(opt => opt.setName('auto_lockdown').setDescription('Auto lockdown server saat raid (default: true)').setRequired(false))
      .addChannelOption(opt => opt.setName('log_channel').setDescription('Channel untuk log anti-raid').setRequired(false))
  )

  // ── LOCKDOWN ──
  .addSubcommand(sub =>
    sub.setName('lockdown')
      .setDescription('Aktifkan lockdown server manual (blokir semua pesan)')
  )
  .addSubcommand(sub =>
    sub.setName('unlockdown')
      .setDescription('Nonaktifkan lockdown server')
  )

  // ── WHITELIST ──
  .addSubcommand(sub =>
    sub.setName('whitelist')
      .setDescription('Tambah/hapus user atau role dari whitelist')
      .addStringOption(opt =>
        opt.setName('action').setDescription('Tambah atau hapus').setRequired(true)
          .addChoices(
            { name: '➕ Tambah', value: 'add' },
            { name: '➖ Hapus', value: 'remove' }
          )
      )
      .addUserOption(opt => opt.setName('user').setDescription('User yang ingin di-whitelist').setRequired(false))
      .addRoleOption(opt => opt.setName('role').setDescription('Role yang ingin di-whitelist').setRequired(false))
  )

  // ── RESET VIOLATIONS ──
  .addSubcommand(sub =>
    sub.setName('resetviolations')
      .setDescription('Reset catatan violations user tertentu')
      .addUserOption(opt => opt.setName('user').setDescription('User yang ingin di-reset').setRequired(true))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const config = getSecurityConfig();

  // ── STATUS ──
  if (sub === 'status') {
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🛡️ Status Keamanan Server')
      .addFields(
        {
          name: '🔥 Anti-Spam',
          value: [
            `Status: ${config.antiSpam.enabled ? '✅ Aktif' : '❌ Nonaktif'}`,
            `Threshold: ${config.antiSpam.messageThreshold} pesan / ${config.antiSpam.messageWindowSeconds}s`,
            `Mention limit: ${config.antiSpam.mentionThreshold}`,
            `Aksi: ${config.antiSpam.action === 'timeout' ? `Timeout ${config.antiSpam.timeoutDurationMinutes} menit` : 'Kick'}`,
            `Log: ${config.antiSpam.logChannelId ? `<#${config.antiSpam.logChannelId}>` : 'Tidak ada'}`,
          ].join('\n'),
          inline: true
        },
        {
          name: '🚨 Anti-Raid',
          value: [
            `Status: ${config.antiRaid.enabled ? '✅ Aktif' : '❌ Nonaktif'}`,
            `Threshold: ${config.antiRaid.joinThreshold} join / ${config.antiRaid.joinWindowSeconds}s`,
            `Min. usia akun: ${config.antiRaid.minAccountAgeDays} hari`,
            `Aksi: ${config.antiRaid.action}`,
            `Auto lockdown: ${config.antiRaid.autoLockdown ? 'Ya' : 'Tidak'}`,
            `Log: ${config.antiRaid.logChannelId ? `<#${config.antiRaid.logChannelId}>` : 'Tidak ada'}`,
          ].join('\n'),
          inline: true
        },
        {
          name: '🔒 Lockdown',
          value: config.lockdown.active
            ? `✅ Aktif — ${config.lockdown.lockedChannelIds.length} channel terkunci`
            : '❌ Tidak aktif',
          inline: false
        },
        {
          name: '✅ Whitelist',
          value: [
            config.whitelistUserIds.length ? `Users: ${config.whitelistUserIds.map(id => `<@${id}>`).join(', ')}` : 'Tidak ada user',
            config.whitelistRoleIds.length ? `Roles: ${config.whitelistRoleIds.map(id => `<@&${id}>`).join(', ')}` : 'Tidak ada role',
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({ text: 'Gunakan /security untuk mengubah konfigurasi' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── ANTI SPAM TOGGLE ──
  if (sub === 'antispam') {
    config.antiSpam.enabled = interaction.options.getBoolean('enabled');
    saveSecurityConfig(config);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.antiSpam.enabled ? '#2ecc71' : '#e74c3c')
        .setTitle(`🔥 Anti-Spam ${config.antiSpam.enabled ? 'Diaktifkan!' : 'Dinonaktifkan!'}`)
        .setDescription(config.antiSpam.enabled
          ? `Anti-spam aktif!\nSpammer akan di-${config.antiSpam.action} otomatis.`
          : 'Anti-spam nonaktif.')
      ],
      ephemeral: true
    });
  }

  // ── SPAM CONFIG ──
  if (sub === 'spamconfig') {
    const threshold = interaction.options.getInteger('threshold');
    const window = interaction.options.getInteger('window');
    const mentionLimit = interaction.options.getInteger('mention_limit');
    const action = interaction.options.getString('action');
    const timeoutMins = interaction.options.getInteger('timeout_minutes');
    const logChannel = interaction.options.getChannel('log_channel');

    if (threshold) config.antiSpam.messageThreshold = threshold;
    if (window) config.antiSpam.messageWindowSeconds = window;
    if (mentionLimit) config.antiSpam.mentionThreshold = mentionLimit;
    if (action) config.antiSpam.action = action;
    if (timeoutMins) config.antiSpam.timeoutDurationMinutes = timeoutMins;
    if (logChannel) config.antiSpam.logChannelId = logChannel.id;

    saveSecurityConfig(config);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Konfigurasi Anti-Spam Diperbarui!')
        .addFields(
          { name: 'Threshold', value: `${config.antiSpam.messageThreshold} pesan / ${config.antiSpam.messageWindowSeconds}s`, inline: true },
          { name: 'Mention limit', value: `${config.antiSpam.mentionThreshold}`, inline: true },
          { name: 'Aksi', value: config.antiSpam.action === 'timeout' ? `Timeout ${config.antiSpam.timeoutDurationMinutes} menit` : 'Kick', inline: true },
          { name: 'Log', value: config.antiSpam.logChannelId ? `<#${config.antiSpam.logChannelId}>` : 'Tidak ada', inline: true },
        )
      ],
      ephemeral: true
    });
  }

  // ── ANTI RAID TOGGLE ──
  if (sub === 'antiraid') {
    config.antiRaid.enabled = interaction.options.getBoolean('enabled');
    saveSecurityConfig(config);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.antiRaid.enabled ? '#2ecc71' : '#e74c3c')
        .setTitle(`🚨 Anti-Raid ${config.antiRaid.enabled ? 'Diaktifkan!' : 'Dinonaktifkan!'}`)
        .setDescription(config.antiRaid.enabled
          ? `Anti-raid aktif!\nRaider akan di-${config.antiRaid.action} otomatis.`
          : 'Anti-raid nonaktif.')
      ],
      ephemeral: true
    });
  }

  // ── RAID CONFIG ──
  if (sub === 'raidconfig') {
    const joinThreshold = interaction.options.getInteger('join_threshold');
    const joinWindow = interaction.options.getInteger('join_window');
    const minAge = interaction.options.getInteger('min_account_age');
    const action = interaction.options.getString('action');
    const autoLockdown = interaction.options.getBoolean('auto_lockdown');
    const logChannel = interaction.options.getChannel('log_channel');

    if (joinThreshold) config.antiRaid.joinThreshold = joinThreshold;
    if (joinWindow) config.antiRaid.joinWindowSeconds = joinWindow;
    if (minAge !== null) config.antiRaid.minAccountAgeDays = minAge;
    if (action) config.antiRaid.action = action;
    if (autoLockdown !== null) config.antiRaid.autoLockdown = autoLockdown;
    if (logChannel) config.antiRaid.logChannelId = logChannel.id;

    saveSecurityConfig(config);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Konfigurasi Anti-Raid Diperbarui!')
        .addFields(
          { name: 'Threshold', value: `${config.antiRaid.joinThreshold} join / ${config.antiRaid.joinWindowSeconds}s`, inline: true },
          { name: 'Min. usia akun', value: `${config.antiRaid.minAccountAgeDays} hari`, inline: true },
          { name: 'Aksi', value: config.antiRaid.action, inline: true },
          { name: 'Auto lockdown', value: config.antiRaid.autoLockdown ? 'Ya' : 'Tidak', inline: true },
          { name: 'Log', value: config.antiRaid.logChannelId ? `<#${config.antiRaid.logChannelId}>` : 'Tidak ada', inline: true },
        )
      ],
      ephemeral: true
    });
  }

  // ── LOCKDOWN ──
  if (sub === 'lockdown') {
    await interaction.deferReply({ ephemeral: true });
    await activateLockdown(interaction.guild);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔒 Server Lockdown Aktif!')
        .setDescription('Semua channel di-lock. Hanya Admin yang bisa chat.\nGunakan `/security unlockdown` untuk membuka kembali.')
      ]
    });
  }

  if (sub === 'unlockdown') {
    await interaction.deferReply({ ephemeral: true });
    await deactivateLockdown(interaction.guild);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔓 Lockdown Dinonaktifkan!')
        .setDescription('Semua channel kembali normal.')
      ]
    });
  }

  // ── WHITELIST ──
  if (sub === 'whitelist') {
    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    if (!user && !role) {
      return interaction.reply({ content: '❌ Pilih user atau role!', ephemeral: true });
    }

    if (user) {
      if (action === 'add' && !config.whitelistUserIds.includes(user.id)) {
        config.whitelistUserIds.push(user.id);
      } else if (action === 'remove') {
        config.whitelistUserIds = config.whitelistUserIds.filter(id => id !== user.id);
      }
    }

    if (role) {
      if (action === 'add' && !config.whitelistRoleIds.includes(role.id)) {
        config.whitelistRoleIds.push(role.id);
      } else if (action === 'remove') {
        config.whitelistRoleIds = config.whitelistRoleIds.filter(id => id !== role.id);
      }
    }

    saveSecurityConfig(config);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`✅ Whitelist ${action === 'add' ? 'Ditambahkan' : 'Dihapus'}!`)
        .setDescription(`${user ? `👤 ${user.tag}` : ''} ${role ? `🎭 ${role.name}` : ''} ${action === 'add' ? 'ditambahkan ke' : 'dihapus dari'} whitelist.`)
      ],
      ephemeral: true
    });
  }

  // ── RESET VIOLATIONS ──
  if (sub === 'resetviolations') {
    const user = interaction.options.getUser('user');
    resetUserViolations(user.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Violations Direset!')
        .setDescription(`Catatan violations **${user.tag}** telah dihapus.`)
      ],
      ephemeral: true
    });
  }
}
