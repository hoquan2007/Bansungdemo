import { Server, Room, WebSocketTransport, matchMaker, type Client } from 'colyseus';
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import {
  ARTIFACT_SPAWNS, CHARACTERS, CONTROL_POINTS, DEFAULT_CONFIG, MAX_DT, MAX_PITCH as MIN_PITCH, MAX_PLAYER_SPEED,
  MODE_LABELS, moveGround, shortRoomCode, spawnFor, spawnOffsetFor, structuresFor, terrainHeight,
  WEAPONS,
  MAX_PITCH as _MAX_PITCH,
  type ChatMessage, type CharacterId, type Input, type MapId, type MatchStats, type Mode,
  type PlayerView, type RoomConfig, type Snapshot, type WeaponId,
} from '../shared/world.js';
const MAX_PITCH = _MAX_PITCH;
type Fighter = PlayerView & {
  input: Input;
  vy: number;
  grounded: boolean;
  nextShot: number;
  reloadEnd: number;
  respawnAt: number;
  lastSeq: number;
  lastInputAt: number;
  // per-match stat bổ sung
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  longestStreak: number;
  // vị trí ngay trước (chống teleport)
  prevX: number;
  prevZ: number;
};

const emptyInput = (): Input => ({
  seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0,
  sprint: false, crouch: false, jump: false, fire: false, reload: false,
});

const TICK_MS = 1000 / 30;
const MATCH_DURATION_MS_DEFAULT = 12 * 60_000;
const RESPAWN_DELAY_MS = 4000;
const OBJECTIVE_INTERVAL_MS = 2000;
const OBJECTIVE_POINTS = 2;
const ARTIFACT_CAPTURE_RADIUS = 8;
const ARTIFACT_DROP_RADIUS = 30;
const ARTIFACT_SCORE = 5;
const PING_WINDOW_MS = 2500; // cửa sổ trung bình ping
const MAX_HEALTH = 100;
const MAX_ARMOR = 100;
const MAX_HELMET = 50;

// Giới hạn message chat để tránh spam
const CHAT_MAX_LENGTH = 200;
const CHAT_COOLDOWN_MS = 800;

export class ArenaRoom extends Room {
  maxClients = 16;
  private fighters = new Map<string, Fighter>();
  private scores = [0, 0, 0, 0];
  private phase: Snapshot['phase'] = 'lobby';
  private mode: Mode = 'tdm';
  private map: MapId = 'highlands';
  private teamCount = 4;
  private host = '';
  private endsAt = 0;
  private lastBroadcast = 0;
  private nextObjectiveScore = 0;
  private points = CONTROL_POINTS.map(p => ({ ...p, owner: -1, progress: 0, captureTeam: -1 }));
  private config: RoomConfig = { ...DEFAULT_CONFIG };
  private matchStartedAt = 0;
  // artifact run state
  private artifact = { x: 0, z: 0, carrier: null as string | null, dropTimer: 0 };
  // ping tracking per client
  private lastRtt = new Map<string, number>();
  // map vote sau khi kết thúc
  private mapVotes = new Map<string, MapId>();
  // chat log
  private chat: ChatMessage[] = [];

