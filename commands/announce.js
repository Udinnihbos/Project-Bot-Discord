/**
 * /announce V2 — Rich announcement system.
 *
 * Subcommands:
 *   send     — open modal wizard → preview → send
 *   schedule — schedule for later (once / daily / weekly)
 *   templates — manage reusable templates
 *   history  — view last 20 sends
 *   permissions — manage who can use /announce
 *
 * Pattern: Modal wizard + ephemeral preview + button confirm.
 */

import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { getGuildConfig, updateGuildConfig, addScheduled, addHistory } from '../utils/announceConfig.js';
import { renderAnnounce, canUseAnnounce } from '../utils/announceRenderer.js';
import { substituteVars, formatDateID, formatTimeID } from '../utils/announceVars.js';
import { generateId } from '../utils/sikmaticketConfig.js';

const DEFAULT_CONTENT = {
  emoji: '📢',
  color: '#3498db',
  title: '',
  description: '',
  footer: '',
  author: null,        // { name, iconUrl }
  thumbnail: '',
  image: '',
  fields: [],          // [{ name, value, inline }]
};

// ══════════════
// COMMAND DEFINITION
// ══════════════

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('📢 Kirim pengumuman (rich embed + modal wizard + schedule)')
  .addSubcommand(sub => sub
    .setName('send')
    .setDescription('🪄 Kirim pengumuman sekarang (modal wizard)')
    .addStringOption(opt => opt.setName('template').setDescription('Pakai template (kosongkan untuk dari nol)').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand(sub => sub
    .setName('schedule')
    .setDescription('⏰ Schedule pengumuman untuk nanti')
    .addStringOption(opt => opt.setName('template').setDescription('Pakai template').setRequired(false).setAutocomplete(true))
    .addStringOption(opt => opt.setName('when').setDescription('Kapan (WIB). Format: YYYY-MM-DD HH:MM atau "daily HH:MM" atau "weekly HH:MM"').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('templates')
    .setDescription('📋 Kelola template pengumuman')
  )
  .addSubcommand(sub => sub
    .setName('history')
    .setDescription('📜 Lihat 20 pengumuman terakhir')
  )
  .addSubcommand(sub => sub
    .setName('permissions')
    .setDescription('🔐 Atur siapa yang boleh /announce (OWNER only)')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ══════════════
// MAIN EXECUTE
// ══════════════

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // For send/schedule, only OWNER + allowed roles
  if (sub === 'send' || sub === 'schedule') {
    const perm = canUseAnnounce(interaction);
    if (!perm.allowed) {
      return interaction.reply({
        embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak', description: perm.reason }],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  switch (sub) {
    case 'send': return handleSend(interaction);
    case 'schedule': return handleSchedule(interaction);
    case 'templates': return handleTemplates(interaction);
    case 'history': return handleHistory(interaction);
    case 'permissions': return handlePermissions(interaction);
  }
}

// ══════════════
// AUTOCOMPLETE
// ══════════════

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const config = getGuildConfig(interaction.guildId);
  const templates = Object.values(config.templates || {});
  const choices = templates
    .filter(t => t.name.toLowerCase().includes(focused.toLowerCase()) || t.id.includes(focused.toLowerCase()))
    .slice(0, 25)
    .map(t => ({ name: t.name.slice(0, 100), value: t.id }));
  await interaction.respond(choices);
}

// ══════════════
// SEND SUBCOMMAND
// ══════════════

async function handleSend(interaction) {
  const templateId = interaction.options.getString('template');
  let content = { ...DEFAULT_CONTENT };

  if (templateId) {
    const config = getGuildConfig(interaction.guildId);
    const tpl = config.templates?.[templateId];
    if (tpl) {
      content = {
        ...DEFAULT_CONTENT,
        ...tpl,
        fields: tpl.fields || [],
      };
    }
  }

  // Show preview with current content (template or default)
  return showPreview(interaction, content, { mode: 'send' });
}

// ══════════════
// PREVIEW UI (shared by send & schedule)
// ══════════════

async function showPreview(interaction, content, opts = {}) {
  const { mode = 'send', extraFields = '' } = opts;
  const previewEmbed = renderAnnounce(content, { guild: interaction.guild });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🪄 Preview Pengumuman (${mode === 'schedule' ? 'Schedule' : 'Kirim'})`)
    .setDescription(
      '**Preview embed kamu di bawah ini.**\n' +
      'Klik ✏️ **Edit** untuk ubah field, ✅ **Kirim** untuk kirim, atau 🗑️ **Batal**.\n\n' +
      '> 💡 Variable yang bisa dipakai: `{user}` `{username}` `{server}` `{memberCount}` `{date}` `{time}` `{dateTime}` `{version}` `{channel}`\n' +
      '> 💡 Waktu tanggal pakai **WIB (Asia/Jakarta)**.'
    )
    .addFields({ name: '━ Preview ━', value: '↓ ↓ ↓' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_edit_basic:${mode}`).setLabel('✏️ Edit Konten').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ann_edit_design:${mode}`).setLabel('🎨 Edit Design').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ann_edit_channels:${mode}`).setLabel('📡 Pilih Channel').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_edit_ping:${mode}`).setLabel('🔔 Ping Everyone?').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ann_save_template:${mode}`).setLabel('💾 Simpan Template').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_send_now:${mode}`).setLabel(mode === 'schedule' ? '⏰ Lanjut Schedule' : '✅ Kirim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ann_cancel').setLabel('🗑️ Batal').setStyle(ButtonStyle.Danger),
    ),
  ];

  // Store the content in interaction.message for later use
  // (For simplicity, we encode in customId by JSON-stringifying? too long.
  //  Better: store in client.tempStorage keyed by userId+messageId)

  return interaction.reply({
    embeds: [embed, previewEmbed],
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

// We need a temp storage for content per interaction
const tempContent = new Map();

function storeContent(key, content) {
  tempContent.set(key, content);
  // Auto-cleanup after 1 hour
  setTimeout(() => tempContent.delete(key), 60 * 60 * 1000);
}

function getContent(key) {
  return tempContent.get(key);
}

function makeKey(userId, messageId) {
  return `${userId}:${messageId}`;
}

// ══════════════
// COMPONENT HANDLER
// ══════════════

export async function handleAnnounceComponent(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('ann_') && !interaction.customId?.startsWith('ann_')) return false;

  // Permission check
  if (interaction.customId !== 'ann_cancel' && interaction.customId !== 'ann_save_template') {
    const perm = canUseAnnounce(interaction);
    if (!perm.allowed) {
      if (!interaction.replied) {
        return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak', description: perm.reason }], flags: MessageFlags.Ephemeral });
      }
    }
  }

  const cid = interaction.customId;
  const key = makeKey(interaction.user.id, interaction.message?.id);

  if (cid === 'ann_cancel') {
    tempContent.delete(key);
    if (interaction.replied) return;
    return interaction.update({ embeds: [{ color: 0x95a5a6, title: '🗑️ Dibatalkan.' }], components: [] });
  }

  if (cid === 'ann_send_now:send' || cid === 'ann_send_now:schedule') {
    return confirmSend(interaction, key);
  }

  if (cid.startsWith('ann_edit_basic:')) {
    return showEditBasicModal(interaction, key);
  }
  if (cid.startsWith('ann_edit_design:')) {
    return showEditDesignModal(interaction, key);
  }
  if (cid.startsWith('ann_edit_channels:')) {
    return showEditChannelsPrompt(interaction, key);
  }
  if (cid.startsWith('ann_edit_ping:')) {
    return togglePing(interaction, key);
  }
  if (cid.startsWith('ann_save_template:')) {
    return showSaveTemplateModal(interaction, key);
  }
  return false;
}

function confirmSend(interaction, key) {
  const content = getContent(key);
  if (!content) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Session expired. Jalankan /announce lagi.' }], components: [] });
  }
  if (!content.channelIds?.length) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Pilih minimal 1 channel dulu.' }], components: [] });
  }

  const mode = interaction.customId.split(':')[1]; // 'send' or 'schedule'
  if (mode === 'schedule') {
    return showScheduleModal(interaction, key);
  }

  // Send now
  return doSend(interaction, content);
}

async function doSend(interaction, content) {
  await interaction.deferUpdate();
  const embed = renderAnnounce(content, { guild: interaction.guild });
  const mention = content.pingEveryone ? '@everyone' : null;

  const results = [];
  for (const channelId of content.channelIds) {
    try {
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        results.push({ channelId, ok: false, error: 'Channel not found' });
        continue;
      }
      const msg = await channel.send({
        content: mention?.slice(0, 2000) || undefined,
        embeds: [embed],
        allowedMentions: { parse: content.pingEveryone ? ['everyone'] : [] },
      });
      results.push({ channelId, ok: true, messageId: msg.id });
    } catch (e) {
      results.push({ channelId, ok: false, error: e.message?.slice(0, 200) });
    }
  }

  // History
  addHistory(interaction.guildId, {
    id: generateId(),
    title: content.title,
    sentAt: Date.now(),
    sentBy: interaction.user.id,
    channelIds: content.channelIds,
    pingEveryone: !!content.pingEveryone,
    scheduled: false,
    results,
  });

  const successCount = results.filter(r => r.ok).length;
  const failCount = results.length - successCount;

  const resultEmbed = new EmbedBuilder()
    .setColor(failCount === 0 ? 0x2ecc71 : 0xf39c12)
    .setTitle(failCount === 0 ? '✅ Pengumuman Terkirim!' : '⚠️ Pengumuman Terkirim Sebagian')
    .setDescription(
      `📤 Berhasil: **${successCount}** channel\n` +
      (failCount > 0 ? `❌ Gagal: **${failCount}** channel\n` : '') +
      '\n' +
      results.map(r => {
        const ch = r.ok ? `<#${r.channelId}>` : `<#${r.channelId}>`;
        return r.ok ? `✅ ${ch}` : `❌ ${ch} — ${r.error}`;
      }).join('\n')
    )
    .setTimestamp();

  tempContent.delete(makeKey(interaction.user.id, interaction.message?.id));

  return interaction.editReply({ embeds: [resultEmbed], components: [] });
}

