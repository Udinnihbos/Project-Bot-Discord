import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, savePlayer, getShopData, saveShopData, getFishData, getBaitData } from '../utils/database.js';
import { formatNumber, getRarityColor, getRarityEmoji } from '../utils/fishing.js';

const TYPE_LABEL = {
  bait: '🪱 Umpan',
  item: '🎒 Item',
  currency: '💰 Mata Uang',
  ticket: '🎟️ Tiket Zona'
};
const TYPE_ORDER = ['ticket', 'bait', 'item', 'currency'];

// ── MYSTERY BOX REWARDS ──
const MYSTERY_BOX_REWARDS = [
  { type: 'coins', amount: 5000,   weight: 30, label: '🪙 5K Coins' },
  { type: 'coins', amount: 15000,  weight: 20, label: '🪙 15K Coins' },
  { type: 'coins', amount: 50000,  weight: 8,  label: '🪙 50K Coins' },
  { type: 'bait',  id: 'cacing_super', amount: 5, weight: 20, label: '🟤 Cacing Super ×5' },
  { type: 'bait',  id: 'umpan_rare',   amount: 3, weight: 12, label: '🔵 Umpan Rare ×3' },
  { type: 'bait',  id: 'umpan_epic',   amount: 2, weight: 6,  label: '🟣 Umpan Epic ×2' },
  { type: 'bait',  id: 'umpan_legendary', amount: 1, weight: 3, label: '🟡 Umpan Legendary ×1' },
  { type: 'gems',  amount: 5,   weight: 8,  label: '💎 5 Gems' },
  { type: 'gems',  amount: 15,  weight: 3,  label: '💎 15 Gems' },
  { type: 'item',  id: 'lucky_charm', amount: 1, weight: 5, label: '🍀 Lucky Charm ×1' },
  { type: 'item',  id: 'mutation_booster', amount: 1, weight: 3, label: '🧬 Mutation Booster ×1' },
  { type: 'item',  id: 'cooldown_potion', amount: 2, weight: 8, label: '⚡ Cooldown Potion ×2' },
];

const MYSTERY_BOX_PREMIUM_REWARDS = [
  { type: 'coins', amount: 50000,   weight: 20, label: '🪙 50K Coins' },
  { type: 'coins', amount: 150000,  weight: 10, label: '🪙 150K Coins' },
  { type: 'coins', amount: 500000,  weight: 3,  label: '🪙 500K Coins' },
  { type: 'bait',  id: 'umpan_epic',      amount: 5, weight: 20, label: '🟣 Umpan Epic ×5' },
  { type: 'bait',  id: 'umpan_legendary', amount: 3, weight: 12, label: '🟡 Umpan Legendary ×3' },
  { type: 'bait',  id: 'umpan_dewa',      amount: 2, weight: 5,  label: '✨ Umpan Dewa ×2' },
  { type: 'gems',  amount: 20,  weight: 12, label: '💎 20 Gems' },
  { type: 'gems',  amount: 50,  weight: 5,  label: '💎 50 Gems' },
  { type: 'gems',  amount: 100, weight: 2,  label: '💎 100 Gems' },
  { type: 'item',  id: 'lucky_charm_mega', amount: 1, weight: 8, label: '🌟 Mega Lucky Charm ×1' },
  { type: 'item',  id: 'double_catch',     amount: 1, weight: 5, label: '📜 Double Catch ×1' },
  { type: 'item',  id: 'mutation_booster', amount: 3, weight: 8, label: '🧬 Mutation Booster ×3' },
];

function rollReward(rewards) {
  const totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const r of rewards) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return rewards[0];
}

function applyReward(player, reward) {
  if (reward.type === 'coins') {
    player.coins += reward.amount;
  } else if (reward.type === 'gems') {
    player.gems = (player.gems || 0) + reward.amount;
  } else if (reward.type === 'bait') {
    if (!player.baitInventory) player.baitInventory = {};
    if (!player.baitInventory[reward.id]) player.baitInventory[reward.id] = 0;
    player.baitInventory[reward.id] += reward.amount;
  } else if (reward.type === 'item') {
    if (!player.items) player.items = {};
    if (!player.items[reward.id]) player.items[reward.id] = 0;
    player.items[reward.id] += reward.amount;
  }
  return player;
}

