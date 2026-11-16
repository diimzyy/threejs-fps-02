// Bots: five enemies a side. Each walks waypoints (routes), holds angles, spots players by
// distance + line of sight, opens fire with the same weapon stats, and reacts to gunshots
// nearby. Bodies are boxes with a head sphere — the headshot multiplier pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapon.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const SPEED = 3.4;
const ACCEL = 26;
const HOLD_TIME = 1.6;
const REACTION = 0.28;
const SPOT_RANGE = 26;
const HEAR_RANGE = 18;

// Waypoint routes through the glassworks. Attackers head to a site; defenders hold near one.
const ROUTES = {
  attackA: [[-12, 12], [-10.5, 2], [-9.5, -6], [-6, -10], [-2.5, -10.5]],
  attackB: [[-12, 12], [-2, 11], [4.2, 9.6], [7.4, 8.2], [9.4, 6.2]],
  midA: [[-12, 12], [-4, 6], [2, 2], [1.5, -4], [-2.5, -8]],
  midB: [[-12, 12], [-4, 6], [4, 4], [8, 6], [10.8, 7.8]],
  holdA: [[-6, -8], [4, -8.4], [-2.5, -7], [5.8, -6.6]],
  holdB: [[8, 9.6], [10.6, 6.2], [7.6, 6.8], [11.6, 5.2]],
  roam: [[-9, 0], [0, -3], [8, 3], [2, 8], [-8, 7]],
};

export function createBots(scene, colliders) {
  const bots = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const foeBodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeometry = new THREE.BoxGeometry(0.4, 0.7, 0.32);

  function spawn(team, name, route, weaponId, seedFn) {
  const start = [0, 0];
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, team === 'crew' ? bodyMat : foeBodyMat);
    torso.position.y = 1.06;
    torso.userData = { part: 'torso', bot: null };
    const head = new THREE.Mesh(headGeometry, headMat);
    head.position.y = 1.62;
    head.userData = { part: 'head', bot: null };
    const legs = new THREE.Mesh(legGeometry, legMat);
    legs.position.y = 0.35;
    legs.userData = { part: 'legs', bot: null };
    group.add(torso, head, legs);
    scene.add(group);

    const bot = {
      team, name, group, torso, head, legs,
      position: new THREE.Vector3(start[0], 0, start[1]),
      yaw: 0, health: 100, alive: true,
      route: ROUTES[route] ?? ROUTES.roam,
      waypoint: 1,
      weapon: weaponId,
      cooldown: 0, reloadLeft: 0, mag: WEAPONS[weaponId].mag,
      seen: null, reactTimer: 0, holdTimer: 0,
      hearing: 0, strafePhase: seedFn() * Math.PI * 2,
      kills: 0, deaths: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    legs.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function resetForRound(roles) {
    // roles: { crew: {routeA,routeB,...}, guards: [...] } handled by main; here just respawn.
    for (const bot of bots) {
      bot.health = 100;
      bot.alive = true;
      bot.seen = null;
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reloadLeft = 0;
      bot.cooldown = 0;
      bot.waypoint = 1;
      bot.holdTimer = 0;
    }
  }

  function place(bot, x, z) {
    bot.position.set(x, 0, z);
    bot.group.position.set(x, 0, z);
  }

  return { bots, spawn, resetForRound, place };
}

// One bot's simulation step. It navigates its route, spots enemies by LOS, aims with error,
// fires, and strafes when in a duel. Colliders stop it like they stop the player.
export function stepBot(bot, dt, enemies, colliders, canSee, fireAt, seedFn) {
  if (!bot.alive) return;
  const w = WEAPONS[bot.weapon];

  // --- perception ---
  bot.hearing = Math.max(0, bot.hearing - dt);
  let target = bot.seen;
  if (target && (!target.alive)) { bot.seen = null; target = null; }
  if (!target) {
    for (const foe of enemies) {
      if (!foe.alive) continue;
      const dx = foe.position.x - bot.position.x;
      const dz = foe.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < SPOT_RANGE && canSee(bot, foe)) {
        bot.seen = foe;
        bot.reactTimer = REACTION;
        break;
      }
    }
    target = bot.seen;
  }

  // --- combat ---
  if (target) {
    bot.reactTimer = Math.max(0, bot.reactTimer - dt);
    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    bot.yaw = Math.atan2(-dx, -dz);

    if (bot.reactTimer === 0 && bot.cooldown === 0 && bot.reloadLeft === 0) {
      if (bot.mag <= 0) {
        bot.reloadLeft = w.reload;
      } else if (canSee(bot, target)) {
        bot.mag -= 1;
        bot.cooldown = w.auto ? w.fireGap : w.fireGap * 1.4;
        // aim error grows with distance and shrink as it settles on a target
        const settle = Math.max(0.2, 1 - (bot.strafePhase % 1) * 0.5);
        const err = (0.02 + 0.004 * dist) * settle;
        fireAt(bot, target, err);
      }
    }
  }

  // --- movement ---
  const goal = target ? null : bot.route[Math.min(bot.waypoint, bot.route.length - 1)];
  let wishX = 0;
  let wishZ = 0;
  if (target) {
    // strafe in a duel: side to side, slow
    const side = Math.sin(bot.strafePhase + performance.now() * 0.0012);
    wishX = Math.cos(bot.yaw) * side * 0.8;
    wishZ = -(-Math.sin(bot.yaw)) * side * 0.8;
    bot.strafePhase += dt * 1.6;
  } else if (goal) {
    const gx = goal[0] - bot.position.x;
    const gz = goal[1] - bot.position.z;
    const d = Math.hypot(gx, gz);
    if (d < 0.7) {
      bot.waypoint += 1;
      if (bot.waypoint >= bot.route.length) {
        bot.waypoint = 0;
        bot.holdTimer = HOLD_TIME; // hold the angle at route end
      }
    } else {
      wishX = (gx / d) * SPEED;
      wishZ = (gz / d) * SPEED;
      bot.yaw = Math.atan2(-wishX, -wishZ);
    }
  }
  if (bot.holdTimer > 0 && !target) {
    bot.holdTimer -= dt;
    wishX = 0;
    wishZ = 0;
  }

  bot.cooldown = Math.max(0, bot.cooldown - dt);
  if (bot.reloadLeft > 0) {
    bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
    if (bot.reloadLeft === 0) bot.mag = w.mag;
  }

  // integrate with axis-separated collision like the player
  const nextX = bot.position.x + (wishX * dt);
  if (!blocked(nextX, bot.position.z)) bot.position.x = nextX;
  const nextZ = bot.position.z + (wishZ * dt);
  if (!blocked(bot.position.x, nextZ)) bot.position.z = nextZ;

  bot.group.position.set(bot.position.x, 0, bot.position.z);
  bot.group.rotation.y = bot.yaw;
}

function blocked(x, z) {
  const min = { x: x - RADIUS, y: 0.3, z: z - RADIUS };
  const max = { x: x + RADIUS, y: HEIGHT - 0.3, z: z + RADIUS };
  for (const c of COLLIDER_CACHE) {
    if (max.x > c.min.x && min.x < c.max.x && max.y > c.min.y && min.y < c.max.y && max.z > c.min.z && min.z < c.max.z) return true;
  }
  return false;
}

let COLLIDER_CACHE = [];
export function setColliders(colliders) {
  COLLIDER_CACHE = colliders;
}
