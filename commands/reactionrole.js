import {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { getRRData, saveRRData } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('reactionrole')
  .setDescription('🎭 [OWNER] Kelola panel reaction role!')
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('Buat panel reaction role baru')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik panel (contoh: role_game)').setRequired(true))
      .addStringOption(opt => opt.setName('judul').setDescription('Judul embed panel').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi embed panel').setRequired(true))
      .addStringOption(opt =>
        opt.setName('tipe')
          .setDescription('Tipe tampilan panel')
          .setRequired(true)
          .addChoices(
            { name: '📋 Dropdown Menu', value: 'dropdown' },
            { name: '🔘 Button', value: 'button' }
          )
      )
      .addStringOption(opt => opt.setName('warna').setDescription('Warna embed hex (contoh: #3498db)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('addrole')
      .setDescription('Tambah role ke panel')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel tujuan').setRequired(true).setAutocomplete(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role yang ingin ditambahkan').setRequired(true))
      .addStringOption(opt => opt.setName('label').setDescription('Label tombol/menu (default: nama role)').setRequired(false))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji tombol/menu').setRequired(false))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi (khusus dropdown)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('removerole')
      .setDescription('Hapus role dari panel')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel').setRequired(true).setAutocomplete(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role yang ingin dihapus').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('publish')
      .setDescription('Kirim panel ke channel')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel yang ingin dikirim').setRequired(true).setAutocomplete(true))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel tujuan').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Lihat semua panel reaction role')
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('Hapus panel reaction role')
      .addStringOption(opt => opt.setName('panel_id').setDescription('ID panel yang ingin dihapus').setRequired(true).setAutocomplete(true))
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Akses Ditolak').setDescription('Command ini hanya untuk **Owner bot**!')],
      ephemeral: true
    });
  }

  const sub = interaction.options.getSubcommand();
  const rrData = getRRData();

  // ── CREATE ──
  if (sub === 'create') {
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const judul = interaction.options.getString('judul');
    const deskripsi = interaction.options.getString('deskripsi');
    const tipe = interaction.options.getString('tipe');
    const warna = interaction.options.getString('warna') || '#3498db';
    const hexRegex = /^#([0-9A-Fa-f]{6})$/;
    const finalColor = hexRegex.test(warna) ? warna : '#3498db';

    if (rrData.panels[id]) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada').setDescription(`Panel dengan ID **\`${id}\`** sudah ada!`)],
        ephemeral: true
      });
    }

    rrData.panels[id] = { id, judul, deskripsi, tipe, color: finalColor, roles: [], messageId: null, channelId: null };
    saveRRData(rrData);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(finalColor)
          .setTitle('✅ Panel Dibuat!')
          .setDescription(`Panel **\`${id}\`** berhasil dibuat!`)
          .addFields(
            { name: 'Judul', value: judul, inline: true },
            { name: 'Tipe', value: tipe === 'dropdown' ? '📋 Dropdown' : '🔘 Button', inline: true },
            { name: 'Roles', value: 'Belum ada role. Gunakan `/reactionrole addrole`', inline: false }
          )
          .setFooter({ text: 'Gunakan /reactionrole addrole untuk menambah role, lalu /reactionrole publish untuk mengirim!' })
      ],
      ephemeral: true
    });
  }

  // ── ADD ROLE ──
  if (sub === 'addrole') {
    const panelId = interaction.options.getString('panel_id');
    const role = interaction.options.getRole('role');
    const label = interaction.options.getString('label') || role.name;
    const emoji = interaction.options.getString('emoji') || null;
    const desc = interaction.options.getString('deskripsi') || null;

    const panel = rrData.panels[panelId];
    if (!panel) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Panel Tidak Ditemukan')], ephemeral: true });

    if (panel.tipe === 'button' && panel.roles.length >= 25) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Maksimal 25 role per panel!')], ephemeral: true });
    }
    if (panel.roles.find(r => r.roleId === role.id)) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Role Sudah Ada').setDescription(`**${role.name}** sudah ada di panel ini!`)], ephemeral: true });
    }

    panel.roles.push({ roleId: role.id, label, emoji, description: desc });
    saveRRData(rrData);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('✅ Role Ditambahkan!')
          .setDescription(`${emoji || ''} **${label}** (<@&${role.id}>) berhasil ditambahkan ke panel **\`${panelId}\`**!`)
          .addFields({ name: 'Total Role di Panel', value: `${panel.roles.length} role` })
      ],
      ephemeral: true
    });
  }

  // ── REMOVE ROLE ──
  if (sub === 'removerole') {
    const panelId = interaction.options.getString('panel_id');
    const role = interaction.options.getRole('role');
    const panel = rrData.panels[panelId];
    if (!panel) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Panel Tidak Ditemukan')], ephemeral: true });

    const idx = panel.roles.findIndex(r => r.roleId === role.id);
    if (idx === -1) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Role Tidak Ada di Panel')], ephemeral: true });

    panel.roles.splice(idx, 1);
    saveRRData(rrData);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Role Dihapus!').setDescription(`**${role.name}** berhasil dihapus dari panel **\`${panelId}\`**!`)],
      ephemeral: true
    });
  }

  // ── LIST ──
  if (sub === 'list') {
    const panels = Object.values(rrData.panels);
    if (panels.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('📋 Reaction Role Panels').setDescription('Belum ada panel. Buat dengan `/reactionrole create`!')],
        ephemeral: true
      });
    }
    const lines = panels.map(p => {
      const status = p.messageId ? `✅ Aktif di <#${p.channelId}>` : '⏳ Belum dipublish';
      return `**\`${p.id}\`** — ${p.tipe === 'dropdown' ? '📋' : '🔘'} ${p.judul} | ${p.roles.length} role | ${status}`;
    });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#3498db').setTitle('📋 Semua Reaction Role Panel').setDescription(lines.join('\n'))],
      ephemeral: true
    });
  }

  // ── DELETE ──
  if (sub === 'delete') {
    const panelId = interaction.options.getString('panel_id');
    if (!rrData.panels[panelId]) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Panel Tidak Ditemukan')], ephemeral: true });
    }
    delete rrData.panels[panelId];
    saveRRData(rrData);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Panel Dihapus!').setDescription(`Panel **\`${panelId}\`** berhasil dihapus!`)],
      ephemeral: true
    });
  }

  // ── PUBLISH ──
  if (sub === 'publish') {
    const panelId = interaction.options.getString('panel_id');
    const channel = interaction.options.getChannel('channel');
    const panel = rrData.panels[panelId];

    if (!panel) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Panel Tidak Ditemukan')], ephemeral: true });
    if (panel.roles.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Panel Kosong').setDescription('Tambahkan role dulu dengan `/reactionrole addrole`!')], ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(panel.color)
      .setTitle(panel.judul)
      .setDescription(panel.deskripsi + '\n\n' + panel.roles.map(r => `${r.emoji || '•'} ${r.label} — <@&${r.roleId}>`).join('\n'))
      .setFooter({ text: 'Pilih role di bawah ini!' })
      .setTimestamp();

    let components = [];

    if (panel.tipe === 'dropdown') {
      const options = panel.roles.map(r => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(r.label)
          .setValue(r.roleId);
        if (r.emoji) { try { opt.setEmoji(r.emoji); } catch {} }
        if (r.description) opt.setDescription(r.description);
        return opt;
      });
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`rr_dropdown_${panelId}`)
        .setPlaceholder('Pilih role kamu...')
        .setMinValues(0)
        .setMaxValues(panel.roles.length)
        .addOptions(options);
      components = [new ActionRowBuilder().addComponents(menu)];
    } else {
      // Button — max 5 per row, max 5 rows = 25 buttons
      const rows = [];
      for (let i = 0; i < panel.roles.length; i += 5) {
        const chunk = panel.roles.slice(i, i + 5);
        const row = new ActionRowBuilder().addComponents(
          chunk.map(r => {
            const btn = new ButtonBuilder()
              .setCustomId(`rr_btn_${panelId}_${r.roleId}`)
              .setLabel(r.label)
              .setStyle(ButtonStyle.Secondary);
            if (r.emoji) { try { btn.setEmoji(r.emoji); } catch {} }
            return btn;
          })
        );
        rows.push(row);
      }
      components = rows;
    }

    try {
      const msg = await channel.send({ embeds: [embed], components });
      panel.messageId = msg.id;
      panel.channelId = channel.id;
      saveRRData(rrData);

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Panel Terkirim!').setDescription(`Panel **\`${panelId}\`** berhasil dikirim ke ${channel}!`)],
        ephemeral: true
      });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gagal Mengirim').setDescription('Pastikan bot punya permission **Send Messages** & **Manage Roles** di channel tersebut!')],
        ephemeral: true
      });
    }
  }
}

export async function autocomplete(interaction) {
  const rrData = getRRData();
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = Object.keys(rrData.panels)
    .filter(id => id.includes(focused))
    .map(id => ({ name: `${id} (${rrData.panels[id].roles.length} role)`, value: id }));
  await interaction.respond(choices.slice(0, 25));
}
