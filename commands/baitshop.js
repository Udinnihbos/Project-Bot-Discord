import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, getBaitData } from '../utils/database.js';
import { formatCoins, formatNumber, formatGems } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('baitshop')
  .setDescription('🪱 Lihat dan beli umpan pancing!');

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { baits } = getBaitData();

  const lines = baits.map(b => {
    const owned = player.baitInventory?.[b.id] || 0;
    const effects = [];
    if (b.luckBonus > 0) effects.push(`+${b.luckBonus}% luck`);
    if (b.rarityBoost) {
      const boosted = Object.entries(b.rarityBoost).map(([r, v]) => `${r} ×${v}`).join(', ');
      effects.push(boosted);
    }
    return [
      `${b.emoji} **${b.name}** — 🪙 ${formatNumber(b.price)} | Punya: **${owned}x**`,
      `┗ ${b.description}`,
      `┗ Efek: \`${effects.join(' | ')}\``
    ].join('\n');
  });

  const embed = new EmbedBuilder()
    .setColor('#8B4513')
    .setTitle('🪱 Toko Umpan Pancing')
    .setDescription(lines.join('\n\n'))
    .addFields({ name: '💰 Coins Kamu', value: `🪙 ${formatNumber(player.coins)}`, inline: true })
    .setFooter({ text: 'Gunakan /buybait untuk membeli | /usebait untuk memakai sebelum /mancing' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
