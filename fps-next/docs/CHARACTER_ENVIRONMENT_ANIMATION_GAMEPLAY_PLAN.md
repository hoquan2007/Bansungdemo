# CROWN / STRIKE — Kế hoạch nâng cấp nhân vật, môi trường, hoạt ảnh và gameplay

Ngày nghiên cứu và cập nhật triển khai: 2026-10-31. Phạm vi: `fps-next` (Three.js + Vite + Node.js/WebSocket), ưu tiên miễn phí, asset có nguồn gốc/giấy phép rõ ràng. Các mục bên dưới gồm **kế hoạch dài hạn** và **tiến độ đã kiểm chứng**; tiêu chí nghiệm thu của từng phase chỉ đạt khi được đánh dấu rõ.

**Cập nhật 31/10/2026 sau vòng tay skinned:** **17/17** vũ khí có tay FPS skinned thật với bộ xương 68 bone và đường cong fire/reload/inspect riêng; **16/16** súng có các bộ phận chuyển động từ mesh nguồn (2 rig authored, 14 rig được tách từ mặt/triangle nguồn). Vật liệu trên 14 rig trích xuất đã được chỉnh thành tactical PBR. Hai Chrome độc lập PASS smoke 3 giây trên cùng **RTX 5060 Laptop**, lưu 34 ảnh idle + 32 ảnh reload. Benchmark GPU tiếp theo **600 giây PASS** trên cùng RTX 5060: **174,6 / 175,9 FPS**, p95 **5,7 / 5,7 ms**, p99 **11,1 / 11,1 ms**, 0 lỗi trình duyệt, 120 mẫu `nvidia-smi` host-wide. Bản build production và kiểm thử tự động mới nhất **383/383 PASS**. Animation vẫn được dựng bằng code, còn cần artist polish; **chuột vật lý** và **GPU vật lý thứ hai** chưa thể xác nhận. Chi tiết tại [`FPS_RIG_GPU_VALIDATION_2026-10-31.md`](FPS_RIG_GPU_VALIDATION_2026-10-31.md) và quy trình thực nghiệm tại [`PHYSICAL_MOUSE_AND_SECOND_GPU_CHECKLIST.md`](PHYSICAL_MOUSE_AND_SECOND_GPU_CHECKLIST.md). Các đoạn dưới giữ cả mốc lịch sử, không đại diện cho mọi trạng thái hiện tại.

## 1. Baseline lịch sử trước đợt nâng cấp và trạng thái hiện tại

- **Trước nâng cấp:** `client/src/remotePlayers.js` chỉ dùng `Character_Soldier.gltf` của Quaternius Toon Shooter trong trận, với `AnimationMixer`, crossfade và mô hình hộp dự phòng. Hiện tại Soldier được giữ làm **fallback**.
- **Trước nâng cấp:** `client/src/menuShowcase.js` đã có `Operator_Tactical.glb` (CC BY 4.0) ở menu. Hiện tại tactical rig này cũng được clone cho nhân vật **trong trận** sau khi retarget clip thành công.
- `client/src/weaponView.js`: M4A1 và Chassis Sniper dùng moving parts authored; 14 rig khác hiện tách các moving parts từ chính hình học OBJ/glTF nguồn. Phần cơ cấu bổ trợ chỉ còn là fallback cho tài nguyên thiếu, xem bảng kiểm chứng rig.
- `client/src/models.js`: có `GLTFLoader`, `MeshoptDecoder`, `SkeletonUtils.clone`, cache, fallback; mặc định `prepare()` có thể chuyển vật liệu từ PBR sang Lambert. Cần phân biệt asset **PBR** và asset **stylized** theo metadata, tránh làm mất normal/metalness/roughness.
- `client/src/mapRenderer.js`: phần lớn map dùng hộp instanced, shader Lambert và vài texture; đã có một số props GLB và `ambientCG/road012a`. `islandScenery.js`/`highlandsScenery.js` tạo cây, cỏ, đá, núi hiệu năng cao nhưng hình khối còn đơn giản.
- `shared/maps/`, `shared/collision.js` và server xác định collision/hit; mọi thay đổi môi trường/animation phải giữ nhất quán với physics và khả năng nhìn thấy địch. `fps-next/docs/DEVELOPMENT_ROADMAP.md` đã định nghĩa hướng P2 realistic/PBR và yêu cầu test bằng hai browser thật.
- Workspace đang có **nhiều file modified/untracked**. Khi triển khai cần bảo toàn thay đổi hiện tại, không reset/overwrite hàng loạt hoặc merge vào `main` khi chưa review.

