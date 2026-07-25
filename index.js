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
import { handleFishingRoleButton, handleFishingRoleSelect } from './commands/fishingrole.js';
import {
  handleTicketV2Component, handleTicketV2Select,
  handleTicketV2Modal, handleTicketV2ActionButton,
} from './commands/ticketv2.js';
import { handleTicketV2UserInteraction } from './utils/ticketv2UserHandler.js';
import { trackTicketMessage } from './utils/ticketv2Flow.js';
import { startAutoFeatureLoop } from './utils/ticketv2Auto.js';
import { startNotifierLoop } from './utils/notifierScheduler.js';
import { handleNotifierModal } from './commands/notifier.js';
import {
  handleAnnounceComponentFull, handleAnnounceModal,
  handleAnnounceChannelSelect, handleAnnounceSelect,
  handleAnnouncePermissions,
} from './commands/announce.js';
import { startAnnounceScheduler } from './utils/announceScheduler.js';
import { handleReactionRoleComponent, handleReactionRoleModal } from './commands/reactionrole.js';
import { handleAdminFishingComponent, handleAdminFishingModal } from './commands/adminfishing.js';
import { initDB } from './utils/db.js';

// Initialize SQLite (auto-migrates from JSON on first run)
initDB();

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
  startAutoFeatureLoop(client);
  startNotifierLoop(client);
  startAnnounceScheduler(client);
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
  // Ticket V2 message tracker (increments count, marks first staff response)
  try { await trackTicketMessage(message); } catch (e) { console.error('TicketV2 message tracker error:', e.message); }
  // SikmaSearch: user tags bot → reply with search results
  try { await handleSikmasearch(message, client); } catch (e) { console.error('SikmaSearch error:', e.message); }
});

client.on('interactionCreate', async interaction => {
  // Global error wrapper — prevents unhandled errors from crashing the bot
  try {
    return await handleInteraction(interaction);
  } catch (error) {
    console.error(`[interactionCreate] Unhandled error (customId=${interaction.customId || 'n/a'}):`, error);
    try {
      const errMsg = { content: '❌ Terjadi error tak terduga. Coba lagi.', flags: 64 };
      if (interaction.replied) await interaction.followUp(errMsg);
      else if (interaction.deferred) await interaction.editReply(errMsg);
      else if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.() || interaction.isModalSubmit?.()) {
        await interaction.reply({ ...errMsg, ephemeral: true });
      } else {
        await interaction.reply(errMsg);
      }
    } catch (e) {
      // Interaction token expired, can't respond — just log
      console.warn('[interactionCreate] Cannot respond to failed interaction:', e.message);
    }
  }
});

async function handleInteraction(interaction) {
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
  // Fishing Role (admin panel for role-gating)
  if (interaction.isButton() && interaction.customId.startsWith('fishrole_')) {
    return handleFishingRoleButton(interaction);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('fishrole_')) {
    return handleFishingRoleSelect(interaction);
  }
  // Ticket V2 (admin settings, panel management, type management)
  if (interaction.isButton() && interaction.customId.startsWith('tv2_')) {
    return handleTicketV2Component(interaction) || handleTicketV2ActionButton(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tv2_')) {
    return handleTicketV2Select(interaction);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('tv2_')) {
    return handleTicketV2Select(interaction);
  }
  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('tv2_')) {
    return handleTicketV2Select(interaction);
  }
  // Notifier (channel select for set destination channel)
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('nt_')) {
    // The collector inside execute() handles this, but if it expired, ignore
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('tv2_')) {
    return handleTicketV2Modal(interaction);
  }
  // Notifier (modals: nt_modal_*)
  if (interaction.isModalSubmit() && interaction.customId.startsWith('nt_modal_')) {
    return handleNotifierModal(interaction);
  }
  // Reaction Role V2 (admin component/modal: rr_modal_*, af_modal_*)
  if (interaction.customId?.startsWith('rr_') && !interaction.customId.startsWith('rr_dropdown_') && !interaction.customId.startsWith('rr_btn_')) {
    if (interaction.isModalSubmit()) return handleReactionRoleModal(interaction);
    return handleReactionRoleComponent(interaction);
  }
  // Adminfishing V2 (af_* components and modals)
  if (interaction.customId?.startsWith('af_')) {
    if (interaction.isModalSubmit()) return handleAdminFishingModal(interaction);
    return handleAdminFishingComponent(interaction);
  }
  // Announce V2 (components, modals, channel/role/select menus)
  if (interaction.customId && interaction.customId.startsWith('ann_')) {
    if (interaction.isModalSubmit()) return handleAnnounceModal(interaction);
    if (interaction.isChannelSelectMenu()) return handleAnnounceChannelSelect(interaction);
    if (interaction.isRoleSelectMenu()) return handleAnnouncePermissions(interaction);
    if (interaction.isStringSelectMenu()) return handleAnnounceSelect(interaction);
    return handleAnnounceComponentFull(interaction);
  }
  // Ticket V2 (user-facing: open ticket, claim, close)
  if (interaction.customId && interaction.customId.startsWith('tv2u_')) {
    return handleTicketV2UserInteraction(interaction);
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
}

client.login(process.env.DISCORD_TOKEN);
