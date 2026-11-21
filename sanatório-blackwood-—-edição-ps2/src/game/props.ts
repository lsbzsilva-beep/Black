import * as THREE from 'three';
import { PropMaterialBank } from './materials';
import { BlackwoodTextureBank } from './textures';
import { DoorState, NudgeProp } from './types';

export function tagInteractable(obj: THREE.Object3D, interactionId: string): void {
  obj.traverse((child) => {
    child.layers.enable(1);
    child.userData.interactionId = interactionId;
  });
}

export function applyBoxUvTiling(
  geo: THREE.BoxGeometry,
  w: number,
  h: number,
  d: number,
  tileSize = 2.6,
): THREE.BoxGeometry {
  const uv = geo.attributes.uv;
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [uScale, vScale] = faces[face];
    for (let v = 0; v < 4; v++) {
      const idx = face * 4 + v;
      uv.setXY(idx, (uv.getX(idx) * uScale) / tileSize, (uv.getY(idx) * vScale) / tileSize);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function applyPlaneOrSlabUv(
  geo: THREE.BufferGeometry,
  w: number,
  d: number,
  tileSize = 2.4,
): THREE.BufferGeometry {
  const uv = geo.attributes.uv;
  if (geo instanceof THREE.BoxGeometry) {
    return applyBoxUvTiling(geo, w, 0.08, d, tileSize);
  }
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * w) / tileSize, (uv.getY(i) * d) / tileSize);
  }
  uv.needsUpdate = true;
  return geo;
}

export interface FlashlightViewmodel {
  group: THREE.Group;
  lensMaterial: THREE.MeshLambertMaterial;
  beamMesh: THREE.Mesh;
  setPowered: (on: boolean) => void;
  setBeamIntensity: (val: number) => void;
  dispose: () => void;
}

export function createFlashlightModel(
  mats: PropMaterialBank,
  textures: BlackwoodTextureBank,
): FlashlightViewmodel {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.025, 0.21, 12), mats.gunmetal);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.02);
  group.add(body);

  const ringGeo = new THREE.CylinderGeometry(0.0255, 0.0255, 0.012, 12);
  for (const z of [-0.04, 0.02, 0.08]) {
    const ring = new THREE.Mesh(ringGeo, mats.tarnishedBrass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, z);
    group.add(ring);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.025, 0.024, 12), mats.tarnishedBrass);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, 0.13);
  group.add(tail);

  const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0028, 6, 10), mats.tarnishedBrass);
  lanyard.position.set(0, -0.008, 0.146);
  group.add(lanyard);

  const switchBtn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.032), mats.tarnishedBrass);
  switchBtn.position.set(0, 0.026, -0.025);
  group.add(switchBtn);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.026, 0.044, 14), mats.tarnishedBrass);
  neck.rotation.x = -Math.PI / 2;
  neck.position.set(0, 0, -0.105);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.043, 0.022, 14), mats.tarnishedBrass);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.138);
  group.add(head);

  const lensMaterial = new THREE.MeshLambertMaterial({
    color: 0xffe49e,
    emissive: 0xffd27a,
    emissiveIntensity: 1.5,
  });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 14), lensMaterial);
  lens.rotation.y = Math.PI;
  lens.position.set(0, 0, -0.147);
  group.add(lens);

  const beamGeo = new THREE.ConeGeometry(0.32, 1.4, 14, 1, true);
  beamGeo.translate(0, -0.7, 0);
  beamGeo.rotateX(-Math.PI / 2);

  const beamMat = new THREE.MeshBasicMaterial({
    map: textures.beamCone,
    color: 0xffeba8,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(0, 0, -0.14);
  beamMesh.renderOrder = 3;
  group.add(beamMesh);

  group.traverse((child) => {
    child.userData.isViewmodel = true;
    child.castShadow = false;
    child.receiveShadow = false;
    child.raycast = () => {};
  });

  let powered = false;

  return {
    group,
    lensMaterial,
    beamMesh,
    setPowered: (on: boolean) => {
      powered = on;
      lensMaterial.emissiveIntensity = on ? 1.5 : 0;
      lensMaterial.color.setHex(on ? 0xffe49e : 0x24282b);
      beamMesh.visible = on;
    },
    setBeamIntensity: (val: number) => {
      const clamped = powered ? THREE.MathUtils.clamp(val, 0, 1.2) : 0;
      beamMat.opacity = 0.14 * clamped;
      beamMesh.visible = powered && clamped > 0.01;
    },
    dispose: () => {
      lensMaterial.dispose();
      beamMat.dispose();
      beamGeo.dispose();
    },
  };
}

export interface VolumetricBeam {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    elapsed: number,
    intensity: number,
    radiusFactor: number,
  ) => void;
  dispose: () => void;
}

