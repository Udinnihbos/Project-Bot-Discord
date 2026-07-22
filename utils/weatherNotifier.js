import { EmbedBuilder } from 'discord.js';
import { getCurrentWeather } from './weather.js';
import { getEventData, saveEventData, getActiveEvents, addActiveEvent, removeActiveEvent } from './database.js';
import { RARITY_ORDER } from './fishing.js';

const ANNOUNCE_CHANNEL_ID = '1481982935413555291';
const WEATHER_CHANGE_HOURS = [0, 6, 12, 15, 18];

// Random event cuaca otomatis, muncul tiap 20-60 menit (random)
const AUTO_EVENT_INTERVAL_MIN = 20;  // menit
const AUTO_EVENT_INTERVAL_MAX = 60;  // menit
const AUTO_EVENT_DURATION_MIN = 15;  // menit
const AUTO_EVENT_DURATION_MAX = 45;  // menit

function getNextChangeMs() {
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const currentHour = wib.getUTCHours();
  const currentMin = wib.getUTCMinutes();
  const currentSec = wib.getUTCSeconds();
  const currentMs = wib.getUTCMilliseconds();

  const nextHour = WEATHER_CHANGE_HOURS.find(h => h > currentHour) ?? WEATHER_CHANGE_HOURS[0];
  let msUntilNext;
  if (nextHour > currentHour) {
    msUntilNext = ((nextHour - currentHour) * 3600 - currentMin * 60 - currentSec) * 1000 - currentMs;
  } else {
    msUntilNext = ((24 - currentHour + nextHour) * 3600 - currentMin * 60 - currentSec) * 1000 - currentMs;
  }
  return Math.max(msUntilNext, 1000);
}

function buildWeatherEmbed(weather) {
  const multLines = RARITY_ORDER.map(r => {
    const mult = weather.rarityMultipliers?.[r] ?? 1;
    const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
    const pct = mult > 1 ? `(+${Math.round((mult - 1) * 100)}%)` : mult < 1 ? `(-${Math.round((1 - mult) * 100)}%)` : '(normal)';
    return `${arrow} **${r}**: ×${mult} ${pct}`;
  }).join('\n');

  const luckText = weather.luckBonus >= 0 ? `+${weather.luckBonus}%` : `${weather.luckBonus}%`;

  return new EmbedBuilder()
    .setColor(weather.color)
    .setTitle(`${weather.emoji} Cuaca Berubah: ${weather.name}`)
    .setDescription(weather.description)
    .addFields(
      { name: '⏰ Berlaku', value: `${weather.timeRange} WIB`, inline: true },
      { name: '🍀 Luck', value: luckText, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Efek per Rarity', value: multLines }
    )
    .setFooter({ text: 'Cuaca otomatis berubah sesuai waktu WIB | Cek /cuaca untuk detail' })
    .setTimestamp();
}

function buildRandomEventEmbed(preset, durationMinutes) {
  const multLines = RARITY_ORDER.map(r => {
    const mult = preset.rarityMultipliers?.[r] ?? 1;
    const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
    const pct = mult > 1 ? `(+${Math.round((mult - 1) * 100)}%)` : mult < 1 ? `(-${Math.round((1 - mult) * 100)}%)` : '(normal)';
    return `${arrow} **${r}**: ×${mult} ${pct}`;
  }).join('\n');

  const luckText = preset.luckMultiplyMode
    ? `×${preset.luckMultiplier || 1} (Luck dikali!)`
    : `+${preset.luckBonus}%`;

  return new EmbedBuilder()
    .setColor(preset.color || '#f39c12')
    .setTitle(`${preset.emoji} EVENT CUACA: ${preset.name}`)
    .setDescription(`${preset.description}\n\n⚡ **Event cuaca mendadak muncul!**`)
    .addFields(
      { name: '⏱️ Durasi', value: `${durationMinutes} menit`, inline: true },
      { name: '🍀 Luck', value: luckText, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📊 Efek per Rarity', value: multLines }
    )
    .setFooter({ text: 'Manfaatkan event ini sebelum berakhir! 🎣' })
    .setTimestamp();
}

export function startWeatherNotifier(client) {
  // 1. Notif pergantian cuaca harian
  async function sendWeatherNotification() {
    try {
      const weather = getCurrentWeather();
      const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
      await channel.send({ embeds: [buildWeatherEmbed(weather)] });
      console.log(`🌤️ Weather notification sent: ${weather.name}`);
    } catch (e) {
      console.error('Gagal kirim weather notification:', e);
    }
    const delay = getNextChangeMs();
    setTimeout(sendWeatherNotification, delay);
  }

  setTimeout(sendWeatherNotification, getNextChangeMs());

  // 2. Random event cuaca otomatis
  function scheduleNextRandomEvent() {
    const min = AUTO_EVENT_INTERVAL_MIN * 60 * 1000;
    const max = AUTO_EVENT_INTERVAL_MAX * 60 * 1000;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`🎲 Next random weather event in ${Math.round(delay / 1000 / 60)} minutes`);
    setTimeout(() => triggerRandomEvent(client), delay);
  }

  scheduleNextRandomEvent();
  console.log('🌤️ Weather notifier started (with random events).');
}

async function triggerRandomEvent(client) {
  try {
    const eventData = getEventData();
    const activeEvents = getActiveEvents();
    if (activeEvents.length >= 3) {
      scheduleNextRandomEventGlobal(client);
      return;
    }

    // Pilih preset random
    const presets = eventData.presets || [];
    if (presets.length === 0) return;
    const preset = presets[Math.floor(Math.random() * presets.length)];

    // Durasi random
    const durationMinutes = Math.floor(
      Math.random() * (AUTO_EVENT_DURATION_MAX - AUTO_EVENT_DURATION_MIN + 1)
    ) + AUTO_EVENT_DURATION_MIN;

    const newEvent = {
      ...preset,
      id: `auto_${preset.id}_${Date.now()}`,
      startedBy: 'auto',
      startedAt: Date.now(),
      endsAt: Date.now() + durationMinutes * 60 * 1000
    };

    addActiveEvent(newEvent);

    const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
    await channel.send({ embeds: [buildRandomEventEmbed(preset, durationMinutes)] });
    console.log(`🌟 Random weather event triggered: ${preset.name} (${durationMinutes} min)`);

    // Auto end
    setTimeout(async () => {
      removeActiveEvent(newEvent.id);
      try {
        const ch = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
        await ch.send({
          embeds: [new EmbedBuilder()
            .setColor('#95a5a6')
            .setTitle(`${preset.emoji} Event Berakhir: ${preset.name}`)
            .setDescription(`Event cuaca **${preset.name}** telah berakhir. Cuaca kembali normal.`)
            .setTimestamp()
          ]
        });
      } catch {}
      scheduleNextRandomEventInternal(client);
    }, durationMinutes * 60 * 1000);

  } catch (e) {
    console.error('Gagal trigger random event:', e);
    scheduleNextRandomEventInternal(client);
  }
}

function scheduleNextRandomEventInternal(client) {
  const min = AUTO_EVENT_INTERVAL_MIN * 60 * 1000;
  const max = AUTO_EVENT_INTERVAL_MAX * 60 * 1000;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`🎲 Next random weather event in ${Math.round(delay / 1000 / 60)} minutes`);
  setTimeout(() => triggerRandomEvent(client), delay);
}
