# CROWN STRIKE — physical mouse playtest and second-GPU acceptance

Date: 2026-10-31. This is an **unexecuted manual acceptance protocol**, not a passed playtest report. Headless dual-Chrome runs emulate the browser's pointer-lock state; they cannot prove mouse hardware feel.

## Real desktop mouse and two-player test

1. From `D:\Bansungdemo\fps-next`, run `npm run build` followed by `npm start`. Open **two normal, headed Chrome windows** at `http://localhost:3000`. Create a match in the first window, join its room code in the second; place the windows so that the remote character is visible. On separate computers, use the server's LAN address and ensure the firewall/network permits it.
2. With a physical mouse and keyboard on the focused window, click the game canvas. In DevTools Console, check `document.pointerLockElement === document.querySelector('#game')` is `true` **without redefining or mocking** `document.pointerLockElement`. Move the mouse horizontally and vertically; the viewpoint must respond smoothly and stop moving when the mouse stops. Reacquire lock after Escape and verify focus changes release fire/ADS state.
3. Fire with the left mouse button, aim with the right, reload with `R`, inspect with `I`, cycle weapons with the mouse wheel, and test sensitivity/invert Y. Confirm that reload, inspect and switching weapons do not freeze the aim or leave joints in the wrong pose. The second Chrome should see the first player's shots, crouch and reload events.
4. On **all 17 weapons**, review idle, fire, ADS, reload, inspect, interrupted reload, weapon-switch and sprint/slide poses. Check hand-to-grip contact, finger intersection, mesh clipping, detached wrists, gun visibility and muzzle/recoil directions. Confirm the melee slash and absence of extra floating gun meshes. Record any issues by weapon ID with one screenshot before and after.
5. Play through a round with crouch, slow walk, sprint, slide, lean, damage, death/respawn, disconnect and rejoin. Keep track of mouse-lock failures, input latency, FPS drops, rubber-banding and aim feel. For a true two-person session, have each person control one headed client on independent devices.

### Manual result sheet (fill only after a person operates the mouse)

| Field | Observed result |
| --- | --- |
| Date, device, OS, Chrome version | Pending |
| Actual physical mouse make/model and polling rate | Pending |
| Native `pointerLockElement === #game` | **Not tested** |
| Look X/Y, sensitivity, inverse Y, Escape/relock | **Not tested** |
| Fire / ADS / reload / inspect / wheel switch | **Not tested** |
| 17/17 weapon grip, collision and animation visual acceptance | **Not tested** |
| Remote shot/crouch/reload, full round, reconnect | **Not tested manually** |
| Screenshots, defects, tester and acceptance decision | Pending |

## Second **distinct physical GPU**

The current Windows device reported an **NVIDIA RTX 5060 Laptop GPU** as the active GPU. `pnputil /enum-devices /class Display` listed Intel UHD Graphics as **Disconnected**. Neither a disconnected device nor a second Chrome PID proves that a second physical GPU performed any rendering. Do not enable/disable display adapters or change firmware without machine-owner authorization.

On a separate desktop/laptop with a **different active GPU** (or after a verified switch to another active physical adapter), collect its model and active-device status (`pnputil /enum-devices /class Display` and `chrome://gpu` on Windows), then run from that machine's copy of `fps-next`:

### Verified first-GPU baseline (second-GPU comparison pending)

| Field | RTX 5060 Laptop GPU (current device) | Second physical GPU |
| --- | --- | --- |
| Active physical GPU + browser WebGL renderer | NVIDIA RTX 5060 Laptop, ANGLE/D3D11 | **Not available / not tested** |
| Date / report | 2026-10-31, `two-chrome-2026-10-31T05-01-24-676Z.json` | Pending |
| Chrome PID (host / guest) | `12372` / `17668` | Pending |
| Courtyard viewport / quality / DPR / duration | 1920×1080 / High / 2 / 600,008 ms | Pending |
| FPS mean (host / guest) | 174.6 / 175.9 | Pending |
| Frame interval p95 / p99 (both clients) | 5.7 / 11.1 ms | Pending |
| Errors / visible remote players | 0 / 1 per Chrome | Pending |
| Host-wide GPU utilization / temperature, mean | 48.95% / 75.23°C (120 samples) | Pending |
| Host-wide GPU used memory / power, mean | 3,883 MiB / 54.58 W (120 samples) | Pending |

Both baseline Chrome processes used the **same** RTX 5060. Host-wide GPU metrics include other running applications. Differences between computers need controlled scenes and similar background load before drawing performance conclusions.

```powershell
npm ci
npm run build
$env:VITE_VISUAL_DIAGNOSTICS = '1'
npm run build
$env:DUAL_REQUIRE_GPU = '1'
$env:DUAL_GPU_TELEMETRY = '1'
$env:DUAL_BENCH_MS = '600000'
$env:DUAL_WIDTH = '1920'
$env:DUAL_HEIGHT = '1080'
$env:DUAL_DPR = '2'
$env:DUAL_QUALITY = 'high'
$env:DUAL_MAP = 'courtyard'
$env:DUAL_MACHINE_LABEL = 'verified-second-device' # Replace with a truthful unique name
npm run smoke:dual
npm run bench:summary
Remove-Item Env:VITE_VISUAL_DIAGNOSTICS -ErrorAction SilentlyContinue
npm run build
```

Keep the original `two-chrome-*.json`, copy the second device's report into `docs/benchmarks/` on the comparison machine without overwriting earlier evidence, and rerun `npm run bench:summary`. Compare **actual WebGL renderer**, physical device identity, viewport, DPR, quality, map, duration, worst p95/p99, movement/shots/reloads, draw calls, heap delta and host-wide GPU utilization/temperature. A different `DUAL_MACHINE_LABEL` alone is not proof of another GPU. Reject software WebGL, SwiftShader, WARP and disconnected adapters as evidence. Benchmarks on different background workloads are descriptive and should not be interpreted as controlled performance regressions.
