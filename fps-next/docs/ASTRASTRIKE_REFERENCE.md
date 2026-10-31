# AstraStrike study and original Crown / Strike implementation

Research dates: 29–30 October 2026. Reference: https://astrastrike.fun/ .

The reference site was inspected through a browser and screenshots of the
landing page were saved locally under `.research/astrastrike-*.png` (ignored
by Git). Publicly visible sections included a dark, orange-accented tactical
landing page, Sniper 1v1, Rifle 2v2, Surf, aim training, inventory, news,
and login/profile navigation. The public interface did not expose its server
source, database, complete matchmaking rules or licensed game assets. No
claim is made that these have been reproduced.

## Implemented now

- An original, responsive **CROWN / STRIKE** menu with orange/black visual
  direction, tactical typography, multiple direct-create mode tiles/links, a room
  creator, a friend invite form and settings. All game code and UI markup were
  written for this project; no AstraStrike artwork, brand marks or source code
  is bundled.
- Sniper Duel is a two-player, opposing-team arena mode with fixed sniper
  loadout, elimination rounds, no mid-round respawns and first to five round wins.
  Rifle 2v2 uses four players, fixed rifle loadout and first to nine round wins.
  Both use 115-second round clocks and short breaks between rounds.
- Existing larger Team Warfare mode supports 16 seats and 2–4 teams on Crown
  Island. Battle Royale, FFA, Gun Game, Survival, a practice range, chat,
  inviting by room code, lobbies, bots and map rotation remain accessible.
- The aim-training range supports an optional **60-second precision challenge**
  with target hit points, streak bonuses and an in-session best score. Press
  `G` to begin/retry; `T` returns to free practice. It is a local timed mode,
  not AstraStrike's proprietary aim-course implementation.
- Range settings now offer 1–12 bots, target distance from 10 to 100 metres,
  standing/strafe/running/crouching behavior, none/light/heavy armor and
  infinite ammunition, persisted locally between sessions.
- Desktop pointer lock/mouse or trackpad/controller input, 3D shooting and
  server-managed scores. Five optimized CC0 gunshot clips, a CC0 fallback
  M4A1, and a CC BY 4.0 first-person M4A1-and-arms rig were added independently;
  source and attributions are in
  [GUN_AUDIO_ASSETS.md](GUN_AUDIO_ASSETS.md).
- The connection indicator changes from "CONNECT TO PLAY" to "SERVER
  CONNECTED" only after a successful WebSocket connection; it resets after
  leaving or disconnecting.
- The landing page now renders a full-width Three.js tactical courtyard and a
  properly attributed third-party tactical operator, with a separately licensed
  CC0 fallback. License details are in [LOBBY_ASSETS.md](LOBBY_ASSETS.md).
- The Arsenal workbench lists 15 primary weapons, filters them by class,
  previews independently licensed models with pointer-drag inspection,
  shows weapon stats, and persists the equipped loadout for practice or
  multiplayer. Mobile navigation includes Play, Arsenal, Friends and Settings.
  See [GUN_AUDIO_ASSETS.md](GUN_AUDIO_ASSETS.md) and the bundled asset credits.
- A new independently CC0-licensed, scoped 94k-triangle tactical sniper GLB
  replaces the flat Quaternius rifle in the Arsenal and FPS view, with a
  10k-triangle model and the old Quaternius OBJ retained as load fallbacks.
  The GLBs are original third-party assets, not AstraStrike game files.
- Two independently built solo Surf time trials: **BOREAS** (four banks and
  three gates) and **UTOPIA** (five banks and four gates). Both use dedicated
  bank/slope movement physics, live speed and timer HUD, checkpoint and full
  resets, and separate local personal-best records. Their geometry, colors and
  physics require visual and gameplay tuning against public reference footage.

## Reference feature gap

### 30 October 2026 — slate gear, stance, and street portrait refinements

Compared `.research/astrastrike-menu-reference.png` with the latest local
`%TEMP%/arena-fps-menu-desktop.png` at a 1418 × 802 viewport. The original
CC BY 4.0 tactical vest retains its folds but now has desaturated grey-olive
webbing. The CC0 road material was made lighter while its original authored
markings remain. The respirator's fabric crown and brow were shortened to
remove an artificial flat visor appearance, and the independent operator rig's
upper leg bones were rotated slightly outward for a more grounded stance.

The licensed CC0 M4A1 mount was lowered by a net 0.18 scene units
(from Y=2.96 to Y=2.78) and given a steeper
screen-space diagonal to align better with the reference's chest-level weapon.
An original feathered blue-grey road-shadow decal adds tonal depth beneath the
operator and preserves the separate worn-pavement texture. Neither adjustment
uses reference-site game assets or extracted code.

