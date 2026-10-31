# CROWN STRIKE — Source weapon rigs, first-person hands and real-GPU validation

Date: 2026-10-31. Scope: `fps-next`. This report records the observed status on the current device, not target performance on other computers.

## First-person arsenal: actual geometry status

- **17/17 weapon IDs now render real skinned first-person arms**: `skinnedWeaponHands.js` binds an independent 68-bone, textured `FPArms` clone from `models/fp/m4a1.glb` for each weapon, with per-weapon grip offsets. `weaponHands.js` remains a fallback if the skinned asset fails to load; the knife animates a dedicated blade-hand slash. The original source gun is removed when the same armature is attached to another gun.
- **17/17 weapon-specific skinned animation profiles** include distinct code-authored fire/recoil, reload manipulation and inspect curves with finger-joint motion, idle breathing and ADS compensation. These are live bone poses, not retargeted motion-capture or hand-authored `.glb` clip libraries. Source mechanisms move separately during reload; exact two-hand contacts still need an artist/IK pass.
- **16/16 firearms** now load a source-authored or genuine source-mesh-separated mechanical rig. The `rifle` M4A1 and `sniper` Chassis Sniper use their source-authored parts; nine Quaternius OBJ guns use extracted original faces; the remaining five Toon Shooter glTF guns use original indexed triangles reorganized into separate glTF nodes. Runtime diagnostics confirm that all 14 extracted models load with their moving parts and without overlapping supplemental mechanisms.
- **Source fidelity**: original OBJ vertices, UVs, normals and MTL are preserved, with 6,365 faces partitioned across nine OBJ rigs. Five glTF splits preserve original binary buffers, accessors, buffer views, materials, textures and each indexed triangle (5,022 total source triangles). Only new index buffers and rig nodes are appended. The generator includes deterministic `--check` mode; automated tests validate exact geometry identity, part poses and transform restoration.
- **Reload and hand follow**: all 14 extracted source rigs have separated moving geometry. The previous mechanical-part-follow logic and the newer skinned bone curves give approximate reload contact, including reset on interruption; they do not solve contact by inverse kinematics. The ShortCannon original has no separable magazine: its real barrel assembly is animated as recoil.
- **Weapon material finish**: `weaponFinishes.js` gives 14 untextured source meshes restrained tactical metallic/polymer/wood PBR finishes while retaining original geometry, mesh separation, transparent materials and textured surfaces. The authored M4A1 and Chassis Sniper retain their original surface work.
- **Remaining visual-art work**: the arms are genuinely skinned and textured, but are adapted from a single source rig. Several low-poly source guns, approximate grip alignment, clip transitions and bone/socket contact still need Blender/animation-artist polish. A complete separately authored clip set and hand-authored inspect poses for every firearm remain open production-quality goals.

Rig/moving-parts coverage:

| Weapon ID | FPS hand pose | Model geometry/animation status |
| --- | --- | --- |
| `rifle` | 68-bone textured FPArms + rifle curves | Authored M4A1 moving assembly |
| `sniper` | 68-bone textured FPArms + sniper curves | Authored Chassis sniper action |
| `pistol` | 68-bone textured FPArms + pistol curves | Toon glTF: actual Slide island |
| `smg` | 68-bone textured FPArms + SMG curves | Toon glTF: actual Magazine island |
| `shotgun` | 68-bone textured FPArms + shotgun curves | Toon glTF: actual Pump island |
| `lmg` | 68-bone textured FPArms + LMG curves | Toon glTF: actual Barrel island |
| `dmr` | 68-bone textured FPArms + DMR curves | Toon glTF: actual Magazine island |
| `revolver`, `machinepistol` | 68-bone textured FPArms; independent curves each | Quaternius OBJ: actual Cylinder / Slide |
| `smg_compact`, `smg_heavy` | 68-bone textured FPArms; independent curves each | Quaternius OBJ: actual Magazine |
| `carbine`, `bullpup` | 68-bone textured FPArms; independent curves each | Quaternius OBJ: actual Magazine |
| `sawnoff`, `autoshotgun` | 68-bone textured FPArms; independent curves each | Quaternius OBJ: actual Barrels / Pump |
| `antimateriel` | 68-bone textured FPArms + dedicated curves | Quaternius OBJ: actual Bolt |
| `knife` | 68-bone textured FPArms + slash curves | No firearm mechanism required |

