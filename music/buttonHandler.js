import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { skip, pause, resume, stop, setLoop, setVolume, shuffle, getPlayerStatus, formatDuration, isPaused } from './player.js';
import { getGuildState, patchGuildState } from './state.js';
import { getMusicConfig } from './config.js';
import { buildNowPlayingEmbed, buildNowPlayingRows, buildQueueEmbed, buildIdleEmbed } from './ui.js';

const QUEUE_PAGE_SIZE = 10;

// in-memory: per-message queue page
const queuePageState = new Map();

function hasDJPerm(interaction) {
  // Server owner: always allowed
  if (interaction.guild.ownerId === interaction.user.id) return true;
  // Admin: allowed
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  // DJ role: allowed
  const cfg = getMusicConfig(interaction.guild.id);
  if (cfg.djRoleId && interaction.member?.roles?.cache?.has(cfg.djRoleId)) return true;
  return false;
}

export async function handleMusicButton(interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.customId.startsWith('music_')) return false;

  // Per-user restriction (skip/stop/loop/etc) — pause/resume/volume allowed for everyone
  const isControl = ['music_skip', 'music_stop', 'music_shuffle', 'music_loop:off', 'music_loop:song', 'music_loop:queue'].includes(interaction.customId);
  if (isControl && !hasDJPerm(interaction)) {
    return interaction.reply({
      embeds: [{
        color: 0xe74c3c,
        title: '🔒 Tidak Punya Akses',
        description: 'Cuma Server Owner, Admin, atau user dengan **DJ Role** yang bisa kontrol playback.\n\nGunakan `/settings` → DJ Role untuk set role.',
      }],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  const guild = interaction.guild;

  // ── Loop toggle ──
  if (interaction.customId.startsWith('music_loop:')) {
    const newMode = interaction.customId.split(':')[1];
    setLoop(guildId, newMode);
    await refreshNowPlaying(interaction, guild);
    return true;
  }

  // ── Pause / Resume ──
  if (interaction.customId === 'music_pause:pause') { pause(guildId); await refreshNowPlaying(interaction, guild); return true; }
  if (interaction.customId === 'music_pause:resume') { resume(guildId); await refreshNowPlaying(interaction, guild); return true; }

  // ── Skip ──
  if (interaction.customId === 'music_skip') {
    skip(guildId);
    await refreshNowPlaying(interaction, guild);
    return true;
  }

  // ── Stop ──
  if (interaction.customId === 'music_stop') {
    stop(guildId);
    const embed = {
      color: 0x95a5a6,
      title: '⏹️ Dihentikan',
      description: 'Playback dihentikan.',
    };
    await interaction.editReply({ embeds: [embed], components: [] });
    return true;
  }

  // ── Shuffle ──
  if (interaction.customId === 'music_shuffle') {
    shuffle(guildId);
    await refreshNowPlaying(interaction, guild);
    return true;
  }

  // ── Volume +10 / -10 ──
  if (interaction.customId === 'music_volup' || interaction.customId === 'music_voldown') {
    const state = getGuildState(guildId);
    const cur = state.volume ?? 100;
    const next = interaction.customId === 'music_volup' ? Math.min(200, cur + 10) : Math.max(0, cur - 10);
    setVolume(guildId, next);
    await refreshNowPlaying(interaction, guild);
    return true;
  }

  // ── Queue (show) ──
  if (interaction.customId === 'music_queue') {
    const state = getGuildState(guildId);
    const total = state.queue.length;
    const maxPage = Math.max(0, Math.ceil(total / QUEUE_PAGE_SIZE) - 1);
    queuePageState.set(interaction.message.id, 0);
    const embed = buildQueueEmbed(guild, state, 0, QUEUE_PAGE_SIZE);
    const rows = maxPage > 0 ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_queue_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('music_queue_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(false),
    )] : [];
    await interaction.editReply({ embeds: [embed], components: rows });
    return true;
  }

  // ── Queue paging ──
  if (interaction.customId === 'music_queue_prev' || interaction.customId === 'music_queue_next') {
    const cur = queuePageState.get(interaction.message.id) || 0;
    const state = getGuildState(guildId);
    const total = state.queue.length;
    const maxPage = Math.max(0, Math.ceil(total / QUEUE_PAGE_SIZE) - 1);
    const next = interaction.customId === 'music_queue_next' ? Math.min(maxPage, cur + 1) : Math.max(0, cur - 1);
    queuePageState.set(interaction.message.id, next);
    const embed = buildQueueEmbed(guild, state, next, QUEUE_PAGE_SIZE);
    const rows = maxPage > 0 ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_queue_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(next === 0),
      new ButtonBuilder().setCustomId('music_queue_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(next >= maxPage),
    )] : [];
    await interaction.editReply({ embeds: [embed], components: rows });
    return true;
  }

  return false;
}

async function refreshNowPlaying(interaction, guild) {
  const state = getGuildState(guild.id);
  if (!state.currentSong) {
    await interaction.editReply({ embeds: [buildIdleEmbed(guild)], components: [] });
    return;
  }
  const embed = buildNowPlayingEmbed(guild, state.currentSong, state);
  const rows = buildNowPlayingRows(guild.id);
  await interaction.editReply({ embeds: [embed], components: rows });
}
