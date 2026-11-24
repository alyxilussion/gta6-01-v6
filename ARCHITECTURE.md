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
  animation (idle/walk/run/shoot/fall) + 7 vehicle types (sedan, sports,
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

## v7 modules (new in this version)
- `game/src/missions2.js` — missions 9–12, appended to `FL.MISSIONS` at load
  so the existing J-key flow picks them up. The core state machine in
  `missions.js` owns the step index and delegates the four new step types
  (`heist`, `race`, `stealth`, `boss`) here via `startStep`/`updateStep`
  hooks; this module owns the mechanics (vault channel, rival AI, guard
  vision cones, boss HP tracking). It never touches the core state directly
  except through the exported `nextStep`/`failMission`/`setMarker` hooks.
- `game/src/systems.js` — economy layer: weapon shop (6 items), car garage
  (paint/engine/tires/armor, applied to a CLONED vehicle def — the shared
  type defs in `FL.VEHICLES` are never mutated), vigilante takedowns and
  courier deliveries. Menus reuse the objective line + prompt pill; keys are
  routed from `main.js` while a menu is open. Side jobs borrow the mission
  marker only when no story mission is running.
- `game/src/vehicles2.js` — helicopter + boat as duck-typed vehicles (same
  `group`/`heading`/`speed`/`hp`/`dead`/`def`/`update(dt, input)` interface
  the player controller already uses), so boarding/driving/exiting need no
  special case beyond the boardable list in `nearestVehicle`. The helicopter
  flies (Space ascends, X descends, low flight collides with buildings); the
  boat stays in the harbor water rect and steers around the cargo ship.
  Motorbike wheelies re-apply the tilt every frame after the vehicle
  physics, so the tilt reads as steady and settles smoothly.
- `game/src/docks.js` — The Docks district. Every land structure is placed
  only after a runtime `isBlocked` footprint check, because the seeded city
  already builds industrial blocks along this strip; colliders are registered
  with the city's spatial grid at runtime. The cargo ship bobs in the water;
  the crane jib sweeps and the hook rides; workers wander the quay.
- `game/src/gang2.js` — The Vipers. Vipers live in `FL.world.gangs` so the
  player's shots can hit them; `world.js` skips `isViper` entries in its own
  gang update (but still removes their corpses) and this module runs their
  AI: group convergence, molotovs with a telegraphed fire zone, territory
  patrols. The boss (600 HP, three phases) is a flagged gang member; his
  death effects fire once via a `deathFxDone` flag.
- `game/src/weather.js` — a slow state machine (clear/drizzle/downpour/
  storm/fog) that owns the rain flag, rain opacity and fog band, with
  lightning flashes (sun/hemi spike) + delayed thunder, rotating-slice
  exhaust puffs from traffic, and expanding shockwave rings on explosions.

## v8 modules (new in this version)
- `game/src/daynight.js` — day/night as gameplay. It reads the same clock
  (`game.hour`) the lighting cycle in `main.js` already drives, and exposes
  the rules other modules read: `shopOpen()` (07:00–22:00, enforced in
  `systems.js`), `policeBoost()` (+1 car/+2 cops at night, read by
  `world.js`), `fareMultiplier()` (1.5x at night, read by `taxi.js`). Eight
  lamp-glow sprites fade in at dusk and out at dawn; transitions announce
  themselves once via notifications.
- `game/src/taxi.js` — the taxi shift: five fares against one 300-second
  clock, combo +10% per fare, $200 shift bonus. It borrows the mission
  marker (like the vigilante/courier jobs) and only runs when no story
  mission is active; `main.js` routes KeyT here and falls back to the
  one-fare job in `missions.js` if this module is absent. The HUD chip
  (`#taxi-chip`) is updated directly by this module.
- Shotgun depth (in `world.js`, where combat lives): pellet damage falls
  off with distance and pellets knock humanoids back; a `shotgun` pickup
  kind grants the M870 (handled in `main.js`'s pickup event), with three
  fixed pickups in `world.init`. `entities.js` was deliberately left alone:
  it holds models and vehicle physics, not combat.
- Small v8 touches across the v7 files: an m9 crew briefing (`missions2.js`,
  subtitle dialogue shown once per attempt), an armor vest in the shop plus
  night closing hours (`systems.js`), a helicopter horn on KeyV
  (`vehicles2.js`), fishermen on the Docks pier (`docks.js`), Viper radio
  chatter (`gang2.js`), lightning striking street lamps (`weather.js`, using
  `FL.city.lamps`), and a random 10–20% mission reward bonus (`missions.js`).

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