function showScheduleModal(interaction, key) {
  const content = getContent(key);
  if (!content) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Session expired.' }], components: [] });

  return interaction.showModal(new ModalBuilder()
    .setCustomId(`ann_modal_schedule:${key}`)
    .setTitle('⏰ Schedule Pengumuman (WIB)')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('when_type')
          .setLabel('Tipe: "once" / "daily" / "weekly"')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue('once')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('when_date')
          .setLabel('Tanggal (YYYY-MM-DD, contoh: 2026-07-26)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('when_time')
          .setLabel('Waktu (HH:MM, contoh: 09:00)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
      ),
    )
  );
}

// ══════════════
// MODAL HANDLERS
// ══════════════

export async function handleAnnounceModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('ann_modal_')) return false;

  const cid = interaction.customId;
  const perm = canUseAnnounce(interaction);
  if (!perm.allowed && cid !== 'ann_modal_perm_role') {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak', description: perm.reason }], flags: MessageFlags.Ephemeral });
  }

  if (cid.startsWith('ann_modal_basic:')) {
    return handleBasicSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_design:')) {
    return handleDesignSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_channels:')) {
    return handleChannelsSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_schedule:')) {
    return handleScheduleSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_save_tpl:')) {
    return handleSaveTemplateSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_load_tpl:')) {
    return handleLoadTemplateSubmit(interaction);
  }
  if (cid.startsWith('ann_modal_perm_role:')) {
    return handlePermRoleSubmit(interaction);
  }
  return false;
}

