import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getZonaByChannel, getFishData } from '../utils/database.js';
import { getRarityEmoji, formatChance, RARITY_ORDER, formatNumber, formatGems } from '../utils/fishing.js';;
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('zonainfo')
  .setDescription('🗺️ Lihat info zona mancing di channel ini!');

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const zona = getZonaByChannel(interaction.channelId);

  if (!zona) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle('❌ Bukan Zona Mancing')
        .setDescription('Channel ini bukan zona mancing!\nMinta owner untuk mendaftarkan channel ini sebagai zona dengan `/adminfishing addzona`.')
      ],
      ephemeral: true
    });
  }

  const { fish: fishList } = getFishData();

  // Group zona fish by rarity
  const fishByRarity = {};
  for (const fishId of zona.fish) {
    const fish = fishList.find(f => f.id === fishId);
    if (!fish) continue;
    if (!fishByRarity[fish.rarity]) fishByRarity[fish.rarity] = [];
    fishByRarity[fish.rarity].push(fish);
  }

  // Build fish list sorted by rarity
  const fishLines = [];
  for (const rarity of RARITY_ORDER) {
    if (!fishByRarity[rarity]) continue;
    for (const fish of fishByRarity[rarity]) {
      fishLines.push(`${getRarityEmoji(rarity)} ${fish.emoji} **${fish.name}** — ${formatChance(fish.chance)} | 🪙 ${formatNumber(fish.price)}`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(zona.color || '#3498db')
    .setTitle(`${zona.emoji} Zona: ${zona.nama}`)
    .setDescription(zona.deskripsi)
    .addFields(
      { name: '🐟 Ikan Eksklusif Zona', value: fishLines.length > 0 ? fishLines.join('\n') : 'Belum ada ikan di zona ini!', inline: false },
      { name: '📊 Total Ikan', value: `${zona.fish.length} spesies`, inline: true },
      { name: '🆔 ID Zona', value: `\`${zona.id}\``, inline: true }
    )
    .setFooter({ text: 'Gunakan /mancing untuk memancing di zona ini!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
