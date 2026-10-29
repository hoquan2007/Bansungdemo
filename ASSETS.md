# Asset credits

## GLB Models (Quaternius - CC0 / Public Domain)

Source: https://quaternius.com/ and https://poly.pizza/

| File | Original name | Author | License |
|---|---|---|---|
| `char_soldier.glb` | Character Soldier | Quaternius | CC0 |
| `char_swat.glb` | SWAT | Quaternius | CC0 |
| `gun_ak47.glb` | AK47 | Quaternius | CC0 |
| `gun_rifle.glb` | Rifle | Quaternius | CC0 |
| `gun_smg.glb` | Submachine Gun | Quaternius | CC0 |
| `gun_pistol.glb` | Pistol | Quaternius | CC0 |
| `gun_sniper.glb` | Sniper Rifle | Quaternius | CC0 |
| `gun_shotgun.glb` | Shotgun | Quaternius | CC0 |
| `gun_scifi_rifle.glb` | Scifi Assault Rifle | Quaternius | CC0 |
| `prop_crate.glb` | Crate | Kay Lousberg | CC0 |
| `prop_barrel.glb` | Barrel | Quaternius | CC0 |
| `prop_container.glb` | Cargo Train Container | Quaternius | CC0 |
| `prop_pine.glb` | Pine Tree | Quaternius | CC0 |
| `prop_rock.glb` | Rock Medium | Quaternius | CC0 |

Downloaded via `scripts/download-models.mjs` from `https://static.poly.pizza/`.

## HDRI Environment Maps (Poly Haven - CC0)

Source: https://polyhaven.com/

| File | Original name | Author | License |
|---|---|---|---|
| `sky_dawn.hdr` | kiara_1_dawn (1k) | Greg Zaal | CC0 |
| `sky_clear.hdr` | qwantani_puresky (1k) | Greg Zaal | CC0 |
| `sky_sunrise.hdr` | spruit_sunrise (1k) | Greg Zaal | CC0 |

## Diffuse Textures (Poly Haven - CC0)

Source: https://polyhaven.com/

| File | Original name | License |
|---|---|---|
| `leafy_grass_diff_1k.jpg` | Leafy Grass (1k) | CC0 |
| `sand_03.jpg` | Sand 03 (1k) | CC0 |
| `concrete_floor.jpg` | Concrete Floor (1k) | CC0 |

## Procedural / Code-only

The following are generated from code in `src/game.ts` (Babylon primitives):
- Terrain mesh (heightmap-driven)
- Skybox gradient spheres (fallback when HDRI loads slowly)
- Building structures (boxes with windows/roof)
- Pine trees, boulders, gantries, capture point rings
- Avatar body parts (capsule head/torso/arms/legs)
- View-model weapons (fallback when GLB not yet loaded)
- Crosshair, hitmarker, kill feed

These are placeholders while more polished GLB meshes are sourced.
