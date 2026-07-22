import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getFishData } from '../utils/database.js';
import { getRarityEmoji } from '../utils/fishing.js';

export const data = new SlashCommandBuilder()
  .setName('addfishfav')
  .setDescription('⭐ Tambah atau hapus ikan dari favorit (tidak akan terjual di /sellfish all)')
  .addStringOption(opt =>
    opt.setName('ikan')
      .setDescription('Nama atau ID ikan')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();
  const query = interaction.options.getString('ikan').toLowerCase();

  const fish = fishList.find(f => f.id === query || f.name.toLowerCase().includes(query));
  if (!fish) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Ikan Tidak Ditemukan').setDescription(`Ikan **${query}** tidak ditemukan!`)],
      ephemeral: true
    });
  }

  if (!player.favoriteFish) player.favoriteFish = [];

  const isFav = player.favoriteFish.includes(fish.id);

  if (isFav) {
    // Remove from favorites
    player.favoriteFish = player.favoriteFish.filter(id => id !== fish.id);
    savePlayer(userId, player);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#95a5a6')
          .setTitle('💔 Dihapus dari Favorit')
          .setDescription(`${getRarityEmoji(fish.rarity)} ${fish.emoji} **${fish.name}** dihapus dari favorit.\nIkan ini sekarang akan ikut terjual di \`/sellfish all\`.`)
      ],
      ephemeral: true
    });
  } else {
    // Add to favorites
    player.favoriteFish.push(fish.id);
    savePlayer(userId, player);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#f1c40f')
          .setTitle('⭐ Ditambahkan ke Favorit!')
          .setDescription(`${getRarityEmoji(fish.rarity)} ${fish.emoji} **${fish.name}** ditambahkan ke favorit!\nIkan ini **tidak akan terjual** saat \`/sellfish all\`.`)
          .addFields({ name: '⭐ Total Favorit', value: `${player.favoriteFish.length} ikan`, inline: true })
      ],
      ephemeral: true
    });
  }
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();
  const focused = interaction.options.getFocused().toLowerCase();

  // Show fish that player has discovered
  const choices = fishList
    .filter(f => player.discovered?.includes(f.id))
    .filter(f => f.name.toLowerCase().includes(focused) || f.id.includes(focused))
    .map(f => {
      const isFav = (player.favoriteFish || []).includes(f.id);
      // Jumlahkan semua key inventory yang match (termasuk mutasi, contoh: ikan_kakap__toxic)
      const qty = Object.entries(player.inventory || {})
        .filter(([key]) => key === f.id || key.startsWith(f.id + '__'))
        .reduce((sum, [, val]) => sum + val, 0);
      return { name: `${isFav ? '⭐ ' : ''}${f.emoji} ${f.name} (×${qty})`, value: f.id };
    });

  await interaction.respond(choices.slice(0, 25));
}
