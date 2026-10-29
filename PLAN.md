# Kế hoạch game bắn súng 3D nhiều người chơi trên web

Ngày lập: 24/09/2026. Kế hoạch đang được triển khai. Trạng thái và cách chạy bản alpha hiện tại nằm trong `README.md`; các mốc chưa hoàn thành vẫn được giữ làm lộ trình.

## 1. Mục tiêu và giả định

- Game FPS đấu đội, mở bằng trình duyệt desktop, chơi cùng bạn qua link phòng; bàn phím và chuột là thiết bị điều khiển chính.
- Mục tiêu bản đầu: tối đa 16 người/phòng, chia 2–4 đội; cấu hình mặc định là 4 đội × 4 người. Trận 10–15 phút, 1 map rộng, 2 vũ khí, Team Deathmatch nhiều đội, tạo/tham gia phòng và chơi được qua Internet.
- Mục tiêu bản đầy đủ đầu tiên: 3 map rộng có địa hình và chủ đề khác nhau, 3 chế độ đối kháng nhiều đội, 4–6 vũ khí, nhân vật 3D có rig và hoạt ảnh, party/phòng riêng, bảng điểm, spectator, cài đặt và công cụ quản lý cơ bản.
- Đồ họa theo hướng chân thực có kiểm soát: tỷ lệ người thật, vật liệu PBR, ánh sáng và âm thanh giàu chi tiết; giới hạn độ nặng để vẫn tải và chạy tốt trên web.
- Ưu tiên desktop Chrome/Edge/Firefox hiện đại. Hỗ trợ điện thoại và tay cầm là giai đoạn sau khi bản desktop ổn định.

## 2. Trải nghiệm người chơi

1. Mở URL, đặt tên hoặc đăng nhập, chọn vùng máy chủ.
2. Tạo phòng riêng và chia sẻ mã/link; bạn bè tham gia, chọn một trong tối đa 4 đội và nhân vật. Lobby hiển thị số người, giới hạn và mức cân bằng của từng đội.
3. Chủ phòng chọn map/chế độ, mọi người xác nhận sẵn sàng; đồng hồ đếm ngược rồi vào trận.
4. Di chuyển, chạy, ngồi, nhảy, ngắm, bắn, thay đạn, đổi vũ khí; thấy sát thương, âm thanh, hiệu ứng, hướng bị bắn và thông báo hạ gục.
5. Khi chết: xem killcam đơn giản hoặc spectator, hồi sinh theo luật chế độ.
6. Kết thúc: bảng điểm, thống kê, bình chọn map tiếp theo, quay lại phòng.

## 3. Tính năng theo phạm vi

### Cốt lõi bắt buộc

- FPS góc nhìn thứ nhất, pointer lock, tùy chỉnh độ nhạy chuột, FOV và phím điều khiển.
- Di chuyển có va chạm, độ dốc, vật cản, vùng ngoài map; hoạt ảnh đi/chạy/ngồi/nhảy/bắn/thay đạn/chết.
- Vũ khí hitscan ban đầu: súng trường, súng ngắn; sau đó SMG, sniper, shotgun và lựu đạn. Mỗi loại có tốc độ bắn, sát thương, giật, độ tản, tầm hiệu lực, đạn và thời gian thay đạn riêng.
- Máu, giáp tùy chế độ, sát thương theo vùng trúng, giới hạn đạn, hồi sinh, friendly fire mặc định tắt.
- HUD: tâm ngắm, máu/giáp, đạn, đồng hồ, điểm tối đa 4 đội, kill feed, minimap có đồng đội/điểm mục tiêu, ping và FPS tùy chọn.
- Âm thanh không gian cho bước chân/súng/trúng đạn, nhạc và UI; điều chỉnh âm lượng từng nhóm.
- Phòng riêng qua mã/link, tối đa 16 chỗ, chọn 2–4 đội, cân bằng số người, ready, chọn map, tự khôi phục kết nối ngắn, xử lý rời phòng và kết thúc trận.
- Server xác nhận di chuyển, bắn, đạn, sát thương, điểm và kết quả; client chỉ gửi input và dự đoán chuyển động để phản hồi nhanh.

### Nội dung bản đầy đủ đầu tiên