export function createVolumetricBeam(colorHex: number): VolumetricBeam {
  const geo = new THREE.ConeGeometry(1, 1, 16, 1, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.06 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        vDist = -position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        float fade = smoothstep(1.0, 0.05, vDist) * smoothstep(0.0, 0.12, vDist);
        gl_FragColor = vec4(uColor, fade * uOpacity);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const targetPos = new THREE.Vector3();

  return {
    mesh,
    material,
    update: (origin, dir, length, _elapsed, intensity, radiusFactor) => {
      mesh.position.copy(origin);
      targetPos.copy(origin).add(dir);
      mesh.lookAt(targetPos);
      const r = Math.max(0.25, length * radiusFactor);
      mesh.scale.set(r, r, Math.max(0.4, length));
      material.uniforms.uOpacity.value = intensity;
    },
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}

export function createSingleDoor(
  id: string,
  mats: PropMaterialBank,
  initAngle: number,
  swingSign: number,
  pos: THREE.Vector3,
  rotY: number,
): DoorState {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const jambW = 0.06;
  const jambD = 0.24;
  const jambGeo = new THREE.BoxGeometry(jambW, 2.656, jambD);

  const leftJamb = new THREE.Mesh(jambGeo, mats.darkTrim);
  leftJamb.position.set(-0.5, 1.328, 0);
  leftJamb.castShadow = true;
  leftJamb.receiveShadow = true;
  group.add(leftJamb);

  const rightJamb = new THREE.Mesh(jambGeo, mats.darkTrim);
  rightJamb.position.set(0.5, 1.328, 0);
  rightJamb.castShadow = true;
  rightJamb.receiveShadow = true;
  group.add(rightJamb);

  const headerGeo = new THREE.BoxGeometry(1.058, 0.076, jambD);
  const topHeader = new THREE.Mesh(headerGeo, mats.darkTrim);
  topHeader.position.set(0, 2.618, 0);
  group.add(topHeader);

  const midHeader = new THREE.Mesh(headerGeo, mats.darkTrim);
  midHeader.position.set(0, 2.2, 0);
  group.add(midHeader);

  const transom = new THREE.Mesh(new THREE.PlaneGeometry(0.93, 0.34), mats.transomGlass);
  transom.position.set(0, 2.4, 0);
  transom.renderOrder = 1;
  group.add(transom);

  const pivot = new THREE.Group();
  pivot.position.set(-0.468, 0, 0);
  group.add(pivot);

  const leafW = 0.932;
  const leafD = 0.048;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, 2.16, leafD), mats.doorWood);
  leaf.position.set(leafW / 2, 1.084, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  pivot.add(leaf);

  const railGeo = new THREE.BoxGeometry(leafW * 0.74, 0.055, 0.062);
  for (const y of [0.22, 1.24, 1.98]) {
    const rail = new THREE.Mesh(railGeo, mats.doorWood);
    rail.position.set(leafW / 2, y, 0);
    pivot.add(rail);
  }

  const hingeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8);
  for (const y of [0.35, 1.12, 1.88]) {
    const hinge = new THREE.Mesh(hingeGeo, mats.rustedMetal);
    hinge.position.set(0.008, y, leafD * 0.56);
    pivot.add(hinge);
  }

  const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.19, 0.064), mats.tarnishedBrass);
  escutcheon.position.set(0.858, 0.96, 0);
  pivot.add(escutcheon);

  for (const s of [-1, 1]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 8), mats.tarnishedBrass);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0.858, 0.99, s * 0.044);
    pivot.add(stem);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.018), mats.tarnishedBrass);
    handle.position.set(0.818, 0.99, s * 0.064);
    pivot.add(handle);
  }

  const openAngle = swingSign * 1.32;
  pivot.rotation.y = initAngle;
  tagInteractable(pivot, id);

  const hingeWorld = new THREE.Vector3(-0.468, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);

  return {
    id,
    group,
    pivot,
    isOpen: Math.abs(initAngle) > 0.1,
    openAngle,
    closedAngle: 0,
    currentAngle: initAngle,
    targetAngle: initAngle,
    animating: false,
    animStartAngle: initAngle,
    animTargetAngle: initAngle,
    animElapsed: 0,
    animDuration: 0,
    animFrac: 1,
    animMode: 'close',
    locked: false,
    shudderTime: 0,
    hingeWorldX: hingeWorld.x,
    hingeWorldZ: hingeWorld.z,
    leafWidth: leafW,
    baseRotationY: rotY,
  };
}

