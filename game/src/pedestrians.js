// Pedestrians: they stroll the sidewalks, wait at corners, and run when they see
// a crime — a stolen car, a gunshot, a body, or the player's car bearing down.
// The dead lie where they fall for a while, then the city quietly replaces them.
import { PEDESTRIAN } from './config.js';
import { isInWater, resolveCircle } from './city.js';

const SHIRTS = ['#d94f3d', '#4a7fb5', '#7a9a4d', '#d9a441', '#8a5a9a', '#e8e0d0', '#3f6b5a', '#b5b5b5'];

export function spawnPedestrians(state, rng) {
  for (let i = 0; i < PEDESTRIAN.count; i += 1) {
    state.peds.push(makePedestrian(state, rng));
  }
}

function makePedestrian(state, rng) {
  // Start on a sidewalk: just off a road, on a block edge.
  const vertical = rng.chance(0.5);
  let x;
  let y;
  if (vertical) {
    const rx = rng.pick(state.city.roadXs);
    x = rx + (rng.chance(0.5) ? 48 : -48);
    y = rng.range(60, state.city.beachY - 60);
  } else {
    const ry = rng.pick(state.city.roadYs);
    x = rng.range(60, state.city.width - 60);
    y = ry + (rng.chance(0.5) ? 48 : -48);
  }
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    shirt: rng.pick(SHIRTS),
    color: '#e8d8b8',
    state: 'walk',
    stateTimer: rng.range(0, 6),
    targetAngle: rng.range(0, Math.PI * 2),
    health: 100,
    dead: false,
    deadTimer: 0,
    bob: rng.range(0, Math.PI * 2),
  };
}

export function updatePedestrians(state, dt, rng) {
  const player = state.player;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.dead) {
      ped.deadTimer -= dt;
      if (ped.deadTimer <= 0) state.peds.splice(i, 1);
      continue;
    }
    ped.bob += dt * 8;
    if (ped.state === 'flee') {
      // Run away from the player (or the nearest danger).
      const dx = ped.x - player.x;
      const dy = ped.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.targetAngle = Math.atan2(dy, dx);
      ped.speed = PEDESTRIAN.fleeSpeed;
      ped.stateTimer += dt;
      if (ped.stateTimer > 5 && d > 420) {
        ped.state = 'walk';
        ped.stateTimer = 0;
      }
    } else if (ped.state === 'idle') {
      ped.speed = 0;
      ped.stateTimer += dt;
      if (ped.stateTimer > rng.range(2, 5)) {
        ped.state = 'walk';
        ped.stateTimer = 0;
        ped.targetAngle = rng.range(0, Math.PI * 2);
      }
    } else {
      // Stroll: pick a new heading now and then, pause at corners.
      ped.stateTimer += dt;
      ped.speed = PEDESTRIAN.walkSpeed * rng.range(0.7, 1.2);
      if (ped.stateTimer > rng.range(4, 9)) {
        ped.stateTimer = 0;
        if (rng.chance(0.25)) ped.state = 'idle';
        else ped.targetAngle = rng.range(0, Math.PI * 2);
      }
      // A speeding car nearby makes them run.
      if (!player.onFoot && player.car && Math.abs(player.car.speed) > 300
        && Math.hypot(ped.x - player.x, ped.y - player.y) < 130) {
        ped.state = 'flee';
        ped.stateTimer = 0;
      }
    }
    // Steer toward the target heading.
    let diff = ped.targetAngle - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const solved = resolveCircle(state.city, nx, ny, PEDESTRIAN.radius);
    if (solved.hit) {
      // Turn away from the wall instead of grinding on it.
      ped.targetAngle = ped.angle + Math.PI * (0.5 + rng.next() * 0.5);
      ped.x = solved.x;
      ped.y = solved.y;
    } else {
      ped.x = nx;
      ped.y = ny;
    }
    if (isInWater(state.city, ped.x, ped.y)) {
      ped.y = state.city.waterY - PEDESTRIAN.radius;
      ped.targetAngle = -Math.PI / 2;
    }
  }
  // Keep the streets populated.
  while (state.peds.length < PEDESTRIAN.count) {
    state.peds.push(makePedestrian(state, rng));
  }
}
