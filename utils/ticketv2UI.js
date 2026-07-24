/**
 * Ticket V2 UI builders — embeds, panels, modals.
 */

import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getPanels, getPanel } from './ticketv2.js';

const ACCENT = '#5865F2';
const SUCCESS = '#2ecc71';
const DANGER = '#e74c3c';
const WARN = '#f39c12';
const MUTED = '#95a5a6';

function intToHex(int) { return '#' + int.toString(16).padStart(6, '0'); }
function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }

function panelMain(guild, panels, settings, flash = null) {
  const totalActive = panels.length;
  const totalTickets = settings.totalTickets || 0;

  const desc = [
    '> Sistem tiket support V2 — production-grade.',
    '> Multi-panel, modal form, analytics, auto-features.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(hexToInt(ACCENT))
    .setAuthor({ name: `${guild.name} • Ticket V2`.slice(0, 256), iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle('🎫 Ticket System V2 — Settings')
    .setDescription(desc.join('\n').slice(0, 4096))
    .addFields(
      { name: '📋 Total Panel', value: `${totalActive} panel`, inline: true },
      { name: '🎫 Total Tiket', value: `#${totalTickets}`, inline: true },
      { name: '📊 Analytics', value: settings.enableAnalytics !== false ? '✅ On' : '❌ Off', inline: true },
      {
        name: '⚡ Auto-Features',
        value: [
          `🔔 Reminder: ${settings.enableAutoReminder !== false ? '✅' : '❌'}`,
          `⏰ Auto-Close: ${settings.enableAutoClose !== false ? '✅' : '❌'}`,
        ].join(' • '),
        inline: false,
      },
      {
        name: '📦 Daftar Panel',
        value: (panels.length
          ? panels.slice(0, 10).map((p, i) =>
              `\`${i + 1}.\` **${p.name.slice(0, 60)}** — ${(p.ticketTypes || []).length} tipe | ${p.categoryId ? `<#${p.categoryId}>` : '❌ no category'} | ${p.staffRoles?.length || 0} staff`).join('\n')
          : '*Belum ada panel.*').slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({ text: '🎫 Ticket V2 • Hanya Admin/Manage Server yang bisa akses' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tv2_create_panel')
        .setLabel('➕ Buat Panel')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('tv2_manage')
        .setLabel('📦 Kelola Panel')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(panels.length === 0),
      new ButtonBuilder()
        .setCustomId('tv2_settings')
        .setLabel('⚙️ Settings')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tv2_analytics')
        .setLabel('📊 Analytics')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tv2_close_panel')
        .setLabel('✖ Tutup')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embed, rows };
}

function panelListPanels(guild, panels) {
  const embed = new EmbedBuilder()
    .setColor(hexToInt(ACCENT))
    .setTitle('📦 Kelola Panel')
    .setDescription('Pilih panel yang mau di-manage:')
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('tv2_select_panel')
    .setPlaceholder('📦 Pilih panel…');

  for (const p of panels.slice(0, 25)) {
    select.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(p.name.slice(0, 80))
      .setDescription(`${(p.ticketTypes || []).length} tipe • ${p.staffRoles?.length || 0} staff`)
      .setValue(p.id)
      .setEmoji('🎫'));
  }

  const rows = [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tv2_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embed, rows };
}

function panelPanelDetail(guild, panel, flash = null) {
  const desc = [
    `> ID: \`${panel.id}\``,
    `> Color: ${panel.color}`,
    `> Display: ${panel.displayType}`,
    `> Category: ${panel.categoryId ? `<#${panel.categoryId}>` : '❌'}`,
    `> Archive: ${panel.archiveCategoryId ? `<#${panel.archiveCategoryId}>` : '❌'}`,
    `> Log: ${panel.logChannelId ? `<#${panel.logChannelId}>` : '❌'}`,
    `> Staff Roles: ${panel.staffRoles?.length ? panel.staffRoles.map(r => `<@&${r}>`).join(', ') : '❌'}`,
    `> Cooldown: ${panel.cooldownSeconds || 300}s | Max/User: ${panel.maxTicketsPerUser || 1}`,
    `> Auto: claim=${panel.autoClaim ? '✅' : '❌'} | close=${panel.autoCloseHours || 48}h | reminder=${panel.reminderHours || 24}h`,
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(hexToInt(panel.color || ACCENT))
    .setTitle(`🎫 ${panel.name}`.slice(0, 256))
    .setDescription(desc.join('\n').slice(0, 4096))
    .addFields(
      {
        name: '📝 Deskripsi',
        value: (panel.description || '*kosong*').slice(0, 1024),
        inline: false,
      },
      {
        name: `🎟️ Tipe Tiket (${(panel.ticketTypes || []).length})`,
        value: (panel.ticketTypes?.length
          ? panel.ticketTypes.map((t, i) =>
              `\`${i + 1}.\` ${t.emoji || '🎫'} **${t.name}** — ${(t.description || 'no desc').slice(0, 100)}`).join('\n')
          : '*Belum ada tipe.*').slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({ text: '🎫 Panel Management' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tv2_edit_basic:${panel.id}`).setLabel('✏️ Edit Info').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tv2_edit_design:${panel.id}`).setLabel('🎨 Edit Embed').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tv2_manage_types:${panel.id}`).setLabel('🎟️ Manage Tipe').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tv2_edit_category:${panel.id}`).setLabel('📁 Set Category').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tv2_edit_staff:${panel.id}`).setLabel('👑 Set Staff Role').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tv2_edit_settings:${panel.id}`).setLabel('⚙️ Auto/Cooldown').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tv2_publish:${panel.id}`).setLabel('🚀 Publish').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tv2_delete_panel:${panel.id}`).setLabel('🗑️ Hapus').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('tv2_manage').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embed, rows };
}

function modalCreatePanel() {
  return new ModalBuilder()
    .setCustomId('tv2_modal_create')
    .setTitle('Buat Panel Tiket Baru')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nama Panel')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setPlaceholder('Contoh: Support, Report Bug, Partnership')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Deskripsi (ditampilkan di embed)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(400)
          .setPlaceholder('Pilih kategori bantuan di bawah ini…')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Warna Embed (hex, contoh: #5865F2)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue('#5865F2')
          .setPlaceholder('#5865F2')
      ),
    );
}

function modalEditBasic(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`tv2_modal_edit_basic:${panelId}`)
    .setTitle('Edit Info Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nama Panel')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(panel.name)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Deskripsi')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(400)
          .setValue(panel.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Warna (hex)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue(panel.color || '#5865F2')
      ),
    );
}

function modalEditDesign(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`tv2_modal_edit_design:${panelId}`)
    .setTitle('Edit Embed Design')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bannerUrl')
          .setLabel('Banner Image URL (opsional, di atas embed)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(panel.bannerUrl || '')
          .setPlaceholder('https://i.imgur.com/...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnailUrl')
          .setLabel('Thumbnail URL (opsional, di pojok kanan)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(panel.thumbnailUrl || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footerText')
          .setLabel('Footer Text')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setValue(panel.footerText || '')
          .setPlaceholder('🎫 Ticket System')
      ),
    );
}

function modalEditSettings(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`tv2_modal_edit_settings:${panelId}`)
    .setTitle('Auto-Features & Cooldown')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cooldownSeconds')
          .setLabel('Cooldown antar tiket (detik, min 0)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(panel.cooldownSeconds ?? 300))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('maxTicketsPerUser')
          .setLabel('Max tiket aktif per user (min 1)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(panel.maxTicketsPerUser ?? 1))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('autoCloseHours')
          .setLabel('Auto-close setelah N jam inaktif (0=off)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(panel.autoCloseHours ?? 48))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reminderHours')
          .setLabel('Reminder ke staff setelah N jam (0=off)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(panel.reminderHours ?? 24))
      ),
    );
}

function modalAddType(panelId) {
  return new ModalBuilder()
    .setCustomId(`tv2_modal_add_type:${panelId}`)
    .setTitle('Tambah Tipe Tiket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nama Tipe')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(40)
          .setPlaceholder('Bug Report, Pertanyaan, Partnership, dll')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Emoji (1 karakter)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(2)
          .setPlaceholder('🐛')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Deskripsi')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(200)
          .setPlaceholder('Lapor bug yang kamu temui…')
      ),
    );
}

