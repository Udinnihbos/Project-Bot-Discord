import {
  SlashCommandBuilder, EmbedBuilder, RoleSelectMenuBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { getFishingConfig, setFishingRole, clearFishingRole } from '../utils/fishingPerms.js';

const ACCENT = 0x3498db;
const SUCCESS = 0x2ecc71;
const DANGER = 0xe74c3c;
const MUTED = 0x95a5a6;

function isAdmin(interaction) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  return false;
}

function panel(data, guild, flash = null) {
  const desc = [
    '> Atur role **Pemancing** yang boleh pakai semua command mancing.',
    '> Default: cuma Server Owner + Admin yang bisa akses.',
    '> Kalau role diset, member dengan role itu juga bisa akses.',
  ];
  if (flash) desc.push('', `> ${flash}`);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setAuthor({
      name: `${guild.name} • Fishing Role Settings`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setTitle('🎣 Fishing Role')
    .setDescription(desc.join('\n'))
    .addFields(
      {
        name: '🎣 Role Pemancing Saat Ini',
        value: data.fishingRoleId
          ? `<@&${data.fishingRoleId}> (ID: \`${data.fishingRoleId}\`)`
          : '*Belum diset*',
        inline: false,
      },
      {
        name: '✅ Yang otomatis bisa akses',
        value: '• Server Owner\n• Administrator\n• Manage Server\n• Member dengan role Pemancing',
        inline: false,
      },
    )
    .setFooter({ text: '🎣 Fishing System • Hanya Admin/Owner yang bisa akses panel ini' })
    .setTimestamp();

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('fishrole_pick')
    .setPlaceholder('🎣 Pilih role Pemancing…')
    .setMinValues(0)
    .setMaxValues(1);

  const rows = [
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fishrole_clear')
        .setLabel('🗑️ Reset (hapus role)')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!data.fishingRoleId),
      new ButtonBuilder()
        .setCustomId('fishrole_close')
        .setLabel('✖ Tutup')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return { embed, rows };
}

export const data = new SlashCommandBuilder()
  .setName('fishingrole')
  .setDescription('🎣 [ADMIN] Atur role Pemancing (gate akses fitur mancing)');

export async function execute(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(DANGER)
        .setTitle('🔒 Akses Ditolak')
        .setDescription('Cuma Server Owner & Admin yang bisa atur Fishing Role.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  const data = getFishingConfig(interaction.guildId);
  const { embed, rows } = panel(data, interaction.guild);
  return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

async function renderInPlace(interaction, guildId, guild, flash = null) {
  const data = getFishingConfig(guildId);
  const { embed, rows } = panel(data, guild, flash);
  await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleFishingRoleButton(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('fishrole_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(DANGER).setTitle('🔒 Akses Ditolak')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  if (interaction.customId === 'fishrole_close') {
    const closed = new EmbedBuilder()
      .setColor(MUTED)
      .setTitle('✖ Panel Ditutup')
      .setDescription('Buka lagi kapan saja dengan `/fishingrole`.')
      .setTimestamp();
    return interaction.editReply({ embeds: [closed], components: [] });
  }

  if (interaction.customId === 'fishrole_clear') {
    clearFishingRole(guildId);
    return renderInPlace(interaction, guildId, guild, '🗑️ Fishing role dihapus. Hanya Owner/Admin yang bisa akses.');
  }

  return false;
}

export async function handleFishingRoleSelect(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('fishrole_')) return false;
  if (!isAdmin(interaction)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(DANGER).setTitle('🔒 Akses Ditolak')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  if (interaction.customId === 'fishrole_pick') {
    const roleId = interaction.values[0] || null;
    setFishingRole(guildId, roleId);
    if (roleId) {
      return renderInPlace(interaction, guildId, guild, `🎣 Fishing role diset ke <@&${roleId}>. Member dengan role ini sekarang bisa pakai command mancing.`);
    } else {
      return renderInPlace(interaction, guildId, guild, '🗑️ Fishing role dihapus.');
    }
  }

  return false;
}
