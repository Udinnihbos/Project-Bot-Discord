import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { stop, getPlayerStatus } from '../music/player.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('⏹️ Hentikan playback & kosongkan queue');

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  if (!status.connected) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Bot tidak sedang memutar')], flags: MessageFlags.Ephemeral });
  }
  stop(interaction.guild.id);
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⏹️ Dihentikan').setDescription('Playback dihentikan dan queue dikosongkan.')] });
}
