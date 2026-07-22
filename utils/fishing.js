import { getFishData, getRodData, getActiveEvents, getMutationData } from './database.js';
import { getCurrentWeather } from './weather.js';

export function rollFish(luckBonus = 0, baitRarityBoost = null, zonaFishIds = null) {
  const { fish: allFish } = getFishData();
  // Filter to zona fish only if specified
  const fish = zonaFishIds ? allFish.filter(f => zonaFishIds.includes(f.id)) : allFish;
  const events = getActiveEvents();
  const weather = getCurrentWeather();

  let eventLuckBonus = 0;
  let eventRarityMult = {};

  // Stack manual events
  for (const event of events) {
    eventLuckBonus += event.luckBonus || 0;
    for (const [rarity, mult] of Object.entries(event.rarityMultipliers || {})) {
      if (event.luckMultiplyMode) {
        eventRarityMult[rarity] = (eventRarityMult[rarity] || 1) * mult;
      } else {
        eventRarityMult[rarity] = (eventRarityMult[rarity] || 1) + (mult - 1);
      }
    }
  }

  // Apply auto weather on top
  const totalLuckBonus = luckBonus + eventLuckBonus + (weather.luckBonus || 0);
  const totalLuckMultiplier = Math.max(0.1, 1 + (totalLuckBonus / 100));
  const sortedFish = [...fish].sort((a, b) => a.chance - b.chance);

  for (const f of sortedFish) {
    const eventMult = eventRarityMult[f.rarity] ?? 1;
    const weatherMult = weather.rarityMultipliers?.[f.rarity] ?? 1;
    const baitMult = baitRarityBoost?.[f.rarity] ?? 1;
    const boostedChance = f.chance * totalLuckMultiplier * eventMult * weatherMult * baitMult;
    if (Math.random() * 100 <= boostedChance) return f;
  }
  // Fallback: return random fish from available pool
  return fish.find(f => f.rarity === 'Common') || fish[Math.floor(Math.random() * fish.length)] || allFish[0];
}

export function rollMutation(luckBonus = 0, mutationMultiplier = 1.0) {
  const { mutations } = getMutationData();
  const events = getActiveEvents();
  const weather = getCurrentWeather();

  let eventLuckBonus = 0;
  let eventMutationBoost = 1;
  for (const event of events) {
    eventLuckBonus += event.luckBonus || 0;
    if (event.luckMultiplyMode) {
      eventMutationBoost *= event.mutationBoost || 1;
    } else {
      eventMutationBoost += (event.mutationBoost || 1) - 1;
    }
  }

  const weatherLuck = weather.luckBonus || 0;
  const totalLuckMult = Math.max(0.1, 1 + ((luckBonus + eventLuckBonus + weatherLuck) / 100));
  const baseMutationChance = 20 * totalLuckMult * eventMutationBoost;
  if (Math.random() * 100 > baseMutationChance) return null;

  const sortedMutations = [...mutations].sort((a, b) => a.chance - b.chance);
  for (const m of sortedMutations) {
    if (Math.random() * 100 <= m.chance * totalLuckMult * eventMutationBoost) return m;
  }
  return mutations.sort((a, b) => b.chance - a.chance)[0];
}

export function getEquippedRod(player) {
  const { rods } = getRodData();
  const rodId = player.equippedRod || 'pancing_bambu';
  return rods.find(r => r.id === rodId) || rods[0];
}

export function getCooldownMs(rod) {
  const base = 10000;
  const reduction = (rod?.cooldownReduction || 0) * 1000;
  return Math.max(3000, base - reduction);
}

export function getRarityColor(rarity) {
  const { rarityConfig } = getFishData();
  return rarityConfig[rarity]?.color || '#95a5a6';
}

export function getRarityEmoji(rarity) {
  const { rarityConfig } = getFishData();
  return rarityConfig[rarity]?.emoji || '⚪';
}

export function formatChance(chance) {
  // chance disimpan sebagai persen, konversi ke rasio 1/X
  const ratio = 100 / chance;
  if (ratio >= 1_000_000) {
    const val = ratio / 1_000_000;
    return `1/${Number.isInteger(val) ? val : val.toFixed(2)}M`;
  }
  if (ratio >= 1_000) {
    const val = ratio / 1_000;
    return `1/${Number.isInteger(val) ? val : val.toFixed(2)}K`;
  }
  const rounded = Math.round(ratio);
  return `1/${rounded.toLocaleString('id-ID')}`;
}

export function formatCoins(amount) {
  return `🪙 ${formatNumber(amount)}`;
}

export function formatGems(amount) {
  return `💎 ${formatNumber(amount)}`;
}

export function formatNumber(amount) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  return amount.toLocaleString('id-ID');
}

export function getCooldownRemaining(lastFished, rod) {
  const now = Date.now();
  const elapsed = now - lastFished;
  const cooldownMs = getCooldownMs(rod);
  if (elapsed >= cooldownMs) return 0;
  return Math.ceil((cooldownMs - elapsed) / 1000);
}

export function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} jam ${m} menit`;
  if (m > 0) return `${m} menit${s > 0 ? ` ${s} detik` : ''}`;
  return `${s} detik`;
}

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
export const MUTATION_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];

export function getRarityRank(rarity) { return RARITY_ORDER.indexOf(rarity); }

export function getRarestFish(discovered, fishList) {
  let rarest = null;
  let rarestRank = -1;
  for (const fishId of discovered) {
    const fish = fishList.find(f => f.id === fishId);
    if (!fish) continue;
    const rank = getRarityRank(fish.rarity);
    if (rank > rarestRank) { rarestRank = rank; rarest = fish; }
  }
  return rarest;
}

export function getInventoryKey(fishId, mutationId = null) {
  return mutationId ? `${fishId}__${mutationId}` : fishId;
}

export function parseInventoryKey(key) {
  const parts = key.split('__');
  return { fishId: parts[0], mutationId: parts[1] || null };
}

export function getFinalPrice(fish, mutation = null, rod = null) {
  const mutMult = rod?.mutationMultiplier ?? 1.0;
  const mutBonus = mutation ? Math.round((mutation.priceBonus || 0) * mutMult) : 0;
  return fish.price + mutBonus;
}

// ── FISH WEIGHT SYSTEM ──
// Weight distribution: exponential falloff, very rare to get high weights
export function rollFishWeight(rarity) {
  // Base max weight per rarity (higher rarity = potentially heavier)
  const rarityMaxWeight = {
    Common: 10,
    Uncommon: 25,
    Rare: 60,
    Epic: 120,
    Legendary: 250,
    Mythic: 450,
    Secret: 600
  };

  const maxWeight = rarityMaxWeight[rarity] || 10;

  // Use exponential distribution - most fish are light, very few are heavy
  // Roll multiple times and take the result based on luck
  const roll = Math.random();
  // Exponential curve: most results cluster near 0, rare to get high values
  const weight = maxWeight * Math.pow(roll, 2.5);

  // Round to 2 decimal places, minimum 0.1kg
  return Math.max(0.1, Math.round(weight * 100) / 100);
}

export function formatWeight(kg) {
  if (kg >= 1) return `${kg.toFixed(2)} kg`;
  return `${Math.round(kg * 1000)} g`;
}

export function getWeightBonus(kg, basePrice) {
  // Bonus kecil: setiap kg tambah sedikit coins
  // Max bonus sekitar 50% dari harga base di 600kg
  const bonusPercent = Math.min((kg / 600) * 50, 50);
  return Math.round(basePrice * (bonusPercent / 100));
}
