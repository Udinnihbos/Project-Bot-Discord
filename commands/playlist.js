import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import {
  listPlaylists, getPlaylist, createPlaylist, deletePlaylist,
  renamePlaylist, addTrack, removeTrack, clearPlaylist,
  MAX_PLAYLISTS_PER_USER, MAX_TRACKS_PER_PLAYLIST, MAX_NAME_LENGTH,
} from '../music/playlist.js';
import { resolveTracks, detectQueryType, initExtractors } from '../music/extractors.js';
import { getGuildState, patchGuildState } from '../music/state.js';
import { formatDuration, enqueueTracks } from '../music/player.js';
import { buildNowPlayingEmbed, buildNowPlayingRows } from '../music/ui.js';

const ACCENT = 0x1DB954;
const SUCCESS = 0x2ecc71;
const DANGER = 0xe74c3c;
const WARN = 0xf39c12;
const MUTED = 0x95a5a6;

function formatRelativeTime(ms) {
  if (!ms) return 'baru saja';
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return `${Math.floor(day / 30)} bulan lalu`;
}

function buildPlaylistListEmbed(user, playlists) {
  const lines = playlists.length
    ? playlists.map((p, i) => {
        const total = p.tracks.reduce((s, t) => s + (t.duration || 0), 0);
        return `**${i + 1}.** \`${p.name}\` — **${p.tracks.length}** lagu • ⏱️ ${formatDuration(total)} • 🕒 ${formatRelativeTime(p.updatedAt)}`;
      })
    : ['*Belum ada playlist.*\n\nBuat playlist baru dengan `/playlist create <nama>`'];
  const avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ dynamic: true }) : null;
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: `${user.username || 'User'} • Playlist`, iconURL: avatarUrl ?? undefined })
    .setTitle(`📋 Daftar Playlist (${playlists.length}/${MAX_PLAYLISTS_PER_USER})`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: '🎶 Music Player • Playlist per-user' })
    .setTimestamp();
}

function buildPlaylistViewEmbed(user, pl) {
  const total = pl.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const lines = pl.tracks.length
    ? pl.tracks.slice(0, 15).map((t, i) => `\`${i + 1}.\` **[${t.title}](${t.url})** — \`${formatDuration(t.duration)}\``)
    : ['*Playlist kosong. Tambah lagu dengan `/playlist add`*'];

  if (pl.tracks.length > 15) {
    lines.push(`\n*+${pl.tracks.length - 15} lagu lainnya...*`);
  }

  const avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ dynamic: true }) : null;
  return new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({ name: `${user.username || 'User'} • Playlist`, iconURL: avatarUrl ?? undefined })
    .setTitle(`📋 ${pl.name}`)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '🎵 Lagu', value: `${pl.tracks.length} / ${MAX_TRACKS_PER_PLAYLIST}`, inline: true },
      { name: '⏱️ Total Durasi', value: formatDuration(total), inline: true },
      { name: '🕒 Update', value: formatRelativeTime(pl.updatedAt), inline: true },
    )
    .setFooter({ text: 'Gunakan /playlist play untuk play seluruh isi playlist' })
    .setTimestamp();
}

// ════════════════════════════════════════
// SLASH COMMAND
// ════════════════════════════════════════

