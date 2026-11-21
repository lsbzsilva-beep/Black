import * as THREE from 'three';
import { BlackwoodTextureBank } from './textures';

export interface PropMaterialBank {
  doorWood: THREE.MeshLambertMaterial;
  endDoorWood: THREE.MeshLambertMaterial;
  weatheredWood: THREE.MeshLambertMaterial;
  darkTrim: THREE.MeshLambertMaterial;
  rustedMetal: THREE.MeshLambertMaterial;
  tarnishedBrass: THREE.MeshPhongMaterial;
  gunmetal: THREE.MeshPhongMaterial;
  stainedCanvas: THREE.MeshLambertMaterial;
  leatherStrap: THREE.MeshLambertMaterial;
  frostedGlass: THREE.MeshLambertMaterial;
  transomGlass: THREE.MeshLambertMaterial;
  sealedGlass: THREE.MeshLambertMaterial;
  sealedBacking: THREE.MeshLambertMaterial;
  amberBottle: THREE.MeshPhongMaterial;
  chartPaper: THREE.MeshLambertMaterial;
  stairwellDoor: THREE.MeshLambertMaterial;
  stairwellGlowGlass: THREE.MeshLambertMaterial;
  wardTileFloor: THREE.MeshLambertMaterial;
  hydroTileWall: THREE.MeshLambertMaterial;
  paddedCellWall: THREE.MeshLambertMaterial;
  mezzanineFloor: THREE.MeshLambertMaterial;
  mezzanineWall: THREE.MeshLambertMaterial;
  mezzanineCeiling: THREE.MeshLambertMaterial;
  chapelStainedGlass: THREE.MeshLambertMaterial;
  morgueSteelDrawers: THREE.MeshPhongMaterial;
  morgueTileWall: THREE.MeshLambertMaterial;
  pharmacyCabinet: THREE.MeshLambertMaterial;
  scratchDecal: THREE.MeshBasicMaterial;
  wallCrackDecal: THREE.MeshBasicMaterial;
  lampHalo: THREE.MeshBasicMaterial;
  dispose: () => void;
}

export const SHARED_VERTEX_SNAP = { value: 0 };

/**
 * Applies optional gentle PlayStation-style clip-space vertex snapping
 * when vertexSnap mode is enabled (active in VHS Maldito preset or toggle).
 */
