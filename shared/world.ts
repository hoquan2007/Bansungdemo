export const WORLD_SIZE = 480;
export const HALF_WORLD = WORLD_SIZE / 2;
export const TEAM_COLORS = ['#49c3e4', '#ff756a', '#e9c45c', '#b695ff'] as const;
export const TEAM_NAMES = ['Lam', 'Đỏ', 'Vàng', 'Tím'] as const;
export const MAP_NAMES = { highlands: 'Thung lũng', desert: 'Hẻm núi', harbor: 'Cảng biển' } as const;
export type MapId = keyof typeof MAP_NAMES;

export type Mode = 'tdm' | 'domination' | 'artifact';
export const MODE_LABELS: Record<Mode, string> = {
  tdm: 'Đấu đội',
  domination: 'Chiếm cứ điểm',
  artifact: 'Tranh vật phẩm',
};

// Hồ sơ nhân vật — mỗi cái là 1 GLB từ Quaternius + màu HUD riêng
export type CharacterId = 'soldier' | 'swat';
export const CHARACTERS: Record<CharacterId, { label: string; model: string; scale: number }> = {
  soldier: { label: 'Bộ binh', model: 'char_soldier.glb', scale: 1.0 },
  swat:    { label: 'Đặc nhiệm', model: 'char_swat.glb',    scale: 1.05 },
};

export const WEAPONS = {
  rifle:  { label: 'AR-4 / SÚNG TRƯỜNG', magazine: 30, reserve: 120, interval: 145, reload: 1700, damage: 34, head: 58, range: 185, model: 'gun_rifle.glb', kickback: 0.022 },
  smg:    { label: 'VX-9 / TIỂU LIÊN',   magazine: 40, reserve: 160, interval: 85,  reload: 1900, damage: 22, head: 38, range: 95,  model: 'gun_smg.glb',   kickback: 0.012 },
  sniper: { label: 'R-12 / BẮN TỈA',     magazine: 5,  reserve: 25,  interval: 950, reload: 2450, damage: 85, head: 120, range: 320, model: 'gun_sniper.glb', kickback: 0.06 },
  pistol: { label: 'P-8 / SÚNG NGẮN',    magazine: 15, reserve: 75,  interval: 230, reload: 1300, damage: 28, head: 49, range: 90,  model: 'gun_pistol.glb', kickback: 0.018 },
} as const;
export type WeaponId = keyof typeof WEAPONS;

// Cấu hình phòng — chủ phòng đặt lúc tạo
export type RoomConfig = {
  friendlyFire: boolean;
  helmetEnabled: boolean;
  maxMatchTime: number; // phút
  captureSpeedMul: number; // 1 = bình thường
  scoreCap: number; // kills (TDM) hoặc points (DOM/ART)
};

export const DEFAULT_CONFIG: RoomConfig = {
  friendlyFire: false,
  helmetEnabled: true,
  maxMatchTime: 12,
  captureSpeedMul: 1.0,
  scoreCap: 50,
};

export type Input = {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  fire: boolean;
  reload: boolean;
};

export type PlayerView = {
  id: string;
  name: string;
  team: number;
  character: CharacterId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;       // máu trừ giáp
  armor: number;    // giáp riêng
  helmet: number;   // mũ bảo hiểm riêng (giảm headshot damage)
  ammo: number;
  reserve: number;
  kills: number;
  deaths: number;
  assists: number;
  ping: number;     // server đo
  alive: boolean;
  ready: boolean;
  weapon: WeaponId;
  killStreak: number;
};

export type Snapshot = {
  players: PlayerView[];
  scores: number[];
  phase: 'lobby' | 'playing' | 'finished';
  endsAt: number;
  mode: Mode;
  map: MapId;
  host: string;
  teamCount: number;
  points: { x: number; z: number; owner: number; progress: number }[];
  artifact: { x: number; z: number; carrier: string | null } | null;
  config: RoomConfig;
  serverTime: number;
  matchStats: MatchStats | null;
  chat?: ChatMessage[];
  mapVotes?: Array<{ map: MapId; votes: number }>;
};

