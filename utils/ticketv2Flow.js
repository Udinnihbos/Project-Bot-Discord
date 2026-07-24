/**
 * Ticket V2 — User flow logic.
 *
 * Responsibilities:
 *   - Build panel embed + components (for publishing)
 *   - Publish / unpublish panel ke channel
 *   - Open ticket channel (from button / select click)
 *   - Claim, close, message tracking
 *
 * CustomId conventions (user-facing, all start with `tv2u_`):
 *   tv2u_open:<panelId>:<typeId>     — open ticket (button)
 *   tv2u_open_sel:<panelId>          — open ticket (select), value = typeId
 *   tv2u_claim:<channelId>           — claim ticket
 *   tv2u_close:<channelId>           — close ticket
 *   tv2u_publish_pick:<panelId>      — admin: channel select picked for publish
 */

import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import {
  getPanel, updatePanel,
  getUserActiveTickets,
  createTicket, updateTicket, getTicketByChannelId, claimTicket, closeTicket,
  recordStaffResponse, incrementMessageCount,
  recordTicketCreated, recordTicketClosed,
  getSettings,
} from './ticketv2.js';

const ACCENT = '#5865F2';
const SUCCESS = '#2ecc71';
const DANGER = '#e74c3c';

function hexToInt(hex) { return parseInt(String(hex || ACCENT).replace('#', ''), 16); }

// ══════════════════════════════════════════════════════════
// PANEL EMBED + COMPONENTS (for published message)
// ══════════════════════════════════════════════════════════

/**
 * Build the public embed shown to users (when they click a published panel).
 */