export function attachPs2VertexSnap(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPs2Snap = SHARED_VERTEX_SNAP;
    shader.vertexShader =
      'uniform float uPs2Snap;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (uPs2Snap > 1.0) {
          float wSafe = max(abs(gl_Position.w), 0.001);
          vec2 grid = vec2(uPs2Snap, uPs2Snap * 0.75);
          gl_Position.xy = floor((gl_Position.xy / wSafe) * grid + 0.5) / grid * wSafe;
        }`,
      );
  };
}

export function createPs2Lambert(
  params: THREE.MeshLambertMaterialParameters,
  registry: THREE.Material[],
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    dithering: true,
    ...params,
  });
  attachPs2VertexSnap(mat);
  registry.push(mat);
  return mat;
}

export function createPs2Phong(
  params: THREE.MeshPhongMaterialParameters,
  registry: THREE.Material[],
): THREE.MeshPhongMaterial {
  const mat = new THREE.MeshPhongMaterial({
    shininess: 18,
    specular: new THREE.Color(0x282622),
    dithering: true,
    ...params,
  });
  attachPs2VertexSnap(mat);
  registry.push(mat);
  return mat;
}

export function createBrassSignMaterial(
  headline: string,
  detail: string,
  materialsRegistry: THREE.Material[],
  texturesRegistry?: THREE.Texture[],
  options?: { emissiveIntensity?: number; headlineSize?: number; detailSize?: number },
): THREE.MeshLambertMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 512, 160);
  bg.addColorStop(0, '#161813');
  bg.addColorStop(0.5, '#2b241b');
  bg.addColorStop(1, '#161813');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);

  // Heavy antique brass bezel (avoid 1px hairlines that alias/shimmer at grazing angles & low PS2 res)
  ctx.strokeStyle = '#8b7347';
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.strokeStyle = 'rgba(10, 9, 7, 0.72)';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, 482, 130);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d6c49a';
  ctx.font = `bold ${options?.headlineSize ?? 36}px Georgia, serif`;
  ctx.fillText(headline, 256, 62, 448);
  ctx.fillStyle = '#ad9a73';
  ctx.font = `600 ${options?.detailSize ?? 21}px Georgia, serif`;
  ctx.fillText(detail, 256, 113, 452);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  texturesRegistry?.push(tex);

  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0x5b492c),
    emissiveIntensity: options?.emissiveIntensity ?? 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.FrontSide,
  });
  materialsRegistry.push(mat);
  return mat;
}

export function createPropMaterials(textures: BlackwoodTextureBank): PropMaterialBank {
  const mats: THREE.Material[] = [];

  const doorWood = createPs2Lambert(
    {
      map: textures.doorWood,
      color: 0x8b6e56,
    },
    mats,
  );

  const endDoorWood = createPs2Lambert(
    {
      map: textures.doorWood,
      color: 0x735b48,
    },
    mats,
  );

  const weatheredWood = createPs2Lambert(
    {
      map: textures.weatheredWood,
      color: 0x998066,
    },
    mats,
  );

  const darkTrim = createPs2Lambert(
    {
      color: 0x26211c,
    },
    mats,
  );

  const rustedMetal = createPs2Lambert(
    {
      map: textures.rustedMetal,
      color: 0x7c716a,
    },
    mats,
  );

  const tarnishedBrass = createPs2Phong(
    {
      color: 0x9d824d,
      shininess: 26,
      specular: 0x52452a,
    },
    mats,
  );

  const gunmetal = createPs2Phong(
    {
      color: 0x3b4042,
      shininess: 24,
      specular: 0x454a4d,
    },
    mats,
  );

  const stainedCanvas = createPs2Lambert(
    {
      map: textures.stainedCanvas,
      color: 0xc8c0ae,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const leatherStrap = createPs2Lambert(
    {
      color: 0x3b261b,
    },
    mats,
  );

  const frostedGlass = createPs2Lambert(
    {
      color: 0x627379,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const transomGlass = createPs2Lambert(
    {
      color: 0x4b5c62,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const sealedGlass = createPs2Lambert(
    {
      map: textures.windowGlass,
      color: 0x7b8d94,
      emissive: 0x162228,
      emissiveIntensity: 0.35,
    },
    mats,
  );

  const sealedBacking = createPs2Lambert(
    {
      color: 0x16191a,
    },
    mats,
  );

  const amberBottle = createPs2Phong(
    {
      color: 0x6b3f16,
      shininess: 32,
      transparent: true,
      opacity: 0.85,
    },
    mats,
  );

  const chartPaper = createPs2Lambert(
    {
      map: textures.chartPaper,
      color: 0xd8ceb4,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    },
    mats,
  );

  const stairwellDoor = createPs2Lambert(
    {
      map: textures.stairwellDoorWood,
      color: 0xd8cfc2,
    },
    mats,
  );

  const stairwellGlowGlass = createPs2Lambert(
    {
      map: textures.windowGlass,
      color: 0xc29e68,
      emissive: 0x7a5022,
      emissiveIntensity: 0.58,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const wardTileFloor = createPs2Lambert(
    {
      map: textures.wardTileFloor,
      color: 0xd6d2c6,
    },
    mats,
  );

  const hydroTileWall = createPs2Lambert(
    {
      map: textures.hydroTileWall,
      color: 0xd4d6ce,
    },
    mats,
  );

  const paddedCellWall = createPs2Lambert(
    {
      map: textures.paddedCellWall,
      color: 0xd6d0c4,
    },
    mats,
  );

  const mezzanineFloor = createPs2Lambert(
    {
      map: textures.mezzanineFloor,
      color: 0xcfc4b4,
    },
    mats,
  );

  const mezzanineWall = createPs2Lambert(
    {
      map: textures.mezzanineWall,
      color: 0xd2d2c6,
    },
    mats,
  );

  const mezzanineCeiling = createPs2Lambert(
    {
      map: textures.mezzanineCeiling,
      color: 0xbcb5a8,
    },
    mats,
  );

  const chapelStainedGlass = createPs2Lambert(
    {
      map: textures.chapelStainedGlass,
      color: 0xc8d2e2,
      emissive: 0x24344d,
      emissiveIntensity: 0.78,
    },
    mats,
  );

  const morgueSteelDrawers = createPs2Phong(
    {
      map: textures.morgueSteelDrawers,
      color: 0xbcc4c8,
      shininess: 30,
      specular: 0x4b5357,
    },
    mats,
  );

  const morgueTileWall = createPs2Lambert(
    {
      map: textures.morgueTileWall,
      color: 0xc8d0ca,
    },
    mats,
  );

  const pharmacyCabinet = createPs2Lambert(
    {
      map: textures.pharmacyCabinet,
      color: 0xd2c7b8,
    },
    mats,
  );

  const scratchDecal = new THREE.MeshBasicMaterial({
    map: textures.scratchDecal,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  mats.push(scratchDecal);

  const wallCrackDecal = new THREE.MeshBasicMaterial({
    map: textures.wallCrackDecal,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  mats.push(wallCrackDecal);

  const lampHalo = new THREE.MeshBasicMaterial({
    map: textures.dustSprite,
    color: 0xffd28a,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mats.push(lampHalo);

  return {
    doorWood,
    endDoorWood,
    weatheredWood,
    darkTrim,
    rustedMetal,
    tarnishedBrass,
    gunmetal,
    stainedCanvas,
    leatherStrap,
    frostedGlass,
    transomGlass,
    sealedGlass,
    sealedBacking,
    amberBottle,
    chartPaper,
    stairwellDoor,
    stairwellGlowGlass,
    wardTileFloor,
    hydroTileWall,
    paddedCellWall,
    mezzanineFloor,
    mezzanineWall,
    mezzanineCeiling,
    chapelStainedGlass,
    morgueSteelDrawers,
    morgueTileWall,
    pharmacyCabinet,
    scratchDecal,
    wallCrackDecal,
    lampHalo,
    dispose: () => {
      for (const m of mats) {
        m.dispose();
      }
    },
  };
}