function handleBasicSubmit(interaction) {
  const key = cid_extract_key(interaction.customId);
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  content.emoji = interaction.fields.getTextInputValue('emoji').slice(0, 4) || '📢';
  content.title = interaction.fields.getTextInputValue('title').slice(0, 200);
  content.description = interaction.fields.getTextInputValue('description').slice(0, 3500);
  content.footer = interaction.fields.getTextInputValue('footer').slice(0, 200);
  storeContent(key, content);
  return refreshPreview(interaction, key);
}

function handleDesignSubmit(interaction) {
  const key = cid_extract_key(interaction.customId);
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  const colorRaw = interaction.fields.getTextInputValue('color').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(colorRaw)) content.color = colorRaw;
  content.thumbnail = interaction.fields.getTextInputValue('thumbnail').trim();
  content.image = interaction.fields.getTextInputValue('image').trim();
  content.author = {
    name: interaction.fields.getTextInputValue('author_name').trim() || null,
    iconUrl: interaction.fields.getTextInputValue('author_icon').trim() || null,
  };
  storeContent(key, content);
  return refreshPreview(interaction, key);
}

function handleChannelsSubmit(interaction) {
  // The user is supposed to click the channel select menu, not submit a modal.
  // For channel select, we use a separate handler.
  return interaction.update({ embeds: [{ color: 0xf39c12, title: 'ℹ️ Pakai channel select menu (klik tombol "Pilih Channel")' }], components: [] });
}

