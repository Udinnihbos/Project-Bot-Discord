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
import { handleMusicButton } from './music/buttonHandler.js';
import { onPlayerEvent, is247, getPlayerStatus } from './music/player.js';
import { getGuildState, patchGuildState } from './music/state.js';
import { getMusicConfig } from './music/config.js';
import { buildNowPlayingEmbed, buildNowPlayingRows, buildIdleEmbed } from './music/ui.js';

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
    GatewayIntentBits.GuildVoiceStates,
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
  setupMusicListeners(client);
});

function setupMusicListeners(c) {
  // Auto-update Now Playing message saat lagu ganti
  onPlayerEvent(async (evt) => {
    if (evt.type === 'songStart') {
      const guild = c.guilds.cache.get(evt.guildId);
      if (!guild) return;
      const state = evt.state;
      const msgId = state.nowPlayingMessageId;
      if (!msgId) return;
      const textChId = state.textChannelId;
      if (!textChId) return;
      const ch = await guild.channels.fetch(textChId).catch(() => null);
      if (!ch) return;
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      if (!msg) return;
      const embed = buildNowPlayingEmbed(guild, evt.song, state);
      const rows = buildNowPlayingRows(evt.guildId);
      await msg.edit({ embeds: [embed], components: rows }).catch(() => {});
    }

    if (evt.type === 'stopped' || evt.type === 'queueEmpty') {
      // mark now playing as idle
      const guild = c.guilds.cache.get(evt.guildId);
      if (!guild) return;
      const state = getGuildState(evt.guildId);
      const msgId = state.nowPlayingMessageId;
      if (!msgId) return;
      const textChId = state.textChannelId;
      if (!textChId) return;
      const ch = await guild.channels.fetch(textChId).catch(() => null);
      if (!ch) return;
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      if (!msg) return;
      const idleEmbed = buildIdleEmbed(guild);
      if (evt.type === 'stopped') {
        await msg.edit({ embeds: [idleEmbed.setTitle('⏹️ Dihentikan')], components: [] }).catch(() => {});
      } else {
        // queueEmpty — check 24/7
        if (is247(evt.guildId)) return; // bot stays
        await msg.edit({ embeds: [idleEmbed], components: buildNowPlayingRows(evt.guildId) }).catch(() => {});
      }
    }
  });

  // Voice state: kalau bot sendirian di VC (no users), schedule auto-leave
  c.on('voiceStateUpdate', async (oldState, newState) => {
    // Bot yang leave? skip
    if (newState.id === c.user.id) return;
    // Cari guild yang affected
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const state = getGuildState(guild.id);
    if (!state.voiceChannelId) return;
    const voiceCh = await guild.channels.fetch(state.voiceChannelId).catch(() => null);
    if (!voiceCh) return;
    // Count non-bot members
    const humans = voiceCh.members.filter(m => !m.user.bot);
    if (humans.size > 0) return; // ada orang, gak apa-apa

    // Kalau 24/7 aktif, gak leave
    if (is247(guild.id)) return;

    // Check autoLeaveMinutes setting
    const cfg = getMusicConfig(guild.id);
    const minutes = cfg.autoLeaveMinutes ?? 5;
    if (minutes === 0) return; // never auto-leave

    // Schedule leave
    setTimeout(async () => {
      const fresh = getGuildState(guild.id);
      if (!fresh.voiceChannelId) return;
      const v2 = await guild.channels.fetch(fresh.voiceChannelId).catch(() => null);
      if (!v2) return;
      const stillEmpty = v2.members.filter(m => !m.user.bot).size === 0;
      if (stillEmpty && !is247(guild.id)) {
        const { stop } = await import('./music/player.js');
        stop(guild.id);
        console.log(`[${guild.id}] Auto-leave: VC kosong selama ${minutes} menit`);
      }
    }, minutes * 60 * 1000).unref?.();
  });
}

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
  // Music Player (Now Playing buttons, queue paging)
  if (interaction.isButton() && interaction.customId.startsWith('music_')) {
    return handleMusicButton(interaction);
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