After the final weapon and shadow adjustments, `npm run build` passed (64 Vite
modules; only the existing large-chunk advisory remains), and a freshly rebuilt
`npm run smoke:menu` passed with an elevated Windows Chrome launch. It covered
1418 px desktop and 390 px mobile, eight mode buttons, 15 Arsenal entries,
private room creation, both Surf routes and practice persistence, with no
browser errors or viewport overflow. The final wrist-to-grip offsets measured
0.020 and 0.060 scene units. `npm test` also passed all 336 tests with
loopback socket access enabled for the five WebSocket integration tests. The
original detailed operator art, gun materials,
environment mesh, animations, identity providers and matchmaking still differ
substantially; parity remains unproven, and no official AstraStrike repository
has been authenticated.

### 30 October 2026 — operator portrait follow-up

The previous portrait iteration accidentally left an oversized, floating
procedural hood sphere above the operator's gas mask. The extra sphere has been
removed. The independently authored respirator now uses a deterministic,
fine-grain bump map for weathered rubber, a shorter fabric crown, darker
eyepiece rims, reduced artificial reflections and subtle cheek seams. The
khaki recolor of the original CC BY tactical vest and the deeper-positioned
street arch are retained. No AstraStrike models, audio or textures were copied.

After the fix, `node --check client/src/menuShowcase.js`, `npm run build` and
`npm run smoke:menu` passed, including a rendered desktop capture at
1418 × 802 and mobile checks at 390 px. The browser probe found all eight mode
buttons, the 15-item Arsenal, working private Duel creation, two solo Surf
courses and configurable practice. Both wrist-to-grip distances were 0.016
scene units. The latest desktop screenshot is generated at
`%TEMP%/arena-fps-menu-desktop.png`; compare it with
`.research/astrastrike-menu-reference.png` before further portrait changes.
The full Node suite passed **336/336** tests with localhost sockets enabled.

The screenshots still clearly differ in the detailed character, animation,
weapon, environmental geometry, original art, authentication and matchmaking.
No original upstream AstraStrike repository has been authenticated.

### 30 October 2026 visual iteration (1418 × 802 desktop)

Latest local screenshot: `C:\Users\HNQuan\AppData\Local\Temp\arena-fps-menu-desktop.png`
(regenerated by `npm run smoke:menu`). An additional original-rendering pass
introduced broad, irregular resurfacing patches on top of the CC0 Road012A
material, darker recessed eye gaskets, angular side filters with intake slots,
and a smaller multi-port exhalation valve on the procedural respirator. The
reference still shows a substantially different, more detailed operator mesh,
weapon model, street geometry, lighting, and Discord/Steam authentication.
These geometric improvements do not establish matching source assets.

Verification after this pass: `node --check client/src/menuShowcase.js`,
`npm run build`, and `npm run smoke:menu` all passed when the headless browser
was allowed to launch. The smoke result recorded a 1418 px desktop viewport,
390 px mobile viewport, no horizontal overflow, 8 mode buttons, and both rifle
grip-to-hand errors of 0.025 and 0.022 scene units. It also exercised private
room creation, a 15-weapon Arsenal, Boreas/Utopia, and practice settings.
These assertions cover the local app's behavior only, not AstraStrike parity.
The right-side news cards were then shortened to place the upper card near the
reference screenshot's lower-right anchor; a second production build and Chrome
smoke test passed. The full Node suite also passed **328/328** tests.

The original site screenshot at `.research/astrastrike-menu-reference.png`
was compared with a local Chrome capture (written by `npm run smoke:menu`
to the OS temp folder). The local landing now uses a 48 px header, a compact
left mode rail, six original illustrated SVG thumbnail scenes, separate WebGL
layers so the street can be blurred behind a crisp operator, and a blue-gray
recoloring of the attributed operator's suit texture. A simple procedural
respirator was fitted over the independently licensed character's face.

A further 30 October lobby pose pass angles the independently licensed M4A1
upward using a world-space rotation, adjusts its scale and height, and aligns
both hand bones with the rifle's contact sockets. The inspected scene reported
grip errors of **0.013** and **0.023** scene units and stock/muzzle heights of
**2.843** and **3.335**; the detached spare-magazine mesh is hidden because it
otherwise appears to float near the operator. `npm run smoke:menu` now checks
both wrist alignment and the upward stock-to-muzzle slope. These figures
describe the local model only; they do not measure parity with AstraStrike.

