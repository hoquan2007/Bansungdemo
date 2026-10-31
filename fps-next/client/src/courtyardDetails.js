// Low-cost architectural accents for Courtyard's existing 4m facade bays.
// Everything here is decoration. Collision, visibility and combat cover stay
// entirely in shared/maps/courtyard.js and on the authoritative server.
import * as THREE from 'three';

const INNER_WALL = 29.82;
const SIDES = [
  { axis: 'z', edge: -INNER_WALL, yaw: 0 },
  { axis: 'z', edge: INNER_WALL, yaw: Math.PI },
  { axis: 'x', edge: -INNER_WALL, yaw: Math.PI / 2 },
  { axis: 'x', edge: INNER_WALL, yaw: -Math.PI / 2 },
];

function instancedBoxes(name, placements, color, metalness = 0) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color, metalness, roughness: metalness ? 0.72 : 0.91,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.castShadow = false; // Tiny detail must not multiply the shadow pass.
  mesh.receiveShadow = true;
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  placements.forEach(({ side, along, y, inset, width, height, depth, shade = 1 }, index) => {
    // Positive inset always points into the playable arena, regardless of side.
    const inward = side.edge < 0 ? 1 : -1;
    transform.position.set(
      side.axis === 'x' ? side.edge + inward * inset : along,
      y,
      side.axis === 'z' ? side.edge + inward * inset : along,
    );
    transform.rotation.set(0, side.yaw, 0);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    tint.setScalar(shade);
    mesh.setColorAt(index, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Courtyard's 60m perimeter gains masonry relief and restrained lanterns. */
export function createCourtyardDetails() {
  const group = new THREE.Group();
  group.name = 'courtyard-architectural-details';
  const columns = [];
  const courses = [];
  const plinths = [];
  const lanternFrames = [];
  const lanternGlass = [];

  SIDES.forEach((side, face) => {
    // Every interior seam of the 15 facade modules gets one continuous pilaster.
    // This avoids splitting a wall's 7m silhouette with visible gaps.
    for (let seam = 0; seam < 14; seam++) {
      columns.push({
        side, along: -26 + seam * 4, y: 3.5,
        inset: 0.28, width: 0.36, height: 6.96, depth: 0.36,
        shade: 0.89 + ((seam + face * 3) % 5) * 0.022,
      });
    }
    courses.push(
      { side, along: 0, y: 3.52, inset: 0.32, width: 59.6, height: 0.23, depth: 0.48, shade: 0.94 },
      { side, along: 0, y: 6.88, inset: 0.35, width: 59.6, height: 0.28, depth: 0.57, shade: 0.97 },
    );
    plinths.push({ side, along: 0, y: 0.22, inset: 0.27, width: 59.6, height: 0.44, depth: 0.45 });

    // Decorative, unlit lanterns: bright glass, with no per-lantern point lights.
    // Fixtures stay within 0.7m of the existing solid perimeter.
    for (const along of [-20, -8, 4, 16]) {
      lanternFrames.push({ side, along, y: 2.84, inset: 0.48, width: 0.33, height: 0.42, depth: 0.28 });
      lanternGlass.push({ side, along, y: 2.85, inset: 0.64, width: 0.18, height: 0.26, depth: 0.035 });
    }
  });

  group.add(
    instancedBoxes('courtyard-stone-pilasters', columns, 0xbca68b),
    instancedBoxes('courtyard-stringcourses-and-cornices', courses, 0xd1b79a),
    instancedBoxes('courtyard-stone-plinths', plinths, 0x857967),
    instancedBoxes('courtyard-lantern-frames', lanternFrames, 0x363d3e, 0.46),
    instancedBoxes('courtyard-lantern-glass', lanternGlass, 0xf0b96e),
  );
  // Glass stays legible under daylight but doesn't cast misleading illumination.
  const glass = group.getObjectByName('courtyard-lantern-glass');
  glass.material.emissive = new THREE.Color(0x8a4215);
  glass.material.emissiveIntensity = 0.5;
  return group;
}

export function disposeCourtyardDetails(group) {
  if (!group) return;
  for (const child of group.children) {
    child.geometry?.dispose();
    child.material?.dispose();
  }
}
