// Drawing only: the world's state and the current screen in, pixels out. The camera shows a
// 1280x720 slice of the city and follows the player, zooming out a little in a car. The HUD,
// the minimap and the menus are drawn in screen space after the world. Nothing here changes
// the game: it only paints what is there.

import { PALETTE, FONT, VIEW, WORLD, WANTED } from './config.js';
import { WATER_Y, districtName } from './city.js';
import { objectiveText, stepTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const MAP_SIZE = 176;
const MAP_PAD = 14;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, dpr: 1, cssW: 0, cssH: 0 };
  const moneyLabel = cachedLabel('$');
  const fonts = new Map();

  function resize() {
    view.dpr = window.devicePixelRatio || 1;
    view.cssW = window.innerWidth;
    view.cssH = window.innerHeight;
    canvas.width = Math.round(view.cssW * view.dpr);
    canvas.height = Math.round(view.cssH * view.dpr);
    view.scale = Math.min(view.cssW / VIEW.width, view.cssH / VIEW.height);
  }

  function text(value, x, y, size, color, align, weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** A screen point in CSS pixels, turned back into a world point. */
  function screenToWorld(sx, sy, camera) {
    const scale = view.scale * camera.zoom;
    return {
      x: camera.x + (sx - view.cssW / 2) / scale,
      y: camera.y + (sy - view.cssH / 2) / scale,
    };
  }

  function visibleRect(camera) {
    const scale = view.scale * camera.zoom;
    const halfW = view.cssW / 2 / scale;
    const halfH = view.cssH / 2 / scale;
    return {
      x0: camera.x - halfW - 60, y0: camera.y - halfH - 60,
      x1: camera.x + halfW + 60, y1: camera.y + halfH + 60,
    };
  }

  function drawGround(state, vis) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    // The bay: water along the south edge, sand where it meets the land.
    context.fillStyle = PALETTE.sand;
    context.fillRect(vis.x0, Math.max(vis.y0, WATER_Y - 46), vis.x1 - vis.x0, 46);
    context.fillStyle = PALETTE.water;
    context.fillRect(vis.x0, Math.max(vis.y0, WATER_Y), vis.x1 - vis.x0, Math.max(0, vis.y1 - WATER_Y));
    for (const park of state.city.parks) {
      if (park.x > vis.x1 || park.x + park.w < vis.x0 || park.y > vis.y1 || park.y + park.h < vis.y0) continue;
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = PALETTE.parkTree;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  // North-south roads end at the coastal road; nothing is built or driven past it.
  const COAST_Y = 3620;

  function drawRoads(state, vis) {
    const half = WORLD.roadWidth / 2;
    const asphalt = half - WORLD.sidewalk;
    const roadBottom = Math.min(vis.y1, COAST_Y);
    context.fillStyle = PALETTE.sidewalk;
    for (const line of state.city.lines) {
      if (line > vis.x0 - half && line < vis.x1 + half) context.fillRect(line - half, vis.y0, WORLD.roadWidth, roadBottom - vis.y0);
      if (line < WATER_Y && line > vis.y0 - half && line < vis.y1 + half) context.fillRect(vis.x0, line - half, vis.x1 - vis.x0, WORLD.roadWidth);
    }
    context.fillStyle = PALETTE.asphalt;
    for (const line of state.city.lines) {
      if (line > vis.x0 - asphalt && line < vis.x1 + asphalt) context.fillRect(line - asphalt, vis.y0, asphalt * 2, roadBottom - vis.y0);
      if (line < WATER_Y && line > vis.y0 - asphalt && line < vis.y1 + asphalt) context.fillRect(vis.x0, line - asphalt, vis.x1 - vis.x0, asphalt * 2);
    }
    // Centre dashes, skipped at the intersections so the crossing reads clean.
    context.fillStyle = PALETTE.lane;
    const dash = 26;
    const gap = 34;
    for (const line of state.city.lines) {
      if (line < 0 || line > state.city.size) continue;
      for (let d = 0; d < state.city.size; d += dash + gap) {
        const nearCrossing = state.city.lines.some((cross) => Math.abs(d + dash / 2 - cross) < 44);
        if (nearCrossing) continue;
        if (line > vis.x0 && line < vis.x1 && d + dash > vis.y0 && d < roadBottom) {
          context.fillRect(line - 2, d, 4, dash);
        }
        if (line < WATER_Y && line > vis.y0 && line < vis.y1 && d + dash > vis.x0 && d < vis.x1) {
          context.fillRect(d, line - 2, dash, 4);
        }
      }
    }
  }

  function drawBuildings(state, vis) {
    for (const b of state.city.buildings) {
      if (b.x > vis.x1 || b.x + b.w < vis.x0 || b.y > vis.y1 || b.y + b.h < vis.y0) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 3;
      context.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(b.x + 10, b.y + 10, Math.min(34, b.w - 20), Math.min(24, b.h - 20));
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(b.x + b.w - 26, b.y + b.h - 22, 16, 12);
      if (b.tall) {
        context.fillStyle = 'rgba(255,255,255,0.10)';
        context.fillRect(b.x + b.w / 2 - 14, b.y + 12, 28, b.h - 24);
      }
    }
    // Landmark names, so the city reads as a place and not a maze.
    context.font = `600 15px ${FONT}`;
    context.fillStyle = 'rgba(16,20,28,0.75)';
    context.textAlign = 'center';
    for (const key of Object.keys(state.city.landmarks)) {
      const spot = state.city.landmarks[key];
      if (spot.x < vis.x0 || spot.x > vis.x1 || spot.y < vis.y0 || spot.y > vis.y1) continue;
      context.fillText(spot.label, spot.x, spot.y - 52);
    }
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-car.length / 2 + 3, -car.width / 2 + 4, car.length, car.width, 8);
    context.fill();
    context.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
    roundRect(-car.length / 2, -car.width / 2, car.length, car.width, 8);
    context.fill();
    context.fillStyle = 'rgba(20,28,38,0.85)';
    roundRect(-car.length / 2 + 10, -car.width / 2 + 4, car.length * 0.32, car.width - 8, 4);
    context.fill();
    context.fillStyle = 'rgba(200,225,245,0.75)';
    roundRect(car.length * 0.08, -car.width / 2 + 5, car.length * 0.22, car.width - 10, 3);
    context.fill();
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(car.length / 2 - 2, -car.width / 2 + 3, 3, 5);
    context.fillRect(car.length / 2 - 2, car.width / 2 - 8, 3, 5);
    if (car.type === 'taxi') {
      context.fillStyle = '#10141c';
      context.fillRect(-6, -car.width / 2 + 2, 12, 4);
      context.fillStyle = PALETTE.gold;
      context.fillRect(-8, -14, 16, 7);
    }
    if (car.type === 'police') {
      context.fillStyle = '#f2f4f7';
      context.fillRect(-car.length / 2 + 12, -car.width / 2 + 2, car.length - 24, car.width - 4);
      const phase = Math.floor(car.sirenPhase * 6) % 2 === 0;
      context.fillStyle = phase ? PALETTE.copLightR : PALETTE.copLightB;
      context.fillRect(-4, -car.width / 2 + 1, 8, 5);
      context.fillStyle = phase ? PALETTE.copLightB : PALETTE.copLightR;
      context.fillRect(-4, car.width / 2 - 6, 8, 5);
    }
    if (isPlayer) {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.moveTo(0, -car.width / 2 - 16);
      context.lineTo(-7, -car.width / 2 - 26);
      context.lineTo(7, -car.width / 2 - 26);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawPedestrian(ped) {
    if (ped.down) {
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    const bob = Math.sin(ped.walkPhase) * 2;
    context.fillStyle = 'rgba(0,0,0,0.22)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 8, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.pants;
    context.fillRect(ped.x - 5, ped.y + 2 + bob * 0.4, 10, 9);
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(ped.x, ped.y - 2, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y - 10 + Math.sin(ped.angle) * 3, 5.5, 0, Math.PI * 2);
    context.fill();
  }

  function drawEnemy(enemy) {
    if (enemy.down) {
      context.fillStyle = PALETTE.viper;
      context.beginPath();
      context.ellipse(enemy.x, enemy.y, 13, 7, enemy.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(enemy.x, enemy.y + 9, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = enemy.flash > 0 ? '#ffffff' : PALETTE.viper;
    context.beginPath();
    context.arc(enemy.x, enemy.y - 2, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(enemy.x + Math.cos(enemy.angle) * 3, enemy.y - 11, 5.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#222';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(enemy.x, enemy.y - 2);
    context.lineTo(enemy.x + Math.cos(enemy.angle) * 20, enemy.y - 2 + Math.sin(enemy.angle) * 20);
    context.stroke();
    if (enemy.health < 100) {
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(enemy.x - 16, enemy.y - 26, 32, 5);
      context.fillStyle = PALETTE.red;
      context.fillRect(enemy.x - 16, enemy.y - 26, 32 * Math.max(0, enemy.health / 100), 5);
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.car) return; // the car is drawn with the other cars, chevron and all
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(player.x, player.y + 10, 11, 5, 0, 0, Math.PI * 2);
    context.fill();
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return; // blink while hurt
    context.fillStyle = '#2f2f38';
    context.fillRect(player.x - 6, player.y + 2, 12, 10);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y - 3, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(player.x + Math.cos(player.faceAngle) * 3, player.y - 12, 6, 0, Math.PI * 2);
    context.fill();
    if (player.hasPistol) {
      context.strokeStyle = '#222';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(player.x, player.y - 3);
      context.lineTo(player.x + Math.cos(player.aimAngle) * 22, player.y - 3 + Math.sin(player.aimAngle) * 22);
      context.stroke();
    }
  }

  function drawMarker(state) {
    const target = stepTarget(state.missions, state.city);
    const fare = state.missions.fare;
    const now = state.time;
    if (target) {
      const pulse = 1 + Math.sin(now * 5) * 0.12;
      context.save();
      context.translate(target.x, target.y);
      context.scale(pulse, pulse);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.gold;
      context.fillRect(-11, -11, 22, 22);
      context.fillStyle = '#10141c';
      context.fillRect(-6, -6, 12, 12);
      context.restore();
      context.strokeStyle = 'rgba(242,201,76,0.7)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(target.x, target.y - 30);
      context.lineTo(target.x, target.y - 120);
      context.stroke();
    }
    if (fare && !fare.pickedUp) {
      context.fillStyle = PALETTE.green;
      context.beginPath();
      context.arc(fare.from.x, fare.from.y, 14, 0, Math.PI * 2);
      context.fill();
      text('$', fare.from.x, fare.from.y + 5, 16, '#10141c', 'center', '700');
    }
    if (fare && fare.pickedUp) {
      const pulse = 1 + Math.sin(now * 5) * 0.12;
      context.save();
      context.translate(fare.to.x, fare.to.y);
      context.scale(pulse, pulse);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.green;
      context.fillRect(-11, -11, 22, 22);
      context.restore();
    }
  }

  function drawHud(state, extras) {
    const player = state.player;
    const pad = 16;
    // Top-left: money, health, wanted, ammo.
    const panelH = player.hasPistol ? 122 : 96;
    context.fillStyle = 'rgba(16,20,28,0.82)';
    roundRect(pad, pad, 250, panelH, 10);
    context.fill();
    text(moneyLabel(player.money), pad + 16, pad + 30, 26, PALETTE.gold, 'left', '700');
    context.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(pad + 16, pad + 44, 218, 12, 6);
    context.fill();
    context.fillStyle = player.health > 30 ? PALETTE.green : PALETTE.red;
    roundRect(pad + 16, pad + 44, 218 * Math.max(0, player.health / 100), 12, 6);
    context.fill();
    let stars = '';
    for (let s = 0; s < WANTED.max; s += 1) stars += s < player.wanted ? '★' : '☆';
    text(stars, pad + 16, pad + 88, 24, PALETTE.gold, 'left');
    if (player.hasPistol) text(`Ammo ${player.ammo}`, pad + 16, pad + 112, 15, PALETTE.hudText, 'left');
    // Top-centre: the mission objective.
    const objective = objectiveText(state.missions);
    context.font = `600 17px ${FONT}`;
    const ow = context.measureText(objective).width + 32;
    context.fillStyle = 'rgba(16,20,28,0.82)';
    roundRect((view.cssW - ow) / 2, pad, ow, 38, 10);
    context.fill();
    text(objective, view.cssW / 2, pad + 25, 17, PALETTE.hudText, 'center', '600');
    // Toasts under the objective.
    state.toasts.forEach((toastItem, i) => {
      context.globalAlpha = Math.min(1, toastItem.time);
      text(toastItem.text, view.cssW / 2, pad + 66 + i * 24, 15, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    });
    // The mission briefing, while it is fresh.
    if (state.missions.messageTime > 0) {
      const message = state.missions.message;
      if (message) {
        context.font = `15px ${FONT}`;
        const mw = Math.min(view.cssW - 80, context.measureText(message).width + 36);
        context.fillStyle = 'rgba(16,20,28,0.85)';
        roundRect((view.cssW - mw) / 2, view.cssH - 96, mw, 44, 10);
        context.fill();
        text(message, view.cssW / 2, view.cssH - 68, 15, PALETTE.hudText, 'center');
      }
    }
    // Bottom-left: what the keys do right now.
    const hints = player.car
      ? 'W/S drive · A/D steer · Space brake · E get out'
      : player.hasPistol
        ? 'WASD move · Shift run · E enter car · F punch · Click shoot'
        : 'WASD move · Shift run · E enter car · F punch';
    text(hints, pad + 4, view.cssH - 18, 14, 'rgba(242,244,247,0.85)', 'left');
    // Bottom-right: where the player is, and how fast the car goes.
    const district = districtName(state.city, player.x, player.y);
    const speed = player.car ? ` ${Math.round(player.car.speed * 0.36)} km/h` : '';
    text(`${district}${speed}`, view.cssW - pad - 4, view.cssH - 18, 14, 'rgba(242,244,247,0.85)', 'right');
    // Banner: a mission done, busted, wasted, the story's end.
    if (state.banner) {
      context.globalAlpha = Math.min(1, state.banner.time);
      text(state.banner.title, view.cssW / 2, view.cssH / 2 - 30, 54, PALETTE.gold, 'center', '800');
      text(state.banner.sub, view.cssW / 2, view.cssH / 2 + 12, 22, PALETTE.hudText, 'center');
      context.globalAlpha = 1;
    }
    void extras;
  }

  function drawMinimap(state) {
    const x0 = view.cssW - MAP_SIZE - MAP_PAD;
    const y0 = MAP_PAD;
    const scale = MAP_SIZE / state.city.size;
    context.fillStyle = 'rgba(16,20,28,0.85)';
    roundRect(x0 - 6, y0 - 6, MAP_SIZE + 12, MAP_SIZE + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(x0, y0, MAP_SIZE, MAP_SIZE);
    context.clip();
    context.fillStyle = '#1d2b1d';
    context.fillRect(x0, y0, MAP_SIZE, MAP_SIZE);
    context.fillStyle = '#2f6ea8';
    context.fillRect(x0, y0 + WATER_Y * scale, MAP_SIZE, MAP_SIZE - WATER_Y * scale);
    context.strokeStyle = '#5a6068';
    context.lineWidth = 2;
    for (const line of state.city.lines) {
      context.beginPath();
      context.moveTo(x0 + line * scale, y0);
      context.lineTo(x0 + line * scale, y0 + COAST_Y * scale);
      context.stroke();
      if (line >= WATER_Y) continue;
      context.beginPath();
      context.moveTo(x0, y0 + line * scale);
      context.lineTo(x0 + MAP_SIZE, y0 + line * scale);
      context.stroke();
    }
    const dot = (x, y, r, color) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x0 + x * scale, y0 + y * scale, r, 0, Math.PI * 2);
      context.fill();
    };
    for (const car of state.cars) {
      if (car.kind === 'player' || car.wrecked) continue;
      dot(car.x, car.y, 1.6, '#8b93a3');
    }
    for (const cop of state.cops) dot(cop.x, cop.y, 3, '#2e7dff');
    for (const enemy of state.enemies) {
      if (!enemy.down) dot(enemy.x, enemy.y, 2.5, '#b06ef0');
    }
    const target = stepTarget(state.missions, state.city);
    if (target) {
      const blink = Math.floor(state.time * 3) % 2 === 0;
      if (blink) dot(target.x, target.y, 4.5, PALETTE.gold);
    }
    const fare = state.missions.fare;
    if (fare) dot(fare.pickedUp ? fare.to.x : fare.from.x, fare.pickedUp ? fare.to.y : fare.from.y, 3.5, PALETTE.green);
    // The player: a yellow arrow, pointing where they face.
    const player = state.player;
    context.save();
    context.translate(x0 + player.x * scale, y0 + player.y * scale);
    context.rotate(player.car ? player.car.angle : player.faceAngle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -4.5);
    context.lineTo(-5, 4.5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    // The view rectangle: what the camera shows of the map.
    const vis = visibleRect(state.camera);
    context.strokeStyle = 'rgba(242,244,247,0.5)';
    context.lineWidth = 1;
    context.strokeRect(x0 + vis.x0 * scale, y0 + vis.y0 * scale, (vis.x1 - vis.x0) * scale, (vis.y1 - vis.y0) * scale);
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (view.cssW - width) / 2;
    const y = (view.cssH - height) / 2;
    context.fillStyle = 'rgba(16,20,28,0.92)';
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = 'rgba(242,201,76,0.6)';
    context.lineWidth = 2;
    roundRect(x, y, width, height, 14);
    context.stroke();
    text(title, view.cssW / 2, y + 62, 44, PALETTE.gold, 'center', '800');
    lines.forEach((line, i) => {
      text(line, view.cssW / 2, y + 108 + i * 32, 17, PALETTE.hudMuted, 'center');
    });
    text(prompt, view.cssW / 2, y + height - 26, 18, PALETTE.gold, 'center', '600');
  }

  function drawTitle(state, extras) {
    // A warm dusk wash over the city behind the panel.
    context.fillStyle = 'rgba(20,26,44,0.45)';
    context.fillRect(0, 0, view.cssW, view.cssH);
    const cx = view.cssW / 2;
    text('SOLARA BAY', cx, 168, 84, PALETTE.gold, 'center', '800');
    text('S T R E E T   H E A T', cx, 214, 26, PALETTE.hudText, 'center', '600');
    text('An original open-world crime game. Steal cars, outrun the law,', cx, 262, 18, PALETTE.hudMuted, 'center');
    text('run jobs for Maya Solis — and take the Big Score.', cx, 288, 18, PALETTE.hudMuted, 'center');
    const lines = [
      'WASD move · Shift run · E enter / steal a car · F punch',
      'Mouse aims the pistol · Click shoots · P pause · M mute',
      'Five story missions, taxi fares, and a wanted level that answers back.',
    ];
    const prompt = extras.saveExists ? 'Press Space or click: Continue — or N for a new game' : 'Press Space or click to start';
    drawPanel('', lines, prompt);
    void state;
    text(`Best take: $${extras.best}`, cx, view.cssH - 40, 15, PALETTE.hudMuted, 'center');
    text('Solara Bay, Jax Marlowe and Maya Solis are invented for this game.', cx, view.cssH - 18, 13, 'rgba(154,163,176,0.8)', 'center');
  }

  function drawPaused(state) {
    context.fillStyle = 'rgba(10,14,22,0.55)';
    context.fillRect(0, 0, view.cssW, view.cssH);
    const lines = [
      'WASD move · Shift run · E enter / steal a car · F punch',
      'Mouse aims the pistol · Click shoots · M mute',
      `Progress is saved automatically — ${state.missions.index} of 5 jobs done.`,
    ];
    drawPanel('Paused', lines, 'P to resume · S to save and quit to the title');
    void state;
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, extras) {
    const camera = state.camera;
    const scale = view.scale * camera.zoom;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.sky;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(
      view.dpr * scale, 0, 0, view.dpr * scale,
      view.dpr * (view.cssW / 2 - camera.x * scale + shakeX),
      view.dpr * (view.cssH / 2 - camera.y * scale + shakeY),
    );
    const vis = visibleRect(camera);
    drawGround(state, vis);
    drawRoads(state, vis);
    drawBuildings(state, vis);
    drawMarker(state);
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      if (pickup.x < vis.x0 || pickup.x > vis.x1 || pickup.y < vis.y0 || pickup.y > vis.y1) continue;
      if (pickup.kind === 'health') {
        context.fillStyle = '#f2f4f7';
        context.fillRect(pickup.x - 11, pickup.y - 11, 22, 22);
        context.fillStyle = PALETTE.red;
        context.fillRect(pickup.x - 3, pickup.y - 8, 6, 16);
        context.fillRect(pickup.x - 8, pickup.y - 3, 16, 6);
      } else if (pickup.kind === 'ammo') {
        context.fillStyle = '#3a3f46';
        context.fillRect(pickup.x - 11, pickup.y - 8, 22, 16);
        context.fillStyle = PALETTE.gold;
        context.fillRect(pickup.x - 7, pickup.y - 4, 4, 8);
        context.fillRect(pickup.x - 1, pickup.y - 4, 4, 8);
        context.fillRect(pickup.x + 5, pickup.y - 4, 4, 8);
      } else {
        context.fillStyle = PALETTE.green;
        context.beginPath();
        context.arc(pickup.x, pickup.y, 11, 0, Math.PI * 2);
        context.fill();
        text('$', pickup.x, pickup.y + 5, 14, '#10141c', 'center', '700');
      }
    }
    for (const car of state.cars) {
      if (car.x < vis.x0 || car.x > vis.x1 || car.y < vis.y0 || car.y > vis.y1) continue;
      drawCarShape(car, car === state.player.car);
    }
    // Cop cars are their own list, not traffic: draw them too, or a chase is only
    // ever visible on the minimap.
    for (const cop of state.cops) {
      if (cop.x < vis.x0 || cop.x > vis.x1 || cop.y < vis.y0 || cop.y > vis.y1) continue;
      drawCarShape(cop, false);
    }
    for (const ped of state.peds) {
      if (ped.x < vis.x0 || ped.x > vis.x1 || ped.y < vis.y0 || ped.y > vis.y1) continue;
      drawPedestrian(ped);
    }
    for (const enemy of state.enemies) {
      if (enemy.x < vis.x0 || enemy.x > vis.x1 || enemy.y < vis.y0 || enemy.y > vis.y1) continue;
      drawEnemy(enemy);
    }
    drawPlayer(state);
    context.fillStyle = '#ffe9a8';
    for (const bullet of state.bullets) {
      context.fillRect(bullet.x - 3, bullet.y - 1.5, 6, 3);
    }
    for (const particle of state.particles) {
      context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Back to screen space.
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, extras);
      return;
    }
    drawHud(state, extras);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) drawPaused(state);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld: (sx, sy, camera) => screenToWorld(sx, sy, camera) };
}
