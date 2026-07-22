import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData } from './sikmatreeConfig.js';

export async function handleSikmatreeSelect(interaction) {
  const guildId = interaction.customId.replace('st_pub_', '');
  const selectedId = interaction.values[0];

  const guildData = getGuildData(guildId);
  const link = guildData.links.find(l => l.id === selectedId);

  if (!link) {
    return interaction.reply({ content: '❌ Link tidak ditemukan.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ name: 'SikmaTree', iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${link.emoji || '🔗'} ${link.title}`)
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  if (link.description) embed.setDescription(link.description);

  embed.addFields({ name: '🔗 URL', value: `\`${link.url}\`` });

  if (link.imageUrl) embed.setImage(link.imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(`Buka ${link.title}`)
      .setStyle(ButtonStyle.Link)
      .setURL(link.url)
      .setEmoji(link.emoji || '🔗')
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
