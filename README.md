# FROSTLINE 3D — a full 3D open-world crime game

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/alyxilussion/gta6-01-v6/rank.svg)](https://make.fun/competitions/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/alyxilussion/gta6-01-v6/reward.svg)](https://make.fun/competitions/gta6-01)

Entry for make.fun bounty **gta6-01 — "Make GTA 6"**. A complete 3D open-world
crime game that runs offline in a desktop browser from static files, with no
network requests. 100% original: its own city, characters, vehicles, names,
story, art and sounds — nothing from Rockstar Games. Built with Three.js
(vendored, MIT) and plain classic scripts; no modules, no CDN, no build step
to play.

## The game

Neon Harbor is a rainy neon city at night, built around a harbor, a downtown
of lit towers, a residential grid, a park, a stadium, a ferris wheel and a
lighthouse. You play **Mara Voss**, driver of the Whiteout Crew. Eight chained
missions with cinematic dialogue, then free roam:

1. **Meet Kai** — find Kai at the downtown garage.
2. **Steal a Car** — take any parked or slow car (press E beside it).
3. **The Drop** — grab the package off the harbor causeway.
4. **Lose the Heat** — shake a 3-star wanted level.
5. **The Rooftop** — a firefight above the neon.
6. **The Getaway** — outrun the law through the rain.
7. **The Bank Job** — rob the Meridian Bank and escape.
8. **The Harbor King** — the finale against Kade.

After the eighth job, free roam: taxi fares, street races, collectibles,
carjackings, and outrunning the law.

## Systems

- **On foot and by car** — walk the sidewalks or steal any car; seven vehicle
  types (sedan, sports, SUV, truck, bus, police, motorcycle) with arcade
  physics, drift, damage, smoke and explosions.
- **Traffic and pedestrians** — cars follow lanes and traffic lights, honk and
  dodge; pedestrians stroll the sidewalks, cross at zebra crossings, and panic
  at gunfire.
- **Wanted level and police** — 0-5 stars. Stealing, shooting and hitting
  pedestrians raise the heat; cruisers chase and PIT, foot cops chase on foot,
  SWAT vans and a helicopter with a searchlight come at high stars. Break line
  of sight and hide until the stars flash out.
- **Combat** — pistol, SMG, shotgun, melee and grenades, with assisted aim,
  muzzle flash, tracers, reload and ammo pickups. Gang AI seeks cover.
- **Missions and story** — eight chained jobs with a beam marker, briefing,
  objectives, timers, checkpoints and rewards, plus taxi, racing and
  collectible side activities.
- **HUD with minimap** — health/armor, money, weapon and ammo, wanted stars,
  objective, speedometer and gear, and a live rotating minimap with police,
  traffic and the mission marker. Full-screen map (M) with click waypoint and
  a green GPS route.
- **Start screen and save** — title with a 3D flyover, New Game / Continue /
  Controls / Settings; progress autosaves to localStorage (mission, money,
  health, wanted, position, car).
- **Sound** — everything synthesized in WebAudio: engines, tires, gunfire,
  sirens, crashes, footsteps and three procedural radio genres. M mutes.

## Controls

| Key | Action |
| --- | ------ |
| WASD / arrows | Move on foot, drive |
| Mouse | Look (pointer lock) |
| E | Enter / leave a car |
| F | Carjack an occupied car |
| Left click | Shoot (on foot) |
| R | Reload / flip a flipped car (hold) |
| Space | Jump (on foot) / handbrake (driving) |
| 1-5 / wheel | Switch weapon |
| M | Full-screen map |
| P / Esc | Pause |
| C | Look behind (driving) |
| H | Show controls overlay |
| F3 | Debug overlay |

## Run it

```sh
node serve.mjs        # serves game/ at http://localhost:8080
```

or serve `game/` with any static HTTP server and open `index.html` in
desktop Chrome. No build step, no network requests.

Screenshots are real renders of this game, taken in headless Chromium from
the running game.

## Files

- `main.ts` — the entrypoint: copies `game/` + `screenshots/` to the output
  directory and writes `dossier.json` with the kit's `buildDossier`.
- `game/index.html` — the page; loads the scripts below in order.
- `game/src/config.js` — world constants, palette, helpers, seeded RNG.
- `game/src/utils.js` — math, RNG and small helpers.
- `game/src/city.js` — the city: roads, buildings, harbor, park, landmarks.
- `game/src/entities.js` — Mara, cars, traffic, pedestrians, police.
- `game/src/world.js` — world state, spawning, collision, day/night, weather.
- `game/src/missions.js` — the eight chained jobs, cutscenes and rewards.
- `game/src/audio.js` — synthesized WebAudio: engines, sirens, effects, radio.
- `game/src/hud.js` — HUD, minimap, full-screen map, menus.
- `game/src/main.js` — game loop, screens, wanted heat, saves, boot.
- `game/vendor/three.min.js` — Three.js (MIT), bundled with esbuild.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