export const data = new SlashCommandBuilder()
  .setName('fishshop')
  .setDescription('🛒 Toko item fishing!')
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Lihat semua item di toko')
      .addStringOption(opt =>
        opt.setName('kategori').setDescription('Filter berdasarkan kategori').setRequired(false)
          .addChoices(
            { name: '🎟️ Tiket Zona', value: 'ticket' },
            { name: '🪱 Umpan', value: 'bait' },
            { name: '🎒 Item', value: 'item' },
            { name: '💰 Mata Uang', value: 'currency' }
          )
      )
  )
  .addSubcommand(sub =>
    sub.setName('buy')
      .setDescription('Beli item dari toko')
      .addStringOption(opt => opt.setName('item').setDescription('Item yang ingin dibeli').setRequired(true).setAutocomplete(true))
      .addStringOption(opt =>
        opt.setName('bayar').setDescription('Bayar pakai apa?').setRequired(true)
          .addChoices(
            { name: '🪙 Coins', value: 'coins' },
            { name: '💎 Gems', value: 'gems' }
          )
      )
      .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah yang ingin dibeli (default: 1)').setRequired(false).setMinValue(1).setMaxValue(99))
  )
  .addSubcommand(sub =>
    sub.setName('info')
      .setDescription('Lihat detail item tertentu')
      .addStringOption(opt => opt.setName('item').setDescription('Item yang ingin dilihat').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('inventory')
      .setDescription('Lihat item yang kamu punya')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const { items } = getShopData();

  // ── LIST ──
  if (sub === 'list') {
    const kategori = interaction.options.getString('kategori') || null;
    const filtered = kategori ? items.filter(i => i.type === kategori) : items;
    if (filtered.length === 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Kosong').setDescription('Tidak ada item.')], ephemeral: true });
    }

    const grouped = {};
    for (const item of filtered) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    }

    const embeds = [];
    for (const type of TYPE_ORDER.filter(t => grouped[t])) {
      const lines = grouped[type].map(item => {
        const priceStr = item.priceCoins > 0 && item.priceGems > 0
          ? `🪙 ${formatNumber(item.priceCoins)} / 💎 ${item.priceGems}`
          : item.priceCoins > 0 ? `🪙 ${formatNumber(item.priceCoins)}` : `💎 ${item.priceGems}`;
        return `${item.emoji} **${item.name}** — ${priceStr}\n┗ *${item.description}*`;
      });
      embeds.push(new EmbedBuilder().setColor('#3498db').setTitle(TYPE_LABEL[type]).setDescription(lines.join('\n\n')));
    }

    embeds[0].setTitle(`🛒 FishShop${kategori ? ` — ${TYPE_LABEL[kategori]}` : ''}`);
    embeds[embeds.length - 1].setFooter({ text: '/fishshop buy untuk membeli | /fishshop info untuk detail' });
    return interaction.reply({ embeds, ephemeral: true });
  }

  // ── INFO ──
  if (sub === 'info') {
    const itemId = interaction.options.getString('item');
    const item = items.find(i => i.id === itemId);
    if (!item) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Item Tidak Ditemukan')], ephemeral: true });

    const priceStr = [
      item.priceCoins > 0 ? `🪙 ${formatNumber(item.priceCoins)} Coins` : null,
      item.priceGems > 0 ? `💎 ${item.priceGems} Gems` : null
    ].filter(Boolean).join(' atau ');

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#3498db').setTitle(`${item.emoji} ${item.name}`).setDescription(item.description)
        .addFields(
          { name: '🏷️ Kategori', value: TYPE_LABEL[item.type] || item.type, inline: true },
          { name: '💵 Harga', value: priceStr || 'Gratis', inline: true },
          { name: '📦 Stok', value: item.stock === -1 ? '∞ Unlimited' : `${item.stock}x`, inline: true }
        ).setFooter({ text: `ID: ${item.id}` })
      ], ephemeral: true
    });
  }

  // ── INVENTORY ──
  if (sub === 'inventory') {
    const player = getPlayer(interaction.user.id);
    const playerItems = player.items || {};
    const entries = Object.entries(playerItems).filter(([, qty]) => qty > 0);

    if (entries.length === 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('🎒 Item Inventory').setDescription('Kamu tidak punya item apapun!\nBeli di `/fishshop buy`.')], ephemeral: true });
    }

    const lines = entries.map(([id, qty]) => {
      const item = items.find(i => i.id === id);
      return `${item?.emoji || '📦'} **${item?.name || id}** ×${qty}`;
    });

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#3498db').setTitle('🎒 Item Inventory Kamu').setDescription(lines.join('\n')).setTimestamp()],
      ephemeral: true
    });
  }

  // ── BUY ──
  if (sub === 'buy') {
    const itemId = interaction.options.getString('item');
    const bayar = interaction.options.getString('bayar');
    const jumlah = interaction.options.getInteger('jumlah') || 1;
    const item = items.find(i => i.id === itemId);
    const player = getPlayer(interaction.user.id);

    if (!item) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Item Tidak Ditemukan')], ephemeral: true });

    if (bayar === 'coins' && item.priceCoins <= 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Bisa Bayar Coins').setDescription(`**${item.name}** hanya bisa dibeli dengan 💎 Gems!`)], ephemeral: true });
    }
    if (bayar === 'gems' && item.priceGems <= 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Bisa Bayar Gems').setDescription(`**${item.name}** hanya bisa dibeli dengan 🪙 Coins!`)], ephemeral: true });
    }

    const totalPrice = bayar === 'coins' ? item.priceCoins * jumlah : item.priceGems * jumlah;

    if (bayar === 'coins' && player.coins < totalPrice) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Coins Tidak Cukup').setDescription(`Butuh 🪙 **${formatNumber(totalPrice)}**, punya 🪙 **${formatNumber(player.coins)}**!`)], ephemeral: true });
    }
    if (bayar === 'gems' && (player.gems || 0) < totalPrice) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gems Tidak Cukup').setDescription(`Butuh 💎 **${totalPrice}**, punya 💎 **${player.gems || 0}**!`)], ephemeral: true });
    }

    // Deduct payment
    if (bayar === 'coins') player.coins -= totalPrice;
    else player.gems = (player.gems || 0) - totalPrice;

    // Mystery box — kasih button buka
    if (item.id === 'mystery_box' || item.id === 'mystery_box_premium') {
      if (!player.items) player.items = {};
      if (!player.items[item.id]) player.items[item.id] = 0;
      player.items[item.id] += jumlah;
      savePlayer(interaction.user.id, player);

      const currencyStr = bayar === 'coins' ? `🪙 ${formatNumber(totalPrice)}` : `💎 ${totalPrice}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_box_${item.id}_${interaction.user.id}`)
          .setLabel(`🎁 Buka Sekarang! (${jumlah}x)`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('open_box_later')
          .setLabel('Simpan dulu')
          .setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#f39c12')
          .setTitle(`✅ ${item.emoji} ${item.name} ×${jumlah} Dibeli!`)
          .setDescription(`Kamu membeli **${jumlah}x ${item.name}**!\nMau dibuka sekarang atau disimpan dulu?`)
          .addFields(
            { name: '💵 Dibayar', value: currencyStr, inline: true },
            { name: '📦 Total Dimiliki', value: `${player.items[item.id]}x`, inline: true }
          )
        ],
        components: [row],
        ephemeral: true,
        fetchReply: true
      });

      const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30000 });
      collector.on('collect', async i => {
        if (i.customId === 'open_box_later') {
          await i.update({ components: [], embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('📦 Disimpan!').setDescription(`${item.emoji} **${item.name}** disimpan di inventory.\nGunakan \`/fishshop openbox\` untuk membuka nanti.`)] });
          return;
        }
        if (i.customId.startsWith('open_box_')) {
          await openBoxes(i, item, jumlah);
        }
        collector.stop();
      });
      collector.on('end', async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });
      return;
    }

    // Apply item effect
    const giveResult = giveItemToPlayer(player, item, jumlah);
    savePlayer(interaction.user.id, player);

    const currencyStr = bayar === 'coins' ? `🪙 ${formatNumber(totalPrice)}` : `💎 ${totalPrice}`;
    const sisaStr = bayar === 'coins' ? `🪙 ${formatNumber(player.coins)}` : `💎 ${player.gems}`;

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Pembelian Berhasil!')
        .setDescription(`${item.emoji} **${item.name}** ×${jumlah} berhasil dibeli!`)
        .addFields(
          { name: '💵 Dibayar', value: currencyStr, inline: true },
          { name: '💰 Sisa', value: sisaStr, inline: true },
          { name: '📦 Disimpan di', value: giveResult, inline: false }
        ).setTimestamp()
      ],
      ephemeral: true
    });
  }
}

