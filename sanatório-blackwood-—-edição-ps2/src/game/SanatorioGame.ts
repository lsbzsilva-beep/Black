import * as THREE from 'three';
import { BlackwoodAudio } from './audio';
import { BLACKWOOD_DOCUMENT_ORDER, BLACKWOOD_DOCUMENTS } from './documents';
import { BLACKWOOD_KEY_ORDER, BLACKWOOD_KEYS } from './keys';
import { createPropMaterials, PropMaterialBank, SHARED_VERTEX_SNAP } from './materials';
import {
  createFlashlightModel,
  createVolumetricBeam,
  FlashlightViewmodel,
  VolumetricBeam,
} from './props';
import { Ps2Pipeline } from './ps2Pipeline';
import { createBlackwoodTextures, BlackwoodTextureBank } from './textures';
import {
  AABBCollider,
  CapsuleCollider,
  DoorState,
  FloorKey,
  GameCallbacks,
  InspectableDocument,
  KeyItem,
  NudgeProp,
  PS2_PRESETS,
  Ps2PresetId,
  Ps2Settings,
  SurfaceType,
} from './types';
import { buildCorridorAndFloors, CorridorAndFloorsResult } from './world/corridorAndFloors';
import { buildExteriorWorld, ExteriorBuildResult } from './world/exterior';
import { buildReceptionAndWings, ReceptionBuildResult } from './world/reception';

const EYE_HEIGHT = 1.66;
const PLAYER_RADIUS = 0.32;
const ENTRANCE_Z = 22.0;
const RECEPTION_NORTH_Z = 10.8;

const EXTERIOR_FOG_COLOR = new THREE.Color(0x1b2321);
const RECEPTION_FOG_COLOR = new THREE.Color(0x0d100e);
const CORRIDOR_FOG_COLOR = new THREE.Color(0x090b0a);