The two-Chrome test requires **all 17 models** to reach `ready`, all 17 armatures to expose skinned hands and 68 source bones, all 14 extracted firearms to expose the exact source-rig parts, zero supplemental overlays on extracted meshes, and the two authored guns to identify their rigs. Each Chrome also observes the other player's movement, crouch, shots and reload broadcasts. The post-finish 3-second GPU smoke passed with separate Chrome PIDs `28652` and `26412` and zero console errors (`two-chrome-2026-10-31T05-00-20-416Z.json`). It produced 34 idle and 32 reload images of skinned hands. Browser warnings about Three.js deprecations and shaders were recorded separately and are not errors.

The original source asset contains the **68-joint skinned first-person M4A1 rig** and one authored `grip_vgrip` clip; the remote tactical operator has **88 joints** and no embedded animation clips. The runtime now shares the first-person arm mesh by separate skeleton-safe clones. It does not yet have a complete retargeted, studio-authored first-person clip library for the other weapons.

## Long-running graphics results: RTX 5060 Laptop GPU / ANGLE D3D11

Two distinct headless Chrome processes (different PIDs and profiles) ran simultaneously, joined the same game room and rendered both local and remote players. Measurements are browser `requestAnimationFrame` scheduling intervals. *They are not GPU timer queries* and cannot establish VRAM usage or thermal throttling. Two Chromes on one computer still use **one physical GPU**.

| Scene | Quality / effective render pixel ratio | Duration | FPS, host / guest | Worst client p95 / p99 frame interval | Browser console errors |
| --- | --- | ---: | --- | --- | --- |
| Courtyard | Auto / 1 | 90s | ~179.4 / 179.2 | 5.7 / 5.7 ms | 0 |
| Courtyard | High / 2 | **180s** | **178.7 / 178.8** | **5.7 / 5.7 ms** | **0** |
| Island | High / 2 | **60s** | **180.0 / 179.9** | **5.7 / 5.7 ms** | **0** |
| Courtyard | High / 2 | **600s** | **150.4 / 148.8** | **11.2 / 11.2 ms** | **0** |
| Courtyard, GPU telemetry | High / 2 | **60s** | **100.0 / 130.4** | **11.2 / 16.7 ms** | **0** |
| Courtyard, after glove revision, GPU telemetry | High / 2 | **60s** | **92.3 / 93.3** | **16.6 / 16.8 ms** | **0** |
| Courtyard, **17 skinned hand rigs**, GPU telemetry | High / 2 | **600s** | **174.6 / 175.9** | **5.7 / 11.1 ms** | **0** |

For the 180-second Courtyard run, each player saw one remote player, four shot events and one reload event, including confirmed crouch; each moved ~5.6 m. Each Chrome recorded six 30-second timing segments. Segment p95 was 5.7 ms at the beginning and end; host saw five frames longer than 16.67 ms, guest saw one. The 60-second Island run had two players and no frames over 16.67 ms. **It is not a 16-Chrome stress test.**

The **600-second Courtyard run** (`two-chrome-2026-10-31T02-15-57-143Z.json`) used two independent Chrome PIDs `25588` and `29268`, the RTX 5060 Laptop GPU via ANGLE/D3D11, 1920×1080 viewport, High quality and DPR 2. Each client loaded 17/17 weapons, saw one remote player, observed crouch, four shots and one reload, and moved ~5.7 m. Host/guest recorded 331/298 frames above 16.67 ms and 9/9 frames above 33.34 ms. First 30-second p95 was 11.2/11.2 ms; last 30-second p95 was 11.1/11.1 ms. There was no observed end-of-run p95 regression, though intermediate periods varied. Heap changed by **+7.98 / -16.45 MiB** respectively; fluctuations with garbage collection cannot prove memory-leak absence.

In the Island run, JS heap changed by +21.52 MiB on host and -8.03 MiB on guest. These deltas are sensitive to garbage collection, so neither sign proves the presence or absence of a leak. The independent short 3-second model-coverage smoke reported ~129–132 FPS; warm-up/transient differences make it unsuitable for sustained FPS comparison. Comparing the 600-second and shorter benchmark FPS figures does not establish a performance gain or regression because camera positions, scene complexity and draw calls differ.

The independent 60-second telemetry run (`two-chrome-2026-10-31T02-45-04-150Z.json`) recorded **12 host-wide `nvidia-smi` samples** at 5-second spacing: GPU utilization 34–44% (mean 39.92%), used GPU memory 3,846–3,953 MiB (mean 3,878.92 MiB), temperature 65–70°C (mean 68.83°C), and draw 49.33–53.59 W (mean 51.18 W). These metrics include unrelated applications and cannot be attributed to either Chrome. They do not substitute for actual per-render-process GPU timing/VRAM profiling. An earlier single snapshot during the 600-second run recorded 43% utilization, ~3,882 MiB memory, 69°C and 50.88 W.