export function createStairwellPortalDoor(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  width = 2.04,
  height = 2.52,
  rotY = 0,
): DoorState {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const jambW = 0.14;
  const frameDepth = 0.34;
  const jambGeo = new THREE.BoxGeometry(jambW, height + 0.52, frameDepth);

  for (const s of [-1, 1]) {
    const j = new THREE.Mesh(jambGeo, mats.darkTrim);
    j.position.set(s * (width * 0.5 + jambW * 0.5), (height + 0.52) * 0.5, 0);
    j.castShadow = true;
    j.receiveShadow = true;
    group.add(j);

    // Pedestal base block & corbel cap on each jamb
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(jambW + 0.04, 0.24, frameDepth + 0.05),
      mats.rustedMetal,
    );
    plinth.position.set(s * (width * 0.5 + jambW * 0.5), 0.12, 0);
    group.add(plinth);

    const corbel = new THREE.Mesh(
      new THREE.BoxGeometry(jambW + 0.05, 0.14, frameDepth + 0.06),
      mats.tarnishedBrass,
    );
    corbel.position.set(s * (width * 0.5 + jambW * 0.5), height + 0.04, 0);
    group.add(corbel);
  }

  // Main lintel & illuminated wire-glass stairwell transom
  const midLintel = new THREE.Mesh(
    new THREE.BoxGeometry(width + jambW * 2 + 0.06, 0.14, frameDepth + 0.04),
    mats.darkTrim,
  );
  midLintel.position.set(0, height - 0.02, 0);
  group.add(midLintel);

  const topCrown = new THREE.Mesh(
    new THREE.BoxGeometry(width + jambW * 2 + 0.14, 0.16, frameDepth + 0.08),
    mats.darkTrim,
  );
  topCrown.position.set(0, height + 0.48, 0);
  group.add(topCrown);

  const transomGlass = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.06, 0.34, 0.04),
    mats.stairwellGlowGlass,
  );
  transomGlass.position.set(0, height + 0.22, 0);
  group.add(transomGlass);

  // Transom vertical iron safety grilles
  const grilleCount = Math.max(3, Math.round(width / 0.38));
  for (let i = 1; i < grilleCount; i++) {
    const gx = -width * 0.5 + (i / grilleCount) * width;
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.35, 6),
      mats.rustedMetal,
    );
    bar.position.set(gx, height + 0.22, 0);
    group.add(bar);
  }

  // Twin brass stairwell sconce lanterns on both sides of portal
  for (const s of [-1, 1]) {
    for (const faceZ of [-1, 1]) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.1, 0.09),
        mats.rustedMetal,
      );
      bracket.position.set(s * (width * 0.5 + jambW * 0.52), height - 0.34, faceZ * (frameDepth * 0.5 + 0.04));
      group.add(bracket);

      const globe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.028, 0.085, 8),
        mats.stairwellGlowGlass,
      );
      globe.position.set(s * (width * 0.5 + jambW * 0.52), height - 0.26, faceZ * (frameDepth * 0.5 + 0.07));
      group.add(globe);
    }
  }

  const pivot = new THREE.Group();
  group.add(pivot);

  const leafH = height - 0.1;
  const leafW = width * 0.5 - 0.02;
  const leafD = 0.08;
  for (const s of [-1, 1]) {
    const cx = s * (width * 0.25);

    // Textured iron-strapped stairwell door leaf
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafD), mats.stairwellDoor);
    leaf.position.set(cx, leafH * 0.5 + 0.01, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    pivot.add(leaf);

    // Recessed center mullion & riveted iron kickplate at base
    const kickPlate = new THREE.Mesh(
      new THREE.BoxGeometry(leafW - 0.08, 0.26, leafD + 0.018),
      mats.rustedMetal,
    );
    kickPlate.position.set(cx, 0.15, 0);
    pivot.add(kickPlate);

    // Glowing recessed wire-glass observation window inside each leaf
    const peepW = Math.min(0.28, leafW * 0.28);
    const peepGlass = new THREE.Mesh(
      new THREE.BoxGeometry(peepW, 0.34, leafD + 0.014),
      mats.stairwellGlowGlass,
    );
    peepGlass.position.set(cx, leafH * 0.68, 0);
    pivot.add(peepGlass);

    // Brass push-plate + heavy vertical grab handles on both faces
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.36, leafD + 0.024),
      mats.tarnishedBrass,
    );
    plate.position.set(s * 0.11, 1.08, 0);
    pivot.add(plate);

    for (const faceZ of [-1, 1]) {
      const pull = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.28, 8),
        mats.tarnishedBrass,
      );
      pull.position.set(s * 0.11, 1.08, faceZ * (leafD * 0.5 + 0.042));
      pivot.add(pull);
    }
  }

  // Center astragal seam strip
  const astragal = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, leafH - 0.04, leafD + 0.022),
    mats.darkTrim,
  );
  astragal.position.set(0, leafH * 0.5 + 0.01, 0);
  pivot.add(astragal);

  tagInteractable(pivot, id);

  return {
    id,
    group,
    pivot,
    isOpen: false,
    openAngle: 0,
    closedAngle: 0,
    currentAngle: 0,
    targetAngle: 0,
    animating: false,
    animStartAngle: 0,
    animTargetAngle: 0,
    animElapsed: 0,
    animDuration: 0,
    animFrac: 1,
    animMode: 'close',
    locked: true,
    shudderTime: 0,
    hingeWorldX: pos.x,
    hingeWorldZ: pos.z,
    leafWidth: width,
    baseRotationY: rotY,
  };
}