export type MatchStats = {
  durationMs: number;
  mvpId: string;
  mvpKills: number;
  mvpName: string;
  perTeam: Array<{ team: number; score: number; kills: number; deaths: number; players: number }>;
  perPlayer: Array<{
    id: string; name: string; team: number;
    kills: number; deaths: number; assists: number;
    damage: number; accuracy: number; longestStreak: number;
    headshots: number;
  }>;
};

// Chat message — dùng cho cả lobby và in-game
export type ChatMessage = {
  id: string;
  from: string;   // session id
  name: string;
  text: string;
  team: number;   // -1 = all, 0..3 = team only
  ts: number;
  kind: 'lobby' | 'team' | 'all' | 'system';
};

// Vote map cho end-of-match
export type MapVote = { map: MapId; votes: number };

export const SPAWNS = [
  { x: 0, z: -185 },
  { x: 185, z: 0 },
  { x: 0, z: 185 },
  { x: -185, z: 0 },
];

export function spawnFor(team: number, teamCount: number) {
  return SPAWNS[teamCount === 2 ? team * 2 : team];
}

// Spawn slot cho mỗi người trong đội (offset quanh base)
export function spawnOffsetFor(slot: number): { dx: number; dz: number } {
  const angle = slot * 2.39996; // golden angle
  const radius = slot === 0 ? 0 : 3.5 + Math.sqrt(slot) * 2.5;
  return { dx: Math.cos(angle) * radius, dz: Math.sin(angle) * radius };
}

export const CONTROL_POINTS = [
  { x: 0, z: 0 },
  { x: -105, z: -45 },
  { x: 105, z: 45 },
];

// Vị trí vật phẩm (chế độ Artifact)
export const ARTIFACT_SPAWNS = [
  { x: 0, z: 0 },
];

export type Structure = { x: number; z: number; w: number; d: number; h: number; kind: 'building' | 'cover' | 'tower' };
export const STRUCTURES: Structure[] = [
  { x: -48, z: -50, w: 24, d: 18, h: 10, kind: 'building' },
  { x: 42, z: 35, w: 30, d: 20, h: 13, kind: 'building' },
  { x: -105, z: 18, w: 19, d: 22, h: 8, kind: 'building' },
  { x: 110, z: -70, w: 23, d: 19, h: 10, kind: 'building' },
  { x: 80, z: 130, w: 20, d: 16, h: 8, kind: 'building' },
  { x: -130, z: -128, w: 22, d: 18, h: 9, kind: 'building' },
  { x: -10, z: 65, w: 13, d: 8, h: 3, kind: 'cover' },
  { x: 20, z: -60, w: 15, d: 8, h: 3, kind: 'cover' },
  { x: -75, z: 100, w: 15, d: 8, h: 3, kind: 'cover' },
  { x: 100, z: -5, w: 15, d: 8, h: 3, kind: 'cover' },
  { x: -160, z: 35, w: 8, d: 8, h: 18, kind: 'tower' },
  { x: 165, z: -20, w: 8, d: 8, h: 18, kind: 'tower' },
];

export const DESERT_STRUCTURES: Structure[] = [
  { x: -55, z: -48, w: 28, d: 21, h: 9, kind: 'building' },
  { x: 50, z: 48, w: 24, d: 20, h: 11, kind: 'building' },
  { x: -125, z: 25, w: 25, d: 19, h: 7, kind: 'building' },
  { x: 115, z: -100, w: 25, d: 17, h: 8, kind: 'building' },
  { x: -10, z: -20, w: 18, d: 6, h: 3, kind: 'cover' },
  { x: 20, z: 85, w: 16, d: 8, h: 3, kind: 'cover' },
  { x: -88, z: 105, w: 17, d: 7, h: 3, kind: 'cover' },
  { x: 106, z: 25, w: 18, d: 7, h: 3, kind: 'cover' },
  { x: -150, z: -110, w: 9, d: 9, h: 17, kind: 'tower' },
  { x: 145, z: 108, w: 9, d: 9, h: 17, kind: 'tower' },
];

