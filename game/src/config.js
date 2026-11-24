// FROSTLINE 3D — config: constants, palette, controls, weapons, vehicles,
// radio stations and the mission script. All names, brands and story are
// fictional and original.
(function () {
  'use strict';
  var FL = window.FL;

  FL.CFG = {
    citySize: 640,          // world is citySize x citySize metres (square)
    blockSize: 64,          // one city block (road centre to road centre)
    // Roads run at (n + 0.5) * blockSize, i.e. x/z = ±32, ±96, ±160, ±224,
    // ±288; blocks sit between them, centred on multiples of 64. Every fixed
    // point the player must reach sits ON a road, never on a block centre.
    roadWidth: 12,
    sidewalkWidth: 3,
    chunkSize: 160,         // streaming chunk (2.5 blocks)
    chunkRadius: 2,         // chunks kept around the player (in chunk units)
    dayLength: 420,         // seconds for a full day/night cycle
    startHour: 19.4,        // dusk: neon hour
    gravity: 22,
    playerSpeed: 6.5,
    playerSprint: 10.5,
    maxTraffic: 26,
    maxPeds: 42,
    maxPolice: 14,
    saveKey: 'frostline3d-save-v1',
    settingsKey: 'frostline3d-settings-v1',
  };

  // Cohesive palette: cold snowy blues + hot neon (magenta/cyan/amber).
  FL.PALETTE = {
    skyTop: 0x0a1030, skyMid: 0x1b2a5e, skyLow: 0xff7a3c,
    ground: 0x36405a, road: 0x2a3448, sidewalk: 0x4a5468,
    snow: 0xdfe9f5, water: 0x0e2a4a,
    neonPink: 0xff2d78, neonCyan: 0x2de8ff, neonAmber: 0xffb02d,
    neonPurple: 0xb45cff, lampWarm: 0xffc46b,
    buildingA: 0x8fa3c8, buildingB: 0x6b7fa8, buildingC: 0xa8b8d8,
    downtown: 0x4a5a80, residential: 0x7a8aa8, industrial: 0x5a6a7a,
  };

  FL.CONTROLS = {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: 'ShiftLeft', jump: 'Space', interact: 'KeyE', carjack: 'KeyF',
    reload: 'KeyR', map: 'KeyM', radio: 'KeyQ', debug: 'F3', help: 'KeyH',
    weapons: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
  };

  // Weapons: name, damage, range, fire rate (shots/s), magazine, reload (s),
  // spread, auto?, projectile speed. All stylised, no gore.
  FL.WEAPONS = [
    { id: 'fists', name: 'Fists', damage: 12, range: 2.2, rate: 2.2, mag: Infinity, reload: 0, spread: 0, auto: false, melee: true },
    { id: 'pistol', name: 'P9 Pistol', damage: 22, range: 60, rate: 4, mag: 12, reload: 1.1, spread: 0.012, auto: false, speed: 120 },
    { id: 'smg', name: 'VK-9 SMG', damage: 13, range: 48, rate: 11, mag: 32, reload: 1.6, spread: 0.03, auto: true, speed: 130 },
    { id: 'shotgun', name: 'M870 Scattergun', damage: 11, range: 26, rate: 1.4, mag: 6, reload: 2.2, spread: 0.09, auto: false, pellets: 7, speed: 100 },
    { id: 'grenade', name: 'Frag Grenade', damage: 120, range: 30, rate: 1, mag: 3, reload: 0.8, spread: 0, auto: false, thrown: true },
  ];

  // Vehicle types: distinct procedural models + handling.
  FL.VEHICLES = [
    { id: 'sedan', name: 'Aurora Sedan', accel: 14, topSpeed: 34, grip: 7.5, mass: 1.0, color: 0x4a6a9a },
    { id: 'sports', name: 'Vortex GT', accel: 22, topSpeed: 48, grip: 9.5, mass: 0.8, color: 0xc22d4a },
    { id: 'suv', name: 'Bison SUV', accel: 12, topSpeed: 30, grip: 6.5, mass: 1.5, color: 0x3a5a3a },
    { id: 'truck', name: 'Hauler Truck', accel: 9, topSpeed: 26, grip: 5.5, mass: 2.0, color: 0x8a6a2a },
    { id: 'bus', name: 'City Bus', accel: 7, topSpeed: 24, grip: 5.0, mass: 2.6, color: 0x2a7a8a },
    { id: 'police', name: 'NHPD Interceptor', accel: 20, topSpeed: 46, grip: 9.0, mass: 1.0, color: 0x1a2a4a },
    { id: 'moto', name: 'Street Falcon', accel: 24, topSpeed: 52, grip: 10.5, mass: 0.4, color: 0x6a2a9a },
  ];

  FL.RADIO = [
    { name: 'NEON FM 101.1', genre: 'synthwave', bpm: 112, root: 55 },
    { name: 'HARBOR JAZZ 88.4', genre: 'jazz', bpm: 84, root: 65.4 },
    { name: 'FROST ROCK 97.7', genre: 'rock', bpm: 140, root: 49 },
  ];

  // Story: 8 chained missions. Original plot and characters.
  FL.MISSIONS = [
    { id: 'm1', name: 'Cold Start', giver: 'Mara Voss', brief: 'Mara needs a ride. Steal the parked Vortex GT on Harbor Row and bring it to her garage.',
      type: 'steal', reward: 400, target: 'car', carType: 'sports' },
    { id: 'm2', name: 'Harbor Run', giver: 'Mara Voss', brief: 'Deliver the sealed crate to the dock warehouse before the buyers leave. Do not attract the police.',
      type: 'deliver', reward: 600, time: 180 },
    { id: 'm3', name: 'Tailspin', giver: 'Dex Karr', brief: 'Dex is being tailed. Lose the two pursuers, then meet him at the park gate.',
      type: 'chase', reward: 800 },
    { id: 'm4', name: 'Drive-By Dawn', giver: 'Dex Karr', brief: 'The Rust Vipers marked our turf. Hit their three lookouts from the car and get clear.',
      type: 'driveby', reward: 1000, targets: 3 },
    { id: 'm5', name: 'Rooftop Rain', giver: 'Mara Voss', brief: 'A deal on the Meridian tower roof went bad. Clear the rooftop and grab the ledger.',
      type: 'shootout', reward: 1400, targets: 6 },
    { id: 'm6', name: 'The Vault Job', giver: 'Silas Ren', brief: 'Silas has the vault codes. Rob the Harbor Bank, then lose a 3-star wanted level.',
      type: 'heist', reward: 2500 },
    { id: 'm7', name: 'Storm Warning', giver: 'Silas Ren', brief: 'The Vipers boss, Kade, is moving a convoy across the bridge. Stop it before it crosses.',
      type: 'intercept', reward: 3000 },
    { id: 'm8', name: 'Neon Reckoning', giver: 'Mara Voss', brief: 'Finale: confront Kade at the stadium. Survive the assault, then finish it.',
      type: 'finale', reward: 5000 },
  ];

  FL.STORY_INTRO = [
    { speaker: 'MARA VOSS', text: 'Neon Harbor eats the slow. You want in? Prove you can drive.' },
    { speaker: 'KAI', text: 'I can drive. What do you need?' },
    { speaker: 'MARA VOSS', text: 'A Vortex GT, Harbor Row. Bring it to my garage. No cops, no dents.' },
  ];
})();
