// SOLMAR, the city: a road grid with blocks of buildings, a park, a beach and an
// ocean along the south edge, and the named places the story uses. Everything is
// generated from the seed, so the same seed always builds the same city.
//
// Layout: roads every 320 px, 64 px wide. Vertical roads at x = 320..3520,
// horizontal roads at y = 320..2560. The strip south of the last road is the
// beach (sand, then ocean). Buildings sit inside the blocks between roads;
// a few blocks are parks. Landmarks are fixed road-side spots the missions use.
import { DISTRICTS, PALETTE, WORLD } from './config.js';

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar';
}

export function generateCity(rng) {
  const { width, height, roadSpacing, roadWidth, roadFirst, beachY, waterY } = WORLD;
  const half = roadWidth / 2;

  const roadXs = [];
  for (let x = roadFirst; x < width - roadFirst + 1; x += roadSpacing) roadXs.push(x);
  const roadYs = [];
  for (let y = roadFirst; y < beachY - roadSpacing + 1; y += roadSpacing) roadYs.push(y);

  const buildings = [];
  const parks = [];
  const trees = [];

  // One park block near the middle of the map, plus a couple of random ones.
  const parkBlocks = new Set(['5,4', '2,6']);
  if (rng.chance(0.5)) parkBlocks.add('8,2');

  for (let i = 0; i < roadXs.length - 1; i += 1) {
    for (let j = 0; j < roadYs.length - 1; j += 1) {
      const bx0 = roadXs[i] + half + 14;
      const by0 = roadYs[j] + half + 14;
      const bx1 = roadXs[i + 1] - half - 14;
      const by1 = roadYs[j + 1] - half - 14;
      const key = `${i},${j}`;
      if (parkBlocks.has(key)) {
        const park = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
        parks.push(park);
        const n = rng.int(5, 9);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: rng.range(park.x + 16, park.x + park.w - 16), y: rng.range(park.y + 16, park.y + park.h - 16), r: rng.range(9, 15) });
        }
        continue;
      }
      // Downtown blocks (centre columns) get taller buildings.
      const downtown = i >= 4 && i <= 6 && j <= 3;
      const count = rng.int(1, 3);
      const color = rng.pick(PALETTE.building);
      const roof = rng.pick(PALETTE.roof);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(70, Math.min(150, (bx1 - bx0) / count - 8));
        const h = rng.range(60, Math.min(130, by1 - by0 - 8));
        const x = rng.range(bx0, Math.max(bx0 + 1, bx1 - w));
        const y = rng.range(by0, Math.max(by0 + 1, by1 - h));
        buildings.push({
          x, y, w, h, color, roof,
          height: downtown ? rng.range(18, 30) : rng.range(6, 16),
          district: districtAt(x + w / 2, y + h / 2),
        });
      }
    }
  }

  // Palm trees along the beachfront.
  for (let x = 80; x < width - 40; x += 90) {
    if (rng.chance(0.75)) trees.push({ x: x + rng.range(-20, 20), y: rng.range(beachY + 30, beachY + 90), r: rng.range(10, 15), palm: true });
  }

  // Landmarks: road-side spots the missions and the respawn use.
  const landmarks = {
    hospital: { x: 320, y: 640, label: 'St. Anselm Hospital' },
    police: { x: 1600, y: 320, label: 'Solmar PD' },
    safehouse: { x: 3520, y: 320, label: 'Safehouse' },
    garage: { x: 320, y: 1600, label: "Rico's Garage" },
    docks: { x: 320, y: 2240, label: 'The Docks' },
    marina: { x: 1920, y: 2240, label: 'Marina' },
    bank: { x: 1920, y: 960, label: 'Solmar National Bank' },
    chopshop: { x: 960, y: 2240, label: 'Chop Shop' },
    park: { x: 1920, y: 1600, label: 'Central Park' },
    beach: { x: 3200, y: 2700, label: 'Palm Beach' },
  };

  const city = {
    width, height, roadXs, roadYs, roadWidth, beachY, waterY,
    buildings, parks, trees, landmarks,
    spawn: { x: 320, y: 960 },
  };
  return city;
}

/** True when the point is on a road (within its width). */
export function isOnRoad(city, x, y) {
  const half = city.roadWidth / 2;
  for (const rx of city.roadXs) if (Math.abs(x - rx) <= half) return true;
  for (const ry of city.roadYs) if (Math.abs(y - ry) <= half) return true;
  return false;
}

export function isOnSand(city, x, y) {
  return y >= city.beachY && y < city.waterY;
}

export function isInWater(city, x, y) {
  return y >= city.waterY;
}

/** Push a circle out of buildings, water and the world edge. Returns {x, y, hit}. */
export function resolveCircle(city, x, y, r) {
  let hit = false;
  x = Math.max(r, Math.min(city.width - r, x));
  y = Math.max(r, Math.min(city.height - r, y));
  if (y + r > city.waterY) {
    y = city.waterY - r;
    hit = true;
  }
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Dead centre of a building: push out along the smallest penetration.
        const pushLeft = x - b.x + r;
        const pushRight = b.x + b.w - x + r;
        const pushUp = y - b.y + r;
        const pushDown = b.y + b.h - y + r;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) x = b.x - r;
        else if (m === pushRight) x = b.x + b.w + r;
        else if (m === pushUp) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return { x, y, hit };
}

/** A random point on a random road (for spawning traffic and police). */
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    const rx = rng.pick(city.roadXs);
    return { x: rx + rng.range(-14, 14), y: rng.range(40, city.beachY - 40), vertical: true };
  }
  const ry = rng.pick(city.roadYs);
  return { x: rng.range(40, city.width - 40), y: ry + rng.range(-14, 14), vertical: false };
}

/** The nearest road centre line to a point, as {x, y} on that road. */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadXs) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y }; }
  }
  for (const ry of city.roadYs) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry }; }
  }
  return best;
}
