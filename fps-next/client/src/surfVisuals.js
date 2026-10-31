import * as THREE from 'three';

// All graphics here are original procedural assets; the physical course is
// defined exclusively in shared/maps and never depends on these decorations.
export const SURF_THEMES = {
  boreas: {
    name: 'BOREAS', accent: 0x70f4f4, steel: 0x416678, trim: 0x6b8795,
    terrain: 0xc0d9e3, distance: 0x84abbf, glow: 0x7ee8ea,
    ramp: ['#d5eef0', '#9ec9d8', '#c1e0e5'],
  },
  utopia: {
    name: 'UTOPIA', accent: 0xff5a72, steel: 0xab527d, trim: 0xb095c8,
    terrain: 0xeac3e6, distance: 0xb49bce, glow: 0xfc7188,
    ramp: ['#ffdeea', '#e1c6f5', '#f9cae3'],
  },
};

export function makeRampTexture(theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, theme.ramp[0]);
  gradient.addColorStop(0.55, theme.ramp[1]);
  gradient.addColorStop(1, theme.ramp[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Contrasting longitudinal racing stripes give each half-bank a distinct
  // silhouette at speed. These markings are part of our generated texture.
  if (theme.name === 'UTOPIA') {
    const stripe = ctx.createLinearGradient(0, 0, 512, 0);
    stripe.addColorStop(0, 'rgba(255,255,255,.12)');
    stripe.addColorStop(0.66, 'rgba(255,255,255,.08)');
    stripe.addColorStop(0.69, '#f67d95');
    stripe.addColorStop(0.77, '#f34766');
    stripe.addColorStop(0.8, '#ffe3db');
    stripe.addColorStop(0.83, '#e65d83');
    stripe.addColorStop(0.87, 'rgba(255,255,255,.13)');
    stripe.addColorStop(1, 'rgba(255,255,255,.05)');
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 0, 512, 512);
  } else {
    ctx.fillStyle = '#e3faff';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(379, 0, 13, 512);
    ctx.globalAlpha = 1;
  }
  // Paneling follows the direction of travel, with subtle welded join lines.
  for (let row = 0; row <= 512; row += 128) {
    ctx.fillStyle = theme.name === 'UTOPIA' ? '#c099b7' : '#34687c';
    ctx.globalAlpha = 0.14;
    ctx.fillRect(0, row, 512, 3);
    ctx.globalAlpha = 0.19;
    ctx.fillStyle = '#eff9ff';
    ctx.fillRect(0, row + 5, 512, 1);
    ctx.globalAlpha = 1;
  }
  for (let x = 32; x <= 512; x += 112) {
    ctx.fillStyle = theme.name === 'UTOPIA' ? '#a47fa4' : '#4d7e92';
    ctx.globalAlpha = 0.11;
    ctx.fillRect(x, 0, 2, 512);
    ctx.globalAlpha = 1;
  }
  for (let y = 12; y < 512; y += 32) {
    ctx.fillStyle = theme.name === 'UTOPIA' ? '#6f507f' : '#30576b';
    ctx.globalAlpha = 0.18;
    for (let x of [15, 250, 496]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // Reproducible wear without requiring an external image or non-determinism.
  let seed = 70913;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1350; i++) {
    const x = random() * 512;
    const y = random() * 512;
    ctx.fillStyle = random() > 0.55 ? '#fffafa' : (theme.name === 'UTOPIA' ? '#ac779d' : '#4b8092');
    ctx.globalAlpha = 0.035 + random() * 0.07;
    ctx.fillRect(x, y, 2 + random() * 21, random() > 0.85 ? 2 : 0.5);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function makeGateSign(theme, index, finish = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111923';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#222c3b';
  ctx.fillRect(14, 14, 996, 228);
  ctx.strokeStyle = `#${new THREE.Color(theme.accent).getHexString()}`;
  ctx.lineWidth = 8;
  ctx.strokeRect(22, 22, 980, 212);
  ctx.font = 'bold 96px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ecf5f3';
  ctx.fillText(theme.name, 60, 132);
  ctx.fillStyle = `#${new THREE.Color(theme.accent).getHexString()}`;
  ctx.font = 'bold 46px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(finish ? 'FINISH  //  00' : `GATE  //  ${String(index).padStart(2, '0')}`, 965, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBox(group, position, size, color, roughness = 0.84) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function addSurfEnvironment(group, course, theme) {
  const points = course.segments;
  const far = points.at(-1).to[2] - 72;
  // The base terrain is decorative and below the physics engine's void plane.
  addBox(group, [0, -55, (28 + far) / 2], [440, 7, 28 - far + 180], theme.distance);
  let seed = theme.name === 'BOREAS' ? 13408 : 52817;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Layered polygonal ridges frame the course at a safe distance beyond the
  // surf engine's voidX. The courses remain navigable over the open center.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const x = side * (67 + random() * 94);
      const z = 56 - i * 23 + (random() - 0.5) * 24;
      const height = (theme.name === 'BOREAS' ? 45 : 52) + random() * 75;
      const radius = 13 + random() * 19;
      const y = -50 + height / 2;
      const geometry = theme.name === 'BOREAS'
        ? new THREE.ConeGeometry(radius, height, 5 + Math.floor(random() * 3), 1)
        : new THREE.CylinderGeometry(radius * 0.42, radius, height, 6, 1);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: (i % 3 === 0 ? theme.terrain : theme.distance),
        roughness: 1, flatShading: true,
      }));
      mesh.position.set(x, y, z);
      mesh.rotation.y = random() * 6;
      mesh.receiveShadow = true;
      group.add(mesh);
      if (theme.name === 'UTOPIA' && i % 3 === 0) {
        addBox(group, [x, y + height * 0.18, z], [radius * 1.3, 2.2, radius * 1.3], 0x977db6);
        addBox(group, [x, y - height * 0.2, z], [radius * 1.7, 2.6, radius * 1.7], 0xf2c8da);
      }
    }
  }

  // These platforms and structures give each run a recognisable starting zone.
  const start = points[0].from;
  const xOffset = 25;
  for (const side of [-1, 1]) {
    const x = start[0] + xOffset * side;
    const baseY = start[1] - 4;
    addBox(group, [x, baseY - 2, 29], [15, 4, 47], theme.trim);
    addBox(group, [x, baseY + 8, 39], [12, 19, 13], theme.steel);
    for (let i = 0; i < 4; i++) {
      addBox(group, [x + side * 1, baseY + 4 + i * 3.5, 31], [12.5, 0.32, 1], theme.accent);
    }
    for (let i = 0; i < 3; i++) {
      addBox(group, [x + side * 6, baseY + 3, 21 - i * 7], [2.4, 13, 2.4], theme.trim);
    }
  }
}
