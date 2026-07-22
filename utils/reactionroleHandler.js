import { EmbedBuilder } from 'discord.js';
import { getRRData } from './database.js';

export async function handleReactionRole(interaction) {
  const { customId } = interaction;

  // ── DROPDOWN ──
  if (customId.startsWith('rr_dropdown_')) {
    const panelId = customId.replace('rr_dropdown_', '');
    const rrData = getRRData();
    const panel = rrData.panels[panelId];
    if (!panel) return interaction.reply({ content: '❌ Panel tidak ditemukan!', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const selectedRoleIds = interaction.values; // roles user pilih
    const allPanelRoleIds = panel.roles.map(r => r.roleId);
    const member = interaction.member;

    const added = [];
    const removed = [];

    for (const roleId of allPanelRoleIds) {
      const hasRole = member.roles.cache.has(roleId);
      const isSelected = selectedRoleIds.includes(roleId);

      try {
        if (isSelected && !hasRole) {
          await member.roles.add(roleId);
          const roleInfo = panel.roles.find(r => r.roleId === roleId);
          added.push(`${roleInfo?.emoji || ''} ${roleInfo?.label || `<@&${roleId}>`}`);
        } else if (!isSelected && hasRole) {
          await member.roles.remove(roleId);
          const roleInfo = panel.roles.find(r => r.roleId === roleId);
          removed.push(`${roleInfo?.emoji || ''} ${roleInfo?.label || `<@&${roleId}>`}`);
        }
      } catch {
        // Role might be higher than bot's role, skip
      }
    }

    const lines = [];
    if (added.length > 0) lines.push(`✅ **Ditambahkan:** ${added.join(', ')}`);
    if (removed.length > 0) lines.push(`❌ **Dihapus:** ${removed.join(', ')}`);
    if (lines.length === 0) lines.push('Tidak ada perubahan role.');

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎭 Role Diperbarui!')
          .setDescription(lines.join('\n'))
      ]
    });
  }

  // ── BUTTON ──
  if (customId.startsWith('rr_btn_')) {
    const parts = customId.replace('rr_btn_', '').split('_');
    // format: rr_btn_{panelId}_{roleId} — roleId is last part (snowflake)
    const roleId = parts[parts.length - 1];
    const panelId = parts.slice(0, -1).join('_');

    const rrData = getRRData();
    const panel = rrData.panels[panelId];
    if (!panel) return interaction.reply({ content: '❌ Panel tidak ditemukan!', ephemeral: true });

    const member = interaction.member;
    const roleInfo = panel.roles.find(r => r.roleId === roleId);
    const hasRole = member.roles.cache.has(roleId);

    try {
      if (hasRole) {
        await member.roles.remove(roleId);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#e74c3c')
              .setTitle('❌ Role Dihapus')
              .setDescription(`Role ${roleInfo?.emoji || ''} **${roleInfo?.label || `<@&${roleId}>`}** telah dihapus dari kamu!`)
          ],
          ephemeral: true
        });
      } else {
        await member.roles.add(roleId);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#2ecc71')
              .setTitle('✅ Role Ditambahkan')
              .setDescription(`Role ${roleInfo?.emoji || ''} **${roleInfo?.label || `<@&${roleId}>`}** berhasil ditambahkan!`)
          ],
          ephemeral: true
        });
      }
    } catch {
      return interaction.reply({
        content: '❌ Gagal mengubah role! Pastikan bot punya permission **Manage Roles** dan role bot lebih tinggi dari role yang dipilih.',
        ephemeral: true
      });
    }
  }
}