export const data = new SlashCommandBuilder()
  .setName('playlist')
  .setDescription('📋 Kelola playlist music kamu (per-user)')
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('📋 Lihat semua playlist kamu')
  )
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('➕ Buat playlist baru')
      .addStringOption(opt => opt.setName('name').setDescription(`Nama playlist (max ${MAX_NAME_LENGTH} karakter)`).setRequired(true).setMaxLength(MAX_NAME_LENGTH))
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('🗑️ Hapus playlist')
      .addStringOption(opt => opt.setName('name').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('rename')
      .setDescription('✏️ Rename playlist')
      .addStringOption(opt => opt.setName('old').setDescription('Nama lama').setRequired(true).setAutocomplete(true))
      .addStringOption(opt => opt.setName('new').setDescription('Nama baru').setRequired(true).setMaxLength(MAX_NAME_LENGTH))
  )
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('➕ Tambah lagu ke playlist')
      .addStringOption(opt => opt.setName('playlist').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
      .addStringOption(opt => opt.setName('query').setDescription('URL YouTube/Spotify atau judul lagu').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('➖ Hapus lagu dari playlist (berdasarkan nomor)')
      .addStringOption(opt => opt.setName('playlist').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
      .addIntegerOption(opt => opt.setName('index').setDescription('Nomor lagu (lihat di /playlist view)').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('🧹 Kosongkan isi playlist (jangan hapus playlistnya)')
      .addStringOption(opt => opt.setName('playlist').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('👁️ Lihat isi playlist')
      .addStringOption(opt => opt.setName('playlist').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('play')
      .setDescription('▶️ Play seluruh isi playlist')
      .addStringOption(opt => opt.setName('playlist').setDescription('Nama playlist').setRequired(true).setAutocomplete(true))
      .addBooleanOption(opt => opt.setName('shuffle').setDescription('Acak urutan?').setRequired(false))
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const userId = interaction.user.id;
  const pls = listPlaylists(userId);
  const choices = pls
    .filter(p => p.name.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map(p => ({ name: `${p.name} (${p.tracks.length} lagu)`, value: p.name }));
  await interaction.respond(choices);
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const user = interaction.user;

  try {
    // ── LIST ──
    if (sub === 'list') {
      const pls = listPlaylists(userId);
      return interaction.reply({
        embeds: [buildPlaylistListEmbed(user, pls)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── CREATE ──
    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const pl = createPlaylist(userId, name);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(SUCCESS)
          .setTitle('➕ Playlist Dibuat')
          .setDescription(`Playlist **${pl.name}** berhasil dibuat!\n\nTambah lagu dengan \`/playlist add ${pl.name} <lagu>\``)
          .setFooter({ text: '🎶 Music Player' })
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── DELETE ──
    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      // Show confirm embed with delete button
      const embed = new EmbedBuilder()
        .setColor(DANGER)
        .setTitle('⚠️ Konfirmasi Hapus Playlist')
        .setDescription(`Yakin mau hapus playlist **${name}**?\n\n**Aksi ini tidak bisa dibatalkan.**`)
        .setFooter({ text: 'Klik tombol di bawah untuk konfirmasi' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pl_del_confirm:${userId}:${encodeURIComponent(name)}`)
          .setLabel('🗑️ Ya, Hapus')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`pl_del_cancel`)
          .setLabel('❌ Batal')
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    // ── RENAME ──
    if (sub === 'rename') {
      const oldName = interaction.options.getString('old');
      const newName = interaction.options.getString('new');
      renamePlaylist(userId, oldName, newName);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(SUCCESS)
          .setTitle('✏️ Playlist Di-rename')
          .setDescription(`**${oldName}** → **${newName}**`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ADD ──
    if (sub === 'add') {
      const name = interaction.options.getString('playlist');
      const query = interaction.options.getString('query');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      await initExtractors();
      const type = detectQueryType(query);

      // For single track, resolve immediately
      if (type === 'yt_video' || type === 'spotify_track' || type === 'search') {
        const tracks = await resolveTracks(query, `<@${userId}>`, { limit: 1 });
        if (!tracks.length) throw new Error('Lagu tidak ditemukan.');
        const track = tracks[0];
        addTrack(userId, name, {
          title: track.title,
          url: track.url,
          duration: track.duration,
          source: track.source,
          thumbnail: track.thumbnail,
        });
        const pl = getPlaylist(userId, name);
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(SUCCESS)
            .setTitle('➕ Lagu Ditambahkan')
            .setDescription(`**[${track.title}](${track.url})** ditambahkan ke **${name}**\n\nSekarang: **${pl.tracks.length}/${MAX_TRACKS_PER_PLAYLIST}** lagu`)
            .setThumbnail(track.thumbnail)
            .setFooter({ text: '🎶 Music Player' })
            .setTimestamp()],
        });
      }

      // For playlist/spotify-album: add the URL/ID itself as a "group reference"
      // It'll be resolved when /playlist play is called.
      if (type === 'yt_playlist' || type === 'spotify_playlist' || type === 'spotify_album') {
        // Use addTrack with a ref (dedup applies on URL)
        addTrack(userId, name, {
          title: `[Playlist] ${query}`,
          url: query,
          duration: 0,
          source: type,
          thumbnail: null,
        });
        const pl = getPlaylist(userId, name);
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(SUCCESS)
            .setTitle('➕ Playlist Source Ditambahkan')
            .setDescription(`Referensi playlist/album ditambahkan ke **${name}**.\nLagu akan di-resolve otomatis saat \`/playlist play ${name}\` dipanggil.`)
            .addFields({ name: '🔗 URL', value: query })
            .setFooter({ text: '💡 Tips: Untuk single lagu, paste URL YouTube/Spotify atau judul' })
            .setTimestamp()],
        });
      }
    }

    // ── REMOVE ──
    if (sub === 'remove') {
      const name = interaction.options.getString('playlist');
      const idx = interaction.options.getInteger('index') - 1;
      const pl = getPlaylist(userId, name);
      if (!pl) throw new Error(`Playlist **${name}** tidak ditemukan.`);
      const removed = removeTrack(userId, name, idx);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(SUCCESS)
          .setTitle('➖ Lagu Dihapus')
          .setDescription(`**${removed.title}** dihapus dari **${name}**.`)]
        ,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── CLEAR ──
    if (sub === 'clear') {
      const name = interaction.options.getString('playlist');
      clearPlaylist(userId, name);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(SUCCESS)
          .setTitle('🧹 Playlist Dikosongkan')
          .setDescription(`Isi playlist **${name}** sudah dikosongkan. Playlist-nya tetap ada.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── VIEW ──
    if (sub === 'view') {
      const name = interaction.options.getString('playlist');
      const pl = getPlaylist(userId, name);
      if (!pl) throw new Error(`Playlist **${name}** tidak ditemukan.`);
      return interaction.reply({
        embeds: [buildPlaylistViewEmbed(user, pl)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── PLAY ──
    if (sub === 'play') {
      const name = interaction.options.getString('playlist');
      const doShuffle = interaction.options.getBoolean('shuffle') || false;
      const pl = getPlaylist(userId, name);
      if (!pl) throw new Error(`Playlist **${name}** tidak ditemukan.`);
      if (!pl.tracks.length) throw new Error(`Playlist **${name}** kosong.`);

      const voice = interaction.member?.voice?.channel;
      if (!voice) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Belum di Voice').setDescription('Join voice channel dulu!')],
          flags: MessageFlags.Ephemeral,
        });
      }
      const perms = voice.permissionsFor(interaction.client.user);
      if (!perms?.has('Connect') || !perms?.has('Speak')) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Permission Ditolak')],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      // Resolve all tracks (handle playlist/album references)
      await initExtractors();
      const resolved = [];
      const failed = [];
      for (const t of pl.tracks) {
        try {
          if (t.source === 'yt_playlist' || t.source === 'spotify_playlist' || t.source === 'spotify_album') {
            const tracks = await resolveTracks(t.url, `<@${userId}>`, { limit: 50 });
            resolved.push(...tracks);
          } else {
            resolved.push({
              title: t.title,
              url: t.url,
              duration: t.duration,
              thumbnail: t.thumbnail,
              requestedBy: `<@${userId}>`,
              source: t.source === 'spotify' ? 'spotify' : 'youtube',
            });
          }
        } catch (e) {
          console.warn('Failed to resolve track:', t.url, e.message);
          failed.push(t.title);
        }
      }

      if (!resolved.length) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Tidak ada lagu yang bisa dimuat').setDescription('Cek URL di playlist, mungkin sudah invalid.')],
        });
      }

      if (doShuffle) {
        for (let i = resolved.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [resolved[i], resolved[j]] = [resolved[j], resolved[i]];
        }
      }

      // Enqueue all tracks via the clean public API
      const fresh = await enqueueTracks({
        guild: interaction.guild,
        voiceChannel: voice,
        textChannel: interaction.channel,
        tracks: resolved,
        requestedBy: userId,
      });

      // Show now playing
      if (fresh.currentSong) {
        const embed = buildNowPlayingEmbed(interaction.guild, fresh.currentSong, fresh);
        const rows = buildNowPlayingRows(interaction.guild.id);
        const msg = await interaction.editReply({ embeds: [embed], components: rows });
        fresh.nowPlayingMessageId = msg.id;
        patchGuildState(interaction.guild.id, fresh);
      } else {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(SUCCESS)
            .setTitle(`▶️ Playlist ${name} Dimuat`)
            .setDescription(`**${resolved.length}** lagu dari playlist ditambahkan ke antrian.`)
            .addFields(failed.length ? [{ name: '⚠️ Gagal resolve', value: failed.slice(0, 5).join('\n') }] : [])],
        });
      }
    }

  } catch (err) {
    console.error('Playlist error:', err);
    const payload = {
      embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Error').setDescription(err.message?.slice(0, 300) || 'Gagal')],
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}

// ════════════════════════════════════════
// BUTTON HANDLERS (for delete confirmation)
// ════════════════════════════════════════

export async function handlePlaylistButton(interaction) {
  if (!interaction.customId.startsWith('pl_')) return false;

  // Ownership check
  if (!interaction.customId.startsWith('pl_del_cancel')) {
    const parts = interaction.customId.split(':');
    const ownerId = parts[1];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Bukan punya kamu')],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  await interaction.deferUpdate();

  if (interaction.customId === 'pl_del_cancel') {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(MUTED).setTitle('↩️ Dibatalkan')],
      components: [],
    });
    return true;
  }

  if (interaction.customId.startsWith('pl_del_confirm:')) {
    const [, ownerId, encodedName] = interaction.customId.split(':');
    const name = decodeURIComponent(encodedName);
    try {
      deletePlaylist(ownerId, name);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(SUCCESS)
          .setTitle('🗑️ Playlist Dihapus')
          .setDescription(`Playlist **${name}** berhasil dihapus.`)],
        components: [],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(DANGER).setTitle('❌ Gagal').setDescription(err.message)],
        components: [],
      });
    }
    return true;
  }

  return false;
}
