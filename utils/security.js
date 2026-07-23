import { read, write } from './db.js';

const DEFAULT_CONFIG = {
  antiRaid: {
    enabled: false,
    joinThreshold: 5,
    joinWindowSeconds: 10,
    minAccountAgeDays: 3,
    action: 'kick',
    autoLockdown: true,
    logChannelId: null,
  },
  antiSpam: {
    enabled: false,
    messageThreshold: 5,
    messageWindowSeconds: 5,
    duplicateThreshold: 3,
    mentionThreshold: 5,
    action: 'timeout',
    timeoutDurationMinutes: 10,
    deleteMessages: true,
    logChannelId: null,
  },
  whitelistUserIds: [],
  whitelistRoleIds: [],
  lockdown: { active: false, lockedChannelIds: [] },
};

export function getSecurityConfig() {
  let data = read('security_config', 'global');
  if (!data) {
    data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    write('security_config', 'global', data);
  }
  return {
    ...DEFAULT_CONFIG,
    ...data,
    antiRaid: { ...DEFAULT_CONFIG.antiRaid, ...data.antiRaid },
    antiSpam: { ...DEFAULT_CONFIG.antiSpam, ...data.antiSpam },
    lockdown: { ...DEFAULT_CONFIG.lockdown, ...data.lockdown },
  };
}

export function saveSecurityConfig(config) {
  write('security_config', 'global', config);
}

const recentJoins = [];
const userMessageLog = new Map();
const userViolations = new Map();

function isWhitelisted(member, config) {
  if (config.whitelistUserIds.includes(member.id)) return true;
  if (member.roles?.cache?.some(r => config.whitelistRoleIds.includes(r.id))) return true;
  if (member.permissions?.has?.('Administrator')) return true;
  return false;
}

export async function checkRaid(member, client) {
  const config = getSecurityConfig();
  if (!config.antiRaid.enabled) return null;

  const now = Date.now();
  const accountAgeDays = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

  recentJoins.push({ userId: member.id, timestamp: now, accountAgeDays });

  const windowMs = config.antiRaid.joinWindowSeconds * 1000;
  while (recentJoins.length && now - recentJoins[0].timestamp > windowMs) recentJoins.shift();

  if (recentJoins.length >= config.antiRaid.joinThreshold) {
    await triggerRaidResponse(member.guild, client, config, recentJoins.slice());
    return { triggered: true, reason: 'mass_join', count: recentJoins.length };
  }

  return null;
}

