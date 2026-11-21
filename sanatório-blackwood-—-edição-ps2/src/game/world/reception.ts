import * as THREE from 'three';
import { createPs2Lambert, createPs2Phong, PropMaterialBank } from '../materials';
import {
  applyBoxUvTiling,
  createChair,
  createInspectableDocProp,
  createMedicalCart,
  createReceptionNorthDoors,
  createSingleDoor,
  createStairwellPortalDoor,
  createStretcher,
  tagInteractable,
} from '../props';
import { BlackwoodTextureBank } from '../textures';
import { AABBCollider, CapsuleCollider, DoorState, NudgeProp } from '../types';

export interface ReceptionBuildResult {
  group: THREE.Group;
  doors: DoorState[];
  nudgeProps: NudgeProp[];
  colliders: AABBCollider[];
  mezzanineColliders: AABBCollider[];
  capsules: CapsuleCollider[];
  windowSpillLights: THREE.SpotLight[];
  receptionLights: THREE.PointLight[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  ringBell: () => void;
  update: (dt: number, moonlightFactor: number) => void;
}

function makeCurvedArcGeo(
  innerR: number,
  outerR: number,
  depth: number,
  startAng: number,
  endAng: number,
  segs: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = startAng + (i / segs) * (endAng - startAng);
    const x = outerR * Math.sin(a);
    const y = outerR * Math.cos(a);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segs; i >= 0; i--) {
    const a = startAng + (i / segs) * (endAng - startAng);
    const x = innerR * Math.sin(a);
    const y = innerR * Math.cos(a);
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
}

function drawBrassSignMaterial(
  headline: string,
  detail: string,
  materials: THREE.Material[],
  emissiveIntensity = 0.2,
): THREE.MeshLambertMaterial {
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
  ctx.strokeStyle = 'rgba(205,184,137,0.48)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, 480, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e0d2ad';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(headline, 256, 62, 450);
  ctx.fillStyle = '#b7a57f';
  ctx.font = '22px Georgia, serif';
  ctx.fillText(detail, 256, 112, 460);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0x635030),
    emissiveIntensity,
    side: THREE.DoubleSide,
  });
  materials.push(mat);
  return mat;
}

