// Actual polygon islands extracted from Quaternius source OBJs. The original
// part disappears from the static body because each source face is in exactly
// one mesh. Source vertices, normals and material IDs stay unchanged.
import * as THREE from 'three';

export const SOURCE_WEAPON_RIGS = Object.freeze({
  pistol: { stem: 'Pistol', format: 'gltf', axis: 1, parts: ['Slide'] },
  smg: { stem: 'SMG', format: 'gltf', axis: 1, parts: ['Magazine'] },
  shotgun: { stem: 'Shotgun', format: 'gltf', axis: 1, parts: ['Pump'] },
  lmg: { stem: 'ShortCannon', format: 'gltf', axis: 1, parts: ['Barrel'] },
  dmr: { stem: 'Sniper_2', format: 'gltf', axis: 1, parts: ['Magazine'] },
  revolver: { stem: 'Revolver_1', parts: ['Cylinder'] },
  machinepistol: { stem: 'Pistol_4', parts: ['Slide'] },
  smg_compact: { stem: 'SubmachineGun_3', parts: ['Magazine'] },
  smg_heavy: { stem: 'SubmachineGun_5', parts: ['Magazine'] },
  carbine: { stem: 'AssaultRifle2_1', parts: ['Magazine'] },
  bullpup: { stem: 'Bullpup_1', parts: ['Magazine'] },
  sawnoff: { stem: 'Shotgun_SawedOff', parts: ['Barrels'] },
  autoshotgun: { stem: 'Shotgun_ShortStock', parts: ['Pump'] },
  antimateriel: { stem: 'SniperRifle_6', parts: ['Bolt'] },
});

const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** Pivot real source geometry around a reviewed local rest point, with no jump. */
export function createSourceWeaponRig(fitted, weaponId) {
  const definition = SOURCE_WEAPON_RIGS[weaponId];
  if (!definition) return null;
  const entries = [];
  // Check the whole rig before changing the hierarchy so missing/incomplete
  // exports can fall through to the original unrigged asset.
  for (const name of definition.parts) {
    const mesh = fitted.getObjectByName(`Rig${name}`);
    // Multi-primitive glTF nodes arrive as Groups; OBJ parts arrive as Meshes.
    if ((!mesh?.isMesh && !mesh?.isGroup) || !mesh.parent) return null;
    fitted.updateMatrixWorld(true);
    const parentInverse = mesh.parent.matrixWorld.clone().invert();
    const bounds = new THREE.Box3().makeEmpty();
    const transform = new THREE.Matrix4();
    mesh.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox?.isEmpty()) {
        transform.multiplyMatrices(parentInverse, child.matrixWorld);
        bounds.union(child.geometry.boundingBox.clone().applyMatrix4(transform));
      }
    });
    if (bounds.isEmpty()) return null;
    const center = bounds.getCenter(new THREE.Vector3());
    if (name === 'Barrels') {
      // Sawn-off receiver hinge is near the *base* of its forward-facing pair
      // of barrels, rather than their center of mass.
      center.x = bounds.min.x + 0.025;
      center.y = bounds.min.y + 0.05;
    }
    entries.push({ name, mesh, center });
  }

  const parts = {};
  for (const { name, mesh, center } of entries) {
    const parent = mesh.parent;
    const pivot = new THREE.Group();
    pivot.name = `SourcePivot${name}`;
    pivot.position.copy(center);
    parent.add(pivot);
    pivot.add(mesh);
    // Preserve the original parent-relative transform for OBJ and glTF nodes.
    mesh.position.sub(center);
    parts[name] = { pivot, restPosition: pivot.position.clone(),
      restRotation: pivot.rotation.clone(), mesh };
  }
  return { weaponId, axis: definition.axis ?? -1, parts,
    separatedParts: Object.keys(parts) };
}

/** Stateless part poses reset fully even when a reload is interrupted. */
export function poseSourceWeaponRig(rig, progress, now, lastShotAt) {
  if (!rig) return;
  const reloading = progress > 0 && progress < 1;
  const age = now - lastShotAt;
  const shot = !reloading && Number.isFinite(age) && age >= 0 && age < 210
    ? Math.sin(Math.PI * age / 210) : 0;
  for (const [name, part] of Object.entries(rig.parts)) {
    const { pivot } = part;
    pivot.position.copy(part.restPosition);
    pivot.rotation.copy(part.restRotation);
    if (name === 'Magazine') {
      const travel = reloading
        ? smooth((progress - 0.14) / 0.24) * (1 - smooth((progress - 0.62) / 0.24)) : 0;
      pivot.position.y -= 0.34 * travel;
      pivot.position.x += 0.07 * travel;
      pivot.rotation.z -= 0.14 * travel;
    } else if (name === 'Slide') {
      const reloadCycle = reloading && progress >= 0.8 && progress <= 0.97
        ? Math.sin(Math.PI * (progress - 0.8) / 0.17) : 0;
      pivot.position.x += rig.axis * 0.22 * Math.max(shot, reloadCycle);
    } else if (name === 'Pump' || name === 'Bolt') {
      const reloadCycle = reloading && progress >= 0.74 && progress <= 0.97
        ? Math.sin(Math.PI * (progress - 0.74) / 0.23) : 0;
      const pull = Math.max(shot, reloadCycle);
      pivot.position.x += rig.axis * (name === 'Pump' && rig.axis === 1 ? 0.19
        : name === 'Pump' ? 0.42 : 0.27) * pull;
      if (name === 'Bolt') pivot.rotation.x += pull * 0.12;
    } else if (name === 'Barrel') {
      // The Toon ShortCannon has a genuine detachable barrel island but no
      // independent magazine geometry. Use a subtle barrel recoil instead.
      const reloadCycle = reloading && progress >= 0.82 && progress <= 0.96
        ? Math.sin(Math.PI * (progress - 0.82) / 0.14) : 0;
      pivot.position.x += rig.axis * 0.075 * Math.max(shot, reloadCycle);
    } else if (name === 'Cylinder') {
      const travel = reloading
        ? smooth((progress - 0.15) / 0.23) * (1 - smooth((progress - 0.66) / 0.22)) : 0;
      pivot.position.z += 0.24 * travel;
      pivot.rotation.x += (Math.PI / 3) * shot + travel * 0.2;
    } else if (name === 'Barrels') {
      const open = reloading
        ? smooth((progress - 0.12) / 0.24) * (1 - smooth((progress - 0.67) / 0.24)) : 0;
      pivot.rotation.z -= open * 0.54;
    }
  }
}
