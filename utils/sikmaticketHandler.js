import { createTicket, closeTicket } from './sikmaticketManager.js';
import { getGuildConfig } from './sikmaticketConfig.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export async function handleSikmaticket(interaction) {
  const id = interaction.customId;

  // ── Open ticket via button ──
  // customId: skt_btn_{guildId}_{panelId}_{typeId}
  if (id.startsWith('skt_btn_')) {
    const raw = id.slice('skt_btn_'.length);
    // guildId is 17-19 digit snowflake, the rest after first _ is panelId_typeId
    const firstUs = raw.indexOf('_');
    const guildId = raw.slice(0, firstUs);
    const rest = raw.slice(firstUs + 1);
    const secondUs = rest.indexOf('_');
    const panelId = rest.slice(0, secondUs);
    const typeId = rest.slice(secondUs + 1);
    return createTicket(interaction, guildId, panelId, typeId);
  }

  // ── Open ticket via select menu ──
  // customId: skt_pub_{guildId}_{panelId}
  // value: {guildId}_{panelId}_{typeId}
  if (id.startsWith('skt_pub_')) {
    const value = interaction.values[0];
    const firstUs = value.indexOf('_');
    const guildId = value.slice(0, firstUs);
    const rest = value.slice(firstUs + 1);
    const secondUs = rest.indexOf('_');
    const panelId = rest.slice(0, secondUs);
    const typeId = rest.slice(secondUs + 1);
    return createTicket(interaction, guildId, panelId, typeId);
  }

  // ── Close ticket ──
  // customId: skt_close_{guildId}_{channelId}
  if (id.startsWith('skt_close_')) {
    const raw = id.slice('skt_close_'.length);
    const firstUs = raw.indexOf('_');
    const guildId = raw.slice(0, firstUs);
    const channelId = raw.slice(firstUs + 1);
    return closeTicket(interaction, guildId, channelId);
  }

  // ── Claim ticket ──
  // customId: skt_claim_{guildId}_{channelId}
  if (id.startsWith('skt_claim_')) {
    const raw = id.slice('skt_claim_'.length);
    const firstUs = raw.indexOf('_');
    const guildId = raw.slice(0, firstUs);
    const channelId = raw.slice(firstUs + 1);

    const config = getGuildConfig(guildId);
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
      || (config.staffRoles || []).some(r => interaction.member.roles.cache.has(r));

    if (!isStaff) {
      return interaction.reply({ content: '❌ Hanya staff yang bisa claim tiket.', flags: 64 });
    }

    const ticketData = config.activeTickets?.[channelId];
    if (!ticketData) return interaction.reply({ content: '❌ Data tiket tidak ditemukan.', flags: 64 });

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✋ Tiket Diclaim')
        .setDescription(`Tiket ini sedang ditangani oleh <@${interaction.user.id}>.`)
        .setTimestamp()
      ]
    });
  }
}
