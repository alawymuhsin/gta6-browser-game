// The entrypoint (Node 22, standard library only): the game is the static files in game/
// beside this file and the screenshots in screenshots/, and this program hands them in.
// It copies both trees into the output directory and writes dossier.json there, the
// summary the judge reads, built by the vendored make.fun library — the scorer runs the
// same library on what is handed in, so the dossier is built here, never written by hand.
//
//   node main.ts                          inside the grader: writes /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts   anywhere else: writes out/

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps: only text_max_bytes shapes the bytes; the rest refuse an entry
// the scorer would refuse — more than four screenshots or one over 256 KiB, more than
// 993 entries in game/ or 48 MiB of game files, or a path under game/ over 1000 bytes
// (game/ counts beside the output's own 1000-entry cap, its screenshots and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const base = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(dest, { recursive: true });
cpSync(join(base, 'game'), join(dest, 'game'), { recursive: true });
mkdirSync(join(dest, 'screenshots'), { recursive: true });
if (existsSync(join(base, 'screenshots'))) {
  cpSync(join(base, 'screenshots'), join(dest, 'screenshots'), { recursive: true });
}
writeFileSync(join(dest, 'dossier.json'), buildDossier(dest, CAPS));
