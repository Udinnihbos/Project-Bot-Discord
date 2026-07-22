// Script untuk generate Spotify refresh token
// Jalankan dengan: node scripts/spotify-setup.js

import playdl from 'play-dl';
import { readFileSync, writeFileSync } from 'fs';

const auth = JSON.parse(readFileSync('./data/spotify-auth.json', 'utf8'));

if (auth.client_id === 'ISI_CLIENT_ID_DISINI') {
  console.error('❌ Isi dulu client_id dan client_secret di data/spotify-auth.json!');
  process.exit(1);
}

try {
  await playdl.setToken({
    spotify: {
      client_id: auth.client_id,
      client_secret: auth.client_secret,
      refresh_token: '',
      market: 'ID'
    }
  });

  const token = await playdl.refreshToken();
  auth.refresh_token = token;
  writeFileSync('./data/spotify-auth.json', JSON.stringify(auth, null, 2));
  console.log('✅ Refresh token berhasil disimpan ke data/spotify-auth.json!');
} catch (e) {
  console.error('❌ Error:', e.message);
}
