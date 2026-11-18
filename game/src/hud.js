// Everything the player reads: the HUD (wanted stars, health, money, objective,
// speed), the minimap on its own small canvas, and the title / pause / busted
// overlays. All of it is drawn in screen space, over the world.
import { DISTRICTS, PALETTE } from './config.js';
import { currentObjective, currentTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar';
}

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * rad;
    const py = y + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? PALETTE.star : PALETTE.starEmpty;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
}

/** The in-game HUD, drawn in screen space on the main canvas. */
export function drawHUD(ctx, state, view) {
  const player = state.player;
  const w = view.width;
  const h = view.height;

  // Wanted stars + health + money, top right.
  panel(ctx, w - 250, 12, 238, 86);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 13px ' + 'system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('WANTED', w - 238, 30);
  for (let i = 0; i < 5; i += 1) {
    drawStar(ctx, w - 186 + i * 26, 30, 9, i < player.wanted);
  }
  ctx.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
  ctx.fillRect(w - 238, 48, 214 * Math.max(0, player.health / 100), 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(w - 238, 48, 214, 10);
  ctx.fillStyle = PALETTE.money;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`$${player.money.toLocaleString('en-US')}`, w - 238, 78);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(districtAt(player.x, player.y), w - 12, 112);
  ctx.textAlign = 'left';

  // Objective, bottom centre.
  const objective = currentObjective(state);
  ctx.font = 'bold 15px system-ui, sans-serif';
  const ow = Math.min(w - 40, ctx.measureText(objective).width + 32);
  panel(ctx, (w - ow) / 2, h - 52, ow, 38);
  ctx.fillStyle = PALETTE.marker;
  ctx.fillText('◆', (w - ow) / 2 + 14, h - 32);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(objective, (w - ow) / 2 + 34, h - 32);

  // Speed, bottom right, while driving.
  if (!player.onFoot && player.car) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.32);
    panel(ctx, w - 150, h - 112, 138, 52);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(kmh), w - 52, h - 86);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('km/h', w - 22, h - 86);
    ctx.textAlign = 'left';
  }

  // Toast message, top centre.
  if (state.message && state.messageTimer > 0) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const mw = Math.min(w - 40, ctx.measureText(state.message).width + 32);
    ctx.globalAlpha = Math.min(1, state.messageTimer);
    panel(ctx, (w - mw) / 2, 12, mw, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(state.message, w / 2, 30);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // "Busted" warning while a cop is on top of the on-foot player.
  const busting = state.cars.some((c) => c.kind === 'police' && c.bustTimer > 0.2);
  if (busting) {
    ctx.fillStyle = '#e5534b';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED — GET AWAY!', w / 2, 90);
    ctx.textAlign = 'left';
  }
}

/** The minimap, drawn on its own small canvas (200x140). */
export function drawMinimap(minimap, state) {
  const ctx = minimap.getContext('2d');
  const mw = minimap.width;
  const mh = minimap.height;
  const city = state.city;
  const sx = mw / city.width;
  const sy = mh / city.height;
  ctx.clearRect(0, 0, mw, mh);
  // Ground, water, beach — lighter than the world, so the roads read clearly.
  ctx.fillStyle = '#557a44';
  ctx.fillRect(0, 0, mw, mh);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(0, city.waterY * sy, mw, mh - city.waterY * sy);
  ctx.fillStyle = '#e3cd96';
  ctx.fillRect(0, city.beachY * sy, mw, (city.waterY - city.beachY) * sy);
  // Roads, in a pale grey that stands out from the green.
  ctx.strokeStyle = '#9aa0a8';
  ctx.lineWidth = 3;
  for (const rx of city.roadXs) {
    ctx.beginPath();
    ctx.moveTo(rx * sx, 0);
    ctx.lineTo(rx * sx, mh);
    ctx.stroke();
  }
  for (const ry of city.roadYs) {
    ctx.beginPath();
    ctx.moveTo(0, ry * sy);
    ctx.lineTo(mw, ry * sy);
    ctx.stroke();
  }
  // Mission target: a pulsing ring.
  const target = currentTarget(state);
  if (target) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.strokeStyle = '#ffcf3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x * sx, target.y * sy, pulse + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath();
    ctx.arc(target.x * sx, target.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police cars.
  ctx.fillStyle = '#5a8cff';
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.disabled) continue;
    ctx.fillRect(car.x * sx - 2, car.y * sy - 2, 4, 4);
  }
  // The player: a yellow dot with a heading tick.
  const player = state.player;
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x * sx, player.y * sy);
  ctx.lineTo(player.x * sx + Math.cos(player.angle) * 8, player.y * sy + Math.sin(player.angle) * 8);
  ctx.stroke();
  // Border.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, mw - 1, mh - 1);
}

