import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import {
  getGuildState, patchGuildState,
} from '../music/state.js';
import {
  getPlayerStatus, removeFromQueue, moveInQueue, clearQueue,
  jumpTo, seek, parsePosition, formatDuration,
} from '../music/player.js';
import { getMusicConfig } from '../music/config.js';
import { fetchLyrics } from '../music/lyrics.js';
import {
  getFavorites, isFavorite, addFavorite, removeFavorite, clearFavorites, MAX_FAVORITES,
} from '../music/favorites.js';
import {
  startVote, castVote, getVote, endVote, countHumanListeners, votePassed,
} from '../music/skipvote.js';

const ACCENT = 0x1DB954;
const SUCCESS = 0x2ecc71;
const DANGER = 0xe74c3c;
const WARN = 0xf39c12;
const MUTED = 0x95a5a6;

function hasDJPerm(interaction) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  const cfg = getMusicConfig(interaction.guild.id);
  if (cfg.djRoleId && interaction.member?.roles?.cache?.has(cfg.djRoleId)) return true;
  return false;
}

function denyEmbed(interaction) {
  return new EmbedBuilder()
    .setColor(DANGER)
    .setTitle('🔒 Tidak Punya Akses')
    .setDescription('Cuma Server Owner, Admin, atau user dengan **DJ Role** yang bisa pakai command ini.');
}

// ════════════════════════════════════════
// Slash Command Builder
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('mextra')
  .setDescription('🎵 Music extra commands (seek, jump, lyrics, favorite, skipvote)')
  .addSubcommand(sub => sub.setName('seek').setDescription('⏩ Lompat ke posisi tertentu di lagu sekarang')
    .addStringOption(opt => opt.setName('position').setDescription('Posisi (contoh: 1:30, 90, 1m30s)').setRequired(true)))
  .addSubcommand(sub => sub.setName('remove').setDescription('➖ Hapus lagu dari antrian (berdasarkan nomor)')
    .addIntegerOption(opt => opt.setName('index').setDescription('Nomor lagu (lihat di /queue)').setRequired(true).setMinValue(1)))
  .addSubcommand(sub => sub.setName('move').setDescription('↕️ Pindahkan posisi lagu di antrian')
    .addIntegerOption(opt => opt.setName('from').setDescription('Posisi asal').setRequired(true).setMinValue(1))
    .addIntegerOption(opt => opt.setName('to').setDescription('Posisi tujuan').setRequired(true).setMinValue(1)))
  .addSubcommand(sub => sub.setName('clearqueue').setDescription('🧹 Kosongkan antrian (lagu yang sedang diputar tetap)'))
  .addSubcommand(sub => sub.setName('jump').setDescription('⤴️ Lompat ke lagu ke-N di antrian')
    .addIntegerOption(opt => opt.setName('index').setDescription('Nomor lagu').setRequired(true).setMinValue(1)))
  .addSubcommand(sub => sub.setName('lyrics').setDescription('📝 Tampilkan lirik lagu')
    .addStringOption(opt => opt.setName('query').setDescription('Judul lagu (kosongkan = lagu yang sedang diputar)').setRequired(false)))
  .addSubcommand(sub => sub.setName('favorite')
    .setDescription('⭐ Kelola lagu favorit kamu')
    .addStringOption(opt => opt.setName('action')
      .setDescription('Aksi').setRequired(true)
      .addChoices(
        { name: '➕ Add (lagu yang sedang diputar)', value: 'add' },
        { name: '➖ Remove (by URL)', value: 'remove' },
        { name: '📋 List', value: 'list' },
        { name: '🗑️ Clear all', value: 'clear' },
        { name: '▶️ Play favorites', value: 'play' },
      ))
    .addStringOption(opt => opt.setName('url').setDescription('URL lagu (untuk remove)').setRequired(false)))
  .addSubcommand(sub => sub.setName('skipvote').setDescription('🗳️ Vote untuk skip lagu (mayoritas user di VC)'));