  onCreate(options: { mode?: Mode; map?: MapId; teamCount?: number; config?: Partial<RoomConfig> }) {
    if (options.mode === 'domination') this.mode = 'domination';
    else if (options.mode === 'artifact') this.mode = 'artifact';
    if (options.map === 'highlands' || options.map === 'desert' || options.map === 'harbor') this.map = options.map;
    if ([2, 3, 4].includes(options.teamCount || 0)) this.teamCount = options.teamCount!;
    if (options.config) this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.endsAt = Date.now() + this.config.maxMatchTime * 60_000;
    this.setTimestep(dt => this.update(Math.min(dt / 1000, MAX_DT)), TICK_MS);
    this.onMessage('input', (client, payload: Input) => this.handleInput(client, payload));
    this.onMessage('ready', client => this.handleReady(client));
    this.onMessage('team', (client, team: number) => this.handleTeam(client, team));
    this.onMessage('weapon', (client, weapon: WeaponId) => this.handleWeapon(client, weapon));
    this.onMessage('character', (client, character: CharacterId) => this.handleCharacter(client, character));
    this.onMessage('start', client => this.handleStart(client));
    this.onMessage('config', (client, patch: Partial<RoomConfig>) => this.handleConfig(client, patch));
    this.onMessage('chat', (client, payload: { text: string; team?: number }) => this.handleChat(client, payload));
    this.onMessage('vote', (client, map: MapId) => this.handleVote(client, map));
    this.onMessage('ping', (client, payload: { ts: number }) => {
      if (typeof payload?.ts === 'number') {
        const rtt = Date.now() - payload.ts;
        if (rtt >= 0 && rtt < 5000) this.lastRtt.set(client.sessionId, rtt);
        client.send('pong', { ts: payload.ts });
      }
    });
    // Send welcome system message
    this.chat.push({
      id: 'sys-0',
      from: 'system', name: 'Hệ thống',
      text: 'Phòng đã sẵn sàng. Chào mừng chiến binh!',
      team: -1, kind: 'system', ts: Date.now(),
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const counts = Array.from({ length: this.teamCount }, (_, team) =>
      [...this.fighters.values()].filter(p => p.team === team).length);
    const team = counts.indexOf(Math.min(...counts));
    const spawn = this.smartSpawn(team);
    const name = String(options.name || 'Chiến binh').trim().slice(0, 20).replace(/[<>]/g, '') || 'Chiến binh';
    const p: Fighter = {
      id: client.sessionId, name, team,
      character: 'soldier',
      x: spawn.x, y: terrainHeight(spawn.x, spawn.z, this.map), z: spawn.z,
      yaw: Math.atan2(-spawn.x, -spawn.z), pitch: 0,
      hp: MAX_HEALTH, armor: 50, helmet: 25,
      ammo: 30, reserve: 120,
      kills: 0, deaths: 0, assists: 0, killStreak: 0,
      ping: 0, alive: true, ready: false, weapon: 'rifle',
      input: emptyInput(),
      vy: 0, grounded: true, nextShot: 0, reloadEnd: 0, respawnAt: 0, lastSeq: 0,
      lastInputAt: Date.now(),
      damageDealt: 0, shotsFired: 0, shotsHit: 0, headshots: 0, longestStreak: 0,
      prevX: spawn.x, prevZ: spawn.z,
    };
    this.fighters.set(client.sessionId, p);
    if (!this.host) this.host = client.sessionId;
    if (this.phase === 'playing') this.spawn(p);
    this.broadcastChat({
      id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
      text: `${name} đã vào đội ${this.teamName(team)}.`,
      team: -1, kind: 'system', ts: Date.now(),
    }, client.sessionId);
    this.sendSnapshot();
  }

  onLeave(client: Client) {
    const leaving = this.fighters.get(client.sessionId);
    this.fighters.delete(client.sessionId);
    this.lastRtt.delete(client.sessionId);
    this.mapVotes.delete(client.sessionId);
    if (leaving) {
      this.broadcastChat({
        id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
        text: `${leaving.name} đã rời trận.`,
        team: -1, kind: 'system', ts: Date.now(),
      });
      // Nếu đang cầm artifact → rơi
      if (this.artifact.carrier === client.sessionId) this.artifact.carrier = null;
    }
    if (this.host === client.sessionId) {
      const next = this.fighters.keys().next();
      this.host = next.done ? '' : next.value;
      if (this.host) {
        this.broadcastChat({
          id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
          text: `Chủ phòng đã chuyển cho người chơi khác.`,
          team: -1, kind: 'system', ts: Date.now(),
        });
      }
    }
    this.sendSnapshot();
  }

  private teamName(team: number): string {
    return ['Lam', 'Đỏ', 'Vàng', 'Tím'][team] ?? '?';
  }

  /** Chọn spawn cách xa địch để tránh spawn-kill */
  private smartSpawn(team: number): { x: number; z: number } {
    const base = spawnFor(team, this.teamCount);
    const slot = [...this.fighters.values()].filter(p => p.team === team).length;
    let best = { x: base.x, z: base.z, score: -Infinity };
    // Thử nhiều attempt: một nửa ưu tiên slot của người này, một nửa random
    for (let attempt = 0; attempt < 32; attempt++) {
      let dx: number, dz: number;
      if (attempt < 12) {
        const off = spawnOffsetFor(slot + attempt);
        dx = off.dx; dz = off.dz;
      } else {
        // Random quanh base
        const r = 4 + Math.random() * 18;
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a) * r;
        dz = Math.sin(a) * r;
      }
      const x = base.x + dx;
      const z = base.z + dz;
      if (Math.abs(x) > 230 || Math.abs(z) > 230) continue;
      if (this.collidesStructure(x, z, 0.5)) continue;
      // Đảm bảo không trùng vị trí của đồng đội đã có (giảm trùng spawn)
      let tooClose = false;
      for (const o of this.fighters.values()) {
        if (o.team !== team) continue;
        if (Math.hypot(o.x - x, o.z - z) < 2.2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      // Score: xa địch nhất, xa đồng đội vừa phải
      let minEnemy = Infinity;
      let minAlly = Infinity;
      for (const other of this.fighters.values()) {
        if (!other.alive) continue;
        const d = Math.hypot(other.x - x, other.z - z);
        if (other.team !== team) minEnemy = Math.min(minEnemy, d);
        else minAlly = Math.min(minAlly, d);
      }
      const score = (minEnemy === Infinity ? 200 : minEnemy) - (minAlly === Infinity ? 0 : minAlly * 0.15);
      if (score > best.score) best = { x, z, score };
    }
    return { x: best.x, z: best.z };
  }

  private handleInput(client: Client, payload: Input) {
    const p = this.fighters.get(client.sessionId);
    if (!p || !payload || typeof payload.seq !== 'number' || payload.seq <= p.lastSeq) return;
    // Anti-cheat: giới hạn dt kể từ input trước
    const now = Date.now();
    p.lastInputAt = now;
    p.lastSeq = payload.seq;
    p.input = {
      seq: payload.seq,
      forward: Math.max(-1, Math.min(1, Number(payload.forward) || 0)),
      strafe: Math.max(-1, Math.min(1, Number(payload.strafe) || 0)),
      yaw: Number.isFinite(payload.yaw) ? payload.yaw : p.yaw,
      pitch: Number.isFinite(payload.pitch) ? Math.max(MIN_PITCH, Math.min(MAX_PITCH, payload.pitch)) : p.pitch,
      sprint: !!payload.sprint, crouch: !!payload.crouch, jump: !!payload.jump,
      fire: !!payload.fire, reload: !!payload.reload,
    };
  }

  private handleReady(client: Client) {
    const p = this.fighters.get(client.sessionId);
    if (!p || this.phase === 'playing') return;
    p.ready = !p.ready;
    this.sendSnapshot();
  }

  private handleTeam(client: Client, team: number) {
    const p = this.fighters.get(client.sessionId);
    if (!p || this.phase === 'playing' || !Number.isInteger(team) || team < 0 || team >= this.teamCount) return;
    const count = [...this.fighters.values()].filter(f => f.team === team).length;
    const cap = Math.ceil(16 / this.teamCount);
    if (count >= cap && p.team !== team) return;
    p.team = team;
    p.ready = false;
    this.sendSnapshot();
  }

  private handleWeapon(client: Client, weapon: WeaponId) {
    const p = this.fighters.get(client.sessionId);
    if (!p || this.phase === 'playing' || typeof weapon !== 'string' || !(weapon in WEAPONS)) return;
    p.weapon = weapon;
    p.ready = false;
    this.sendSnapshot();
  }

  private handleCharacter(client: Client, character: CharacterId) {
    const p = this.fighters.get(client.sessionId);
    if (!p || this.phase === 'playing' || !(character in CHARACTERS)) return;
    p.character = character;
    p.ready = false;
    this.sendSnapshot();
  }

  private handleConfig(client: Client, patch: Partial<RoomConfig>) {
    if (client.sessionId !== this.host || this.phase !== 'lobby') return;
    if (typeof patch.friendlyFire === 'boolean') this.config.friendlyFire = patch.friendlyFire;
    if (typeof patch.helmetEnabled === 'boolean') this.config.helmetEnabled = patch.helmetEnabled;
    if (typeof patch.maxMatchTime === 'number' && [6, 8, 10, 12, 15, 20].includes(patch.maxMatchTime)) {
      this.config.maxMatchTime = patch.maxMatchTime;
    }
    if (typeof patch.captureSpeedMul === 'number') {
      this.config.captureSpeedMul = Math.max(0.5, Math.min(2, patch.captureSpeedMul));
    }
    if (typeof patch.scoreCap === 'number' && [25, 50, 75, 100].includes(patch.scoreCap)) {
      this.config.scoreCap = patch.scoreCap;
    }
    this.endsAt = Date.now() + this.config.maxMatchTime * 60_000;
    this.sendSnapshot();
  }

  private handleChat(client: Client, payload: { text?: string; team?: number }) {
    const p = this.fighters.get(client.sessionId);
    if (!p || !payload || typeof payload.text !== 'string') return;
    const text = payload.text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    if (!this.config.friendlyFire && payload.team === p.team && this.phase === 'playing') {
      // vẫn cho phép chat team
    }
    // rate-limit
    const now = Date.now();
    const last = (p as Fighter & { _lastChat?: number })._lastChat ?? 0;
    if (now - last < CHAT_COOLDOWN_MS) return;
    (p as Fighter & { _lastChat?: number })._lastChat = now;
    const team = payload.team === p.team ? p.team : -1;
    const kind: ChatMessage['kind'] = team === -1 ? (this.phase === 'lobby' ? 'lobby' : 'all') : 'team';
    const msg: ChatMessage = {
      id: 'c-' + now + '-' + Math.random().toString(36).slice(2, 6),
      from: client.sessionId,
      name: p.name,
      text,
      team: kind === 'team' ? team : -1,
      ts: now,
      kind,
    };
    this.broadcastChat(msg);
  }

  private handleVote(client: Client, map: MapId) {
    if (this.phase !== 'finished') return;
    if (!['highlands', 'desert', 'harbor'].includes(map)) return;
    this.mapVotes.set(client.sessionId, map);
  }

  private broadcastChat(msg: ChatMessage, onlyId?: string) {
    this.chat.push(msg);
    if (this.chat.length > 80) this.chat.shift();
    if (onlyId) {
      this.clients.find(c => c.sessionId === onlyId)?.send('chat', msg);
    } else {
      // Team chat: chỉ gửi cho đồng đội + chính mình
      if (msg.kind === 'team' && msg.team >= 0) {
        for (const client of this.clients) {
          const f = this.fighters.get(client.sessionId);
          if (f && (f.team === msg.team || client.sessionId === msg.from)) {
            client.send('chat', msg);
          }
        }
      } else {
        this.broadcast('chat', msg);
      }
    }
  }

  private handleStart(client: Client) {
    if (client.sessionId !== this.host || this.phase === 'playing') return;
    if (this.fighters.size > 1 && [...this.fighters.values()].some(p => !p.ready)) return;
    this.phase = 'playing';
    this.matchStartedAt = Date.now();
    this.endsAt = Date.now() + this.config.maxMatchTime * 60_000;
    this.scores = [0, 0, 0, 0];
    this.points = CONTROL_POINTS.map(p => ({ ...p, owner: -1, progress: 0, captureTeam: -1 }));
    const artSpawn = ARTIFACT_SPAWNS[Math.floor(Math.random() * ARTIFACT_SPAWNS.length)];
    this.artifact = { x: artSpawn.x, z: artSpawn.z, carrier: null, dropTimer: 0 };
    for (const p of this.fighters.values()) {
      p.kills = 0; p.deaths = 0; p.assists = 0; p.killStreak = 0;
      p.damageDealt = 0; p.shotsFired = 0; p.shotsHit = 0; p.headshots = 0; p.longestStreak = 0;
      this.spawn(p);
    }
    this.broadcastChat({
      id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
      text: `${MODE_LABELS[this.mode]} — trận đấu bắt đầu!`,
      team: -1, kind: 'system', ts: Date.now(),
    });
    this.broadcast('event', { type: 'start', mode: this.mode, config: this.config });
    this.sendSnapshot();
  }

  private spawn(p: Fighter) {
    const pt = this.smartSpawn(p.team);
    p.x = pt.x; p.z = pt.z;
    p.y = terrainHeight(p.x, p.z, this.map);
    p.yaw = Math.atan2(-pt.x, -pt.z);
    p.hp = MAX_HEALTH;
    p.armor = 50;
    p.helmet = this.config.helmetEnabled ? 25 : 0;
    p.ammo = WEAPONS[p.weapon].magazine;
    p.reserve = WEAPONS[p.weapon].reserve;
    p.alive = true;
    p.vy = 0; p.grounded = true; p.reloadEnd = 0; p.respawnAt = 0;
    p.prevX = p.x; p.prevZ = p.z;
  }

  private update(dt: number) {
    const now = Date.now();
    if (this.phase === 'playing') {
      const maxScore = Math.max(...this.scores);
      if (now >= this.endsAt || maxScore >= this.config.scoreCap) {
        this.phase = 'finished';
        for (const p of this.fighters.values()) p.ready = false;
        const stats = this.buildMatchStats();
        const winner = this.scores.indexOf(maxScore);
        this.broadcast('event', { type: 'finish', winner, stats, shortCode: shortRoomCode(this.roomId) });
        this.broadcastChat({
          id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
          text: `Trận đấu kết thúc. Đội ${this.teamName(winner)} chiến thắng!`,
          team: -1, kind: 'system', ts: Date.now(),
        });
      } else {
        for (const p of this.fighters.values()) {
          if (!p.alive) { if (now >= p.respawnAt) this.spawn(p); continue; }
          this.simulatePlayer(p, dt, now);
        }
        if (this.mode === 'domination') this.updatePoints(dt, now);
        if (this.mode === 'artifact') this.updateArtifact(dt, now);
      }
    }
    if (now - this.lastBroadcast > 100) { this.lastBroadcast = now; this.sendSnapshot(); }
  }

  private simulatePlayer(p: Fighter, dt: number, now: number) {
    const input = p.input;
    p.yaw = input.yaw; p.pitch = input.pitch;
    const divisor = Math.max(1, Math.hypot(input.forward, input.strafe));
    const speed = input.crouch ? 3.1 : input.sprint ? 9.5 : 6.2;
    const forwardX = Math.sin(p.yaw), forwardZ = Math.cos(p.yaw);
    let dx = (forwardX * input.forward + forwardZ * input.strafe) * speed * dt / divisor;
    let dz = (forwardZ * input.forward - forwardX * input.strafe) * speed * dt / divisor;
    // Anti-cheat: clamp vận tốc tối đa / tick
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_PLAYER_SPEED * dt * 1.05) {
      const scale = (MAX_PLAYER_SPEED * dt * 1.05) / dist;
      dx *= scale; dz *= scale;
    }
    const next = moveGround(p.x, p.z, dx, dz, this.map);
    // Teleport guard: nếu khoảng cách giữa 2 frame > max-speed * 2, kẹp về bán kính an toàn
    const moved = Math.hypot(next.x - p.prevX, next.z - p.prevZ);
    const maxMove = MAX_PLAYER_SPEED * dt * 2.2;
    if (moved > maxMove) {
      const scale = maxMove / moved;
      next.x = p.prevX + (next.x - p.prevX) * scale;
      next.z = p.prevZ + (next.z - p.prevZ) * scale;
    }
    p.prevX = p.x; p.prevZ = p.z;
    p.x = next.x; p.z = next.z;
    if (input.jump && p.grounded) { p.vy = 7; p.grounded = false; }
    if (!p.grounded) {
      p.vy -= 19 * dt;
      p.y += p.vy * dt;
      const groundY = terrainHeight(p.x, p.z, this.map);
      if (p.y <= groundY) { p.y = groundY; p.vy = 0; p.grounded = true; }
    } else {
      p.y = terrainHeight(p.x, p.z, this.map);
    }
    if (input.reload && !p.reloadEnd) this.reload(p, now);
    if (p.reloadEnd && now >= p.reloadEnd) {
      const w = WEAPONS[p.weapon];
      const n = Math.min(w.magazine - p.ammo, p.reserve);
      p.ammo += n; p.reserve -= n; p.reloadEnd = 0;
    }
    if (input.fire && !p.reloadEnd && now >= p.nextShot && p.ammo > 0) this.fire(p, now);
  }

  private reload(p: Fighter, now: number) {
    const w = WEAPONS[p.weapon];
    if (p.ammo < w.magazine && p.reserve > 0) p.reloadEnd = now + w.reload;
  }

  private fire(shooter: Fighter, now: number) {
    const weapon = WEAPONS[shooter.weapon];
    // Anti-cheat: fire-rate đã giới hạn ở nextShot, nhưng kiểm tra ammo 1 lần nữa
    shooter.nextShot = now + weapon.interval;
    if (shooter.ammo <= 0) { this.reload(shooter, now); return; }
    shooter.ammo--;
    shooter.shotsFired++;
    const cp = Math.cos(shooter.pitch);
    const dir = { x: Math.sin(shooter.yaw) * cp, y: -Math.sin(shooter.pitch), z: Math.cos(shooter.yaw) * cp };
    const origin = { x: shooter.x, y: shooter.y + 1.55, z: shooter.z };
    let best: { target: Fighter; distance: number; head: boolean } | undefined;
    for (const target of this.fighters.values()) {
      if (!target.alive || target.id === shooter.id) continue;
      if (target.team === shooter.team && !this.config.friendlyFire) continue;
      for (const [height, radius, head] of [[1.55, 0.52, false], [2.22, 0.28, true]] as const) {
        const vx = target.x - origin.x, vy = target.y + height - origin.y, vz = target.z - origin.z;
        const distance = vx * dir.x + vy * dir.y + vz * dir.z;
        if (distance <= 0 || distance > weapon.range || (best && distance >= best.distance)) continue;
        const miss = Math.hypot(vx - dir.x * distance, vy - dir.y * distance, vz - dir.z * distance);
        if (miss > radius || this.blocked(origin.x, origin.z, target.x, target.z)) continue;
        best = { target, distance, head };
      }
    }
    this.broadcast('event', {
      type: 'shot', id: shooter.id,
      x: shooter.x, y: shooter.y + 1.55, z: shooter.z,
      yaw: shooter.yaw, pitch: shooter.pitch,
      weapon: shooter.weapon,
    });
    if (best) {
      shooter.shotsHit++;
      let dmg = best.head ? weapon.head : weapon.damage;
      if (best.head && this.config.helmetEnabled && best.target.helmet > 0) {
        const absorb = Math.min(best.target.helmet, Math.floor(dmg * 0.55));
        best.target.helmet -= absorb;
        dmg -= absorb;
      } else if (!best.head && best.target.armor > 0) {
        const absorb = Math.min(best.target.armor, Math.floor(dmg * 0.45));
        best.target.armor -= absorb;
        dmg -= absorb;
      }
      best.target.hp -= dmg;
      shooter.damageDealt += dmg;
      this.broadcast('event', {
        type: 'hit', id: shooter.id, target: best.target.id, head: best.head,
        damage: dmg,
      });
      if (best.head) shooter.headshots++;
      if (best.target.hp <= 0) {
        best.target.hp = 0;
        best.target.alive = false;
        best.target.deaths++;
        best.target.killStreak = 0;
        best.target.respawnAt = now + RESPAWN_DELAY_MS;
        shooter.kills++;
        shooter.killStreak++;
        if (shooter.killStreak > shooter.longestStreak) shooter.longestStreak = shooter.killStreak;
        this.scores[shooter.team]++;
        // Assist credit: người gần trong 5s gần nhất
        let assistId: string | null = null;
        for (const o of this.fighters.values()) {
          if (o.team !== best.target.team || o.id === shooter.id || !o.alive) continue;
          if (Math.hypot(o.x - best.target.x, o.z - best.target.z) < 12) { assistId = o.id; break; }
        }
        if (assistId) {
          const a = this.fighters.get(assistId);
          if (a) a.assists++;
        }
        this.broadcast('event', {
          type: 'kill',
          killer: shooter.name, victim: best.target.name,
          team: shooter.team,
          killerId: shooter.id, victimId: best.target.id,
          head: best.head, streak: shooter.killStreak,
          weapon: shooter.weapon,
        });
        // Drop artifact nếu carrier chết
        if (this.artifact.carrier === best.target.id) this.artifact.carrier = null;
      }
    }
  }

  private blocked(ax: number, az: number, bx: number, bz: number): boolean {
    for (const s of structuresFor(this.map)) {
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (Math.abs(ax + (bx - ax) * t - s.x) < s.w / 2 && Math.abs(az + (bz - az) * t - s.z) < s.d / 2) return true;
      }
    }
    return false;
  }

  private collidesStructure(x: number, z: number, radius: number): boolean {
    return structuresFor(this.map).some(s => Math.abs(x - s.x) < s.w / 2 + radius && Math.abs(z - s.z) < s.d / 2 + radius);
  }

  private updatePoints(dt: number, now: number) {
    const captureTime = 8 / Math.max(0.5, this.config.captureSpeedMul);
    for (const point of this.points) {
      const nearby = [...this.fighters.values()].filter(p => p.alive && Math.hypot(p.x - point.x, p.z - point.z) < 15);
      const teams = [...new Set(nearby.map(p => p.team))];
      if (teams.length === 1) {
        const team = teams[0];
        if (point.captureTeam !== team) { point.captureTeam = team; point.progress = 0; }
        point.progress = Math.min(1, point.progress + dt / captureTime);
        if (point.progress >= 1) point.owner = team;
      } else if (teams.length === 0) {
        point.captureTeam = -1;
        point.progress = Math.max(0, point.progress - dt / captureTime);
      } else {
        // contested
        point.captureTeam = -1;
      }
    }
    if (now >= this.nextObjectiveScore) {
      this.nextObjectiveScore = now + OBJECTIVE_INTERVAL_MS;
      for (const point of this.points) if (point.owner >= 0) this.scores[point.owner] += OBJECTIVE_POINTS;
    }
  }

  private updateArtifact(dt: number, now: number) {
    // Artifact rơi → reset sau 15s
    if (this.artifact.carrier === null && this.artifact.dropTimer > 0) {
      this.artifact.dropTimer -= dt;
      if (this.artifact.dropTimer <= 0) {
        const spawn = ARTIFACT_SPAWNS[Math.floor(Math.random() * ARTIFACT_SPAWNS.length)];
        this.artifact.x = spawn.x; this.artifact.z = spawn.z;
      }
    }
    // Pickup: ai đứng gần artifact và chưa ai cầm thì nhặt
    if (this.artifact.carrier === null) {
      for (const p of this.fighters.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - this.artifact.x, p.z - this.artifact.z) < ARTIFACT_CAPTURE_RADIUS) {
          this.artifact.carrier = p.id;
          this.broadcastChat({
            id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
            text: `${p.name} đã nhặt vật phẩm!`,
            team: -1, kind: 'system', ts: Date.now(),
          });
          break;
        }
      }
    } else {
      // Carrier di chuyển: artifact theo sau; carrier chết → rơi
      const carrier = this.fighters.get(this.artifact.carrier);
      if (!carrier || !carrier.alive) {
        this.artifact.carrier = null;
        this.artifact.dropTimer = 15;
      } else {
        this.artifact.x = carrier.x;
        this.artifact.z = carrier.z;
        // Carrier về spawn đội mình → +điểm
        const base = spawnFor(carrier.team, this.teamCount);
        if (Math.hypot(carrier.x - base.x, carrier.z - base.z) < 14) {
          this.scores[carrier.team] += ARTIFACT_SCORE;
          this.broadcastChat({
            id: 'sys-' + Date.now(), from: 'system', name: 'Hệ thống',
            text: `${carrier.name} đã mang vật phẩm về điểm đội ${this.teamName(carrier.team)}! +${ARTIFACT_SCORE}`,
            team: -1, kind: 'system', ts: Date.now(),
          });
          const spawn = ARTIFACT_SPAWNS[Math.floor(Math.random() * ARTIFACT_SPAWNS.length)];
          this.artifact = { x: spawn.x, z: spawn.z, carrier: null, dropTimer: 0 };
        }
      }
    }
  }

  private buildMatchStats(): MatchStats {
    const durationMs = Date.now() - this.matchStartedAt;
    let mvp: Fighter | undefined;
    for (const p of this.fighters.values()) {
      if (!mvp || p.kills > mvp.kills) mvp = p;
    }
    const perTeam = [0, 1, 2, 3].slice(0, this.teamCount).map(team => {
      const members = [...this.fighters.values()].filter(p => p.team === team);
      return {
        team,
        score: this.scores[team],
        kills: members.reduce((s, p) => s + p.kills, 0),
        deaths: members.reduce((s, p) => s + p.deaths, 0),
        players: members.length,
      };
    });
    const perPlayer = [...this.fighters.values()]
      .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)
      .map(p => ({
        id: p.id, name: p.name, team: p.team,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        damage: Math.round(p.damageDealt),
        accuracy: p.shotsFired ? p.shotsHit / p.shotsFired : 0,
        longestStreak: p.longestStreak,
        headshots: p.headshots,
      }));
    return {
      durationMs,
      mvpId: mvp?.id ?? '',
      mvpKills: mvp?.kills ?? 0,
      mvpName: mvp?.name ?? '',
      perTeam,
      perPlayer,
    };
  }

  private sendSnapshot() {
    // Tính ping client hiện tại (exponential moving average từ RTT/2)
    const players: PlayerView[] = [...this.fighters.values()].map(f => {
      const rtt = this.lastRtt.get(f.id) ?? 0;
      const ping = Math.min(999, Math.round(rtt / 2));
      const { input, vy, grounded, nextShot, reloadEnd, respawnAt, lastSeq,
        lastInputAt, damageDealt, shotsFired, shotsHit, headshots, longestStreak,
        prevX, prevZ, ...view } = f;
      return { ...view, ping };
    });
    // Map votes hiện tại
    const voteTally = new Map<MapId, number>();
    for (const v of this.mapVotes.values()) {
      voteTally.set(v, (voteTally.get(v) ?? 0) + 1);
    }
    this.broadcast('snapshot', {
      players, scores: this.scores,
      phase: this.phase, endsAt: this.endsAt, mode: this.mode,
      map: this.map, host: this.host, teamCount: this.teamCount,
      points: this.points.map(({ x, z, owner, progress }) => ({ x, z, owner, progress })),
      artifact: { x: this.artifact.x, z: this.artifact.z, carrier: this.artifact.carrier },
      config: this.config,
      serverTime: Date.now(),
      matchStats: this.phase === 'finished' ? this.buildMatchStats() : null,
      chat: this.chat.slice(-30),
      mapVotes: [...voteTally.entries()].map(([map, votes]) => ({ map, votes })),
    } satisfies Snapshot);
  }
}

/**
 * Build a fresh Colyseus Server bound to a single Node http.Server.
 * Both Vercel (serverless) and standalone `node .server-build/server/index.js`
 * paths share this function — Vercel exports the http.Server, standalone calls listen().
 */
export function buildArenaServer(httpServer: HttpServer): Server {
  const expressApp = express();
  expressApp.get('/health', (_req, res) => res.json({ ok: true, time: Date.now(), rooms: matchMaker.stats }));
  const server = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    express: app => { app.use(expressApp); },
  });
  server.define('arena', ArenaRoom);
  return server;
}

// Standalone path: `node .server-build/server/index.js`
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 2567);
  const httpServer = createServer();
  const standaloneServer = buildArenaServer(httpServer);
  standaloneServer.listen(port).then(() => {
    console.log(`Bansung server listening on ${port}`);
  });
}

export default { buildArenaServer };
