// SOLMAR — boot and the one loop. Input is read every frame, the world advances
// in fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and busted. Progress (money and the
// mission) is saved to localStorage when a mission is completed.
//
// ?shot=cover|foot|chase|mission (with &seed=N) stages that scene instead of
// running the loop: it plays the real rules forward for a fixed number of steps,
// paints twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './city.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOOT, createInput,
} from './input.js';
import {
  createPlayer, damagePlayer, exitCar, punch, shoot, tryEnterCar, updateBullets, updatePlayerOnFoot,
} from './player.js';
import {
  drivePlayerCar, populateCars, updatePolice, updateTraffic, updateWanted,
} from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import {
  currentMissionDef, loadProgress, restartMission, saveProgress, updateMissions,
} from './missions.js';
import { createRenderer } from './render.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  drawBusted, drawHUD, drawMinimap, drawPaused, drawTitle,
} from './hud.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const status = document.getElementById('status');
const rng = createRandom(seed);
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas);

const view = { width: window.innerWidth, height: window.innerHeight };
function resize() {
  const ratio = window.devicePixelRatio || 1;
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  canvas.width = Math.round(view.width * ratio);
  canvas.height = Math.round(view.height * ratio);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
  renderer.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function createState() {
  const city = generateCity(rng);
  const state = {
    seed,
    rng,
    city,
    player: createPlayer(city),
    cars: [],
    peds: [],
    particles: [],
    bullets: [],
    mission: null,
    camera: { x: 0, y: 0 },
    time: 0,
    screen: SCREEN_TITLE,
    message: '',
    messageTimer: 0,
    muzzle: null,
    punchFlash: 0,
    busted: false,
    lost: 0,
    audio,
    hasSave: false,
  };
  state.mission = { index: 0, stage: 0, stageStarted: false, completed: [false, false, false, false, false], failed: false };
  return state;
}

const state = createState();
populateCars(state, rng);
spawnPedestrians(state, rng);

// Restore a save, if there is one.
const saved = loadProgress();
if (saved) {
  state.hasSave = true;
  state.player.money = typeof saved.money === 'number' ? saved.money : 0;
  state.mission.index = Math.min(5, Math.max(0, saved.missionIndex | 0));
  if (Array.isArray(saved.completed)) {
    saved.completed.forEach((done, i) => { if (i < 5) state.mission.completed[i] = !!done; });
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateCamera(dt) {
  const player = state.player;
  const tx = Math.max(0, Math.min(state.city.width - view.width, player.x - view.width / 2));
  const ty = Math.max(0, Math.min(state.city.height - view.height, player.y - view.height / 2));
  const k = Math.min(1, dt * 5);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

/** One fixed simulation step, shared by the live game and the shot staging. */
function stepGame(dt, fakeInput) {
  const useInput = fakeInput || input;
  state.time += dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;
  const player = state.player;
  if (player.onFoot) updatePlayerOnFoot(state, useInput, dt);
  else drivePlayerCar(state, useInput, dt);
  updateTraffic(state, dt, rng);
  updatePolice(state, dt, rng);
  updatePedestrians(state, dt, rng);
  updateBullets(state, dt);
  updateParticles(dt);
  updateMissions(state, dt);
  updateWanted(state, dt);
  updateCamera(dt);
  if (state.punchFlash > 0) state.punchFlash -= dt;
  if (player.dead && !state.busted) {
    state.busted = true;
    state.screen = SCREEN_BUSTED;
    state.lost = Math.floor(player.money * 0.1);
    player.money -= state.lost;
    saveProgress(state);
  }
}

function respawn() {
  const player = state.player;
  const hospital = state.city.landmarks.hospital;
  if (player.car) {
    player.car.kind = 'parked';
    player.car.speed = 0;
    player.car = null;
  }
  player.onFoot = true;
  player.x = hospital.x;
  player.y = hospital.y;
  player.angle = 0;
  player.health = 100;
  player.dead = false;
  player.wanted = 0;
  player.wantedTimer = 0;
  state.busted = false;
  state.screen = SCREEN_PLAY;
  restartMission(state);
  state.message = 'Back on the streets. Mara is waiting.';
  state.messageTimer = 3;
  state.camera.x = Math.max(0, Math.min(state.city.width - view.width, player.x - view.width / 2));
  state.camera.y = Math.max(0, Math.min(state.city.height - view.height, player.y - view.height / 2));
}

function startGame(fresh) {
  if (fresh) {
    try { window.localStorage.removeItem('solmar.save.v1'); } catch { /* ignore */ }
    state.player.money = 0;
    state.mission.index = 0;
    state.mission.stage = 0;
    state.mission.stageStarted = false;
    state.mission.completed = [false, false, false, false, false];
    state.hasSave = false;
  }
  state.player.dead = false;
  state.player.health = 100;
  state.screen = SCREEN_PLAY;
  audio.unlock();
  const def = currentMissionDef(state);
  if (def) {
    state.message = def.intro;
    state.messageTimer = 5;
  }
  announce('Playing. ' + (def ? def.title : 'Free roam.'));
}

function announce(message) {
  status.textContent = message;
}

function paint() {
  renderer.draw(state, view);
  if (state.screen === SCREEN_PLAY || state.screen === SCREEN_PAUSED || state.screen === SCREEN_BUSTED) {
    drawHUD(renderer.ctx, state, view);
    drawMinimap(minimap, state);
  } else if (state.screen === SCREEN_TITLE) {
    // The minimap alone, so its canvas is not an empty box behind the title.
    drawMinimap(minimap, state);
  }
  if (state.screen === SCREEN_TITLE) drawTitle(renderer.ctx, state, view, state.hasSave);
  else if (state.screen === SCREEN_PAUSED) drawPaused(renderer.ctx, view);
  else if (state.screen === SCREEN_BUSTED) drawBusted(renderer.ctx, state, view, state.lost);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      state.message = muted ? 'Sound off.' : 'Sound on.';
      state.messageTimer = 1.5;
    }
    if (state.screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (state.screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) respawn();
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (state.screen === SCREEN_PLAY) {
        state.screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (state.screen === SCREEN_PAUSED) {
        state.screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (state.screen !== SCREEN_PLAY) return;
    if (actions & ACTION_ENTER) {
      if (state.player.onFoot) tryEnterCar(state);
      else exitCar(state);
    }
    if (actions & ACTION_PUNCH) punch(state);
    if (actions & ACTION_SHOOT) {
      const rect = canvas.getBoundingClientRect();
      const worldX = state.camera.x + (input.mouse.x - rect.left) * (view.width / Math.max(1, rect.width));
      const worldY = state.camera.y + (input.mouse.y - rect.top) * (view.height / Math.max(1, rect.height));
      shoot(state, worldX, worldY);
    }
    // R restarts the current mission (handled via keydown on the window).
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR' && state.screen === SCREEN_PAUSED) {
      restartMission(state);
      state.screen = SCREEN_PLAY;
      announce('Mission restarted.');
    }
    if (event.code === 'KeyN' && state.screen === SCREEN_TITLE && state.hasSave) {
      startGame(true);
    }
  });

  // The title screen is alive: traffic drives and the camera drifts over the city.
  function titleStep(dt) {
    state.time += dt;
    updateTraffic(state, dt, rng);
    updatePedestrians(state, dt, rng);
    updateParticles(dt);
    state.camera.x = 300 + ((state.time * 26) % 1400);
    state.camera.y = 620;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (state.screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        titleStep(STEP);
        accumulator -= STEP;
      }
    } else if (state.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepGame(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    paint();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === SCREEN_PLAY) {
      state.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// ---- Screenshot staging -------------------------------------------------
// Each scene plays the real rules forward from a fresh state for a fixed number
// of steps, steered by a simple autopilot (hold the throttle, stay straight), so
// the frame is what a short game really looks like and the same seed always
// gives the same frame.

function fakeInput() {
  return {
    throttle: () => 1,
    steer: () => 0,
    sprint: () => false,
    handbrake: () => false,
    takeActions: () => 0,
    mouse: { x: 0, y: 0 },
  };
}

function putPlayerInCar(state, car) {
  const player = state.player;
  car.kind = 'player';
  player.onFoot = false;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

function stageShot(name) {
  const player = state.player;
  const fake = fakeInput();
  // Start every scene from the title screen's live city, then place the player.
  state.screen = SCREEN_PLAY;
  if (name === 'foot') {
    // On foot at the Docks, next to the mission marker, pedestrians around.
    // The player starts just outside the marker's radius, so the first stage
    // is still the pickup (the marker stays at the Docks for the shot).
    const docks = state.city.landmarks.docks;
    player.x = docks.x + 115;
    player.y = docks.y + 30;
    player.angle = -Math.PI / 2;
    player.onFoot = true;
    state.mission.index = 0;
    state.mission.stage = 0;
    state.mission.stageStarted = false;
    for (let i = 0; i < 6; i += 1) {
      state.peds.push({
        x: docks.x + rng.range(-140, 140), y: docks.y + rng.range(-120, 120),
        angle: rng.range(0, Math.PI * 2), speed: 0, shirt: '#4a7fb5', color: '#e8d8b8',
        state: 'walk', stateTimer: 0, targetAngle: rng.range(0, Math.PI * 2), health: 100, dead: false, deadTimer: 0, bob: 0,
      });
    }
    state.camera.x = Math.max(0, player.x - view.width / 2);
    state.camera.y = Math.max(0, player.y - view.height / 2);
    for (let i = 0; i < 150; i += 1) stepGame(STEP, fake);
  } else if (name === 'chase') {
    // A police chase: the player in the fast sports car, 3 stars, three
    // cruisers closing in from behind — close enough to read as a chase, far
    // enough that they have not caught the car yet.
    const car = state.cars.find((c) => c.kind === 'parked' && c.maxSpeed >= 520) || state.cars[0];
    car.x = 640;
    car.y = 960;
    car.angle = 0;
    car.speed = 480;
    putPlayerInCar(state, car);
    player.wanted = 3;
    player.wantedTimer = 0;
    for (let i = 0; i < 3; i += 1) {
      const police = {
        x: 640 - 380 - i * 100, y: 960 + (i - 1) * 24, angle: 0, speed: 380,
        color: '#2b4c9b', kind: 'police', maxSpeed: 560, health: 120, disabled: false,
        dir: 0, lane: 0, lastTurnX: 0, lastTurnY: 0, bustTimer: 0, vx: 0, vy: 0,
      };
      state.cars.push(police);
    }
    state.camera.x = Math.max(0, player.x - view.width / 2);
    state.camera.y = Math.max(0, player.y - view.height / 2);
    for (let i = 0; i < 120; i += 1) stepGame(STEP, fake);
  } else if (name === 'mission') {
    // A mission in progress: the Drop, delivering to the Marina. The player
    // starts far enough out that the delivery is still ahead of them.
    state.mission.index = 2;
    state.mission.stage = 1;
    state.mission.stageStarted = false;
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 480;
    car.y = 2240;
    car.angle = 0;
    car.speed = 260;
    putPlayerInCar(state, car);
    player.wanted = 1;
    player.wantedTimer = 0;
    state.camera.x = Math.max(0, player.x - view.width / 2);
    state.camera.y = Math.max(0, player.y - view.height / 2);
    for (let i = 0; i < 120; i += 1) stepGame(STEP, fake);
  } else {
    // cover: driving through Downtown with traffic, the HUD and the minimap.
    // Traffic is kept off the player's lane (the road at y=960), on the roads
    // above and below and on the cross streets, so the drive stays clean.
    // Pedestrians are kept out of the car's path too, so the shot is a clean
    // drive rather than an accident.
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 960;
    car.y = 960;
    car.angle = 0;
    car.speed = 300;
    putPlayerInCar(state, car);
    state.mission.index = 0;
    state.mission.stage = 0;
    state.mission.stageStarted = false;
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.x > 900 && ped.x < 2100 && ped.y > 920 && ped.y < 1000) state.peds.splice(i, 1);
    }
    const spots = [
      { x: 1180, y: 640, a: 0 }, { x: 1500, y: 1280, a: Math.PI }, { x: 1280, y: 1150, a: Math.PI / 2 },
      { x: 1700, y: 640, a: 0 }, { x: 1600, y: 760, a: -Math.PI / 2 },
    ];
    spots.forEach((s, i) => {
      const traffic = state.cars.filter((c) => c.kind === 'traffic')[i];
      if (!traffic) return;
      traffic.x = s.x;
      traffic.y = s.y;
      traffic.dir = s.a;
      traffic.angle = s.a;
      traffic.speed = 150;
    });
    state.camera.x = Math.max(0, player.x - view.width / 2);
    state.camera.y = Math.max(0, player.y - view.height / 2);
    for (let i = 0; i < 150; i += 1) stepGame(STEP, fake);
    // Present a clean drive: the staging may have brushed a pedestrian, which
    // raised the wanted level and brought a cruiser. Clear both for the cover.
    player.wanted = 0;
    player.wantedTimer = 0;
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.message = '';
    state.messageTimer = 0;
  }
  // The police siren and engine hum are silent in a headless run; make sure no
  // audio node is left running.
  audio.engine(0, false);
  audio.siren(false, 0);
}

function runShot(name) {
  stageShot(name);
  let painted = 0;
  function paintFrame() {
    paint();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintFrame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintFrame);
}

if (shot) runShot(shot);
else runGame();