// ════════════════════════════════════════
// Execute
// ════════════════════════════════════════

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    // ── SEEK ──
    if (sub === 'seek') {
      if (!hasDJPerm(interaction)) {
        return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
      }
      const pos = parsePosition(interaction.options.getString('position'));
      if (pos == null) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Format posisi salah').setDescription('Gunakan: `90` (detik), `1:30`, atau `1m30s`')], flags: MessageFlags.Ephemeral });
      }
      const result = await seek(interaction.guild.id, pos);
      if (!result.ok) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Seek Gagal').setDescription(result.reason)], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⏩ Seek Berhasil').setDescription(`Lompat ke posisi **${formatDuration(result.position)}**.`).setTimestamp()] });
    }

    // ── REMOVE ──
    if (sub === 'remove') {
      if (!hasDJPerm(interaction)) {
        return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
      }
      const idx = interaction.options.getInteger('index') - 1;
      const removed = removeFromQueue(interaction.guild.id, idx);
      if (!removed) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Index tidak valid')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('➖ Dihapus dari Antrian').setDescription(`**${removed.title}** dihapus.`)] });
    }

    // ── MOVE ──
    if (sub === 'move') {
      if (!hasDJPerm(interaction)) {
        return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
      }
      const from = interaction.options.getInteger('from') - 1;
      const to = interaction.options.getInteger('to') - 1;
      const ok = moveInQueue(interaction.guild.id, from, to);
      if (!ok) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Index tidak valid')], flags: MessageFlags.Ephemeral });
      }
      const state = getGuildState(interaction.guild.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('↕️ Dipindahkan').setDescription(`Lagu dipindah dari #${from + 1} ke #${to + 1}.\nAntrian sekarang: **${state.queue.length}** lagu`)] });
    }

    // ── CLEAR QUEUE ──
    if (sub === 'clearqueue') {
      if (!hasDJPerm(interaction)) {
        return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
      }
      const count = clearQueue(interaction.guild.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('🧹 Antrian Dikosongkan').setDescription(`**${count}** lagu dihapus dari antrian. Lagu yang sedang diputar tetap.`)] });
    }

    // ── JUMP ──
    if (sub === 'jump') {
      if (!hasDJPerm(interaction)) {
        return interaction.reply({ embeds: [denyEmbed(interaction)], flags: MessageFlags.Ephemeral });
      }
      const idx = interaction.options.getInteger('index');
      const state = getGuildState(interaction.guild.id);
      if (idx > state.queue.length) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Index di luar jangkauan').setDescription(`Antrian cuma punya ${state.queue.length} lagu.`)], flags: MessageFlags.Ephemeral });
      }
      const ok = await jumpTo(interaction.guild.id, idx);
      if (!ok) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Gagal jump')], flags: MessageFlags.Ephemeral });
      }
      const target = state.queue[idx - 1];
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⤴️ Jump').setDescription(`Sekarang memutar: **${target.title}**`).setTimestamp()] });
    }

    // ── LYRICS ──
    if (sub === 'lyrics') {
      await interaction.deferReply();
      const state = getGuildState(interaction.guild.id);
      let query = interaction.options.getString('query');
      if (!query && state.currentSong) {
        query = state.currentSong.title;
      }
      if (!query) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Tidak ada query').setDescription('Berikan judul lagu, atau putar lagu dulu.')] });
      }
      try {
        const { lyrics, artist, title } = await fetchLyrics(query);
        // Discord embed description max 4096, field max 1024
        const truncated = lyrics.length > 3500 ? lyrics.slice(0, 3500) + '\n\n*[lirik terpotong — terlalu panjang]*' : lyrics;
        const embed = new EmbedBuilder()
          .setColor(ACCENT)
          .setTitle(`📝 ${title}${artist ? ` — ${artist}` : ''}`)
          .setDescription(truncated)
          .setFooter({ text: 'lyrics.ovh' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Lirik tidak ditemukan').setDescription(err.message)] });
      }
    }

    // ── FAVORITE ──
    if (sub === 'favorite') {
      const action = interaction.options.getString('action');
      const userId = interaction.user.id;

      if (action === 'add') {
        const state = getGuildState(interaction.guild.id);
        if (!state.currentSong) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Tidak ada lagu').setDescription('Putar lagu dulu sebelum add ke favorit.')], flags: MessageFlags.Ephemeral });
        }
        try {
          addFavorite(userId, {
            title: state.currentSong.title,
            url: state.currentSong.url,
            duration: state.currentSong.duration,
            source: state.currentSong.source,
            thumbnail: state.currentSong.thumbnail,
          });
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⭐ Ditambahkan ke Favorit').setDescription(`**${state.currentSong.title}**`)], flags: MessageFlags.Ephemeral });
        } catch (err) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Gagal').setDescription(err.message)], flags: MessageFlags.Ephemeral });
        }
      }

      if (action === 'remove') {
        const url = interaction.options.getString('url');
        if (!url) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ URL kosong').setDescription('Gunakan `/mextra favorite action:remove url:<URL>`')], flags: MessageFlags.Ephemeral });
        }
        try {
          removeFavorite(userId, url);
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⭐ Dihapus dari Favorit')], flags: MessageFlags.Ephemeral });
        } catch (err) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Gagal').setDescription(err.message)], flags: MessageFlags.Ephemeral });
        }
      }

      if (action === 'list') {
        const favs = getFavorites(userId);
        if (!favs.length) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(MUTED).setTitle('⭐ Belum ada favorit').setDescription('Tambah dengan `/mextra favorite action:add` saat ada lagu diputar.')], flags: MessageFlags.Ephemeral });
        }
        const lines = favs.slice(0, 15).map((t, i) => `\`${i + 1}.\` **[${t.title}](${t.url})** — \`${formatDuration(t.duration)}\``);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(ACCENT)
            .setTitle(`⭐ Favorit (${favs.length}/${MAX_FAVORITES})`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Gunakan action:play untuk putar semua favorit' })
            .setTimestamp()],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === 'clear') {
        const count = clearFavorites(userId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⭐ Favorit Dikosongkan').setDescription(`**${count}** lagu dihapus dari favorit.`)], flags: MessageFlags.Ephemeral });
      }

      if (action === 'play') {
        const favs = getFavorites(userId);
        if (!favs.length) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Belum ada favorit')], flags: MessageFlags.Ephemeral });
        }
        const voice = interaction.member?.voice?.channel;
        if (!voice) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Belum di Voice').setDescription('Join voice channel dulu!')], flags: MessageFlags.Ephemeral });
        }
        const { enqueueTracks } = await import('../music/player.js');
        const { buildNowPlayingEmbed, buildNowPlayingRows } = await import('../music/ui.js');
        const tracks = favs.map(t => ({
          title: t.title, url: t.url, duration: t.duration,
          thumbnail: t.thumbnail, source: t.source,
          requestedBy: `<@${userId}>`,
        }));
        const fresh = await enqueueTracks({
          guild: interaction.guild, voiceChannel: voice,
          textChannel: interaction.channel, tracks, requestedBy: userId,
        });
        if (fresh.currentSong) {
          const embed = buildNowPlayingEmbed(interaction.guild, fresh.currentSong, fresh);
          const rows = buildNowPlayingRows(interaction.guild.id);
          const msg = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
          fresh.nowPlayingMessageId = msg.id;
          patchGuildState(interaction.guild.id, fresh);
        } else {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⭐ Favorit Dimuat').setDescription(`**${favs.length}** lagu dari favorit ditambahkan ke antrian.`)], fetchReply: true });
        }
        return;
      }
    }

    // ── SKIPVOTE ──
    if (sub === 'skipvote') {
      const userId = interaction.user.id;
      // Owners/admins/DJ can skip directly
      if (hasDJPerm(interaction)) {
        const { skip } = await import('../music/player.js');
        skip(interaction.guild.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('⏭️ Skipped').setDescription('Kamu punya akses langsung untuk skip.')] });
      }
      const voice = interaction.member?.voice?.channel;
      if (!voice) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Join voice dulu').setDescription('Kamu harus di voice channel yang sama untuk vote.')], flags: MessageFlags.Ephemeral });
      }
      const state = getGuildState(interaction.guild.id);
      if (!state.voiceChannelId || voice.id !== state.voiceChannelId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Beda voice channel').setDescription('Kamu harus di voice channel yang sama dengan bot.')], flags: MessageFlags.Ephemeral });
      }
      const result = castVote(interaction.guild.id, userId);
      if (!result.ok) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(WARN).setTitle('⚠️ Sudah vote').setDescription(result.reason)], flags: MessageFlags.Ephemeral });
      }
      const humans = countHumanListeners(interaction.guild);
      const required = Math.ceil(humans / 2);
      const passed = result.voters >= required;
      if (passed) {
        const { skip } = await import('../music/player.js');
        skip(interaction.guild.id);
        endVote(interaction.guild.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(SUCCESS).setTitle('🗳️ Vote Lolos!').setDescription(`**${result.voters}/${humans}** user vote skip — lagu di-skip!`)] });
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(WARN).setTitle('🗳️ Vote Tercatat').setDescription(`**${result.voters}/${required}** voter dibutuhkan.\nVote timeout 60 detik.`)] });
    }

  } catch (err) {
    console.error('musicextras error:', err);
    const payload = { embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Error').setDescription(err.message?.slice(0, 300) || 'Gagal')], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply(payload);
  }
}
