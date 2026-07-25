/**
 * /adminfishing V2 — Single button panel for all fishing admin features.
 *
 * Was: 24 subcommands across 2 commands (adminfishing + setevent).
 * Now: one `/adminfishing` with button panel (like /ticketv2).
 *
 * Categories (8):
 *   🗺️ Zona        — addzona, delzona, addzonafish, removezonafish, listzona
 *   🐟 Ikan        — addfish, delfish
 *   🎣 Pancingan   — addrod, delrod
 *   💎 Currency    — addgems, delgems
 *   ⏰ Event Zona  — addtempzona, spawnfish, setspawninterval, setrestricted
 *   🌦️ Cuaca       — mulai, custom, setchannel, stop, info
 *   🛒 Shop        — addshopitem, delshopitem
 *   📊 Stats       — view quick stats
 */

import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
  ChannelType, RoleSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import {
  getZonaData, saveZonaData, getFishData, saveFishData,
  getRodData, saveRodData, getPlayer, savePlayer,
  getShopData, saveShopData, getSpawnConfig, saveSpawnConfig,
  getEventData, saveEventData, getActiveEvents, addActiveEvent,
  removeActiveEvent, clearActiveEvents,
} from '../utils/database.js';
import { getRarityEmoji, formatChance, formatNumber, formatGems } from '../utils/fishing.js';
import { RARITY_ORDER } from '../utils/fishing.js';
import { spawnFish, startAutoInterval, stopAutoInterval } from '../utils/spawnNotifier.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';
import { getGuildConfig, updateGuildConfig, addHistory } from '../utils/adminfishingConfig.js';

// ══════════════
// COMMAND DEFINITION
// ══════════════

export const data = new SlashCommandBuilder()
  .setName('adminfishing')
  .setDescription('🎣 Admin fishing panel — kelola zona, ikan, pancingan, event, shop, currency')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ══════════════
// MAIN ENTRY
// ══════════════

export async function execute(interaction) {
  // Permission check
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [{ color: 0xe74c3c, title: '❌ Akses Ditolak', description: 'Hanya untuk **Owner**!' }],
      flags: MessageFlags.Ephemeral,
    });
  }

  return showMainPanel(interaction);
}

// ══════════════
// MAIN PANEL
// ══════════════

async function showMainPanel(interaction) {
  const { guildId } = interaction;
  const zonaData = getZonaData();
  const fishData = getFishData();
  const rodData = getRodData();
  const shopData = getShopData();
  const eventData = getEventData();
  const activeEvents = getActiveEvents();
  const spawnConfig = getSpawnConfig();

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🎣 Admin Fishing Panel')
    .setDescription('Kelola semua aspek fishing system dari sini.\nKlik kategori di bawah untuk mulai.')
    .addFields(
      { name: '🗺️ Zona', value: `${Object.keys(zonaData.zonas).length} zona`, inline: true },
      { name: '🐟 Ikan', value: `${fishData.fish?.length || 0} species`, inline: true },
      { name: '🎣 Pancingan', value: `${rodData.rods?.length || 0} rod`, inline: true },
      { name: '🛒 Shop', value: `${shopData.items?.length || 0} item`, inline: true },
      { name: '🌦️ Event Aktif', value: `${activeEvents.length}/3 stack`, inline: true },
      { name: '⏰ Auto Spawn', value: spawnConfig.spawnInterval ? `Tiap ${spawnConfig.spawnInterval} menit` : 'Off', inline: true },
    )
    .setFooter({ text: '🎣 Admin Panel • Pilih kategori di bawah' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_zone').setLabel('🗺️ Zona').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('af_fish').setLabel('🐟 Ikan').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('af_rod').setLabel('🎣 Pancingan').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_event').setLabel('⏰ Event Zona').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_weather').setLabel('🌦️ Cuaca').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_currency').setLabel('💎 Currency').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('af_stats').setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('af_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_close').setLabel('✖ Tutup').setStyle(ButtonStyle.Danger),
    ),
  ];

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({ embeds: [embed], components: rows });
  }
  return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

// ══════════════
// CATEGORY PANELS
// ══════════════

