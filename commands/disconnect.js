import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { stop, getPlayerStatus } from '../music/player.js';

export const data = new SlashCommandBuilder()
  .setName('disconnect')
  .setDescription('👋 Disconnect bot dari voice channel & clear queue (alias /stop)');

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  if (!status.connected) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Bot tidak di voice channel')],
      flags: MessageFlags.Ephemeral,
    });
  }
  stop(interaction.guild.id);
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('👋 Disconnected')
      .setDescription('Bot keluar dari voice channel dan queue dikosongkan.')],
  });
}
