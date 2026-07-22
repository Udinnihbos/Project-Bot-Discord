#!/usr/bin/env node
/**
 * Auto-install ffmpeg kalau belum ada di system.
 * Dipanggil dari package.json `postinstall` hook dan dari start command.
 * Cocok buat Pterodactyl yang image-nya gak include ffmpeg.
 *
 * Strategy:
 * - Kalau ffmpeg sudah ada → noop
 * - Kalau di Debian/Ubuntu (ada apt-get) → apt-get install
 * - Kalau di Alpine (ada apk) → apk add
 * - Kalau di Fedora/RHEL (ada dnf/yum) → dnf install
 * - Kalau gak ada package manager yg cocok → print warning, gak gagal
 */

import { execSync, spawnSync } from 'child_process';

function hasCommand(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch (e) {
    console.error(`  ✗ Failed: ${e.message?.slice(0, 100)}`);
    return false;
  }
}

function detectDistro() {
  try {
    const r = execSync('cat /etc/os-release 2>/dev/null || echo ""', { encoding: 'utf8' });
    if (/debian|ubuntu/i.test(r)) return 'debian';
    if (/alpine/i.test(r)) return 'alpine';
    if (/fedora|rhel|centos|rocky|amazon/i.test(r)) return 'fedora';
  } catch {}
  return 'unknown';
}

console.log('🔍 Checking ffmpeg...');

if (hasCommand('ffmpeg')) {
  const v = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  const line = (v.stdout || '').split('\n')[0] || 'unknown';
  console.log(`✅ ffmpeg already installed: ${line.slice(0, 80)}`);
  process.exit(0);
}

console.log('📦 ffmpeg not found, attempting install...');

const distro = detectDistro();
let success = false;

if (distro === 'debian') {
  success = run('apt-get update -qq') && run('apt-get install -y -qq ffmpeg');
} else if (distro === 'alpine') {
  success = run('apk add --no-cache ffmpeg');
} else if (distro === 'fedora') {
  success = run('dnf install -y ffmpeg');
} else {
  console.warn('⚠️  Unknown distro — skipping ffmpeg install.');
  console.warn('   Install ffmpeg manually:');
  console.warn('   - Debian/Ubuntu: apt-get install ffmpeg');
  console.warn('   - Alpine: apk add ffmpeg');
  console.warn('   - Fedora: dnf install ffmpeg');
  console.warn('   - macOS: brew install ffmpeg');
}

if (success && hasCommand('ffmpeg')) {
  console.log('✅ ffmpeg installed successfully!');
  process.exit(0);
} else {
  console.error('❌ ffmpeg install failed.');
  console.error('   Bot mungkin gak bisa play audio tanpa ffmpeg.');
  console.error('   Pasang manual lalu restart bot.');
  // Don't fail the install
  process.exit(0);
}
