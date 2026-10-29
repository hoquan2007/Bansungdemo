import { Client, type Room } from '@colyseus/sdk';
import { Game, type GraphicsQuality } from './game';
import {
  CHARACTERS, HALF_WORLD, MAP_NAMES, MODE_LABELS, TEAM_COLORS, TEAM_NAMES, WEAPONS,
  type CharacterId, type ChatMessage, type Input, type MapId, type MatchStats, type Mode,
  type PlayerView, type Snapshot, type WeaponId,
} from '../shared/world';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="game"></canvas>
  <div class="vignette"></div>
  <div class="grain"></div>
  <div class="damage-flash" id="damageFlash"></div>
  <header class="topbar">
    <div class="brand"><span class="brand-mark">B</span><div><strong>BANSUNG</strong><small>FRONTLINE // v2.1</small></div></div>
    <div class="topbar-stats"><span id="ping">— ms</span><span id="fps">— fps</span></div>
    <div class="server-status"><i></i><span id="connection">CHƯA KẾT NỐI</span></div>
  </header>
  <button id="settingsBtn" class="icon-btn" aria-label="Cài đặt">⚙</button>
  <button id="scoreBtn" class="icon-btn" aria-label="Bảng điểm">▦</button>
  <main id="menu" class="menu-wrap">
    <section class="intro">
      <div class="eyebrow"><span class="line"></span> CHIẾN TRƯỜNG TRỰC TUYẾN / 16 NGƯỜI</div>
      <h1>VÀO TRẬN.<br><em>GIỮ VỊ TRÍ.</em></h1>
      <p>Đấu súng chiến thuật trên địa hình rộng. Tạo phòng, mời bạn bè và chiến đấu cùng tối đa bốn đội.</p>
      <div class="intro-stats"><div><b>16</b><span>CHIẾN BINH</span></div><div><b>04</b><span>ĐỘI</span></div><div><b>480m</b><span>CHIẾN TRƯỜNG</span></div><div><b>30Hz</b><span>TICK SERVER</span></div></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><span>01 / TRIỂN KHAI</span><div class="online-dot"></div></div>
      <h2>Tham gia chiến trường</h2>
      <label>TÊN HIỂN THỊ<input id="name" maxlength="20" placeholder="Tên chiến binh" autocomplete="nickname" /></label>
      <label>CHẾ ĐỘ<select id="mode"><option value="tdm">Đấu đội / Team Deathmatch</option><option value="domination">Chiếm cứ điểm / Domination</option><option value="artifact">Tranh vật phẩm / Artifact Run</option></select></label>
      <button id="create" class="primary">TẠO PHÒNG MỚI <span>↗</span></button>
      <div class="divider"><span>HOẶC</span></div>
      <label>MÃ PHÒNG<input id="roomCode" placeholder="Dán mã phòng bạn bè gửi" /></label>
      <button id="join" class="secondary">THAM GIA PHÒNG <span>→</span></button>
      <p id="error" class="error"></p>
      <div class="panel-foot">MÁY CHỦ TÍNH ĐIỂM VÀ SÁT THƯƠNG · TRÌNH DUYỆT DESKTOP</div>
    </section>
  </main>
  <section id="lobby" class="lobby hidden">
    <div class="lobby-head">
      <div>
        <div class="eyebrow">PHÒNG CHỜ / <span id="roomId"></span></div>
        <h2>Chuẩn bị xuất kích</h2>
        <p>Chọn đội, mời bạn bè và bắt đầu trận đấu.</p>
      </div>
      <button id="copy" class="secondary compact">SAO CHÉP LINK MỜI ↗</button>
    </div>
    <div class="lobby-side">
      <div>
        <div id="teamGrid" class="team-grid"></div>
        <div class="host-config" id="hostConfig" hidden>
          <h4>CẤU HÌNH PHÒNG (CHỦ PHÒNG)</h4>
          <div class="cfg-row"><label>Thời lượng</label><select id="cfgTime"><option>6</option><option>8</option><option>10</option><option selected>12</option><option>15</option><option>20</option></select> phút</div>
          <div class="cfg-row"><label>Giới hạn điểm</label><select id="cfgScore"><option>25</option><option selected>50</option><option>75</option><option>100</option></select></div>
          <div class="cfg-row"><label>Tốc độ chiếm cứ điểm</label><select id="cfgCapSpeed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div>
          <div class="cfg-row"><label>Mũ bảo hiểm</label><input id="cfgHelmet" type="checkbox" checked /></div>
          <div class="cfg-row"><label>Bắn đồng đội</label><input id="cfgFF" type="checkbox" /></div>
        </div>
        <div class="lobby-bottom">
          <div><b id="playerCount">0 / 16</b><span id="mapLabel"> NGƯỜI CHƠI · HIGHLANDS · 12 PHÚT</span></div>
          <div class="lobby-actions">
            <select id="loadout" aria-label="Chọn vũ khí"></select>
            <button id="ready" class="secondary">SẴN SÀNG</button>
            <button id="start" class="primary">BẮT ĐẦU TRẬN →</button>
          </div>
        </div>
      </div>
      <aside>
        <div class="character-picker">
          <h3>CHỌN NHÂN VẬT</h3>
          <div id="characterGrid" class="character-grid"></div>
        </div>
        <div class="lobby-chat">
          <h3>PHÒNG CHAT</h3>
          <div id="lobbyChatLog" class="chat-log"></div>
          <div class="chat-input">
            <input id="lobbyChatInput" maxlength="200" placeholder="Nhắn cho cả phòng…" />
            <button id="lobbyChatSend">GỬI</button>
          </div>
        </div>
      </aside>
    </div>
  </section>
  <div id="hud" class="hud hidden">
    <div class="scoreboard" id="scores"></div>
    <div class="match-meta"><span id="modeLabel">ĐẤU ĐỘI</span><b id="timer">12:00</b></div>
    <div class="crosshair"><i></i><i></i><i></i><i></i><b class="dot"></b></div>
    <div id="hitmarker" class="hitmarker">✕</div>
    <div id="headshot" class="headshot-popup">ĐẦU</div>
    <div id="damageIndicator" class="damage-indicator"></div>
    <div id="killfeed" class="killfeed"></div>
    <div class="bottom-left">
      <div class="health-icon">✚</div>
      <div><small>SỨC KHỎE</small><strong id="health">100</strong>
        <div class="armor-bar"><div id="armorFill"></div><span class="helmet" id="helmetIcon" title="Mũ bảo hiểm">⛑</span></div>
      </div>
      <div class="health-track"><div id="healthFill"></div></div>
    </div>
    <div class="bottom-right">
      <div><small id="weaponLabel">AR-4 / SÚNG TRƯỀNG</small><strong><span id="ammo">30</span><em> / <span id="reserve">120</span></em></strong></div>
      <div class="ammo-icon">▥</div>
    </div>
    <canvas id="minimap" width="190" height="190"></canvas>
    <div class="controls-hint">WASD DI CHUYỂN · SHIFT CHẠY · SPACE NHẢY · CTRL/C NGỒI · CLICK BẮN · R THAY ĐẠN · 1-4 ĐỔI SÚNG · Y CHAT · TAB BẢNG ĐIỂM</div>
    <div id="respawn" class="respawn hidden"><div>ĐANG HỒI SINH</div><b id="respawnTimer">3</b></div>
    <div id="eventToast" class="event-toast hidden"></div>
    <div id="spectator" class="spectator hidden">
      <h3>ĐANG THEO DÕI</h3>
      <strong class="target-name" id="spectatorName">—</strong>
      <span class="target-meta" id="spectatorMeta">—</span>
      <div class="controls">← → CHUYỂN MỤC TIÊU · ESC THOÁT</div>
      <div class="target-list" id="spectatorList"></div>
    </div>
    <div id="artifactMarker" class="artifact-marker hidden">◆</div>
    <div id="killcam" class="killcam hidden"><div class="killcam-card"><span class="eyebrow">BẠN ĐÃ BỊ HẠ</span><strong id="killcamMsg">Bởi ai đó</strong><small id="killcamWeapon">Bằng vũ khí gì</small></div></div>
    <div class="hud-chat" id="hudChat"></div>
    <div id="hudChatInput" class="hud-chat-input hidden">
      <button id="hudChatTeam" class="team-toggle" title="Gửi cho đồng đội">TEAM</button>
      <input id="hudChatField" maxlength="200" placeholder="Nhắn cho cả trận…" />
      <button id="hudChatSend">GỬI</button>
    </div>
    <div id="tip" class="tip"></div>
  </div>
  <div id="scorePanel">
    <header>
      <h2>BẢNG ĐIỂM</h2>
      <button class="close" id="scoreClose">✕</button>
    </header>
    <div class="teams" id="scoreTeams"></div>
    <table>
      <thead><tr><th>Người chơi</th><th>Đội</th><th class="right">K</th><th class="right">D</th><th class="right">A</th><th class="right">K/D</th><th class="right">Sát thương</th><th class="right">Ping</th></tr></thead>
      <tbody id="scoreTable"></tbody>
    </table>
  </div>
  <div id="results" class="results hidden">
    <div class="results-card">
      <header>
        <h2>KẾT QUẢ TRẬN <span class="winner" id="resultsWinner">—</span></h2>
        <div class="actions"><button id="resultsLeave" class="secondary">RỜI PHÒNG</button></div>
      </header>
      <div class="mvp">
        <div class="trophy">🏆</div>
        <div class="info">
          <strong id="mvpName">—</strong>
          <span id="mvpStats">MVP</span>
        </div>
      </div>
      <table class="stats-table">
        <thead><tr><th>#</th><th>Tên</th><th>Đội</th><th class="right">K</th><th class="right">D</th><th class="right">A</th><th class="right">HS</th><th class="right">Sát thương</th><th class="right">Chính xác</th><th class="right">Streak</th></tr></thead>
        <tbody id="resultsTable"></tbody>
      </table>
      <h3 style="font:700 11px 'Barlow Condensed';letter-spacing:.18em;color:#d8edb0;margin:14px 0 8px;">BÌNH CHỌN BẢN ĐỒ TIẾP THEO</h3>
      <div class="map-vote" id="mapVote">
        <button data-map="highlands">Thung lũng<span class="count" id="voteHighlands">0 phiếu</span></button>
        <button data-map="desert">Hẻm núi<span class="count" id="voteDesert">0 phiếu</span></button>
        <button data-map="harbor">Cảng biển<span class="count" id="voteHarbor">0 phiếu</span></button>
      </div>
      <p style="font-size:11px;color:#7e9998;margin:6px 0 0;">Bản đồ được bình chọn nhiều nhất sẽ dùng cho trận tiếp theo nếu chủ phòng đồng ý.</p>
    </div>
  </div>
  <div id="pause" class="pause hidden">
    <div class="pause-card">
      <div class="eyebrow">TẠM DỪNG</div>
      <h2>Quay lại chiến trường</h2>
      <p>Nhấp vào màn hình để khóa chuột và tiếp tục. Nhấn TAB để xem bảng điểm.</p>
      <button id="resume" class="primary">TIẾP TỤC →</button>
      <button id="leave" class="secondary">RỜI PHÒNG</button>
    </div>
  </div>
  <div id="settingsPanel" class="settings hidden">
    <div class="settings-card">
      <header><strong>CÀI ĐẶT</strong><button id="settingsClose" class="icon-btn">✕</button></header>
      <div class="quality-row">
        <button data-q="low">Thấp</button>
        <button data-q="medium" class="on">Trung bình</button>
        <button data-q="high">Cao</button>
      </div>
      <div class="settings-row"><label>ĐỘ NHẠY CHUỘT</label><input id="optSensitivity" type="range" min="0.5" max="5" step="0.1" value="2.3"><span id="optSensitivityVal">2.3</span></div>
      <div class="settings-row"><label>GÓC NHÌN (FOV)</label><input id="optFov" type="range" min="60" max="120" step="1" value="85"><span id="optFovVal">85</span></div>
      <div class="settings-row"><label>ÂM LƯỢNG</label><input id="optVolume" type="range" min="0" max="100" step="1" value="60"><span id="optVolumeVal">60</span></div>
      <div class="settings-row"><label>HIỂN THỊ FPS/PING</label><input id="optShowFps" type="checkbox" checked><span>Hiện góc trên phải</span></div>
      <div class="settings-row"><label>TỰ ĐỘNG KẾT NỐI LẠI</label><input id="optReconnect" type="checkbox" checked><span>Thử lại khi rớt mạng</span></div>
    </div>
  </div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');