function handleScheduleSubmit(interaction) {
  const key = cid_extract_key(interaction.customId);
  const content = getContent(key);
  if (!content) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Session expired.' }], components: [] });

  const typeRaw = interaction.fields.getTextInputValue('when_type').trim().toLowerCase();
  const dateRaw = interaction.fields.getTextInputValue('when_date').trim();
  const timeRaw = interaction.fields.getTextInputValue('when_time').trim();

  if (!['once', 'daily', 'weekly'].includes(typeRaw)) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Tipe harus: once / daily / weekly' }], flags: MessageFlags.Ephemeral });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Format tanggal: YYYY-MM-DD' }], flags: MessageFlags.Ephemeral });
  }
  if (!/^\d{2}:\d{2}$/.test(timeRaw)) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Format waktu: HH:MM' }], flags: MessageFlags.Ephemeral });
  }

  // Parse as WIB (UTC+7). Convert to UTC ms timestamp.
  const [yyyy, mm, dd] = dateRaw.split('-').map(Number);
  const [hh, mi] = timeRaw.split(':').map(Number);
  // WIB = UTC+7, so UTC = WIB - 7
  const utcMs = Date.UTC(yyyy, mm - 1, dd, hh - 7, mi);

  if (utcMs <= Date.now()) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Waktu schedule harus di masa depan.' }], flags: MessageFlags.Ephemeral });
  }

  const entry = {
    id: generateId(),
    type: typeRaw,
    channelIds: content.channelIds,
    content,
    pingEveryone: !!content.pingEveryone,
    when: utcMs,
    createdBy: interaction.user.id,
    createdAt: Date.now(),
  };
  addScheduled(interaction.guildId, entry);

  const scheduleTime = new Date(utcMs);
  return interaction.update({
    embeds: [{
      color: 0x2ecc71,
      title: '⏰ Pengumuman Dijadwalkan!',
      description: `**${typeRaw.toUpperCase()}** pada **${formatDateID(scheduleTime)} ${timeRaw} WIB**\n\n` +
        `Channel: ${content.channelIds.map(c => `<#${c}>`).join(', ')}\n` +
        `Judul: ${content.title.slice(0, 100)}`,
    }],
    components: [],
  });
}

