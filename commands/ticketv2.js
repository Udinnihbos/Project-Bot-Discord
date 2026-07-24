/**
 * /ticketv2 — Ticket System V2 admin command.
 *
 * Subcommands:
 *   settings  Open admin panel (Manage Server permission)
 *
 * Button/select/modal handlers exported for index.js:
 *   handleTicketV2Component
 */

import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';
import {
  getPanels, getPanel, addPanel, updatePanel, deletePanel,
  addTicketType, updateTicketType, deleteTicketType,
  getSettings, saveSettings, migrateFromV1,
} from '../utils/ticketv2.js';
import {
  panelMain, panelListPanels, panelPanelDetail, panelClosed,
  intToHex, hexToInt, ACCENT,
} from '../utils/ticketv2UI.js';

function isAdmin(interaction) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  if (interaction.member?.permissions?.has?.('ManageGuild')) return true;
  return false;
}

export const data = new SlashCommandBuilder()
  .setName('ticketv2')
  .setDescription('🎫 Ticket System V2 — settings & admin panel')
  .addSubcommand(sub => sub.setName('settings').setDescription('⚙️ Buka panel admin Ticket V2'));

export async function execute(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [{
        color: 0xe74c3c,
        title: '🔒 Akses Ditolak',
        description: 'Cuma Server Owner / Admin / Manage Server yang bisa akses Ticket V2.',
      }],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Try migrating V1 data on first open
  try { migrateFromV1(interaction.guildId); } catch (e) { /* ignore */ }

  const panels = getPanels(interaction.guildId);
  const settings = getSettings(interaction.guildId);
  const { embed, rows } = panelMain(interaction.guild, panels, settings);
  return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

async function renderInPlace(interaction, page, panelId = null, flash = null) {
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const panels = getPanels(guildId);
  const settings = getSettings(guildId);
  let panel;
  let renderable;

  switch (page) {
    case 'main': renderable = panelMain(guild, panels, settings, flash); break;
    case 'list': renderable = panelListPanels(guild, panels); break;
    case 'detail':
      panel = getPanel(guildId, panelId);
      if (!panel) {
        return safeUpdateOrEdit(interaction, { embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
      }
      renderable = panelPanelDetail(guild, panel, flash);
      break;
    case 'closed': renderable = panelClosed(); break;
    default: renderable = panelMain(guild, panels, settings, flash);
  }
  return safeUpdateOrEdit(interaction, { embeds: [renderable.embed], components: renderable.rows });
}

/**
 * Send a response to an interaction, choosing the right method based on
 * the interaction's current state:
 *   - If already replied/deferred → editReply
 *   - If it's a button/select/modal that hasn't been replied yet → update
 *   - Otherwise → editReply (will throw if not replied, but caller should ensure)
 */
async function safeUpdateOrEdit(interaction, payload) {
  try {
    // If already replied or deferred, we must use editReply
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }
    // For components (button/select/modal), use update() which edits the source message
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.() || interaction.isModalSubmit?.()) {
      return await interaction.update(payload);
    }
    return await interaction.editReply(payload);
  } catch (e) {
    // Interaction expired (>3s) or already responded to — silently ignore
    if (e.code === 10062 || e.code === 40060 || e.message?.includes('expired') || e.message?.includes('already been')) {
      console.warn('[tv2] Interaction expired/already replied, ignoring');
      return;
    }
    throw e;
  }
}

// ════════════════════════════════════════
// BUTTON / SELECT / MODAL HANDLERS
// ════════════════════════════════════════

export async function handleTicketV2Component(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('tv2_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak' }],
      flags: MessageFlags.Ephemeral,
    });
  }

  const cid = interaction.customId;
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  // ── Top-level navigation buttons ──
  if (cid === 'tv2_back_main') return renderInPlace(interaction, 'main');
  if (cid === 'tv2_close_panel') return renderInPlace(interaction, 'closed');
  if (cid === 'tv2_manage') return renderInPlace(interaction, 'list');
  if (cid === 'tv2_create_panel') {
    const { modalCreatePanel } = await import('../utils/ticketv2UI.js');
    return interaction.showModal(modalCreatePanel());
  }
  if (cid === 'tv2_settings') {
    // Quick toggle settings
    const s = getSettings(guildId);
    if (interaction.message.embeds[0]?.data?.title?.includes('Settings') || interaction.message.embeds[0]?.title?.includes('Settings')) {
      // Already showing - back to main
      return renderInPlace(interaction, 'main');
    }
    const embed = new EmbedBuilder()
      .setColor(hexToInt(ACCENT))
      .setTitle('⚙️ Ticket V2 — Global Settings')
      .setDescription(
        '> Settings per-panel ada di menu Manage Panel.\n> Settings global berikut hanya untuk analytics & auto-features.\n\n**Quick toggles** (pakai button di bawah)'
      )
      .addFields(
        { name: '📊 Analytics', value: s.enableAnalytics !== false ? '✅ On' : '❌ Off', inline: true },
        { name: '🔔 Auto-Reminder', value: s.enableAutoReminder !== false ? '✅ On' : '❌ Off', inline: true },
        { name: '⏰ Auto-Close', value: s.enableAutoClose !== false ? '✅ On' : '❌ Off', inline: true },
      )
      .setTimestamp();
    return interaction.update({ embeds: [embed], components: [
      { type: 1, components: [
        { type: 2, style: 2, custom_id: 'tv2_toggle_analytics', label: 'Toggle Analytics' },
        { type: 2, style: 2, custom_id: 'tv2_toggle_reminder', label: 'Toggle Reminder' },
        { type: 2, style: 2, custom_id: 'tv2_toggle_closer', label: 'Toggle Auto-Close' },
        { type: 2, style: 2, custom_id: 'tv2_back_main', label: '◀ Kembali' },
      ]},
    ] });
  }
  if (cid === 'tv2_analytics' || cid === 'tv2_analytics_refresh') {
    const a = (await import('../utils/ticketv2.js')).getAnalytics(guildId);
    const fmt = (ms) => ms == null ? '—' : ms < 60_000 ? `${Math.round(ms/1000)}s` : ms < 3_600_000 ? `${Math.round(ms/60_000)}m` : `${(ms/3_600_000).toFixed(1)}h`;
    const topHelpers = Object.entries(a.byHelper || {}).sort((x, y) => y[1] - x[1]).slice(0, 10);
    const topReasons = Object.entries(a.byReason || {}).sort((x, y) => y[1] - x[1]).slice(0, 10);
    const openRate = a.totalCreated > 0
      ? Math.round(((a.totalCreated - a.totalClosed) / a.totalCreated) * 100)
      : 0;
    // Last 7 days bar chart
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().split('T')[0];
      const count = a.byDay?.[key] || 0;
      const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      days.push({ label, count });
    }
    const maxDay = Math.max(...days.map(d => d.count), 1);
    const dayChart = days.map(d => {
      const bar = '█'.repeat(Math.round((d.count / maxDay) * 8));
      return `\`${d.label.padEnd(8)}\` ${bar} ${d.count}`;
    }).join('\n');
    // By hour (peak hours 8-22 + any with data)
    const hours = Array.from({ length: 24 }, (_, h) => a.byHour?.[h] || 0);
    const maxHour = Math.max(...hours, 1);
    const hourChart = hours
      .map((c, h) => `\`${String(h).padStart(2, '0')}\` ${'█'.repeat(Math.round((c / maxHour) * 6))} ${c}`)
      .filter((_, h) => hours[h] > 0 || (h >= 8 && h <= 22))
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(hexToInt(ACCENT))
      .setTitle('📊 Ticket V2 — Analytics Dashboard')
      .addFields(
        { name: '📈 Total', value: `Created: **${a.totalCreated || 0}**\nClosed: **${a.totalClosed || 0}**\nOpen: **${(a.totalCreated || 0) - (a.totalClosed || 0)}** (${openRate}%)`, inline: true },
        { name: '⏱️ SLA', value: `Avg Response: **${fmt(a.avgResponseTimeMs)}**\nAvg Lifetime: **${fmt(a.avgLifetimeMs)}**`, inline: true },
        { name: '👑 Top Helpers', value: topHelpers.length ? topHelpers.map(([uid, n], i) => `\`${i+1}.\` <@${uid}> — ${n}x`).join('\n') : '*Belum ada data*', inline: false },
        { name: '📊 Close Reasons', value: topReasons.length ? topReasons.map(([r, n]) => `\`${r || 'unknown'}\`: ${n}`).join('\n') : '*Belum ada data*', inline: true },
        { name: '📅 Last 7 Days', value: dayChart || '*Belum ada data*', inline: true },
        { name: '🕐 Peak Hours (8-22)', value: hourChart || '*Belum ada data*', inline: false },
      )
      .setFooter({ text: '🎫 Analytics • Real-time dari database' })
      .setTimestamp();
    return interaction.update({ embeds: [embed], components: [
      { type: 1, components: [
        { type: 2, style: 2, custom_id: 'tv2_analytics_refresh', label: '🔄 Refresh' },
        { type: 2, style: 2, custom_id: 'tv2_back_main', label: '◀ Kembali' },
      ] },
    ] });
  }
  if (cid === 'tv2_toggle_analytics' || cid === 'tv2_toggle_reminder' || cid === 'tv2_toggle_closer') {
    const field = cid === 'tv2_toggle_analytics' ? 'enableAnalytics'
      : cid === 'tv2_toggle_reminder' ? 'enableAutoReminder'
      : 'enableAutoClose';
    const s = getSettings(guildId);
    saveSettings(guildId, { [field]: !s[field] });
    return interaction.update({ embeds: [{
      color: 0x2ecc71,
      title: '✅ Updated',
      description: `${field} → **${!s[field] ? 'On' : 'Off'}**`,
    }], components: [{ type: 1, components: [
      { type: 2, style: 1, custom_id: 'tv2_settings', label: '◀ Kembali ke Settings' },
    ] }] });
  }

  // (Note: tv2_select_panel is a StringSelectMenu, handled in handleTicketV2Select, not here.)

  // ── Per-panel action buttons (customId: tv2_<action>:<panelId>) ──
  const match = cid.match(/^tv2_(\w+):(.+)$/);
  if (match) {
    const [, subAction, panelId] = match;

    if (subAction === 'edit_basic') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const { modalEditBasic } = await import('../utils/ticketv2UI.js');
      return interaction.showModal(modalEditBasic(panelId, panel));
    }

    if (subAction === 'edit_design') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const { modalEditDesign } = await import('../utils/ticketv2UI.js');
      return interaction.showModal(modalEditDesign(panelId, panel));
    }

    if (subAction === 'edit_settings') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const { modalEditSettings } = await import('../utils/ticketv2UI.js');
      return interaction.showModal(modalEditSettings(panelId, panel));
    }

    if (subAction === 'edit_category') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const row = {
        type: 1,
        components: [{
          type: 8,
          custom_id: `tv2_set_category:${panelId}`,
          placeholder: '📁 Pilih channel category untuk tiket…',
          channel_types: [4],
          min_values: 0,
          max_values: 1,
        }],
      };
      return interaction.update({ embeds: [{
        color: hexToInt(panel.color || ACCENT),
        title: `📁 Set Category — ${panel.name}`,
        description: 'Pilih channel category di mana tiket akan dibuat. Atau kosongkan untuk hapus.',
      }], components: [row] });
    }

    if (subAction === 'edit_staff') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const row = {
        type: 1,
        components: [{
          type: 6,
          custom_id: `tv2_set_staff:${panelId}`,
          placeholder: '👑 Pilih staff role (multi-select)…',
          min_values: 0,
          max_values: 10,
        }],
      };
      return interaction.update({ embeds: [{
        color: hexToInt(panel.color || ACCENT),
        title: `👑 Set Staff Role — ${panel.name}`,
        description: 'Pilih role yang boleh handle tiket. Bisa lebih dari 1 (multi-select).',
      }], components: [row] });
    }

    if (subAction === 'manage_types') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const embed = new EmbedBuilder()
        .setColor(hexToInt(panel.color || ACCENT))
        .setTitle(`🎟️ Tipe Tiket — ${panel.name}`)
        .setDescription(panel.ticketTypes?.length
          ? panel.ticketTypes.map((t, i) =>
              `\`${i + 1}.\` ${t.emoji || '🎫'} **${t.name}** — ${t.description || 'no desc'}`).join('\n')
          : '*Belum ada tipe.*')
        .setTimestamp();
      const rows = [
        new ActionRowBuilderSafe()
          .addSelectMenu({
            customId: `tv2_type_action:${panelId}`,
            placeholder: '🎟️ Pilih tipe untuk edit/hapus…',
            options: (panel.ticketTypes || []).map((t, i) => ({
              label: `${t.emoji || '🎫'} ${t.name}`.slice(0, 80),
              description: t.description?.slice(0, 80) || 'no desc',
              value: t.id,
              emoji: t.emoji || '🎟️',
            })),
            disabled: !panel.ticketTypes?.length,
          })
          .toRow(),
        new ActionRowBuilderSafe()
          .addButton({ customId: `tv2_type_add:${panelId}`, label: '➕ Tambah Tipe', style: 'Success' })
          .addButton({ customId: `tv2_panel_back:${panelId}`, label: '◀ Kembali', style: 'Secondary' })
          .toRow(),
      ];
      return interaction.update({ embeds: [embed], components: rows });
    }

    if (subAction === 'type_add') {
      const { modalAddType } = await import('../utils/ticketv2UI.js');
      return interaction.showModal(modalAddType(panelId));
    }

    if (subAction === 'panel_back') {
      return renderInPlace(interaction, 'detail', panelId);
    }

    if (subAction === 'delete_panel') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      const { modalConfirmDelete } = await import('../utils/ticketv2UI.js');
      return interaction.showModal(modalConfirmDelete(panelId, panel.name));
    }

    if (subAction === 'publish') {
      const panel = getPanel(guildId, panelId);
      if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
      if (!panel.ticketTypes?.length) {
        return renderInPlace(interaction, 'detail', panelId, '⚠️ Tambah ticket type dulu sebelum publish.');
      }
      const row = {
        type: 1,
        components: [{
          type: 8, // ChannelSelect
          custom_id: `tv2_publish_channel:${panelId}`,
          placeholder: '📢 Pilih channel untuk publish panel ini…',
          channel_types: [0, 5], // GuildText, GuildNews
          min_values: 0,
          max_values: 1,
        }],
      };
      const publishedHint = panel.panelMessageChannelId
        ? `> Panel ini sudah di-publish di <#${panel.panelMessageChannelId}>.\n> Pilih channel lain untuk re-publish / pindah.`
        : '> Pilih channel tujuan. Bot akan post embed + button/select tiket di sana.';
      return interaction.update({
        embeds: [{
          color: hexToInt(panel.color || ACCENT),
          title: `🚀 Publish Panel — ${panel.name}`,
          description: publishedHint,
        }],
        components: [row],
      });
    }
  }

  return false;
}