// ----- Dynamic form controls -----
const teamChoice = document.createElement('label');
teamChoice.innerHTML = 'SỐ ĐỘI<select id="teamCount"><option value="4">4 đội · 4 người/đội</option><option value="3">3 đội · tối đa 6 người/đội</option><option value="2">2 đội · 8 người/đội</option></select>';
$<HTMLButtonElement>('create').before(teamChoice);
const mapChoice = document.createElement('label');
mapChoice.innerHTML = 'BẢN ĐỒ<select id="map"><option value="highlands">Thung lũng / Highlands</option><option value="desert">Hẻm núi / Canyon</option><option value="harbor">Cảng biển / Harbor</option></select>';
teamChoice.before(mapChoice);
const weaponChoice = $<HTMLSelectElement>('loadout');
weaponChoice.innerHTML = Object.entries(WEAPONS).map(([id, w]) => `<option value="${id}">${w.label}</option>`).join('');
const charGrid = $<HTMLDivElement>('characterGrid');
charGrid.innerHTML = Object.entries(CHARACTERS).map(([id, c]) =>
  `<div class="character-card${id === 'soldier' ? ' selected' : ''}" data-character="${id}">
    <span class="ch-icon">${id === 'swat' ? '🛡' : '⚔'}</span>
    <strong>${c.label}</strong>
    <small>GLB · CC0</small>
  </div>`).join('');

