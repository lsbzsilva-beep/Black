import * as THREE from 'three';
import { createPs2Lambert, createPs2Phong } from '../materials';
import { BlackwoodTextureBank } from '../textures';
import { AABBCollider } from '../types';

export interface ExteriorBuildResult {
  group: THREE.Group;
  colliders: AABBCollider[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  setStormFlash: (flash: number, elapsed: number) => void;
}

export function buildExteriorWorld(textures: BlackwoodTextureBank): ExteriorBuildResult {
  const group = new THREE.Group();
  const colliders: AABBCollider[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const groundMat = createPs2Lambert({ map: textures.dampGround, color: 0x6c756c }, materials);
  const pavingMat = createPs2Lambert({ map: textures.cobble, color: 0x797d76 }, materials);
  const brickMat = createPs2Lambert({ map: textures.brick, color: 0x8d8476 }, materials);
  const slateMat = createPs2Lambert({ map: textures.slateRoof, color: 0x5c6366 }, materials);
  const trimMat = createPs2Lambert({ map: textures.stoneTrim, color: 0x999282 }, materials);
  const ironMat = createPs2Phong({ color: 0x202424, shininess: 18 }, materials);
  const darkWindowMat = createPs2Lambert({ color: 0x0b1014 }, materials);
  const glowWindowMat = createPs2Lambert(
    {
      color: 0x26262a,
      emissive: 0x625a3c,
      emissiveIntensity: 0.72,
    },
    materials,
  );
  const signMat = createPs2Lambert({ map: textures.signPlaque }, materials);
  const clockMat = createPs2Lambert({ map: textures.clockFace }, materials);

  // Grounds & cobble path (non-overlapping Z spans and clean Y separation)
  const terrain = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(66, 56)), groundMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(0, -0.028, 39);
  terrain.receiveShadow = true;
  group.add(terrain);

  const pathMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(4.6, 21.0)), pavingMat);
  pathMesh.rotation.x = -Math.PI / 2;
  pathMesh.position.set(0, 0.008, 35.0);
  pathMesh.receiveShadow = true;
  group.add(pathMesh);

  const curbGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.07, 66));
  for (const x of [-2.36, 2.36]) {
    const curb = new THREE.Mesh(curbGeo, trimMat);
    curb.position.set(x, 0.022, 56);
    curb.receiveShadow = true;
    group.add(curb);
  }

  // Monument sign ("SANATÓRIO BLACKWOOD EST. 1898")
  const monument = new THREE.Group();
  monument.position.set(-3.28, 0, 56.2);
  monument.rotation.y = 0.15;

  const monBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 1.32, 0.38)), brickMat);
  monBase.position.set(-0.22, 0.66, 0);
  monBase.castShadow = true;
  monBase.receiveShadow = true;
  monument.add(monBase);

  const monFoot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.62, 0.16, 0.46)), trimMat);
  monFoot.position.set(-0.22, 0.08, 0);
  monument.add(monFoot);

  const monCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.66, 0.14, 0.48)), trimMat);
  monCap.position.set(-0.22, 1.38, 0);
  monument.add(monCap);

  const monPillar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 1.78, 0.58)), brickMat);
  monPillar.position.set(1.22, 0.89, 0);
  monPillar.castShadow = true;
  monument.add(monPillar);

  const monCap1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.74, 0.12, 0.7)), trimMat);
  monCap1.position.set(1.22, 1.82, 0);
  monument.add(monCap1);

  const monCap2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.58, 0.12, 0.54)), trimMat);
  monCap2.position.set(1.22, 1.94, 0);
  monument.add(monCap2);

  const plaqueFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.88, 0.92, 0.05)), signMat);
  plaqueFace.position.set(-0.22, 0.74, 0.19);
  monument.add(plaqueFace);

  group.add(monument);
  colliders.push({ minX: -4.8, maxX: -1.65, minZ: 55.6, maxZ: 56.8 });

  // Perimeter wall & open iron gates at z = 39.5
  const gateZ = 39.5;
  const pillarHalfX = 2.45;
  for (const s of [-1, 1]) {
    const segLen = 23.55;
    const cx = s * 14.225;

    const wall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(segLen, 0.92, 0.34)), brickMat);
    wall.position.set(cx, 0.46, gateZ);
    wall.receiveShadow = true;
    group.add(wall);

    const coping = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(23.63, 0.1, 0.42)), trimMat);
    coping.position.set(cx, 0.97, gateZ);
    group.add(coping);

    for (const ry of [1.14, 1.96]) {
      const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(segLen, 0.04, 0.04)), ironMat);
      rail.position.set(cx, ry, gateZ);
      group.add(rail);
    }

    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 2.45, 0.68)), brickMat);
    post.position.set(s * pillarHalfX, 1.225, gateZ);
    post.castShadow = true;
    group.add(post);

    const postCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 0.16, 0.84)), trimMat);
    postCap.position.set(s * pillarHalfX, 2.53, gateZ);
    group.add(postCap);

    const finial = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 8, 6)), trimMat);
    finial.position.set(s * pillarHalfX, 2.74, gateZ);
    group.add(finial);

    for (const px of [7.2, 12.5, 18, 23.5]) {
      const subP = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 2.15, 0.5)), brickMat);
      subP.position.set(s * px, 1.075, gateZ);
      group.add(subP);
      const subC = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.12, 0.62)), trimMat);
      subC.position.set(s * px, 2.19, gateZ);
      group.add(subC);
    }

    // Swung-open iron gate leaf
    const gateLeaf = new THREE.Group();
    gateLeaf.position.set(s * 2.11, 0, gateZ);
    gateLeaf.rotation.y = s * 1.18;
    const leafW = 2.02;
    for (const ry of [0.28, 1.12, 1.98]) {
      const gRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(leafW, 0.045, 0.04)), ironMat);
      gRail.position.set(-s * (leafW * 0.5), ry, 0);
      gateLeaf.add(gRail);
    }
    const barGeo = trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 2.04, 6));
    for (let i = 0; i < 11; i++) {
      const bx = -s * (0.1 + (i / 10) * 1.82);
      const bar = new THREE.Mesh(barGeo, ironMat);
      bar.position.set(bx, 1.18, 0);
      gateLeaf.add(bar);
    }
    group.add(gateLeaf);

    colliders.push({
      minX: s < 0 ? -26 : 2.13,
      maxX: s < 0 ? -2.13 : 26,
      minZ: 39.08,
      maxZ: 39.92,
    });
  }

  // Instanced fence pickets
  const picketXs: number[] = [];
  for (let x = -25.6; x <= -2.85; x += 0.22) picketXs.push(x);
  for (let x = 2.85; x <= 25.6; x += 0.22) picketXs.push(x);
  const picketGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 1.12, 6));
  const picketInst = new THREE.InstancedMesh(picketGeo, ironMat, picketXs.length);
  const dummy = new THREE.Object3D();
  picketXs.forEach((x, idx) => {
    dummy.position.set(x, 1.58, gateZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    picketInst.setMatrixAt(idx, dummy.matrix);
  });
  picketInst.instanceMatrix.needsUpdate = true;
  picketInst.computeBoundingSphere();
  group.add(picketInst);

  // Neoclassical Asylum Facade
  const makeFacadeBlock = (
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 2,
    ry = 2,
  ) => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, brickMat);
    mesh.position.set(x, y0 + h * 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  makeFacadeBlock(-6.74, 0.01, 22.44, 11.4, 4.08, 0.34, 4, 2);
  makeFacadeBlock(6.74, 0.01, 22.44, 11.4, 4.08, 0.34, 4, 2);
  makeFacadeBlock(0, 2.7, 22.44, 2.16, 1.38, 0.34, 1, 1);
  makeFacadeBlock(0, 4.12, 22.15, 24.8, 4.28, 0.86, 8, 2);
  makeFacadeBlock(-12.1, 4.12, 17.5, 0.6, 4.28, 9.2, 3, 2);
  makeFacadeBlock(12.1, 4.12, 17.5, 0.6, 4.28, 9.2, 3, 2);

  for (const s of [-1, 1]) {
    makeFacadeBlock(s * 16.1, 0, 20.25, 7.8, 8.6, 8.5, 4, 4);
    const band1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.05, 0.2, 8.75)), trimMat);
    band1.position.set(s * 16.1, 4.05, 20.25);
    group.add(band1);
    const band2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.15, 0.28, 8.85)), trimMat);
    band2.position.set(s * 16.1, 8.65, 20.25);
    group.add(band2);
    const spire = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(6.3, 2.9, 4)), slateMat);
    spire.rotation.y = Math.PI / 4;
    spire.scale.set(1, 1, 1.08);
    spire.position.set(s * 16.1, 10.15, 20.25);
    group.add(spire);

    colliders.push({
      minX: s < 0 ? -20.2 : 11.9,
      maxX: s < 0 ? -11.9 : 20.2,
      minZ: 15.8,
      maxZ: 24.65,
    });
  }

  colliders.push(
    { minX: -12.5, maxX: -1.04, minZ: 22, maxZ: 22.72 },
    { minX: 1.04, maxX: 12.5, minZ: 22, maxZ: 22.72 },
  );

  // Cornices & roofs
  const cornice1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(24.9, 0.18, 0.48)), trimMat);
  cornice1.position.set(0, 4.05, 22.46);
  group.add(cornice1);

  const cornice2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(25, 0.28, 1.15)), trimMat);
  cornice2.position.set(0, 8.46, 22.18);
  group.add(cornice2);

  const roofFront = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(25.2, 0.24, 5.6)), slateMat);
  roofFront.position.set(0, 9.68, 20.1);
  roofFront.rotation.x = 0.46;
  group.add(roofFront);

  const roofBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(25.2, 0.24, 5.6)), slateMat);
  roofBack.position.set(0, 9.68, 15.6);
  roofBack.rotation.x = -0.46;
  group.add(roofBack);

  for (const x of [-15.8, -8.8, 8.8, 15.8]) {
    const cz = Math.abs(x) > 12 ? 20.2 : 18.2;
    const ch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 2.8, 0.82)), brickMat);
    ch.position.set(x, 11.1, cz);
    group.add(ch);
    const chCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.98, 0.16, 0.98)), trimMat);
    chCap.position.set(x, 12.55, cz);
    group.add(chCap);
  }

  // Portico columns, pediment, clock tower
  const stepPad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 0.04, 2.24)), trimMat);
  stepPad.position.set(0, 0.02, 23.38);
  stepPad.receiveShadow = true;
  group.add(stepPad);

  const colGeo = trackGeo(new THREE.CylinderGeometry(0.21, 0.24, 4.08, 10));
  for (const x of [-2.42, -1.42, 1.42, 2.42]) {
    const col = new THREE.Mesh(colGeo, trimMat);
    col.position.set(x, 2.08, 23.85);
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);
  }
  colliders.push(
    { minX: -2.68, maxX: -1.16, minZ: 23.58, maxZ: 24.12 },
    { minX: 1.16, maxX: 2.68, minZ: 23.58, maxZ: 24.12 },
  );

  const entablature = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.36, 1.85)), trimMat);
  entablature.position.set(0, 4.24, 23.22);
  group.add(entablature);
  makeFacadeBlock(0, 4.44, 23.11, 5.5, 4.0, 1.0, 2, 2);

  const pedShape = new THREE.Shape();
  pedShape.moveTo(-2.95, 0);
  pedShape.lineTo(2.95, 0);
  pedShape.lineTo(0, 1.85);
  pedShape.closePath();
  const pedGeo = trackGeo(new THREE.ExtrudeGeometry(pedShape, { depth: 1.5, bevelEnabled: false }));
  const pediment = new THREE.Mesh(pedGeo, trimMat);
  pediment.position.set(0, 8.45, 22.3);
  group.add(pediment);

  const clockMesh = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.56, 16)), clockMat);
  clockMesh.position.set(0, 9.18, 23.82);
  group.add(clockMesh);

  // Bell tower
  const towerBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 1.6, 3.4)), trimMat);
  towerBase.position.set(0, 10.7, 19.6);
  group.add(towerBase);

  const towerDrum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.42, 1.48, 1.9, 8)), trimMat);
  towerDrum.position.set(0, 12.4, 19.6);
  group.add(towerDrum);

  const towerCornice = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.62, 1.54, 0.22, 8)), trimMat);
  towerCornice.position.set(0, 13.4, 19.6);
  group.add(towerCornice);

  const dome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(1.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    slateMat,
  );
  dome.position.set(0, 13.48, 19.6);
  group.add(dome);

  const spire = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.14, 1.45, 8)), ironMat);
  spire.position.set(0, 15.5, 19.6);
  group.add(spire);

  // Instanced facade windows
  const wins: { x: number; y: number; z: number; faint?: boolean }[] = [];
  for (const x of [-10.4, -8, -5.6, -3.4, 3.4, 5.6, 8, 10.4]) {
    wins.push({ x, y: 2.05, z: 22.61 });
    wins.push({ x, y: 6.25, z: 22.61, faint: x === -3.4 || x === 8 });
  }
  wins.push({ x: -1.5, y: 6.25, z: 23.64 }, { x: 1.5, y: 6.25, z: 23.64, faint: true });
  for (const x of [-17.8, -14.4, 14.4, 17.8]) {
    wins.push({ x, y: 2.05, z: 24.52 });
    wins.push({ x, y: 6.25, z: 24.52, faint: x === -14.4 });
  }

  const winFrameGeo = trackGeo(new THREE.BoxGeometry(1.18, 2.05, 0.12));
  const winPaneGeo = trackGeo(new THREE.PlaneGeometry(0.96, 1.82));
  const winFrames = new THREE.InstancedMesh(winFrameGeo, trimMat, wins.length);
  const darkWins = wins.filter((w) => !w.faint);
  const glowWins = wins.filter((w) => w.faint);
  const darkPanes = new THREE.InstancedMesh(winPaneGeo, darkWindowMat, darkWins.length);
  const glowPanes = new THREE.InstancedMesh(winPaneGeo, glowWindowMat, glowWins.length);

  wins.forEach((w, i) => {
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    winFrames.setMatrixAt(i, dummy.matrix);
  });
  winFrames.instanceMatrix.needsUpdate = true;
  winFrames.computeBoundingSphere();
  group.add(winFrames);

  darkWins.forEach((w, i) => {
    dummy.position.set(w.x, w.y, w.z + 0.088);
    dummy.updateMatrix();
    darkPanes.setMatrixAt(i, dummy.matrix);
  });
  darkPanes.instanceMatrix.needsUpdate = true;
  darkPanes.computeBoundingSphere();
  group.add(darkPanes);

  glowWins.forEach((w, i) => {
    dummy.position.set(w.x, w.y, w.z + 0.088);
    dummy.updateMatrix();
    glowPanes.setMatrixAt(i, dummy.matrix);
  });
  glowPanes.instanceMatrix.needsUpdate = true;
  glowPanes.computeBoundingSphere();
  group.add(glowPanes);

  // PS2 Storm Sky Dome
  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x0b1114) },
        uHorizon: { value: new THREE.Color(0x1f282a) },
        uFlash: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform float uFlash;
        uniform float uTime;
        void main() {
          float h = clamp(vDir.y * 0.85 + 0.08, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.78, h));
          float band = sin(vDir.x * 7.0 + uTime * 0.04) * sin(vDir.z * 5.5 + vDir.y * 2.0);
          col *= 0.8 + 0.2 * band;
          float sheet = smoothstep(0.35, 0.9, sin(vDir.x * 3.0 + vDir.z * 2.2 + uTime * 0.7));
          col += vec3(0.62, 0.72, 0.82) * uFlash * (0.45 + 0.55 * sheet) * (0.35 + h);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const skyDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(95, 20, 14)), skyMat);
  skyDome.frustumCulled = false;
  skyDome.raycast = () => {};
  skyDome.position.set(0, 8, 48);
  group.add(skyDome);

  return {
    group,
    colliders,
    materials,
    geometries,
    setStormFlash: (flash, elapsed) => {
      skyMat.uniforms.uFlash.value = flash;
      skyMat.uniforms.uTime.value = elapsed;
    },
  };
}