async function openBoxes(interaction, item, jumlah) {
  const player = getPlayer(interaction.user.id);
  const boxKey = item.id;
  const owned = player.items?.[boxKey] || 0;
  const toOpen = Math.min(jumlah, owned);

  if (toOpen <= 0) {
    return interaction.update({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Box Habis')], components: [] });
  }

  const rewards = item.id === 'mystery_box_premium' ? MYSTERY_BOX_PREMIUM_REWARDS : MYSTERY_BOX_REWARDS;
  const results = [];

  for (let j = 0; j < toOpen; j++) {
    const reward = rollReward(rewards);
    applyReward(player, reward);
    results.push(reward);
  }

  // Kurangi box
  player.items[boxKey] = Math.max(0, owned - toOpen);
  savePlayer(interaction.user.id, player);

  // Group hasil
  const grouped = {};
  for (const r of results) {
    const key = r.label;
    grouped[key] = (grouped[key] || 0) + 1;
  }
  const resultLines = Object.entries(grouped).map(([label, count]) => `${label}${count > 1 ? ` (×${count})` : ''}`);

  const isPremium = item.id === 'mystery_box_premium';
  return interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(isPremium ? '#9b59b6' : '#f39c12')
      .setTitle(`${item.emoji} Hasil Mystery Box (${toOpen}x)!`)
      .setDescription(`🎊 **Kamu mendapatkan:**\n\n${resultLines.join('\n')}`)
      .setFooter({ text: 'Semoga beruntung lain kali!' })
      .setTimestamp()
    ],
    components: []
  });
}

