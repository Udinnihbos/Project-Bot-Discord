import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Setup play-dl authorization ──
async function setupPlayDL() {
  // YouTube cookies (untuk bypass bot detection)
  const cookiePath = join(__dirname, '../data/yt-cookies.txt');
  if (existsSync(cookiePath)) {
    try {
      const rawCookie = readFileSync(cookiePath, 'utf8').trim();
      // Bersihkan karakter tidak valid dari cookie
      const cleanCookie = rawCookie
        .replace(/[\r\n]+/g, '; ')   // replace newlines dengan semicolon
        .replace(/[^\x20-\x7E]/g, '') // hapus non-ASCII characters
        .replace(/;\s*;/g, ';')        // hapus double semicolons
        .trim();

      if (cleanCookie.length > 0) {
        await playdl.setToken({
          youtube: { cookie: cleanCookie }
        });
        console.log('✅ YouTube cookies loaded');
      } else {
        console.warn('⚠️ yt-cookies.txt kosong atau tidak valid, skip.');
      }
    } catch (e) {
      console.warn('⚠️ Failed to load YouTube cookies:', e.message);
    }
  }

  // Spotify authorization
  const spotifyPath = join(__dirname, '../data/spotify-auth.json');
  if (existsSync(spotifyPath)) {
    try {
      const spotAuth = JSON.parse(readFileSync(spotifyPath, 'utf8'));

      // Skip kalau masih template / belum diisi
      if (!spotAuth.client_id || spotAuth.client_id === 'ISI_CLIENT_ID_DISINI') {
        console.warn('⚠️ spotify-auth.json belum diisi — Spotify disabled');
        return;
      }
      if (!spotAuth.refresh_token || spotAuth.refresh_token === 'ISI_REFRESH_TOKEN_DISINI') {
        console.warn('⚠️ Spotify refresh_token belum diisi — Spotify disabled');
        return;
      }

      await playdl.setToken({
        spotify: {
          client_id: spotAuth.client_id,
          client_secret: spotAuth.client_secret,
          refresh_token: spotAuth.refresh_token,
          market: 'ID'
        }
      });
      console.log('✅ Spotify authorization loaded');
    } catch (e) {
      console.warn('⚠️ Failed to load Spotify auth:', e.message);
    }
  } else {
    console.warn('⚠️ spotify-auth.json not found — Spotify disabled');
  }
}

// Run setup
setupPlayDL();

const PREFIX = 'b!';

// Queue per guild
const guildQueues = new Map();

// ── Helpers ──

function getQueue(guildId) {
  return guildQueues.get(guildId) || null;
}

function createQueue(guildId, connection, player, textChannel) {
  const queue = {
    queue: [],
    player,
    connection,
    textChannel,
    currentSong: null,
    loop: false,
  };
  guildQueues.set(guildId, queue);
  return queue;
}

function deleteQueue(guildId) {
  const q = guildQueues.get(guildId);
  if (q) {
    try { q.player.stop(true); } catch {}
    try { q.connection.destroy(); } catch {}
    guildQueues.delete(guildId);
  }
}