The first capture revealed that the respirator floated above the head. Its
placement was lowered and the street was given a textured asphalt road,
lane markings, offset shopfronts and an original suspended sign. The modified
source is `client/src/menuShowcase.js`, with decorative assets generated by
`scripts/generate-menu-art.mjs` in `client/public/menu/`.

This rendering remains visually distinguishable from the reference: the
character mesh, lighting, perspective, materials, level art and gameplay
assets are different. An unverified unofficial extracted repository is not
evidence of a public original source license.

The current menu is a distinct original design, **not a pixel-perfect 100%
clone** of AstraStrike. Solo Surf courses and an independent timed aim-training
challenge are playable, but AstraStrike-specific maps, meshes, movement tuning,
networked Surf results, accounts, unlockable inventory, skins marketplace,
persistent profile, ranked matchmaking and a news backend are still absent.
The larger island is a stylized environment with a mix of
terrain, buildings and cover, not a photorealistic production FPS map.
The original public source repository for AstraStrike's live client and server
has not been verified; the reference site's terms restrict redistribution of
proprietary media. Only independently licensed assets are bundled here.

## Source search and asset provenance, 30 October 2026

- Searches for `astrastrike.fun`, `AstraStrike`, `AWP Duel`, `Boreas` and
  `Utopia` alongside GitHub/repository terms returned no verified upstream
  public source repo for the reference FPS. Similar names (such as **Astral
  Strike**, an unrelated vertical arcade shooter) are **not** that game's repo.
- Direct GitHub inspection confirms the three public leads are not an
  authenticated upstream project. `wdawdadwaawd-byte/astrastrike.fun-reverse_engineering`
  contains a README, MIT LICENSE and two large deobfuscated JavaScript files
  (about 2.1 MB and 2.6 MB); its tree contains no model or audio assets.
  `TEMACHIK/AstraStrike-files` contains extracted JavaScript bundles, lobby
  CSS and a vendor bundle, but no GLB/GLTF/FBX models or audio directories.
  `HomuHomu833-garbage/astrastrike-electron` is a small Electron shell forked
  from `wolvesville-electron`, with app bootstrap and icon files rather than
  the game's engine or server. These are unofficial leads, not the original
  source repository or a lawful source for the game's proprietary assets.
- AstraStrike's current terms (updated 21 October 2026) explicitly prohibit
  reverse engineering, and copying/extracting/redistributing its game files,
  meshes, audio and other content. Section 8 also reserves the original code,
  artwork, designs and text to Astra Strike. Source: https://astrastrike.fun/terms/ .
- A third-party playtest from 24 October 2026 describes a Three.js/WebGL/
  WebSocket FPS; 38.8 MB of game downloads during cold-cache Aim Training,
  and Surf courses Boreas and Utopia. These numbers are their measurements,
  **not** measured by our project:
  https://playgamesinbrowser.com/game/astrastrike/ .
- This workspace carries **25 glTF, 15 OBJ, 3 GLB, 1 FBX, 5 WAV** and
  texture/material files from independent sources; their origins and license
  obligations are recorded in `client/public/ASSET_CREDITS.txt`,
  [GUN_AUDIO_ASSETS.md](GUN_AUDIO_ASSETS.md) and
  [LOBBY_ASSETS.md](LOBBY_ASSETS.md).

| Reference feature | Current original implementation | Remaining gap |
| --- | --- | --- |
| Dark, 3D operator lobby | Three.js courtyard and tactical agent | Different art, layout, and visual detail |
| AWP 1v1 / Rifle 2v2 | WebSocket elimination rounds (first to 5 / 9), no mid-round respawn | Physics, models, maps and remaining match rules differ |
| Surf Boreas / Utopia | Two original solo courses, dedicated surf physics, checkpoint resets and local personal bests | Course meshes, movement accuracy and online leaderboards differ |
| Aim Training | Solo practice, configurable bot count/range/movement/armor/ammo and 60-second scored challenge | Original target art, drills and movement still differ |
| Inventory | 15 weapons, live 3D previews, persistent equip | Skins, unlocks, cosmetics and account inventory absent |
| Friends / profiles / ranked | Room codes, friend invite form, local settings | Authentication, persistent social and ranking services absent |
| Bomb defusal | Additional team-based FPS modes | 5v5 economy, plant/defuse, Dust II-scale map absent |
| Mobile | Responsive menu and mobile game inputs | Reference orientation/PWA details and device testing differ |

Prioritize independently licensed, more detailed gun and character models,
better match physics and visual parity, and explicit 2-device browser testing.

