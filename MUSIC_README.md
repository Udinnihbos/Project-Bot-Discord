# 🎶 Music Player — Jockie-style untuk Pterodactyl

Music player lengkap untuk Discord dengan stack **Jockie-inspired**: YouTube (YouTube Music) + Spotify + 24/7 + playlist + favorites + skipvote + lyrics. Tidak butuh Lavalink — semua proses audio di-handle di Node.js process yang sama dengan bot (Pterodactyl-friendly, hemat resource).

## ✨ Features

- 🎵 **Playback** — YouTube & Spotify (track/playlist/album), auto-join VC, queue management
- 🎛️ **Interactive Now Playing** — auto-update panel dengan button controls
- 🔁 **Loop** — Off / Song / Queue
- 🔀 **Shuffle** + volume 0-200% + 24/7 mode
- 📋 **Per-user Playlist** — save/load/play/rename (max 10 playlist × 50 lagu per user)
- ⭐ **Favorites** — per-user (max 100)
- 🗳️ **Skip vote** — democratic skip (mayoritas VC)
- 📝 **Lyrics** — via lyrics.ovh (current song auto-detect)
- 📢 **Announce Channel** — auto-post Now Playing ke channel khusus
- 👑 **DJ Role** — restrict playback control
- 🕐 **24/7 Mode** — bot stay di VC
- ⏱️ **Auto-Leave** — configurable, default 5 menit
- 🎯 **Auto-update Leaderboard** — track now playing message updated real-time
- 💾 **Persistent State** — queue + current song + volume + loop survives restart
- 🌐 **Multi-language** — Indonesian / English

## 📋 Daftar Command

### ▶️ Playback
| Command | Fungsi |
|---|---|
| `/play <query>` | Putar lagu (URL YouTube/Spotify atau judul) |
| `/pause [mode]` | Pause / resume / toggle |
| `/skip` | Skip lagu |
| `/stop` / `/disconnect` | Stop & leave VC |
| `/nowplaying` | Lihat panel Now Playing |
| `/queue` | Lihat antrian (paged) |

### 🎛️ Controls
| Command | Fungsi |
|---|---|
| `/loop <off\|song\|queue>` | Set mode loop |
| `/shuffle` | Acak antrian |
| `/volume <0-200>` | Set volume (default 100, max 200%) |
| `/247` | Toggle 24/7 mode |

### 🎵 Advanced (`/mextra`)
| Command | Fungsi |
|---|---|
| `/mextra seek <position>` | Lompat posisi (`90`, `1:30`, `1:30:45`, `1h30m`, `2m30s`) |
| `/mextra jump <n>` | Lompat ke track ke-N di queue |
| `/mextra remove <n>` | Hapus track by index |
| `/mextra move <from> <to>` | Reorder queue |
| `/mextra clearqueue` | Clear queue (lagu sekarang tetap) |
| `/mextra lyrics [query]` | Lirik dari lyrics.ovh (auto-detect current) |
| `/mextra favorite <action>` | add (now playing) / remove (url) / list / clear / play |
| `/mextra skipvote` | Vote skip (mayoritas) |

### 📋 Playlist (`/playlist`)
| Command | Fungsi |
|---|---|
| `/playlist list` | Lihat semua playlist kamu |
| `/playlist create <name>` | Buat playlist baru |
| `/playlist delete <name>` | Hapus (dengan confirm) |
| `/playlist rename <old> <new>` | Rename |
| `/playlist add <pl> <lagu>` | Tambah lagu/playlist URL |
| `/playlist remove <pl> <index>` | Hapus lagu by nomor |
| `/playlist clear <pl>` | Kosongkan isi |
| `/playlist view <pl>` | Lihat isi |
| `/playlist play <pl> [shuffle]` | Play seluruh isi |

### ⚙️ Settings & Help
| Command | Fungsi |
|---|---|
| `/music settings` | [ADMIN] Panel konfigurasi (24/7, DJ Role, Announce, Auto-Leave, Language) |
| `/music help` | Lihat help ini |
| `/music status` | Debug info (queue, voice, listeners, dll) |

## 🔐 Permission Tiers

| Tier | Bisa Apa |
|---|---|
| **Server Owner + Admin** | Settings, semua playback controls, playlist management semua user |
| **DJ Role** (configurable per guild) | Playback controls (skip, stop, loop, shuffle, queue mgmt) |
| **Member** | `/play`, `/nowplaying`, `/queue`, pause/resume, volume +/-, vote skip, favorites |

## 💾 Data Storage

