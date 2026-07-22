import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { getPlayer, savePlayer, getFishData, getMutationData, getShopData } from '../utils/database.js';
import { getRarityEmoji, RARITY_ORDER, parseInventoryKey, getFinalPrice, formatNumber } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

const ITEMS_PER_PAGE = 8;

// ── Item effect descriptions ──
const ITEM_EFFECT_DESC = {
  lucky_charm:         '🍀 +100% luck untuk cast berikutnya',
  lucky_charm_mega:    '🌟 +300% luck untuk cast berikutnya',
  cooldown_potion:     '⚡ Skip cooldown mancing sekarang',
  xp_booster:         '📈 XP ×2 untuk mancing berikutnya',
  xp_booster_premium: '🚀 XP ×5 untuk mancing berikutnya',
  mutation_booster:   '🧬 Chance mutasi ×3 untuk cast berikutnya',
  fish_magnet:        '🧲 Boost ikan target ×5 untuk 5 cast',
  double_catch:       '📜 Dapat 2 ikan sekaligus untuk 3 cast',
  radar_ikan:         '📡 Scan zona dan lihat ikan aktif',
  luck_elixir:        '🧪 +10 luck permanen untuk 1 jam',
  golden_rod_polish:  '✨ +50 luck rod aktif untuk 30 menit',
  exp_crystal:        '💠 Langsung +500 XP',
  mega_exp_crystal:   '🔷 Langsung +2000 XP',
  elite_bait_pack:    '🎣 Buka pack: 3x Umpan Legendary + 1x Umpan Dewa',
  zone_scanner:       '🛸 Scan semua zona aktif',
  fish_encyclopedia:  '📚 Reveal 5 ikan tersembunyi di fishindex',
  afk_extender:       '⏰ Tambah durasi AFK mancing +10 menit',
  time_warp:          '⏳ Reset cooldown semua member server 5 menit',
  rename_token:       '✏️ Ganti nama display di profilefish',
  inventory_expander: '📦 Tambah kapasitas inventory +50 slot',
};

function buildFishPage(player, fishList, mutations, page, filter, username) {
  const favList = player.favoriteFish || [];
  let entries = [];

  for (const [invKey, qty] of Object.entries(player.inventory)) {
    if (qty <= 0) continue;
    const { fishId, mutationId } = parseInventoryKey(invKey);
    const fish = fishList.find(f => f.id === fishId);
    if (!fish) continue;
    const mutation = mutationId ? mutations.find(m => m.id === mutationId) : null;
    const isFav = favList.includes(invKey) || favList.includes(fishId);
    entries.push({ fish, mutation, qty, isFav, invKey });
  }

  if (filter === 'favorite') entries = entries.filter(e => e.isFav);
  else if (filter === 'mutated') entries = entries.filter(e => e.mutation !== null);
  else if (filter) entries = entries.filter(e => e.fish.rarity === filter);

  entries.sort((a, b) => {
    const rDiff = RARITY_ORDER.indexOf(b.fish.rarity) - RARITY_ORDER.indexOf(a.fish.rarity);
    if (rDiff !== 0) return rDiff;
    return (b.mutation ? 1 : 0) - (a.mutation ? 1 : 0);
  });

  const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = entries.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);
  const totalFish = entries.reduce((a, e) => a + e.qty, 0);
  const totalValue = entries.reduce((a, e) => a + getFinalPrice(e.fish, e.mutation) * e.qty, 0);
  const mutatedCount = entries.filter(e => e.mutation).length;

  const lines = pageEntries.length > 0
    ? pageEntries.map(({ fish, mutation, qty, isFav }) => {
        const fav = isFav ? '⭐ ' : '';
        const mutTag = mutation ? ` ${mutation.emoji} **[${mutation.name}]**` : '';
        const price = getFinalPrice(fish, mutation);
        return `${fav}${getRarityEmoji(fish.rarity)} ${fish.emoji} **${fish.name}**${mutTag} ×${qty}\n┗ \`${fish.rarity}\` | 🪙 ${formatNumber(price * qty)}${mutation ? ` (+${formatNumber(mutation.priceBonus)}/ikan)` : ''}`;
      }).join('\n\n')
    : '🐟 Tidak ada ikan!';

  const filterText = filter === 'favorite' ? '⭐ Favorit' : filter === 'mutated' ? '🧬 Bermutasi' : filter || 'Semua';

  const embed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle(`🐟 Inventori Ikan — ${username}`)
    .setDescription(lines)
    .addFields(
      { name: '🐟 Total Ikan', value: `${formatNumber(totalFish)}x`, inline: true },
      { name: '💰 Total Nilai', value: `🪙 ${formatNumber(totalValue)}`, inline: true },
      { name: '🧬 Bermutasi', value: `${mutatedCount} jenis`, inline: true }
    )
    .setFooter({ text: `Halaman ${safePage + 1}/${totalPages} • Filter: ${filterText}` })
    .setTimestamp();

  return { embed, totalPages, safePage };
}

