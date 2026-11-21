import * as THREE from 'three';
import { BLACKWOOD_KEYS } from '../keys';
import { createPs2Lambert, PropMaterialBank } from '../materials';
import {
  applyBoxUvTiling,
  applyPlaneOrSlabUv,
  createChair,
  createEndDoor,
  createEntranceDoubleDoors,
  createInspectableDocProp,
  createKeyPickupProp,
  createMedicalCart,
  createSingleDoor,
  createStairwellPortalDoor,
  createStretcher,
} from '../props';
import { BlackwoodTextureBank } from '../textures';
import { AABBCollider, DoorState, NudgeProp } from '../types';

export interface CorridorAndFloorsResult {
  group: THREE.Group;
  doors: DoorState[];
  nudgeProps: NudgeProp[];
  colliders: AABBCollider[];
  keyPickups: Record<string, THREE.Group>;
  flickerLights: THREE.PointLight[];
  dustPoints: THREE.Points;
  dustBasePositions: Float32Array;
  dustMat: THREE.PointsMaterial;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

export function buildCorridorAndFloors(
  propMats: PropMaterialBank,
  textures: BlackwoodTextureBank,
): CorridorAndFloorsResult {
  const group = new THREE.Group();
  const doors: DoorState[] = [];
  const nudgeProps: NudgeProp[] = [];
  const colliders: AABBCollider[] = [];
  const keyPickups: Record<string, THREE.Group> = {};
  const flickerLights: THREE.PointLight[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const floorMat = createPs2Lambert({ map: textures.woodFloor, color: 0xbcb3a3 }, materials);
  const concreteFloorMat = createPs2Lambert({ map: textures.concrete, color: 0xa2a096 }, materials);
  const wallMat = createPs2Lambert({ map: textures.wall, color: 0xc2bcb0 }, materials);
  const ceilingMat = createPs2Lambert({ map: textures.ceiling, color: 0x878074 }, materials);
  const darkCeilMat = createPs2Lambert({ color: 0x4f493f }, materials);
  const trimMat = createPs2Lambert({ map: textures.weatheredWood, color: 0x625344 }, materials);
  const woodDadoMat = createPs2Lambert({ map: textures.receptionDado, color: 0xb8ad9d }, materials);
  const linenMat = createPs2Lambert({ color: 0xc4bfa8 }, materials);
  const porcelainMat = createPs2Lambert({ color: 0xd0d4ce }, materials);
  const runnerMat = createPs2Lambert(
    {
      color: 0x3a1c19,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    },
    materials,
  );
  const altarGoldMat = createPs2Lambert({ color: 0xb89648, emissive: 0x422a08, emissiveIntensity: 0.45 }, materials);
  const candleFlameMat = createPs2Lambert({ color: 0xffd27a, emissive: 0xff9a28, emissiveIntensity: 1.45 }, materials);
  const furnaceGlowMat = createPs2Lambert({ color: 0xd1441e, emissive: 0x99260a, emissiveIntensity: 1.2 }, materials);
  const waterMat = createPs2Lambert(
    {
      color: 0x22383b,
      transparent: true,
      opacity: 0.78,
    },
    materials,
  );
  const redBulbMat = createPs2Lambert(
    {
      color: 0xcc442a,
      emissive: 0xa82a14,
      emissiveIntensity: 1.15,
    },
    materials,
  );
  const coldBulbMat = createPs2Lambert(
    {
      color: 0xdbe6dc,
      emissive: 0xa0bcb0,
      emissiveIntensity: 0.85,
    },
    materials,
  );

  const addWall = (
    cx: number,
    y0: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    collide: boolean,
    tileSize = 2.6,
  ) => {
    if (w < 0.005 || h < 0.005 || d < 0.005) return null;
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    applyBoxUvTiling(geo, w, h, d, tileSize);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, y0 + h * 0.5, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push({
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
      });
    }
    return mesh;
  };

  /** Exact-bounds wall builder so perpendicular walls & corners NEVER overlap or share coplanar faces */
  const addWallBounds = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    mat: THREE.Material,
    collide: boolean,
    tileSize = 2.6,
  ) => addWall((x0 + x1) * 0.5, y0, (z0 + z1) * 0.5, x1 - x0, y1 - y0, z1 - z0, mat, collide, tileSize);

  /** Split-layer wall for rooms requiring different materials on West vs East face (1cm internal gap, zero Z-fighting) */
  const addDualWallNS = (
    cx: number,
    z0: number,
    z1: number,
    westMat: THREE.Material,
    eastMat: THREE.Material,
    collide = true,
    tileSize = 2.4,
  ) => {
    addWallBounds(cx - 0.09, cx - 0.006, 0, 3.7, z0, z1, westMat, false, tileSize);
    addWallBounds(cx + 0.006, cx + 0.09, 0, 3.7, z0, z1, eastMat, false, tileSize);
    if (collide) {
      colliders.push({ minX: cx - 0.09, maxX: cx + 0.09, minZ: z0, maxZ: z1 });
    }
  };

  const addDualWallEW = (
    x0: number,
    x1: number,
    cz: number,
    northMat: THREE.Material,
    southMat: THREE.Material,
    collide = true,
    tileSize = 2.4,
  ) => {
    addWallBounds(x0, x1, 0, 3.7, cz - 0.09, cz - 0.006, northMat, false, tileSize);
    addWallBounds(x0, x1, 0, 3.7, cz + 0.006, cz + 0.09, southMat, false, tileSize);
    if (collide) {
      colliders.push({ minX: x0, maxX: x1, minZ: cz - 0.09, maxZ: cz + 0.09 });
    }
  };

