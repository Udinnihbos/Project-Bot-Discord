// Auto weather based on server time (WIB UTC+7)

export function getCurrentWeather() {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const hour = wib.getUTCHours();

  if (hour >= 0 && hour < 6) {
    return {
      id: 'dini_hari',
      name: 'Dini Hari',
      emoji: '🌃',
      description: 'Suasana dini hari yang sunyi... makhluk misterius dari kedalaman mulai muncul!',
      color: '#0d0d2b',
      luckBonus: 20,
      luckMultiplyMode: false,
      rarityMultipliers: {
        Common: 0.4,
        Uncommon: 0.6,
        Rare: 0.8,
        Epic: 1.2,
        Legendary: 1.5,
        Mythic: 3.0,
        Secret: 4.0
      },
      timeRange: '00:00 - 06:00'
    };
  } else if (hour >= 6 && hour < 12) {
    return {
      id: 'pagi',
      name: 'Pagi Hari',
      emoji: '☀️',
      description: 'Pagi yang segar! Semua ikan aktif berenang di permukaan.',
      color: '#f9ca24',
      luckBonus: 0,
      luckMultiplyMode: false,
      rarityMultipliers: {
        Common: 1.0,
        Uncommon: 1.0,
        Rare: 1.0,
        Epic: 1.0,
        Legendary: 1.0,
        Mythic: 1.0,
        Secret: 1.0
      },
      timeRange: '06:00 - 12:00'
    };
  } else if (hour >= 12 && hour < 15) {
    return {
      id: 'siang',
      name: 'Siang Terik',
      emoji: '🌤️',
      description: 'Matahari terik membuat ikan bersembunyi di dasar... susah dapat yang bagus.',
      color: '#f0932b',
      luckBonus: -20,
      luckMultiplyMode: false,
      rarityMultipliers: {
        Common: 1.5,
        Uncommon: 0.8,
        Rare: 0.6,
        Epic: 0.5,
        Legendary: 0.4,
        Mythic: 0.3,
        Secret: 0.2
      },
      timeRange: '12:00 - 15:00'
    };
  } else if (hour >= 15 && hour < 18) {
    return {
      id: 'sore',
      name: 'Sore Hari',
      emoji: '🌅',
      description: 'Sore yang sejuk! Ikan-ikan mulai aktif kembali mencari makan.',
      color: '#e55039',
      luckBonus: 25,
      luckMultiplyMode: false,
      rarityMultipliers: {
        Common: 0.8,
        Uncommon: 1.2,
        Rare: 1.5,
        Epic: 1.5,
        Legendary: 1.3,
        Mythic: 1.2,
        Secret: 1.2
      },
      timeRange: '15:00 - 18:00'
    };
  } else {
    return {
      id: 'malam',
      name: 'Malam Hari',
      emoji: '🌙',
      description: 'Kegelapan malam mengundang ikan-ikan langka ke permukaan!',
      color: '#2c3e50',
      luckBonus: 15,
      luckMultiplyMode: false,
      rarityMultipliers: {
        Common: 0.6,
        Uncommon: 0.8,
        Rare: 1.0,
        Epic: 1.5,
        Legendary: 2.0,
        Mythic: 2.0,
        Secret: 2.5
      },
      timeRange: '18:00 - 24:00'
    };
  }
}
