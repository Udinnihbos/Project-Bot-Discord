/**
 * Ticket V2 — Panel Templates.
 *
 * Pre-built panel configurations that admins can apply with one click.
 * Each template includes a name, description, color, and starter ticket types
 * so admins can spin up common use cases (support, bug report, etc.) instantly.
 *
 * Templates are ID-keyed for easy reference. Banner/thumbnail are optional
 * (use empty string if you don't want a default image).
 */

export const TEMPLATES = {
  support: {
    id: 'support',
    name: '🛟 General Support',
    emoji: '🛟',
    description: 'Pertanyaan umum, bantuan, atau konsultasi dengan tim support kami.',
    color: '#5865F2',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '🛟 Tim Support • Kami siap membantu',
    cooldownSeconds: 300,
    maxTicketsPerUser: 1,
    autoCloseHours: 48,
    reminderHours: 24,
    displayType: 'button',
    ticketTypes: [
      { name: 'Pertanyaan', emoji: '❓', description: 'Ada pertanyaan tentang server/layanan?', buttonStyle: 'Primary' },
      { name: 'Bantuan', emoji: '🤝', description: 'Butuh bantuan teknis atau panduan', buttonStyle: 'Secondary' },
      { name: 'Lainnya', emoji: '💬', description: 'Topik lain yang tidak masuk kategori di atas', buttonStyle: 'Secondary' },
    ],
  },
  bug: {
    id: 'bug',
    name: '🐛 Bug Report',
    emoji: '🐛',
    description: 'Laporkan bug, error, atau masalah teknis yang kamu temukan.',
    color: '#e74c3c',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '🐛 Bug Reports • Mohon berikan detail selengkap mungkin',
    cooldownSeconds: 60,
    maxTicketsPerUser: 3,
    autoCloseHours: 72,
    reminderHours: 12,
    displayType: 'button',
    ticketTypes: [
      { name: 'Bug', emoji: '🐛', description: 'Lapor bug yang kamu temui', buttonStyle: 'Danger' },
      { name: 'Error', emoji: '⚠️', description: 'Error / crash saat pakai bot', buttonStyle: 'Danger' },
      { name: 'Suggestion', emoji: '💡', description: 'Saran perbaikan atau fitur baru', buttonStyle: 'Success' },
    ],
  },
  moderation: {
    id: 'moderation',
    name: '⚖️ Moderation / Report',
    emoji: '⚖️',
    description: 'Lapor pelanggaran aturan, pemain toxic, atau butuh bantuan moderasi.',
    color: '#f39c12',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '⚖️ Moderation • Laporanmu akan ditangani staff',
    cooldownSeconds: 600,
    maxTicketsPerUser: 1,
    autoCloseHours: 24,
    reminderHours: 4,
    displayType: 'button',
    ticketTypes: [
      { name: 'Report User', emoji: '🚨', description: 'Lapor pelanggaran oleh user lain', buttonStyle: 'Danger' },
      { name: 'Appeal', emoji: '⚖️', description: 'Banding atas punishment (mute/ban/warn)', buttonStyle: 'Primary' },
      { name: 'Bantuan Staff', emoji: '🛡️', description: 'Minta bantuan staff untuk situasi urgent', buttonStyle: 'Success' },
    ],
  },
  application: {
    id: 'application',
    name: '📋 Application / Recruitment',
    emoji: '📋',
    description: 'Daftar jadi staff, helper, atau role khusus di server ini.',
    color: '#9b59b6',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '📋 Recruitment • Terima kasih atas ketertarikanmu!',
    cooldownSeconds: 0,
    maxTicketsPerUser: 1,
    autoCloseHours: 168, // 1 week
    reminderHours: 48,
    displayType: 'button',
    ticketTypes: [
      { name: 'Staff', emoji: '👮', description: 'Daftar jadi staff/moderator', buttonStyle: 'Primary' },
      { name: 'Helper', emoji: '🤝', description: 'Daftar jadi helper/community support', buttonStyle: 'Success' },
      { name: 'Builder', emoji: '🔨', description: 'Daftar jadi builder/event organizer', buttonStyle: 'Secondary' },
    ],
  },
  partnership: {
    id: 'partnership',
    name: '🤝 Partnership / Collab',
    emoji: '🤝',
    description: 'Tawarkan partnership, sponsorship, atau kolaborasi dengan server/kamu.',
    color: '#1abc9c',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '🤝 Partnership • Kami terbuka untuk kerja sama',
    cooldownSeconds: 0,
    maxTicketsPerUser: 1,
    autoCloseHours: 168, // 1 week
    reminderHours: 48,
    displayType: 'button',
    ticketTypes: [
      { name: 'Server Partnership', emoji: '🌐', description: 'Partnership dengan server lain', buttonStyle: 'Primary' },
      { name: 'Streamer/Content', emoji: '🎥', description: 'Kolaborasi dengan streamer/content creator', buttonStyle: 'Success' },
      { name: 'Sponsor', emoji: '💰', description: 'Penawaran sponsorship', buttonStyle: 'Secondary' },
    ],
  },
  purchase: {
    id: 'purchase',
    name: '🛒 Purchase / Order',
    emoji: '🛒',
    description: 'Order produk, jasa, atau item dari server ini.',
    color: '#f1c40f',
    bannerUrl: '',
    thumbnailUrl: '',
    footerText: '🛒 Store • Baca deskripsi produk sebelum order',
    cooldownSeconds: 0,
    maxTicketsPerUser: 2,
    autoCloseHours: 72,
    reminderHours: 12,
    displayType: 'select',
    ticketTypes: [
      { name: 'Order Product', emoji: '📦', description: 'Order produk/item dari katalog', buttonStyle: 'Success' },
      { name: 'Custom Order', emoji: '🎨', description: 'Request custom (design, build, dll)', buttonStyle: 'Primary' },
      { name: 'Payment Issue', emoji: '💳', description: 'Masalah dengan pembayaran', buttonStyle: 'Danger' },
      { name: 'Refund', emoji: '↩️', description: 'Request refund / pembatalan', buttonStyle: 'Danger' },
      { name: 'Question', emoji: '❓', description: 'Pertanyaan tentang produk/jasa', buttonStyle: 'Secondary' },
    ],
  },
};

/**
 * Get a list of all template IDs.
 */
export function getTemplateIds() {
  return Object.keys(TEMPLATES);
}

/**
 * Get a template by ID.
 */
export function getTemplate(id) {
  return TEMPLATES[id] || null;
}

/**
 * Apply a template — returns a clean object ready to pass to addPanel.
 * Strips ID, derives sensible defaults, and ensures all required fields.
 */
export function applyTemplate(id) {
  const t = TEMPLATES[id];
  if (!t) return null;
  return {
    name: t.name,
    description: t.description,
    color: t.color,
    bannerUrl: t.bannerUrl,
    thumbnailUrl: t.thumbnailUrl,
    footerText: t.footerText,
    cooldownSeconds: t.cooldownSeconds,
    maxTicketsPerUser: t.maxTicketsPerUser,
    autoCloseHours: t.autoCloseHours,
    reminderHours: t.reminderHours,
    displayType: t.displayType,
    ticketTypes: t.ticketTypes.map(tt => ({
      name: tt.name,
      emoji: tt.emoji,
      description: tt.description,
      buttonStyle: tt.buttonStyle,
    })),
  };
}
