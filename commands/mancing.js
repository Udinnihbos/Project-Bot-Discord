import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, savePlayer, getMissionData, checkAndResetMissions, getBaitData, getLevelData, getPlayerLevel, getXpForNextLevel, addXp, getRodData, getActiveEvents, getZonaByChannel, getFishData } from '../utils/database.js';
import { getActiveFishForZona } from '../utils/spawnNotifier.js';
import { rollFish, rollMutation, getRarityColor, getRarityEmoji, formatChance, getCooldownRemaining, getEquippedRod, RARITY_ORDER, getInventoryKey, getFinalPrice, rollFishWeight, formatWeight, getWeightBonus, formatNumber } from '../utils/fishing.js';
import { getCurrentWeather } from '../utils/weather.js';

const ANNOUNCE_CHANNEL_ID = '1481982935413555291';

// Animasi proses mancing
const FISHING_FRAMES = [
  '🎣 Melempar pancing...',
  '🌊 Menunggu ikan...',
  '🌀 Ada yang mendekat...',
  '⚡ Sebentar lagi...',
];

const RARITY_BANNER = {
  Secret:    '╔══════════════════════╗\n║  🌟 **IKAN SECRET!!** 🌟  ║\n╚══════════════════════╝',
  Mythic:    '╔════════════════════╗\n║  🔥 **MYTHIC FISH!** 🔥  ║\n╚════════════════════╝',
  Legendary: '✨ **LEGENDARY FISH!** ✨',
  Epic:      '💜 **EPIC FISH!** 💜',
};

