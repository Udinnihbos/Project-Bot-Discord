import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { skip, getPlayerStatus } from '../music/player.js';
import { getGuildState } from '../music/state.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('⏭️ Skip lagu yang sedang diputar');

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  if (!status.connected) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Tidak ada lagu')], flags: MessageFlags.Ephemeral });
  }
  const state = getGuildState(interaction.guild.id);
  const current = state.currentSong;
  const ok = skip(interaction.guild.id);
  if (!ok) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Gagal skip')], flags: MessageFlags.Ephemeral });
  }
  const next = state.queue[0];
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('⏭️ Skipped')
      .setDescription(current ? `**${current.title}** dilewati.` : 'Lagu diskip.')
      .addFields(next ? [{ name: '▶️ Selanjutnya', value: `**${next.title}**`, inline: false }] : [])
    ],
  });
}