export function buildPublicPanelEmbed(panel, guild) {
  const embed = new EmbedBuilder()
    .setColor(hexToInt(panel.color))
    .setAuthor({ name: `${guild.name} • ${panel.name}`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${panel.name}`)
    .setDescription(panel.description || 'Klik tombol di bawah untuk membuka tiket.');

  if (panel.bannerUrl) embed.setImage(panel.bannerUrl);
  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  if (panel.footerText) embed.setFooter({ text: panel.footerText });
  embed.setTimestamp();

  return embed;
}

/**
 * Build components (buttons or select menu) for published panel.
 * Returns array of ActionRowBuilder.
 */
export function buildPublicPanelComponents(panel) {
  const types = [...(panel.ticketTypes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (types.length === 0) return [];

  if (panel.displayType === 'select') {
    const options = types.slice(0, 25).map(t =>
      new StringSelectMenuOptionBuilder()
        .setLabel(t.name)
        .setDescription((t.description || 'Buka tiket').substring(0, 100))
        .setValue(t.id)
        .setEmoji(t.emoji || '🎫')
    );
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`tv2u_open_sel:${panel.id}`)
          .setPlaceholder('🎫 Pilih jenis tiket...')
          .addOptions(options)
      )
    ];
  }

  // Buttons (max 5 per row, max 5 rows = 25)
  const rows = [];
  const BUTTON_STYLE = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
  };
  for (let i = 0; i < Math.min(types.length, 25); i += 5) {
    const chunk = types.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(t =>
        new ButtonBuilder()
          .setCustomId(`tv2u_open:${panel.id}:${t.id}`)
          .setLabel(t.name)
          .setStyle(BUTTON_STYLE[t.buttonStyle] || ButtonStyle.Primary)
          .setEmoji(t.emoji || '🎫')
      )
    ));
  }
  return rows;
}

// ══════════════════════════════════════════════════════════
// PUBLISH / REPUBLISH / UNPUBLISH
// ══════════════════════════════════════════════════════════

/**
 * Post (or update) a panel embed to a channel. Saves messageId + channelId on panel.
 * Returns { success, isUpdate, error? }.
 */
export async function publishPanel(guild, panelId, targetChannelId) {
  const panel = getPanel(guild.id, panelId);
  if (!panel) return { success: false, error: 'Panel tidak ditemukan.' };
  if (!panel.ticketTypes?.length) return { success: false, error: 'Panel belum punya ticket type.' };

  const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel) return { success: false, error: 'Channel tujuan tidak ditemukan.' };
  if (!channel.isTextBased()) return { success: false, error: 'Channel tujuan harus text channel.' };

  // Bot permission check
  const me = await guild.members.fetchMe().catch(() => null);
  if (!me) return { success: false, error: 'Bot member tidak ditemukan di guild ini.' };
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
    return { success: false, error: 'Bot tidak punya izin Send Messages + Embed Links di channel itu.' };
  }

  const embed = buildPublicPanelEmbed(panel, guild);
  const components = buildPublicPanelComponents(panel);

  // If panel already published (same channel), try to edit existing message
  if (panel.panelMessageId && panel.panelMessageChannelId === targetChannelId) {
    try {
      const msg = await channel.messages.fetch(panel.panelMessageId);
      await msg.edit({ embeds: [embed], components });
      return { success: true, isUpdate: true, channelId: targetChannelId, messageId: msg.id };
    } catch {
      // Message gone, fall through to send new
    }
  }

  try {
    const msg = await channel.send({ embeds: [embed], components });
    updatePanel(guild.id, panelId, {
      panelMessageChannelId: targetChannelId,
      panelMessageId: msg.id,
    });
    return { success: true, isUpdate: false, channelId: targetChannelId, messageId: msg.id };
  } catch (e) {
    return { success: false, error: `Gagal kirim message: ${e.message?.slice(0, 200)}` };
  }
}

/**
 * Remove panel reference from published message (deletes it).
 */
export async function unpublishPanel(guild, panelId) {
  const panel = getPanel(guild.id, panelId);
  if (!panel || !panel.panelMessageId || !panel.panelMessageChannelId) return { success: true, wasPublished: false };

  try {
    const channel = await guild.channels.fetch(panel.panelMessageChannelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(panel.panelMessageId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
  } catch { /* best-effort */ }

  updatePanel(guild.id, panelId, {
    panelMessageChannelId: null,
    panelMessageId: null,
  });
  return { success: true, wasPublished: true };
}

// ══════════════════════════════════════════════════════════
// COOLDOWN / RATE LIMIT HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Check cooldown: user must not have created a ticket on this panel in the
 * last `cooldownSeconds` (default 300s = 5min).
 * Returns { allowed, waitMs }.
 */
export function checkCooldown(guildId, userId, panel) {
  const cooldown = panel.cooldownSeconds ?? 300;
  if (cooldown <= 0) return { allowed: true, waitMs: 0 };
  const userTickets = getUserActiveTickets(guildId, userId);
  const recent = userTickets
    .filter(t => t.panelId === panel.id)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!recent) return { allowed: true, waitMs: 0 };
  const elapsed = Date.now() - recent.createdAt;
  if (elapsed >= cooldown * 1000) return { allowed: true, waitMs: 0 };
  return { allowed: false, waitMs: cooldown * 1000 - elapsed };
}

// ══════════════════════════════════════════════════════════
// OPEN TICKET (user clicked button / select)
// ══════════════════════════════════════════════════════════

function sanitizeChannelName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'ticket';
}

/**
 * Open a ticket channel for a user. Returns { success, ticket?, error? }.
 */
export async function openTicket({ guild, panel, type, user }) {
  const guildId = guild.id;

  // Allowlist check
  if (panel.allowedUserIds?.length && !panel.allowedUserIds.includes(user.id)) {
    return { success: false, error: 'Kamu tidak termasuk dalam allowlist panel ini.' };
  }

  // Max active tickets per user
  const userTickets = getUserActiveTickets(guildId, user.id);
  const maxAllowed = panel.maxTicketsPerUser ?? 1;
  if (userTickets.length >= maxAllowed) {
    const existing = userTickets[0];
    return {
      success: false,
      error: `Kamu sudah punya ${userTickets.length} tiket aktif. Selesaikan dulu: <#${existing.channelId}>`,
    };
  }

  // Cooldown
  const cooldown = checkCooldown(guildId, user.id, panel);
  if (!cooldown.allowed) {
    const sec = Math.ceil(cooldown.waitMs / 1000);
    return { success: false, error: `Cooldown aktif — coba lagi dalam **${sec} detik**.` };
  }

  // Bot perms
  const me = await guild.members.fetchMe().catch(() => null);
  if (!me) return { success: false, error: 'Bot member tidak ditemukan.' };

  // Build channel name
  const baseName = sanitizeChannelName(`${type.emoji?.replace(/[^\w]/g, '') || 'ticket'}-${user.username}`);

  // Permission overwrites
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
      ],
    },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];

  // Staff roles
  for (const roleId of (panel.staffRoles || [])) {
    permOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  // Create channel
  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: baseName,
      type: ChannelType.GuildText,
      parent: panel.categoryId || null,
      permissionOverwrites: permOverwrites,
      topic: `🎫 Ticket V2 | ${panel.name} > ${type.name} | ${user.tag}`,
    });
  } catch (e) {
    return { success: false, error: `Gagal buat channel: ${e.message?.slice(0, 200)}` };
  }

  // Persist ticket
  const ticket = createTicket({
    guildId,
    panelId: panel.id,
    typeId: type.id,
    userId: user.id,
    subject: type.name,
    formData: {},
  });
  // Set channelId on ticket
  updateTicket(ticket.id, { channelId: ticketChannel.id });
  ticket.channelId = ticketChannel.id;

  // Analytics
  const settings = getSettings(guildId);
  if (settings.enableAnalytics !== false) {
    recordTicketCreated(guildId);
  }

  // Welcome embed
  const welcomeEmbed = new EmbedBuilder()
    .setColor(hexToInt(panel.color))
    .setTitle(`${type.emoji || '🎫'} ${type.name}`)
    .setDescription(
      `Halo <@${user.id}>! Tim kami akan segera membantu kamu.\n` +
      `Sebutkan masalah / pertanyaan kamu secara detail, ya.`
    )
    .addFields(
      { name: '👤 Dibuka oleh', value: `<@${user.id}>`, inline: true },
      { name: '🔢 Tiket', value: `#${ticket.number}`, inline: true },
      { name: '📋 Panel', value: panel.name, inline: true },
      { name: '🎟️ Tipe', value: `${type.emoji || '🎫'} ${type.name}`, inline: true },
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: panel.footerText || '🎫 Ticket System' })
    .setTimestamp();

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv2u_claim:${ticketChannel.id}`)
      .setLabel('✋ Claim')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tv2u_close:${ticketChannel.id}`)
      .setLabel('🔒 Tutup')
      .setStyle(ButtonStyle.Danger),
  );

  try {
    await ticketChannel.send({ embeds: [welcomeEmbed], components: [controlsRow] });
  } catch (e) {
    // Channel created but message failed — still counts as success
    console.error('[tv2u] Welcome send failed:', e.message);
  }

  return { success: true, ticket, channel: ticketChannel };
}

