import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllPlayers, getFishData } from '../utils/database.js';
import { getRarestFish, getRarityEmoji, formatCoins, formatNumber, formatGems } from '../utils/fishing.js';

export const data = new SlashCommandBuilder()
  .setName('fishleaderboard')
  .setDescription('🏆 Lihat leaderboard pemancing terbaik!')
  .addStringOption(opt =>
    opt.setName('kategori')
      .setDescription('Kategori leaderboard')
      .setRequired(false)
      .addChoices(
        { name: '🪙 Koin Terbanyak', value: 'coins' },
        { name: '🎣 Total Mancing', value: 'total' },
        { name: '📖 Spesies Terbanyak', value: 'species' }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const kategori = interaction.options.getString('kategori') || 'coins';
  const allPlayers = getAllPlayers();
  const { fish: fishList } = getFishData();

  const playerArray = Object.entries(allPlayers).map(([id, data]) => ({
    id,
    coins: data.coins || 0,
    totalFishCaught: data.totalFishCaught || 0,
    totalEarned: data.totalEarned || 0,
    inventory: data.inventory || {},
    discovered: Array.isArray(data.discovered) ? data.discovered : [],
    uniqueSpecies: Object.keys(data.inventory || {}).filter(fishId => (data.inventory[fishId] || 0) > 0).length
  }));

  let sorted, title, valueGetter;

  switch (kategori) {
    case 'total':
      sorted = playerArray.sort((a, b) => b.totalFishCaught - a.totalFishCaught);
      title = '🎣 Leaderboard — Total Mancing';
      valueGetter = p => `🎣 ${p.totalFishCaught.toLocaleString('id-ID')}x mancing`;
      break;
    case 'species':
      sorted = playerArray.sort((a, b) => b.uniqueSpecies - a.uniqueSpecies);
      title = '📖 Leaderboard — Spesies Terbanyak';
      valueGetter = p => `📖 ${p.uniqueSpecies} spesies`;
      break;
    default:
      sorted = playerArray.sort((a, b) => b.coins - a.coins);
      title = '🪙 Leaderboard — Koin Terbanyak';
      valueGetter = p => formatCoins(p.coins);
      break;
  }

  const top10 = sorted.slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];

  const lines = await Promise.all(top10.map(async (player, i) => {
    const medal = medals[i] || `**${i + 1}.**`;
    let username;
    try {
      const user = await interaction.client.users.fetch(player.id);
      username = user.username;
    } catch {
      username = `User ${player.id.slice(-4)}`;
    }
    const rarest = getRarestFish(player.discovered, fishList);
    const rarityInfo = rarest ? ` | ${getRarityEmoji(rarest.rarity)} ${rarest.name}` : '';
    return `${medal} **${username}** — ${valueGetter(player)}${rarityInfo}`;
  }));

  const userRank = sorted.findIndex(p => p.id === interaction.user.id);
  let userRankText = '';
  if (userRank !== -1) {
    userRankText = `\n\n👤 Rank kamu: **#${userRank + 1}** — ${valueGetter(sorted[userRank])}`;
  }

  const embed = new EmbedBuilder()
    .setColor('#f39c12')
    .setTitle(title)
    .setDescription((lines.join('\n') || 'Belum ada pemain!') + userRankText)
    .setFooter({ text: `Total pemain: ${playerArray.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
