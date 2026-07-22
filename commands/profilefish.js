import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, getFishData, getPlayerLevel, getXpForNextLevel, getLevelData } from '../utils/database.js';
import { getRarityEmoji, getRarityColor, getRarestFish, formatCoins, formatNumber, formatGems, getEquippedRod, formatChance } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('profilefish')
  .setDescription('🐟 Lihat profil memancingmu!')
  .addUserOption(opt =>
    opt.setName('user').setDescription('Lihat profil pemain lain').setRequired(false)
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const target = interaction.options.getUser('user') || interaction.user;
  const player = getPlayer(target.id);
  const { fish: fishList } = getFishData();
  const { levelThresholds } = getLevelData();

  const totalInInventory = Object.values(player.inventory).reduce((a, b) => a + b, 0);
  const rarest = getRarestFish(player.discovered || [], fishList);
  const rarityEmoji = rarest ? getRarityEmoji(rarest.rarity) : '❓';
  const rarityColor = rarest ? getRarityColor(rarest.rarity) : '#3498db';

  const uniqueSpecies = (player.discovered || []).length;
  const totalSpecies = fishList.length;

  let mostCaughtId = null;
  let mostCaughtQty = 0;
  for (const [id, qty] of Object.entries(player.inventory)) {
    if (qty > mostCaughtQty) { mostCaughtQty = qty; mostCaughtId = id; }
  }
  const mostCaughtFish = mostCaughtId ? fishList.find(f => f.id === mostCaughtId.split('__')[0]) : null;

  const rod = getEquippedRod(player);
  const ownedRodCount = (player.ownedRods || ['pancing_bambu']).length;

  // Level & XP
  const level = getPlayerLevel(player);
  const xp = player.xp || 0;
  const xpNext = getXpForNextLevel(player);
  const isMax = level >= 65;

  let xpBar = '';
  if (!isMax && xpNext) {
    const xpCurrent = xp - (levelThresholds[level] || 0);
    const xpNeeded = xpNext - (levelThresholds[level] || 0);
    const progress = Math.min(Math.floor((xpCurrent / xpNeeded) * 15), 15);
    xpBar = `\`[${'█'.repeat(progress)}${'░'.repeat(15 - progress)}]\` ${xpCurrent.toLocaleString('id-ID')}/${xpNeeded.toLocaleString('id-ID')} XP`;
  } else {
    xpBar = '✨ **MAX LEVEL!**';
  }

  // Level color
  const levelColors = [[65,'#FFD700'],[60,'#1a1a2e'],[50,'#e74c3c'],[40,'#f39c12'],[30,'#9b59b6'],[20,'#3498db'],[10,'#2ecc71'],[0,'#95a5a6']];
  const finalColor = (levelColors.find(([l]) => level >= l) || [0, rarityColor])[1];

  const embed = new EmbedBuilder()
    .setColor(finalColor)
    .setTitle(`🎣 Profil Pancing — ${target.username}`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🏅 Level', value: `**${level}**/65${isMax ? ' 🌟' : ''}`, inline: true },
      { name: '💰 Coins', value: formatCoins(player.coins), inline: true },
      { name: '💎 Gems', value: `${(player.gems || 0).toLocaleString('id-ID')}`, inline: true },
      { name: '🎣 Total Mancing', value: `${player.totalFishCaught.toLocaleString('id-ID')}x`, inline: true },
      { name: '📊 XP Progress', value: xpBar, inline: false },
      { name: '📦 Ikan di Inventori', value: `${totalInInventory.toLocaleString('id-ID')}x`, inline: true },
      { name: '📖 Spesies Ditemukan', value: `${uniqueSpecies}/${totalSpecies}`, inline: true },
      { name: '💸 Total Coins Diperoleh', value: formatCoins(player.totalEarned), inline: true },
      {
        name: '🎣 Pancingan Aktif',
        value: `${rod.emoji} **${rod.name}**\n┗ Luck: +${rod.luckBonus}% | Cooldown: -${rod.cooldownReduction}s${rod.mutationMultiplier > 1 ? ` | Mutasi ×${rod.mutationMultiplier}` : ''} | Punya ${ownedRodCount} pancingan`,
        inline: false
      },
      {
        name: '🏆 Ikan Terlangka (Pernah Didapat)',
        value: rarest
          ? `${rarityEmoji} ${rarest.emoji} **${rarest.name}** (${rarest.rarity}) — ${formatChance(rarest.chance)}`
          : '❓ Belum pernah dapat ikan langka',
        inline: false
      },
      {
        name: '🥇 Ikan Terbanyak di Inventori',
        value: mostCaughtFish ? `${mostCaughtFish.emoji} **${mostCaughtFish.name}** ×${mostCaughtQty}` : '❓ Inventori kosong',
        inline: false
      }
    )
    .setFooter({ text: 'Gunakan /level untuk detail XP & reward | /fishindex untuk koleksi ikan' })
    .setTimestamp();

  await interaction.reply({ ephemeral: true, embeds: [embed] });
}
