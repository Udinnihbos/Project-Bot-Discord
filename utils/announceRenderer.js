/**
 * Announce Renderer — shared logic for building & permission checking.
 *
 * Used by both commands/announce.js and utils/announceScheduler.js.
 */

import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from './announceConfig.js';
import { substituteVars } from './announceVars.js';

/**
 * Check if user can use /announce.
 * Allowed: OWNER_ID or member with one of allowedRoles.
 */
export function canUseAnnounce(interaction) {
  if (interaction.user.id === process.env.OWNER_ID) return { allowed: true };
  const config = getGuildConfig(interaction.guildId);
  if (!config.allowedRoles?.length) {
    return { allowed: false, reason: 'Kamu tidak punya izin untuk /announce. Hubungi server owner.' };
  }
  const memberRoles = interaction.member?.roles?.cache;
  if (!memberRoles) return { allowed: false, reason: 'Tidak bisa cek role.' };
  for (const roleId of config.allowedRoles) {
    if (memberRoles.has(roleId)) return { allowed: true };
  }
  return { allowed: false, reason: 'Kamu butuh role khusus untuk /announce.' };
}

/**
 * Render an embed from announce content.
 * @param {object} content { emoji, color, title, description, footer, author, image, thumbnail, fields }
 * @param {object} context { guild, user? }
 */
export function renderAnnounce(content, context = {}) {
  const { guild } = context;
  const embed = new EmbedBuilder()
    .setColor((content.color || '#3498db').replace('#', '').padStart(6, '0').length === 6
      ? parseInt(content.color.replace('#', ''), 16)
      : 0x3498db)
    .setTitle(`${content.emoji || '📢'} ${substituteVars(content.title || 'Pengumuman', context)}`.slice(0, 256))
    .setDescription(substituteVars(content.description || '', context).slice(0, 4096))
    .setTimestamp();

  if (content.footer) {
    embed.setFooter({ text: substituteVars(content.footer, context).slice(0, 2048) });
  }
  if (content.author?.name) {
    embed.setAuthor({
      name: substituteVars(content.author.name, context).slice(0, 256),
      iconURL: content.author.iconUrl || undefined,
    });
  }
  if (content.thumbnail) embed.setThumbnail(content.thumbnail.slice(0, 1024));
  if (content.image || content.bannerUrl) {
    embed.setImage((content.image || content.bannerUrl).slice(0, 1024));
  }
  if (content.fields?.length) {
    for (const f of content.fields.slice(0, 25)) {
      embed.addFields({
        name: substituteVars(f.name, context).slice(0, 256),
        value: substituteVars(f.value, context).slice(0, 1024),
        inline: !!f.inline,
      });
    }
  }

  return embed;
}

/**
 * Truncate content for safety (Discord limits).
 */
export function safeText(s, max = 4096) {
  if (!s) return s;
  return String(s).slice(0, max);
}
