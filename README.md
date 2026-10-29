# Bansung: Frontline

> **Hai phiên bản trong cùng repository:** Bản Babylon.js + Colyseus ở thư mục gốc là nguyên mẫu ban đầu. Phiên bản đang tiếp tục phát triển là [fps-next](fps-next/README.md), dựa trên Three.js + WebSocket, có Crown Island 540 × 540 m, tối đa 16 người chia 2–4 đội và [lộ trình nâng cấp](fps-next/docs/DEVELOPMENT_ROADMAP.md). Để chạy phiên bản mới: `cd fps-next`, `npm install`, `npm run build`, `npm start` rồi mở `http://localhost:3000`.

**Triển khai bản Crown / Strike mới để chơi qua Internet:** [Tạo máy chủ Render từ nhánh đang phát triển](https://render.com/deploy?repo=https://github.com/hoquan2007/Bansungdemo/tree/codex/astrastrike-inspired-menu), sau đó cấu hình `VITE_WS_URL` cho dự án Vercel `fffake` theo [hướng dẫn kết nối và kiểm thử](fps-next/DEPLOY.md). Bạn cần đăng nhập Render và xác nhận tạo dịch vụ trong tài khoản của mình; đường dẫn này không tự tạo máy chủ.

Game FPS 3D nhiều người chơi trên trình duyệt, tạo phòng riêng với tối đa 16 người thuộc 2–4 đội đối kháng. Client dùng Babylon.js; server quản lý trận dùng Colyseus.

## Chạy thử trên máy

Cần Node.js 22+ và npm.

```powershell
npm install
npm run dev
```

Mở **http://localhost:5173/**, tạo phòng rồi chia sẻ mã hoặc link. Bạn bè trong cùng mạng LAN có thể mở địa chỉ LAN của máy chủ ở cổng 5173 nếu tường lửa cho phép 5173 và 2567. Server trận chạy ở cổng 2567.

Để chạy bản production trên một cổng:

```powershell
npm run build
npm run start:server
```

Mở **http://localhost:2567/**. Dockerfile cũng chạy web client và WebSocket trên một cổng 8080.

## Tính năng bản hiện tại

- **Tối đa 16 người/phòng**, chủ phòng chọn 2, 3 hoặc 4 đội. Server tự cân bằng số người; có thể đổi đội trước trận.
- **Ba map rộng 480 m**: thung lũng, hẻm núi và cảng biển; địa hình, công trình và texture CC0 khác nhau.
- **3 chế độ chơi**: Đấu đội (TDM), Chiếm cứ điểm (Domination), Tranh vật phẩm (Artifact Run — mới!).
- **Cấu hình phòng do chủ phòng đặt**: thời lượng (6-20 phút), giới hạn điểm, tốc độ chiếm cứ điểm, mũ bảo hiểm, bắn đồng đội.
- **Chọn nhân vật** trước trận: Bộ binh (Soldier) hoặc Đặc nhiệm (SWAT) — đều dùng GLB từ Quaternius CC0.
- **Smarter spawn**: tránh đặt gần địch, tránh trùng vị trí đồng đội, có thử nhiều attempt và chấm điểm khoảng cách.
- **Bốn vũ khí**: súng trường, tiểu liên, súng bắn tỉa và súng ngắn. Mỗi loại có âm thanh và hitmarker riêng. Server kiểm tra nhịp bắn, đạn, di chuyển, trúng đạn, máu, giáp, mũ bảo hiểm và điểm.
- **3D models từ Quaternius (CC0)**: nhân vật Soldier/SWAT, vũ khí (AK47, SMG, sniper, pistol), props (crate, barrel, container, pine, rock).
- **Anti-cheat**: server clamp vận tốc di chuyển, teleport guard, giới hạn đạn + fire rate, clamp góc nhìn.
- **HUD cao cấp**: FPS/ping real-time (đo thật qua RTT), hitmarker headshot, "ĐẦU" popup, damage indicator hướng bắn, killcam card với tên kẻ hạ mình, respawn countdown, kill feed animated có weapon icon + kill streak.
- **Spectator mode** (mới!): khi chết, tự động chuyển sang camera người chơi còn sống; ← / → để chuyển mục tiêu, click vào tên để chọn trực tiếp.
- **Bảng điểm chi tiết** (TAB): K/D, sát thương, ping, điểm từng đội.
- **Kết quả trận + bình chọn map**: sau khi trận kết thúc hiện MVP, K/D/A, accuracy, longest streak, headshot, bảng xếp hạng. Bình chọn map cho trận tiếp theo.
- **Text chat**: chat lobby (cả phòng) và chat in-game (toàn trận hoặc chỉ đồng đội). Phím Y mở chat trong trận.
- **Cài đặt đồ họa Low/Medium/High**: thay đổi hardware scaling, fog, shadow blur, hiển thị cây/đá.
- **Audio mở rộng**: tiếng bước chân, nhảy, tiếp đất, reload 2 giai đoạn, low-ammo warning, kill confirm.
- **Auto-reconnect**: khi rớt mạng, server tự thử kết nối lại tối đa 3 lần.
- **Skybox gradient** theo từng map (fallback khi HDRI load chậm).
- Link phòng riêng, trạng thái sẵn sàng, đấu lại, đổi vũ khí bằng phím 1-4.

**Điều khiển:** WASD di chuyển, Shift chạy, Space nhảy, Ctrl/C ngồi, chuột ngắm, click trái bắn, R thay đạn, **1-4 đổi súng**, **Y chat**, **TAB bảng điểm**, **←/→ chuyển mục tiêu spectator**, Esc thả chuột.

## Cấu trúc dự án

```
Bansungdemo/
├── src/                  # Client (Babylon.js)
│   ├── main.ts           # Entry: UI, Colyseus client, settings
│   ├── game.ts           # Babylon scene: world, players, GLB models, skybox
│   └── style.css         # HUD/menu styling
├── server/
│   └── index.ts          # Colyseus ArenaRoom (authoritative simulation)
├── shared/
│   └── world.ts          # Shared types/constants (MapId, WeaponId, Snapshot...)
├── public/assets/        # Tài nguyên tĩnh
│   ├── models/           # 14 GLB models (Quaternius CC0)
│   ├── textures/         # Sand, grass, concrete
│   ├── hdri/             # 3 HDRI envmap (Poly Haven CC0)
│   └── audio/            # (reserved)
├── vercel.json           # Vercel deployment (static client)
├── Dockerfile            # Multi-stage build cho VPS/Render
├── scripts/
│   ├── download-models.mjs  # Tải models từ poly.pizza
│   └── smoke.mjs         # 16-client integration test
└── package.json
```

## Deploy lên Vercel (Client) + Render/Railway (Server)

**Quan trọng**: Vercel Functions đã hỗ trợ WebSocket, nhưng kiến trúc Colyseus hiện tại lưu phòng và trận trong bộ nhớ của một tiến trình liên tục. Do đó, với mã nguồn đang có, frontend Vercel vẫn cần một backend game chạy lâu dài trên Render/Railway hoặc máy chủ tương đương:

### 1. Client lên Vercel (static)

```bash
# Cài Vercel CLI (lần đầu)
npm i -g vercel

# Trong thư mục dự án
vercel login
vercel --prod
```

Vercel tự động:
- Chạy `npm run build`
- Lấy output từ thư mục `dist/`
- Phục vụ qua CDN toàn cầu (assets cached 1 năm nhờ `vercel.json`)
- HTTPS tự động

### 2. Server Colyseus lên Render (miễn phí)

Tạo `Web Service` mới trên [render.com](https://render.com):

- **Environment**: Docker
- **Dockerfile Path**: `./Dockerfile`
- **Plan**: Free
- **Health Check Path**: `/health`

Sau khi deploy, Render cho URL dạng `https://bansung-server.onrender.com`.

### 3. Kết nối Client → Server

Có 2 cách:

**Cách A — Environment variable khi build Vercel:**
```bash
vercel env add VITE_SERVER_URL
# Nhập: https://bansung-server.onrender.com
vercel --prod
```

**Cách B — Sửa trong code trước khi build:**
```ts
// src/main.ts
const client = new Client('https://bansung-server.onrender.com');
```

### Deploy cùng lúc với Docker

Nếu muốn cả client + server trên một host (VPS):

```bash
docker build -t bansung .
docker run -p 8080:8080 bansung
```

Mở `http://localhost:8080/`.

## Tính năng game

| Tính năng | Trạng thái |
|---|---|
| FPS góc nhìn thứ nhất, pointer lock | ✅ |
| 4 đội (2, 3, 4 tùy chọn), 16 người/phòng | ✅ |
| 3 map (Highlands/Canyon/Harbor) | ✅ |
| 4 vũ khí với stats riêng | ✅ |
| Server-authoritative hit detection (headshot) | ✅ |
| 3 chế độ: TDM, Domination, Artifact Run | ✅ |
| Smart spawn (xa địch, không trùng đồng đội) | ✅ |
| PBR materials + shadow + tone mapping | ✅ |
| GLB character/weapon/prop models | ✅ |
| Anti-cheat (speed clamp, teleport guard, ammo, fire rate) | ✅ |
| Armor + helmet system + friendly fire toggle | ✅ |
| Match stats: K/D/A, headshot, accuracy, streak, MVP | ✅ |
| Match results screen + map vote | ✅ |
| Scoreboard TAB với K/D, ping, damage | ✅ |
| Spectator mode (←/→ chuyển target) | ✅ |
| Text chat (lobby + in-game + team) | ✅ |
| Character selection (Soldier / SWAT) | ✅ |
| Host room config (time, score cap, capture speed, helmet, FF) | ✅ |
| Graphics quality presets (Low/Med/High) | ✅ |
| Auto-reconnect (3 lần) | ✅ |
| Kill feed nâng cao: weapon icon + kill streak | ✅ |
| Footstep + jump + land + reload + low-ammo audio | ✅ |
| Settings panel (sensitivity, FOV, volume, FPS, reconnect) | ✅ |
| FPS + ping counter real-time (RTT đo từ server) | ✅ |
| Killcam card + respawn countdown | ✅ |
| Damage indicator hướng bắn | ✅ |
| Headshot hitmarker + "ĐẦU" popup | ✅ |
| Mini map với team color + capture points + artifact + aim direction | ✅ |
| Audio theo vũ khí (rifle/SMG/sniper/pistol) | ✅ |
| WebGL fallback khi GLB load fail | ✅ |
| Client prediction + lag compensation thật (Rewind) | ❌ |
| Matchmaking công khai, tài khoản, voice chat | ❌ |
| Mobile + controller support | ❌ |

## Kiểm tra

```powershell
npm run build
npm run smoke
```

`smoke` cần server đang chạy. Lệnh này tạo ba phòng với 16 client giả lập để kiểm tra chia 2/3/4 đội, vị trí hồi sinh, di chuyển, bắn và bắt đầu trận.

## Tài nguyên & giấy phép

Xem chi tiết trong [ASSETS.md](ASSETS.md). Tất cả GLB models từ [Quaternius](https://quaternius.com/) (CC0 / Public Domain). HDRI từ [Poly Haven](https://polyhaven.com/) (CC0). Texture diffuse từ Poly Haven (CC0).

## Lộ trình

Còn lại theo [PLAN.md](PLAN.md):
- Client-side prediction + lag compensation thật (Rewind buffer)
- Matchmaking công khai, tài khoản, hồ sơ, xếp hạng
- Voice chat
- Mobile + controller support
- Spectator mode
- Cài đặt đồ họa Low/Medium/High