export function buildReceptionAndWings(
  propMats: PropMaterialBank,
  textures: BlackwoodTextureBank,
): ReceptionBuildResult {
  const group = new THREE.Group();
  const doors: DoorState[] = [];
  const nudgeProps: NudgeProp[] = [];
  const colliders: AABBCollider[] = [];
  const mezzanineColliders: AABBCollider[] = [];
  const capsules: CapsuleCollider[] = [];
  const windowSpillLights: THREE.SpotLight[] = [];
  const receptionLights: THREE.PointLight[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const deskBodyMat = createPs2Lambert({ color: 0x49372a, side: THREE.DoubleSide }, materials);
  const dadoMat = createPs2Lambert({ map: textures.receptionDado, color: 0xd6cfc2 }, materials);
  const windowMat = createPs2Lambert(
    { map: textures.windowGlass, emissive: 0x202b30, emissiveIntensity: 0.35 },
    materials,
  );
  const curtainMat = createPs2Lambert(
    { map: textures.curtain, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide },
    materials,
  );
  const ledgerMat = createPs2Lambert({ map: textures.intakeLedger }, materials);
  const darkMetalMat = createPs2Phong({ color: 0x262928, shininess: 22 }, materials);
  const blackCoreMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  materials.push(blackCoreMat);

  // Reception Floor & Wall Skin
  const recFloorMat = createPs2Lambert({ map: textures.receptionFloor, color: 0xd8d4ca }, materials);
  const recWallMat = createPs2Lambert({ map: textures.receptionWall, color: 0xd8d2c6, side: THREE.DoubleSide }, materials);

  const recLen = 21.98 - 10.9;
  const recFloorGeo = trackGeo(new THREE.BoxGeometry(9.8, 0.024, recLen));
  applyBoxUvTiling(recFloorGeo, 9.8, 0.024, recLen, 2.94);
  const recFloor = new THREE.Mesh(recFloorGeo, recFloorMat);
  recFloor.position.set(0, 0.012, (10.9 + 21.98) / 2);
  recFloor.receiveShadow = true;
  group.add(recFloor);

  // Reception East/West wall skin with 3 door cutouts (cleanly proud of x = +/-5.00)
  const wallGaps = [12.9, 16.35, 19.8];
  const hw = 0.56;
  const Z0 = 10.91;
  const wallTotalLen = 21.99 - Z0;
  for (const sx of [-1, 1]) {
    let curZ = Z0;
    const addSkinSeg = (z0: number, z1: number) => {
      if (z1 - z0 < 0.02) return;
      const g = trackGeo(new THREE.BoxGeometry(0.024, 3.55, z1 - z0));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, ((uv.getX(i) * (z1 - z0)) / wallTotalLen + (z0 - Z0) / wallTotalLen) * 3.6);
      }
      uv.needsUpdate = true;
      const m = new THREE.Mesh(g, recWallMat);
      m.position.set(sx * 4.972, 1.78, (z0 + z1) / 2);
      m.receiveShadow = true;
      group.add(m);
    };
    for (const c of wallGaps) {
      addSkinSeg(curZ, c - hw);
      curZ = c + hw;
    }
    addSkinSeg(curZ, 21.99);
  }

  // Curved Reception Desk (z = 16.05)
  const deskZ = 16.05;
  const startA = -0.53 * Math.PI;
  const endA = 0.53 * Math.PI;
  const spanA = endA - startA;
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, deskZ);

  const outerArc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.24, 2.24, 0.86, 20, 1, true, startA, spanA)),
    deskBodyMat,
  );
  outerArc.position.set(0, 0.67, 0);
  outerArc.castShadow = true;
  deskGroup.add(outerArc);

  const innerArc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.72, 1.72, 1.09, 18, 1, true, startA, spanA)),
    propMats.weatheredWood,
  );
  innerArc.position.set(0, 0.545, 0);
  deskGroup.add(innerArc);

  const coreBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.7, 1.7, 0.25, 16, 1, true, startA, spanA)),
    blackCoreMat,
  );
  coreBase.position.set(0, 0.125, 0);
  deskGroup.add(coreBase);

  for (const ty of [0.255, 0.66, 1.05]) {
    const molding = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(2.256, 2.256, 0.036, 20, 1, true, startA, spanA)),
      propMats.darkTrim,
    );
    molding.position.set(0, ty, 0);
    deskGroup.add(molding);
  }

  const counterTop = new THREE.Mesh(trackGeo(makeCurvedArcGeo(1.66, 2.33, 0.068, startA, endA, 22)), propMats.weatheredWood);
  counterTop.rotation.x = Math.PI / 2;
  counterTop.position.set(0, 1.15, 0);
  counterTop.castShadow = true;
  deskGroup.add(counterTop);

  const lowerShelf = new THREE.Mesh(
    trackGeo(makeCurvedArcGeo(1.24, 1.74, 0.038, startA + 0.15, endA - 0.15, 16)),
    propMats.weatheredWood,
  );
  lowerShelf.rotation.x = Math.PI / 2;
  lowerShelf.position.set(0, 0.75, 0);
  deskGroup.add(lowerShelf);

  const cheekGeo = trackGeo(new THREE.BoxGeometry(0.08, 1.11, 0.56));
  for (const ang of [startA, endA]) {
    const cheek = new THREE.Mesh(cheekGeo, propMats.darkTrim);
    cheek.position.set(Math.sin(ang) * 1.98, 0.555, Math.cos(ang) * 1.98);
    cheek.rotation.y = ang + Math.PI / 2;
    deskGroup.add(cheek);
  }
  group.add(deskGroup);

  const capR = 1.98;
  for (let i = 0; i < 10; i++) {
    const a0 = startA + (i / 10) * spanA;
    const a1 = startA + ((i + 1) / 10) * spanA;
    capsules.push({
      x1: Math.sin(a0) * capR,
      z1: deskZ + Math.cos(a0) * capR,
      x2: Math.sin(a1) * capR,
      z2: deskZ + Math.cos(a1) * capR,
      radius: 0.34,
    });
  }

  // Interactive Brass Reception Bell
  const bellGroup = new THREE.Group();
  const bellA = 0.25;
  bellGroup.position.set(Math.sin(bellA) * 1.98, 1.162, deskZ + Math.cos(bellA) * 1.98);

  const bellBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.068, 0.075, 0.018, 12)), darkMetalMat);
  bellBase.position.y = 0.009;
  bellGroup.add(bellBase);

  const bellDome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.54)),
    propMats.tarnishedBrass,
  );
  bellDome.position.y = 0.016;
  bellGroup.add(bellDome);

  const bellPin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.01, 0.028, 8)), propMats.tarnishedBrass);
  bellPin.position.y = 0.078;
  bellGroup.add(bellPin);
  tagInteractable(bellGroup, 'reception-bell');
  group.add(bellGroup);

  let bellAnim = 0;
  const ringBell = () => {
    bellAnim = 1;
  };

  // Ledger & Brass Desk Lamp
  const ledgerGroup = new THREE.Group();
  const ledA = -0.19;
  ledgerGroup.position.set(Math.sin(ledA) * 1.98, 1.186, deskZ + Math.cos(ledA) * 1.98);
  ledgerGroup.rotation.y = ledA;
  const ledgerBook = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.024, 0.34)), ledgerMat);
  ledgerGroup.add(ledgerBook);
  tagInteractable(ledgerGroup, 'doc-reception-ledger');
  group.add(ledgerGroup);

  const lampA = 0.56;
  const lampGroup = new THREE.Group();
  lampGroup.position.set(Math.sin(lampA) * 1.97, 1.162, deskZ + Math.cos(lampA) * 1.97);
  lampGroup.rotation.y = -0.45;
  const lBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.068, 0.082, 0.032, 10)), darkMetalMat);
  lBase.position.y = 0.016;
  lampGroup.add(lBase);
  const lStem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.016, 0.022, 0.19, 8)), propMats.tarnishedBrass);
  lStem.position.y = 0.12;
  lampGroup.add(lStem);
  const lShade = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.038, 0.055, 10, 1, true)), darkMetalMat);
  lShade.rotation.x = Math.PI / 2;
  lShade.position.set(0, 0.21, 0.04);
  lampGroup.add(lShade);
  group.add(lampGroup);

  // Reception Chair behind desk
  const deskChair = createChair('reception-desk-chair', propMats, new THREE.Vector3(-0.22, 0, 15.5), 0.42, 'upright');
  group.add(deskChair.group);
  nudgeProps.push(deskChair);
  colliders.push({ minX: -0.48, maxX: 0.05, minZ: 15.23, maxZ: 15.77 });

  // Overhead Signs: RECEPÇÃO (mounted cleanly on wrought-iron crossbeam at y = 3.55 so mezzanine sightlines stay clear) & CORREDOR CLÍNICO
  const recSignMat = drawBrassSignMaterial('RECEPÇÃO', 'ADMISSÃO · PRONTUÁRIOS · 1924', materials, 0.22);
  const recCrossBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.45, 0.08, 0.12)), propMats.darkTrim);
  recCrossBeam.position.set(0, 3.58, deskZ);
  group.add(recCrossBeam);
  const recSignBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.68, 0.72, 0.09)), propMats.darkTrim);
  recSignBack.position.set(0, 3.12, deskZ);
  group.add(recSignBack);
  const recSignFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.44, 0.5, 0.018)), recSignMat);
  recSignFace.position.set(0, 3.12, deskZ + 0.056);
  group.add(recSignFace);

  const shortRodGeo = trackGeo(new THREE.BoxGeometry(0.022, 0.22, 0.022));
  for (const cx of [-0.96, 0.96]) {
    const ch = new THREE.Mesh(shortRodGeo, propMats.tarnishedBrass);
    ch.position.set(cx, 3.49, deskZ);
    group.add(ch);
  }

  const hallSignMat = drawBrassSignMaterial('CORREDOR CLÍNICO', 'ENFERMARIAS · CONSULTÓRIOS', materials, 0.18);
  const hallSignBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.58, 0.58, 0.09)), propMats.darkTrim);
  hallSignBack.position.set(0, 3.03, 10.93);
  group.add(hallSignBack);
  const hallSignFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.34, 0.38, 0.018)), hallSignMat);
  hallSignFace.position.set(0, 3.03, 10.984);
  group.add(hallSignFace);

  // Entry Mat (proud of floor to prevent Z-fighting)
  const entryRug = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.45, 0.024, 1.18)), propMats.stainedCanvas);
  entryRug.position.set(0, 0.036, 20.73);
  group.add(entryRug);

  // Lobby Corner Waiting Benches + Brass Urns + Key-Rack Board behind Reception Desk
  for (const sx of [-1, 1]) {
    const bx = sx * 3.85;
    const bz = 19.35;
    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.06, 1.8)), propMats.weatheredWood);
    seat.position.set(bx, 0.46, bz);
    group.add(seat);
    const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.48, 1.8)), propMats.weatheredWood);
    back.position.set(bx + sx * 0.22, 0.72, bz);
    group.add(back);
    for (const dz of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.44, 0.06)), propMats.darkTrim);
      leg.position.set(bx, 0.22, bz + dz);
      group.add(leg);
    }
    colliders.push({ minX: bx - 0.3, maxX: bx + 0.3, minZ: bz - 0.94, maxZ: bz + 0.94 });

    // Entrance aisle brass stanchion/urn pedestals
    const urnBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.62, 0.42)), propMats.darkTrim);
    urnBase.position.set(sx * 1.95, 0.31, 21.15);
    group.add(urnBase);
    const urnBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.11, 0.28, 10)), propMats.tarnishedBrass);
    urnBowl.position.set(sx * 1.95, 0.76, 21.15);
    group.add(urnBowl);
    colliders.push({ minX: sx * 1.95 - 0.24, maxX: sx * 1.95 + 0.24, minZ: 20.91, maxZ: 21.39 });
  }

  // Key-rack pigeonhole board on north wall behind desk
  const keyBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 0.95, 0.06)), propMats.darkTrim);
  keyBoard.position.set(-1.95, 1.88, 10.95);
  group.add(keyBoard);
  for (let row = 0; row < 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const hook = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.06, 0.04)), propMats.tarnishedBrass);
      hook.position.set(-1.95 + col * 0.24, 2.02 - row * 0.32, 10.995);
      group.add(hook);
    }
  }

  // Directory board near south foyer
  const dirMat = drawBrassSignMaterial('PLANTA DO SANATÓRIO', 'TÉRREO · 1º ANDAR · MEZANINO', materials, 0.16);
  const dirBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.42, 0.46, 0.04)), propMats.darkTrim);
  dirBack.position.set(1.92, 1.96, 21.92);
  group.add(dirBack);
  const dirFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.32, 0.38)), dirMat);
  dirFace.position.set(1.92, 1.96, 21.895);
  dirFace.rotation.y = Math.PI;
  group.add(dirFace);

  // Dado wainscoting around reception perimeter (proud of wall skin)
  const addDado = (x: number, z: number, w: number, d: number) => {
    const panel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 1.24, d)), dadoMat);
    panel.position.set(x, 0.625, z);
    group.add(panel);
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.01, 0.055, d + 0.016)), propMats.darkTrim);
    rail.position.set(x, 1.26, z);
    group.add(rail);
  };
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [
      [10.94, 12.34],
      [13.46, 15.79],
      [16.91, 19.24],
      [20.36, 21.95],
    ]) {
      addDado(sx * 4.925, (z0 + z1) / 2, 0.036, z1 - z0);
    }
  }
  addDado(-3.04, 10.935, 3.84, 0.036);
  addDado(3.04, 10.935, 3.84, 0.036);
  addDado(-3.04, 21.955, 3.84, 0.036);
  addDado(3.04, 21.955, 3.84, 0.036);

  // Frosted Reception Windows + Curtains + Radiators
  const addRecWindow = (x: number, y: number, z: number, ry: number, w: number, h: number, bars: boolean) => {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    wg.rotation.y = ry;
    const glass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w - 0.06, h - 0.06)), windowMat);
    glass.position.z = 0.012;
    wg.add(glass);
    const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.15, 0.075, 0.11)), propMats.darkTrim);
    top.position.set(0, h * 0.5 + 0.037, 0.045);
    wg.add(top);
    const sill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.18, 0.09, 0.18)), propMats.darkTrim);
    sill.position.set(0, -h * 0.5 - 0.03, 0.075);
    wg.add(sill);
    for (const bx of [-w * 0.5 - 0.037, w * 0.5 + 0.037]) {
      const side = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.075, h, 0.11)), propMats.darkTrim);
      side.position.set(bx, 0, 0.045);
      wg.add(side);
    }
    if (bars) {
      const barG = trackGeo(new THREE.CylinderGeometry(0.008, 0.008, h - 0.06, 6));
      for (const bx of [-0.55, -0.28, 0.28, 0.55]) {
        const bar = new THREE.Mesh(barG, propMats.rustedMetal);
        bar.position.set(bx, 0, 0.055);
        wg.add(bar);
      }
    }
    group.add(wg);
  };
  addRecWindow(-3.26, 2.08, 10.91, 0, 1.66, 2.06, false);
  addRecWindow(3.26, 2.08, 10.91, 0, 1.66, 2.06, true);
  addRecWindow(-3.35, 2.06, 21.97, Math.PI, 1.62, 2.02, true);
  addRecWindow(3.35, 2.06, 21.97, Math.PI, 1.62, 2.02, true);

  const curtain = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.84, 2.02)), curtainMat);
  curtain.position.set(-3.72, 2.15, 11.04);
  curtain.rotation.y = 0.06;
  group.add(curtain);

  const addRadiator = (x: number, z: number) => {
    const rg = new THREE.Group();
    rg.position.set(x, 0, z);
    const finGeo = trackGeo(new THREE.BoxGeometry(0.042, 0.68, 0.18));
    for (let i = -5; i <= 5; i++) {
      const fin = new THREE.Mesh(finGeo, darkMetalMat);
      fin.position.set(i * 0.072, 0.42, 0);
      rg.add(fin);
    }
    group.add(rg);
  };
  addRadiator(-2.22, 11.06);
  addRadiator(3.26, 11.06);

  // Side Desk & Filing Cabinet in Reception
  const sideDesk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.86, 0.68)), propMats.darkTrim);
  sideDesk.position.set(-3.82, 0.43, 11.36);
  group.add(sideDesk);
  const sideDeskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.82, 0.05, 0.74)), propMats.weatheredWood);
  sideDeskTop.position.set(-3.82, 0.885, 11.36);
  group.add(sideDeskTop);
  colliders.push({ minX: -4.8, maxX: -2.86, minZ: 10.9, maxZ: 11.78 });

  const fileCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 1.18, 0.56)), propMats.rustedMetal);
  fileCab.position.set(2.15, 0.59, 11.24);
  group.add(fileCab);
  colliders.push({ minX: 1.66, maxX: 2.64, minZ: 10.9, maxZ: 11.56 });

  // North Glass Double Doors -> Cross Corridor
  const northDoors = createReceptionNorthDoors(propMats, new THREE.Vector3(0, 0, 10.82));
  group.add(northDoors.group);
  doors.push(...northDoors.doors);

  // Hanging ceiling beams & lamps
  for (const [lx, lz, tilt] of [
    [-2.55, 16, 0.08],
    [0, 16.6, -0.05],
    [2.55, 16, 0.12],
  ]) {
    const rod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6)), propMats.rustedMetal);
    rod.position.set(lx, 7.37, lz);
    rod.rotation.z = tilt;
    group.add(rod);
    const bar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.035, 0.09)), propMats.rustedMetal);
    bar.position.set(lx + Math.sin(tilt) * 0.18, 7.16, lz);
    bar.rotation.z = tilt * 1.4;
    group.add(bar);
  }

  // Warm dim tungsten atrium fill lights (critical for PS2 readability)
  for (const [lx, ly, lz, inten] of [
    [-2.15, 3.05, 15.2, 0.95],
    [2.15, 3.05, 17.1, 0.85],
    [0, 2.95, 20.0, 0.65],
  ]) {
    const pl = new THREE.PointLight(0xffcf94, inten, 11, 1.6);
    pl.position.set(lx, ly, lz);
    group.add(pl);
    receptionLights.push(pl);
  }

  // Moonlight window spills
  for (const sx of [-3.25, 3.25]) {
    const spot = new THREE.SpotLight(0x7e929b, 0.85, 13, Math.PI / 3.1, 0.9, 1.7);
    spot.position.set(sx, 2.38, 11.32);
    spot.target.position.set(sx * 0.25, 0.2, 17.4);
    group.add(spot);
    group.add(spot.target);
    windowSpillLights.push(spot);
  }

  // ================== TWO-STORY ATRIUM GALLERY & WALKABLE MEZZANINE ==================
  const RC = 7.6;
  const GY = 3.96;
  const SL = 3.56;
  const ZN = 10.89;
  const ZS = 21.69;
  const XW = 4.989;
  const DZ = 0.2;
  const VX = 3.3;
  const VZ0 = 12.9 + DZ;
  const VZ1 = 19.5 + DZ;
  const ZB0 = 10.71;
  const ZB1 = 22.24;
  const ZM = (ZB0 + ZB1) / 2;
  const ZL = ZB1 - ZB0;

  const ironMat = createPs2Phong({ color: 0x24403a, shininess: 18 }, materials);
  const ironDarkMat = createPs2Phong({ color: 0x1b2d29, shininess: 14 }, materials);
  const glassAtriumMat = createPs2Lambert({ color: 0x101c22, emissive: 0x1a2f38, emissiveIntensity: 0.48 }, materials);

  const addAtriumBox = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    tileSize = 0,
  ) => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    if (tileSize > 0) applyBoxUvTiling(geo, w, h, d, tileSize);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Textured Upper Mezzanine Walls & Coffered Ceiling (cleanly clear of exterior facade & wings)
  const wH = RC - 3.72;
  addAtriumBox(10.0, wH, 0.18, propMats.mezzanineWall, 0, 3.72 + wH / 2, 10.8, 2.6);
  for (const sx of [-1, 1]) {
    addAtriumBox(0.24, wH, ZL - 0.36, propMats.mezzanineWall, sx * (XW + 0.14), 3.72 + wH / 2, ZM, 2.6);
  }
  addAtriumBox(10.5, 0.18, ZL, propMats.mezzanineCeiling, 0, RC + 0.09, ZM, 2.8);
  addAtriumBox(10.0, wH, 0.24, propMats.mezzanineWall, 0, 3.72 + wH / 2, 22.0, 2.6);

  // Textured Walkable Mezzanine Parquet Deck (y top = GY = 3.96)
  const dH = GY - SL;
  const sy = (SL + GY) / 2;
  const deckX = XW - 0.02;
  addAtriumBox(deckX * 2, dH, VZ0 - ZN - 0.02, propMats.mezzanineFloor, 0, sy, (ZN + VZ0) / 2, 2.2);
  addAtriumBox(deckX * 2, dH, ZS - VZ1 - 0.02, propMats.mezzanineFloor, 0, sy, (VZ1 + ZS) / 2, 2.2);
  for (const sx of [-1, 1]) {
    addAtriumBox(deckX - VX, dH, VZ1 - VZ0 - 0.02, propMats.mezzanineFloor, sx * ((VX + deckX) / 2), sy, (VZ0 + VZ1) / 2, 2.2);
  }

  // Mezzanine Return Portal -> Back to 1º Andar (at North center z = 10.94, y = GY)
  const mezReturnDoor = createStairwellPortalDoor(
    'door-mezanino-return',
    propMats,
    new THREE.Vector3(0, GY, 10.94),
    1.86,
    2.36,
    0,
  );
  mezReturnDoor.locked = false;
  group.add(mezReturnDoor.group);
  mezzanineColliders.push({ minX: -1.12, maxX: 1.12, minZ: 10.7, maxZ: 11.18 });

  const mezRetMat = drawBrassSignMaterial('1º ANDAR · GALERIA', 'RETORNAR [E]', materials, 0.18);
  const mezRetBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.42, 0.06)), propMats.darkTrim);
  mezRetBack.position.set(0, GY + 2.98, 10.96);
  group.add(mezRetBack);
  const mezRetFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.74, 0.32)), mezRetMat);
  mezRetFace.position.set(0, GY + 2.98, 11.0);
  group.add(mezRetFace);

  // Central Atrium Void Balustrade + Void Collider so player walks safely around the railing
  mezzanineColliders.push({ minX: -3.38, maxX: 3.38, minZ: 13.02, maxZ: 19.78 });
  const railSpanX = VX * 2;
  const railSpanZ = VZ1 - VZ0;
  for (const zz of [VZ0, VZ1]) {
    addAtriumBox(railSpanX, 0.06, 0.07, ironMat, 0, GY + 0.94, zz);
    addAtriumBox(railSpanX, 0.04, 0.06, ironMat, 0, GY + 0.1, zz);
    const nBars = Math.round(railSpanX / 0.14);
    for (let i = 1; i < nBars; i++) {
      addAtriumBox(0.02, 0.8, 0.02, ironDarkMat, -VX + (i * railSpanX) / nBars, GY + 0.52, zz);
    }
  }
  for (const xx of [-VX, VX]) {
    addAtriumBox(0.07, 0.06, railSpanZ, ironMat, xx, GY + 0.94, (VZ0 + VZ1) / 2);
    addAtriumBox(0.06, 0.04, railSpanZ, ironMat, xx, GY + 0.1, (VZ0 + VZ1) / 2);
    const nBars = Math.round(railSpanZ / 0.14);
    for (let i = 1; i < nBars; i++) {
      addAtriumBox(0.02, 0.8, 0.02, ironDarkMat, xx, GY + 0.52, VZ0 + (i * railSpanZ) / nBars);
    }
  }

  // 12 Two-Story Cast-Iron Columns (Ground colliders + Upper mezzanine colliders)
  const cols: [number, number][] = [];
  for (const zz of [VZ0, VZ1]) for (const xx of [-VX, -1.1, 1.1, VX]) cols.push([xx, zz]);
  for (const xx of [-VX, VX]) for (const cz of [15.1, 17.3]) cols.push([xx, cz + DZ]);

  const gBase = trackGeo(new THREE.BoxGeometry(0.28, 0.16, 0.28));
  const gShaft = trackGeo(new THREE.CylinderGeometry(0.085, 0.095, 2.2, 8));
  const gMid = trackGeo(new THREE.BoxGeometry(0.22, GY - 2.55, 0.22));
  const gUp = trackGeo(new THREE.CylinderGeometry(0.08, 0.085, RC - GY, 8));

  for (const [cx, cz] of cols) {
    const b = new THREE.Mesh(gBase, ironMat);
    b.position.set(cx, 0.08, cz);
    group.add(b);
    const sh = new THREE.Mesh(gShaft, ironMat);
    sh.position.set(cx, 1.35, cz);
    sh.castShadow = true;
    group.add(sh);
    const md = new THREE.Mesh(gMid, ironMat);
    md.position.set(cx, (2.55 + GY) / 2, cz);
    group.add(md);
    const up = new THREE.Mesh(gUp, ironMat);
    up.position.set(cx, (GY + RC) / 2, cz);
    group.add(up);
    colliders.push({ minX: cx - 0.17, maxX: cx + 0.17, minZ: cz - 0.17, maxZ: cz + 0.17 });
    mezzanineColliders.push({ minX: cx - 0.16, maxX: cx + 0.16, minZ: cz - 0.16, maxZ: cz + 0.16 });
  }

  // South Mezzanine Overlook Reading Table + Armchair + 9th Archival Document
  addAtriumBox(1.55, 0.06, 0.78, propMats.weatheredWood, 0, GY + 0.74, 20.85);
  for (const dx of [-0.66, 0.66]) {
    for (const dz of [-0.3, 0.3]) {
      addAtriumBox(0.07, 0.72, 0.07, propMats.darkTrim, dx, GY + 0.36, 20.85 + dz);
    }
  }
  const mezLampBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.09, 0.04, 10)), propMats.tarnishedBrass);
  mezLampBase.position.set(0.45, GY + 0.79, 20.85);
  group.add(mezLampBase);
  const mezLampShade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.12, 0.14)), propMats.stairwellGlowGlass);
  mezLampShade.position.set(0.45, GY + 1.0, 20.85);
  group.add(mezLampShade);
  group.add(createInspectableDocProp('doc-mezzanine-watch', propMats, new THREE.Vector3(-0.18, GY + 0.78, 20.85), 0.2));

  const mezChair = createChair('mezzanine-watch-chair', propMats, new THREE.Vector3(0, GY, 20.22), Math.PI, 'upright');
  group.add(mezChair.group);
  mezzanineColliders.push({ minX: -0.92, maxX: 0.92, minZ: 20.02, maxZ: 21.32 });

  // North-West & North-East Mezzanine Bookcases + Side Overlook Bench + Sealed Upper Wing Doors
  for (const sx of [-1, 1]) {
    addAtriumBox(0.54, 2.05, 1.35, propMats.darkTrim, sx * 4.68, GY + 1.025, 12.15);
    mezzanineColliders.push({
      minX: sx < 0 ? -4.98 : 4.34,
      maxX: sx < 0 ? -4.34 : 4.98,
      minZ: 11.42,
      maxZ: 12.88,
    });

    // Sealed upper corridor doorway matching architectural symmetry (offset cleanly inside mezzanine wall)
    const sealedDoor = createSingleDoor(
      sx < 0 ? 'door-mez-west-locked' : 'door-mez-east-locked',
      propMats,
      0,
      1,
      new THREE.Vector3(sx * 4.86, GY, 16.35),
      sx < 0 ? Math.PI / 2 : -Math.PI / 2,
    );
    sealedDoor.locked = true;
    group.add(sealedDoor.group);
    const mezSignMat = drawBrassSignMaterial(
      sx < 0 ? 'ALA OESTE · SUPERIOR' : 'DIRETORIA · SELADA',
      'ACESSO BLOQUEADO',
      materials,
      0.14,
    );
    const mBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.34, 0.04)), propMats.darkTrim);
    mBack.position.set(sx * 4.88, GY + 2.84, 16.35);
    mBack.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(mBack);
    const mFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.08, 0.26)), mezSignMat);
    mFace.position.set(sx * 4.84, GY + 2.84, 16.35);
    mFace.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(mFace);
  }

  // Warm tungsten upper mezzanine lights so gallery walls, parquet & ceiling read cleanly from both levels
  for (const [mx, my, mz, inten] of [
    [-4.1, GY + 2.45, 13.5, 0.72],
    [4.1, GY + 2.45, 13.5, 0.72],
    [-4.1, GY + 2.45, 19.2, 0.72],
    [4.1, GY + 2.45, 19.2, 0.72],
    [0, GY + 1.55, 20.6, 0.65],
  ]) {
    const ml = new THREE.PointLight(0xffcf94, inten, 10.5, 1.6);
    ml.position.set(mx, my, mz);
    ml.userData.baseIntensity = inten;
    group.add(ml);
    receptionLights.push(ml);
  }

  // Arched Upper Windows (instanced, mounted cleanly proud of atrium walls with glass offset from frame)
  const archWins: [number, number, number][] = [];
  for (const cx of [-2.2, 0, 2.2]) {
    archWins.push([cx, ZN + 0.05, 0]);
    archWins.push([cx, 21.83, Math.PI]);
  }
  for (const cz of [14.0, 18.4].map((v) => v + DZ)) {
    archWins.push([-XW + 0.05, cz, Math.PI / 2]);
    archWins.push([XW - 0.05, cz, -Math.PI / 2]);
  }
  const archFrameGeo = trackGeo(new THREE.BoxGeometry(1.26, 1.82, 0.06));
  const archGlassGeo = trackGeo(new THREE.BoxGeometry(1.06, 1.64, 0.03));
  const archFrameInst = new THREE.InstancedMesh(archFrameGeo, ironMat, archWins.length);
  const archGlassInst = new THREE.InstancedMesh(archGlassGeo, glassAtriumMat, archWins.length);
  const dummy = new THREE.Object3D();
  archWins.forEach(([x, z, ry], i) => {
    dummy.position.set(x, 6.0, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    archFrameInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x + Math.sin(ry) * 0.035, 6.0, z + Math.cos(ry) * 0.035);
    dummy.updateMatrix();
    archGlassInst.setMatrixAt(i, dummy.matrix);
  });
  archFrameInst.instanceMatrix.needsUpdate = true;
  archFrameInst.computeBoundingSphere();
  archGlassInst.instanceMatrix.needsUpdate = true;
  archGlassInst.computeBoundingSphere();
  group.add(archFrameInst, archGlassInst);

  // ================== LATERAL WINGS (ALA LESTE & ALA OESTE) ==================
  const wingWallMat = createPs2Lambert({ map: textures.receptionWall, color: 0xcfc8ba }, materials);
  const wingFloorMat = createPs2Lambert({ map: textures.receptionFloor, color: 0xd0cabd }, materials);
  const wingCeilMat = createPs2Lambert({ color: 0x524b41 }, materials);

  const addWingWall = (cx: number, cz: number, w: number, d: number, collide = true, y0 = 0.004, h = 3.692) => {
    const g = trackGeo(new THREE.BoxGeometry(w, h, d));
    applyBoxUvTiling(g, w, h, d, 2.6);
    const m = new THREE.Mesh(g, wingWallMat);
    m.position.set(cx, y0 + h / 2, cz);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
    if (collide) {
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
    return m;
  };

  // Side walls between reception and lateral wings (with 3 door openings)
  for (const sx of [-1, 1]) {
    const x = sx * 5.14;
    let curZ = 10.71;
    for (const c of [12.9, 16.35, 19.8]) {
      const len = c - 0.48 - curZ;
      if (len > 0.01) addWingWall(x, (curZ + c - 0.48) / 2, 0.24, len);
      addWingWall(x, c, 0.24, 0.96, false, 2.66, 1.036);
      curZ = c + 0.48;
    }
    addWingWall(x, (curZ + 22.3) / 2, 0.24, 22.3 - curZ);

    // Wing floor, ceiling, outer walls
    const fw = 10.3 - 4.9;
    const fd = 22.2 - 10.75;
    const fg = trackGeo(new THREE.PlaneGeometry(fw, fd));
    const fuv = fg.attributes.uv;
    for (let i = 0; i < fuv.count; i++) {
      fuv.setXY(i, (fuv.getX(i) * fw) / 2.94, (fuv.getY(i) * fd) / 2.94);
    }
    fuv.needsUpdate = true;
    const fl = new THREE.Mesh(fg, wingFloorMat);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(sx * 7.6, 0.018, 16.475);
    fl.receiveShadow = true;
    group.add(fl);

    const cl = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(5.5, 11.54)), wingCeilMat);
    cl.rotation.x = Math.PI / 2;
    cl.position.set(sx * 7.75, 3.715, 16.47);
    group.add(cl);

    // Outer wing walls strictly between x = 5.24 and 10.26 so corners never overlap
    addWingWall(sx * 10.38, 16.475, 0.24, 11.53);
    addWingWall(sx * 7.75, 10.8, 5.0, 0.18);
    addWingWall(sx * 7.75, 22.12, 5.0, 0.24);
  }

  // East Wing partitions (flush inside outer walls)
  addWingWall(6.9, 18.05, 3.3, 0.16);
  addWingWall(9.88, 18.05, 0.74, 0.16);
  addWingWall(9.04, 18.05, 0.96, 0.16, false, 2.66, 1.036);
  addWingWall(7.75, 14.65, 5.0, 0.16);
  addWingWall(7.82, 16.35, 0.12, 3.22);

  // West Wing partitions
  addWingWall(-7.75, 18.4, 5.0, 0.16);
  addWingWall(-7.75, 14.6, 5.0, 0.16);

  // Wing doors
  const addWingDoor = (id: string, x: number, z: number, ry: number) => {
    const d = createSingleDoor(id, propMats, 0, 1, new THREE.Vector3(x, 0, z), ry);
    group.add(d.group);
    doors.push(d);
  };
  addWingDoor('door-wing-e-sala', 5.12, 19.8, -Math.PI / 2);
  addWingDoor('door-wing-e-deposito', 5.12, 16.35, -Math.PI / 2);
  addWingDoor('door-wing-e-seguranca', 5.12, 12.9, -Math.PI / 2);
  addWingDoor('door-wing-w-arquivo', -5.12, 19.8, Math.PI / 2);
  addWingDoor('door-wing-w-administracao', -5.12, 16.35, Math.PI / 2);
  addWingDoor('door-wing-w-triagem', -5.12, 12.9, Math.PI / 2);
  addWingDoor('door-wing-e-wc', 9.04, 18.05, 0);

  // Wing Signs
  const addWingSign = (text: string, x: number, y: number, z: number, ry: number, wd: number) => {
    const mat = drawBrassSignMaterial(text, 'TÉRREO', materials, 0.12);
    const sg = new THREE.Group();
    sg.position.set(x, y, z);
    sg.rotation.y = ry;
    sg.add(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(wd + 0.06, wd / 4 + 0.06, 0.04)), propMats.darkTrim));
    const face = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(wd, wd / 4)), mat);
    face.position.z = 0.022;
    sg.add(face);
    group.add(sg);
  };
  addWingSign('SALA DE ESPERA', 4.97, 3.05, 19.8, -Math.PI / 2, 1.12);
  addWingSign('DEPÓSITO · LIMPEZA', 4.97, 3.05, 16.35, -Math.PI / 2, 1.12);
  addWingSign('SEGURANÇA · ACESSO', 4.97, 3.05, 12.9, -Math.PI / 2, 1.12);
  addWingSign('ARQUIVO DE PRONTUÁRIOS', -4.97, 3.05, 19.8, Math.PI / 2, 1.12);
  addWingSign('ADMINISTRAÇÃO · DIREÇÃO', -4.97, 3.05, 16.35, Math.PI / 2, 1.12);
  addWingSign('TRIAGEM · AVALIAÇÃO', -4.97, 3.05, 12.9, Math.PI / 2, 1.12);
  addWingSign('WC PÚBLICO', 9.04, 2.95, 18.15, 0, 0.8);

  // Wing Furniture
  const addFurnBench = (x: number, z: number, len: number, ry: number, hwBox: number, hdBox: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.06, 0.4)), propMats.weatheredWood);
    seat.position.y = 0.46;
    g.add(seat);
    const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.5, 0.05)), propMats.weatheredWood);
    back.position.set(0, 0.74, -0.2);
    g.add(back);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.44, 0.36)), propMats.darkTrim);
      leg.position.set(s * (len / 2 - 0.1), 0.22, 0);
      g.add(leg);
    }
    group.add(g);
    colliders.push({ minX: x - hwBox, maxX: x + hwBox, minZ: z - hdBox, maxZ: z + hdBox });
  };

  const addFurnDesk = (x: number, z: number, len: number, ry: number, hwBox: number, hdBox: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.05, 0.8)), propMats.weatheredWood);
    top.position.y = 0.76;
    g.add(top);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.74, 0.74)), propMats.darkTrim);
      leg.position.set(s * (len / 2 - 0.05), 0.37, 0);
      g.add(leg);
    }
    group.add(g);
    colliders.push({ minX: x - hwBox, maxX: x + hwBox, minZ: z - hdBox, maxZ: z + hdBox });
  };

  const addFurnShelf = (x: number, z: number, len: number, ry: number, depth: number, hwBox: number, hdBox: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 2.05, depth)), propMats.rustedMetal);
      st.position.set(s * (len / 2 - 0.025), 1.025, 0);
      g.add(st);
    }
    for (const y of [0.12, 0.62, 1.12, 1.62, 2.02]) {
      const sh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.04, depth)), propMats.weatheredWood);
      sh.position.y = y;
      g.add(sh);
    }
    group.add(g);
    colliders.push({ minX: x - hwBox, maxX: x + hwBox, minZ: z - hdBox, maxZ: z + hdBox });
  };

  // East Wing enriched props
  addFurnBench(7.4, 21.55, 1.6, Math.PI, 0.8, 0.22);
  addFurnBench(9.4, 21.55, 1.6, Math.PI, 0.8, 0.22);
  addFurnBench(10.02, 20.2, 1.9, -Math.PI / 2, 0.22, 0.95);
  // Waiting room low magazine table
  const waitTable = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.44, 0.56)), propMats.weatheredWood);
  waitTable.position.set(7.9, 0.22, 19.75);
  group.add(waitTable);
  const magPaper = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.28, 0.22)), propMats.chartPaper);
  magPaper.rotation.x = -Math.PI / 2;
  magPaper.rotation.z = 0.25;
  magPaper.position.set(7.9, 0.445, 19.75);
  group.add(magPaper);
  colliders.push({ minX: 7.4, maxX: 8.4, minZ: 19.45, maxZ: 20.05 });

  addFurnShelf(6.7, 14.95, 2.0, 0, 0.4, 1.0, 0.2);
  addFurnShelf(7.57, 17.15, 1.4, Math.PI / 2, 0.35, 0.18, 0.7);
  // Depósito crates
  const crate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.55, 0.62)), propMats.weatheredWood);
  crate.position.set(5.9, 0.275, 17.25);
  group.add(crate);
  colliders.push({ minX: 5.58, maxX: 6.22, minZ: 16.92, maxZ: 17.58 });

  // WC Público porcelain basin & stall divider
  const sink = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.82, 0.52)), propMats.stainedCanvas);
  sink.position.set(9.95, 0.41, 15.6);
  group.add(sink);
  const stall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 2.05, 0.06)), propMats.darkTrim);
  stall.position.set(9.65, 1.025, 16.7);
  group.add(stall);
  colliders.push({ minX: 9.05, maxX: 10.25, minZ: 16.64, maxZ: 16.76 });

  addFurnDesk(8.7, 11.55, 1.9, 0, 0.95, 0.4);
  // Segurança electrical breaker panel
  const breaker = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.92, 0.68)), propMats.rustedMetal);
  breaker.position.set(10.2, 1.62, 12.8);
  group.add(breaker);
  const breakerLamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.09, 0.08, 0.08)), propMats.stairwellGlowGlass);
  breakerLamp.position.set(10.18, 1.96, 12.8);
  group.add(breakerLamp);

  const secChair = createChair('wing-e-sec-chair', propMats, new THREE.Vector3(8.7, 0, 12.3), Math.PI, 'upright');
  group.add(secChair.group);
  nudgeProps.push(secChair);
  colliders.push({ minX: 8.46, maxX: 8.94, minZ: 12.06, maxZ: 12.54 });

  // West Wing enriched props
  addFurnShelf(-10.0, 19.9, 2.4, Math.PI / 2, 0.45, 0.23, 1.2);
  addFurnShelf(-8.1, 19.9, 2.2, Math.PI / 2, 0.45, 0.23, 1.1);
  addFurnShelf(-8.7, 21.68, 2.4, 0, 0.45, 1.2, 0.23);
  addFurnDesk(-9.0, 16.5, 1.9, Math.PI / 2, 0.4, 0.95);
  const admChair = createChair('wing-w-adm-chair', propMats, new THREE.Vector3(-8.15, 0, 16.5), -Math.PI / 2, 'upright');
  group.add(admChair.group);
  nudgeProps.push(admChair);
  colliders.push({ minX: -8.39, maxX: -7.91, minZ: 16.26, maxZ: 16.74 });

  const stretcherTriagem = createStretcher('stretcher-triagem', propMats, new THREE.Vector3(-8.6, 0, 12.3), 0.05);
  group.add(stretcherTriagem.group);
  nudgeProps.push(stretcherTriagem);
  colliders.push({ minX: -9.02, maxX: -8.18, minZ: 11.34, maxZ: 13.26 });

  const cartTriagem = createMedicalCart('cart-triagem', propMats, new THREE.Vector3(-9.6, 0, 14.0), 0.3);
  group.add(cartTriagem.group);
  nudgeProps.push(cartTriagem);
  colliders.push({ minX: -9.96, maxX: -9.24, minZ: 13.64, maxZ: 14.36 });

  // Folding canvas privacy screen in Triagem
  const screenLeaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 1.78, 1.45)), propMats.stainedCanvas);
  screenLeaf.position.set(-7.15, 0.89, 13.15);
  screenLeaf.rotation.y = 0.28;
  group.add(screenLeaf);
  colliders.push({ minX: -7.45, maxX: -6.85, minZ: 12.4, maxZ: 13.9 });

  addFurnDesk(-7.0, 11.25, 1.4, 0, 0.7, 0.4);

  // Wing lighting across all 6 rooms
  for (const [wx, wz] of [
    [7.75, 19.8],
    [7.75, 16.35],
    [7.75, 12.9],
    [-7.75, 19.8],
    [-7.75, 16.35],
    [-7.75, 12.9],
  ]) {
    const wl = new THREE.PointLight(0xd9c298, 0.48, 7.5, 1.8);
    wl.position.set(wx, 3.25, wz);
    wl.userData.baseIntensity = 0.48;
    group.add(wl);
    receptionLights.push(wl);
  }

  return {
    group,
    doors,
    nudgeProps,
    colliders,
    mezzanineColliders,
    capsules,
    windowSpillLights,
    receptionLights,
    materials,
    geometries,
    ringBell,
    update: (dt, moonlightFactor) => {
      if (bellAnim > 0) {
        bellAnim = Math.max(0, bellAnim - dt * 5.2);
        bellPin.position.y = 0.078 - Math.sin(bellAnim * Math.PI) * 0.011;
      }
      for (const s of windowSpillLights) {
        s.intensity = 0.85 * moonlightFactor;
      }
    },
  };
}