export function createEndDoor(id: string, mats: PropMaterialBank, pos: THREE.Vector3): DoorState {
  const door = createStairwellPortalDoor(id, mats, pos, 2.04, 2.48, 0);
  door.locked = false;
  return door;
}

export function createInspectableDocProp(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY = 0,
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.014, 0.24), mats.leatherStrap);
  folder.position.y = 0.007;
  group.add(folder);

  const pageA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.008, 0.21), mats.chartPaper);
  pageA.position.set(0, 0.018, 0);
  pageA.rotation.y = 0.06;
  group.add(pageA);

  const pageB = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.19), mats.chartPaper);
  pageB.position.set(0.014, 0.025, -0.008);
  pageB.rotation.y = -0.14;
  group.add(pageB);

  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mats.tarnishedBrass);
  clasp.position.set(-0.09, 0.029, 0.06);
  group.add(clasp);

  tagInteractable(group, id);
  return group;
}

export function createKeyPickupProp(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY = 0,
  metalType: 'brass' | 'iron' = 'brass',
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const metalMat = metalType === 'brass' ? mats.tarnishedBrass : mats.gunmetal;

  // Small identification paper tag underneath key so it stands out against dark desks
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.1), mats.chartPaper);
  tag.position.set(0.02, 0.004, 0.02);
  tag.rotation.y = -0.25;
  group.add(tag);

  // Brass eyelet ring on tag
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12), metalMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-0.045, 0.016, -0.01);
  group.add(ring);

  // Key shaft & teeth
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), metalMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0.025, 0.016, -0.01);
  group.add(shaft);

  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.024), metalMat);
  bit.position.set(0.068, 0.016, 0.004);
  group.add(bit);

  tagInteractable(group, id);
  return group;
}

