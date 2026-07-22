import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, getFishData, getZonaByChannel, getZonaData } from '../utils/database.js';
import { getRarityEmoji, getRarityColor, RARITY_ORDER, formatNumber, formatChance } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

const ITEMS_PER_PAGE = 10;

const RARITY_COLOR_MAP = {
  Common: '#95a5a6',
  Uncommon: '#2ecc71',
  Rare: '#3498db',
  Epic: '#9b59b6',
  Legendary: '#f1c40f',
  Mythic: '#e74c3c',
  Secret: '#1a1a2e',
};

function buildProgressBar(current, total, length = 12) {
  const filled = Math.round((current / total) * length);
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)}`;
}

function buildEmbed(player, fishList, page, username, mode, zonaInfo = null) {
  let filteredFish = fishList;
  let title = `📖 Fish Index`;
  let modeLabel = '';
  let embedColor = '#3498db';

  if (mode === 'zona' && zonaInfo) {
    filteredFish = fishList.filter(f => zonaInfo.fish.includes(f.id));
    title = `${zonaInfo.emoji} Fish Index — ${zonaInfo.nama}`;
    modeLabel = `${zonaInfo.emoji} ${zonaInfo.nama}`;
    embedColor = zonaInfo.color || '#3498db';
  } else {
    modeLabel = '📖 Semua Ikan';
  }

  // Build entries grouped by rarity, sorted by chance descending within each rarity
  const allEntries = [];
  for (const rarity of RARITY_ORDER) {
    const fishInRarity = filteredFish
      .filter(f => f.rarity === rarity)
      .sort((a, b) => b.chance - a.chance); // chance besar (mudah) duluan
    for (const fish of fishInRarity) {
      const qty = Object.entries(player.inventory)
        .filter(([key]) => key === fish.id || key.startsWith(fish.id + '__'))
        .reduce((sum, [, v]) => sum + v, 0);
      const discovered = player.discovered.includes(fish.id);
      allEntries.push({ fish, qty, discovered, rarity });
    }
  }

  const totalPages = Math.max(1, Math.ceil(allEntries.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = allEntries.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

  const discoveredCount = allEntries.filter(e => e.discovered).length;
  const total = allEntries.length;
  const progressPct = total > 0 ? Math.round((discoveredCount / total) * 100) : 0;
  const progressBar = buildProgressBar(discoveredCount, total);

  // Group page entries by rarity for cleaner display
  let desc = '';
  let currentRarity = null;
  for (const { fish, qty, discovered, rarity } of pageEntries) {
    if (rarity !== currentRarity) {
      const rarityEmoji = getRarityEmoji(rarity);
      desc += `\n**${rarityEmoji} ${rarity}**\n`;
      currentRarity = rarity;
    }
    if (discovered) {
      const chance = formatChance(fish.chance);
      const invText = qty > 0 ? ` ×${qty}` : ' *(belum punya)*';
      desc += `${fish.emoji} **${fish.name}**${invText}\n`;
      desc += `┗ 🎲 \`${chance}\` | 🪙 ${formatNumber(fish.price)}\n`;
    } else {
      desc += `❓ **???** *(belum ditemukan)*\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(title)
    .setDescription(desc.trim() || 'Tidak ada ikan.')
    .addFields(
      { 
        name: '📊 Progress Koleksi', 
        value: `\`[${progressBar}]\` ${discoveredCount}/${total} (${progressPct}%)`, 
        inline: false 
      },
      { name: '🗂️ Mode', value: modeLabel, inline: true },
      { name: '👤 Player', value: username, inline: true },
    )
    .setFooter({ text: `Halaman ${safePage + 1}/${totalPages} • Ikan belum ditemukan tidak tampil chance-nya` })
    .setTimestamp();

  return { embed, totalPages, safePage };
}

export const data = new SlashCommandBuilder()
  .setName('fishindex')
  .setDescription('📖 Lihat koleksi ikan yang sudah kamu temukan!')
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Tampilkan index zona ini atau semua ikan')
      .setRequired(false)
      .addChoices(
        { name: '🗺️ Zona Ini (default)', value: 'zona' },
        { name: '📖 Semua Ikan', value: 'all' }
      )
  );

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();

  // Determine mode
  const modeInput = interaction.options.getString('mode') || 'zona';
  const zona = getZonaByChannel(interaction.channelId);

  // If mode is zona but channel is not a zona, fallback to all
  let mode = modeInput;
  if (mode === 'zona' && !zona) mode = 'all';

  let page = 0;
  const { embed, totalPages, safePage } = buildEmbed(player, fishList, page, interaction.user.username, mode, zona);
  page = safePage;

  const buildRow = (currentPage, total) => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fishidx_prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId('fishidx_zona')
      .setLabel('🗺️ Zona')
      .setStyle(mode === 'zona' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!zona),
    new ButtonBuilder()
      .setCustomId('fishidx_all')
      .setLabel('📖 Semua')
      .setStyle(mode === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('fishidx_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= total - 1)
  );

  const msg = await interaction.reply({
    ephemeral: true,
    embeds: [embed],
    components: [buildRow(page, totalPages)],
    fetchReply: true
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 60000
  });

  let currentTotalPages = totalPages;

  collector.on('collect', async i => {
    if (i.customId === 'fishidx_zona') { mode = 'zona'; page = 0; }
    else if (i.customId === 'fishidx_all') { mode = 'all'; page = 0; }
    
    // Rebuild dengan mode baru dulu untuk dapat totalPages yang benar
    const updated = buildEmbed(player, fishList, page, interaction.user.username, mode, zona);
    currentTotalPages = updated.totalPages;

    if (i.customId === 'fishidx_next') page = Math.min(page + 1, currentTotalPages - 1);
    else if (i.customId === 'fishidx_prev') page = Math.max(page - 1, 0);

    const final = buildEmbed(player, fishList, page, interaction.user.username, mode, zona);
    page = final.safePage;
    currentTotalPages = final.totalPages;

    await i.update({
      embeds: [final.embed],
      components: [buildRow(page, final.totalPages)]
    });
  });

  collector.on('end', async () => {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fishidx_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('fishidx_zona').setLabel('🗺️ Zona').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('fishidx_all').setLabel('📖 Semua').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('fishidx_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(true)
    );
    await msg.edit({ components: [disabledRow] }).catch(() => {});
  });
}
