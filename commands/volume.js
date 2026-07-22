import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { setVolume, getPlayerStatus } from '../music/player.js';
import { getGuildState } from '../music/state.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('🔊 Atur volume playback (0-200, default 100)')
  .addIntegerOption(opt =>
    opt.setName('level')
      .setDescription('Volume level (0-200)')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(200)
  );

export async function execute(interaction) {
  const v = interaction.options.getInteger('level');
  const applied = setVolume(interaction.guild.id, v);
  const bar = (() => {
    const len = 20;
    const ratio = applied / 200;
    const filled = Math.round(ratio * len);
    return '`' + '▰'.repeat(filled) + '▱'.repeat(len - filled) + '`';
  })();
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle(`🔊 Volume: ${applied}%`)
      .setDescription(bar)
      .setFooter({ text: 'Range 0-200% (default 100%)' })
      .setTimestamp()],
  });
}
