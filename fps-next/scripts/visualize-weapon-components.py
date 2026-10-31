"""Render a color-coded OBJ connectivity map for manual mechanical-part selection.

Usage: python scripts/visualize-weapon-components.py Revolver_1
Requires only Pillow; never changes source geometry. Identical colors represent
faces connected through vertex indices, not guaranteed physical moving parts.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
name = sys.argv[1] if len(sys.argv) > 1 else 'Revolver_1'
if not name.replace('_', '').isalnum():
    raise SystemExit('Expected an OBJ file stem from models/guns-obj')
source = ROOT / 'client' / 'public' / 'models' / 'guns-obj' / f'{name}.obj'
lines = source.read_text(encoding='utf-8').splitlines()
points = []
faces = []
for line in lines:
    if line.startswith('v '):
        points.append(tuple(map(float, line.split()[1:4])))
    elif line.startswith('f '):
        vertex_ids = []
        for token in line.split()[1:]:
            idx = int(token.split('/')[0])
            vertex_ids.append(idx - 1 if idx > 0 else len(points) + idx)
        faces.append(vertex_ids)

parent = list(range(len(points)))


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


for face in faces:
    for idx in face[1:]:
        parent[find(idx)] = find(face[0])

islands = defaultdict(list)
for face in faces:
    islands[find(face[0])].append(face)
sorted_islands = sorted(islands.values(), key=len, reverse=True)
palette = ['#58c4e7', '#ef926e', '#a5d679', '#f0c663', '#bd9ee1',
           '#f29dcc', '#6fc6ad', '#acc8f2', '#e4ae84', '#d1ce76']
size = (1280, 545)
im = Image.new('RGB', size, '#101a24')
draw = ImageDraw.Draw(im)
directions = [('Side (X/Y)', 0, 1), ('Top (X/Z)', 0, 2), ('Muzzle (Z/Y)', 2, 1)]
records = []
for i, component in enumerate(sorted_islands):
    verts = {index for face in component for index in face}
    records.append({'component': i, 'faces': len(component),
                    'min': [round(min(points[v][axis] for v in verts), 4) for axis in range(3)],
                    'max': [round(max(points[v][axis] for v in verts), 4) for axis in range(3)]})

for panel, (title, x_axis, y_axis) in enumerate(directions):
    px = panel * 425
    draw.text((px + 25, 18), f'{name} | {title}', fill='#e6f0f7')
    xs = [v[x_axis] for v in points]
    ys = [v[y_axis] for v in points]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    scale = min(372 / max(xmax - xmin, .001), 405 / max(ymax - ymin, .001))
    centerx, centery = (xmin + xmax) / 2, (ymin + ymax) / 2

    def project(v):
        return (px + 210 + (v[x_axis] - centerx) * scale,
                245 - (v[y_axis] - centery) * scale)

    hidden_axis = ({0, 1, 2} - {x_axis, y_axis}).pop()
    face_paints = []
    for idx, component in enumerate(sorted_islands):
        for face in component:
            face_paints.append((sum(points[v][hidden_axis] for v in face) / len(face),
                                idx, [project(points[v]) for v in face]))
    for _, idx, poly in sorted(face_paints, key=lambda entry: entry[0]):
        draw.polygon(poly, fill=palette[idx % len(palette)], outline='#132532', width=1)
    for idx, comp in enumerate(sorted_islands):
        if len(comp) < 20:
            continue
        verts = {v for f in comp for v in f}
        mid = [sum(points[v][a] for v in verts) / len(verts) for a in range(3)]
        labelx, labely = project(mid)
        draw.ellipse((labelx - 10, labely - 10, labelx + 10, labely + 10),
                     fill='#06111b', outline='#eaf3f8', width=1)
        draw.text((labelx - 4, labely - 5), str(idx), fill='#fff')
    draw.text((px + 17, 500), f'{len(sorted_islands)} islands | {len(faces)} faces', fill='#90aabc')

outdir = ROOT / 'docs' / 'benchmarks' / 'components'
outdir.mkdir(parents=True, exist_ok=True)
image_path = outdir / f'{name}.png'
im.save(image_path)
(outdir / f'{name}.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(image_path)