async function showZonePanel(interaction) {
  const zonaData = getZonaData();
  const zonas = Object.values(zonaData.zonas);
  const lines = zonas.length
    ? zonas.slice(0, 10).map((z, i) =>
        `\`${i + 1}.\` ${z.emoji} **${z.nama}** (\`${z.id}\`) — <#${z.channelId}> • ${z.fish.length} ikan${z.restricted ? ' 🔒' : ''}${z.isTemp ? ' ⏰' : ''}`
      ).join('\n')
    : '*Belum ada zona.*';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🗺️ Zona Management')
    .setDescription(lines.slice(0, 3500))
    .setFooter({ text: `${zonas.length} zona total` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_zone_add').setLabel('➕ Buat Zona').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_zone_list').setLabel('📋 Lihat Semua').setStyle(ButtonStyle.Secondary).setDisabled(zonas.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_zone_addfish').setLabel('➕ Tambah Ikan ke Zona').setStyle(ButtonStyle.Primary).setDisabled(zonas.length === 0),
      new ButtonBuilder().setCustomId('af_zone_removefish').setLabel('➖ Hapus Ikan dari Zona').setStyle(ButtonStyle.Primary).setDisabled(zonas.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_zone_delete').setLabel('🗑️ Hapus Zona').setStyle(ButtonStyle.Danger).setDisabled(zonas.length === 0),
      new ButtonBuilder().setCustomId('af_zone_restricted').setLabel('🔒 Set Restricted').setStyle(ButtonStyle.Secondary).setDisabled(zonas.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showFishPanel(interaction) {
  const fishData = getFishData();
  const fish = fishData.fish || [];
  const lines = fish.length
    ? fish.slice(0, 10).map((f, i) => `\`${i + 1}.\` ${f.emoji} **${f.name}** (${f.rarity}) — \`${f.id}\``).join('\n')
    : '*Belum ada ikan.*';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🐟 Fish Database')
    .setDescription(lines.slice(0, 3500))
    .setFooter({ text: `${fish.length} species total` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_fish_add').setLabel('➕ Tambah Ikan').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_fish_delete').setLabel('🗑️ Hapus Ikan').setStyle(ButtonStyle.Danger).setDisabled(fish.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showRodPanel(interaction) {
  const rodData = getRodData();
  const rods = rodData.rods || [];
  const lines = rods.length
    ? rods.slice(0, 10).map((r, i) => `\`${i + 1}.\` ${r.emoji} **${r.name}** — 🪙 ${formatNumber(r.price)} • +${r.luckBonus}% luck • -${r.cooldownReduction}s cd`).join('\n')
    : '*Belum ada pancingan.*';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🎣 Rod Database')
    .setDescription(lines.slice(0, 3500))
    .setFooter({ text: `${rods.length} rods total` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_rod_add').setLabel('➕ Tambah Rod').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_rod_delete').setLabel('🗑️ Hapus Rod').setStyle(ButtonStyle.Danger).setDisabled(rods.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showCurrencyPanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle('💎 Currency Management')
    .setDescription('Tambah/kurangi Gems user. Coins tidak bisa di-edit manual (didapat dari main game).');

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_cur_add').setLabel('➕ Tambah Gems').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_cur_del').setLabel('➖ Kurangi Gems').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showEventPanel(interaction) {
  const spawnConfig = getSpawnConfig();
  const activeEvents = getActiveEvents();
  const zonas = Object.values(getZonaData().zonas);

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('⏰ Event Zona Management')
    .setDescription(
      `**Auto Spawn:** ${spawnConfig.spawnInterval ? `✅ Tiap ${spawnConfig.spawnInterval} menit` : '❌ Off'}\n` +
      `**Active Temp Zona:** ${activeEvents.filter(e => e.isTemp).length}\n` +
      `**Total Zona:** ${zonas.length}`
    )
    .setFooter({ text: '⏰ Event Zona • Untuk event cuaca, buka tab 🌦️ Cuaca' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_evt_temp').setLabel('⏰ Buat Temp Zona').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_evt_spawn').setLabel('🐟 Spawn Ikan').setStyle(ButtonStyle.Primary).setDisabled(zonas.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_evt_setinterval').setLabel('⏱️ Set Auto-Spawn Interval').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showWeatherPanel(interaction) {
  const eventData = getEventData();
  const activeEvents = getActiveEvents();
  const templates = getGuildConfig(interaction.guildId).eventTemplates;

  const lines = activeEvents.length
    ? activeEvents.map((e, i) => {
        const rem = e.endsAt ? `<t:${Math.floor(e.endsAt / 1000)}:R>` : '∞';
        return `**${i + 1}.** ${e.emoji} **${e.name}** — ⏱️ ${rem} | ID: \`${e.id}\``;
      }).join('\n')
    : '*Tidak ada event aktif.*';

  const tplLines = Object.values(templates).map(t => `${t.emoji} **${t.name}** (${t.id})`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('🌦️ Cuaca/Event Management')
    .setDescription(
      `**Event Aktif (${activeEvents.length}/3 stack):**\n${lines}\n\n` +
      `**Channel Pengumuman:** ${eventData.announcementChannelId ? `<#${eventData.announcementChannelId}>` : '❌ Belum diset'}\n\n` +
      `**Template Tersimpan:**\n${tplLines || '*Belum ada template*'}`
    )
    .setFooter({ text: '🌦️ Weather System' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_wx_mulai').setLabel('▶️ Mulai Preset').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_wx_custom').setLabel('⚙️ Custom Event').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_wx_template').setLabel('📋 Pakai Template').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('af_wx_setchannel').setLabel('📢 Set Channel').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_wx_stop').setLabel('⏹️ Stop Event').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showShopPanel(interaction) {
  const shopData = getShopData();
  const items = shopData.items || [];
  const lines = items.length
    ? items.slice(0, 10).map((i, idx) => `\`${idx + 1}.\` ${i.emoji} **${i.name}** (${i.type}) — 🪙 ${formatNumber(i.priceCoins || 0)} ${i.priceGems ? `💎 ${i.priceGems}` : ''}`.trim()).join('\n')
    : '*Belum ada item di shop.*';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🛒 Shop Management')
    .setDescription(lines.slice(0, 3500))
    .setFooter({ text: `${items.length} item total` });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_shop_add').setLabel('➕ Tambah Item').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_shop_del').setLabel('🗑️ Hapus Item').setStyle(ButtonStyle.Danger).setDisabled(items.length === 0),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showStatsPanel(interaction) {
  const zonaData = getZonaData();
  const fishData = getFishData();
  const rodData = getRodData();
  const shopData = getShopData();
  const eventData = getEventData();
  const activeEvents = getActiveEvents();
  const totalRoles = rodData.rods?.reduce((s, r) => s + 1, 0) || 0;

  const restrictedCount = Object.values(zonaData.zonas).filter(z => z.restricted).length;
  const tempCount = Object.values(zonaData.zonas).filter(z => z.isTemp).length;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 Fishing System Stats')
    .addFields(
      { name: '🗺️ Zona', value: `Total: **${Object.keys(zonaData.zonas).length}**\n🔒 Restricted: ${restrictedCount}\n⏰ Temp: ${tempCount}`, inline: true },
      { name: '🐟 Ikan', value: `Total: **${fishData.fish?.length || 0}**`, inline: true },
      { name: '🎣 Pancingan', value: `Total: **${rodData.rods?.length || 0}**`, inline: true },
      { name: '🛒 Shop Items', value: `Total: **${shopData.items?.length || 0}**`, inline: true },
      { name: '🌦️ Event Aktif', value: `${activeEvents.length}/3 stack`, inline: true },
      { name: '📢 Announce Channel', value: eventData.announcementChannelId ? `<#${eventData.announcementChannelId}>` : '❌', inline: true },
    )
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

async function showHistoryPanel(interaction) {
  const history = getGuildConfig(interaction.guildId).history || [];
  const lines = history.length
    ? history.slice(0, 15).map((h, i) => {
        const when = `<t:${Math.floor(h.at / 1000)}:R>`;
        return `\`${i + 1}.\` **${h.action}** — ${when} • ${h.detail || '-'}`;
      }).join('\n')
    : '*Belum ada history.*';

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('📜 Admin History (15 terakhir)')
    .setDescription(lines.slice(0, 4000))
    .setFooter({ text: 'Auto-logged dari /adminfishing actions' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_back_main').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return updateInteraction(interaction, { embeds: [embed], components: rows });
}

// Helper
function updateInteraction(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return interaction.update(payload);
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

// ══════════════
// MODAL DEFINITIONS
// ══════════════

const modals = {
  zone_add: () => new ModalBuilder()
    .setCustomId('af_modal_zone_add')
    .setTitle('➕ Buat Zona Mancing')
    .addComponents(
      actionRowText('id', 'ID Zona (lowercase, contoh: laut_dalam)', true, 30),
      actionRowText('nama', 'Nama Zona', true, 50),
      actionRowText('emoji', 'Emoji (1-4 char)', true, 4),
      actionRowParagraph('deskripsi', 'Deskripsi', true, 300),
      actionRowText('warna', 'Warna hex (contoh: #3498db)', false, 7),
    ),
  zone_addfish: () => {
    const m = new ModalBuilder()
      .setCustomId('af_modal_zone_addfish')
      .setTitle('➕ Tambah Ikan ke Zona')
      .addComponents(
        actionRowText('zona_id', 'ID Zona (contoh: laut_dalam)', true, 30),
        actionRowText('ikan_1', 'ID Ikan (wajib)', true, 50),
        actionRowText('ikan_2', 'ID Ikan ke-2 (opsional)', false, 50),
        actionRowText('ikan_3', 'ID Ikan ke-3 (opsional)', false, 50),
        actionRowText('ikan_4', 'ID Ikan ke-4 (opsional)', false, 50),
      );
    return m;
  },
  zone_removefish: () => new ModalBuilder()
    .setCustomId('af_modal_zone_removefish')
    .setTitle('➖ Hapus Ikan dari Zona')
    .addComponents(
      actionRowText('zona_id', 'ID Zona', true, 30),
      actionRowText('fish_id', 'ID Ikan', true, 50),
    ),
  zone_delete: () => new ModalBuilder()
    .setCustomId('af_modal_zone_delete')
    .setTitle('🗑️ Hapus Zona')
    .addComponents(
      actionRowText('id', 'ID Zona', true, 30),
      actionRowText('del_channel', 'Hapus channel juga? (yes/no, default no)', false, 5),
    ),
  zone_restricted: () => new ModalBuilder()
    .setCustomId('af_modal_zone_restricted')
    .setTitle('🔒 Set Restricted Zona')
    .addComponents(
      actionRowText('zona_id', 'ID Zona', true, 30),
      actionRowText('restricted', 'true / false', true, 5),
      actionRowText('harga_coins', 'Harga tiket (coins, 0=gratis)', false, 10),
      actionRowText('harga_gems', 'Harga tiket (gems, 0=tidak bisa gems)', false, 10),
    ),
  fish_add: () => new ModalBuilder()
    .setCustomId('af_modal_fish_add')
    .setTitle('🐟 Tambah Ikan Baru')
    .addComponents(
      actionRowText('id', 'ID Ikan (lowercase, no spasi)', true, 30),
      actionRowText('nama', 'Nama Ikan', true, 50),
      actionRowText('emoji', 'Emoji (1-4 char)', true, 4),
      actionRowText('rarity', 'Rarity (Common/Rare/Epic/dll)', true, 20),
      actionRowText('chance', 'Pembilang chance (mis. 1)', true, 6),
      actionRowText('banding', 'Penyebut (mis. 100 = 1/100)', true, 10),
      actionRowText('jenis', 'Satuan: biasa/k/m', false, 10),
      actionRowText('harga', 'Harga jual (coins)', true, 10),
      actionRowText('deskripsi', 'Deskripsi Ikan', true, 200),
    ),
  fish_delete: () => new ModalBuilder()
    .setCustomId('af_modal_fish_delete')
    .setTitle('🗑️ Hapus Ikan')
    .addComponents(actionRowText('id', 'ID Ikan', true, 30)),
  rod_add: () => new ModalBuilder()
    .setCustomId('af_modal_rod_add')
    .setTitle('🎣 Tambah Pancingan')
    .addComponents(
      actionRowText('id', 'ID Pancingan', true, 30),
      actionRowText('nama', 'Nama', true, 50),
      actionRowText('emoji', 'Emoji', true, 4),
      actionRowText('deskripsi', 'Deskripsi', true, 200),
      actionRowText('harga', 'Harga (coins)', true, 10),
      actionRowText('luck', 'Luck bonus % (max 1500)', true, 5),
      actionRowText('cooldown', 'Pengurangan cooldown (detik, max 9)', true, 2),
      actionRowText('mutasi_mult', 'Multiplier mutasi (default 1.0, max 10)', false, 5),
    ),
  rod_delete: () => new ModalBuilder()
    .setCustomId('af_modal_rod_delete')
    .setTitle('🗑️ Hapus Pancingan')
    .addComponents(actionRowText('id', 'ID Pancingan', true, 30)),
  cur_user_add: () => new ModalBuilder()
    .setCustomId('af_modal_cur_add')
    .setTitle('💎 Tambah Gems')
    .addComponents(
      actionRowText('user_id', 'User ID atau @mention', true, 30),
      actionRowText('jumlah', 'Jumlah gems', true, 10),
    ),
  cur_user_del: () => new ModalBuilder()
    .setCustomId('af_modal_cur_del')
    .setTitle('💎 Kurangi Gems')
    .addComponents(
      actionRowText('user_id', 'User ID', true, 30),
      actionRowText('jumlah', 'Jumlah gems', true, 10),
    ),
  evt_temp: () => new ModalBuilder()
    .setCustomId('af_modal_evt_temp')
    .setTitle('⏰ Buat Temp Zona')
    .addComponents(
      actionRowText('id', 'ID Zona', true, 30),
      actionRowText('nama', 'Nama', true, 50),
      actionRowText('emoji', 'Emoji', true, 4),
      actionRowText('deskripsi', 'Deskripsi', true, 300),
      actionRowText('durasi', 'Durasi (menit)', true, 5),
      actionRowText('warna', 'Warna hex (default #f39c12)', false, 7),
    ),
  evt_spawn: () => new ModalBuilder()
    .setCustomId('af_modal_evt_spawn')
    .setTitle('🐟 Spawn Ikan Eksklusif')
    .addComponents(
      actionRowText('zona_id', 'ID Zona', true, 30),
      actionRowText('fish_id', 'ID Ikan', true, 50),
      actionRowText('durasi', 'Durasi spawn (menit, max 120)', true, 4),
    ),
  evt_setinterval: () => new ModalBuilder()
    .setCustomId('af_modal_evt_setinterval')
    .setTitle('⏱️ Set Auto-Spawn Interval')
    .addComponents(actionRowText('menit', 'Interval (menit, 0=matikan)', true, 5)),
  wx_mulai: () => new ModalBuilder()
    .setCustomId('af_modal_wx_mulai')
    .setTitle('▶️ Mulai Event Cuaca Preset')
    .addComponents(
      actionRowText('preset', 'ID Preset Cuaca', true, 20),
      actionRowText('durasi', 'Durasi (menit)', true, 5),
    ),
  wx_custom: () => new ModalBuilder()
    .setCustomId('af_modal_wx_custom')
    .setTitle('⚙️ Custom Event Cuaca')
    .addComponents(
      actionRowText('nama', 'Nama Event', true, 50),
      actionRowText('emoji', 'Emoji', true, 4),
      actionRowText('deskripsi', 'Deskripsi', true, 300),
      actionRowText('durasi', 'Durasi (menit)', true, 5),
      actionRowText('luck', 'Global luck bonus +%', true, 5),
      actionRowText('luck_mode', 'add / multiply', true, 10),
      actionRowText('luck_multiplier', 'Multiplier luck (kalau mode multiply)', false, 3),
      actionRowText('common_mult', 'Multiplier Common (default 1)', false, 4),
      actionRowText('uncommon_mult', 'Multiplier Uncommon (default 1)', false, 4),
      actionRowText('rare_mult', 'Multiplier Rare (default 1)', false, 4),
      actionRowText('epic_mult', 'Multiplier Epic (default 1)', false, 4),
      actionRowText('legendary_mult', 'Multiplier Legendary (default 1)', false, 4),
      actionRowText('mythic_mult', 'Multiplier Mythic (default 1)', false, 4),
      actionRowText('secret_mult', 'Multiplier Secret (default 1)', false, 4),
    ),
  wx_setchannel: () => new ModalBuilder()
    .setCustomId('af_modal_wx_setchannel')
    .setTitle('📢 Set Channel Pengumuman')
    .addComponents(actionRowText('channel_id', 'Channel ID (kosongkan untuk reset)', false, 25)),
  wx_stop: () => new ModalBuilder()
    .setCustomId('af_modal_wx_stop')
    .setTitle('⏹️ Stop Event')
    .addComponents(actionRowText('event_id', 'Event ID (kosongkan = stop semua)', false, 30)),
  wx_template: () => new ModalBuilder()
    .setCustomId('af_modal_wx_template')
    .setTitle('📋 Pakai Template Event')
    .addComponents(
      actionRowText('template_id', 'Template: weekend_boost / golden_hour / maintenance', true, 30),
      actionRowText('durasi', 'Durasi (menit)', true, 5),
    ),
  shop_add: () => new ModalBuilder()
    .setCustomId('af_modal_shop_add')
    .setTitle('🛒 Tambah Item Shop')
    .addComponents(
      actionRowText('id', 'ID Item', true, 30),
      actionRowText('nama', 'Nama Item', true, 50),
      actionRowText('emoji', 'Emoji', true, 4),
      actionRowText('deskripsi', 'Deskripsi', true, 200),
      actionRowText('tipe', 'Tipe: ticket/bait/item/currency', true, 15),
      actionRowText('harga_coins', 'Harga coins', true, 10),
      actionRowText('harga_gems', 'Harga gems', true, 10),
      actionRowText('zona_id', 'ID Zona (wajib untuk tipe ticket)', false, 30),
    ),
  shop_del: () => new ModalBuilder()
    .setCustomId('af_modal_shop_del')
    .setTitle('🗑️ Hapus Item Shop')
    .addComponents(actionRowText('id', 'ID Item', true, 30)),
};

function actionRowText(customId, label, required, maxLength) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(TextInputStyle.Short).setRequired(!!required).setMaxLength(maxLength || 100)
  );
}
function actionRowParagraph(customId, label, required, maxLength) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(!!required).setMaxLength(maxLength || 1000)
  );
}

// ══════════════
// COMPONENT HANDLER
// ══════════════

export async function handleAdminFishingComponent(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('af_')) return false;
  if (interaction.customId.startsWith('af_modal_')) return false; // modal handled separately

  const cid = interaction.customId;

  if (cid === 'af_close') {
    return interaction.update({ embeds: [{ color: 0x95a5a6, title: '✖ Ditutup' }], components: [] });
  }
  if (cid === 'af_back_main') {
    return showMainPanelAsUpdate(interaction);
  }

  // Category panels
  const categoryMap = {
    'af_zone': showZonePanel, 'af_fish': showFishPanel, 'af_rod': showRodPanel,
    'af_event': showEventPanel, 'af_weather': showWeatherPanel, 'af_shop': showShopPanel,
    'af_currency': showCurrencyPanel, 'af_stats': showStatsPanel, 'af_history': showHistoryPanel,
  };
  if (categoryMap[cid]) return categoryMap[cid](interaction);

  // Modals - show modal
  if (cid.startsWith('af_') && cid.includes('_') && modals[cid.replace('af_', '').replace('modal_', '').split('_').slice(0, 1).join('')]) {
    // Not the right approach - we need direct mapping
  }

  // Map of action → modal
  const modalMap = {
    'af_zone_add': 'zone_add',
    'af_zone_addfish': 'zone_addfish',
    'af_zone_removefish': 'zone_removefish',
    'af_zone_delete': 'zone_delete',
    'af_zone_restricted': 'zone_restricted',
    'af_fish_add': 'fish_add',
    'af_fish_delete': 'fish_delete',
    'af_rod_add': 'rod_add',
    'af_rod_delete': 'rod_delete',
    'af_cur_add': 'cur_user_add',
    'af_cur_del': 'cur_user_del',
    'af_evt_temp': 'evt_temp',
    'af_evt_spawn': 'evt_spawn',
    'af_evt_setinterval': 'evt_setinterval',
    'af_wx_mulai': 'wx_mulai',
    'af_wx_custom': 'wx_custom',
    'af_wx_setchannel': 'wx_setchannel',
    'af_wx_stop': 'wx_stop',
    'af_wx_template': 'wx_template',
    'af_shop_add': 'shop_add',
    'af_shop_del': 'shop_del',
  };

  if (modalMap[cid]) {
    const modalFn = modals[modalMap[cid]];
    if (modalFn) return interaction.showModal(modalFn());
  }

  return false;
}

async function showMainPanelAsUpdate(interaction) {
  const { guildId } = interaction;
  const zonaData = getZonaData();
  const fishData = getFishData();
  const rodData = getRodData();
  const shopData = getShopData();
  const activeEvents = getActiveEvents();
  const spawnConfig = getSpawnConfig();

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🎣 Admin Fishing Panel')
    .setDescription('Kelola semua aspek fishing system dari sini.\nKlik kategori di bawah untuk mulai.')
    .addFields(
      { name: '🗺️ Zona', value: `${Object.keys(zonaData.zonas).length} zona`, inline: true },
      { name: '🐟 Ikan', value: `${fishData.fish?.length || 0} species`, inline: true },
      { name: '🎣 Pancingan', value: `${rodData.rods?.length || 0} rod`, inline: true },
      { name: '🛒 Shop', value: `${shopData.items?.length || 0} item`, inline: true },
      { name: '🌦️ Event Aktif', value: `${activeEvents.length}/3 stack`, inline: true },
      { name: '⏰ Auto Spawn', value: spawnConfig.spawnInterval ? `Tiap ${spawnConfig.spawnInterval} menit` : 'Off', inline: true },
    )
    .setFooter({ text: '🎣 Admin Panel • Pilih kategori di bawah' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_zone').setLabel('🗺️ Zona').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('af_fish').setLabel('🐟 Ikan').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('af_rod').setLabel('🎣 Pancingan').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_event').setLabel('⏰ Event Zona').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_weather').setLabel('🌦️ Cuaca').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('af_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_currency').setLabel('💎 Currency').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('af_stats').setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('af_history').setLabel('📜 History').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('af_close').setLabel('✖ Tutup').setStyle(ButtonStyle.Danger),
    ),
  ];

  return interaction.update({ embeds: [embed], components: rows });
}

// ══════════════
// MODAL HANDLER
// ══════════════

export async function handleAdminFishingModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('af_modal_')) return false;

  const cid = interaction.customId;
  const guildId = interaction.guildId;
  const v = (name) => interaction.fields.getTextInputValue(name);

  // Helper to log action
  function logAction(action, detail) {
    addHistory(guildId, { action, detail, by: interaction.user.id, at: Date.now() });
  }

  try {
    // ── ZONA ──
    if (cid === 'af_modal_zone_add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = v('id').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      const nama = v('nama').slice(0, 50);
      const emoji = v('emoji').slice(0, 4);
      const deskripsi = v('deskripsi').slice(0, 300);
      const warna = /^#[0-9A-Fa-f]{6}$/.test(v('warna')) ? v('warna') : '#3498db';
      const zonaData = getZonaData();
      if (zonaData.zonas[id]) return interaction.editReply({ embeds: [{ color: 0xe74c3c, title: `❌ Zona \`${id}\` sudah ada.` }] });
      zonaData.zonas[id] = { id, nama, emoji, deskripsi, color: warna, channelId: null, fish: [], createdAt: Date.now() };
      saveZonaData(zonaData);
      logAction('Buat Zona', `${id} (${nama})`);
      return interaction.editReply({ embeds: [{ color: 0x2ecc71, title: `✅ Zona \`${id}\` dibuat. (Channel belum ada — gunakan /adminfishing autoCreateChannel atau buat manual)` }] });
    }

    if (cid === 'af_modal_zone_addfish') {
      const zonaId = v('zona_id');
      const zonaData = getZonaData();
      const zona = zonaData.zonas[zonaId];
      if (!zona) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Zona tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      const { fish } = getFishData();
      const fishIds = [v('ikan_1'), v('ikan_2'), v('ikan_3'), v('ikan_4')].filter(Boolean);
      const added = []; const skipped = []; const notFound = [];
      for (const fishId of fishIds) {
        const f = fish.find(x => x.id === fishId);
        if (!f) { notFound.push(fishId); continue; }
        if (zona.fish.includes(fishId)) { skipped.push(f.emoji + ' ' + f.name); continue; }
        zona.fish.push(fishId);
        added.push(f.emoji + ' **' + f.name + '**');
      }
      saveZonaData(zonaData);
      logAction('Tambah Ikan Zona', `${added.length} ke ${zonaId}`);
      const lines = [];
      if (added.length) lines.push('✅ ' + added.join(', '));
      if (skipped.length) lines.push('⚠️ Sudah ada: ' + skipped.join(', '));
      if (notFound.length) lines.push('❌ Tidak ditemukan: ' + notFound.join(', '));
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: '🐟 Update Zona', description: lines.join('\n') }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_zone_removefish') {
      const zonaData = getZonaData();
      const zona = zonaData.zonas[v('zona_id')];
      if (!zona) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Zona tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      const before = zona.fish.length;
      zona.fish = zona.fish.filter(f => f !== v('fish_id'));
      if (zona.fish.length === before) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Ikan tidak ada di zona.' }], flags: MessageFlags.Ephemeral });
      saveZonaData(zonaData);
      logAction('Hapus Ikan Zona', `${v('fish_id')} dari ${v('zona_id')}`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `✅ Ikan dihapus dari zona.` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_zone_delete') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const zonaData = getZonaData();
      const id = v('id');
      const zona = zonaData.zonas[id];
      if (!zona) return interaction.editReply({ embeds: [{ color: 0xe74c3c, title: '❌ Zona tidak ditemukan.' }] });
      if (/^yes$/i.test(v('del_channel') || '') && zona.channelId) {
        const ch = await interaction.guild.channels.fetch(zona.channelId).catch(() => null);
        if (ch) await ch.delete().catch(() => {});
      }
      delete zonaData.zonas[id];
      saveZonaData(zonaData);
      logAction('Hapus Zona', id);
      return interaction.editReply({ embeds: [{ color: 0x2ecc71, title: `🗑️ Zona \`${id}\` dihapus.` }] });
    }

    if (cid === 'af_modal_zone_restricted') {
      const zonaData = getZonaData();
      const zona = zonaData.zonas[v('zona_id')];
      if (!zona) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Zona tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      const restricted = /^true$/i.test(v('restricted'));
      zona.restricted = restricted;
      if (restricted) {
        const shopData = getShopData();
        const ticketId = `ticket_${zona.id}`;
        const ticketItem = {
          id: ticketId, name: `Tiket ${zona.nama}`, emoji: '🎟️',
          description: `Tiket masuk ke zona ${zona.emoji} ${zona.nama}. Sekali pakai.`,
          type: 'ticket', zonaId: zona.id,
          priceCoins: parseInt(v('harga_coins') || '0') || 0,
          priceGems: parseInt(v('harga_gems') || '0') || 0,
          stock: -1,
        };
        const idx = shopData.items.findIndex(i => i.id === ticketId);
        if (idx >= 0) shopData.items[idx] = ticketItem;
        else shopData.items.unshift(ticketItem);
        saveShopData(shopData);
      } else {
        const shopData = getShopData();
        shopData.items = shopData.items.filter(i => i.id !== `ticket_${zona.id}`);
        saveShopData(shopData);
      }
      saveZonaData(zonaData);
      logAction(restricted ? 'Set Restricted' : 'Unrestrict Zona', zona.id);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: restricted ? `🔒 Zona \`${zona.id}\` restricted.` : `🔓 Zona \`${zona.id}\` bebas.` }], flags: MessageFlags.Ephemeral });
    }

    // ── FISH ──
    if (cid === 'af_modal_fish_add') {
      const fishData = getFishData();
      const id = v('id').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      if (fishData.fish.find(f => f.id === id)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID sudah ada.' }], flags: MessageFlags.Ephemeral });
      const chance = parseInt(v('chance')) || 1;
      const banding = parseInt(v('banding')) || 1;
      const jenis = v('jenis') || 'biasa';
      const mult = jenis === 'm' ? 1_000_000 : jenis === 'k' ? 1_000 : 1;
      const chancePercent = (chance / (banding * mult)) * 100;
      fishData.fish.push({
        id, name: v('nama'), emoji: v('emoji'), rarity: v('rarity'),
        chance: chancePercent, price: parseInt(v('harga')) || 100, description: v('deskripsi'),
      });
      saveFishData(fishData);
      logAction('Tambah Ikan', `${id} (${v('nama')})`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `✅ Ikan \`${id}\` ditambahkan!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_fish_delete') {
      const fishData = getFishData();
      const id = v('id');
      const idx = fishData.fish.findIndex(f => f.id === id);
      if (idx === -1) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Ikan tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      const removed = fishData.fish[idx];
      fishData.fish.splice(idx, 1);
      saveFishData(fishData);
      logAction('Hapus Ikan', `${id} (${removed.name})`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🗑️ Ikan \`${id}\` dihapus.` }], flags: MessageFlags.Ephemeral });
    }

    // ── ROD ──
    if (cid === 'af_modal_rod_add') {
      const rodData = getRodData();
      const id = v('id').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      if (rodData.rods.find(r => r.id === id)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID sudah ada.' }], flags: MessageFlags.Ephemeral });
      rodData.rods.push({
        id, name: v('nama'), emoji: v('emoji'), description: v('deskripsi'),
        price: parseInt(v('harga')) || 0, luckBonus: parseInt(v('luck')) || 0,
        cooldownReduction: parseInt(v('cooldown')) || 0,
        mutationMultiplier: parseFloat(v('mutasi_mult')) || 1.0,
        isDefault: false,
      });
      saveRodData(rodData);
      logAction('Tambah Rod', id);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🎣 Rod \`${id}\` ditambahkan!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_rod_delete') {
      const rodData = getRodData();
      const id = v('id');
      if (id === 'pancing_bambu') return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Default rod tidak bisa dihapus.' }], flags: MessageFlags.Ephemeral });
      const idx = rodData.rods.findIndex(r => r.id === id);
      if (idx === -1) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Rod tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      rodData.rods.splice(idx, 1);
      saveRodData(rodData);
      logAction('Hapus Rod', id);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🗑️ Rod \`${id}\` dihapus.` }], flags: MessageFlags.Ephemeral });
    }

    // ── CURRENCY ──
    if (cid === 'af_modal_cur_add' || cid === 'af_modal_cur_del') {
      const isDel = cid === 'af_modal_cur_del';
      const userInput = v('user_id').replace(/[<@!>]/g, '');
      const userId = userInput;
      const jumlah = parseInt(v('jumlah')) || 0;
      if (!jumlah) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Jumlah invalid.' }], flags: MessageFlags.Ephemeral });
      const player = getPlayer(userId);
      if (isDel && (player.gems || 0) < jumlah) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ User hanya punya ${player.gems || 0} gems.` }], flags: MessageFlags.Ephemeral });
      player.gems = isDel ? (player.gems || 0) - jumlah : (player.gems || 0) + jumlah;
      savePlayer(userId, player);
      logAction(isDel ? 'Kurangi Gems' : 'Tambah Gems', `${userId} ${isDel ? '-' : '+'}${jumlah}`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `${isDel ? '➖' : '➕'} ${jumlah} 💎 ${isDel ? 'dikurangi dari' : 'ditambahkan ke'} <@${userId}>.` }], flags: MessageFlags.Ephemeral });
    }

    // ── EVENT ──
    if (cid === 'af_modal_evt_temp') {
      const zonaData = getZonaData();
      const id = v('id').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      if (zonaData.zonas[id]) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID sudah ada.' }], flags: MessageFlags.Ephemeral });
      const durasi = parseInt(v('durasi')) || 60;
      const endsAt = Date.now() + durasi * 60_000;
      const warna = /^#[0-9A-Fa-f]{6}$/.test(v('warna')) ? v('warna') : '#f39c12';
      zonaData.zonas[id] = {
        id, nama: v('nama'), emoji: v('emoji'), deskripsi: v('deskripsi'),
        color: warna, channelId: null, fish: [], tempFish: [],
        isTemp: true, endsAt, createdAt: Date.now(),
      };
      saveZonaData(zonaData);
      logAction('Buat Temp Zona', `${id} (${durasi} menit)`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `⏰ Temp zona \`${id}\` dibuat (${durasi} menit, berakhir <t:${Math.floor(endsAt / 1000)}:R>).` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_evt_spawn') {
      const result = await spawnFish(interaction.client, v('zona_id'), v('fish_id'), parseInt(v('durasi')) || 30);
      if (!result.success) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Gagal', description: result.message }], flags: MessageFlags.Ephemeral });
      logAction('Spawn Fish', `${v('fish_id')} di ${v('zona_id')}`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🐟 ${result.fish.emoji} ${result.fish.name} di-spawn!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_evt_setinterval') {
      const menit = parseInt(v('menit')) || 0;
      const config = getSpawnConfig();
      if (menit === 0) {
        stopAutoInterval();
        config.spawnInterval = null;
        saveSpawnConfig(config);
        return interaction.reply({ embeds: [{ color: 0x95a5a6, title: '⏹️ Auto spawn off.' }], flags: MessageFlags.Ephemeral });
      }
      config.spawnInterval = menit;
      saveSpawnConfig(config);
      startAutoInterval(menit, interaction.client);
      logAction('Set Spawn Interval', `${menit} menit`);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `✅ Auto spawn: tiap ${menit} menit.` }], flags: MessageFlags.Ephemeral });
    }

    // ── WEATHER ──
    if (cid === 'af_modal_wx_mulai') {
      const eventData = getEventData();
      const events = getActiveEvents();
      if (events.length >= 3) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Stack penuh.' }], flags: MessageFlags.Ephemeral });
      const presetId = v('preset');
      const durasi = parseInt(v('durasi')) || 60;
      // Defensive: presets may be missing in DB
      if (!Array.isArray(eventData.presets)) eventData.presets = [];
      const preset = eventData.presets.find(p => p.id === presetId);
      if (!preset) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ Preset ${presetId} tidak valid. Coba: ${eventData.presets.map(p => p.id).join(', ') || '(belum ada preset)'}` }], flags: MessageFlags.Ephemeral });
      const newEvent = { ...preset, id: `${presetId}_${Date.now()}`, startedBy: interaction.user.id, startedAt: Date.now(), endsAt: Date.now() + durasi * 60_000 };
      const added = addActiveEvent(newEvent);
      if (!added) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Stack penuh saat add.' }], flags: MessageFlags.Ephemeral });
      logAction('Mulai Cuaca Preset', `${presetId} (${durasi}m)`);
      // Announce
      const ch = eventData.announcementChannelId ? await interaction.guild.channels.fetch(eventData.announcementChannelId).catch(() => null) : null;
      const embed = buildWeatherEventEmbed(newEvent, durasi * 60_000, events.length + 1);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      // Auto-end
      setTimeout(() => {
        removeActiveEvent(newEvent.id);
        if (ch) ch.send({ embeds: [{ color: 0x95a5a6, title: `${preset.emoji} Event Berakhir`, description: `**${preset.name}** telah berakhir.` }] }).catch(() => {});
      }, durasi * 60_000);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `▶️ Event \`${preset.name}\` dimulai!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_wx_custom') {
      const events = getActiveEvents();
      if (events.length >= 3) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Stack penuh.' }], flags: MessageFlags.Ephemeral });
      const durasi = parseInt(v('durasi')) || 60;
      const luckMode = v('luck_mode') === 'multiply' ? 'multiply' : 'add';
      const luckMult = parseFloat(v('luck_multiplier')) || 1;
      const rarityMultipliers = {};
      for (const r of RARITY_ORDER) {
        const val = parseFloat(v(`${r.toLowerCase()}_mult`));
        rarityMultipliers[r] = !isNaN(val) ? val : 1.0;
      }
      const newEvent = {
        id: `custom_${Date.now()}`,
        name: v('nama'), emoji: v('emoji'), description: v('deskripsi'),
        color: '#e74c3c',
        luckBonus: parseInt(v('luck')) || 0,
        luckMultiplyMode: luckMode === 'multiply',
        luckMultiplier: luckMult,
        rarityMultipliers,
        mutationBoost: 1,
        startedBy: interaction.user.id,
        startedAt: Date.now(),
        endsAt: Date.now() + durasi * 60_000,
      };
      const added = addActiveEvent(newEvent);
      if (!added) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Stack penuh saat add.' }], flags: MessageFlags.Ephemeral });
      logAction('Custom Event', v('nama'));
      const eventData = getEventData();
      const ch = eventData.announcementChannelId ? await interaction.guild.channels.fetch(eventData.announcementChannelId).catch(() => null) : null;
      const embed = buildWeatherEventEmbed(newEvent, durasi * 60_000, events.length + 1);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      setTimeout(() => {
        removeActiveEvent(newEvent.id);
        if (ch) ch.send({ embeds: [{ color: 0x95a5a6, title: `${v('emoji')} Event Berakhir`, description: `**${v('nama')}** telah berakhir.` }] }).catch(() => {});
      }, durasi * 60_000);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `▶️ Custom event \`${v('nama')}\` dimulai!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_wx_setchannel') {
      const eventData = getEventData();
      const channelIdRaw = v('channel_id')?.trim();
      if (!channelIdRaw) {
        eventData.announcementChannelId = null;
        saveEventData(eventData);
        logAction('Reset Wx Channel', '');
        return interaction.reply({ embeds: [{ color: 0x95a5a6, title: '🔕 Channel di-reset.' }], flags: MessageFlags.Ephemeral });
      }
      const channelId = channelIdRaw.replace(/[<#!>]/g, '');
      eventData.announcementChannelId = channelId;
      saveEventData(eventData);
      logAction('Set Wx Channel', channelId);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `📢 Channel diset: <#${channelId}>` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_wx_stop') {
      const eventId = v('event_id')?.trim();
      if (!eventId) {
        clearActiveEvents();
        logAction('Stop Semua Event', '');
        return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '⏹️ Semua event dihentikan.' }], flags: MessageFlags.Ephemeral });
      }
      removeActiveEvent(eventId);
      logAction('Stop Event', eventId);
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `⏹️ Event \`${eventId}\` dihentikan.` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_wx_template') {
      const config = getGuildConfig(guildId);
      const tplId = v('template_id');
      const tpl = config.eventTemplates[tplId];
      if (!tpl) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ Template ${tplId} tidak ada.` }], flags: MessageFlags.Ephemeral });
      const events = getActiveEvents();
      if (events.length >= 3) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Stack penuh.' }], flags: MessageFlags.Ephemeral });
      const durasi = parseInt(v('durasi')) || 60;
      const newEvent = {
        id: `${tplId}_${Date.now()}`,
        name: tpl.name, emoji: tpl.emoji, description: tpl.description, color: tpl.color,
        luckBonus: 50, luckMultiplyMode: false, luckMultiplier: 1,
        rarityMultipliers: { Common: 1, Uncommon: 1, Rare: 1, Epic: 1, Legendary: 1, Mythic: 1, Secret: 1 },
        mutationBoost: 1,
        startedBy: interaction.user.id, startedAt: Date.now(),
        endsAt: Date.now() + durasi * 60_000,
      };
      addActiveEvent(newEvent);
      logAction('Mulai Template', tplId);
      const eventData = getEventData();
      const ch = eventData.announcementChannelId ? await interaction.guild.channels.fetch(eventData.announcementChannelId).catch(() => null) : null;
      const embed = buildWeatherEventEmbed(newEvent, durasi * 60_000, events.length + 1);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      setTimeout(() => {
        removeActiveEvent(newEvent.id);
        if (ch) ch.send({ embeds: [{ color: 0x95a5a6, title: `${tpl.emoji} Event Berakhir`, description: `**${tpl.name}** telah berakhir.` }] }).catch(() => {});
      }, durasi * 60_000);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `▶️ Template \`${tplId}\` dimulai!` }], flags: MessageFlags.Ephemeral });
    }

    // ── SHOP ──
    if (cid === 'af_modal_shop_add') {
      const shopData = getShopData();
      const id = v('id').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      if (shopData.items.find(i => i.id === id)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID sudah ada.' }], flags: MessageFlags.Ephemeral });
      const tipe = v('tipe');
      if (tipe === 'ticket' && !v('zona_id')) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Tipe ticket butuh zona_id.' }], flags: MessageFlags.Ephemeral });
      const newItem = {
        id, name: v('nama'), emoji: v('emoji'), description: v('deskripsi'),
        type: tipe,
        priceCoins: parseInt(v('harga_coins')) || 0,
        priceGems: parseInt(v('harga_gems')) || 0,
        stock: -1,
      };
      if (tipe === 'ticket') newItem.zonaId = v('zona_id');
      shopData.items.push(newItem);
      saveShopData(shopData);
      logAction('Tambah Shop Item', id);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🛒 Item \`${id}\` ditambahkan!` }], flags: MessageFlags.Ephemeral });
    }

    if (cid === 'af_modal_shop_del') {
      const shopData = getShopData();
      const id = v('id');
      const idx = shopData.items.findIndex(i => i.id === id);
      if (idx === -1) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Item tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
      shopData.items.splice(idx, 1);
      saveShopData(shopData);
      logAction('Hapus Shop Item', id);
      return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🗑️ Item \`${id}\` dihapus.` }], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Modal handler tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
  } catch (e) {
    console.error('[adminfishing] modal error:', e.message);
    const isReplied = interaction.replied || interaction.deferred;
    const errPayload = { embeds: [{ color: 0xe74c3c, title: '❌ Error', description: e.message?.slice(0, 500) }], flags: MessageFlags.Ephemeral };
    if (isReplied) await interaction.editReply(errPayload);
    else await interaction.reply(errPayload);
  }
}

function buildWeatherEventEmbed(event, remainingMs, stackPos) {
  const multLines = RARITY_ORDER.map(r => {
    const mult = event.rarityMultipliers?.[r] ?? 1;
    const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
    const pct = mult > 1 ? `(+${Math.round((mult-1)*100)}%)` : mult < 1 ? `(-${Math.round((1-mult)*100)}%)` : '';
    return `${arrow} **${r}**: ×${mult} ${pct}`;
  }).join('\n');
  const luckText = event.luckMultiplyMode ? `×${event.luckMultiplier || 1}` : `+${event.luckBonus}%`;
  return new EmbedBuilder()
    .setColor(event.color || '#f39c12')
    .setTitle(`${event.emoji} EVENT: ${event.name}`)
    .setDescription(event.description)
    .addFields(
      { name: '⏱️ Durasi', value: `<t:${Math.floor((Date.now() + remainingMs) / 1000)}:R>`, inline: true },
      { name: '🍀 Luck', value: luckText, inline: true },
      { name: '📊 Stack', value: `${stackPos}/3`, inline: true },
      { name: '📈 Rarity', value: multLines },
    )
    .setFooter({ text: `ID: ${event.id}` })
    .setTimestamp();
}
