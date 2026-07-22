import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { getZonaData, saveZonaData, getFishData, saveFishData, getRodData, saveRodData, getPlayer, savePlayer, getShopData, saveShopData, getSpawnConfig, saveSpawnConfig } from '../utils/database.js';
import { getRarityEmoji, formatChance, formatNumber, formatGems } from '../utils/fishing.js';;
import { spawnFish, startAutoInterval, stopAutoInterval } from '../utils/spawnNotifier.js';

export const data = new SlashCommandBuilder()
  .setName('adminfishing')
  .setDescription('⚙️ [OWNER] Kelola zona mancing!')

  // ── ZONA ──
  .addSubcommand(sub =>
    sub.setName('addzona')
      .setDescription('Buat zona mancing baru')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik zona (contoh: laut_dalam)').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama zona').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji zona').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi zona').setRequired(true))
      .addStringOption(opt => opt.setName('warna').setDescription('Warna embed hex (contoh: #3498db)').setRequired(false))
      .addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel existing (kosongkan = auto create)').setRequired(false))
      .addStringOption(opt => opt.setName('category').setDescription('ID category untuk auto create channel (opsional)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('delzona')
      .setDescription('Hapus zona mancing')
      .addStringOption(opt => opt.setName('id').setDescription('ID zona').setRequired(true).setAutocomplete(true))
      .addBooleanOption(opt => opt.setName('del_channel').setDescription('Hapus channel Discord-nya juga? (default: tidak)').setRequired(false))
  )
  .addSubcommand(sub => {
    let s = sub.setName('addzonafish').setDescription('Tambah banyak ikan ke zona sekaligus (max 10)');
    s = s.addStringOption(opt => opt.setName('zona_id').setDescription('ID zona').setRequired(true).setAutocomplete(true));
    for (let i = 1; i <= 10; i++) {
      s = s.addStringOption(opt =>
        opt.setName(`ikan_${i}`)
          .setDescription(`Ikan ke-${i}${i === 1 ? ' (wajib)' : ' (opsional)'}`)
          .setRequired(i === 1)
          .setAutocomplete(true)
      );
    }
    return s;
  })
  .addSubcommand(sub =>
    sub.setName('removezonafish')
      .setDescription('Hapus ikan dari zona')
      .addStringOption(opt => opt.setName('zona_id').setDescription('ID zona').setRequired(true).setAutocomplete(true))
      .addStringOption(opt => opt.setName('fish_id').setDescription('ID ikan').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('listzona')
      .setDescription('Lihat semua zona yang ada')
  )

  // ── FISH ──
  .addSubcommand(sub =>
    sub.setName('addfish')
      .setDescription('Tambah ikan baru ke database')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik ikan (lowercase, no spasi, gunakan _)').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama ikan').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji ikan').setRequired(true))
      .addStringOption(opt =>
        opt.setName('rarity').setDescription('Rarity ikan').setRequired(true)
          .addChoices(
            { name: '⚪ Common', value: 'Common' },
            { name: '🟢 Uncommon', value: 'Uncommon' },
            { name: '🔵 Rare', value: 'Rare' },
            { name: '🟣 Epic', value: 'Epic' },
            { name: '🟡 Legendary', value: 'Legendary' },
            { name: '🔴 Mythic', value: 'Mythic' },
            { name: '⭐ Secret', value: 'Secret' }
          )
      )
      .addIntegerOption(opt => opt.setName('chance').setDescription('Angka pembilang chance (contoh: 1)').setRequired(true).setMinValue(1))
      .addIntegerOption(opt => opt.setName('banding').setDescription('Angka penyebut chance (contoh: 100 → berarti 1/100)').setRequired(true).setMinValue(1))
      .addStringOption(opt =>
        opt.setName('jenis').setDescription('Satuan penyebut').setRequired(true)
          .addChoices(
            { name: 'Biasa (contoh: 1/100)', value: 'biasa' },
            { name: 'K - Ribu (contoh: 1/1K = 1/1.000)', value: 'k' },
            { name: 'M - Juta (contoh: 1/1M = 1/1.000.000)', value: 'm' }
          )
      )
      .addIntegerOption(opt => opt.setName('harga').setDescription('Harga jual ikan (coins)').setRequired(true).setMinValue(1))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi ikan').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('delfish')
      .setDescription('Hapus ikan dari database')
      .addStringOption(opt => opt.setName('id').setDescription('ID ikan yang ingin dihapus').setRequired(true).setAutocomplete(true))
  )

  // ── ROD ──
  .addSubcommand(sub =>
    sub.setName('addrod')
      .setDescription('Tambah pancingan baru ke toko')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik pancingan (lowercase, gunakan _)').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama pancingan').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji pancingan').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi pancingan').setRequired(true))
      .addIntegerOption(opt => opt.setName('harga').setDescription('Harga beli (coins)').setRequired(true).setMinValue(0))
      .addIntegerOption(opt => opt.setName('luck').setDescription('Luck bonus dalam % (max 1500)').setRequired(true).setMinValue(0).setMaxValue(1500))
      .addIntegerOption(opt => opt.setName('cooldown').setDescription('Pengurangan cooldown dalam detik (max 9)').setRequired(true).setMinValue(0).setMaxValue(9))
      .addNumberOption(opt => opt.setName('mutasi_mult').setDescription('Multiplier harga mutasi ikan (contoh: 2.0 = harga mutasi ×2, default 1.0)').setRequired(false).setMinValue(1.0).setMaxValue(10.0))
  )
  .addSubcommand(sub =>
    sub.setName('delrod')
      .setDescription('Hapus pancingan dari database')
      .addStringOption(opt => opt.setName('id').setDescription('ID pancingan yang ingin dihapus').setRequired(true).setAutocomplete(true))
  )

  // ── GEMS ──
  .addSubcommand(sub =>
    sub.setName('addgems')
      .setDescription('Tambah gems ke user')
      .addUserOption(opt => opt.setName('user').setDescription('User yang ingin ditambah gems').setRequired(true))
      .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah gems yang ingin ditambahkan').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('delgems')
      .setDescription('Kurangi gems dari user')
      .addUserOption(opt => opt.setName('user').setDescription('User yang ingin dikurangi gems').setRequired(true))
      .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah gems yang ingin dikurangi').setRequired(true).setMinValue(1))
  )

  // ── ZONA TEMP & SPAWN ──
  .addSubcommand(sub =>
    sub.setName('addtempzona')
      .setDescription('Buat zona event temporary')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik zona').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama zona').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji zona').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi zona').setRequired(true))
      .addIntegerOption(opt => opt.setName('durasi').setDescription('Durasi zona dalam menit').setRequired(true).setMinValue(1).setMaxValue(1440))
      .addStringOption(opt => opt.setName('warna').setDescription('Warna embed hex').setRequired(false))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel existing (kosongkan = auto create)').setRequired(false))
      .addStringOption(opt => opt.setName('category').setDescription('ID category untuk auto create channel').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('spawnfish')
      .setDescription('Spawn ikan eksklusif sementara di zona')
      .addStringOption(opt => opt.setName('zona_id').setDescription('ID zona').setRequired(true).setAutocomplete(true))
      .addStringOption(opt => opt.setName('fish_id').setDescription('ID ikan').setRequired(true).setAutocomplete(true))
      .addIntegerOption(opt => opt.setName('durasi').setDescription('Durasi spawn dalam menit').setRequired(true).setMinValue(1).setMaxValue(120))
  )
  .addSubcommand(sub =>
    sub.setName('setrestricted')
      .setDescription('Set zona jadi restricted (butuh tiket) atau unset')
      .addStringOption(opt => opt.setName('zona_id').setDescription('ID zona').setRequired(true).setAutocomplete(true))
      .addBooleanOption(opt => opt.setName('restricted').setDescription('true = restricted, false = bebas').setRequired(true))
      .addIntegerOption(opt => opt.setName('harga_coins').setDescription('Harga tiket dalam coins (0 = gratis)').setRequired(false))
      .addIntegerOption(opt => opt.setName('harga_gems').setDescription('Harga tiket dalam gems (0 = tidak bisa bayar gems)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('setspawninterval')
      .setDescription('Set interval otomatis spawn ikan eksklusif')
      .addIntegerOption(opt => opt.setName('menit').setDescription('Interval dalam menit (0 = matikan auto spawn)').setRequired(true).setMinValue(0).setMaxValue(1440))
  )

  // ── SHOP ──
  .addSubcommand(sub =>
    sub.setName('addshopitem')
      .setDescription('Tambah item baru ke FishShop')
      .addStringOption(opt => opt.setName('id').setDescription('ID unik item').setRequired(true))
      .addStringOption(opt => opt.setName('nama').setDescription('Nama item').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji item').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi item').setRequired(true))
      .addStringOption(opt =>
        opt.setName('tipe').setDescription('Tipe item').setRequired(true)
          .addChoices(
            { name: '🎟️ Tiket Zona', value: 'ticket' },
            { name: '🪱 Umpan', value: 'bait' },
            { name: '🎒 Item', value: 'item' },
            { name: '💰 Mata Uang', value: 'currency' }
          )
      )
      .addIntegerOption(opt => opt.setName('harga_coins').setDescription('Harga dalam coins (0 = tidak bisa beli coins)').setRequired(true).setMinValue(0))
      .addIntegerOption(opt => opt.setName('harga_gems').setDescription('Harga dalam gems (0 = tidak bisa beli gems)').setRequired(true).setMinValue(0))
      .addStringOption(opt => opt.setName('zona_id').setDescription('ID zona (wajib jika tipe tiket)').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('delshopitem')
      .setDescription('Hapus item dari FishShop')
      .addStringOption(opt => opt.setName('id').setDescription('ID item yang ingin dihapus').setRequired(true).setAutocomplete(true))
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Akses Ditolak').setDescription('Hanya untuk **Owner**!')],
      ephemeral: true
    });
  }

  const sub = interaction.options.getSubcommand();

  // ════════════════════════════════
  // ZONA
  // ════════════════════════════════

  if (sub === 'addzona') {
    const zonaData = getZonaData();
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const nama = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const deskripsi = interaction.options.getString('deskripsi');
    const warna = interaction.options.getString('warna') || '#3498db';
    const existingChannel = interaction.options.getChannel('channel');
    const categoryId = interaction.options.getString('category');

    if (zonaData.zonas[id]) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada').setDescription(`Zona **\`${id}\`** sudah ada!`)],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    let channelId, channelMention;

    if (existingChannel) {
      channelId = existingChannel.id;
      channelMention = existingChannel.toString();
    } else {
      try {
        const options = {
          name: `${emoji}｜${nama.toLowerCase().replace(/\s+/g, '-')}`,
          type: ChannelType.GuildText,
          topic: `🎣 Zona Mancing: ${nama} | ${deskripsi}`
        };
        if (categoryId) options.parent = categoryId;

        const newChannel = await interaction.guild.channels.create(options);
        channelId = newChannel.id;
        channelMention = newChannel.toString();

        await newChannel.send({
          embeds: [new EmbedBuilder()
            .setColor(warna)
            .setTitle(`${emoji} Selamat Datang di ${nama}!`)
            .setDescription(deskripsi)
            .setFooter({ text: 'Gunakan /mancing untuk memancing di zona ini!' })
          ]
        });
      } catch (e) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gagal Buat Channel').setDescription(`Error: ${e.message}\nPastikan bot punya permission **Manage Channels**!`)]
        });
      }
    }

    zonaData.zonas[id] = { id, nama, emoji, deskripsi, color: warna, channelId, fish: [], createdAt: Date.now() };
    saveZonaData(zonaData);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(warna)
        .setTitle('✅ Zona Berhasil Dibuat!')
        .addFields(
          { name: 'ID', value: `\`${id}\``, inline: true },
          { name: 'Nama', value: `${emoji} ${nama}`, inline: true },
          { name: 'Channel', value: channelMention, inline: true },
          { name: 'Deskripsi', value: deskripsi },
          { name: 'Ikan', value: 'Belum ada. Tambah dengan `/adminfishing addzonafish`' }
        )
        .setFooter({ text: `Total zona: ${Object.keys(zonaData.zonas).length}` })
      ]
    });
  }

  if (sub === 'delzona') {
    const zonaData = getZonaData();
    const id = interaction.options.getString('id');
    const delChannel = interaction.options.getBoolean('del_channel') || false;
    const zona = zonaData.zonas[id];

    if (!zona) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Tidak Ditemukan')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    if (delChannel && zona.channelId) {
      try {
        const ch = await interaction.guild.channels.fetch(zona.channelId);
        await ch.delete();
      } catch {}
    }

    delete zonaData.zonas[id];
    saveZonaData(zonaData);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🗑️ Zona Dihapus!')
        .setDescription(`Zona **${zona.emoji} ${zona.nama}** (\`${id}\`) berhasil dihapus!${delChannel ? '\nChannel Discord juga dihapus.' : ''}`)
      ]
    });
  }

  if (sub === 'addzonafish') {
    const zonaData = getZonaData();
    const zonaId = interaction.options.getString('zona_id');
    const zona = zonaData.zonas[zonaId];
    if (!zona) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Tidak Ditemukan')], ephemeral: true });

    const { fish: fishList } = getFishData();
    const fishIds = [];
    for (let i = 1; i <= 10; i++) {
      const id = interaction.options.getString('ikan_' + i);
      if (id) fishIds.push(id);
    }

    const added = [], skipped = [], notFound = [];
    for (const fishId of fishIds) {
      const fish = fishList.find(f => f.id === fishId);
      if (!fish) { notFound.push(fishId); continue; }
      if (zona.fish.includes(fishId)) { skipped.push(fish.emoji + ' ' + fish.name); continue; }
      zona.fish.push(fishId);
      added.push(fish.emoji + ' **' + fish.name + '** (' + fish.rarity + ')');
    }

    saveZonaData(zonaData);

    const resultLines = [];
    if (added.length > 0) resultLines.push('✅ **Ditambahkan (' + added.length + '):**\n' + added.join('\n'));
    if (skipped.length > 0) resultLines.push('⚠️ **Sudah ada (' + skipped.length + '):**\n' + skipped.join(', '));
    if (notFound.length > 0) resultLines.push('❌ **Tidak ditemukan:**\n' + notFound.join(', '));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(added.length > 0 ? '#2ecc71' : '#e74c3c')
        .setTitle('🐟 Update Ikan Zona')
        .setDescription(resultLines.join('\n\n'))
        .addFields({ name: 'Total Ikan di Zona', value: zona.fish.length + ' ikan', inline: true })
      ],
      ephemeral: true
    });
  }

  if (sub === 'removezonafish') {
    const zonaData = getZonaData();
    const zonaId = interaction.options.getString('zona_id');
    const fishId = interaction.options.getString('fish_id');
    const zona = zonaData.zonas[zonaId];
    const { fish: fishList } = getFishData();
    const fish = fishList.find(f => f.id === fishId);

    if (!zona) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Tidak Ditemukan')], ephemeral: true });
    if (!zona.fish.includes(fishId)) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Ikan Tidak Ada di Zona')], ephemeral: true });

    zona.fish = zona.fish.filter(f => f !== fishId);
    saveZonaData(zonaData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🗑️ Ikan Dihapus dari Zona!')
        .setDescription(`${fish?.emoji || '🐟'} **${fish?.name || fishId}** dihapus dari zona **${zona.emoji} ${zona.nama}**!`)
      ],
      ephemeral: true
    });
  }

  if (sub === 'listzona') {
    const zonaData = getZonaData();
    const zonas = Object.values(zonaData.zonas);
    if (zonas.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('🗺️ Zona Mancing').setDescription('Belum ada zona! Buat dengan `/adminfishing addzona`')],
        ephemeral: true
      });
    }
    const lines = zonas.map(z => `${z.emoji} **${z.nama}** (\`${z.id}\`) — <#${z.channelId}> | ${z.fish.length} ikan`);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`🗺️ Semua Zona Mancing (${zonas.length})`)
        .setDescription(lines.join('\n'))
      ],
      ephemeral: true
    });
  }

  // ════════════════════════════════
  // FISH
  // ════════════════════════════════

  if (sub === 'addfish') {
    const fishData = getFishData();
    const fishId = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const name = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const rarity = interaction.options.getString('rarity');
    const chanceNum = interaction.options.getInteger('chance');
    const bandingNum = interaction.options.getInteger('banding');
    const jenis = interaction.options.getString('jenis');
    const price = interaction.options.getInteger('harga');
    const description = interaction.options.getString('deskripsi');

    // Hitung multiplier berdasarkan jenis satuan
    const multiplier = jenis === 'm' ? 1_000_000 : jenis === 'k' ? 1_000 : 1;
    const totalPenyebut = bandingNum * multiplier;
    // Simpan sebagai persentase: 1/100 = 1%, 1/1K = 0.1%, 1/1M = 0.0001%
    const chancePercent = (chanceNum / totalPenyebut) * 100;

    // Format tampilan untuk embed
    const bandingDisplay = jenis === 'm' ? `${bandingNum}M` : jenis === 'k' ? `${bandingNum}K` : `${bandingNum.toLocaleString('id-ID')}`;
    const chanceDisplay = `${chanceNum}/${bandingDisplay}`;

    if (fishData.fish.find(f => f.id === fishId)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada').setDescription(`Ikan dengan ID **\`${fishId}\`** sudah ada di database!\nGunakan ID yang berbeda.`)],
        ephemeral: true
      });
    }

    fishData.fish.push({ id: fishId, name, emoji, rarity, chance: chancePercent, price, description });
    saveFishData(fishData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Ikan Berhasil Ditambahkan!')
        .setDescription('Ikan baru telah ditambahkan ke database!')
        .addFields(
          { name: 'ID', value: `\`${fishId}\``, inline: true },
          { name: 'Nama', value: `${emoji} ${name}`, inline: true },
          { name: 'Rarity', value: `${getRarityEmoji(rarity)} ${rarity}`, inline: true },
          { name: 'Chance', value: `🎲 ${chanceDisplay}`, inline: true },
          { name: 'Harga', value: `🪙 ${formatNumber(price)} Coins`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: 'Deskripsi', value: description }
        )
        .setFooter({ text: `Total ikan di database: ${fishData.fish.length}` })
        .setTimestamp()
      ]
    });
  }


  if (sub === 'delfish') {
    const fishData = getFishData();
    const id = interaction.options.getString('id');
    const fish = fishData.fish.find(f => f.id === id);

    if (!fish) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Ditemukan').setDescription(`Ikan dengan ID **\`${id}\`** tidak ada!`)],
        ephemeral: true
      });
    }

    fishData.fish = fishData.fish.filter(f => f.id !== id);
    saveFishData(fishData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🗑️ Ikan Dihapus!')
        .setDescription(`${fish.emoji} **${fish.name}** (\`${fish.id}\`) berhasil dihapus dari database!`)
        .setFooter({ text: `Sisa ikan: ${fishData.fish.length}` })
      ],
      ephemeral: true
    });
  }

  // ════════════════════════════════
  // ROD
  // ════════════════════════════════

  if (sub === 'addrod') {
    const rodData = getRodData();
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const nama = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const deskripsi = interaction.options.getString('deskripsi');
    const harga = interaction.options.getInteger('harga');
    const luck = interaction.options.getInteger('luck');
    const cooldown = interaction.options.getInteger('cooldown');
    const mutasiMult = interaction.options.getNumber('mutasi_mult') ?? 1.0;

    if (rodData.rods.find(r => r.id === id)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada').setDescription(`Pancingan dengan ID **\`${id}\`** sudah ada!`)],
        ephemeral: true
      });
    }

    rodData.rods.push({
      id, name: nama, emoji, description: deskripsi,
      price: harga, luckBonus: luck,
      cooldownReduction: cooldown,
      mutationMultiplier: mutasiMult,
      isDefault: false
    });
    saveRodData(rodData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Pancingan Berhasil Ditambahkan!')
        .addFields(
          { name: 'ID', value: `\`${id}\``, inline: true },
          { name: 'Nama', value: `${emoji} ${nama}`, inline: true },
          { name: 'Harga', value: `🪙 ${formatNumber(harga)}`, inline: true },
          { name: 'Luck Bonus', value: `+${luck}%`, inline: true },
          { name: 'Cooldown', value: `-${cooldown}s`, inline: true },
          { name: 'Mutasi Mult', value: `×${mutasiMult}`, inline: true },
          { name: 'Deskripsi', value: deskripsi }
        )
        .setFooter({ text: `Total pancingan: ${rodData.rods.length}` })
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'delrod') {
    const rodData = getRodData();
    const id = interaction.options.getString('id');
    const rod = rodData.rods.find(r => r.id === id);

    if (!rod) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Ditemukan').setDescription(`Pancingan dengan ID **\`${id}\`** tidak ada!`)],
        ephemeral: true
      });
    }

    if (id === 'pancing_bambu') {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Tidak Bisa Dihapus').setDescription('Pancing Bambu adalah pancingan default dan tidak bisa dihapus!')],
        ephemeral: true
      });
    }

    rodData.rods = rodData.rods.filter(r => r.id !== id);
    saveRodData(rodData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🗑️ Pancingan Dihapus!')
        .setDescription(`${rod.emoji} **${rod.name}** (\`${rod.id}\`) berhasil dihapus dari database!`)
        .setFooter({ text: `Sisa pancingan: ${rodData.rods.length}` })
      ],
      ephemeral: true
    });
  }

  // ════════════════════════════════
  // GEMS
  // ════════════════════════════════

  if (sub === 'addgems') {
    const target = interaction.options.getUser('user');
    const jumlah = interaction.options.getInteger('jumlah');
    const player = getPlayer(target.id);

    player.gems = (player.gems || 0) + jumlah;
    savePlayer(target.id, player);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00d4ff')
        .setTitle('💎 Gems Ditambahkan!')
        .setDescription(`Berhasil menambahkan **${jumlah.toLocaleString('id-ID')} 💎 Gems** ke ${target}!`)
        .addFields(
          { name: 'User', value: `${target.tag}`, inline: true },
          { name: 'Ditambahkan', value: `+${jumlah.toLocaleString('id-ID')} 💎`, inline: true },
          { name: 'Total Gems', value: `${formatNumber(player.gems)} 💎`, inline: true }
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  if (sub === 'delgems') {
    const target = interaction.options.getUser('user');
    const jumlah = interaction.options.getInteger('jumlah');
    const player = getPlayer(target.id);

    if ((player.gems || 0) < jumlah) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('❌ Gems Tidak Cukup')
          .setDescription(`${target} hanya punya **${(player.gems || 0).toLocaleString('id-ID')} 💎 Gems**, tidak bisa dikurangi **${jumlah.toLocaleString('id-ID')} 💎**!`)
        ],
        ephemeral: true
      });
    }

    player.gems -= jumlah;
    savePlayer(target.id, player);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('💎 Gems Dikurangi!')
        .setDescription(`Berhasil mengurangi **${jumlah.toLocaleString('id-ID')} 💎 Gems** dari ${target}!`)
        .addFields(
          { name: 'User', value: `${target.tag}`, inline: true },
          { name: 'Dikurangi', value: `-${jumlah.toLocaleString('id-ID')} 💎`, inline: true },
          { name: 'Sisa Gems', value: `${formatNumber(player.gems)} 💎`, inline: true }
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
      ],
      ephemeral: true
    });
  }

  // ════════════════════════════════
  // TEMP ZONA
  // ════════════════════════════════

  if (sub === 'addtempzona') {
    const zonaData = getZonaData();
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const nama = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const deskripsi = interaction.options.getString('deskripsi');
    const durasi = interaction.options.getInteger('durasi');
    const warna = interaction.options.getString('warna') || '#f39c12';
    const existingChannel = interaction.options.getChannel('channel');
    const categoryId = interaction.options.getString('category');

    if (zonaData.zonas[id]) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada')],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    let channelId, channelMention;
    if (existingChannel) {
      channelId = existingChannel.id;
      channelMention = existingChannel.toString();
    } else {
      try {
        const options = {
          name: `${emoji}｜${nama.toLowerCase().replace(/\s+/g, '-')}`,
          type: ChannelType.GuildText,
          topic: `⏰ [EVENT ZONA] ${nama} | ${deskripsi}`
        };
        if (categoryId) options.parent = categoryId;
        const newChannel = await interaction.guild.channels.create(options);
        channelId = newChannel.id;
        channelMention = newChannel.toString();
        await newChannel.send({
          embeds: [new EmbedBuilder()
            .setColor(warna)
            .setTitle(`${emoji} ${nama} — Event Zona!`)
            .setDescription(`${deskripsi}\n\n⏰ Zona ini akan aktif selama **${durasi} menit**!`)
            .setFooter({ text: 'Gunakan /mancing untuk memancing di zona ini!' })
          ]
        });
      } catch (e) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gagal Buat Channel').setDescription(e.message)] });
      }
    }

    const endsAt = Date.now() + durasi * 60 * 1000;
    zonaData.zonas[id] = {
      id, nama, emoji, deskripsi, color: warna,
      channelId, fish: [], tempFish: [],
      isTemp: true, endsAt,
      createdAt: Date.now()
    };
    saveZonaData(zonaData);

    // Auto delete setelah durasi
    setTimeout(async () => {
      try {
        const freshZona = getZonaData();
        if (freshZona.zonas[id]) {
          const ch = await interaction.guild.channels.fetch(freshZona.zonas[id].channelId).catch(() => null);
          if (ch) await ch.delete().catch(() => {});
          delete freshZona.zonas[id];
          saveZonaData(freshZona);
          console.log(`🗑️ Temp zona ${id} dihapus otomatis.`);
        }
      } catch (e) { console.error('Gagal hapus temp zona:', e); }
    }, durasi * 60 * 1000);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(warna)
        .setTitle('✅ Event Zona Dibuat!')
        .addFields(
          { name: 'ID', value: `\`${id}\``, inline: true },
          { name: 'Nama', value: `${emoji} ${nama}`, inline: true },
          { name: 'Channel', value: channelMention, inline: true },
          { name: 'Durasi', value: `${durasi} menit`, inline: true },
          { name: 'Berakhir', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Zona akan auto-delete setelah durasi habis' })
      ]
    });
  }

  // ── SPAWN FISH ──
  if (sub === 'spawnfish') {
    const zonaId = interaction.options.getString('zona_id');
    const fishId = interaction.options.getString('fish_id');
    const durasi = interaction.options.getInteger('durasi');

    const result = await spawnFish(interaction.client, zonaId, fishId, durasi);
    if (!result.success) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gagal Spawn').setDescription(result.message)], ephemeral: true });
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Ikan Di-spawn!')
        .setDescription(`${result.fish.emoji} **${result.fish.name}** berhasil di-spawn di **${result.zona.emoji} ${result.zona.nama}**!`)
        .addFields(
          { name: '⏱️ Durasi', value: `${durasi} menit`, inline: true },
          { name: '🎲 Chance', value: formatChance(result.fish.chance), inline: true },
          { name: '⏰ Berakhir', value: `<t:${Math.floor(result.endsAt / 1000)}:R>`, inline: true }
        )
      ],
      ephemeral: true
    });
  }

  // ── SET RESTRICTED ──
  if (sub === 'setrestricted') {
    const zonaId = interaction.options.getString('zona_id');
    const restricted = interaction.options.getBoolean('restricted');
    const hargaCoins = interaction.options.getInteger('harga_coins') || 0;
    const hargaGems = interaction.options.getInteger('harga_gems') || 0;

    const zonaData = getZonaData();
    const zona = zonaData.zonas[zonaId];
    if (!zona) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona Tidak Ditemukan')], ephemeral: true });
    }

    zona.restricted = restricted;

    if (restricted) {
      // Auto tambah/update tiket ke shop
      const shopData = getShopData();
      const ticketId = `ticket_${zonaId}`;
      const existingIdx = shopData.items.findIndex(i => i.id === ticketId);
      const ticketItem = {
        id: ticketId,
        name: `Tiket ${zona.nama}`,
        emoji: '🎟️',
        description: `Tiket masuk ke zona ${zona.emoji} ${zona.nama}. Sekali pakai.`,
        type: 'ticket',
        zonaId: zonaId,
        priceCoins: hargaCoins,
        priceGems: hargaGems,
        stock: -1
      };
      if (existingIdx >= 0) shopData.items[existingIdx] = ticketItem;
      else shopData.items.unshift(ticketItem);
      saveShopData(shopData);
    } else {
      // Hapus tiket dari shop
      const shopData = getShopData();
      shopData.items = shopData.items.filter(i => i.id !== `ticket_${zonaId}`);
      saveShopData(shopData);
    }

    saveZonaData(zonaData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(restricted ? '#e67e22' : '#2ecc71')
        .setTitle(restricted ? '🔒 Zona Restricted!' : '🔓 Zona Bebas!')
        .setDescription(restricted
          ? `Zona **${zona.emoji} ${zona.nama}** sekarang restricted.\nTiket otomatis ditambahkan ke \`/fishshop\`.\nHarga: ${hargaCoins > 0 ? `🪙 ${hargaCoins.toLocaleString('id-ID')}` : ''} ${hargaGems > 0 ? `💎 ${hargaGems}` : ''}`
          : `Zona **${zona.emoji} ${zona.nama}** sekarang bebas diakses.\nTiket dihapus dari \`/fishshop\`.`)
      ],
      ephemeral: true
    });
  }

  // ── SET SPAWN INTERVAL ──
  if (sub === 'setspawninterval') {
    const menit = interaction.options.getInteger('menit');
    const config = getSpawnConfig();

    if (menit === 0) {
      stopAutoInterval();
      config.spawnInterval = null;
      saveSpawnConfig(config);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('⏹️ Auto Spawn Dimatikan').setDescription('Spawn ikan otomatis telah dinonaktifkan.')],
        ephemeral: true
      });
    }

    config.spawnInterval = menit;
    saveSpawnConfig(config);
    startAutoInterval(menit, interaction.client);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Auto Spawn Diset!')
        .setDescription(`Ikan eksklusif akan spawn otomatis setiap **${menit} menit** di zona random!`)
      ],
      ephemeral: true
    });
  }

  // ════════════════════════════════
  // SHOP ITEMS
  // ════════════════════════════════

  if (sub === 'addshopitem') {
    const shopData = getShopData();
    const id = interaction.options.getString('id').toLowerCase().replace(/\s+/g, '_');
    const nama = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const deskripsi = interaction.options.getString('deskripsi');
    const tipe = interaction.options.getString('tipe');
    const hargaCoins = interaction.options.getInteger('harga_coins');
    const hargaGems = interaction.options.getInteger('harga_gems');
    const zonaId = interaction.options.getString('zona_id') || null;

    if (shopData.items.find(i => i.id === id)) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ ID Sudah Ada')], ephemeral: true });
    }

    if (tipe === 'ticket' && !zonaId) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Zona ID Wajib').setDescription('Tiket zona harus punya zona_id!')], ephemeral: true });
    }

    const newItem = { id, name: nama, emoji, description: deskripsi, type: tipe, priceCoins: hargaCoins, priceGems: hargaGems, stock: -1 };
    if (zonaId) newItem.zonaId = zonaId;
    shopData.items.push(newItem);
    saveShopData(shopData);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Item Ditambahkan ke Shop!')
        .addFields(
          { name: 'ID', value: `\`${id}\``, inline: true },
          { name: 'Nama', value: `${emoji} ${nama}`, inline: true },
          { name: 'Tipe', value: tipe, inline: true },
          { name: 'Harga', value: `${hargaCoins > 0 ? `🪙 ${hargaCoins.toLocaleString('id-ID')}` : ''} ${hargaGems > 0 ? `💎 ${hargaGems}` : ''}`.trim() || 'Gratis', inline: true }
        )
      ],
      ephemeral: true
    });
  }

  if (sub === 'delshopitem') {
    const shopData = getShopData();
    const id = interaction.options.getString('id');
    const item = shopData.items.find(i => i.id === id);

    if (!item) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Item Tidak Ditemukan')], ephemeral: true });
    }

    shopData.items = shopData.items.filter(i => i.id !== id);
    saveShopData(shopData);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('🗑️ Item Dihapus!').setDescription(`${item.emoji} **${item.name}** dihapus dari shop.`)],
      ephemeral: true
    });
  }
}


