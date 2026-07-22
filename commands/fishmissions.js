import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getMissionData, checkAndResetMissions } from '../utils/database.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('fishmissions')
  .setDescription('📋 Lihat dan klaim misi harian kamu!')
  .addSubcommand(sub => sub.setName('list').setDescription('Lihat semua misi harian'))
  .addSubcommand(sub => sub.setName('claim').setDescription('Klaim semua misi yang sudah selesai'));

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  let player = getPlayer(userId);
  player = checkAndResetMissions(player);
  const sub = interaction.options.getSubcommand();
  const missionData = getMissionData();
  const activeMissions = missionData.missions.filter(m => m.active);

  if (sub === 'list') {
    const lines = activeMissions.map(mission => {
      const progress = player.dailyMissions.progress[mission.id] || 0;
      const claimed = player.dailyMissions.claimed.includes(mission.id);
      const done = progress >= mission.target;
      const bar = buildBar(progress, mission.target);
      const status = claimed ? '✅ Diklaim' : done ? '🎁 Selesai! Gunakan `/fishmissions claim`' : `${bar} ${progress}/${mission.target}`;
      return `${mission.emoji} **${mission.name}**\n┗ ${mission.description}\n┗ 💎 ${mission.reward} Gems | ${status}`;
    });

    const claimable = activeMissions
      .filter(m => !player.dailyMissions.claimed.includes(m.id) && (player.dailyMissions.progress[m.id] || 0) >= m.target)
      .reduce((a, m) => a + m.reward, 0);

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('📋 Misi Harian')
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: '💎 Gems Kamu', value: `${player.gems} Gems`, inline: true },
        { name: '🎁 Siap Diklaim', value: `${claimable} Gems`, inline: true }
      )
      .setFooter({ text: 'Reset setiap hari tengah malam!' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'claim') {
    let totalClaimed = 0;
    const claimedNames = [];

    for (const mission of activeMissions) {
      if (player.dailyMissions.claimed.includes(mission.id)) continue;
      const progress = player.dailyMissions.progress[mission.id] || 0;
      if (progress < mission.target) continue;

      player.gems += mission.reward;
      player.dailyMissions.claimed.push(mission.id);
      totalClaimed += mission.reward;
      claimedNames.push(`${mission.emoji} **${mission.name}** → +${mission.reward} 💎`);
    }

    if (totalClaimed === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Ada yang Bisa Diklaim').setDescription('Belum ada misi yang selesai atau sudah semua diklaim!')],
        ephemeral: true
      });
    }

    savePlayer(userId, player);

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('💎 Reward Diklaim!')
      .setDescription(claimedNames.join('\n'))
      .addFields(
        { name: '💎 Total Didapat', value: `+${totalClaimed} Gems`, inline: true },
        { name: '💎 Gems Sekarang', value: `${player.gems} Gems`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
}

function buildBar(current, target) {
  const pct = Math.min(current / target, 1);
  const filled = Math.round(pct * 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
}
