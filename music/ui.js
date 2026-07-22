import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildState } from './state.js';
import { formatDuration, isPaused } from './player.js';

const ACCENT = 0x1DB954; // Spotify green
const MUTED  = 0x95a5a6;
const WARN   = 0xf39c12;

function progressBar(current, total, length = 18) {
  if (!total || total <= 0) return '`▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬` 🎶';
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * length);
  return '`' + '▬'.repeat(filled) + '🔘' + '▬'.repeat(length - filled) + '`';
}

export function buildNowPlayingEmbed(guild, song, state) {
  const paused = isPaused(guild.id);
  const loopLabel = state.loop === 'song' ? '🔂 Lagu' : state.loop === 'queue' ? '🔁 Queue' : '➡️ Off';

  const embed = new EmbedBuilder()
    .setColor(paused ? WARN : ACCENT)
    .setAuthor({ name: `${guild.name} • Now Playing`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${paused ? '⏸️' : '🎵'} ${song.title}`)
    .setURL(song.url)
    .setDescription(
      [
        progressBar(0, song.duration),
        `\`0:00 / ${formatDuration(song.duration)}\``,
        '',
        `> 🎤 **Requester:** <@${state._requestedById || 'unknown'}>`,
        `> 📡 **Source:** ${song.source === 'spotify' ? 'Spotify (via YouTube)' : 'YouTube'}`,
      ].join('\n')
    )
    .addFields(
      { name: '🔁 Loop', value: loopLabel, inline: true },
      { name: '🔊 Volume', value: `${state.volume}%`, inline: true },
      { name: '📋 Queue', value: `${state.queue.length} lagu`, inline: true },
    )
    .setFooter({ text: '🎶 Music Player • Gunakan tombol di bawah untuk kontrol' })
    .setTimestamp();

  if (song.thumbnail) embed.setThumbnail(song.thumbnail);
  return embed;
}

export function buildIdleEmbed(guild) {
  return new EmbedBuilder()
    .setColor(MUTED)
    .setAuthor({ name: `${guild.name} • Now Playing`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle('💤 Tidak ada lagu')
    .setDescription('Queue kosong. Gunakan `/play` untuk menambahkan lagu!')
    .setFooter({ text: '🎶 Music Player' })
    .setTimestamp();
}

export function buildNowPlayingRows(guildId, { is247 = false } = {}) {
  const state = getGuildState(guildId);
  const paused = isPaused(guildId);
  const hasCurrent = !!state.currentSong;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`music_pause:${paused ? 'resume' : 'pause'}`)
        .setEmoji(paused ? '▶️' : '⏸️')
        .setLabel(paused ? 'Resume' : 'Pause')
        .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setEmoji('⏭️')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setEmoji('⏹️')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId(`music_loop:${state.loop}`)
        .setEmoji('🔁')
        .setLabel(state.loop === 'off' ? 'Loop: Off' : state.loop === 'song' ? 'Loop: Lagu' : 'Loop: Queue')
        .setStyle(state.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_shuffle')
        .setEmoji('🔀')
        .setLabel('Shuffle')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.queue.length < 2),
      new ButtonBuilder()
        .setCustomId('music_queue')
        .setEmoji('📜')
        .setLabel('Queue')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_voldown')
        .setEmoji('🔉')
        .setLabel('-10')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId('music_volup')
        .setEmoji('🔊')
        .setLabel('+10')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasCurrent),
    ),
  ];
}

export function buildQueueEmbed(guild, state, page = 0, pageSize = 10) {
  const total = state.queue.length;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  page = Math.max(0, Math.min(maxPage, page));
  const start = page * pageSize;
  const slice = state.queue.slice(start, start + pageSize);

  const lines = [];
  if (state.currentSong) {
    lines.push(`▶️ **[${state.currentSong.title}](${state.currentSong.url})** — \`${formatDuration(state.currentSong.duration)}\` — <@${state._requestedById || '?'}>`);
  } else {
    lines.push('*Tidak ada lagu yang sedang diputar*');
  }
  if (slice.length) {
    slice.forEach((s, i) => {
      lines.push(`\`${start + i + 1}.\` **[${s.title}](${s.url})** — \`${formatDuration(s.duration)}\``);
    });
  }

  if (total > pageSize) {
    lines.push(`\n*Halaman ${page + 1}/${maxPage + 1} • ${total} lagu dalam antrian*`);
  } else if (total) {
    lines.push(`\n*${total} lagu dalam antrian*`);
  }

  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: `${guild.name} • Queue`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`📋 Antrian Lagu`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: '🎶 Music Player' })
    .setTimestamp();
}
