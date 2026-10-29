# AstraStrike study and original Crown / Strike implementation

Research date: 29 October 2026. Reference: https://astrastrike.fun/ .

The reference site was inspected through a browser and screenshots of the
landing page were saved locally under `.research/astrastrike-*.png` (ignored
by Git). Publicly visible sections included a dark, orange-accented tactical
landing page, Sniper 1v1, Rifle 2v2, Surf, aim training, inventory, news,
and login/profile navigation. The public interface did not expose its server
source, database, complete matchmaking rules or licensed game assets. No
claim is made that these have been reproduced.

## Implemented now

- An original, responsive **CROWN / STRIKE** menu with orange/black visual
  direction, tactical typography, six direct-create mode tiles/links, a room
  creator, a friend invite form and settings. All game code and UI markup were
  written for this project; no AstraStrike artwork, brand marks or source code
  is bundled.
- Sniper Duel is a two-player, opposing-team arena mode with fixed sniper
  loadout and a 10-point team score target. Rifle 2v2 is a four-player,
  two-team arena mode with fixed rifle loadout and a 25-point team target.
- Existing larger Team Warfare mode supports 16 seats and 2–4 teams on Crown
  Island. Battle Royale, FFA, Gun Game, Survival, a practice range, chat,
  inviting by room code, lobbies, bots and map rotation remain accessible.
- Desktop pointer lock/mouse or trackpad/controller input, 3D shooting and
  server-managed scores. Five optimized CC0 gunshot clips and a CC0 textured
  M4A1 model were added independently; source and attributions are in
  [GUN_AUDIO_ASSETS.md](GUN_AUDIO_ASSETS.md).
- The connection indicator changes from "CONNECT TO PLAY" to "SERVER
  CONNECTED" only after a successful WebSocket connection; it resets after
  leaving or disconnecting.

## Reference feature gap

The current menu is a distinct original design, **not a pixel-perfect 100%
clone** of AstraStrike. No Surf movement mode, dedicated aim-training course,
accounts, unlockable inventory, skins marketplace, persistent profile, ranked
matchmaking, news backend or AstraStrike game-specific map/physics parity has
been implemented. The larger island is a stylized environment with a mix of
terrain, buildings and cover, not a photorealistic production FPS map.

Online play requires hosting a persistent Node WebSocket process (see
[DEPLOY.md](../DEPLOY.md)). A localhost browser smoke test validates that a
room can be created and the scene renders; it cannot prove internet-wide
reliability, 16 real simultaneous users, latency or anti-cheat behavior.

## Third-party research repositories (local only)

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

1. Deploy persistent `wss://` backend; test two remote machines and then a
   16-person four-team session with measured packet loss, reconnects and FPS.
2. Make authoritative movement, server-validated hitboxes and robust session
   reconnection before adding any ranked or competitive progression.
3. Design a purpose-built movement/surf course and a scored aim-training range.
4. Build an optional authenticated identity, inventory/progression and match
   history with a database, migrations and privacy controls.
5. Upgrade character rigs, animation and terrain meshes with audited asset
   licenses; optimize draw calls, texture sizes and LOD across larger maps.
