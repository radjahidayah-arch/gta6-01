// SOLMAR — every tuning number, colour and world constant in one place.
// The world is a fixed-size top-down city (3840 x 2880 px). The camera shows a
// 1280x720 window of it and follows the player. Nothing here depends on the
// screen size, so the game plays the same at any window.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const WORLD = {
  width: 3840,
  height: 2880,
  roadSpacing: 320, // distance between road centre lines
  roadWidth: 64,
  roadFirst: 320, // first road centre line from the edge
  beachY: 2640, // sand starts here (south edge)
  waterY: 2780, // ocean starts here
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  sprintSpeed: 265,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.45,
  shotDamage: 34,
  shotCooldown: 0.28,
  shotRange: 460,
};

export const CAR = {
  length: 46,
  width: 22,
  maxSpeed: 540, // px/s, sports car
  sedanSpeed: 430,
  accel: 420,
  brake: 700,
  reverseSpeed: 170,
  steer: 2.6, // rad/s at full lock, scaled by speed
  grip: 6.0, // how fast lateral velocity is killed (drift feel)
  offroadFactor: 0.55,
  health: 100,
};

export const TRAFFIC = {
  count: 14,
  speed: 150,
  minGap: 58, // slow down for a car closer than this ahead
  turnChance: 0.35, // at an intersection, chance to turn
};

export const PEDESTRIAN = {
  count: 26,
  walkSpeed: 46,
  fleeSpeed: 150,
  radius: 10,
};

export const POLICE = {
  maxSpeed: 560,
  accel: 480,
  ramDamage: 9,
  spawnDistance: 700, // spawn this far from the player, on a road
  maxCars: 5,
  sightSeconds: 9, // hidden this long with no crime -> wanted drops a star
};

export const WANTED = {
  stealCar: 1,
  hitPedestrian: 1,
  shootPedestrian: 2,
  shootPolice: 2,
  ramCar: 0, // ramming a car is noisy but not a star by itself
  max: 5,
};

export const MISSIONS = [
  { id: 1, title: 'First Job', reward: 500 },
  { id: 2, title: 'Hot Wheels', reward: 800 },
  { id: 3, title: 'The Drop', reward: 1200 },
  { id: 4, title: 'Getaway', reward: 1500 },
  { id: 5, title: 'The Big Score', reward: 3000 },
];

export const PALETTE = {
  grass: '#5d8a4a',
  grassDark: '#547c43',
  sand: '#e3cd96',
  water: '#2f7fb8',
  waterDeep: '#256a9e',
  road: '#3a3f47',
  roadEdge: '#2e3238',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a8',
  building: ['#b5673f', '#8a6f4d', '#6f7f8c', '#a05a5a', '#7a6a8a', '#4d7a6a', '#96684a', '#5d6b7a'],
  roof: ['#7c4a30', '#6b5a3e', '#54626e', '#7c4444', '#5f5270', '#3e6355', '#75543a', '#4a5663'],
  park: '#4c7a3e',
  tree: '#2f6b2a',
  treeLight: '#4a8a3a',
  player: '#f2c94c',
  playerJacket: '#d94f3d',
  police: '#2b4c9b',
  policeLight: '#e33e3e',
  traffic: ['#c94f42', '#4a7fb5', '#d9a441', '#7a9a4d', '#8a5a9a', '#b5b5b5', '#3f6b5a'],
  marker: '#ffcf3d',
  health: '#58c96b',
  healthLow: '#e5534b',
  money: '#7ed957',
  text: '#f2f4f6',
  muted: '#c9ced6',
  panel: 'rgba(12, 16, 24, 0.72)',
  star: '#ffd94d',
  starEmpty: '#5a6068',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solmar.save.v1';

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1280, y1: 1280 },
  { name: 'Downtown', x0: 1280, y0: 0, x1: 2560, y1: 1280 },
  { name: 'North Hills', x0: 2560, y0: 0, x1: 3840, y1: 1280 },
  { name: 'The Docks', x0: 0, y0: 1280, x1: 1280, y1: 2640 },
  { name: 'Marina', x0: 1280, y0: 1280, x1: 2560, y1: 2640 },
  { name: 'Palm Beach', x0: 2560, y0: 1280, x1: 3840, y1: 2640 },
];
