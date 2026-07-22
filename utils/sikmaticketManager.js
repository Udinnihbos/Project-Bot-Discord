import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  PermissionFlagsBits, ChannelType,
} from 'discord.js';
import {
  getGuildConfig, getPanel, getTicketType,
  updatePanel, addActiveTicket, removeActiveTicket, getUserActiveTickets,
} from './sikmaticketConfig.js';

const BUTTON_STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

// ── Build Panel Embed ──
export function buildPanelEmbed(panel, guild) {
  const embed = new EmbedBuilder()
    .setColor(panel.embedColor || '#5865F2')
    .setTitle(panel.name)
    .setDescription(panel.description || null);

  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  if (panel.footer) embed.setFooter({ text: panel.footer });

  return embed;
}

// ── Build Panel Components ──
export function buildPanelComponents(panel, guildId) {
  const types = [...(panel.ticketTypes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (types.length === 0) return [];

  if (panel.displayType === 'select') {
    const options = types.slice(0, 25).map(t =>
      new StringSelectMenuOptionBuilder()
        .setLabel(t.name)
        .setDescription((t.description || '').substring(0, 100))
        .setValue(`${guildId}_${panel.id}_${t.id}`)
        .setEmoji(t.emoji || '🎫')
    );
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`skt_pub_${guildId}_${panel.id}`)
          .setPlaceholder('🎫 Pilih jenis tiket...')
          .addOptions(options)
      )
    ];
  }

  // Buttons (max 5 per row, max 5 rows = 25 buttons)
  const rows = [];
  for (let i = 0; i < Math.min(types.length, 25); i += 5) {
    const chunk = types.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(t =>
        new ButtonBuilder()
          .setCustomId(`skt_btn_${guildId}_${panel.id}_${t.id}`)
          .setLabel(t.name)
          .setStyle(BUTTON_STYLE_MAP[t.buttonStyle] || ButtonStyle.Primary)
          .setEmoji(t.emoji || '🎫')
      )
    ));
  }
  return rows;
}

// ── Publish / Update Panel ──
export async function publishOrUpdatePanel(client, guildId, panelId, forceNew = false) {
  const panel = getPanel(guildId, panelId);
  if (!panel) return { success: false, error: 'Panel tidak ditemukan.' };
  if (!panel.channelId) return { success: false, error: 'Channel publish belum diset.' };
  if ((panel.ticketTypes || []).length === 0) return { success: false, error: 'Belum ada ticket type.' };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { success: false, error: 'Guild tidak ditemukan.' };

  const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!channel) return { success: false, error: 'Channel tidak ditemukan.' };

  const embed = buildPanelEmbed(panel, guild);
  const components = buildPanelComponents(panel, guildId);

  if (panel.messageId && !forceNew) {
    try {
      const msg = await channel.messages.fetch(panel.messageId);
      await msg.edit({ embeds: [embed], components });
      return { success: true, isUpdate: true };
    } catch { /* message gone, send new */ }
  }

  try {
    const msg = await channel.send({ embeds: [embed], components });
    updatePanel(guildId, panelId, { messageId: msg.id });
    return { success: true, isUpdate: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Create Ticket Channel ──
export async function createTicket(interaction, guildId, panelId, typeId) {
  const config = getGuildConfig(guildId);
  const panel = getPanel(guildId, panelId);
  const type = getTicketType(guildId, panelId, typeId);
  const guild = interaction.guild;
  const user = interaction.user;

  if (!panel || !type) {
    return interaction.reply({ content: '❌ Konfigurasi tiket tidak ditemukan.', flags: 64 });
  }

  // Max tickets per user check
  const userTickets = getUserActiveTickets(guildId, user.id);
  if (userTickets.length >= (config.maxTicketsPerUser || 1)) {
    const existing = userTickets[0];
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Kamu sudah punya tiket aktif!')
        .setDescription(`Kamu sudah punya tiket yang sedang aktif: <#${existing.channelId}>\n\nSelesaikan tiket tersebut sebelum membuka tiket baru.`)
      ],
      flags: 64
    });
  }

  await interaction.deferReply({ flags: 64 });

  // Increment counter
  const ticketNumber = (config.ticketCounter || 0) + 1;
  const channelName = `${type.emoji || '🎫'}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').substring(0, 32);

  // Build permission overwrites
  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ]
    },
  ];

  // Add staff/mention roles
  for (const roleId of (type.mentionRoles || [])) {
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
      ]
    });
  }

  // Add global staff roles
  for (const roleId of (config.staffRoles || [])) {
    if (!type.mentionRoles.includes(roleId)) {
      permOverwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      });
    }
  }

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: type.categoryId || null,
      permissionOverwrites: permOverwrites,
      topic: `Tiket #${ticketNumber} • ${type.name} • ${user.tag}`,
    });
  } catch (e) {
    return interaction.editReply({ content: `❌ Gagal membuat channel tiket: ${e.message}` });
  }

  // Save active ticket
  addActiveTicket(guildId, ticketChannel.id, {
    panelId, typeId, userId: user.id,
    number: ticketNumber, panelName: panel.name, typeName: type.name,
  });

  // Welcome embed
  const welcomeMsg = (type.welcomeMessage || 'Halo {user}! Tim kami akan segera membantu.')
    .replace('{user}', `<@${user.id}>`)
    .replace('{number}', `#${ticketNumber}`);

  const welcomeEmbed = new EmbedBuilder()
    .setColor(panel.embedColor || '#5865F2')
    .setTitle(`${type.emoji || '🎫'} ${type.name}`)
    .setDescription(welcomeMsg)
    .addFields(
      { name: '👤 Dibuka oleh', value: `<@${user.id}>`, inline: true },
      { name: '🔢 Tiket', value: `#${ticketNumber}`, inline: true },
      { name: '📋 Jenis', value: type.name, inline: true },
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `${panel.name} • ${guild.name}` })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`skt_close_${guildId}_${ticketChannel.id}`)
      .setLabel('🔒 Tutup Tiket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`skt_claim_${guildId}_${ticketChannel.id}`)
      .setLabel('✋ Claim Tiket')
      .setStyle(ButtonStyle.Secondary),
  );

  await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });

  // Mention message
  if ((type.mentionRoles || []).length > 0) {
    const rolesMention = type.mentionRoles.map(id => `<@&${id}>`).join(' ');
    const mentionText = (type.mentionText || 'Halo {roles}! Ada tiket baru dari {user}.')
      .replace('{roles}', rolesMention)
      .replace('{user}', `<@${user.id}>`)
      .replace('{number}', `#${ticketNumber}`);
    await ticketChannel.send({ content: mentionText, allowedMentions: { roles: type.mentionRoles, users: [user.id] } });
  }

  // Reply to user
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('✅ Tiket Berhasil Dibuat!')
      .setDescription(`Tiket kamu sudah dibuat di ${ticketChannel}!\nTim kami akan segera membantu.`)
    ]
  });
}

