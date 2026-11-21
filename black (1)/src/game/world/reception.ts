import * as THREE from 'three';
import { createBrassSignMaterial, createPs2Lambert, createPs2Phong, PropMaterialBank } from '../materials';
import {
  applyBoxUvTiling,
  applyPlaneOrSlabUv,
  createChair,
  createDrawerChest,
  createHideCabinet,
  createInspectableDocProp,
  createReceptionNorthDoors,
  createSingleDoor,
  createStairwellPortalDoor,
  createStretcher,
  createMedicalCart,
  tagInteractable,
} from '../props';
import { BlackwoodTextureBank } from '../textures';
import { AABBCollider, CapsuleCollider, DoorState, DrawerState, HideCabinetState, NudgeProp } from '../types';

export interface ReceptionBuildResult {
  group: THREE.Group;
  doors: DoorState[];
  drawers: DrawerState[];
  hideCabinets: HideCabinetState[];
  nudgeProps: NudgeProp[];
  colliders: AABBCollider[];
  mezzanineColliders: AABBCollider[];
  capsules: CapsuleCollider[];
  windowSpillLights: THREE.SpotLight[];
  receptionLights: THREE.PointLight[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
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

export function buildReceptionAndWings(
  propMats: PropMaterialBank,
  textures: BlackwoodTextureBank,
): ReceptionBuildResult {
  const group = new THREE.Group();
  const doors: DoorState[] = [];
  const drawers: DrawerState[] = [];
  const hideCabinets: HideCabinetState[] = [];
  const nudgeProps: NudgeProp[] = [];
  const colliders: AABBCollider[] = [];
  const mezzanineColliders: AABBCollider[] = [];
  const capsules: CapsuleCollider[] = [];
  const windowSpillLights: THREE.SpotLight[] = [];
  const receptionLights: THREE.PointLight[] = [];
  const materials: THREE.Material[] = [];
  const createdTextures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // Architectural Material Palette for the 1924 Reception Atrium
  const deskBodyMat = createPs2Lambert({ map: textures.receptionDado, color: 0x6a533f, side: THREE.DoubleSide }, materials);
  const dadoMat = createPs2Lambert({ map: textures.receptionDado, color: 0xd6cfc2 }, materials);
  const stonePierMat = createPs2Lambert({ map: textures.stoneTrim, color: 0x747066 }, materials);
  const pierShaftMat = createPs2Lambert({ map: textures.mezzanineWall, color: 0x5c5b50 }, materials);
  const runnerCarpetMat = createPs2Lambert(
    {
      color: 0x451f1c,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    },
    materials,
  );
  const carpetBorderMat = createPs2Lambert(
    {
      color: 0x735b36,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    },
    materials,
  );
  const windowMat = createPs2Lambert(
    { map: textures.windowGlass, color: 0x8ea4b2, emissive: 0x263944, emissiveIntensity: 0.45 },
    materials,
  );
  const curtainMat = createPs2Lambert(
    { map: textures.curtain, color: 0x5d443c, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide },
    materials,
  );
  const ledgerMat = createPs2Lambert({ map: textures.intakeLedger }, materials);
  const clockDialMat = createPs2Lambert({ map: textures.clockFace }, materials);
  const darkMetalMat = createPs2Phong({ color: 0x222625, shininess: 22 }, materials);
  const ironBalusterMat = createPs2Phong({ color: 0x1d2624, shininess: 18 }, materials);
  const lanternGlowMat = createPs2Lambert(
    { color: 0xffe6b3, emissive: 0xffbf66, emissiveIntensity: 1.05 },
    materials,
  );
  const emeraldShadeMat = createPs2Lambert(
    { color: 0x2c6e49, emissive: 0x1e4a2f, emissiveIntensity: 0.45, side: THREE.DoubleSide },
    materials,
  );
  const foliageMat = createPs2Lambert({ color: 0x2a3529 }, materials);
  const blackCoreMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  materials.push(blackCoreMat);

  const recFloorMat = createPs2Lambert({ map: textures.receptionFloor, color: 0xd8d4ca }, materials);
  const recWallMat = createPs2Lambert({ map: textures.receptionWall, color: 0xd8d2c6, side: THREE.DoubleSide }, materials);

  // ================== HELPER: ANTI-SHIMMER FRAMED BRASS SIGN ==================
  const addFramedSign = (
    headline: string,
    detail: string,
    pos: { x: number; y: number; z: number },
    rotY: number,
    width: number,
    height: number,
    emissive = 0.11,
  ) => {
    const signMat = createBrassSignMaterial(headline, detail, materials, createdTextures, {
      emissiveIntensity: emissive,
      headlineSize: 38,
      detailSize: 21,
    });
    const sg = new THREE.Group();
    sg.position.set(pos.x, pos.y, pos.z);
    sg.rotation.y = rotY;
    const backing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.05)), propMats.darkTrim);
    sg.add(backing);
    const face = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(width, height)), signMat);
    face.position.z = 0.038;
    sg.add(face);
    group.add(sg);
  };

  // Helper: Wall Sconce Fixture (warm brass backplate + arm + glowing globe)
  const addWallSconce = (x: number, y: number, z: number, rotY: number) => {
    const sc = new THREE.Group();
    sc.position.set(x, y, z);
    sc.rotation.y = rotY;
    const backplate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.28, 0.03)), propMats.tarnishedBrass);
    backplate.position.z = 0.015;
    sc.add(backplate);
    const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.035, 0.035, 0.16)), propMats.tarnishedBrass);
    arm.position.set(0, -0.02, 0.09);
    sc.add(arm);
    const cup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.035, 0.04, 8)), propMats.tarnishedBrass);
    cup.position.set(0, 0.02, 0.16);
    sc.add(cup);
    const globe = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.068, 8, 6)), lanternGlowMat);
    globe.position.set(0, 0.09, 0.16);
    sc.add(globe);
    group.add(sc);
  };

  // ================== GROUND FLOOR & RUNNERS ==================
  const recLen = 21.98 - 10.9;
  const recFloorGeo = trackGeo(new THREE.BoxGeometry(9.84, 0.024, recLen));
  applyBoxUvTiling(recFloorGeo, 9.84, 0.024, recLen, 2.94);
  const recFloor = new THREE.Mesh(recFloorGeo, recFloorMat);
  recFloor.position.set(0, 0.012, (10.9 + 21.98) / 2);
  recFloor.receiveShadow = true;
  group.add(recFloor);

  // South Entry & North Corridor Ceremonial Runners (cleanly proud of floor with polygonOffset)
  for (const [rz, rLen] of [
    [19.95, 3.2],
    [12.25, 2.3],
  ]) {
    const carpet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.78, 0.014, rLen)), runnerCarpetMat);
    carpet.position.set(0, 0.028, rz);
    carpet.receiveShadow = true;
    group.add(carpet);
    for (const sx of [-1, 1]) {
      const trimStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.016, rLen)), carpetBorderMat);
      trimStrip.position.set(sx * 0.85, 0.029, rz);
      group.add(trimStrip);
    }
  }

  // ================== PERIMETER WALL SKIN, WAINSCOTING & PORTAL ARCHITRAVES ==================
  const wallGaps = [12.9, 16.35, 19.8];
  const hw = 0.56;
  const Z0 = 10.91;
  const wallTotalLen = 21.99 - Z0;
  for (const sx of [-1, 1]) {
    let curZ = Z0;
    const addSkinSeg = (z0: number, z1: number) => {
      if (z1 - z0 < 0.02) return;
      const g = trackGeo(new THREE.BoxGeometry(0.026, 3.55, z1 - z0));
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

  // Sculpted Oak Dado Wainscoting + Pilasters between bays
  const addDado = (x: number, z: number, w: number, d: number) => {
    const panel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 1.24, d)), dadoMat);
    panel.position.set(x, 0.625, z);
    panel.receiveShadow = true;
    group.add(panel);
    const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.016, 0.06, d + 0.02)), propMats.darkTrim);
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
      addDado(sx * 4.925, (z0 + z1) / 2, 0.04, z1 - z0);
    }

    // Classical Dark-Oak Wing Doorway Architraves (jamb trims + lintel crowns)
    for (const dz of wallGaps) {
      for (const s of [-1, 1]) {
        const pil = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 2.74, 0.11)), propMats.darkTrim);
        pil.position.set(sx * 4.92, 1.37, dz + s * 0.54);
        group.add(pil);
      }
      const cornice = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.14, 1.24)), propMats.darkTrim);
      cornice.position.set(sx * 4.91, 2.75, dz);
      group.add(cornice);
    }

    // Decorative Wall Pilasters between wing doorways (creating rhythmic Victorian bays)
    for (const pz of [14.62, 18.08]) {
      const pBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.28, 0.28)), stonePierMat);
      pBase.position.set(sx * 4.9, 0.14, pz);
      group.add(pBase);
      const pShaft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 3.12, 0.22)), propMats.darkTrim);
      pShaft.position.set(sx * 4.91, 1.84, pz);
      group.add(pShaft);
      const pCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.16, 0.3)), propMats.darkTrim);
      pCap.position.set(sx * 4.89, 3.46, pz);
      group.add(pCap);
      addWallSconce(sx * 4.85, 2.38, pz, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  addDado(-3.04, 10.935, 3.84, 0.04);
  addDado(3.04, 10.935, 3.84, 0.04);
  addDado(-3.04, 21.955, 3.84, 0.04);
  addDado(3.04, 21.955, 3.84, 0.04);

  // ================== TALL FRAMED RECEPTION WINDOWS + DRAPES + RADIATORS ==================
  const addRecWindow = (x: number, y: number, z: number, ry: number, w: number, h: number, bars: boolean, withCurtains: boolean) => {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    wg.rotation.y = ry;

    const glass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w - 0.06, h - 0.06)), windowMat);
    glass.position.z = 0.018;
    wg.add(glass);

    const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.18, 0.1, 0.13)), propMats.darkTrim);
    top.position.set(0, h * 0.5 + 0.04, 0.055);
    wg.add(top);

    const sill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.22, 0.1, 0.2)), stonePierMat);
    sill.position.set(0, -h * 0.5 - 0.04, 0.085);
    wg.add(sill);

    for (const bx of [-w * 0.5 - 0.04, w * 0.5 + 0.04]) {
      const side = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, h, 0.12)), propMats.darkTrim);
      side.position.set(bx, 0, 0.05);
      wg.add(side);
    }
    // Central wooden mullion crossbars
    const midH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w - 0.04, 0.04, 0.05)), propMats.darkTrim);
    midH.position.set(0, 0.15, 0.04);
    wg.add(midH);
    const midV = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, h - 0.04, 0.05)), propMats.darkTrim);
    midV.position.set(0, 0, 0.04);
    wg.add(midV);

    if (bars) {
      const barG = trackGeo(new THREE.CylinderGeometry(0.009, 0.009, h - 0.06, 6));
      for (const bx of [-0.46, -0.22, 0.22, 0.46]) {
        const bar = new THREE.Mesh(barG, propMats.rustedMetal);
        bar.position.set(bx, 0, 0.062);
        wg.add(bar);
      }
    }

    if (withCurtains) {
      for (const sx of [-1, 1]) {
        const drp = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.46, h + 0.18)), curtainMat);
        drp.position.set(sx * (w * 0.5 - 0.06), 0.02, 0.115);
        drp.rotation.y = sx * -0.14;
        wg.add(drp);
      }
    }
    group.add(wg);
  };

  // Positioned cleanly in outer bays (x = ±3.55) leaving center bays completely open for clock/directory
  addRecWindow(-3.55, 2.18, 10.92, 0, 1.44, 2.14, false, true);
  addRecWindow(3.55, 2.18, 10.92, 0, 1.44, 2.14, true, true);
  addRecWindow(-3.55, 2.16, 21.96, Math.PI, 1.44, 2.1, true, true);
  addRecWindow(3.55, 2.16, 21.96, Math.PI, 1.44, 2.1, true, true);

  const addRadiator = (x: number, z: number) => {
    const rg = new THREE.Group();
    rg.position.set(x, 0, z);
    const finGeo = trackGeo(new THREE.BoxGeometry(0.042, 0.68, 0.18));
    for (let i = -5; i <= 5; i++) {
      const fin = new THREE.Mesh(finGeo, darkMetalMat);
      fin.position.set(i * 0.072, 0.42, 0);
      rg.add(fin);
    }
    const pipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.92, 8)), propMats.tarnishedBrass);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.72, 0);
    rg.add(pipe);
    group.add(rg);
  };
  addRadiator(-2.22, 11.08);
  addRadiator(3.55, 11.08);

  // ================== STATELY VICTORIAN ADMISSION DESK (z = 15.85) ==================
  const deskZ = 15.85;
  const startA = -0.53 * Math.PI;
  const endA = 0.53 * Math.PI;
  const spanA = endA - startA;
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, deskZ);

  const outerArc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.26, 2.26, 0.88, 24, 1, true, startA, spanA)),
    deskBodyMat,
  );
  outerArc.position.set(0, 0.68, 0);
  outerArc.castShadow = true;
  outerArc.receiveShadow = true;
  deskGroup.add(outerArc);

  const innerArc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.72, 1.72, 1.09, 20, 1, true, startA, spanA)),
    propMats.weatheredWood,
  );
  innerArc.position.set(0, 0.545, 0);
  deskGroup.add(innerArc);

  const coreBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.7, 1.7, 0.24, 18, 1, true, startA, spanA)),
    blackCoreMat,
  );
  coreBase.position.set(0, 0.12, 0);
  deskGroup.add(coreBase);

  // Molded horizontal rails + vertical pilaster stiles around curved counter front
  for (const ty of [0.24, 0.68, 1.06]) {
    const molding = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(2.285, 2.285, 0.045, 24, 1, true, startA, spanA)),
      propMats.darkTrim,
    );
    molding.position.set(0, ty, 0);
    deskGroup.add(molding);
  }
  const stileGeo = trackGeo(new THREE.BoxGeometry(0.065, 0.84, 0.045));
  for (let i = 0; i <= 8; i++) {
    const a = startA + (i / 8) * spanA;
    const stile = new THREE.Mesh(stileGeo, propMats.darkTrim);
    stile.position.set(Math.sin(a) * 2.275, 0.66, Math.cos(a) * 2.275);
    stile.rotation.y = a;
    deskGroup.add(stile);
  }

  const counterTop = new THREE.Mesh(trackGeo(makeCurvedArcGeo(1.66, 2.36, 0.072, startA, endA, 24)), propMats.weatheredWood);
  counterTop.rotation.x = Math.PI / 2;
  counterTop.position.set(0, 1.15, 0);
  counterTop.castShadow = true;
  counterTop.receiveShadow = true;
  deskGroup.add(counterTop);

  const lowerShelf = new THREE.Mesh(
    trackGeo(makeCurvedArcGeo(1.24, 1.74, 0.038, startA + 0.15, endA - 0.15, 16)),
    propMats.weatheredWood,
  );
  lowerShelf.rotation.x = Math.PI / 2;
  lowerShelf.position.set(0, 0.75, 0);
  deskGroup.add(lowerShelf);

  const cheekGeo = trackGeo(new THREE.BoxGeometry(0.09, 1.13, 0.62));
  for (const ang of [startA, endA]) {
    const cheek = new THREE.Mesh(cheekGeo, propMats.darkTrim);
    cheek.position.set(Math.sin(ang) * 1.99, 0.565, Math.cos(ang) * 1.99);
    cheek.rotation.y = ang + Math.PI / 2;
    deskGroup.add(cheek);
  }

  // Brass Teller Grille Partition on Left & Right Wings (open central admission window [-0.25π..0.25π])
  const grillePostGeo = trackGeo(new THREE.CylinderGeometry(0.016, 0.02, 0.54, 8));
  const grilleBarGeo = trackGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.48, 6));
  for (const [wStart, wEnd] of [
    [-0.5 * Math.PI, -0.25 * Math.PI],
    [0.25 * Math.PI, 0.5 * Math.PI],
  ]) {
    const wingPosts = 3;
    for (let i = 0; i <= wingPosts; i++) {
      const a = wStart + (i / wingPosts) * (wEnd - wStart);
      const post = new THREE.Mesh(grillePostGeo, propMats.tarnishedBrass);
      post.position.set(Math.sin(a) * 2.18, 1.42, Math.cos(a) * 2.18);
      deskGroup.add(post);
      const finial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.024, 8, 6)), propMats.tarnishedBrass);
      finial.position.set(Math.sin(a) * 2.18, 1.71, Math.cos(a) * 2.18);
      deskGroup.add(finial);
    }
    const barSteps = 10;
    for (let j = 1; j < barSteps; j++) {
      const a = wStart + (j / barSteps) * (wEnd - wStart);
      const bar = new THREE.Mesh(grilleBarGeo, propMats.gunmetal);
      bar.position.set(Math.sin(a) * 2.18, 1.42, Math.cos(a) * 2.18);
      deskGroup.add(bar);
    }
    const topRail = new THREE.Mesh(
      trackGeo(makeCurvedArcGeo(2.155, 2.205, 0.028, wStart, wEnd, 10)),
      propMats.tarnishedBrass,
    );
    topRail.rotation.x = Math.PI / 2;
    topRail.position.set(0, 1.67, 0);
    deskGroup.add(topRail);
  }
  group.add(deskGroup);

  const capR = 1.99;
  for (let i = 0; i < 10; i++) {
    const a0 = startA + (i / 10) * spanA;
    const a1 = startA + ((i + 1) / 10) * spanA;
    capsules.push({
      x1: Math.sin(a0) * capR,
      z1: deskZ + Math.cos(a0) * capR,
      x2: Math.sin(a1) * capR,
      z2: deskZ + Math.cos(a1) * capR,
      radius: 0.35,
    });
  }

  // Interactive Brass Reception Bell
  const bellGroup = new THREE.Group();
  const bellA = 0.22;
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

  // Admission Ledger
  const ledgerGroup = new THREE.Group();
  const ledA = -0.18;
  ledgerGroup.position.set(Math.sin(ledA) * 1.98, 1.186, deskZ + Math.cos(ledA) * 1.98);
  ledgerGroup.rotation.y = ledA;
  const ledgerBook = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.024, 0.34)), ledgerMat);
  ledgerGroup.add(ledgerBook);
  tagInteractable(ledgerGroup, 'doc-reception-ledger');
  group.add(ledgerGroup);

  // Banker's Emerald Desk Lamp with glowing bulb + dedicated warm task PointLight
  const lampA = 0.42;
  const lampX = Math.sin(lampA) * 1.96;
  const lampZ = deskZ + Math.cos(lampA) * 1.96;
  const lampGroup = new THREE.Group();
  lampGroup.position.set(lampX, 1.162, lampZ);
  lampGroup.rotation.y = lampA - 0.35;
  const lBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.075, 0.09, 0.032, 12)), propMats.tarnishedBrass);
  lBase.position.y = 0.016;
  lampGroup.add(lBase);
  const lStem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.018, 0.24, 8)), propMats.tarnishedBrass);
  lStem.position.set(0, 0.14, -0.02);
  lStem.rotation.x = 0.16;
  lampGroup.add(lStem);
  const lShade = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8, 1, false, 0, Math.PI)), emeraldShadeMat);
  lShade.rotation.z = Math.PI / 2;
  lShade.position.set(0, 0.27, 0.02);
  lampGroup.add(lShade);
  const lBulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.035, 8, 6)), lanternGlowMat);
  lBulb.position.set(0, 0.245, 0.02);
  lampGroup.add(lBulb);
  group.add(lampGroup);

  // Desk Chair behind desk
  const deskChair = createChair('reception-desk-chair', propMats, new THREE.Vector3(-0.22, 0, 15.18), 0.42, 'upright');
  group.add(deskChair.group);
  nudgeProps.push(deskChair);
  colliders.push({ minX: -0.48, maxX: 0.05, minZ: 14.9, maxZ: 15.46 });

  // ================== GRANDFATHER CLOCK, KEY CABINET & ARCHITECTURAL PROPS ==================
  // Grandfather Clock at North-West bay (x = -2.02, z = 11.24)
  const gfClock = new THREE.Group();
  gfClock.position.set(-2.02, 0, 11.24);
  const gfBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.66, 0.56, 0.44)), propMats.darkTrim);
  gfBase.position.y = 0.28;
  gfClock.add(gfBase);
  const gfTrunk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 1.32, 0.36)), propMats.doorWood);
  gfTrunk.position.y = 1.22;
  gfClock.add(gfTrunk);
  const gfPendulum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10)), propMats.tarnishedBrass);
  gfPendulum.rotation.x = Math.PI / 2;
  gfPendulum.position.set(0, 1.05, 0.19);
  gfClock.add(gfPendulum);
  const gfHood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.64, 0.64, 0.42)), propMats.darkTrim);
  gfHood.position.y = 2.2;
  gfClock.add(gfHood);
  const gfDial = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.22, 16)), clockDialMat);
  gfDial.position.set(0, 2.22, 0.225);
  gfClock.add(gfDial);
  const gfCrown = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.72, 0.12, 0.48)), propMats.darkTrim);
  gfCrown.position.y = 2.58;
  gfClock.add(gfCrown);
  group.add(gfClock);
  colliders.push({ minX: -2.38, maxX: -1.66, minZ: 10.94, maxZ: 11.54 });

  // Key-rack Pigeonhole Cabinet & Filing Drawer at North-East bay (x = 2.02, z = 11.24)
  const keyCabinet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.14, 1.05, 0.52)), propMats.darkTrim);
  keyCabinet.position.set(2.02, 0.525, 11.24);
  group.add(keyCabinet);
  const keyBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.92, 0.06)), propMats.darkTrim);
  keyBoard.position.set(2.02, 1.88, 10.97);
  group.add(keyBoard);
  for (let row = 0; row < 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const hook = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.055, 0.035)), propMats.tarnishedBrass);
      hook.position.set(2.02 + col * 0.23, 2.02 - row * 0.32, 11.015);
      group.add(hook);
    }
  }
  colliders.push({ minX: 1.42, maxX: 2.62, minZ: 10.9, maxZ: 11.54 });

  // Side Admission Desk (NW corner)
  const sideDesk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.68, 0.86, 0.66)), propMats.darkTrim);
  sideDesk.position.set(-3.82, 0.43, 11.38);
  group.add(sideDesk);
  const sideDeskTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.76, 0.05, 0.72)), propMats.weatheredWood);
  sideDeskTop.position.set(-3.82, 0.885, 11.38);
  group.add(sideDeskTop);
  colliders.push({ minX: -4.76, maxX: -2.9, minZ: 10.9, maxZ: 11.78 });

  // Waiting Benches nestled cleanly between lateral doorways (z = 14.62 & 18.08) + Entrance Urn Planters
  for (const sx of [-1, 1]) {
    for (const bz of [14.62, 18.08]) {
      const bx = sx * 4.46;
      const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.055, 1.56)), propMats.weatheredWood);
      seat.position.set(bx, 0.45, bz);
      group.add(seat);
      const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.46, 1.56)), propMats.weatheredWood);
      back.position.set(bx + sx * 0.2, 0.7, bz);
      group.add(back);
      for (const dz of [-0.62, 0.62]) {
        const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.43, 0.06)), propMats.darkTrim);
        leg.position.set(bx, 0.215, bz + dz);
        group.add(leg);
      }
      colliders.push({ minX: bx - 0.28, maxX: bx + 0.28, minZ: bz - 0.82, maxZ: bz + 0.82 });
    }

    // 4-part Composite Stone & Bronze Urn Pedestals flanking the entrance aisle
    const ux = sx * 1.88;
    const uz = 21.18;
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.16, 0.48)), stonePierMat);
    plinth.position.set(ux, 0.08, uz);
    group.add(plinth);
    const shaft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.52, 0.36)), stonePierMat);
    shaft.position.set(ux, 0.42, uz);
    group.add(shaft);
    const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.08, 0.46)), propMats.darkTrim);
    cap.position.set(ux, 0.72, uz);
    group.add(cap);
    const urn = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.21, 0.11, 0.32, 12)), darkMetalMat);
    urn.position.set(ux, 0.92, uz);
    group.add(urn);
    const foliage = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.22, 0)), foliageMat);
    foliage.scale.set(1.15, 0.9, 1.15);
    foliage.position.set(ux, 1.14, uz);
    group.add(foliage);
    colliders.push({ minX: ux - 0.27, maxX: ux + 0.27, minZ: uz - 0.27, maxZ: uz + 0.27 });
  }

  // Directory Board mounted cleanly in wall bay (x = 1.94, width = 1.14 -> strictly clear of entrance jamb [1.13] & SE window [2.75])
  addFramedSign('PLANTA DO SANATÓRIO', 'TÉRREO · 1º ANDAR · MEZANINO', { x: 1.94, y: 1.92, z: 21.92 }, Math.PI, 1.14, 0.36, 0.1);

  // North Header Sign above Corridor Doors
  addFramedSign('CORREDOR CLÍNICO', 'ENFERMARIAS · CONSULTÓRIOS', { x: 0, y: 3.04, z: 10.95 }, 0, 2.28, 0.38, 0.11);

  // North Glass Double Doors -> Cross Corridor
  const northDoors = createReceptionNorthDoors(propMats, new THREE.Vector3(0, 0, 10.82));
  group.add(northDoors.group);
  doors.push(...northDoors.doors);

  // ================== TWO-STORY ATRIUM GALLERY & 4 MONUMENTAL CORNER PIERS ==================
  const RC = 7.6;
  const GY = 3.96;
  const SL = 3.56;
  const ZN = 10.89;
  const ZS = 21.69;
  const XW = 4.989;
  const VX = 3.35;
  const VZ0 = 13.05;
  const VZ1 = 19.65;
  const ZB0 = 10.71;
  const ZB1 = 22.24;
  const ZM = (ZB0 + ZB1) / 2;
  const ZL = ZB1 - ZB0;

  const glassAtriumMat = createPs2Lambert({ color: 0x13222b, emissive: 0x223b47, emissiveIntensity: 0.55 }, materials);

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

  // Textured Upper Mezzanine Walls & Coffered Ceiling
  const wH = RC - 3.72;
  addAtriumBox(10.0, wH, 0.18, propMats.mezzanineWall, 0, 3.72 + wH / 2, 10.8, 2.6);
  for (const sx of [-1, 1]) {
    addAtriumBox(0.24, wH, ZL - 0.36, propMats.mezzanineWall, sx * (XW + 0.14), 3.72 + wH / 2, ZM, 2.6);
  }
  addAtriumBox(10.5, 0.18, ZL, propMats.mezzanineCeiling, 0, RC + 0.09, ZM, 2.8);
  addAtriumBox(10.0, wH, 0.24, propMats.mezzanineWall, 0, 3.72 + wH / 2, 22.0, 2.6);

  // Coffered Dark-Oak Ceiling Beams across the Atrium (y = 7.36)
  for (const bz of [VZ0, (VZ0 + VZ1) * 0.5, VZ1]) {
    addAtriumBox(10.0, 0.28, 0.32, propMats.darkTrim, 0, RC - 0.14, bz);
  }
  for (const bx of [-VX, VX]) {
    addAtriumBox(0.3, 0.26, ZL - 0.4, propMats.darkTrim, bx, RC - 0.13, ZM);
  }

  // Walkable Mezzanine Parquet Deck (y top = GY = 3.96)
  const dH = GY - SL;
  const sy = (SL + GY) / 2;
  const deckX = XW - 0.02;
  addAtriumBox(deckX * 2, dH, VZ0 - ZN - 0.02, propMats.mezzanineFloor, 0, sy, (ZN + VZ0) / 2, 2.2);
  addAtriumBox(deckX * 2, dH, ZS - VZ1 - 0.02, propMats.mezzanineFloor, 0, sy, (VZ1 + ZS) / 2, 2.2);
  for (const sx of [-1, 1]) {
    addAtriumBox(deckX - VX, dH, VZ1 - VZ0 - 0.02, propMats.mezzanineFloor, sx * ((VX + deckX) / 2), sy, (VZ0 + VZ1) / 2, 2.2);
  }

  // Textured Coffered Ceiling Soffits beneath the Mezzanine Gallery (y = SL - 0.008)
  const addSoffit = (x0: number, x1: number, z0: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const g = applyPlaneOrSlabUv(trackGeo(new THREE.PlaneGeometry(w, d)), w, d, 2.4);
    const m = new THREE.Mesh(g, propMats.mezzanineCeiling);
    m.rotation.x = Math.PI / 2;
    m.position.set((x0 + x1) * 0.5, SL - 0.008, (z0 + z1) * 0.5);
    m.receiveShadow = true;
    group.add(m);
  };
  addSoffit(-deckX, deckX, ZN, VZ0);
  addSoffit(-deckX, deckX, VZ1, ZS);
  addSoffit(-deckX, -VX, VZ0, VZ1);
  addSoffit(VX, deckX, VZ0, VZ1);

  // Dark-Oak Void Fascia Molding & Corner Arcade Corbels
  const railSpanX = VX * 2;
  const railSpanZ = VZ1 - VZ0;
  for (const zz of [VZ0, VZ1]) {
    addAtriumBox(railSpanX + 0.36, 0.1, 0.14, propMats.darkTrim, 0, GY - 0.02, zz);
  }
  for (const xx of [-VX, VX]) {
    addAtriumBox(0.14, 0.1, railSpanZ + 0.36, propMats.darkTrim, xx, GY - 0.02, (VZ0 + VZ1) / 2);
  }

  // 4 Monumental Continuous Arcade Corner Piers (stone plinth + fluted timber shaft + stepped capital)
  const cornerPiers: [number, number][] = [
    [-VX, VZ0],
    [VX, VZ0],
    [-VX, VZ1],
    [VX, VZ1],
  ];
  const pierBaseGeo = trackGeo(new THREE.BoxGeometry(0.48, 0.42, 0.48));
  const pierBaseCapGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.09, 0.42));
  const pierLowShaftGeo = trackGeo(new THREE.BoxGeometry(0.32, 3.06, 0.32));
  const pierMidCapGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.18, 0.46));
  const pierDeckCollarGeo = trackGeo(new THREE.BoxGeometry(0.52, 0.24, 0.52));
  const pierUpShaftGeo = trackGeo(new THREE.BoxGeometry(0.26, RC - GY - 0.36, 0.26));
  const pierUpCapGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.2, 0.38));

  for (const [cx, cz] of cornerPiers) {
    const b = new THREE.Mesh(pierBaseGeo, stonePierMat);
    b.position.set(cx, 0.21, cz);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);

    const bc = new THREE.Mesh(pierBaseCapGeo, propMats.darkTrim);
    bc.position.set(cx, 0.465, cz);
    group.add(bc);

    const ls = new THREE.Mesh(pierLowShaftGeo, pierShaftMat);
    ls.position.set(cx, 2.04, cz);
    ls.castShadow = true;
    ls.receiveShadow = true;
    group.add(ls);

    const mc = new THREE.Mesh(pierMidCapGeo, propMats.darkTrim);
    mc.position.set(cx, 3.66, cz);
    group.add(mc);

    const dc = new THREE.Mesh(pierDeckCollarGeo, stonePierMat);
    dc.position.set(cx, 3.86, cz);
    group.add(dc);

    const us = new THREE.Mesh(pierUpShaftGeo, pierShaftMat);
    us.position.set(cx, GY + (RC - GY - 0.36) * 0.5, cz);
    us.castShadow = true;
    group.add(us);

    const uc = new THREE.Mesh(pierUpCapGeo, propMats.darkTrim);
    uc.position.set(cx, RC - 0.26, cz);
    group.add(uc);

    // Brass sconces on lower & upper pier faces looking into the atrium
    const dirX = cx < 0 ? 1 : -1;
    addWallSconce(cx + dirX * 0.16, 2.52, cz, cx < 0 ? Math.PI / 2 : -Math.PI / 2);
    addWallSconce(cx + dirX * 0.13, GY + 2.15, cz, cx < 0 ? Math.PI / 2 : -Math.PI / 2);

    colliders.push({ minX: cx - 0.25, maxX: cx + 0.25, minZ: cz - 0.25, maxZ: cz + 0.25 });
    mezzanineColliders.push({ minX: cx - 0.22, maxX: cx + 0.22, minZ: cz - 0.22, maxZ: cz + 0.22 });
  }

  // Ornate Wrought-Iron & Dark Oak Mezzanine Balustrade + Void Collider
  mezzanineColliders.push({ minX: -3.44, maxX: 3.44, minZ: 12.98, maxZ: 19.72 });
  for (const zz of [VZ0, VZ1]) {
    addAtriumBox(railSpanX, 0.065, 0.085, propMats.darkTrim, 0, GY + 0.96, zz);
    addAtriumBox(railSpanX, 0.045, 0.065, ironBalusterMat, 0, GY + 0.11, zz);
    const nBars = Math.round(railSpanX / 0.16);
    for (let i = 1; i < nBars; i++) {
      addAtriumBox(0.022, 0.82, 0.022, ironBalusterMat, -VX + (i * railSpanX) / nBars, GY + 0.53, zz);
    }
    // Mid-span decorative oak & brass newel post
    addAtriumBox(0.12, 1.0, 0.12, propMats.darkTrim, 0, GY + 0.5, zz);
    const fin = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 6)), propMats.tarnishedBrass);
    fin.position.set(0, GY + 1.05, zz);
    group.add(fin);
  }
  for (const xx of [-VX, VX]) {
    addAtriumBox(0.085, 0.065, railSpanZ, propMats.darkTrim, xx, GY + 0.96, (VZ0 + VZ1) / 2);
    addAtriumBox(0.065, 0.045, railSpanZ, ironBalusterMat, xx, GY + 0.11, (VZ0 + VZ1) / 2);
    const nBars = Math.round(railSpanZ / 0.16);
    for (let i = 1; i < nBars; i++) {
      addAtriumBox(0.022, 0.82, 0.022, ironBalusterMat, xx, GY + 0.53, VZ0 + (i * railSpanZ) / nBars);
    }
    addAtriumBox(0.12, 1.0, 0.12, propMats.darkTrim, xx, GY + 0.5, (VZ0 + VZ1) / 2);
    const fin = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 6)), propMats.tarnishedBrass);
    fin.position.set(xx, GY + 1.05, (VZ0 + VZ1) / 2);
    group.add(fin);
  }

  // Architectural RECEPÇÃO Banner mounted cleanly onto North Mezzanine Balcony Fascia (no floating mid-air crossbeam!)
  addFramedSign('RECEPÇÃO', 'ADMISSÃO · PRONTUÁRIOS · 1924', { x: 0, y: 3.74, z: VZ0 + 0.11 }, 0, 2.48, 0.44, 0.12);

  // ================== GRAND CENTRAL ATRIUM CHANDELIER ==================
  const chanGroup = new THREE.Group();
  chanGroup.position.set(0, 7.48, (VZ0 + VZ1) * 0.5);
  const cRosette = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.16, 0.08, 12)), propMats.tarnishedBrass);
  cRosette.position.y = -0.04;
  chanGroup.add(cRosette);
  const cRod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 2.85, 8)), darkMetalMat);
  cRod.position.y = -1.46;
  chanGroup.add(cRod);
  const cTierTop = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.56, 0.032, 6, 16)), propMats.tarnishedBrass);
  cTierTop.rotation.x = Math.PI / 2;
  cTierTop.position.y = -2.28;
  chanGroup.add(cTierTop);
  const cTierMain = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.06, 0.042, 8, 20)), darkMetalMat);
  cTierMain.rotation.x = Math.PI / 2;
  cTierMain.position.y = -2.86;
  chanGroup.add(cTierMain);
  const cBottomCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.18, 0.24, 10)), propMats.tarnishedBrass);
  cBottomCap.rotation.x = Math.PI;
  cBottomCap.position.y = -3.02;
  chanGroup.add(cBottomCap);

  const armGeo = trackGeo(new THREE.BoxGeometry(0.024, 0.024, 1.08));
  const globeGeo = trackGeo(new THREE.SphereGeometry(0.105, 8, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = new THREE.Mesh(armGeo, darkMetalMat);
    arm.position.set(Math.sin(a) * 0.54, -2.86, Math.cos(a) * 0.54);
    arm.rotation.y = a;
    chanGroup.add(arm);

    const cup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.055, 0.05, 8)), propMats.tarnishedBrass);
    cup.position.set(Math.sin(a) * 1.06, -2.79, Math.cos(a) * 1.06);
    chanGroup.add(cup);

    const globe = new THREE.Mesh(globeGeo, lanternGlowMat);
    globe.position.set(Math.sin(a) * 1.06, -2.68, Math.cos(a) * 1.06);
    chanGroup.add(globe);
  }
  const centerGlobe = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 10, 8)), lanternGlowMat);
  centerGlobe.position.y = -2.92;
  chanGroup.add(centerGlobe);
  group.add(chanGroup);

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
  addFramedSign('1º ANDAR · GALERIA', 'RETORNAR [E]', { x: 0, y: GY + 2.98, z: 10.96 }, 0, 1.76, 0.34, 0.11);

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
  const mezLampStem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.016, 0.2, 8)), propMats.tarnishedBrass);
  mezLampStem.position.set(0.45, GY + 0.9, 20.85);
  group.add(mezLampStem);
  const mezLampShade = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8, 1, false, 0, Math.PI)), emeraldShadeMat);
  mezLampShade.rotation.z = Math.PI / 2;
  mezLampShade.position.set(0.45, GY + 1.0, 20.85);
  group.add(mezLampShade);
  group.add(createInspectableDocProp('doc-mezzanine-watch', propMats, new THREE.Vector3(-0.18, GY + 0.78, 20.85), 0.2));

  const mezChair = createChair('mezzanine-watch-chair', propMats, new THREE.Vector3(0, GY, 20.22), Math.PI, 'upright');
  group.add(mezChair.group);
  mezzanineColliders.push({ minX: -0.92, maxX: 0.92, minZ: 20.02, maxZ: 21.32 });

  // North-West & North-East Mezzanine Bookcases + Sealed Upper Wing Doors
  for (const sx of [-1, 1]) {
    addAtriumBox(0.54, 2.05, 1.35, propMats.darkTrim, sx * 4.68, GY + 1.025, 12.15);
    mezzanineColliders.push({
      minX: sx < 0 ? -4.98 : 4.34,
      maxX: sx < 0 ? -4.34 : 4.98,
      minZ: 11.42,
      maxZ: 12.88,
    });

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
    addFramedSign(
      sx < 0 ? 'ALA OESTE · SUPERIOR' : 'DIRETORIA · SELADA',
      'ACESSO BLOQUEADO',
      { x: sx * 4.88, y: GY + 2.86, z: 16.35 },
      sx < 0 ? Math.PI / 2 : -Math.PI / 2,
      1.12,
      0.28,
      0.1,
    );
  }

  // Arched Upper Clerestory Windows (cleanly offset from walls, zero Z-fighting)
  const archWins: [number, number, number][] = [];
  for (const cx of [-2.2, 0, 2.2]) {
    archWins.push([cx, ZN + 0.06, 0]);
    archWins.push([cx, 21.82, Math.PI]);
  }
  for (const cz of [14.2, 18.5]) {
    archWins.push([-XW + 0.06, cz, Math.PI / 2]);
    archWins.push([XW - 0.06, cz, -Math.PI / 2]);
  }
  const archFrameGeo = trackGeo(new THREE.BoxGeometry(1.28, 1.84, 0.08));
  const archGlassGeo = trackGeo(new THREE.BoxGeometry(1.06, 1.62, 0.03));
  const archFrameInst = new THREE.InstancedMesh(archFrameGeo, ironBalusterMat, archWins.length);
  const archGlassInst = new THREE.InstancedMesh(archGlassGeo, glassAtriumMat, archWins.length);
  const dummy = new THREE.Object3D();
  archWins.forEach(([x, z, ry], i) => {
    dummy.position.set(x, 6.02, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    archFrameInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x + Math.sin(ry) * 0.048, 6.02, z + Math.cos(ry) * 0.048);
    dummy.updateMatrix();
    archGlassInst.setMatrixAt(i, dummy.matrix);
  });
  archFrameInst.instanceMatrix.needsUpdate = true;
  archFrameInst.computeBoundingSphere();
  archGlassInst.instanceMatrix.needsUpdate = true;
  archGlassInst.computeBoundingSphere();
  group.add(archFrameInst, archGlassInst);

  // ================== LAYERED ATRIUM & MEZZANINE DYNAMIC LIGHTING ==================
  const addReceptionPointLight = (
    x: number,
    y: number,
    z: number,
    color: number,
    inten: number,
    dist: number,
    decay = 1.55,
    flickerMode: 'steady' | 'occasional' | 'faulty' = 'steady',
    flickerSeed = 0,
  ) => {
    const pl = new THREE.PointLight(color, inten, dist, decay);
    pl.position.set(x, y, z);
    pl.userData.baseIntensity = inten;
    pl.userData.flickerMode = flickerMode;
    pl.userData.flickerSeed = flickerSeed;
    group.add(pl);
    receptionLights.push(pl);
    return pl;
  };

  // Ground Atrium Practical Lights (Central Chandelier + Banker's Desk Lamp + South/North Foyer Fills)
  addReceptionPointLight(0, 4.08, (VZ0 + VZ1) * 0.5, 0xffd092, 1.48, 26.0, 0.76, 'steady', 0.4);
  addReceptionPointLight(lampX, 1.52, lampZ, 0xffdba4, 1.18, 12.0, 0.88, 'steady', 1.2);
  addReceptionPointLight(0, 2.78, 20.1, 0xffcc88, 1.18, 18.5, 0.76, 'occasional', 3.7);
  addReceptionPointLight(0, 2.78, 12.2, 0xffc67d, 1.15, 18.5, 0.76, 'occasional', 7.1);

  // Mezzanine Warm Gallery Lights
  addReceptionPointLight(-4.1, GY + 2.35, 13.8, 0xffcf94, 1.15, 18.0, 0.76, 'occasional', 11.3);
  addReceptionPointLight(4.1, GY + 2.35, 13.8, 0xffcf94, 1.15, 18.0, 0.76, 'steady', 14.1);
  addReceptionPointLight(-4.1, GY + 2.35, 19.2, 0xffcf94, 1.15, 18.0, 0.76, 'steady', 17.5);
  addReceptionPointLight(4.1, GY + 2.35, 19.2, 0xffcf94, 1.15, 18.0, 0.76, 'occasional', 21.8);
  addReceptionPointLight(0.45, GY + 1.35, 20.6, 0xffd596, 1.12, 15.0, 0.84, 'steady', 24.4);

  // Cool Moonlight Window Spills (stronger warm/cool dual-tone architectural contrast)
  for (const sx of [-3.45, 3.45]) {
    const spot = new THREE.SpotLight(0x88b0cc, 1.15, 16.5, Math.PI / 2.8, 0.85, 1.15);
    spot.position.set(sx, 2.45, 11.35);
    spot.target.position.set(sx * 0.25, 0.15, 17.6);
    group.add(spot);
    group.add(spot.target);
    windowSpillLights.push(spot);
  }

  // ================== LATERAL WINGS (ALA LESTE & ALA OESTE) ==================
  const wingWallMat = createPs2Lambert({ map: textures.receptionWall, color: 0xcfc8ba }, materials);
  const wingFloorMat = createPs2Lambert({ map: textures.receptionFloor, color: 0xd0cabd }, materials);
  const wingCeilMat = createPs2Lambert({ map: textures.ceiling, color: 0xbcb3a4 }, materials);

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

    const wingCeilGeo = applyPlaneOrSlabUv(trackGeo(new THREE.PlaneGeometry(5.5, 11.54)), 5.5, 11.54, 2.6);
    const cl = new THREE.Mesh(wingCeilGeo, wingCeilMat);
    cl.rotation.x = Math.PI / 2;
    cl.position.set(sx * 7.75, 3.715, 16.47);
    cl.receiveShadow = true;
    group.add(cl);

    addWingWall(sx * 10.38, 16.475, 0.24, 11.53);
    addWingWall(sx * 7.75, 10.8, 5.0, 0.18);
    addWingWall(sx * 7.75, 22.12, 5.0, 0.24);
  }

  // East Wing partitions
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

  // Wing Signs (all mipmapped, linear-filtered, 3.8cm clear of backing)
  addFramedSign('SALA DE ESPERA', 'TÉRREO', { x: 4.92, y: 3.08, z: 19.8 }, -Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('DEPÓSITO · LIMPEZA', 'TÉRREO', { x: 4.92, y: 3.08, z: 16.35 }, -Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('SEGURANÇA · ACESSO', 'TÉRREO', { x: 4.92, y: 3.08, z: 12.9 }, -Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('ARQUIVO DE PRONTUÁRIOS', 'TÉRREO', { x: -4.92, y: 3.08, z: 19.8 }, Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('ADMINISTRAÇÃO · DIREÇÃO', 'TÉRREO', { x: -4.92, y: 3.08, z: 16.35 }, Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('TRIAGEM · AVALIAÇÃO', 'TÉRREO', { x: -4.92, y: 3.08, z: 12.9 }, Math.PI / 2, 1.12, 0.28, 0.1);
  addFramedSign('WC PÚBLICO', 'TÉRREO', { x: 9.04, y: 2.95, z: 18.18 }, 0, 0.84, 0.24, 0.1);

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

  // East Wing props
  addFurnBench(7.4, 21.55, 1.6, Math.PI, 0.8, 0.22);
  addFurnBench(9.4, 21.55, 1.6, Math.PI, 0.8, 0.22);
  addFurnBench(10.02, 20.2, 1.9, -Math.PI / 2, 0.22, 0.95);
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
  const crate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.55, 0.62)), propMats.weatheredWood);
  crate.position.set(5.9, 0.275, 17.25);
  group.add(crate);
  colliders.push({ minX: 5.58, maxX: 6.22, minZ: 16.92, maxZ: 17.58 });

  const sink = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.82, 0.52)), propMats.stainedCanvas);
  sink.position.set(9.95, 0.41, 15.6);
  group.add(sink);
  const stall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 2.05, 0.06)), propMats.darkTrim);
  stall.position.set(9.65, 1.025, 16.7);
  group.add(stall);
  colliders.push({ minX: 9.05, maxX: 10.25, minZ: 16.64, maxZ: 16.76 });

  addFurnDesk(8.7, 11.55, 1.9, 0, 0.95, 0.4);
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

  // West Wing props
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

  const screenLeaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 1.78, 1.45)), propMats.stainedCanvas);
  screenLeaf.position.set(-7.15, 0.89, 13.15);
  screenLeaf.rotation.y = 0.28;
  group.add(screenLeaf);
  colliders.push({ minX: -7.45, maxX: -6.85, minZ: 12.4, maxZ: 13.9 });

  addFurnDesk(-7.0, 11.25, 1.4, 0, 0.7, 0.4);

  // Wing dynamic pendant lighting + synced ceiling bulbs across all 6 rooms
  const wingCanopyGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.13, 0.045, 8));
  const wingRodGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6));
  const wingShadeGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.1, 8, 1, true));
  const wingBulbGeo = trackGeo(new THREE.SphereGeometry(0.06, 8, 6));
  const wingConfigs: { x: number; z: number; mode: 'occasional' | 'faulty'; seed: number }[] = [
    { x: 7.75, z: 19.8, mode: 'occasional', seed: 31.2 },
    { x: 7.75, z: 16.35, mode: 'faulty', seed: 35.6 },
    { x: 7.75, z: 12.9, mode: 'occasional', seed: 39.4 },
    { x: -7.75, z: 19.8, mode: 'faulty', seed: 43.8 },
    { x: -7.75, z: 16.35, mode: 'occasional', seed: 47.1 },
    { x: -7.75, z: 12.9, mode: 'occasional', seed: 52.3 },
  ];
  for (const cfg of wingConfigs) {
    const wl = addReceptionPointLight(cfg.x, 2.78, cfg.z, 0xffe0a8, 1.22, 18.0, 0.76, cfg.mode, cfg.seed);
    const bulbMat = createPs2Lambert(
      { color: 0xffe6b3, emissive: 0xffbf66, emissiveIntensity: 1.18 },
      materials,
    );
    wl.userData.bulbMat = bulbMat;
    wl.userData.bulbBaseEmissive = 1.18;

    const fixture = new THREE.Group();
    fixture.position.set(cfg.x, 3.71, cfg.z);
    const canopy = new THREE.Mesh(wingCanopyGeo, propMats.rustedMetal);
    canopy.position.y = -0.022;
    fixture.add(canopy);
    const rod = new THREE.Mesh(wingRodGeo, propMats.rustedMetal);
    rod.position.y = -0.35;
    fixture.add(rod);
    const shade = new THREE.Mesh(wingShadeGeo, propMats.rustedMetal);
    shade.position.y = -0.66;
    fixture.add(shade);
    const wBulb = new THREE.Mesh(wingBulbGeo, bulbMat);
    wBulb.position.y = -0.7;
    fixture.add(wBulb);
    group.add(fixture);
  }

  // Interactive Drawer Chests & Hiding Cabinets (Reception + Wings)
  const addReceptionChest = (
    id: string,
    x: number,
    z: number,
    rotY: number,
    metallic: boolean,
    drawersSpec: [{ itemId?: string }, { itemId?: string }, { itemId?: string }],
  ) => {
    const chest = createDrawerChest({
      id,
      mats: propMats,
      pos: new THREE.Vector3(x, 0, z),
      rotY,
      metallic,
      drawersSpec,
    });
    group.add(chest.group);
    drawers.push(...chest.drawers);
    colliders.push(chest.collider);
  };

  const addReceptionCabinet = (id: string, label: string, x: number, z: number, rotY: number, metallic = false) => {
    const cab = createHideCabinet({
      id,
      label,
      mats: propMats,
      pos: new THREE.Vector3(x, 0, z),
      rotY,
      metallic,
    });
    group.add(cab.cabinet.group);
    hideCabinets.push(cab.cabinet);
    colliders.push(cab.collider);
  };

  addReceptionChest('chest-rec-sw', -4.48, 21.25, Math.PI / 2, false, [
    {},
    { itemId: 'item-battery' },
    { itemId: 'item-bandage' },
  ]);
  addReceptionChest('chest-rec-se', 4.48, 21.25, -Math.PI / 2, false, [
    { itemId: 'item-ammo-32' },
    {},
    {},
  ]);
  addReceptionChest('chest-wing-seguranca', 6.35, 11.32, 0, true, [
    {},
    { itemId: 'item-ammo-32' },
    { itemId: 'item-battery' },
  ]);
  addReceptionChest('chest-wing-admin', -6.2, 15.05, 0, false, [
    { itemId: 'item-laudanum' },
    {},
    { itemId: 'item-bandage' },
  ]);

  addReceptionCabinet('cab-wing-deposito', 'Armário do Depósito', 6.85, 17.56, Math.PI, true);
  addReceptionCabinet('cab-wing-arquivo', 'Armário do Arquivo', -6.15, 21.58, Math.PI, false);
  addReceptionCabinet('cab-wing-triagem', 'Armário da Triagem', -9.75, 11.35, 0, true);

  return {
    group,
    doors,
    drawers,
    hideCabinets,
    nudgeProps,
    colliders,
    mezzanineColliders,
    capsules,
    windowSpillLights,
    receptionLights,
    materials,
    textures: createdTextures,
    geometries,
    ringBell,
    update: (dt, moonlightFactor) => {
      if (bellAnim > 0) {
        bellAnim = Math.max(0, bellAnim - dt * 5.2);
        bellPin.position.y = 0.078 - Math.sin(bellAnim * Math.PI) * 0.011;
      }
      for (const s of windowSpillLights) {
        s.intensity = 1.35 * moonlightFactor;
      }
    },
  };
}
