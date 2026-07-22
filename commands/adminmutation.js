import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMutationData, saveMutationData } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('adminmutation')
  .setDescription('⚙️ [OWNER] Kelola mutasi ikan!')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Tambah mutasi baru')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik mutasi').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama mutasi').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji mutasi').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi mutasi').setRequired(true))
      .addStringOption(opt =>
        opt.setName('rarity').setDescription('Rarity mutasi').setRequired(true)
          .addChoices(
            { name: 'Common', value: 'Common' }, { name: 'Uncommon', value: 'Uncommon' },
            { name: 'Rare', value: 'Rare' }, { name: 'Epic', value: 'Epic' },
            { name: 'Legendary', value: 'Legendary' }, { name: 'Mythic', value: 'Mythic' },
            { name: 'Secret', value: 'Secret' }
          )
      )
      .addNumberOption(opt => opt.setName('chance').setDescription('Chance dalam % (misal: 5 = 5%)').setRequired(true).setMinValue(0.01).setMaxValue(50))
      .addIntegerOption(opt => opt.setName('price_bonus').setDescription('Bonus harga jual (flat coins)').setRequired(true).setMinValue(1))
      .addStringOption(opt => opt.setName('color').setDescription('Warna hex embed (misal: #ff0000)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('Hapus mutasi')
      .addStringOption(opt =>
        opt.setName('id').setDescription('ID mutasi yang ingin dihapus').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Lihat semua mutasi')
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Akses Ditolak')],
      ephemeral: true
    });
  }

  const sub = interaction.options.getSubcommand();
  const mutData = getMutationData();

  // ── ADD ──
  if (sub === 'add') {
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    if (mutData.mutations.find(m => m.id === id)) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada')], ephemeral: true });
    }

    const hexRegex = /^#([0-9A-Fa-f]{6})$/;
    const color = interaction.options.getString('color') || '#9b59b6';

    mutData.mutations.push({
      id,
      name: interaction.options.getString('nama'),
      emoji: interaction.options.getString('emoji'),
      description: interaction.options.getString('deskripsi'),
      rarity: interaction.options.getString('rarity'),
      chance: interaction.options.getNumber('chance'),
      priceBonus: interaction.options.getInteger('price_bonus'),
      color: hexRegex.test(color) ? color : '#9b59b6'
    });
    saveMutationData(mutData);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('✅ Mutasi Ditambahkan!')
          .setDescription(`${interaction.options.getString('emoji')} **${interaction.options.getString('nama')}** berhasil ditambahkan!`)
          .addFields(
            { name: 'Rarity', value: interaction.options.getString('rarity'), inline: true },
            { name: 'Chance', value: `${interaction.options.getNumber('chance')}%`, inline: true },
            { name: 'Price Bonus', value: `+${interaction.options.getInteger('price_bonus').toLocaleString('id-ID')} Coins`, inline: true }
          )
      ],
      ephemeral: true
    });
  }

  // ── DELETE ──
  if (sub === 'delete') {
    const id = interaction.options.getString('id');
    const idx = mutData.mutations.findIndex(m => m.id === id);
    if (idx === -1) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Mutasi Tidak Ditemukan')], ephemeral: true });
    }
    const deleted = mutData.mutations.splice(idx, 1)[0];
    saveMutationData(mutData);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Mutasi Dihapus!').setDescription(`${deleted.emoji} **${deleted.name}** berhasil dihapus!`)],
      ephemeral: true
    });
  }

  // ── LIST ──
  if (sub === 'list') {
    const lines = mutData.mutations.map(m =>
      `${m.emoji} **${m.name}** (\`${m.id}\`) — ${m.rarity} | ${m.chance}% | +${m.priceBonus.toLocaleString('id-ID')}`
    ).join('\n');
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle(`🧬 Semua Mutasi (${mutData.mutations.length})`).setDescription(lines || 'Kosong')],
      ephemeral: true
    });
  }
}

export async function autocomplete(interaction) {
  const mutData = getMutationData();
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = mutData.mutations
    .filter(m => m.id.includes(focused) || m.name.toLowerCase().includes(focused))
    .map(m => ({ name: `${m.emoji} ${m.name} (${m.rarity})`, value: m.id }));
  await interaction.respond(choices.slice(0, 25));
}
