/**
 * /reactionrole V2 — Reaction role admin panel.
 *
 * Subcommands:
 *   panel    — open admin panel (create / edit / list / publish)
 *   add      — add role to panel (or use modal from panel)
 *   remove   — remove role from panel
 *   publish  — re-publish panel message
 *   delete   — delete panel
 *
 * Pattern: Modal wizard + ephemeral preview + collector (like sikmasearch).
 *   - /reactionrole panel   → main panel list (select to edit)
 *   - Click panel → detail view (edit info, add role, publish, delete)
 */

import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder, ChannelType, ModalBuilder,
  TextInputBuilder, TextInputStyle, PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import {
  getGuildConfig, getPanel, upsertPanel, deletePanel,
  addRoleToPanel, removeRoleFromPanel, TEMPLATES,
} from '../utils/reactionroleConfig.js';
import { generateId } from '../utils/sikmaticketConfig.js';

const DEFAULT_PANEL = {
  title: 'Pilih Role Kamu',
  description: 'Klik tombol atau dropdown di bawah untuk memilih role.',
  color: '#3498db',
  type: 'button',
  template: 'custom',
  mode: 'toggle',
  maxRolesPerUser: null,
  roles: [],
  messageId: null,
  channelId: null,
};

// ══════════════
// COMMAND DEFINITION
// ══════════════

export const data = new SlashCommandBuilder()
  .setName('reactionrole')
  .setDescription('🎭 Reaction role panel admin (modal wizard + live preview)')
  .addSubcommand(sub => sub
    .setName('panel')
    .setDescription('📋 Buka admin panel utama (list/edit/create panels)')
  )
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('➕ Tambah role ke panel')
    .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel').setRequired(true).setAutocomplete(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role yang ditambah').setRequired(true))
    .addStringOption(opt => opt.setName('label').setDescription('Label (default: nama role)').setRequired(false).setMaxLength(80))
    .addStringOption(opt => opt.setName('emoji').setDescription('Emoji (1-4 char)').setRequired(false).setMaxLength(4))
    .addStringOption(opt => opt.setName('description').setDescription('Deskripsi (khusus dropdown)').setRequired(false).setMaxLength(100))
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('🗑️ Hapus role dari panel')
    .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel').setRequired(true).setAutocomplete(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role yang dihapus').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('🗑️ Hapus panel sepenuhnya')
    .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub => sub
    .setName('publish')
    .setDescription('🚀 Publish / re-publish panel ke channel')
    .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel').setRequired(true).setAutocomplete(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel tujuan').setRequired(true))
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// ══════════════
// MAIN EXECUTE
// ══════════════

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'panel') {
    return showPanelList(interaction);
  }
  if (sub === 'add') {
    return handleAddRole(interaction);
  }
  if (sub === 'remove') {
    return handleRemoveRole(interaction);
  }
  if (sub === 'delete') {
    return handleDelete(interaction);
  }
  if (sub === 'publish') {
    return handlePublish(interaction);
  }
}

// ══════════════
// AUTOCOMPLETE
// ══════════════

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const config = getGuildConfig(interaction.guildId);
  const choices = Object.values(config.panels)
    .filter(p => p.id.includes(focused) || p.title.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(p => ({ name: `${p.id} (${p.roles?.length || 0} role) — ${p.title.slice(0, 50)}`, value: p.id }));
  await interaction.respond(choices);
}

// ══════════════
// PANEL LIST (main admin view)
// ══════════════

async function showPanelList(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const panels = Object.values(config.panels);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎭 Reaction Role Admin Panel')
    .setDescription(
      panels.length
        ? panels.slice(0, 15).map((p, i) => {
          const status = p.messageId ? '✅ Published' : '⏳ Draft';
          const typeIcon = p.type === 'button' ? '🔘' : '📋';
          const modeLabel = p.mode === 'one-of' ? `1-of (max ${p.maxRolesPerUser || 1})` : p.mode === 'add-only' ? 'add-only' : 'toggle';
          return `\`${i + 1}.\` **${typeIcon} ${p.id}** — ${p.title.slice(0, 50)}\n   └ ${p.roles?.length || 0} role • ${modeLabel} • ${status}`;
        }).join('\n\n').slice(0, 4000)
        : '*Belum ada panel. Klik ➕ Buat Panel di bawah untuk mulai!*'
    )
    .setFooter({ text: '🎭 Reaction Role • Pilih panel untuk edit, atau buat baru' })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('rr_panel_select')
    .setPlaceholder('📋 Pilih panel untuk manage…');
  for (const p of panels.slice(0, 25)) {
    select.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(p.id.slice(0, 100))
      .setDescription(`${p.roles?.length || 0} role • ${p.title.slice(0, 80)}`)
      .setValue(p.id)
      .setEmoji(p.type === 'button' ? '🔘' : '📋'));
  }

  const rows = [
    ...(panels.length > 0 ? [new ActionRowBuilder().addComponents(select)] : []),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_create').setLabel('➕ Buat Panel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rr_create_template').setLabel('📋 Buat dari Template').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_close').setLabel('✖ Tutup').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