function formatDuration(seconds) {
  if (!seconds) return '∞';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Play next song ──

async function playNext(guildId) {
  const q = getQueue(guildId);
  if (!q) return;

  if (q.queue.length === 0) {
    q.currentSong = null;
    q.textChannel.send('✅ Queue habis! Gunakan `b!play` untuk lanjut atau `b!leave` untuk keluar.').catch(() => {});
    return;
  }

  const song = q.queue.shift();
  q.currentSong = song;

  try {
    let stream;
    try {
      stream = await playdl.stream(song.url, { quality: 2 });
    } catch (e) {
      if (e.message?.includes('Sign in') || e.message?.includes('bot')) {
        // Fallback: try with different options
        stream = await playdl.stream(song.url, { quality: 0, htmldata: false });
      } else {
        throw e;
      }
    }
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(0.8);
    q.player.play(resource);

    q.textChannel.send({
      embeds: [{
        color: 0x3498db,
        title: '🎵 Sekarang Memutar',
        description: `**[${song.title}](${song.url})**`,
        fields: [
          { name: '⏱️ Durasi', value: formatDuration(song.duration), inline: true },
          { name: '👤 Diminta oleh', value: song.requestedBy, inline: true },
          { name: '📋 Antrian', value: `${q.queue.length} lagu tersisa`, inline: true },
        ],
        thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
        footer: { text: 'b!skip • b!queue • b!stop • b!loop' },
      }]
    }).catch(() => {});

  } catch (err) {
    console.error('Error playing song:', err);
    q.textChannel.send(`❌ Gagal memutar **${song.title}**, skip...`).catch(() => {});
    playNext(guildId);
  }
}

// ── Setup player & connection ──

function setupPlayer(guildId, connection, textChannel) {
  const player = createAudioPlayer();
  connection.subscribe(player);
  const q = createQueue(guildId, connection, player, textChannel);

  player.on(AudioPlayerStatus.Idle, () => {
    const currentQ = getQueue(guildId);
    if (!currentQ) return;
    if (currentQ.loop && currentQ.currentSong) {
      currentQ.queue.unshift(currentQ.currentSong);
    }
    playNext(guildId);
  });

  player.on('error', (err) => {
    console.error('AudioPlayer error:', err);
    playNext(guildId);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      deleteQueue(guildId);
    }
  });

  return q;
}

// ── Commands ──

async function handleJoin(message) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return message.reply('❌ Kamu harus berada di voice channel dulu!');

  const perms = voiceChannel.permissionsFor(message.client.user);
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    return message.reply('❌ Bot tidak punya izin Connect/Speak di channel itu!');
  }

  if (getVoiceConnection(message.guild.id)) {
    return message.reply('✅ Bot sudah berada di voice channel!');
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  setupPlayer(message.guild.id, connection, message.channel);
  message.reply(`✅ Bergabung ke **${voiceChannel.name}**! Gunakan \`b!play <link/judul>\` untuk memutar.`);
}

async function handleLeave(message) {
  if (!getVoiceConnection(message.guild.id) && !getQueue(message.guild.id)) {
    return message.reply('❌ Bot tidak berada di voice channel manapun!');
  }
  deleteQueue(message.guild.id);
  message.reply('👋 Keluar dari voice channel!');
}

