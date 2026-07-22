import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getEventData, saveEventData, getActiveEvents, addActiveEvent, removeActiveEvent, clearActiveEvents } from '../utils/database.js';
import { formatDuration, RARITY_ORDER } from '../utils/fishing.js';

export const data = new SlashCommandBuilder()
  .setName('setevent')
  .setDescription('⚙️ [OWNER] Kelola event cuaca! (Max 3 stack)')
  .addSubcommand(sub =>
    sub.setName('mulai')
      .setDescription('Mulai event dari preset')
      .addStringOption(opt =>
        opt.setName('preset').setDescription('Preset cuaca').setRequired(true)
          .addChoices(
            { name: '☀️ Cuaca Cerah', value: 'cerah' },
            { name: '⚡ Badai Petir', value: 'badai' },
            { name: '🌙 Malam Mistis', value: 'malam_mistis' },
            { name: '🌧️ Hujan Deras', value: 'hujan_deras' },
            { name: '🌪️ Angin Topan', value: 'angin_topan' },
            { name: '🌕 Bulan Purnama', value: 'full_moon' },
            { name: '🌇 Golden Hour', value: 'golden_hour' },
            { name: '🌫️ Kabut Tebal', value: 'kabut_tebal' }
          )
      )
      .addIntegerOption(opt => opt.setName('durasi').setDescription('Durasi dalam menit').setRequired(true).setMinValue(1).setMaxValue(1440))
  )
  .addSubcommand(sub =>
    sub.setName('custom')
      .setDescription('Buat event custom')
      .addStringOption(opt => opt.setName('nama').setDescription('Nama event').setRequired(true))
      .addStringOption(opt => opt.setName('emoji').setDescription('Emoji event').setRequired(true))
      .addStringOption(opt => opt.setName('deskripsi').setDescription('Deskripsi').setRequired(true))
      .addIntegerOption(opt => opt.setName('durasi').setDescription('Durasi dalam menit').setRequired(true).setMinValue(1).setMaxValue(1440))
      .addIntegerOption(opt => opt.setName('luck').setDescription('Global luck bonus +%').setRequired(true).setMinValue(0).setMaxValue(5000))
      .addStringOption(opt =>
        opt.setName('luck_mode').setDescription('Mode luck: tambah (+) atau kali (×)').setRequired(true)
          .addChoices(
            { name: '➕ Tambah (+luck)', value: 'add' },
            { name: '✖️ Kali (×luck)', value: 'multiply' }
          )
      )
      .addNumberOption(opt => opt.setName('luck_multiplier').setDescription('Kalikan luck jadi ×2/×4/×8 dll (hanya jika mode kali)').setRequired(false).setMinValue(1).setMaxValue(8))
      .addNumberOption(opt => opt.setName('common_mult').setDescription('Multiplier Common').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('uncommon_mult').setDescription('Multiplier Uncommon').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('rare_mult').setDescription('Multiplier Rare').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('epic_mult').setDescription('Multiplier Epic').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('legendary_mult').setDescription('Multiplier Legendary').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('mythic_mult').setDescription('Multiplier Mythic').setRequired(false).setMinValue(0).setMaxValue(10))
      .addNumberOption(opt => opt.setName('secret_mult').setDescription('Multiplier Secret').setRequired(false).setMinValue(0).setMaxValue(10))
  )
  .addSubcommand(sub =>
    sub.setName('setchannel')
      .setDescription('Set channel pengumuman event')
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel (kosongkan untuk reset)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('stop')
      .setDescription('Hentikan event tertentu atau semua')
      .addStringOption(opt => opt.setName('event_id').setDescription('ID event (kosongkan = stop semua)').setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('info')
      .setDescription('Lihat semua event aktif')
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Akses Ditolak').setDescription('Hanya untuk **Owner**!')],
      ephemeral: true
    });
  }

  const sub = interaction.options.getSubcommand();
  const eventData = getEventData();

  // ── SET CHANNEL ──
  if (sub === 'setchannel') {
    const channel = interaction.options.getChannel('channel');
    if (!channel) {
      eventData.announcementChannelId = null;
      saveEventData(eventData);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('🔕 Channel Direset')], ephemeral: true });
    }
    eventData.announcementChannelId = channel.id;
    saveEventData(eventData);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('📢 Channel Diset!').setDescription(`Pengumuman → ${channel}`)], ephemeral: true });
  }

  // ── INFO ──
  if (sub === 'info') {
    const events = getActiveEvents();
    if (events.length === 0) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('📋 Tidak Ada Event Aktif').setDescription(`Stack: 0/3`)], ephemeral: true });
    }
    const lines = events.map((e, i) => {
      const rem = e.endsAt ? formatDuration(e.endsAt - Date.now()) : '∞';
      return `**${i + 1}.** ${e.emoji} **${e.name}** — ⏱️ ${rem} | 🍀 +${e.luckBonus}% ${e.luckMultiplyMode ? `×${e.luckMultiplier || 1}` : ''} | ID: \`${e.id}\``;
    });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#f39c12').setTitle(`📋 Event Aktif (${events.length}/3)`).setDescription(lines.join('\n'))],
      ephemeral: true
    });
  }

  // ── STOP ──
  if (sub === 'stop') {
    const eventId = interaction.options.getString('event_id');
    if (!eventId) {
      clearActiveEvents();
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⏹️ Semua Event Dihentikan!').setDescription('Cuaca kembali normal.')], ephemeral: true });
    }
    removeActiveEvent(eventId);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⏹️ Event Dihentikan!').setDescription(`Event \`${eventId}\` dihentikan.`)], ephemeral: true });
  }

  // ── MULAI PRESET ──
  if (sub === 'mulai') {
    const events = getActiveEvents();
    if (events.length >= 3) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Stack Penuh!').setDescription('Sudah ada **3 event aktif**! Stop salah satu dulu.')], ephemeral: true });
    }
    const presetId = interaction.options.getString('preset');
    const durasi = interaction.options.getInteger('durasi');
    const preset = eventData.presets.find(p => p.id === presetId);
    if (!preset) return interaction.reply({ content: '❌ Preset tidak ditemukan!', ephemeral: true });

    const newEvent = {
      ...preset,
      id: `${presetId}_${Date.now()}`,
      startedBy: interaction.user.id,
      startedAt: Date.now(),
      endsAt: Date.now() + durasi * 60 * 1000
    };

    addActiveEvent(newEvent);
    const embed = buildEventEmbed(newEvent, durasi * 60 * 1000, events.length + 1);
    await sendAnnouncement(interaction, eventData.announcementChannelId, embed);

    setTimeout(() => {
      removeActiveEvent(newEvent.id);
      sendAnnouncementDirect(interaction.client, eventData.announcementChannelId, interaction.channelId,
        new EmbedBuilder().setColor('#95a5a6').setTitle(`${preset.emoji} Event Berakhir!`).setDescription(`**${preset.name}** telah berakhir.`).setTimestamp()
      );
    }, durasi * 60 * 1000);
    return;
  }

  // ── CUSTOM ──
  if (sub === 'custom') {
    const events = getActiveEvents();
    if (events.length >= 3) {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Stack Penuh!').setDescription('Sudah ada **3 event aktif**!')], ephemeral: true });
    }

    const nama = interaction.options.getString('nama');
    const emoji = interaction.options.getString('emoji');
    const deskripsi = interaction.options.getString('deskripsi');
    const durasi = interaction.options.getInteger('durasi');
    const luck = interaction.options.getInteger('luck');
    const luckMode = interaction.options.getString('luck_mode');
    const luckMultiplier = interaction.options.getNumber('luck_multiplier') ?? 1;

    const rarityMultipliers = {};
    for (const rarity of RARITY_ORDER) {
      const val = interaction.options.getNumber(`${rarity.toLowerCase()}_mult`);
      rarityMultipliers[rarity] = val !== null ? val : 1.0;
    }

    const newEvent = {
      id: `custom_${Date.now()}`,
      name: nama, emoji, description: deskripsi,
      color: '#e74c3c',
      luckBonus: luck,
      luckMultiplyMode: luckMode === 'multiply',
      luckMultiplier,
      rarityMultipliers,
      mutationBoost: 1,
      startedBy: interaction.user.id,
      startedAt: Date.now(),
      endsAt: Date.now() + durasi * 60 * 1000
    };

    addActiveEvent(newEvent);
    const embed = buildEventEmbed(newEvent, durasi * 60 * 1000, events.length + 1);
    await sendAnnouncement(interaction, eventData.announcementChannelId, embed);

    setTimeout(() => {
      removeActiveEvent(newEvent.id);
      sendAnnouncementDirect(interaction.client, eventData.announcementChannelId, interaction.channelId,
        new EmbedBuilder().setColor('#95a5a6').setTitle(`${emoji} Event Berakhir!`).setDescription(`**${nama}** telah berakhir.`).setTimestamp()
      );
    }, durasi * 60 * 1000);
    return;
  }
}

