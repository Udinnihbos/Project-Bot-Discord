import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getMusicConfig, patchMusicConfig } from '../music/config.js';

export const data = new SlashCommandBuilder()
  .setName('247')
  .setDescription('🕐 Toggle mode 24/7 — bot tetap di voice walau queue kosong');

export async function execute(interaction) {
  const cfg = getMusicConfig(interaction.guild.id);
  cfg['247'] = !cfg['247'];
  patchMusicConfig(interaction.guild.id, { '247': cfg['247'] });

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(cfg['247'] ? 0x1DB954 : 0x95a5a6)
      .setTitle(cfg['247'] ? '🕐 24/7 Mode: ON' : '🕐 24/7 Mode: OFF')
      .setDescription(
        cfg['247']
          ? 'Bot sekarang **tetap di voice channel** 24/7, walau queue kosong.\nBerguna untuk radio-style server atau saat kamu mau AFK sambil dengerin musik.'
          : 'Bot akan **leave voice channel** saat queue kosong (sesuai setting auto-leave).'
      )
      .setFooter({ text: 'Tip: Set DJ role via /settings → DJ Role agar hanya role tertentu yang bisa pakai command music' })
      .setTimestamp()],
  });
}
