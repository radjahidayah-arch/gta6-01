// The player: on foot (walk, sprint, punch, shoot) and in a car (entered with E).
// Stealing a car raises the wanted level; the car becomes the player's until they
// step out of it. Bullets fly here too, and hitting a pedestrian or a police car
// is what makes the city turn on the player.
import { CAR, PLAYER, WANTED } from './config.js';
import { isOnSand, resolveCircle } from './city.js';

export function createPlayer(city) {
  return {
    x: city.spawn.x,
    y: city.spawn.y,
    angle: 0,
    health: PLAYER.health,
    money: 0,
    onFoot: true,
    car: null,
    wanted: 0,
    wantedTimer: 0,
    punchCooldown: 0,
    shotCooldown: 0,
    aimAngle: 0,
    dead: false,
    speed: 0,
  };
}

/** Walk / sprint on foot, colliding with buildings and water. */
export function updatePlayerOnFoot(state, input, dt) {
  const player = state.player;
  const city = state.city;
  const tx = input.throttle();
  const sx = input.steer();
  const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let mx = sx;
  let my = -tx; // W / Up is "forward" on screen (up), S / Down is down
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    player.x += mx * speed * dt;
    player.y += my * speed * dt;
    player.angle = Math.atan2(my, mx);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  const sand = isOnSand(city, player.x, player.y);
  const solved = resolveCircle(city, player.x, player.y, PLAYER.radius);
  player.x = solved.x;
  player.y = solved.y;
  if (sand) player.speed *= 0.7;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
}

/** Step into the nearest car (E). Stealing a car nobody owns yet is a crime. */
export function tryEnterCar(state) {
  const player = state.player;
  if (!player.onFoot) return false;
  let best = null;
  let bestD = 70;
  for (const car of state.cars) {
    if (car.disabled) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  if (best.kind === 'traffic') {
    // The driver bails and runs; taking the car is grand theft auto.
    spawnFleeingDriver(state, best);
    best.kind = 'player';
    raiseWanted(state, WANTED.stealCar);
    state.message = 'Car stolen! The police are on their way.';
    state.messageTimer = 2.5;
  } else if (best.kind === 'parked') {
    best.kind = 'player';
    raiseWanted(state, WANTED.stealCar);
    state.message = 'Car stolen! The police are on their way.';
    state.messageTimer = 2.5;
  } else if (best.kind === 'player') {
    // Already the player's car: just get back in.
  } else if (best.kind === 'police') {
    return false; // You cannot steal a police car.
  }
  player.onFoot = false;
  player.car = best;
  player.x = best.x;
  player.y = best.y;
  player.angle = best.angle;
  state.audio.click();
  return true;
}

function spawnFleeingDriver(state, car) {
  const ped = {
    x: car.x + 26, y: car.y + 10, angle: 0, speed: 0,
    color: '#e8e0d0', shirt: '#3f6b8a', state: 'flee', stateTimer: 0, health: 100, dead: false,
  };
  state.peds.push(ped);
}

/** Step out of the car (E). The car stays where it is, parked. */
export function exitCar(state) {
  const player = state.player;
  if (player.onFoot || !player.car) return false;
  const car = player.car;
  car.kind = 'parked';
  car.speed = 0;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 34;
  player.y = car.y + Math.sin(side) * 34;
  const solved = resolveCircle(state.city, player.x, player.y, PLAYER.radius);
  player.x = solved.x;
  player.y = solved.y;
  player.onFoot = true;
  player.car = null;
  player.angle = car.angle;
  return true;
}

/** Punch whatever is closest in front of the player (F). */
export function punch(state) {
  const player = state.player;
  if (!player.onFoot || player.punchCooldown > 0) return;
  player.punchCooldown = PLAYER.punchCooldown;
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  let hit = false;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 30) {
      damagePedestrian(state, ped, PLAYER.punchDamage);
      hit = true;
    }
  }
  for (const car of state.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - px, car.y - py) < 34) {
      damageCar(state, car, PLAYER.punchDamage);
      hit = true;
    }
  }
  if (hit) state.audio.punch();
  state.punchFlash = 0.12;
}

