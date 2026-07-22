import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const ACCENT = '#5865F2';
export const SUCCESS = '#2ecc71';
export const DANGER = '#e74c3c';
export const WARN = '#f39c12';
export const MUTED = '#95a5a6';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];
const RANK_BAR = '▰';

function formatRelativeTime(ms) {
  if (!ms) return 'Belum pernah';
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} bulan lalu`;
  const yr = Math.floor(day / 365);
  return `${yr} tahun lalu`;
}

function formatDate(ms) {
  if (!ms) return 'Tidak diketahui';
  return `<t:${Math.floor(ms / 1000)}:D>`;
}

export function buildActivityProfile({ guild, targetUser, member, rank, totalMembers }) {
  const total = member?.totalMessages || 0;
  const lastActive = member?.lastActive || 0;
  const joined = member?.joinedServer || 0;
  const channelMessages = member?.channelMessages || {};

  const topChannels = Object.entries(channelMessages)
    .map(([cid, count]) => ({ id: cid, count }))
    .sort((a, b) => b.count - a.count);

  const favorite = topChannels[0];
  const top5 = topChannels.slice(0, 5);

  const rankText = rank === null
    ? '🚫 Tidak ada data'
    : `🏅 **#${rank}** / ${totalMembers}`;

  // Progress bar vs top channel
  const bar = (() => {
    if (!favorite || favorite.count === 0) return null;
    const filled = 14;
    return RANK_BAR.repeat(filled) + ' ' + favorite.count.toLocaleString('id-ID') + ' msg';
  })();

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Activity Profile`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle(`📊 ${targetUser.username}`)
    .setDescription(
      [
        `> Pantauan aktivitas chat member di server **${guild.name}**.`,
        `> Total member terdaftar: **${totalMembers}** orang.`,
      ].join('\n')
    )
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      {
        name: '💬 Total Messages',
        value: `**${total.toLocaleString('id-ID')}** pesan`,
        inline: true,
      },
      {
        name: '⏱️ Last Active',
        value: `${formatRelativeTime(lastActive)}\n${formatDate(lastActive)}`,
        inline: true,
      },
      {
        name: '📅 Joined Server',
        value: `${formatDate(joined)}`,
        inline: true,
      },
      {
        name: '🏆 Activity Rank',
        value: rankText,
        inline: true,
      },
      {
        name: '⭐ Favorite Channel',
        value: favorite
          ? `${favorite.count >= top5[1]?.count || 0 ? '👑' : '✨'} <#${favorite.id}> — **${favorite.count.toLocaleString('id-ID')}** pesan`
          : '*Belum ada aktivitas*',
        inline: true,
      },
      {
        name: '📡 Total Channel Aktif',
        value: `${topChannels.length} channel`,
        inline: true,
      },
      {
        name: '🔥 Top 5 Most Active Channels',
        value: top5.length
          ? top5
              .map((c, i) => {
                const medal = RANK_MEDALS[i] || `\`#${i + 1}\``;
                return `${medal} <#${c.id}> — **${c.count.toLocaleString('id-ID')}** pesan`;
              })
              .join('\n')
          : '*Belum ada pesan tercatat*',
        inline: false,
      },
    )
    .setFooter({ text: 'Activity Tracker • Data diperbarui实时 (real-time)' })
    .setTimestamp();

  if (bar) embed.spliceFields(4, 1, {
    name: '⭐ Favorite Channel',
    value: `👑 <#${favorite.id}> — **${favorite.count.toLocaleString('id-ID')}** pesan\n${bar}`,
    inline: true,
  });

  return embed;
}

export function buildLeaderboardEmbed({ guild, rows, page, pageSize }) {
  const start = page * pageSize;
  const end = start + pageSize;
  const slice = rows.slice(start, end);

  const total = rows.reduce((s, r) => s + (r.totalMessages || 0), 0);

  const lines = slice.length
    ? slice
        .map((r, i) => {
          const rank = start + i + 1;
          const medal = RANK_MEDALS[rank - 1] || `\`#${rank}\``;
          const last = formatRelativeTime(r.lastActive);
          return `${medal} <@${r.id}> — **${(r.totalMessages || 0).toLocaleString('id-ID')}** pesan  •  \`${last}\``;
        })
        .join('\n')
    : '*Belum ada data aktivitas.*';

  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Activity Leaderboard`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle('🏆 Chat Leaderboard')
    .setDescription(lines)
    .addFields(
      { name: '👥 Member Terdata', value: `${rows.length} orang`, inline: true },
      { name: '💬 Total Pesan', value: `${total.toLocaleString('id-ID')} pesan`, inline: true },
      { name: '📄 Halaman', value: `${page + 1} / ${maxPage + 1}`, inline: true },
    )
    .setFooter({ text: 'Activity Tracker • Gunakan /activity profile untuk detail' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('act_lb_prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('act_lb_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage),
    new ButtonBuilder()
      .setCustomId('act_lb_refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, components: [row] };
}