async function handlePlay(message, args) {
  if (!args.length) {
    return message.reply('❌ Berikan link YouTube/Spotify atau judul lagu!\nContoh:\n`b!play https://youtu.be/...`\n`b!play nama lagu`\n`b!play https://open.spotify.com/track/...`');
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return message.reply('❌ Kamu harus berada di voice channel dulu!');

  // Auto join
  let q = getQueue(message.guild.id);
  if (!q) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
    q = setupPlayer(message.guild.id, connection, message.channel);
  }

  const query = args.join(' ');
  const loadingMsg = await message.reply('🔍 Mencari lagu...');

  try {
    let songs = [];

    const ytValidate = playdl.yt_validate(query);
    const isSpotify = query.includes('spotify.com/');

    if (isSpotify) {
      // Check if Spotify is authorized
      const spotifyPath = join(__dirname, '../data/spotify-auth.json');
      if (!existsSync(spotifyPath)) {
        await loadingMsg.edit('❌ Spotify belum dikonfigurasi!\nBuat file `data/spotify-auth.json` dengan client_id, client_secret, dan refresh_token dari Spotify Developer Dashboard.');
        return;
      }

      // Spotify support
      const spotifyType = query.includes('/playlist/') ? 'playlist'
        : query.includes('/album/') ? 'album'
        : 'track';

      const spotData = await playdl.spotify(query);

      if (spotifyType === 'track') {
        const ytRes = await playdl.search(`${spotData.name} ${spotData.artists?.[0]?.name || ''}`, { limit: 1 });
        if (!ytRes.length) throw new Error('Lagu tidak ditemukan di YouTube');
        songs.push({
          title: spotData.name,
          url: ytRes[0].url,
          duration: spotData.durationInSec || ytRes[0].durationInSec,
          thumbnail: spotData.thumbnail?.url || ytRes[0].thumbnails?.[0]?.url,
          requestedBy: message.author.username,
        });
      } else {
        // Playlist/Album Spotify
        const tracks = await spotData.all_tracks();
        const MAX = 50;
        await loadingMsg.edit(`🔍 Memuat ${Math.min(tracks.length, MAX)} lagu dari Spotify...`);
        for (const track of tracks.slice(0, MAX)) {
          try {
            const ytRes = await playdl.search(`${track.name} ${track.artists?.[0]?.name || ''}`, { limit: 1 });
            if (ytRes.length) {
              songs.push({
                title: track.name,
                url: ytRes[0].url,
                duration: track.durationInSec || ytRes[0].durationInSec,
                thumbnail: track.thumbnail?.url || ytRes[0].thumbnails?.[0]?.url,
                requestedBy: message.author.username,
              });
            }
          } catch {}
        }
      }

    } else if (ytValidate === 'playlist') {
      const playlist = await playdl.playlist_info(query, { incomplete: true });
      const videos = await playlist.all_videos();
      await loadingMsg.edit(`🔍 Memuat ${Math.min(videos.length, 50)} lagu dari playlist...`);
      songs = videos.slice(0, 50).map(v => ({
        title: v.title || 'Unknown',
        url: v.url,
        duration: v.durationInSec,
        thumbnail: v.thumbnails?.[0]?.url,
        requestedBy: message.author.username,
      }));

    } else if (ytValidate === 'video') {
      const info = await playdl.video_info(query);
      songs.push({
        title: info.video_details.title || 'Unknown',
        url: info.video_details.url,
        duration: info.video_details.durationInSec,
        thumbnail: info.video_details.thumbnails?.[0]?.url,
        requestedBy: message.author.username,
      });

    } else {
      // Search by title
      const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
      if (!results.length) throw new Error('Lagu tidak ditemukan!');
      songs.push({
        title: results[0].title || 'Unknown',
        url: results[0].url,
        duration: results[0].durationInSec,
        thumbnail: results[0].thumbnails?.[0]?.url,
        requestedBy: message.author.username,
      });
    }

    if (!songs.length) throw new Error('Tidak ada lagu yang bisa dimuat!');

    q.queue.push(...songs);

    const isPlaying = q.player.state.status === AudioPlayerStatus.Playing
                   || q.player.state.status === AudioPlayerStatus.Buffering;

    if (songs.length === 1) {
      const song = songs[0];
      if (!isPlaying && !q.currentSong) {
        await loadingMsg.delete().catch(() => {});
        playNext(message.guild.id);
      } else {
        await loadingMsg.edit({
          content: '',
          embeds: [{
            color: 0x2ecc71,
            title: '➕ Ditambahkan ke Queue',
            description: `**[${song.title}](${song.url})**`,
            fields: [
              { name: '⏱️ Durasi', value: formatDuration(song.duration), inline: true },
              { name: '📋 Posisi', value: `#${q.queue.length}`, inline: true },
            ],
            thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
          }]
        });
      }
    } else {
      await loadingMsg.edit({
        content: '',
        embeds: [{
          color: 0x2ecc71,
          title: '📋 Playlist Ditambahkan!',
          description: `**${songs.length} lagu** berhasil ditambahkan ke queue!`,
          fields: [
            { name: '🎵 Pertama', value: songs[0].title, inline: false },
            { name: '📋 Total Queue', value: `${q.queue.length} lagu`, inline: true },
          ],
        }]
      });
      if (!isPlaying && !q.currentSong) playNext(message.guild.id);
    }

  } catch (err) {
    console.error('Play error:', err);
    await loadingMsg.edit(`❌ Gagal: ${err.message}`);
  }
}

async function handleSkip(message) {
  const q = getQueue(message.guild.id);
  if (!q || !q.currentSong) return message.reply('❌ Tidak ada lagu yang sedang diputar!');

  const skipped = q.currentSong;
  q.player.stop();
  message.reply(`⏭️ Skip: **${skipped.title}**${q.queue.length ? ` — ▶️ lagu berikutnya...` : ' — queue kosong.'}`);
}