export function createEntranceDoubleDoors(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
): { group: THREE.Group; doors: DoorState[] } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const width = 2.04;
  const jambGeo = new THREE.BoxGeometry(0.11, 2.72, 0.42);
  const leftJ = new THREE.Mesh(jambGeo, mats.darkTrim);
  leftJ.position.set(-1.075, 1.36, 0);
  leftJ.castShadow = true;
  group.add(leftJ);

  const rightJ = new THREE.Mesh(jambGeo, mats.darkTrim);
  rightJ.position.set(1.075, 1.36, 0);
  rightJ.castShadow = true;
  group.add(rightJ);

  const header = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.22, 0.46), mats.darkTrim);
  header.position.set(0, 2.59, 0);
  group.add(header);

  const leafW = width * 0.5 - 0.025;
  const leafD = 0.068;

  const makeLeaf = (id: string, linkedId: string, hingeX: number, baseRotY: number, openAngle: number): DoorState => {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, 0);
    pivot.rotation.y = baseRotY;
    group.add(pivot);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(leafW, 1.46, leafD), mats.doorWood);
    lower.position.set(leafW * 0.5, 0.735, 0);
    lower.castShadow = true;
    pivot.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.18, leafD), mats.doorWood);
    upper.position.set(leafW * 0.5, 2.39, 0);
    pivot.add(upper);

    const stileL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.02, leafD), mats.doorWood);
    stileL.position.set(0.07, 1.97, 0);
    pivot.add(stileL);

    const stileR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.02, leafD), mats.doorWood);
    stileR.position.set(0.925, 1.97, 0);
    pivot.add(stileR);

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.715, 0.82), mats.doorWood);
    panel.position.set(leafW * 0.5, 1.88, 0);
    pivot.add(panel);

    for (const bx of [0.32, 0.5, 0.68]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.82, 6), mats.rustedMetal);
      bar.position.set(bx * leafW, 1.88, 0);
      pivot.add(bar);
    }

    for (const by of [0.32, 1.15, 2.08]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.42, 0.045, 0.082), mats.rustedMetal);
      strap.position.set(leafW * 0.22, by, 0);
      pivot.add(strap);
    }

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.26, 0.084), mats.tarnishedBrass);
    plate.position.set(0.885, 1.04, 0);
    pivot.add(plate);

    for (const s of [-1, 1]) {
      const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6), mats.tarnishedBrass);
      pull.position.set(0.885, 1.04, s * 0.066);
      pivot.add(pull);
    }

    tagInteractable(pivot, id);

    return {
      id,
      group,
      pivot,
      isOpen: false,
      openAngle,
      closedAngle: 0,
      currentAngle: 0,
      targetAngle: 0,
      animating: false,
      animStartAngle: 0,
      animTargetAngle: 0,
      animElapsed: 0,
      animDuration: 0,
      animFrac: 1,
      animMode: 'close',
      locked: false,
      linkedDoorId: linkedId,
      shudderTime: 0,
      hingeWorldX: pos.x + hingeX,
      hingeWorldZ: pos.z,
      leafWidth: leafW,
      baseRotationY: baseRotY,
    };
  };

  return {
    group,
    doors: [
      makeLeaf('door-entrance-l', 'door-entrance-r', -1, 0, 1.36),
      makeLeaf('door-entrance-r', 'door-entrance-l', width * 0.5 - 0.02, Math.PI, -1.36),
    ],
  };
}