  /** Stacked wood-dado + plaster wall (zero coplanar faces) */
  const addDadoWallBounds = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    collide = true,
  ) => {
    addWallBounds(x0, x1, 0, 1.15, z0, z1, woodDadoMat, collide, 2.2);
    addWallBounds(x0, x1, 1.154, 3.7, z0, z1, wallMat, false, 2.6);
  };

  /** NS wall along x=[cx-0.09, cx+0.09], z=[z0, z1] with 1.06m door openings and clean 2.665..3.70 lintels */
  const addWallNSDoors = (
    cx: number,
    z0: number,
    z1: number,
    doorZs: number[],
    mat: THREE.Material = wallMat,
    tileSize = 2.6,
  ) => {
    const sorted = [...doorZs].sort((a, b) => a - b);
    let cur = z0;
    for (const dz of sorted) {
      const a = dz - 0.53;
      const b = dz + 0.53;
      if (a - cur > 0.01) addWallBounds(cx - 0.09, cx + 0.09, 0, 3.7, cur, a, mat, true, tileSize);
      addWallBounds(cx - 0.09, cx + 0.09, 2.665, 3.7, a, b, mat, false, tileSize);
      cur = b;
    }
    if (z1 - cur > 0.01) addWallBounds(cx - 0.09, cx + 0.09, 0, 3.7, cur, z1, mat, true, tileSize);
  };

  /** EW wall along z=[cz-0.09, cz+0.09], x=[x0, x1] with 1.06m door openings */
  const addWallEWDoors = (
    cz: number,
    x0: number,
    x1: number,
    doorXs: number[],
    mat: THREE.Material = wallMat,
    tileSize = 2.6,
  ) => {
    const sorted = [...doorXs].sort((a, b) => a - b);
    let cur = x0;
    for (const dx of sorted) {
      const a = dx - 0.53;
      const b = dx + 0.53;
      if (a - cur > 0.01) addWallBounds(cur, a, 0, 3.7, cz - 0.09, cz + 0.09, mat, true, tileSize);
      addWallBounds(a, b, 2.665, 3.7, cz - 0.09, cz + 0.09, mat, false, tileSize);
      cur = b;
    }
    if (x1 - cur > 0.01) addWallBounds(cur, x1, 0, 3.7, cz - 0.09, cz + 0.09, mat, true, tileSize);
  };

  /** Open archway wall (no door leaf) */
  const addArchNS = (cx: number, z0: number, z1: number, archZ: number, archW = 1.8, mat: THREE.Material = wallMat) => {
    const hw = archW * 0.5;
    addWallBounds(cx - 0.09, cx + 0.09, 0, 3.7, z0, archZ - hw, mat, true);
    addWallBounds(cx - 0.09, cx + 0.09, 2.76, 3.7, archZ - hw, archZ + hw, mat, false);
    addWallBounds(cx - 0.09, cx + 0.09, 0, 3.7, archZ + hw, z1, mat, true);
  };

  const addArchEW = (cz: number, x0: number, x1: number, archX: number, archW = 1.8, mat: THREE.Material = wallMat) => {
    const hw = archW * 0.5;
    addWallBounds(x0, archX - hw, 0, 3.7, cz - 0.09, cz + 0.09, mat, true);
    addWallBounds(archX - hw, archX + hw, 2.76, 3.7, cz - 0.09, cz + 0.09, mat, false);
    addWallBounds(archX + hw, x1, 0, 3.7, cz - 0.09, cz + 0.09, mat, true);
  };

  const addLevelBox = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    solid = false,
  ) => {
    const m = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (solid) {
      colliders.push({
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5,
      });
    }
    return m;
  };

  const addTiledSlabFloor = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    mat: THREE.Material,
    tileSize = 2.4,
  ) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const g = applyPlaneOrSlabUv(trackGeo(new THREE.BoxGeometry(w, 0.08, d)), w, d, tileSize);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) * 0.5, -0.04, (z0 + z1) * 0.5);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const addCeilingSlab = (x0: number, x1: number, z0: number, z1: number, mat: THREE.Material) =>
    addLevelBox(x1 - x0, 0.16, z1 - z0, mat, (x0 + x1) * 0.5, 3.79, (z0 + z1) * 0.5);

  const addPlaque = (
    headline: string,
    detail: string,
    pos: { x: number; y: number; z: number },
    rot: number,
    width: number,
    height: number,
    twoSided = false,
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 512, 160);
    bg.addColorStop(0, '#171914');
    bg.addColorStop(0.5, '#30291e');
    bg.addColorStop(1, '#171914');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#9a8153';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 144);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e0d2ad';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(headline, 256, 60, 462);
    ctx.fillStyle = '#b7a57f';
    ctx.font = '20px Georgia, serif';
    ctx.fillText(detail, 256, 111, 460);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0x584a31),
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    materials.push(mat);

    const backing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width + 0.14, height + 0.14, 0.1)),
      propMats.darkTrim,
    );
    backing.position.set(pos.x, pos.y, pos.z);
    backing.rotation.y = rot;
    group.add(backing);

    const faceGeo = trackGeo(new THREE.BoxGeometry(width, height, 0.018));
    const nx = Math.sin(rot);
    const nz = Math.cos(rot);
    const front = new THREE.Mesh(faceGeo, mat);
    front.position.set(pos.x + nx * 0.06, pos.y, pos.z + nz * 0.06);
    front.rotation.y = rot;
    group.add(front);

    if (twoSided) {
      const back = new THREE.Mesh(faceGeo, mat);
      back.position.set(pos.x - nx * 0.06, pos.y, pos.z - nz * 0.06);
      back.rotation.y = rot + Math.PI;
      group.add(back);
    }
  };

  const registerKey = (
    id: string,
    x: number,
    y: number,
    z: number,
    rotY: number,
    metalType: 'brass' | 'iron' = 'brass',
  ) => {
    const keyProp = createKeyPickupProp(id, propMats, new THREE.Vector3(x, y, z), rotY, metalType);
    group.add(keyProp);
    keyPickups[id] = keyProp;
  };

  // ================== GROUND FLOOR: ENTRANCE + CROSS CORRIDOR ==================
  // Threshold sill cleanly between reception floor (21.98) and exterior portico (22.26)
  addLevelBox(2.4, 0.02, 0.24, concreteFloorMat, 0, 0.008, 22.12);

  const H = 3.692;
  const Y0 = 0.004;
  const TO = 0.3;
  const TI = 0.22;
  const TA = 0.25;
  const DW = 1.06;
  const XW = -22;
  const XE = 22;
  const XA = 2.9;
  const ZA = -10.3;
  const ZHN = -6.1;
  const ZHS = -2.1;
  const ZB = 1.9;
  const ZN = -18.12;
  const ZS = 10.8;
  const LD = [-16, -10.8, -7.4];
  const RD = [7.25, 11.05, 15.8];
  const DOORS_W = [-19.5, -13.95, -8.2, -6.65];
  const DOORS_E = [6.45, 7.95, 13.9, 19.4];
  const AI = XA + TA / 2;

  const wallNS = (x: number, z0: number, z1: number, th: number) =>
    addWall(x, Y0, (z0 + z1) / 2, th, H, z1 - z0, wallMat, true);
  const wallEW = (z: number, x0: number, x1: number, th: number) =>
    addWall((x0 + x1) / 2, Y0, z, x1 - x0, H, th, wallMat, true);
  const wallEWd = (z: number, x0: number, x1: number, th: number, ds: number[]) => {
    let cur = x0;
    for (const d of ds) {
      const a = d - DW / 2;
      const b = d + DW / 2;
      if (a - cur > 0.005) wallEW(z, cur, a, th);
      addWall((a + b) / 2, 2.665, z, DW, H + Y0 - 2.665, th, wallMat, false);
      cur = b;
    }
    if (x1 - cur > 0.005) wallEW(z, cur, x1, th);
  };

  const addPlane = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    mat: THREE.Material,
    up: boolean,
  ) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const g = applyPlaneOrSlabUv(trackGeo(new THREE.PlaneGeometry(w, d)), w, d, up ? 3.2 : 2.4);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = up ? Math.PI / 2 : -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    group.add(m);
  };

  addPlane(-AI, AI, ZN - 0.12, ZS + 0.08, 0, floorMat, false);
  addPlane(XW - 0.15, -AI, ZA - 0.15, ZB + 0.15, 0, floorMat, false);
  addPlane(AI, XE + 0.15, ZA - 0.15, ZB + 0.15, 0, floorMat, false);

  addPlane(-AI, AI, ZN - 0.12, ZS, 3.715, darkCeilMat, true);
  addPlane(XW - 0.15, -AI, ZA - 0.15, ZB + 0.15, 3.715, darkCeilMat, true);
  addPlane(AI, XE + 0.15, ZA - 0.15, ZB + 0.15, 3.715, darkCeilMat, true);

  wallNS(XW, ZA - 0.15, ZB + 0.15, TO);
  wallNS(XE, ZA - 0.15, ZB + 0.15, TO);

  for (const z of [ZA, ZB]) {
    wallEW(z, XW + 0.15, -AI, TO);
    wallEW(z, AI, XE - 0.15, TO);
  }
  for (const z of [ZHN, ZHS]) {
    wallEWd(z, XW + 0.15, -AI, TI, DOORS_W);
    wallEWd(z, AI, XE - 0.15, TI, DOORS_E);
  }
  for (const x of LD.concat(RD)) {
    wallNS(x, ZA + 0.15, ZHN - 0.11, TI);
    wallNS(x, ZHS + 0.11, ZB - 0.15, TI);
  }
  for (const sx of [-1, 1]) {
    wallNS(sx * XA, ZN - 0.12, ZHN + 0.11, TA);
    wallNS(sx * XA, ZHS - 0.11, ZS - 0.09, TA);
  }

  addWall(-3.02, 0.004, 22.1, 3.96, 3.692, 0.22, wallMat, true);
  addWall(3.02, 0.004, 22.1, 3.96, 3.692, 0.22, wallMat, true);
  addWall(0, 2.665, 22.1, 2.08, 1.031, 0.2, wallMat, false);

  addWall(-3.02, 0.004, 10.8, 3.96, 3.692, 0.18, wallMat, true);
  addWall(3.02, 0.004, 10.8, 3.96, 3.692, 0.18, wallMat, true);
  addWall(0, 2.665, 10.8, 2.08, 1.031, 0.17, wallMat, false);

  addWall(-1.97, 0.004, -18.12, 1.62, 3.692, 0.24, wallMat, true);
  addWall(1.97, 0.004, -18.12, 1.62, 3.692, 0.24, wallMat, true);
  addWall(0, 3.04, -18.12, 2.32, 0.656, 0.214, wallMat, false);
  addWall(0, 0.004, -18.58, 2.5, 3.1, 0.18, propMats.darkTrim, true);

  const entranceDoors = createEntranceDoubleDoors(propMats, new THREE.Vector3(0, 0, 22.08));
  group.add(entranceDoors.group);
  doors.push(...entranceDoors.doors);

  const endDoor = createEndDoor('door-end', propMats, new THREE.Vector3(0, 0, -18.08));
  endDoor.locked = false;
  group.add(endDoor.group);
  doors.push(endDoor);

  // Ground Corridor Side Table + Inspectable Ground Memo
  addLevelBox(0.84, 0.06, 0.56, trimMat, -2.14, 0.72, 4.35, true);
  for (const dx of [-0.36, 0.36]) {
    for (const dz of [-0.22, 0.22]) {
      addLevelBox(0.06, 0.69, 0.06, trimMat, -2.14 + dx, 0.345, 4.35 + dz);
    }
  }
  group.add(createInspectableDocProp('doc-ground-memo', propMats, new THREE.Vector3(-2.14, 0.752, 4.35), 0.24));

  for (const st of [
    { id: 'stretcher-2', x: 0.86, z: -4.8, rot: -0.22, collide: true },
    { id: 'stretcher-3', x: -0.78, z: -12.6, rot: 0.09, collide: true },
    { id: 'stretcher-room-l3', x: -12.5, z: -0.2, rot: 0.65, collide: false },
    { id: 'stretcher-room-r3', x: 12.5, z: -8.2, rot: -0.45, collide: false },
  ]) {
    const m = createStretcher(st.id, propMats, new THREE.Vector3(st.x, 0, st.z), st.rot);
    group.add(m.group);
    nudgeProps.push(m);
    if (st.collide) {
      colliders.push({ minX: st.x - 0.42, maxX: st.x + 0.42, minZ: st.z - 0.96, maxZ: st.z + 0.96 });
    }
  }

  for (const ct of [
    { id: 'cart-1', x: 1.48, z: 5.3, rot: 0.42 },
    { id: 'cart-2', x: -1.46, z: -1.8, rot: -0.28 },
  ]) {
    const m = createMedicalCart(ct.id, propMats, new THREE.Vector3(ct.x, 0, ct.z), ct.rot);
    group.add(m.group);
    nudgeProps.push(m);
    colliders.push({ minX: ct.x - 0.36, maxX: ct.x + 0.36, minZ: ct.z - 0.36, maxZ: ct.z + 0.36 });
  }

  for (const ch of [
    { id: 'chair-1', x: 1.62, z: 8.6, rot: -0.7, pose: 'side' as const },
    { id: 'chair-2', x: -1.48, z: 3.1, rot: 1.9, pose: 'back' as const },
    { id: 'chair-3', x: 1.55, z: -9.3, rot: 0.3, pose: 'upright' as const },
    { id: 'chair-4', x: 1.38, z: -16.2, rot: -2.2, pose: 'side' as const },
  ]) {
    const m = createChair(ch.id, propMats, new THREE.Vector3(ch.x, 0, ch.z), ch.rot, ch.pose);
    group.add(m.group);
    nudgeProps.push(m);
    colliders.push({ minX: ch.x - 0.25, maxX: ch.x + 0.25, minZ: ch.z - 0.25, maxZ: ch.z + 0.25 });
  }

  const chartPlaneGeo = trackGeo(new THREE.PlaneGeometry(0.24, 0.32));
  [
    [0.45, 5.1, 0.4],
    [0.62, 4.82, 1.3],
    [0.22, 5.45, -0.6],
    [-0.35, 2.7, 0.9],
    [-0.58, -1.6, -1.1],
    [-0.22, -2.05, 0.35],
    [0.18, -8.4, 1.7],
    [-0.44, -12.1, -0.4],
    [0.32, -15.6, 0.85],
    [-0.25, -16.5, -1.4],
    [0.12, -17.1, 0.25],
  ].forEach(([px, pz, pr], idx) => {
    const pg = new THREE.Mesh(chartPlaneGeo, propMats.chartPaper);
    pg.rotation.x = -Math.PI / 2;
    pg.rotation.z = pr;
    pg.position.set(px, 0.015 + idx * 0.004, pz);
    group.add(pg);
  });

  addPlaque('SETOR CLÍNICO', 'TÉRREO · OESTE ← · LESTE →', { x: 0, y: 2.78, z: 5.45 }, 0, 2.92, 0.58, true);
  const hangerGeo = trackGeo(new THREE.BoxGeometry(0.022, 0.52, 0.022));
  for (const hx of [-1.02, 1.02]) {
    const h = new THREE.Mesh(hangerGeo, propMats.tarnishedBrass);
    h.position.set(hx, 3.39, 5.45);
    group.add(h);
  }
  addPlaque('O-01 · TRIAGEM', 'ALA OESTE', { x: -2.85, y: 2.48, z: -2.1 }, 0, 1.14, 0.44);
  addPlaque('L-01 · EXAMES', 'ALA LESTE', { x: 2.85, y: 2.48, z: -2.1 }, 0, 1.14, 0.44);
  addPlaque('O-02 · CURATIVOS', 'ALA OESTE', { x: -2.85, y: 2.48, z: -6.1 }, Math.PI, 1.14, 0.44);
  addPlaque('L-02 · RADIOLOGIA', 'ALA LESTE', { x: 2.85, y: 2.48, z: -6.1 }, Math.PI, 1.14, 0.44);
  addPlaque('ESCADA · 1º ANDAR', 'SETOR DE TRATAMENTO', { x: 0, y: 3.34, z: -17.92 }, 0, 2.52, 0.44);

  const crackGeo = trackGeo(new THREE.PlaneGeometry(1.75, 2.05));
  for (const cr of [
    { x: -2.74, y: 1.95, z: 5.8, ry: Math.PI / 2, rz: 0.04 },
    { x: 2.74, y: 2.15, z: 9.2, ry: -Math.PI / 2, rz: -0.06 },
    { x: -2.74, y: 1.75, z: 2.5, ry: Math.PI / 2, rz: 0.12 },
    { x: 2.74, y: 2.12, z: -11.9, ry: -Math.PI / 2, rz: 0.05 },
  ]) {
    const m = new THREE.Mesh(crackGeo, propMats.wallCrackDecal);
    m.position.set(cr.x, cr.y, cr.z);
    m.rotation.set(0, cr.ry, cr.rz);
    m.raycast = () => {};
    group.add(m);
  }

  const scratchGeo = trackGeo(new THREE.PlaneGeometry(0.85, 1.05));
  for (const sc of [
    { x: -1.32, y: 1.28, z: -17.96, ry: 0, rz: 0.08 },
    { x: 1.32, y: 1.18, z: -17.96, ry: 0, rz: -0.12 },
  ]) {
    const m = new THREE.Mesh(scratchGeo, propMats.scratchDecal);
    m.position.set(sc.x, sc.y, sc.z);
    m.rotation.set(0, sc.ry, sc.rz);
    m.raycast = () => {};
    group.add(m);
  }

  const pipeVertGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 2.65, 6));
  const pipeHorizGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.09, 25));
  for (const side of [-1, 1]) {
    for (const pz of [9.8, 1.1, -6.1, -13.4]) {
      const p = new THREE.Mesh(pipeVertGeo, propMats.rustedMetal);
      p.position.set(side * 2.7, 1.78, pz);
      group.add(p);
    }
    const hp = new THREE.Mesh(pipeHorizGeo, propMats.rustedMetal);
    hp.position.set(side * 2.68, 3.36, -2.9);
    group.add(hp);
  }

  // ================== 1º ANDAR (ZERO-OVERLAP WALLS & CLEAN SPLIT FINISHES) ==================
  // Galeria da Escadaria: x[-2.4..2.4], z[-30.5..-21.2]
  addTiledSlabFloor(-2.4, 2.4, -30.5, -21.2, floorMat);
  addCeilingSlab(-2.4, 2.4, -30.5, -21.2, ceilingMat);

  addWallBounds(-2.31, -2.14, 0, 3.7, -21.29, -21.11, wallMat, true);
  addWallBounds(-0.34, 0.34, 0, 3.7, -21.29, -21.11, wallMat, true);
  addWallBounds(2.14, 2.31, 0, 3.7, -21.29, -21.11, wallMat, true);
  addWallBounds(-2.14, 2.14, 2.98, 3.7, -21.29, -21.11, wallMat, false);
  addWallBounds(-2.3, 2.3, 0, 3.1, -20.91, -20.73, propMats.darkTrim, true);

  const returnDoor = createStairwellPortalDoor('door-floor-return', propMats, new THREE.Vector3(-1.24, 0, -21.2), 1.52, 2.42, 0);
  returnDoor.locked = false;
  group.add(returnDoor.group);
  colliders.push({ minX: -2.14, maxX: -0.34, minZ: -21.38, maxZ: -21.02 });
  addPlaque('ESCADA · TÉRREO', 'RETORNO [E]', { x: -1.24, y: 3.34, z: -21.34 }, Math.PI, 1.66, 0.42);

  const mezPortal = createStairwellPortalDoor('door-mezanino-enter', propMats, new THREE.Vector3(1.24, 0, -21.2), 1.52, 2.42, 0);
  mezPortal.locked = false;
  group.add(mezPortal.group);
  colliders.push({ minX: 0.34, maxX: 2.14, minZ: -21.38, maxZ: -21.02 });
  addPlaque('MEZANINO · RECEPÇÃO', 'GALERIA SUPERIOR [E]', { x: 1.24, y: 3.34, z: -21.34 }, Math.PI, 1.88, 0.42);

  // Sala 1 — Hidroterapia (Oeste Sul): x[-11.6..-2.4], z[-30.5..-21.2]
  addTiledSlabFloor(-11.6, -2.4, -30.5, -21.2, propMats.wardTileFloor, 2.2);
  addCeilingSlab(-11.6, -2.4, -30.5, -21.2, darkCeilMat);
  // Direct hydro tile walls on West & South (no thin veneer!)
  addWallBounds(-11.7, -11.5, 0, 3.7, -30.59, -21.11, propMats.hydroTileWall, true, 2.4);
  addWallBounds(-11.5, -2.31, 0, 3.7, -21.29, -21.11, propMats.hydroTileWall, true, 2.4);
  // Split North wall between Hidroterapia (south side) & Enfermaria (north side)
  addDualWallEW(-11.5, -2.49, -30.5, wallMat, propMats.hydroTileWall, true, 2.4);
  // Split East wall x = -2.4 between Hidroterapia & Galeria (open 1.8m arch at z=-25.6)
  addDualWallNS(-2.4, -24.7, -21.29, propMats.hydroTileWall, wallMat, true, 2.4);
  addDualWallNS(-2.4, -30.41, -26.5, propMats.hydroTileWall, wallMat, true, 2.4);
  addWallBounds(-2.49, -2.31, 2.74, 3.7, -26.5, -24.7, wallMat, false);
  addPlaque('HIDROTERAPIA', 'BANHOS DE IMERSÃO', { x: -2.24, y: 2.96, z: -25.6 }, Math.PI / 2, 1.8, 0.4);

  const makeHydroTub = (tx: number, tz: number) => {
    addLevelBox(2.1, 0.12, 1.05, porcelainMat, tx, 0.06, tz, true);
    addLevelBox(2.1, 0.62, 0.12, porcelainMat, tx, 0.43, tz - 0.465);
    addLevelBox(2.1, 0.62, 0.12, porcelainMat, tx, 0.43, tz + 0.465);
    addLevelBox(0.12, 0.62, 0.81, porcelainMat, tx - 0.99, 0.43, tz);
    addLevelBox(0.12, 0.62, 0.81, porcelainMat, tx + 0.99, 0.43, tz);
    addLevelBox(1.84, 0.04, 0.79, waterMat, tx, 0.56, tz);
    addLevelBox(0.06, 1.95, 0.06, propMats.tarnishedBrass, tx - 1.02, 1.08, tz);
    addLevelBox(0.32, 0.06, 0.06, propMats.tarnishedBrass, tx - 0.84, 2.02, tz);
    addLevelBox(0.14, 0.05, 0.14, propMats.tarnishedBrass, tx - 0.72, 1.97, tz);
    addLevelBox(0.38, 0.015, 0.38, propMats.rustedMetal, tx + 1.45, 0.008, tz);
  };
  makeHydroTub(-7.8, -23.6);
  makeHydroTub(-7.8, -27.8);

  addLevelBox(1.65, 0.07, 0.54, trimMat, -4.6, 0.48, -22.4, true);
  for (const dx of [-0.68, 0.68]) {
    addLevelBox(0.08, 0.44, 0.46, trimMat, -4.6 + dx, 0.22, -22.4);
  }
  addLevelBox(0.42, 0.09, 0.34, propMats.stainedCanvas, -5.05, 0.56, -22.4);
  group.add(createInspectableDocProp('doc-hydro-protocol', propMats, new THREE.Vector3(-4.25, 0.52, -22.4), -0.32));

  // Sala 2 — Posto de Enfermagem & Boticário (Leste Sul): x[2.4..11.6], z[-30.5..-21.2]
  addTiledSlabFloor(2.4, 11.6, -30.5, -21.2, floorMat);
  addCeilingSlab(2.4, 11.6, -30.5, -21.2, ceilingMat);
  addWallBounds(11.5, 11.7, 0, 3.7, -30.59, -21.11, wallMat, true);
  addWallBounds(2.31, 11.5, 0, 3.7, -21.29, -21.11, wallMat, true);
  addWallBounds(2.49, 11.5, 0, 3.7, -30.59, -30.41, wallMat, true);

  // Shared wall x = 2.4: Observation glass + door at z = -25.6
  addWallBounds(2.31, 2.49, 0, 3.7, -21.9, -21.29, wallMat, true);
  addWallBounds(2.31, 2.49, 0, 1.12, -24.1, -21.9, wallMat, true);
  addWallBounds(2.31, 2.49, 2.4, 3.7, -24.1, -21.9, wallMat, false);
  const obsPane = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 1.24, 2.12)), propMats.transomGlass);
  obsPane.position.set(2.4, 1.76, -23.0);
  group.add(obsPane);
  for (const mz of [-23.5, -22.5]) {
    addLevelBox(0.08, 1.28, 0.05, propMats.darkTrim, 2.4, 1.76, mz);
  }
  addWallBounds(2.31, 2.49, 0, 3.7, -25.07, -24.1, wallMat, true);
  addWallBounds(2.31, 2.49, 2.665, 3.7, -26.13, -25.07, wallMat, false);
  addWallBounds(2.31, 2.49, 0, 3.7, -30.41, -26.13, wallMat, true);

  const nurseDoor = createSingleDoor('door-1st-nurse', propMats, 0, -1, new THREE.Vector3(2.4, 0, -25.6), -Math.PI / 2);
  group.add(nurseDoor.group);
  doors.push(nurseDoor);
  addPlaque('POSTO DE ENFERMAGEM', 'BOTICÁRIO & RONDA', { x: 2.24, y: 2.96, z: -25.6 }, -Math.PI / 2, 1.9, 0.4);

  addLevelBox(3.1, 0.88, 0.78, trimMat, 5.1, 0.44, -22.9, true);
  addLevelBox(3.22, 0.07, 0.88, propMats.weatheredWood, 5.1, 0.915, -22.9);
  addLevelBox(0.78, 0.88, 2.3, trimMat, 6.26, 0.44, -24.44, true);
  addLevelBox(0.88, 0.07, 2.4, propMats.weatheredWood, 6.26, 0.915, -24.44);
  addLevelBox(0.18, 0.04, 0.18, propMats.tarnishedBrass, 4.15, 0.97, -22.85);
  addLevelBox(0.04, 0.28, 0.04, propMats.tarnishedBrass, 4.15, 1.13, -22.85);
  addLevelBox(0.24, 0.11, 0.14, coldBulbMat, 4.18, 1.29, -22.85);
  group.add(createInspectableDocProp('doc-nurse-log', propMats, new THREE.Vector3(5.05, 0.955, -22.85), 0.22));

  addLevelBox(0.68, 2.25, 2.8, propMats.darkTrim, 10.95, 1.125, -25.4, true);
  for (const shelfY of [0.85, 1.32, 1.78]) {
    addLevelBox(0.62, 0.04, 2.64, propMats.weatheredWood, 10.9, shelfY, -25.4);
    for (let b = -2; b <= 2; b++) {
      const bottle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.042, 0.18, 7)), propMats.amberBottle);
      bottle.position.set(10.8, shelfY + 0.11, -25.4 + b * 0.42);
      group.add(bottle);
    }
  }
  const cartNurse = createMedicalCart('cart-1st-nurse', propMats, new THREE.Vector3(8.4, 0, -28.3), 0.36);
  group.add(cartNurse.group);
  nudgeProps.push(cartNurse);
  colliders.push({ minX: 8.04, maxX: 8.76, minZ: -28.66, maxZ: -27.94 });

  // Corredor Clínico Central (1º Andar): x[-2.0..2.0], z[-45.7..-30.5]
  addTiledSlabFloor(-2.0, 2.0, -45.7, -30.5, floorMat);
  addCeilingSlab(-2.0, 2.0, -45.7, -30.5, darkCeilMat);
  addWallBounds(-2.49, -1.91, 0, 3.7, -30.59, -30.41, wallMat, true);
  addWallBounds(1.91, 2.49, 0, 3.7, -30.59, -30.41, wallMat, true);
  addWallBounds(-1.91, 1.91, 2.86, 3.7, -30.59, -30.41, wallMat, false);
  addPlaque('ALA CLÍNICA · 1º ANDAR', 'ENFERMARIA ← · → ELETROTERAPIA', { x: 0, y: 3.16, z: -30.38 }, 0, 2.75, 0.44, true);

  // Sala 3 — Enfermaria Santa Clara (Oeste Centro): x[-11.8..-2.0], z[-45.7..-30.5]
  addTiledSlabFloor(-11.8, -2.0, -45.7, -30.5, propMats.wardTileFloor, 2.2);
  addCeilingSlab(-11.8, -2.0, -45.7, -30.5, ceilingMat);
  addWallBounds(-11.9, -11.7, 0, 3.7, -45.79, -30.41, wallMat, true);
  addWallBounds(-11.7, -2.09, 0, 3.7, -45.79, -45.61, wallMat, true);
  addArchNS(-2.0, -45.61, -30.59, -38.1, 1.8);
  addPlaque('ENFERMARIA SANTA CLARA', 'LEITOS DE OBSERVAÇÃO 01–04', { x: -1.84, y: 3.0, z: -38.1 }, Math.PI / 2, 2.1, 0.42);

  for (const wz of [-34.6, -41.6]) {
    addLevelBox(0.06, 1.9, 1.5, propMats.sealedGlass, -11.62, 1.82, wz);
    addLevelBox(0.1, 0.1, 1.66, propMats.darkTrim, -11.6, 2.8, wz);
    addLevelBox(0.1, 0.1, 1.66, propMats.darkTrim, -11.6, 0.84, wz);
    addLevelBox(0.09, 1.9, 0.06, propMats.darkTrim, -11.6, 1.82, wz);
    addLevelBox(0.09, 0.06, 1.5, propMats.darkTrim, -11.6, 1.82, wz);
  }

  const makeWardBed = (bx: number, bz: number) => {
    addLevelBox(2.2, 0.1, 1.04, propMats.rustedMetal, bx, 0.34, bz, true);
    addLevelBox(2.04, 0.2, 0.91, linenMat, bx, 0.49, bz);
    addLevelBox(0.9, 0.045, 0.85, propMats.stainedCanvas, bx + 0.38, 0.612, bz);
    addLevelBox(0.34, 0.14, 0.56, linenMat, bx - 0.78, 0.62, bz);
    addLevelBox(0.08, 0.92, 1.02, trimMat, bx - 1.12, 0.84, bz);
  };
  for (const bz of [-33.0, -36.4, -39.8, -43.2]) makeWardBed(-9.4, bz);
  for (const cz of [-34.7, -41.5]) {
    addLevelBox(2.1, 1.78, 0.05, propMats.stainedCanvas, -9.4, 1.48, cz);
    addLevelBox(2.24, 0.04, 0.04, propMats.rustedMetal, -9.4, 2.42, cz);
  }
  addLevelBox(0.56, 0.68, 0.58, trimMat, -9.85, 0.34, -38.1, true);
  group.add(createInspectableDocProp('doc-ward-diary', propMats, new THREE.Vector3(-9.82, 0.695, -38.1), 0.18));
  for (const iz of [-33.7, -42.5]) {
    addLevelBox(0.04, 1.88, 0.04, propMats.rustedMetal, -8.35, 0.94, iz);
    addLevelBox(0.36, 0.04, 0.36, propMats.rustedMetal, -8.35, 0.04, iz);
    addLevelBox(0.32, 0.04, 0.04, propMats.rustedMetal, -8.35, 1.88, iz);
  }

  // Sala 4 — Consultório & Eletroterapia (Leste Centro): x[2.0..11.8], z[-45.7..-30.5]
  // Uses stacked dado+wall on outer East & North walls (ZERO Z-fighting veneers!)
  addTiledSlabFloor(2.0, 11.8, -45.7, -30.5, floorMat);
  addCeilingSlab(2.0, 11.8, -45.7, -30.5, darkCeilMat);
  addDadoWallBounds(11.7, 11.9, -45.61, -30.41, true);
  addDadoWallBounds(2.09, 11.7, -45.79, -45.61, true);
  addArchNS(2.0, -45.61, -30.59, -38.1, 1.8);
  addPlaque('ELETROTERAPIA', 'CONSULTÓRIO DR. BLACKWOOD', { x: 1.84, y: 3.0, z: -38.1 }, -Math.PI / 2, 2.1, 0.42);

  addLevelBox(1.5, 0.08, 1.5, propMats.rustedMetal, 6.2, 0.04, -38.1, true);
  addLevelBox(0.78, 0.14, 0.74, trimMat, 6.2, 0.48, -38.1);
  addLevelBox(0.12, 0.92, 0.72, trimMat, 6.56, 0.92, -38.1);
  addLevelBox(0.68, 0.12, 0.08, propMats.leatherStrap, 6.2, 0.6, -37.76);
  addLevelBox(0.68, 0.12, 0.08, propMats.leatherStrap, 6.2, 0.6, -38.44);
  for (const sz of [-37.72, -38.48]) {
    addLevelBox(0.64, 0.08, 0.1, propMats.weatheredWood, 6.2, 0.74, sz);
  }
  const crown = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.16, 0.02, 6, 12)), propMats.tarnishedBrass);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(6.42, 1.48, -38.1);
  group.add(crown);

  addLevelBox(0.85, 1.45, 0.62, propMats.darkTrim, 7.7, 0.725, -39.6, true);
  addLevelBox(0.32, 0.24, 0.04, propMats.stairwellGlowGlass, 7.7, 1.15, -39.28);
  addLevelBox(0.08, 0.18, 0.08, propMats.tarnishedBrass, 7.45, 1.54, -39.6);
  addLevelBox(0.08, 0.18, 0.08, propMats.tarnishedBrass, 7.95, 1.54, -39.6);
  addLevelBox(0.04, 0.04, 1.6, propMats.leatherStrap, 7.1, 0.06, -38.8);

  addLevelBox(1.85, 0.76, 0.88, propMats.darkTrim, 9.2, 0.38, -33.2, true);
  addLevelBox(1.96, 0.07, 0.96, propMats.doorWood, 9.2, 0.795, -33.2);
  addLevelBox(0.62, 1.88, 0.62, propMats.rustedMetal, 11.1, 0.94, -43.2, true);
  const electroChair = createChair('chair-electro-doc', propMats, new THREE.Vector3(9.2, 0, -32.1), Math.PI, 'upright');
  group.add(electroChair.group);
  nudgeProps.push(electroChair);
  group.add(createInspectableDocProp('doc-electro-report', propMats, new THREE.Vector3(9.05, 0.835, -33.2), -0.26));

  // Corredor Norte (1º Andar): x[-2.0..2.0], z[-57.15..-45.7]
  addTiledSlabFloor(-2.0, 2.0, -57.15, -45.7, concreteFloorMat, 2.6);
  addCeilingSlab(-2.0, 2.0, -57.15, -45.7, darkCeilMat);
  addWallBounds(-1.91, 1.91, 2.86, 3.7, -45.79, -45.61, wallMat, false);
  addPlaque('ALA NORTE · RESTRITA', 'ARQUIVO MORTO ← · → ISOLAMENTO', { x: 0, y: 3.16, z: -45.58 }, 0, 2.8, 0.42, true);

  // Sala 5 — Arquivo Morto (Oeste Norte): x[-10.5..-2.0], z[-55.4..-45.7]
  addTiledSlabFloor(-10.5, -2.0, -55.4, -45.7, concreteFloorMat, 2.6);
  addCeilingSlab(-10.5, -2.0, -55.4, -45.7, darkCeilMat);
  addWallBounds(-10.6, -10.4, 0, 3.7, -55.49, -45.79, wallMat, true);
  addWallBounds(-10.4, -2.09, 0, 3.7, -55.49, -55.31, wallMat, true);
  addArchNS(-2.0, -55.49, -45.79, -50.4, 1.6);
  addWallBounds(-2.09, -1.91, 0, 3.7, -57.15, -55.49, wallMat, true);
  addPlaque('ARQUIVO MORTO', 'PRONTUÁRIOS & CÂMARA ESCURA', { x: -1.84, y: 2.98, z: -50.4 }, Math.PI / 2, 2.0, 0.42);

  for (const rx of [-8.8, -6.5]) {
    for (const rz of [-48.2, -52.8]) {
      addLevelBox(0.75, 2.2, 2.6, propMats.rustedMetal, rx, 1.1, rz, true);
      for (const boxY of [0.6, 1.25, 1.85]) {
        addLevelBox(0.55, 0.28, 0.45, propMats.stainedCanvas, rx, boxY, rz - 0.65);
        addLevelBox(0.55, 0.28, 0.45, trimMat, rx, boxY, rz + 0.55);
      }
    }
  }
  addLevelBox(1.65, 0.74, 0.85, trimMat, -4.1, 0.37, -53.2, true);
  addLevelBox(0.22, 0.08, 0.22, propMats.rustedMetal, -4.6, 0.78, -53.35);
  const darkBulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 6)), redBulbMat);
  darkBulb.position.set(-4.6, 0.92, -53.35);
  group.add(darkBulb);
  group.add(createInspectableDocProp('doc-archive-list', propMats, new THREE.Vector3(-3.9, 0.755, -53.15), 0.34));

  // Sala 6 — Cela de Isolamento Acolchoada (Leste Norte): x[2.0..10.5], z[-55.4..-45.7]
  // Direct paddedCellWall outer walls + split interior wall (ZERO floating veneers!)
  addTiledSlabFloor(2.0, 10.5, -55.4, -45.7, concreteFloorMat, 2.6);
  addCeilingSlab(2.0, 10.5, -55.4, -45.7, darkCeilMat);
  addWallBounds(10.4, 10.6, 0, 3.7, -55.49, -45.79, propMats.paddedCellWall, true, 2.0);
  addWallBounds(2.09, 10.4, 0, 3.7, -55.49, -55.31, propMats.paddedCellWall, true, 2.0);
  addDualWallEW(2.09, 10.4, -45.7, propMats.paddedCellWall, wallMat, true, 2.0);
  addDualWallNS(2.0, -49.87, -45.79, wallMat, propMats.paddedCellWall, true, 2.0);
  addWallBounds(1.91, 2.09, 2.665, 3.7, -50.93, -49.87, wallMat, false);
  addDualWallNS(2.0, -55.49, -50.93, wallMat, propMats.paddedCellWall, true, 2.0);
  addWallBounds(1.91, 2.09, 0, 3.7, -57.15, -55.49, wallMat, true);

  const isolationDoor = createSingleDoor('door-1st-isolation', propMats, 0, -1, new THREE.Vector3(2.0, 0, -50.4), -Math.PI / 2);
  group.add(isolationDoor.group);
  doors.push(isolationDoor);
  addPlaque('CELA DE ISOLAMENTO 47', 'ACOLCHOADA · ACESSO RESTRITO', { x: 1.84, y: 2.98, z: -50.4 }, -Math.PI / 2, 2.05, 0.42);

  addLevelBox(1.18, 0.34, 2.25, propMats.rustedMetal, 7.6, 0.17, -52.8, true);
  addLevelBox(1.04, 0.16, 2.06, propMats.stainedCanvas, 7.6, 0.42, -52.8);
  for (const sz of [-53.3, -52.3]) {
    addLevelBox(1.08, 0.04, 0.08, propMats.leatherStrap, 7.6, 0.52, sz);
  }
  group.add(createInspectableDocProp('doc-isolation-note', propMats, new THREE.Vector3(7.55, 0.515, -52.55), -0.38));

  for (const sc of [
    { x: 10.32, y: 1.38, z: -53.2, ry: -Math.PI / 2, rz: 0.11 },
    { x: 8.6, y: 1.24, z: -55.24, ry: 0, rz: -0.09 },
  ]) {
    const m = new THREE.Mesh(scratchGeo, propMats.scratchDecal);
    m.position.set(sc.x, sc.y, sc.z);
    m.rotation.set(0, sc.ry, sc.rz);
    m.raycast = () => {};
    group.add(m);
  }

  // ================== 2º ANDAR — COMPLEXO EM ANEL DUPLO (x[-15.6..15.6], z[-82.15..-58.15]) ==================
  // Corridors & Rooms (partitioned slabs, zero overlap)
  addTiledSlabFloor(-3.6, 3.6, -63.0, -58.15, floorMat); // Hall da Escadaria 2F
  addTiledSlabFloor(-10.8, 10.8, -65.6, -63.0, floorMat); // Corredor Transversal Sul
  addTiledSlabFloor(-10.8, -8.4, -79.4, -65.6, floorMat); // Corredor Oeste
  addTiledSlabFloor(8.4, 10.8, -79.4, -65.6, floorMat); // Corredor Leste
  addTiledSlabFloor(-1.8, 1.8, -82.15, -65.6, floorMat); // Corredor Central Norte
  addTiledSlabFloor(-10.8, -1.8, -79.4, -76.8, floorMat); // Corredor Transversal Norte Oeste
  addTiledSlabFloor(1.8, 10.8, -79.4, -76.8, floorMat); // Corredor Transversal Norte Leste

  // 2F Room Floors
  addTiledSlabFloor(-15.6, -3.6, -63.0, -58.15, propMats.wardTileFloor, 2.2); // Ambulatório + Raio-X
  addTiledSlabFloor(-15.6, -10.8, -65.6, -63.0, propMats.wardTileFloor, 2.2);
  addTiledSlabFloor(3.6, 15.6, -63.0, -58.15, floorMat); // Sala de Reuniões Médicas
  addTiledSlabFloor(10.8, 15.6, -65.6, -63.0, floorMat);
  addTiledSlabFloor(-15.6, -10.8, -76.8, -65.6, floorMat); // Farmácia & Manipulação
  addTiledSlabFloor(-8.4, -1.8, -76.8, -65.6, propMats.wardTileFloor, 2.2); // Ala de Tratamento
  addTiledSlabFloor(1.8, 8.4, -71.2, -65.6, floorMat); // Diretoria
  addTiledSlabFloor(1.8, 8.4, -76.8, -71.2, propMats.wardTileFloor, 2.2); // Observação
  addTiledSlabFloor(10.8, 15.6, -76.8, -65.6, concreteFloorMat, 2.5); // Sala de Vigilância
  addTiledSlabFloor(-15.6, -1.8, -82.15, -79.4, concreteFloorMat, 2.4); // Lavanderia NW
  addTiledSlabFloor(1.8, 15.6, -82.15, -79.4, propMats.wardTileFloor, 2.2); // Copa dos Enfermeiros NE

  // 2F Ceiling (single clean roof span over entire 31.2m x 24m floor)
  addCeilingSlab(-15.7, 15.7, -82.25, -58.05, ceilingMat);

  // Corridor Carpets (cleanly non-overlapping, polygonOffset runnerMat)
  addLevelBox(1.8, 0.012, 4.4, runnerMat, 0, 0.008, -60.5, false); // Hall
  addLevelBox(19.2, 0.012, 1.2, runnerMat, 0, 0.008, -64.3, false); // Corredor Sul
  addLevelBox(1.1, 0.012, 13.0, runnerMat, -9.6, 0.008, -71.5, false); // Corredor Oeste
  addLevelBox(1.1, 0.012, 13.0, runnerMat, 9.6, 0.008, -71.5, false); // Corredor Leste
  addLevelBox(1.2, 0.012, 14.8, runnerMat, 0, 0.008, -73.8, false); // Corredor Central

  // Outer Perimeter Walls 2F (x = +/-15.6, z = -58.15 & -82.15)
  addWallBounds(-15.7, -15.5, 0, 3.7, -82.05, -58.25, wallMat, true);
  addWallBounds(15.5, 15.7, 0, 3.7, -82.05, -58.25, wallMat, true);
  // South & North Perimeters with stairwell openings x[-1.5..1.5]
  for (const wz of [-58.15, -82.15]) {
    addWallBounds(-15.7, -1.5, 0, 3.7, wz - 0.1, wz + 0.1, wallMat, true);
    addWallBounds(1.5, 15.7, 0, 3.7, wz - 0.1, wz + 0.1, wallMat, true);
    addWallBounds(-1.5, 1.5, 3.22, 3.7, wz - 0.1, wz + 0.1, wallMat, false);
  }

  // Hall 2F Lateral Walls (x = +/-3.6, z[-62.91..-58.25]) & North Arch into Corredor Sul (z = -63.0)
  addWallBounds(-3.69, -3.51, 0, 3.7, -62.91, -58.25, wallMat, true);
  addWallBounds(3.51, 3.69, 0, 3.7, -62.91, -58.25, wallMat, true);
  addArchEW(-63.0, -3.51, 3.51, 0, 2.4);

  // South Cross Corridor Walls:
  // North face of Ambulatório (-15.5..-3.69, door at x=-6.8) & Sala de Reuniões (3.69..15.5, door at x=6.8)
  addWallEWDoors(-63.0, -10.89, -3.69, [-6.8]);
  addWallBounds(-15.5, -10.89, 0, 3.7, -65.69, -65.51, wallMat, true); // West alcove north border
  addArchNS(-10.8, -65.51, -63.09, -64.3, 1.8); // Open arch into Raio-X alcove? No, wait: west corridor turns north at x[-10.8..-8.4]!
  // Wait: [-10.8..-8.4] is Corredor Oeste! So x=-10.8 separates Corredor Sul (z[-65.6..-63.0]) from Raio-X Alcove (x[-15.5..-10.8])!
  // Keeping Ambulatório Alcove connected to Ambulatório internally at z=-63.0 (x[-15.5..-10.89]) with no wall at z=-63.0 west of -10.89 gives Ambulatório an L-shape!
  addWallEWDoors(-63.0, 3.69, 10.89, [6.8]);
  addWallBounds(10.89, 15.5, 0, 3.7, -65.69, -65.51, wallMat, true);
  // Internal divider inside Ambulatório for Raio-X dark nook (x = -10.8, open arch at z=-60.6)
  addArchNS(-10.8, -63.0, -58.25, -60.6, 1.8);

  // North wall of Corredor Transversal Sul (z = -65.6):
  // West block x[-8.4..-1.8] (solid south face of Tratamento), Central Arch x[-1.8..1.8], East block x[1.8..8.4] (solid south face of Diretoria)
  addWallBounds(-8.31, -1.89, 0, 3.7, -65.69, -65.51, wallMat, true);
  addArchEW(-65.6, -1.89, 1.89, 0, 2.2);
  addWallBounds(1.89, 8.31, 0, 3.7, -65.69, -65.51, wallMat, true);

  // Corredor Oeste walls (x = -10.8 & x = -8.4, z[-76.8..-65.6]):
  addWallNSDoors(-10.8, -76.71, -65.69, [-70.6]); // Farmácia door
  addWallNSDoors(-8.4, -76.71, -65.69, [-71.2]); // Tratamento W door

  // Corredor Leste walls (x = 8.4 & x = 10.8, z[-76.8..-65.6]):
  addWallNSDoors(8.4, -76.71, -65.69, [-68.4, -74.0]); // Diretoria (-68.4) & Observação (-74.0)
  // East wall x=10.8 has Sala de Vigilância door (-71.2) + observation window (-68.4)
  addWallBounds(10.71, 10.89, 0, 3.7, -67.3, -65.69, wallMat, true);
  addWallBounds(10.71, 10.89, 0, 1.15, -69.5, -67.3, wallMat, true);
  addWallBounds(10.71, 10.89, 2.35, 3.7, -69.5, -67.3, wallMat, false);
  const vigGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 1.2, 2.16)), propMats.transomGlass);
  vigGlass.position.set(10.8, 1.75, -68.4);
  group.add(vigGlass);
  addWallNSDoors(10.8, -76.71, -69.5, [-71.2]);

  // Central Corridor walls (x = -1.8 & x = 1.8, z[-76.71..-65.69]):
  addWallNSDoors(-1.8, -76.71, -65.69, [-71.2]); // Tratamento Central door
  addWallNSDoors(1.8, -76.71, -65.69, [-74.0]); // Observação Central door

  // Divider between Diretoria (south) & Observação (north) at z = -71.2 (One-way shortcut door at x = 5.1)
  addWallEWDoors(-71.2, 1.89, 8.31, [5.1]);

  // Corredor Transversal Norte (z = -76.8 south border, z = -79.4 north border):
  addWallBounds(-15.5, -10.89, 0, 3.7, -76.89, -76.71, wallMat, true); // Farmácia north wall
  addWallBounds(-8.31, -1.89, 0, 3.7, -76.89, -76.71, wallMat, true); // Tratamento north wall
  addWallBounds(1.89, 8.31, 0, 3.7, -76.89, -76.71, wallMat, true); // Observação north wall
  addWallBounds(10.89, 15.5, 0, 3.7, -76.89, -76.71, wallMat, true); // Vigilância north wall
  // North Cross to Lavanderia NW & Copa NE (open archways at x = -6.4 and x = 6.4)
  addArchEW(-79.4, -15.5, -1.89, -6.4, 2.0);
  addArchEW(-79.4, 1.89, 15.5, 6.4, 2.0);
  // Central stairwell walls north of z = -79.4
  addWallBounds(-1.89, -1.71, 0, 3.7, -82.05, -79.49, wallMat, true);
  addWallBounds(1.71, 1.89, 0, 3.7, -82.05, -79.49, wallMat, true);

  // 2F Doors & Plaques
  const doorAmb = createSingleDoor('door-2f-ambulatorio', propMats, 0, -1, new THREE.Vector3(-6.8, 0, -63.0), 0);
  group.add(doorAmb.group);
  doors.push(doorAmb);
  addPlaque('AMBULATÓRIO · RAIO-X', 'CONSULTAS CLÍNICAS', { x: -6.8, y: 2.98, z: -63.16 }, Math.PI, 2.0, 0.38);

  const doorReunioes = createSingleDoor('door-2f-reunioes', propMats, 0, 1, new THREE.Vector3(6.8, 0, -63.0), 0);
  group.add(doorReunioes.group);
  doors.push(doorReunioes);
  addPlaque('SALA DE REUNIÕES', 'JUNTA MÉDICA', { x: 6.8, y: 2.98, z: -63.16 }, Math.PI, 1.9, 0.38);

  const doorFarm = createSingleDoor('door-2f-farmacia', propMats, 0, -1, new THREE.Vector3(-10.8, 0, -70.6), -Math.PI / 2);
  doorFarm.locked = true;
  doorFarm.requiredKeyId = 'key-farmacia';
  doorFarm.requiredKeyName = BLACKWOOD_KEYS['key-farmacia'].name;
  group.add(doorFarm.group);
  doors.push(doorFarm);
  addPlaque('FARMÁCIA & BOTICÁRIO', 'ACESSO COM CHAVE', { x: -10.64, y: 2.98, z: -70.6 }, Math.PI / 2, 1.9, 0.38);

  const doorTratW = createSingleDoor('door-2f-tratamento-w', propMats, 0, 1, new THREE.Vector3(-8.4, 0, -71.2), Math.PI / 2);
  group.add(doorTratW.group);
  doors.push(doorTratW);

  const doorTratC = createSingleDoor('door-2f-tratamento-c', propMats, 0, -1, new THREE.Vector3(-1.8, 0, -71.2), -Math.PI / 2);
  group.add(doorTratC.group);
  doors.push(doorTratC);
  addPlaque('ALA DE TRATAMENTO', 'LEITOS 05–08', { x: -1.64, y: 2.98, z: -71.2 }, Math.PI / 2, 1.8, 0.38);

  const doorDir = createSingleDoor('door-2f-diretoria', propMats, 0, -1, new THREE.Vector3(8.4, 0, -68.4), Math.PI / 2);
  doorDir.locked = true;
  doorDir.requiredKeyId = 'key-diretoria';
  doorDir.requiredKeyName = BLACKWOOD_KEYS['key-diretoria'].name;
  group.add(doorDir.group);
  doors.push(doorDir);
  addPlaque('DIRETORIA', 'GABINETE DR. BLACKWOOD', { x: 8.56, y: 2.98, z: -68.4 }, Math.PI / 2, 1.95, 0.38);

  const doorObs = createSingleDoor('door-2f-observacao', propMats, 0, 1, new THREE.Vector3(8.4, 0, -74.0), Math.PI / 2);
  group.add(doorObs.group);
  doors.push(doorObs);

  const doorObsC = createSingleDoor('door-2f-obs-c', propMats, 0, -1, new THREE.Vector3(1.8, 0, -74.0), Math.PI / 2);
  group.add(doorObsC.group);
  doors.push(doorObsC);
  addPlaque('OBSERVAÇÃO', 'LEITOS 09–12', { x: 1.64, y: 2.98, z: -74.0 }, -Math.PI / 2, 1.75, 0.38);

  const doorVig = createSingleDoor('door-2f-vigilancia', propMats, 0, -1, new THREE.Vector3(10.8, 0, -71.2), Math.PI / 2);
  group.add(doorVig.group);
  doors.push(doorVig);
  addPlaque('VIGILÂNCIA & ARQUIVOS', 'CONTROLE DO PAVIMENTO', { x: 10.64, y: 2.98, z: -71.2 }, -Math.PI / 2, 1.9, 0.38);

  const door2fShortcut = createSingleDoor('door-2f-atalho', propMats, 0, 1, new THREE.Vector3(5.1, 0, -71.2), 0);
  door2fShortcut.locked = true;
  door2fShortcut.oneWayUnlockSide = 'south';
  door2fShortcut.oneWayHint = 'Trancada por trinco do lado da Diretoria';
  group.add(door2fShortcut.group);
  doors.push(door2fShortcut);

  addPlaque('2º ANDAR · ALA SUPERIOR', 'OESTE ← · CENTRAL ↑ · → LESTE', { x: 0, y: 3.16, z: -62.88 }, 0, 2.8, 0.4, true);

  // 2F Furniture & Props
  // Hall da Escadaria 2F: reception bench + small console
  addLevelBox(1.8, 0.45, 0.52, trimMat, -2.6, 0.225, -59.5, true);
  addLevelBox(1.8, 0.45, 0.52, trimMat, 2.6, 0.225, -59.5, true);

  // Ambulatório & Câmara de Raio-X
  addLevelBox(0.14, 1.15, 2.1, propMats.darkTrim, -15.35, 1.72, -62.2);
  addLevelBox(0.06, 0.96, 1.9, coldBulbMat, -15.27, 1.72, -62.2);
  addLevelBox(1.85, 0.78, 0.88, trimMat, -13.2, 0.39, -59.6, true);
  addLevelBox(0.95, 0.08, 1.9, propMats.stainedCanvas, -6.2, 0.78, -59.8, true);
  addLevelBox(0.88, 0.74, 1.8, propMats.rustedMetal, -6.2, 0.37, -59.8);
  const cartAmb = createMedicalCart('cart-2f-amb', propMats, new THREE.Vector3(-8.4, 0, -60.2), -0.45);
  group.add(cartAmb.group);
  nudgeProps.push(cartAmb);
  colliders.push({ minX: -8.76, maxX: -8.04, minZ: -60.56, maxZ: -59.84 });
  group.add(createInspectableDocProp('doc-2f-ambulatorio', propMats, new THREE.Vector3(-12.9, 0.79, -59.6), 0.2));
  registerKey('key-farmacia', -13.65, 0.79, -59.55, 0.4, 'brass');

  // Sala de Reuniões Médicas (SE)
  addLevelBox(4.8, 0.08, 1.45, propMats.doorWood, 9.6, 0.78, -60.6, true);
  for (const lx of [7.5, 11.7]) {
    addLevelBox(0.14, 0.74, 1.1, propMats.darkTrim, lx, 0.37, -60.6);
  }
  for (const [cx, cz, ry, pose] of [
    [8.2, -59.5, 0, 'upright'],
    [9.6, -59.5, 0.15, 'upright'],
    [11.0, -59.5, -0.2, 'side'],
    [8.2, -61.7, Math.PI, 'upright'],
    [11.0, -61.7, Math.PI - 0.1, 'upright'],
  ] as [number, number, number, 'upright' | 'side'][]) {
    const ch = createChair(`chair-2f-reu-${cx}-${cz}`, propMats, new THREE.Vector3(cx, 0, cz), ry, pose);
    group.add(ch.group);
    nudgeProps.push(ch);
    colliders.push({ minX: cx - 0.24, maxX: cx + 0.24, minZ: cz - 0.24, maxZ: cz + 0.24 });
  }
  addLevelBox(0.1, 1.4, 2.6, propMats.darkTrim, 15.38, 1.72, -60.6); // Medical board
  group.add(createInspectableDocProp('doc-2f-reunioes', propMats, new THREE.Vector3(8.6, 0.825, -60.55), 0.22));

  // Farmácia & Laboratório (W Outer)
  addArchEW(-71.4, -15.5, -10.89, -13.2, 1.8);
  for (const pz of [-67.8, -74.0]) {
    addLevelBox(0.56, 2.35, 2.4, propMats.darkTrim, -15.18, 1.175, pz, true);
    addLevelBox(0.04, 2.18, 2.26, propMats.pharmacyCabinet, -14.88, 1.18, pz);
  }
  addLevelBox(2.2, 2.35, 0.56, propMats.darkTrim, -13.2, 1.175, -76.35, true);
  addLevelBox(2.08, 2.18, 0.04, propMats.pharmacyCabinet, -13.2, 1.18, -76.05);
  addLevelBox(2.4, 0.92, 0.74, trimMat, -13.2, 0.46, -68.6, true);
  addLevelBox(2.5, 0.07, 0.84, propMats.doorWood, -13.2, 0.955, -68.6);
  for (let b = -2; b <= 2; b++) {
    const bot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 7)), propMats.amberBottle);
    bot.position.set(-13.2 + b * 0.36, 1.09, -68.42);
    group.add(bot);
  }
  group.add(createInspectableDocProp('doc-2f-farmacia', propMats, new THREE.Vector3(-13.55, 1.0, -68.75), -0.3));
  registerKey('key-diretoria', -12.45, 1.0, -68.68, 0.85, 'brass');

  // Ala de Tratamento Psiquiátrico (W Inner: x[-8.4..-1.8], z[-76.8..-65.6])
  makeWardBed(-6.6, -67.6);
  makeWardBed(-6.6, -74.8);
  addLevelBox(0.05, 1.8, 2.2, propMats.stainedCanvas, -5.0, 1.48, -67.6);
  const stTrat = createStretcher('stretcher-2f-trat', propMats, new THREE.Vector3(-4.4, 0, -74.6), 0.35);
  group.add(stTrat.group);
  nudgeProps.push(stTrat);
  colliders.push({ minX: -4.82, maxX: -3.98, minZ: -75.56, maxZ: -73.64 });

  // Diretoria (E Inner South: x[1.8..8.4], z[-71.2..-65.6])
  addLevelBox(2.2, 0.78, 1.02, propMats.darkTrim, 5.1, 0.39, -68.2, true);
  addLevelBox(2.34, 0.08, 1.12, propMats.doorWood, 5.1, 0.82, -68.2);
  addLevelBox(0.2, 0.04, 0.2, propMats.tarnishedBrass, 5.8, 0.88, -68.0);
  addLevelBox(0.05, 0.3, 0.05, propMats.tarnishedBrass, 5.8, 1.04, -68.0);
  addLevelBox(0.26, 0.12, 0.18, coldBulbMat, 5.75, 1.2, -68.0);
  addLevelBox(0.62, 2.28, 2.6, propMats.darkTrim, 2.35, 1.14, -68.4, true);
  const dirChair = createChair('chair-2f-diretoria', propMats, new THREE.Vector3(5.1, 0, -67.0), Math.PI, 'upright');
  group.add(dirChair.group);
  nudgeProps.push(dirChair);
  colliders.push({ minX: 4.84, maxX: 5.36, minZ: -67.26, maxZ: -66.74 });
  group.add(createInspectableDocProp('doc-2f-diretoria', propMats, new THREE.Vector3(4.8, 0.868, -68.15), 0.14));
  registerKey('key-morgue', 5.32, 0.868, -68.3, -0.5, 'iron');

  // Enfermaria de Observação (E Inner North: x[1.8..8.4], z[-76.8..-71.2])
  for (const bx of [3.5, 6.2]) {
    addLevelBox(1.02, 0.1, 2.15, propMats.rustedMetal, bx, 0.34, -75.0, true);
    addLevelBox(0.9, 0.2, 2.0, linenMat, bx, 0.49, -75.0);
    addLevelBox(1.0, 0.88, 0.08, trimMat, bx, 0.8, -76.06);
  }
  addLevelBox(0.6, 0.72, 0.56, trimMat, 4.85, 0.36, -75.5, true);
  group.add(createInspectableDocProp('doc-2f-observacao', propMats, new THREE.Vector3(4.85, 0.73, -75.5), 0.25));
  const cartObs = createMedicalCart('cart-2f-obs', propMats, new THREE.Vector3(6.8, 0, -72.6), 0.2);
  group.add(cartObs.group);
  nudgeProps.push(cartObs);
  colliders.push({ minX: 6.44, maxX: 7.16, minZ: -72.96, maxZ: -72.24 });

  // Sala de Vigilância & Arquivos (E Outer: x[10.8..15.6], z[-76.8..-65.6])
  addLevelBox(0.78, 0.78, 2.1, trimMat, 11.45, 0.39, -68.4, true);
  addLevelBox(0.6, 2.15, 2.6, propMats.rustedMetal, 15.1, 1.075, -69.5, true);
  addLevelBox(0.6, 2.15, 2.6, propMats.rustedMetal, 15.1, 1.075, -73.8, true);

  // Lavanderia NW & Copa NE props
  addLevelBox(1.9, 0.85, 0.78, propMats.rustedMetal, -12.4, 0.425, -81.3, true);
  addLevelBox(2.4, 0.86, 0.74, trimMat, 12.2, 0.43, -81.3, true);

  // ================== 3º ANDAR — MORGUE, EXPURGO & CAPELA GÓTICA (x[-15.6..15.6], z[-108.15..-83.15]) ==================
  addTiledSlabFloor(-3.4, 3.4, -88.5, -83.15, concreteFloorMat, 2.4); // Vestíbulo 3F
  addTiledSlabFloor(-15.6, -3.4, -88.5, -83.15, propMats.wardTileFloor, 2.2); // Sala de Preparação (SW)
  addTiledSlabFloor(3.4, 15.6, -88.5, -83.15, floorMat); // Sacristia Sul (SE)

  addTiledSlabFloor(-10.8, -8.4, -98.5, -88.5, concreteFloorMat, 2.4); // Corredor Frio Oeste
  addTiledSlabFloor(-8.4, -1.8, -91.2, -88.5, concreteFloorMat, 2.4); // Ligação Oeste-Vestíbulo
  addTiledSlabFloor(-15.6, -10.8, -98.5, -88.5, concreteFloorMat, 2.4); // Câmara Frigorífica
  addTiledSlabFloor(-8.4, -1.8, -98.5, -91.2, propMats.wardTileFloor, 2.2); // Morgue & Necrotério
  addTiledSlabFloor(-15.6, -1.8, -108.15, -98.5, concreteFloorMat, 2.5); // Sala de Expurgo & Incinerador

  addTiledSlabFloor(1.8, 4.2, -102.4, -88.5, concreteFloorMat, 2.4); // Claustro Leste (Corredor da Capela)
  addTiledSlabFloor(4.2, 10.8, -91.2, -88.5, concreteFloorMat, 2.4); // Ligação Leste
  addTiledSlabFloor(-1.8, 1.8, -105.0, -102.4, concreteFloorMat, 2.4); // Claustro Norte (bypass!)
  addTiledSlabFloor(-1.8, 4.2, -108.15, -105.0, concreteFloorMat, 2.4); // Relicário Norte
  addTiledSlabFloor(4.2, 11.4, -108.15, -91.2, floorMat); // Capela de Blackwood (Nave & Altar!)
  addTiledSlabFloor(11.4, 15.6, -100.2, -88.5, floorMat); // Confessionário & Sacristia Norte

  addCeilingSlab(-15.7, 15.7, -108.25, -83.05, darkCeilMat);

  // Outer Perimeter Walls 3F
  addWallBounds(-15.7, -15.5, 0, 3.7, -108.05, -83.25, wallMat, true);
  // East wall: Capela sanctuary z[-108.05..-100.2] at x=11.4, Confessionário z[-100.2..-88.5] at x=15.6, Sacristia Sul z[-88.5..-83.25] at x=15.6
  addWallBounds(15.5, 15.7, 0, 3.7, -100.29, -83.25, wallMat, true);
  addWallBounds(11.31, 15.5, 0, 3.7, -100.29, -100.11, wallMat, true);
  addWallBounds(11.31, 11.49, 0, 3.7, -108.05, -100.29, wallMat, true);
  // North Perimeter (z = -108.15)
  addWallBounds(-15.7, 11.49, 0, 3.7, -108.25, -108.05, wallMat, true);
  // South Perimeter (z = -83.15 with stairwell opening x[-1.5..1.5])
  addWallBounds(-15.7, -1.5, 0, 3.7, -83.25, -83.05, wallMat, true);
  addWallBounds(1.5, 15.7, 0, 3.7, -83.25, -83.05, wallMat, true);
  addWallBounds(-1.5, 1.5, 3.22, 3.7, -83.25, -83.05, wallMat, false);

  // Vestíbulo 3F Walls (x = +/-3.4, z[-88.5..-83.25]) with West & East Archways + North sealed grille
  addArchNS(-3.4, -88.41, -83.25, -85.8, 2.0);
  addArchNS(3.4, -88.41, -83.25, -85.8, 2.0);
  // North partition z = -88.5: solid wall across central vestíbulo [-3.4..3.4], archways at West Corridor & East Corridor
  addWallBounds(-1.89, 1.89, 0, 3.7, -88.59, -88.41, wallMat, true);
  // Sala de Preparação <-> Corredor Frio Oeste (door at x=-9.6)
  addWallEWDoors(-88.5, -15.5, -1.89, [-9.6]);
  // Sacristia Sul <-> Ligação Leste / Claustro (door at x=6.2)
  addWallEWDoors(-88.5, 1.89, 15.5, [6.2]);

  // Corredor Frio Oeste & Morgue & Câmara Frigorífica
  addWallBounds(-8.31, -1.89, 0, 3.7, -91.29, -91.11, wallMat, true); // Morgue South
  addWallNSDoors(-10.8, -98.41, -88.59, [-93.5]); // Câmara Frigorífica door
  addWallNSDoors(-8.4, -98.41, -91.29, [-94.8], propMats.morgueTileWall); // Morgue West Wall (locked)
  // Morgue interior East wall (x = -1.8, split morgueTileWall inside & wallMat outside, sealing off central void)
  addDualWallNS(-1.8, -102.31, -88.59, propMats.morgueTileWall, wallMat, true, 2.0);
  // Morgue <-> Sala de Expurgo divider at z = -98.5 (with interior door at x = -5.1)
  addWallEWDoors(-98.5, -15.5, -1.89, [-5.1]);

  // One-way Shortcut from Expurgo to Claustro Norte at x = -1.8, z = -103.7
  addWallNSDoors(-1.8, -108.05, -102.49, [-103.7]);
  addWallBounds(-1.71, 1.71, 0, 3.7, -102.49, -102.31, wallMat, true); // South wall of Claustro Norte
  addWallBounds(-1.71, 1.71, 0, 3.7, -105.09, -104.91, wallMat, true); // North wall of Claustro Norte

  // Claustro Leste & Capela de Blackwood
  addWallBounds(4.29, 15.5, 0, 3.7, -91.29, -91.11, wallMat, true); // Capela South Wall
  addWallBounds(1.71, 1.89, 0, 3.7, -102.31, -88.59, wallMat, true); // Claustro Leste West Wall
  addWallNSDoors(4.2, -104.91, -91.29, [-95.0]); // Capela Main Door (x=4.2, z=-95.0)
  addWallBounds(4.11, 4.29, 0, 3.7, -108.05, -105.09, wallMat, true);
  // Confessionário wall at x = 11.4, z[-100.11..-91.29] with door at z = -95.0
  addWallNSDoors(11.4, -100.11, -91.29, [-95.0]);

  // 3F Doors & Plaques
  const doorPrep = createSingleDoor('door-3f-prep', propMats, 0, -1, new THREE.Vector3(-9.6, 0, -88.5), 0);
  group.add(doorPrep.group);
  doors.push(doorPrep);

  const doorFrig = createSingleDoor('door-3f-frigorifica', propMats, 0, -1, new THREE.Vector3(-10.8, 0, -93.5), -Math.PI / 2);
  group.add(doorFrig.group);
  doors.push(doorFrig);
  addPlaque('CÂMARA FRIGORÍFICA', 'CONSERVAÇÃO', { x: -10.64, y: 2.98, z: -93.5 }, Math.PI / 2, 1.9, 0.38);

  const doorMorgue = createSingleDoor('door-3f-morgue', propMats, 0, 1, new THREE.Vector3(-8.4, 0, -94.8), Math.PI / 2);
  doorMorgue.locked = true;
  doorMorgue.requiredKeyId = 'key-morgue';
  doorMorgue.requiredKeyName = BLACKWOOD_KEYS['key-morgue'].name;
  group.add(doorMorgue.group);
  doors.push(doorMorgue);
  addPlaque('MORGUE · NECROTÉRIO', 'ACESSO RESTRITO', { x: -8.56, y: 2.98, z: -94.8 }, -Math.PI / 2, 1.95, 0.38);

  const doorExpurgoInside = createSingleDoor('door-3f-expurgo', propMats, 0, 1, new THREE.Vector3(-5.1, 0, -98.5), 0);
  group.add(doorExpurgoInside.group);
  doors.push(doorExpurgoInside);

  const doorExpurgoShortcut = createSingleDoor('door-3f-atalho-expurgo', propMats, 0, 1, new THREE.Vector3(-1.8, 0, -103.7), Math.PI / 2);
  doorExpurgoShortcut.locked = true;
  doorExpurgoShortcut.oneWayUnlockSide = 'west';
  doorExpurgoShortcut.oneWayHint = 'Trancada por trinco pelo lado da Sala de Expurgo';
  group.add(doorExpurgoShortcut.group);
  doors.push(doorExpurgoShortcut);
  addPlaque('SALA DE EXPURGO', 'INCINERADOR · OESTE', { x: -1.64, y: 2.98, z: -103.7 }, Math.PI / 2, 1.85, 0.38);

  const doorSacristia = createSingleDoor('door-3f-sacristia', propMats, 0, 1, new THREE.Vector3(6.2, 0, -88.5), 0);
  group.add(doorSacristia.group);
  doors.push(doorSacristia);

  const doorCapela = createSingleDoor('door-3f-capela', propMats, 0, -1, new THREE.Vector3(4.2, 0, -95.0), Math.PI / 2);
  doorCapela.locked = true;
  doorCapela.requiredKeyId = 'key-capela';
  doorCapela.requiredKeyName = BLACKWOOD_KEYS['key-capela'].name;
  group.add(doorCapela.group);
  doors.push(doorCapela);
  addPlaque('CAPELA DE BLACKWOOD', 'NAVE & ALTAR-MOR', { x: 4.04, y: 2.98, z: -95.0 }, -Math.PI / 2, 2.05, 0.38);

  const doorConfess = createSingleDoor('door-3f-confessionario', propMats, 0, -1, new THREE.Vector3(11.4, 0, -95.0), Math.PI / 2);
  group.add(doorConfess.group);
  doors.push(doorConfess);

  addPlaque('3º ANDAR · SETOR RESTRITO', 'NECROTÉRIO ← · → CAPELA', { x: 0, y: 2.98, z: -88.35 }, 0, 2.6, 0.4);

  // 3F Props & Furniture
  // Sala de Preparação (SW)
  addLevelBox(2.0, 0.85, 0.85, porcelainMat, -13.2, 0.425, -85.8, true);
  const cartPrep = createMedicalCart('cart-3f-prep', propMats, new THREE.Vector3(-6.4, 0, -85.6), 0.25);
  group.add(cartPrep.group);
  nudgeProps.push(cartPrep);
  colliders.push({ minX: -6.76, maxX: -6.04, minZ: -85.96, maxZ: -85.24 });

  // Câmara Frigorífica (W Outer)
  const stFrig = createStretcher('stretcher-3f-frig', propMats, new THREE.Vector3(-13.2, 0, -93.8), 0.14);
  group.add(stFrig.group);
  nudgeProps.push(stFrig);
  colliders.push({ minX: -13.62, maxX: -12.78, minZ: -94.76, maxZ: -92.84 });
  for (const cz of [-91.2, -96.0]) {
    addLevelBox(1.8, 2.0, 0.06, propMats.stainedCanvas, -13.8, 1.35, cz);
  }

  // Morgue & Necrotério (x[-8.4..-1.8], z[-98.5..-91.2])
  for (const mz of [-93.1, -96.2]) {
    addLevelBox(0.85, 2.55, 2.52, propMats.darkTrim, -2.3, 1.275, mz, true);
    addLevelBox(0.04, 2.42, 2.4, propMats.morgueSteelDrawers, -2.75, 1.27, mz);
  }
  // Open steel drawer 03 protruding west
  addLevelBox(1.55, 0.06, 0.72, propMats.rustedMetal, -3.5, 0.96, -93.4, true);
  addLevelBox(1.42, 0.14, 0.62, linenMat, -3.5, 1.06, -93.4);
  // Central Stainless Autopsy Table + Surgical Lamp + Forensic Desk with doc-3f-morgue & key-capela
  addLevelBox(2.15, 0.08, 0.96, propMats.rustedMetal, -5.2, 0.88, -94.8, true);
  addLevelBox(0.24, 0.84, 0.62, propMats.rustedMetal, -5.2, 0.42, -94.8);
  addLevelBox(0.65, 0.08, 0.65, propMats.rustedMetal, -5.2, 2.45, -94.8);
  addLevelBox(0.45, 0.05, 0.45, coldBulbMat, -5.2, 2.4, -94.8);
  addLevelBox(1.35, 0.76, 0.68, trimMat, -6.2, 0.38, -92.1, true);
  group.add(createInspectableDocProp('doc-3f-morgue', propMats, new THREE.Vector3(-6.45, 0.77, -92.1), -0.2));
  registerKey('key-capela', -5.85, 0.77, -92.08, 0.55, 'iron');

  // Sala de Expurgo & Incinerador (x[-15.6..-1.8], z[-108.15..-98.5])
  addLevelBox(2.8, 2.5, 2.1, propMats.rustedMetal, -13.6, 1.25, -106.4, true);
  addLevelBox(0.68, 2.7, 0.68, propMats.darkTrim, -14.0, 2.7, -106.9);
  addLevelBox(0.95, 0.52, 0.06, furnaceGlowMat, -13.6, 0.92, -105.32);
  for (const [dx, dz] of [
    [-14.4, -100.6],
    [-14.4, -101.6],
    [-13.4, -101.0],
    [-12.2, -106.2],
  ]) {
    const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 10)), propMats.rustedMetal);
    drum.position.set(dx, 0.46, dz);
    group.add(drum);
    colliders.push({ minX: dx - 0.34, maxX: dx + 0.34, minZ: dz - 0.34, maxZ: dz + 0.34 });
  }
  addLevelBox(1.9, 0.76, 0.85, trimMat, -6.8, 0.38, -104.2, true);
  group.add(createInspectableDocProp('doc-3f-expurgo', propMats, new THREE.Vector3(-6.8, 0.77, -104.2), 0.32));

  // Sacristia Sul (SE)
  addLevelBox(2.4, 2.2, 0.64, propMats.darkTrim, 13.8, 1.1, -85.8, true);
  addLevelBox(1.5, 0.78, 0.74, trimMat, 11.0, 0.39, -84.2, true);

  // Capela de Blackwood (x[4.2..11.4], z[-108.15..-91.2])
  addLevelBox(1.4, 0.012, 11.4, runnerMat, 7.8, 0.008, -98.4, false); // Red chapel aisle carpet
  // 3 Backlit Stained Glass Windows along East Sanctuary Wall (x = 11.31)
  for (const wz of [-101.6, -104.0, -106.4]) {
    addLevelBox(0.12, 2.32, 1.54, propMats.darkTrim, 11.24, 2.15, wz);
    addLevelBox(0.04, 2.14, 1.36, propMats.chapelStainedGlass, 11.16, 2.15, wz);
  }
  // 4 Pairs of Pews flanking the central aisle
  for (const [pz, skew] of [
    [-93.2, 0],
    [-95.8, 0],
    [-98.4, 0.08],
    [-101.0, 0],
  ] as [number, number][]) {
    for (const px of [5.85, 9.75]) {
      const pew = new THREE.Group();
      pew.position.set(px, 0, pz);
      pew.rotation.y = px < 7.8 ? skew : 0;
      const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 0.07, 0.46)), propMats.doorWood);
      seat.position.y = 0.46;
      pew.add(seat);
      const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 0.56, 0.06)), propMats.doorWood);
      back.position.set(0, 0.74, 0.2);
      pew.add(back);
      for (const sx of [-0.88, 0.88]) {
        const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.46, 0.44)), propMats.darkTrim);
        leg.position.set(sx, 0.23, 0);
        pew.add(leg);
      }
      group.add(pew);
      colliders.push({ minX: px - 1.04, maxX: px + 1.04, minZ: pz - 0.3, maxZ: pz + 0.3 });
    }
  }
  // Raised Dais & Altar-Mor at North End (z = -106.4)
  addLevelBox(5.6, 0.24, 2.9, propMats.darkTrim, 7.8, 0.12, -106.55, true);
  addLevelBox(2.4, 0.96, 0.92, propMats.doorWood, 7.8, 0.72, -106.5, true);
  addLevelBox(2.52, 0.06, 0.98, linenMat, 7.8, 1.22, -106.5);
  addLevelBox(0.12, 1.15, 0.12, altarGoldMat, 7.8, 1.82, -106.7);
  addLevelBox(0.68, 0.12, 0.12, altarGoldMat, 7.8, 2.08, -106.7);
  for (const cx of [6.8, 8.8]) {
    addLevelBox(0.18, 0.06, 0.18, altarGoldMat, cx, 1.27, -106.5);
    addLevelBox(0.05, 0.26, 0.05, linenMat, cx, 1.43, -106.5);
    addLevelBox(0.04, 0.07, 0.04, candleFlameMat, cx, 1.59, -106.5);
  }
  addLevelBox(0.85, 0.92, 0.65, trimMat, 5.4, 0.46, -104.8, true);
  group.add(createInspectableDocProp('doc-3f-capela', propMats, new THREE.Vector3(5.4, 0.93, -104.8), 0.38));

  // Confessionário & Sacristia Norte (x[11.4..15.6], z[-100.2..-88.5])
  addLevelBox(1.1, 2.25, 2.4, propMats.darkTrim, 14.8, 1.125, -96.5, true); // Confessional booth
  addLevelBox(1.0, 0.85, 0.7, trimMat, 13.4, 0.425, -92.6, true);
  group.add(createInspectableDocProp('doc-3f-confessionario', propMats, new THREE.Vector3(13.4, 0.86, -92.6), -0.35));

  // ================== STAIRWELL CONNECTORS (1F <-> 2F at -57.15, 2F <-> 3F at -82.15) ==================
  const addStairConnector = (zN: number, zS: number, id: string, upLabel: string, downLabel: string) => {
    const zc = (zN + zS) / 2;
    const len = Math.abs(zN - zS);
    addTiledSlabFloor(-1.5, 1.5, zS, zN, floorMat);
    addLevelBox(3.4, 0.16, len, darkCeilMat, 0, 3.79, zc);
    for (const sx of [-1.6, 1.6]) {
      addWall(sx, 0, zc, 0.2, 3.7, len + 0.18, wallMat, true);
    }

    const portal = createStairwellPortalDoor(id, propMats, new THREE.Vector3(0, 0, zN), 2.8, 2.66, 0);
    portal.locked = false;
    group.add(portal.group);
    colliders.push({ minX: -1.55, maxX: 1.55, minZ: zN - 0.18, maxZ: zN + 0.18 });
    addWall(0, 3.22, zN, 3.0, 0.48, 0.2, wallMat, false);

    addWall(-1.82, 0, zN, 0.36, 3.7, 0.2, wallMat, true);
    addWall(1.82, 0, zN, 0.36, 3.7, 0.2, wallMat, true);

    addPlaque(upLabel, 'INTERAGIR [E]', { x: 0, y: 3.44, z: zN + 0.16 }, 0, 2.1, 0.36);
    addPlaque(downLabel, 'INTERAGIR [E]', { x: 0, y: 3.44, z: zN - 0.16 }, Math.PI, 2.1, 0.36);

    const rise = 0.11;
    const run = 0.32;
    const land = 0.68;
    const zD = zN + 0.18;
    addLevelBox(2.5, rise * 5, land, concreteFloorMat, 0, rise * 2.5, zD + land / 2);
    for (let k = 4; k >= 1; k--) {
      addLevelBox(2.5, rise * k, run, concreteFloorMat, 0, (rise * k) / 2, zD + land + (4 - k) * run + run / 2);
    }
  };

  addStairConnector(-57.15, -58.15, 'floor-door-2', 'ACESSO AO 2º ANDAR', 'RETORNO AO 1º ANDAR');
  addStairConnector(-82.15, -83.15, 'floor-door-3', 'ACESSO AO 3º ANDAR', 'RETORNO AO 2º ANDAR');

  // ================== ATMOSPHERIC LIGHTS ==================
  const lightCoords: { pos: [number, number, number]; color: number; intensity: number; dist: number; flicker?: boolean }[] = [
    // Ground Corridor
    { pos: [0, 3.15, 7.2], color: 0xffcb88, intensity: 0.56, dist: 11.5, flicker: true },
    { pos: [0, 3.15, -1.8], color: 0xffcb88, intensity: 0.55, dist: 11.5, flicker: true },
    { pos: [0, 3.15, -11.8], color: 0xffcb88, intensity: 0.55, dist: 11.5, flicker: true },
    { pos: [-11.0, 3.15, -4.1], color: 0xffcb88, intensity: 0.52, dist: 11.0, flicker: true },
    { pos: [11.0, 3.15, -4.1], color: 0xffcb88, intensity: 0.52, dist: 11.0, flicker: true },
    { pos: [0, 2.95, -17.3], color: 0xffc476, intensity: 0.68, dist: 8.5, flicker: true },
    // 1º Andar
    { pos: [0, 3.15, -24.5], color: 0xffcb88, intensity: 0.62, dist: 10.5, flicker: true },
    { pos: [-6.6, 3.05, -25.6], color: 0x7fb5bd, intensity: 0.72, dist: 11.5, flicker: true },
    { pos: [4.8, 2.4, -22.9], color: 0xffc670, intensity: 0.76, dist: 9.5, flicker: false },
    { pos: [8.4, 3.1, -26.5], color: 0xffe0aa, intensity: 0.45, dist: 9.5, flicker: true },
    { pos: [0, 3.15, -38.1], color: 0xffcb88, intensity: 0.55, dist: 11.5, flicker: true },
    { pos: [-6.8, 3.1, -38.1], color: 0x9bb2bd, intensity: 0.64, dist: 13.0, flicker: true },
    { pos: [7.2, 3.05, -37.2], color: 0xffc378, intensity: 0.68, dist: 12.5, flicker: true },
    { pos: [0, 3.15, -50.8], color: 0xffcb88, intensity: 0.54, dist: 10.5, flicker: true },
    { pos: [-4.6, 2.35, -52.8], color: 0xc24830, intensity: 0.82, dist: 10.5, flicker: false },
    { pos: [6.4, 3.15, -50.8], color: 0xc9d6ca, intensity: 0.68, dist: 11.0, flicker: true },
    { pos: [0, 2.95, -56.4], color: 0xffc476, intensity: 0.68, dist: 8.5, flicker: true },
    // 2º Andar Multi-Wing Lighting
    { pos: [0, 3.15, -60.5], color: 0xffcb88, intensity: 0.65, dist: 11.5, flicker: true },
    { pos: [-6.5, 3.1, -64.3], color: 0xffcb88, intensity: 0.56, dist: 11.5, flicker: true },
    { pos: [6.5, 3.1, -64.3], color: 0xffcb88, intensity: 0.56, dist: 11.5, flicker: true },
    { pos: [-9.6, 3.1, -71.5], color: 0xffcb88, intensity: 0.54, dist: 11.5, flicker: true },
    { pos: [9.6, 3.1, -71.5], color: 0xffcb88, intensity: 0.54, dist: 11.5, flicker: true },
    { pos: [0, 3.1, -72.0], color: 0xffcb88, intensity: 0.54, dist: 11.5, flicker: true },
    { pos: [-13.0, 2.8, -61.5], color: 0xb0d0d8, intensity: 0.82, dist: 12.0, flicker: false }, // Raio-X glow
    { pos: [9.6, 3.0, -60.6], color: 0xffd088, intensity: 0.72, dist: 12.0, flicker: false }, // Sala de Reuniões
    { pos: [-13.2, 2.9, -71.0], color: 0xffd088, intensity: 0.68, dist: 12.0, flicker: true }, // Farmácia
    { pos: [-5.1, 3.0, -71.2], color: 0x9ab0bd, intensity: 0.62, dist: 12.0, flicker: true }, // Tratamento
    { pos: [5.5, 2.2, -68.2], color: 0x9be09e, intensity: 0.76, dist: 10.5, flicker: false }, // Diretoria
    { pos: [5.1, 3.05, -74.5], color: 0x9ab0bd, intensity: 0.66, dist: 11.5, flicker: true }, // Observação
    { pos: [13.2, 2.95, -71.2], color: 0xaad4da, intensity: 0.6, dist: 11.0, flicker: false }, // Vigilância
    // 3º Andar Forensics & Gothic Chapel
    { pos: [0, 3.1, -85.8], color: 0xffc476, intensity: 0.62, dist: 11.5, flicker: true },
    { pos: [-9.6, 3.05, -94.0], color: 0x9ab8bd, intensity: 0.58, dist: 12.0, flicker: true },
    { pos: [-13.2, 2.9, -93.5], color: 0x8bb6c4, intensity: 0.66, dist: 11.5, flicker: true }, // Frigorífica
    { pos: [-5.2, 2.9, -94.8], color: 0xaad4da, intensity: 0.88, dist: 12.5, flicker: true }, // Morgue surgical
    { pos: [-12.5, 2.1, -104.8], color: 0xe65824, intensity: 0.88, dist: 12.5, flicker: true }, // Incinerador embers
    { pos: [3.0, 3.05, -95.0], color: 0xffc476, intensity: 0.54, dist: 11.5, flicker: true }, // Claustro Leste
    { pos: [9.8, 2.7, -104.0], color: 0x4f78c4, intensity: 0.92, dist: 14.0, flicker: false }, // Vitrais Capela
    { pos: [7.8, 2.35, -106.2], color: 0xffbb66, intensity: 0.96, dist: 12.0, flicker: true }, // Altar Capela
    { pos: [13.4, 2.8, -94.5], color: 0xffc07a, intensity: 0.64, dist: 10.5, flicker: false }, // Confessionário
  ];

  lightCoords.forEach((cfg, idx) => {
    const pl = new THREE.PointLight(cfg.color, cfg.intensity, cfg.dist, 1.65);
    pl.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    pl.userData.flickerSeed = idx * 1.73;
    pl.userData.baseIntensity = cfg.intensity;
    pl.userData.flicker = cfg.flicker !== false;
    group.add(pl);
    flickerLights.push(pl);
  });

  // Floating Dust Motes across all 3 upper wings
  const dustCount = 560;
  const dustArr = new Float32Array(dustCount * 3);
  const dustBasePositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const dx = (Math.random() - 0.5) * 28.0;
    const dy = 0.28 + Math.random() * 2.95;
    const dz = -107 + Math.random() * 128;
    dustArr[i * 3] = dx;
    dustArr[i * 3 + 1] = dy;
    dustArr[i * 3 + 2] = dz;
    dustBasePositions[i * 3] = dx;
    dustBasePositions[i * 3 + 1] = dy;
    dustBasePositions[i * 3 + 2] = dz;
  }
  const dustGeo = trackGeo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustArr, 3));
  const dustMat = new THREE.PointsMaterial({
    map: textures.dustSprite,
    color: 0xd8d2c4,
    size: 0.065,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(dustMat);
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.raycast = () => {};
  group.add(dustPoints);

  return {
    group,
    doors,
    nudgeProps,
    colliders,
    keyPickups,
    flickerLights,
    dustPoints,
    dustBasePositions,
    dustMat,
    materials,
    geometries,
  };
}
