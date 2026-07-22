import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getMutationData } from '../utils/database.js';
import { MUTATION_RARITY_ORDER } from '../utils/fishing.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

const ITEMS_PER_PAGE = 6;

export const data = new SlashCommandBuilder()
  .setName('fishmutation')
  .setDescription('🧬 Lihat daftar semua mutasi ikan!');

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const { mutations } = getMutationData();
  const sorted = [...mutations].sort((a, b) =>
    MUTATION_RARITY_ORDER.indexOf(a.rarity) - MUTATION_RARITY_ORDER.indexOf(b.rarity)
  );

  let page = 0;
  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));

  function buildPage(p) {
    const pageItems = sorted.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE);
    const lines = pageItems.map(m =>
      `${m.emoji} **${m.name}** — \`${m.rarity}\`\n┗ ${m.description}\n┗ 🎲 Chance: ${m.chance}% | 💰 +${m.priceBonus.toLocaleString('id-ID')} Coins`
    ).join('\n\n');

    return new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🧬 Daftar Mutasi Ikan')
      .setDescription(lines || 'Tidak ada mutasi.')
      .setFooter({ text: `Halaman ${p + 1}/${totalPages} • Total: ${mutations.length} mutasi | Chance dapat mutasi: ~20% per mancing` })
      .setTimestamp();
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mut_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('mut_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
  );

  const msg = await interaction.reply({ embeds: [buildPage(page)], components: [row], fetchReply: true });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 60000
  });

  collector.on('collect', async i => {
    if (i.customId === 'mut_next') page = Math.min(page + 1, totalPages - 1);
    if (i.customId === 'mut_prev') page = Math.max(page - 1, 0);
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mut_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('mut_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
    );
    await i.update({ embeds: [buildPage(page)], components: [newRow] });
  });

  collector.on('end', async () => {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mut_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('mut_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(true)
    );
    await msg.edit({ components: [disabledRow] }).catch(() => {});
  });
}
