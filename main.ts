// FROSTLINE 3D — a full 3D open-world crime game (gta6-01 v6, Node 22, standard
// library only). The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html, Three.js vendored as a minified
// file under game/vendor/, the game's own classic scripts under game/src/, no
// network request). This program hands it in: it copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// NOTE: /output is a mounted volume in the grader. This program never removes the
// output directory itself (rmSync(outDir) fails EBUSY on a mount and the run
// fails); it only empties the directory's CONTENTS, so repeated runs stay
// deterministic and byte-identical.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Empty a directory's contents without ever removing the directory itself.
// The grader mounts /output as a volume, so the directory must survive.
function clearContents(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

clearContents(out);
// Fail fast if the entrypoint page is missing: a game without index.html
// would copy fine and then play nothing.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry would not run');
}
// v7: fail fast if any of the new v7 source files is missing — the game
// loads them as plain scripts from game/src/, so a missing file would break
// the build silently (the dossier would just omit it).
for (const f of ['missions2.js', 'systems.js', 'vehicles2.js', 'docks.js', 'gang2.js', 'weather.js']) {
  if (!existsSync(join(here, 'game', 'src', f))) {
    throw new Error('game/src/' + f + ' is missing — the v7 entry would not run');
  }
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
// v7 hands in six new source modules (missions2, systems, vehicles2, docks,
// gang2, weather) plus the v7 integration in missions.js, world.js,
// main.js and index.html. The dossier's text cap is unchanged — the new
// code pushes the dossier text further past the cap, so the tail of the
// dossier truncates exactly as it did in v6; the game files in /output
// are always complete.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log('FROSTLINE 3D v7 handed in to ' + out);
