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

* **nisu / 3DModelsCC0 M4A1:** https://opengameart.org/content/m4a1-assault-rifle
  — CC0 textured M4A1 (FBX + base color/normal/roughness/metalness). The rifle
  now uses the downloaded model with optimized 1024px WebP textures. Its
  metallic map is supported by the separate reflection environment used by the
  first-person viewmodel. Source
  archive: `m4a1_0.zip` at OpenGameArt (the full-resolution originals are not
  committed). The other weapons keep their existing Quaternius models.
* **Quaternius Ultimate Guns:** https://quaternius.com/packs/ultimategun.html
  — CC0, 40 lightweight OBJ/FBX/Blend models. This kit already supplies most
  low-poly options in the current game.
* **Kenney Weapon Pack:** https://opengameart.org/content/weapon-pack — CC0,
  30 stylized weapons with OBJ/MTL. A lightweight fallback option.
* **petroulacl/fps-asset-kit:** https://github.com/petroulacl/fps-asset-kit
  — CC0 curated collection including flat-gun GLB models and original gunshot
  WAV recordings. The original WAVs are several MB each; ship trimmed clips.
* **cktang88/3d-fps:** https://github.com/cktang88/3d-fps — more realistic
  reference for first-person gun rigs, arms and animations. The included
  third-party assets have **per-asset licenses**, many CC BY 4.0, so preserve
  creator credit if incorporating any of them.

The game keeps geometric fallback models and procedural audio when an imported
asset is unavailable. Third-party code/models must be reviewed for their own
licenses before copying.
