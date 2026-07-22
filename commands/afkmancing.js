import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getMissionData, checkAndResetMissions, hasAfkUnlock, getZonaData } from '../utils/database.js';
import { rollFish, rollMutation, getRarityEmoji, getRarityColor, getEquippedRod, getCooldownMs, RARITY_ORDER, getInventoryKey, getFinalPrice, rollFishWeight, formatWeight, getWeightBonus, formatNumber, formatGems } from '../utils/fishing.js';;
import { getBaitData, getLevelData, getPlayerLevel, addXp } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('afkmancing')
  .setDescription('🤖 AFK Mancing otomatis! (Butuh gamepass)')
  .addIntegerOption(opt =>
    opt.setName('menit')
      .setDescription('Durasi AFK mancing (max 5 menit)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(5)
  )
  .addStringOption(opt =>
    opt.setName('zona')
      .setDescription('Zona mancing (opsional, kosongkan = semua ikan)')
      .setRequired(false)
      .setAutocomplete(true)
  );

const activeSessions = new Set();

const ANNOUNCE_CHANNEL_ID = '1481982935413555291';

export async function execute(interaction) {
  const userId = interaction.user.id;
  let player = getPlayer(userId);

  if (!hasAfkUnlock(player)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('🔒 Fitur Terkunci')
          .setDescription('Fitur AFK Mancing membutuhkan **Gamepass** khusus!\nCek `/fishgamepass list` untuk membeli.')
      ],
      ephemeral: true
    });
  }

  if (activeSessions.has(userId)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Sudah AFK').setDescription('Kamu sudah sedang AFK mancing!')],
      ephemeral: true
    });
  }

  const menit = interaction.options.getInteger('menit');
  // AFK Extender effect
  let bonusMenit = 0;
  if (player.activeEffects?.afkExtend) {
    bonusMenit = player.activeEffects.afkExtend.extraMinutes || 0;
    delete player.activeEffects.afkExtend;
    savePlayer(userId, player);
  }
  const totalMenit = menit + bonusMenit;
  const zonaId = interaction.options.getString('zona') || null;
  const rod = getEquippedRod(player);
  const cooldownMs = getCooldownMs(rod);
  const durasiMs = totalMenit * 60 * 1000;
  const maxCasts = Math.floor(durasiMs / cooldownMs);

  // Validasi zona kalau dipilih
  let selectedZona = null;
  let zonaFishIds = null;
  if (zonaId) {
    const { zonas } = getZonaData();
    selectedZona = zonas[zonaId];
    if (!selectedZona) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Tidak Ditemukan').setDescription(`Zona **${zonaId}** tidak ditemukan!`)],
        ephemeral: true
      });
    }
    if (selectedZona.fish.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Kosong').setDescription(`Zona **${selectedZona.emoji} ${selectedZona.nama}** belum punya ikan!`)],
        ephemeral: true
      });
    }

    // Cek restricted zona
    if (selectedZona.restricted) {
      if (!player.tickets) player.tickets = {};
      const ticketCount = player.tickets[selectedZona.id] || 0;
      if (ticketCount <= 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('🎟️ Zona Restricted!')
            .setDescription(`Zona **${selectedZona.emoji} ${selectedZona.nama}** membutuhkan tiket untuk masuk!\nBeli tiket di \`/fishshop buy\`.`)
          ],
          ephemeral: true
        });
      }
      // Kurangi tiket 1x per sesi AFK
      player.tickets[selectedZona.id] -= 1;
      savePlayer(userId, player);
    }

    zonaFishIds = selectedZona.fish;
  }

  const client = interaction.client;
  activeSessions.add(userId);

  let dmChannel;
  try {
    dmChannel = await interaction.user.createDM();
  } catch {
    activeSessions.delete(userId);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ DM Tertutup').setDescription('Buka DM kamu dulu agar hasil AFK bisa dikirim!')],
      ephemeral: true
    });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🤖 AFK Mancing Dimulai!')
        .setDescription(`Kamu akan AFK mancing selama **${totalMenit} menit**${bonusMenit > 0 ? ` (+${bonusMenit} bonus)` : ''}!\nHasil akan dikirim ke DM kamu.`)
        .addFields(
          { name: '🎣 Pancingan', value: `${rod.emoji} ${rod.name}`, inline: true },
          { name: '⏱️ Cooldown', value: `${cooldownMs / 1000}s`, inline: true },
          { name: '🎯 Estimasi Cast', value: `~${maxCasts}x`, inline: true },
          { name: '🗺️ Zona', value: selectedZona ? `${selectedZona.emoji} ${selectedZona.nama}` : 'Semua Zona', inline: true }
        )
    ],
    ephemeral: true
  });

  // results now keyed by invKey (fishId__mutationId or fishId)
  const results = {};
  let totalCaught = 0;
  let castCount = 0;
  let rareMythicSecret = []; // collect mythic/secret for announce

  const dmMsg = await dmChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🤖 AFK Mancing Berjalan...')
        .setDescription(`Memancing selama **${menit} menit** dengan ${rod.emoji} **${rod.name}**\n🗺️ Zona: ${selectedZona ? `${selectedZona.emoji} ${selectedZona.nama}` : 'Semua Zona'}\n\nMenunggu hasil...`)
        .setFooter({ text: `Cast: 0/${maxCasts}` })
    ]
  });

  const interval = setInterval(async () => {
    castCount++;
    let freshPlayer = getPlayer(userId);
    freshPlayer = checkAndResetMissions(freshPlayer);
    const freshRod = getEquippedRod(freshPlayer);

    // Roll fish + mutation (sama seperti /mancing biasa)
    const fish = rollFish(freshRod.luckBonus, null, zonaFishIds);
    const mutation = rollMutation(freshRod.luckBonus);
    const invKey = getInventoryKey(fish.id, mutation?.id || null);
    const finalPrice = getFinalPrice(fish, mutation);

    totalCaught++;

    const weight = rollFishWeight(fish.rarity);
    const weightBonus = getWeightBonus(weight, fish.price);
    const finalPriceWithWeight = finalPrice + weightBonus;
    if (!results[invKey]) results[invKey] = { fish, mutation, count: 0, finalPrice: finalPriceWithWeight };
    else results[invKey].finalPrice = finalPriceWithWeight; // update with latest weight
    results[invKey].count++;

    freshPlayer.totalFishCaught += 1;
    freshPlayer.lastFished = Date.now();
    if (!freshPlayer.inventory[invKey]) freshPlayer.inventory[invKey] = 0;
    freshPlayer.inventory[invKey] += 1;
    if (!freshPlayer.discovered.includes(fish.id)) freshPlayer.discovered.push(fish.id);

    // Mission progress
    const missionData = getMissionData();
    for (const mission of missionData.missions.filter(m => m.active)) {
      if (freshPlayer.dailyMissions.claimed.includes(mission.id)) continue;
      if (!freshPlayer.dailyMissions.progress[mission.id]) freshPlayer.dailyMissions.progress[mission.id] = 0;
      if (mission.type === 'fish_count' || mission.type === 'catch_total') {
        freshPlayer.dailyMissions.progress[mission.id] += 1;
      } else if (mission.type === 'catch_rarity') {
        const fishRank = RARITY_ORDER.indexOf(fish.rarity);
        const targetRank = RARITY_ORDER.indexOf(mission.targetRarity);
        if (fishRank >= targetRank) freshPlayer.dailyMissions.progress[mission.id] += 1;
      }
    }

    // Add XP
    const { xpPerRarity } = getLevelData();
    const xpGained = xpPerRarity[fish.rarity] || 10;
    const { levelUps, newLevel } = addXp(freshPlayer, xpGained);
    if (levelUps.length > 0) {
      const { rewards } = getLevelData();
      const { baits: baitList } = getBaitData();
      for (const lvl of levelUps) {
        const reward = rewards[String(lvl)];
        if (!reward) continue;
        if (reward.coins) freshPlayer.coins += reward.coins;
        if (reward.baitId && reward.baitAmount) {
          if (!freshPlayer.baitInventory) freshPlayer.baitInventory = {};
          if (!freshPlayer.baitInventory[reward.baitId]) freshPlayer.baitInventory[reward.baitId] = 0;
          freshPlayer.baitInventory[reward.baitId] += reward.baitAmount;
        }
        if (reward.rodId && !freshPlayer.ownedRods.includes(reward.rodId)) {
          freshPlayer.ownedRods.push(reward.rodId);
        }
      }
    }
    savePlayer(userId, freshPlayer);

    // Collect mythic/secret for announcement
    if (fish.rarity === 'Mythic' || fish.rarity === 'Secret') {
      rareMythicSecret.push({ fish, mutation });
    }

    // Update DM every cast
    const lines = Object.values(results)
      .sort((a, b) => RARITY_ORDER.indexOf(b.fish.rarity) - RARITY_ORDER.indexOf(a.fish.rarity))
      .slice(0, 15)
      .map(r => {
        const mutTag = r.mutation ? ` ${r.mutation.emoji}[${r.mutation.name}]` : '';
        return `${getRarityEmoji(r.fish.rarity)} ${r.fish.emoji} **${r.fish.name}${mutTag}** ×${r.count}`;
      });

    const latestColor = mutation ? (mutation.color || getRarityColor(fish.rarity)) : getRarityColor(fish.rarity);
    const latestLabel = mutation ? `${mutation.emoji} ${fish.emoji} ${fish.name} [${mutation.name}]` : `${fish.emoji} ${fish.name} (${fish.rarity})`;

    await dmMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(latestColor)
          .setTitle(`🤖 AFK Mancing — Cast #${castCount}`)
          .setDescription(`Pancingan: ${freshRod.emoji} **${freshRod.name}**\n\n${lines.join('\n') || 'Belum ada ikan...'}`)
          .addFields(
            { name: '🐟 Terbaru', value: latestLabel, inline: true },
            { name: '🎣 Total', value: `${totalCaught} ikan`, inline: true }
          )
          .setFooter({ text: `Cast: ${castCount}/${maxCasts}` })
      ]
    }).catch(() => {});

  }, cooldownMs);

  // End session
  setTimeout(async () => {
    clearInterval(interval);
    activeSessions.delete(userId);

    const finalLines = Object.values(results)
      .sort((a, b) => RARITY_ORDER.indexOf(b.fish.rarity) - RARITY_ORDER.indexOf(a.fish.rarity))
      .map(r => {
        const mutTag = r.mutation ? ` ${r.mutation.emoji}[${r.mutation.name}]` : '';
        return `${getRarityEmoji(r.fish.rarity)} ${r.fish.emoji} **${r.fish.name}${mutTag}** ×${r.count} — 🪙 ${(r.finalPrice * r.count).toLocaleString('id-ID')}`;
      });

    const totalValue = Object.values(results).reduce((a, r) => a + r.finalPrice * r.count, 0);

    await dmMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('✅ AFK Mancing Selesai!')
          .setDescription(finalLines.join('\n') || 'Tidak ada ikan yang tertangkap.')
          .addFields(
            { name: '🎣 Total Cast', value: `${castCount}x`, inline: true },
            { name: '🐟 Total Ikan', value: `${totalCaught}x`, inline: true },
            { name: '💰 Nilai Total', value: `🪙 ${formatNumber(totalValue)}`, inline: true }
          )
          .setFooter({ text: 'Jual ikanmu dengan /sellfish all!' })
          .setTimestamp()
      ]
    }).catch(() => {});

    // Announce mythic/secret to channel
    if (rareMythicSecret.length > 0) {
      try {
        const announceChannel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID);
        for (const { fish, mutation } of rareMythicSecret) {
          const mutTag = mutation ? ` ${mutation.emoji} **[${mutation.name}]**` : '';
          const isSec = fish.rarity === 'Secret';
          const embed = new EmbedBuilder()
            .setColor(isSec ? '#1a1a2e' : '#e74c3c')
            .setTitle(isSec ? '🌟 IKAN SECRET TERTANGKAP! (AFK)' : '🔥 IKAN MYTHIC TERTANGKAP! (AFK)')
            .setDescription(`<@${userId}> menangkap ${fish.emoji} **${fish.name}**${mutTag} saat AFK Mancing!`)
            .setTimestamp();
          await announceChannel.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error('Gagal kirim announce AFK:', e);
      }
    }
  }, durasiMs);
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const { zonas } = getZonaData();
  const choices = Object.values(zonas)
    .filter(z => z.id.includes(focused) || z.nama.toLowerCase().includes(focused))
    .map(z => ({ name: `${z.emoji} ${z.nama} (${z.fish.length} ikan)`, value: z.id }));
  await interaction.respond(choices.slice(0, 25));
}
