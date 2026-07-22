import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';

config();

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const CLIENT_ID = process.env.CLIENT_ID;

console.log('🗑️  Menghapus semua global commands...');
await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
console.log('✅ Selesai! Semua global commands dihapus.');
console.log('⚠️  Ganti startup command kembali ke: node start.js');