export const HARBOR_STRUCTURES: Structure[] = [
  { x: -45, z: -50, w: 40, d: 26, h: 12, kind: 'building' },
  { x: 52, z: 32, w: 38, d: 28, h: 13, kind: 'building' },
  { x: -132, z: 10, w: 31, d: 20, h: 9, kind: 'building' },
  { x: 135, z: -75, w: 32, d: 22, h: 10, kind: 'building' },
  { x: -20, z: 65, w: 24, d: 7, h: 3, kind: 'cover' },
  { x: 25, z: -65, w: 24, d: 7, h: 3, kind: 'cover' },
  { x: -95, z: -100, w: 20, d: 7, h: 3, kind: 'cover' },
  { x: 100, z: 100, w: 20, d: 7, h: 3, kind: 'cover' },
  { x: -150, z: 110, w: 8, d: 8, h: 20, kind: 'tower' },
  { x: 155, z: -125, w: 8, d: 8, h: 20, kind: 'tower' },
  ...[-90, -70, 70, 90].flatMap(x => [-115, -85, 85, 115].map(z => ({ x, z, w: 13, d: 4, h: 3.2, kind: 'cover' as const }))),
  ...[-60, -30, 30, 60].map(x => ({ x, z: 0, w: 12, d: 4, h: 3.2, kind: 'cover' as const })),
];

export function structuresFor(map: MapId): Structure[] {
  return map === 'desert' ? DESERT_STRUCTURES : map === 'harbor' ? HARBOR_STRUCTURES : STRUCTURES;
}

export function terrainHeight(x: number, z: number, map: MapId = 'highlands'): number {
  if (map === 'harbor') return Math.sin(x * 0.014) * 0.8 + Math.cos(z * 0.018) * 0.6 + Math.sin((x + z) * 0.06) * 0.22;
  if (map === 'desert') {
    const dunes = Math.sin(x * 0.014) * Math.cos(z * 0.012) * 5 + Math.sin((x - z) * 0.027) * 2;
    const mesas = 13 * Math.exp(-((x + 115) ** 2 + (z - 85) ** 2) / 3500) + 11 * Math.exp(-((x - 120) ** 2 + (z + 100) ** 2) / 2900);
    return dunes + mesas;
  }
  const ridge = Math.sin(x * 0.018) * Math.cos(z * 0.014) * 5;
  const broad = Math.sin((x + z) * 0.008) * 4;
  const detail = Math.sin(x * 0.09) * Math.cos(z * 0.075) * 0.8;
  const centerFlatten = Math.min(1, Math.hypot(x, z) / 90);
  return (ridge + broad + detail) * (0.35 + centerFlatten * 0.65);
}

export function clampWorld(v: number): number {
  return Math.max(-HALF_WORLD + 4, Math.min(HALF_WORLD - 4, v));
}

export function collidesStructure(x: number, z: number, radius = 0.45, map: MapId = 'highlands'): boolean {
  return structuresFor(map).some(s => Math.abs(x - s.x) < s.w / 2 + radius && Math.abs(z - s.z) < s.d / 2 + radius);
}

export function moveGround(x: number, z: number, dx: number, dz: number, map: MapId = 'highlands'): { x: number; z: number } {
  const nx = clampWorld(x + dx);
  const nz = clampWorld(z + dz);
  if (!collidesStructure(nx, z, 0.45, map)) x = nx;
  if (!collidesStructure(x, nz, 0.45, map)) z = nz;
  return { x, z };
}

// Validate movement server-side: anti-cheat clamp
// Người chơi không thể đi nhanh hơn MAX_PLAYER_SPEED * dt trong 1 tick
export const MAX_PLAYER_SPEED = 11; // m/s (sprint max)
export const MAX_DT = 0.1; // chống dt lớn bất thường

// Validate aim server-side
export const MIN_PITCH = -1.35;
export const MAX_PITCH = 1.35;

// Sinh mã phòng ngắn gọn (4 ký tự, tránh nhầm lẫn) — dùng cho share link
export function shortRoomCode(roomId: string): string {
  return roomId.length <= 8 ? roomId : roomId.slice(0, 4).toUpperCase() + roomId.slice(-2).toUpperCase();
}