export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const sub = interaction.options.getSubcommand();

  // ── Zona autocomplete ──
  if (['addzonafish', 'removezonafish', 'delzona'].includes(sub)) {
    const zonaData = getZonaData();

    if (focused.name === 'zona_id') {
      const choices = Object.values(zonaData.zonas)
        .filter(z => z.id.includes(focused.value.toLowerCase()) || z.nama.toLowerCase().includes(focused.value.toLowerCase()))
        .map(z => ({ name: `${z.emoji} ${z.nama} (${z.fish.length} ikan)`, value: z.id }));
      return interaction.respond(choices.slice(0, 25));
    }

    if (sub === 'addzonafish' && focused.name.startsWith('ikan_')) {
      const zonaId = interaction.options.getString('zona_id');
      const zona = zonaId ? zonaData.zonas[zonaId] : null;
      const { fish } = getFishData();

      const selectedIds = [];
      for (let i = 1; i <= 10; i++) {
        const val = interaction.options.getString(`ikan_${i}`);
        if (val && `ikan_${i}` !== focused.name) selectedIds.push(val);
      }

      const choices = fish
        .filter(f => !selectedIds.includes(f.id))
        .filter(f => zona ? !zona.fish.includes(f.id) : true)
        .filter(f => f.name.toLowerCase().includes(focused.value.toLowerCase()) || f.id.includes(focused.value.toLowerCase()))
        .map(f => ({ name: `${f.emoji} ${f.name} (${f.rarity})`, value: f.id }));
      return interaction.respond(choices.slice(0, 25));
    }

    if (sub === 'removezonafish' && focused.name === 'fish_id') {
      const zonaId = interaction.options.getString('zona_id');
      const zona = zonaData.zonas[zonaId];
      if (!zona) return interaction.respond([]);
      const { fish } = getFishData();
      const choices = zona.fish
        .map(fid => fish.find(f => f.id === fid))
        .filter(Boolean)
        .filter(f => f.name.toLowerCase().includes(focused.value.toLowerCase()))
        .map(f => ({ name: `${f.emoji} ${f.name}`, value: f.id }));
      return interaction.respond(choices.slice(0, 25));
    }

    if (sub === 'delzona' && focused.name === 'id') {
      const choices = Object.values(zonaData.zonas)
        .filter(z => z.id.includes(focused.value.toLowerCase()) || z.nama.toLowerCase().includes(focused.value.toLowerCase()))
        .map(z => ({ name: `${z.emoji} ${z.nama}`, value: z.id }));
      return interaction.respond(choices.slice(0, 25));
    }
  }

  // ── Fish autocomplete ──
  if (sub === 'delfish') {
    const { fish } = getFishData();
    const choices = fish
      .filter(f => f.id.includes(focused.value.toLowerCase()) || f.name.toLowerCase().includes(focused.value.toLowerCase()))
      .map(f => ({ name: `${f.emoji} ${f.name} (${f.rarity})`, value: f.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // ── Rod autocomplete ──
  if (sub === 'delrod') {
    const { rods } = getRodData();
    const choices = rods
      .filter(r => r.id.includes(focused.value.toLowerCase()) || r.name.toLowerCase().includes(focused.value.toLowerCase()))
      .map(r => ({ name: `${r.emoji} ${r.name}`, value: r.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // spawnfish zona_id autocomplete
  if (sub === 'spawnfish' && focused.name === 'zona_id') {
    const zonaData = getZonaData();
    const choices = Object.values(zonaData.zonas)
      .filter(z => z.id.includes(focused.value.toLowerCase()) || z.nama.toLowerCase().includes(focused.value.toLowerCase()))
      .map(z => ({ name: `${z.emoji} ${z.nama}`, value: z.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // spawnfish fish_id autocomplete
  if (sub === 'spawnfish' && focused.name === 'fish_id') {
    const { fish } = getFishData();
    const choices = fish
      .filter(f => f.name.toLowerCase().includes(focused.value.toLowerCase()) || f.id.includes(focused.value.toLowerCase()))
      .map(f => ({ name: `${f.emoji} ${f.name} (${f.rarity})`, value: f.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // setrestricted zona_id autocomplete
  if (sub === 'setrestricted' && focused.name === 'zona_id') {
    const zonaData = getZonaData();
    const choices = Object.values(zonaData.zonas)
      .filter(z => z.id.includes(focused.value.toLowerCase()) || z.nama.toLowerCase().includes(focused.value.toLowerCase()))
      .map(z => ({ name: `${z.emoji} ${z.nama}${z.restricted ? ' 🔒' : ''}`, value: z.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // addshopitem zona_id autocomplete
  if (sub === 'addshopitem' && focused.name === 'zona_id') {
    const zonaData = getZonaData();
    const choices = Object.values(zonaData.zonas)
      .filter(z => z.id.includes(focused.value.toLowerCase()) || z.nama.toLowerCase().includes(focused.value.toLowerCase()))
      .map(z => ({ name: `${z.emoji} ${z.nama}`, value: z.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  // delshopitem autocomplete
  if (sub === 'delshopitem') {
    const shopData = getShopData();
    const choices = shopData.items
      .filter(i => i.name.toLowerCase().includes(focused.value.toLowerCase()) || i.id.includes(focused.value.toLowerCase()))
      .map(i => ({ name: `${i.emoji} ${i.name}`, value: i.id }));
    return interaction.respond(choices.slice(0, 25));
  }

  await interaction.respond([]);
}
