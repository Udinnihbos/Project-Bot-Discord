import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, savePlayer, getFishData } from '../utils/database.js';
import { getRarityEmoji } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('tradefishing')
  .setDescription('🔄 Trade ikan dengan pemain lain!')
  .addSubcommand(sub =>
    sub.setName('send')
      .setDescription('Kirim penawaran trade ke pemain lain')
      .addUserOption(opt =>
        opt.setName('target').setDescription('Pemain yang ingin diajak trade').setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('ikan_kamu')
          .setDescription('Ikan yang kamu tawarkan (nama/id)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt.setName('jumlah_kamu')
          .setDescription('Jumlah ikan yang kamu tawarkan')
          .setMinValue(1)
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('ikan_target')
          .setDescription('Ikan yang kamu minta dari target (nama/id)')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName('jumlah_target')
          .setDescription('Jumlah ikan yang kamu minta')
          .setMinValue(1)
          .setRequired(true)
      )
  );

// Pending trades stored in memory (session only)
const pendingTrades = new Map();

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub !== 'send') return;

  const { fish: fishList } = getFishData();
  const senderId = interaction.user.id;
  const target = interaction.options.getUser('target');

  if (target.id === senderId) {
    return interaction.reply({ content: '❌ Kamu tidak bisa trade dengan dirimu sendiri!', ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });
  }

  const senderPlayer = getPlayer(senderId);
  const targetPlayer = getPlayer(target.id);

  // Resolve sender's fish
  const myFishQuery = interaction.options.getString('ikan_kamu').toLowerCase();
  const myFish = fishList.find(f => f.id === myFishQuery || f.name.toLowerCase().includes(myFishQuery));
  const myAmount = interaction.options.getInteger('jumlah_kamu');

  if (!myFish) return interaction.reply({ content: `❌ Ikan **${myFishQuery}** tidak ditemukan!`, ephemeral: true });

  const myOwned = senderPlayer.inventory[myFish.id] || 0;
  if (myOwned < myAmount) {
    return interaction.reply({
      content: `❌ Kamu hanya punya **${myOwned}x ${myFish.name}**, tidak cukup untuk trade ${myAmount}!`,
      ephemeral: true
    });
  }

  // Resolve target's fish request
  const targetFishQuery = interaction.options.getString('ikan_target').toLowerCase();
  const targetFish = fishList.find(f => f.id === targetFishQuery || f.name.toLowerCase().includes(targetFishQuery));
  const targetAmount = interaction.options.getInteger('jumlah_target');

  if (!targetFish) return interaction.reply({ content: `❌ Ikan **${targetFishQuery}** tidak ditemukan!`, ephemeral: true });

  const targetOwned = targetPlayer.inventory[targetFish.id] || 0;
  if (targetOwned < targetAmount) {
    return interaction.reply({
      content: `❌ **${target.username}** hanya punya **${targetOwned}x ${targetFish.name}**, tidak cukup untuk trade!`,
      ephemeral: true
    });
  }

  // Create trade embed
  const tradeId = `${senderId}_${target.id}_${Date.now()}`;
  pendingTrades.set(tradeId, {
    senderId,
    targetId: target.id,
    myFish,
    myAmount,
    targetFish,
    targetAmount
  });

  const embed = new EmbedBuilder()
    .setColor('#f39c12')
    .setTitle('🔄 Penawaran Trade!')
    .setDescription(`**${interaction.user.username}** mengajak **${target.username}** untuk trade ikan!`)
    .addFields(
      {
        name: `📤 ${interaction.user.username} menawarkan:`,
        value: `${getRarityEmoji(myFish.rarity)} ${myFish.emoji} **${myFish.name}** ×${myAmount}`,
        inline: true
      },
      {
        name: `📥 ${interaction.user.username} meminta:`,
        value: `${getRarityEmoji(targetFish.rarity)} ${targetFish.emoji} **${targetFish.name}** ×${targetAmount}`,
        inline: true
      }
    )
    .setFooter({ text: `${target.username} harus menerima atau menolak dalam 60 detik!` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_accept_${tradeId}`)
      .setLabel('✅ Terima')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trade_reject_${tradeId}`)
      .setLabel('❌ Tolak')
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await interaction.reply({
    content: `${target}`,
    embeds: [embed],
    components: [row],
    fetchReply: true
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === target.id,
    time: 60000,
    max: 1
  });

  collector.on('collect', async i => {
    const trade = pendingTrades.get(tradeId);
    if (!trade) return;
    pendingTrades.delete(tradeId);

    if (i.customId.startsWith('trade_reject')) {
      const rejEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Trade Ditolak')
        .setDescription(`**${target.username}** menolak penawaran trade dari **${interaction.user.username}**.`);
      return i.update({ embeds: [rejEmbed], components: [], content: '' });
    }

    // Accept — re-validate stocks
    const freshSender = getPlayer(senderId);
    const freshTarget = getPlayer(target.id);

    if ((freshSender.inventory[myFish.id] || 0) < myAmount) {
      return i.update({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Trade Gagal').setDescription(`Stok ikan **${interaction.user.username}** tidak cukup lagi!`)],
        components: [], content: ''
      });
    }
    if ((freshTarget.inventory[targetFish.id] || 0) < targetAmount) {
      return i.update({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Trade Gagal').setDescription(`Stok ikan **${target.username}** tidak cukup lagi!`)],
        components: [], content: ''
      });
    }

    // Do the swap
    freshSender.inventory[myFish.id] -= myAmount;
    if (!freshSender.inventory[targetFish.id]) freshSender.inventory[targetFish.id] = 0;
    freshSender.inventory[targetFish.id] += targetAmount;
    if (!freshSender.discovered.includes(targetFish.id)) freshSender.discovered.push(targetFish.id);

    freshTarget.inventory[targetFish.id] -= targetAmount;
    if (!freshTarget.inventory[myFish.id]) freshTarget.inventory[myFish.id] = 0;
    freshTarget.inventory[myFish.id] += myAmount;
    if (!freshTarget.discovered.includes(myFish.id)) freshTarget.discovered.push(myFish.id);

    savePlayer(senderId, freshSender);
    savePlayer(target.id, freshTarget);

    const successEmbed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('✅ Trade Berhasil!')
      .setDescription(`Trade antara **${interaction.user.username}** dan **${target.username}** berhasil!`)
      .addFields(
        {
          name: `${interaction.user.username} mendapat:`,
          value: `${getRarityEmoji(targetFish.rarity)} ${targetFish.emoji} **${targetFish.name}** ×${targetAmount}`,
          inline: true
        },
        {
          name: `${target.username} mendapat:`,
          value: `${getRarityEmoji(myFish.rarity)} ${myFish.emoji} **${myFish.name}** ×${myAmount}`,
          inline: true
        }
      )
      .setTimestamp();

    await i.update({ embeds: [successEmbed], components: [], content: '' });
  });

  collector.on('end', (collected) => {
    if (collected.size === 0) {
      pendingTrades.delete(tradeId);
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('trade_accept').setLabel('✅ Terima').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId('trade_reject').setLabel('❌ Tolak').setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      msg.edit({ components: [disabledRow], content: '⏰ Trade sudah kedaluwarsa!' }).catch(() => {});
    }
  });
}

export async function autocomplete(interaction) {
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const { fish: fishList } = getFishData();
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = [];
  for (const [fishId, qty] of Object.entries(player.inventory)) {
    if (qty <= 0) continue;
    const fish = fishList.find(f => f.id === fishId);
    if (!fish) continue;
    if (fish.name.toLowerCase().includes(focused) || fish.id.includes(focused)) {
      choices.push({ name: `${fish.emoji} ${fish.name} (×${qty})`, value: fish.id });
    }
  }

  await interaction.respond(choices.slice(0, 25));
}