// ── Close Ticket ──
export async function closeTicket(interaction, guildId, channelId, reason = null) {
  const ticketData = getGuildConfig(guildId).activeTickets?.[channelId];
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!ticketData || !channel) {
    return interaction.reply({ content: '❌ Channel ini bukan tiket aktif.', flags: 64 });
  }

  // Check permission
  const config = getGuildConfig(guildId);
  const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    || config.staffRoles.some(r => interaction.member.roles.cache.has(r));
  const isOwner = ticketData.userId === interaction.user.id;

  if (!isStaff && !isOwner) {
    return interaction.reply({ content: '❌ Kamu tidak punya izin menutup tiket ini.', flags: 64 });
  }

  await interaction.deferUpdate().catch(() => interaction.deferReply({ flags: 64 }));

  // Close embed
  const closeEmbed = new EmbedBuilder()
    .setColor('#e74c3c')
    .setTitle('🔒 Tiket Ditutup')
    .setDescription(`Tiket ini telah ditutup oleh <@${interaction.user.id}>.${reason ? `\n\n**Alasan:** ${reason}` : ''}`)
    .addFields(
      { name: '👤 Dibuka oleh', value: `<@${ticketData.userId}>`, inline: true },
      { name: '🔢 Tiket', value: `#${ticketData.number}`, inline: true },
    )
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });

  // Log to transcript channel if set
  if (config.transcriptChannelId) {
    try {
      const transcriptCh = await interaction.guild.channels.fetch(config.transcriptChannelId);
      await transcriptCh.send({
        embeds: [new EmbedBuilder()
          .setColor('#95a5a6')
          .setTitle(`📋 Tiket #${ticketData.number} Ditutup`)
          .addFields(
            { name: '👤 User', value: `<@${ticketData.userId}>`, inline: true },
            { name: '📋 Jenis', value: ticketData.typeName || '-', inline: true },
            { name: '🔒 Ditutup oleh', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏱️ Dibuka pada', value: `<t:${Math.floor(ticketData.openedAt / 1000)}:R>`, inline: true },
          )
          .setTimestamp()
        ]
      });
    } catch {}
  }

  removeActiveTicket(guildId, channelId);

  // Delete channel after 5 seconds
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}
