import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { shuffle, getPlayerStatus } from '../music/player.js';
import { getGuildState } from '../music/state.js';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('🔀 Acak urutan antrian');

export async function execute(interaction) {
  const state = getGuildState(interaction.guild.id);
  if (state.queue.length < 2) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Queue terlalu sedikit').setDescription('Butuh minimal 2 lagu untuk di-shuffle.')], flags: MessageFlags.Ephemeral });
  }
  const ok = shuffle(interaction.guild.id);
  if (!ok) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Gagal shuffle')], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('🔀 Diacak!').setDescription(`**${state.queue.length}** lagu di antrian diacak ulang.`).setTimestamp()] });
}