// ----- Game instance -----
let game = new Game(canvas);
function ensureMap(map: MapId) { if (game.map !== map) { game.dispose(); game = new Game(canvas, map); applyQuality(settings.quality); } }
$<HTMLSelectElement>('map').onchange = () => ensureMap($<HTMLSelectElement>('map').value as MapId);

// ----- Settings -----
interface Settings { sensitivity: number; fov: number; volume: number; showFps: boolean; reconnect: boolean; quality: GraphicsQuality; }
const SETTINGS_KEY = 'bansung-settings';
function defaults(): Settings { return { sensitivity: 2.3, fov: 85, volume: 60, showFps: true, reconnect: true, quality: 'medium' }; }
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults();
}
const settings = loadSettings();
let sensitivity = settings.sensitivity / 1000;

// ----- Networking -----
const FALLBACK_SERVER = (() => {
  const env = (import.meta.env.VITE_SERVER_URL || '').trim();
  if (env) return env;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
})();
const client = new Client(FALLBACK_SERVER);
let room: Room | undefined;
let snapshot: Snapshot | undefined;
let selfId = '';
let seq = 0;
let lastLocalShot = 0;
const keys = new Set<string>();
const weaponKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const;
let firing = false;
let pointerFallback = false;
let pingInterval = 0;
let pingMeasured = 0;
let reconnectAttempts = 0;
let lastChatFromTeam = false;
let reconnectTimer: number | undefined;

function lockPointer() {
  canvas.requestPointerLock().catch(() => {
    pointerFallback = true;
    show('pause', false);
    $<HTMLDivElement>('controls-hint').textContent = 'WASD DI CHUYỂN · GIỮ CHUỘT PHẢI ĐỂ XOAY · CLICK TRÁI ĐỂ BẮN · R THAY ĐẠN · Y CHAT · TAB BẢNG ĐIỂM';
    toast('CHẾ ĐỘ CHUỘT THƯỜNG: GIỮ CHUỘT PHẢI ĐỂ XOAY');
  });
}

// ----- Audio -----
let audioContext: AudioContext | undefined;
type AudioCtx = AudioContext & { _master?: GainNode };
function audio() { return (audioContext ||= new AudioContext()) as AudioCtx; }
function applyVolume() {
  const ctx = audio();
  if (!ctx._master) {
    ctx._master = ctx.createGain();
    ctx._master.connect(ctx.destination);
  }
  ctx._master.gain.value = settings.volume / 100;
}
function playShot(weapon: WeaponId) {
  const context = audio(); applyVolume();
  if (!context._master) return;
  const profiles: Record<WeaponId, { pitch: number; noise: number; decay: number }> = {
    rifle: { pitch: 700, noise: 0.28, decay: 0.18 },
    smg: { pitch: 1100, noise: 0.22, decay: 0.1 },
    sniper: { pitch: 380, noise: 0.35, decay: 0.4 },
    pistol: { pitch: 950, noise: 0.2, decay: 0.12 },
  };
  const p = profiles[weapon];
  const count = Math.floor(context.sampleRate * p.decay);
  const buffer = context.createBuffer(1, count, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / count) ** 2;
  const source = context.createBufferSource(); source.buffer = buffer;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = p.pitch;
  const gain = context.createGain(); gain.gain.value = p.noise;
  source.connect(filter).connect(gain).connect(context._master); source.start();
}
function playHit(head: boolean) {
  const context = audio(); applyVolume();
  if (!context._master) return;
  const tone = context.createOscillator(), gain = context.createGain();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(head ? 920 : 620, context.currentTime);
  tone.frequency.exponentialRampToValueAtTime(head ? 480 : 330, context.currentTime + 0.09);
  gain.gain.setValueAtTime(0.16, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
  tone.connect(gain).connect(context._master); tone.start(); tone.stop(context.currentTime + 0.13);
}
function playKill() {
  const context = audio(); applyVolume();
  if (!context._master) return;
  const tone = context.createOscillator(), gain = context.createGain();
  tone.type = 'sawtooth'; tone.frequency.setValueAtTime(440, context.currentTime);
  tone.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.1, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
  tone.connect(gain).connect(context._master); tone.start(); tone.stop(context.currentTime + 0.2);
}
function playReload() {
  const context = audio(); applyVolume();
  if (!context._master) return;
  // Click 1 - rút băng đạn
  const click1 = context.createOscillator(), g1 = context.createGain();
  click1.type = 'square'; click1.frequency.value = 220;
  g1.gain.setValueAtTime(0.1, context.currentTime);
  g1.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.06);
  click1.connect(g1).connect(context._master); click1.start(); click1.stop(context.currentTime + 0.07);
  // Click 2 - lắp băng đạn mới
  const click2 = context.createOscillator(), g2 = context.createGain();
  click2.type = 'square'; click2.frequency.value = 360;
  g2.gain.setValueAtTime(0, context.currentTime + 0.5);
  g2.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.5);
  g2.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.62);
  click2.connect(g2).connect(context._master); click2.start(context.currentTime + 0.5); click2.stop(context.currentTime + 0.65);
}
function playStep() {
  const context = audio(); applyVolume();
  if (!context._master) return;
  // Tiếng bước chân nhẹ
  const buffer = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.sin((i / data.length) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env * 0.3;
  }
  const src = context.createBufferSource(); src.buffer = buffer;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 280;
  src.connect(filter).connect(context._master); src.start();
}
function playJump() {
  const context = audio(); applyVolume();
  if (!context._master) return;
  const tone = context.createOscillator(), gain = context.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(420, context.currentTime);
  tone.frequency.exponentialRampToValueAtTime(180, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.13);
  tone.connect(gain).connect(context._master); tone.start(); tone.stop(context.currentTime + 0.14);
}
function playLand() {
  const context = audio(); applyVolume();
  if (!context._master) return;
  const buffer = context.createBuffer(1, context.sampleRate * 0.08, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 2);
    data[i] = (Math.random() * 2 - 1) * env * 0.45;
  }
  const src = context.createBufferSource(); src.buffer = buffer;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 200;
  src.connect(filter).connect(context._master); src.start();
}

