// GLASSHOUSE: boot and the one loop — a fixed 60 Hz simulation feeding a render at the
// display's rate. Owns the round state machine (buy → live → planted → over), the economy,
// the bomb, the bots' orchestration and the damage model.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders it
// twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE, createGrenadeMesh } from './weapon.js';
import { createBots, stepBot, setColliders } from './bots.js';
import { createHud, setWeaponTable } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 52);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
setColliders(world.colliders);
const weapon = createWeapon(camera, 'skorpion');
setWeaponTable(WEAPONS);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, world.colliders);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootables = world.shootables;
const direction = new THREE.Vector3();

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;

// — match state —
const ROUNDS_TO_WIN = 7;
const BUY_TIME = 8;
const ROUND_TIME = 115;
const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5.0;
const BOMB_TIME = 40;
const START_FUNDS = 800;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1400;

const match = {
  phase: 'menu',          // menu | buy | live | planted | over
  teamScore: 0,
  foeScore: 0,
  round: 1,
  funds: START_FUNDS,
  timer: BUY_TIME * 1000,
  bomb: { state: 'carried', site: null, pos: null, timer: 0, defusing: 0, mesh: null, light: null },
  playerHP: 100,
  playerAlive: true,
  kills: 0,
  deaths: 0,
};

let holdPlant = 0;
let holdDefuse = 0;
const grenades = [];

// — bot teams —
const CREW_NAMES = ['ASH', 'BRICK', 'CINDER', 'DROSS'];
const GUARD_NAMES = ['GRIM', 'HALO', 'IRIDIUM', 'JACK'];
let crewBots = [];
let guardBots = [];

const playerActor = {
  position: new THREE.Vector3(0, 0, 11),
  health: 100,
  alive: true,
  isPlayer: true,
  name: 'YOU',
};

function spawnTeams() {
  crewBots = [];
  guardBots = [];
  const attackRoutes = ['attackA', 'attackB', 'midA', 'midB'];
  CREW_NAMES.forEach((name, i) => {
    const bot = bots.spawn('crew', name, attackRoutes[i % attackRoutes.length], 'skorpion', random);
    crewBots.push(bot);
  });
  const guardRoutes = ['holdA', 'holdA', 'holdB', 'holdB'];
  GUARD_NAMES.forEach((name, i) => {
    const bot = bots.spawn('guards', name, guardRoutes[i % guardRoutes.length], 'skorpion', random);
    guardBots.push(bot);
  });
}

function canSee(a, b) {
  const from = new THREE.Vector3(a.position.x, 1.5, a.position.z);
  const to = new THREE.Vector3(b.position.x, 1.2, b.position.z);
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 0.2) return true;
  raycaster.set(from, dir.normalize());
  raycaster.far = dist;
  return raycaster.intersectObjects(shootables, false).length === 0;
}

function botHitMeshes() {
  const meshes = [];
  for (const bot of bots.bots) if (bot.alive) meshes.push(bot.torso, bot.head, bot.legs);
  return meshes;
}

function botFire(bot, target, err) {
  const from = new THREE.Vector3(bot.position.x, 1.5, bot.position.z);
  const w = WEAPONS[bot.weapon];
  const dir = new THREE.Vector3(target.position.x - from.x, (target.isPlayer ? 1.5 : 1.2) - from.y, target.position.z - from.z).normalize();
  dir.x += (random() * 2 - 1) * err;
  dir.y += (random() * 2 - 1) * err * 0.4;
  dir.z += (random() * 2 - 1) * err;
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = w.range;
  const hits = raycaster.intersectObjects(shootables.concat(botHitMeshes()), false);
  for (const hit of hits) {
    const ud = hit.object.userData;
    if (ud.bot && ud.bot.team !== bot.team && ud.bot.alive) {
      const dmg = ud.part === 'head' ? w.damage * w.headMult : ud.part === 'legs' ? w.damage * 0.75 : w.damage;
      damageActor(ud.bot, dmg, bot, ud.part === 'head');
      return;
    }
    return; // hit a wall or a body of its own team
  }
}

function damageActor(bot, dmg, killer, headshot) {
  if (!bot.alive) return;
  bot.health -= dmg;
  if (bot.health <= 0) {
    bot.alive = false;
    bot.group.visible = false;
    if (killer === 'player') {
      match.kills += 1;
      match.funds = Math.min(16000, match.funds + KILL_REWARD);
      hud.addKill('YOU', bot.name, headshot);
      hud.hitMarker(true, markerHoldMs);
    } else if (killer && killer.name) {
      hud.addKill(killer.name, bot.name, headshot);
    }
  }
}