**Post-glove-revision repeat:** the independent 60-second run (`two-chrome-2026-10-31T03-28-19-051Z.json`) launched Chrome PIDs `32764` and `27892`, each using the RTX 5060 Laptop GPU renderer via ANGLE/D3D11, at 1920×1080, High and DPR 2. Host/guest averaged **92.3 / 93.3 FPS**, with p95 **16.6 / 16.6 ms** and p99 **16.8 / 16.7 ms**. Each observed the other player's movement (~5.7 m), crouch, four shots and one reload, with zero browser console errors. The first/last 30-second p95 was host **16.7/16.6 ms**, guest **16.6/11.3 ms**. The 13 host-wide GPU telemetry samples averaged **29.85%** utilization, **3,706 MiB** used memory and **42.67 W**, with temperature **66–69°C**. The differences against older measurements are **not evidence of a speedup or regression** without normalized scene/camera and background GPU load.

**Skinned-hands 600-second repeat (latest):** `two-chrome-2026-10-31T05-01-24-676Z.json` completed successfully with independent Chrome PIDs **12372 / 17668**, each reporting the **same NVIDIA RTX 5060 Laptop GPU** through ANGLE/D3D11. Both ran Courtyard at **1920×1080, High quality, DPR 2** for **600,008 ms**, loaded **17/17 skinned arm rigs with 68 bones** and source weapon mechanisms, and observed the other player's movement (~5.7 m), crouch, four shot events and one reload event. Host/guest FPS were **174.6 / 175.9**, p95 **5.7 / 5.7 ms**, p99 **11.1 / 11.1 ms**, with **28 / 27** frames over 16.67 ms and **6 / 6** over 33.34 ms. The first and last 30-second p95 remained **5.7 ms** on both clients. JS heap changed by **-25.02 / -23.67 MiB**, which cannot establish leak absence. **120 host-wide `nvidia-smi` samples** across ten minutes recorded mean GPU utilization **48.95%** (36–58%), used memory **3,883 MiB** (3,810–4,016 MiB), temperature **75.23°C** (72–81°C) and board power **54.58 W** (44.83–61.77 W). This is host-wide telemetry, not per-Chrome GPU timing/VRAM allocation; differences from previous runs cannot be attributed solely to the new rig or materials.

Detailed reports:

- `docs/benchmarks/two-chrome-2026-10-31T00-41-47-138Z.json` (90s Auto, Courtyard)
- `docs/benchmarks/two-chrome-2026-10-31T01-14-27-051Z.json` (180s High, Courtyard)
- `docs/benchmarks/two-chrome-2026-10-31T01-18-47-759Z.json` (60s High, Island)
- `docs/benchmarks/two-chrome-2026-10-31T01-41-13-200Z.json` (earlier High, Courtyard comparison)
- `docs/benchmarks/two-chrome-2026-10-31T02-15-57-143Z.json` (600s High, Courtyard)
- `docs/benchmarks/two-chrome-2026-10-31T02-45-04-150Z.json` (60s High, Courtyard, GPU/VRAM/temperature/power samples)
- `docs/benchmarks/two-chrome-2026-10-31T02-26-39-777Z.json` (3s GPU screenshot test)
- `docs/benchmarks/two-chrome-2026-10-31T02-26-39-777Z-host.png` (host screenshot)
- `docs/benchmarks/two-chrome-2026-10-31T02-26-39-777Z-guest.png` (guest screenshot)
- `docs/benchmarks/two-chrome-2026-10-31T02-40-41-807Z.json` (34 per-weapon idle captures: 17 IDs × two independent Chrome clients)
- `docs/benchmarks/two-chrome-2026-10-31T02-40-41-807Z-host-contact.jpg` and `-guest-contact.jpg` (idle contact sheets)
- `docs/benchmarks/two-chrome-2026-10-31T03-02-51-562Z.json` (3s independent-Chrome live gameplay after contact-follow change)
- `docs/benchmarks/two-chrome-2026-10-31T03-05-33-856Z.json` (3s GPU smoke plus 34 idle and 32 reload poses: each of 16 firearms on two clients)
- `docs/benchmarks/two-chrome-2026-10-31T03-05-33-856Z-host-reload-contact.jpg` and `-guest-reload-contact.jpg` (16-firearm reload-pose contact sheets)
- `docs/benchmarks/two-chrome-2026-10-31T03-25-03-202Z.json` (after glove geometry revision, 3-second two-Chrome GPU smoke and 34 idle plus 32 reload captures)
- `docs/benchmarks/two-chrome-2026-10-31T03-25-03-202Z-host-idle-contact.jpg`, `-guest-idle-contact.jpg`, `-host-reload-contact.jpg`, `-guest-reload-contact.jpg` (four post-revision visual contact sheets)
- `docs/benchmarks/two-chrome-2026-10-31T03-28-19-051Z.json` (60-second independent-Chrome post-revision run with host-wide `nvidia-smi` sampling)
- `docs/benchmarks/two-chrome-2026-10-31T05-00-20-416Z.json` (3-second two-Chrome smoke, skinned hands 17/17, 34 idle and 32 reload screenshots)
- `docs/benchmarks/two-chrome-2026-10-31T05-00-20-416Z-host-idle-skinned-contact.jpg`, `-guest-idle-skinned-contact.jpg`, `-host-reload-skinned-contact.jpg`, `-guest-reload-skinned-contact.jpg` (four latest 17-weapon skinned-arm comparison sheets)
- `docs/benchmarks/two-chrome-2026-10-31T05-01-24-676Z.json` (latest 600-second independent-Chrome skinned-arm GPU-telemetry run)
- `docs/benchmarks/gpu-benchmark-summary.json` (generated by `npm run bench:summary`)