// ══════════════
// PANEL DETAIL VIEW
// ══════════════

async function showPanelDetail(interaction, panelId) {
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak ditemukan.' }], components: [] });
  }

  const config = getGuildConfig(interaction.guildId);
  const status = panel.messageId ? `✅ Published di <#${panel.channelId}>` : '⏳ Draft (belum publish)';
  const modeLabel = panel.mode === 'one-of' ? `1-of (max ${panel.maxRolesPerUser || 1})` : panel.mode === 'add-only' ? 'add-only (verify)' : 'toggle (add/remove)';
  const typeLabel = panel.type === 'button' ? '🔘 Button' : '📋 Dropdown';

  const embed = new EmbedBuilder()
    .setColor(panel.color || 0x3498db)
    .setTitle(`🎭 ${panel.title}`)
    .setDescription(panel.description || '*kosong*')
    .addFields(
      { name: '🆔 ID', value: `\`${panel.id}\``, inline: true },
      { name: '📊 Tipe', value: typeLabel, inline: true },
      { name: '⚙️ Mode', value: modeLabel, inline: true },
      { name: '📋 Status', value: status, inline: false },
      {
        name: `🎨 Role (${panel.roles?.length || 0}${panel.type === 'button' ? '/25' : '/25'})`,
        value: (panel.roles?.length
          ? panel.roles.map((r, i) => `\`${i + 1}.\` ${r.emoji || '•'} **${r.label}** — <@&${r.roleId}>`).join('\n').slice(0, 1024)
          : '*Belum ada role.*'),
        inline: false,
      },
    )
    .setFooter({ text: `Updated: <t:${Math.floor(panel.updatedAt / 1000)}:R>` })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rr_edit_info:${panel.id}`).setLabel('✏️ Edit Info').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rr_edit_type:${panel.id}`).setLabel('⚙️ Edit Tipe/Mode').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rr_addrole:${panel.id}`).setLabel('➕ Tambah Role').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rr_removerole:${panel.id}`).setLabel('🗑️ Hapus Role').setStyle(ButtonStyle.Danger).setDisabled(!panel.roles?.length),
      new ButtonBuilder().setCustomId(`rr_preview:${panel.id}`).setLabel('👁️ Preview').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rr_publish:${panel.id}`).setLabel('🚀 Publish').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rr_delete_confirm:${panel.id}`).setLabel('🗑️ Hapus Panel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rr_back_to_list').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.update({ embeds: [embed], components: rows });
}

// ══════════════
// CREATE PANEL — Modal wizard
// ══════════════

function showCreateModal() {
  return new ModalBuilder()
    .setCustomId('rr_modal_create')
    .setTitle('➕ Buat Reaction Role Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('id').setLabel('ID Panel (lowercase, tanpa spasi, contoh: color)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Judul Embed').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Deskripsi (1-2 kalimat)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('color').setLabel('Warna hex (contoh: #3498db)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue('#3498db')
      ),
    );
}

function showCreateFromTemplateModal() {
  return new ModalBuilder()
    .setCustomId('rr_modal_create_template')
    .setTitle('📋 Buat Panel dari Template')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('id').setLabel('ID Panel').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('template').setLabel('Template: color / region / game / notification / pronoun / custom').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setValue('color')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Judul (opsional, override template)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)
      ),
    );
}

function showEditInfoModal(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`rr_modal_edit_info:${panelId}`)
    .setTitle('✏️ Edit Info Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Judul').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(panel.title)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Deskripsi').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300).setValue(panel.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('color').setLabel('Warna hex').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(panel.color || '#3498db')
      ),
    );
}