// ════════════════════════════════════════
// SELECT MENU HANDLERS
// ════════════════════════════════════════

export async function handleTicketV2Select(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('tv2_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak' }],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const guildId = interaction.guildId;
  const cid = interaction.customId;
  const values = interaction.values;

  // ── Panel select (from list) ──
  if (cid === 'tv2_select_panel') {
    const panelId = values[0];
    return renderInPlace(interaction, 'detail', panelId);
  }

  // ── Channel select for category ──
  if (cid.startsWith('tv2_publish_channel:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(guildId, panelId);
    if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
    const targetChannelId = values[0];
    if (!targetChannelId) {
      return renderInPlace(interaction, 'detail', panelId, '⚠️ Tidak ada channel dipilih.');
    }
    // Publish
    const { publishPanel } = await import('../utils/ticketv2Flow.js');
    const result = await publishPanel(guild, panelId, targetChannelId);
    if (!result.success) {
      return renderInPlace(interaction, 'detail', panelId, `❌ Publish gagal: ${result.error}`);
    }
    const flash = result.isUpdate
      ? `🔄 Panel di-update di <#${targetChannelId}>.`
      : `✅ Panel di-publish di <#${targetChannelId}>!`;
    return renderInPlace(interaction, 'detail', panelId, flash);
  }

  if (cid.startsWith('tv2_set_category:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(guildId, panelId);
    if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
    const newCategoryId = values[0] || null;
    const updated = updatePanel(guildId, panelId, { categoryId: newCategoryId });
    return renderInPlace(interaction, 'detail', panelId,
      newCategoryId ? `📁 Category diset ke <#${newCategoryId}>.` : '📁 Category dihapus.');
  }

  // ── Role select for staff ──
  if (cid.startsWith('tv2_set_staff:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(guildId, panelId);
    if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
    const newStaffRoles = values;
    updatePanel(guildId, panelId, { staffRoles: newStaffRoles });
    return renderInPlace(interaction, 'detail', panelId,
      newStaffRoles.length
        ? `👑 Staff roles diupdate: ${newStaffRoles.map(r => `<@&${r}>`).join(', ')}`
        : '👑 Staff roles dihapus.');
  }

  // ── Type select (for edit/delete) ──
  if (cid.startsWith('tv2_type_action:')) {
    const panelId = cid.split(':')[1];
    const typeId = values[0];
    const panel = getPanel(guildId, panelId);
    if (!panel) return renderInPlace(interaction, 'list', null, '❌ Panel not found.');
    const t = panel.ticketTypes?.find(t => t.id === typeId);
    if (!t) return renderInPlace(interaction, 'detail', panelId, '❌ Type not found.');

    const embed = new EmbedBuilder()
      .setColor(hexToInt(panel.color || ACCENT))
      .setTitle(`🎟️ Edit/Delete: ${t.name}`.slice(0, 256))
      .setDescription(`**Tipe:** ${t.emoji || '🎫'} ${t.name}\n**Description:** ${t.description || '—'}\n**Button Style:** ${t.buttonStyle}\n**Order:** ${t.order}`.slice(0, 4096))
      .setTimestamp();
    return safeUpdateOrEdit(interaction, {
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: `tv2_type_delete_confirm:${panelId}:${typeId}`, label: '🗑️ Hapus Tipe Ini' },
          { type: 2, style: 2, custom_id: `tv2_manage_types:${panelId}`, label: '◀ Kembali' },
        ],
      }],
    });
  }

  return false;
}

