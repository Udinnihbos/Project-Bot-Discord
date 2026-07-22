import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelType,
} from 'discord.js';
import {
  getGuildConfig, updateGuildConfig, getPanels, getPanel,
  addPanel, updatePanel, deletePanel,
  getTicketType, addTicketType, updateTicketType,
  deleteTicketType, reorderTicketType, generateId,
} from '../utils/sikmaticketConfig.js';
import { publishOrUpdatePanel, closeTicket } from '../utils/sikmaticketManager.js';

// ════════════════════════════════════════
// PANEL BUILDERS
// ════════════════════════════════════════

function panelMain(guildId) {
  const panels = getPanels(guildId);
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎫 SikmaTicket — Settings')
    .setDescription('Sistem tiket support lengkap untuk server kamu.')
    .addFields(
      { name: '📋 Total Panel', value: `${panels.length} panel`, inline: true },
      { name: '🎫 Tiket Aktif', value: `${Object.keys(config.activeTickets || {}).length} tiket`, inline: true },
      { name: '🔢 Total Tiket', value: `#${config.ticketCounter || 0}`, inline: true },
      {
        name: '📋 Daftar Panel',
        value: panels.length > 0
          ? panels.map((p, i) => `\`${i + 1}.\` **${p.name}** — ${(p.ticketTypes || []).length} type | ${p.channelId ? `<#${p.channelId}>` : '❌ No channel'}`).join('\n')
          : '*Belum ada panel. Buat panel baru!*'
      }
    )
    .setFooter({ text: 'SikmaTicket • Pilih panel atau buat baru' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('skt_create_panel').setLabel('➕ Buat Panel Baru').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('skt_global_settings').setLabel('⚙️ Global Settings').setStyle(ButtonStyle.Secondary),
    )
  ];

  if (panels.length > 0) {
    const options = panels.map((p, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${p.name}`)
        .setDescription(`${(p.ticketTypes || []).length} ticket type${p.channelId ? '' : ' • ⚠️ No channel'}`)
        .setValue(p.id)
        .setEmoji('📋')
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('skt_select_panel')
        .setPlaceholder('📋 Pilih panel untuk dikelola...')
        .addOptions(options.slice(0, 25))
    ));
  }

  return { embed, rows };
}

function panelGlobalSettings(guildId) {
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Global Settings')
    .addFields(
      { name: '👥 Staff Roles', value: config.staffRoles.length > 0 ? config.staffRoles.map(r => `<@&${r}>`).join(', ') : 'Tidak ada', inline: false },
      { name: '📋 Transcript Channel', value: config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : '❌ Nonaktif', inline: true },
      { name: '🔢 Max Tiket per User', value: `${config.maxTicketsPerUser || 1}`, inline: true },
    )
    .setDescription('Pengaturan global yang berlaku untuk semua panel.');

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('skt_add_staff_role')
        .setPlaceholder('👥 Tambah Staff Role...')
        .setMinValues(1).setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('skt_set_transcript')
        .setPlaceholder('📋 Set transcript channel...')
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('skt_max_tickets')
        .setPlaceholder(`🔢 Max tiket per user: ${config.maxTicketsPerUser || 1}`)
        .addOptions([1, 2, 3, 5].map(n =>
          new StringSelectMenuOptionBuilder().setLabel(`${n} tiket`).setValue(String(n)).setDefault((config.maxTicketsPerUser || 1) === n)
        ))
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('skt_clear_staff').setLabel('🗑️ Clear Staff Roles').setStyle(ButtonStyle.Danger).setDisabled(config.staffRoles.length === 0),
      new ButtonBuilder().setCustomId('skt_clear_transcript').setLabel('🗑️ Clear Transcript').setStyle(ButtonStyle.Danger).setDisabled(!config.transcriptChannelId),
      new ButtonBuilder().setCustomId('skt_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelDetail(guildId, panelId) {
  const panel = getPanel(guildId, panelId);
  if (!panel) return panelMain(guildId);

  const types = panel.ticketTypes || [];

  const embed = new EmbedBuilder()
    .setColor(panel.embedColor || '#5865F2')
    .setTitle(`📋 ${panel.name}`)
    .setDescription(panel.description || '')
    .addFields(
      { name: '📢 Channel', value: panel.channelId ? `<#${panel.channelId}>` : '❌ Belum diset', inline: true },
      { name: '🔄 Auto Update', value: panel.autoUpdate ? '✅ Aktif' : '❌ Nonaktif', inline: true },
      { name: '🖼️ Display', value: panel.displayType === 'select' ? '📋 Select Menu' : '🔘 Button', inline: true },
      { name: '🎨 Warna', value: panel.embedColor || '#5865F2', inline: true },
      { name: '🖼️ Thumbnail', value: panel.thumbnail ? '✅ Ada' : '❌ Kosong', inline: true },
      { name: '🖼️ Image', value: panel.imageUrl ? '✅ Ada' : '❌ Kosong', inline: true },
      { name: '📝 Footer', value: panel.footer ? `"${panel.footer.substring(0, 40)}..."` : '❌ Kosong', inline: false },
      { name: `🎫 Ticket Types (${types.length})`, value: types.length > 0 ? types.map(t => `${t.emoji || '🎫'} **${t.name}**`).join(' · ') : '*Belum ada*', inline: false },
    )
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('skt_edit_panel').setLabel('✏️ Edit Panel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skt_manage_types').setLabel('🎫 Kelola Types').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skt_publish').setLabel('🚀 Publish').setStyle(ButtonStyle.Success).setDisabled(!panel.channelId || types.length === 0),
      new ButtonBuilder().setCustomId('skt_delete_panel').setLabel('🗑️ Hapus Panel').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('skt_set_panel_channel')
        .setPlaceholder('📢 Set channel publish...')
        .setChannelTypes(ChannelType.GuildText)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('skt_toggle_autoupdate')
        .setLabel(panel.autoUpdate ? '🔴 Nonaktifkan Auto Update' : '🟢 Aktifkan Auto Update')
        .setStyle(panel.autoUpdate ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('skt_toggle_display')
        .setLabel(panel.displayType === 'select' ? '🔘 Ganti ke Button' : '📋 Ganti ke Select Menu')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('skt_back').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

function panelTypes(guildId, panelId, selectedTypeId = null) {
  const panel = getPanel(guildId, panelId);
  const types = [...(panel?.ticketTypes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const selected = selectedTypeId ? types.find(t => t.id === selectedTypeId) : null;
  const selectedIdx = selected ? types.indexOf(selected) : -1;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🎫 Ticket Types — ${panel?.name}`);

  if (selected) {
    embed.setDescription(`**Type Dipilih:** ${selected.emoji || '🎫'} ${selected.name}`)
      .addFields(
        { name: '📝 Deskripsi', value: selected.description || '-', inline: true },
        { name: '🎨 Button Style', value: selected.buttonStyle || 'Primary', inline: true },
        { name: '📂 Category', value: selected.categoryId ? `<#${selected.categoryId}>` : '❌ Default', inline: true },
        { name: '👥 Mention Roles', value: selected.mentionRoles?.length > 0 ? selected.mentionRoles.map(r => `<@&${r}>`).join(', ') : '❌ Tidak ada', inline: false },
        { name: '💬 Mention Text', value: `\`${selected.mentionText || '-'}\``, inline: false },
        { name: '👋 Welcome Message', value: `\`${(selected.welcomeMessage || '-').substring(0, 80)}\``, inline: false },
        { name: '📊 Posisi', value: `#${selectedIdx + 1} dari ${types.length}`, inline: true },
      );
  } else {
    embed.setDescription(types.length > 0
      ? types.map((t, i) => `\`${i + 1}.\` ${t.emoji || '🎫'} **${t.name}** — ${t.description || '-'}`).join('\n')
      : '*Belum ada ticket type. Buat yang baru!*');
  }

  const rows = [];

  if (types.length > 0) {
    const options = types.map((t, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${t.name}`)
        .setDescription((t.description || '-').substring(0, 100))
        .setValue(t.id)
        .setEmoji(t.emoji || '🎫')
        .setDefault(t.id === selectedTypeId)
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('skt_select_type')
        .setPlaceholder('🎫 Pilih ticket type...')
        .addOptions(options.slice(0, 25))
    ));
  }

  if (selected) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('skt_edit_type_text').setLabel('✏️ Edit Teks').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('skt_delete_type').setLabel('🗑️ Hapus').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('skt_move_type_up').setLabel('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(selectedIdx === 0),
      new ButtonBuilder().setCustomId('skt_move_type_down').setLabel('⬇️').setStyle(ButtonStyle.Secondary).setDisabled(selectedIdx === types.length - 1),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('skt_set_type_category')
        .setPlaceholder('📂 Set category channel...')
        .setChannelTypes(ChannelType.GuildCategory)
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('skt_set_type_roles')
        .setPlaceholder('👥 Set mention roles...')
        .setMinValues(1).setMaxValues(10)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('skt_add_type').setLabel('➕ Tambah Type').setStyle(ButtonStyle.Success),
    ...(selected ? [
      new ButtonBuilder().setCustomId('skt_clear_type_roles').setLabel('🗑️ Clear Roles').setStyle(ButtonStyle.Danger).setDisabled((selected.mentionRoles?.length || 0) === 0),
      new ButtonBuilder().setCustomId('skt_set_type_style').setLabel('🎨 Button Style').setStyle(ButtonStyle.Secondary),
    ] : []),
    new ButtonBuilder().setCustomId('skt_back_to_panel').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
  ));

  return { embed, rows };
}

// ── Render ──
async function render(target, guildId, state) {
  const { page, panelId, typeId } = state;
  let panel;
  switch (page) {
    case 'global':   panel = panelGlobalSettings(guildId); break;
    case 'panel':    panel = panelDetail(guildId, panelId); break;
    case 'types':    panel = panelTypes(guildId, panelId, typeId); break;
    default:         panel = panelMain(guildId); break;
  }
  const payload = { embeds: [panel.embed], components: panel.rows };
  if (typeof target.update === 'function') await target.update(payload);
  else await target.editReply(payload);
}

// ── Modal helpers ──
function panelModal(prefill = {}) {
  return new ModalBuilder().setCustomId('skt_modal_panel').setTitle('✏️ Edit Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nama Panel').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(prefill.name || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Deskripsi').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setValue(prefill.description || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('embedColor').setLabel('Warna Embed (hex, contoh: #5865F2)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(prefill.embedColor || '#5865F2')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail URL (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(prefill.thumbnail || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel('Footer (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setValue(prefill.footer || '')),
    );
}

function panelModalExtra(prefill = {}) {
  return new ModalBuilder().setCustomId('skt_modal_panel_extra').setTitle('🖼️ Media & Image')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL (opsional, gambar besar)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setValue(prefill.imageUrl || '')),
    );
}

function typeTextModal(prefill = {}) {
  return new ModalBuilder().setCustomId('skt_modal_type').setTitle('✏️ Edit Ticket Type')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nama Type').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(prefill.name || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(prefill.emoji || '🎫')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Deskripsi singkat').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(prefill.description || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('welcomeMessage').setLabel('Welcome message ({user}, {number})').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setValue(prefill.welcomeMessage || 'Halo {user}! Tim kami akan segera membantu.')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mentionText').setLabel('Mention text ({roles}, {user}, {number})').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(prefill.mentionText || 'Halo {roles}! Ada tiket baru dari {user}.')),
    );
}

// ════════════════════════════════════════
// COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('sikmaticket')
  .setDescription('🎫 SikmaTicket — Sistem tiket support')
  .addSubcommand(sub => sub.setName('settings').setDescription('Buka panel pengaturan SikmaTicket'))
  .addSubcommand(sub =>
    sub.setName('close')
      .setDescription('Tutup tiket ini')
      .addStringOption(opt => opt.setName('reason').setDescription('Alasan menutup tiket (opsional)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Tambahkan user ke tiket ini')
      .addUserOption(opt => opt.setName('user').setDescription('User yang akan ditambahkan').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Hapus user dari tiket ini')
      .addUserOption(opt => opt.setName('user').setDescription('User yang akan dihapus').setRequired(true))
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  // ── Close ──
  if (sub === 'close') {
    const reason = interaction.options.getString('reason') || null;
    return closeTicket(interaction, guildId, interaction.channelId, reason);
  }

  // ── Add user ──
  if (sub === 'add') {
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setDescription(`✅ <@${user.id}> ditambahkan ke tiket ini.`)],
      flags: 64
    });
  }

  // ── Remove user ──
  if (sub === 'remove') {
    const user = interaction.options.getUser('user');
    const ticketData = getGuildConfig(guildId).activeTickets?.[interaction.channelId];
    if (ticketData?.userId === user.id) {
      return interaction.reply({ content: '❌ Tidak bisa menghapus pemilik tiket.', flags: 64 });
    }
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription(`✅ <@${user.id}> dihapus dari tiket ini.`)],
      flags: 64
    });
  }

  // ── Settings ──
  if (sub !== 'settings') return;
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: '❌ Kamu butuh permission **Manage Server**!', flags: 64 });
  }

  const state = { page: 'main', panelId: null, typeId: null };
  const { embed, rows } = panelMain(guildId);

  await interaction.reply({
    embeds: [embed], components: rows, flags: 64
  });
  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 600_000,
  });

  collector.on('collect', async i => {
    const id = i.customId;

    // ── Navigasi ──
    if (id === 'skt_back') { state.page = 'main'; state.panelId = null; state.typeId = null; return render(i, guildId, state); }
    if (id === 'skt_back_to_panel') { state.page = 'panel'; state.typeId = null; return render(i, guildId, state); }
    if (id === 'skt_global_settings') { state.page = 'global'; return render(i, guildId, state); }
    if (id === 'skt_manage_types') { state.page = 'types'; state.typeId = null; return render(i, guildId, state); }

    if (id === 'skt_select_panel') {
      state.panelId = i.values[0];
      state.page = 'panel';
      return render(i, guildId, state);
    }

    if (id === 'skt_select_type') {
      state.typeId = i.values[0];
      return render(i, guildId, state);
    }

    // ── Global Settings ──
    if (id === 'skt_add_staff_role') {
      const config = getGuildConfig(guildId);
      const newRoles = [...new Set([...config.staffRoles, ...i.values])];
      updateGuildConfig(guildId, { staffRoles: newRoles });
      return render(i, guildId, state);
    }
    if (id === 'skt_clear_staff') { updateGuildConfig(guildId, { staffRoles: [] }); return render(i, guildId, state); }
    if (id === 'skt_set_transcript') { updateGuildConfig(guildId, { transcriptChannelId: i.values[0] }); return render(i, guildId, state); }
    if (id === 'skt_clear_transcript') { updateGuildConfig(guildId, { transcriptChannelId: null }); return render(i, guildId, state); }
    if (id === 'skt_max_tickets') { updateGuildConfig(guildId, { maxTicketsPerUser: parseInt(i.values[0]) }); return render(i, guildId, state); }

    // ── Create / Edit Panel ──
    if (id === 'skt_create_panel') {
      await i.showModal(panelModal());
      const submit = await i.awaitModalSubmit({ time: 120_000, filter: s => s.user.id === interaction.user.id }).catch(() => null);
      if (!submit) return;
      await submit.deferUpdate();
      const panel = addPanel(guildId, {
        name: submit.fields.getTextInputValue('name'),
        description: submit.fields.getTextInputValue('description'),
        embedColor: submit.fields.getTextInputValue('embedColor') || '#5865F2',
        thumbnail: submit.fields.getTextInputValue('thumbnail'),
        footer: submit.fields.getTextInputValue('footer'),
      });
      state.panelId = panel.id;
      state.page = 'panel';
      return render(interaction, guildId, state);
    }

    if (id === 'skt_edit_panel') {
      const panel = getPanel(guildId, state.panelId);
      await i.showModal(panelModal(panel));
      const submit = await i.awaitModalSubmit({ time: 120_000, filter: s => s.user.id === interaction.user.id }).catch(() => null);
      if (!submit) return;
      await submit.deferUpdate();
      updatePanel(guildId, state.panelId, {
        name: submit.fields.getTextInputValue('name'),
        description: submit.fields.getTextInputValue('description'),
        embedColor: submit.fields.getTextInputValue('embedColor') || '#5865F2',
        thumbnail: submit.fields.getTextInputValue('thumbnail'),
        footer: submit.fields.getTextInputValue('footer'),
      });
      return render(interaction, guildId, state);
    }

    if (id === 'skt_set_panel_channel') { updatePanel(guildId, state.panelId, { channelId: i.values[0] }); return render(i, guildId, state); }
    if (id === 'skt_toggle_autoupdate') {
      const p = getPanel(guildId, state.panelId);
      updatePanel(guildId, state.panelId, { autoUpdate: !p.autoUpdate });
      return render(i, guildId, state);
    }
    if (id === 'skt_toggle_display') {
      const p = getPanel(guildId, state.panelId);
      updatePanel(guildId, state.panelId, { displayType: p.displayType === 'button' ? 'select' : 'button' });
      return render(i, guildId, state);
    }

    if (id === 'skt_delete_panel') {
      deletePanel(guildId, state.panelId);
      state.page = 'main'; state.panelId = null;
      return render(i, guildId, state);
    }

    if (id === 'skt_publish') {
      await i.deferUpdate();
      const result = await publishOrUpdatePanel(interaction.client, guildId, state.panelId);
      await interaction.followUp({
        content: result.success
          ? `✅ Panel ${result.isUpdate ? 'diperbarui' : 'dipublish'}!`
          : `❌ Gagal: ${result.error}`,
        flags: 64
      });
      return render(interaction, guildId, state);
    }

    // ── Add / Edit Ticket Type ──
    if (id === 'skt_add_type') {
      const panel = getPanel(guildId, state.panelId);
      if ((panel?.ticketTypes || []).length >= 25) return i.reply({ content: '❌ Maksimal 25 ticket type!', flags: 64 });
      await i.showModal(typeTextModal());
      const submit = await i.awaitModalSubmit({ time: 120_000 }).catch(() => null);
      if (!submit) return;
      const newType = addTicketType(guildId, state.panelId, {
        name: submit.fields.getTextInputValue('name'),
        emoji: submit.fields.getTextInputValue('emoji') || '🎫',
        description: submit.fields.getTextInputValue('description'),
        welcomeMessage: submit.fields.getTextInputValue('welcomeMessage'),
        mentionText: submit.fields.getTextInputValue('mentionText'),
      });
      state.typeId = newType.id;
      await submit.deferUpdate();

      // Auto update panel
      const p = getPanel(guildId, state.panelId);
      if (p?.autoUpdate) publishOrUpdatePanel(interaction.client, guildId, state.panelId).catch(() => {});
      return render(interaction, guildId, state);
    }

    if (id === 'skt_edit_type_text') {
      const type = getTicketType(guildId, state.panelId, state.typeId);
      await i.showModal(typeTextModal(type));
      const submit = await i.awaitModalSubmit({ time: 120_000, filter: s => s.user.id === interaction.user.id }).catch(() => null);
      if (!submit) return;
      await submit.deferUpdate();
      updateTicketType(guildId, state.panelId, state.typeId, {
        name: submit.fields.getTextInputValue('name'),
        emoji: submit.fields.getTextInputValue('emoji') || '🎫',
        description: submit.fields.getTextInputValue('description'),
        welcomeMessage: submit.fields.getTextInputValue('welcomeMessage'),
        mentionText: submit.fields.getTextInputValue('mentionText'),
      });
      const p = getPanel(guildId, state.panelId);
      if (p?.autoUpdate) publishOrUpdatePanel(interaction.client, guildId, state.panelId).catch(() => {});
      return render(interaction, guildId, state);
    }

    if (id === 'skt_set_type_category') {
      updateTicketType(guildId, state.panelId, state.typeId, { categoryId: i.values[0] });
      return render(i, guildId, state);
    }

    if (id === 'skt_set_type_roles') {
      const cur = getTicketType(guildId, state.panelId, state.typeId);
      const newRoles = [...new Set([...(cur.mentionRoles || []), ...i.values])];
      updateTicketType(guildId, state.panelId, state.typeId, { mentionRoles: newRoles });
      return render(i, guildId, state);
    }

    if (id === 'skt_clear_type_roles') {
      updateTicketType(guildId, state.panelId, state.typeId, { mentionRoles: [] });
      return render(i, guildId, state);
    }

    if (id === 'skt_set_type_style') {
      const cur = getTicketType(guildId, state.panelId, state.typeId);
      const styles = ['Primary', 'Secondary', 'Success', 'Danger'];
      const next = styles[(styles.indexOf(cur.buttonStyle || 'Primary') + 1) % styles.length];
      updateTicketType(guildId, state.panelId, state.typeId, { buttonStyle: next });
      const p = getPanel(guildId, state.panelId);
      if (p?.autoUpdate) publishOrUpdatePanel(interaction.client, guildId, state.panelId).catch(() => {});
      return render(i, guildId, state);
    }

    if (id === 'skt_delete_type') {
      deleteTicketType(guildId, state.panelId, state.typeId);
      state.typeId = null;
      const p = getPanel(guildId, state.panelId);
      if (p?.autoUpdate) publishOrUpdatePanel(interaction.client, guildId, state.panelId).catch(() => {});
      return render(i, guildId, state);
    }

    if (id === 'skt_move_type_up') { reorderTicketType(guildId, state.panelId, state.typeId, 'up'); return render(i, guildId, state); }
    if (id === 'skt_move_type_down') { reorderTicketType(guildId, state.panelId, state.typeId, 'down'); return render(i, guildId, state); }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
