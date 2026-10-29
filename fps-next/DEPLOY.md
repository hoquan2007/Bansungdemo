# Deployment guide (October 2026)

This repository consists of a static Vite/Three.js client and an Express + WebSocket
game server. The game server keeps every room and match in the memory of one Node
process. A restarted process drops active matches. At present, run a **single**
persistent game process; multi-instance scaling requires a shared room registry,
session routing and authoritative distributed simulation.

## Deploy the current GitHub monorepo for friends (Crown / Strike)

The source currently lives in `hoquan2007/Bansungdemo` under the `fps-next/`
subdirectory. The repository-root [`render.yaml`](../../render.yaml) is the
Render Blueprint for this layout. It selects the reviewed
`codex/astrastrike-inspired-menu` branch, builds `fps-next/Dockerfile` with
`fps-next/` as its Docker context, uses Singapore, and keeps one free WebSocket
server process. Do not create another service from `fps-next/render.yaml` when
using the monorepo Blueprint.

Quick-start: [Open the Render one-click Blueprint for this exact branch](https://render.com/deploy?repo=https://github.com/hoquan2007/Bansungdemo/tree/codex/astrastrike-inspired-menu). Sign in and confirm the service in your own Render account. The link only opens the setup flow; it does not deploy by itself.

1. In the [Render dashboard](https://dashboard.render.com/), connect the
   `hoquan2007/Bansungdemo` repository, then choose **New > Blueprint**.
   Select the `codex/astrastrike-inspired-menu` branch and the root
   `render.yaml`, review any service/billing information, and apply the Blueprint.
   This needs access to the owner's Render workspace and cannot be completed
   from the repository alone.
2. Copy the HTTPS hostname shown by Render **after** its service reports healthy.
   Check `https://<actual-render-host>/api/health` returns `{"ok":true,...}`.
   Do not assume the requested service name guarantees a matching public URL.
3. On Vercel, open the existing **HNQUAN / fffake** project and set the
   build-time environment variable `VITE_WS_URL` to
   `wss://<actual-render-host>/ws` for **Preview**. Rebuild the preview of
   `codex/astrastrike-inspired-menu` so Vite embeds the real backend URL.
4. Open that preview in two desktop browsers on different networks. Create
   Sniper Duel, copy its invite link, and join from the second browser.
   Confirm both clients see the same room, start a match, move, shoot and
   hear each other. Repeat with four clients in Rifle 2v2, then run a
   16-client four-team test on Crown Island.
5. Only after remote play works, set the **Production** variable to the same
   verified WebSocket URL, deploy the reviewed branch to production through
   the normal PR/merge release process, and check `https://fffake.vercel.app/`.

The Render Free instance may spin down after 15 minutes without inbound HTTP
traffic or WebSocket messages; connecting can take roughly a minute to wake it.
Existing rooms are lost on restart. Render has no fixed WebSocket connection
timeout, but its free CPU/RAM and bandwidth must be tested with real players.
The root GitHub Actions workflow `fps-checks.yml` runs unit/WebSocket tests
and builds the frontend for proposed changes.

## Option A — one persistent server (simplest)

1. Install Node.js >= 22, and run `npm ci`, `npm test`, `npm run build`.
2. For local production use `npm start` (works in PowerShell, cmd and Unix).
   The server listens on `PORT` or 3000 and serves the built `dist/` plus `/ws`.
3. Deploy the repository to a persistent Node/container host using the included
   `Dockerfile`, or configure an equivalent long-lived Node runtime.
   `render.yaml` and `fly.toml` are starting points; review region, current
   prices, availability and service plans in your provider dashboard before use.
4. Configure health checks to `/api/health`, HTTPS/WSS, one instance, and a
   region near your friends. Verify `/api/health`, `/api/rooms`, `/ws`, then
   create a room and join from two real browsers/devices.
5. Share `https://your-game-host.example/#ROOMCODE`. The hash prefills the
   invite field, while WebSocket traffic goes to `wss://your-game-host.example/ws`.

There is no persistence: a service restart invalidates room codes and resets
stats. A service that sleeps while idle may require warm-up before the first match.

## Option B — Vercel static frontend + persistent WS backend

This is the recommended frontend arrangement if Vercel is required.

1. Deploy this project as a Vite static build. `vercel.json` uses `npm run build`
   and publishes `dist/`. Keep `client/public` assets in the build output.
2. Separately deploy **the same repository's `server/index.js`** on a persistent
   Node/WebSocket host and expose `https://game.example.com/api/health` and
   `wss://game.example.com/ws` through TLS.
3. In Vercel's **build-time** environment variables set
   `VITE_WS_URL=wss://game.example.com/ws`. Redeploy the static site after
   changing this variable; Vite embeds it in the client bundle.
4. Visit the Vercel URL, create a TDM room, select four teams, open the share
   link in another browser and verify round start, movement and shooting.
5. Configure a stable domain, monitor WS disconnects and per-room resources,
   and stage updates outside active matches.

**2026 platform note:** Vercel Functions now offer WebSocket connections, but a
connection is pinned to one function only for its maximum execution duration.
Later clients are not guaranteed to land in the same function. This code's
single-process `WebSocketServer({server, path:'/ws'})` and in-memory rooms do
not map directly onto that function model. Hosting the static client on Vercel
and the current stateful server separately avoids a large architectural rewrite.
See https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections

Do not deploy with the frontend's default same-origin `/ws` URL on Vercel
without supplying a compatible backend. An HTTPS webpage requires a `wss://`
endpoint. Room invites use `#ABCD` and stay on the frontend hostname.

## Validation and troubleshooting

```bash
npm ci
npm test
npm run build
npm run smoke:browser
npm start
```

Use `/api/health` for the process count and `/api/rooms` for room metadata.
In Chrome DevTools, verify successful `/ws` upgrade and no missing glTF models
or textures. A failed connection usually indicates a wrong `VITE_WS_URL`,
missing TLS or an unavailable game server. Headless Chrome cannot always grant
pointer lock, so complete a **headful** mouse, keyboard and cross-device
playtest. Track actual frame rate, ping, CPU, bandwidth and 16-player stability
before saying the game is production-ready.
