// Cars: traffic that drives the road grid, parked cars to steal, police cars
// that chase and ram, and the player's own driving physics (arcade: throttle,
// steering that bites with speed, handbrake drift, off-road slowdown).
import { CAR, PALETTE, POLICE, TRAFFIC, WANTED } from './config.js';
import { isOnRoad, isOnSand, nearestRoadPoint, randomRoadPoint, resolveCircle } from './city.js';
import { damageCar, damagePedestrian, damagePlayer, raiseWanted, spawnSparks } from './player.js';

let nextCarId = 1;

export function createCar(x, y, angle, color, kind, maxSpeed) {
  return {
    id: nextCarId, x, y, angle, speed: 0,
    color, kind, maxSpeed: maxSpeed || CAR.sedanSpeed,
    health: CAR.health, disabled: false,
    dir: 0, lane: 0, lastTurnX: 0, lastTurnY: 0, // traffic AI
    bustTimer: 0, // police: time spent touching the on-foot player
    vx: 0, vy: 0, // driving physics (player + police)
  };
}

/** Fill the city with traffic cars and a few parked cars to steal. */
export function populateCars(state, rng) {
  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(state, rng);
  for (let i = 0; i < 10; i += 1) {
    const point = randomRoadPoint(state.city, rng);
    const angle = point.vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const car = createCar(point.x, point.y, angle, rng.pick(PALETTE.traffic), 'parked', CAR.sedanSpeed);
    state.cars.push(car);
  }
  // The mission sports car (mission 2) — a fast one, parked near the docks.
  const sport = createCar(960, 2200, 0, '#d94f3d', 'parked', CAR.maxSpeed);
  sport.missionCar = true;
  state.cars.push(sport);
}

function spawnTrafficCar(state, rng, near) {
  const point = near || randomRoadPoint(state.city, rng);
  const angle = point.vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
  const car = createCar(point.x, point.y, angle, rng.pick(PALETTE.traffic), 'traffic', CAR.sedanSpeed);
  car.speed = TRAFFIC.speed * rng.range(0.85, 1.1);
  car.dir = angle;
  car.lane = rng.chance(0.5) ? 16 : -16;
  state.cars.push(car);
  return car;
}

/** Keep traffic topped up near the player; far-away cars are recycled. */
export function updateTraffic(state, dt, rng) {
  const player = state.player;
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind !== 'traffic') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d > 1600) {
      state.cars.splice(i, 1);
      spawnTrafficCar(state, rng);
      continue;
    }
    // Slow for a car directly ahead.
    let ahead = Infinity;
    for (const other of state.cars) {
      if (other === car || other.disabled) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const forward = dx * Math.cos(car.dir) + dy * Math.sin(car.dir);
      const lateral = Math.abs(-dx * Math.sin(car.dir) + dy * Math.cos(car.dir));
      if (forward > 0 && forward < TRAFFIC.minGap + 60 && lateral < 26) ahead = Math.min(ahead, forward);
    }
    const target = ahead < TRAFFIC.minGap + 60 ? Math.max(0, (ahead - TRAFFIC.minGap) * 1.4) : TRAFFIC.speed;
    car.speed += Math.max(-260 * dt, Math.min(180 * dt, target - car.speed));
    // At an intersection, sometimes turn.
    const nearX = nearestRoadX(state.city, car.x);
    const nearY = nearestRoadY(state.city, car.y);
    const atCross = Math.abs(car.x - nearX) < 8 && Math.abs(car.y - nearY) < 8;
    if (atCross && (Math.abs(car.lastTurnX - nearX) > 4 || Math.abs(car.lastTurnY - nearY) > 4)) {
      car.lastTurnX = nearX;
      car.lastTurnY = nearY;
      if (rng.chance(TRAFFIC.turnChance)) {
        car.dir += rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    car.x += Math.cos(car.dir) * car.speed * dt;
    car.y += Math.sin(car.dir) * car.speed * dt;
    car.angle = car.dir;
    // Stay inside the city and off the beach.
    if (car.x < 30 || car.x > state.city.width - 30 || car.y < 30 || car.y > state.city.beachY - 20) {
      car.dir += Math.PI;
      car.x = Math.max(30, Math.min(state.city.width - 30, car.x));
      car.y = Math.max(30, Math.min(state.city.beachY - 20, car.y));
    }
  }
}

function nearestRoadX(city, x) {
  let best = city.roadXs[0];
  for (const rx of city.roadXs) if (Math.abs(x - rx) < Math.abs(x - best)) best = rx;
  return best;
}