function centreText(ctx, text, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export function drawTitle(ctx, state, view, hasSave) {
  const w = view.width;
  const h = view.height;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.62)';
  ctx.fillRect(0, 0, w, h);
  centreText(ctx, 'SOLMAR', w / 2, h / 2 - 130, 'bold 84px system-ui, sans-serif', '#ffd94d');
  centreText(ctx, 'SUN, SAND & SIRENS', w / 2, h / 2 - 78, 'bold 20px system-ui, sans-serif', PALETTE.text);
  centreText(ctx, 'An open-world crime story. You are Rico, a driver for the fixer Mara Voss.', w / 2, h / 2 - 34, '16px system-ui, sans-serif', PALETTE.muted);
  centreText(ctx, 'Five jobs. One city. Don\'t get caught.', w / 2, h / 2 - 10, '16px system-ui, sans-serif', PALETTE.muted);
  const lines = [
    'WASD / Arrows — walk or drive      E — enter / exit a car',
    'Mouse — aim      Click — shoot      F — punch',
    'Space — handbrake      Shift — sprint      P — pause      M — mute',
  ];
  lines.forEach((line, i) => {
    centreText(ctx, line, w / 2, h / 2 + 34 + i * 24, '14px system-ui, sans-serif', PALETTE.text);
  });
  const startLabel = hasSave ? 'ENTER or CLICK — Continue your story' : 'ENTER or CLICK — Start';
  centreText(ctx, startLabel, w / 2, h / 2 + 132, 'bold 18px system-ui, sans-serif', '#7ed957');
  if (hasSave) centreText(ctx, 'N — New game (clears your save)', w / 2, h / 2 + 160, '14px system-ui, sans-serif', PALETTE.muted);
}

export function drawPaused(ctx, view) {
  const w = view.width;
  const h = view.height;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.66)';
  ctx.fillRect(0, 0, w, h);
  centreText(ctx, 'PAUSED', w / 2, h / 2 - 60, 'bold 52px system-ui, sans-serif', PALETTE.text);
  centreText(ctx, 'P or Esc — resume      M — mute      R — restart the current mission', w / 2, h / 2 + 6, '16px system-ui, sans-serif', PALETTE.muted);
  centreText(ctx, 'Your progress is saved automatically.', w / 2, h / 2 + 36, '14px system-ui, sans-serif', PALETTE.muted);
}

export function drawBusted(ctx, state, view, lost) {
  const w = view.width;
  const h = view.height;
  ctx.fillStyle = 'rgba(20, 8, 10, 0.72)';
  ctx.fillRect(0, 0, w, h);
  centreText(ctx, 'BUSTED', w / 2, h / 2 - 70, 'bold 64px system-ui, sans-serif', '#e5534b');
  centreText(ctx, 'The Solmar PD caught you.', w / 2, h / 2 - 12, '18px system-ui, sans-serif', PALETTE.text);
  centreText(ctx, `You lost $${lost.toLocaleString('en-US')}. The mission restarts from its first step.`, w / 2, h / 2 + 20, '16px system-ui, sans-serif', PALETTE.muted);
  centreText(ctx, 'ENTER or CLICK — get back out there', w / 2, h / 2 + 64, 'bold 17px system-ui, sans-serif', '#7ed957');
}
