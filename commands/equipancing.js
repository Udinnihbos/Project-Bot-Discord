import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getRodData } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('equipancing')
  .setDescription('🎣 Ganti pancingan yang sedang dipakai!')
  .addStringOption(opt =>
    opt.setName('pancingan')
      .setDescription('Pancingan yang ingin dipakai')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { rods } = getRodData();
  const query = interaction.options.getString('pancingan').toLowerCase();

  const rod = rods.find(r => r.id === query || r.name.toLowerCase().includes(query));

  if (!rod) {
    return interaction.reply({ ephemeral: true,
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Pancingan Tidak Ditemukan').setDescription(`Pancingan **${query}** tidak ditemukan!`)],
      ephemeral: true
    });
  }

  if (!(player.ownedRods || []).includes(rod.id)) {
    return interaction.reply({ ephemeral: true,
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Belum Dimiliki').setDescription(`Kamu belum punya **${rod.emoji} ${rod.name}**!\nBeli dulu di \`/rodshop\`.`)],
      ephemeral: true
    });
  }

  if (player.equippedRod === rod.id) {
    return interaction.reply({ ephemeral: true,
      embeds: [new EmbedBuilder().setColor('#f39c12').setTitle('⚠️ Sudah Dipakai').setDescription(`**${rod.emoji} ${rod.name}** sudah kamu pakai sekarang!`)],
      ephemeral: true
    });
  }

  const oldRod = rods.find(r => r.id === player.equippedRod);
  player.equippedRod = rod.id;
  savePlayer(userId, player);

  const embed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('🎣 Pancingan Diganti!')
    .setDescription(`Kamu sekarang memakai **${rod.emoji} ${rod.name}**!`)
    .addFields(
      { name: '📤 Sebelumnya', value: oldRod ? `${oldRod.emoji} ${oldRod.name}` : '❓ Tidak diketahui', inline: true },
      { name: '📥 Sekarang', value: `${rod.emoji} ${rod.name}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '⚡ Luck Bonus', value: `+${rod.luckBonus}%`, inline: true },
      { name: '⏱️ Cooldown', value: `-${rod.cooldownReduction}s`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ ephemeral: true, embeds: [embed] });
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { rods } = getRodData();
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = rods
    .filter(r => (player.ownedRods || ['pancing_bambu']).includes(r.id))
    .filter(r => r.name.toLowerCase().includes(focused) || r.id.includes(focused))
    .map(r => {
      const equipped = player.equippedRod === r.id ? ' ✅' : '';
      return { name: `${r.emoji} ${r.name}${equipped}`, value: r.id };
    });

  await interaction.respond(choices.slice(0, 25));
}