// ----- UI helpers -----
function setError(message: string) { $('error').textContent = message; }
function show(id: string, visible: boolean) { $(id).classList.toggle('hidden', !visible); }
function timeString(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
let tipTimeout: number | undefined;
function showTip(message: string, duration = 2200) {
  const el = $('tip');
  el.textContent = message;
  el.classList.add('show');
  if (tipTimeout) clearTimeout(tipTimeout);
  tipTimeout = window.setTimeout(() => el.classList.remove('show'), duration);
}
function toast(message: string) {
  const el = $('eventToast');
  el.textContent = message;
  show('eventToast', true);
  setTimeout(() => show('eventToast', false), 2500);
}
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

// ----- Connect / reconnect -----
const savedName = localStorage.getItem('bansung-name');
if (savedName) $<HTMLInputElement>('name').value = savedName;
if (location.hash.length > 1) $<HTMLInputElement>('roomCode').value = location.hash.slice(1);

async function connect(create: boolean) {
  setError('');
  const name = $<HTMLInputElement>('name').value.trim() || `Chiến binh ${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem('bansung-name', name);
  $('connection').textContent = 'ĐANG KẾT NỐI';
  try {
    const code = $<HTMLInputElement>('roomCode').value.trim();
    if (!create && !code) throw new Error('Nhập mã phòng để tham gia.');
    const character = $<HTMLDivElement>('characterGrid').querySelector('.selected')?.getAttribute('data-character') as CharacterId || 'soldier';
    room = create
      ? await client.create('arena', {
          name, mode: $<HTMLSelectElement>('mode').value as Mode,
          map: $<HTMLSelectElement>('map').value,
          teamCount: Number($<HTMLSelectElement>('teamCount').value),
          character,
        })
      : await client.joinById(code, { name });
    selfId = room.sessionId;
    reconnectAttempts = 0;
    location.hash = room.roomId;
    $('roomId').textContent = room.roomId;
    $('connection').textContent = 'ĐÃ KẾT NỐI';
    show('menu', false); show('lobby', true);
    pingMeasured = 0;
    pingInterval = window.setInterval(() => {
      $('ping').textContent = `${pingMeasured || '—'} ms`;
      $('ping').className = pingMeasured > 300 ? 'bad' : pingMeasured > 150 ? 'warn' : '';
      if (room) room.send('ping', { ts: Date.now() });
    }, 500);

    room.onMessage('snapshot', (data: Snapshot) => {
      snapshot = data;
      ensureMap(data.map);
      game.setSnapshot(data, selfId);
      renderUI();
      // hiển thị artifact marker
      if (data.artifact && data.mode === 'artifact' && data.phase === 'playing') {
        const marker = $<HTMLDivElement>('artifactMarker');
        if (!data.artifact.carrier) {
          marker.textContent = '◆';
          marker.style.display = 'block';
        } else if (data.artifact.carrier === selfId) {
          marker.textContent = '◆';
          marker.style.display = 'block';
          marker.style.color = '#ffd166';
        } else {
          // Ai đó đang cầm → ẩn trên HUD, sẽ vẽ trên minimap
          marker.style.display = 'none';
        }
      } else {
        $<HTMLDivElement>('artifactMarker').style.display = 'none';
      }
      // refresh chat HUD từ server
      if (data.chat && Array.isArray(data.chat)) renderHudChat(data.chat);
    });
    room.onMessage('event', (event: Record<string, unknown>) => {
      const type = String(event.type);
      if (type === 'start') {
        document.body.classList.add('playing');
        show('lobby', false); show('hud', true); show('pause', !pointerFallback);
        toast(`${MODE_LABELS[event.mode as Mode] || 'TRẬN ĐẤU'} — BẮT ĐẦU!`);
        show('results', false);
      }
      if (type === 'finish') {
        document.body.classList.remove('playing');
        document.exitPointerLock();
        const winner = Number(event.winner);
        const stats = event.stats as MatchStats | undefined;
        toast(`ĐỘI ${TEAM_NAMES[winner]} CHIẾN THẮNG`);
        show('lobby', true); show('hud', false); show('killcam', false);
        if (stats) renderResults(stats, winner);
      }
      if (type === 'shot' && event.id === selfId) game.shot();
      if (type === 'shot') {
        // play shot for the shooter if remote echo
        if (event.id === selfId) playShot(event.weapon as WeaponId);
      }
      if (type === 'hit' && event.id === selfId) {
        const head = !!event.head;
        playHit(head);
        const hm = $('hitmarker');
        hm.textContent = head ? '✕' : '✕';
        hm.classList.toggle('headshot', head);
        hm.classList.add('visible');
        setTimeout(() => hm.classList.remove('visible'), head ? 220 : 110);
        if (head) {
          const popup = $('headshot');
          popup.classList.remove('show');
          void popup.offsetWidth;
          popup.classList.add('show');
        }
      }
      if (type === 'hit' && event.target === selfId) {
        showDamageFromAngle(Number(event.killerX), Number(event.killerZ));
        flashDamage();
      }
      if (type === 'kill') {
        addKill(String(event.killer), String(event.victim), Number(event.team), !!event.head, Number(event.streak || 0), event.weapon as WeaponId, event.victimId === selfId, event.killerId === selfId);
        if (event.killerId === selfId) playKill();
        if (event.victimId === selfId) showKillcam(String(event.killer), event.weapon as WeaponId);
      }
    });
    room.onMessage('chat', (msg: ChatMessage) => {
      if (snapshot) {
        if (!snapshot.chat) snapshot.chat = [];
        snapshot.chat.push(msg);
        if (snapshot.chat.length > 30) snapshot.chat.shift();
      }
      renderHudChatItem(msg);
      // Render trong lobby chat log
      const log = $<HTMLDivElement>('lobbyChatLog');
      if (!log.closest('.hidden')) addChatLine(log, msg);
    });
    room.onMessage('pong', (payload: { ts: number }) => {
      pingMeasured = Math.round((Date.now() - payload.ts) / 2);
    });
    room.onLeave((code: number) => {
      console.warn('Room leave', code);
      const codeNum = Number(code);
      // 1000 = bình thường (do client chủ động leave), 4xxx = lỗi server
      const wasKicked = codeNum === 4000 || codeNum === 4001;
      room = undefined;
      snapshot = undefined;
      window.clearInterval(pingInterval);
      document.body.classList.remove('playing');
      show('hud', false); show('lobby', false); show('menu', true); show('pause', false); show('killcam', false);
      $('connection').textContent = 'MẤT KẾT NỐI';
      document.exitPointerLock();
      if (!wasKicked && settings.reconnect && reconnectAttempts < 3) {
        reconnectAttempts++;
        toast(`MẤT KẾT NỐI — THỬ LẠI (${reconnectAttempts}/3)…`);
        reconnectTimer = window.setTimeout(() => connect(false), 1500 * reconnectAttempts);
      } else if (wasKicked) {
        setError('Bị máy chủ ngắt kết nối.');
      }
    });
  } catch (error) {
    $('connection').textContent = 'CHƯA KẾT NỐI';
    setError(error instanceof Error ? error.message : 'Không thể kết nối máy chủ.');
  }
}

// ----- Chat -----
function renderHudChat(messages: ChatMessage[]) {
  const el = $<HTMLDivElement>('hudChat');
  el.innerHTML = '';
  // Chỉ hiển thị tin nhắn gần đây (10 tin)
  const recent = messages.slice(-10);
  for (const m of recent) renderHudChatItem(m, el);
}
function renderHudChatItem(msg: ChatMessage, container?: HTMLDivElement) {
  const el = container || $<HTMLDivElement>('hudChat');
  if (container === undefined) {
    const line = document.createElement('div');
    fillChatLine(line, msg);
    el.appendChild(line);
    while (el.children.length > 10) el.removeChild(el.firstChild!);
  } else {
    fillChatLine(container, msg);
  }
}
function fillChatLine(line: HTMLDivElement, msg: ChatMessage) {
  line.innerHTML = '';
  if (msg.kind === 'system') {
    line.className = 'sys';
    line.textContent = msg.text;
    return;
  }
  const name = document.createElement('span');
  name.className = msg.kind === 'team' ? 'name team' : 'name';
  name.textContent = msg.name;
  line.appendChild(name);
  if (msg.kind === 'team') {
    const tag = document.createElement('span');
    tag.className = 'to-team';
    tag.textContent = 'ĐỘI';
    line.appendChild(tag);
  }
  line.appendChild(document.createTextNode(': ' + escapeHtml(msg.text)));
}
function addChatLine(container: HTMLDivElement, msg: ChatMessage) {
  const line = document.createElement('div');
  fillChatLine(line, msg);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
  while (container.children.length > 50) container.removeChild(container.firstChild!);
}
function sendChat(text: string, teamOnly: boolean) {
  if (!room || !text) return;
  room.send('chat', { text, team: teamOnly ? snapshot?.players.find(p => p.id === selfId)?.team : -1 });
  lastChatFromTeam = teamOnly;
}

$<HTMLInputElement>('lobbyChatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = $<HTMLInputElement>('lobbyChatInput').value.trim();
    if (v) { sendChat(v, false); $<HTMLInputElement>('lobbyChatInput').value = ''; }
  }
});
$<HTMLButtonElement>('lobbyChatSend').onclick = () => {
  const v = $<HTMLInputElement>('lobbyChatInput').value.trim();
  if (v) { sendChat(v, false); $<HTMLInputElement>('lobbyChatInput').value = ''; }
};

function openHudChat() {
  const wrap = $<HTMLDivElement>('hudChatInput');
  wrap.classList.remove('hidden');
  const field = $<HTMLInputElement>('hudChatField');
  field.value = '';
  field.focus();
}
function closeHudChat() {
  $<HTMLDivElement>('hudChatInput').classList.add('hidden');
}
$<HTMLInputElement>('hudChatField').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = $<HTMLInputElement>('hudChatField').value.trim();
    if (v) { sendChat(v, lastChatFromTeam); $<HTMLInputElement>('hudChatField').value = ''; }
    closeHudChat();
  } else if (e.key === 'Escape') {
    closeHudChat();
  }
});
$<HTMLButtonElement>('hudChatSend').onclick = () => {
  const v = $<HTMLInputElement>('hudChatField').value.trim();
  if (v) sendChat(v, lastChatFromTeam);
  closeHudChat();
};
$<HTMLButtonElement>('hudChatTeam').onclick = () => {
  lastChatFromTeam = !lastChatFromTeam;
  $<HTMLButtonElement>('hudChatTeam').classList.toggle('on', lastChatFromTeam);
};

// ----- Kill feed -----
const weaponIconMap: Record<WeaponId, string> = {
  rifle: '▰', smg: '≡', sniper: '◉', pistol: '▱',
};
function addKill(killer: string, victim: string, team: number, head: boolean, streak: number, weapon: WeaponId, victimIsSelf: boolean, killerIsSelf: boolean) {
  const line = document.createElement('div');
  if (head) line.classList.add('headshot');
  if (killerIsSelf || victimIsSelf) line.classList.add('self-kill');
  const wk = document.createElement('span'); wk.className = 'weapon-icon'; wk.textContent = weaponIconMap[weapon] || '·';
  const left = document.createElement('b'); left.textContent = killer; left.style.color = TEAM_COLORS[team];
  const right = document.createElement('span'); right.textContent = ` ${head ? '⌖' : '✕'} ${victim}`;
  line.append(wk, left, right);
  if (head) {
    const tag = document.createElement('span'); tag.className = 'streak'; tag.textContent = 'HS';
    line.append(tag);
  } else if (streak >= 3) {
    const tag = document.createElement('span'); tag.className = `streak x${streak >= 5 ? 5 : 3}`; tag.textContent = `x${streak}`;
    line.append(tag);
  }
  $('killfeed').prepend(line);
  // Giữ tối đa 5 dòng, xóa dòng cũ
  const kf = $('killfeed');
  while (kf.children.length > 5) kf.removeChild(kf.lastChild!);
  setTimeout(() => line.remove(), 4800);
}

function showDamageFromAngle(kx: number, kz: number) {
  const self = snapshot?.players.find(p => p.id === selfId);
  if (!self) return;
  const dx = kx - self.x, dz = kz - self.z;
  const len = Math.hypot(dx, dz) || 1;
  const angle = Math.atan2(dz, dx) - self.yaw;
  const norm = Math.atan2(Math.sin(angle), Math.cos(angle));
  const indicator = $('damageIndicator');
  indicator.style.transform = `translate(-50%, -50%) rotate(${(norm * 180 / Math.PI + 90).toFixed(0)}deg)`;
  indicator.classList.remove('show');
  void indicator.offsetWidth;
  indicator.classList.add('show');
}
function flashDamage() {
  const el = $('damageFlash');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

let respawnInterval: number | undefined;
function showKillcam(killer: string, weapon: WeaponId) {
  $('killcamMsg').textContent = killer;
  $('killcamWeapon').textContent = WEAPONS[weapon]?.label ?? '';
  show('killcam', true);
  if (respawnInterval) clearInterval(respawnInterval);
  let remaining = 4;
  $('respawnTimer').textContent = String(remaining);
  show('respawn', true);
  respawnInterval = window.setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(respawnInterval);
      show('respawn', false);
      show('killcam', false);
    } else {
      $('respawnTimer').textContent = String(remaining);
    }
  }, 1000);
}

// ----- Spectator -----
function renderSpectator() {
  if (!snapshot) return;
  const self = snapshot.players.find(p => p.id === selfId);
  const alive = snapshot.players.filter(p => p.alive && p.id !== selfId);
  if (self && !self.alive && snapshot.phase === 'playing') {
    show('spectator', true);
    const target = alive.find(p => p.id === game.getSpectatorTargetId()) ?? alive[0];
    if (target) {
      if (target.id !== game.getSpectatorTargetId()) game.setSpectatorTarget(target.id);
      $('spectatorName').textContent = target.name;
      $('spectatorName').style.color = TEAM_COLORS[target.team];
      $('spectatorMeta').textContent = `Đội ${TEAM_NAMES[target.team]} · ${target.kills}/${target.deaths} · ${target.weapon.toUpperCase()}`;
    } else {
      $('spectatorName').textContent = '—';
      $('spectatorMeta').textContent = 'Đợi người chơi hồi sinh…';
    }
    // Target list buttons
    const list = $<HTMLDivElement>('spectatorList');
    list.innerHTML = alive.map(p =>
      `<button data-id="${p.id}" class="${p.id === game.getSpectatorTargetId() ? 'on' : ''}" style="border-color:${TEAM_COLORS[p.team]}">${escapeHtml(p.name)}</button>`
    ).join('');
    list.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => {
      game.setSpectatorTarget(b.dataset.id || null);
    });
  } else {
    show('spectator', false);
    game.setSpectatorTarget(null);
  }
}

// ----- UI render -----
const minimap = $<HTMLCanvasElement>('minimap');
const ctx = minimap.getContext('2d')!;

function renderUI() {
  if (!snapshot) return;
  const self = snapshot.players.find(p => p.id === selfId);
  $('playerCount').textContent = `${snapshot.players.length} / 16`;
  $('mapLabel').textContent = ` NGƯỜI CHƠI · ${MAP_NAMES[snapshot.map].toUpperCase()} · ${snapshot.config.maxMatchTime} PHÚT`;
  $('teamGrid').style.gridTemplateColumns = `repeat(${snapshot.teamCount}, minmax(0, 1fr))`;
  $('teamGrid').innerHTML = TEAM_NAMES.slice(0, snapshot.teamCount).map((name, team) => {
    const players = snapshot!.players.filter(p => p.team === team);
    const cap = Math.ceil(16 / snapshot!.teamCount);
    return `<div class="team-card" style="--team:${TEAM_COLORS[team]}"><div class="team-title"><span class="team-number">0${team + 1}</span><strong>ĐỘI ${name.toUpperCase()}</strong><span>${players.length}/${cap}</span></div><div class="team-members">${players.map(p => `<div><i></i><span>${escapeHtml(p.name)}${p.id === selfId ? ' (bạn)' : ''}</span><em>${p.ready ? 'SẴN SÀNG' : 'CHỜ'}</em></div>`).join('') || '<p>Đang chờ chiến binh...</p>'}</div><button data-team="${team}" ${players.length >= cap && self?.team !== team ? 'disabled' : ''}>${self?.team === team ? 'ĐỘI CỦA BẠN ✓' : 'CHỌN ĐỘI →'}</button></div>`;
  }).join('');
  $('teamGrid').querySelectorAll<HTMLButtonElement>('[data-team]').forEach(button => button.onclick = () => room?.send('team', Number(button.dataset.team)));
  $('ready').textContent = self?.ready ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG';
  if (self) weaponChoice.value = self.weapon;
  // Host config visibility
  $<HTMLDivElement>('hostConfig').hidden = snapshot.host !== selfId;
  if (snapshot.host === selfId && self) {
    $<HTMLSelectElement>('cfgTime').value = String(snapshot.config.maxMatchTime);
    $<HTMLSelectElement>('cfgScore').value = String(snapshot.config.scoreCap);
    $<HTMLSelectElement>('cfgCapSpeed').value = String(snapshot.config.captureSpeedMul);
    $<HTMLInputElement>('cfgHelmet').checked = snapshot.config.helmetEnabled;
    $<HTMLInputElement>('cfgFF').checked = snapshot.config.friendlyFire;
  }
  show('start', snapshot.host === selfId && snapshot.phase !== 'playing');
  $<HTMLButtonElement>('start').disabled = snapshot.players.length > 1 && snapshot.players.some(p => !p.ready);
  if (snapshot.phase === 'playing') {
    document.body.classList.add('playing');
    show('lobby', false); show('hud', true);
    show('pause', !pointerFallback && document.pointerLockElement !== canvas);
  }
  if (snapshot.phase === 'finished') { show('lobby', true); show('hud', false); }
  $('modeLabel').textContent = MODE_LABELS[snapshot.mode];
  $('scores').innerHTML = TEAM_NAMES.slice(0, snapshot.teamCount).map((name, team) => `<div class="score" style="--team:${TEAM_COLORS[team]}"><span>0${team + 1} ${name.toUpperCase()}</span><strong>${snapshot!.scores[team]}</strong></div>`).join('');
  if (self) {
    $('health').textContent = String(Math.max(0, self.hp));
    $('healthFill').style.width = `${Math.max(0, self.hp)}%`;
    $('armorFill').style.width = `${Math.max(0, self.armor)}%`;
    $<HTMLDivElement>('helmetIcon').style.opacity = self.helmet > 0 ? '1' : '0.25';
    $('ammo').textContent = String(self.ammo);
    $('reserve').textContent = String(self.reserve);
    $('weaponLabel').textContent = WEAPONS[self.weapon].label;
    // Low ammo warning
    if (self.ammo > 0 && self.ammo <= Math.floor(WEAPONS[self.weapon].magazine * 0.2)) {
      $('ammo').style.color = '#ffb13a';
    } else {
      $('ammo').style.color = '#fff';
    }
    if (!self.alive && snapshot.phase === 'playing' && !$('respawn').classList.contains('hidden') === false) {
      show('respawn', true);
    }
  }
  renderSpectator();
  drawMinimap();
}

// ----- Results screen -----
function renderResults(stats: MatchStats, winnerTeam: number) {
  const winnerName = TEAM_NAMES[winnerTeam] ?? '?';
  $<HTMLSpanElement>('resultsWinner').textContent = `ĐỘI ${winnerName.toUpperCase()} THẮNG`;
  $<HTMLSpanElement>('resultsWinner').style.color = TEAM_COLORS[winnerTeam];
  $('mvpName').textContent = stats.mvpName || '—';
  const mvpPlayer = snapshot?.players.find(p => p.id === stats.mvpId);
  if (mvpPlayer) $('mvpName').style.color = TEAM_COLORS[mvpPlayer.team];
  $('mvpStats').textContent = `MVP · ${stats.mvpKills} hạ gục · ${Math.round(stats.durationMs / 60000)} phút`;
  const tbody = $<HTMLTableSectionElement>('resultsTable');
  tbody.innerHTML = stats.perPlayer.map((p, i) => {
    const player = snapshot?.players.find(s => s.id === p.id);
    const color = player ? TEAM_COLORS[player.team] : '#fff';
    const isMvp = p.id === stats.mvpId;
    return `<tr class="${isMvp ? 'mvp' : ''}"><td>${i + 1}</td><td style="color:${color}">${escapeHtml(p.name)}</td><td>${TEAM_NAMES[p.team] || '?'}</td><td class="right">${p.kills}</td><td class="right">${p.deaths}</td><td class="right">${p.assists}</td><td class="right">${p.headshots}</td><td class="right">${p.damage}</td><td class="right">${Math.round(p.accuracy * 100)}%</td><td class="right">${p.longestStreak}</td></tr>`;
  }).join('');
  show('results', true);
}

function renderMapVotes(votes: Array<{ map: MapId; votes: number }>) {
  if (!votes) return;
  for (const v of votes) {
    const key = v.map === 'desert' ? 'voteDesert' : v.map === 'harbor' ? 'voteHarbor' : 'voteHighlands';
    const el = $<HTMLSpanElement>(key);
    if (el) el.textContent = `${v.votes} phiếu`;
  }
}

// ----- Minimap -----
function drawMinimap() {
  if (!snapshot) return;
  const size = minimap.width, scale = size / (HALF_WORLD * 2);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(12,27,34,.88)'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(164,201,207,.18)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size);
    ctx.moveTo(0, i * size / 4); ctx.lineTo(size, i * size / 4);
    ctx.stroke();
  }
  const map = (v: number) => (v + HALF_WORLD) * scale;
  for (const point of snapshot.points) {
    ctx.beginPath(); ctx.arc(map(point.x), map(point.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = point.owner < 0 ? '#eee0b5' : TEAM_COLORS[point.owner]; ctx.fill();
  }
  // Artifact marker
  if (snapshot.artifact && snapshot.mode === 'artifact') {
    ctx.beginPath();
    ctx.arc(map(snapshot.artifact.x), map(snapshot.artifact.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = snapshot.artifact.carrier ? '#ffd166' : '#ffeb70';
    ctx.fill();
    ctx.strokeStyle = '#ffae00'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const p of snapshot.players) {
    if (!p.alive && p.id !== selfId) continue;
    ctx.beginPath();
    ctx.arc(map(p.x), map(p.z), p.id === selfId ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = p.id === selfId ? '#ffffff' : TEAM_COLORS[p.team];
    ctx.fill();
    // Vẽ hướng aim ngắn
    if (p.id === selfId || (snapshot.phase === 'playing')) {
      ctx.beginPath();
      ctx.moveTo(map(p.x), map(p.z));
      ctx.lineTo(map(p.x) + Math.sin(p.yaw) * 8, map(p.z) + Math.cos(p.yaw) * 8);
      ctx.strokeStyle = p.id === selfId ? '#ffffff88' : TEAM_COLORS[p.team] + '88';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(190,230,229,.4)'; ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

// ----- Scoreboard panel -----
function renderScorePanel() {
  if (!snapshot) return;
  const teams = $<HTMLDivElement>('scoreTeams');
  teams.innerHTML = TEAM_NAMES.slice(0, snapshot.teamCount).map((name, team) => {
    const players = snapshot!.players.filter(p => p.team === team);
    const kills = players.reduce((s, p) => s + p.kills, 0);
    const deaths = players.reduce((s, p) => s + p.deaths, 0);
    return `<div class="team-block" style="--team:${TEAM_COLORS[team]}"><h3>ĐỘI ${name.toUpperCase()}</h3><div class="score-big">${snapshot!.scores[team]}</div><div class="stats">${players.length} người · ${kills}/${deaths}</div></div>`;
  }).join('');
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || (b.kills / Math.max(1, b.deaths)) - (a.kills / Math.max(1, a.deaths)));
  const tbody = $<HTMLTableSectionElement>('scoreTable');
  tbody.innerHTML = sorted.map(p => {
    const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
    return `<tr class="${p.id === selfId ? 'self' : ''}"><td style="color:${TEAM_COLORS[p.team]}">${escapeHtml(p.name)}${p.id === selfId ? ' (bạn)' : ''}</td><td>${TEAM_NAMES[p.team] || '?'}</td><td class="right">${p.kills}</td><td class="right">${p.deaths}</td><td class="right">${p.assists}</td><td class="right">${kd}</td><td class="right">${p.ping} ms</td></tr>`;
  }).join('');
}

// ----- Event handlers -----
$<HTMLButtonElement>('create').onclick = () => connect(true);
$<HTMLButtonElement>('join').onclick = () => connect(false);
$<HTMLButtonElement>('ready').onclick = () => room?.send('ready');
$<HTMLButtonElement>('start').onclick = () => room?.send('start');
weaponChoice.onchange = () => room?.send('weapon', weaponChoice.value);
charGrid.querySelectorAll<HTMLDivElement>('.character-card').forEach(card => card.onclick = () => {
  charGrid.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  const id = card.getAttribute('data-character') as CharacterId;
  room?.send('character', id);
});
$<HTMLButtonElement>('copy').onclick = async () => { await navigator.clipboard.writeText(location.href); toast('ĐÃ SAO CHÉP LINK MỜI'); };
$<HTMLButtonElement>('resume').onclick = lockPointer;
$<HTMLButtonElement>('leave').onclick = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  room?.leave(true);
  location.hash = '';
};
$<HTMLButtonElement>('resultsLeave').onclick = () => {
  show('results', false);
  room?.leave(true);
  location.hash = '';
};

// Host config UI
$<HTMLSelectElement>('cfgTime').onchange = () => room?.send('config', { maxMatchTime: Number($<HTMLSelectElement>('cfgTime').value) });
$<HTMLSelectElement>('cfgScore').onchange = () => room?.send('config', { scoreCap: Number($<HTMLSelectElement>('cfgScore').value) });
$<HTMLSelectElement>('cfgCapSpeed').onchange = () => room?.send('config', { captureSpeedMul: Number($<HTMLSelectElement>('cfgCapSpeed').value) });
$<HTMLInputElement>('cfgHelmet').onchange = () => room?.send('config', { helmetEnabled: $<HTMLInputElement>('cfgHelmet').checked });
$<HTMLInputElement>('cfgFF').onchange = () => room?.send('config', { friendlyFire: $<HTMLInputElement>('cfgFF').checked });

// Score panel toggle
$<HTMLButtonElement>('scoreBtn').onclick = () => {
  document.body.classList.toggle('show-score');
  renderScorePanel();
};
$<HTMLButtonElement>('scoreClose').onclick = () => document.body.classList.remove('show-score');

// Map vote
$<HTMLDivElement>('mapVote').querySelectorAll<HTMLButtonElement>('button').forEach(btn => btn.onclick = () => {
  const map = btn.dataset.map as MapId;
  room?.send('vote', map);
  $<HTMLDivElement>('mapVote').querySelectorAll('button').forEach(b => b.classList.remove('voted'));
  btn.classList.add('voted');
});

// ----- Settings -----
function applyQuality(q: GraphicsQuality) {
  settings.quality = q;
  game.setQuality(q);
  document.querySelectorAll<HTMLButtonElement>('.quality-row button').forEach(b => b.classList.toggle('on', b.dataset.q === q));
}
function applySettingsToUI() {
  $<HTMLInputElement>('optSensitivity').value = String(settings.sensitivity);
  $<HTMLInputElement>('optFov').value = String(settings.fov);
  $<HTMLInputElement>('optVolume').value = String(settings.volume);
  $<HTMLInputElement>('optShowFps').checked = settings.showFps;
  $<HTMLInputElement>('optReconnect').checked = settings.reconnect;
  $('optSensitivityVal').textContent = settings.sensitivity.toFixed(1);
  $('optFovVal').textContent = String(settings.fov);
  $('optVolumeVal').textContent = String(settings.volume);
  $('topbar').querySelector('.topbar-stats')!.classList.toggle('hidden', !settings.showFps);
  game.setFov(settings.fov);
  sensitivity = settings.sensitivity / 1000;
  applyQuality(settings.quality);
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
$<HTMLButtonElement>('settingsBtn').onclick = () => show('settingsPanel', true);
$<HTMLButtonElement>('settingsClose').onclick = () => show('settingsPanel', false);
document.querySelectorAll<HTMLButtonElement>('.quality-row button').forEach(b => b.onclick = () => { applyQuality(b.dataset.q as GraphicsQuality); saveSettings(); });
$<HTMLInputElement>('optSensitivity').oninput = () => {
  settings.sensitivity = Number($<HTMLInputElement>('optSensitivity').value);
  $('optSensitivityVal').textContent = settings.sensitivity.toFixed(1);
  sensitivity = settings.sensitivity / 1000; saveSettings();
};
$<HTMLInputElement>('optFov').oninput = () => {
  settings.fov = Number($<HTMLInputElement>('optFov').value);
  $('optFovVal').textContent = String(settings.fov);
  game.setFov(settings.fov); saveSettings();
};
$<HTMLInputElement>('optVolume').oninput = () => {
  settings.volume = Number($<HTMLInputElement>('optVolume').value);
  $('optVolumeVal').textContent = String(settings.volume);
  applyVolume(); saveSettings();
};
$<HTMLInputElement>('optShowFps').onchange = () => {
  settings.showFps = $<HTMLInputElement>('optShowFps').checked;
  document.querySelector('.topbar-stats')!.classList.toggle('hidden', !settings.showFps);
  saveSettings();
};
$<HTMLInputElement>('optReconnect').onchange = () => {
  settings.reconnect = $<HTMLInputElement>('optReconnect').checked;
  saveSettings();
};
applySettingsToUI();

// ----- Input handlers -----
canvas.addEventListener('click', () => { if (snapshot?.phase === 'playing' && !pointerFallback && document.pointerLockElement !== canvas) lockPointer(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) { firing = false; keys.clear(); }
  show('pause', snapshot?.phase === 'playing' && !pointerFallback && document.pointerLockElement !== canvas);
});
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement === canvas || (pointerFallback && event.buttons & 2)) game.aim(event.movementX, event.movementY, sensitivity);
});
document.addEventListener('mousedown', event => {
  if (event.button === 0 && (document.pointerLockElement === canvas || (pointerFallback && event.target === canvas))) firing = true;
});
document.addEventListener('mouseup', event => { if (event.button === 0) firing = false; });

// Track footstep audio, jump/land, reload
let stepAccum = 0;
let lastGrounded = true;
let lastReloadingState: boolean = false;
let lastAmmo = 0;

document.addEventListener('keydown', event => {
  keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  const idx = weaponKeys.indexOf(event.code as typeof weaponKeys[number]);
  if (idx >= 0) {
    const id = ['rifle', 'smg', 'sniper', 'pistol'][idx] as WeaponId;
    if (id in WEAPONS) room?.send('weapon', id);
  }
  if (event.code === 'KeyY' && snapshot?.phase === 'playing') {
    openHudChat();
    event.preventDefault();
  }
  if (event.code === 'Escape') {
    closeHudChat();
    document.exitPointerLock();
  }
  if (event.code === 'Tab' && snapshot?.phase === 'playing') {
    event.preventDefault();
    renderScorePanel();
    document.body.classList.add('show-score');
  }
  if (event.code === 'ArrowLeft' && snapshot?.phase === 'playing') {
    game.cycleSpectatorTarget(-1);
  }
  if (event.code === 'ArrowRight' && snapshot?.phase === 'playing') {
    game.cycleSpectatorTarget(1);
  }
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); firing = false; });
// TAB release → ẩn scoreboard
document.addEventListener('keyup', e => { if (e.code === 'Tab') document.body.classList.remove('show-score'); });

// ----- Game loop: input + firing -----
setInterval(() => {
  if (!room || snapshot?.phase !== 'playing') return;
  const aim = game.getAim();
  const self = snapshot.players.find(p => p.id === selfId);
  const input: Input = {
    seq: ++seq,
    forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    yaw: aim.yaw, pitch: aim.pitch,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: keys.has('ControlLeft') || keys.has('KeyC'),
    jump: keys.has('Space'), fire: firing, reload: keys.has('KeyR'),
  };
  room.send('input', input);

  const weapon = self?.weapon || 'rifle';
  if (firing && performance.now() - lastLocalShot > WEAPONS[weapon].interval) {
    lastLocalShot = performance.now();
    game.shot();
    playShot(weapon);
  }
  // Reload audio: nếu đang giữ R và bắt đầu reload
  const reloading = !!(keys.has('KeyR') && self && self.ammo < WEAPONS[self.weapon].magazine && self.reserve > 0 && !self.alive === false);
  if (reloading && !lastReloadingState && self && self.ammo !== lastAmmo) {
    playReload();
  }
  lastReloadingState = reloading;
  lastAmmo = self?.ammo ?? 0;
  // Footstep + jump
  if (self?.alive && !self.alive) void self; // noop
  const isMoving = self?.alive && (input.forward !== 0 || input.strafe !== 0);
  const isGrounded = self?.alive; // server-authoritative, gần đúng
  if (isMoving && isGrounded) {
    stepAccum += 33;
    const interval = input.sprint ? 320 : input.crouch ? 600 : 420;
    if (stepAccum >= interval) { stepAccum = 0; playStep(); }
  } else {
    stepAccum = 0;
  }
  if (self?.alive && input.jump && lastGrounded) playJump();
  // Land detection: nếu rơi xuống từ jump → tiếng land
  if (!input.jump && !lastGrounded && self?.alive) playLand();
  lastGrounded = !input.jump;
}, 33);

setInterval(() => {
  if (snapshot?.phase === 'playing') $('timer').textContent = timeString(snapshot.endsAt - Date.now());
}, 250);

// FPS counter
let frameCount = 0;
let lastFps = performance.now();
function fpsTick() {
  frameCount++;
  const now = performance.now();
  if (now - lastFps > 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFps));
    $('fps').textContent = `${fps} fps`;
    frameCount = 0; lastFps = now;
  }
  requestAnimationFrame(fpsTick);
}
fpsTick();