function showEditTypeModal(panelId, panel) {
  return new ModalBuilder()
    .setCustomId(`rr_modal_edit_type:${panelId}`)
    .setTitle('⚙️ Edit Tipe & Mode')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('type').setLabel('Tipe: button / dropdown').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(panel.type)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('mode').setLabel('Mode: toggle / add-only / one-of').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(15).setValue(panel.mode)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('max').setLabel('Max roles per user (untuk one-of, default 1)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setValue(String(panel.maxRolesPerUser || 1))
      ),
    );
}

// ══════════════
// ADD ROLE (panel action) — with role select + modal
// ══════════════

async function showAddRolePanelView(interaction, panelId) {
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });

  // If panel has 25 roles already, block
  if ((panel.roles?.length || 0) >= 25) {
    return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Maksimal 25 role per panel.' }], components: [] });
  }

  return interaction.update({
    embeds: [{
      color: 0x3498db,
      title: '➕ Tambah Role ke Panel',
      description: `Panel: **${panel.title}** (\`${panel.id}\`)\n\nPilih role di dropdown bawah. Setelah pilih, modal akan muncul untuk label/emoji/deskripsi.`,
    }],
    components: [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`rr_addrole_pick:${panelId}`)
          .setPlaceholder('🎭 Pilih role…')
          .setMinValues(1)
          .setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_back_detail:${panelId}`).setLabel('◀ Kembali ke Panel').setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

function showAddRoleModal(panelId, roleId) {
  return new ModalBuilder()
    .setCustomId(`rr_modal_addrole:${panelId}:${roleId}`)
    .setTitle('➕ Detail Role')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('label').setLabel('Label (default: nama role)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (1-4 char)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Deskripsi (dropdown only)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
      ),
    );
}

// ══════════════
// REMOVE ROLE (panel action)
// ══════════════

async function showRemoveRolePanelView(interaction, panelId) {
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
  if (!panel.roles?.length) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak punya role.' }], components: [] });

  const sel = new StringSelectMenuBuilder()
    .setCustomId(`rr_removerole_pick:${panelId}`)
    .setPlaceholder('🗑️ Pilih role yang mau dihapus…');
  for (const r of panel.roles.slice(0, 25)) {
    sel.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(r.label.slice(0, 100))
      .setDescription(`<@&${r.roleId}>`)
      .setValue(r.roleId)
      .setEmoji('🗑️'));
  }

  return interaction.update({
    embeds: [{
      color: 0xe74c3c,
      title: '🗑️ Hapus Role dari Panel',
      description: `Panel: **${panel.title}**\n\nPilih role yang ingin dihapus:`,
    }],
    components: [
      new ActionRowBuilder().addComponents(sel),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rr_back_detail:${panelId}`).setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

// ══════════════
// PREVIEW + PUBLISH
// ══════════════

function buildPanelEmbed(panel, guild) {
  const embed = new EmbedBuilder()
    .setColor(panel.color || 0x3498db)
    .setTitle(panel.title)
    .setDescription((panel.description || '') + (panel.roles?.length
      ? '\n\n' + panel.roles.map(r => `${r.emoji || '•'} **${r.label}** — <@&${r.roleId}>`).join('\n')
      : '\n\n*Panel ini belum punya role.*'));

  if (panel.image) embed.setImage(panel.image);
  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
  embed.setFooter({ text: `${panel.id} • ${panel.mode === 'one-of' ? `Pilih max ${panel.maxRolesPerUser || 1}` : 'Bisa lebih dari 1'}` });
  embed.setTimestamp();
  return embed;
}

function buildPanelComponents(panel) {
  if (!panel.roles?.length) return [];

  if (panel.type === 'dropdown') {
    const options = panel.roles.map(r => {
      const opt = new StringSelectMenuOptionBuilder()
        .setLabel(r.label.slice(0, 100))
        .setValue(r.roleId);
      if (r.emoji) { try { opt.setEmoji(r.emoji); } catch {} }
      if (r.description) opt.setDescription(r.description.slice(0, 100));
      return opt;
    });
    return [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rr_dropdown_${panel.id}`)
        .setPlaceholder(`Pilih ${panel.maxRolesPerUser === 1 ? 'role' : 'role(s)'}…`)
        .setMinValues(panel.mode === 'one-of' ? 0 : 0)
        .setMaxValues(panel.mode === 'one-of' ? (panel.maxRolesPerUser || 1) : panel.roles.length)
        .addOptions(options),
    )];
  }

  // button
  const rows = [];
  for (let i = 0; i < Math.min(panel.roles.length, 25); i += 5) {
    const chunk = panel.roles.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(r => {
        const btn = new ButtonBuilder()
          .setCustomId(`rr_btn_${panel.id}_${r.roleId}`)
          .setLabel(r.label.slice(0, 80))
          .setStyle(panel.mode === 'one-of' ? ButtonStyle.Primary : ButtonStyle.Secondary);
        if (r.emoji) { try { btn.setEmoji(r.emoji); } catch {} }
        return btn;
      }),
    ));
  }
  return rows;
}

async function publishPanel(interaction, panel, channel) {
  const embed = buildPanelEmbed(panel, interaction.guild);
  const components = buildPanelComponents(panel);
  if (!components.length) {
    return interaction.followUp({ embeds: [{ color: 0xe74c3c, title: '❌ Panel belum punya role. Tambah dulu.' }], flags: MessageFlags.Ephemeral });
  }
  const msg = await channel.send({ embeds: [embed], components });
  upsertPanel(interaction.guildId, { ...panel, messageId: msg.id, channelId: channel.id });
  return msg;
}

// ══════════════
// SLASH COMMAND HANDLERS (add, remove, delete, publish)
// ══════════════

async function handleAddRole(interaction) {
  const panelId = interaction.options.getString('panel_id');
  const role = interaction.options.getRole('role');
  const label = interaction.options.getString('label');
  const emoji = interaction.options.getString('emoji');
  const description = interaction.options.getString('description');

  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
  if ((panel.roles?.length || 0) >= 25) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Maksimal 25 role per panel.' }], flags: MessageFlags.Ephemeral });
  if (panel.roles?.find(r => r.roleId === role.id)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Role sudah ada di panel ini.' }], flags: MessageFlags.Ephemeral });

  addRoleToPanel(interaction.guildId, panelId, {
    roleId: role.id,
    label: label || role.name,
    emoji: emoji || null,
    description: description || null,
  });

  return interaction.reply({
    embeds: [{
      color: 0x2ecc71,
      title: '✅ Role Ditambahkan!',
      description: `${emoji || '•'} **${label || role.name}** (<@&${role.id}>) ditambahkan ke panel \`${panelId}\`.\n\n` +
        `Total: ${(getPanel(interaction.guildId, panelId).roles?.length || 0)} role`,
    }],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRemoveRole(interaction) {
  const panelId = interaction.options.getString('panel_id');
  const role = interaction.options.getRole('role');
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
  const updated = removeRoleFromPanel(interaction.guildId, panelId, role.id);
  if (!updated) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Role tidak ada di panel.' }], flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `✅ **${role.name}** dihapus dari panel \`${panelId}\`.` }], flags: MessageFlags.Ephemeral });
}

async function handleDelete(interaction) {
  const panelId = interaction.options.getString('panel_id');
  const ok = deletePanel(interaction.guildId, panelId);
  if (!ok) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [{ color: 0x2ecc71, title: `🗑️ Panel \`${panelId}\` dihapus.` }], flags: MessageFlags.Ephemeral });
}