The aggregator excludes incomplete/short tests; groups by optional machine label, renderer, map, quality, viewport and actual render DPR; and reports worst p95/p99 plus early/late interval drift. As of 2026-10-31 it finds **8 eligible runs of at least 60 seconds on 1 verified GPU renderer model**, with **2 user-supplied machine labels** that both identify the same local RTX 5060. Therefore **multi-GPU comparison is unverified**. `DUAL_MACHINE_LABEL` helps group different test machines but is user-provided metadata; distinct labels alone do not prove distinct physical GPUs. The 3-second visual runs are excluded from long-run statistics by design.

### Image review of independent Chrome captures

The initial two 1920×1080 images show the M4A1 first-person viewmodel with textured arms and readable HUD; at the sampled idle pose there is no obvious arm/body intersection or duplicate mechanism. The 34-image full-arsenal idle pass subsequently confirmed recognizable silhouettes for all 17 weapons on both Chrome clients, while revealing the visibly crude, angular procedural gloves and model presentation that still needs art direction.

The latest GPU smoke passed on two distinct Chrome PIDs `33764` and `18152` with no JavaScript errors. Its optional **diagnostic-only reload capture** froze each firearm at a mechanism-specific phase (0.45 for magazine/cylinder/breech, 0.86 for bolt/slide/pump/barrel), producing **32 reload images** and **34 idle images**. The report checks every one of the 14 extracted source mechanisms has moved and records support-hand travel on both browsers (approximately 0.13–0.37 viewmodel units across source rigs). The paired reload contact sheets show the hands and moving gun assemblies; they are useful for identifying silhouettes and large alignment errors, **but do not prove physically exact grip contacts, animation transitions or production art quality**. The source mechanism contact checks run in browser render frames; the independent unit tests verify transform following and interrupted-reload reset. The renderer's diagnostic override does not change gameplay inventory, ammo or server protocol.

The **post-revision** 3-second independent-Chrome pass also succeeded with separate PIDs `28068` and `27532`, a verified hardware renderer on each, zero reported console errors, **34 idle and 32 firearm reload screenshots** and four updated contact sheets. Host/guest averages were **161.9/165.5 FPS** with p95 **11.1/11.1 ms**; this short visual smoke is not a long-run performance result. Visual inspection showed smoother glove profiles and recognizable separated gun parts, but the gloves remain substantially simpler than the authored M4A1 arms. Diagnostic screenshot overrides may retain the player's currently equipped weapon name in the gameplay HUD.

The **latest skinned-arm** 3-second visual smoke used PIDs `28652` and `26412` and captured **34 idle + 32 reload screenshots**. The four `05-00-20-416Z` contact sheets confirm that **all 17 weapons visibly use the textured skinned hands**; the source gun silhouettes and moving parts remain recognizable. The authoring quality is still limited by the low-poly source gun meshes, approximate finger placement and hand-to-weapon contacts, which need an artist pass. These renders do not prove a human-operated hardware-mouse playtest.