function buildItemsEmbed(player, shopItems, username) {
  const playerItems = player.items || {};
  const entries = Object.entries(playerItems).filter(([, qty]) => qty > 0);

  if (entries.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle(`🎒 Item Inventory — ${username}`)
        .setDescription('Kamu tidak punya item apapun!\nBeli item di `/fishshop buy`.')
        .setTimestamp(),
      hasItems: false
    };
  }

  const lines = entries.map(([id, qty]) => {
    const shopItem = shopItems.find(i => i.id === id);
    const effectDesc = ITEM_EFFECT_DESC[id] || shopItem?.description || 'Item spesial';
    return `${shopItem?.emoji || '📦'} **${shopItem?.name || id}** ×${qty}\n┗ ${effectDesc}`;
  });

  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle(`🎒 Item Inventory — ${username}`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Pilih item dari menu di bawah untuk menggunakannya!' })
    .setTimestamp();

  return { embed, hasItems: true, entries };
}

function buildItemSelectMenu(player, shopItems) {
  const playerItems = player.items || {};
  const entries = Object.entries(playerItems).filter(([, qty]) => qty > 0).slice(0, 25);

  if (entries.length === 0) return null;

  const options = entries.map(([id, qty]) => {
    const shopItem = shopItems.find(i => i.id === id);
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${shopItem?.name || id} (×${qty})`)
      .setDescription(ITEM_EFFECT_DESC[id]?.substring(0, 100) || shopItem?.description?.substring(0, 100) || 'Item spesial')
      .setValue(id)
      .setEmoji(shopItem?.emoji || '📦');
  });

  return new StringSelectMenuBuilder()
    .setCustomId('item_select')
    .setPlaceholder('🎒 Pilih item untuk digunakan...')
    .addOptions(options);
}

async function useItem(interaction, itemId, player) {
  const { getShopData, savePlayer, getFishData, getZonaData } = await import('../utils/database.js');
  const { addXp, getLevelData, getBaitData } = await import('../utils/database.js');
  const shopData = getShopData();
  const shopItem = shopData.items.find(i => i.id === itemId);
  const effect = shopItem?.effect;

  if (!effect) {
    return { success: false, message: 'Item ini tidak memiliki efek yang bisa digunakan.' };
  }

  const qty = player.items?.[itemId] || 0;
  if (qty <= 0) {
    return { success: false, message: 'Item ini sudah habis!' };
  }

  // Consume item
  player.items[itemId] -= 1;

  switch (effect.type) {
    case 'reset_cooldown':
      player.lastFished = 0;
      savePlayer(player.id, player);
      return { success: true, message: `⚡ Cooldown mancing direset! Kamu bisa langsung \`/mancing\` sekarang.` };

    case 'luck_boost':
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects.luckBoost = {
        value: effect.value,
        casts: effect.duration_casts || null,
        expiresAt: effect.duration_minutes ? Date.now() + effect.duration_minutes * 60000 : null,
        itemId
      };
      savePlayer(player.id, player);
      return { success: true, message: `🍀 Luck +${effect.value}% aktif${effect.duration_casts ? ` untuk ${effect.duration_casts} cast` : ` selama ${effect.duration_minutes} menit`}!` };

    case 'xp_boost':
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects.xpBoost = {
        multiplier: effect.multiplier,
        expiresAt: Date.now() + effect.duration_minutes * 60000,
        itemId
      };
      savePlayer(player.id, player);
      return { success: true, message: `📈 XP Booster ×${effect.multiplier} aktif selama ${effect.duration_minutes} menit!` };

    case 'mutation_boost':
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects.mutationBoost = {
        multiplier: effect.multiplier,
        casts: effect.duration_casts,
        itemId
      };
      savePlayer(player.id, player);
      return { success: true, message: `🧬 Mutation Booster ×${effect.multiplier} aktif untuk ${effect.duration_casts} cast!` };

    case 'give_xp': {
      if (!player.xp) player.xp = 0;
      const totalXp = effect.amount;
      player.xp += totalXp;
      savePlayer(player.id, player);
      return { success: true, message: `💠 +${formatNumber(totalXp)} XP ditambahkan! Total XP: ${formatNumber(player.xp)}` };
    }

    case 'give_coins': {
      player.coins += effect.amount;
      savePlayer(player.id, player);
      return { success: true, message: `🪙 +${formatNumber(effect.amount)} Coins ditambahkan! Saldo: 🪙 ${formatNumber(player.coins)}` };
    }

    case 'give_gems': {
      player.gems = (player.gems || 0) + effect.amount;
      savePlayer(player.id, player);
      return { success: true, message: `💎 +${effect.amount} Gems ditambahkan! Total: 💎 ${player.gems}` };
    }

    case 'bait_pack': {
      if (!player.baitInventory) player.baitInventory = {};
      const lines = [];
      for (const c of effect.contents) {
        if (!player.baitInventory[c.id]) player.baitInventory[c.id] = 0;
        player.baitInventory[c.id] += c.amount;
        lines.push(`+${c.amount}x ${c.id}`);
      }
      savePlayer(player.id, player);
      return { success: true, message: `🎣 Bait pack dibuka!\n${lines.join('\n')}` };
    }

    case 'rod_luck_boost':
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects.rodLuckBoost = {
        value: effect.value,
        expiresAt: Date.now() + effect.duration_minutes * 60000,
        itemId
      };
      savePlayer(player.id, player);
      return { success: true, message: `✨ Rod luck +${effect.value}% aktif selama ${effect.duration_minutes} menit!` };

    case 'afk_extend':
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects.afkExtend = {
        extraMinutes: effect.extra_minutes,
        itemId
      };
      savePlayer(player.id, player);
      return { success: true, message: `⏰ AFK Extender aktif! Durasi AFK mancing kamu +${effect.extra_minutes} menit untuk sesi berikutnya.` };

    case 'radar': {
      const zonaData = getZonaData();
      const zonas = Object.values(zonaData.zonas);
      if (zonas.length === 0) {
        savePlayer(player.id, player);
        return { success: true, message: '📡 Tidak ada zona aktif saat ini.' };
      }
      const lines = zonas.map(z => {
        const fishCount = (z.fish?.length || 0) + (z.tempFish?.filter(t => t.endsAt > Date.now()).length || 0);
        return `${z.emoji} **${z.nama}** — ${fishCount} ikan`;
      });
      savePlayer(player.id, player);
      return { success: true, message: `📡 **Hasil Scan Zona:**\n${lines.join('\n')}` };
    }

    case 'reveal_fish': {
      const { getFishData } = await import('../utils/database.js');
      const { fish: fishList } = getFishData();
      if (!player.discovered) player.discovered = [];
      const undiscovered = fishList.filter(f => !player.discovered.includes(f.id));
      const toReveal = undiscovered.slice(0, effect.amount);
      for (const f of toReveal) player.discovered.push(f.id);
      savePlayer(player.id, player);
      const revealedNames = toReveal.map(f => `${f.emoji} ${f.name} (${f.rarity})`).join('\n');
      return { success: true, message: `📚 **${toReveal.length} ikan terungkap:**\n${revealedNames || 'Semua ikan sudah ditemukan!'}` };
    }

    case 'inventory_expand':
      if (!player.inventoryCapacity) player.inventoryCapacity = 200;
      player.inventoryCapacity += effect.amount;
      savePlayer(player.id, player);
      return { success: true, message: `📦 Kapasitas inventory +${effect.amount} slot! Total: ${player.inventoryCapacity} slot.` };

    default:
      // Items yang efeknya terjadi saat mancing - simpan sebagai active
      if (!player.activeEffects) player.activeEffects = {};
      player.activeEffects[effect.type] = { ...effect, itemId };
      savePlayer(player.id, player);
      return { success: true, message: `✅ **${shopItem?.name || itemId}** diaktifkan! Efek akan berlaku saat \`/mancing\` berikutnya.` };
  }
}

