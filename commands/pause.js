import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pause, resume, isPaused, getPlayerStatus } from '../music/player.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('⏸️ Pause / ▶️ Resume playback')
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Pause atau resume')
      .setRequired(false)
      .addChoices(
        { name: '⏸️ Pause', value: 'pause' },
        { name: '▶️ Resume', value: 'resume' },
        { name: '🔄 Toggle', value: 'toggle' },
      )
  );

export async function execute(interaction) {
  const status = getPlayerStatus(interaction.guild.id);
  if (!status.connected) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Tidak ada playback aktif')], flags: MessageFlags.Ephemeral });
  }
  const mode = interaction.options.getString('mode')
    || (isPaused(interaction.guild.id) ? 'resume' : 'pause');

  let ok = false, label = '';
  if (mode === 'pause') { ok = pause(interaction.guild.id); label = '⏸️ Paused'; }
  else if (mode === 'resume') { ok = resume(interaction.guild.id); label = '▶️ Resumed'; }
  else { ok = isPaused(interaction.guild.id) ? resume(interaction.guild.id) : pause(interaction.guild.id); label = isPaused(interaction.guild.id) ? '▶️ Resumed' : '⏸️ Paused'; }

  if (!ok) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Tidak bisa ubah state')], flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle(label).setTimestamp()] });
}
