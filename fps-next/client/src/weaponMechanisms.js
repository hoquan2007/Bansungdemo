// Optional independently articulated props for otherwise one-piece weapon meshes.
// These are *supplemental geometry*, not separated polygons from the source mesh.
// Source meshes remain untouched; M4A1 and Chassis sniper have actual authored rigs.
import * as THREE from 'three';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

function addPart(parent, geometry, material, position, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.visible = false;
  mesh.castShadow = false; // first-person weapon pass never renders shadows
  parent.add(mesh);
  return mesh;
}

/** Create once, after a detailed one-piece gun model has been fitted. */
export function createSupplementalWeaponRig(model, weapon) {
  if (weapon.type === 'melee') return null;
  const group = model.group;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(weapon.viewColor).multiplyScalar(1.65),
    metalness: 0.44,
    roughness: 0.57,
  });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb59460, metalness: 0.72, roughness: 0.38 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x303a42, metalness: 0.7, roughness: 0.43 });
  const rig = { group, magazine: null, mechanism: null, shell: null, kind: weapon.type,
    weaponId: weapon.id };

  if (weapon.id === 'revolver') {
    // Speedloader: the actual revolver cylinder is baked into its OBJ mesh.
    const loader = new THREE.Group();
    loader.position.set(0.008, -0.075, -0.005);
    loader.visible = false;
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3;
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.048, 6), brass);
      round.rotation.x = Math.PI / 2;
      round.position.set(Math.cos(angle) * 0.024, Math.sin(angle) * 0.024, 0);
      loader.add(round);
    }
    group.add(loader);
    rig.magazine = loader;
    rig.magRest = loader.position.clone();
    rig.kind = 'speedloader';
  } else if (weapon.type === 'shotgun') {
    const shell = new THREE.Group();
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.063, 8),
      new THREE.MeshStandardMaterial({ color: 0x8c2a22, roughness: 0.63 }));
    casing.rotation.x = Math.PI / 2;
    shell.add(casing);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8), brass);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.032;
    shell.add(base);
    shell.position.set(0.04, -0.15, 0.03);
    shell.visible = false;
    group.add(shell);
    rig.shell = shell;
    rig.shellRest = shell.position.clone();
    rig.kind = weapon.id === 'sawnoff' ? 'break-action'
      : weapon.id === 'autoshotgun' ? 'semi-auto' : 'pump';
  } else if (model.moving.mag) {
    const part = model.moving.mag;
    // Reuse the fallback's size, scaled for the particular gun. Only one spare
    // is visible away from the magazine well while a reload is underway.
    const spare = addPart(group, part.mesh.geometry, material,
      part.rest.toArray(), 'SupplementalReloadMagazine');
    rig.magazine = spare;
    rig.magRest = spare.position.clone();
  }

  // A semi-auto cycles its bolt, and a revolver rotates its cylinder: neither
  // should receive a fake pump or reciprocating pistol slide.
  const original = ['autoshotgun', 'revolver'].includes(weapon.id)
    ? null : model.moving.pump ?? model.moving.bolt;
  if (weapon.id === 'revolver') {
    // Separate ejector rod is shown while opening/reloading the (baked) cylinder.
    rig.mechanism = addPart(group, new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8),
      metal, [0.045, 0.012, -0.085], 'SupplementalRevolverEjector');
    rig.kind = 'speedloader';
  } else if (weapon.id === 'sawnoff') {
    // A narrow hinge lever only; the barrel itself is fused to the imported OBJ.
    rig.mechanism = addPart(group, new THREE.BoxGeometry(0.07, 0.022, 0.028),
      metal, [0, -0.02, -0.04], 'SupplementalBreechLatch');
  } else if (original) {
    rig.mechanism = addPart(group, original.mesh.geometry, metal,
      original.rest.toArray(), 'SupplementalAction');
  } else if (weapon.id === 'autoshotgun' ||
    (weapon.id !== 'revolver' && ['pistol', 'smg', 'rifle', 'sniper', 'lmg'].includes(weapon.type))) {
    // A narrow moving cap depicts the slide/bolt travel without covering the
    // detailed receiver. It is hidden the rest of the time.
    const isPistol = weapon.type === 'pistol';
    const size = isPistol ? [0.052, 0.014, 0.13] : [0.036, 0.017, 0.09];
    const pos = isPistol ? [0, 0.058, -0.11] : [0.053, 0.06, 0.005];
    rig.mechanism = addPart(group, new THREE.BoxGeometry(...size), metal,
      pos, isPistol ? 'SupplementalPistolSlide' : 'SupplementalChargingHandle');
  }
  if (rig.mechanism) {
    rig.mechanismRest = rig.mechanism.position.clone();
    rig.mechanismRotation = rig.mechanism.rotation.clone();
  }
  return rig;
}

