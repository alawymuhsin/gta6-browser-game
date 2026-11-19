// main.ts — entrypoint build: salin game/ dan screenshots/ ke direktori output,
// lalu tulis dossier.json dari isi output itu via buildDossier. Dijalankan dengan
// `node main.ts` (Node 22, tanpa build dan tanpa install). Direktori output
// diambil dari $MAKEFUN_OUTPUT_DIR kalau ada, kalau tidak /output. Dua run
// berurutan menghasilkan dossier.json yang byte-identik, karena buildDossier
// deterministik dan isi game/ + screenshots/ tidak berubah di antara run.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });

// Bersihkan salinan run sebelumnya supaya tidak ada file usang yang ikut
// terhitung di dossier (misalnya file yang sudah dihapus dari game/).
rmSync(`${out}/game`, { recursive: true, force: true });
rmSync(`${out}/screenshots`, { recursive: true, force: true });
cpSync('game', `${out}/game`, { recursive: true });
cpSync('screenshots', `${out}/screenshots`, { recursive: true });

writeFileSync(`${out}/dossier.json`, buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
}));
