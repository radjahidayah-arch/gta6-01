// The world renderer: ground, roads, buildings with shadows, the beach and the
// ocean, then every entity sorted by height, then the mission marker. The camera
// is a top-left world offset; the HUD is drawn separately, in screen space.
import { PALETTE } from './config.js';
import { currentTarget } from './missions.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawGround(state, view, cam) {
    const city = state.city;
    // Grass, with a faint checker so the ground reads as terrain, not flat colour.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.fillStyle = PALETTE.grassDark;
    const tile = 160;
    const x0 = Math.floor(cam.x / tile) * tile;
    const y0 = Math.floor(cam.y / tile) * tile;
    for (let x = x0; x < cam.x + view.width + tile; x += tile) {
      for (let y = y0; y < cam.y + view.height + tile; y += tile) {
        if (((x / tile + y / tile) % 2 + 2) % 2 === 0) {
          ctx.fillRect(x - cam.x, y - cam.y, tile, tile);
        }
      }
    }
    // Beach and ocean (south edge).
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, city.beachY - cam.y, view.width, city.waterY - city.beachY);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, city.waterY - cam.y, view.width, view.height - (city.waterY - cam.y));
    // A slow swell line on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    const waveY = city.waterY + 26 + Math.sin(state.time * 0.8) * 6;
    ctx.beginPath();
    for (let x = 0; x <= view.width; x += 24) {
      const y = waveY - cam.y + Math.sin((x + cam.x) * 0.01 + state.time) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawRoads(state, view, cam) {
    const city = state.city;
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadXs) {
      ctx.fillRect(rx - city.roadWidth / 2 - cam.x, -cam.y, city.roadWidth, city.height);
    }
    for (const ry of city.roadYs) {
      ctx.fillRect(-cam.x, ry - city.roadWidth / 2 - cam.y, city.width, city.roadWidth);
    }
    // Sidewalk edges (the pale border of each block).
    ctx.strokeStyle = PALETTE.sidewalk;
    ctx.lineWidth = 5;
    for (const rx of city.roadXs) {
      ctx.beginPath();
      ctx.moveTo(rx - city.roadWidth / 2 - cam.x, -cam.y);
      ctx.lineTo(rx - city.roadWidth / 2 - cam.x, city.height - cam.y);
      ctx.moveTo(rx + city.roadWidth / 2 - cam.x, -cam.y);
      ctx.lineTo(rx + city.roadWidth / 2 - cam.x, city.height - cam.y);
      ctx.stroke();
    }
    for (const ry of city.roadYs) {
      ctx.beginPath();
      ctx.moveTo(-cam.x, ry - city.roadWidth / 2 - cam.y);
      ctx.lineTo(city.width - cam.x, ry - city.roadWidth / 2 - cam.y);
      ctx.moveTo(-cam.x, ry + city.roadWidth / 2 - cam.y);
      ctx.lineTo(city.width - cam.x, ry + city.roadWidth / 2 - cam.y);
      ctx.stroke();
    }
    // Centre dashes.
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (const rx of city.roadXs) {
      ctx.beginPath();
      ctx.moveTo(rx - cam.x, -cam.y);
      ctx.lineTo(rx - cam.x, city.height - cam.y);
      ctx.stroke();
    }
    for (const ry of city.roadYs) {
      ctx.beginPath();
      ctx.moveTo(-cam.x, ry - cam.y);
      ctx.lineTo(city.width - cam.x, ry - cam.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawParks(state, view, cam) {
    const city = state.city;
    for (const park of city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x - cam.x, park.y - cam.y, park.w, park.h);
    }
    for (const tree of city.trees) {
      const x = tree.x - cam.x;
      const y = tree.y - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(x + 5, y + 6, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tree.palm ? PALETTE.treeLight : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(x, y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      if (tree.palm) {
        ctx.strokeStyle = PALETTE.treeLight;
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * (tree.r + 6), y + Math.sin(a) * (tree.r + 6));
          ctx.stroke();
        }
      }
    }
  }

  function drawBuildings(state, view, cam) {
    const city = state.city;
    for (const b of city.buildings) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      // Shadow, offset by the building's height (the sun is high and to the east).
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + b.height * 0.45, y + b.height * 0.6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(x + 5, y + 5, b.w - 10, b.h - 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, b.w - 1, b.h - 1);
    }
    // Landmark tags, drawn small on the ground.
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const key of Object.keys(city.landmarks)) {
      const lm = city.landmarks[key];
      const x = lm.x - cam.x;
      const y = lm.y - cam.y;
      if (x < -80 || x > view.width + 80 || y < -40 || y > view.height + 40) continue;
      ctx.fillStyle = 'rgba(12,16,24,0.6)';
      const w = ctx.measureText(lm.label).width + 14;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 26, w, 17, 4);
      ctx.fill();
      ctx.fillStyle = '#e8ecf0';
      ctx.fillText(lm.label, x, y - 14);
    }
    ctx.textAlign = 'left';
  }

  function drawCarShape(car, x, y, isPlayer) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(-23 + 3, -11 + 4, 46, 22, 6);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.disabled ? '#4a4d52' : car.color;
    ctx.beginPath();
    ctx.roundRect(-23, -11, 46, 22, 6);
    ctx.fill();
    // Roof + windshield.
    ctx.fillStyle = car.disabled ? '#33363a' : 'rgba(20,28,38,0.85)';
    ctx.beginPath();
    ctx.roundRect(-8, -9, 18, 18, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,200,230,0.7)';
    ctx.fillRect(10, -8, 5, 16);
    // Wheels.
    ctx.fillStyle = '#16181c';
    ctx.fillRect(-16, -13, 9, 4);
    ctx.fillRect(-16, 9, 9, 4);
    ctx.fillRect(8, -13, 9, 4);
    ctx.fillRect(8, 9, 9, 4);
    if (car.kind === 'police') {
      // Light bar, flashing red / blue.
      const phase = Math.floor(performance.now() / 280) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#2f6bff';
      ctx.fillRect(-4, -11, 8, 5);
      ctx.fillStyle = phase ? '#2f6bff' : '#ff3b30';
      ctx.fillRect(-4, 6, 8, 5);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-25, -13, 50, 26, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPedestrianShape(ped, x, y, isPlayer) {
    const bob = ped.dead ? 0 : Math.sin(ped.bob) * 1.5;
    ctx.save();
    ctx.translate(x, y);
    if (ped.dead) {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = '#3a3f45';
      ctx.beginPath();
      ctx.roundRect(-12, -6, 24, 12, 5);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(ped.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body (a walking figure, seen from above).
    ctx.fillStyle = isPlayer ? PALETTE.playerJacket : ped.shirt;
    ctx.beginPath();
    ctx.roundRect(-7, -7 + bob, 14, 14, 6);
    ctx.fill();
    ctx.fillStyle = isPlayer ? '#f2c94c' : ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(11, 0);
    ctx.stroke();
    if (isPlayer) {
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarker(state, view, cam) {
    const target = currentTarget(state);
    if (!target) return;
    const x = target.x - cam.x;
    const y = target.y - cam.y;
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    if (x > -40 && x < view.width + 40 && y > -40 && y < view.height + 40) {
      // In view: a pulsing beacon and a beam.
      ctx.strokeStyle = 'rgba(255,207,61,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,207,61,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd94d';
      ctx.fillText(target.label, x, y - 34);
      ctx.textAlign = 'left';
    } else {
      // Off screen: an arrow at the edge, pointing the way, with the distance.
      const cx = Math.max(50, Math.min(view.width - 50, x));
      const cy = Math.max(50, Math.min(view.height - 50, y));
      const angle = Math.atan2(y - view.height / 2, x - view.width / 2);
      const dist = Math.round(Math.hypot(target.x - state.player.x, target.y - state.player.y) / 10) * 10;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd94d';
      ctx.fillText(`${target.label} · ${dist}m`, cx, cy + 30);
      ctx.textAlign = 'left';
    }
  }

  function draw(state, view) {
    const cam = state.camera;
    ctx.clearRect(0, 0, view.width, view.height);
    drawGround(state, view, cam);
    drawRoads(state, view, cam);
    drawParks(state, view, cam);
    drawBuildings(state, view, cam);
    drawMarker(state, view, cam);

    // Entities, lowest (north) first so nearer things overlap correctly.
    const drawables = [];
    for (const ped of state.peds) drawables.push({ y: ped.y, kind: 'ped', ref: ped });
    for (const car of state.cars) drawables.push({ y: car.y, kind: 'car', ref: car });
    if (state.player.onFoot) drawables.push({ y: state.player.y, kind: 'player', ref: state.player });
    drawables.sort((a, b) => a.y - b.y);
    for (const item of drawables) {
      const x = item.ref.x - cam.x;
      const y = item.ref.y - cam.y;
      if (x < -80 || x > view.width + 80 || y < -80 || y > view.height + 80) continue;
      if (item.kind === 'ped') drawPedestrianShape(item.ref, x, y, false);
      else if (item.kind === 'car') drawCarShape(item.ref, x, y, item.ref === state.player.car);
      else drawPedestrianShape(item.ref, x, y, true);
    }

    // Bullets and muzzle flash.
    ctx.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      ctx.fillRect(b.x - cam.x - 2, b.y - cam.y - 2, 4, 4);
    }
    if (state.muzzle) {
      ctx.fillStyle = '#ffdf6b';
      ctx.beginPath();
      ctx.arc(state.muzzle.x - cam.x, state.muzzle.y - cam.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const p of state.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cam.x, p.y - cam.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // A soft vignette: the sun is high, the edges fall off a little.
    const gradient = ctx.createRadialGradient(
      view.width / 2, view.height / 2, Math.min(view.width, view.height) * 0.45,
      view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.75,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(10,14,20,0.20)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  return { draw, ctx };
}
