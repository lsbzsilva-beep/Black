import * as THREE from 'three';

function hash2d(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const ux = sx * sx * (3 - 2 * sx);
  const uy = sy * sy * (3 - 2 * sy);
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  const ix0 = wrap(x0, px);
  const ix1 = wrap(x0 + 1, px);
  const iy0 = wrap(y0, py);
  const iy1 = wrap(y0 + 1, py);
  const n00 = hash2d(ix0, iy0, seed);
  const n10 = hash2d(ix1, iy0, seed);
  const n01 = hash2d(ix0, iy1, seed);
  const n11 = hash2d(ix1, iy1, seed);
  return n00 + (n10 - n00) * ux + (n01 - n00) * uy + (n00 - n10 - n01 + n11) * ux * uy;
}

function fbm(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * f, v * f, f, f, seed + i * 89);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 1831565813;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlackwoodTextureBank {
  woodFloor: THREE.Texture;
  wall: THREE.Texture;
  ceiling: THREE.Texture;
  receptionFloor: THREE.Texture;
  receptionWall: THREE.Texture;
  receptionDado: THREE.Texture;
  receptionGrime: THREE.Texture;
  mezzanineFloor: THREE.Texture;
  mezzanineWall: THREE.Texture;
  mezzanineCeiling: THREE.Texture;
  wardTileFloor: THREE.Texture;
  hydroTileWall: THREE.Texture;
  paddedCellWall: THREE.Texture;
  chapelStainedGlass: THREE.Texture;
  morgueSteelDrawers: THREE.Texture;
  morgueTileWall: THREE.Texture;
  pharmacyCabinet: THREE.Texture;
  stairwellDoorWood: THREE.Texture;
  weatheredWood: THREE.Texture;
  doorWood: THREE.Texture;
  rustedMetal: THREE.Texture;
  stainedCanvas: THREE.Texture;
  concrete: THREE.Texture;
  plaster: THREE.Texture;
  tiles: THREE.Texture;
  brick: THREE.Texture;
  slateRoof: THREE.Texture;
  stoneTrim: THREE.Texture;
  wetAsphalt: THREE.Texture;
  dampGround: THREE.Texture;
  cobble: THREE.Texture;
  signPlaque: THREE.Texture;
  clockFace: THREE.Texture;
  windowGlass: THREE.Texture;
  curtain: THREE.Texture;
  intakeLedger: THREE.Texture;
  plaqueReunioes: THREE.Texture;
  plaqueCapela: THREE.Texture;
  plaqueSaguao: THREE.Texture;
  chartPaper: THREE.Texture;
  scratchDecal: THREE.Texture;
  wallCrackDecal: THREE.Texture;
  dustSprite: THREE.Texture;
  beamCone: THREE.Texture;
  ivyLeaf: THREE.Texture;
  setPixelMode: (pixelated: boolean) => void;
  dispose: () => void;
}