async function handlePublish(interaction) {
  const panelId = interaction.options.getString('panel_id');
  const channel = interaction.options.getChannel('channel');
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel tidak ditemukan.' }], flags: MessageFlags.Ephemeral });
  if (!panel.roles?.length) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel belum punya role.' }], flags: MessageFlags.Ephemeral });

  try {
    const msg = await publishPanel(interaction, panel, channel);
    return interaction.reply({
      embeds: [{ color: 0x2ecc71, title: `🚀 Panel di-publish ke ${channel}!`, description: `Message ID: \`${msg.id}\`` }],
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    return interaction.reply({
      embeds: [{ color: 0xe74c3c, title: '❌ Gagal publish', description: e.message?.slice(0, 200) }],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ══════════════
// COMPONENT HANDLER (collector-driven)
// ══════════════

export async function handleReactionRoleComponent(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('rr_')) return false;
  if (interaction.customId.startsWith('rr_dropdown_') || interaction.customId.startsWith('rr_btn_')) {
    // Actual role toggling — let utils/reactionroleHandler.js handle it
    return false;
  }

  const cid = interaction.customId;

  if (cid === 'rr_close') {
    return interaction.update({ embeds: [{ color: 0x95a5a6, title: '✖ Ditutup' }], components: [] });
  }

  if (cid === 'rr_create') {
    return interaction.showModal(showCreateModal());
  }

  if (cid === 'rr_create_template') {
    return interaction.update({
      embeds: [{
        color: 0x3498db,
        title: '📋 Pilih Template',
        description: Object.entries(TEMPLATES).map(([id, t]) => `**${id}** — ${t.name}\n> ${t.description}\n> Tipe: ${t.type}, Mode: ${t.mode}, Max: ${t.maxRolesPerUser || '∞'}`).join('\n\n'),
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rr_template_pick')
            .setPlaceholder('📋 Pilih template…')
            .addOptions(Object.entries(TEMPLATES).map(([id, t]) => new StringSelectMenuOptionBuilder()
              .setLabel(t.name)
              .setDescription(t.description.slice(0, 100))
              .setValue(id))),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rr_back_to_list').setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  if (cid === 'rr_back_to_list') {
    return showPanelListAsUpdate(interaction);
  }

  if (cid === 'rr_panel_select') {
    const panelId = interaction.values[0];
    return showPanelDetail(interaction, panelId);
  }

  if (cid === 'rr_template_pick') {
    // Pre-fill modal with template defaults
    return interaction.showModal(showCreateFromTemplateModal());
  }

  if (cid.startsWith('rr_edit_info:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
    return interaction.showModal(showEditInfoModal(panelId, panel));
  }

  if (cid.startsWith('rr_edit_type:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
    return interaction.showModal(showEditTypeModal(panelId, panel));
  }

  if (cid.startsWith('rr_addrole:')) {
    const panelId = cid.split(':')[1];
    return showAddRolePanelView(interaction, panelId);
  }

  if (cid.startsWith('rr_addrole_pick:')) {
    const parts = cid.split(':');
    const panelId = parts[1];
    const roleId = interaction.values[0];
    return interaction.showModal(showAddRoleModal(panelId, roleId));
  }

  if (cid.startsWith('rr_removerole:')) {
    const panelId = cid.split(':')[1];
    return showRemoveRolePanelView(interaction, panelId);
  }

  if (cid.startsWith('rr_removerole_pick:')) {
    const panelId = cid.split(':')[1];
    const roleId = interaction.values[0];
    const updated = removeRoleFromPanel(interaction.guildId, panelId, roleId);
    if (!updated) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Gagal hapus' }], components: [] });
    return showPanelDetail(interaction, panelId);
  }

  if (cid.startsWith('rr_back_detail:')) {
    const panelId = cid.split(':')[1];
    return showPanelDetail(interaction, panelId);
  }

  if (cid.startsWith('rr_preview:')) {
    const panelId = cid.split(':')[1];
    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
    const embed = buildPanelEmbed(panel, interaction.guild);
    const components = buildPanelComponents(panel);
    return interaction.update({
      embeds: [
        { color: 0x3498db, title: '👁️ Preview Panel', description: 'Preview di bawah (preview only, tidak di-send):' },
        embed,
      ],
      components: [
        ...components,
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rr_back_detail:${panelId}`).setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  if (cid.startsWith('rr_publish:')) {
    const panelId = cid.split(':')[1];
    return interaction.update({
      embeds: [{ color: 0x3498db, title: '🚀 Pilih Channel Tujuan' }],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`rr_publish_pick:${panelId}`)
            .setPlaceholder('📡 Pilih channel…')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1).setMaxValues(1),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rr_back_detail:${panelId}`).setLabel('◀ Kembali').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  if (cid.startsWith('rr_publish_pick:')) {
    const panelId = cid.split(':')[1];
    const channelId = interaction.values[0];
    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], components: [] });
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Channel invalid' }], components: [] });
    try {
      const msg = await publishPanel(interaction, panel, channel);
      return interaction.update({
        embeds: [{ color: 0x2ecc71, title: `✅ Panel published ke ${channel}!`, description: `Message ID: \`${msg.id}\`` }],
        components: [],
      });
    } catch (e) {
      return interaction.update({ embeds: [{ color: 0xe74c3c, title: '❌ Gagal', description: e.message?.slice(0, 200) }], components: [] });
    }
  }

  if (cid.startsWith('rr_delete_confirm:')) {
    const panelId = cid.split(':')[1];
    return interaction.update({
      embeds: [{
        color: 0xe74c3c,
        title: '⚠️ Konfirmasi Hapus',
        description: `Yakin hapus panel **${panelId}**? Channel message akan tetap ada tapi tidak ter-update.`,
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rr_delete_yes:${panelId}`).setLabel('🗑️ Ya, Hapus').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`rr_back_detail:${panelId}`).setLabel('◀ Batal').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }

  if (cid.startsWith('rr_delete_yes:')) {
    const panelId = cid.split(':')[1];
    deletePanel(interaction.guildId, panelId);
    return interaction.update({ embeds: [{ color: 0x2ecc71, title: `🗑️ Panel ${panelId} dihapus.` }], components: [] });
  }

  return false;
}

// Helper for "back to list" (after `showPanelList` which uses reply)
async function showPanelListAsUpdate(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const panels = Object.values(config.panels);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎭 Reaction Role Admin Panel')
    .setDescription(
      panels.length
        ? panels.slice(0, 15).map((p, i) => {
          const status = p.messageId ? '✅ Published' : '⏳ Draft';
          const typeIcon = p.type === 'button' ? '🔘' : '📋';
          const modeLabel = p.mode === 'one-of' ? `1-of (max ${p.maxRolesPerUser || 1})` : p.mode === 'add-only' ? 'add-only' : 'toggle';
          return `\`${i + 1}.\` **${typeIcon} ${p.id}** — ${p.title.slice(0, 50)}\n   └ ${p.roles?.length || 0} role • ${modeLabel} • ${status}`;
        }).join('\n\n').slice(0, 4000)
        : '*Belum ada panel. Klik ➕ Buat Panel di bawah untuk mulai!*'
    )
    .setFooter({ text: '🎭 Reaction Role • Pilih panel untuk edit, atau buat baru' })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('rr_panel_select')
    .setPlaceholder('📋 Pilih panel untuk manage…');
  for (const p of panels.slice(0, 25)) {
    select.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(p.id.slice(0, 100))
      .setDescription(`${p.roles?.length || 0} role • ${p.title.slice(0, 80)}`)
      .setValue(p.id)
      .setEmoji(p.type === 'button' ? '🔘' : '📋'));
  }

  const rows = [
    ...(panels.length > 0 ? [new ActionRowBuilder().addComponents(select)] : []),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_create').setLabel('➕ Buat Panel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rr_create_template').setLabel('📋 Buat dari Template').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rr_close').setLabel('✖ Tutup').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.update({ embeds: [embed], components: rows });
}

// ══════════════
// MODAL HANDLERS
// ══════════════

export async function handleReactionRoleModal(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId?.startsWith('rr_modal_')) return false;

  const cid = interaction.customId;
  const guildId = interaction.guildId;

  if (cid === 'rr_modal_create') {
    const id = interaction.fields.getTextInputValue('id').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    const title = interaction.fields.getTextInputValue('title').trim().slice(0, 80);
    const description = interaction.fields.getTextInputValue('description').trim().slice(0, 300);
    const colorRaw = interaction.fields.getTextInputValue('color').trim() || '#3498db';
    const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : '#3498db';

    if (!id || !title) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID dan judul wajib diisi.' }], flags: MessageFlags.Ephemeral });
    }
    if (getPanel(guildId, id)) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ ID \`${id}\` sudah dipakai.` }], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    upsertPanel(guildId, {
      id, title, description, color,
      type: 'button', template: 'custom', mode: 'toggle', maxRolesPerUser: null,
      roles: [],
      createdBy: interaction.user.id,
    });
    return interaction.editReply({
      embeds: [{
        color: 0x2ecc71,
        title: '✅ Panel Dibuat!',
        description: `Panel **${id}** berhasil dibuat.\n\nSekarang tambah role dengan panel action "➕ Tambah Role".`,
      }],
    });
  }

  if (cid === 'rr_modal_create_template') {
    const id = interaction.fields.getTextInputValue('id').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    const templateId = interaction.fields.getTextInputValue('template').trim();
    const titleOverride = interaction.fields.getTextInputValue('title').trim();

    const tmpl = TEMPLATES[templateId];
    if (!tmpl) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ Template "${templateId}" tidak valid.` }], flags: MessageFlags.Ephemeral });
    }
    if (!id) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ ID wajib diisi.' }], flags: MessageFlags.Ephemeral });
    }
    if (getPanel(guildId, id)) {
      return interaction.reply({ embeds: [{ color: 0xe74c3c, title: `❌ ID \`${id}\` sudah dipakai.` }], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    upsertPanel(guildId, {
      id,
      title: titleOverride || tmpl.name,
      description: tmpl.description,
      color: '#3498db',
      type: tmpl.type,
      template: templateId,
      mode: tmpl.mode,
      maxRolesPerUser: tmpl.maxRolesPerUser,
      roles: [],
      createdBy: interaction.user.id,
    });
    return interaction.editReply({
      embeds: [{
        color: 0x2ecc71,
        title: `✅ Panel ${templateId} dibuat!`,
        description: `**ID:** \`${id}\`\n**Tipe:** ${tmpl.type}\n**Mode:** ${tmpl.mode} (max ${tmpl.maxRolesPerUser || '∞'})\n\nSekarang tambah role dengan panel action "➕ Tambah Role".`,
      }],
    });
  }

  if (cid.startsWith('rr_modal_edit_info:')) {
    const panelId = cid.split(':')[1];
    const title = interaction.fields.getTextInputValue('title').trim().slice(0, 80);
    const description = interaction.fields.getTextInputValue('description').trim().slice(0, 300);
    const colorRaw = interaction.fields.getTextInputValue('color').trim() || '#3498db';
    const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : '#3498db';
    const panel = getPanel(guildId, panelId);
    if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    upsertPanel(guildId, { ...panel, title, description, color });
    return interaction.editReply({ embeds: [{ color: 0x2ecc71, title: `✅ Panel ${panelId} updated.` }] });
  }

  if (cid.startsWith('rr_modal_edit_type:')) {
    const panelId = cid.split(':')[1];
    const type = interaction.fields.getTextInputValue('type').trim();
    const mode = interaction.fields.getTextInputValue('mode').trim();
    const maxStr = interaction.fields.getTextInputValue('max').trim();
    const maxRoles = maxStr ? parseInt(maxStr) : null;

    if (!['button', 'dropdown'].includes(type)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Tipe harus button atau dropdown' }], flags: MessageFlags.Ephemeral });
    if (!['toggle', 'add-only', 'one-of'].includes(mode)) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Mode harus toggle/add-only/one-of' }], flags: MessageFlags.Ephemeral });

    const panel = getPanel(guildId, panelId);
    if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    upsertPanel(guildId, { ...panel, type, mode, maxRolesPerUser: mode === 'one-of' ? (maxRoles || 1) : null });
    return interaction.editReply({ embeds: [{ color: 0x2ecc71, title: `✅ Panel ${panelId} updated.` }] });
  }

  if (cid.startsWith('rr_modal_addrole:')) {
    // Format: rr_modal_addrole:<panelId>:<roleId>
    const parts = cid.split(':');
    const panelId = parts[1];
    const roleId = parts[2];
    const label = interaction.fields.getTextInputValue('label').trim() || null;
    const emoji = interaction.fields.getTextInputValue('emoji').trim() || null;
    const description = interaction.fields.getTextInputValue('description').trim() || null;
    const panel = getPanel(guildId, panelId);
    if (!panel) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Panel not found' }], flags: MessageFlags.Ephemeral });

    const updated = addRoleToPanel(guildId, panelId, {
      roleId, label: label || (await tryGetRoleName(interaction, roleId)),
      emoji, description,
    });
    if (!updated) return interaction.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Role sudah ada di panel atau panel penuh.' }], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply({
      embeds: [{ color: 0x2ecc71, title: `✅ Role ditambahkan ke panel \`${panelId}\`!`, description: `Total: ${updated.roles.length} role` }],
    });
  }

  return false;
}

async function tryGetRoleName(interaction, roleId) {
  try {
    const r = await interaction.guild.roles.fetch(roleId);
    return r?.name || 'Role';
  } catch {
    return 'Role';
  }
}
