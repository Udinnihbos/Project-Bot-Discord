import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/fishing-config.json');

/**
 * Per-guild fishing config.
 * shape: {
 *   [guildId]: {
 *     fishingRoleId: string|null,
 *     // boleh akses command mancing & turunannya:
 *     // - Server Owner (always)
 *     // - Administrator (always)
 *     // - user dengan role fishingRoleId
 *     // - bisa ditambah: bypassRoles: string[] (optional future)
 *   }
 * }
 */
function load() {
  if (!existsSync(DB_PATH)) return {};
  try { return JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}
function save(data) { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

export function getFishingConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = { fishingRoleId: null };
    save(all);
  }
  return all[guildId];
}

export function setFishingRole(guildId, roleId) {
  const all = load();
  if (!all[guildId]) all[guildId] = { fishingRoleId: null };
  all[guildId].fishingRoleId = roleId || null;
  save(all);
  return all[guildId];
}

export function clearFishingRole(guildId) {
  return setFishingRole(guildId, null);
}

/**
 * Check if user has access to fishing commands.
 * Returns { allowed: boolean, reason?: string }
 *
 * Allowed if:
 * - Server Owner
 * - Administrator permission
 * - Has the configured fishing role
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
