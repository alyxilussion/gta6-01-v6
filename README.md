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

**v7 adds four more story missions** (9–12), unlocked in order after the
eighth job:

9. **The Big One** — a heist: gather the crew, crack the Harbor Bank vault
   (hold E at the vault), then lose a 4-star wanted level.
10. **Neon Grand Prix** — a street race: six checkpoints across the city
    against two rival AI drivers, Vex and Rook, on a 180-second clock.
11. **Silent Harbor** — stealth: slip past the Docks guards' vision cones,
    disable the alarm panel (hold E), and extract the ledger.
12. **Viper's Nest** — the finale against Seth Vane, boss of The Vipers,
    in three phases: pistol fire, then molotovs and summoned minions, then
    an enraged charge.

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

**v7 systems:**

- **The Docks** — a working harbor district on the south waterfront:
  warehouses, a rotating gantry crane, a cargo ship at anchor, container
  stacks, wandering dock workers, an island helipad and five collectible
  crates (+$100 each, $250 bonus for all five).
- **Helicopter and boat** — a flyable helicopter (Space ascends, X
  descends) moored on the island helipad, and a boat for the harbor water
  moored beside the causeway. Motorbikes can wheelie (hold Shift+W above
  12 m/s) for style cash.
- **Weapon shop and garage** — Ammu-Nation (green ring, press B on foot)
  sells ammo, the SMG, the shotgun, grenades, armor and medkits; Dex's
  Garage (cyan ring, press B in a car) repaints cars and upgrades engine,
  tires and armor.
- **Side jobs** — vigilante takedowns (N: chase a fleeing criminal, stay
  close for 3 seconds to bust them) and courier deliveries (U: pick up a
  package, deliver it in 90 seconds).
- **The Vipers** — a rival gang in green that owns the southwest Docks:
  they attack in groups, throw molotovs that leave burning zones, and
  patrol their territory when the player enters it.
- **Dynamic weather** — the sky cycles through clear, drizzle, downpour,
  storm (lightning flashes with delayed thunder) and fog; rain density and
  fog distance follow the state. Traffic puffs exhaust, and every
  explosion throws an expanding shockwave ring.

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
| B | Shop / garage menu (near the rings) |
| N | Vigilante takedown |
| U | Courier delivery |
| X | Descend (helicopter) |
| Shift+W | Wheelie (motorbike) |

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
- `game/src/missions2.js` — v7: missions 9–12 (heist, race, stealth, boss).
- `game/src/systems.js` — v7: weapon shop, car garage, vigilante, courier.
- `game/src/vehicles2.js` — v7: helicopter, boat, motorbike wheelie.
- `game/src/docks.js` — v7: The Docks district (warehouses, crane, ship).
- `game/src/gang2.js` — v7: The Vipers gang + the Seth Vane boss fight.
- `game/src/weather.js` — v7: dynamic weather, lightning, exhaust, shockwaves.
- `game/src/audio.js` — synthesized WebAudio: engines, sirens, effects, radio.
- `game/src/hud.js` — HUD, minimap, full-screen map, menus.
- `game/src/main.js` — game loop, screens, wanted heat, saves, boot.
- `game/vendor/three.min.js` — Three.js (MIT), bundled with esbuild.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