// ════════════════════════════════════════
// MODAL SUBMIT HANDLERS
// ════════════════════════════════════════

export async function handleTicketV2Modal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('tv2_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak' }], flags: MessageFlags.Ephemeral });
  }

  const cid = interaction.customId;
  const guildId = interaction.guildId;

  // ── Create panel ──
  if (cid === 'tv2_modal_create') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const color = interaction.fields.getTextInputValue('color').trim() || '#5865F2';

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Color invalid', description: 'Format: `#RRGGBB` (hex).' }], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    const panel = addPanel(guildId, { name, description, color });
    return renderInPlace(interaction, 'detail', panel.id, `➕ Panel **${name}** berhasil dibuat!`);
  }

  // ── Edit basic ──
  if (cid.startsWith('tv2_modal_edit_basic:')) {
    const panelId = cid.split(':')[1];
    const name = interaction.fields.getTextInputValue('name').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const color = interaction.fields.getTextInputValue('color').trim() || '#5865F2';
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Color invalid' }], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();
    updatePanel(guildId, panelId, { name, description, color });
    return renderInPlace(interaction, 'detail', panelId, '✏️ Info panel diupdate.');
  }

  // ── Edit design ──
  if (cid.startsWith('tv2_modal_edit_design:')) {
    const panelId = cid.split(':')[1];
    const bannerUrl = interaction.fields.getTextInputValue('bannerUrl').trim();
    const thumbnailUrl = interaction.fields.getTextInputValue('thumbnailUrl').trim();
    const footerText = interaction.fields.getTextInputValue('footerText').trim();
    await interaction.deferUpdate();
    updatePanel(guildId, panelId, { bannerUrl, thumbnailUrl, footerText });
    return renderInPlace(interaction, 'detail', panelId, '🎨 Embed design diupdate.');
  }

  // ── Edit settings (cooldown/auto) ──
  if (cid.startsWith('tv2_modal_edit_settings:')) {
    const panelId = cid.split(':')[1];
    const cooldown = parseInt(interaction.fields.getTextInputValue('cooldownSeconds') || '300', 10);
    const maxTickets = parseInt(interaction.fields.getTextInputValue('maxTicketsPerUser') || '1', 10);
    const autoClose = parseInt(interaction.fields.getTextInputValue('autoCloseHours') || '48', 10);
    const reminder = parseInt(interaction.fields.getTextInputValue('reminderHours') || '24', 10);
    if (isNaN(cooldown) || isNaN(maxTickets) || isNaN(autoClose) || isNaN(reminder)) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Input harus angka.' }], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();
    updatePanel(guildId, panelId, {
      cooldownSeconds: Math.max(0, cooldown),
      maxTicketsPerUser: Math.max(1, maxTickets),
      autoCloseHours: Math.max(0, autoClose),
      reminderHours: Math.max(0, reminder),
    });
    return renderInPlace(interaction, 'detail', panelId, '⚙️ Auto-features & cooldown diupdate.');
  }

  // ── Add type ──
  if (cid.startsWith('tv2_modal_add_type:')) {
    const panelId = cid.split(':')[1];
    const name = interaction.fields.getTextInputValue('name').trim();
    const emoji = interaction.fields.getTextInputValue('emoji').trim() || '🎫';
    const description = interaction.fields.getTextInputValue('description').trim();
    await interaction.deferUpdate();
    addTicketType(panelId, { name, emoji, description, buttonStyle: 'Primary' });
    return renderInPlace(interaction, 'detail', panelId, `🎟️ Tipe **${name}** ditambahkan.`);
  }

  // ── Confirm delete panel ──
  if (cid.startsWith('tv2_modal_confirm_delete:')) {
    const panelId = cid.split(':')[1];
    const confirm = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();
    if (confirm !== 'HAPUS') {
      return interaction.reply({ embeds: [{ color: 0xf39c12, title: '⚠️ Dibatalkan', description: 'Ketik **HAPUS** untuk konfirmasi.' }], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();
    deletePanel(guildId, panelId);
    return renderInPlace(interaction, 'main', null, '🗑️ Panel dihapus (archived).');
  }

  return false;
}

// ════════════════════════════════════════
// BUTTON HANDLERS (separate from customId navigation)
// ════════════════════════════════════════

export async function handleTicketV2ActionButton(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('tv2_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '🔒 Akses Ditolak' }], flags: MessageFlags.Ephemeral });
  }

  const cid = interaction.customId;
  const guildId = interaction.guildId;

  // Type delete confirm
  if (cid.startsWith('tv2_type_delete_confirm:')) {
    const [, panelId, typeId] = cid.split(':');
    await interaction.deferUpdate();
    deleteTicketType(panelId, typeId);
    return renderInPlace(interaction, 'detail', panelId, '🗑️ Tipe dihapus.');
  }

  return false;
}

// ════════════════════════════════════════
// HELPER: Safe ActionRowBuilder (for inline JSON we use in some places)
// ════════════════════════════════════════

class ActionRowBuilderSafe {
  constructor() { this.components = []; }
  addSelectMenu({ customId, placeholder, options = [], disabled = false, minValues, maxValues, channelTypes }) {
    this.components.push({
      type: 3, // StringSelect
      custom_id: customId,
      placeholder,
      options,
      disabled,
      min_values: minValues,
      max_values: maxValues,
    });
    return this;
  }
  addButton({ customId, label, style = 'Primary', disabled = false, emoji }) {
    const styleMap = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 };
    this.components.push({
      type: 2, // Button
      style: styleMap[style] || 1,
      custom_id: customId,
      label,
      disabled,
      emoji: emoji ? { name: emoji } : undefined,
    });
    return this;
  }
  toRow() { return { type: 1, components: this.components }; }
}