function buildXpBar(player) {
  const xpNext = getXpForNextLevel(player);
  if (!xpNext) return '`MAX LEVEL ✨`';
  const pct = Math.min(player.xp / xpNext, 1);
  const filled = Math.round(pct * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `\`[${bar}]\` ${formatNumber(player.xp)} / ${formatNumber(xpNext)}`;
}

function buildResultEmbed(caughtFish, mutation, weight, weightBonus, finalPrice, rod, activeBait, totalLuck, newLevel, player, allNotifs, weather, events, userId, username) {
  const rarityEmoji = getRarityEmoji(caughtFish.rarity);
  const rarityColor = mutation ? (mutation.color || getRarityColor(caughtFish.rarity)) : getRarityColor(caughtFish.rarity);

  // Title & banner
  const banner = RARITY_BANNER[caughtFish.rarity] || null;
  const fishDisplay = mutation
    ? `${mutation.emoji} ${caughtFish.emoji} **${caughtFish.name}** *[${mutation.name}]*`
    : `${caughtFish.emoji} **${caughtFish.name}**`;

  let desc = '';
  if (banner) desc += `${banner}\n\n`;
  desc += `## ${fishDisplay}\n`;
  desc += `${caughtFish.description || ''}\n`;
  if (allNotifs.length > 0) desc += '\n' + allNotifs.join('\n');

  const fields = [
    { name: `${rarityEmoji} Rarity`, value: `**${caughtFish.rarity}**`, inline: true },
    { name: '🎲 Chance', value: formatChance(caughtFish.chance), inline: true },
    { name: '🪙 Harga Jual', value: `**${formatNumber(finalPrice)}**${weightBonus > 0 ? ` *(+${formatNumber(weightBonus)})*` : ''}`, inline: true },
    { name: '⚖️ Berat', value: formatWeight(weight), inline: true },
    { name: `${rod.emoji} Rod`, value: rod.name, inline: true },
    { name: '🍀 Luck', value: `+${totalLuck}%`, inline: true },
  ];

  if (mutation) {
    fields.push({
      name: `🧬 Mutasi: ${mutation.emoji} ${mutation.name}`,
      value: `${mutation.description}\n\`Rarity: ${mutation.rarity}\``,
      inline: false
    });
  }

  if (activeBait) {
    fields.push({ name: '🪱 Umpan', value: `${activeBait.emoji} ${activeBait.name}`, inline: true });
  }

  fields.push({ name: `⬆️ Level ${newLevel}`, value: buildXpBar(player), inline: false });

  const eventFooter = events.length > 0 ? ` • ${events.map(e => e.emoji + e.name).join(', ')}` : '';

  return new EmbedBuilder()
    .setColor(rarityColor)
    .setTitle('🎣 Ikan Tertangkap!')
    .setDescription(desc)
    .addFields(fields)
    .setFooter({ text: `${username} • ${weather.emoji} ${weather.name}${eventFooter}` })
    .setTimestamp();
}

function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mancing_lagi')
      .setLabel('🎣 Mancing Lagi')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('mancing_jual')
      .setLabel('🪙 Jual Ikan Ini')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('mancing_inventory')
      .setLabel('🎒 Inventori')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

async function doFishing(interaction, userId, isButton = false) {
  let player = getPlayer(userId);
  player = checkAndResetMissions(player);
  const rod = getEquippedRod(player);

  // Cooldown potion
  if ((player.items?.cooldown_potion || 0) > 0) {
    player.items.cooldown_potion -= 1;
    player.lastFished = 0;
    savePlayer(userId, player);
  }

  const remaining = getCooldownRemaining(player.lastFished, rod);
  if (remaining > 0) {
    const cdEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('😮‍💨 Kamu masih capek!')
      .setDescription(`Istirahat dulu **${remaining} detik** sebelum mancing lagi ya.\n\n💡 Punya ⚡ **Cooldown Potion**? Beli di \`/fishshop\` untuk skip!`)
      .setFooter({ text: `${rod.emoji} ${rod.name} | Cooldown: ${Math.max(3, 10 - (rod.cooldownReduction || 0))}s` });

    if (isButton) {
      return interaction.update({ embeds: [cdEmbed], components: [buildButtons(true)] });
    }
    return interaction.reply({ embeds: [cdEmbed], ephemeral: true });
  }

  // ── Zona check ──
  const zona = getZonaByChannel(interaction.channelId);
  let zonaFishIds = null;

  if (zona) {
    if (zona.restricted) {
      if (!player.tickets) player.tickets = {};
      if ((player.tickets[zona.id] || 0) <= 0) {
        const tickEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('🎟️ Zona Restricted!')
          .setDescription(`**${zona.emoji} ${zona.nama}** butuh tiket untuk masuk!\nBeli di \`/fishshop buy\`.`);
        if (isButton) return interaction.update({ embeds: [tickEmbed], components: [buildButtons(true)] });
        return interaction.reply({ embeds: [tickEmbed], ephemeral: true });
      }
      player.tickets[zona.id] -= 1;
      savePlayer(userId, player);
    }

    const tempFishIds = getActiveFishForZona(zona.id);
    const allZonaFish = [...new Set([...zona.fish, ...tempFishIds])];

    if (allZonaFish.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Zona Kosong')
        .setDescription(`**${zona.emoji} ${zona.nama}** belum punya ikan!`);
      if (isButton) return interaction.update({ embeds: [emptyEmbed], components: [buildButtons(true)] });
      return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    }

    zonaFishIds = allZonaFish;

    // First visit notification
    if (!player.visitedZonas) player.visitedZonas = [];
    if (!player.visitedZonas.includes(zona.id)) {
      player.visitedZonas.push(zona.id);
      savePlayer(userId, player);
      try {
        await interaction.channel.send({
          content: `<@${userId}>`,
          embeds: [new EmbedBuilder()
            .setColor(zona.color || '#3498db')
            .setTitle('🗺️ Zona Baru Ditemukan!')
            .setDescription(`Kamu memasuki **${zona.emoji} ${zona.nama}**!\n${zona.deskripsi}\n\n🐟 Ada **${zona.fish.length} ikan eksklusif** di sini!`)
          ]
        });
      } catch {}
    }
  }

  // ── Animasi proses mancing ──
  const fishingEmbed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle(FISHING_FRAMES[0])
    .setDescription('```\n🎣  ~  ~  ~  ~  ~  ~\n```')
    .setFooter({ text: `${rod.emoji} ${rod.name} | ${zona ? zona.emoji + ' ' + zona.nama : 'Semua Zona'}` });

  if (isButton) {
    await interaction.update({ embeds: [fishingEmbed], components: [buildButtons(true)] });
  } else {
    await interaction.deferReply({ flags: 64 });
    await interaction.editReply({ embeds: [fishingEmbed], components: [buildButtons(true)] });
  }

  // Animasi frame
  const frames = [
    { title: FISHING_FRAMES[0], bar: '🎣  ~  ~  ~  ~  ~  ~', delay: 600 },
    { title: FISHING_FRAMES[1], bar: '~  🎣  ~  ~  ~  ~  ~', delay: 700 },
    { title: FISHING_FRAMES[2], bar: '~  ~  🐟  🎣  ~  ~  ~', delay: 700 },
    { title: FISHING_FRAMES[3], bar: '~  ~  ~  🐟💨🎣  ~  ~', delay: 600 },
  ];

  for (const frame of frames) {
    await new Promise(r => setTimeout(r, frame.delay));
    const frameEmbed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle(frame.title)
      .setDescription(`\`\`\`\n${frame.bar}\n\`\`\``)
      .setFooter({ text: `${rod.emoji} ${rod.name} | ${zona ? zona.emoji + ' ' + zona.nama : 'Semua Zona'}` });
    await interaction.editReply({ embeds: [frameEmbed], components: [buildButtons(true)] });
  }

  // Public notif
  try {
    const notifMsg = await interaction.channel.send({
      content: `🎣 **${interaction.user.displayName}** sedang memancing...${zona ? ` *(${zona.emoji} ${zona.nama})*` : ''}`
    });
    setTimeout(() => notifMsg.delete().catch(() => {}), 5000);
  } catch {}

  // ── Apply active effects ──
  if (!player.activeEffects) player.activeEffects = {};
  const ae = player.activeEffects;
  const now2 = Date.now();
  let itemLuckBonus = 0, itemXpMultiplier = 1, itemMutationMultiplier = 1, rodLuckBonus = 0;

  if (ae.luckBoost) {
    if ((ae.luckBoost.expiresAt && now2 > ae.luckBoost.expiresAt) || (ae.luckBoost.casts !== null && ae.luckBoost.casts <= 0)) {
      delete ae.luckBoost;
    } else {
      itemLuckBonus += ae.luckBoost.value;
      if (ae.luckBoost.casts !== null) ae.luckBoost.casts -= 1;
    }
  }
  if (ae.xpBoost) {
    if (ae.xpBoost.expiresAt && now2 > ae.xpBoost.expiresAt) delete ae.xpBoost;
    else itemXpMultiplier = ae.xpBoost.multiplier;
  }
  if (ae.mutationBoost) {
    if (ae.mutationBoost.casts <= 0) delete ae.mutationBoost;
    else { itemMutationMultiplier = ae.mutationBoost.multiplier; ae.mutationBoost.casts -= 1; }
  }
  if (ae.rod_luck_boost) {
    if (ae.rod_luck_boost.expiresAt && now2 > ae.rod_luck_boost.expiresAt) delete ae.rod_luck_boost;
    else rodLuckBonus = ae.rod_luck_boost.value;
  }

  // ── Bait ──
  const { baits } = getBaitData();
  const activeBaitId = player.activeBait;
  const activeBait = activeBaitId ? baits.find(b => b.id === activeBaitId) : null;
  const totalLuck = (rod.luckBonus || 0) + (activeBait?.luckBonus || 0) + itemLuckBonus + rodLuckBonus;
  const baitRarityBoost = activeBait?.rarityBoost || null;

  // ── Roll ──
  const caughtFish = rollFish(totalLuck, baitRarityBoost, zonaFishIds);
  const mutation = rollMutation(totalLuck, (rod.mutationMultiplier || 1.0) * itemMutationMultiplier);
  const weight = rollFishWeight(caughtFish.rarity);
  const weightBonus = getWeightBonus(weight, caughtFish.price);
  const invKey = getInventoryKey(caughtFish.id, mutation?.id || null);
  const finalPrice = getFinalPrice(caughtFish, mutation, rod) + weightBonus;

  // ── Consume bait ──
  if (activeBait) {
    player.baitInventory[activeBaitId] = Math.max(0, (player.baitInventory[activeBaitId] || 1) - 1);
    if (player.baitInventory[activeBaitId] <= 0) player.activeBait = null;
  }

  // ── Update player ──
  player.lastFished = Date.now();
  player.totalFishCaught += 1;
  if (!player.inventory[invKey]) player.inventory[invKey] = 0;
  player.inventory[invKey] += 1;
  if (!player.discovered.includes(caughtFish.id)) player.discovered.push(caughtFish.id);

  // XP
  const { xpPerRarity } = getLevelData();
  let xpGained = Math.round((xpPerRarity[caughtFish.rarity] || 10) * itemXpMultiplier);
  const { levelUps, newLevel } = addXp(player, xpGained);

  // Level up rewards
  const allNotifs = [];
  if (levelUps.length > 0) {
    const { rewards } = getLevelData();
    const { baits: baitList } = getBaitData();
    for (const lvl of levelUps) {
      const reward = rewards[String(lvl)];
      if (!reward) continue;
      if (reward.coins) player.coins += reward.coins;
      if (reward.baitId && reward.baitAmount) {
        if (!player.baitInventory[reward.baitId]) player.baitInventory[reward.baitId] = 0;
        player.baitInventory[reward.baitId] += reward.baitAmount;
        const baitInfo = baitList.find(b => b.id === reward.baitId);
        allNotifs.push(`🎉 **Level Up ${lvl}!** +🪙${formatNumber(reward.coins || 0)} | +${reward.baitAmount}x ${baitInfo?.emoji || ''} ${baitInfo?.name || ''}${reward.rodId ? ` | 🎣 Rod baru!` : ''}`);
      }
      if (reward.rodId) {
        if (!player.ownedRods) player.ownedRods = ['pancing_bambu'];
        if (!player.ownedRods.includes(reward.rodId)) player.ownedRods.push(reward.rodId);
      }
    }
  }

  // Mission progress
  const missionData = getMissionData();
  for (const mission of missionData.missions.filter(m => m.active)) {
    if (player.dailyMissions.claimed.includes(mission.id)) continue;
    if (!player.dailyMissions.progress[mission.id]) player.dailyMissions.progress[mission.id] = 0;
    let progressed = false;
    if (mission.type === 'fish_count' || mission.type === 'catch_total') { player.dailyMissions.progress[mission.id] += 1; progressed = true; }
    else if (mission.type === 'catch_rarity') {
      if (RARITY_ORDER.indexOf(caughtFish.rarity) >= RARITY_ORDER.indexOf(mission.targetRarity)) {
        player.dailyMissions.progress[mission.id] += 1; progressed = true;
      }
    }
    if (progressed && player.dailyMissions.progress[mission.id] >= mission.target) {
      allNotifs.push(`✅ Misi **${mission.name}** selesai!`);
    }
  }

  savePlayer(userId, player);

  // ── Build result embed ──
  const weather = getCurrentWeather();
  const events = getActiveEvents();

  const resultEmbed = buildResultEmbed(
    caughtFish, mutation, weight, weightBonus, finalPrice,
    rod, activeBait, totalLuck, newLevel, player,
    allNotifs, weather, events, userId, interaction.user.username
  );

  // Cooldown untuk button mancing lagi (3 detik)
  const buttons = buildButtons(false);
  await interaction.editReply({ embeds: [resultEmbed], components: [buttons] });

  // Disable button mancing lagi setelah 3 detik (sesuai cooldown rod)
  const rodCooldown = Math.max(3, 10 - (rod.cooldownReduction || 0));

  // ── Button collector ──
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 60_000,
  });

  collector.on('collect', async btnInteraction => {
    const btnId = btnInteraction.customId;

    if (btnId === 'mancing_lagi') {
      collector.stop();
      return doFishing(btnInteraction, userId, true);
    }

    if (btnId === 'mancing_jual') {
      const freshPlayer = getPlayer(userId);
      const qty = freshPlayer.inventory[invKey] || 0;
      if (qty <= 0) {
        return btnInteraction.reply({ content: '❌ Ikan sudah tidak ada di inventory!', ephemeral: true });
      }
      freshPlayer.inventory[invKey] -= 1;
      if (freshPlayer.inventory[invKey] <= 0) delete freshPlayer.inventory[invKey];
      freshPlayer.coins += finalPrice;
      savePlayer(userId, freshPlayer);

      const sellEmbed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🪙 Ikan Terjual!')
        .setDescription(`${mutation ? mutation.emoji + ' ' : ''}${caughtFish.emoji} **${caughtFish.name}**${mutation ? ` [${mutation.name}]` : ''} dijual!`)
        .addFields(
          { name: '🪙 Dapat', value: `**${formatNumber(finalPrice)}** coins`, inline: true },
          { name: '💰 Saldo', value: formatNumber(freshPlayer.coins), inline: true },
        )
        .setTimestamp();

      return btnInteraction.update({ embeds: [sellEmbed], components: [buildButtons(false)] });
    }

    if (btnId === 'mancing_inventory') {
      const freshPlayer = getPlayer(userId);
      const totalFish = Object.values(freshPlayer.inventory).reduce((a, b) => a + b, 0);
      const invEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🎒 Inventori Singkat')
        .setDescription(`Total **${totalFish} ikan** | 🪙 **${formatNumber(freshPlayer.coins)} coins** | 💎 **${freshPlayer.gems || 0} gems**\n\nGunakan \`/fishinventory\` untuk detail lengkap!`)
        .setTimestamp();

      return btnInteraction.reply({ embeds: [invEmbed], ephemeral: true });
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [buildButtons(true)] }).catch(() => {});
  });

  // Announce Mythic/Secret
  if (caughtFish.rarity === 'Mythic' || caughtFish.rarity === 'Secret') {
    try {
      const announceChannel = await interaction.client.channels.fetch(ANNOUNCE_CHANNEL_ID);
      const mutTag = mutation ? ` ${mutation.emoji} **[${mutation.name}]**` : '';
      const isSec = caughtFish.rarity === 'Secret';
      await announceChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(isSec ? '#1a1a2e' : '#e74c3c')
          .setTitle(isSec ? '🌟 IKAN SECRET TERTANGKAP!' : '🔥 IKAN MYTHIC TERTANGKAP!')
          .setDescription(`<@${userId}> menangkap ${caughtFish.emoji} **${caughtFish.name}**${mutTag}!`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Rarity', value: `${getRarityEmoji(caughtFish.rarity)} ${caughtFish.rarity}`, inline: true },
            { name: 'Chance', value: `🎲 ${formatChance(caughtFish.chance)}`, inline: true },
            { name: 'Harga Jual', value: `🪙 ${formatNumber(finalPrice)}`, inline: true }
          ).setTimestamp()
        ]
      });
    } catch (e) { console.error('Gagal announce:', e); }
  }
}

export const data = new SlashCommandBuilder()
  .setName('mancing')
  .setDescription('🎣 Pergi memancing dan coba keberuntunganmu!');

export async function execute(interaction) {
  await doFishing(interaction, interaction.user.id, false);
}