function damagePlayer(dmg, killer) {
  if (!match.playerAlive) return;
  match.playerHP -= dmg;
  if (match.playerHP <= 0) {
    match.playerHP = 0;
    match.playerAlive = false;
    match.deaths += 1;
    hud.addKill(killer ? killer.name : 'guard', 'YOU', false);
  }
}

function tryShoot(spread) {
  if (!weapon.takeRound()) {
    weapon.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = WEAPONS[weapon.state.id].range;
  const hits = raycaster.intersectObjects(shootables.concat(botHitMeshes()), false);
  for (const hit of hits) {
    const ud = hit.object.userData;
    if (ud.bot && ud.bot.team === 'guards' && ud.bot.alive) {
      const w = WEAPONS[weapon.state.id];
      const dmg = ud.part === 'head' ? w.damage * w.headMult : ud.part === 'legs' ? w.damage * 0.75 : w.damage;
      damageActor(ud.bot, dmg, 'player', ud.part === 'head');
      hud.hitMarker(!ud.bot.alive, markerHoldMs);
      break;
    }
    break; // hit a wall
  }
  weapon.pullTrigger();
  player.recoil(WEAPONS[weapon.state.id].recoil * (1 + random() * 0.4), (random() * 2 - 1) * WEAPONS[weapon.state.id].recoil * 0.4);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0) return;
  weapon.state.grenades -= 1;
  const mesh = createGrenadeMesh();
  camera.getWorldDirection(direction);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.6);
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.4, 0)),
    fuse: GRENADE.fuse,
  });
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.velocity.y -= 18 * dt;
    const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
    if (next.y < 0.09) {
      next.y = 0.09;
      g.velocity.y = Math.abs(g.velocity.y) * 0.35;
      g.velocity.x *= 0.6;
      g.velocity.z *= 0.6;
    }
    g.mesh.position.copy(next);
    if (g.fuse <= 0) {
      explode(g.mesh.position);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function explode(pos) {
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
    if (d < GRENADE.radius) damageActor(bot, GRENADE.damage * (1 - d / GRENADE.radius), 'player', false);
  }
  const pd = Math.hypot(playerActor.position.x - pos.x, playerActor.position.z - pos.z);
  if (pd < GRENADE.radius * 0.6) damagePlayer(GRENADE.damage * 0.5 * (1 - pd / (GRENADE.radius * 0.6)), null);
  hud.hitMarker(true, markerHoldMs);
}

function plantBomb(site) {
  match.bomb.state = 'planted';
  match.bomb.site = site;
  match.bomb.timer = BOMB_TIME;
  match.bomb.pos = SITES[site].center.clone().setY(0.3);
  match.bomb.mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.18, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.8 }),
  );
  match.bomb.mesh.position.copy(match.bomb.pos);
  scene.add(match.bomb.mesh);
  match.bomb.light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 9, 6, 2);
  match.bomb.light.position.copy(match.bomb.pos).setY(0.8);
  scene.add(match.bomb.light);
  match.phase = 'planted';
  hud.setObjective(`charge planted — site ${site}`);
}

function defuseBomb() {
  match.bomb.state = 'defused';
  if (match.bomb.mesh) scene.remove(match.bomb.mesh);
  if (match.bomb.light) scene.remove(match.bomb.light);
  endRound('guards', 'charge defused');
}

function clearBombVisuals() {
  if (match.bomb.mesh) scene.remove(match.bomb.mesh);
  if (match.bomb.light) scene.remove(match.bomb.light);
  match.bomb = { state: 'carried', site: null, pos: null, timer: 0, defusing: 0, mesh: null, light: null };
}

function nearSite(pos) {
  for (const [name, site] of Object.entries(SITES)) {
    if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) < site.radius) return name;
  }
  return null;
}

function startRound() {
  match.phase = 'buy';
  match.timer = BUY_TIME * 1000;
  match.playerHP = 100;
  match.playerAlive = true;
  clearBombVisuals();
  holdPlant = 0;
  holdDefuse = 0;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  playerActor.position.set(0, 0, 11);
  body.position.set(0, 0, 11);
  body.velocity.set(0, 0, 0);
  weapon.refill();
  bots.resetForRound();
  crewBots.forEach((bot, i) => bots.place(bot, -11 + i * 1.1, 12.4));
  guardBots.forEach((bot, i) => {
    const site = i < 2 ? SITES.A : SITES.B;
    bots.place(bot, site.center.x + (i % 2 ? 2 : -2), site.center.z + 1.8);
  });
  hud.setScore(match.teamScore, match.foeScore, match.round);
  hud.setHealth(100);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(WEAPONS[weapon.state.id].name);
  hud.setFunds(match.funds);
  hud.setObjective('buy phase — B to open the menu');
  hud.clearKillfeed();
  hud.showBuy(match.funds, { gun: weapon.state.id, grenades: weapon.state.grenades }, onBuy);
}

