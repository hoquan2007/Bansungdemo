"""Inspect original Toon Shooter glTF triangle islands with three orthographic views.

Usage: python scripts/visualize-gltf-gun-components.py Pistol [SMG ...]
Only reads original glTFs. Welds spatially coincident vertices across materials
to identify disconnected geometry; mechanical classification remains manual.
"""
import base64
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'client' / 'public' / 'models' / 'guns'
OUTPUT = ROOT / 'docs' / 'benchmarks' / 'components'
DATA_FORMATS = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}
DATA_SIZES = {5121: 1, 5123: 2, 5125: 4, 5126: 4}
NUM_COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load_asset(stem):
    source = json.loads((ASSETS / f'{stem}.gltf').read_text(encoding='utf-8'))
    data = base64.b64decode(source['buffers'][0]['uri'].split(',', 1)[1])

    def accessor(number):
        item = source['accessors'][number]
        view = source['bufferViews'][item['bufferView']]
        size = NUM_COMPONENTS[item['type']]
        fmt = '<' + DATA_FORMATS[item['componentType']] * size
        step = view.get('byteStride', DATA_SIZES[item['componentType']] * size)
        start = view.get('byteOffset', 0) + item.get('byteOffset', 0)
        return [struct.unpack_from(fmt, data, start + i * step)
                for i in range(item['count'])]

    triangles = []
    for primitive_id, primitive in enumerate(source['meshes'][0]['primitives']):
        positions = accessor(primitive['attributes']['POSITION'])
        ids = [value[0] for value in accessor(primitive['indices'])]
        if len(ids) % 3:
            raise ValueError(f'{stem}: primitive indices not triangles')
        for offset in range(0, len(ids), 3):
            triangles.append((primitive_id, tuple(ids[offset:offset + 3]),
                              tuple(positions[i] for i in ids[offset:offset + 3])))
    return source, triangles


def islands_for(triangles):
    parent = {}

    def find(v):
        if v not in parent:
            parent[v] = v
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v

    for _, _, positions in triangles:
        keys = [tuple(round(coord, 5) for coord in point) for point in positions]
        root = find(keys[0])
        for key in keys[1:]:
            parent[find(key)] = root

    island_faces = defaultdict(list)
    for triangle in triangles:
        point = tuple(round(coord, 5) for coord in triangle[2][0])
        island_faces[find(point)].append(triangle)
    sorted_islands = sorted(island_faces.values(), key=len, reverse=True)
    records = []
    for index, faces in enumerate(sorted_islands):
        points = [point for _, _, positions in faces for point in positions]
        records.append({
            'component': index,
            'faces': len(faces),
            'materials': sorted({p for p, _, _ in faces}),
            'min': [round(min(point[a] for point in points), 5) for a in range(3)],
            'max': [round(max(point[a] for point in points), 5) for a in range(3)],
        })
    return sorted_islands, records


def visualize(stem):
    _, triangles = load_asset(stem)
    islands, records = islands_for(triangles)
    im = Image.new('RGB', (1280, 565), '#101a24')
    draw = ImageDraw.Draw(im)
    directions = [('Side (X/Y)', 0, 1), ('Top (X/Z)', 0, 2), ('Muzzle (Z/Y)', 2, 1)]
    palette = ['#58c4e7', '#ef926e', '#a5d679', '#f0c663', '#bd9ee1',
               '#f29dcc', '#6fc6ad', '#acc8f2', '#e4ae84', '#d1ce76']
    for panel, (title, x_axis, y_axis) in enumerate(directions):
        left = panel * 425
        draw.text((left + 20, 16), f'{stem} | {title}', fill='#e6f0f7')
        points = [point for _, _, positions in triangles for point in positions]
        xmin, xmax = min(p[x_axis] for p in points), max(p[x_axis] for p in points)
        ymin, ymax = min(p[y_axis] for p in points), max(p[y_axis] for p in points)
        scale = min(385 / max(xmax - xmin, 0.001), 415 / max(ymax - ymin, 0.001))

        def project(p):
            return (left + 212 + (p[x_axis] - (xmin + xmax) / 2) * scale,
                    255 - (p[y_axis] - (ymin + ymax) / 2) * scale)

        hidden = ({0, 1, 2} - {x_axis, y_axis}).pop()
        painted = []
        for index, faces in enumerate(islands):
            for _, _, positions in faces:
                painted.append((sum(point[hidden] for point in positions) / 3,
                                index, [project(point) for point in positions]))
        for _, index, polygon in sorted(painted):
            draw.polygon(polygon, fill=palette[index % len(palette)], outline='#132532')
        for rec in records:
            if rec['faces'] < 12:
                continue
            mid = [(rec['min'][a] + rec['max'][a]) / 2 for a in range(3)]
            x, y = project(mid)
            draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill='#06111b', outline='#fefefe')
            draw.text((x - 5, y - 5), str(rec['component']), fill='#ffffff')
        draw.text((left + 17, 520), f'{len(records)} islands, {len(triangles)} tris',
                  fill='#90aabc')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image_path = OUTPUT / f'{stem}-gltf.png'
    im.save(image_path)
    (OUTPUT / f'{stem}-gltf.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
    print(f'{stem}: {len(records)} islands, {len(triangles)} triangles, image {image_path}')
    for rec in records[:25]:
        print(f"  {rec['component']:2d}: {rec['faces']:4d} tri, mat={rec['materials']}, "
              f"bounds={rec['min']}..{rec['max']}")


if __name__ == '__main__':
    for name in sys.argv[1:] or ['Pistol', 'SMG', 'Shotgun', 'ShortCannon', 'Sniper_2']:
        if name not in {'Pistol', 'SMG', 'Shotgun', 'ShortCannon', 'Sniper_2'}:
            raise SystemExit(f'Unrecognized current Toon Shooter weapon: {name}')
        visualize(name)
