import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getBaitData } from '../utils/database.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('usebait')
  .setDescription('🪱 Pasang umpan untuk mancing berikutnya!')
  .addStringOption(opt =>
    opt.setName('umpan').setDescription('Umpan yang ingin dipakai').setRequired(true).setAutocomplete(true)
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

  const bait = baits.find(b => b.id === query || b.name.toLowerCase().includes(query));
  if (!bait) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Umpan Tidak Ditemukan')], ephemeral: true });

  const owned = player.baitInventory?.[bait.id] || 0;
  if (owned <= 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Umpan Habis')
        .setDescription(`Kamu tidak punya **${bait.name}**!\nBeli dulu di \`/buybait\`.`)],
      ephemeral: true
    });
  }

  // Set active bait
  player.activeBait = bait.id;
  savePlayer(userId, player);

  const effects = [];
  if (bait.luckBonus > 0) effects.push(`+${bait.luckBonus}% luck`);
  if (bait.rarityBoost) {
    const boosted = Object.entries(bait.rarityBoost).map(([r, v]) => `${r} ×${v}`).join(', ');
    effects.push(boosted);
  }

  const embed = new EmbedBuilder()
    .setColor('#8B4513')
    .setTitle('🪱 Umpan Dipasang!')
    .setDescription(`${bait.emoji} **${bait.name}** siap dipakai untuk mancing berikutnya!\nUmpan akan otomatis terpakai saat kamu \`/mancing\`.`)
    .addFields(
      { name: '⚡ Efek', value: effects.join('\n') || 'Tidak ada', inline: true },
      { name: '📦 Sisa', value: `${owned}x (setelah dipakai: ${owned - 1}x)`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { baits } = getBaitData();
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = baits
    .filter(b => (player.baitInventory?.[b.id] || 0) > 0)
    .filter(b => b.name.toLowerCase().includes(focused) || b.id.includes(focused))
    .map(b => ({ name: `${b.emoji} ${b.name} (${player.baitInventory[b.id]}x)`, value: b.id }));

  await interaction.respond(choices.slice(0, 25));
}