function handleSaveTemplateSubmit(interaction) {
  const key = cid_extract_key(interaction.customId);
  const content = getContent(key);
  if (!content) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Session expired.' }], components: [] });

  const name = interaction.fields.getTextInputValue('name').trim().slice(0, 50);
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || generateId();
  const config = getGuildConfig(interaction.guildId);
  const newTemplates = { ...config.templates, [id]: { ...content, id, name } };
  updateGuildConfig(interaction.guildId, { templates: newTemplates });
  return interaction.update({
    embeds: [{ color: 0x2ecc71, title: '💾 Template Tersimpan!', description: `Template **${name}** (\`${id}\`) tersimpan. Pakai dengan \`/announce send template:${id}\`` }],
    components: [],
  });
}

function handleLoadTemplateSubmit(interaction) {
  const key = cid_extract_key(interaction.customId);
  const tplId = interaction.fields.getTextInputValue('template_id').trim();
  const config = getGuildConfig(interaction.guildId);
  const tpl = config.templates?.[tplId];
  if (!tpl) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: `❌ Template "${tplId}" tidak ditemukan.` }], components: [] });
  }
  const content = { ...DEFAULT_CONTENT, ...tpl, fields: tpl.fields || [] };
  storeContent(key, content);
  return refreshPreview(interaction, key);
}

function handlePermRoleSubmit(interaction) {
  const rolesRaw = interaction.fields.getTextInputValue('roles').trim();
  const roles = rolesRaw.split(/[\s,]+/).filter(r => /^\d{17,20}$/.test(r));
  updateGuildConfig(interaction.guildId, { allowedRoles: roles });
  return interaction.update({
    embeds: [{
      color: 0x2ecc71,
      title: '🔐 Permissions Updated!',
      description: roles.length
        ? `Sekarang **${roles.length}** role yang bisa pakai /announce:\n${roles.map(r => `<@&${r}>`).join(', ')}`
        : 'Tidak ada role tambahan. Hanya **OWNER** yang bisa /announce.',
    }],
    components: [],
  });
}

// ══════════════
// EDIT MODALS / HANDLERS
// ══════════════

function showEditBasicModal(interaction, key) {
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`ann_modal_basic:${key}`)
    .setTitle('✏️ Edit Konten Pengumuman')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (1-4 karakter, default 📢)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setValue(content.emoji || '📢')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Judul').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setValue((content.title || '').slice(0, 200))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Deskripsi (gunakan {date} {time} dll)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500).setValue((content.description || '').slice(0, 3500))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('footer').setLabel('Footer text (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setValue((content.footer || '').slice(0, 200))
      ),
    )
  );
}

function showEditDesignModal(interaction, key) {
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  const author = content.author || { name: '', iconUrl: '' };
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`ann_modal_design:${key}`)
    .setTitle('🎨 Edit Design Embed')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('color').setLabel('Warna hex (contoh: #ff0000)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(content.color || '#3498db')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('author_name').setLabel('Author name (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(author.name || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('author_icon').setLabel('Author icon URL (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(author.iconUrl || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail URL (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(content.thumbnail || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('image').setLabel('Image/Banner URL (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(content.image || '')
      ),
    )
  );
}

// Channel select handled separately
export async function handleAnnounceChannelSelect(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('ann_chselect:')) return false;

  const key = cid_extract_key(interaction.customId);
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  content.channelIds = interaction.values;
  storeContent(key, content);
  return refreshPreview(interaction, key);
}