function giveItemToPlayer(player, item, jumlah) {
  if (item.type === 'bait') {
    if (!player.baitInventory) player.baitInventory = {};
    if (!player.baitInventory[item.id]) player.baitInventory[item.id] = 0;
    player.baitInventory[item.id] += jumlah;
    return `🪱 Bait Inventory (Total: ${player.baitInventory[item.id]}x)`;
  }
  if (item.type === 'ticket') {
    if (!player.tickets) player.tickets = {};
    const zonaId = item.zonaId;
    if (!player.tickets[zonaId]) player.tickets[zonaId] = 0;
    player.tickets[zonaId] += jumlah;
    return `🎟️ Ticket Inventory (Total: ${player.tickets[zonaId]}x)`;
  }
  if (item.type === 'currency' && item.effect?.type === 'give_coins') {
    const totalCoins = item.effect.amount * jumlah;
    player.coins += totalCoins;
    return `🪙 ${formatNumber(totalCoins)} Coins langsung ditambahkan!`;
  }
  if (item.effect?.type === 'give_gems') {
    const totalGems = item.effect.amount * jumlah;
    player.gems = (player.gems || 0) + totalGems;
    return `💎 ${totalGems} Gems langsung ditambahkan!`;
  }
  if (item.effect?.type === 'bait_pack') {
    if (!player.baitInventory) player.baitInventory = {};
    const lines = [];
    for (const c of item.effect.contents) {
      if (!player.baitInventory[c.id]) player.baitInventory[c.id] = 0;
      player.baitInventory[c.id] += c.amount * jumlah;
      lines.push(`+${c.amount * jumlah}x ${c.id}`);
    }
    return `🪱 Bait Pack ditambahkan: ${lines.join(', ')}`;
  }
  if (item.effect?.type === 'give_xp') {
    const totalXp = item.effect.amount * jumlah;
    if (!player.xp) player.xp = 0;
    player.xp += totalXp;
    return `📈 +${totalXp} XP langsung ditambahkan!`;
  }
  if (!player.items) player.items = {};
  if (!player.items[item.id]) player.items[item.id] = 0;
  player.items[item.id] += jumlah;
  return `🎒 Item Inventory (Total: ${player.items[item.id]}x)`;
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const { items } = getShopData();
  const choices = items
    .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
    .map(i => {
      const priceStr = i.priceCoins > 0 ? `🪙${formatNumber(i.priceCoins)}` : `💎${i.priceGems}`;
      return { name: `${i.emoji} ${i.name} — ${priceStr}`, value: i.id };
    });
  await interaction.respond(choices.slice(0, 25));
}