- Chế độ đối kháng 2–4 đội: Team Deathmatch (điểm hạ gục), Domination (kiểm soát nhiều cứ điểm), Artifact Run (tranh giành vật phẩm và mang về điểm đội). Luật từng chế độ, thời lượng, giới hạn điểm và vị trí hồi sinh tách thành cấu hình. Free-for-All không nằm trong phạm vi đầu vì yêu cầu chính là các đội chiến đấu với nhau.
- Map: (1) cảng công nghiệp ven biển với kho hàng, cầu cạn và bãi container; (2) thung lũng rừng núi với suối, hang, làng và cao điểm; (3) vùng sa mạc với hẻm núi, tàn tích và căn cứ. Mỗi map có nhiều cao độ, không gian trong/ngoài, tuyến chính, đường vòng, cover, điểm nóng và vùng spawn cho tối đa 4 đội.
- 2–4 ngoại hình nhân vật với cùng bộ xương/rig và hitbox chuẩn; 4 màu/phù hiệu đội rõ qua nhân vật, HUD và bản đồ nhưng vẫn giữ phong cách chân thực.
- Chọn loadout, bảng điểm/thống kê trận, spectator, text chat phòng, chặn/tắt tiếng người chơi và báo cáo cơ bản.
- Trang cài đặt đồ họa Low/Medium/High, độ phân giải render, bóng, post-process, âm thanh và phím.

### Sau bản phát hành đầu

- Ghép trận công khai, tài khoản và hồ sơ lâu dài, xếp hạng, party bền vững, voice chat, replay/killcam đầy đủ, battle pass/skin, hỗ trợ mobile/tay cầm. Chỉ làm khi vòng chơi cơ bản, hiệu năng và hạ tầng đã đạt chuẩn.

## 4. Công nghệ và kiến trúc đề xuất

| Thành phần | Lựa chọn | Lý do |
| --- | --- | --- |
| Game client | TypeScript + Babylon.js + Vite | Engine web 3D hỗ trợ PBR, glTF, hoạt ảnh, WebGL/WebGPU và vật lý. |
| UI ngoài trận | React + CSS | Dễ xây lobby, cài đặt, bảng điểm; game loop tách khỏi React. |
| Server trận | Node.js + TypeScript + Colyseus | Room/matchmaking và đồng bộ trạng thái trên server. |
| Dữ liệu lâu dài | PostgreSQL, chỉ thêm khi có tài khoản/thống kê bền vững | Tránh đưa database vào đường truyền thời gian thực. |
| Asset | Blender → glTF/GLB; texture KTX2; mesh nén | Phù hợp phân phối 3D trên web. |
| Triển khai | Static client qua CDN + máy chủ Node hỗ trợ WebSocket qua TLS | Link công khai cho bạn bè; server trận phải chạy liên tục. |

Luồng mạng: client gửi input có thứ tự/thời gian → server mô phỏng tick cố định, kiểm tra va chạm và phát bắn → server gửi snapshot/trạng thái → client dự đoán chính mình và nội suy người khác. Với hitscan, server lưu lịch sử vị trí ngắn để xét bù độ trễ trong giới hạn hợp lý. Không tin vị trí, sát thương, lượng đạn hay kết quả do client tự khai.

Với 16 người, server chỉ gửi cập nhật tần suất cao cho người chơi/sự kiện gần hoặc có liên quan; trạng thái xa cập nhật thưa hơn. Số tick, tần suất snapshot và ngân sách băng thông sẽ đo bằng trận đủ 16 người, không chốt trước theo cảm tính. Luật đội, tính điểm, spawn, marker và UI đều dùng `teamId` cấu hình từ 2 đến 4 thay vì giả định có đúng 2 đội.

Tổ chức repo dự kiến: `apps/client`, `apps/server`, `packages/shared` cho giao thức/luật chung, `assets/source` cho file gốc, `apps/client/public/assets` cho file đã tối ưu, `docs` cho thiết kế và giấy phép.

## 5. Nhân vật, map và tài nguyên