function showEditChannelsPrompt(interaction, key) {
  return interaction.update({
    embeds: [{
      color: 0x3498db,
      title: '📡 Pilih Channel Tujuan',
      description: 'Klik tombol di bawah untuk pilih channel.\n\nSaat ini: ' +
        (getContent(key)?.channelIds?.length
          ? getContent(key).channelIds.map(c => `<#${c}>`).join(', ')
          : '*belum ada*'),
    }],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`ann_chselect:${key}`)
          .setPlaceholder('📡 Pilih 1+ channel…')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(10),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ann_back_to_preview').setLabel('◀ Kembali ke Preview').setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

function togglePing(interaction, key) {
  const content = getContent(key) || { ...DEFAULT_CONTENT };
  content.pingEveryone = !content.pingEveryone;
  storeContent(key, content);
  return refreshPreview(interaction, key);
}

function showSaveTemplateModal(interaction, key) {
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`ann_modal_save_tpl:${key}`)
    .setTitle('💾 Simpan sebagai Template')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Nama template (mis. "Maintenance Rutin")').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
      ),
    )
  );
}

async function refreshPreview(interaction, key, mode = null) {
  // Auto-detect mode from current message components if not provided
  if (!mode) {
    try {
      const components = interaction.message?.components || [];
      for (const row of components) {
        for (const c of row.components || []) {
          if (c.customId?.startsWith('ann_send_now:')) {
            mode = c.customId.split(':')[1];
            break;
          }
        }
        if (mode) break;
      }
    } catch {}
    mode = mode || 'send';
  }

  const content = getContent(key) || { ...DEFAULT_CONTENT };
  const previewEmbed = renderAnnounce(content, { guild: interaction.guild });
  const pingStatus = content.pingEveryone ? '🔔 ON' : '🔕 OFF';
  const chCount = content.channelIds?.length || 0;
  const chStatus = chCount > 0 ? `${chCount} channel` : '❌ belum pilih';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🪄 Preview Pengumuman')
    .setDescription(
      `> 📡 Channel: **${chStatus}**\n` +
      `> 🔔 Ping: **${pingStatus}**\n\n` +
      'Klik tombol di bawah untuk edit/kirim.'
    )
    .addFields({ name: '━ Preview ━', value: '↓ ↓ ↓' })
    .setTimestamp();

  const sendLabel = mode === 'schedule' ? '⏰ Lanjut Schedule' : '✅ Kirim';
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_edit_basic:${mode}`).setLabel('✏️ Edit Konten').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ann_edit_design:${mode}`).setLabel('🎨 Edit Design').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ann_edit_channels:${mode}`).setLabel('📡 Pilih Channel').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_edit_ping:${mode}`).setLabel('🔔 Toggle Ping').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ann_save_template:${mode}`).setLabel('💾 Simpan Template').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ann_send_now:${mode}`).setLabel(sendLabel).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ann_cancel').setLabel('🗑️ Batal').setStyle(ButtonStyle.Danger),
    ),
  ];

  return interaction.update({ embeds: [embed, previewEmbed], components: rows });
}

// Helper: extract content key from customId like "ann_modal_basic:123:456"
function cid_extract_key(cid) {
  const parts = cid.split(':');
  if (parts.length < 2) return null;
  // Key is the last 2 parts (userId:messageId) since messageId can contain ':' technically but in our case it doesn't
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  return `${second}:${last}`;
}

// ══════════════
// SCHEDULE SUBCOMMAND
// ══════════════

async function handleSchedule(interaction) {
  // Reuse send flow but mode = 'schedule'
  const templateId = interaction.options.getString('template');
  const whenRaw = interaction.options.getString('when');

  let content = { ...DEFAULT_CONTENT };
  if (templateId) {
    const config = getGuildConfig(interaction.guildId);
    const tpl = config.templates?.[templateId];
    if (tpl) content = { ...DEFAULT_CONTENT, ...tpl, fields: tpl.fields || [] };
  }

  // Pre-fill "when" if provided
  if (whenRaw) {
    // We just show preview first, user can fill schedule modal
  }

  return showPreview(interaction, content, { mode: 'schedule' });
}

// ══════════════
// TEMPLATES SUBCOMMAND
// ══════════════

