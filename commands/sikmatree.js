import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelSelectMenuBuilder,
  ChannelType,
} from 'discord.js';
import { getGuildData, saveGuildData, generateId } from '../utils/sikmatreeConfig.js';
import { getSortedLinks, publishOrUpdate } from '../utils/sikmatreePublish.js';

// ════════════════════════════════════════
// PANEL BUILDERS
// ════════════════════════════════════════

function panelMain(data) {
  const sorted = getSortedLinks(data);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🌳 SikmaTree — Settings')
    .setDescription('Kelola link collection server kamu yang tampil seperti Linktree di Discord.')
    .addFields(
      { name: '🔗 Total Links', value: `${data.links.length} link`, inline: true },
      { name: '📢 Channel', value: data.channelId ? `<#${data.channelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Auto Update', value: data.autoUpdate ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '📋 Preview Links', value: sorted.length > 0 ? sorted.slice(0, 5).map((l, i) => `\`${i + 1}.\` ${l.emoji || '🔗'} **${l.title}**`).join('\n') : '*Belum ada link*' }
    )
    .setFooter({ text: 'SikmaTree • Pilih aksi di bawah' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('st_add').setLabel('➕ Tambah Link').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('st_manage').setLabel('📋 Kelola Links').setStyle(ButtonStyle.Primary).setDisabled(data.links.length === 0),
      new ButtonBuilder().setCustomId('st_publish_settings').setLabel('⚙️ Pengaturan Publish').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('st_publish_now').setLabel('🚀 Publish').setStyle(ButtonStyle.Primary).setDisabled(!data.channelId || data.links.length === 0),
    )
  ];

  return { embed, rows };
}

function panelManage(data, selectedId = null, confirmDelete = false) {
  const sorted = getSortedLinks(data);

  if (sorted.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📋 Kelola Links')
      .setDescription('Belum ada link. Tambah link dulu dari menu utama!');
    const rows = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('st_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary)
    )];
    return { embed, rows };
  }

  const selected = selectedId ? sorted.find(l => l.id === selectedId) : null;
  const selectedIndex = selected ? sorted.indexOf(selected) : -1;

  // Build embed
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📋 Kelola Links');

  if (!selected) {
    embed.setDescription('Pilih link dari menu di bawah untuk mengedit atau menghapusnya.');
  } else if (confirmDelete) {
    embed
      .setColor('#e74c3c')
      .setDescription(`⚠️ Yakin mau hapus link ini?\n\n${selected.emoji || '🔗'} **${selected.title}**\n${selected.description || ''}\n\`${selected.url}\``)
      .setFooter({ text: 'Aksi ini tidak bisa dibatalkan!' });
  } else {
    embed
      .setDescription(`**Link Dipilih:**\n${selected.emoji || '🔗'} **${selected.title}**\n${selected.description ? `*${selected.description}*\n` : ''}\`${selected.url}\`\n${selected.imageUrl ? `\n🖼️ Ada image` : ''}`)
      .addFields({ name: '📊 Posisi', value: `#${selectedIndex + 1} dari ${sorted.length}`, inline: true });
  }

  const rows = [];

  if (confirmDelete) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('st_delete_confirm').setLabel('✅ Ya, Hapus').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('st_delete_cancel').setLabel('❌ Batal').setStyle(ButtonStyle.Secondary),
    ));
  } else {
    // Select menu
    const options = sorted.map((link, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${link.title.substring(0, 90)}`)
        .setDescription((link.description || link.url).substring(0, 100))
        .setValue(link.id)
        .setEmoji(link.emoji || '🔗')
        .setDefault(link.id === selectedId)
    );

    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('st_link_select')
        .setPlaceholder('📋 Pilih link…')
        .addOptions(options.slice(0, 25))
    ));

    if (selected) {
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('st_edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('st_delete').setLabel('🗑️ Hapus').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('st_move_up').setLabel('⬆️ Naik').setStyle(ButtonStyle.Secondary).setDisabled(selectedIndex === 0),
        new ButtonBuilder().setCustomId('st_move_down').setLabel('⬇️ Turun').setStyle(ButtonStyle.Secondary).setDisabled(selectedIndex === sorted.length - 1),
      ));
    }
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('st_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary)
  ));

  return { embed, rows };
}

function panelPublishSettings(data) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Pengaturan Publish')
    .addFields(
      { name: '📢 Channel Publish', value: data.channelId ? `<#${data.channelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Auto Update', value: data.autoUpdate ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '🪪 Message ID', value: data.messageId ? `\`${data.messageId}\`` : '*Belum dipublish*', inline: false },
    )
    .setDescription('Pilih channel dan atur auto update untuk SikmaTree.')
    .setFooter({ text: 'Auto Update: pesan otomatis diperbarui saat ada perubahan link' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('st_set_channel')
        .setPlaceholder('📢 Pilih channel publish…')
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('st_toggle_autoupdate')
        .setLabel(data.autoUpdate ? '🔴 Nonaktifkan Auto Update' : '🟢 Aktifkan Auto Update')
        .setStyle(data.autoUpdate ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('st_clear_message')
        .setLabel('🗑️ Reset Published Message')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!data.messageId),
      new ButtonBuilder().setCustomId('st_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    )
  ];

  return { embed, rows };
}

// ── Render helper ──
async function render(target, guildId, state, guild) {
  const data = getGuildData(guildId);
  let panel;

  switch (state.page) {
    case 'manage':
      panel = panelManage(data, state.selectedLinkId, state.confirmDelete);
      break;
    case 'publish_settings':
      panel = panelPublishSettings(data);
      break;
    default:
      panel = panelMain(data);
      break;
  }

  const payload = { embeds: [panel.embed], components: panel.rows };
  if (typeof target.update === 'function') await target.update(payload);
  else await target.editReply(payload);
}

// ── Modal helper ──
function linkModal(id, title, prefill = {}) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Judul Link').setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(100).setPlaceholder('Contoh: Website Kami').setValue(prefill.title || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Deskripsi').setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(200).setPlaceholder('Deskripsi singkat link ini').setValue(prefill.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('url').setLabel('URL').setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(500).setPlaceholder('https://example.com').setValue(prefill.url || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (opsional)').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(10).setPlaceholder('🔗').setValue(prefill.emoji || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL (opsional)').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(500).setPlaceholder('https://example.com/image.png').setValue(prefill.imageUrl || '')
      ),
    );
}