function goLive() {
  hud.hideBuy();
  match.phase = 'live';
  match.timer = ROUND_TIME * 1000;
  hud.setObjective('plant at site A (furnace) or B (racks) — hold E');
}

function endRound(winner, reason) {
  if (match.phase === 'over') return;
  match.phase = 'over';
  const won = winner === 'crew';
  if (won) {
    match.teamScore += 1;
    match.funds = Math.min(16000, match.funds + WIN_REWARD);
  } else {
    match.foeScore += 1;
    match.funds = Math.min(16000, match.funds + LOSS_REWARD);
  }
  hud.setObjective(null);
  hud.setBombHint(null);
  hud.hideBuy();
  const stats = `round <b>${match.round}</b> · ${reason}<br>score <b>${match.teamScore} / ${match.foeScore}</b> · funds <b>$${match.funds}</b> · kills <b>${match.kills}</b>`;
  if (match.teamScore >= ROUNDS_TO_WIN || match.foeScore >= ROUNDS_TO_WIN) {
    hud.showOverlay(match.teamScore >= ROUNDS_TO_WIN ? 'won' : 'lost', stats);
  } else {
    hud.showOverlay(won ? 'roundWon' : 'roundLost', stats);
  }
  if (document.pointerLockElement) document.exitPointerLock();
}

function nextRound() {
  match.round += 1;
  startRound();
}

function onBuy(itemId) {
  if (itemId === 'grenade') {
    if (match.funds >= GRENADE.price) {
      match.funds -= GRENADE.price;
      weapon.state.grenades = Math.min(2, weapon.state.grenades + 2);
    }
  } else {
    const w = WEAPONS[itemId];
    if (match.funds >= w.price && weapon.state.id !== itemId) {
      match.funds -= w.price;
      weapon.swapTo(itemId);
      hud.setWeapon(w.name);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    }
  }
  hud.setFunds(match.funds);
  hud.showBuy(match.funds, { gun: weapon.state.id, grenades: weapon.state.grenades }, onBuy);
}