async function handleTemplates(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const tpls = Object.values(config.templates || {});

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Template Pengumuman')
    .setDescription(
      tpls.length
        ? 'Pilih template untuk lihat detail, atau buat baru.\n\n' +
          tpls.map((t, i) => `\`${i + 1}.\` **${t.name}** (\`${t.id}\`) — ${t.title.slice(0, 60)}`).join('\n').slice(0, 3500)
        : '*Belum ada template.*\n\nTemplate built-in: `maintenance`, `event`, `update`.'
    )
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('ann_tpl_select')
    .setPlaceholder('📋 Pilih template untuk lihat/edit…');
  for (const t of tpls.slice(0, 25)) {
    select.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(t.name.slice(0, 100))
      .setDescription((t.title || 'no title').slice(0, 100))
      .setValue(t.id));
  }

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ann_tpl_delete').setLabel('🗑️ Hapus (pilih dulu)').setStyle(ButtonStyle.Danger).setDisabled(tpls.length === 0),
      new ButtonBuilder().setCustomId('ann_cancel').setLabel('✖ Tutup').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

export async function handleAnnounceSelect(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('ann_')) return false;

  // ... handled by component handler mostly
  if (interaction.customId === 'ann_tpl_select') {
    const tplId = interaction.values[0];
    const config = getGuildConfig(interaction.guildId);
    const tpl = config.templates?.[tplId];
    if (!tpl) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Template not found' }], components: [] });

    const embed = renderAnnounce(tpl, { guild: interaction.guild });
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`📋 Template: ${tpl.name}`)
          .setDescription(`ID: \`${tpl.id}\`\n\nKlik "Pakai Template" untuk pakai di /announce send, atau "Hapus" untuk hapus.`),
        embed,
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ann_tpl_use:${tplId}`).setLabel('🪄 Pakai Template').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ann_tpl_delete_confirm:${tplId}`).setLabel('🗑️ Hapus').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ann_tpl_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  return false;
}

// Continue with handleAnnounceComponent to handle tpl_use, tpl_delete_confirm, etc.
const origHandleComponent = handleAnnounceComponent;
export async function handleAnnounceComponentFull(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('ann_')) return false;

  const cid = interaction.customId;

  if (cid.startsWith('ann_tpl_use:')) {
    const tplId = cid.split(':')[1];
    const config = getGuildConfig(interaction.guildId);
    const tpl = config.templates?.[tplId];
    if (!tpl) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Template not found' }], components: [] });

    const content = { ...DEFAULT_CONTENT, ...tpl, fields: tpl.fields || [] };
    const key = makeKey(interaction.user.id, interaction.message?.id);
    storeContent(key, content);
    // Reuse refreshPreview but need to handle the reply
    return interaction.update({
      embeds: [{ color: 0x2ecc71, title: `✅ Template "${tpl.name}" dimuat. Jalankan /announce send template:${tplId} untuk pakai.` }],
      components: [],
    });
  }

  if (cid.startsWith('ann_tpl_delete_confirm:')) {
    const tplId = cid.split(':')[1];
    const config = getGuildConfig(interaction.guildId);
    const newTpls = { ...config.templates };
    delete newTpls[tplId];
    updateGuildConfig(interaction.guildId, { templates: newTpls });
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: `🗑️ Template "${tplId}" dihapus.` }], components: [] });
  }

  if (cid === 'ann_tpl_delete') {
    return interaction.update({ embeds: [{ color: 0xf39c12, title: 'ℹ️ Pilih template dulu dari dropdown di atas, lalu klik 🗑️ Hapus.' }], components: [] });
  }

  if (cid === 'ann_tpl_back') {
    return handleTemplates(interaction);
  }

  if (cid === 'ann_back_to_preview') {
    const key = makeKey(interaction.user.id, interaction.message?.id);
    return refreshPreview(interaction, key);
  }

  if (cid.startsWith('ann_edit_channels:')) {
    return showEditChannelsPrompt(interaction, makeKey(interaction.user.id, interaction.message?.id));
  }

  // Fall through to original component handler
  return origHandleComponent(interaction);
}

