/**
 * Script: gate-fishing.js
 * Otomatis wrap execute() di 24 fishing command files
 * dengan hasFishingAccess + denyEmbed.
 *
 * Usage: node scripts/gate-fishing.js
 *
 * Idempotent — kalau udah di-wrap (cek signature khusus), skip.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(__dirname, '../commands');

const FILES = [
  'addfishfav.js', 'adminfishing.js', 'adminmutation.js', 'afkmancing.js',
  'baitlist.js', 'baitshop.js', 'buybait.js', 'buypancing.js',
  'equipancing.js', 'fishgamepass.js', 'fishindex.js', 'fishinventory.js',
  'fishleaderboard.js', 'fishmissions.js', 'fishmutation.js', 'fishshop.js',
  'level.js', 'mancing.js', 'profilefish.js', 'rodlist.js',
  'rodshop.js', 'sellfish.js', 'setevent.js', 'tradefishing.js',
  'usebait.js', 'zonainfo.js',
];

const SENTINEL = '// ⛔ AUTO-GATED BY gate-fishing.js';
const IMPORT_LINE = `import { hasFishingAccess, denyEmbed } from '../utils/fishingPerms.js';`;
const GUARD_PATTERN = /export async function execute\(interaction\) \{[\s\n]+const access = await hasFishingAccess\(interaction\);/;

function wrap(content) {
  // Skip if already wrapped
  if (content.includes(SENTINEL)) return { changed: false, reason: 'already gated' };

  // Skip if no execute() function
  if (!/export async function execute\(interaction\)/.test(content)) {
    return { changed: false, reason: 'no execute()' };
  }

  let newContent = content;

  // Add import if not present
  if (!newContent.includes("from '../utils/fishingPerms.js'")) {
    // Insert after the last existing import
    const importMatches = [...newContent.matchAll(/^import .*?;$/gm)];
    if (importMatches.length) {
      const lastImport = importMatches[importMatches.length - 1];
      const insertAt = lastImport.index + lastImport[0].length;
      newContent = newContent.slice(0, insertAt) + '\n' + IMPORT_LINE + newContent.slice(insertAt);
    } else {
      newContent = IMPORT_LINE + '\n\n' + newContent;
    }
  }

  // Replace `export async function execute(interaction) {` with guarded version
  newContent = newContent.replace(
    /export async function execute\(interaction\) \{/,
    `${SENTINEL}\nexport async function execute(interaction) {\n  const access = await hasFishingAccess(interaction);\n  if (!access.allowed) {\n    return interaction.reply({ embeds: [denyEmbed(interaction)], ephemeral: true });\n  }`
  );

  return { changed: true, content: newContent };
}

let wrapped = 0, skipped = 0;
for (const file of FILES) {
  const path = join(COMMANDS_DIR, file);
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch (e) { console.log(`  ⚠️  ${file} not found, skip`); skipped++; continue; }

  const r = wrap(content);
  if (r.changed) {
    writeFileSync(path, r.content);
    console.log(`  ✅ ${file} gated`);
    wrapped++;
  } else {
    console.log(`  ⏭  ${file} (${r.reason})`);
    skipped++;
  }
}

console.log(`\nDone: ${wrapped} gated, ${skipped} skipped`);