function nearestRoadY(city, y) {
  let best = city.roadYs[0];
  for (const ry of city.roadYs) if (Math.abs(y - ry) < Math.abs(y - best)) best = ry;
  return best;
}

/** The player's driving: throttle, steering, handbrake, collisions, dust. */
export function drivePlayerCar(state, input, dt) {
  const player = state.player;
  const car = player.car;
  if (!car || car.disabled) return;
  const throttle = input.throttle();
  const steer = input.steer();
  const handbrake = input.handbrake();
  const sand = isOnSand(state.city, car.x, car.y);
  const offroad = !isOnRoad(state.city, car.x, car.y) && !sand;
  const top = car.maxSpeed * (sand ? CAR.offroadFactor : offroad ? 0.75 : 1);

  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 220 * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 900 * dt);
  car.speed = Math.max(-CAR.reverseSpeed, Math.min(top, car.speed));

  // Steering bites with speed; reversing flips it.
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 140);
  car.angle += steer * CAR.steer * steerAuthority * Math.sign(car.speed || 1) * dt * (handbrake ? 1.5 : 1);

  // Velocity with drift: the car mostly goes where it points, but a handbrake
  // (or a hard turn) lets the tail step out.
  const grip = handbrake ? 1.6 : CAR.grip;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const forwardSpeed = car.vx * fx + car.vy * fy;
  const lateralX = car.vx - forwardSpeed * fx;
  const lateralY = car.vy - forwardSpeed * fy;
  const decay = Math.exp(-grip * dt);
  car.vx = forwardSpeed * fx + lateralX * decay;
  car.vy = forwardSpeed * fy + lateralY * decay;
  // Re-aim the velocity at the current speed along the heading.
  const current = Math.hypot(car.vx, car.vy);
  const target = Math.abs(car.speed);
  if (current > 0.01) {
    const blend = 0.35;
    car.vx = car.vx * (1 - blend) + fx * car.speed * blend;
    car.vy = car.vy * (1 - blend) + fy * car.speed * blend;
  } else {
    car.vx = fx * car.speed;
    car.vy = fy * car.speed;
  }

  const prevX = car.x;
  const prevY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Buildings and water stop the car hard.
  const solved = resolveCircle(state.city, car.x, car.y, 20);
  if (solved.hit) {
    const impact = Math.hypot(car.vx, car.vy);
    car.x = solved.x;
    car.y = solved.y;
    if (impact > 180) {
      car.health -= impact * 0.03;
      damagePlayer(state, impact * 0.012);
      spawnSparks(state, car.x, car.y, 8);
      state.audio.crash(impact / 500);
      car.speed *= 0.3;
      car.vx *= 0.3;
      car.vy *= 0.3;
    } else {
      car.speed *= 0.6;
      car.vx *= 0.6;
      car.vy *= 0.6;
    }
    if (car.health <= 0 && !car.disabled) {
      car.disabled = true;
      state.message = 'Your car is wrecked! Get out and run.';
      state.messageTimer = 3;
    }
  }
  if (solved.hit && Math.hypot(car.vx, car.vy) > 0) {
    // Keep the car from grinding along the wall forever.
    const moved = Math.hypot(car.x - prevX, car.y - prevY);
    if (moved < 0.5) car.speed *= 0.9;
  }

  // Hitting a pedestrian is a crime, and it slows the car.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
      damagePedestrian(state, ped, 100);
      car.speed *= 0.7;
      state.audio.crash(0.4);
      spawnSparks(state, ped.x, ped.y, 6);
    }
  }
  // Bumping other cars.
  for (const other of state.cars) {
    if (other === car || other.disabled) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 40 && d > 0.01) {
      const push = (40 - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x -= nx * push;
      car.y -= ny * push;
      other.x += nx * push;
      other.y += ny * push;
      if (Math.abs(car.speed) > 120 && state.time - (other.lastHit || -10) > 0.6) {
        other.lastHit = state.time;
        state.audio.crash(0.5);
        spawnSparks(state, (car.x + other.x) / 2, (car.y + other.y) / 2, 6);
        damageCar(state, other, 12);
      }
      car.speed *= 0.92;
    }
  }

  // Dust and skid marks when pushing hard.
  if (Math.abs(car.speed) > 320 && Math.random() < 0.5) {
    state.particles.push({
      x: car.x - fx * 22, y: car.y - fy * 22,
      vx: -fx * 40 + (Math.random() - 0.5) * 60, vy: -fy * 40 + (Math.random() - 0.5) * 60,
      life: 0.5, maxLife: 0.5, color: '#c9b890', size: 3 + Math.random() * 3, kind: 'dust',
    });
  }
  if (handbrake && Math.abs(car.speed) > 150 && Math.random() < 0.4) state.audio.skid();

  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = Math.abs(car.speed);
  state.audio.engine(Math.abs(car.speed) / car.maxSpeed, true);
}

