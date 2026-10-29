# Deployment guide (October 2026)

This repository consists of a static Vite/Three.js client and an Express + WebSocket
game server. The game server keeps every room and match in the memory of one Node
process. A restarted process drops active matches. At present, run a **single**
persistent game process; multi-instance scaling requires a shared room registry,
session routing and authoritative distributed simulation.

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
