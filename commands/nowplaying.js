import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildState } from '../music/state.js';
import { getPlayerStatus } from '../music/player.js';
import { buildNowPlayingEmbed, buildNowPlayingRows, buildIdleEmbed } from '../music/ui.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('🎵 Lihat lagu yang sedang diputar')
  .addStringOption(opt =>
    opt.setName('ephemeral')
      .setDescription('Tampilkan hanya untuk kamu?')
      .setRequired(false)
      .addChoices(
        { name: 'Hanya saya', value: 'true' },
        { name: 'Untuk semua', value: 'false' },
      )
  );

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  if (!status.connected) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('💤 Idle').setDescription('Bot tidak sedang memutar apa-apa.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  const state = getGuildState(interaction.guild.id);
  if (!state.currentSong) {
    return interaction.reply({ embeds: [buildIdleEmbed(interaction.guild)], flags: MessageFlags.Ephemeral });
  }
  const embed = buildNowPlayingEmbed(interaction.guild, state.currentSong, state);
  const rows = buildNowPlayingRows(interaction.guild.id);
  const ephemeral = interaction.options.getString('ephemeral') === 'true';
  return interaction.reply({ embeds: [embed], components: rows, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}