export function createReceptionNorthDoors(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
): { group: THREE.Group; doors: DoorState[] } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const width = 2.04;
  const jambGeo = new THREE.BoxGeometry(0.11, 2.66, 0.3);
  const leftJ = new THREE.Mesh(jambGeo, mats.darkTrim);
  leftJ.position.set(-1.075, 1.33, 0);
  group.add(leftJ);

  const rightJ = new THREE.Mesh(jambGeo, mats.darkTrim);
  rightJ.position.set(1.075, 1.33, 0);
  group.add(rightJ);

  const header = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.14, 0.3), mats.darkTrim);
  header.position.set(0, 2.59, 0);
  group.add(header);

  const leafW = width * 0.5 - 0.025;
  const leafD = 0.06;

  const makeLeaf = (id: string, linkedId: string, hingeX: number, baseRotY: number, openAngle: number): DoorState => {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, 0);
    pivot.rotation.y = baseRotY;
    group.add(pivot);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(leafW, 1.24, leafD), mats.doorWood);
    lower.position.set(leafW * 0.5, 0.62, 0);
    lower.castShadow = true;
    pivot.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.16, leafD), mats.doorWood);
    upper.position.set(leafW * 0.5, 2.42, 0);
    pivot.add(upper);

    const stileL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, leafD), mats.doorWood);
    stileL.position.set(0.06, 1.79, 0);
    pivot.add(stileL);

    const stileR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, leafD), mats.doorWood);
    stileR.position.set(leafW - 0.06, 1.79, 0);
    pivot.add(stileR);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 0.24, 1.05), mats.frostedGlass);
    glass.position.set(leafW * 0.5, 1.79, 0);
    pivot.add(glass);

    for (const y of [1.56, 1.88, 2.16]) {
      const muntinH = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.24, 0.024, leafD * 0.72), mats.darkTrim);
      muntinH.position.set(leafW * 0.5, y, 0);
      pivot.add(muntinH);
    }

    const muntinV = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.05, leafD * 0.72), mats.darkTrim);
    muntinV.position.set(leafW * 0.5, 1.79, 0);
    pivot.add(muntinV);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.24, 0.07), mats.tarnishedBrass);
    plate.position.set(0.896, 1.02, 0);
    pivot.add(plate);

    for (const s of [-1, 1]) {
      const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 6), mats.tarnishedBrass);
      pull.position.set(0.896, 1.02, s * 0.056);
      pivot.add(pull);
    }

    tagInteractable(pivot, id);

    return {
      id,
      group,
      pivot,
      isOpen: false,
      openAngle,
      closedAngle: 0,
      currentAngle: 0,
      targetAngle: 0,
      animating: false,
      animStartAngle: 0,
      animTargetAngle: 0,
      animElapsed: 0,
      animDuration: 0,
      animFrac: 1,
      animMode: 'close',
      locked: false,
      linkedDoorId: linkedId,
      shudderTime: 0,
      hingeWorldX: pos.x + hingeX,
      hingeWorldZ: pos.z,
      leafWidth: leafW,
      baseRotationY: baseRotY,
    };
  };

  return {
    group,
    doors: [
      makeLeaf('door-reception-north-l', 'door-reception-north-r', -1, 0, 1.36),
      makeLeaf('door-reception-north-r', 'door-reception-north-l', width * 0.5 - 0.02, Math.PI, -1.36),
    ],
  };
}

export function createLockedPlaqueDoor(
  id: string,
  mats: PropMaterialBank,
  plaqueMat: THREE.Material,
  pos: THREE.Vector3,
  rotY: number,
): DoorState {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 1.06;
  const jambGeo = new THREE.BoxGeometry(0.095, 2.5, 0.22);
  for (const s of [-1, 1]) {
    const j = new THREE.Mesh(jambGeo, mats.darkTrim);
    j.position.set(s * 0.5775, 1.25, 0);
    j.castShadow = true;
    group.add(j);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.22), mats.darkTrim);
  head.position.set(0, 2.43, 0);
  group.add(head);

  const plaqueBack = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.19, 0.028), mats.darkTrim);
  plaqueBack.position.set(0, 2.68, 0.03);
  group.add(plaqueBack);

  const plaqueFace = new THREE.Mesh(new THREE.PlaneGeometry(0.61, 0.155), plaqueMat);
  plaqueFace.position.set(0, 2.68, 0.046);
  group.add(plaqueFace);

  const pivot = new THREE.Group();
  group.add(pivot);

  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.044, 2.36, 0.055), mats.doorWood);
  leaf.position.set(0, 1.184, 0);
  leaf.castShadow = true;
  pivot.add(leaf);

  for (const y of [0.35, 1.28, 2.02]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.06, 0.068), mats.darkTrim);
    bar.position.set(0, y, 0);
    pivot.add(bar);
  }

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.2, 0.072), mats.tarnishedBrass);
  plate.position.set(w * 0.38, 1, 0);
  pivot.add(plate);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mats.tarnishedBrass);
  knob.position.set(w * 0.38, 1.02, 0.056);
  pivot.add(knob);

  tagInteractable(pivot, id);

  return {
    id,
    group,
    pivot,
    isOpen: false,
    openAngle: 0,
    closedAngle: 0,
    currentAngle: 0,
    targetAngle: 0,
    animating: false,
    animStartAngle: 0,
    animTargetAngle: 0,
    animElapsed: 0,
    animDuration: 0,
    animFrac: 1,
    animMode: 'close',
    locked: true,
    shudderTime: 0,
    hingeWorldX: pos.x,
    hingeWorldZ: pos.z,
    leafWidth: w,
    baseRotationY: rotY,
  };
}

