import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, getPlayerLevel, getXpForNextLevel, getLevelData, getBaitData, getRodData } from '../utils/database.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('⬆️ Lihat level, XP, dan semua reward level kamu!')
  .addUserOption(opt => opt.setName('user').setDescription('Lihat level pemain lain').setRequired(false));

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const target = interaction.options.getUser('user') || interaction.user;
  const player = getPlayer(target.id);
  const { rewards, levelThresholds, xpPerRarity } = getLevelData();
  const { baits } = getBaitData();
  const { rods } = getRodData();

  const level = getPlayerLevel(player);
  const xp = player.xp || 0;
  const xpNext = getXpForNextLevel(player);
  const isMax = level >= 65;

  // XP bar
  let xpBar = '';
  if (!isMax && xpNext) {
    const xpCurrent = xp - (levelThresholds[level] || 0);
    const xpNeeded = xpNext - (levelThresholds[level] || 0);
    const progress = Math.min(Math.floor((xpCurrent / xpNeeded) * 20), 20);
    xpBar = `\`[${'█'.repeat(progress)}${'░'.repeat(20 - progress)}]\`\n${xpCurrent.toLocaleString('id-ID')} / ${xpNeeded.toLocaleString('id-ID')} XP ke level ${level + 1}`;
  } else {
    xpBar = `✨ **MAX LEVEL TERCAPAI!**\nTotal XP: ${xp.toLocaleString('id-ID')}`;
  }

  // Level color
  const levelColors = [[65,'#FFD700'],[60,'#1a1a2e'],[50,'#e74c3c'],[40,'#f39c12'],[30,'#9b59b6'],[20,'#3498db'],[10,'#2ecc71'],[0,'#95a5a6']];
  const color = (levelColors.find(([l]) => level >= l) || [0,'#95a5a6'])[1];

  // Build reward table
  const rewardLines = Object.entries(rewards).map(([lvl, r]) => {
    const lvlNum = parseInt(lvl);
    const isDone = level >= lvlNum;
    const isCurrent = !isDone && lvlNum <= level + 5;
    const prefix = isDone ? '✅' : isCurrent ? '🔜' : '🔒';

    const parts = [];
    if (r.coins) parts.push(`🪙 ${r.coins.toLocaleString('id-ID')}`);
    if (r.baitId && r.baitAmount) {
      const baitInfo = baits.find(b => b.id === r.baitId);
      parts.push(`${baitInfo?.emoji || '🪱'} ${r.baitAmount}x ${baitInfo?.name || r.baitId}`);
    }
    if (r.rodId) {
      const rodInfo = rods.find(ro => ro.id === r.rodId);
      parts.push(`🎣 **${rodInfo?.emoji || ''} ${rodInfo?.name || r.rodId}** (Luck +${rodInfo?.luckBonus || 0}%)`);
    }
    return `${prefix} **Lv.${lvl}** — ${parts.join(' + ')}`;
  });

  // XP per rarity info
  const xpInfo = Object.entries(xpPerRarity)
    .map(([r, x]) => `${r}: +${x} XP`)
    .join(' | ');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⬆️ Level — ${target.username}`)
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: `🏅 Level ${level}/65${isMax ? ' 🌟 MAX!' : ''}`, value: xpBar, inline: false },
      { name: '🎁 Semua Reward Level', value: rewardLines.join('\n'), inline: false },
      { name: '✨ XP per Rarity', value: `\`${xpInfo}\``, inline: false }
    )
    .setFooter({ text: '✅ Sudah diklaim | 🔜 Berikutnya | 🔒 Belum tercapai' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