/** Poses depend only on current progress and last shot, so interruptions reset. */
export function poseSupplementalWeaponRig(rig, progress, now, lastShotAt, magazineSize = 1) {
  if (!rig) return;
  const reloading = progress > 0 && progress < 1;
  if (rig.magazine) {
    rig.magazine.position.copy(rig.magRest);
    rig.magazine.rotation.set(0, 0, 0);
    rig.magazine.visible = false;
    if (reloading && progress > 0.27 && progress < 0.73) {
      // The visible prop follows a removed/spare magazine away from the well.
      // At the insertion point the unmodified source mesh stays authoritative.
      const travel = progress < 0.48 ? smooth((progress - 0.27) / 0.21)
        : 1 - smooth((progress - 0.48) / 0.25);
      rig.magazine.visible = true;
      rig.magazine.position.y -= travel * (rig.kind === 'speedloader' ? 0.13 : 0.23);
      rig.magazine.position.x += travel * 0.065;
      rig.magazine.rotation.z = travel * (rig.kind === 'speedloader' ? 0.28 : 0.35);
    }
  }
  if (rig.shell) {
    rig.shell.position.copy(rig.shellRest);
    rig.shell.visible = false;
    if (reloading && progress > 0.14 && progress < 0.94) {
      const count = Math.max(1, Math.min(8, magazineSize));
      const cycle = ((progress - 0.14) / 0.8 * count) % 1;
      // Each shell enters at the loading port once per chamber cycle.
      rig.shell.visible = cycle > 0.1 && cycle < 0.9;
      rig.shell.position.y += smooth(cycle) * 0.1;
      rig.shell.position.z -= smooth(cycle) * 0.12;
    }
  }
  if (rig.mechanism) {
    rig.mechanism.position.copy(rig.mechanismRest);
    rig.mechanism.rotation.copy(rig.mechanismRotation);
    rig.mechanism.visible = false;
    const age = now - lastShotAt;
    if (rig.weaponId === 'sawnoff' && reloading && progress > 0.13 && progress < 0.93) {
      const open = Math.min(smooth((progress - 0.13) / 0.22),
        1 - smooth((progress - 0.73) / 0.2));
      rig.mechanism.rotation.x -= open * 0.48;
      rig.mechanism.visible = open > 0.001;
    } else if (rig.weaponId === 'revolver' && reloading && progress > 0.19 && progress < 0.77) {
      const extraction = Math.min(smooth((progress - 0.19) / 0.2),
        1 - smooth((progress - 0.60) / 0.17));
      rig.mechanism.position.z += 0.07 * extraction;
      rig.mechanism.visible = extraction > 0.001;
    } else if (reloading && rig.weaponId !== 'sawnoff' &&
      rig.weaponId !== 'revolver' && progress > 0.8 && progress < 0.98) {
      const t = (progress - 0.8) / 0.18;
      rig.mechanism.position.z += Math.sin(Math.PI * t) * 0.085;
      rig.mechanism.visible = true;
    } else if (!reloading && rig.weaponId !== 'sawnoff' &&
      rig.weaponId !== 'revolver' && Number.isFinite(age) && age >= 0 && age < 320) {
      rig.mechanism.position.z += Math.sin(Math.PI * age / 320) * 0.09;
      rig.mechanism.visible = true;
    }
  }
}