### Tiến độ triển khai và bằng chứng hiện tại (31/10/2026)

- **Nhân vật/hoạt ảnh — tactical rig hoạt động trong trận:** `client/src/tacticalAnimation.js` retarget các clip Soldier sang `Operator_Tactical.glb` có **88 xương**; `remotePlayers.js` clone rig, tô màu đội và gắn `Operator_Rifle.glb` vào xương tay phải. Có idle/walk/run có súng, bắn, crouch, jump/land, death/emote, crossfade, cập nhật mixer thưa hơn khi ở xa và fallback Soldier khi thiếu asset/clip. Đã sửa clip Duck để phần thân trên giữ súng ổn định, hai chân tiếp tục co gối và độ cao hiển thị tiến gần hitbox crouch; bài smoke có đo đầu, hai bàn tay và bàn chân. `heldWeapon.js` giữ bóng dáng súng trường cho các firearm chưa có mô hình TPP phù hợp, tránh nhân vật hiện tay không; đây là fallback tạm, hình dáng khẩu súng còn chưa trùng loại đang cầm.
- **Vật liệu và địa hình — đã triển khai pilot:** `client/src/models.js` có đường giữ PBR theo asset; Road012A và các props/cụm mặt tiền CC0 hiện diện ở Courtyard. `client/src/courtyardDetails.js` thêm 5 nhóm instanced décor (56 pilasters, 8 cornices, 4 plinths, 16 lantern frames và 16 emissive glass), không bổ sung collider hoặc thay đổi line-of-sight gameplay. Xóa décor khi đổi map.
- **Hoạt ảnh vũ khí và di chuyển chiến thuật — đã tích hợp phần lõi:** `weaponView.js` có ADS/recoil/sway/equip, hạ súng khi sprint/slide, reload tổng quát, magazine/charging handle M4A1 và bolt/magazine Chassis Sniper. `weaponMechanisms.js` bổ sung magazine rời tạm, nạp từng viên shotgun, speedloader revolver, bolt/slide/pump theo loại cho các model FPS **liền mesh**, ẩn khi nghỉ hoặc reload bị ngắt; hiệu ứng slash của dao là cosmetic, không đổi hit detection. Những phụ kiện bổ trợ không thay thế được việc tách bộ phận mesh và rig tay thực sự trong Blender. `tacticalMovement.js`/`localPlayer.js` có crouch, slide giới hạn tốc độ/cooldown, slow walk và lean hình ảnh giữ nguyên tia bắn. Remote reload đã dùng server-confirmed event và reset đúng theo test.
- **Combat feel — đã triển khai một phần:** `client/src/footsteps.js` + `audio.js` hỗ trợ tiếng bước theo quãng đường thực và bề mặt metal/wood/dirt/stone; `weaponView.js` có impact pool 32 slot, bụi/đốm sáng riêng theo bề mặt và 2 streak spark tái sử dụng cho metal, dùng trong `main.js` cho local/remote shot. Bảo toàn quyền xác nhận phát bắn/damage của server. Chưa có decal bền, vỏ đạn hoàn chỉnh và hệ thống môi trường âm thanh theo không gian.
- **Kiểm thử chức năng (31/10, lần cập nhật này):** `npm test` **362/362 PASS** khi chạy với quyền kết nối loopback; bản build Vite diagnostic **PASS**. Lần chạy trong sandbox mặc định có 5 test WebSocket `connect EACCES 127.0.0.1`; chạy lại đầy đủ trong môi trường được cấp quyền localhost đạt 362/362, không phát hiện lỗi logic. Smoke Chrome Courtyard: 2 người (1 Chrome + 1 socket giả lập), WebGL, di chuyển và server-confirmed shot PASS. Smoke Island: 16 người qua mạng (1 Chrome + 15 socket giả lập), server-confirmed shot PASS; **15/15 remote dùng tactical rig có súng gắn tay**. `SMOKE_SUPPLEMENTAL_QA=1` kiểm tra model ready, cơ cấu chuyên biệt và trạng thái ẩn khi nghỉ của SMG/shotgun/revolver/carbine/autoshotgun, đồng thời ưu tiên animation authored của M4A1/sniper: **PASS**. Đây **không phải** kiểm thử 16 browser độc lập.
- **Kiểm thử âm tính:** `SMOKE_MAP=courtyard` + `SMOKE_HUMANS=16` được từ chối sớm với thông báo Courtyard chỉ có 8 chỗ; không còn chờ WebSocket timeout. `npm run build` production lần cuối đã PASS và kiểm tra bundle xác nhận hook debug QA không bị phát hành.
- **VIS-00 — GPU thật đã được đo:** `VITE_VISUAL_DIAGNOSTICS=1` bật thống kê render, `SMOKE_PERF=1` lấy mẫu rAF 2–10 giây trong Chrome headless **1920×1080**, WebGL xác nhận **ANGLE / NVIDIA GeForce RTX 5060 Laptop GPU / D3D11**, devicePixelRatio 1. Dùng để so sánh tương đối cùng máy; rAF FPS của Chrome có thể bị giới hạn, không đồng nghĩa GPU frame-time thuần, không thay thế phép đo GPU chuyên dụng, FPS duy trì dài hạn hoặc hai browser độc lập.