export function createBoardedWindow(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  w = 1.45,
  h = 1.95,
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const backing = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, h - 0.04, 0.02), mats.sealedBacking);
  backing.position.set(0, 0, 0.022);
  group.add(backing);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h - 0.06, 0.01), mats.sealedGlass);
  glass.position.set(0, 0, 0.04);
  group.add(glass);

  const trimW = 0.072;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + trimW * 2, trimW, 0.11), mats.darkTrim);
  top.position.set(0, h / 2 + trimW / 2, 0.06);
  group.add(top);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + trimW * 2, trimW * 1.3, 0.14), mats.darkTrim);
  sill.position.set(0, -h / 2 - trimW * 0.5, 0.07);
  group.add(sill);

  for (const x of [-w / 2 - trimW / 2, w / 2 + trimW / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(trimW, h, 0.11), mats.darkTrim);
    side.position.set(x, 0, 0.06);
    group.add(side);
  }

  const barH = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.036, 0.018), mats.darkTrim);
  barH.position.set(0, 0, 0.056);
  group.add(barH);

  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.036, h - 0.04, 0.018), mats.darkTrim);
  barV.position.set(0, 0, 0.06);
  group.add(barV);

  const plankH = h / 7 + 0.04;
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7 - 0.5;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, plankH, 0.026), mats.weatheredWood);
    plank.position.set((i % 2 === 0 ? 1 : -1) * 0.01, t * (h - 0.12), 0.084 + (i % 2) * 0.028);
    plank.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.018;
    plank.castShadow = true;
    group.add(plank);
  }

  const diag = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.15, 0.026), mats.weatheredWood);
  diag.position.set(0, 0, 0.14);
  diag.rotation.z = 0.62;
  diag.castShadow = true;
  group.add(diag);

  return group;
}

export function createStretcher(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
): NudgeProp {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const len = 1.94;
  const wid = 0.68;
  const wheelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.032, 8);
  const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.68, 6);

  for (const x of [-wid / 2 + 0.05, wid / 2 - 0.05]) {
    for (const z of [-0.85, len / 2 - 0.12]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.rustedMetal);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.055, z);
      group.add(wheel);

      const leg = new THREE.Mesh(legGeo, mats.rustedMetal);
      leg.position.set(x, 0.4, z);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const railGeo = new THREE.CylinderGeometry(0.013, 0.013, 1.7, 6);
  for (const x of [-wid / 2 + 0.05, wid / 2 - 0.05]) {
    const rail = new THREE.Mesh(railGeo, mats.rustedMetal);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0.26, 0);
    group.add(rail);
  }

  const bed = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.045, len), mats.rustedMetal);
  bed.position.set(0, 0.74, 0);
  bed.castShadow = true;
  group.add(bed);

  for (const z of [-0.94, len / 2 - 0.03]) {
    const endBar = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.18, 0.025), mats.rustedMetal);
    endBar.position.set(0, 0.855, z);
    group.add(endBar);
  }

  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.095, 1.86), mats.stainedCanvas);
  mattress.position.set(0, 0.812, 0);
  mattress.castShadow = true;
  group.add(mattress);

  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.075, 0.28), mats.stainedCanvas);
  pillow.position.set(0.03, 0.898, -0.73);
  pillow.rotation.y = 0.08;
  group.add(pillow);

  for (const z of [-0.28, 0.24]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.012, 0.045), mats.leatherStrap);
    strap.position.set(0, 0.868, z);
    group.add(strap);

    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.28, 0.042), mats.leatherStrap);
    drop.position.set(0.354, 0.72, z);
    drop.rotation.z = 0.09;
    group.add(drop);
  }

  tagInteractable(group, id);

  return {
    group,
    kind: 'stretcher',
    basePos: pos.clone(),
    baseRot: new THREE.Euler(0, rotY, 0),
    impulse: 0,
    impulseDirX: 0,
    impulseDirZ: 0,
    phase: 0,
  };
}

