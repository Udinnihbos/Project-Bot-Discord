import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, savePlayer, getBaitData } from '../utils/database.js';
import { formatNumber } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

function buildBaitDetailEmbed(bait, player) {
  const owned = player.baitInventory?.[bait.id] || 0;
  const isActive = player.activeBait === bait.id;

  const effects = [];
  if (bait.luckBonus > 0) effects.push(`🍀 +${bait.luckBonus}% Luck`);
  if (bait.rarityBoost) {
    for (const [rarity, mult] of Object.entries(bait.rarityBoost)) {
      effects.push(`📈 ${rarity} ×${mult}`);
    }
  }

  // Rarity boost bar visual
  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
  const boostLines = bait.rarityBoost
    ? rarityOrder
        .filter(r => bait.rarityBoost[r])
        .map(r => {
          const mult = bait.rarityBoost[r];
          const bar = '▰'.repeat(Math.min(Math.round(mult * 2), 10));
          return `\`${r.padEnd(10)}\` ${bar} ×${mult}`;
        }).join('\n')
    : null;

  const embed = new EmbedBuilder()
    .setColor(isActive ? '#2ecc71' : '#8B4513')
    .setTitle(`${bait.emoji} ${bait.name} ${isActive ? '🪱 (Aktif)' : ''}`)
    .setDescription(bait.description)
    .addFields(
      { name: '📦 Dimiliki', value: `${owned}x`, inline: true },
      { name: '💰 Harga Beli', value: `🪙 ${formatNumber(bait.price)}`, inline: true },
      { name: '🍀 Luck Bonus', value: bait.luckBonus > 0 ? `+${bait.luckBonus}%` : 'Tidak ada', inline: true }
    );

  if (boostLines) {
    embed.addFields({ name: '📊 Rarity Boost', value: boostLines, inline: false });
  }

  embed
    .setFooter({ text: isActive ? 'Umpan ini sedang aktif!' : owned > 0 ? 'Klik "Pasang Umpan" untuk mengaktifkan.' : 'Beli di /fishshop atau /buybait.' })
    .setTimestamp();

  return embed;
}