- Nhân vật: dùng model humanoid có giấy phép hợp lệ, rig thống nhất; hoạt ảnh idle, walk, run, crouch, jump, aim, fire, reload, hit và death. Tách tay/vũ khí góc nhìn thứ nhất khỏi thân nhân vật người khác nhìn thấy.
- Quy trình art: kiểm tra giấy phép từng asset, lưu URL/tác giả/ngày tải/điều khoản; mở trong Blender, chuẩn hóa tỷ lệ và hướng, giảm polygon, tạo LOD/collision, gộp vật liệu hợp lý, xuất GLB, nén texture và đo dung lượng/tốc độ tải.
- Nguồn ưu tiên: Poly Haven cho vật liệu, HDRI, đạo cụ CC0; Mixamo cho nhân vật/hoạt ảnh theo điều khoản Adobe. Nhân vật và vũ khí có thể cần model thương mại được cấp phép hoặc tự dựng để đạt mức chân thực và phong cách đồng nhất.
- Mỗi map bắt đầu bằng blockout xám để thử luồng giao tranh và cân bằng spawn. Chỉ làm art pass sau khi map chơi tốt; sau art pass chạy lại kiểm tra hitbox, tầm nhìn và hiệu năng.
- Quy mô map định hướng khoảng 350–500 m mỗi chiều, điều chỉnh theo thời gian tìm giao tranh thực tế. Chia thành 5–7 khu vực nhận diện rõ, có landmark, địa hình tự nhiên và công trình, đường vòng, góc cao/thấp và 3–5 điểm tranh chấp. Tránh khoảng trống kéo dài khiến 16 người khó gặp nhau; dùng vật cản, đường dẫn và mục tiêu để tập trung giao tranh.
- Thiết kế spawn theo 4 vùng quanh map, có nhiều điểm thay thế và kiểm tra tầm nhìn/khoảng cách tới địch; tránh đội vừa hồi sinh bị bắn ngay hoặc một đội chiếm thế cố định. Thử nghiệm cân bằng cả cấu hình 4×4, 3 đội và 2 đội.
- Để map lớn mà vẫn đẹp trên web: chia khu vực tải theo nhu cầu, LOD cho công trình/cây/đá, instancing cho vật lặp, culling, vật liệu dùng chung, ánh sáng tĩnh ở nơi phù hợp, texture nén và preset đồ họa. Art pass thêm lớp địa hình, dấu vết sử dụng, biển chỉ dẫn, thời tiết/khí quyển và âm thanh môi trường nhưng giữ silhouette và khả năng nhìn thấy đối thủ.
- Không lấy model/texture từ game khác hoặc tải asset không rõ quyền sử dụng. Với asset cần tài khoản/mua hàng, xác nhận điều khoản và chi phí trước khi đưa vào repo.

## 6. Mốc triển khai và tiêu chí hoàn thành

| Mốc | Công việc | Điều kiện nghiệm thu |
| --- | --- | --- |
| 0. Thiết kế, 3–5 ngày | Chốt phong cách, luật 2–4 đội, cấu hình mục tiêu; phác thảo 4 vùng spawn, điểm giao tranh và danh mục asset. | Có tài liệu luật trận, sơ đồ map đầu và danh sách asset/giấy phép. |
| 1. Vertical slice, 1–2 tuần | Một phần map blockout, di chuyển/va chạm, 1 súng, 2 client trong một phòng, server tính hit/damage. | Hai máy qua Internet chơi cùng trận; bắn trúng và điểm khớp giữa hai máy. |
| 2. Nền tảng 16 người, 3–5 tuần | Mở rộng blockout toàn map; lobby 4 đội, tối đa 16 người, TDM nhiều đội, 2 súng, HUD 4 đội, respawn, reconnect, deploy thử nghiệm. | Trận 16 người/4 đội hoàn thành; điểm và spawn đúng; không có lỗi làm kẹt trận. |
| 3. Map và hình ảnh, 6–10 tuần | 3 map rộng, 3 chế độ, 4–6 vũ khí, nhân vật/hoạt ảnh, cảnh quan chi tiết, hiệu ứng, UI và tối ưu tải/LOD. | Map có nhiều địa hình, định hướng rõ; không có vị trí kẹt/spawn bị khai thác rõ ràng; preset Medium đạt mục tiêu hiệu năng. |
| 4. Chất lượng và phát hành, 3–4 tuần | Test tải 16 người và nhiều phòng, chống gian lận cơ bản, telemetry, giám sát, cân bằng 2–4 đội, accessibility, hướng dẫn và vận hành. | Không còn lỗi chặn trận; test nhiều phòng; có rollback và nhật ký lỗi. |

