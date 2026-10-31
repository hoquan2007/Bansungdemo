// Inventory source geometry before extracting real magazines, bolts and slides.
// This inspects existing assets without changing or re-exporting their meshes.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../shared/weapons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'client', 'public');
const reportPath = path.join(root, 'docs', 'benchmarks', 'weapon-source-audit.json');
const sourceDirs = {
  gltf: 'models/guns',
  obj: 'models/guns-obj',
  glb: 'models/characters',
  cc0gun: 'models/guns-real',
};

function objTopology(source) {
  const positions = [];
  const faces = [];
  let material = '(unspecified)';
  const groups = new Set();
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('v ')) positions.push(line.slice(2).trim().split(/\s+/).slice(0, 3).map(Number));
    else if (line.startsWith('o ') || line.startsWith('g ')) groups.add(line.slice(2).trim());
    else if (line.startsWith('usemtl ')) material = line.slice(7).trim();
    else if (line.startsWith('f ')) {
      const indices = line.slice(2).trim().split(/\s+/).map((part) => {
        const raw = Number(part.split('/')[0]);
        return raw < 0 ? positions.length + raw : raw - 1;
      });
      if (indices.length >= 3 && indices.every((i) => i >= 0 && i < positions.length)) {
        faces.push({ indices, material });
      }
    }
  }

  const parent = positions.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a, b) => {
    const x = find(a);
    const y = find(b);
    if (x !== y) parent[y] = x;
  };
  for (const { indices } of faces) {
    for (let i = 1; i < indices.length; i++) unite(indices[0], indices[i]);
  }
  const components = new Map();
  for (const face of faces) {
    const key = find(face.indices[0]);
    let entry = components.get(key);
    if (!entry) {
      entry = { faceCount: 0, vertexIndices: new Set(), materials: new Set(),
        min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      components.set(key, entry);
    }
    entry.faceCount++;
    entry.materials.add(face.material);
    for (const i of face.indices) {
      entry.vertexIndices.add(i);
      const p = positions[i];
      for (let axis = 0; axis < 3; axis++) {
        entry.min[axis] = Math.min(entry.min[axis], p[axis]);
        entry.max[axis] = Math.max(entry.max[axis], p[axis]);
      }
    }
  }
  const records = [...components.values()].map((entry) => ({
    faces: entry.faceCount,
    vertices: entry.vertexIndices.size,
    materials: [...entry.materials].sort(),
    min: entry.min.map((value) => Number(value.toFixed(4))),
    max: entry.max.map((value) => Number(value.toFixed(4))),
  })).sort((a, b) => b.faces - a.faces);
  return {
    objectGroups: [...groups],
    sourceVertices: positions.length,
    sourceFaces: faces.length,
    disconnectedSurfaceCount: records.length,
    largestSurfaces: records.slice(0, 12),
    // Surface islands are candidates only: a disconnected surface is not
    // automatically a mechanically correct magazine, slide, cylinder or bolt.
    classification: 'unclassified geometry islands',
  };
}

function gltfTopology(data) {
  const names = (data.nodes ?? []).map((node) => node.name).filter(Boolean);
  const primitives = (data.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  return {
    nodes: (data.nodes ?? []).length,
    namedNodes: names,
    meshes: (data.meshes ?? []).length,
    primitives: primitives.length,
    materialNames: (data.materials ?? []).map((mat) => mat.name ?? '(unnamed)'),
    skins: (data.skins ?? []).length,
    animationNames: (data.animations ?? []).map((animation) => animation.name ?? '(unnamed)'),
    classification: 'primitives represent material groups, not necessarily moving parts',
  };
}

function glbJson(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) {
    throw new Error('Expected glTF 2.0 GLB');
  }
  const byteLength = buffer.readUInt32LE(8);
  if (byteLength !== buffer.length) throw new Error('Invalid GLB byte length');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('No JSON GLB chunk');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
}

const records = [];
for (const weapon of Object.values(WEAPONS)) {
  const [kind, name] = (weapon.model ?? '').split(':');
  const ext = kind === 'gltf' ? 'gltf' : kind === 'obj' ? 'obj' : 'glb';
  const relative = `${sourceDirs[kind] ?? '(unknown)'}/${name}.${ext}`;
  const full = path.join(assetRoot, relative);
  const record = { id: weapon.id, type: weapon.type, path: relative, exists: existsSync(full) };
  if (record.exists) {
    try {
      record.geometry = ext === 'obj' ? objTopology(readFileSync(full, 'utf8'))
        : gltfTopology(ext === 'glb' ? glbJson(readFileSync(full))
          : JSON.parse(readFileSync(full, 'utf8')));
    } catch (error) { record.error = error.message; }
  }
  records.push(record);
}
const report = {
  schema: 1,
  assetCount: records.length,
  note: 'A source geometry census, not a declaration of detached, correctly rigged parts.',
  weapons: records,
};
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, reportPath)} for ${records.length} weapons`);
for (const record of records) {
  const g = record.geometry;
  console.log(`${record.id.padEnd(14)} ${record.path.padEnd(47)} ` +
    (g?.disconnectedSurfaceCount != null
      ? `${g.disconnectedSurfaceCount} disconnected OBJ surfaces / ${g.sourceFaces} faces`
      : g ? `${g.nodes} glTF nodes / ${g.primitives} primitives / ${g.animationNames.length} clips`
        : `ERROR ${record.error ?? 'missing'}`));
}
