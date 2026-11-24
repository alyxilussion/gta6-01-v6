# FROSTLINE 3D — Architecture

A complete 3D open-world crime game set in the fictional snowy neon harbor city
**Neon Harbor**. Built with Three.js (vendored as `game/vendor/three.min.js`,
MIT), plain classic scripts under `game/src/` (no modules, no CDN, no network),
procedural models/textures/audio only. Plays offline from `game/index.html`.

## Layout
- `game/index.html` — page, canvas, HUD DOM; loads `vendor/three.min.js` then
  `src/*.js` in dependency order via plain `<script>` tags.
- `game/src/utils.js` — seeded RNG (mulberry32), math helpers, spatial grid.
- `game/src/config.js` — constants: palette, city size, controls, weapons,
  vehicle types, radio stations, mission data.
- `game/src/audio.js` — WebAudio: procedural SFX (engine, gunshots, sirens,
  impacts, UI) + generative radio (3 stations), started only after a gesture.
- `game/src/city.js` — deterministic seeded city: road grid, sidewalks, lane
  markings, crosswalks, downtown towers, residential, harbor + water, bridge,
  park, landmarks (tower, stadium, ferris wheel). Chunked (build/remove by
  player distance), InstancedMesh for buildings/props/lamps/trees, canvas
  textures for windows/roads. Collision AABBs + spatial grid.
- `game/src/entities.js` — procedural humanoid (player, peds) with limb
  animation (idle/walk/run/shoot/fall) + 6 vehicle types (sedan, sports,
  SUV/truck, bus, police, motorcycle) with distinct procedural models,
  headlights/taillights, arcade physics (accel/brake/reverse/drift/tilt),
  damage states, smoke/fire/explosion.
- `game/src/world.js` — traffic AI (lane following, lights, avoidance, horn),
  pedestrian AI (sidewalk nav graph, crosswalks, panic), combat (pistol, SMG,
  shotgun, melee, grenades; tracers, muzzle flash, recoil, lock-on), gang AI,
  wanted 0–5 stars (police patrol/chase/PIT/roadblocks/SWAT/helicopter,
  evade + cooldown), WASTED/BUSTED + respawn.
- `game/src/missions.js` — original story (8 chained missions, named
  characters), cinematic dialogue (letterbox, camera cuts, subtitles), mission
  markers (world beams + minimap), objectives/timers/checkpoints/fail-retry,
  money rewards, unlocks; side activities (taxi, races, random crimes,
  collectibles). A state machine handles every fail case.
- `game/src/hud.js` — HUD (health/armor, money, weapon/ammo, wanted stars,
  objective, speedometer/gear, prompts, notifications, radio name), a real
  minimap (2D canvas from map data: roads/buildings/water/player/police/
  markers/waypoint, rotates with camera), fullscreen map (M, click waypoint,
  GPS route line), title/pause/settings menus, save/load (localStorage,
  versioned, corrupt-safe).
- `game/src/main.js` — renderer (one directional light + shadows that follow
  the player, fog, sky gradient, sun/moon, emissive windows/lamps, fake bloom
  sprites, vignette, FOV kick), fixed-timestep 60 Hz loop with accumulator +
  delta clamp, central state machine (loading/title/playing/paused/cutscene/
  dead/busted/map/gameover), third-person + chase + aim cameras with collision,
  pointer lock, input, F3 debug overlay, quality settings (Low/Med/High).

## Rules enforced
- Fixed timestep, try/catch per subsystem, NaN/Infinity guards, spawn
  validation on the nav graph, stuck detection + auto-respawn, car flip
  recovery (hold R), spatial grid (no O(n^2)), dispose on chunk/entity
  removal, pointer-lock fallback, AudioContext after gesture, no softlocks.
- Zero network requests: no CDN, no external assets; all textures from
  canvas, all audio from WebAudio, all models from primitives.
- Roads run at x/z = ±32, ±96, ±160, ±224, ±288 (10 each way); blocks sit
  between them, centred on multiples of 64. Every fixed point the player
  must reach (spawn, mission targets, respawns) sits ON a road or the tower
  plaza — never on a block centre, where a building would make it
  unreachable. The spawn (0,32) is on the x=0 road, clear of the Meridian
  Tower collider (±13 around the origin).
- Chase camera: camera = carPos − forward × dist (behind the car), looking
  10 m ahead; C swings it in front for look-behind. The camera snaps (no
  lerp) on car enter/exit/respawn so it never sweeps through buildings.
- A soft hero PointLight follows the player at dusk/night so the
  protagonist stays readable on dark streets. The first mousemove after a
  pointer lock is dropped (browsers can emit a spurious delta on lock).
