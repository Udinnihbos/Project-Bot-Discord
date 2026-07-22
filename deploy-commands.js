import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Opsional: kalau diisi deploy ke 1 server (lebih cepat)

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN dan CLIENT_ID harus diisi di file .env!');
  process.exit(1);
}

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

console.log(`📦 Loading ${commandFiles.length} commands...\n`);

for (const file of commandFiles) {
  const filePath = pathToFileURL(join(commandsPath, file)).href;
  const command = await import(filePath);
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`✅ ${command.data.name}`);
  } else {
    console.log(`⚠️  Skipped: ${file} (no data export)`);
  }
}

const rest = new REST().setToken(TOKEN);

try {
  console.log(`\n🚀 Deploying ${commands.length} slash commands...\n`);

  let data;
  if (GUILD_ID) {
    // Deploy ke satu server (instant, untuk testing)
    data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Berhasil deploy ${data.length} commands ke server (Guild ID: ${GUILD_ID})`);
  } else {
    // Deploy global (butuh ~1 jam untuk aktif)
    data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log(`✅ Berhasil deploy ${data.length} commands secara global`);
    console.log('⏳ Global commands butuh ~1 jam untuk aktif di semua server.');
  }

  console.log('\n🎉 Deploy selesai! Restart bot dengan: npm start');

} catch (error) {
  console.error('❌ Deploy gagal:', error);
}