async function sendAnnouncement(interaction, channelId, embed) {
  if (channelId && channelId !== interaction.channelId) {
    try {
      const ch = await interaction.client.channels.fetch(channelId);
      await ch.send({ embeds: [embed] });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setDescription(`✅ Event dimulai! Pengumuman → <#${channelId}>`)], ephemeral: true });
    } catch { await interaction.reply({ embeds: [embed] }); }
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

async function sendAnnouncementDirect(client, channelId, fallbackId, embed) {
  try {
    const ch = await client.channels.fetch(channelId || fallbackId);
    await ch.send({ embeds: [embed] });
  } catch {}
}

function buildEventEmbed(event, remainingMs, stackPos) {
  const multLines = RARITY_ORDER.map(r => {
    const mult = event.rarityMultipliers?.[r] ?? 1;
    const arrow = mult > 1 ? '⬆️' : mult < 1 ? '⬇️' : '➡️';
    const pct = mult > 1 ? `(+${Math.round((mult-1)*100)}%)` : mult < 1 ? `(-${Math.round((1-mult)*100)}%)` : '(normal)';
    return `${arrow} **${r}**: ×${mult} ${pct}`;
  }).join('\n');

  const luckText = event.luckMultiplyMode
    ? `×${event.luckMultiplier || 1} (Luck dikali!)`
    : `+${event.luckBonus}%`;

  return new EmbedBuilder()
    .setColor(event.color || '#f39c12')
    .setTitle(`${event.emoji} EVENT AKTIF: ${event.name}`)
    .setDescription(event.description)
    .addFields(
      { name: '⏱️ Durasi', value: formatDuration(remainingMs), inline: true },
      { name: '🍀 Luck', value: luckText, inline: true },
      { name: '📊 Stack', value: `${stackPos}/3`, inline: true },
      { name: '📈 Efek per Rarity', value: multLines }
    )
    .setFooter({ text: `ID: ${event.id} | Selamat memancing! 🎣` })
    .setTimestamp();
}
