import { read, write, readBlob, writeBlob } from './db.js';
import { EmbedBuilder } from 'discord.js';

/**
 * Per-guild fishing config.
 * shape: { [guildId]: { fishingRoleId: string|null } }
 */

function loadAll() { return readBlob('fishing_config', 'all') || {}; }
function saveAll(db) { writeBlob('fishing_config', db, 'all'); }

export function getFishingConfig(guildId) {
  const all = loadAll();
  if (!all[guildId]) {
    all[guildId] = { fishingRoleId: null };
    saveAll(all);
  }
  return all[guildId];
}

export function setFishingRole(guildId, roleId) {
  const all = loadAll();
  if (!all[guildId]) all[guildId] = { fishingRoleId: null };
  all[guildId].fishingRoleId = roleId || null;
  saveAll(all);
  return all[guildId];
}

export function clearFishingRole(guildId) {
  return setFishingRole(guildId, null);
}

/**
 * Check if user has access to fishing commands.
 */
export function hasFishingAccess(interaction) {
  if (!interaction.guild) return { allowed: false, reason: 'Command ini cuma untuk server.' };
  if (interaction.guild.ownerId === interaction.user.id) return { allowed: true };
  const member = interaction.member;
  if (member?.permissions?.has?.('Administrator')) return { allowed: true };
  if (member?.permissions?.has?.('ManageGuild')) return { allowed: true };

  const cfg = getFishingConfig(interaction.guild.id);
  if (!cfg.fishingRoleId) {
    return { allowed: false, reason: 'Fishing role belum di-setup di server ini. Minta admin set via `/fishingrole`.' };
  }
  if (member?.roles?.cache?.has?.(cfg.fishingRoleId)) return { allowed: true };

  return {
    allowed: false,
    reason: `Command ini cuma untuk member dengan role <@&${cfg.fishingRoleId}> (Pemancing). Minta admin kalau kamu harus bisa akses.`,
  };
}

export function denyEmbed(interaction) {
  const cfg = interaction.guild ? getFishingConfig(interaction.guild.id) : null;
  const roleText = cfg?.fishingRoleId ? `<@&${cfg.fishingRoleId}>` : '*belum diset*';
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🎣 Akses Ditolak — Khusus Pemancing')
    .setDescription(
      [
        `Maaf <@${interaction.user.id}>, command mancing & fitur terkait cuma untuk role **Pemancing** (${roleText}).`,
        '',
        '**Yang bisa akses:**',
        '• Server Owner',
        '• Administrator / Manage Server',
        '• Member dengan role Pemancing',
        '',
        'Belum punya role-nya? Minta admin server.',
      ].join('\n')
    )
    .setFooter({ text: '🎣 Fishing System • Role-gated' });
}