hud.onPlay(() => {
  if (shot) return;
  if (match.phase === 'menu') {
    startRound();
  } else if (match.phase === 'over') {
    if (match.teamScore >= ROUNDS_TO_WIN || match.foeScore >= ROUNDS_TO_WIN) {
      match.teamScore = 0;
      match.foeScore = 0;
      match.round = 0;
      match.funds = START_FUNDS;
      match.kills = 0;
      match.deaths = 0;
    }
    nextRound();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (match.phase !== 'menu' && match.phase !== 'over') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function step(dt) {
  if (match.phase === 'menu' || match.phase === 'over') return;
  match.timer -= dt * 1000;

  if (match.phase === 'buy' && match.timer <= 0) goLive();
  if (match.phase === 'live' && match.timer <= 0) {
    endRound('guards', 'time expired');
    return;
  }

  if (match.playerAlive) {
    player.step(dt, input.state.keys);
    weapon.step(dt);
    playerActor.position.copy(body.position);
  }

  const wDef = WEAPONS[weapon.state.id];
  if (input.state.firing && weapon.ready() && match.playerAlive && match.phase !== 'buy' && (wDef.auto || input.state.fireEdge)) {
    tryShoot(weapon.spread(player.groundSpeed()));
  }

  const crewEnemies = guardBots.filter((g) => g.alive);
  const guardEnemies = [...(match.playerAlive ? [playerActor] : []), ...crewBots.filter((g) => g.alive)];
  for (const bot of crewBots) if (bot.alive) stepBot(bot, dt, crewEnemies, canSee, botFire, random);
  for (const bot of guardBots) if (bot.alive) stepBot(bot, dt, guardEnemies, canSee, botFire, random);

  if (match.phase === 'live' && match.playerAlive) {
    const site = nearSite(body.position);
    if (site && input.state.keys.has('KeyE')) {
      holdPlant += dt;
      hud.setBombHint(`planting… ${(Math.max(0, PLANT_TIME - holdPlant)).toFixed(1)}s`);
      if (holdPlant >= PLANT_TIME) {
        plantBomb(site);
        hud.setBombHint(null);
      }
    } else {
      holdPlant = Math.max(0, holdPlant - dt * 2);
      hud.setBombHint(site ? 'hold <kbd>E</kbd> to plant' : null);
    }
  } else if (match.phase === 'planted') {
    match.bomb.timer -= dt;
    const blink = 1 + Math.sin(match.bomb.timer * Math.PI * 4) * 0.5;
    if (match.bomb.light) match.bomb.light.intensity = 9 * blink;
    if (match.bomb.timer <= 0) {
      if (match.bomb.mesh) scene.remove(match.bomb.mesh);
      if (match.bomb.light) scene.remove(match.bomb.light);
      endRound('crew', 'the furnace charge blew');
      return;
    }
    if (match.playerAlive && match.bomb.pos && nearSite(body.position) === match.bomb.site) {
      if (input.state.keys.has('KeyE')) {
        holdDefuse += dt;
        hud.setBombHint(`defusing… ${(Math.max(0, DEFUSE_TIME - holdDefuse)).toFixed(1)}s`);
        if (holdDefuse >= DEFUSE_TIME) {
          defuseBomb();
          return;
        }
      } else {
        holdDefuse = Math.max(0, holdDefuse - dt * 2);
        hud.setBombHint('hold <kbd>E</kbd> to defuse');
      }
    } else {
      hud.setBombHint(null);
    }
    for (const bot of guardBots) {
      if (!bot.alive || !match.bomb.pos) continue;
      const d = Math.hypot(bot.position.x - match.bomb.pos.x, bot.position.z - match.bomb.pos.z);
      if (d < 2.0) {
        match.bomb.defusing += dt;
        if (match.bomb.defusing > 7) {
          defuseBomb();
          return;
        }
      }
    }
  }

  stepGrenades(dt);

  const crewAlive = crewBots.some((b) => b.alive) || match.playerAlive;
  const guardsAlive = guardBots.some((b) => b.alive);
  if (match.phase === 'live' || match.phase === 'planted') {
    if (!guardsAlive) endRound('crew', match.phase === 'planted' ? 'guards down — charge held' : 'guards eliminated');
    else if (!crewAlive) endRound('guards', 'crew eliminated');
  }

  hud.setTimer(match.phase === 'buy' ? Math.max(0, match.timer) : match.phase === 'planted' ? Math.max(0, match.bomb.timer * 1000) : Math.max(0, match.timer));
  hud.setHealth(match.playerHP);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    if (!shot) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      if (input.consumeBuyToggle()) {
        if (hud.isBuyOpen()) hud.hideBuy();
        else if (match.phase === 'buy') hud.showBuy(match.funds, { gun: weapon.state.id, grenades: weapon.state.grenades }, onBuy);
      }
      if (input.consumeGrenade()) throwGrenade();
      if (input.state.keys.has('KeyR')) weapon.reload();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    match.phase = 'live';
    match.timer = ROUND_TIME * 1000;
    body.position.set(0, 0, 11);
    settle(20);
    body.yaw = 0.1;
    body.pitch = 0.05;
    hud.setObjective('plant at site A (furnace) or B (racks) — hold E');
  } else if (name === 'play') {
    match.phase = 'live';
    match.timer = 62000;
    body.position.set(-2, 0, 6);
    settle(30);
    body.yaw = 0.2;
    body.pitch = -0.02;
    hud.setObjective('plant at site A (furnace) or B (racks) — hold E');
    bots.place(guardBots[0], 3.0, -1.6);
    hud.addKill('YOU', 'GRIM', true);
    hud.setHealth(76);
    hud.setAmmo(22, 68);
  } else if (name === 'end') {
    match.phase = 'planted';
    plantBomb('A');
    match.bomb.timer = 14;
    body.position.set(-4, 0, -5);
    settle(20);
    body.yaw = -0.35;
    body.pitch = 0.1;
    hud.setObjective('charge planted — site A');
    hud.setTimer(14000);
    hud.setHealth(58);
    hud.addKill('BRICK', 'HALO', false);
    hud.setAmmo(17, 51);
  }
  hud.setScore(3, 2, 4);
  hud.setFunds(match.funds);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastTime = performance.now();
let accumulator = 0;
let frozen = false;

spawnTeams();
hud.setWeapon(WEAPONS.skorpion.name);
hud.setFunds(match.funds);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
