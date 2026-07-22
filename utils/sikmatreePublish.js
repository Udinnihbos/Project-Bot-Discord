import {
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getGuildData, saveGuildData } from './sikmatreeConfig.js';

export function getSortedLinks(guildData) {
  return [...guildData.links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function buildPublicEmbed(guildData, guild) {
  const sorted = getSortedLinks(guildData);

  const preview = sorted.slice(0, 6).map(l =>
    `${l.emoji || '🔗'} **${l.title}**${l.description ? `\n┗ *${l.description.substring(0, 70)}${l.description.length > 70 ? '…' : ''}*` : ''}`
  ).join('\n\n');

  const extra = sorted.length > 6 ? `\n\n*…dan ${sorted.length - 6} link lainnya*` : '';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle('🌳 SikmaTree')
    .setDescription(`${preview}${extra}\n\n**Pilih link di bawah untuk melihat detailnya!**`)
    .setThumbnail(guild.iconURL({ dynamic: true }) ?? null)
    .setFooter({ text: `${sorted.length} link tersedia  •  ${guild.name}` })
    .setTimestamp();
}

export function buildPublicComponents(guildData, guildId) {
  const sorted = getSortedLinks(guildData);
  if (sorted.length === 0) return [];

  const options = sorted.slice(0, 25).map(link =>
    new StringSelectMenuOptionBuilder()
      .setLabel(link.title.substring(0, 100))
      .setDescription((link.description || link.url).substring(0, 100))
      .setValue(link.id)
      .setEmoji(link.emoji || '🔗')
  );

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`st_pub_${guildId}`)
        .setPlaceholder('🔗 Pilih link untuk melihat detail…')
        .addOptions(options)
    )
  ];
}

export async function publishOrUpdate(client, guildId, forceNew = false) {
  const guildData = getGuildData(guildId);
  if (!guildData.channelId) return { success: false, error: 'Channel belum diset.' };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { success: false, error: 'Guild tidak ditemukan.' };

  const channel = await guild.channels.fetch(guildData.channelId).catch(() => null);
  if (!channel) return { success: false, error: 'Channel tidak ditemukan.' };

  const embed = buildPublicEmbed(guildData, guild);
  const components = buildPublicComponents(guildData, guildId);

  if (guildData.messageId && !forceNew) {
    try {
      const msg = await channel.messages.fetch(guildData.messageId);
      await msg.edit({ embeds: [embed], components });
      return { success: true, isUpdate: true };
    } catch { /* pesan hilang, kirim baru */ }
  }

  try {
    const msg = await channel.send({ embeds: [embed], components });
    saveGuildData(guildId, { ...guildData, messageId: msg.id });
    return { success: true, isUpdate: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
