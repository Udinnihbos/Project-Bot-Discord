import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getActiveEvents } from '../utils/database.js';
import { formatDuration, RARITY_ORDER } from '../utils/fishing.js';
import { getCurrentWeather } from '../utils/weather.js';

export const data = new SlashCommandBuilder()
  .setName('cuaca')
  .setDescription('🌤️ Cek cuaca otomatis dan event yang sedang aktif!');

export async function execute(interaction) {
  const weather = getCurrentWeather();
  const events = getActiveEvents();
  const embeds = [];

  // Auto weather embed
  const weatherMultLines = RARITY_ORDER.map(r => {
    const mult = weather.rarityMultipliers?.[r] ?? 1;
    const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
    const pct = mult > 1 ? `(+${Math.round((mult-1)*100)}%)` : mult < 1 ? `(-${Math.round((1-mult)*100)}%)` : '(normal)';
    return `${arrow} **${r}**: ×${mult} ${pct}`;
  }).join('\n');

  const luckText = weather.luckBonus >= 0 ? `+${weather.luckBonus}%` : `${weather.luckBonus}%`;

  embeds.push(new EmbedBuilder()
    .setColor(weather.color)
    .setTitle(`${weather.emoji} Cuaca Otomatis: ${weather.name}`)
    .setDescription(weather.description)
    .addFields(
      { name: '⏰ Waktu', value: weather.timeRange + ' WIB', inline: true },
      { name: '🍀 Luck', value: luckText, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Efek per Rarity', value: weatherMultLines }
    )
    .setFooter({ text: 'Cuaca otomatis berubah sesuai waktu WIB' })
    .setTimestamp()
  );

  // Manual events
  if (events.length > 0) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const remaining = event.endsAt ? event.endsAt - Date.now() : null;
      const multLines = RARITY_ORDER.map(r => {
        const mult = event.rarityMultipliers?.[r] ?? 1;
        const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
        const pct = mult > 1 ? `(+${Math.round((mult-1)*100)}%)` : mult < 1 ? `(-${Math.round((1-mult)*100)}%)` : '(normal)';
        return `${arrow} **${r}**: ×${mult} ${pct}`;
      }).join('\n');

      const evLuck = event.luckMultiplyMode ? `×${event.luckMultiplier || 1} luck` : `+${event.luckBonus}%`;

      embeds.push(new EmbedBuilder()
        .setColor(event.color || '#f39c12')
        .setTitle(`${event.emoji} Event [${i+1}/${events.length}]: ${event.name}`)
        .setDescription(event.description)
        .addFields(
          { name: '⏱️ Sisa Waktu', value: remaining ? formatDuration(remaining) : '∞', inline: true },
          { name: '🍀 Luck', value: evLuck, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: '📊 Efek per Rarity', value: multLines }
        )
        .setFooter({ text: `ID: ${event.id}` })
        .setTimestamp()
      );
    }
  }

  await interaction.reply({ embeds, ephemeral: true });
}
