import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { setLoop, getPlayerStatus } from '../music/player.js';
import { getGuildState } from '../music/state.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('🔁 Set mode loop (off / song / queue)')
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Mode loop')
      .setRequired(true)
      .addChoices(
        { name: '➡️ Off — tidak ada loop', value: 'off' },
        { name: '🔂 Lagu — ulang lagu sekarang', value: 'song' },
        { name: '🔁 Queue — ulang seluruh antrian', value: 'queue' },
      )
  );

export async function execute(interaction) {
  const mode = interaction.options.getString('mode');
  setLoop(interaction.guild.id, mode);
  const labels = { off: '➡️ Off', song: '🔂 Lagu', queue: '🔁 Queue' };
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle(`🔁 Loop: ${labels[mode]}`)
      .setDescription(mode === 'off' ? 'Loop dimatikan.' : mode === 'song' ? 'Lagu sekarang akan diulang terus.' : 'Setelah queue habis, akan diulang dari awal.')
      .setTimestamp()],
  });
}
