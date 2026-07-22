import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { handleReactionRole } from './utils/reactionroleHandler.js';
import { startWeatherNotifier } from './utils/weatherNotifier.js';
import { startSpawnNotifier } from './utils/spawnNotifier.js';
import { checkSpam, checkRaid } from './utils/security.js';
import { handleSikmatreeSelect } from './utils/sikmatreeHandler.js';
import { handleSikmasearch } from './utils/sikmasearchHandler.js';
import { handleSikmaticket } from './utils/sikmaticketHandler.js';
import { handleActivityComponent, handleActivitySelect, handleActivityModal, handleActivityMessageCreate } from './commands/activity.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
  ]
});

client.commands = new Collection();

// Load slash commands
const commandsPath = resolve(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = pathToFileURL(join(commandsPath, file)).href;
  const command = await import(filePath);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Command loaded: ${command.data.name}`);
  }
}

client.once('ready', () => {
  console.log(`\n🎣 Bot aktif sebagai ${client.user.tag}`);
  console.log(`📦 ${client.commands.size} slash commands siap!`);
  client.user.setActivity('🎣 Memancing...', { type: 0 });
  startWeatherNotifier(client);
  startSpawnNotifier(client);
});

// Anti-Raid
client.on('guildMemberAdd', async member => {
  try { await checkRaid(member, client); } catch (e) { console.error('Anti-raid error:', e.message); }
});

// Anti-Spam + Activity Tracker
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  try { await checkSpam(message); } catch (e) { console.error('Anti-spam error:', e.message); }
  try { await handleActivityMessageCreate(message); } catch (e) { console.error('Activity tracker error:', e.message); }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rr_dropdown_')) {
    return handleReactionRole(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('st_pub_')) {
    return handleSikmatreeSelect(interaction);
  }
  // SikmaTicket: open ticket via button (public panels only)
  if (interaction.isButton() && /^skt_btn_\d{15,20}_/.test(interaction.customId)) {
    return handleSikmaticket(interaction);
  }
  // SikmaTicket: open ticket via select menu (public panels only)
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('skt_pub_')) {
    return handleSikmaticket(interaction);
  }
  // SikmaTicket: close/claim ticket buttons
  if (interaction.isButton() && /^skt_(close|claim)_\d{15,20}_/.test(interaction.customId)) {
    return handleSikmaticket(interaction);
  }
  if (interaction.isButton() && interaction.customId.startsWith('rr_btn_')) {
    return handleReactionRole(interaction);
  }
  // Activity Tracker (settings, leaderboard paging, publish, reset)
  if (
    (interaction.isButton() && interaction.customId.startsWith('act_')) ||
    (interaction.isChannelSelectMenu() && interaction.customId.startsWith('act_')) ||
    (interaction.isStringSelectMenu() && interaction.customId.startsWith('act_')) ||
    (interaction.isModalSubmit() && interaction.customId.startsWith('act_'))
  ) {
    if (interaction.isButton()) return handleActivityComponent(interaction);
    if (interaction.isModalSubmit()) return handleActivityModal(interaction);
    return handleActivitySelect(interaction);
  }
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); } catch (err) { console.error(err); }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error [${interaction.commandName}]:`, error);
    const errMsg = { content: '❌ Terjadi error!', flags: 64 };
    if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
    else await interaction.reply(errMsg);
  }
});

client.login(process.env.DISCORD_TOKEN);
