/**
 * Announce variable substitution.
 *
 * Supported placeholders:
 *   {user}     → <@USER_ID>
 *   {username} → user's display name
 *   {server}   → guild name
 *   {memberCount} → current guild member count
 *   {date}     → "Sabtu, 25 Juli 2026" (Indonesian, WIB)
 *   {time}     → "14:30" (WIB)
 *   {version}  → process.env.BOT_VERSION || "1.0.0"
 *   {channel}  → <#CHANNEL_ID>
 */

const WIB_TZ = 'Asia/Jakarta';

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function nowWIB() {
  const now = new Date();
  // Get WIB time parts via Intl
  const wibString = now.toLocaleString('en-US', { timeZone: WIB_TZ, hour12: false });
  const wib = new Date(wibString);
  return wib;
}

function formatDateID(date = nowWIB()) {
  const day = DAYS_ID[date.getDay()];
  const dd = date.getDate();
  const month = MONTHS_ID[date.getMonth()];
  const year = date.getFullYear();
  return `${day}, ${dd} ${month} ${year}`;
}

function formatTimeID(date = nowWIB()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Replace placeholders in a string.
 * @param {string} text
 * @param {object} context { guild, user?, channel? }
 */
export function substituteVars(text, context = {}) {
  if (!text || typeof text !== 'string') return text;
  const { guild, user, channel } = context;

  const vars = {
    '{user}': user ? `<@${user.id}>` : '@user',
    '{username}': user?.username || 'username',
    '{server}': guild?.name || 'Server',
    '{memberCount}': guild?.memberCount?.toString() || '0',
    '{date}': formatDateID(),
    '{time}': formatTimeID(),
    '{dateTime}': `${formatDateID()} ${formatTimeID()} WIB`,
    '{version}': process.env.BOT_VERSION || '1.0.0',
    '{channel}': channel ? `<#${channel.id}>` : '#channel',
  };

  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

export { formatDateID, formatTimeID, nowWIB };