Ước lượng cho một người làm kỹ thuật, dùng asset hợp lệ sẵn có: bản chơi được với 16 người/4 đội khoảng 5–8 tuần; bản đầu tương đối hoàn chỉnh với 3 map rộng và art chi tiết khoảng 14–24+ tuần. Chất lượng nhân vật chân thực, art nhất quán, hiệu ứng và cân bằng có thể kéo dài đáng kể hoặc cần họa sĩ 3D/level designer. Đây là ước lượng, không phải cam kết lịch.

## 7. Chỉ tiêu kiểm thử

- 16 người/phòng, tối đa 4 đội là điều kiện nghiệm thu; test cả trận 4×4, 3 đội và 2 đội, rồi ít nhất 2 phòng 16 người đồng thời.
- Mục tiêu 60 FPS trên desktop tầm trung ở preset Medium, 30 FPS ở preset Low trên laptop yếu, kể cả cảnh giao tranh đông người; đo bằng máy thực tế trước khi cố định ngân sách asset.
- Thời gian vào trận sau khi mở link mục tiêu dưới 30 giây với mạng phổ thông, nhờ nén asset và tải theo map. Đo size tải đầu và lần tải lại bằng cache.
- Test mạng mô phỏng 50–150 ms latency, jitter và mất gói; kiểm tra prediction, bù độ trễ và reconnect.
- Test server authority bằng client gửi input sai, bắn quá tốc độ, vô hạn đạn, teleport; server phải từ chối hoặc giới hạn.
- Test xuyên trình duyệt, thay đổi tab, rớt mạng, người chơi rời khi đang đấu, refresh trang và trận quá giờ.
- Đo thời gian di chuyển giữa các khu, số lần gặp địch và độ lệch điểm thắng theo đội/spawn trên từng map; chỉnh thiết kế khi trận bị loãng hoặc có đội chiếm ưu thế hệ thống.

## 8. Rủi ro và quyết định cần chốt

- FPS chân thực trên web phụ thuộc mạnh vào tối ưu model, texture, ánh sáng và card đồ họa. Chốt thiết bị mục tiêu sớm để quyết định độ chi tiết.
- Map rộng và 16 người tăng tải GPU, CPU, mạng và dung lượng tải. Cần đặt ngân sách hiệu năng cho từng khu vực, tải theo vùng và kiểm tra trận đủ người ngay từ bản blockout.
- Độ trễ và công bằng phụ thuộc vùng đặt server; chọn nơi gần nhóm người chơi đầu tiên và đo ping thực tế.
- Chất lượng nhân vật chân thực khó đạt đồng nhất chỉ từ asset miễn phí; cần ngân sách hoặc chấp nhận mức “chân thực vừa phải” cho bản đầu.
- Voice chat, xếp hạng và tài khoản làm tăng đáng kể phạm vi, chi phí vận hành và nhu cầu moderation.
- Cần chốt: nền tảng desktop hay cả mobile; phong cách quân sự hiện đại hay viễn tưởng; mức ngân sách asset/hosting.

## 9. Bước thực hiện đầu tiên sau khi duyệt kế hoạch

Lập tài liệu luật TDM 4 đội và wireframe lobby/HUD 4 đội, dựng repo client/server/shared, tạo blockout map lớn với 4 vùng spawn và điểm tranh chấp, triển khai điều khiển FPS và phòng hai người; sau đó mở rộng dần lên 16 người và đưa lên môi trường thử nghiệm.

## Tài liệu tham khảo

- Babylon.js specifications: https://www.babylonjs.com/specifications/
- Colyseus documentation: https://docs.colyseus.io/
- Colyseus lag compensation: https://docs.colyseus.io/netcode/lag-compensation
- Khronos glTF: https://www.khronos.org/gltf/
- Poly Haven license: https://polyhaven.com/license
- Adobe Mixamo FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