function buildBaitListEmbed(player, baits) {
  const ownedBaits = baits.filter(b => (player.baitInventory?.[b.id] || 0) > 0);
  const activeBait = baits.find(b => b.id === player.activeBait);

  if (ownedBaits.length === 0) {
    return new EmbedBuilder()
      .setColor('#95a5a6')
      .setTitle('🪱 Bait Collection')
      .setDescription('Kamu tidak punya umpan apapun!\nBeli di `/fishshop` atau `/buybait`.')
      .setTimestamp();
  }

  const lines = ownedBaits.map(b => {
    const qty = player.baitInventory?.[b.id] || 0;
    const isActive = player.activeBait === b.id;
    const effects = [];
    if (b.luckBonus > 0) effects.push(`+${b.luckBonus}% luck`);
    if (b.rarityBoost) {
      const boosts = Object.entries(b.rarityBoost).map(([r, v]) => `${r} ×${v}`).join(', ');
      effects.push(boosts);
    }
    return `${isActive ? '🪱 ' : ''}${b.emoji} **${b.name}** ×${qty}\n┗ ${effects.join(' | ') || 'Tidak ada efek'}`;
  });

  return new EmbedBuilder()
    .setColor('#8B4513')
    .setTitle('🪱 Bait Collection')
    .setDescription(lines.join('\n\n'))
    .addFields(
      { name: '🪱 Umpan Aktif', value: activeBait ? `${activeBait.emoji} **${activeBait.name}** (${player.baitInventory?.[activeBait.id] || 0}x tersisa)` : '❌ Tidak ada umpan aktif', inline: false },
      { name: '📦 Total Jenis', value: `${ownedBaits.length} jenis umpan`, inline: true }
    )
    .setFooter({ text: 'Pilih umpan dari menu di bawah untuk detail & memasangnya!' })
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName('baitlist')
  .setDescription('🪱 Lihat semua umpan yang kamu miliki dan pasang umpan aktif!');

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  let player = getPlayer(userId);
  const { baits } = getBaitData();

  const ownedBaits = baits.filter(b => (player.baitInventory?.[b.id] || 0) > 0);

  if (ownedBaits.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle('🪱 Bait Collection')
        .setDescription('Kamu tidak punya umpan apapun!\nBeli di `/fishshop` atau `/buybait`.')
      ],
      ephemeral: true
    });
  }

  function buildSelectMenu(activeBaitId) {
    const options = ownedBaits.map(b => {
      const qty = player.baitInventory?.[b.id] || 0;
      const isActive = b.id === activeBaitId;
      const effectDesc = b.luckBonus > 0
        ? `+${b.luckBonus}% luck | ${qty}x dimiliki`
        : `Rarity boost | ${qty}x dimiliki`;
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${b.name}${isActive ? ' 🪱' : ''} (×${qty})`)
        .setDescription(effectDesc.substring(0, 100))
        .setValue(b.id)
        .setEmoji(b.emoji)
        .setDefault(isActive);
    });

    return new StringSelectMenuBuilder()
      .setCustomId('bait_select')
      .setPlaceholder('🪱 Pilih umpan untuk lihat detail...')
      .addOptions(options);
  }

  function buildUseButton(baitId, activeBaitId, owned) {
    const isActive = baitId === activeBaitId;
    const isOut = owned <= 0;
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`use_bait_${baitId}`)
        .setLabel(isActive ? '🪱 Sedang Aktif' : isOut ? '❌ Habis' : '🪱 Pasang Umpan Ini')
        .setStyle(isActive ? ButtonStyle.Success : isOut ? ButtonStyle.Danger : ButtonStyle.Primary)
        .setDisabled(isActive || isOut),
      new ButtonBuilder()
        .setCustomId('remove_bait')
        .setLabel('🚫 Lepas Umpan')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!activeBaitId)
    );
  }

  const listEmbed = buildBaitListEmbed(player, baits);
  const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(player.activeBait));

  const msg = await interaction.reply({
    ephemeral: true,
    embeds: [listEmbed],
    components: [selectRow],
    fetchReply: true
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 120000
  });

  collector.on('collect', async i => {
    player = getPlayer(userId);

    if (i.customId === 'bait_select') {
      const baitId = i.values[0];
      const bait = baits.find(b => b.id === baitId);
      const owned = player.baitInventory?.[baitId] || 0;
      const detailEmbed = buildBaitDetailEmbed(bait, player);
      const newSelectRow = new ActionRowBuilder().addComponents(buildSelectMenu(player.activeBait));
      const useRow = buildUseButton(baitId, player.activeBait, owned);
      await i.update({ embeds: [detailEmbed], components: [newSelectRow, useRow] });

    } else if (i.customId.startsWith('use_bait_')) {
      const baitId = i.customId.replace('use_bait_', '');
      const bait = baits.find(b => b.id === baitId);
      const owned = player.baitInventory?.[baitId] || 0;

      if (owned <= 0) {
        await i.reply({ content: '❌ Umpan sudah habis!', ephemeral: true });
        return;
      }

      player.activeBait = baitId;
      savePlayer(userId, player);

      const detailEmbed = buildBaitDetailEmbed(bait, player);
      const newSelectRow = new ActionRowBuilder().addComponents(buildSelectMenu(baitId));
      const useRow = buildUseButton(baitId, baitId, owned);

      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🪱 Umpan Dipasang!')
            .setDescription(`${bait.emoji} **${bait.name}** siap digunakan!\nUmpan akan otomatis terpakai saat kamu \`/mancing\`.`)
            .addFields(
              { name: '📦 Sisa', value: `${owned}x`, inline: true },
              { name: '🍀 Luck', value: bait.luckBonus > 0 ? `+${bait.luckBonus}%` : '-', inline: true }
            )
            .setTimestamp(),
          detailEmbed
        ],
        components: [newSelectRow, useRow]
      });

    } else if (i.customId === 'remove_bait') {
      player.activeBait = null;
      savePlayer(userId, player);

      const listEmbed2 = buildBaitListEmbed(player, baits);
      const newSelectRow = new ActionRowBuilder().addComponents(buildSelectMenu(null));

      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor('#95a5a6')
            .setTitle('🚫 Umpan Dilepas')
            .setDescription('Tidak ada umpan aktif sekarang.\nMancing tanpa bonus umpan.')
            .setTimestamp(),
          listEmbed2
        ],
        components: [newSelectRow]
      });
    }
  });

  collector.on('end', async () => {
    await msg.edit({ components: [] }).catch(() => {});
  });
}