const EXTERIOR_HEMI_SKY = new THREE.Color(0x3a4d54);
const RECEPTION_HEMI_SKY = new THREE.Color(0x363228);
const CORRIDOR_HEMI_SKY = new THREE.Color(0x282b26);
const EXTERIOR_HEMI_GROUND = new THREE.Color(0x161b18);
const RECEPTION_HEMI_GROUND = new THREE.Color(0x14120e);
const CORRIDOR_HEMI_GROUND = new THREE.Color(0x0d0e0c);

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
  private coreBeam!: VolumetricBeam;
  private wideBeam!: VolumetricBeam;

  private doors: DoorState[] = [];
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
  private isInside = false;
  private currentFloor: FloorKey = 'ext';
  private onMezzanine = false;
  private zone = 'Alameda';
  private lastPrompt: string | null = null;
  private entering = false;
  private floorTransition = false;
  private documentModalOpen = false;
  private collectedDocIds = new Set<string>();
  private collectedKeyIds = new Set<string>();

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
  private cachedFlashDist = 14;
  private transitionTimers: number[] = [];

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
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setClearColor(0x111615, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2321);
    this.scene.fog = new THREE.FogExp2(0x1b2321, this.settings.fogDensity);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.18, 128);
    this.camera.rotation.order = 'YXZ';

    this.textures = createBlackwoodTextures(
      this.settings.pixelTextures,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.propMats = createPropMaterials(this.textures);

    this.exteriorEnv = buildExteriorWorld(this.textures);
    this.scene.add(this.exteriorEnv.group);
    this.staticColliders.push(...this.exteriorEnv.colliders);

    this.receptionEnv = buildReceptionAndWings(this.propMats, this.textures);
    this.scene.add(this.receptionEnv.group);
    this.doors.push(...this.receptionEnv.doors);
    this.nudgeProps.push(...this.receptionEnv.nudgeProps);
    this.staticColliders.push(...this.receptionEnv.colliders);
    this.mezzanineColliders.push(...this.receptionEnv.mezzanineColliders);
    this.capsuleColliders.push(...this.receptionEnv.capsules);

    this.corridorEnv = buildCorridorAndFloors(this.propMats, this.textures);
    this.scene.add(this.corridorEnv.group);
    this.doors.push(...this.corridorEnv.doors);
    this.nudgeProps.push(...this.corridorEnv.nudgeProps);
    this.staticColliders.push(...this.corridorEnv.colliders);
    this.keyPickups = { ...this.corridorEnv.keyPickups };

    this.buildLightingAndFlashlight();
    this.pipeline = new Ps2Pipeline(this.renderer, this.scene, this.camera, this.settings);
    this.pipeline.setSize(w, h);

    this.syncCameraAndFlashlight(1);
    this.bindEvents();

    this.callbacks.onZoneChange?.(this.zone);
    this.callbacks.onFloorChange?.(this.currentFloor);
    this.callbacks.onFlashlightChange?.(this.flashlightOn);
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

    this.flashlightModel = createFlashlightModel(this.propMats, this.textures);
    this.flashlightModel.group.visible = false;
    this.scene.add(this.flashlightModel.group);

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);

    this.flashlightCore = new THREE.SpotLight(0xfff0cc, 78, 34, Math.PI / 3.6, 0.62, 1.15);
    this.flashlightCore.target = this.flashlightTarget;
    if (!this.isSoftwareGl) {
      this.flashlightCore.castShadow = true;
      this.flashlightCore.shadow.mapSize.set(512, 512);
      this.flashlightCore.shadow.camera.near = 0.14;
      this.flashlightCore.shadow.camera.far = 30;
      this.flashlightCore.shadow.bias = -0.0004;
    }
    this.scene.add(this.flashlightCore);

    this.flashlightSpill = new THREE.SpotLight(0xffe4b8, 5.2, 19, Math.PI / 2.35, 0.88, 1.2);
    this.flashlightSpill.target = this.flashlightTarget;
    this.scene.add(this.flashlightSpill);

    this.flashlightBounce = new THREE.PointLight(0xffdfb0, 0, 9.5, 1.35);
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

  toggleFlashlight(): boolean {
    this.audio.unlock();
    this.flashlightOn = !this.flashlightOn;
    this.flashlightModel.setPowered(this.flashlightOn);
    this.flashlightModel.group.visible = this.flashlightOn;
    this.flashlightCore.visible = this.flashlightOn;
    this.flashlightSpill.visible = this.flashlightOn;
    this.flashlightBounce.visible = this.flashlightOn;
    this.coreBeam.mesh.visible = this.flashlightOn;
    this.wideBeam.mesh.visible = this.flashlightOn;
    this.audio.playFlashlightClick();
    this.callbacks.onFlashlightChange?.(this.flashlightOn);
    return this.flashlightOn;
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
    if (this.documentModalOpen) return;
    this.audio.unlock();
    this.tryInteractAtNdc(0, 0);
  }

  setDocumentModalOpen(open: boolean): void {
    this.documentModalOpen = open;
    if (open) {
      this.keys = {};
      this.joystickVec.x = 0;
      this.joystickVec.y = 0;
      this.pointerDragging = false;
      this.mobileSprint = false;
      this.lookTouchId = null;
      this.touchTapCandidate = null;
    }
  }

  playPaperTurnSound(): void {
    this.audio.playPaperRustle();
  }

  jumpToFloor(floor: FloorKey): void {
    this.audio.unlock();
    this.floorTransition = false;
    this.entering = false;
    this.onMezzanine = false;

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

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.documentModalOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.audio.unlock();
    this.keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Space') {
      if (!e.repeat) this.tryInteractAtNdc(0, 0);
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlashlight();
    } else if (e.code === 'KeyV' && !e.repeat) {
      const next = this.settings.visionMode === 'ir-camcorder' ? 'flashlight' : 'ir-camcorder';
      this.updateSettings({ visionMode: next });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.documentModalOpen || e.pointerType === 'touch') return;
    this.audio.unlock();
    this.pointerDragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.documentModalOpen || e.pointerType === 'touch') return;
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
    if (this.documentModalOpen) return;
    const dtMs = performance.now() - this.pointerDownPos.time;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dtMs < 260 && dist < 8) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.tryInteractAtNdc(nx, ny);
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (this.documentModalOpen) return;
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
    if (this.documentModalOpen) return;
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
    if (this.documentModalOpen) {
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
        const rect = this.renderer.domElement.getBoundingClientRect();
        const nx = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        this.tryInteractAtNdc(nx, ny);
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

  private getInteractionLabel(id: string | undefined): string | null {
    if (!id) return null;
    const doc = BLACKWOOD_DOCUMENTS[id];
    if (doc) return `[E] Ler: ${doc.title}`;
    const keyItem = BLACKWOOD_KEYS[id];
    if (keyItem && !this.collectedKeyIds.has(id)) return `[E] Pegar: ${keyItem.name}`;
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
    if (this.documentModalOpen) {
      if (this.lastPrompt !== null) {
        this.lastPrompt = null;
        this.callbacks.onInteractPrompt?.(null);
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
    if (this.documentModalOpen) return;

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

  // ==================== FLOOR & ENTRANCE TRANSITIONS ====================

  private createTransitionOverlay(label: string): HTMLDivElement {
    const div = document.createElement('div');
    div.setAttribute('data-sb-loading', '');
    div.style.cssText =
      'position:fixed;inset:0;z-index:60;background:#060807;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;transition:opacity 0.42s ease;font-family:"Libre Baskerville",Georgia,serif;color:#e6e0d4;pointer-events:none';
    div.innerHTML = `<div style="font-size:13px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.9">${label}</div><div style="width:160px;height:2px;background:#2b312d;overflow:hidden"><div style="width:100%;height:100%;background:#b8985e"></div></div>`;
    document.body.appendChild(div);
    requestAnimationFrame(() => {
      div.style.opacity = '1';
    });
    return div;
  }

  private beginEntranceTransition(): void {
    this.entering = true;
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    const overlay = this.createTransitionOverlay('Entrando no Sanatório Blackwood');

    const t1 = window.setTimeout(() => {
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
      this.callbacks.onFloorChange?.(0);
    }, 650);

    const t2 = window.setTimeout(() => {
      overlay.style.opacity = '0';
    }, 1150);

    const t3 = window.setTimeout(() => {
      overlay.remove();
      this.entering = false;
    }, 1650);

    this.transitionTimers.push(t1, t2, t3);
  }

  private beginFloorTransition(upToFirstFloor: boolean): void {
    this.floorTransition = true;
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    const overlay = this.createTransitionOverlay(
      upToFirstFloor ? 'Subindo para o 1º andar' : 'Retornando ao térreo',
    );

    const t1 = window.setTimeout(() => {
      this.isInside = true;
      this.currentFloor = upToFirstFloor ? 1 : 0;
      this.onMezzanine = false;
      this.playerPos.set(upToFirstFloor ? -1.24 : 0, EYE_HEIGHT, upToFirstFloor ? -22.8 : -15.8);
      this.yaw = upToFirstFloor ? 0 : Math.PI;
      this.pitch = -0.01;
      this.indoorBlend = 1;
      this.callbacks.onFloorChange?.(this.currentFloor);
    }, 480);

    const t2 = window.setTimeout(() => {
      overlay.style.opacity = '0';
    }, 900);

    const t3 = window.setTimeout(() => {
      overlay.remove();
      this.floorTransition = false;
    }, 1400);

    this.transitionTimers.push(t1, t2, t3);
  }

  private beginMezzanineTransition(toMezzanine: boolean): void {
    this.floorTransition = true;
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    const overlay = this.createTransitionOverlay(
      toMezzanine ? 'Acessando Mezanino da Recepção' : 'Retornando ao 1º andar',
    );

    const t1 = window.setTimeout(() => {
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
      this.callbacks.onFloorChange?.(1);
    }, 480);

    const t2 = window.setTimeout(() => {
      overlay.style.opacity = '0';
    }, 900);

    const t3 = window.setTimeout(() => {
      overlay.remove();
      this.floorTransition = false;
    }, 1400);

    this.transitionTimers.push(t1, t2, t3);
  }

  private beginUpperFloorTransition(targetFloor: 1 | 2 | 3): void {
    this.floorTransition = true;
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    const label =
      targetFloor === 1
        ? 'Retornando ao 1º andar'
        : targetFloor === 2
          ? 'Subindo para o 2º andar'
          : 'Subindo para o 3º andar';
    const overlay = this.createTransitionOverlay(label);

    const t1 = window.setTimeout(() => {
      const from = this.currentFloor;
      const goingUp = typeof from === 'number' ? targetFloor > from : true;
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
      this.callbacks.onFloorChange?.(targetFloor);
    }, 480);

    const t2 = window.setTimeout(() => {
      overlay.style.opacity = '0';
    }, 900);

    const t3 = window.setTimeout(() => {
      overlay.remove();
      this.floorTransition = false;
    }, 1400);

    this.transitionTimers.push(t1, t2, t3);
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

  private updatePlayer(dt: number): void {
    if (this.documentModalOpen || this.entering || this.floorTransition) {
      this.bobWeight = THREE.MathUtils.damp(this.bobWeight, 0, 8, dt);
      this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, 0, 8, dt);
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
    const speed = sprinting ? 3.25 : 2.15;

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
        this.walkBobPhase += dt * (sprinting ? 10.6 : 7.6) * (0.45 + 0.55 * mag);
        const cycle = Math.floor((this.walkBobPhase + 1.2) / Math.PI);
        if (cycle !== this.lastStepCycle) {
          this.lastStepCycle = cycle;
          this.audio.playFootstep(sprinting ? 0.56 : 0.45, surface, sprinting);
        }
      }
    }

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

    this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(
      this.playerPos.x + this.scratchRight.x * bobX,
      this.playerPos.y + bobY + breathY,
      this.playerPos.z + this.scratchRight.z * bobX,
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = THREE.MathUtils.clamp(this.pitch + pitchBob, -1.28, 1.28);
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
      this.raycaster.far = 22;
      this.raycaster.layers.set(0);
      this.raycaster.layers.enable(1);
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      hitDist = 22;
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
    if (hitDist < 22) {
      if (hitDist < 0.68) pullback = THREE.MathUtils.clamp((0.68 - hitDist) * 0.48, 0, 0.2);
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, Math.max(0.28, hitDist - 0.45));
      const f = THREE.MathUtils.clamp(1 - hitDist / 13.5, 0, 1);
      bounceGain = this.flashlightOn ? 0.42 + f * f * 2.35 : 0;
    } else {
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 6.5);
      bounceGain = this.flashlightOn ? 0.38 : 0;
    }

    this.wallPullback = THREE.MathUtils.damp(this.wallPullback, pullback, 14, dt);
    const swayX = Math.sin(this.walkBobPhase - 0.35) * 0.015 * bobAmp + Math.sin(this.elapsed * 1.4) * 0.0022;
    const swayY = -Math.cos(this.walkBobPhase * 2 - 0.35) * 0.012 * bobAmp + Math.cos(this.elapsed * 1.1) * 0.0022;

    this.flashlightModel.group.position
      .copy(this.camera.position)
      .addScaledVector(this.scratchBeamRight, 0.21 + swayX)
      .addScaledVector(this.scratchBeamUp, -0.18 + swayY + this.wallPullback * 0.18)
      .addScaledVector(this.scratchBeamDir, 0.34 - this.wallPullback);

    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 12);
    this.scratchMat4.lookAt(this.flashlightModel.group.position, this.flashlightTarget.position, this.scratchBeamUp);
    this.scratchQuat.setFromRotationMatrix(this.scratchMat4);
    this.flashlightModel.group.quaternion.copy(this.scratchQuat);
    this.flashlightModel.group.rotateX(this.wallPullback * 1.1);

    this.flashlightCore.position
      .copy(this.camera.position)
      .addScaledVector(this.scratchBeamRight, 0.16)
      .addScaledVector(this.scratchBeamUp, -0.14)
      .addScaledVector(this.scratchBeamDir, 0.06);
    this.flashlightSpill.position.copy(this.flashlightCore.position);

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
    const flickerDip =
      this.flashFlicker > 0 ? (Math.sin(this.elapsed * 46) > 0.12 ? 0.34 : 1.0) : 1.0;
    const pulse = (0.985 + 0.01 * Math.sin(this.elapsed * 7.3) + 0.005 * Math.cos(this.elapsed * 19.1)) * flickerDip;
    this.flashlightCore.intensity = 78 * pulse;
    this.flashlightSpill.intensity = 5.2 * pulse;
    this.flashlightBounce.intensity = this.bounceIntensity * pulse;

    const beamMask = hitDist < 1.3 ? THREE.MathUtils.clamp(hitDist / 1.3, 0.22, 1) : 1;
    this.flashlightModel.setBeamIntensity(beamMask * (1 - this.wallPullback * 1.8) * pulse);
    const coneLen = THREE.MathUtils.clamp(hitDist * 0.96, 0.45, 16);
    const beamOp = this.flashlightOn ? 0.08 * flickerDip : 0;
    this.coreBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen, this.elapsed, beamOp, 0.34);
    this.wideBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen * 0.94, this.elapsed, beamOp * 0.62, 0.64);
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
    this.corridorEnv.dustMat.opacity = this.flashlightOn ? 0.28 : 0.08;
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
      if (!this.flashlightOn) targetTension += 0.2;
      if (this.playerPos.z < -45.7 || (this.currentFloor === 1 && !this.onMezzanine && this.playerPos.x < -2.4 && this.playerPos.z > -30.5)) {
        targetTension += 0.2;
      }
    }
    this.tension = THREE.MathUtils.damp(this.tension, Math.min(1, targetTension), 0.75, dt);

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

    const irBoost = this.settings.visionMode === 'ir-camcorder' ? 0.24 : 0;
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.46, 0.26, this.indoorBlend) + irBoost;

    this.stormDirLight.intensity = 0.48 * outdoorFactor;
    if (!this.isSoftwareGl) {
      this.stormDirLight.shadow.autoUpdate = this.indoorBlend < 0.96;
    }

    for (const light of this.corridorEnv.flickerLights) {
      const base = (light.userData.baseIntensity as number) || 0.58;
      if (light.userData.flicker === false) {
        light.intensity = base * this.indoorBlend;
      } else {
        const seed = (light.userData.flickerSeed as number) || 0;
        const flick = 0.78 + 0.14 * Math.sin(this.elapsed * 4.2 + seed) + 0.08 * Math.sin(this.elapsed * 11.5 + seed);
        light.intensity = Math.max(base * 0.52, base * flick) * this.indoorBlend;
      }
    }
    for (const light of this.receptionEnv.receptionLights) {
      const base = (light.userData.baseIntensity as number) ?? 0.72;
      light.intensity = base * this.indoorBlend;
    }

    this.pipeline.setMood(this.elapsed, 0);
    this.exteriorEnv.setStormFlash(0, this.elapsed);
    this.audio.setEnvironmentBlend(this.indoorBlend, this.tension);
    this.exteriorEnv.group.visible = !this.isInside;
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

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  dispose(): void {
    this.disposed = true;
    for (const id of this.transitionTimers) clearTimeout(id);
    this.transitionTimers = [];
    document.querySelectorAll('[data-sb-loading]').forEach((el) => el.remove());

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

    this.flashlightModel.dispose();
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
