import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getRodData } from '../utils/database.js';
import { formatCoins, formatNumber, formatGems } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('buypancing')
  .setDescription('🛒 Beli pancingan dari toko!')
  .addStringOption(opt =>
    opt.setName('pancingan')
      .setDescription('Pancingan yang ingin dibeli')
      .setRequired(true)
      .setAutocomplete(true)
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { rods } = getRodData();
  const query = interaction.options.getString('pancingan').toLowerCase();

  const rod = rods.find(r => r.id === query || r.name.toLowerCase().includes(query));

  if (!rod) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Pancingan Tidak Ditemukan').setDescription(`Pancingan **${query}** tidak ada di toko!`)],
      ephemeral: true
    });
  }

  // Block level reward rods
  if (rod.isLevelReward) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Bisa Dibeli')
        .setDescription(`${rod.emoji} **${rod.name}** adalah rod **hadiah level** dan tidak bisa dibeli!\nNaikkan levelmu untuk mendapatkannya 🎁`)],
      ephemeral: true
    });
  }

  if ((player.ownedRods || []).includes(rod.id)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Sudah Dimiliki').setDescription(`Kamu sudah punya **${rod.emoji} ${rod.name}**!\nGunakan \`/equipancing\` untuk memakainya.`)],
      ephemeral: true
    });
  }

  if (rod.price === 0) {
    if (!player.ownedRods) player.ownedRods = [];
    player.ownedRods.push(rod.id);
    savePlayer(userId, player);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Pancingan Didapat!').setDescription(`Kamu mendapatkan **${rod.emoji} ${rod.name}** secara gratis!`)],
      ephemeral: true
    });
  }

  if (player.coins < rod.price) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Coins Tidak Cukup')
        .setDescription(`Kamu butuh 🪙 **${formatNumber(rod.price)}** Coins!\nCoins kamu: ${formatCoins(player.coins)}`)],
      ephemeral: true
    });
  }

  player.coins -= rod.price;
  if (!player.ownedRods) player.ownedRods = ['pancing_bambu'];
  player.ownedRods.push(rod.id);
  savePlayer(userId, player);

  const mutTag = rod.mutationMultiplier && rod.mutationMultiplier > 1 ? `\n⚡ Mutasi Mult: ×${rod.mutationMultiplier}` : '';

  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('✅ Pancingan Berhasil Dibeli!')
    .setDescription(`${rod.emoji} **${rod.name}** kini milikmu!`)
    .addFields(
      { name: '💸 Dibayar', value: formatCoins(rod.price), inline: true },
      { name: '🪙 Sisa Coins', value: formatCoins(player.coins), inline: true },
      { name: '⚡ Luck Bonus', value: `+${rod.luckBonus}%`, inline: true },
      { name: '⏱️ Cooldown', value: `-${rod.cooldownReduction}s`, inline: true }
    )
    .setDescription(`${rod.emoji} **${rod.name}** kini milikmu!${mutTag}`)
    .setFooter({ text: 'Gunakan /equipancing untuk memakai!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { rods } = getRodData();
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = rods
    .filter(r => !r.isLevelReward) // hide level reward rods
    .filter(r => !((player.ownedRods || []).includes(r.id)))
    .filter(r => r.name.toLowerCase().includes(focused) || r.id.includes(focused))
    .map(r => ({ name: `${r.emoji} ${r.name} — 🪙 ${formatNumber(r.price)}`, value: r.id }));

  await interaction.respond(choices.slice(0, 25));
}
