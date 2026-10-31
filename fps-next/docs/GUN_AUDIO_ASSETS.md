# Gun audio and model upgrades

The five short gunshot WAV files in `client/public/audio/guns/` were trimmed,
downmixed, resampled to 24 kHz PCM and normalized from **The Free Firearm Sound
Library** (Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney). The
creators released the library under **CC0 / No Rights Reserved**. Source:
https://opengameart.org/content/the-free-firearm-sound-library

The individual source WAVs were downloaded from the archival repository:
https://github.com/petroulacl/fps-asset-kit

| Game file | Original recording in `sfx/firearm_sfx/Prepared SFX Library/` |
| --- | --- |
| `pistol.wav` | `1911/A_34P.wav` |
| `smg.wav` | `PPSh/P_34P.wav` |
| `rifle.wav` | `AK-47/C_27P.wav` |
| `shotgun.wav` | `Mossberg/N_30P.wav` |
| `sniper.wav` | `Mosin Nagant/M_26P.wav` |

The raw recordings are not included in this repository. To reproduce the clips,
download the corresponding five raw WAVs to `.asset-staging/` under the names
`pistol.wav`, `smg.wav`, `rifle.wav`, `shotgun.wav`, `sniper.wav`, then run
`python scripts/prepare-gun-audio.py` (requires numpy and scipy).

### Weapon geometry sources for future upgrades

* **3D Assets — CC0 Combat Knife (installed 30 October 2026):**
  https://3dassets.dev/assets/mega-weapon-pack-combat-knife-be1b3598
  supplies `client/public/models/guns-real/CombatKnife_CC0.glb` (326,924 bytes).
  The first-person view uses the independently authored, low-poly tactical
  glove/arm geometry in `client/src/weaponView.js`. The mesh is licensed CC0;
  see `client/public/ASSET_CREDITS.txt` for the direct download and SHA256.

* **3D Assets — CC0 3D sniper rifles (installed 30 October 2026):**
  https://3dassets.dev/assets/mega-weapon-pack-bolt-sniper-chassis-scoped-891e227c
  supplies the **Chassis Sniper, Scoped** (`client/public/models/guns-real/ChassisSniper_CC0.glb`,
  94,284 triangles / 2.3 MB). It uses a detailed chassis, optic, suppressor,
  and physically based metallic materials. The alternative
  https://3dassets.dev/assets/fps-weapon-set-and-firing-range-bolt-sniper-b3944481
  is `BoltSniper_CC0.glb` (10,560 triangles / 522 KB), used if the main GLB
  fails to load, followed by the Quaternius OBJ and finally procedural shapes.
  Both creators designate the files **CC0 1.0**; the site's pages report AI
  assistance in generation. The six original animation clips remain embedded;
  `magazine-open/close` and `bolt-open/close` now animate the independent first-person
  model on reload, cycle the bolt after firing, and animate an Arsenal inspection
  preview. The two bipod clips remain available for future use. A browser smoke
  check verifies the real magazine and bolt node movement and rest restoration.
  Both files were
  downloaded directly from the source's public asset CDN. See the bundled
  `ASSET_CREDITS.txt` for exact source links.

* **nisu / 3DModelsCC0 M4A1:** https://opengameart.org/content/m4a1-assault-rifle
  — CC0 textured M4A1 (FBX + base color/normal/roughness/metalness). The
  optimized 1024px WebP version is bundled under `models/guns-real/` as an
  automatic rifle fallback. Source archive: `m4a1_0.zip` at OpenGameArt (the
  full-resolution originals are not committed).
* **IRONLINE / 3d-fps M4A1 GLB:**
  https://github.com/cktang88/3d-fps (`public/assets/models/weapons/m4a1.glb`)
  — a converted CC0 Nisu M4A1 with supplementary CC0 Quaternius attachments,
  documented by that project. `client/public/models/characters/Operator_Rifle.glb`
  is the current rifle mesh for the lobby and first-person view. Its 19 source
  meshes include embedded PBR textures, an optic, foregrip and suppressor. The
  first-person copy hides its unused staged spare magazine. Separate studio
  reflection lighting preserves material detail; FBX and geometric fallbacks
  remain available. The other weapons keep their existing Quaternius models.
* **Quaternius Ultimate Guns:** https://quaternius.com/packs/ultimategun.html
  — CC0, 40 lightweight OBJ/FBX/Blend models. This kit already supplies most
  low-poly options in the current game.
* **Kenney Weapon Pack:** https://opengameart.org/content/weapon-pack — CC0,
  30 stylized weapons with OBJ/MTL. A lightweight fallback option.
* **petroulacl/fps-asset-kit:** https://github.com/petroulacl/fps-asset-kit
  — CC0 curated collection including flat-gun GLB models and original gunshot
  WAV recordings. The original WAVs are several MB each; ship trimmed clips.
* **cktang88/3d-fps first-person M4A1 rig:**
  https://github.com/cktang88/3d-fps/tree/main/public/assets/models/fp —
  the game's default rifle viewmodel now uses `models/fp/m4a1.glb` plus
  `arms_basecolor.webp` and `arms_normal.webp`. It includes a skinned two-arm
  grip and five textured meshes. The source project credits **Firewarden** for
  the M4A1 ([original](https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6))
  and **bumstrum / DJMaesen** for the arms
  ([original](https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412)),
  both under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  The model was adapted and compressed for the 3d-fps project, and is further
  resized, offset, and color-tinted in this game. Credit the authors and retain
  this notice when distributing the game. `models/characters/Operator_Rifle.glb`
  remains the fallback if the rig cannot load. `?legacyRifle=1` selects the
  fallback for visual comparison. The accompanying `MeshoptDecoder` is loaded
  by Three.js because the rig uses `EXT_meshopt_compression`.

The game keeps geometric fallback models and procedural audio when an imported
asset is unavailable. Third-party code/models must be reviewed for their own
licenses before copying.
