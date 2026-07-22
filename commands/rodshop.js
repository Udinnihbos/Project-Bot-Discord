import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, getRodData } from '../utils/database.js';
import { formatCoins, formatNumber, formatGems } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('rodshop')
  .setDescription('🏪 Beli pancingan baru untuk meningkatkan luck kamu!');

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { rods } = getRodData();

  // Filter: hanya tampilkan rod yang bisa dibeli (bukan level reward)
  const shopRods = rods.filter(r => !r.isLevelReward);

  const lines = shopRods.map(rod => {
    const owned = (player.ownedRods || []).includes(rod.id);
    const equipped = player.equippedRod === rod.id;
    const status = equipped ? '✅ **Dipakai**' : owned ? '📦 **Dimiliki**' : `🪙 ${formatNumber(rod.price)} Coins`;
    const mutTag = rod.mutationMultiplier && rod.mutationMultiplier > 1 ? ` | Mutasi ×${rod.mutationMultiplier}` : '';
    return [
      `${rod.emoji} **${rod.name}** — ${status}`,
      `┗ Luck: **+${rod.luckBonus}%** | Cooldown: **-${rod.cooldownReduction}s**${mutTag}`,
      `┗ ${rod.description}`
    ].join('\n');
  });

  const embed = new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle('🏪 Toko Pancingan')
    .setDescription(lines.join('\n\n'))
    .addFields(
      { name: '💰 Coins Kamu', value: formatCoins(player.coins), inline: true },
      { name: '🎁 Rod Eksklusif', value: 'Rod level reward bisa dilihat di `/level`', inline: true }
    )
    .setFooter({ text: 'Gunakan /buypancing untuk membeli | /equipancing untuk memakai' })
    .setTimestamp();

  await interaction.reply({ ephemeral: true, embeds: [embed] });
}