async function triggerRaidResponse(guild, client, config, joinedMembers) {
  if (config.antiRaid.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(config.antiRaid.logChannelId);
      await logChannel.send({
        embeds: [{
          color: 0xe74c3c,
          title: '🚨 RAID TERDETEKSI!',
          description: `**${joinedMembers.length} member** join dalam ${config.antiRaid.joinWindowSeconds} detik!`,
          fields: [
            { name: '⚔️ Aksi', value: config.antiRaid.action === 'ban' ? 'Ban' : 'Kick', inline: true },
            { name: '🔒 Lockdown', value: config.antiRaid.autoLockdown ? 'Aktif' : 'Tidak', inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    } catch {}
  }

  for (const j of joinedMembers) {
    try {
      const member = await guild.members.fetch(j.userId).catch(() => null);
      if (!member || member.permissions?.has?.('Administrator')) continue;
      if (config.antiRaid.action === 'ban') {
        await member.ban({ reason: 'Auto anti-raid: mass join' });
      } else {
        await member.kick('Auto anti-raid: mass join');
      }
    } catch {}
  }

  if (config.antiRaid.autoLockdown) await activateLockdown(guild, config);
  recentJoins.length = 0;
}

export async function activateLockdown(guild, config = null) {
  config = config || getSecurityConfig();
  if (config.lockdown.active) return;

  const lockedChannels = [];
  const everyoneRole = guild.roles.everyone;

  for (const [, channel] of guild.channels.cache) {
    if (channel.type !== 0) continue;
    try {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      lockedChannels.push(channel.id);
    } catch {}
  }

  config.lockdown = { active: true, lockedChannelIds: lockedChannels };
  saveSecurityConfig(config);
}

export async function deactivateLockdown(guild, config = null) {
  config = config || getSecurityConfig();
  if (!config.lockdown.active) return;

  const everyoneRole = guild.roles.everyone;
  for (const channelId of config.lockdown.lockedChannelIds) {
    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
    } catch {}
  }

  config.lockdown = { active: false, lockedChannelIds: [] };
  saveSecurityConfig(config);
}

export async function checkSpam(message) {
  const config = getSecurityConfig();
  if (!config.antiSpam.enabled) return null;
  if (message.author.bot) return null;
  if (isWhitelisted(message.member, config)) return null;

  const userId = message.author.id;
  const now = Date.now();

  if (!userMessageLog.has(userId)) userMessageLog.set(userId, []);
  const log = userMessageLog.get(userId);
  log.push({ content: message.content, timestamp: now });

  const windowMs = config.antiSpam.messageWindowSeconds * 1000;
  while (log.length && now - log[0].timestamp > windowMs) log.shift();

  let reason = null;

  if (log.length >= config.antiSpam.messageThreshold) reason = 'rate_limit';

  if (!reason) {
    const dupes = log.filter(l => l.content === message.content && l.content.length > 0).length;
    if (dupes >= config.antiSpam.duplicateThreshold) reason = 'duplicate_message';
  }

  if (!reason) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions >= config.antiSpam.mentionThreshold) reason = 'mass_mention';
  }

  if (!reason && message.mentions.everyone) reason = 'everyone_mention';

  if (reason) {
    await handleSpamViolation(message, config, reason);
    log.length = 0;
    return { triggered: true, reason };
  }

  return null;
}

async function handleSpamViolation(message, config, reason) {
  const userId = message.author.id;
  const violations = (userViolations.get(userId) || 0) + 1;
  userViolations.set(userId, violations);

  const reasonLabels = {
    rate_limit: 'Pesan terlalu cepat',
    duplicate_message: 'Spam pesan sama',
    mass_mention: 'Mass mention',
    everyone_mention: 'Abuse @everyone/@here',
  };

  if (config.antiSpam.deleteMessages) {
    try { await message.delete(); } catch {}
    try {
      const recent = await message.channel.messages.fetch({ limit: 20 });
      const toDelete = recent.filter(m => m.author.id === userId && Date.now() - m.createdTimestamp < 15000);
      if (toDelete.size > 0) await message.channel.bulkDelete(toDelete).catch(() => {});
    } catch {}
  }

  try {
    const member = message.member;
    if (config.antiSpam.action === 'timeout') {
      await member.timeout(config.antiSpam.timeoutDurationMinutes * 60 * 1000, `Anti-spam: ${reasonLabels[reason]}`);
    } else if (config.antiSpam.action === 'kick') {
      await member.kick(`Anti-spam: ${reasonLabels[reason]}`);
    }
  } catch {}

  if (config.antiSpam.logChannelId) {
    try {
      const logChannel = await message.guild.channels.fetch(config.antiSpam.logChannelId);
      await logChannel.send({
        embeds: [{
          color: 0xe67e22,
          title: '🛡️ Anti-Spam Triggered',
          fields: [
            { name: '👤 User', value: `<@${userId}> (${message.author.tag})`, inline: true },
            { name: '📋 Alasan', value: reasonLabels[reason], inline: true },
            { name: '⚔️ Aksi', value: config.antiSpam.action === 'timeout' ? `Timeout ${config.antiSpam.timeoutDurationMinutes} menit` : 'Kick', inline: true },
            { name: '📊 Violations', value: `${violations}x`, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    } catch {}
  }
}

export function resetUserViolations(userId) {
  userViolations.delete(userId);
  userMessageLog.delete(userId);
}