### Automated verification and build

The latest full Node run in `docs/benchmarks/full-tests-skinned-2026-10-31.log` passed **383/383 tests, 0 failed**, including the skinned-arm animation and weapon-finish tests. An earlier sandboxed invocation passed 371/376 but hit five `connect EACCES 127.0.0.1` localhost permission failures; subsequent runs with localhost access passed the full suite. The **latest standard production build** passed (78 Vite modules, JS **1,068.72 kB / gzip 310.79 kB**); a diagnostic build also passed (78 modules, JS ~1,069.33 kB / gzip 311.07 kB). Both retain the >500 kB chunk warning. Both source-asset generators passed deterministic `--check` on 2026-10-31; targeted weapon-finish/skinned-hand tests passed **7/7** and `git diff --check` succeeded with only non-fatal line-ending warnings. The first sandboxed two-Chrome run could not launch Windows Crashpad; the authorized outside-sandbox run passed. The browser graphics check is separate from a human-operated headed Chrome playtest.

## Reproduce and complete multi-GPU validation

Run on every **different physical computer/GPU** that needs validation. Two Chrome processes on one GPU are an independent-client stress test, not a cross-GPU comparison. Set `CHROME_PATH` if Chrome is installed elsewhere. From `fps-next` in PowerShell:

```powershell
npm ci
python scripts/build-rigged-weapons.py --check
python scripts/build-rigged-gltf-weapons.py --check
npm test
$env:VITE_VISUAL_DIAGNOSTICS = '1'; npm run build
$env:DUAL_REQUIRE_GPU = '1'; $env:DUAL_GPU_TELEMETRY = '1'; $env:DUAL_BENCH_MS = '600000'
$env:DUAL_WIDTH = '1920'; $env:DUAL_HEIGHT = '1080'; $env:DUAL_DPR = '2'
$env:DUAL_QUALITY = 'high'; $env:DUAL_MAP = 'courtyard'
$env:DUAL_MACHINE_LABEL = 'lab-machine-a' # Set a unique, truthful label on each physical test PC
npm run smoke:dual
$env:DUAL_CAPTURE_SCREENSHOTS = '1'; $env:DUAL_BENCH_MS = '3000'
npm run smoke:dual
# Optional: capture every first-person gun and knife from both browsers as JPEGs
$env:DUAL_CAPTURE_ARSENAL = '1'
$env:DUAL_CAPTURE_RELOAD = '1'  # Diagnostic-only reload pose per firearm
npm run smoke:dual
npm run bench:summary
```

Copy all `two-chrome-*.json` outputs from those machines to the main machine's `docs/benchmarks/`, preserving unique filenames, and run `npm run bench:summary` there again. Verify results for at least one additional physical GPU (for example Intel/AMD integrated graphics), compare actual render DPR, draw calls, p95/p99, quality, and heap behavior over 10 minutes, and collect utilization/VRAM/temperature data with a hardware profiler. Enable `DUAL_CAPTURE_SCREENSHOTS=1` on a short run to save screenshots from both Chrome instances. A real mouse pointer-lock and aim/reload evaluation still requires a headed desktop playtest; automated input uses an emulated pointer-lock DOM state.

After diagnostic work, run `Remove-Item Env:VITE_VISUAL_DIAGNOSTICS -ErrorAction SilentlyContinue; npm run build` for the standard production bundle.

## Remaining production gates

1. **Artist-authored finish:** the procedural glove fallback has been replaced in the default path by a genuinely skinned, 68-bone textured hand rig on 17/17 weapons. Complete authored hand-to-weapon attachment sockets, IK contact correction and dedicated Blender/mocap clips for reload, idle, ADS, fire and inspect where studio-level quality is needed; current motion is individual **code-authored bone-keyframe timelines**.
2. **Visual acceptance:** in an animation editor and headed browser, check per-gun grip positions, bone skin weights, source-part pivots, finger intersections and transitions during ADS, firing, interrupted reload and weapon switch. The geometry and automated render gates have passed; exact contact and art-quality gates remain open.
3. **External hardware acceptance:** execute `PHYSICAL_MOUSE_AND_SECOND_GPU_CHECKLIST.md` on a headed desktop with a real physical mouse, then repeat the **600-second** benchmark on a second **active and distinct physical GPU**. The local device currently exposes only the RTX 5060 as an active GPU; neither two Chrome PIDs nor the disconnected Intel display adapter satisfy this requirement.