export const data = new SlashCommandBuilder()
  .setName('fishinventory')
  .setDescription('🎒 Lihat semua ikan dan item di inventorimu!')
  .addUserOption(opt => opt.setName('user').setDescription('Lihat inventori pemain lain').setRequired(false))
  .addStringOption(opt =>
    opt.setName('filter').setDescription('Filter ikan').setRequired(false)
      .addChoices(
        { name: '⭐ Favorit', value: 'favorite' },
        { name: '🧬 Bermutasi', value: 'mutated' },
        { name: '⚪ Common', value: 'Common' },
        { name: '🟢 Uncommon', value: 'Uncommon' },
        { name: '🔵 Rare', value: 'Rare' },
        { name: '🟣 Epic', value: 'Epic' },
        { name: '🟡 Legendary', value: 'Legendary' },
        { name: '🔴 Mythic', value: 'Mythic' },
        { name: '⭐ Secret', value: 'Secret' }
      )
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const target = interaction.options.getUser('user') || interaction.user;
  const isOwn = target.id === interaction.user.id;
  const player = getPlayer(target.id);
  const { fish: fishList } = getFishData();
  const { mutations } = getMutationData();
  const { items: shopItems } = getShopData();
  const filter = interaction.options.getString('filter') || null;

  let mode = 'fish'; // 'fish' or 'items'
  let page = 0;

  function buildRows(currentPage, totalPages, currentMode, hasItems) {
    const rows = [];

    // Row 1: Tab buttons
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tab_fish')
        .setLabel('🐟 Ikan')
        .setStyle(currentMode === 'fish' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tab_items')
        .setLabel('🎒 Items')
        .setStyle(currentMode === 'items' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ));

    if (currentMode === 'fish') {
      // Row 2: Pagination
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('inv_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId('inv_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages - 1)
      ));
    } else if (currentMode === 'items' && hasItems && isOwn) {
      // Row 2: Select menu for items
      const menu = buildItemSelectMenu(player, shopItems);
      if (menu) rows.push(new ActionRowBuilder().addComponents(menu));
    }

    return rows;
  }

  // Initial render
  const { embed: fishEmbed, totalPages, safePage } = buildFishPage(player, fishList, mutations, page, filter, target.username);
  page = safePage;

  const rows = buildRows(page, totalPages, mode, false);

  const msg = await interaction.reply({
    ephemeral: true,
    embeds: [fishEmbed],
    components: rows,
    fetchReply: true
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 120000
  });

  collector.on('collect', async i => {
    if (i.customId === 'tab_fish') {
      mode = 'fish';
      page = 0;
      const freshPlayer = getPlayer(target.id);
      const { embed, totalPages: tp, safePage: sp } = buildFishPage(freshPlayer, fishList, mutations, page, filter, target.username);
      page = sp;
      await i.update({ embeds: [embed], components: buildRows(page, tp, mode, false) });

    } else if (i.customId === 'tab_items') {
      mode = 'items';
      const freshPlayer = getPlayer(target.id);
      const { embed, hasItems } = buildItemsEmbed(freshPlayer, shopItems, target.username);
      await i.update({ embeds: [embed], components: buildRows(0, 1, mode, hasItems) });

    } else if (i.customId === 'inv_next') {
      page = Math.min(page + 1, totalPages - 1);
      const freshPlayer = getPlayer(target.id);
      const { embed, totalPages: tp, safePage: sp } = buildFishPage(freshPlayer, fishList, mutations, page, filter, target.username);
      page = sp;
      await i.update({ embeds: [embed], components: buildRows(page, tp, mode, false) });

    } else if (i.customId === 'inv_prev') {
      page = Math.max(page - 1, 0);
      const freshPlayer = getPlayer(target.id);
      const { embed, totalPages: tp, safePage: sp } = buildFishPage(freshPlayer, fishList, mutations, page, filter, target.username);
      page = sp;
      await i.update({ embeds: [embed], components: buildRows(page, tp, mode, false) });

    } else if (i.customId === 'item_select') {
      if (!isOwn) {
        await i.reply({ content: '❌ Kamu tidak bisa menggunakan item milik orang lain!', ephemeral: true });
        return;
      }

      const selectedItemId = i.values[0];
      const freshPlayer = getPlayer(interaction.user.id);
      const shopItem = shopItems.find(s => s.id === selectedItemId);
      const qty = freshPlayer.items?.[selectedItemId] || 0;

      if (qty <= 0) {
        await i.reply({ content: '❌ Item ini sudah habis!', ephemeral: true });
        return;
      }

      // Show use/cancel buttons
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`use_item_${selectedItemId}`)
          .setLabel(`✅ Gunakan ${shopItem?.name || selectedItemId}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_use')
          .setLabel('❌ Batal')
          .setStyle(ButtonStyle.Danger)
      );

      const effectDesc = ITEM_EFFECT_DESC[selectedItemId] || shopItem?.description || '';
      await i.update({
        embeds: [new EmbedBuilder()
          .setColor('#f39c12')
          .setTitle(`${shopItem?.emoji || '📦'} ${shopItem?.name || selectedItemId}`)
          .setDescription(`**Efek:** ${effectDesc}\n\n**Dimiliki:** ${qty}x\n\nMau digunakan sekarang?`)
        ],
        components: [confirmRow]
      });

    } else if (i.customId.startsWith('use_item_')) {
      const itemId = i.customId.replace('use_item_', '');
      const freshPlayer = getPlayer(interaction.user.id);
      const result = await useItem(i, itemId, freshPlayer);

      const color = result.success ? '#2ecc71' : '#e74c3c';
      const title = result.success ? '✅ Item Digunakan!' : '❌ Gagal';

      // After using, refresh items view
      const updatedPlayer = getPlayer(interaction.user.id);
      const { embed: itemsEmbed, hasItems } = buildItemsEmbed(updatedPlayer, shopItems, target.username);

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(result.message)
          .setTimestamp(),
          itemsEmbed
        ],
        components: buildRows(0, 1, 'items', hasItems)
      });

    } else if (i.customId === 'cancel_use') {
      const freshPlayer = getPlayer(target.id);
      const { embed, hasItems } = buildItemsEmbed(freshPlayer, shopItems, target.username);
      await i.update({ embeds: [embed], components: buildRows(0, 1, 'items', hasItems) });
    }
  });

  collector.on('end', async () => {
    const disabledRows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tab_fish').setLabel('🐟 Ikan').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('tab_items').setLabel('🎒 Items').setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    ];
    await msg.edit({ components: disabledRows }).catch(() => {});
  });
}