The 30 October Surf visual pass adds distinct procedural scenes for Boreas and
Utopia: UV-tiled metal ramps, trim, checkpoint arches, distant environment
silhouettes and thematic signboards. Their geometry and gameplay remain our
own, and comparisons with the public reference still show significant
differences in terrain, materials, level scale and course layout. A detailed
CC0 combat knife and a procedural first-person gloved hand now replace the
older placeholder knife. The 30 October Chrome smoke check confirmed the
three-part `CombatKnife_CC0.glb` loaded successfully in Utopia; the inspected
desktop screenshot shows a raised, serrated steel blade and a smaller glove
with a clear reticle. Mobile gameplay and reference-matched knife animations
still require separate visual testing.

The subsequent 30 October Surf pad correction removed the generic plaster and
concrete textures from both original Surf courses' platform solids, changed
Utopia's start/finish platforms to pale pink and Boreas's to alpine blue, and
added procedural red/cyan guide lines aligned to the existing pad bounds. This
changes only rendering and platform paint; the authored collision boxes,
inclined physics triangles, spawn coordinates and checkpoints are unchanged.
`npm run build`, the complete 328/328 Node test suite (with localhost socket
permission), and `npm run smoke:menu` all passed. The captured Utopia desktop
view confirms that the previous rough dark-gray foreground slab is now smooth
pastel with two uninterrupted longitudinal markings. Its large V-shaped ramps,
environment blocks, gun art and first-person hand still visibly differ from
the reference game's Utopia illustration and require further original work.

Online play requires hosting a persistent Node WebSocket process (see
[DEPLOY.md](../DEPLOY.md)). A localhost browser smoke test validates that a
room can be created and the scene renders; it cannot prove internet-wide
reliability, 16 real simultaneous users, latency or anti-cheat behavior.

## Third-party research repositories (local only)

The 30 October lobby street pass replaces the plain box at the left with a
sloping plaster retaining wall and concrete coping, adds a transparent original
wear/debris decal to the CC0 asphalt, a diagonal foreground shade, warmer fog,
and a hand-painted horizontal-slat roller-shutter texture. Its Chrome desktop
and mobile menu smoke checks and the Vite build passed; Duel room creation,
Arsenal model animation, Surf and Practice navigation remained functional.
A subsequent detail pass further refined the retaining wall's mineral stains,
fracture lines and base erosion, and reduced the perceived asphalt gravel scale.
The road material was then changed to the CC0 ambientCG Road012A set (color,
OpenGL normal, and roughness) to pursue the reference's fine, darker urban
asphalt. The earlier ambientCG Asphalt033 download remains only in ignored
staging because its gravelly beige appearance was a poorer menu match.
The live lobby operator's warm chest webbing was also cooled to grey-green at
runtime, keeping the independently licensed CC BY mesh and source maps intact.
These changes target the layout of the public menu reference; the independent
operator model, environment asset set, map geometry and game systems remain
substantially different from AstraStrike. The source and asset rights of the
live game have not been verified, and exact visual/gameplay parity is unproven.

Additional public GitHub references found on 30 October 2026:

- https://github.com/TEMACHIK/AstraStrike-files (created 29 October):
  third-party collection claiming to contain extracted client JavaScript, CSS
  and deobfuscated scripts. It is **not verified official source** and does not
  grant rights to reuse the site's code or artwork.
- https://github.com/wdawdadwaawd-byte/astrastrike.fun-reverse_engineering
  (created 29 October): independent reverse-engineering notes and deobfuscated
  client-side JavaScript. Its repository's MIT license does **not** establish
  redistribution permission for third-party AstraStrike code. The README's
  descriptions of modes and maps are secondary claims requiring verification.
- https://github.com/HomuHomu833-garbage/astrastrike-electron (created
  25 September): an MIT Electron wrapper that opens the live website; it does
  not contain the original game's backend or standalone engine.

These repositories are research leads. This project does not copy or ship
third-party extracted scripts or proprietary game assets.

1. https://github.com/JCodesMore/ai-website-cloner-template — MIT, cloned
   under `.research/ai-website-cloner-template`. Installed Node dependencies
   with `npm ci`; ESLint and TypeScript checks passed. Its Next.js production
   build could not fetch Google Fonts over the available network. This is a
   website-layout analysis/template tool, not an FPS game engine. It was not
   used as a second runtime or mixed into the Three.js client.
2. https://github.com/morluto/rea — MIT, cloned under `.research/rea`.
   JavaScript dependencies were installed with a compatible local Node 24
   runtime. Its native Windows binary/manifest was missing after install, so
   the complete CLI/native analysis functionality could not be verified.
   REA is a reverse-engineering toolkit, not a drop-in multiplayer backend.