async function handleStop(message) {
  const q = getQueue(message.guild.id);
  if (!q) return message.reply('❌ Bot tidak sedang memutar musik!');

  q.queue = [];
  q.currentSong = null;
  q.player.stop();
  message.reply('⏹️ Musik dihentikan dan queue dikosongkan!');
}

async function handleQueue(message) {
  const q = getQueue(message.guild.id);
  if (!q || (!q.currentSong && !q.queue.length)) {
    return message.reply('📋 Queue kosong! Gunakan `b!play` untuk menambah lagu.');
  }

  const lines = [];
  if (q.currentSong) {
    lines.push(`▶️ **[${q.currentSong.title}](${q.currentSong.url})** — ${formatDuration(q.currentSong.duration)} — req: ${q.currentSong.requestedBy}`);
  }
  q.queue.slice(0, 10).forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** — ${formatDuration(s.duration)} — req: ${s.requestedBy}`);
  });
  if (q.queue.length > 10) lines.push(`...dan **${q.queue.length - 10}** lagu lainnya.`);

  message.reply({
    embeds: [{
      color: 0x3498db,
      title: `📋 Queue — ${q.queue.length} lagu tersisa`,
      description: lines.join('\n'),
      footer: { text: q.loop ? '🔁 Loop aktif' : 'b!skip • b!stop • b!loop' },
    }]
  });
}

async function handleNowPlaying(message) {
  const q = getQueue(message.guild.id);
  if (!q || !q.currentSong) return message.reply('❌ Tidak ada lagu yang sedang diputar!');

  const song = q.currentSong;
  message.reply({
    embeds: [{
      color: 0x3498db,
      title: '🎵 Sekarang Memutar',
      description: `**[${song.title}](${song.url})**`,
      fields: [
        { name: '⏱️ Durasi', value: formatDuration(song.duration), inline: true },
        { name: '👤 Diminta oleh', value: song.requestedBy, inline: true },
        { name: '🔁 Loop', value: q.loop ? 'Aktif' : 'Nonaktif', inline: true },
      ],
      thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
    }]
  });
}

async function handleLoop(message) {
  const q = getQueue(message.guild.id);
  if (!q) return message.reply('❌ Bot tidak sedang memutar musik!');

  q.loop = !q.loop;
  message.reply(q.loop ? '🔁 Loop **aktif**!' : '➡️ Loop **nonaktif**.');
}

async function handleHelp(message) {
  message.reply({
    embeds: [{
      color: 0x9b59b6,
      title: '🎵 Music Commands',
      fields: [
        { name: '`b!join`', value: 'Join voice channel', inline: true },
        { name: '`b!leave` / `b!dc`', value: 'Leave voice channel', inline: true },
        { name: '`b!play <link/judul>`', value: 'Putar lagu dari YouTube/Spotify, atau cari by judul', inline: false },
        { name: '`b!skip` / `b!s`', value: 'Skip lagu sekarang', inline: true },
        { name: '`b!stop`', value: 'Stop & kosongkan queue', inline: true },
        { name: '`b!queue` / `b!q`', value: 'Lihat antrian lagu', inline: true },
        { name: '`b!np`', value: 'Lagu yang sedang diputar', inline: true },
        { name: '`b!loop` / `b!l`', value: 'Toggle loop lagu', inline: true },
      ],
      footer: { text: 'Support: YouTube video/playlist & Spotify track/playlist/album (max 50 lagu)' },
    }]
  });
}

// ── Main Handler ──

export async function handleVoiceCommand(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case 'join':                    await handleJoin(message); break;
      case 'leave': case 'dc': case 'disconnect': await handleLeave(message); break;
      case 'play': case 'p':          await handlePlay(message, args); break;
      case 'skip': case 's':          await handleSkip(message); break;
      case 'stop':                    await handleStop(message); break;
      case 'queue': case 'q':         await handleQueue(message); break;
      case 'np': case 'nowplaying':   await handleNowPlaying(message); break;
      case 'loop': case 'l':          await handleLoop(message); break;
      case 'help': case 'music':      await handleHelp(message); break;
    }
  } catch (err) {
    console.error(`Music error [${command}]:`, err);
    message.reply(`❌ Error: ${err.message}`).catch(() => {});
  }
}
