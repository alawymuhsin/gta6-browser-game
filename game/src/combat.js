// Combat: fists, a pistol, bullets, and the Vipers who carry both. A punch is a short arc in
// front of the player; a bullet flies straight until it meets a wall, a car, a pedestrian or a
// body. Enemies chase the player on foot, punch up close and shoot from a distance.

import { PLAYER } from './config.js';
import { hitsBuilding } from './city.js';
import { carAxles, damageCar } from './vehicles.js';

export function createEnemy(random, x, y) {
  return {
    x, y,
    angle: random() * Math.PI * 2,
    health: 100,
    speed: 165,
    kind: 'viper',
    punchCooldown: 0,
    shootCooldown: 1 + random(),
    down: false,
    flash: 0,
  };
}

/** A bullet from a point, along an angle, belonging to 'player' or 'enemy'. */
export function fireBullet(bullets, x, y, angle, from, damage) {
  bullets.push({
    x, y,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    from, damage,
    life: 1.4,
  });
}

function circleHitsCar(car, x, y, r) {
  for (const axle of carAxles(car)) {
    if (Math.hypot(x - axle.x, y - axle.y) < axle.r + r) return true;
  }
  return false;
}

/**
 * Move every bullet one step and resolve what it meets. Returns the events the world must
 * carry out: { kind: 'hit-player'|'hit-enemy'|'hit-ped'|'hit-car', ... }.
 */
export function updateBullets(bullets, city, cars, peds, enemies, player, dt) {
  const events = [];
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let dead = bullet.life <= 0;
    if (!dead && (bullet.x < 0 || bullet.y < 0 || bullet.x > city.size || bullet.y > city.size)) dead = true;
    if (!dead && hitsBuilding(city, bullet.x, bullet.y, 2)) {
      events.push({ kind: 'spark', x: bullet.x, y: bullet.y });
      dead = true;
    }
    if (!dead) {
      for (const car of cars) {
        if (car.wrecked) continue;
        if (circleHitsCar(car, bullet.x, bullet.y, 3)) {
          damageCar(car, bullet.damage);
          events.push({ kind: 'hit-car', car, x: bullet.x, y: bullet.y });
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'player') {
      for (const enemy of enemies) {
        if (enemy.down) continue;
        if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < 16) {
          enemy.health -= bullet.damage;
          enemy.flash = 0.12;
          events.push({ kind: 'hit-enemy', enemy, x: bullet.x, y: bullet.y });
          if (enemy.health <= 0) {
            enemy.down = true;
            events.push({ kind: 'enemy-down', enemy });
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'player') {
      for (const ped of peds) {
        if (ped.down) continue;
        if (Math.hypot(bullet.x - ped.x, bullet.y - ped.y) < 13) {
          ped.down = true;
          ped.downTime = 6;
          events.push({ kind: 'hit-ped', ped, x: bullet.x, y: bullet.y });
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'enemy') {
      if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < PLAYER.radius) {
        events.push({ kind: 'hit-player', damage: bullet.damage, x: bullet.x, y: bullet.y });
        dead = true;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
  return events;
}

/**
 * A punch in the facing direction: anything living inside the arc takes damage and is
 * shoved back. Returns the bodies it landed on.
 */
export function punch(attacker, angle, targets, range, damage) {
  const hit = [];
  const cx = attacker.x + Math.cos(angle) * range * 0.6;
  const cy = attacker.y + Math.sin(angle) * range * 0.6;
  for (const target of targets) {
    if (target.down) continue;
    const d = Math.hypot(target.x - cx, target.y - cy);
    if (d < range * 0.75) {
      // A pedestrian has no health bar: one clean hit puts them down. A Viper or the
      // player has one, and the punch chips at it.
      if (target.health === undefined) {
        target.down = true;
      } else {
        target.health -= damage;
        if (target.health <= 0) target.down = true;
      }
      if (target.downTime !== undefined) target.downTime = 6;
      const push = 26;
      const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y) || 1;
      target.x += ((target.x - attacker.x) / dist) * push;
      target.y += ((target.y - attacker.y) / dist) * push;
      hit.push(target);
    }
  }
  return hit;
}

/**
 * Move the Vipers: chase the player, punch up close, shoot from further off. `onPlayerHit`
 * is called with the damage when a Viper lands a punch, so the world can put its
 * invulnerability window and its wasted handling around it.
 */
export function updateEnemies(enemies, player, city, bullets, dt, random, onPlayerHit) {
  for (const enemy of enemies) {
    if (enemy.down) continue;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.punchCooldown = Math.max(0, enemy.punchCooldown - dt);
    enemy.shootCooldown -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy);
    enemy.angle = Math.atan2(dy, dx);
    if (d > 46) {
      enemy.x += Math.cos(enemy.angle) * enemy.speed * dt;
      enemy.y += Math.sin(enemy.angle) * enemy.speed * dt;
      // A wall stops a Viper the same way it stops the player: slide along it.
      if (hitsBuilding(city, enemy.x, enemy.y, 12)) {
        enemy.x -= Math.cos(enemy.angle) * enemy.speed * dt;
        enemy.y -= Math.sin(enemy.angle) * enemy.speed * dt;
        enemy.x += Math.cos(enemy.angle + Math.PI / 2) * enemy.speed * dt * 0.6;
        enemy.y += Math.sin(enemy.angle + Math.PI / 2) * enemy.speed * dt * 0.6;
      }
    } else if (enemy.punchCooldown <= 0) {
      enemy.punchCooldown = 1.1;
      if (onPlayerHit) onPlayerHit(7);
    }
    if (d > 120 && d < 380 && enemy.shootCooldown <= 0) {
      enemy.shootCooldown = 2.0 + random() * 1.0;
      const aim = enemy.angle + (random() - 0.5) * 0.22;
      fireBullet(bullets, enemy.x, enemy.y, aim, 'enemy', 7);
    }
    enemy.x = Math.max(16, Math.min(city.size - 16, enemy.x));
    enemy.y = Math.max(16, Math.min(city.size - 16, enemy.y));
  }
}
