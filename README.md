# 🎣 Project Bot Discord

Discord bot multifungsi dengan beberapa fitur utama:

## ✨ Fitur

- 🎣 **Fishing System** — game mancing lengkap dengan zona, ikan, mutations, rods, baits, missions
- 📊 **Activity Tracker** — track chat activity, leaderboard, profile (`/activity`)
- 🎶 **Music Player** — Jockie-style music player dengan YouTube + Spotify, 24/7, playlist, favorites, skipvote, lyrics — [detail lengkap](./MUSIC_README.md)
- 🎫 **SikmaTicket** — sistem tiket support
- 🌳 **SikmaTree** — Linktree-style link collection per-server
- 🔍 **SikmaSearch** — search engine
- 🛡️ **Anti-Spam & Anti-Raid** — security utilities
- ⚙️ **Reactive Role** — reaction-based role assignment

## 🚀 Setup

```bash
# Install dependencies
npm install

# Setup .env
cp .env.example .env  # or create manually
# Required: DISCORD_TOKEN, CLIENT_ID, GUILD_ID (optional)

# (Optional) Setup Spotify
# Create data/spotify-auth.json with client_id, client_secret, refresh_token

# (Optional) YouTube cookies (bypass bot detection)
# Create data/yt-cookies.txt (Netscape format)

# Start bot
npm start
```

## 📚 Dokumentasi

- [Music Player](./MUSIC_README.md) — lengkap dengan daftar command, permission tiers, setup
- Lihat juga: `commands/` folder untuk semua command code, `utils/` untuk shared utilities

## 🛠️ Tech Stack

- Node.js >= 18
- discord.js v14
- @discordjs/voice + play-dl (music)
- ESM modules
- File-based JSON storage

## 📄 License

MIT
