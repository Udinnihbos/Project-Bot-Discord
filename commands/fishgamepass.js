import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, savePlayer, getGamepassData, hasGamepass } from '../utils/database.js';
import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';

export const data = new SlashCommandBuilder()
  .setName('fishgamepass')
  .setDescription('🎮 Lihat dan beli gamepass!')
  .addSubcommand(sub => sub.setName('list').setDescription('Lihat semua gamepass yang tersedia'))
  .addSubcommand(sub =>
    sub.setName('buy')
      .setDescription('Beli gamepass')
      .addStringOption(opt =>
        opt.setName('id').setDescription('ID gamepass yang ingin dibeli').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand(sub => sub.setName('mypass').setDescription('Lihat gamepass yang kamu punya'));

// ⛔ AUTO-GATED BY gate-fishing.js
export async function execute(interaction) {
  const access = await hasFishingAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });
  }
  const userId = interaction.user.id;
  const player = getPlayer(userId);
  const gpData = getGamepassData();
  const sub = interaction.options.getSubcommand();
  const now = Date.now();

  // ── LIST ──
  if (sub === 'list') {
    const available = gpData.gamepasses.filter(gp => {
      if (!gp.active) return false;
      if (gp.availableUntil && now > gp.availableUntil) return false;
      return true;
    });

    if (available.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('🎮 Gamepass').setDescription('Tidak ada gamepass yang tersedia saat ini.')],
      });
    }

    const lines = available.map(gp => {
      const owned = hasGamepass(player, gp.id);
      const duration = gp.type === 'permanent' ? '♾️ Permanent' : `📅 ${gp.durationDays} hari`;
      const until = gp.availableUntil ? `\n┗ ⏰ Tersedia hingga: <t:${Math.floor(gp.availableUntil / 1000)}:R>` : '';
      const ownedText = owned ? ' ✅ **Dimiliki**' : '';
      const afkTag = gp.unlockAfk ? ' | 🎣 Unlock AFK Mancing' : '';
      return [
        `${gp.emoji} **${gp.name}**${ownedText} — 💎 ${gp.price} Gems`,
        `┗ ${gp.description}`,
        `┗ ${duration}${afkTag}`,
        `┗ Manfaat: ${gp.perks.join(', ')}${until}`
      ].join('\n');
    });

    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('🎮 Toko Gamepass')
      .setDescription(lines.join('\n\n'))
      .addFields({ name: '💎 Gems Kamu', value: `${player.gems} Gems`, inline: true })
      .setFooter({ text: 'Gunakan /fishgamepass buy untuk membeli!' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── BUY ──
  if (sub === 'buy') {
    const gpId = interaction.options.getString('id');
    const gp = gpData.gamepasses.find(g => g.id === gpId);

    if (!gp || !gp.active) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gamepass Tidak Ditemukan')],
        ephemeral: true
      });
    }

    if (gp.availableUntil && now > gp.availableUntil) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gamepass Sudah Tidak Tersedia').setDescription('Gamepass ini sudah tidak dijual lagi!')],
        ephemeral: true
      });
    }

    if (hasGamepass(player, gpId)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Sudah Dimiliki').setDescription(`Kamu sudah punya gamepass **${gp.name}**!`)],
        ephemeral: true
      });
    }

    if (player.gems < gp.price) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ Gems Tidak Cukup').setDescription(`Kamu butuh 💎 **${gp.price} Gems** tapi hanya punya **${player.gems} Gems**!\nSelesaikan misi di \`/fishmissions\` untuk dapat Gems.`)],
        ephemeral: true
      });
    }

    player.gems -= gp.price;
    const expiresAt = gp.type === 'permanent' ? null : now + (gp.durationDays * 24 * 60 * 60 * 1000);
    player.gamepasses.push({ id: gpId, boughtAt: now, expiresAt });
    savePlayer(userId, player);

    const expText = expiresAt ? `<t:${Math.floor(expiresAt / 1000)}:R>` : '♾️ Permanent';
    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('🎮 Gamepass Dibeli!')
      .setDescription(`${gp.emoji} **${gp.name}** berhasil dibeli!`)
      .addFields(
        { name: '💎 Dibayar', value: `${gp.price} Gems`, inline: true },
        { name: '💎 Sisa Gems', value: `${player.gems} Gems`, inline: true },
        { name: '⏰ Berlaku', value: expText, inline: true },
        { name: '✨ Manfaat', value: gp.perks.join('\n') + (gp.unlockAfk ? '\n🎣 AFK Mancing Aktif!' : '') }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── MY PASS ──
  if (sub === 'mypass') {
    const owned = player.gamepasses || [];
    if (owned.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('🎮 Gamepass Kamu').setDescription('Kamu belum punya gamepass!\nBeli di `/fishgamepass list`')]
      });
    }

    const lines = owned.map(g => {
      const gp = gpData.gamepasses.find(x => x.id === g.id);
      if (!gp) return null;
      const expired = g.expiresAt && now > g.expiresAt;
      const expText = g.expiresAt ? (expired ? '❌ Expired' : `<t:${Math.floor(g.expiresAt / 1000)}:R>`) : '♾️ Permanent';
      return `${gp.emoji} **${gp.name}** — ${expText}${gp.unlockAfk ? ' | 🎣 AFK Aktif' : ''}`;
    }).filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('🎮 Gamepass Kamu')
      .setDescription(lines.join('\n'))
      .addFields({ name: '💎 Gems', value: `${player.gems} Gems`, inline: true })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
}

export async function autocomplete(interaction) {
  const gpData = getGamepassData();
  const focused = interaction.options.getFocused().toLowerCase();
  const now = Date.now();
  const choices = gpData.gamepasses
    .filter(gp => gp.active && (!gp.availableUntil || now <= gp.availableUntil))
    .filter(gp => gp.name.toLowerCase().includes(focused) || gp.id.includes(focused))
    .map(gp => ({ name: `${gp.emoji} ${gp.name} — 💎 ${gp.price}`, value: gp.id }));
  await interaction.respond(choices.slice(0, 25));
}