export function createBlackwoodTextures(pixelMode: boolean, maxAniso = 8): BlackwoodTextureBank {
  const allTextures: THREE.Texture[] = [];
  const pixelAniso = Math.max(2, Math.min(8, maxAniso));
  const hdAniso = Math.max(4, Math.min(16, maxAniso));

  const register = <T extends THREE.Texture>(tex: T, pixelated: boolean): T => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // Always use trilinear mipmap filtering for minFilter to prevent mip-level popping/flickering at grazing angles
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    if (pixelated) {
      tex.magFilter = THREE.NearestFilter;
      tex.anisotropy = pixelAniso;
    } else {
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = hdAniso;
    }
    tex.needsUpdate = true;
    allTextures.push(tex);
    return tex;
  };

  const loadDownsampledPhoto = (
    url: string,
    rx: number,
    ry: number,
    fallbackHex: string,
    vramSize = 256,
    clamp = false,
  ): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = vramSize;
    canvas.height = vramSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fallbackHex;
    ctx.fillRect(0, 0, vramSize, vramSize);

    // Paint subtle fallback grain until image resolves
    const imgData = ctx.getImageData(0, 0, vramSize, vramSize);
    const rng = seededRng(url.length * 131 + 17);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (rng() - 0.5) * 18;
      imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + n));
      imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
      imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, vramSize, vramSize);
      tex.needsUpdate = true;
    };
    img.src = url;
    return register(tex, pixelMode);
  };

  const makeProcedural = (
    width: number,
    height: number,
    rx: number,
    ry: number,
    clamp: boolean,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    draw(ctx, width, height);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    return register(tex, pixelMode);
  };

  const makeBrassPlaque = (text: string): THREE.CanvasTexture =>
    makeProcedural(256, 72, 1, 1, true, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#5a4726');
      grad.addColorStop(0.5, '#7c6438');
      grad.addColorStop(1, '#48381d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#241b0c';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#1d150a';
      ctx.font = 'bold 17px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2, w - 24);
    });

  const dampGround = makeProcedural(128, 128, 18, 18, false, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const c = fbm(u, v, 6, 3, 511);
        const l = fbm(u, v, 14, 2, 719);
        const idx = (y * w + x) * 4;
        img.data[idx] = Math.round(24 + c * 22 + l * 8);
        img.data[idx + 1] = Math.round(29 + c * 21 + l * 18);
        img.data[idx + 2] = Math.round(22 + c * 14 + l * 6);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const stoneTrim = makeProcedural(128, 128, 2, 1, false, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const c = fbm(u, v, 8, 3, 307);
        const l = fbm(u, v, 3, 2, 991);
        const lum = 108 + c * 32 - l * 24;
        const idx = (y * w + x) * 4;
        img.data[idx] = Math.round(lum * 0.96);
        img.data[idx + 1] = Math.round(lum * 0.95);
        img.data[idx + 2] = Math.round(lum * 0.88);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const signPlaque = makeProcedural(512, 256, 1, 1, true, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#787166');
    g.addColorStop(0.5, '#8a8275');
    g.addColorStop(1, '#5e594f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = seededRng(1924);
    for (let i = 0; i < 80; i++) {
      const x = rng() * w;
      const y = rng() * h * 0.45;
      const len = 45 + rng() * 140;
      ctx.fillStyle = 'rgba(26, 28, 22, 0.25)';
      ctx.fillRect(x, y, 3 + rng() * 8, len);
    }
    ctx.strokeStyle = 'rgba(28, 26, 22, 0.78)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c1a17';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('SANATÓRIO', w / 2, 92);
    ctx.font = 'bold 47px Georgia, serif';
    ctx.fillText('BLACKWOOD', w / 2, 150);
    ctx.font = '600 18px Georgia, serif';
    ctx.fillText('EST. 1898', w / 2, 204);
  });

  const clockFace = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    ctx.fillStyle = '#5d594e';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f1d19';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 59, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.strokeStyle = '#1f1d19';
      ctx.lineWidth = i % 3 === 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
      ctx.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55);
      ctx.stroke();
    }
    ctx.strokeStyle = '#191714';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(86, 51);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(32, 85);
    ctx.stroke();
  });

  const windowGlass = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    const rng = seededRng(5302);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f5a60');
    g.addColorStop(0.55, '#3b4448');
    g.addColorStop(1, '#252b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(20,24,26,0.22)' : 'rgba(140,152,155,0.12)';
      ctx.fillRect(rng() * w, rng() * h, 4 + rng() * 14, 4 + rng() * 14);
    }
  });

  const curtain = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    const rng = seededRng(7123);
    ctx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const wave = Math.sin(x * 0.28) * 0.5 + 0.5;
      const r = Math.round(68 + wave * 38);
      const g = Math.round(74 + wave * 40);
      const b = Math.round(60 + wave * 30);
      const bottom = h - 8 - Math.sin(x * 0.4) * 5 - rng() * 4;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, bottom);
    }
  });

  const intakeLedger = makeProcedural(256, 192, 1, 1, true, (ctx, w, h) => {
    const rng = seededRng(9021);
    ctx.fillStyle = '#241913';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c5b899';
    ctx.fillRect(9, 8, 116, 176);
    ctx.fillRect(131, 8, 116, 176);
    ctx.strokeStyle = 'rgba(65, 76, 86, 0.35)';
    ctx.lineWidth = 1;
    for (let y = 42; y <= 172; y += 11) {
      ctx.beginPath();
      ctx.moveTo(13, y);
      ctx.lineTo(121, y);
      ctx.moveTo(135, y);
      ctx.lineTo(243, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#2d241c';
    ctx.font = 'bold 8px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('INTERNAÇÃO 1924', 67, 24);
    ctx.fillText('OBSERVAÇÕES', 189, 24);
    ctx.strokeStyle = 'rgba(36, 28, 22, 0.72)';
    for (let row = 0; row < 10; row++) {
      const y = 38 + row * 11;
      for (const x0 of [16, 138]) {
        if (row > 6 && x0 > 100 && rng() > 0.4) continue;
        ctx.beginPath();
        let x = x0;
        ctx.moveTo(x, y);
        for (let k = 0; k < 14 && x < x0 + 96; k++) {
          x += 4 + rng() * 4;
          ctx.lineTo(x, y + (rng() - 0.5) * 3);
        }
        ctx.stroke();
      }
    }
  });

  const chartPaper = makeProcedural(128, 160, 1, 1, true, (ctx, w, h) => {
    const rng = seededRng(2024);
    ctx.fillStyle = '#cfc3a6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c2822';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('BLACKWOOD 1924', 10, 18);
    ctx.strokeStyle = 'rgba(70,65,58,0.45)';
    for (let y = 32; y < h - 12; y += 12) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(34,30,24,0.65)';
    for (let y = 38; y < h - 22; y += 18) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      let x = 14;
      while (x < w - 18) {
        x += 6 + rng() * 6;
        ctx.lineTo(x, y + (rng() - 0.5) * 4);
      }
      ctx.stroke();
    }
  });

  const scratchDecal = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rng = seededRng(666);
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 18;
      ctx.strokeStyle = 'rgba(24, 18, 16, 0.58)';
      ctx.lineWidth = 3 + rng() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x - 10 + rng() * 8, h - 14);
      ctx.stroke();
    }
  });

  const wallCrackDecal = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rng = seededRng(8842);
    ctx.strokeStyle = 'rgba(16, 15, 13, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let cx = w * 0.5;
    let cy = 8;
    ctx.moveTo(cx, cy);
    for (let i = 0; i < 12; i++) {
      cx += (rng() - 0.5) * 26;
      cy += h / 12;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  });

  const dustSprite = makeProcedural(32, 32, 1, 1, true, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(235, 228, 208, 0.8)');
    g.addColorStop(0.5, 'rgba(215, 208, 188, 0.35)');
    g.addColorStop(1, 'rgba(215, 208, 188, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });

  const beamCone = makeProcedural(64, 64, 1, 1, true, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255, 244, 214, 0.45)');
    g.addColorStop(0.5, 'rgba(235, 224, 198, 0.14)');
    g.addColorStop(1, 'rgba(215, 210, 190, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  const ivyLeaf = makeProcedural(128, 128, 1, 1, true, (ctx) => {
    const rng = seededRng(333);
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#1d1c19';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.85 + (i / 6) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.moveTo(64, 120);
      ctx.quadraticCurveTo(64 + Math.cos(a) * 22, 70, 64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
      ctx.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const x = 64 + (rng() - 0.5) * 104;
      const y = 60 + (rng() - 0.5) * 92;
      if (Math.hypot(x - 64, y - 60) > 56) continue;
      const r = 3 + rng() * 4;
      const g = 34 + Math.round(rng() * 20);
      ctx.fillStyle = `rgba(${Math.round(g * 0.8)}, ${g}, ${Math.round(g * 0.72)}, 0.9)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const woodFloor = loadDownsampledPhoto('/assets/blackwood/floor_wood_hq.webp', 1, 1, '#3a2d21', 256);
  const wall = loadDownsampledPhoto('/assets/blackwood/wall_plaster_hq.webp', 1.5, 1.5, '#59554a', 256);
  const ceiling = loadDownsampledPhoto('/assets/blackwood/ceiling_hq.jpg', 1, 1, '#3d3932', 256);
  const receptionFloor = loadDownsampledPhoto('/src/assets/images/reception_tile_floor_1795273544587.jpg', 1, 1, '#58544b', 256);
  const receptionWall = loadDownsampledPhoto('/src/assets/images/reception_plaster_wall_1795273545530.jpg', 1, 1, '#6f6c5e', 256);
  const receptionDado = loadDownsampledPhoto('/src/assets/images/reception_wood_dado_1795273545190.jpg', 3.2, 1, '#3b2e22', 256);
  const receptionGrime = loadDownsampledPhoto('/assets/blackwood/reception_grime.webp', 4, 4, '#24211c', 128);
  const mezzanineFloor = loadDownsampledPhoto('/src/assets/images/mezzanine_parquet_floor_1795275391433.jpg', 1, 1, '#3c3024', 256);
  const mezzanineWall = loadDownsampledPhoto('/src/assets/images/mezzanine_plaster_wall_1795275391465.jpg', 1, 1, '#363b33', 256);
  const mezzanineCeiling = loadDownsampledPhoto('/src/assets/images/mezzanine_coffer_ceiling_1795275392579.jpg', 1, 1, '#2b2722', 256);
  const wardTileFloor = loadDownsampledPhoto('/src/assets/images/ward_tile_floor_1795274348790.jpg', 1, 1, '#68736a', 256);
  const hydroTileWall = loadDownsampledPhoto('/src/assets/images/hydro_tile_wall_1795274348764.jpg', 1, 1, '#69847c', 256);
  const paddedCellWall = loadDownsampledPhoto('/src/assets/images/padded_cell_wall_1795274348882.jpg', 1, 1, '#9b968a', 256);
  const chapelStainedGlass = loadDownsampledPhoto('/src/assets/images/chapel_stained_glass_1795276509655.jpg', 1, 1, '#1d2738', 256, true);
  const morgueSteelDrawers = loadDownsampledPhoto('/src/assets/images/morgue_steel_drawers_1795276509296.jpg', 1, 1, '#3b4246', 256, true);
  const morgueTileWall = loadDownsampledPhoto('/src/assets/images/morgue_tile_wall_1795276510063.jpg', 1, 1, '#6f7c75', 256);
  const pharmacyCabinet = loadDownsampledPhoto('/src/assets/images/pharmacy_cabinet_wood_1795276509874.jpg', 1, 1, '#33271e', 256, true);
  const stairwellDoorWood = loadDownsampledPhoto('/src/assets/images/stairwell_door_wood_1795274348441.jpg', 1, 1, '#2b241d', 256, true);
  const weatheredWood = loadDownsampledPhoto('/assets/blackwood/wood.webp', 2, 2, '#473628', 256);
  const doorWood = loadDownsampledPhoto('/assets/blackwood/wood.webp', 1.4, 2, '#3c2c20', 256);
  const rustedMetal = loadDownsampledPhoto('/assets/blackwood/bw_rusted_metal.webp', 2, 2, '#3d3430', 128);
  const stainedCanvas = loadDownsampledPhoto('/assets/blackwood/bw_stained_linen.webp', 2, 2, '#7d7564', 128);
  const concrete = loadDownsampledPhoto('/assets/blackwood/concrete.webp', 3, 3, '#4f504a', 256);
  const plaster = loadDownsampledPhoto('/assets/blackwood/plaster.webp', 3, 3, '#636056', 256);
  const tiles = loadDownsampledPhoto('/assets/blackwood/tiles.png', 4, 4, '#505652', 128);
  const brick = loadDownsampledPhoto('/assets/blackwood/bw_facade_concrete.webp', 1, 1, '#585249', 256);
  const slateRoof = loadDownsampledPhoto('/assets/blackwood/bw_slate_roof.webp', 4, 2, '#2d3234', 128);
  const wetAsphalt = loadDownsampledPhoto('/assets/blackwood/bw_exterior_paving.webp', 14, 14, '#2e312f', 256);
  const cobble = loadDownsampledPhoto('/assets/blackwood/sb_cobble.jpg', 1.8, 12, '#333633', 256);

  return {
    woodFloor,
    wall,
    ceiling,
    receptionFloor,
    receptionWall,
    receptionDado,
    receptionGrime,
    mezzanineFloor,
    mezzanineWall,
    mezzanineCeiling,
    wardTileFloor,
    hydroTileWall,
    paddedCellWall,
    chapelStainedGlass,
    morgueSteelDrawers,
    morgueTileWall,
    pharmacyCabinet,
    stairwellDoorWood,
    weatheredWood,
    doorWood,
    rustedMetal,
    stainedCanvas,
    concrete,
    plaster,
    tiles,
    brick,
    slateRoof,
    stoneTrim,
    wetAsphalt,
    dampGround,
    cobble,
    signPlaque,
    clockFace,
    windowGlass,
    curtain,
    intakeLedger,
    plaqueReunioes: makeBrassPlaque('SALA DE REUNIÕES'),
    plaqueCapela: makeBrassPlaque('CAPELA'),
    plaqueSaguao: makeBrassPlaque('SAGUÃO PRINCIPAL'),
    chartPaper,
    scratchDecal,
    wallCrackDecal,
    dustSprite,
    beamCone,
    ivyLeaf,
    setPixelMode: (pixelated: boolean) => {
      for (const tex of allTextures) {
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        if (pixelated) {
          tex.magFilter = THREE.NearestFilter;
          tex.anisotropy = pixelAniso;
        } else {
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = hdAniso;
        }
        tex.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
  };
}