| QA scene | Network participants | Rigged remote entities | Draw calls/frame | Triangles/frame | WebGL geometries / textures | rAF mean / p95 frame interval |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Courtyard, trước tối ưu bóng súng | 2 (1 Chrome + 1 WS) | 1/1 | 733 | 290,353 | 111 / 60 | ~180 FPS / 5.7 ms |
| Courtyard, sau tối ưu bóng súng | 2 (1 Chrome + 1 WS) | 1/1 | **564** | **205,000** | 81 / 39 | 180 FPS / 5.7 ms |
| Island, trước tối ưu bóng súng | 16 (1 Chrome + 15 WS) | 15/15 | 1,124 | 884,146 | 175 / 254 | 158 FPS / 11.2 ms |
| Island, sau tối ưu bóng súng | 16 (1 Chrome + 15 WS) | 15/15 | **807** | **724,897** | 174 / 257 | 159 FPS / 11.1 ms |

Sau tối ưu, mỗi nhân vật tactical vẫn có **36 mesh hiển thị** nhưng số mesh đổ bóng giảm từ **36 xuống 15** (14 skinned + 1 mesh thân), bằng cách tắt `castShadow` trên các mảnh súng nhỏ được gắn vào tay. Kết quả là **-317 draw calls (~28%)**, **-159.249 triangles (~18%)** trong scene Island thử nghiệm, đồng thời giữ silhouette bóng cơ thể và mesh súng nhìn thấy khi combat. FPS 158 → 159 chỉ là chênh lệch rất nhỏ trên mẫu ngắn, không đủ để kết luận tăng FPS bền vững. `renderer.info.memory` đếm tài nguyên WebGL, **không** đo byte VRAM. Screenshot QA ở `%TEMP%/crownstrike-island-16-before-shadow.png` và `%TEMP%/crownstrike-island-16-shadow-optimized.png`.

**Lượt đo dài hơn sau tích hợp animation vũ khí (31/10, 10 giây, Chrome headless):**

| Scene | Phiên Chrome thực / WebSocket giả lập | rAF frame samples | rAF trung bình / p95 khoảng frame | Khung >16.67 ms | Draw calls / triangles mỗi frame | GPU |
| --- | --- | ---: | --- | ---: | --- | --- |
| Courtyard | 1 / 1 | 1,800 | ~180 FPS / 5.7 ms | 0 | 708 / 278,622 | RTX 5060 Laptop D3D11 |
| Island | 1 / 15 | 1,788 | ~179 FPS / 5.7 ms | 0 | 810 / 724,973 | RTX 5060 Laptop D3D11 |

Các phép đo trên bao gồm animation, model tactical, renderer, network smoke của **một Chrome**; các socket giả lập không tạo 15 renderer GPU riêng. Render stats thay đổi theo scene và thời điểm chụp; không thể quy chênh lệch FPS/draw calls chỉ cho module animation bổ trợ. Trong trạng thái idle các phụ kiện bổ trợ được ẩn, nên không tạo draw calls bổ sung khi không bắn/reload. Chưa có GPU timestamp query, VRAM bytes, power/thermals hoặc stress test hàng chục phút.