Both checkouts, downloaded tooling and browser captures remain ignored by Git.
Only explicitly reviewed and appropriately licensed third-party assets should
be moved into production.

## Development priorities for feature parity

### 30 October 2026 — native app install entry point

Added an independently branded `GET APP` action to the desktop and touch
menus. The installable browser shell has a web app manifest, 192px and 512px
maskable PNG icons, an SVG favicon, and a platform-sensitive install dialog.
Where supported, a captured `beforeinstallprompt` event invokes the native
installation UI; otherwise the dialog explains Safari/Android/desktop steps.
The presence of the button does not imply that any device/browser will offer
installation. Multiplayer still requires the online backend. There is no
offline service worker and no claim of a downloadable native app.

Production browser smoke also checks icon/manifest HTTP responses, the native
prompt handler via a simulated event, help dialog and viewport layout at
desktop and mobile dimensions.

### 30 October 2026 — lobby operator grip and respirator refinement

The independently licensed tactical operator is presented at a more frontal
angle, with original side-canister, nose-bridge and vent geometry added to its
procedural respirator. The lenses were reduced and given a less reflective
material after side-by-side review of the local desktop screenshot and the
public AstraStrike menu capture. The mask remains a stylized approximation;
its headgear, body rig, gloves and weapon still differ substantially from the
reference artwork.

The upper-arm/forearm grip-fitting loop now uses up to 36 iterations and a
1.10-radian joint deviation limit. The Chrome `?debugAssets` probe reports
hand-to-rifle-socket distances of **0.025** (right) and **0.022** (left)
scene units; previously they were **0.025** and **0.060**. The distance probe
is a positional check only, not proof of anatomically correct finger placement.
After this pass, `node --check client/src/menuShowcase.js`, `npm run build`,
and `npm run smoke:menu` passed. The browser smoke exercised 1418-pixel desktop
and 390-pixel mobile menu layouts, eight mode tiles, five mobile navigation
targets, the 15-weapon Arsenal, WebSocket Duel room creation, both Surf
courses and configurable aim training. The screenshot and tests do not
establish pixel-identical visuals, identical game assets, full matchmaking,
or production multiplayer behavior. The original game repository remains
unverified; only independently licensed assets are eligible for this project.

### 31 October 2026 — material refinement and multi-mode verification

Another original 3D menu pass added procedural cracks and chipped aggregate to
the sunlit roadway, darkened the vest webbing, varied the cloth hood's profile
and added short fabric seams. The excessive flat hood-neck cylinder was lowered
and shortened. Desktop screenshots were compared at 1418 x 802 to the public
AstraStrike menu reference. The UI layout is similar, but the game still uses
different licensed models, textures, animation and map geometry; no claim of
100% graphical similarity is supported by the captures.

`node --check client/src/menuShowcase.js`, `npm run build`, 336/336 Node tests
and `npm run smoke:menu` passed. The menu test covered desktop and mobile
overflow, gas-mask/rifle asset loading, rifle-grip distances of 0.020 and
0.033 scene units, eight mode tiles, install/fullscreen/sound controls,
guest profile, weapon preview/equip, a private Duel room, both Surf courses
and persisted aim-training settings. `npm run smoke:browser` passed for a
default TDM room of two players; separately configured browser runs passed
for Duel (two users, animated CC0 sniper), Squads (four), Retake (six,
planted-bomb HUD and licensed objective model) and four-team TDM (16 WebSocket
clients). All checked match scenes loaded WebGL, accepted movement and
confirmed shooting. `npm run smoke:modes` now repeats the five scenarios.

These are automated Chrome runs with loopback WebSocket clients, not a 16-person
remote playtest. Chrome's headless pointer-lock check uses a simulated fallback.
The backend still requires external latency, reconnect, gamepad and load
testing before production multiplayer claims can be made.

1. Deploy persistent `wss://` backend; test two remote machines and then a
   16-person four-team session with measured packet loss, reconnects and FPS.
2. Make authoritative movement, server-validated hitboxes and robust session
   reconnection before adding any ranked or competitive progression.
3. Tune the existing Surf physics and visual geometry against public gameplay
   references, validate checkpoints, and add tested multiplayer Surf rooms and
   leaderboards. Refine the existing scored aim-training range.
4. Build an optional authenticated identity, inventory/progression and match
   history with a database, migrations and privacy controls.
5. Upgrade character rigs, animation and terrain meshes with audited asset
   licenses; optimize draw calls, texture sizes and LOD across larger maps.
