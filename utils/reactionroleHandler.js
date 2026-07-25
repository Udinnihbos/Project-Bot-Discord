/**
 * Reaction Role Handler — User-facing role toggle logic.
 *
 * Called by index.js when user clicks a button or selects from a dropdown
 * in a published reaction-role panel.
 *
 * Supports 3 modes:
 *   - toggle      (default) — click to add, click again to remove
 *   - add-only    — only adds role, doesn't remove on second click
 *   - one-of      — mutual exclusion (max N roles per user, default 1)
 */

import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getPanel } from './reactionroleConfig.js';

const SUCCESS = '#2ecc71';
const DANGER = '#e74c3c';

export async function handleReactionRole(interaction) {
  const { customId } = interaction;

  // ── DROPDOWN ──
  if (customId.startsWith('rr_dropdown_')) {
    const panelId = customId.replace('rr_dropdown_', '');
    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.reply({ content: '❌ Panel tidak ditemukan!', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const selectedRoleIds = interaction.values;
    const member = interaction.member;
    const lines = [];

    if (panel.mode === 'one-of') {
      // Mutual exclusion: remove all panel roles not selected, add selected ones
      const allPanelRoleIds = panel.roles.map(r => r.roleId);
      const added = [];
      const removed = [];

      for (const roleId of allPanelRoleIds) {
        const hasRole = member.roles.cache.has(roleId);
        const isSelected = selectedRoleIds.includes(roleId);
        try {
          if (isSelected && !hasRole) {
            await member.roles.add(roleId);
            added.push(roleInfo(panel, roleId));
          } else if (!isSelected && hasRole) {
            await member.roles.remove(roleId);
            removed.push(roleInfo(panel, roleId));
          }
        } catch (e) {
          lines.push(`⚠️ Role <@&${roleId}>: ${e.message?.slice(0, 80)}`);
        }
      }
      if (added.length) lines.push(`✅ **Ditambahkan:** ${added.join(', ')}`);
      if (removed.length) lines.push(`❌ **Dihapus:** ${removed.join(', ')}`);
    } else {
      // toggle / add-only: diff between selected and currently held
      const added = [];
      const removed = [];
      const allSelected = new Set(selectedRoleIds);
      const allPanelIds = new Set(panel.roles.map(r => r.roleId));

      for (const roleId of allPanelIds) {
        const hasRole = member.roles.cache.has(roleId);
        const isSelected = allSelected.has(roleId);
        try {
          if (isSelected && !hasRole) {
            await member.roles.add(roleId);
            added.push(roleInfo(panel, roleId));
          } else if (!isSelected && hasRole && panel.mode === 'toggle') {
            await member.roles.remove(roleId);
            removed.push(roleInfo(panel, roleId));
          }
        } catch (e) {
          lines.push(`⚠️ Role <@&${roleId}>: ${e.message?.slice(0, 80)}`);
        }
      }
      if (added.length) lines.push(`✅ **Ditambahkan:** ${added.join(', ')}`);
      if (removed.length) lines.push(`❌ **Dihapus:** ${removed.join(', ')}`);
    }

    if (lines.length === 0) lines.push('Tidak ada perubahan role.');
    return interaction.editReply({
      embeds: [{ color: 0x2ecc71, title: '🎭 Role Diperbarui!', description: lines.join('\n') }],
    });
  }

  // ── BUTTON ──
  if (customId.startsWith('rr_btn_')) {
    // format: rr_btn_{panelId}_{roleId}
    const withoutPrefix = customId.replace('rr_btn_', '');
    const roleId = withoutPrefix.split('_').pop(); // last part is roleId (snowflake)
    const panelId = withoutPrefix.slice(0, withoutPrefix.length - roleId.length - 1);

    const panel = getPanel(interaction.guildId, panelId);
    if (!panel) return interaction.reply({ content: '❌ Panel tidak ditemukan!', flags: MessageFlags.Ephemeral });

    const member = interaction.member;
    const hasRole = member.roles.cache.has(roleId);

    try {
      if (panel.mode === 'one-of') {
        // Toggle this role; remove other panel roles (mutual exclusion)
        const allPanelIds = panel.roles.map(r => r.roleId);
        if (hasRole) {
          // Remove this role
          await member.roles.remove(roleId);
          return interaction.reply({
            embeds: [{ color: DANGER, title: '❌ Role Dihapus', description: `${roleInfo(panel, roleId)} dihapus.` }],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          // Remove all other panel roles, then add this one
          for (const otherId of allPanelIds) {
            if (otherId === roleId) continue;
            if (member.roles.cache.has(otherId)) {
              await member.roles.remove(otherId).catch(() => {});
            }
          }
          await member.roles.add(roleId);
          return interaction.reply({
            embeds: [{ color: SUCCESS, title: '✅ Role Ditambahkan', description: `${roleInfo(panel, roleId)} ditambahkan.` }],
            flags: MessageFlags.Ephemeral,
          });
        }
      } else if (panel.mode === 'add-only') {
        if (hasRole) {
          return interaction.reply({ embeds: [{ color: 0x95a5a6, title: 'ℹ️ Sudah Punya', description: `Kamu sudah punya ${roleInfo(panel, roleId)}.` }], flags: MessageFlags.Ephemeral });
        }
        await member.roles.add(roleId);
        return interaction.reply({
          embeds: [{ color: SUCCESS, title: '✅ Role Ditambahkan', description: `${roleInfo(panel, roleId)} berhasil ditambahkan!` }],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // toggle (default)
        if (hasRole) {
          await member.roles.remove(roleId);
          return interaction.reply({
            embeds: [{ color: DANGER, title: '❌ Role Dihapus', description: `${roleInfo(panel, roleId)} dihapus.` }],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await member.roles.add(roleId);
          return interaction.reply({
            embeds: [{ color: SUCCESS, title: '✅ Role Ditambahkan', description: `${roleInfo(panel, roleId)} berhasil ditambahkan!` }],
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } catch (e) {
      return interaction.reply({
        embeds: [{
          color: DANGER,
          title: '❌ Gagal',
          description: 'Pastikan bot punya **Manage Roles** dan role bot lebih tinggi dari role yang dipilih.',
        }],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

function roleInfo(panel, roleId) {
  const r = panel.roles.find(x => x.roleId === roleId);
  return `${r?.emoji || '🎭'} **${r?.label || `<@&${roleId}>`}**`;
}