Tái tạo QA trong PowerShell tại `fps-next`:

```powershell
$env:VITE_VISUAL_DIAGNOSTICS='1'; npm run build
$env:SMOKE_MAP='courtyard'; $env:SMOKE_HUMANS='2'; $env:SMOKE_TEAMS='2'; $env:SMOKE_PERF='1'; $env:SMOKE_PERF_DURATION_MS='10000'; $env:SMOKE_SUPPLEMENTAL_QA='1'; $env:SMOKE_TACTICAL_QA='1'; $env:SMOKE_REQUIRE_GPU='1'; $env:SMOKE_WIDTH='1920'; $env:SMOKE_HEIGHT='1080'; npm run smoke:browser
$env:SMOKE_MAP='island'; $env:SMOKE_HUMANS='16'; $env:SMOKE_TEAMS='2'; $env:SMOKE_PERF='1'; $env:SMOKE_PERF_DURATION_MS='10000'; $env:SMOKE_TACTICAL_QA='1'; $env:SMOKE_REQUIRE_GPU='1'; $env:SMOKE_WIDTH='1920'; $env:SMOKE_HEIGHT='1080'; npm run smoke:browser
Remove-Item Env:VITE_VISUAL_DIAGNOSTICS,Env:SMOKE_MAP,Env:SMOKE_HUMANS,Env:SMOKE_TEAMS,Env:SMOKE_PERF,Env:SMOKE_PERF_DURATION_MS,Env:SMOKE_SUPPLEMENTAL_QA,Env:SMOKE_TACTICAL_QA,Env:SMOKE_REQUIRE_GPU,Env:SMOKE_WIDTH,Env:SMOKE_HEIGHT -ErrorAction SilentlyContinue
npm run build  # production build, không gắn cửa sổ debug QA
```

**Đã thực hiện:** tactical hero rig/retargeting, chỉnh crouch, weapon-ready animation, chuyển động crouch + slide + lean/slow walk, animation có cơ cấu cho M4A1/sniper và bổ trợ cho các súng mesh liền, cùng đo Chrome GPU thật 10 giây trên Island với 15 remote. **Còn cần nghiệm thu:** hai Chrome độc lập cùng render và trao đổi combat, kiểm tra cảm giác chơi nhiều phút, mô hình/tay/reload tách bộ phận và clip riêng cho toàn bộ gun set ở FPP/TPP, xác thực chuyển động trên server dưới tải thực, 60 FPS duy trì trên GPU tầm trung hơn, thay tài nguyên có quyền sử dụng phù hợp cho từng biến thể nhân vật. Giữ nguyên các thay đổi dở trong worktree, chưa tự động commit hoặc merge.

## 2. Art direction đề xuất

**Semi-realistic tactical FPS:** quân phục, vũ khí và công trình có chất liệu thực; màu đội/người chơi nổi bật vừa đủ để nhận diện. Chọn một map **Courtyard/Foundry** làm vertical slice hoàn chỉnh trước khi lan ra Crown Island 540 × 540 m.

1. **Nhân vật:** một skeleton chuẩn cho 3rd-person rig, phiên bản đầu/áo/giáp theo team; LOD và bóng đổ hợp lý; tay + vũ khí FPS có tông màu, tỉ lệ phù hợp với thân người. Team silhouette và outline phải nhận diện rõ ở khoảng cách bắn thực tế.
2. **Môi trường:** PBR base color + normal + roughness + metallic/ORM + AO theo từng material, HDRI/IBL có kiểm soát, decal (bụi, rỉ, mòn, vết đạn), ánh sáng và sương tùy map. Giữ bố cục cạnh tranh, cover và đường đi hiện hữu.
3. **Hoạt ảnh:** idle, walk 8 hướng, strafe, sprint, crouch, jump start/air/land, aim/fire, reload, hit react, death, equip, emote. Animation chạy bằng state machine và chuyển động mượt, tách upper/lower body khi cần.
4. **Game feel:** recoil và ADS có cảm giác lực, vỏ đạn, muzzle flash, impact đúng vật liệu, đạn lướt, footsteps theo bề mặt, âm thanh trong/ngoài nhà, hitmarker và phản hồi trúng đạn.
5. **Tính chơi được:** tránh visual che địch quá mức, tránh tăng camera shake gây mỏi mắt, bảo toàn FPS cho 16 players và chạy được trên GPU tầm trung.