/** Police: spawn to match the wanted level, chase, ram, and try to bust the player. */
export function updatePolice(state, dt, rng) {
  const player = state.player;
  const wanted = player.wanted;
  const police = state.cars.filter((c) => c.kind === 'police' && !c.disabled);
  const target = Math.min(POLICE.maxCars, wanted);
  // Spawn more police when the heat rises.
  if (police.length < target) {
    for (let i = police.length; i < target; i += 1) {
      const point = randomRoadPoint(state.city, rng);
      // Prefer a spawn some distance from the player.
      let tries = 0;
      let p = point;
      while (tries < 6 && Math.hypot(p.x - player.x, p.y - player.y) < POLICE.spawnDistance) {
        p = randomRoadPoint(state.city, rng);
        tries += 1;
      }
      const car = createCar(p.x, p.y, 0, '#2b4c9b', 'police', POLICE.maxSpeed);
      car.health = 120;
      state.cars.push(car);
    }
  }
  // Drop police when the heat falls.
  if (police.length > target) {
    for (let i = 0; i < police.length - target; i += 1) {
      const idx = state.cars.indexOf(police[police.length - 1 - i]);
      if (idx >= 0) state.cars.splice(idx, 1);
    }
  }

  let sirenNear = false;
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.disabled) continue;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 500) sirenNear = true;
    // Steer toward the player, with a capped turn rate.
    const want = Math.atan2(dy, dx);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    car.speed = Math.min(POLICE.maxSpeed, car.speed + POLICE.accel * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    const solved = resolveCircle(state.city, car.x, car.y, 20);
    if (solved.hit) {
      car.x = solved.x;
      car.y = solved.y;
      car.speed *= 0.5;
      car.angle += 0.6; // scrape along the wall and keep going
    }
    // Ram the player.
    if (d < 44) {
      if (player.onFoot) {
        car.bustTimer += dt;
        damagePlayer(state, POLICE.ramDamage * dt * 2);
        if (car.bustTimer > 1.2) {
          player.dead = true;
          state.busted = true;
          state.audio.busted();
        }
      } else if (player.car) {
        const impact = Math.abs(car.speed);
        if (impact > 140) {
          // A ram hurts, but at most once every 0.6 s — not per frame — so the
          // player has time to break away.
          if (state.time - (car.lastRam || -10) > 0.6) {
            car.lastRam = state.time;
            damagePlayer(state, 6);
            player.car.health -= 8;
            spawnSparks(state, (car.x + player.x) / 2, (car.y + player.y) / 2, 5);
            state.audio.crash(0.5);
          }
          player.car.speed *= 0.85;
          if (player.car.health <= 0 && !player.car.disabled) {
            player.car.disabled = true;
            state.message = 'Your car is wrecked! Run!';
            state.messageTimer = 3;
          }
        }
      }
    } else {
      car.bustTimer = Math.max(0, car.bustTimer - dt);
    }
    // A police car far away respawns closer.
    if (d > 1800) {
      const p = randomRoadPoint(state.city, rng);
      car.x = p.x;
      car.y = p.y;
      car.speed = 200;
    }
  }
  state.audio.siren(sirenNear && wanted > 0, dt);
}

/** Wanted decays when the player is out of sight and commits no new crime. */
export function updateWanted(state, dt) {
  const player = state.player;
  if (player.wanted <= 0) return;
  const nearPolice = state.cars.some((c) => c.kind === 'police' && !c.disabled
    && Math.hypot(c.x - player.x, c.y - player.y) < 520);
  if (nearPolice) {
    player.wantedTimer = 0;
    return;
  }
  player.wantedTimer += dt;
  if (player.wantedTimer >= POLICE.sightSeconds) {
    player.wanted -= 1;
    player.wantedTimer = 0;
    if (player.wanted === 0) {
      state.message = 'You lost them. The heat is off.';
      state.messageTimer = 2.5;
    }
  }
}
