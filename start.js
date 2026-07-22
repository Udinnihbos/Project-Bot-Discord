import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const rest = new REST().setToken(TOKEN);

async function clearAndDeploy() {
  if (!TOKEN || !CLIENT_ID) {
    console.log('⚠️  CLIENT_ID tidak ditemukan di .env, skip deploy.');
    return;
  }

  const commands = [];
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const filePath = pathToFileURL(join(commandsPath, file)).href;
      const command = await import(filePath);
      if (command.data) commands.push(command.data.toJSON());
    } catch (e) {
      console.warn(`⚠️  Skip ${file}: ${e.message}`);
    }
  }

  try {
    // Selalu hapus global commands dulu biar tidak dobel
    console.log('🗑️  Menghapus global commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('✅ Global commands dihapus!');

    if (GUILD_ID) {
      // Deploy ke guild
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ Deploy ${commands.length} commands ke guild berhasil!`);
    } else {
      // Deploy global
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`✅ Deploy ${commands.length} commands global berhasil!`);
    }
  } catch (err) {
    console.error('❌ Deploy gagal:', err.message);
  }
}

await clearAndDeploy();

const bot = spawn('node', ['index.js'], { stdio: 'inherit' });
bot.on('close', code => process.exit(code));
