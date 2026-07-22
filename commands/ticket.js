import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, getZonaData, getShopData } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('🎟️ Lihat tiket zona yang kamu miliki!');

export async function execute(interaction) {
  const player = getPlayer(interaction.user.id);
  const zonaData = getZonaData();
  const shopData = getShopData();
  const tickets = player.tickets || {};

  const ticketEntries = Object.entries(tickets).filter(([, qty]) => qty > 0);

  if (ticketEntries.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle('🎟️ Tiket Zona')
        .setDescription('Kamu tidak punya tiket zona apapun!\nBeli tiket di `/fishshop list` kategori Tiket Zona.')
      ],
      ephemeral: true
    });
  }

  const lines = ticketEntries.map(([zonaId, qty]) => {
    const zona = zonaData.zonas[zonaId];
    const shopItem = shopData.items.find(i => i.type === 'ticket' && i.zonaId === zonaId);
    const priceStr = shopItem
      ? (shopItem.priceCoins > 0 ? `🪙 ${shopItem.priceCoins.toLocaleString('id-ID')}` : `💎 ${shopItem.priceGems}`)
      : '-';
    const zonaName = zona ? `${zona.emoji} ${zona.nama}` : zonaId;
    return `🎟️ **${zonaName}** — ×${qty}\n┗ Harga per tiket: ${priceStr}`;
  });

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('🎟️ Tiket Zona Kamu')
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `Total jenis tiket: ${ticketEntries.length}` })
      .setTimestamp()
    ],
    ephemeral: true
  });
}
