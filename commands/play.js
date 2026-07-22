import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { startPlayback, formatDuration, getPlayerStatus } from '../music/player.js';
import { getGuildState, patchGuildState } from '../music/state.js';
import { buildNowPlayingEmbed, buildNowPlayingRows, buildIdleEmbed } from '../music/ui.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('🎵 Putar lagu dari YouTube/Spotify, atau cari berdasarkan judul')
  .addStringOption(opt =>
    opt.setName('query')
      .setDescription('URL YouTube/Spotify, atau judul lagu')
      .setRequired(true)
  );

export async function execute(interaction) {
  const query = interaction.options.getString('query').trim();
  const voice = interaction.member?.voice?.channel;
  if (!voice) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Belum di Voice Channel').setDescription('Kamu harus join voice channel dulu!')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const perms = voice.permissionsFor(interaction.client.user);
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Permission Ditolak').setDescription('Bot tidak punya izin **Connect** / **Speak** di channel itu.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // First, defer so we have time to search
  await interaction.deferReply();

  const status = getPlayerStatus(interaction.guild.id);
  const isAlreadyPlaying = status.connected;

  try {
    // Update state with requester for Now Playing display
    const state = getGuildState(interaction.guild.id);
    state._requestedById = interaction.user.id;
    state.textChannelId = interaction.channelId;
    patchGuildState(interaction.guild.id, state);

    await startPlayback({
      guild: interaction.guild,
      voiceChannel: voice,
      textChannel: interaction.channel,
      initialQuery: query,
      requestedBy: `<@${interaction.user.id}>`,
    });

    // Show now playing panel
    const fresh = getGuildState(interaction.guild.id);
    if (fresh.currentSong) {
      const embed = buildNowPlayingEmbed(interaction.guild, fresh.currentSong, fresh);
      const rows = buildNowPlayingRows(interaction.guild.id);
      const msg = await interaction.editReply({ embeds: [embed], components: rows });
      // Save message id so we can update it on next song
      fresh.nowPlayingMessageId = msg.id;
      patchGuildState(interaction.guild.id, fresh);
    } else {
      // queue empty after add? show idle
      const added = fresh.queue.length;
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle('➕ Ditambahkan ke Antrian')
            .setDescription(`**${added}** lagu ditambahkan. Tapi belum ada yang mulai — coba lagi sebentar.`)
        ],
      });
    }
  } catch (err) {
    console.error('Play error:', err);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Gagal Memuat').setDescription(err.message?.slice(0, 300) || 'Error tidak diketahui.')],
    });
  }
}