function parseModalFields(fields) {
  return {
    title: fields.getTextInputValue('title').trim(),
    description: fields.getTextInputValue('description').trim(),
    url: fields.getTextInputValue('url').trim(),
    emoji: fields.getTextInputValue('emoji').trim(),
    imageUrl: fields.getTextInputValue('imageUrl').trim(),
  };
}

// ════════════════════════════════════════
// COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('sikmatree')
  .setDescription('🌳 SikmaTree — Sistem kumpulan link ala Linktree di Discord')
  .addSubcommand(sub => sub.setName('settings').setDescription('Buka panel pengaturan SikmaTree'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'settings') return;

  const guildId = interaction.guild.id;
  const guild = interaction.guild;
  const state = { page: 'main', selectedLinkId: null, confirmDelete: false };

  const initData = getGuildData(guildId);
  const { embed, rows } = panelMain(initData);

  const msg = await interaction.reply({
    embeds: [embed],
    components: rows,
    ephemeral: true,
    fetchReply: true
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 600_000, // 10 menit
  });

  collector.on('collect', async i => {
    const id = i.customId;

    // ── Navigasi ──
    if (id === 'st_back') {
      state.page = 'main';
      state.selectedLinkId = null;
      state.confirmDelete = false;
      return render(i, guildId, state, guild);
    }

    if (id === 'st_manage') {
      state.page = 'manage';
      state.selectedLinkId = null;
      state.confirmDelete = false;
      return render(i, guildId, state, guild);
    }

    if (id === 'st_publish_settings') {
      state.page = 'publish_settings';
      return render(i, guildId, state, guild);
    }

    // ── Manage: pilih link ──
    if (id === 'st_link_select') {
      state.selectedLinkId = i.values[0];
      state.confirmDelete = false;
      return render(i, guildId, state, guild);
    }

    // ── Manage: tambah link ──
    if (id === 'st_add') {
      const curData = getGuildData(guildId);
      if (curData.links.length >= 25) {
        return i.reply({ content: '❌ Maksimal 25 link!', ephemeral: true });
      }
      await i.showModal(linkModal('st_modal_add', '➕ Tambah Link Baru'));
      const submit = await i.awaitModalSubmit({ time: 120_000 }).catch(() => null);
      if (!submit) return;

      const fields = parseModalFields(submit.fields);
      const curData2 = getGuildData(guildId);
      const newLink = {
        id: generateId(),
        order: curData2.links.length,
        ...fields,
      };
      curData2.links.push(newLink);
      saveGuildData(guildId, curData2);

      // Auto update
      if (curData2.autoUpdate) publishOrUpdate(interaction.client, guildId).catch(() => {});

      await submit.deferUpdate();
      state.page = 'main';
      return render(interaction, guildId, state, guild);
    }

    // ── Manage: edit link ──
    if (id === 'st_edit') {
      const curData = getGuildData(guildId);
      const link = curData.links.find(l => l.id === state.selectedLinkId);
      if (!link) return i.reply({ content: '❌ Link tidak ditemukan.', ephemeral: true });

      await i.showModal(linkModal('st_modal_edit', '✏️ Edit Link', link));
      const submit = await i.awaitModalSubmit({ time: 120_000 }).catch(() => null);
      if (!submit) return;

      const fields = parseModalFields(submit.fields);
      const curData2 = getGuildData(guildId);
      const idx = curData2.links.findIndex(l => l.id === state.selectedLinkId);
      if (idx >= 0) {
        curData2.links[idx] = { ...curData2.links[idx], ...fields };
        saveGuildData(guildId, curData2);
        if (curData2.autoUpdate) publishOrUpdate(interaction.client, guildId).catch(() => {});
      }

      await submit.deferUpdate();
      return render(interaction, guildId, state, guild);
    }

    // ── Manage: hapus (konfirmasi) ──
    if (id === 'st_delete') {
      state.confirmDelete = true;
      return render(i, guildId, state, guild);
    }

    if (id === 'st_delete_cancel') {
      state.confirmDelete = false;
      return render(i, guildId, state, guild);
    }

    if (id === 'st_delete_confirm') {
      const curData = getGuildData(guildId);
      curData.links = curData.links.filter(l => l.id !== state.selectedLinkId);
      // Re-index order
      curData.links.forEach((l, idx) => { l.order = idx; });
      saveGuildData(guildId, curData);
      if (curData.autoUpdate) publishOrUpdate(interaction.client, guildId).catch(() => {});

      state.selectedLinkId = null;
      state.confirmDelete = false;
      return render(i, guildId, state, guild);
    }

    // ── Manage: reorder ──
    if (id === 'st_move_up' || id === 'st_move_down') {
      const curData = getGuildData(guildId);
      const sorted = getSortedLinks(curData);
      const idx = sorted.findIndex(l => l.id === state.selectedLinkId);

      if (id === 'st_move_up' && idx > 0) {
        [sorted[idx].order, sorted[idx - 1].order] = [sorted[idx - 1].order, sorted[idx].order];
      } else if (id === 'st_move_down' && idx < sorted.length - 1) {
        [sorted[idx].order, sorted[idx + 1].order] = [sorted[idx + 1].order, sorted[idx].order];
      }

      saveGuildData(guildId, curData);
      if (curData.autoUpdate) publishOrUpdate(interaction.client, guildId).catch(() => {});
      return render(i, guildId, state, guild);
    }

    // ── Publish Settings: set channel ──
    if (id === 'st_set_channel') {
      const curData = getGuildData(guildId);
      curData.channelId = i.values[0];
      saveGuildData(guildId, curData);
      return render(i, guildId, state, guild);
    }

    // ── Publish Settings: toggle auto update ──
    if (id === 'st_toggle_autoupdate') {
      const curData = getGuildData(guildId);
      curData.autoUpdate = !curData.autoUpdate;
      saveGuildData(guildId, curData);
      return render(i, guildId, state, guild);
    }

    // ── Publish Settings: reset message ──
    if (id === 'st_clear_message') {
      const curData = getGuildData(guildId);
      curData.messageId = null;
      saveGuildData(guildId, curData);
      return render(i, guildId, state, guild);
    }

    // ── Publish Now ──
    if (id === 'st_publish_now') {
      await i.deferUpdate();
      const result = await publishOrUpdate(interaction.client, guildId, false);

      if (!result.success) {
        return interaction.followUp({ content: `❌ Gagal publish: ${result.error}`, ephemeral: true });
      }

      await interaction.followUp({
        content: result.isUpdate
          ? `✅ SikmaTree berhasil **diperbarui** di <#${getGuildData(guildId).channelId}>!`
          : `✅ SikmaTree berhasil **dipublish** ke <#${getGuildData(guildId).channelId}>!`,
        ephemeral: true
      });

      state.page = 'main';
      return render(interaction, guildId, state, guild);
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
