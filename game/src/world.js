// GLASSHOUSE: the map. A glassworks floor at night — two bomb sites (A: the furnace, B: the
// annealing racks), three lanes (furnace hall, mid kiln row, loading dock), crates, glass
// partitions, a catwalk. Every box is a collider for players and bots and a surface a bullet
// stops on. Plain geometry only, no models, no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { center: new THREE.Vector3(0, 0, -9.5), radius: 2.6 },
  B: { center: new THREE.Vector3(9.2, 0, 7.4), radius: 2.6 },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Glass partitions: translucent panels you can see targets through, bullets stop on them.
  materials.glass = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#26333d'), roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.42,
  });
  // The furnace: emissive amber, the map's light anchor and bomb site A's centrepiece.
  materials.furnace = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7a4a12'), roughness: 0.8,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.55,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // A 30 x 30 m floor, 5 m walls, open-top factory: one cold moonlight key + furnace glow.
  box(30.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 30.4, -15.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 15.2, 2.5, 0, 'surface');
  box(30.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(30.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // — Site A: the furnace hall (north). Long hall, pillar cover, ingot crates, catwalk over its mouth.
  box(4.4, 2.6, 3.2, 0, 1.3, -9.5, 'furnace');
  box(2.0, 0.7, 2.0, -4.6, 0.35, -11.0, 'hairline');
  box(2.0, 0.7, 2.0, 4.6, 0.35, -11.0, 'hairline');
  box(2.6, 1.15, 1.2, -6.2, 0.575, -7.6, 'hairline');
  box(2.6, 1.15, 1.2, 6.2, 0.575, -7.6, 'hairline');
  box(1.4, 2.6, 0.5, -9.8, 1.3, -9.5, 'surface');
  box(1.4, 2.6, 0.5, 9.8, 1.3, -9.5, 'surface');
  box(9.0, 0.35, 2.2, 0, 2.1, -4.0, 'hairline');                    // catwalk
  box(0.9, 1.2, 0.9, -5.6, 0.6, -2.6, 'hairline');                  // step crates up to it
  box(0.9, 1.55, 0.9, -5.6, 0.775, -3.4, 'hairline');

  // — Mid: the kiln row, a long staggered sightline broken by the lehr.
  box(2.0, 1.4, 2.0, -3.0, 0.7, -1.6, 'surface');
  box(2.0, 1.4, 2.0, 3.0, 0.7, -1.6, 'surface');
  box(2.4, 1.9, 2.4, 0, 0.95, 1.4, 'hairline');
  box(1.2, 0.8, 3.2, -7.4, 0.4, 2.2, 'hairline');
  box(1.2, 0.8, 3.2, 7.4, 0.4, 2.2, 'hairline');
  box(0.18, 2.6, 4.2, 4.9, 1.3, 5.4, 'glass');                      // glass wall with a 0.9 m gap
  box(0.18, 2.6, 2.2, 4.9, 1.3, 9.9, 'glass');

  // — Site B: the annealing racks (south-east), corner pillar, packing bench.
  box(1.6, 2.2, 1.6, 9.2, 1.1, 7.4, 'accent');
  box(1.6, 0.9, 1.6, 7.2, 0.45, 9.6, 'hairline');
  box(1.6, 0.9, 1.6, 11.4, 0.45, 5.6, 'hairline');
  box(3.4, 1.15, 1.2, 9.2, 0.575, 10.8, 'hairline');
  box(1.4, 2.6, 0.5, 12.6, 1.3, 8.6, 'surface');

  // — West: loading dock stacks and cullet bins, the flanking lane.
  box(2.8, 1.4, 2.0, -9.6, 0.7, 8.0, 'hairline');
  box(2.0, 1.15, 2.0, -10.6, 0.575, -2.8, 'hairline');
  box(2.0, 1.7, 2.0, -10.6, 0.85, -4.9, 'hairline');

  // Lighting: cold moonlight key, faint sky fill, the furnace's glow, a work lamp over site B.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.0);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#cfd8e8'), 1.6);
  key.position.set(10, 16, 9);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.far = 52;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.4);
  fill.position.set(-8, 9, 10);
  scene.add(fill);
  const furnaceGlow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 16, 1.8);
  furnaceGlow.position.set(0, 2.4, -8.2);
  scene.add(furnaceGlow);
  const bLamp = new THREE.PointLight(new THREE.Color(PALETTE.ink), 7, 10, 2);
  bLamp.position.set(9.2, 3.4, 7.4);
  scene.add(bLamp);

  return { colliders, shootables, group };
}