// ══════════════
// HISTORY SUBCOMMAND
// ══════════════

async function handleHistory(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const history = config.history || [];

  if (!history.length) {
    return interaction.reply({ embeds: [{ color: 0x95a5a6, title: '📜 Belum ada history.' }], flags: MessageFlags.Ephemeral });
  }

  const lines = history.slice(0, 20).map((h, i) => {
    const when = new Date(h.sentAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const scheduled = h.scheduled ? '⏰' : '📤';
    const channels = (h.channelIds || []).map(c => `<#${c}>`).join(', ');
    const ok = (h.results || []).filter(r => r.ok).length;
    return `\`${i + 1}.\` ${scheduled} **${h.title.slice(0, 50)}** — ${when}\n   → ${channels} (\`${ok}/${(h.results || []).length}\` OK)`;
  });

  return interaction.reply({
    embeds: [{
      color: 0x5865f2,
      title: `📜 History (${history.length} terakhir)`,
      description: lines.join('\n').slice(0, 4000),
      footer: { text: '⏰ Semua waktu dalam WIB (Asia/Jakarta)' },
    }],
    flags: MessageFlags.Ephemeral,
  });
}

// ══════════════
// PERMISSIONS SUBCOMMAND (OWNER only)
// ══════════════

async function handlePermissions(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '🔒 OWNER only' }], flags: MessageFlags.Ephemeral });
  }

  const config = getGuildConfig(interaction.guildId);

  return interaction.reply({
    embeds: [{
      color: 0x5865f2,
      title: '🔐 Permissions /announce',
      description: 'OWNER selalu bisa /announce.\n\n' +
        'Role tambahan yang boleh /announce:\n' +
        (config.allowedRoles?.length
          ? config.allowedRoles.map(r => `• <@&${r}>`).join('\n')
          : '*Tidak ada* — hanya OWNER'),
      footer: { text: 'Gunakan modal di bawah untuk tambah role (ID dipisah koma/spasi).' },
    }],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ann_perm_add_role').setLabel('➕ Tambah Role').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ann_perm_clear').setLabel('🗑️ Hapus Semua').setStyle(ButtonStyle.Danger).setDisabled(!config.allowedRoles?.length),
        new ButtonBuilder().setCustomId('ann_perm_role_select').setLabel('📋 Pilih dari Server').setStyle(ButtonStyle.Primary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAnnouncePermissions(interaction) {
  if (!interaction.guildId) return false;

  const cid = interaction.customId;

  if (cid === 'ann_perm_clear') {
    updateGuildConfig(interaction.guildId, { allowedRoles: [] });
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: '🔐 Semua role tambahan dihapus.' }], components: [] });
  }

  if (cid === 'ann_perm_add_role') {
    return interaction.showModal(new ModalBuilder()
      .setCustomId('ann_modal_perm_role')
      .setTitle('🔐 Tambah Role IDs')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('roles').setLabel('Role IDs (pisahkan dengan koma/spasi)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        ),
      )
    );
  }

  if (cid === 'ann_perm_role_select') {
    return interaction.update({
      embeds: [{ color: 0x3498db, title: '📋 Pilih Role dari Server', description: 'Pilih role yang bisa /announce:' }],
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('ann_perm_role_pick')
            .setPlaceholder('📋 Pilih role…')
            .setMinValues(1)
            .setMaxValues(10),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ann_cancel').setLabel('◀ Batal').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  if (cid === 'ann_perm_role_pick' && interaction.isRoleSelectMenu?.()) {
    const newRoles = interaction.values;
    const config = getGuildConfig(interaction.guildId);
    const merged = [...new Set([...(config.allowedRoles || []), ...newRoles])];
    updateGuildConfig(interaction.guildId, { allowedRoles: merged });
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: `🔐 ${merged.length} role sekarang bisa /announce.` }], components: [] });
  }

  return false;
}