export function damagePedestrian(state, ped, amount) {
  ped.health -= amount;
  ped.state = 'flee';
  ped.stateTimer = 0;
  if (ped.health <= 0 && !ped.dead) {
    ped.dead = true;
    ped.deadTimer = 6;
    raiseWanted(state, WANTED.hitPedestrian);
    state.message = 'Pedestrian down! Wanted level up.';
    state.messageTimer = 2;
  }
  // Nearby pedestrians flee.
  for (const other of state.peds) {
    if (!other.dead && Math.hypot(other.x - ped.x, other.y - ped.y) < 260) {
      other.state = 'flee';
      other.stateTimer = 0;
    }
  }
}

/** Shoot the pistol toward a world point (mouse click). */
export function shoot(state, targetX, targetY) {
  const player = state.player;
  if (!player.onFoot || player.shotCooldown > 0) return;
  player.shotCooldown = PLAYER.shotCooldown;
  player.aimAngle = Math.atan2(targetY - player.y, targetX - player.x);
  player.angle = player.aimAngle;
  const muzzleX = player.x + Math.cos(player.aimAngle) * 22;
  const muzzleY = player.y + Math.sin(player.aimAngle) * 22;
  state.bullets.push({
    x: muzzleX, y: muzzleY,
    vx: Math.cos(player.aimAngle) * 900, vy: Math.sin(player.aimAngle) * 900,
    life: PLAYER.shotRange / 900, from: 'player',
  });
  state.muzzle = { x: muzzleX, y: muzzleY, timer: 0.06 };
  state.audio.shot();
  // Gunfire draws attention: nearby pedestrians flee.
  for (const ped of state.peds) {
    if (!ped.dead && Math.hypot(ped.x - player.x, ped.y - player.y) < 320) {
      ped.state = 'flee';
      ped.stateTimer = 0;
    }
  }
}

/** Move bullets and resolve hits on pedestrians and police cars. */
export function updateBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
          damagePedestrian(state, ped, PLAYER.shotDamage);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.disabled) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
          damageCar(state, car, PLAYER.shotDamage);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      // A bullet that hits a building stops there.
      for (const building of state.city.buildings) {
        if (b.x >= building.x && b.x <= building.x + building.w && b.y >= building.y && b.y <= building.y + building.h) {
          dead = true;
          spawnSparks(state, b.x, b.y, 4);
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
  if (state.muzzle) {
    state.muzzle.timer -= dt;
    if (state.muzzle.timer <= 0) state.muzzle = null;
  }
}

export function damageCar(state, car, amount) {
  car.health -= amount;
  if (car.health <= 0 && !car.disabled) {
    car.disabled = true;
    car.speed = 0;
    spawnSparks(state, car.x, car.y, 14);
    state.audio.crash(1);
    if (car.kind === 'police') {
      raiseWanted(state, WANTED.shootPolice);
      state.message = 'Police car disabled!';
      state.messageTimer = 2;
      // The officer bails and runs.
      state.peds.push({
        x: car.x + 20, y: car.y + 8, angle: 0, speed: 0,
        color: '#22335e', shirt: '#2b4c9b', state: 'flee', stateTimer: 0, health: 100, dead: false,
      });
    }
  }
}

export function spawnSparks(state, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 160;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color: '#ffd94d', size: 2 + Math.random() * 2, kind: 'spark' });
  }
}

export function raiseWanted(state, stars) {
  const player = state.player;
  player.wanted = Math.min(5, player.wanted + stars);
  player.wantedTimer = 0;
}

/** Damage the player (police rams, crashes). Returns true if the player is down. */
export function damagePlayer(state, amount) {
  const player = state.player;
  if (player.dead) return true;
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    state.audio.busted();
    return true;
  }
  return false;
}
