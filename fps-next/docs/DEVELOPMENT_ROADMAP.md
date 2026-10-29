# FPS NEXT — Audit and development roadmap (2026-10-29)

## Goal and current baseline

The user wants a fun, convincing 3D browser shooter for friends, at most **16 human
players** in one game, up to **4 competing teams**, large visually detailed maps,
and deployment of the web frontend on Vercel. The original workspace in
`D:\Bansungdemo` remains available as a reference. This working game is an
independent local clone in `D:\Bansungdemo\fps-next` of
[`Hazzad123/fully-ai-arena-fps`](https://github.com/Hazzad123/fully-ai-arena-fps)
(MIT, upstream clone at `920b123d67015d5e8151a4ebd6742d8015d538be`).
Treat this as an adapted codebase; preserve source attribution and the MIT file.

### Why this repo is a stronger starting point

- `client/src/` already supplies a Three.js scene, FPS input, weapons, practice
  range, UI, interpolation, map rendering, animation and effects.
- `server/index.js` supplies HTTP/WebSocket, short invite codes, live rooms,
  matchmaking and health endpoints; `server/room.js` implements a 20Hz room tick.
- `shared/` keeps map geometry, movement collision, protocol, game constants and
  weapons consistent between browser and server.
- `test/` covers collision, gameplay, multiplayer room rules and WebSocket flows.
- The MIT code license and separate CC0 art sources offer a modifiable baseline.

### What has already been adapted locally

- A deterministic 540m × 540m Crown Island with distinct named areas, indoor
  spaces, roads, vegetation/cover and four separated team spawn regions.
- Team Deathmatch supports 2, 3 or 4 teams, no friendly fire, 16 player slots;
  4-team tests verify a 4/4/4/4 split. Battle Royale is capped at 16 as well.
- Lobby selection, bot replacement when humans join, score and minimap support,
  WebSocket 16th join / 17th rejection testing, Vercel static build configuration.
- Fixed same-room join detachment, room registration failure handling, disposal
  after the last human leaves, and a Windows-compatible production start script.

### Current limitations that matter to playability

1. The large island is code-generated from axis-aligned boxes, and environment
   textures are stylized. The character and weapons come from a **Toon** kit.
   This is not a realistic/photorealistic game yet.
2. Most movement authority is on the client. The server sanity-checks positions,
   firing rate and shots, but networking remains vulnerable to crafted input.
   No client prediction/reconciliation or lag-compensated server hit detection.
3. A single Node process owns all rooms in memory. There are no persistent
   player accounts, ranking, reconnect/session recovery or distributed servers.
4. Headless browser checks verify WebGL, lobby and a live scene, but headless
   pointer lock is unreliable. **Headful two-machine WASD, aim and shooting are
   a required acceptance test** before calling this generally playable.
5. Large scenes need measured GPU/CPU profiles, sensible LOD, occlusion and
   texture memory budgets before importing high-resolution 3D assets.

## Delivery milestones, in order

### P0 — Reliable playable vertical slice (highest priority)

**Scope:** Create/Join by code; host selects 2–4 teams; 16 human sockets;
countdown; respawn; movement, jumping, aiming, firing, hit registration, death,
scoreboard, results and replay. Enforce max 16 in every mode, prevent silent
room-state corruption, handle disconnects, no friendly fire.

**Implementation:** Harden `server/index.js`, `server/room.js`, `client/src/net.js`,
`client/src/input.js` and `client/src/main.js`. Add WS tests for 16 players,
room churn, position updates, shots, death and reconnect behavior. Test manually
from two real desktop browsers or devices.

**Exit gate:** One browser creates a room, a second joins and both independently
move and shoot; 16 human clients fit, 17th receives a clean error; each client
sees remote movement and shot effects; no uncaught browser console errors.

### P1 — Competitive stability and map design

**Scope:** 4-team TDM balance, intentional spawn protection, clear team color
and friend/foe indicators, map flow, cover and fair routes. Add 2 more **large**
maps after Island quality is stable: mountain/forest and desert/industrial.

**Implementation:** Keep collision/gameplay surfaces in `shared/maps/`; author
separate render-only terrain meshes and decor. Avoid creating solid decorative
geometry that does not match collision. Use explicit terrain height/collider data,
stream or cull distant props, and test all spawns plus path connectivity.

**Exit gate:** Spawn and navigation tests pass, no players trapped in structures,
matches conclude correctly in 2/3/4-team modes, comparable team travel times.

### P2 — Realistic visual asset pipeline

**Target direction:** Semi-realistic PBR at 60fps on a midrange desktop at 1080p;
prefer an intentional coherent visual style over mixing Toon and realistic packs.
Choose a replacement character rig with audited redistribution rights, skeleton
retargeting and animations (idle/run/sprint/crouch/jump/reload/fire/death), and
first-person weapon arms that match the 3rd-person character.

**Free-source candidates (licenses verified at the source before importing):**

| Source | Role | Current license information |
| --- | --- | --- |
| [Poly Haven](https://polyhaven.com/) | PBR materials, HDRIs, environment models | CC0 per its published asset license |
| [ambientCG](https://ambientcg.com/) | Ground, rock, asphalt, concrete, vegetation surfaces | CC0; verify individual download/license |
| [Quaternius Toon Shooter Kit](https://quaternius.com/packs/toonshootergamekit.html) | Current CC0 weapons, soldier, environment placeholders | CC0; explicitly stylized |

**Pipeline:** Import only needed source assets with provenance and license text.
Normalize scale/axes/skeleton; convert to `.glb`, optimize meshes via glTF
Transform/meshopt; KTX2/Basis textures, compressed normal/roughness/metalness
maps and reasonable resolution tiers; GPU instancing for vegetation/debris;
LOD and distance culling; batch/load models off the critical path. Create a
visual quality board and use before/after screenshots for each new biome.

**Exit gate:** Physically plausible lighting and coherent materials, no obvious
placeholder boxes near combat routes, rigged characters with complete action
animations, no missing external assets, measured stable FPS with 16 players.

### P3 — Feel, netcode and server authority

**Scope:** Weapon feedback and recoil/audio, camera polish, visibility and hit
feedback; authoritative movement where feasible, input sequence numbers,
client-side prediction/reconciliation, interpolation, shot timestamp validation,
lag compensation, network jitter handling, rate limits and abuse protection.

**Exit gate:** Controlled WAN tests at 50/100/150ms latency, 1% simulated loss
and 16 concurrent connections produce acceptable movement and damage behavior.
No obvious teleport/rapid-fire exploits from direct WebSocket messages.

### P4 — Online operations, polish and launch

**Scope:** Vercel static frontend + persistent WSS game host; region choice for
Vietnam/nearby players; secure Origin policy, performance telemetry, error
reporting, session reconnect, server observability, release builds, content
settings, settings persistence, optional accounts/statistics if desired.

**Exit gate:** Both desktop clients can join the published URL, WSS handshake
works, 16-person soak and memory/fps tests pass, restart behavior documented,
no critical accessibility or deployment regressions.

## Execution workflow

For each milestone: define 1–3 verifiable issues; implement on a working branch;
run targeted tests plus `npm test` and `npm run build`; use
`npm run smoke:browser` for UI/3D; record desktop screenshots and real-player
feedback; review performance/licensing; then move to the next milestone.

Do not treat green unit tests as proof of a satisfying multiplayer experience.
The most important next input is a genuine **two-browser mouse/keyboard playtest**
followed by first-person visual upgrades. No live deployment, repo push or merge
is part of this local work.

## Latest local verification (2026-10-29)

- `npm test`: **271 passed, 0 failed**, including real localhost WebSocket
  sessions, two-client state/shot replication, and 16-admitted/17th-rejected.
- `npm run build`: passed, with an informational warning that the main JS chunk
  is 814.47 kB (225.60 kB gzipped). Code splitting is a future optimization.
- `npm run smoke:browser`: Chrome loaded the built Three.js scene, created a
  lobby with four team columns, started a two-client game, and produced no
  JavaScript console errors. Its browser-driven W key moved the player **5.52 m**
  according to the second WebSocket client and the shot was broadcast by the
  server. This confirms an end-to-end browser-input-to-server path.
- **First P1 scenery increment:** Crown Island now has deterministic instanced
  grass, low scrub, stones, coastal rock silhouettes, flush building window
  details, and multi-ring irregular distant mountains. Ground decorations avoid
  authored paved areas, building footprints and team spawn clearances. Scenery
  remains render-only, preserving the authoritative collision map. Two dedicated
  scene tests verify clearance, deterministic instances and resource cleanup.
- **Test limitation:** headless Chrome rejected native pointer lock. The smoke
  script temporarily simulated the DOM pointer-lock state inside its isolated
  test page to exercise the unchanged game input handlers. It recorded
  `pointerLocked:false` and `emulatedPointerLock:true`. The test **does not**
  prove mouse look works in a real player-controlled browser.
- Visual baseline: [`screenshots/crown-island-chrome-smoke.png`](screenshots/crown-island-chrome-smoke.png).
- New visual checkpoint: [`screenshots/crown-island-scenery-2026-10-29.png`](screenshots/crown-island-scenery-2026-10-29.png).
  The coastal silhouette and ground layering improved, but the terrain remains
  largely flat, the buildings are box-like, and the first-person gun is stylized.
  Neither this screenshot nor green tests establish the requested realism level.

**Next acceptance session:** start the built server with `npm start`; open
`http://localhost:3000` in two normal desktop browsers (or test LAN clients
via the host's LAN IP). One player creates a team match and sends its room code;
the second joins. Both players should lock the mouse, move, jump, aim, shoot,
register damage and kills, respawn, see scores, and complete the round. Check
disconnect/rejoin and measure game frame rate during combat. Record defects
before beginning PBR character and terrain asset replacement.
