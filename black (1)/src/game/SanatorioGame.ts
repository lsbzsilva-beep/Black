import * as THREE from 'three';
import { BlackwoodAudio } from './audio';
import { DoorLoadingController } from './doorLoading';
import { BLACKWOOD_DOCUMENT_ORDER, BLACKWOOD_DOCUMENTS } from './documents';
import { BLACKWOOD_ITEM_CATALOG, createInitialInventory } from './inventory';
import { BLACKWOOD_KEY_ORDER, BLACKWOOD_KEYS } from './keys';
import { createPropMaterials, PropMaterialBank, SHARED_VERTEX_SNAP } from './materials';
import {
  createFlashlightModel,
  createPistolModel,
  createVolumetricBeam,
  FlashlightViewmodel,
  PistolViewmodel,
  VolumetricBeam,
} from './props';
import { Ps2Pipeline } from './ps2Pipeline';
import { createBlackwoodTextures, BlackwoodTextureBank } from './textures';
import {
  AABBCollider,
  CapsuleCollider,
  DoorState,
  DoorVariant,
  DrawerState,
  FloorKey,
  GameCallbacks,
  HideCabinetState,
  InspectableDocument,
  InventoryItem,
  KeyItem,
  NudgeProp,
  PistolHudState,
  PS2_PRESETS,
  Ps2PresetId,
  Ps2Settings,
  SurfaceType,
} from './types';
import { buildCorridorAndFloors, CorridorAndFloorsResult } from './world/corridorAndFloors';
import { buildExteriorWorld, ExteriorBuildResult } from './world/exterior';
import { buildReceptionAndWings, ReceptionBuildResult } from './world/reception';

const EYE_HEIGHT = 1.66;
const CROUCH_EYE_HEIGHT = 1.04;
const HIDE_EYE_HEIGHT = 1.53;
const PLAYER_RADIUS = 0.32;
const ENTRANCE_Z = 22.0;
const RECEPTION_NORTH_Z = 10.8;

const EXTERIOR_FOG_COLOR = new THREE.Color(0x111716);
const RECEPTION_FOG_COLOR = new THREE.Color(0x090b0a);
const CORRIDOR_FOG_COLOR = new THREE.Color(0x050706);

const EXTERIOR_HEMI_SKY = new THREE.Color(0x2d3c42);
const RECEPTION_HEMI_SKY = new THREE.Color(0x2c3339);
const CORRIDOR_HEMI_SKY = new THREE.Color(0x222827);
const EXTERIOR_HEMI_GROUND = new THREE.Color(0x111613);
const RECEPTION_HEMI_GROUND = new THREE.Color(0x17120e);
const CORRIDOR_HEMI_GROUND = new THREE.Color(0x0d0c09);

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

function getWingZoneName(x: number, z: number): string {
  if (x > 0) {
    if (z > 18.05) return 'Ala Leste · Sala de Espera';
    if (z > 14.65) return x < 7.82 ? 'Ala Leste · Depósito' : 'Ala Leste · WC Público';
    return 'Ala Leste · Segurança';
  }
  if (z > 18.4) return 'Ala Oeste · Arquivo de Prontuários';
  if (z > 14.6) return 'Ala Oeste · Administração';
  return 'Ala Oeste · Triagem';
}

export class SanatorioGame {
  private container: HTMLElement;
  private callbacks: GameCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pipeline: Ps2Pipeline;
  private audio = new BlackwoodAudio();

  private textures: BlackwoodTextureBank;
  private propMats: PropMaterialBank;
  private exteriorEnv: ExteriorBuildResult;
  private receptionEnv: ReceptionBuildResult;
  private corridorEnv: CorridorAndFloorsResult;

  private hemiLight!: THREE.HemisphereLight;
  private stormDirLight!: THREE.DirectionalLight;
  private stormTarget!: THREE.Object3D;

  private flashlightCore!: THREE.SpotLight;
  private flashlightSpill!: THREE.SpotLight;
  private flashlightBounce!: THREE.PointLight;
  private flashlightTarget!: THREE.Object3D;
  private flashlightModel!: FlashlightViewmodel;
  private pistolModel!: PistolViewmodel;
  private muzzleLight!: THREE.PointLight;
  private impactSparkGeo!: THREE.OctahedronGeometry;
  private impactSparks: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private impactSparkIdx = 0;
  private coreBeam!: VolumetricBeam;
  private wideBeam!: VolumetricBeam;

  private doors: DoorState[] = [];
  private drawers: DrawerState[] = [];
  private hideCabinets: HideCabinetState[] = [];
  private nudgeProps: NudgeProp[] = [];
  private staticColliders: AABBCollider[] = [];
  private mezzanineColliders: AABBCollider[] = [];
  private capsuleColliders: CapsuleCollider[] = [];
  private doorObstacles: AABBCollider[] | null = null;
  private keyPickups: Record<string, THREE.Group> = {};

  private settings: Ps2Settings = {
    ...PS2_PRESETS['silent-fog'],
    visionMode: 'flashlight',
  };

  private flashlightOn = false;
  private flashlightRaise = 0;
  private pistolEquipped = true;
  private pistolRaise = 1;
  private pistolAmmo = 7;
  private readonly pistolMagSize = 7;
  private pistolReserve = 42;
  private pistolReloadTimer = 0;
  private readonly pistolReloadDuration = 1.12;
  private pistolCooldown = 0;
  private pistolRecoil = 0;
  private pistolSlide = 0;
  private pistolFlash = 0;
  private pistolFlashRoll = 0;
  private pistolKickPitch = 0;
  private readonly scratchMuzzlePos = new THREE.Vector3();
  private isInside = false;
  private currentFloor: FloorKey = 'ext';
  private onMezzanine = false;
  private zone = 'Alameda';
  private lastPrompt: string | null = null;
  private entering = false;
  private floorTransition = false;
  private documentModalOpen = false;
  private inventoryModalOpen = false;
  private collectedDocIds = new Set<string>();
  private collectedKeyIds = new Set<string>();

  private inventory: InventoryItem[] = createInitialInventory();
  private crouched = false;
  private currentEyeHeight = EYE_HEIGHT;
  private hidingCabinet: HideCabinetState | null = null;
  private hidePhase: 'entering' | 'inside' | 'exiting' | null = null;
  private hidePistolWasEquipped = false;
  private battery = 100;
  private calmTimer = 0;
  private statusEmitTimer = 0;

  private playerPos = new THREE.Vector3(0, EYE_HEIGHT, 36.8);
  private yaw = 0.04;
  private pitch = -0.01;
  private flashYaw = 0.04;
  private flashPitch = -0.01;
  private wallPullback = 0;

  private walkBobPhase = 0;
  private bobWeight = 0;
  private sprintWeight = 0;
  private lastStepCycle = -1;
  private totalWalkedDist = 0;

  private indoorBlend = 0;
  private corridorBlend = 0;
  private tension = 0;
  private flashFlicker = 0;
  private nextHeartbeat = 0;
  private nextDrip = 4;
  private nextBuzz = 5;
  private nextParanormalTime = 20 + Math.random() * 14;
  private nextCheckTime = 0;
  private lastParanormalKind: 'close' | 'knock' | null = null;
  private lastParanormalDoorId = '';

  private bouncePos = new THREE.Vector3(0, EYE_HEIGHT, 34);
  private bounceIntensity = 0;
  private bounceInitialized = false;

  private elapsed = 0;
  private lastTime = performance.now();
  private frameId = 0;
  private disposed = false;
  private dustFrame = 0;
  private raycastFrame = 0;
  private doorLoader: DoorLoadingController;
  private lastDoorHudKey = '';
  private cachedFlashDist = 14;

