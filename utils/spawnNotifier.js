import { EmbedBuilder } from 'discord.js';
import { getSpawnConfig, saveSpawnConfig, getZonaData, saveZonaData, getFishData } from './database.js';
import { getRarityEmoji, getRarityColor, formatChance } from './fishing.js';

const ANNOUNCE_CHANNEL_ID = '1481982935413555291';

let spawnIntervalTimer = null;
let activeSpawnTimers = {};
let clientRef = null;

export function startSpawnNotifier(client) {
  clientRef = client;

  // Restore active spawns on restart
  const config = getSpawnConfig();
  const now = Date.now();

  // Cleanup expired spawns on boot
  const freshConfig = getSpawnConfig();
  freshConfig.activeSpawns = freshConfig.activeSpawns.filter(s => s.endsAt > now);
  saveSpawnConfig(freshConfig);

  for (const spawn of freshConfig.activeSpawns) {
    const remaining = spawn.endsAt - now;
    scheduleSpawnEnd(spawn, remaining, client);
  }

  // Restore auto interval if set
  if (config.spawnInterval) {
    startAutoInterval(config.spawnInterval, client);
  }

  console.log('🐟 SpawnNotifier started.');
}

// ── MANUAL SPAWN ──
export async function spawnFish(client, zonaId, fishId, durationMinutes) {
  const zonaData = getZonaData();
  const zona = zonaData.zonas[zonaId];
  if (!zona) return { success: false, message: 'Zona tidak ditemukan.' };

  const { fish: fishList } = getFishData();
  const fish = fishList.find(f => f.id === fishId);
  if (!fish) return { success: false, message: 'Ikan tidak ditemukan.' };

  const spawnId = `spawn_${zonaId}_${fishId}_${Date.now()}`;
  const endsAt = Date.now() + durationMinutes * 60 * 1000;

  // Tambah ikan sementara ke zona
  if (!zona.tempFish) zona.tempFish = [];
  zona.tempFish.push({ fishId, spawnId, endsAt });
  saveZonaData(zonaData);

  // Save spawn config
  const config = getSpawnConfig();
  config.activeSpawns.push({ spawnId, zonaId, fishId, endsAt });
  saveSpawnConfig(config);

  // Kirim notif muncul
  try {
    const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setColor(getRarityColor(fish.rarity))
      .setTitle(`🌟 Ikan Eksklusif Muncul!`)
      .setDescription(`**${getRarityEmoji(fish.rarity)} ${fish.emoji} ${fish.name}** telah muncul di **${zona.emoji} ${zona.nama}**!\n\n${fish.description}`)
      .addFields(
        { name: '📍 Zona', value: `${zona.emoji} ${zona.nama}`, inline: true },
        { name: '⏱️ Durasi', value: `${durationMinutes} menit`, inline: true },
        { name: '🎲 Chance', value: formatChance(fish.chance), inline: true },
        { name: '💰 Harga Jual', value: `🪙 ${fish.price.toLocaleString('id-ID')}`, inline: true }
      )
      .setFooter({ text: 'Buruan mancing sebelum ikannya kabur!' })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('Gagal kirim spawn notif:', e);
  }

  // Schedule end
  scheduleSpawnEnd({ spawnId, zonaId, fishId, endsAt }, durationMinutes * 60 * 1000, client);

  return { success: true, fish, zona, endsAt };
}

function scheduleSpawnEnd(spawn, delayMs, client) {
  if (activeSpawnTimers[spawn.spawnId]) clearTimeout(activeSpawnTimers[spawn.spawnId]);

  activeSpawnTimers[spawn.spawnId] = setTimeout(async () => {
    // Hapus ikan dari zona
    const zonaData = getZonaData();
    const zona = zonaData.zonas[spawn.zonaId];
    if (zona) {
      zona.tempFish = (zona.tempFish || []).filter(t => t.spawnId !== spawn.spawnId);
      saveZonaData(zonaData);
    }

    // Hapus dari spawn config
    const config = getSpawnConfig();
    config.activeSpawns = config.activeSpawns.filter(s => s.spawnId !== spawn.spawnId);
    saveSpawnConfig(config);

    // Notif ikan kabur
    try {
      const { fish: fishList } = getFishData();
      const fish = fishList.find(f => f.id === spawn.fishId);
      const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
      const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle(`💨 Ikan Kabur!`)
        .setDescription(`**${fish?.emoji || '🐟'} ${fish?.name || spawn.fishId}** telah kabur dari **${zona?.emoji || ''} ${zona?.nama || spawn.zonaId}**!\n\nSayang sekali, mungkin lain kali lebih cepat!`)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch (e) {
      console.error('Gagal kirim spawn end notif:', e);
    }

    delete activeSpawnTimers[spawn.spawnId];
  }, delayMs);
}

// ── AUTO INTERVAL ──
export function startAutoInterval(intervalMinutes, client) {
  if (spawnIntervalTimer) {
    clearInterval(spawnIntervalTimer);
    spawnIntervalTimer = null;
  }

  if (!intervalMinutes || intervalMinutes <= 0) return;

  spawnIntervalTimer = setInterval(async () => {
    await autoSpawnRandom(client || clientRef);
  }, intervalMinutes * 60 * 1000);

  console.log(`⏰ Auto spawn interval set: every ${intervalMinutes} minutes`);
}

export function stopAutoInterval() {
  if (spawnIntervalTimer) {
    clearInterval(spawnIntervalTimer);
    spawnIntervalTimer = null;
  }
}

async function autoSpawnRandom(client) {
  const { fish: fishList } = getFishData();
  const zonaData = getZonaData();
  const zonas = Object.values(zonaData.zonas);
  if (zonas.length === 0) return;

  // Pilih zona random
  const zona = zonas[Math.floor(Math.random() * zonas.length)];

  // Pilih ikan langka (Legendary, Mythic, Secret)
  const rareFish = fishList.filter(f => ['Legendary', 'Mythic', 'Secret'].includes(f.rarity));
  if (rareFish.length === 0) return;
  const fish = rareFish[Math.floor(Math.random() * rareFish.length)];

  const duration = 10; // default 10 menit untuk auto spawn
  await spawnFish(client, zona.id, fish.id, duration);
}

// ── GET ACTIVE SPAWNS FOR ZONA ──
export function getActiveFishForZona(zonaId) {
  const zonaData = getZonaData();
  const zona = zonaData.zonas[zonaId];
  if (!zona) return [];
  const now = Date.now();
  return (zona.tempFish || [])
    .filter(t => t.endsAt > now)
    .map(t => t.fishId);
}
