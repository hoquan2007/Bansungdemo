import {
  FreeCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial, Texture,
  TransformNode, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import {
  CHARACTERS, CONTROL_POINTS, HALF_WORLD, SPAWNS, TEAM_COLORS, structuresFor, terrainHeight,
  type CharacterId, type MapId, type PlayerView, type Snapshot,
} from '../shared/world';

const c = (hex: string) => Color3.FromHexString(hex);
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export type GraphicsQuality = 'low' | 'medium' | 'high';

function mat(scene: Scene, name: string, color: string, roughness = 1): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c(color); m.roughness = roughness; m.metallic = 0;
  m.environmentIntensity = 0.55;
  return m;
}

type Avatar = {
  root: TransformNode;
  body: Mesh;
  hpBar: Mesh;
  legs: Mesh[];
  arms: Mesh[];
  target: Vector3;
  targetYaw: number;
  gait: number;
  character: CharacterId;
};

type WeaponModel = { node: TransformNode; muzzle: Mesh };

export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  private avatars = new Map<string, Avatar>();
  private selfId = '';
  private snapshot?: Snapshot;
  private yaw = 0;
  private pitch = 0;
  private cameraReady = false;
  private flash = 0;
  private weaponNode: TransformNode;
  private muzzle: Mesh;
  private weaponModels = new Map<string, WeaponModel>();
  private teamMats: PBRMaterial[];
  private captureRings: Mesh[] = [];
  private onAim?: (yaw: number, pitch: number) => void;
  private onResize = () => this.engine.resize();
  private glbCache = new Map<string, { root: TransformNode | null }>();
  private viewWeapon: TransformNode;
  private shadowGenerator: ShadowGenerator;
  // Spectator: theo dõi người chơi khác khi chết
  private spectatorTargetId: string | null = null;
  private spectatorTargetYaw = 0;
  private spectatorTargetPitch = 0;
  private killStreak: number = 0;
  // Graphics
  private quality: GraphicsQuality = 'medium';
  // Kickback animation
  private kickbackZ = 0;
  private lastShotAt = 0;

  constructor(canvas: HTMLCanvasElement, readonly map: MapId = 'highlands') {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, antialias: true });
    this.engine.setHardwareScalingLevel(Math.min(1.5, Math.max(1, window.devicePixelRatio / 1.5)));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = map === 'desert' ? new Color4(0.82, 0.72, 0.59, 1) : map === 'harbor' ? new Color4(0.62, 0.71, 0.74, 1) : new Color4(0.64, 0.76, 0.82, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0018;
    this.scene.fogColor = c(map === 'desert' ? '#d2bda1' : map === 'harbor' ? '#a3b3b7' : '#a8b9c0');
    this.scene.imageProcessingConfiguration.exposure = 1.1;
    this.scene.imageProcessingConfiguration.contrast = 1.15;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.camera = new FreeCamera('fps-camera', new Vector3(0, 2, 0), this.scene);
    this.camera.minZ = 0.04; this.camera.maxZ = 800;
    this.camera.fov = 1.18;
    this.camera.inertia = 0.2;
    this.scene.activeCamera = this.camera;
    const sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.38), this.scene);
    sun.intensity = 2.6; sun.diffuse = c('#ffedd0');
    sun.shadowMinZ = 5; sun.shadowMaxZ = 220;
    const hemi = new HemisphericLight('sky-bounce', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.85; hemi.diffuse = c('#d5e9f0'); hemi.groundColor = c('#59625c');
    this.shadowGenerator = new ShadowGenerator(2048, sun);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 16;
    this.shadowGenerator.darkness = 0.45;
    this.teamMats = TEAM_COLORS.map((color, i) => mat(this.scene, `team-${i}`, color, 0.78));
    this.buildWorld();
    this.viewWeapon = new TransformNode('view-weapon', this.scene);
    this.viewWeapon.parent = this.camera;
    this.viewWeapon.position = new Vector3(0.33, -0.27, 0.63);
    this.buildViewWeapon();
    this.muzzle = MeshBuilder.CreateSphere('muzzle-flash', { diameter: 0.16, segments: 8 }, this.scene);
    const flashMat = new StandardMaterial('flash', this.scene);
    flashMat.emissiveColor = c('#ffd082'); flashMat.disableLighting = true;
    this.muzzle.material = flashMat;
    this.muzzle.parent = this.viewWeapon;
    this.muzzle.position.z = 0.78;
    this.muzzle.isVisible = false;
    this.weaponNode = this.viewWeapon;
    this.createSkybox();
    this.loadWeaponModels();
    void this.loadCharacterModels();
    this.engine.runRenderLoop(() => this.render());
    window.addEventListener('resize', this.onResize);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  /** Spectator: chuyển sang camera người chơi khác */
  setSpectatorTarget(targetId: string | null) {
    if (targetId === this.spectatorTargetId) return;
    this.spectatorTargetId = targetId;
    if (targetId) {
      const t = this.snapshot?.players.find(p => p.id === targetId);
      if (t) { this.spectatorTargetYaw = t.yaw; this.spectatorTargetPitch = t.pitch; }
    }
  }
  cycleSpectatorTarget(direction: 1 | -1) {
    if (!this.snapshot) return;
    const alive = this.snapshot.players.filter(p => p.alive && p.id !== this.selfId);
    if (alive.length === 0) return;
    const idx = alive.findIndex(p => p.id === this.spectatorTargetId);
    const next = (idx + direction + alive.length) % alive.length;
    this.setSpectatorTarget(alive[next].id);
  }
  getSpectatorTargetId() { return this.spectatorTargetId; }

  /** Đổi preset đồ họa */
  setQuality(q: GraphicsQuality) {
    this.quality = q;
    const hwScale = q === 'low' ? 2.2 : q === 'medium' ? 1.4 : 1.0;
    this.engine.setHardwareScalingLevel(hwScale);
    this.scene.fogDensity = q === 'low' ? 0.004 : q === 'medium' ? 0.0024 : 0.0018;
    // Bóng: low tắt, medium mờ, high đậm
    if (q === 'low') {
      this.shadowGenerator.blurKernel = 4;
      this.shadowGenerator.darkness = 0.6;
    } else if (q === 'medium') {
      this.shadowGenerator.blurKernel = 16;
      this.shadowGenerator.darkness = 0.45;
    } else {
      this.shadowGenerator.blurKernel = 32;
      this.shadowGenerator.darkness = 0.35;
    }
    // Mesh LOD: low giảm scatter/foliage
    if (q === 'low') {
      for (const m of this.scene.meshes) {
        if (m.name.startsWith('pine-') || m.name.startsWith('boulder') || m.name.startsWith('canyon-mesa')) {
          m.isVisible = false;
        }
      }
    } else {
      for (const m of this.scene.meshes) {
        if (m.name.startsWith('pine-') || m.name.startsWith('boulder') || m.name.startsWith('canyon-mesa')) {
          m.isVisible = true;
        }
      }
    }
  }

  private createSkybox() {
    const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 1500, segments: 16, sideOrientation: 1 }, this.scene);
    skybox.position.y = 0;
    skybox.isPickable = false;
    skybox.applyFog = false;
    const colors = this.map === 'desert' ? ['#ffdc9b', '#a07c4a'] : this.map === 'harbor' ? ['#cfe1ec', '#5a7888'] : ['#fde9c9', '#7da7c5'];
    const top = Color3.FromHexString(colors[0]);
    const bot = Color3.FromHexString(colors[1]);
    const positions = skybox.getVerticesData(VertexBuffer.PositionKind)!;
    const cols: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const t = Math.max(0, Math.min(1, (positions[i + 1] + 750) / 1500));
      cols.push(top.r * (1 - t) + bot.r * t, top.g * (1 - t) + bot.g * t, top.b * (1 - t) + bot.b * t, 1);
    }
    skybox.setVerticesData(VertexBuffer.ColorKind, cols);
    const mat = new StandardMaterial('skybox-mat', this.scene);
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    skybox.material = mat;
  }

  /** Cache load GLB từ server — không block scene khởi tạo */
  private async loadGlb(url: string): Promise<TransformNode | null> {
    if (this.glbCache.has(url)) return this.glbCache.get(url)!.root;
    try {
      const { ImportMeshAsync } = await import('@babylonjs/core/Loading/sceneLoader.js');
      const result = await ImportMeshAsync(url, this.scene, { pluginExtension: '.glb' });
      const root = new TransformNode(url.replace(/[^a-z0-9]/gi, '_'), this.scene);
      result.meshes.forEach(m => {
        m.parent = root;
        if (m.getBoundingInfo().boundingBox.extendSize.length() > 50) return;
        this.shadowGenerator.addShadowCaster(m, false);
        m.receiveShadows = true;
      });
      this.glbCache.set(url, { root });
      console.log('[Game] GLB loaded:', url, result.meshes.length, 'meshes');
      return root;
    } catch (err) {
      console.warn('[Game] GLB unavailable:', url, err);
      this.glbCache.set(url, { root: null });
      return null;
    }
  }

  /** Load GLB cho từng loại nhân vật — dùng làm skin cho remote avatars */
  private async loadCharacterModels() {
    for (const [id, def] of Object.entries(CHARACTERS)) {
      await this.loadGlb(`/assets/models/${def.model}`);
      void id;
    }
  }

  private async loadWeaponModels() {
    const defs = [
      { id: 'rifle',  url: 'gun_rifle.glb' },
      { id: 'smg',    url: 'gun_smg.glb' },
      { id: 'sniper', url: 'gun_sniper.glb' },
      { id: 'pistol', url: 'gun_pistol.glb' },
    ];
    await Promise.all(defs.map(async d => {
      const node = await this.loadGlb(`/assets/models/${d.url}`);
      if (node) {
        node.parent = this.viewWeapon;
        node.position.set(0, 0, 0);
        node.scaling.setAll(1);
        const muzzle = MeshBuilder.CreateSphere(`${d.id}-muzzle`, { diameter: 0.08, segments: 6 }, this.scene);
        muzzle.parent = node;
        muzzle.position.z = 0.78;
        muzzle.isVisible = false;
        this.weaponModels.set(d.id, { node, muzzle });
      }
    }));
    this.weaponNode = this.viewWeapon;
  }

  private buildViewWeapon() {
    const gunDark = mat(this.scene, 'gun-dark', '#222b2f', 0.56);
    const gunMetal = mat(this.scene, 'gun-metal', '#485358', 0.38); gunMetal.metallic = 0.65;
    const receiver = MeshBuilder.CreateBox('rifle-receiver', { width: 0.13, height: 0.11, depth: 0.5 }, this.scene);
    receiver.parent = this.viewWeapon; receiver.material = gunDark;
    const barrel = MeshBuilder.CreateCylinder('rifle-barrel', { diameter: 0.045, height: 0.48, tessellation: 10 }, this.scene);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.42; barrel.parent = this.viewWeapon; barrel.material = gunMetal;
    const sight = MeshBuilder.CreateBox('rifle-sight', { width: 0.05, height: 0.07, depth: 0.11 }, this.scene);
    sight.position.set(0, 0.1, 0.06); sight.parent = this.viewWeapon; sight.material = gunMetal;
    const grip = MeshBuilder.CreateBox('rifle-grip', { width: 0.06, height: 0.17, depth: 0.07 }, this.scene);
    grip.position.set(0, -0.13, -0.11); grip.rotation.x = -0.25; grip.parent = this.viewWeapon; grip.material = gunDark;
    this.shadowGenerator.addShadowCaster(receiver, false);
    this.shadowGenerator.addShadowCaster(barrel, false);
  }

  private buildWorld() {
    const structures = structuresFor(this.map);
    const stone = mat(this.scene, 'weathered-stone', this.map === 'desert' ? '#ae8b66' : '#8f9286');
    const wall = mat(this.scene, 'plaster', this.map === 'desert' ? '#b49a75' : this.map === 'harbor' ? '#8e9799' : '#989e98');
    const roof = mat(this.scene, 'rooftop', this.map === 'desert' ? '#766c60' : '#49535a');
    const containerMats = [mat(this.scene, 'container-blue', '#365967'), mat(this.scene, 'container-rust', '#9a624d'), mat(this.scene, 'container-cream', '#b3afa2')];
    const timber = mat(this.scene, 'timber', '#4b473b');
    const foliage = [mat(this.scene, 'pine-dark', '#365750'), mat(this.scene, 'pine-medium', '#4c6c56'), mat(this.scene, 'pine-light', '#6e8061')];
    const road = mat(this.scene, 'track', '#898678');
    const mesh = MeshBuilder.CreateGround('highlands', { width: HALF_WORLD * 2, height: HALF_WORLD * 2, subdivisions: 180, updatable: true }, this.scene);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2], h = terrainHeight(x, z, this.map);
      positions[i + 1] = h;
      const roadness = Math.min(Math.abs(x - z * 0.24), Math.abs(z + x * 0.17));
      const shade = 0.85 + Math.sin(x * 0.13 + z * 0.07) * 0.06 + Math.cos(z * 0.19) * 0.05;
      const base = this.map === 'desert' ? [0.89, 0.74, 0.53] : this.map === 'harbor' ? [0.65, 0.69, 0.65] : roadness < 5 ? [0.78, 0.73, 0.63] : h > 6 ? [0.7, 0.79, 0.72] : [0.75, 0.87, 0.74];
      colors.push(base[0] * shade, base[1] * shade, base[2] * shade, 1);
    }
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
    mesh.setVerticesData(VertexBuffer.NormalKind, normals);
    const groundMat = new PBRMaterial('terrain', this.scene);
    const texturePath = this.map === 'desert' ? 'sand_03.jpg' : this.map === 'harbor' ? 'concrete_floor.jpg' : 'leafy_grass_diff_1k.jpg';
    const groundTexture = new Texture(`/assets/textures/${texturePath}`, this.scene);
    groundTexture.uScale = 45; groundTexture.vScale = 45;
    groundMat.albedoTexture = groundTexture;
    groundMat.metallic = 0; groundMat.roughness = 0.95;
    mesh.material = groundMat;
    mesh.receiveShadows = true;

    const random = seeded(43761);
    for (const [index, s] of structures.entries()) {
      const y = terrainHeight(s.x, s.z, this.map);
      const building = MeshBuilder.CreateBox(`structure-${s.x}`, { width: s.w, depth: s.d, height: s.h }, this.scene);
      building.position.set(s.x, y + s.h / 2, s.z);
      building.material = s.kind === 'cover' ? (this.map === 'harbor' ? containerMats[index % containerMats.length] : stone) : wall;
      building.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(building, false);
      if (s.kind !== 'cover') {
        const cap = MeshBuilder.CreateBox('roof', { width: s.w + 1.2, depth: s.d + 1.2, height: 0.65 }, this.scene);
        cap.position.set(s.x, y + s.h + 0.2, s.z); cap.material = roof;
        this.shadowGenerator.addShadowCaster(cap, false);
        const trim = MeshBuilder.CreateBox('lower-trim', { width: s.w + 0.4, depth: s.d + 0.4, height: 0.55 }, this.scene);
        trim.position.set(s.x, y + 0.4, s.z); trim.material = stone;
        for (let i = -1; i <= 1; i++) {
          const win = MeshBuilder.CreateBox('dark-window', { width: 2.1, height: 2.4, depth: 0.08 }, this.scene);
          win.position.set(s.x + i * (s.w / 3.7), y + Math.min(4.8, s.h * 0.55), s.z - s.d / 2 - 0.05);
          win.material = roof;
        }
      }
    }
    for (let i = 0; i < (this.map === 'highlands' ? 180 : this.map === 'desert' ? 110 : 90); i++) {
      const x = (random() - 0.5) * 450, z = (random() - 0.5) * 450;
      if (Math.hypot(x, z) < 45 || structures.some(s => Math.abs(x - s.x) < s.w / 2 + 5 && Math.abs(z - s.z) < s.d / 2 + 5)) continue;
      const y = terrainHeight(x, z, this.map);
      const b = MeshBuilder.CreateSphere('boulder', { diameter: 1, segments: 6 }, this.scene);
      const radius = 1.2 + random() * 2.4;
      b.scaling.set(radius, radius * (0.5 + random() * 0.4), radius * (0.65 + random() * 0.5));
      b.rotation.y = random() * Math.PI;
      b.position.set(x, y + radius * 0.28, z);
      b.material = stone;
      b.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(b, false);
    }
    if (this.map === 'highlands') {
      for (let i = 0; i < 200; i++) {
        const x = (random() - 0.5) * 450, z = (random() - 0.5) * 450;
        if (Math.hypot(x, z) < 50 || structures.some(s => Math.abs(x - s.x) < s.w / 2 + 5 && Math.abs(z - s.z) < s.d / 2 + 5)) continue;
        const y = terrainHeight(x, z, this.map);
        const tall = 5 + random() * 8;
        const trunk = MeshBuilder.CreateCylinder('pine-trunk', { diameterTop: 0.34, diameterBottom: 0.6, height: tall * 0.53, tessellation: 5 }, this.scene);
        trunk.position.set(x, y + tall * 0.26, z); trunk.material = timber;
        const crown = MeshBuilder.CreateCylinder('pine-crown', { diameterTop: 0.2, diameterBottom: 3 + random() * 2.4, height: tall * 0.78, tessellation: 6 }, this.scene);
        crown.position.set(x, y + tall * 0.65, z); crown.material = foliage[Math.floor(random() * foliage.length)];
        this.shadowGenerator.addShadowCaster(trunk, false);
        this.shadowGenerator.addShadowCaster(crown, false);
      }
    }
    if (this.map === 'desert') {
      for (let i = 0; i < 28; i++) {
        const angle = i / 28 * Math.PI * 2;
        const x = Math.cos(angle) * (195 + random() * 33);
        const z = Math.sin(angle) * (195 + random() * 33);
        const height = 13 + random() * 28;
        const mesa = MeshBuilder.CreateCylinder('canyon-mesa', { diameterTop: 9 + random() * 7, diameterBottom: 15 + random() * 9, height, tessellation: 7 }, this.scene);
        mesa.position.set(x, terrainHeight(x, z, this.map) + height / 2, z);
        mesa.material = stone;
        mesa.receiveShadows = true;
        this.shadowGenerator.addShadowCaster(mesa, false);
      }
    }
    if (this.map === 'harbor') {
      for (const x of [-155, 155]) {
        const z = x < 0 ? -145 : 145;
        const y = terrainHeight(x, z, this.map);
        for (const offset of [-9, 9]) {
          const leg = MeshBuilder.CreateBox('gantry-leg', { width: 1.2, height: 27, depth: 1.2 }, this.scene);
          leg.position.set(x + offset, y + 13.5, z); leg.material = roof;
        }
        const beam = MeshBuilder.CreateBox('gantry-beam', { width: 42, height: 1.5, depth: 1.6 }, this.scene);
        beam.position.set(x + 10, y + 27, z); beam.material = containerMats[1];
        const hook = MeshBuilder.CreateBox('gantry-hook', { width: 0.55, height: 15, depth: 0.55 }, this.scene);
        hook.position.set(x + 20, y + 19, z); hook.material = roof;
      }
    }
    for (let i = 0; i < 4; i++) {
      const base = SPAWNS[i];
      const beacon = MeshBuilder.CreateCylinder('team-beacon', { diameter: 5, height: 0.25, tessellation: 16 }, this.scene);
      beacon.position.set(base.x, terrainHeight(base.x, base.z, this.map) + 0.14, base.z);
      beacon.material = this.teamMats[i];
      const mast = MeshBuilder.CreateCylinder('flag-mast', { diameter: 0.18, height: 9, tessellation: 8 }, this.scene);
      mast.position.set(base.x, terrainHeight(base.x, base.z, this.map) + 4.5, base.z);
      mast.material = roof;
      const flag = MeshBuilder.CreatePlane('flag', { width: 4, height: 2 }, this.scene);
      flag.position.set(base.x + 2.1, terrainHeight(base.x, base.z, this.map) + 7.1, base.z);
      flag.material = this.teamMats[i];
    }
    for (const p of CONTROL_POINTS) {
      const ring = MeshBuilder.CreateTorus('capture-zone', { diameter: 30, thickness: 0.22, tessellation: 48 }, this.scene);
      ring.position.set(p.x, terrainHeight(p.x, p.z, this.map) + 0.4, p.z);
      ring.material = road;
      this.captureRings.push(ring);
    }
    void this.spawnDynamicProps();
  }

  private async spawnDynamicProps() {
    const random = seeded(98731);
    const props = [
      { url: 'prop_crate.glb', count: 24 },
      { url: 'prop_barrel.glb', count: 18 },
      { url: 'prop_container.glb', count: 6 },
      { url: 'prop_pine.glb', count: 36 },
    ];
    for (const p of props) {
      for (let i = 0; i < p.count; i++) {
        const x = (random() - 0.5) * 440, z = (random() - 0.5) * 440;
        if (Math.hypot(x, z) < 35) continue;
        void this.placeProp(p.url, x, z);
      }
    }
  }

  private async placeProp(url: string, x: number, z: number) {
    const node = await this.loadGlb(`/assets/models/${url}`);
    if (!node) return;
    node.position.set(x, terrainHeight(x, z, this.map), z);
    node.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.6 + Math.random() * 0.8;
    node.scaling.set(s, s, s);
  }

  setAimHandler(handler: (yaw: number, pitch: number) => void) { this.onAim = handler; }

  aim(dx: number, dy: number, sensitivity: number) {
    this.yaw += dx * sensitivity;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dy * sensitivity));
    this.onAim?.(this.yaw, this.pitch);
  }

  getAim() { return { yaw: this.yaw, pitch: this.pitch }; }
  getPosition() { return this.camera.position.clone(); }
  setFov(value: number) { this.camera.fov = value * Math.PI / 180; }

  setSnapshot(snapshot: Snapshot, selfId: string) {
    const wasPlaying = this.snapshot?.phase === 'playing';
    this.snapshot = snapshot; this.selfId = selfId;
    const self = snapshot.players.find(p => p.id === selfId);
    if (self) this.applyWeaponModel(self.weapon);
    if (self && (!this.cameraReady || (!wasPlaying && snapshot.phase === 'playing'))) {
      this.yaw = self.yaw; this.pitch = self.pitch;
      this.camera.position.set(self.x, self.y + 1.62, self.z);
      this.cameraReady = true;
    }
    // Auto-chọn spectator target khi vừa chết
    if (self && !self.alive && !this.spectatorTargetId && snapshot.phase === 'playing') {
      const candidate = snapshot.players.find(p => p.alive && p.id !== selfId);
      if (candidate) this.spectatorTargetId = candidate.id;
    }
    // Clear spectator khi sống lại
    if (self?.alive) this.spectatorTargetId = null;
    const ids = new Set(snapshot.players.map(p => p.id));
    for (const [id, avatar] of this.avatars) if (!ids.has(id)) {
      avatar.root.dispose(); this.avatars.delete(id);
    }
    for (const p of snapshot.players) {
      if (p.id === selfId) continue;
      let avatar = this.avatars.get(p.id);
      if (!avatar) {
        avatar = this.makeAvatar(p.team, p.character);
        avatar.root.position.set(p.x, p.y, p.z);
        this.avatars.set(p.id, avatar);
      }
      avatar.target.set(p.x, p.y, p.z);
      avatar.targetYaw = p.yaw;
      avatar.root.setEnabled(p.alive);
      avatar.body.material = this.teamMats[p.team];
      avatar.hpBar.scaling.x = Math.max(0.01, p.hp / 100);
      // Tô khác chỉ số HP khi giáp/mũ còn
      avatar.hpBar.position.y = 2.7 + (p.armor > 50 ? 0.05 : 0);
    }
    for (let i = 0; i < this.captureRings.length; i++) {
      this.captureRings[i].isVisible = snapshot.mode === 'domination' && snapshot.phase === 'playing';
      const owner = snapshot.points[i]?.owner ?? -1;
      this.captureRings[i].material = owner >= 0 ? this.teamMats[owner] : null;
    }
  }

  private applyWeaponModel(weaponId: string) {
    const scale = weaponId === 'sniper' ? 1.25 : weaponId === 'pistol' ? 0.63 : weaponId === 'smg' ? 0.82 : 1;
    this.viewWeapon.scaling.set(scale, scale, scale);
    for (const [id, m] of this.weaponModels) m.node.setEnabled(id === weaponId);
  }

  private makeAvatar(team: number, character: CharacterId): Avatar {
    const root = new TransformNode('soldier', this.scene);
    const dark = mat(this.scene, 'uniform-dark', character === 'swat' ? '#10181b' : '#303d3f');
    const skin = mat(this.scene, 'skin', '#aa8970');
    const body = MeshBuilder.CreateCapsule('vest', { radius: 0.43, height: 1.25, tessellation: 12 }, this.scene);
    body.parent = root; body.position.y = 1.2; body.material = this.teamMats[team];
    const head = MeshBuilder.CreateSphere('head', { diameter: 0.55, segments: 12 }, this.scene);
    head.parent = root; head.position.y = 2.13; head.material = skin;
    const helmet = MeshBuilder.CreateSphere('helmet', { diameter: 0.62, segments: 12 }, this.scene);
    helmet.parent = root; helmet.position.y = 2.29; helmet.scaling.y = 0.54; helmet.material = dark;
    const legs: Mesh[] = [];
    const arms: Mesh[] = [];
    for (const sign of [-1, 1]) {
      const arm = MeshBuilder.CreateCapsule('arm', { radius: 0.14, height: 0.86, tessellation: 10 }, this.scene);
      arm.parent = root; arm.position.set(sign * 0.5, 1.22, 0.02); arm.rotation.z = sign * 0.23; arm.material = dark;
      arms.push(arm);
      const leg = MeshBuilder.CreateCapsule('leg', { radius: 0.17, height: 0.97, tessellation: 10 }, this.scene);
      leg.parent = root; leg.position.set(sign * 0.22, 0.49, 0); leg.material = dark;
      legs.push(leg);
    }
    const rifle = MeshBuilder.CreateBox('soldier-rifle', { width: 0.14, height: 0.13, depth: 1 }, this.scene);
    rifle.parent = root; rifle.position.set(0.18, 1.45, 0.44); rifle.material = dark;
    const hpBar = MeshBuilder.CreateBox('hp', { width: 0.8, height: 0.08, depth: 0.05 }, this.scene);
    hpBar.parent = root; hpBar.position.y = 2.7; hpBar.material = this.teamMats[team];
    [body, head, helmet, rifle, hpBar, ...arms, ...legs].forEach(m => {
      this.shadowGenerator.addShadowCaster(m, false);
      m.receiveShadows = true;
    });
    return { root, body, hpBar, legs, arms, target: new Vector3(), targetYaw: 0, gait: 0, character };
  }

  shot() {
    this.flash = performance.now() + 65;
    this.viewWeapon.position.z = 0.55;
    const self = this.snapshot?.players.find(p => p.id === this.selfId);
    if (self) {
      const w = this.weaponModels.get(self.weapon);
      if (w) {
        w.muzzle.isVisible = true;
        setTimeout(() => { w.muzzle.isVisible = false; }, 80);
      }
    }
  }

  private render() {
    const dt = this.engine.getDeltaTime();
    for (const avatar of this.avatars.values()) {
      const moving = Vector3.Distance(avatar.target, avatar.root.position) > 0.03;
      avatar.root.position = Vector3.Lerp(avatar.root.position, avatar.target, 0.32);
      // Xoay avatar mượt hướng về target yaw
      const yawDiff = avatar.targetYaw - avatar.root.rotation.y;
      avatar.root.rotation.y += Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff)) * 0.25;
      if (moving) avatar.gait += dt * 0.014;
      avatar.legs[0].rotation.x = moving ? Math.sin(avatar.gait) * 0.4 : 0;
      avatar.legs[1].rotation.x = moving ? -Math.sin(avatar.gait) * 0.4 : 0;
      avatar.arms[0].rotation.x = moving ? -Math.sin(avatar.gait) * 0.18 - 0.4 : -0.4;
      avatar.arms[1].rotation.x = moving ? Math.sin(avatar.gait) * 0.18 - 0.4 : -0.4;
    }
    const self = this.snapshot?.players.find(p => p.id === this.selfId);
    if (self && self.alive) {
      const desired = new Vector3(self.x, self.y + 1.62, self.z);
      this.camera.position = Vector3.Lerp(this.camera.position, desired, 0.35);
      if (this.snapshot?.phase === 'playing') {
        const t = performance.now() * 0.008;
        this.camera.fov = 1.18 + Math.sin(t) * 0.012;
      }
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.viewWeapon.setEnabled(this.snapshot?.phase === 'playing');
    } else if (this.spectatorTargetId && this.snapshot) {
      // Spectator mode: chuyển sang camera người chơi khác (free cam, xoay bằng chuột)
      const target = this.snapshot.players.find(p => p.id === this.spectatorTargetId);
      if (target && target.alive) {
        // Lerp hướng nhìn theo target.yaw/target.pitch
        this.spectatorTargetYaw += Math.atan2(Math.sin(target.yaw - this.spectatorTargetYaw), Math.cos(target.yaw - this.spectatorTargetYaw)) * 0.3;
        this.spectatorTargetPitch += (target.pitch - this.spectatorTargetPitch) * 0.3;
        this.camera.position.set(target.x, target.y + 1.62, target.z);
        this.camera.rotation.set(this.spectatorTargetPitch, this.spectatorTargetYaw, 0);
        this.viewWeapon.setEnabled(false);
      } else {
        // Target chết → tìm người khác
        this.spectatorTargetId = null;
        this.cycleSpectatorTarget(1);
      }
    } else if (self && !self.alive) {
      // Không có spectator target: rơi tự do
      this.viewWeapon.setEnabled(false);
      this.camera.position.set(self.x, self.y + 0.6, self.z);
      this.camera.rotation.set(-0.3, self.yaw, 0);
    }
    this.muzzle.isVisible = performance.now() < this.flash;
    this.viewWeapon.position.z += (0.63 - this.viewWeapon.position.z) * 0.2;
    this.scene.render();
  }

  /** Trả về danh sách người chơi alive cho spectator panel */
  getSpectatorCandidates(): PlayerView[] {
    if (!this.snapshot) return [];
    return this.snapshot.players.filter(p => p.alive && p.id !== this.selfId);
  }
}
