# Lobby operator model and usage

The lobby's Duel, Squads, Boreas, Utopia, and Practice cards use cropped WebP
screenshots of this project's own playable maps. `scripts/capture-mode-art.py`
generates them from local browser smoke screenshots; no graphics were copied
from the reference game. The Battle mode card still uses original vector art.

To refresh the competitive cards after `npm run build`, run the following in
PowerShell from the project root (Chrome headless is required):

```powershell
$env:SMOKE_MODE='duel'; $env:SMOKE_MAP='foundry'; $env:SMOKE_SCREENSHOT="$PWD\.research\own-duel-foundry-gameplay.png"; npm run smoke:browser
$env:SMOKE_MODE='squads'; $env:SMOKE_MAP='courtyard'; $env:SMOKE_SCREENSHOT="$PWD\.research\own-squads-gameplay.png"; npm run smoke:browser
python scripts/capture-mode-art.py --modes duel squads
```

The WebP files are generated in `client/public/menu/` and loaded by
`client/src/menu.css`. Both screenshots come from real playable maps with
independently sourced weapon viewmodels. The original SVGs remain as unused
source illustrations.

The lobby uses a separately licensed tactical operator model, **not content
extracted from AstraStrike or Counter-Strike**. The source model is:

- Title: **Military tactical suit (LowPolyGameReady)**
- Original creator: **DanlyVostok (1799danly)**
- Original URL: https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed
- License: **Creative Commons Attribution 4.0 International**:
  https://creativecommons.org/licenses/by/4.0/
- Local asset: `client/public/models/characters/Operator_Tactical.glb`
- Distribution source: https://github.com/cktang88/3d-fps ,
  `public/assets/models/characters/soldier_tac.glb`

The distributed GLB is a modified conversion of the creator's model by the
IRONLINE project: its repository documents merged meshes and WebP textures.
The Crown / Strike scene further adapts its display scale, orientation and
lighting; it does not modify the downloaded mesh bytes. This notice preserves
the creator credit, source, change history and license link. The CC BY 4.0
license applies to the original model, including downstream modified copies.

The lobby also displays `Operator_Rifle.glb`, an M4A1 derived from the
independently sourced model distributed at
https://github.com/cktang88/3d-fps (`public/assets/models/weapons/m4a1.glb`).
Its source mesh is based on the CC0 M4A1 by **nisu** from
https://opengameart.org/content/m4a1-assault-rifle with supplementary CC0
Quaternius elements. The distributing IRONLINE project's README identifies
these as CC0-based fallback weapon assets and explains their modifications.
The lobby scales and positions the rifle for display. The file is a separate
prop and has no effect on gameplay hit detection or weapon statistics.

The operator wears a separate **CC0 gas-mask model**. Its face-up pickup
geometry is rotated and fitted to the head at runtime; if the GLB is missing,
the scene retains its original procedural mask as a fallback.

- Title: **Gas Mask (Battle Royale Town and Airfield)**
- Creator: **3D Assets**, model created with AI tools as declared by the source
- Original: https://3dassets.dev/assets/battle-royale-town-and-airfield-gas-mask-e76f0a62
- License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
- Local model: `client/public/models/characters/Operator_GasMask_CC0.glb`
- Download: https://cdn.3dassets.dev/assets/28235/v1/model.glb
- Geometry: 3,796 triangles, four original materials, no animation.

The fallback model remains Quaternius' **CC0 Toon Shooter**
`Character_Soldier.gltf`, previously bundled with this project.

A separate CC0 Low-poly Squad Kit by Toolbench was reviewed in
`.asset-staging/lowpoly-squad-kit`, but its stylized figure was not used in
the lobby. It remains outside the distributable `client/public` tree.

Do not replace these files with images, models or sounds extracted from
AstraStrike, whose Terms of Service explicitly prohibit extraction and
redistribution: https://astrastrike.fun/terms/ .

## Courtyard tactical town props

Four individually verified **CC0 1.0** models from 3D Assets' Tactical Shooter
Hill Town pack are bundled under `client/public/models/props/hilltown/`:
Sandbag Wall (27532), Timber Crate Stack (27530), Market Awning Stall (27529),
and Octagonal Town Fountain (27528). Three architectural modules are also
bundled: Plaster Wall Bay (27512), Ochre Wall Bay (27514), and Shuttered Window
Bay (27511). Their source and download URLs are listed
in `client/public/ASSET_CREDITS.txt`. The published assets were AI-generated.

Courtyard places two walls, two stacks, two stalls and one fountain. GLB file
references live in shared map tags (`prop:hilltown/<name>.glb`), which the
renderer resolves alongside the original `.gltf` kit. Map geometry supplies
real server-authoritative cover; failed model loads leave the collision boxes
visible. The centre health pickup is offset to remain reachable.
The perimeter is dressed with a 4m wall grid in two 3.5m tiers, backed by the
existing seven-metre collision walls; the windows stay shuttered. The facade
models are purely visual and are released when the map changes.

On 30 October 2026, a Courtyard visual regression was corrected in
`client/src/mapRenderer.js`: rotating GLB props by 90 or 270 degrees had
swapped their world X/Z dimensions while applying local scales. The second
sandbag wall became roughly 0.20 × 7.15 metres on the ground instead of its
authored 2.15 × 0.65 metres. Scaling along the corresponding local axes now
preserves the authored collision bounds. For a repeatable browser check, build
with `VITE_VISUAL_DIAGNOSTICS=1` and run `scripts/browser-smoke.mjs` with
`SMOKE_MAP=courtyard`, `SMOKE_TEAMS=2`, and `SMOKE_VISUAL_AB=1`.
The smoke test asserts that every loaded prop's rendered AABB matches its
collision AABB within 0.035 metres; all 13 Courtyard replacements passed.
The regular production build does not expose the diagnostic object.

## Retake objective case

Retake now displays a dedicated CC0 **Objective Device Case**, including its
openable lid and five original materials. The model is loaded only from the
local project assets at `client/public/models/objectives/ObjectiveDevice_CC0.glb`.
It is scaled to fit the bomb marker and leaves the game server's planted-bomb
position and defuse interaction unchanged. The old box remains as a fallback
when the GLB fails to load.

- Source: https://3dassets.dev/assets/tactical-shooter-hill-town-objective-device-24da01ad
- Direct asset: https://cdn.3dassets.dev/assets/27560/v1/model.glb
- License: **CC0 1.0 Universal**; source declares AI-assisted creation.
- Source geometry: 3,376 triangles, seven meshes and two lid animations.
