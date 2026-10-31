"""Extract reviewed Toon Shooter mesh islands into independently movable glTF nodes.

The unmodified source buffers keep every original POSITION, NORMAL, COLOR_0,
material and vertex index. Only new index accessors are appended, grouping
original triangles by disconnected source surface. No polygons are synthesized.

Usage: python scripts/build-rigged-gltf-weapons.py [--check]
"""
import argparse
import base64
import importlib.util
import json
import struct
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'client' / 'public' / 'models' / 'guns'
INSPECTOR = Path(__file__).with_name('visualize-gltf-gun-components.py')

# Reviewed in three orthographic views (docs/benchmarks/components/*-gltf.png).
# Indices are stable face-count-sorted connected islands from the source file.
# ShortCannon has no separate source magazine: move its actual short barrel
# assembly for modest recoil instead of inventing a detachable box magazine.
PARTS = {
    'Pistol': {'Slide': (0,)},
    'SMG': {'Magazine': (0,)},
    'Shotgun': {'Pump': (0,)},
    'ShortCannon': {'Barrel': (1,)},
    'Sniper_2': {'Magazine': (0,)},
}


def generate(stem):
    spec = importlib.util.spec_from_file_location('gltf_island_inspector', INSPECTOR)
    inspector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inspector)
    source, triangles = inspector.load_asset(stem)
    islands, records = inspector.islands_for(triangles)
    assignment = {}
    for part, indices in PARTS[stem].items():
        for index in indices:
            if index >= len(islands) or index in assignment:
                raise ValueError(f'{stem}: missing/duplicate reviewed component {index}')
            assignment[index] = part

    # Distinct glTF material primitives can share a physical connected island.
    # Preserve the source primitive's original triangle order and exact indices.
    by_group = defaultdict(lambda: defaultdict(list))
    for component_index, faces in enumerate(islands):
        group = assignment.get(component_index, 'Body')
        for primitive, vertices, _ in faces:
            by_group[group][primitive].append(vertices)
    source_triangles = defaultdict(list)
    for primitive, vertices, _ in triangles:
        source_triangles[primitive].append(vertices)
    for primitive, faces in source_triangles.items():
        emitted = [f for groups in by_group.values() for f in groups.get(primitive, [])]
        if sorted(emitted) != sorted(faces):
            raise AssertionError(f'{stem}: polygon loss/duplication in primitive {primitive}')

    source_buffer = base64.b64decode(source['buffers'][0]['uri'].split(',', 1)[1])
    data = bytearray(source_buffer)
    # Keep original source bufferViews and accessors (for vertex attributes)
    # and add independent index arrays for each new material primitive.
    source_primitives = source['meshes'][0]['primitives']
    output_meshes = []
    output_nodes = []
    manifest = {'sourceTriangles': len(triangles), 'islands': len(islands), 'parts': {}}
    for group in ('Body', *PARTS[stem]):
        new_primitives = []
        total_faces = 0
        for primitive_index, original in enumerate(source_primitives):
            # Original ordering matters for deterministic diffs and fidelity.
            selected = set(by_group[group].get(primitive_index, []))
            if not selected:
                continue
            original_faces = source_triangles[primitive_index]
            # A repeated, identical face must still be emitted as many times
            # as the source contains it; the multiset audit above covers this.
            indices = [value for face in original_faces if face in selected
                       for value in face]
            if len(indices) != 3 * len(by_group[group][primitive_index]):
                raise AssertionError(f'{stem}: duplicate face ordering ambiguity')
            total_faces += len(indices) // 3
            largest = max(indices)
            component_type, data_type = (5123, 'H') if largest <= 65535 else (5125, 'I')
            offset = (len(data) + 3) & ~3
            data.extend(b'\0' * (offset - len(data)))
            packed = struct.pack('<' + data_type * len(indices), *indices)
            data.extend(packed)
            view_index = len(source['bufferViews'])
            source['bufferViews'].append({'buffer': 0, 'byteOffset': offset,
                                          'byteLength': len(packed), 'target': 34963})
            accessor_index = len(source['accessors'])
            source['accessors'].append({'bufferView': view_index, 'componentType': component_type,
                                        'count': len(indices), 'type': 'SCALAR',
                                        'min': [min(indices)], 'max': [largest]})
            new_primitives.append({**original, 'indices': accessor_index})
        if not new_primitives:
            raise AssertionError(f'{stem}: empty exported group {group}')
        name = f'Rig{group}'
        mesh_index = len(output_meshes)
        output_meshes.append({'name': name, 'primitives': new_primitives})
        node_index = len(source['nodes']) + len(output_nodes)
        output_nodes.append({'name': name, 'mesh': mesh_index})
        manifest['parts'][group] = {'triangles': total_faces,
                                    'sourceIslands': sorted(i for i in range(len(islands))
                                                            if assignment.get(i, 'Body') == group)}
    if sum(group['triangles'] for group in manifest['parts'].values()) != len(triangles):
        raise AssertionError(f'{stem}: mismatched total face count')

    # Original root's transforms survive. Only its mesh is replaced by children.
    # This prevents source geometry rendering twice at rest.
    original_node = source['nodes'][0]
    original_node.pop('mesh')
    original_node['children'] = original_node.get('children', []) + [
        index for index in range(len(source['nodes']), len(source['nodes']) + len(output_nodes))]
    source['nodes'].extend(output_nodes)
    source['meshes'] = output_meshes
    source['buffers'][0]['byteLength'] = len(data)
    source['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(data).decode('ascii')
    output = (json.dumps(source, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')
    target = ASSETS / f'{stem}_Rigged.gltf'
    return target, output, manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    all_records = {}
    for stem in PARTS:
        target, output, record = generate(stem)
        if args.check:
            if not target.exists() or target.read_bytes() != output:
                raise SystemExit(f'OUTDATED {target}: regenerate without --check')
        else:
            target.write_bytes(output)
        all_records[stem] = record
        print(f'{stem}: {record["sourceTriangles"]} triangles -> '
              f'{[(part, details["triangles"]) for part, details in record["parts"].items()]}')
    manifest = ASSETS / 'rigged-gltf-manifest.json'
    payload = (json.dumps(all_records, indent=2) + '\n').encode('utf-8')
    if args.check:
        if not manifest.exists() or manifest.read_bytes() != payload:
            raise SystemExit('OUTDATED glTF source rig manifest')
    else:
        manifest.write_bytes(payload)
    print('glTF source-rig assets are deterministic and complete')


if __name__ == '__main__':
    main()
