import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getBaitData } from '../utils/database.js';
import { formatNumber } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('buybait')
  .setDescription('🛒 Beli umpan pancing!')
  .addStringOption(opt =>
    opt.setName('umpan').setDescription('Umpan yang ingin dibeli').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption(opt =>
    opt.setName('jumlah').setDescription('Jumlah yang dibeli (default: 1)').setMinValue(1).setMaxValue(99).setRequired(false)
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { baits } = getBaitData();
  const query = interaction.options.getString('umpan').toLowerCase();
  const jumlah = interaction.options.getInteger('jumlah') || 1;

  const bait = baits.find(b => b.id === query || b.name.toLowerCase().includes(query));
  if (!bait) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Umpan Tidak Ditemukan')], ephemeral: true });

  const totalPrice = bait.price * jumlah;
  if (player.coins < totalPrice) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Coins Tidak Cukup')
        .setDescription(`Butuh 🪙 **${formatNumber(totalPrice)}** untuk beli **${jumlah}x ${bait.name}**!\nCoins kamu: 🪙 ${formatNumber(player.coins)}`)],
      ephemeral: true
    });
  }

  player.coins -= totalPrice;
  if (!player.baitInventory) player.baitInventory = {};
  if (!player.baitInventory[bait.id]) player.baitInventory[bait.id] = 0;
  player.baitInventory[bait.id] += jumlah;
  savePlayer(userId, player);

  const embed = new EmbedBuilder()
    .setColor('#8B4513')
    .setTitle('✅ Umpan Dibeli!')
    .setDescription(`${bait.emoji} **${bait.name}** ×${jumlah} berhasil dibeli!`)
    .addFields(
      { name: '💸 Dibayar', value: `🪙 ${formatNumber(totalPrice)}`, inline: true },
      { name: '🪙 Sisa Coins', value: `🪙 ${formatNumber(player.coins)}`, inline: true },
      { name: '📦 Total Punya', value: `${player.baitInventory[bait.id]}x`, inline: true }
    )
    .setFooter({ text: 'Gunakan /usebait sebelum /mancing!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function autocomplete(interaction) {
  const { baits } = getBaitData();
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = baits
    .filter(b => b.name.toLowerCase().includes(focused) || b.id.includes(focused))
    .map(b => ({ name: `${b.emoji} ${b.name} — 🪙 ${formatNumber(b.price)}`, value: b.id }));
  await interaction.respond(choices.slice(0, 25));
}
