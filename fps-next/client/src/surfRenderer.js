import * as THREE from 'three';
import { SURF_THEMES, makeRampTexture, makeGateSign, addSurfEnvironment } from './surfVisuals.js';

// The surf course uses real sloped triangles, independent of the multiplayer
// maps' axis-aligned collision solids. Every vertex derives from surf.segments.
export function createSurfCourse(scene, course) {
  const group = new THREE.Group();
  group.name = 'surf-course';
  const colors = course.colors ?? [0x1f8791, 0x2f9da6, 0x27798e, 0x2499a3];
  const theme = course.segments.length > 4 ? SURF_THEMES.utopia : SURF_THEMES.boreas;
  group.userData.ownedTextures = [];
  const rampTexture = makeRampTexture(theme);
  group.userData.ownedTextures.push(rampTexture);
  addSurfEnvironment(group, course, theme);

  // Original paint on the actual spawn/finish pads. Flat geometry follows the
  // authoritative collision coordinates but never participates in collision.
  const paintPad = (pad, start) => {
    if (!pad) return;
    const width = pad.maxX - pad.minX;
    const depth = pad.maxZ - pad.minZ;
    const midX = (pad.minX + pad.maxX) / 2;
    const midZ = (pad.minZ + pad.maxZ) / 2;
    const flat = (x, z, w, d, color, level = 0.045) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, pad.y + level, z);
      mesh.renderOrder = 2;
      group.add(mesh);
    };
    const line = theme.name === 'UTOPIA' ? 0xea5779 : 0x73f5f1;
    const stripeLength = Math.max(1, depth - 2.3);
    flat(midX - width * 0.22, midZ, 0.14, stripeLength, line);
    flat(midX + width * 0.22, midZ, 0.14, stripeLength, line);
    flat(midX, start ? pad.minZ + 1.35 : pad.maxZ - 1.35,
      width * 0.7, 0.18, 0xffe9f4, 0.055);
  };
  paintPad(course.startPad, true);
  paintPad(course.finishPad, false);

  const beam = (from, to, radius, color, emissive = 0) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8),
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.8 : 0, metalness: 0.2, roughness: 0.45 }),
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    group.add(mesh);
  };

  for (const [index, segment] of course.segments.entries()) {
    const [ax, ay, az] = segment.from;
    const [bx, by, bz] = segment.to;
    const length = Math.hypot(bx - ax, bz - az);
    const sx = -(bz - az) / length;
    const sz = (bx - ax) / length;
    for (const sign of [-1, 1]) {
      const w = segment.halfWidth * sign;
      const vertices = new Float32Array([
        ax, ay, az,
        ax + sx * w, ay + segment.bankRise, az + sz * w,
        bx + sx * w, by + segment.bankRise, bz + sz * w,
        bx, by, bz,
      ]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        0, 0, 1, 0, 1, length / 9, 0, length / 9,
      ], 2));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        map: rampTexture, color: 0xffffff, side: THREE.DoubleSide,
        metalness: 0.08, roughness: 0.68,
      }));
      mesh.receiveShadow = true;
      group.add(mesh);
      // A structural skirt thickens the bank at its outer edge, without adding
      // any invisible collisions or changing the physics triangles.
      const skirt = new THREE.BufferGeometry();
      const outerA = [ax + sx * w, ay + segment.bankRise, az + sz * w];
      const outerB = [bx + sx * w, by + segment.bankRise, bz + sz * w];
      skirt.setAttribute('position', new THREE.Float32BufferAttribute([
        ...outerA, outerA[0], outerA[1] - 1.8, outerA[2],
        outerB[0], outerB[1] - 1.8, outerB[2], ...outerB,
      ], 3));
      skirt.setIndex([0, 1, 2, 0, 2, 3]);
      skirt.computeVertexNormals();
      const skirtMesh = new THREE.Mesh(skirt, new THREE.MeshStandardMaterial({
        color: theme.trim, metalness: 0.72, roughness: 0.42, side: THREE.DoubleSide,
      }));
      group.add(skirtMesh);
      beam(
        [outerA[0], outerA[1] + 0.06, outerA[2]],
        [outerB[0], outerB[1] + 0.06, outerB[2]],
        0.11, theme.steel,
      );
      beam(
        [ax + sx * w * 0.78, ay + segment.bankRise * 0.78 + 0.07, az + sz * w * 0.78],
        [bx + sx * w * 0.78, by + segment.bankRise * 0.78 + 0.07, bz + sz * w * 0.78],
        0.035, theme.accent, theme.glow,
      );
    }
    beam([ax, ay + 0.04, az], [bx, by + 0.04, bz], 0.075, theme.steel);
    // Short metallic cross bars make longitudinal speed legible at a glance.
    for (let t = 0.2; t < 1; t += 0.2) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      beam([x - sx * 1.05, y + 0.025, z - sz * 1.05],
        [x + sx * 1.05, y + 0.025, z + sz * 1.05], 0.024, theme.steel);
    }
  }

  // Checkpoint archways must cross the travel direction. A global-X arch
  // looks sideways on every bank that turns, so derive its cross vector from
  // the actual segment containing the checkpoint.
  const arches = course.checkpoints.map((point, gate) => ({
    pos: point.pos, index: Math.floor(point.progress), number: gate + 1, color: theme.accent,
  }));
  const end = course.segments.at(-1).to;
  arches.push({ pos: end, index: course.segments.length - 1,
    number: arches.length + 1, color: 0xf2c378, finish: true });
  for (const { pos, index, color, number, finish } of arches) {
    const segment = course.segments[index];
    const dx = segment.to[0] - segment.from[0];
    const dz = segment.to[2] - segment.from[2];
    const length = Math.hypot(dx, dz);
    const sideways = [-dz / length, dx / length];
    const half = segment.halfWidth * 0.82;
    const rise = segment.bankRise * half / segment.halfWidth;
    const left = [pos[0] - sideways[0] * half, pos[1] + rise, pos[2] - sideways[1] * half];
    const right = [pos[0] + sideways[0] * half, pos[1] + rise, pos[2] + sideways[1] * half];
    const top = 8.8;
    beam(left, [left[0], left[1] + top, left[2]], 0.3, theme.steel);
    beam(right, [right[0], right[1] + top, right[2]], 0.3, theme.steel);
    beam([left[0], left[1] + top, left[2]], [right[0], right[1] + top, right[2]], 0.32, theme.steel);
    beam([left[0], left[1] + top - 0.48, left[2]],
      [right[0], right[1] + top - 0.48, right[2]], 0.062, color, color);
    const signTexture = makeGateSign(theme, number, finish);
    group.userData.ownedTextures.push(signTexture);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(half * 1.55, 15), 2.1),
      new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide }),
    );
    panel.position.set(pos[0], pos[1] + rise + top + 1.15, pos[2]);
    panel.rotation.y = Math.atan2(-dx, -dz);
    group.add(panel);
  }

  scene.add(group);
  return group;
}

export function disposeSurfCourse(scene, group) {
  if (!group) return;
  scene.remove(group);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  for (const texture of group.userData.ownedTextures ?? []) texture.dispose();
}
