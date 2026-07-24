# 🎣 Project Bot Discord

Discord bot multifungsi dengan beberapa fitur utama: fishing game, ticket support system, activity tracker, linktree, dan masih banyak lagi.

## ✨ Fitur Utama

| Kategori | Command | Deskripsi |
|----------|---------|-----------|
| 🎣 **Fishing System** | (slash) | Game mancing lengkap dengan zona, ikan, mutations, rods, baits, missions |
| 📊 **Activity Tracker** | `/activity` | Track chat activity, leaderboard, profile |
| 🎫 **Ticket System V2** | `/ticketv2` | Sistem tiket support Jockie-style (panel, modal, auto-features) |
| 🌳 **SikmaTree** | (slash) | Linktree-style link collection per-server |
| 🔍 **SikmaSearch** | (slash) | Search engine |
| 🛡️ **Anti-Spam & Anti-Raid** | (auto) | Security utilities |
| ⚙️ **Reactive Role** | (slash) | Reaction-based role assignment |

> Catatan: fitur music player sebelumnya sudah dihapus (commit `7a982a9`).

## 🚀 Setup

```bash
# Install dependencies
npm install

# Setup .env
cp .env.example .env  # or create manually
# Required: DISCORD_TOKEN, CLIENT_ID, GUILD_ID (optional)

# Start bot
npm start
```

**First-run otomatis:**
- SQLite database dibuat di `data/bot.db`
- Semua file JSON lama di-`data/*.json` di-migrasi ke SQLite (idempotent — hanya jalan sekali)

---

## 🎫 Ticket System V2 (Jockie-style)

Sistem tiket support lengkap dengan admin wizard (modal-based) dan user flow.

### Admin — `/ticketv2 settings`

Buka admin panel (Server Owner / Admin / Manage Server only).

**Subcommands:**
- `settings` — buka panel admin

**Menu utama:**
- ➕ **Buat Panel** — modal form (nama, deskripsi, warna hex)
- 📦 **Kelola Panel** — list panel, pilih untuk edit detail
- ⚙️ **Settings** — global toggles (analytics, auto-reminder, auto-close)
- 📊 **Analytics** — dashboard dengan chart

**Per-panel yang bisa di-manage (edit-in-place):**
- ✏️ Edit Info (nama, deskripsi, warna)
- 🎨 Edit Embed (banner, thumbnail, footer)
- 🎟️ Manage Tipe (tambah / hapus ticket type)
- 📁 Set Category (channel category untuk tiket baru)
- 👑 Set Staff Role (multi-select)
- ⚙️ Auto/Cooldown (cooldown, max tiket/user, auto-close, reminder)
- 🚀 **Publish** — pilih channel → bot post embed + buttons/select di sana
- 🗑️ Hapus Panel (konfirmasi ketik "HAPUS")

### User flow

User klik button/select di published panel → bot bikin channel tiket.

**Di dalam channel tiket:**
- Embed welcome dengan info tiket
- Tombol **✋ Claim** (staff only)
- Tombol **🔒 Tutup** (owner tiket atau staff)
- Close → embed close → channel auto-delete 5 detik kemudian

**Auto-features (per panel, di-toggle di Settings):**
- ⏰ **Auto-Close** — tiket yang tidak ada aktivitas > `autoCloseHours` jam → auto-close
- 🔔 **Auto-Reminder** — tiket > `reminderHours` jam tanpa staff response → mention staff (1x per tiket)

**Cooldown & limit (per panel):**
- `cooldownSeconds` — minimal jeda antara tiket (default 300s = 5 menit)
- `maxTicketsPerUser` — maksimal tiket aktif per user (default 1)

### Backward compatibility

Sistem tiket lama (V1: `sikmaticket.json` + `sikmaticketConfig.js`) tetap jalan. V1 panels & active tickets di-migrasi otomatis ke V2 saat pertama kali `/ticketv2 settings` dijalankan. V1 commands (`/sikmaticket`, dsb.) tidak di-disable — admin masih bisa pakai.

> Transcript feature di-defer (tidak di-include).

---

## 💾 Storage: SQLite

Semua data sekarang disimpan di **`data/bot.db`** (SQLite via `better-sqlite3`).
File JSON di `data/*.json` adalah fallback read-only yang auto-dihapus konfigurasinya dari kode (tapi file fisiknya tetap ada untuk arsip).

**Tabel yang dipakai:**
- `players`, `activity_data` — per-user data
- `fish_data`, `rod_data`, `bait_data`, `mutation_data`, `shop_data`, `mission_data`, `event_data`, `gamepass_data`, `level_rewards`, `spawn_config`, `zona_data` — config
- `security_config`, `reactionrole_data`, `sikmatree`, `sikmaticket`, `sikmasearch`, `fishing_config`, `activity_config` — per-guild config
- `ticketv2_panels`, `ticketv2_tickets`, `ticketv2_settings`, `ticketv2_analytics`, `ticketv2_panels_archived` — Ticket V2

Lihat `utils/db.js` untuk schema lengkap.

---

## 📚 Dokumentasi

- Lihat `commands/` folder untuk semua command code
- Lihat `utils/` untuk shared utilities (handlers, config, db, dll)

## 🛠️ Tech Stack

- **Node.js** >= 18 (ESM modules)
- **discord.js** v14.16.3
- **better-sqlite3** ^12.11.1 (primary storage)
- @discordjs/builders (EmbedBuilder, ActionRowBuilder, dll)

## 📄 License

MIT
