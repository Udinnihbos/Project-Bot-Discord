import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getGuildState } from '../music/state.js';
import { getPlayerStatus } from '../music/player.js';
import { buildQueueEmbed } from '../music/ui.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('📋 Lihat antrian lagu');

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  const state = getGuildState(interaction.guild.id);
  if (!status.connected && !state.queue.length && !state.currentSong) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('📋 Queue kosong').setDescription('Gunakan `/play` untuk menambah.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  const embed = buildQueueEmbed(interaction.guild, state, 0, PAGE_SIZE);

  const total = state.queue.length;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const rows = [];
  if (maxPage > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_queue_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('music_queue_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(false),
    ));
  }
  return interaction.reply({ embeds: [embed], components: rows });
}