## 3. Repo/thư viện tham khảo đã tra cứu

| Nguồn | Nên học/dùng | Giấy phép / cách sử dụng |
| --- | --- | --- |
| [cktang88/3d-fps — IRONLINE](https://github.com/cktang88/3d-fps) | Cực sát mục tiêu: lighting/PBR, FPS arms, animation + IK, impact, decals, graphics presets và benchmark; đã cung cấp một số asset được ghi nguồn trong repo hiện tại. | **Tham khảo kiến trúc/kỹ thuật**; không mặc định coi toàn bộ repo là MIT. Kiểm tra license từng file/asset trước khi sao chép. Các model CC BY yêu cầu credit. |
| [mshaheerz/fpp-tpp-shooter-starter](https://github.com/mshaheerz/fpp-tpp-shooter-starter) | FPS/TPP rig, hand attachment, spine aim, asset/map streaming và map studio. | Code MIT theo README; model/animation do người triển khai tự cung cấp, kiểm tra riêng. |
| [mohsenheydari/three-fps](https://github.com/mohsenheydari/three-fps) | Tham khảo NPC/root-motion/AI; cũ, cần chọn lọc. | Code MIT theo README; model có license riêng. |
| [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | Kiểm tra, tối ưu GLB, meshopt, giảm texture và encode KTX2. | MIT. |
| [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | `gltfpack`, tối ưu mesh, animation/LOD geometry. | MIT. |
| [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) | Tone mapping, SMAA, SSAO, bloom nhẹ và hiệu ứng theo preset. | Zlib; xem LICENSE trong repo. |
| [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer) / [SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils) / [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) | Thư viện nền đang dùng và công cụ để tích hợp animation, clone skinned mesh, texture nén. | Thư viện Three.js; tham khảo API đúng phiên bản được khóa trong package. |

## 4. Nguồn asset ưu tiên

| Nguồn | Thành phần nên chọn | Điều kiện |
| --- | --- | --- |
| [Quaternius Universal Animation Library 1](https://quaternius.com/packs/universalanimationlibrary.html) | Locomotion nhiều hướng, combat, death, emote; rig humanoid để retarget. | **CC0**; trang quảng bá 120+ clip cho bộ đầy đủ nhưng [bản Standard miễn phí trên OpenGameArt](https://opengameart.org/content/universal-animation-library) chỉ có **45 animation**. Kiểm tra clip thực tế của file tải. |
| [Quaternius Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | Bổ sung armed/melee/parkour; dùng nếu thiếu clip sau giai đoạn 1. | CC0; miễn phí và bản Source có thành phần khác nhau. |
| [Poly Haven](https://polyhaven.com/) / [license](https://polyhaven.com/license) | HDRI, gạch, kim loại, mặt đất, crates, props thực tế. | CC0. |
| [ambientCG](https://ambientcg.com/) | Bộ vật liệu seamless PBR (road/asphalt/concrete/metal/dirt). | CC0 theo chính sách nguồn; kiểm tra asset/tập tin khi tải. |
| [Kenney City Kit Industrial](https://kenney.nl/assets/city-kit-industrial) | Factory, warehouse, industrial facade để thiết kế module bản đồ. | CC0; phù hợp **greybox/đạo cụ** hơn là photorealistic hero assets. |
| [Quaternius Toon Shooter](https://quaternius.com/packs/toonshootergamekit.html) | Dùng làm fallback có license rõ ràng khi GLB mới hỏng. | CC0, stylized. |
| [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Auto-rig và bổ sung chuyển động cho humanoid khi clip CC0 không đủ. | Miễn phí sử dụng trong game theo FAQ; **không phải CC0**, không phân phối clip/source riêng dưới dạng asset pack. |
| Asset đã tích hợp trong `client/public/models/characters`, `models/fp`, `models/guns-real`, `models/props/hilltown` | Tận dụng trước khi tải thêm; đối chiếu `client/public/ASSET_CREDITS.txt`, `docs/LOBBY_ASSETS.md`, `docs/GUN_AUDIO_ASSETS.md`. | Một số **CC BY 4.0** cần credit và ghi chú thay đổi; các asset khác CC0. |

Quy tắc nhận asset: lưu `source URL`, creator, license URL, bản tải, nơi dùng, file SHA256, credits và ghi chú chỉnh sửa; không lấy file từ game đóng/mẫu tham khảo thiếu quyền tái phân phối. Với pack từ GitHub, license code **không** tự động bao trùm model/âm thanh.

## 5. Thứ tự triển khai thành task nhỏ (theo gate)

| Task | Việc cần làm | File/module chính | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| **VIS-00 — Baseline** | Chụp screenshot 1080p ở Courtyard và Crown Island; đo FPS average/p95 frame time, draw calls, số triangles, VRAM ước tính, tải asset và cold start; xác nhận hai browser thật chơi được. | `scripts/browser-smoke.mjs`, performance instrumentation, docs | Báo cáo baseline, tái tạo được trên cùng phần cứng/quality preset; test gameplay hiện tại pass. |
| **VIS-01 — Hero rig** | Chọn một tactical **rigged** GLB hợp lệ; chuẩn tỉ lệ 1.8m, +/−Z, skeleton, origin, team-color mask, bone socket tay phải/trái; 1 rig duy nhất được clone cho tất cả remote players; fallback Toon. | `client/src/models.js`, `remotePlayers.js`, assets | 2 đội phân biệt từ xa; 16 người thấy đúng hướng cầm súng, không lệch hitbox/hit registration. |
| **VIS-02 — Animation system** | Retarget animation vào rig, state machine locomotion/upper-body, chuyển động aim/fire/reload/jump/death/emote, crossfade và cập nhật theo tần số/LOD. Đồng bộ only-needed gameplay flags/events. | `remotePlayers.js`, `shared/protocol.js`, `localPlayer.js`, `server/room.js` (chỉ khi thật sự cần) | Không trượt chân rõ, không T-pose, clip không reset liên tục, remote thấy reload/fire đúng thời điểm; mạng không tăng bất thường. |
| **VIS-03 — FPS weapon feel** | Chuẩn hóa tay cầm, scale, ADS, reload/fire/inspect; dùng muzzle/bone attachment chính xác cho M4 và 1 pistol trước khi mở rộng 15 súng. | `weaponView.js`, `audio.js`, `shared/weapons.js` | FPS/TPP cầm đúng súng; camera recoil không phá aiming, reload âm thanh/hành động khớp ammo authority. |
| **VIS-04 — PBR Courtyard pilot** | Tách collision volumes và render mesh; cho phép opt-in vật liệu PBR theo asset; HDRI/IBL, texel density, UV tiling, modular walls + clutter, decal vật liệu, shadow quality presets. | `mapRenderer.js`, `models.js`, `shared/maps/courtyard.js` | Không clip vào props, không lộ cover giả, collision AABB trùng mesh; before/after ảnh đạt cùng lighting. |
| **VIS-05 — Combat FX/audio** | Surface-hit classifier (metal/stone/wood/dirt), sparks/dust/shells/decals, footsteps, ambient loops, directional damage indicators và accessibility toggle. | `weaponView.js`, `main.js`, `audio.js`, các FX modules mới nếu cần | Ảnh/âm thanh tương ứng loại bề mặt; remote peers thấy FX; giới hạn số hạt/decal và không leak memory. |
| **GAME-01 — Gameplay depth** | Chọn **2** cơ chế ưu tiên qua playtest: ví dụ slide + vault hoặc tactical lean + footsteps stealth. Cập nhật client movement, shared collision, server validation và bot logic cùng lúc. Các mode cũ tiếp tục chạy. | `localPlayer.js`, `shared/constants.js`, `shared/collision.js`, `server/validate.js`, `server/room.js`, `server/bot.js` | Hai browser thấy trạng thái thống nhất; speed/height limits chống exploit; không đi xuyên tường; gameplay modes regression xanh. |
| **VIS-06 — Scale-out/polish** | Sau khi Courtyard ổn: mở rộng material pipeline ra Foundry/Island/Highlands; culling, LOD, lazy loading, meshopt/KTX2, quality presets và bandwidth budget. | `mapRenderer.js`, `islandScenery.js`, `highlandsScenery.js`, `models.js` | 16 players, 1080p desktop tầm trung đạt mục tiêu ổn định 60 FPS nếu phần cứng cho phép; 30 FPS fallback; không tăng heap/VRAM theo vòng đổi map. |

### Phân biệt thay đổi render và luật chơi

- Model, decal, animation và vật liệu có thể chỉnh ở client nếu không làm khác collision, line-of-sight hoặc gameplay. Decorative walls phải khớp collider hoặc không chắn tầm nhìn một cách khó hiểu.
- Slide/vault/lean, reload timing, recoil tác động aim, projectile/penetration, hit registration và movement speed là **gameplay mechanics**; phải có đặc tả và cập nhật đồng bộ shared/server, test exploit.
- Xây animation states dựa trên sự kiện/flags có thật; không tự dự đoán remote reload/death rồi hiển thị trái server.

## 6. Asset pipeline & ngân sách thăm dò

1. Nguồn download gốc → thư mục staging ngoài public → kiểm license/rig/UV/animation → normalize trong Blender → xuất `.glb` → `gltf-transform inspect` → mesh/texture optimize → test WebGL trong browser → ghi credits/hash → import chính thức.
2. Ưu tiên PBR map đúng color space (baseColor sRGB, normal/roughness/metallic linear), nhờ PMREM/HDRI cho phản chiếu; tránh chuyển về Lambert nếu muốn giữ PBR. Test map size 1K cho props, 2K hero ở high preset; chỉ tăng khi benchmark chứng minh hiệu quả.
3. Mục tiêu **thử nghiệm**, chưa phải số đo hiện tại: 60 FPS ở 1080p máy desktop tầm trung; preset Low duy trì >=30 FPS; ổn định cùng 16 remote player. Texture budget/draw-call budget cần chốt sau VIS-00 và so sánh trước/sau từng task.
4. Đừng nén GLB hoạt ảnh bằng tùy chọn làm hỏng xương/skin hoặc scale. Kiểm `EXT_meshopt_compression` decoder và `KHR_texture_basisu` (`KTX2Loader`) trước khi bật trong production.

## 7. Quy trình giao Codex/Cursor và nghiệm thu

- Mỗi task tạo nhánh riêng `codex/vis-XX-*` hoặc tên task tương tự; trước khi code, khảo sát diff hiện tại và không ghi đè các file đang sửa. Commit theo 1 mục tiêu nhỏ, có đường quay lại.
- Mỗi PR/task chứa: source + license manifest; ảnh before/after cùng scene, góc nhìn và quality; benchmark có cấu hình máy; phạm vi code thay đổi; kiểm tra log WebGL/404; unit test khi cơ chế gameplay/netcode bị ảnh hưởng.
- Kiểm tối thiểu `npm test`, `npm run build`, `npm run smoke:browser` từ `fps-next`; kiểm tra thêm mode và asset-specific smoke theo task. Hai desktop browser thật test mouse lock, movement, aiming, damage, respawn, spectator và đổi map trước khi đánh dấu PASS.
- **Gate quyết định:** hoàn tất VIS-00 → VIS-01 + VIS-02 (nhân vật/animation) → VIS-03 + VIS-04 (game feel/visual map) → VIS-05 → GAME-01 → VIS-06. Task nào không đạt FPS hoặc regression thì tối ưu/quay lại trước khi mở rộng.

## 8. Task nghiệm thu còn mở

`VIS-00c` đã được triển khai qua nhiều vòng smoke/benchmark trên RTX 5060, nhưng không chứng minh native pointer lock khi cầm chuột hay hiệu năng GPU thứ hai. Các bước còn mở: **(1)** một người vận hành chuột vật lý trong hai Chrome headed, theo checklist có ảnh lỗi và nghiệm thu tất cả 17 animation; **(2)** benchmark 600 giây trên thiết bị GPU vật lý hoạt động thứ hai rồi tổng hợp p95/p99 trên hai cấu hình; **(3)** artist pass retarget clip và cân chỉnh hand socket, vật liệu/normal/high-poly cho các mesh còn low-poly. Xem báo cáo rig/GPU và checklist đã liên kết ở đầu tài liệu.
