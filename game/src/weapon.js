// Weapons: three guns and a grenade, all hitscan or timed. One view model, stats per gun in
// WEAPONS so bots and the buy menu read the same numbers. main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  skorpion: {
    name: 'SKORPION', price: 0, auto: true, mag: 30, reserve: 90,
    fireGap: 0.075, reload: 1.7, damage: 24, headMult: 3.4,
    spreadStill: 0.006, spreadMoving: 0.03, recoil: 0.006, range: 60,
    desc: 'SMG · free · fast, loose',
  },
  vireo: {
    name: 'VIREO', price: 1200, auto: false, mag: 10, reserve: 30,
    fireGap: 0.42, reload: 2.4, damage: 88, headMult: 2.6,
    spreadStill: 0.0012, spreadMoving: 0.045, recoil: 0.028, range: 90,
    desc: 'bolt rifle · $1200 · one tap',
  },
  lumen: {
    name: 'LUMEN', price: 2000, auto: true, mag: 25, reserve: 75,
    fireGap: 0.1, reload: 2.0, damage: 34, headMult: 3.2,
    spreadStill: 0.0022, spreadMoving: 0.02, recoil: 0.011, range: 80,
    desc: 'battle rifle · $2000 · tight',
  },
};
export const GRENADE = { name: 'FLASHJAR', price: 300, fuse: 1.6, radius: 5.2, damage: 96, count: 2 };

export function createWeapon(camera, id = 'skorpion') {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  const model = new THREE.Group();
  const len = id === 'vireo' ? 0.62 : id === 'lumen' ? 0.5 : 0.4;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.36), grip);
  barrel.position.set(0, 0.025, -len / 2 - 0.16);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.28);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), body);
  sight.position.set(0, 0.09, -0.12);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { id, mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: GRENADE.count };

  function current() {
    return WEAPONS[state.id];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    swapTo(newId) {
      state.id = newId;
      state.mag = WEAPONS[newId].mag;
      state.reserve = WEAPONS[newId].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.kick = 0.045;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current().mag || state.reserve === 0) return;
      state.reloadLeft = current().reload;
    },
    spread(speed) {
      return current().spreadStill + Math.min(1, speed / 5.2) * current().spreadMoving;
    },
    refill() {
      state.mag = current().mag;
      state.reserve = current().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenades = GRENADE.count;
    },
  };
}

// A grenade: a small thrown jar that arcs, bounces, then pops after its fuse.
export function createGrenadeMesh() {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