  // Input states
  private keys: Record<string, boolean> = {};
  private joystickVec = { x: 0, y: 0 };
  private mobileSprint = false;
  private pointerDragging = false;
  private pointerDownPos = { x: 0, y: 0, time: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private lookTouchId: number | null = null;
  private lookTouchLast = { x: 0, y: 0 };
  private touchTapCandidate: { id: number; x: number; y: number; time: number } | null = null;

  // Pre-allocated scratch math helpers (zero allocation in tick)
  private readonly scratchColorA = new THREE.Color();
  private readonly scratchColorB = new THREE.Color();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndcCenter = new THREE.Vector2(0, 0);
  private readonly scratchFwd = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchMove = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);
  private readonly scratchBeamDir = new THREE.Vector3();
  private readonly scratchBeamRight = new THREE.Vector3();
  private readonly scratchBeamUp = new THREE.Vector3();
  private readonly scratchMat4 = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchBounceTarget = new THREE.Vector3();
  private readonly scratchCorner = new THREE.Vector3();
  private readonly closeCandidates: DoorState[] = [];
  private readonly knockCandidates: DoorState[] = [];

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x111615, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111716);
    this.scene.fog = new THREE.FogExp2(0x111716, this.settings.fogDensity);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.08, 128);
    this.camera.rotation.order = 'YXZ';

    this.textures = createBlackwoodTextures(
      this.settings.pixelTextures,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.propMats = createPropMaterials(this.textures);
    this.doorLoader = new DoorLoadingController(this.propMats);

    this.exteriorEnv = buildExteriorWorld(this.textures);
    this.scene.add(this.exteriorEnv.group);
    this.staticColliders.push(...this.exteriorEnv.colliders);

    this.receptionEnv = buildReceptionAndWings(this.propMats, this.textures);
    this.scene.add(this.receptionEnv.group);
    this.doors.push(...this.receptionEnv.doors);
    this.drawers.push(...this.receptionEnv.drawers);
    this.hideCabinets.push(...this.receptionEnv.hideCabinets);
    this.nudgeProps.push(...this.receptionEnv.nudgeProps);
    this.staticColliders.push(...this.receptionEnv.colliders);
    this.mezzanineColliders.push(...this.receptionEnv.mezzanineColliders);
    this.capsuleColliders.push(...this.receptionEnv.capsules);

    this.corridorEnv = buildCorridorAndFloors(this.propMats, this.textures);
    this.scene.add(this.corridorEnv.group);
    this.doors.push(...this.corridorEnv.doors);
    this.drawers.push(...this.corridorEnv.drawers);
    this.hideCabinets.push(...this.corridorEnv.hideCabinets);
    this.nudgeProps.push(...this.corridorEnv.nudgeProps);
    this.staticColliders.push(...this.corridorEnv.colliders);
    this.keyPickups = { ...this.corridorEnv.keyPickups };

    this.buildLightingAndFlashlight();
    this.pipeline = new Ps2Pipeline(this.renderer, this.scene, this.camera, this.settings);
    this.pipeline.setSize(w, h);

    this.activateFloor('ext');
    this.syncCameraAndFlashlight(1);
    this.bindEvents();

    this.callbacks.onZoneChange?.(this.zone);
    this.callbacks.onFloorChange?.(this.currentFloor);
    this.callbacks.onFlashlightChange?.(this.flashlightOn);
    this.emitPistolState();
    this.emitInventory();
    this.emitPlayerStatus();
    this.callbacks.onSettingsChange?.({ ...this.settings });
    this.callbacks.onKeysChange?.([]);

    this.tick();
  }

  private buildLightingAndFlashlight(): void {
    this.hemiLight = new THREE.HemisphereLight(0x3a4d54, 0x161b18, 0.42);
    this.scene.add(this.hemiLight);

    this.stormTarget = new THREE.Object3D();
    this.stormTarget.position.set(0, 7.5, 34);
    this.scene.add(this.stormTarget);

    this.stormDirLight = new THREE.DirectionalLight(0x9fb8c9, 0.48);
    this.stormDirLight.position.set(-16, 28, 78);
    this.stormDirLight.target = this.stormTarget;
    if (!this.isSoftwareGl) {
      this.stormDirLight.castShadow = true;
      this.stormDirLight.shadow.mapSize.set(1024, 1024);
      this.stormDirLight.shadow.camera.near = 2;
      this.stormDirLight.shadow.camera.far = 110;
      this.stormDirLight.shadow.camera.left = -24;
      this.stormDirLight.shadow.camera.right = 24;
      this.stormDirLight.shadow.camera.top = 22;
      this.stormDirLight.shadow.camera.bottom = -14;
      this.stormDirLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.stormDirLight);

    this.flashlightModel = createFlashlightModel(this.propMats, this.textures, 'left');
    this.flashlightModel.group.visible = true;
    this.flashlightModel.setPowered(false);
    this.scene.add(this.flashlightModel.group);

    this.pistolModel = createPistolModel(this.propMats);
    this.pistolModel.group.visible = this.pistolEquipped;
    this.scene.add(this.pistolModel.group);

    this.muzzleLight = new THREE.PointLight(0xffb85c, 0, 14, 1.35);
    this.muzzleLight.visible = false;
    this.scene.add(this.muzzleLight);

    this.impactSparkGeo = new THREE.OctahedronGeometry(0.045, 0);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.impactSparkGeo, mat);
      mesh.visible = false;
      mesh.raycast = () => {};
      this.scene.add(mesh);
      this.impactSparks.push({ mesh, mat, life: 0 });
    }

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);

    // Strong, crisp survival-horror flashlight beam with broad peripheral spill
    this.flashlightCore = new THREE.SpotLight(0xffeec8, 46, 29, Math.PI / 5.0, 0.64, 1.12);
    this.flashlightCore.target = this.flashlightTarget;
    if (!this.isSoftwareGl) {
      this.flashlightCore.castShadow = true;
      this.flashlightCore.shadow.mapSize.set(1024, 1024);
      this.flashlightCore.shadow.camera.near = 0.1;
      this.flashlightCore.shadow.camera.far = 29;
      this.flashlightCore.shadow.bias = -0.0004;
    }
    this.scene.add(this.flashlightCore);

    this.flashlightSpill = new THREE.SpotLight(0xffe0b0, 1.85, 14.5, Math.PI / 3.5, 0.94, 1.38);
    this.flashlightSpill.target = this.flashlightTarget;
    this.scene.add(this.flashlightSpill);

    this.flashlightBounce = new THREE.PointLight(0xffdfb0, 0, 7.2, 1.4);
    this.scene.add(this.flashlightBounce);

    this.coreBeam = createVolumetricBeam(0xfff0cc);
    this.wideBeam = createVolumetricBeam(0xe5edff);
    this.scene.add(this.coreBeam.mesh, this.wideBeam.mesh);

    this.flashlightCore.visible = false;
    this.flashlightSpill.visible = false;
    this.flashlightBounce.visible = false;
    this.coreBeam.mesh.visible = false;
    this.wideBeam.mesh.visible = false;
  }

  // ==================== PUBLIC CONTROLS FOR REACT HUD ====================

  getSettings(): Ps2Settings {
    return { ...this.settings };
  }

  applyPreset(preset: Ps2PresetId): void {
    const base = PS2_PRESETS[preset];
    this.settings = {
      ...base,
      visionMode: preset === 'camcorder-480i' ? 'ir-camcorder' : 'flashlight',
    };
    this.syncVisualSettings();
  }

  updateSettings(patch: Partial<Ps2Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncVisualSettings();
  }

  private syncVisualSettings(): void {
    SHARED_VERTEX_SNAP.value = this.settings.vertexSnap ? 170.0 : 0.0;
    this.textures.setPixelMode(this.settings.pixelTextures);
    this.pipeline.applySettings(this.settings);
    this.callbacks.onSettingsChange?.({ ...this.settings });
  }

  private setFlashlightPowered(on: boolean, silent = false): void {
    this.flashlightOn = on;
    this.flashlightModel.setPowered(on);
    this.flashlightModel.group.visible = true;
    this.flashlightCore.visible = on;
    this.flashlightSpill.visible = on;
    this.flashlightBounce.visible = on;
    this.coreBeam.mesh.visible = on;
    this.wideBeam.mesh.visible = on;
    if (!silent) this.audio.playFlashlightClick();
    this.callbacks.onFlashlightChange?.(on);
  }

  toggleFlashlight(): boolean {
    if (this.hidingCabinet) {
      this.callbacks.onStatusToast?.('Desligada enquanto escondido');
      return false;
    }
    this.audio.unlock();
    this.setFlashlightPowered(!this.flashlightOn);
    return this.flashlightOn;
  }

  private emitPistolState(): void {
    const state: PistolHudState = {
      equipped: this.pistolEquipped,
      ammo: this.pistolAmmo,
      magSize: this.pistolMagSize,
      reserve: this.pistolReserve,
      reloading: this.pistolReloadTimer > 0,
    };
    this.callbacks.onPistolChange?.(state);
  }

  private emitInventory(): void {
    this.callbacks.onInventoryChange?.(this.inventory.map((it) => ({ ...it })));
  }

  private emitPlayerStatus(): void {
    this.callbacks.onPlayerStatusChange?.({
      crouched: this.crouched,
      hiding: this.hidingCabinet !== null,
      hidingLabel: this.hidingCabinet?.label,
      tension: this.tension,
      battery: Math.round(this.battery),
    });
  }

  private syncAmmoInInventory(): void {
    const idx = this.inventory.findIndex((it) => it.id === 'item-ammo-32');
    if (this.pistolReserve > 0) {
      if (idx >= 0) {
        this.inventory[idx].quantity = this.pistolReserve;
      } else {
        this.inventory.push({
          ...BLACKWOOD_ITEM_CATALOG['item-ammo-32'],
          quantity: this.pistolReserve,
        });
      }
    } else if (idx >= 0) {
      this.inventory.splice(idx, 1);
    }
    this.emitInventory();
  }

  private addInventoryItem(itemId: string): string {
    const entry = BLACKWOOD_ITEM_CATALOG[itemId];
    if (!entry) return 'Item coletado';
    const grant = entry.grantAmount ?? 1;

    if (itemId === 'item-ammo-32') {
      this.pistolReserve += grant;
      this.syncAmmoInventoryAndHud();
      return `${entry.name} (+${grant})`;
    }

    const existing = this.inventory.find((it) => it.id === itemId);
    if (existing) {
      existing.quantity = Math.min(existing.maxStack, existing.quantity + grant);
    } else {
      this.inventory.push({ ...entry, quantity: Math.min(entry.maxStack, grant) });
    }
    this.emitInventory();
    return entry.name;
  }

  private syncAmmoInventoryAndHud(): void {
    this.syncAmmoInInventory();
    this.emitPistolState();
  }

  toggleCrouch(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.floorTransition || this.hidingCabinet) {
      return this.crouched;
    }
    this.audio.unlock();
    this.crouched = !this.crouched;
    this.audio.playCrouchToggle(this.crouched);
    this.emitPlayerStatus();
    return this.crouched;
  }

  useInventoryItem(itemId: string): boolean {
    this.audio.unlock();
    if (itemId === 'tool-flashlight') {
      if (this.hidingCabinet) return false;
      this.setFlashlightPowered(!this.flashlightOn);
      return true;
    }
    if (itemId === 'weapon-pistol') {
      if (this.hidingCabinet) return false;
      this.pistolEquipped = !this.pistolEquipped;
      if (!this.pistolEquipped) this.pistolReloadTimer = 0;
      this.audio.playPistolEquip(this.pistolEquipped);
      this.emitPistolState();
      return true;
    }
    if (itemId === 'item-ammo-32') {
      if (this.hidingCabinet) return false;
      this.setInventoryModalOpen(false);
      return this.reloadPistol();
    }

    const idx = this.inventory.findIndex((it) => it.id === itemId);
    if (idx < 0 || this.inventory[idx].quantity <= 0) return false;

    if (itemId === 'item-bandage') {
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.tension = Math.max(0, this.tension - 0.55);
      this.calmTimer = Math.max(this.calmTimer, 18);
      this.audio.playUseMedical();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.('Bandagem aplicada · respiração estabilizada');
      return true;
    }

    if (itemId === 'item-laudanum') {
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.tension = 0;
      this.calmTimer = 45;
      this.flashFlicker = 0;
      this.audio.playUseMedical();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.('Láudano tomado · pulso firme por 45s');
      return true;
    }

    if (itemId === 'item-battery') {
      if (this.battery >= 99) {
        this.callbacks.onStatusToast?.('A lanterna já está com carga máxima');
        return false;
      }
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.battery = Math.min(100, this.battery + 65);
      this.audio.playFlashlightClick();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.(`Célula substituída (${Math.round(this.battery)}% carga)`);
      return true;
    }

    return false;
  }

  togglePistol(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorLoader.isActive() || this.hidingCabinet) {
      return this.pistolEquipped;
    }
    this.audio.unlock();
    this.pistolEquipped = !this.pistolEquipped;
    if (!this.pistolEquipped) {
      this.pistolReloadTimer = 0;
    }
    this.audio.playPistolEquip(this.pistolEquipped);
    this.emitPistolState();
    return this.pistolEquipped;
  }

  reloadPistol(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorLoader.isActive() || this.hidingCabinet) {
      return false;
    }
    this.audio.unlock();
    if (!this.pistolEquipped) {
      this.pistolEquipped = true;
    }
    if (this.pistolReloadTimer > 0 || this.pistolAmmo >= this.pistolMagSize || this.pistolReserve <= 0) {
      return false;
    }
    this.pistolReloadTimer = this.pistolReloadDuration;
    this.audio.playPistolReload();
    this.emitPistolState();
    return true;
  }

  firePistol(): boolean {
    if (
      this.documentModalOpen ||
      this.inventoryModalOpen ||
      this.floorTransition ||
      this.doorLoader.isActive() ||
      this.hidingCabinet
    ) {
      return false;
    }
    this.audio.unlock();
    if (!this.pistolEquipped) {
      this.pistolEquipped = true;
      this.audio.playPistolEquip(true);
      this.emitPistolState();
      return false;
    }
    if (this.pistolReloadTimer > 0 || this.pistolCooldown > 0) return false;
    if (this.pistolAmmo <= 0) {
      this.pistolCooldown = 0.22;
      this.audio.playPistolEmpty();
      if (this.pistolReserve > 0) {
        this.reloadPistol();
      } else {
        this.callbacks.onStatusToast?.('Munição esgotada');
      }
      return false;
    }

    this.pistolAmmo -= 1;
    this.pistolCooldown = 0.24;
    this.pistolRecoil = 1.0;
    this.pistolSlide = 1.0;
    this.pistolFlash = 1.0;
    this.pistolFlashRoll = Math.random() * Math.PI * 2;
    this.pistolKickPitch = Math.min(0.055, this.pistolKickPitch + 0.022);
    this.audio.playPistolShot();
    this.emitPistolState();

    // Raycast bullet trajectory down the crosshair
    this.ndcCenter.set(0, 0);
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.12;
    this.raycaster.far = 45;
    this.raycaster.layers.set(0);
    this.raycaster.layers.enable(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (
        hit.object.userData.isViewmodel ||
        hit.object instanceof THREE.Points ||
        hit.object instanceof THREE.LineSegments
      ) {
        continue;
      }

      const spark = this.impactSparks[this.impactSparkIdx];
      this.impactSparkIdx = (this.impactSparkIdx + 1) % this.impactSparks.length;
      spark.mesh.position.copy(hit.point);
      if (hit.face) {
        spark.mesh.position.addScaledVector(hit.face.normal, 0.025);
      }
      spark.mesh.scale.setScalar(1);
      spark.mesh.visible = true;
      spark.mat.opacity = 0.95;
      spark.life = 0.18;

      const hitId = hit.object.userData.interactionId as string | undefined;
      let metallic = false;
      if (hitId) {
        const door = this.doors.find((d) => d.id === hitId);
        if (door) {
          door.shudderTime = 0.28;
          metallic = door.locked;
        }
        const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === hitId);
        if (prop) {
          this.scratchFwd.set(0, 0, -1).applyAxisAngle(this.scratchUp, this.yaw);
          prop.impulse = 1.0;
          prop.impulseDirX = this.scratchFwd.x;
          prop.impulseDirZ = this.scratchFwd.z;
          metallic = prop.kind === 'cart' || prop.kind === 'stretcher';
        }
      }

      this.audio.playBulletImpact(0, hit.distance, metallic);
      break;
    }

    return true;
  }

  toggleAudioMute(): boolean {
    this.audio.unlock();
    const muted = this.audio.toggleMute();
    this.callbacks.onAudioMuteChange?.(muted);
    return muted;
  }

  setMobileMoveVector(x: number, y: number): void {
    if (x !== 0 || y !== 0) this.audio.unlock();
    this.joystickVec.x = THREE.MathUtils.clamp(x, -1, 1);
    this.joystickVec.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setMobileSprint(on: boolean): void {
    this.mobileSprint = !!on;
  }

  triggerInteract(): void {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    this.audio.unlock();
    if (this.hidingCabinet) {
      this.exitHideCabinet();
      return;
    }
    this.tryInteractAtNdc(0, 0);
  }

  private clearModalInputs(): void {
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    this.pointerDragging = false;
    this.mobileSprint = false;
    this.lookTouchId = null;
    this.touchTapCandidate = null;
  }

  setDocumentModalOpen(open: boolean): void {
    this.documentModalOpen = open;
    if (open) {
      this.clearModalInputs();
    }
  }

  setInventoryModalOpen(open: boolean): void {
    this.inventoryModalOpen = open;
    if (open) {
      this.clearModalInputs();
    }
  }

  playPaperTurnSound(): void {
    this.audio.playPaperRustle();
  }

  jumpToFloor(floor: FloorKey): void {
    this.audio.unlock();
    if (this.doorLoader.isActive()) return;
    this.floorTransition = false;
    this.entering = false;
    this.onMezzanine = false;
    this.crouched = false;
    this.currentEyeHeight = EYE_HEIGHT;
    if (this.hidingCabinet) {
      this.hidingCabinet.targetDoorAngle = 0;
      this.hidingCabinet.doorAngle = 0;
      this.hidingCabinet.doorPivot.rotation.y = 0;
      this.hidingCabinet = null;
      this.hidePhase = null;
    }
    this.emitPlayerStatus();

    if (floor === 'ext') {
      this.isInside = false;
      this.currentFloor = 'ext';
      this.playerPos.set(0, EYE_HEIGHT, 34.0);
      this.yaw = 0.02;
      this.pitch = -0.01;
      this.indoorBlend = 0;
      this.corridorBlend = 0;
      for (const d of this.doors) {
        if (d.id.startsWith('door-entrance')) {
          d.locked = false;
        }
      }
    } else if (floor === 0) {
      this.isInside = true;
      this.currentFloor = 0;
      this.playerPos.set(0, EYE_HEIGHT, 18.8);
      this.yaw = 0;
      this.pitch = -0.01;
      this.indoorBlend = 1;
    } else if (floor === 1) {
      this.isInside = true;
      this.currentFloor = 1;
      this.playerPos.set(0, EYE_HEIGHT, -23.0);
      this.yaw = 0;
      this.pitch = -0.01;
      this.indoorBlend = 1;
    } else if (floor === 2) {
      this.isInside = true;
      this.currentFloor = 2;
      this.playerPos.set(0, EYE_HEIGHT, -60.5);
      this.yaw = 0;
      this.pitch = -0.01;
      this.indoorBlend = 1;
    } else {
      this.isInside = true;
      this.currentFloor = 3;
      this.playerPos.set(0, EYE_HEIGHT, -85.8);
      this.yaw = 0;
      this.pitch = -0.01;
      this.indoorBlend = 1;
    }

    this.activateFloor(this.currentFloor);
    this.callbacks.onFloorChange?.(this.currentFloor);
  }

  // ==================== INPUT EVENTS ====================

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('touchstart', this.onTouchStart, { passive: false });
    dom.addEventListener('touchmove', this.onTouchMove, { passive: false });
    dom.addEventListener('touchend', this.onTouchEnd, { passive: false });
    dom.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
    dom.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('touchstart', this.onTouchStart);
    dom.removeEventListener('touchmove', this.onTouchMove);
    dom.removeEventListener('touchend', this.onTouchEnd);
    dom.removeEventListener('touchcancel', this.onTouchEnd);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onWindowBlur = (): void => {
    this.keys = {};
    this.pointerDragging = false;
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    this.mobileSprint = false;
    this.lookTouchId = null;
    this.touchTapCandidate = null;
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.pipeline.setSize(w, h);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.audio.unlock();
    if (this.doorLoader.isActive()) {
      if ((e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyE') && !e.repeat) {
        this.doorLoader.skip();
      }
      return;
    }
    this.keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Space') {
      if (!e.repeat) {
        if (this.hidingCabinet) {
          this.exitHideCabinet();
        } else {
          this.tryInteractAtNdc(0, 0);
        }
      }
    } else if ((e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) {
      this.toggleCrouch();
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlashlight();
    } else if (e.code === 'KeyG' && !e.repeat) {
      this.togglePistol();
    } else if (e.code === 'KeyQ' && !e.repeat) {
      this.firePistol();
    } else if (e.code === 'KeyR' && !e.repeat) {
      this.reloadPistol();
    } else if (e.code === 'KeyV' && !e.repeat) {
      const next = this.settings.visionMode === 'ir-camcorder' ? 'flashlight' : 'ir-camcorder';
      this.updateSettings({ visionMode: next });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || e.pointerType === 'touch') return;
    this.audio.unlock();
    if (e.button === 2) {
      this.firePistol();
      return;
    }
    if (e.button !== 0) return;
    this.pointerDragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || this.floorTransition || e.pointerType === 'touch') return;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.25, 1.25);
      return;
    }
    if (!this.pointerDragging) return;
    const dx = e.clientX - this.lastPointerPos.x;
    const dy = e.clientY - this.lastPointerPos.y;
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.0036;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0036, -1.25, 1.25);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || !this.pointerDragging) return;
    this.pointerDragging = false;
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    const dtMs = performance.now() - this.pointerDownPos.time;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dtMs < 260 && dist < 8) {
      if (this.doorLoader.isActive()) {
        this.doorLoader.skip();
        return;
      }
      if (this.hidingCabinet) {
        return;
      }
      const rect = this.renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.tryInteractAtNdc(nx, ny);
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    e.preventDefault();
    this.audio.unlock();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (!this.touchTapCandidate) {
        this.touchTapCandidate = { id: t.identifier, x: t.clientX, y: t.clientY, time: performance.now() };
      }
      if (this.lookTouchId === null) {
        this.lookTouchId = t.identifier;
        this.lookTouchLast = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || this.floorTransition) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.lookTouchId) {
        const dx = t.clientX - this.lookTouchLast.x;
        const dy = t.clientY - this.lookTouchLast.y;
        this.lookTouchLast = { x: t.clientX, y: t.clientY };
        this.yaw -= dx * 0.0044;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.25, 1.25);
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) {
      this.lookTouchId = null;
      this.touchTapCandidate = null;
      return;
    }
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (
        this.touchTapCandidate &&
        t.identifier === this.touchTapCandidate.id &&
        performance.now() - this.touchTapCandidate.time < 260 &&
        Math.hypot(t.clientX - this.touchTapCandidate.x, t.clientY - this.touchTapCandidate.y) < 14
      ) {
        if (this.doorLoader.isActive()) {
          this.doorLoader.skip();
        } else if (this.hidingCabinet) {
          this.exitHideCabinet();
        } else {
          const rect = this.renderer.domElement.getBoundingClientRect();
          const nx = ((t.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = -((t.clientY - rect.top) / rect.height) * 2 + 1;
          this.tryInteractAtNdc(nx, ny);
        }
      }
      if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      if (this.touchTapCandidate && t.identifier === this.touchTapCandidate.id) {
        this.touchTapCandidate = null;
      }
    }
    if (e.touches.length === 0) {
      this.lookTouchId = null;
      this.touchTapCandidate = null;
    }
  };

  // ==================== INTERACTIONS & HOVER HINTS ====================

  private isOnOneWayUnlockSide(door: DoorState): boolean {
    if (!door.oneWayUnlockSide) return false;
    const dx = this.playerPos.x - door.group.position.x;
    const dz = this.playerPos.z - door.group.position.z;
    if (door.oneWayUnlockSide === 'south') return dz > 0.08;
    if (door.oneWayUnlockSide === 'north') return dz < -0.08;
    if (door.oneWayUnlockSide === 'west') return dx < -0.08;
    return dx > 0.08;
  }

  private enterHideCabinet(cab: HideCabinetState): void {
    if (this.hidingCabinet || this.floorTransition || this.documentModalOpen || this.inventoryModalOpen) return;
    if (this.crouched) {
      this.crouched = false;
    }
    this.hidePistolWasEquipped = this.pistolEquipped;
    if (this.flashlightOn) {
      this.setFlashlightPowered(false, true);
    }
    if (this.pistolEquipped) {
      this.pistolEquipped = false;
      this.pistolReloadTimer = 0;
      this.emitPistolState();
    }
    this.hidingCabinet = cab;
    this.hidePhase = 'entering';
    cab.targetDoorAngle = -1.48;
    this.audio.playCabinetDoor(true);
    this.emitPlayerStatus();
  }

  exitHideCabinet(): void {
    if (!this.hidingCabinet || this.hidePhase === 'exiting') return;
    this.hidePhase = 'exiting';
    this.hidingCabinet.targetDoorAngle = -1.48;
    this.audio.playCabinetDoor(false);
  }

  private getInteractionLabel(id: string | undefined): string | null {
    if (this.hidingCabinet) return '[E] Sair do armário';
    if (!id) return null;
    const doc = BLACKWOOD_DOCUMENTS[id];
    if (doc) return `[E] Ler: ${doc.title}`;
    const keyItem = BLACKWOOD_KEYS[id];
    if (keyItem && !this.collectedKeyIds.has(id)) return `[E] Pegar: ${keyItem.name}`;

    if (id.startsWith('pickup:')) {
      const dr = this.drawers.find((d) => d.pickupId === id && !d.pickupCollected);
      if (dr?.pickupItemId) {
        const entry = BLACKWOOD_ITEM_CATALOG[dr.pickupItemId];
        return `[E] Pegar: ${entry ? entry.name : 'Item'}`;
      }
    }
    if (id.startsWith('drawer:')) {
      const dId = id.slice(7);
      const dr = this.drawers.find((d) => d.id === dId);
      if (dr) {
        return dr.isOpen ? '[E] Fechar gaveta' : '[E] Abrir gaveta';
      }
    }
    if (id.startsWith('cabinet:')) {
      const cId = id.slice(8);
      const cab = this.hideCabinets.find((c) => c.id === cId);
      if (cab) {
        return `[E] Esconder-se (${cab.label})`;
      }
    }

    if (id === 'reception-bell') return '[E] Tocar campainha da recepção';
    if (id === 'floor-door-2') return this.currentFloor === 2 ? '[E] Descer para o 1º andar' : '[E] Subir para o 2º andar';
    if (id === 'floor-door-3') return this.currentFloor === 3 ? '[E] Descer para o 2º andar' : '[E] Subir para o 3º andar';
    if (id === 'door-end') return '[E] Subir escada para o 1º andar';
    if (id === 'door-floor-return') return '[E] Voltar ao Térreo';
    if (id === 'door-mezanino-enter') return '[E] Acessar Mezanino da Recepção';
    if (id === 'door-mezanino-return') return '[E] Voltar ao 1º andar';

    const door = this.doors.find((d) => d.id === id);
    if (door) {
      if (door.locked) {
        if (door.oneWayUnlockSide) {
          return this.isOnOneWayUnlockSide(door)
            ? '[E] Destravar trinco da porta'
            : door.oneWayHint || 'Trancada por trinco do outro lado';
        }
        if (door.requiredKeyId) {
          return this.collectedKeyIds.has(door.requiredKeyId)
            ? `[E] Destrancar (${door.requiredKeyName})`
            : `Trancada · Requer ${door.requiredKeyName}`;
        }
        return 'Porta trancada';
      }
      if (door.id.startsWith('door-entrance') && !this.isInside) {
        return door.isOpen ? '[E] Entrar no Sanatório' : '[E] Abrir portão principal';
      }
      return door.isOpen ? '[E] Fechar porta' : '[E] Abrir porta';
    }

    const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === id);
    if (prop) {
      if (prop.kind === 'stretcher') return '[E] Empurrar maca';
      if (prop.kind === 'cart') return '[E] Mover carrinho cirúrgico';
      return '[E] Mover cadeira';
    }
    return null;
  }

  private updateHoverPrompt(): void {
    if (this.documentModalOpen || this.inventoryModalOpen) {
      if (this.lastPrompt !== null) {
        this.lastPrompt = null;
        this.callbacks.onInteractPrompt?.(null);
      }
      return;
    }
    if (this.hidingCabinet) {
      const label = '[E] Sair do armário';
      if (label !== this.lastPrompt) {
        this.lastPrompt = label;
        this.callbacks.onInteractPrompt?.(label);
      }
      return;
    }
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.08;
    this.raycaster.far = 3.2;
    this.raycaster.layers.set(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let label: string | null = null;
    if (hits.length > 0) {
      const id = hits[0].object.userData.interactionId as string | undefined;
      label = this.getInteractionLabel(id);
    }
    if (!label && this.isInside && !this.floorTransition) {
      const z = this.playerPos.z;
      const x = this.playerPos.x;
      if (this.onMezzanine) {
        if (Math.abs(x) < 1.15 && z > 10.9 && z < 12.6) {
          label = '[E] Voltar ao 1º andar';
        }
      } else if (Math.abs(x) < 1.0 && z > -18.7 && z < -16.9) {
        label = '[E] Subir para o 1º andar';
      } else if (z > -22.5 && z < -20.9) {
        if (x < -0.4 && x > -2.05) label = '[E] Voltar ao Térreo';
        else if (x > 0.4 && x < 2.05) label = '[E] Acessar Mezanino da Recepção';
      }
    }

    if (label !== this.lastPrompt) {
      this.lastPrompt = label;
      this.callbacks.onInteractPrompt?.(label);
    }
  }

  private tryInteractAtNdc(nx: number, ny: number): void {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    if (this.hidingCabinet) {
      this.exitHideCabinet();
      return;
    }

    this.ndcCenter.set(nx, ny);
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.08;
    this.raycaster.far = 3.2;
    this.raycaster.layers.set(0);
    this.raycaster.layers.enable(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    const id = hits.length > 0 ? (hits[0].object.userData.interactionId as string | undefined) : undefined;

    if (!id) {
      if (this.isInside && !this.floorTransition) {
        const z = this.playerPos.z;
        const x = this.playerPos.x;
        if (this.onMezzanine) {
          if (Math.abs(x) < 1.15 && z > 10.9 && z < 12.6) {
            this.beginMezzanineTransition(false);
            return;
          }
        } else if (Math.abs(x) < 1.0 && z > -18.7 && z < -16.9) {
          this.beginFloorTransition(true);
          return;
        } else if (z > -22.5 && z < -20.9) {
          if (x < -0.4 && x > -2.05) {
            this.beginFloorTransition(false);
            return;
          }
          if (x > 0.4 && x < 2.05) {
            this.beginMezzanineTransition(true);
            return;
          }
        }
      }
      return;
    }

    if (id.startsWith('pickup:')) {
      const dr = this.drawers.find((d) => d.pickupId === id && !d.pickupCollected);
      if (dr && dr.pickupItemId) {
        dr.pickupCollected = true;
        if (dr.pickupGroup) {
          dr.pickupGroup.visible = false;
          dr.pickupGroup.traverse((child) => {
            child.layers.disable(1);
            child.userData.interactionId = undefined;
          });
        }
        const label = this.addInventoryItem(dr.pickupItemId);
        this.audio.playItemPickup();
        this.callbacks.onStatusToast?.(`Coletado: ${label}`);
        return;
      }
    }

    if (id.startsWith('drawer:')) {
      const dId = id.slice(7);
      const dr = this.drawers.find((d) => d.id === dId);
      if (dr) {
        dr.isOpen = !dr.isOpen;
        this.audio.playDrawerSlide(dr.isOpen, dr.metallic);
        return;
      }
    }

    if (id.startsWith('cabinet:')) {
      const cId = id.slice(8);
      const cab = this.hideCabinets.find((c) => c.id === cId);
      if (cab) {
        this.enterHideCabinet(cab);
        return;
      }
    }

    const doc: InspectableDocument | undefined = BLACKWOOD_DOCUMENTS[id];
    if (doc) {
      this.collectedDocIds.add(doc.id);
      const collectedDocs = BLACKWOOD_DOCUMENT_ORDER
        .filter((docId) => this.collectedDocIds.has(docId))
        .map((docId) => BLACKWOOD_DOCUMENTS[docId]);
      this.audio.playPaperRustle();
      this.callbacks.onOpenDocument?.(doc, collectedDocs);
      return;
    }

    const keyItem: KeyItem | undefined = BLACKWOOD_KEYS[id];
    if (keyItem && !this.collectedKeyIds.has(id)) {
      this.collectedKeyIds.add(id);
      const kGroup = this.keyPickups[id];
      if (kGroup) {
        kGroup.userData.collected = true;
        kGroup.visible = false;
        kGroup.traverse((child) => {
          child.userData.interactionId = undefined;
          child.layers.set(0);
        });
      }
      this.audio.playKeyPickup();
      const collectedKeys = BLACKWOOD_KEY_ORDER
        .filter((kId) => this.collectedKeyIds.has(kId))
        .map((kId) => BLACKWOOD_KEYS[kId]);
      this.callbacks.onKeysChange?.(collectedKeys);
      this.callbacks.onStatusToast?.(`Chave coletada: ${keyItem.name}`);
      return;
    }

    if (id === 'floor-door-2') {
      this.beginUpperFloorTransition(this.currentFloor === 2 ? 1 : 2);
      return;
    }
    if (id === 'floor-door-3') {
      this.beginUpperFloorTransition(this.currentFloor === 3 ? 2 : 3);
      return;
    }
    if (id === 'door-floor-return' && this.isInside && !this.floorTransition) {
      this.beginFloorTransition(false);
      return;
    }
    if (id === 'door-mezanino-enter' && this.isInside && !this.floorTransition) {
      this.beginMezzanineTransition(true);
      return;
    }
    if (id === 'door-mezanino-return' && this.isInside && !this.floorTransition) {
      this.beginMezzanineTransition(false);
      return;
    }
    if (id === 'reception-bell') {
      this.receptionEnv.ringBell();
      this.audio.playServiceBell();
      return;
    }

    const door = this.doors.find((d) => d.id === id);
    if (door) {
      if (door.locked) {
        if (door.oneWayUnlockSide && this.isOnOneWayUnlockSide(door)) {
          door.locked = false;
          door.oneWayUnlockSide = undefined;
          this.audio.playDoorUnlock();
          this.applyDoorSwing(door, true);
          this.callbacks.onStatusToast?.('Atalho destravado');
          return;
        }
        if (door.requiredKeyId && this.collectedKeyIds.has(door.requiredKeyId)) {
          door.locked = false;
          this.audio.playDoorUnlock();
          this.applyDoorSwing(door, true);
          this.callbacks.onStatusToast?.(`Destrancado com ${door.requiredKeyName}`);
          return;
        }
        door.shudderTime = 0.45;
        this.audio.playHeavyDoorRattle();
        if (door.oneWayHint) {
          this.callbacks.onStatusToast?.(door.oneWayHint);
        } else if (door.requiredKeyName) {
          this.callbacks.onStatusToast?.(`Requer: ${door.requiredKeyName}`);
        }
      } else {
        if (id.startsWith('door-entrance') && this.playerPos.z > 22 && !this.entering && !this.isInside) {
          this.beginEntranceTransition();
          return;
        }
        if (id === 'door-end' && this.isInside && !this.floorTransition) {
          this.beginFloorTransition(true);
          return;
        }
        if (this.settings.doorLoading === 'classic' && !door.isOpen && !door.linkedDoorId) {
          this.beginRoomDoorTransition(door);
          return;
        }
        this.applyDoorSwing(door, !door.isOpen);
        this.onDoorInteracted(door, id);
      }
      return;
    }

    const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === id);
    if (prop) {
      this.scratchFwd.set(0, 0, -1).applyAxisAngle(this.scratchUp, this.yaw);
      prop.impulse = 1;
      prop.impulseDirX = this.scratchFwd.x;
      prop.impulseDirZ = this.scratchFwd.z;
      if (prop.kind === 'cart' || prop.kind === 'stretcher') {
        this.audio.playMetalClink();
      } else {
        this.audio.playWoodNudge();
      }
    }
  }

  private onDoorInteracted(door: DoorState, id: string): void {
    if (door.isOpen && id.startsWith('door-entrance') && this.playerPos.z > 22 && !this.entering && !this.isInside) {
      this.beginEntranceTransition();
    } else if (id === 'door-end' && this.isInside && !this.floorTransition) {
      this.beginFloorTransition(true);
    } else if (id === 'door-floor-return' && this.isInside && !this.floorTransition) {
      this.beginFloorTransition(false);
    }
  }

  private getDoorObstacles(): AABBCollider[] {
    if (this.doorObstacles) return this.doorObstacles;
    const obs: AABBCollider[] = [];
    for (const prop of this.nudgeProps) {
      const grp = prop.group;
      grp.updateMatrixWorld(true);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      grp.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const bb = child.geometry.boundingBox;
        if (!bb) return;
        for (let b = 0; b < 8; b++) {
          this.scratchCorner
            .set(b & 1 ? bb.max.x : bb.min.x, b & 2 ? bb.max.y : bb.min.y, b & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(child.matrixWorld);
          if (this.scratchCorner.y > 2.3) continue;
          minX = Math.min(minX, this.scratchCorner.x);
          maxX = Math.max(maxX, this.scratchCorner.x);
          minZ = Math.min(minZ, this.scratchCorner.z);
          maxZ = Math.max(maxZ, this.scratchCorner.z);
        }
      });
      if (minX < Infinity) obs.push({ minX, maxX, minZ, maxZ });
    }
    this.doorObstacles = obs;
    return obs;
  }

  private clampDoorAngle(door: DoorState): number {
    if (!/^door-[lr]\d/.test(door.id)) return door.openAngle;
    const obs = this.getDoorObstacles();
    if (obs.length === 0) return door.openAngle;
    const cosB = Math.cos(door.baseRotationY);
    const sinB = Math.sin(door.baseRotationY);
    const collides = (ang: number) => {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let f = 0.12; f <= 1.001; f += 0.11) {
        const len = door.leafWidth * f;
        const ux = len * ca;
        const uz = -len * sa;
        const wx = door.hingeWorldX + ux * cosB + uz * sinB;
        const wz = door.hingeWorldZ - ux * sinB + uz * cosB;
        for (const o of obs) {
          if (wx > o.minX - 0.07 && wx < o.maxX + 0.07 && wz > o.minZ - 0.07 && wz < o.maxZ + 0.07) {
            return true;
          }
        }
      }
      return false;
    };

    let best = 0;
    for (let step = 1; step <= 24; step++) {
      const ang = (door.openAngle * step) / 24;
      if (collides(ang)) break;
      best = ang;
    }
    return best;
  }

  private applyDoorSwing(
    door: DoorState,
    open: boolean,
    closeDur = 0.68,
    spatial?: { pan: number; dist: number },
  ): void {
    const startOne = (d: DoorState) => {
      const tgt = open ? this.clampDoorAngle(d) : d.closedAngle;
      d.isOpen = open && Math.abs(tgt) > 0.05;
      const diff = Math.abs(tgt - d.currentAngle);
      const range = Math.max(0.01, Math.abs(d.openAngle - d.closedAngle));
      const frac = THREE.MathUtils.clamp(diff / range, 0.05, 1);
      d.targetAngle = tgt;
      d.animStartAngle = d.currentAngle;
      d.animTargetAngle = tgt;
      d.animElapsed = 0;
      d.animFrac = frac;
      d.animMode = open ? 'open' : 'close';
      d.animDuration = open ? Math.max(0.32, frac * 2.25) : Math.max(0.18, frac * closeDur);
      d.animating = diff > 0.002;
      return { animating: d.animating, frac, duration: d.animDuration };
    };

    const res = startOne(door);
    if (door.linkedDoorId) {
      const peer = this.doors.find((d) => d.id === door.linkedDoorId);
      if (peer) {
        startOne(peer);
        this.audio.stopDoorSound(peer.id, 0.04);
      }
    }
    if (res.animating) {
      this.audio.playDoorAction(door.id, open, res.frac, res.duration, spatial?.pan ?? 0, spatial?.dist ?? 0);
    }
  }

  // ==================== FLOOR STREAMING & DOOR LOADING ====================

  private activateFloor(floor: FloorKey): void {
    const allFloors: FloorKey[] = ['ext', 0, 1, 2, 3];
    for (const f of allFloors) {
      for (const obj of this.corridorEnv.floorObjects[f]) {
        obj.visible = false;
      }
    }
    for (const obj of this.corridorEnv.floorObjects[floor]) {
      if (!obj.userData.collected) {
        obj.visible = true;
      }
    }

    this.exteriorEnv.group.visible = floor === 'ext';
    const showReception = floor === 0 || (floor === 1 && this.onMezzanine);
    this.receptionEnv.group.visible = showReception;
    for (const light of this.receptionEnv.receptionLights) {
      light.visible = showReception;
    }
    this.corridorEnv.dustPoints.visible = floor !== 'ext';

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private startDoorTransition(opts: {
    variant: DoorVariant;
    label: string;
    sublabel: string;
    onSwap: () => void;
    onComplete?: () => void;
  }): void {
    this.floorTransition = true;
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    this.pointerDragging = false;
    this.mobileSprint = false;
    this.lookTouchId = null;
    this.touchTapCandidate = null;
    this.lastDoorHudKey = '';

    this.doorLoader.start({
      variant: opts.variant,
      label: opts.label,
      sublabel: opts.sublabel,
      fastMode: this.settings.doorLoading === 'fast',
      onSwap: opts.onSwap,
      onComplete: () => {
        this.floorTransition = false;
        this.entering = false;
        this.lastDoorHudKey = '';
        this.pipeline.setFade(0);
        this.callbacks.onDoorLoadingChange?.(null);
        opts.onComplete?.();
      },
    });
  }

  private beginEntranceTransition(): void {
    if (this.entering || this.floorTransition) return;
    this.entering = true;
    this.startDoorTransition({
      variant: 'entrance',
      label: 'Sanatório Blackwood',
      sublabel: 'Carregando Saguão Principal · 1924',
      onSwap: () => {
        this.isInside = true;
        this.currentFloor = 0;
        this.onMezzanine = false;
        this.playerPos.set(0, EYE_HEIGHT, 19.6);
        this.yaw = 0;
        this.pitch = -0.01;
        this.indoorBlend = 1;
        this.corridorBlend = 0;
        for (const d of this.doors) {
          if (d.id.startsWith('door-entrance')) {
            d.currentAngle = 0;
            d.targetAngle = 0;
            d.animStartAngle = 0;
            d.animTargetAngle = 0;
            d.animating = false;
            d.isOpen = false;
            d.locked = true;
            d.shudderTime = 0;
            d.pivot.rotation.y = d.baseRotationY;
            d.pivot.position.z = 0;
            this.audio.stopDoorSound(d.id, 0.02);
          }
        }
        this.activateFloor(0);
        this.callbacks.onFloorChange?.(0);
      },
    });
  }

  private beginFloorTransition(upToFirstFloor: boolean): void {
    if (this.floorTransition) return;
    this.startDoorTransition({
      variant: 'stairwell',
      label: upToFirstFloor ? '1º Andar · Tratamento' : 'Térreo · Ala Central',
      sublabel: upToFirstFloor ? 'Subindo escadaria...' : 'Retornando ao térreo...',
      onSwap: () => {
        this.isInside = true;
        this.currentFloor = upToFirstFloor ? 1 : 0;
        this.onMezzanine = false;
        this.playerPos.set(upToFirstFloor ? -1.24 : 0, EYE_HEIGHT, upToFirstFloor ? -22.8 : -15.8);
        this.yaw = upToFirstFloor ? 0 : Math.PI;
        this.pitch = -0.01;
        this.indoorBlend = 1;
        this.activateFloor(this.currentFloor);
        this.callbacks.onFloorChange?.(this.currentFloor);
      },
    });
  }

  private beginMezzanineTransition(toMezzanine: boolean): void {
    if (this.floorTransition) return;
    this.startDoorTransition({
      variant: 'stairwell',
      label: toMezzanine ? 'Mezanino da Recepção' : '1º Andar · Galeria',
      sublabel: toMezzanine ? 'Carregando galeria superior...' : 'Retornando ao 1º andar...',
      onSwap: () => {
        this.isInside = true;
        this.currentFloor = 1;
        this.onMezzanine = toMezzanine;
        if (toMezzanine) {
          this.playerPos.set(0, 3.96 + EYE_HEIGHT, 12.15);
          this.yaw = Math.PI;
          this.pitch = -0.04;
        } else {
          this.playerPos.set(1.24, EYE_HEIGHT, -22.8);
          this.yaw = 0;
          this.pitch = -0.01;
        }
        this.indoorBlend = 1;
        this.activateFloor(1);
        this.callbacks.onFloorChange?.(1);
      },
    });
  }

  private beginUpperFloorTransition(targetFloor: 1 | 2 | 3): void {
    if (this.floorTransition) return;
    const from = this.currentFloor;
    const goingUp = typeof from === 'number' ? targetFloor > from : true;
    const label =
      targetFloor === 1
        ? '1º Andar · Clínico'
        : targetFloor === 2
          ? '2º Andar · Diretoria & Alas'
          : '3º Andar · Morgue & Capela';
    this.startDoorTransition({
      variant: 'stairwell',
      label,
      sublabel: goingUp ? 'Subindo escadaria...' : 'Descendo escadaria...',
      onSwap: () => {
        this.currentFloor = targetFloor;
        this.onMezzanine = false;
        this.isInside = true;
        this.playerPos.set(
          0,
          EYE_HEIGHT,
          targetFloor === 1 ? -55.0 : targetFloor === 2 ? (goingUp ? -60.2 : -80.4) : -85.2,
        );
        this.yaw = targetFloor === 1 || (targetFloor === 2 && !goingUp) ? Math.PI : 0;
        this.pitch = -0.01;
        this.indoorBlend = 1;
        this.activateFloor(targetFloor);
        this.callbacks.onFloorChange?.(targetFloor);
      },
    });
  }

  private beginRoomDoorTransition(door: DoorState): void {
    if (this.floorTransition) return;
    const nx = Math.sin(door.baseRotationY);
    const nz = Math.cos(door.baseRotationY);
    const dx = this.playerPos.x - door.group.position.x;
    const dz = this.playerPos.z - door.group.position.z;
    const side = dx * nx + dz * nz >= 0 ? 1 : -1;
    const rawX = door.group.position.x - side * nx * 1.15;
    const rawZ = door.group.position.z - side * nz * 1.15;
    const targetYaw = Math.atan2(side * nx, side * nz);

    this.startDoorTransition({
      variant: 'ward',
      label: this.zone,
      sublabel: 'Atravessando porta...',
      onSwap: () => {
        const safe = this.resolveCollisions(rawX, rawZ);
        this.playerPos.x = safe.x;
        this.playerPos.z = safe.z;
        this.yaw = targetYaw;
        this.pitch = -0.01;
      },
    });
  }

  // ==================== COLLISION & SIMULATION ====================

  private resolveCollisions(nx: number, nz: number): { x: number; z: number } {
    let x = nx;
    let z = nz;

    const pushOutBox = (minX: number, maxX: number, minZ: number, maxZ: number) => {
      const cx = THREE.MathUtils.clamp(x, minX, maxX);
      const cz = THREE.MathUtils.clamp(z, minZ, maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        const d = Math.sqrt(dSq);
        if (d > 1e-4) {
          const push = PLAYER_RADIUS - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        } else {
          z += PLAYER_RADIUS;
        }
      }
    };

    if (this.onMezzanine) {
      for (const b of this.mezzanineColliders) {
        pushOutBox(b.minX, b.maxX, b.minZ, b.maxZ);
      }
      x = THREE.MathUtils.clamp(x, -4.7, 4.7);
      z = THREE.MathUtils.clamp(z, 11.15, 21.45);
      return { x, z };
    }

    for (const b of this.staticColliders) {
      pushOutBox(b.minX, b.maxX, b.minZ, b.maxZ);
    }

    for (const c of this.capsuleColliders) {
      const segX = c.x2 - c.x1;
      const segZ = c.z2 - c.z1;
      const lenSq = segX * segX + segZ * segZ;
      const t = lenSq > 1e-4 ? THREE.MathUtils.clamp(((x - c.x1) * segX + (z - c.z1) * segZ) / lenSq, 0, 1) : 0;
      const px = c.x1 + segX * t;
      const pz = c.z1 + segZ * t;
      const dx = x - px;
      const dz = z - pz;
      const minD = PLAYER_RADIUS + c.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq);
        if (d > 1e-4) {
          const push = minD - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        }
      }
    }

    for (const d of this.doors) {
      const ang = d.baseRotationY + d.currentAngle;
      const ca = Math.cos(ang);
      const sa = -Math.sin(ang);
      for (let i = 0; i < 4; i++) {
        const frac = (i + 0.5) / 4;
        const wx = d.hingeWorldX + ca * d.leafWidth * frac;
        const wz = d.hingeWorldZ + sa * d.leafWidth * frac;
        const dx = x - wx;
        const dz = z - wz;
        const minD = 0.46;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const dist = Math.sqrt(dSq);
          if (dist > 1e-4) {
            const push = minD - dist;
            x += (dx / dist) * push;
            z += (dz / dist) * push;
          }
        }
      }
    }

    if (this.currentFloor === 2 || this.currentFloor === 3) {
      x = THREE.MathUtils.clamp(x, -15.42, 15.42);
    } else if (this.currentFloor === 1) {
      x = THREE.MathUtils.clamp(x, -11.9, 11.9);
    } else if (z > ENTRANCE_Z) {
      x = THREE.MathUtils.clamp(x, -13.68, 13.68);
    } else if (z > 10.8) {
      x = THREE.MathUtils.clamp(x, -10.2, 10.2);
    } else if (z > -18.3) {
      x = THREE.MathUtils.clamp(x, -21.5, 21.5);
    } else {
      x = THREE.MathUtils.clamp(x, -4.68, 4.68);
    }
    z = THREE.MathUtils.clamp(z, -108.1, 43.5);
    return { x, z };
  }

  private getDoorSpatial(door: DoorState): { pan: number; dist: number } {
    const dx = door.group.position.x - this.playerPos.x;
    const dz = door.group.position.z - this.playerPos.z;
    const dist = Math.hypot(dx, dz);
    const inv = 1 / Math.max(0.001, dist);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return { pan: (dx * rx + dz * rz) * inv, dist };
  }

  private resolveCurrentSurface(): SurfaceType {
    if (this.onMezzanine) return 'wood';
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    if (z > ENTRANCE_Z) return 'exterior';
    if (z > RECEPTION_NORTH_Z && Math.abs(x) <= 5.25) return 'stone';
    if (this.currentFloor === 1) {
      if ((x < -2.4 && z > -30.5) || (x < -2.0 && z <= -30.5 && z > -45.7)) return 'tile';
      if (z <= -45.7) return 'concrete';
      return 'wood';
    }
    if (this.currentFloor === 2) {
      if (
        (x < -3.6 && z > -63.0) ||
        (x < -10.8 && z > -65.6) ||
        (x >= -8.4 && x <= -1.8 && z <= -65.6 && z >= -76.8) ||
        (x >= 1.8 && x <= 8.4 && z <= -71.2 && z >= -76.8) ||
        (x > 1.8 && z < -79.4)
      ) {
        return 'tile';
      }
      if ((x > 10.8 && z <= -65.6 && z >= -76.8) || (x < -1.8 && z < -79.4)) {
        return 'concrete';
      }
      return 'wood';
    }
    if (this.currentFloor === 3) {
      if ((x > 3.4 && z > -88.5) || (x > 4.2 && z <= -91.2)) return 'wood';
      if ((x < -3.4 && z > -88.5) || (x >= -8.4 && x <= -1.8 && z <= -91.2 && z >= -98.5)) return 'tile';
      return 'concrete';
    }
    return 'wood';
  }

  private updateParanormalEvents(moving: boolean): void {
    if (!moving || this.totalWalkedDist < 4.5 || this.elapsed < this.nextParanormalTime || this.elapsed < this.nextCheckTime) {
      return;
    }
    this.nextCheckTime = this.elapsed + 2.4;
    if (Math.random() > 0.36) return;

    this.closeCandidates.length = 0;
    this.knockCandidates.length = 0;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);

    for (const d of this.doors) {
      if (d.animating || d.shudderTime > 0 || d.id === this.lastParanormalDoorId) continue;
      const dx = d.group.position.x - this.playerPos.x;
      const dz = d.group.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      const dot = (dx * fx + dz * fz) / Math.max(0.001, dist);
      if (!d.locked && d.isOpen && Math.abs(d.currentAngle) > 0.25 && dist >= 2.8 && dist <= 11.5 && dot < 0.2) {
        this.closeCandidates.push(d);
      }
      if ((!d.isOpen || d.locked) && dist >= 1.8 && dist <= 8.8 && (d.locked || dot < 0.65)) {
        this.knockCandidates.push(d);
      }
    }

    const canClose = this.closeCandidates.length > 0;
    const canKnock = this.knockCandidates.length > 0;
    if (!canClose && !canKnock) return;

    const kind: 'close' | 'knock' =
      canClose && canKnock
        ? this.lastParanormalKind === 'close'
          ? 'knock'
          : this.lastParanormalKind === 'knock' || Math.random() < 0.48
            ? 'close'
            : 'knock'
        : canClose
          ? 'close'
          : 'knock';

    if (kind === 'close') {
      const target = this.closeCandidates[Math.floor(Math.random() * this.closeCandidates.length)];
      const sp = this.getDoorSpatial(target);
      this.applyDoorSwing(target, false, 0.62 + Math.random() * 0.36, sp);
      this.lastParanormalKind = 'close';
      this.lastParanormalDoorId = target.id;
    } else {
      const target = this.knockCandidates[Math.floor(Math.random() * this.knockCandidates.length)];
      const sp = this.getDoorSpatial(target);
      const count = Math.random() < 0.5 ? 3 : 2;
      this.audio.playParanormalDoorKnock(sp.pan, sp.dist, count, target.locked);
      target.shudderTime = 0.45;
      this.lastParanormalKind = 'knock';
      this.lastParanormalDoorId = target.id;
    }
    this.tension = Math.min(1, this.tension + 0.35);
    this.flashFlicker = 0.55;
    this.nextParanormalTime = this.elapsed + 28 + Math.random() * 24;
  }

  private updateHideState(dt: number): void {
    const cab = this.hidingCabinet;
    if (!cab) return;

    const baseY = this.onMezzanine ? 3.96 : 0;

    if (this.hidePhase === 'entering') {
      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, cab.insidePos.x, 8.5, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, cab.insidePos.z, 8.5, dt);
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, HIDE_EYE_HEIGHT, 9, dt);
      this.playerPos.y = baseY + this.currentEyeHeight;

      let dYaw = ((cab.outwardYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.yaw += dYaw * Math.min(1, dt * 8.5);
      this.pitch = THREE.MathUtils.damp(this.pitch, 0, 8.5, dt);

      if (Math.hypot(this.playerPos.x - cab.insidePos.x, this.playerPos.z - cab.insidePos.z) < 0.08) {
        this.playerPos.x = cab.insidePos.x;
        this.playerPos.z = cab.insidePos.z;
        this.hidePhase = 'inside';
        cab.targetDoorAngle = 0;
      }
    } else if (this.hidePhase === 'inside') {
      this.playerPos.x = cab.insidePos.x;
      this.playerPos.z = cab.insidePos.z;
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, HIDE_EYE_HEIGHT, 9, dt);
      this.playerPos.y = baseY + this.currentEyeHeight;

      let dYaw = ((this.yaw - cab.outwardYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const clampedYaw = THREE.MathUtils.clamp(dYaw, -0.42, 0.42);
      this.yaw = cab.outwardYaw + clampedYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 0.35);
    } else if (this.hidePhase === 'exiting') {
      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, cab.exitPos.x, 8.5, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, cab.exitPos.z, 8.5, dt);
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, EYE_HEIGHT, 9, dt);
      this.playerPos.y = baseY + this.currentEyeHeight;

      if (Math.hypot(this.playerPos.x - cab.exitPos.x, this.playerPos.z - cab.exitPos.z) < 0.09) {
        const safe = this.resolveCollisions(cab.exitPos.x, cab.exitPos.z);
        this.playerPos.x = safe.x;
        this.playerPos.z = safe.z;
        cab.targetDoorAngle = 0;
        this.hidingCabinet = null;
        this.hidePhase = null;
        if (this.hidePistolWasEquipped) {
          this.pistolEquipped = true;
          this.emitPistolState();
        }
        this.emitPlayerStatus();
      }
    }
  }

  private updatePlayer(dt: number): void {
    if (this.documentModalOpen || this.inventoryModalOpen || this.entering || this.floorTransition) {
      this.bobWeight = THREE.MathUtils.damp(this.bobWeight, 0, 8, dt);
      this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, 0, 8, dt);
      this.syncCameraAndFlashlight(dt);
      return;
    }

    if (this.hidingCabinet) {
      this.bobWeight = THREE.MathUtils.damp(this.bobWeight, 0, 10, dt);
      this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, 0, 10, dt);
      this.updateHideState(dt);
      this.syncCameraAndFlashlight(dt);
      return;
    }

    const moveFwd =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) +
      this.joystickVec.y;
    const moveStrafe =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) +
      this.joystickVec.x;
    const sprinting = !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.mobileSprint);

    if (sprinting && this.crouched && (moveFwd !== 0 || moveStrafe !== 0)) {
      this.crouched = false;
      this.emitPlayerStatus();
    }

    const speed = sprinting ? 3.25 : this.crouched ? 1.32 : 2.15;

    this.scratchFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.scratchMove.set(0, 0, 0).addScaledVector(this.scratchFwd, moveFwd).addScaledVector(this.scratchRight, moveStrafe);

    let moving = false;
    let mag = 0;
    if (this.scratchMove.lengthSq() > 0.002) {
      const len = this.scratchMove.length();
      mag = Math.min(1, len);
      if (len > 1) this.scratchMove.divideScalar(len);
      const nextX = this.playerPos.x + this.scratchMove.x * speed * dt;
      const nextZ = this.playerPos.z + this.scratchMove.z * speed * dt;
      const resolved = this.resolveCollisions(nextX, nextZ);
      const stepped = Math.hypot(resolved.x - this.playerPos.x, resolved.z - this.playerPos.z);
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;

      if (stepped > 0.0005) {
        moving = true;
        const surface = this.resolveCurrentSurface();
        if (this.playerPos.z < 21) this.totalWalkedDist += stepped;
        this.walkBobPhase += dt * (sprinting ? 10.6 : this.crouched ? 5.6 : 7.6) * (0.45 + 0.55 * mag);
        const cycle = Math.floor((this.walkBobPhase + 1.2) / Math.PI);
        if (cycle !== this.lastStepCycle) {
          this.lastStepCycle = cycle;
          const stepVol = sprinting ? 0.56 : this.crouched ? 0.25 : 0.45;
          this.audio.playFootstep(stepVol, surface, sprinting);
        }
      }
    }

    const baseFloorY = this.onMezzanine ? 3.96 : 0;
    const targetEye = this.crouched ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 11, dt);
    this.playerPos.y = baseFloorY + this.currentEyeHeight;

    this.bobWeight = THREE.MathUtils.damp(this.bobWeight, moving ? mag : 0, moving ? 10 : 7.5, dt);
    this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, moving && sprinting ? 1 : 0, 7, dt);

    if (this.playerPos.z < 21) {
      this.updateParanormalEvents(moving);
    }

    this.syncCameraAndFlashlight(dt);
  }

  private syncCameraAndFlashlight(dt: number): void {
    const bobAmp = this.bobWeight * (1 + this.sprintWeight * 0.35);
    const idleAmp = 1 - this.bobWeight * 0.7;
    const bobY = -Math.cos(this.walkBobPhase * 2) * 0.032 * bobAmp;
    const breathY = Math.sin(this.elapsed * 1.45) * 0.0045 * idleAmp;
    const bobX = Math.sin(this.walkBobPhase) * 0.018 * bobAmp;
    const roll = -Math.sin(this.walkBobPhase) * 0.0085 * bobAmp;
    const pitchBob = -Math.cos(this.walkBobPhase * 2) * 0.0055 * bobAmp + Math.sin(this.elapsed * 1.45) * 0.0014 * idleAmp;

    // Weapon state timers
    if (this.pistolCooldown > 0) this.pistolCooldown = Math.max(0, this.pistolCooldown - dt);
    if (this.pistolReloadTimer > 0) {
      this.pistolReloadTimer = Math.max(0, this.pistolReloadTimer - dt);
      if (this.pistolReloadTimer === 0) {
        const needed = this.pistolMagSize - this.pistolAmmo;
        const loaded = Math.min(needed, this.pistolReserve);
        this.pistolAmmo += loaded;
        this.pistolReserve -= loaded;
        this.syncAmmoInventoryAndHud();
      }
    }
    this.pistolRecoil = THREE.MathUtils.damp(this.pistolRecoil, 0, 14, dt);
    this.pistolSlide = THREE.MathUtils.damp(this.pistolSlide, 0, 22, dt);
    this.pistolFlash = Math.max(0, this.pistolFlash - dt * 16.5);
    this.pistolKickPitch = THREE.MathUtils.damp(this.pistolKickPitch, 0, 12, dt);

    for (const sp of this.impactSparks) {
      if (sp.life > 0) {
        sp.life = Math.max(0, sp.life - dt);
        const f = sp.life / 0.18;
        sp.mesh.scale.setScalar(1 + (1 - f) * 1.8);
        sp.mat.opacity = f * 0.92;
        if (sp.life === 0) sp.mesh.visible = false;
      }
    }

    this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(
      this.playerPos.x + this.scratchRight.x * bobX,
      this.playerPos.y + bobY + breathY,
      this.playerPos.z + this.scratchRight.z * bobX,
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = THREE.MathUtils.clamp(this.pitch + pitchBob + this.pistolKickPitch, -1.28, 1.28);
    this.camera.rotation.z = roll;

    this.flashYaw = THREE.MathUtils.damp(this.flashYaw, this.yaw, 16, dt);
    this.flashPitch = THREE.MathUtils.damp(this.flashPitch, this.pitch, 16, dt);

    const cp = Math.cos(this.flashPitch);
    this.scratchBeamDir.set(-Math.sin(this.flashYaw) * cp, Math.sin(this.flashPitch), -Math.cos(this.flashYaw) * cp);
    this.scratchBeamRight.set(Math.cos(this.flashYaw), 0, -Math.sin(this.flashYaw));
    this.scratchBeamUp.crossVectors(this.scratchBeamRight, this.scratchBeamDir).normalize();

    let hitDist = this.cachedFlashDist;
    if (this.flashlightOn && (this.raycastFrame++ % 2 === 0)) {
      this.ndcCenter.set(0, 0);
      this.raycaster.setFromCamera(this.ndcCenter, this.camera);
      this.raycaster.near = 0.05;
      this.raycaster.far = 26;
      this.raycaster.layers.set(0);
      this.raycaster.layers.enable(1);
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      hitDist = 26;
      for (const hit of hits) {
        if (hit.object.userData.isViewmodel || hit.object instanceof THREE.Points || hit.object instanceof THREE.LineSegments) {
          continue;
        }
        hitDist = hit.distance;
        break;
      }
      this.cachedFlashDist = hitDist;
    }

    let pullback = 0;
    let bounceGain = 0;
    if (hitDist < 26) {
      if (hitDist < 0.68) pullback = THREE.MathUtils.clamp((0.68 - hitDist) * 0.48, 0, 0.2);
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, Math.max(0.28, hitDist - 0.35));
      const f = THREE.MathUtils.clamp(1 - hitDist / 13.5, 0, 1);
      bounceGain = this.flashlightOn ? 0.09 + f * f * 0.66 : 0;
    } else {
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 6.2);
      bounceGain = this.flashlightOn ? 0.06 : 0;
    }

    this.flashlightRaise = THREE.MathUtils.damp(this.flashlightRaise, this.flashlightOn ? 1 : 0, 11, dt);
    this.wallPullback = THREE.MathUtils.damp(this.wallPullback, pullback, 14, dt);
    const swayX = Math.sin(this.walkBobPhase - 0.35) * 0.014 * bobAmp + Math.sin(this.elapsed * 1.4) * 0.002;
    const swayY = -Math.cos(this.walkBobPhase * 2 - 0.35) * 0.011 * bobAmp + Math.cos(this.elapsed * 1.1) * 0.002;

    const restDrop = (1 - this.flashlightRaise) * 0.052;
    const restPitch = (1 - this.flashlightRaise) * -0.24;

    // Left-hand vintage brass flashlight
    this.flashlightModel.group.position
      .copy(this.camera.position)
      .addScaledVector(this.scratchBeamRight, -0.205 + swayX - (1 - this.flashlightRaise) * 0.018)
      .addScaledVector(this.scratchBeamUp, -0.165 - restDrop + swayY + this.wallPullback * 0.16)
      .addScaledVector(this.scratchBeamDir, 0.31 - this.wallPullback - (1 - this.flashlightRaise) * 0.02);

    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 12);
    this.scratchMat4.lookAt(this.flashlightModel.group.position, this.flashlightTarget.position, this.scratchBeamUp);
    this.scratchQuat.setFromRotationMatrix(this.scratchMat4);
    this.flashlightModel.group.quaternion.copy(this.scratchQuat);
    this.flashlightModel.group.rotateX(this.wallPullback * 1.05 + restPitch);

    this.flashlightCore.position
      .copy(this.flashlightModel.group.position)
      .addScaledVector(this.scratchBeamDir, 0.14);
    this.flashlightSpill.position.copy(this.flashlightCore.position);

    // Right-hand 1924 pistol
    this.pistolRaise = THREE.MathUtils.damp(this.pistolRaise, this.pistolEquipped ? 1 : 0, 11, dt);
    this.pistolModel.group.visible = this.pistolRaise > 0.02;
    if (this.pistolModel.group.visible) {
      const holsterDrop = (1 - this.pistolRaise) * 0.16;
      const holsterPitch = (1 - this.pistolRaise) * -0.58;
      this.pistolModel.group.position
        .copy(this.camera.position)
        .addScaledVector(this.scratchBeamRight, 0.195 - swayX * 0.85)
        .addScaledVector(this.scratchBeamUp, -0.158 - holsterDrop - swayY * 0.85 + this.wallPullback * 0.12)
        .addScaledVector(this.scratchBeamDir, 0.32 - this.wallPullback * 0.85);
      this.scratchMat4.lookAt(this.pistolModel.group.position, this.flashlightTarget.position, this.scratchBeamUp);
      this.scratchQuat.setFromRotationMatrix(this.scratchMat4);
      this.pistolModel.group.quaternion.copy(this.scratchQuat);
      this.pistolModel.group.rotateX(this.wallPullback * 0.8 + holsterPitch);
      this.pistolModel.group.updateMatrixWorld(true);

      const reloadProg =
        this.pistolReloadTimer > 0 ? 1 - this.pistolReloadTimer / this.pistolReloadDuration : 0;
      this.pistolModel.updateState(
        this.pistolRecoil,
        this.pistolSlide,
        reloadProg,
        this.pistolFlash,
        this.pistolFlashRoll,
      );

      if (this.pistolFlash > 0.02) {
        this.pistolModel.getMuzzleWorldPos(this.scratchMuzzlePos);
        this.muzzleLight.position.copy(this.scratchMuzzlePos);
        this.muzzleLight.intensity = 16.5 * this.pistolFlash;
        this.muzzleLight.visible = true;
      } else {
        this.muzzleLight.visible = false;
        this.muzzleLight.intensity = 0;
      }
    } else {
      this.muzzleLight.visible = false;
    }

    if (!this.bounceInitialized) {
      this.bouncePos.copy(this.scratchBounceTarget);
      this.bounceIntensity = bounceGain;
      this.bounceInitialized = true;
    } else {
      this.bouncePos.x = THREE.MathUtils.damp(this.bouncePos.x, this.scratchBounceTarget.x, 12, dt);
      this.bouncePos.y = THREE.MathUtils.damp(this.bouncePos.y, this.scratchBounceTarget.y, 12, dt);
      this.bouncePos.z = THREE.MathUtils.damp(this.bouncePos.z, this.scratchBounceTarget.z, 12, dt);
      this.bounceIntensity = THREE.MathUtils.damp(this.bounceIntensity, bounceGain, 10, dt);
    }
    this.flashlightBounce.position.copy(this.bouncePos);

    this.flashFlicker = Math.max(0, this.flashFlicker - dt * 1.35);
    const batteryScale = 0.58 + 0.42 * (this.battery / 100);
    const flickerDip =
      this.flashFlicker > 0 ? (Math.sin(this.elapsed * 46) > 0.12 ? 0.34 : 1.0) : 1.0;
    const pulse =
      (0.985 + 0.01 * Math.sin(this.elapsed * 7.3) + 0.005 * Math.cos(this.elapsed * 19.1)) *
      flickerDip *
      batteryScale;
    this.flashlightCore.intensity = 46 * pulse;
    this.flashlightSpill.intensity = 1.85 * pulse;
    this.flashlightBounce.intensity = this.bounceIntensity * pulse;

    const beamMask = hitDist < 1.3 ? THREE.MathUtils.clamp(hitDist / 1.3, 0.22, 1) : 1;
    this.flashlightModel.setBeamIntensity(beamMask * (1 - this.wallPullback * 1.8) * pulse);
    const coneLen = THREE.MathUtils.clamp(hitDist * 0.96, 0.45, 15.5);
    const beamOp = this.flashlightOn ? 0.028 * flickerDip * batteryScale : 0;
    this.coreBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen, this.elapsed, beamOp, 0.155);
    this.wideBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen * 0.94, this.elapsed, beamOp * 0.34, 0.24);
  }

  private updateDoorsAndProps(dt: number): void {
    for (const d of this.doors) {
      if (d.animating) {
        d.shudderTime = 0;
        d.pivot.position.z = 0;
        d.animElapsed += dt;
        const frac = Math.min(1, d.animElapsed / Math.max(0.001, d.animDuration));
        const eased = d.animMode === 'open' ? frac * frac * (3 - 2 * frac) : frac * frac * (1.45 - 0.45 * frac);
        d.currentAngle = THREE.MathUtils.lerp(d.animStartAngle, d.animTargetAngle, eased);
        d.pivot.rotation.y = (d.linkedDoorId ? d.baseRotationY : 0) + d.currentAngle;
        if (frac >= 1) {
          d.currentAngle = d.animTargetAngle;
          d.pivot.rotation.y = (d.linkedDoorId ? d.baseRotationY : 0) + d.currentAngle;
          d.animating = false;
          if (d.animMode === 'close') {
            if (!d.linkedDoorId || d.id === 'door-entrance-l' || d.id === 'door-reception-north-l') {
              const sp = this.getDoorSpatial(d);
              this.audio.playDoorCloseImpact(d.id, d.animFrac, sp.pan, sp.dist > 1.8 ? sp.dist : 0);
            }
          } else {
            this.audio.stopDoorSound(d.id, 0.1);
          }
        }
      } else if (d.shudderTime > 0) {
        d.shudderTime = Math.max(0, d.shudderTime - dt);
        const w = d.shudderTime / 0.45;
        d.pivot.rotation.y =
          (d.linkedDoorId ? d.baseRotationY : 0) +
          d.currentAngle +
          Math.sin(this.elapsed * 52) * (d.locked ? 0.016 : 0.01) * w;
        d.pivot.position.z = d.locked ? Math.cos(this.elapsed * 44) * 0.008 * w : 0;
        if (d.shudderTime === 0) {
          d.pivot.rotation.y = (d.linkedDoorId ? d.baseRotationY : 0) + d.currentAngle;
          d.pivot.position.z = 0;
        }
      }
    }

    for (const p of this.nudgeProps) {
      if (p.impulse > 0.001) {
        p.phase += dt * 18;
        p.impulse = THREE.MathUtils.damp(p.impulse, 0, 5.2, dt);
        if (p.impulse <= 0.001) {
          p.impulse = 0;
          p.group.position.copy(p.basePos);
          p.group.rotation.z = p.baseRot.z;
        } else {
          const offset = Math.sin(p.phase) * 0.032 * p.impulse;
          p.group.position.set(p.basePos.x + p.impulseDirX * offset, p.basePos.y, p.basePos.z + p.impulseDirZ * offset);
          p.group.rotation.z = p.baseRot.z + Math.sin(p.phase * 1.3) * 0.035 * p.impulse;
        }
      }
    }

    for (const dr of this.drawers) {
      const targetFrac = dr.isOpen ? 1 : 0;
      if (Math.abs(dr.openFrac - targetFrac) > 0.001) {
        dr.openFrac = THREE.MathUtils.damp(dr.openFrac, targetFrac, 11, dt);
        dr.slideGroup.position.z = dr.openFrac * dr.slideDist;
        if (dr.pickupGroup && !dr.pickupCollected) {
          const canLoot = dr.openFrac > 0.45;
          dr.pickupGroup.traverse((child) => {
            if (canLoot) child.layers.enable(1);
            else child.layers.disable(1);
          });
        }
      }
    }

    for (const cab of this.hideCabinets) {
      if (Math.abs(cab.doorAngle - cab.targetDoorAngle) > 0.001) {
        cab.doorAngle = THREE.MathUtils.damp(cab.doorAngle, cab.targetDoorAngle, 9.5, dt);
        cab.doorPivot.rotation.y = cab.doorAngle;
      }
    }
  }

  private updateDustMotes(): void {
    const attr = this.corridorEnv.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const base = this.corridorEnv.dustBasePositions;
    const t = this.elapsed;
    for (let i = 0; i < attr.count; i++) {
      const idx = i * 3;
      arr[idx] = base[idx] + Math.sin(t * 0.32 + i * 0.7) * 0.14;
      arr[idx + 1] = base[idx + 1] + Math.cos(t * 0.24 + i * 1.1) * 0.09;
      arr[idx + 2] = base[idx + 2] + Math.sin(t * 0.21 + i * 0.5) * 0.14;
    }
    attr.needsUpdate = true;
    this.corridorEnv.dustMat.opacity = this.flashlightOn ? 0.16 : 0.05;
  }

  private resolveCurrentZone(): string {
    if (this.onMezzanine) return '1º Andar · Mezanino da Recepção';
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    if (this.currentFloor === 3) {
      if (z > -88.5) {
        if (x < -3.4) return '3º Andar · Sala de Preparação';
        if (x > 3.4) return '3º Andar · Sacristia Sul';
        return '3º Andar · Vestíbulo Norte';
      }
      if (z <= -98.5 && x < -1.8) return '3º Andar · Sala de Expurgo';
      if (x > 11.4 && z <= -88.5) return '3º Andar · Confessionário da Capela';
      if (x > 4.2 && z <= -91.2) return '3º Andar · Capela de Blackwood';
      if (x < -10.8) return '3º Andar · Câmara Frigorífica';
      if (x >= -8.4 && x <= -1.8 && z <= -91.2) return '3º Andar · Morgue & Necrotério';
      if (x < -1.8) return '3º Andar · Corredor da Morgue';
      if (z <= -102.4) return '3º Andar · Claustro Norte';
      return '3º Andar · Claustro da Capela';
    }
    if (this.currentFloor === 2) {
      if (z > -63.0) {
        if (x < -10.8) return '2º Andar · Câmara de Raio-X';
        if (x < -3.6) return '2º Andar · Ambulatório';
        if (x > 3.6) return '2º Andar · Sala de Reuniões Médicas';
        return '2º Andar · Hall da Escadaria';
      }
      if (z > -65.6) {
        if (x < -10.8) return '2º Andar · Anexo do Raio-X';
        if (x > 10.8) return '2º Andar · Anexo de Reuniões';
        return '2º Andar · Corredor Transversal Sul';
      }
      if (z < -79.4) {
        if (x < -1.8) return '2º Andar · Lavanderia';
        if (x > 1.8) return '2º Andar · Copa dos Enfermeiros';
        return '2º Andar · Acesso ao 3º Andar';
      }
      if (z < -76.8) return '2º Andar · Corredor Transversal Norte';
      if (x < -10.8) return '2º Andar · Farmácia & Laboratório';
      if (x < -8.4) return '2º Andar · Corredor Oeste';
      if (x < -1.8) return '2º Andar · Ala de Tratamento';
      if (x <= 1.8) return '2º Andar · Corredor Central';
      if (x <= 8.4) return z > -71.2 ? '2º Andar · Diretoria' : '2º Andar · Observação';
      if (x <= 10.8) return '2º Andar · Corredor Leste';
      return '2º Andar · Sala de Vigilância';
    }
    if (Math.abs(x) > 5.25 && z > 10.8 && z < 22.2) return getWingZoneName(x, z);
    if (z > 21.65) return 'Alameda · Entrada';
    if (z > RECEPTION_NORTH_Z) return 'Recepção · Saguão Principal';
    if (z > -19.5) return 'Térreo · Corredor em Cruz';
    if (z > -30.5) {
      if (x < -2.4) return '1º Andar · Sala de Hidroterapia';
      if (x > 2.4) return '1º Andar · Posto de Enfermagem';
      return '1º Andar · Galeria da Escadaria';
    }
    if (z > -45.7) {
      if (x < -2.0) return '1º Andar · Enfermaria Santa Clara';
      if (x > 2.0) return '1º Andar · Sala de Eletroterapia';
      return '1º Andar · Corredor Clínico';
    }
    if (x < -2.0) return '1º Andar · Arquivo Morto';
    if (x > 2.0) return '1º Andar · Cela de Isolamento';
    return '1º Andar · Corredor Norte';
  }

  private updateEnvironmentAtmosphere(dt: number): void {
    const targetIndoor = this.isInside ? 1 : 0;
    const targetCorridor = this.isInside && !this.onMezzanine && this.playerPos.z < RECEPTION_NORTH_Z ? 1 : 0;
    this.indoorBlend = THREE.MathUtils.damp(this.indoorBlend, targetIndoor, 5.5, dt);
    this.corridorBlend = THREE.MathUtils.damp(this.corridorBlend, targetCorridor, 4.5, dt);

    const outdoorFactor = 1 - this.indoorBlend;
    const nextZone = this.resolveCurrentZone();
    if (nextZone !== this.zone) {
      this.zone = nextZone;
      this.callbacks.onZoneChange?.(nextZone);
    }

    if (this.calmTimer > 0) {
      this.calmTimer = Math.max(0, this.calmTimer - dt);
    }
    if (this.flashlightOn && !this.hidingCabinet && !this.inventoryModalOpen && !this.documentModalOpen) {
      this.battery = Math.max(18, this.battery - dt * 0.22);
    }

    // Dynamic psychological tension based on floor depth, darkness, dread rooms, and events
    let targetTension = 0;
    if (this.isInside) {
      targetTension =
        this.currentFloor === 3
          ? 0.56
          : this.currentFloor === 2
            ? 0.42
            : this.currentFloor === 1
              ? 0.25
              : 0.12;
      if (!this.flashlightOn && !this.hidingCabinet) targetTension += 0.2;
      if (this.playerPos.z < -45.7 || (this.currentFloor === 1 && !this.onMezzanine && this.playerPos.x < -2.4 && this.playerPos.z > -30.5)) {
        targetTension += 0.2;
      }
      if (this.hidingCabinet) targetTension *= 0.52;
      if (this.calmTimer > 0) targetTension *= 0.24;
    }
    this.tension = THREE.MathUtils.damp(this.tension, Math.min(1, targetTension), 0.75, dt);

    this.statusEmitTimer += dt;
    if (this.statusEmitTimer >= 0.55) {
      this.statusEmitTimer = 0;
      this.emitPlayerStatus();
    }

    if (this.isInside && this.tension > 0.44 && this.elapsed >= this.nextHeartbeat) {
      this.audio.playHeartbeatPulse(this.tension);
      this.nextHeartbeat = this.elapsed + THREE.MathUtils.lerp(1.55, 0.72, (this.tension - 0.44) / 0.56);
    }
    if (this.currentFloor === 1 && !this.onMezzanine && this.playerPos.x < -2.0 && this.playerPos.z > -45.7 && this.elapsed >= this.nextDrip) {
      this.audio.playWaterDrip((Math.random() - 0.5) * 1.4, 0.45 + Math.random() * 0.35);
      this.nextDrip = this.elapsed + 2.2 + Math.random() * 3.8;
    }
    if (this.isInside && this.elapsed >= this.nextBuzz) {
      this.audio.playLampBuzz((Math.random() - 0.5) * 1.2);
      this.nextBuzz = this.elapsed + 6.5 + Math.random() * 8.0;
    }

    // Fog & sky color
    this.scratchColorA.copy(RECEPTION_FOG_COLOR).lerp(CORRIDOR_FOG_COLOR, this.corridorBlend);
    this.scratchColorB.copy(EXTERIOR_FOG_COLOR).lerp(this.scratchColorA, this.indoorBlend);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.scratchColorB);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.scratchColorB);
      const baseDensity = this.settings.fogDensity;
      this.scene.fog.density = THREE.MathUtils.lerp(baseDensity, baseDensity * 0.78, this.indoorBlend);
    }

    // Readable PS2 lighting: moonlight exterior + eerie corridor fill + flickering sconces
    this.scratchColorA.copy(RECEPTION_HEMI_SKY).lerp(CORRIDOR_HEMI_SKY, this.corridorBlend);
    this.hemiLight.color.copy(EXTERIOR_HEMI_SKY).lerp(this.scratchColorA, this.indoorBlend);

    this.scratchColorA.copy(RECEPTION_HEMI_GROUND).lerp(CORRIDOR_HEMI_GROUND, this.corridorBlend);
    this.hemiLight.groundColor.copy(EXTERIOR_HEMI_GROUND).lerp(this.scratchColorA, this.indoorBlend);

    const irBoost = this.settings.visionMode === 'ir-camcorder' ? 0.22 : 0;
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.32, 0.16, this.indoorBlend) + irBoost;

    this.stormDirLight.intensity = 0.48 * outdoorFactor;
    if (!this.isSoftwareGl) {
      this.stormDirLight.shadow.autoUpdate = this.indoorBlend < 0.96;
    }

    const evalDynamicLamp = (light: THREE.PointLight): void => {
      if (!light.visible) return;
      const base = (light.userData.baseIntensity as number) ?? 0.85;
      const seed = (light.userData.flickerSeed as number) || 0;
      const mode = (light.userData.flickerMode as string) || 'occasional';
      const t = this.elapsed;

      let factor = 1.0;
      if (mode === 'steady') {
        factor = 0.96 + 0.04 * Math.sin(t * 2.2 + seed);
      } else if (mode === 'fire') {
        factor = 0.78 + 0.13 * Math.sin(t * 7.3 + seed) + 0.09 * Math.sin(t * 16.4 + seed * 1.9);
      } else {
        const period = mode === 'faulty' ? 4.8 + (seed % 3.4) : 8.8 + (seed % 5.2);
        const burstDur = mode === 'faulty' ? 1.05 : 0.58;
        const phase = (t + seed * 1.37) % period;
        if (phase < burstDur) {
          const stutter = Math.sin(t * 37 + seed) * 0.5 + Math.cos(t * 59 + seed * 2.1) * 0.5;
          if (mode === 'faulty') {
            factor = stutter > 0.18 ? 0.92 : stutter > -0.22 ? 0.34 : 0.08;
          } else {
            factor = stutter > 0.25 ? 0.95 : stutter > -0.15 ? 0.45 : 0.16;
          }
        } else {
          factor = 0.94 + 0.06 * Math.sin(t * 2.8 + seed);
        }
      }

      light.intensity = base * factor * this.indoorBlend;
      const bulbMat = light.userData.bulbMat as THREE.MeshLambertMaterial | undefined;
      if (bulbMat) {
        const baseEmissive = (light.userData.bulbBaseEmissive as number) ?? 1.25;
        bulbMat.emissiveIntensity = baseEmissive * THREE.MathUtils.clamp(factor, 0.08, 1.15);
      }
    };

    for (const light of this.corridorEnv.flickerLights) {
      evalDynamicLamp(light);
    }
    for (const light of this.receptionEnv.receptionLights) {
      evalDynamicLamp(light);
    }

    this.pipeline.setMood(this.elapsed, 0);
    this.exteriorEnv.setStormFlash(0, this.elapsed);
    this.audio.setEnvironmentBlend(this.indoorBlend, this.tension);
    this.receptionEnv.update(dt, 0.75);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      if (sync && gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 70);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    const doorStep = this.doorLoader.update(dt, this.audio, this.camera.aspect);
    if (doorStep.active) {
      const hudKey = doorStep.hud
        ? `${doorStep.hud.label}|${doorStep.hud.sublabel}|${doorStep.hud.skippable ? 1 : 0}`
        : '';
      if (hudKey !== this.lastDoorHudKey) {
        this.lastDoorHudKey = hudKey;
        this.callbacks.onDoorLoadingChange?.(doorStep.hud);
      }
      this.pipeline.setMood(this.elapsed, 0);
      this.pipeline.setFade(doorStep.fadeAlpha);
      if (doorStep.renderingDoorScene) {
        this.pipeline.renderScene(this.doorLoader.scene, this.doorLoader.camera);
      } else {
        this.updateEnvironmentAtmosphere(dt);
        this.syncCameraAndFlashlight(dt);
        this.pipeline.render();
      }
    } else {
      this.pipeline.setFade(0);
      this.updatePlayer(dt);
      this.updateDoorsAndProps(dt);
      if ((this.dustFrame = (this.dustFrame + 1) % 3) === 0) {
        this.updateDustMotes();
      }
      if ((this.raycastFrame % 5) === 0) {
        this.updateHoverPrompt();
      }
      this.updateEnvironmentAtmosphere(dt);
      this.pipeline.render();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  dispose(): void {
    this.disposed = true;
    this.doorLoader.dispose();

    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.audio.dispose();

    const allGeos = new Set<THREE.BufferGeometry>([
      ...this.exteriorEnv.geometries,
      ...this.receptionEnv.geometries,
      ...this.corridorEnv.geometries,
    ]);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
        allGeos.add(obj.geometry);
      }
    });
    for (const g of allGeos) g.dispose();
    for (const m of this.exteriorEnv.materials) m.dispose();
    for (const m of this.receptionEnv.materials) m.dispose();
    for (const m of this.corridorEnv.materials) m.dispose();
    for (const t of this.receptionEnv.textures) t.dispose();
    for (const t of this.corridorEnv.textures) t.dispose();

    this.flashlightModel.dispose();
    this.pistolModel.dispose();
    this.impactSparkGeo.dispose();
    for (const sp of this.impactSparks) sp.mat.dispose();
    this.coreBeam.dispose();
    this.wideBeam.dispose();
    this.pipeline.dispose();
    this.propMats.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