// ══════════════════════════════════════════════════════════
// CLAIM
// ══════════════════════════════════════════════════════════

export function isStaff(ctx, panel) {
  // ctx can be: interaction OR { user, member, guild }
  const userId = ctx.user?.id;
  const member = ctx.member;
  const guild = ctx.guild;
  if (!userId) return false;
  if (guild?.ownerId === userId) return true;
  if (member?.permissions?.has?.('Administrator')) return true;
  if (member?.permissions?.has?.('ManageChannels')) return true;
  if (panel?.staffRoles?.length && member?.roles?.cache) {
    for (const roleId of panel.staffRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

export async function claimTicketAction(interaction, channelId) {
  const ticket = getTicketByChannelId(channelId);
  if (!ticket) {
    return interaction.reply({ content: '❌ Data tiket tidak ditemukan.', flags: MessageFlags.Ephemeral });
  }
  const panel = getPanel(ticket.guildId, ticket.panelId);
  if (!isStaff(interaction, panel)) {
    return interaction.reply({ content: '❌ Hanya staff yang bisa claim tiket.', flags: MessageFlags.Ephemeral });
  }
  if (ticket.claimedBy) {
    return interaction.reply({
      content: `ℹ️ Tiket ini sudah di-claim oleh <@${ticket.claimedBy}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const updated = claimTicket(ticket.id, interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(hexToInt(SUCCESS))
    .setTitle('✋ Tiket Diclaim')
    .setDescription(`Tiket ini sedang ditangani oleh <@${interaction.user.id}>.`)
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

// ══════════════════════════════════════════════════════════
// CLOSE
// ══════════════════════════════════════════════════════════

export async function closeTicketAction(interaction, channelId) {
  const ticket = getTicketByChannelId(channelId);
  if (!ticket) {
    return interaction.reply({ content: '❌ Data tiket tidak ditemukan.', flags: MessageFlags.Ephemeral });
  }
  const panel = getPanel(ticket.guildId, ticket.panelId);
  const isOwner = ticket.userId === interaction.user.id;
  if (!isStaff(interaction, panel) && !isOwner) {
    return interaction.reply({ content: '❌ Kamu tidak punya izin menutup tiket ini.', flags: MessageFlags.Ephemeral });
  }
  if (ticket.status === 'closed') {
    return interaction.reply({ content: 'ℹ️ Tiket ini sudah ditutup.', flags: MessageFlags.Ephemeral });
  }

  // Acknowledge immediately (defer)
  try { await interaction.deferUpdate(); } catch { /* may already be replied */ }

  // Mark closed in DB
  const closed = closeTicket(ticket.id, {
    closedBy: interaction.user.id,
    reason: 'solved',
    note: '',
  });

  // Analytics
  const settings = getSettings(ticket.guildId);
  if (settings.enableAnalytics !== false) {
    recordTicketClosed(ticket.guildId, closed);
  }

  // Post close embed in ticket channel
  const closeEmbed = new EmbedBuilder()
    .setColor(hexToInt(DANGER))
    .setTitle('🔒 Tiket Ditutup')
    .setDescription(
      `Tiket ini telah ditutup oleh <@${interaction.user.id}>.\n` +
      `Channel ini akan dihapus dalam **5 detik**...`
    )
    .addFields(
      { name: '👤 Pembuat', value: `<@${ticket.userId}>`, inline: true },
      { name: '🔢 Tiket', value: `#${ticket.number}`, inline: true },
      { name: '⏱️ Durasi', value: `<t:${Math.floor(ticket.createdAt / 1000)}:R>`, inline: true },
    )
    .setTimestamp();

  try {
    const channel = interaction.guild.channels.cache.get(channelId)
      || await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [closeEmbed] });
      setTimeout(() => channel.delete().catch(() => {}), 5000);
    }
  } catch (e) {
    console.error('[tv2u] Close channel delete failed:', e.message);
  }
}

// ══════════════════════════════════════════════════════════
// MESSAGE TRACKER (called from messageCreate for ticket channels)
// ══════════════════════════════════════════════════════════

/**
 * Called when a new message is sent in a channel that might be a ticket.
 * Returns true if the message was tracked (i.e. channel is a ticket).
 */
export async function trackTicketMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const ticket = getTicketByChannelId(message.channel.id);
  if (!ticket || ticket.status === 'closed') return false;

  // Increment count + update last activity
  incrementMessageCount(ticket.id);

  // If author is staff (not ticket creator) and first response not set, mark
  const panel = getPanel(ticket.guildId, ticket.panelId);
  const member = message.member;
  if (panel && member && ticket.userId !== message.author.id) {
    const staff = isStaff({ user: message.author, member, guild: message.guild }, panel);
    if (staff) {
      recordStaffResponse(ticket.id);
    }
  }
  return true;
}
