import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getFishData, getMutationData } from '../utils/database.js';
import { formatCoins, formatNumber, formatGems, getRarityEmoji, parseInventoryKey, getFinalPrice } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('sellfish')
  .setDescription('💰 Jual ikan dari inventorimu!')
  .addSubcommand(sub => sub.setName('all').setDescription('Jual semua ikan di inventori (kecuali favorit)'))
  .addSubcommand(sub =>
    sub.setName('ikan')
      .setDescription('Jual ikan tertentu')
      .addStringOption(opt =>
        opt.setName('nama').setDescription('Nama atau ID ikan').setRequired(true).setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('jumlah').setDescription('Jumlah yang dijual (default: 1)').setMinValue(1).setRequired(false)
      )
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();
  const { mutations } = getMutationData();
  const favList = player.favoriteFish || [];
  const sub = interaction.options.getSubcommand();

  if (sub === 'all') {
    let totalCoins = 0;
    let soldItems = [];

    for (const [invKey, qty] of Object.entries(player.inventory)) {
      if (qty <= 0) continue;
      if (favList.includes(invKey) || favList.includes(invKey.split('__')[0])) continue;

      const { fishId, mutationId } = parseInventoryKey(invKey);
      const fish = fishList.find(f => f.id === fishId);
      if (!fish) continue;
      const mutation = mutationId ? mutations.find(m => m.id === mutationId) : null;
      const price = getFinalPrice(fish, mutation);
      const earned = price * qty;

      totalCoins += earned;
      soldItems.push({ fish, mutation, qty, earned });
      player.inventory[invKey] = 0;
    }

    if (soldItems.length === 0) {
      return interaction.reply({ ephemeral: true,
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Inventori Kosong').setDescription('Tidak ada ikan untuk dijual!')],
        ephemeral: true
      });
    }

    player.coins += totalCoins;
    player.totalEarned += totalCoins;
    savePlayer(userId, player);

    const displayItems = soldItems.slice(0, 10);
    const soldDescription = displayItems.map(({ fish, mutation, qty, earned }) => {
      const mutTag = mutation ? ` ${mutation.emoji}[${mutation.name}]` : '';
      return `${getRarityEmoji(fish.rarity)} ${fish.emoji} **${fish.name}**${mutTag} ×${qty} → 🪙 ${earned.toLocaleString('id-ID')}`;
    }).join('\n');
    const moreText = soldItems.length > 10 ? `\n...dan ${soldItems.length - 10} jenis lainnya` : '';

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('💰 Jual Semua Ikan')
      .setDescription(soldDescription + moreText)
      .addFields(
        { name: '📦 Total Dijual', value: `${soldItems.reduce((a, b) => a + b.qty, 0)} ikan`, inline: true },
        { name: '💵 Total Didapat', value: formatCoins(totalCoins), inline: true },
        { name: '🪙 Saldo Sekarang', value: formatCoins(player.coins), inline: true }
      )
      .setFooter({ text: '⭐ Ikan favorit tidak ikut terjual' })
      .setTimestamp();

    return interaction.reply({ ephemeral: true, embeds: [embed] });
  }

  if (sub === 'ikan') {
    const query = interaction.options.getString('nama').toLowerCase();
    const jumlah = interaction.options.getInteger('jumlah') || 1;

    // Find matching inventory key
    let matchKey = null;
    for (const invKey of Object.keys(player.inventory)) {
      const { fishId, mutationId } = parseInventoryKey(invKey);
      const fish = fishList.find(f => f.id === fishId);
      if (!fish) continue;
      if (invKey === query || fishId === query || fish.name.toLowerCase().includes(query)) {
        matchKey = invKey; break;
      }
    }

    if (!matchKey) {
      return interaction.reply({ ephemeral: true,
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Ikan Tidak Ditemukan').setDescription(`Ikan **${query}** tidak ada di inventori!`)],
        ephemeral: true
      });
    }

    const { fishId, mutationId } = parseInventoryKey(matchKey);
    const fish = fishList.find(f => f.id === fishId);
    const mutation = mutationId ? mutations.find(m => m.id === mutationId) : null;
    const owned = player.inventory[matchKey] || 0;

    if (owned <= 0) return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Punya Ikan Ini')], ephemeral: true });
    if (jumlah > owned) return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Jumlah Melebihi Stok').setDescription(`Kamu hanya punya **${owned}x**!`)], ephemeral: true });

    const price = getFinalPrice(fish, mutation);
    const earned = price * jumlah;
    player.inventory[matchKey] -= jumlah;
    player.coins += earned;
    player.totalEarned += earned;
    savePlayer(userId, player);

    const mutTag = mutation ? ` ${mutation.emoji} [${mutation.name}]` : '';
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('💰 Ikan Terjual!')
      .setDescription(`${getRarityEmoji(fish.rarity)} ${fish.emoji} **${fish.name}**${mutTag} ×${jumlah} terjual!`)
      .addFields(
        { name: '💵 Coins Didapat', value: formatCoins(earned), inline: true },
        { name: '📦 Sisa', value: `${player.inventory[matchKey]}x`, inline: true },
        { name: '🪙 Saldo', value: formatCoins(player.coins), inline: true }
      )
      .setTimestamp();

    return interaction.reply({ ephemeral: true, embeds: [embed] });
  }
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();
  const { mutations } = getMutationData();
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = [];
  for (const [invKey, qty] of Object.entries(player.inventory)) {
    if (qty <= 0) continue;
    const { fishId, mutationId } = parseInventoryKey(invKey);
    const fish = fishList.find(f => f.id === fishId);
    if (!fish) continue;
    const mutation = mutationId ? mutations.find(m => m.id === mutationId) : null;
    const label = mutation ? `${fish.emoji} ${fish.name} ${mutation.emoji}[${mutation.name}] (×${qty})` : `${fish.emoji} ${fish.name} (×${qty})`;
    if (fish.name.toLowerCase().includes(focused) || fish.id.includes(focused)) {
      choices.push({ name: label, value: invKey });
    }
  }
  await interaction.respond(choices.slice(0, 25));
}
