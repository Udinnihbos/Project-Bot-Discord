/**
 * Ticket V2 — User-facing interaction handler.
 *
 * Routes `tv2u_*` customIds to ticketv2Flow.js logic.
 * Called from index.js interactionCreate.
 *
 * CustomId conventions:
 *   tv2u_open:<panelId>:<typeId>   — open ticket (button)
 *   tv2u_open_sel:<panelId>       — open ticket (select), value = typeId
 *   tv2u_claim:<channelId>        — claim ticket
 *   tv2u_close:<channelId>        — close ticket
 */

import { MessageFlags } from 'discord.js';
import {
  getPanel, getTicketType,
} from './ticketv2.js';
import {
  openTicket, claimTicketAction, closeTicketAction,
} from './ticketv2Flow.js';

export async function handleTicketV2UserInteraction(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('tv2u_')) return false;

  const cid = interaction.customId;

  // ── Open ticket (button: tv2u_open:<panelId>:<typeId>) ──
  if (cid.startsWith('tv2u_open:') && interaction.isButton()) {
    const parts = cid.split(':');
    // tv2u_open:<panelId>:<typeId>  → length 3
    if (parts.length !== 3) return false;
    const [, panelId, typeId] = parts;
    return doOpen(interaction, panelId, typeId);
  }

  // ── Open ticket (select: tv2u_open_sel:<panelId>) ──
  if (cid.startsWith('tv2u_open_sel:') && interaction.isStringSelectMenu()) {
    const parts = cid.split(':');
    // tv2u_open_sel:<panelId> → length 2
    if (parts.length !== 2) return false;
    const panelId = parts[1];
    const typeId = interaction.values[0];
    return doOpen(interaction, panelId, typeId);
  }

  // ── Claim ──
  if (cid.startsWith('tv2u_claim:') && interaction.isButton()) {
    const channelId = cid.slice('tv2u_claim:'.length);
    return claimTicketAction(interaction, channelId);
  }

  // ── Close ──
  if (cid.startsWith('tv2u_close:') && interaction.isButton()) {
    const channelId = cid.slice('tv2u_close:'.length);
    return closeTicketAction(interaction, channelId);
  }

  return false;
}

async function doOpen(interaction, panelId, typeId) {
  const panel = getPanel(interaction.guildId, panelId);
  if (!panel) {
    return interaction.reply({ content: '❌ Panel tidak ditemukan.', flags: MessageFlags.Ephemeral });
  }
  const type = getTicketType(panelId, typeId);
  if (!type) {
    return interaction.reply({ content: '❌ Tipe tiket tidak ditemukan.', flags: MessageFlags.Ephemeral });
  }

  // Defer ephemerally so user sees the result
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch { /* maybe already deferred */ }

  const result = await openTicket({
    guild: interaction.guild,
    panel,
    type,
    user: interaction.user,
  });

  if (!result.success) {
    return interaction.editReply({ content: `❌ ${result.error}` });
  }

  return interaction.editReply({
    embeds: [{
      color: 0x2ecc71,
      title: '✅ Tiket Dibuat!',
      description: `Tiket kamu sudah dibuat di ${result.channel}.\nTim kami akan segera membantu.`,
    }],
  });
}
