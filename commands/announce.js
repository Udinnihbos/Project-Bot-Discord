import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('📢 [OWNER] Kirim pengumuman dalam bentuk embed!')
  .addStringOption(opt =>
    opt.setName('judul')
      .setDescription('Judul pengumuman')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('isi')
      .setDescription('Isi pengumuman (gunakan \\n untuk baris baru)')
      .setRequired(true)
  )
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel tujuan pengumuman')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('warna')
      .setDescription('Warna embed (hex, contoh: #ff0000)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('emoji')
      .setDescription('Emoji di depan judul (contoh: 🎉)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('footer')
      .setDescription('Teks footer embed')
      .setRequired(false)
  )
  .addBooleanOption(opt =>
    opt.setName('ping_everyone')
      .setDescription('Ping @everyone saat pengumuman?')
      .setRequired(false)
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Akses Ditolak').setDescription('Command ini hanya untuk **Owner bot**!')],
      ephemeral: true
    });
  }

  const judul = interaction.options.getString('judul');
  const isi = interaction.options.getString('isi').replace(/\\n/g, '\n');
  const channel = interaction.options.getChannel('channel');
  const warna = interaction.options.getString('warna') || '#3498db';
  const emoji = interaction.options.getString('emoji') || '📢';
  const footer = interaction.options.getString('footer') || null;
  const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;

  // Validate hex color
  const hexRegex = /^#([0-9A-Fa-f]{6})$/;
  const finalColor = hexRegex.test(warna) ? warna : '#3498db';

  const embed = new EmbedBuilder()
    .setColor(finalColor)
    .setTitle(`${emoji} ${judul}`)
    .setDescription(isi)
    .setTimestamp();

  if (footer) embed.setFooter({ text: footer });

  try {
    await channel.send({
      content: pingEveryone ? '@everyone' : null,
      embeds: [embed]
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('✅ Pengumuman Terkirim!')
          .setDescription(`Pengumuman berhasil dikirim ke ${channel}!`)
      ],
      ephemeral: true
    });
  } catch (err) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('❌ Gagal Mengirim')
          .setDescription(`Gagal mengirim ke ${channel}!\nPastikan bot punya permission **Send Messages** di channel tersebut.`)
      ],
      ephemeral: true
    });
  }
}