function modalConfirmDelete(panelId, panelName) {
  // Label max 45 chars. We have prefix "Ketik HAPUS untuk hapus \"" (22) + "\" " (2) = 24 chars overhead.
  // So short can be at most 21 chars to stay under 45.
  const short = panelName.length > 21 ? panelName.slice(0, 18) + '...' : panelName;
  const label = `Hapus "${short}"? Ketik HAPUS`; // shorter format, ~30 chars
  return new ModalBuilder()
    .setCustomId(`tv2_modal_confirm_delete:${panelId}`)
    .setTitle('Konfirmasi Hapus Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm')
          .setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('HAPUS')
      ),
    );
}

function panelClosed() {
  return {
    embed: new EmbedBuilder()
      .setColor(hexToInt(MUTED))
      .setTitle('✖ Panel Ditutup')
      .setDescription('Buka lagi kapan saja dengan `/ticketv2 settings`.')
      .setTimestamp(),
    rows: [],
  };
}

export {
  panelMain, panelListPanels, panelPanelDetail,
  modalCreatePanel, modalEditBasic, modalEditDesign, modalEditSettings,
  modalAddType, modalConfirmDelete, panelClosed,
  intToHex, hexToInt, ACCENT, SUCCESS, DANGER, WARN, MUTED,
};