export function createMedicalCart(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
): NudgeProp {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 0.74;
  const d = 0.44;
  const wheelGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.024, 8);
  const postGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.81, 6);

  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    for (const z of [-0.19, d / 2 - 0.03]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.rustedMetal);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.036, z);
      group.add(wheel);

      const post = new THREE.Mesh(postGeo, mats.rustedMetal);
      post.position.set(x, 0.45, z);
      post.castShadow = true;
      group.add(post);
    }
  }

  for (const y of [0.24, 0.8]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, d), mats.rustedMetal);
    tray.position.set(0, y, 0);
    tray.castShadow = true;
    group.add(tray);
  }

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d, 6), mats.rustedMetal);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(-w / 2 - 0.04, 0.9, 0);
  group.add(handle);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.026, 0.19), mats.stainedCanvas);
  cloth.position.set(0.11, 0.828, 0.04);
  cloth.rotation.y = 0.18;
  group.add(cloth);

  const bottle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.13, 8), mats.amberBottle);
  bottle1.position.set(-0.14, 0.879, -0.06);
  group.add(bottle1);

  const bottle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.1, 8), mats.amberBottle);
  bottle2.position.set(-0.07, 0.84, 0.09);
  bottle2.rotation.z = Math.PI / 2;
  bottle2.rotation.y = 0.65;
  group.add(bottle2);

  const bottle3 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 8), mats.amberBottle);
  bottle3.position.set(-0.18, 0.312, 0.05);
  group.add(bottle3);

  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.31), mats.chartPaper);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.32;
  paper.position.set(0.08, 0.258, -0.02);
  group.add(paper);

  tagInteractable(group, id);

  return {
    group,
    kind: 'cart',
    basePos: pos.clone(),
    baseRot: new THREE.Euler(0, rotY, 0),
    impulse: 0,
    impulseDirX: 0,
    impulseDirZ: 0,
    phase: 0,
  };
}

export function createChair(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  pose: 'upright' | 'side' | 'back' = 'upright',
): NudgeProp {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const chairBody = new THREE.Group();
  const s = 0.42;
  const c = 0.41;
  const seatH = 0.45;

  const seat = new THREE.Mesh(new THREE.BoxGeometry(s, 0.032, c), mats.weatheredWood);
  seat.position.set(0, seatH, 0);
  seat.castShadow = true;
  chairBody.add(seat);

  const legGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.434, 6);
  for (const x of [-s / 2 + 0.04, s / 2 - 0.04]) {
    for (const z of [-c / 2 + 0.04, c / 2 - 0.04]) {
      const leg = new THREE.Mesh(legGeo, mats.weatheredWood);
      leg.position.set(x, 0.217, z);
      leg.castShadow = true;
      chairBody.add(leg);
    }
  }

  const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.32, 6), mats.weatheredWood);
  rung.rotation.z = Math.PI / 2;
  rung.position.set(0, 0.16, 0);
  chairBody.add(rung);

  const backPostGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.46, 6);
  for (const x of [-s / 2 + 0.04, s / 2 - 0.04]) {
    const post = new THREE.Mesh(backPostGeo, mats.weatheredWood);
    post.position.set(x, 0.695, -0.175);
    post.rotation.x = -0.07;
    chairBody.add(post);
  }

  const crest = new THREE.Mesh(new THREE.BoxGeometry(s, 0.055, 0.028), mats.weatheredWood);
  crest.position.set(0, 0.93, -0.19);
  chairBody.add(crest);

  const spindleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6);
  for (const x of [-0.08, 0, 0.08]) {
    const sp = new THREE.Mesh(spindleGeo, mats.weatheredWood);
    sp.position.set(x, 0.695, -0.175);
    sp.rotation.x = -0.07;
    chairBody.add(sp);
  }

  if (pose === 'side') {
    chairBody.rotation.z = Math.PI / 2;
    chairBody.position.set(seatH, 0.216, 0);
  } else if (pose === 'back') {
    chairBody.rotation.x = -Math.PI / 2 + 0.08;
    chairBody.position.set(0, 0.229, 0);
  }

  group.add(chairBody);
  tagInteractable(group, id);

  return {
    group,
    kind: 'chair',
    basePos: pos.clone(),
    baseRot: new THREE.Euler(0, rotY, 0),
    impulse: 0,
    impulseDirX: 0,
    impulseDirZ: 0,
    phase: 0,
  };
}
