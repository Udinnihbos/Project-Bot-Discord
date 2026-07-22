import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, savePlayer, getRodData } from '../utils/database.js';
import { formatNumber } from '../utils/fishing.js';

const COOLDOWN_BASE = 10;

function getRodStars(luckBonus) {
  if (luckBonus >= 400) return '⭐⭐⭐⭐⭐';
  if (luckBonus >= 200) return '⭐⭐⭐⭐';
  if (luckBonus >= 100) return '⭐⭐⭐';
  if (luckBonus >= 40)  return '⭐⭐';
  return '⭐';
}

function buildLuckBar(luck, max = 420) {
  const filled = Math.min(Math.round((luck / max) * 10), 10);
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
}

function buildRodDetailEmbed(rod, player, allRods) {
  const isEquipped = player.equippedRod === rod.id;
  const cooldown = Math.max(3, COOLDOWN_BASE - (rod.cooldownReduction || 0));
  const luckBar = buildLuckBar(rod.luckBonus || 0);
  const stars = getRodStars(rod.luckBonus || 0);
  const mutMult = rod.mutationMultiplier || 1.0;

  // Rank among owned rods
  const ownedRods = allRods.filter(r => (player.ownedRods || []).includes(r.id));
  const rank = ownedRods.sort((a, b) => (b.luckBonus || 0) - (a.luckBonus || 0)).findIndex(r => r.id === rod.id) + 1;

  const embed = new EmbedBuilder()
    .setColor(isEquipped ? '#2ecc71' : '#3498db')
    .setTitle(`${rod.emoji} ${rod.name} ${isEquipped ? '✅ (Dipakai)' : ''}`)
    .setDescription(rod.description || 'Pancingan andalan para pemancing.')
    .addFields(
      {
        name: '🍀 Luck Bonus',
        value: `\`${luckBar}\` +${rod.luckBonus || 0}%\n${stars}`,
        inline: false
      },
      { name: '⏱️ Cooldown', value: `${cooldown} detik`, inline: true },
      { name: '🧬 Mutasi Mult', value: `×${mutMult}`, inline: true },
      { name: '🏆 Rank', value: `#${rank} dari ${ownedRods.length} rod`, inline: true },
      {
        name: '💰 Harga Beli',
        value: rod.price > 0 ? `🪙 ${formatNumber(rod.price)}` : rod.isDefault ? '🎁 Default' : '🎁 Hadiah Level',
        inline: true
      },
      { name: '🆔 ID', value: `\`${rod.id}\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: true }
    )
    .setFooter({ text: isEquipped ? 'Rod ini sedang aktif digunakan!' : 'Klik "Pakai Rod Ini" untuk menggantinya.' })
    .setTimestamp();

  return embed;
}

function buildRodListEmbed(player, ownedRods) {
  const equippedRod = ownedRods.find(r => r.id === player.equippedRod);

  const lines = ownedRods
    .sort((a, b) => (b.luckBonus || 0) - (a.luckBonus || 0))
    .map(r => {
      const isEq = r.id === player.equippedRod;
      const cooldown = Math.max(3, COOLDOWN_BASE - (r.cooldownReduction || 0));
      return `${isEq ? '✅ ' : ''}${r.emoji} **${r.name}**\n┗ 🍀 +${r.luckBonus || 0}% | ⏱️ ${cooldown}s | 🧬 ×${r.mutationMultiplier || 1}`;
    });

  return new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('🎣 Rod Collection')
    .setDescription(lines.join('\n\n') || 'Belum punya rod.')
    .addFields(
      { name: '🎣 Rod Aktif', value: equippedRod ? `${equippedRod.emoji} **${equippedRod.name}** (+${equippedRod.luckBonus || 0}% luck)` : '❓ Tidak diketahui', inline: false },
      { name: '📦 Total Dimiliki', value: `${ownedRods.length} rod`, inline: true }
    )
    .setFooter({ text: 'Pilih rod dari menu di bawah untuk melihat detail & menggantinya!' })
    .setTimestamp();
}

export const data = new SlashCommandBuilder()
  .setName('rodlist')
  .setDescription('🎣 Lihat semua rod yang kamu miliki dan ganti rod aktif!');

export async function execute(interaction) {
  const userId = interaction.user.id;
  let player = getPlayer(userId);
  const { rods: allRods } = getRodData();

  const ownedRods = allRods.filter(r => (player.ownedRods || ['pancing_bambu']).includes(r.id));

  if (ownedRods.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Belum Punya Rod').setDescription('Kamu belum punya rod! Beli di `/rodshop`.')],
      ephemeral: true
    });
  }

  // Build select menu
  function buildSelectMenu(currentEquipped) {
    const sortedRods = [...ownedRods].sort((a, b) => (b.luckBonus || 0) - (a.luckBonus || 0));
    const options = sortedRods.map(r => {
      const isEq = r.id === currentEquipped;
      const cooldown = Math.max(3, COOLDOWN_BASE - (r.cooldownReduction || 0));
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${r.name}${isEq ? ' ✅' : ''}`)
        .setDescription(`Luck: +${r.luckBonus || 0}% | Cooldown: ${cooldown}s | Mutasi: ×${r.mutationMultiplier || 1}`)
        .setValue(r.id)
        .setEmoji(r.emoji || '🎣')
        .setDefault(isEq);
    });

    return new StringSelectMenuBuilder()
      .setCustomId('rod_select')
      .setPlaceholder('🎣 Pilih rod untuk lihat detail...')
      .addOptions(options);
  }

  function buildEquipButton(rodId, currentEquipped) {
    const isEq = rodId === currentEquipped;
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`equip_rod_${rodId}`)
        .setLabel(isEq ? '✅ Sedang Dipakai' : '🎣 Pakai Rod Ini')
        .setStyle(isEq ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(isEq)
    );
  }

  const listEmbed = buildRodListEmbed(player, ownedRods);
  const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(player.equippedRod));

  const msg = await interaction.reply({
    ephemeral: true,
    embeds: [listEmbed],
    components: [selectRow],
    fetchReply: true
  });

  let selectedRodId = player.equippedRod;

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 120000
  });

  collector.on('collect', async i => {
    player = getPlayer(userId);

    if (i.customId === 'rod_select') {
      selectedRodId = i.values[0];
      const rod = allRods.find(r => r.id === selectedRodId);
      const detailEmbed = buildRodDetailEmbed(rod, player, allRods);
      const newSelectRow = new ActionRowBuilder().addComponents(buildSelectMenu(player.equippedRod));
      const equipRow = buildEquipButton(selectedRodId, player.equippedRod);
      await i.update({ embeds: [detailEmbed], components: [newSelectRow, equipRow] });

    } else if (i.customId.startsWith('equip_rod_')) {
      const rodId = i.customId.replace('equip_rod_', '');
      const rod = allRods.find(r => r.id === rodId);
      const oldRod = allRods.find(r => r.id === player.equippedRod);

      if (!rod) {
        await i.reply({ content: '❌ Rod tidak ditemukan!', ephemeral: true });
        return;
      }

      player.equippedRod = rodId;
      savePlayer(userId, player);

      const detailEmbed = buildRodDetailEmbed(rod, player, allRods);
      const newSelectRow = new ActionRowBuilder().addComponents(buildSelectMenu(rodId));
      const equipRow = buildEquipButton(rodId, rodId);

      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Rod Diganti!')
            .setDescription(`${oldRod ? `${oldRod.emoji} **${oldRod.name}**` : '?'} → ${rod.emoji} **${rod.name}**`)
            .addFields(
              { name: '🍀 Luck Baru', value: `+${rod.luckBonus || 0}%`, inline: true },
              { name: '⏱️ Cooldown', value: `${Math.max(3, COOLDOWN_BASE - (rod.cooldownReduction || 0))}s`, inline: true }
            )
            .setTimestamp(),
          detailEmbed
        ],
        components: [newSelectRow, equipRow]
      });
    }
  });

  collector.on('end', async () => {
    await msg.edit({ components: [] }).catch(() => {});
  });
}
