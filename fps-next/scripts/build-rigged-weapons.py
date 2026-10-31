"""Deterministically split reviewed Quaternius OBJ geometry into real moving meshes.

Original OBJ/MTL files are never modified. Face topology, texture coordinates,
normals, materials, and polygon winding are preserved exactly. Islands are sorted
using the same stable face-count ordering as visualize-weapon-components.py.

Usage: python scripts/build-rigged-weapons.py [--check]
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'client' / 'public' / 'models' / 'guns-obj'

# Human-reviewed connected islands, indexed by descending face count. These are
# source mesh components, never lookalike primitives overlaid onto static parts.
PARTS = {
    'Revolver_1': {'Cylinder': (0,)},
    'Pistol_4': {'Slide': (0, 3, 6, 7, 8, 9)},
    'SubmachineGun_3': {'Magazine': (5,)},
    'SubmachineGun_5': {'Magazine': (4,)},
    'AssaultRifle2_1': {'Magazine': (3,)},
    'Bullpup_1': {'Magazine': (2,)},
    'Shotgun_SawedOff': {'Barrels': (1, 2, 4, 7)},
    'Shotgun_ShortStock': {'Pump': (0,)},
    'SniperRifle_6': {'Bolt': (4,)},
}


def parse_obj(source):
    lines = source.read_text(encoding='utf-8').splitlines()
    vertices, geometry, faces = [], [], []
    material, smoothing = None, None
    for line in lines:
        if line.startswith('v '):
            vertices.append(tuple(map(float, line.split()[1:4])))
            geometry.append(line)
        elif line.startswith(('vn ', 'vt ', 'vp ')):
            geometry.append(line)
        elif line.startswith('usemtl '):
            material = line
        elif line.startswith('s '):
            smoothing = line
        elif line.startswith('f '):
            indices = []
            for token in line.split()[1:]:
                index = int(token.split('/')[0])
                indices.append(index - 1 if index > 0 else len(vertices) + index)
            if len(indices) < 3 or any(index < 0 or index >= len(vertices) for index in indices):
                raise ValueError(f'{source}: invalid vertex reference: {line}')
            faces.append((line, indices, material, smoothing))
    if not vertices or not faces:
        raise ValueError(f'{source}: missing geometry')
    return vertices, geometry, faces


def connected_islands(vertex_count, faces):
    parent = list(range(vertex_count))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for _, indices, _, _ in faces:
        for index in indices[1:]:
            parent[find(index)] = find(indices[0])
    islands = defaultdict(list)
    for face_index, (_, indices, _, _) in enumerate(faces):
        islands[find(indices[0])].append(face_index)
    return sorted(islands.values(), key=len, reverse=True)


def generate(name, config):
    vertices, geometry, faces = parse_obj(ASSETS / f'{name}.obj')
    islands = connected_islands(len(vertices), faces)
    assigned = {}
    for part, indices in config.items():
        for index in indices:
            if index >= len(islands) or index in assigned:
                raise ValueError(f'{name}: overlapping or missing component {index}')
            assigned[index] = part

    groups = defaultdict(list)
    for island_index, face_indices in enumerate(islands):
        group = assigned.get(island_index, 'Body')
        groups[group].extend(face_indices)
    # Faces are partitioned, never duplicated or discarded.
    all_indices = [index for group in groups.values() for index in group]
    if sorted(all_indices) != list(range(len(faces))):
        raise AssertionError(f'{name}: geometry partition lost/duplicated faces')

    result = [f'# Generated from {name}.obj by scripts/build-rigged-weapons.py',
              f'mtllib {name}_Rigged.mtl', *geometry]
    records = {}
    for part in ('Body', *config):
        indices = sorted(groups[part])
        result.append(f'o Rig{part}')
        last_material = last_smoothing = None
        vertex_ids = set()
        for index in indices:
            line, refs, material, smoothing = faces[index]
            if material and material != last_material:
                result.append(material)
                last_material = material
            if smoothing and smoothing != last_smoothing:
                result.append(smoothing)
                last_smoothing = smoothing
            result.append(line)
            vertex_ids.update(refs)
        records[part] = {
            'faces': len(indices),
            'min': [min(vertices[index][axis] for index in vertex_ids) for axis in range(3)],
            'max': [max(vertices[index][axis] for index in vertex_ids) for axis in range(3)],
        }
    return '\n'.join(result) + '\n', records, len(faces)


def sync_file(path, content, check):
    existing = path.read_bytes() if path.exists() else None
    if existing == content:
        return
    if check:
        raise AssertionError(f'Generated asset out of date: {path}')
    path.write_bytes(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    check = parser.parse_args().check
    manifest = {}
    for name, config in PARTS.items():
        obj, parts, faces = generate(name, config)
        sync_file(ASSETS / f'{name}_Rigged.obj', obj.encode('utf-8'), check)
        sync_file(ASSETS / f'{name}_Rigged.mtl', (ASSETS / f'{name}.mtl').read_bytes(), check)
        manifest[name] = {'originalFaces': faces, 'parts': parts}
    sync_file(ASSETS / 'rigged-manifest.json',
              (json.dumps(manifest, indent=2) + '\n').encode('utf-8'), check)
    print(f'OK: {len(manifest)} rigged OBJ models, {sum(m["originalFaces"] for m in manifest.values())} faces preserved')


if __name__ == '__main__':
    main()