Semua persistent data disimpan di folder `data/`:
- `data/music-state.json` — queue, current song, volume, loop (per-guild)
- `data/music-config.json` — 24/7, DJ role, announce channel, auto-leave, language (per-guild)
- `data/music-playlists.json` — playlist (per-user)
- `data/music-favorites.json` — favorit (per-user)
- `data/spotify-auth.json` — Spotify credentials (optional, lihat setup)
- `data/yt-cookies.txt` — YouTube cookies (optional, untuk bypass bot detection)

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure `.env`
```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_guild_id  # optional, untuk instant deploy
```

### 3. (Optional) Spotify support
Buat file `data/spotify-auth.json`:
```json
{
  "client_id": "your_spotify_client_id",
  "client_secret": "your_spotify_client_secret",
  "refresh_token": "your_refresh_token"
}
```
Dapatkan dari [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/) + OAuth flow.

### 4. (Optional) YouTube cookies
Buat file `data/yt-cookies.txt` dengan cookies YouTube Anda (format Netscape). Membantu bypass rate-limit di server besar.

### 5. Deploy slash commands
```bash
npm start
```

### 6. (Optional) Setup DJ Role & Announce
```text
/music settings
→ DJ Role: pilih role
→ Announce Channel: pilih channel
→ 24/7: aktifkan kalau perlu
```

## 🏗️ Arsitektur

```
music/
├── player.js        # AudioPlayer + queue manager + event emitter
├── extractors.js    # YouTube + Spotify resolver (search, video, playlist)
├── state.js         # Persistent state per-guild
├── config.js        # Per-guild config (24/7, DJ, announce, dll)
├── ui.js            # Now Playing + Queue embed builders
├── lyrics.js        # lyrics.ovh fetcher
├── favorites.js     # Per-user favorites
├── playlist.js      # Per-user playlists
├── skipvote.js      # Skip vote system
└── buttonHandler.js # Now Playing button router

commands/
├── play.js          # /play
├── skip.js          # /skip
├── stop.js          # /stop
├── pause.js         # /pause
├── disconnect.js    # /disconnect (alias)
├── nowplaying.js    # /nowplaying
├── queue.js         # /queue
├── loop.js          # /loop
├── shuffle.js       # /shuffle
├── volume.js        # /volume
├── 247.js           # /247
├── musicsettings.js # /music settings|help|status
├── musicextras.js   # /mextra (8 subcommands)
├── playlist.js      # /playlist (9 subcommands)
```

## 🧪 Testing

Push 1-5 dari music player punya **110+ unit tests** yang dijalankan lokal via `node _test*.mjs`. Tests cover:
- Extractors (URL detection, search, playlist resolution)
- Player state management (queue, loop, volume, skip)
- Button handlers (DJ permission, role checks, admin gating)
- Settings panel (24/7, auto-leave, DJ role, announce, language, reset)
- Per-user playlists (create/delete/rename/add/remove, limits, dedup)
- Favorites (add/remove/dedup/limit)
- Skip vote (majority detection, listener counting)
- Slash command integration (all 27 commands)
- Real API integration (lyrics.ovh)

## 🚀 Pterodactyl Deployment

1. Upload repo ke Pterodactyl
2. Set `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` di Environment Variables
3. Install dependencies: `npm install`
4. Startup command: `npm start`
5. Allocate 512MB+ RAM (1GB recommended untuk server besar)
6. Tunggu bot ready, lalu test `/play <judul>`

## 📝 Notes

- **No Lavalink required** — semua audio diproses di Node.js process. Untuk 1-5 server concurrent, RAM 512MB cukup.
- **Quality** — play-dl default quality 2 (medium-high). Bisa diturunkan di `player.js` kalau koneksi lambat.
- **Rate limits** — YouTube rate-limit bisa terjadi di server besar. Setup `data/yt-cookies.txt` untuk mitigate.
- **Spotify tracks** — di-resolve ke YouTube search karena play-dl tidak bisa stream Spotify langsung. Metadata tetap akurat.
- **Persistent state** — kalau bot restart, queue + current song dipertahankan. Bot harus ada di VC yang sama (kalau gak, auto-leave timer akan kick in).

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| "Sign in to confirm you're not a bot" | Tambah YouTube cookies di `data/yt-cookies.txt` |
| Spotify tidak bisa play | Setup `data/spotify-auth.json` dengan credentials valid |
| "Could not extract stream" | YouTube rate-limited. Tunggu atau pakai cookies |
| Bot gak stay di VC | Cek `/music status`, pastikan 24/7 mode aktif |
| Audio patah-patah | Reduce quality di `player.js` (line ~125: `quality: 0`) |
| Queue gak persist | Cek `data/music-state.json` ada & writeable |

## 🎉 Credits

- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://github.com/discordjs/voice)
- [play-dl](https://github.com/play-dl/play-dl) — YouTube + Spotify extractor
- [lyrics.ovh](https://lyrics.ovh/) — free lyrics API

Inspired by [Jockie Music](https://jockie.com/) bot.
