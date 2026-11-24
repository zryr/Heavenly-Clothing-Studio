import * as THREE from 'three';
import { UvIsland } from '../types/uv';

export interface FaceUvSlice {
  islandName: string;
  vStartFrac?: number; // 0 = top of island, 1 = bottom of island
  vEndFrac?: number;
}

/**
 * Builds an authentic Roblox beveled blocky part mesh with optional flush internal joint faces
 * (`bevelTop` / `bevelBottom`) so R15 segments sit 100% flush with ZERO blank spaces or skin gaps,
 * while preserving distortion-free planar UV mapping onto the 585×559 classic clothing template.
 *
 * Face order matches THREE.BoxGeometry:
 *   0: +X (viewer right / avatar left)
 *   1: -X (viewer left / avatar right)
 *   2: +Y (top)
 *   3: -Y (bottom)
 *   4: +Z (front)
 *   5: -Z (back)
 */
export function createRobloxBeveledPartGeometry(params: {
  width: number;
  height: number;
  depth: number;
  bevel?: number;
  bevelTop?: boolean;
  bevelBottom?: boolean;
  segments?: number;
  faceSlices?: (FaceUvSlice | null)[];
  islands?: UvIsland[];
  texWidth?: number;
  texHeight?: number;
  topScaleX?: number;
  bottomScaleX?: number;
  topScaleZ?: number;
  bottomScaleZ?: number;
}): THREE.BufferGeometry {
  const {
    width,
    height,
    depth,
    bevel = 0.044,
    bevelTop = true,
    bevelBottom = true,
    segments = 4,
    faceSlices,
    islands = [],
    texWidth = 585,
    texHeight = 559,
    topScaleX = 1,
    bottomScaleX = 1,
    topScaleZ = 1,
    bottomScaleZ = 1
  } = params;

  const r = Math.min(bevel, width * 0.24, height * 0.24, depth * 0.24);
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const ix = Math.max(0.001, hx - r);
  const iyTop = bevelTop ? Math.max(0.001, hy - r) : hy;
  const iyBot = bevelBottom ? Math.max(0.001, hy - r) : hy;
  const iz = Math.max(0.001, hz - r);

  const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;

  const splitThreshold = segments > 2 ? (segments - 2) / segments : 0.5;
  const distributeSym = (normVal: number, half: number, inner: number): number => {
    const s = Math.sign(normVal);
    const a = Math.abs(normVal);
    if (a <= splitThreshold) {
      return s * (a / splitThreshold) * inner;
    }
    const bevelFrac = (a - splitThreshold) / (1 - splitThreshold);
    return s * (inner + bevelFrac * (half - inner));
  };

  const distributeY = (normVal: number): number => {
    if (normVal >= 0) {
      if (!bevelTop) return normVal * hy;
      return distributeSym(normVal, hy, iyTop);
    }
    if (!bevelBottom) return normVal * hy;
    return distributeSym(normVal, hy, iyBot);
  };

  const vertsPerFace = (segments + 1) * (segments + 1);
  const v = new THREE.Vector3();
  const clamped = new THREE.Vector3();
  const diff = new THREE.Vector3();

  const preTaperX = new Float32Array(posAttr.count);
  const preTaperY = new Float32Array(posAttr.count);
  const preTaperZ = new Float32Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const px = distributeSym(v.x / hx, hx, ix);
    const py = distributeY(v.y / hy);
    const pz = distributeSym(v.z / hz, hz, iz);

    clamped.set(
      THREE.MathUtils.clamp(px, -ix, ix),
      THREE.MathUtils.clamp(py, -iyBot, iyTop),
      THREE.MathUtils.clamp(pz, -iz, iz)
    );
    diff.set(px - clamped.x, py - clamped.y, pz - clamped.z);
    const len = diff.length();

    if (len > 1e-6) {
      diff.multiplyScalar(1 / len);
      v.copy(clamped).addScaledVector(diff, r);
      normAttr.setXYZ(i, diff.x, diff.y, diff.z);
    } else {
      v.set(px, py, pz);
    }

    preTaperX[i] = v.x;
    preTaperY[i] = v.y;
    preTaperZ[i] = v.z;

    if (topScaleX !== 1 || bottomScaleX !== 1 || topScaleZ !== 1 || bottomScaleZ !== 1) {
      const yFrac = THREE.MathUtils.clamp((v.y + hy) / height, 0, 1);
      const sx = THREE.MathUtils.lerp(bottomScaleX, topScaleX, yFrac);
      const sz = THREE.MathUtils.lerp(bottomScaleZ, topScaleZ, yFrac);
      v.x *= sx;
      v.z *= sz;
    }

    posAttr.setXYZ(i, v.x, v.y, v.z);
  }

  posAttr.needsUpdate = true;
  if (topScaleX !== 1 || bottomScaleX !== 1 || topScaleZ !== 1 || bottomScaleZ !== 1) {
    geo.computeVertexNormals();
  } else {
    normAttr.needsUpdate = true;
  }

  applyBoxFaceUvs(geo, preTaperX, preTaperY, preTaperZ, width, height, depth, vertsPerFace, faceSlices, islands, texWidth, texHeight);
  return geo;
}

export interface LoftRingProfile {
  /** 0 = bottom (-height/2), 1 = top (+height/2) */
  t: number;
  halfW: number;
  halfD: number;
  /** Superellipse roundness: 0 = crisp rounded-box bevel, 1 = smooth oval cylinder */
  roundness?: number;
  offsetX?: number;
  offsetZ?: number;
}

/**
 * Builds an authentic sculpted Roblox Woman body part (cinched hourglass torso, slim tapered arms,
 * slim rounded Woman 1 legs, or thick rounded-top Woman 2 blocky legs) by lofting smooth vertical
 * cross-section rings while projecting exact distortion-free planar Roblox 585×559 UVs onto all 6 faces.
 */
export function createRobloxSculptedLoftGeometry(params: {
  height: number;
  profile: LoftRingProfile[];
  faceSlices?: (FaceUvSlice | null)[];
  islands?: UvIsland[];
  texWidth?: number;
  texHeight?: number;
  radialSegments?: number;
}): THREE.BufferGeometry {
  const {
    height,
    profile,
    faceSlices,
    islands = [],
    texWidth = 585,
    texHeight = 559,
    radialSegments = 5
  } = params;

  const hy = height / 2;
  const rows = Math.max(2, profile.length - 1);
  const segX = radialSegments;
  const segZ = radialSegments;

  // Use a subdivided BoxGeometry topology so all 6 faces (+X,-X,+Y,-Y,+Z,-Z) have independent vertices & UVs!
  const geo = new THREE.BoxGeometry(2, height, 2, segX, rows, segZ);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;

  const sampleProfile = (tClamped: number) => {
    const t = THREE.MathUtils.clamp(tClamped, 0, 1);
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      if (t >= a.t - 1e-5 && t <= b.t + 1e-5) {
        const span = Math.max(1e-5, b.t - a.t);
        const f = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
        return {
          halfW: THREE.MathUtils.lerp(a.halfW, b.halfW, f),
          halfD: THREE.MathUtils.lerp(a.halfD, b.halfD, f),
          roundness: THREE.MathUtils.lerp(a.roundness ?? 0.35, b.roundness ?? 0.35, f),
          offsetX: THREE.MathUtils.lerp(a.offsetX ?? 0, b.offsetX ?? 0, f),
          offsetZ: THREE.MathUtils.lerp(a.offsetZ ?? 0, b.offsetZ ?? 0, f)
        };
      }
    }
    const last = profile[profile.length - 1];
    return {
      halfW: last.halfW,
      halfD: last.halfD,
      roundness: last.roundness ?? 0.35,
      offsetX: last.offsetX ?? 0,
      offsetZ: last.offsetZ ?? 0
    };
  };

  // Map a point (nx, nz) in [-1, 1]² smoothly toward a superellipse / squircle cross section
  const mapCrossSection = (nx: number, nz: number, halfW: number, halfD: number, roundness: number) => {
    // Project square perimeter toward circle by `roundness` while keeping interior points proportional
    const sx = nx * Math.sqrt(Math.max(0, 1 - 0.5 * nz * nz));
    const sz = nz * Math.sqrt(Math.max(0, 1 - 0.5 * nx * nx));
    const blend = THREE.MathUtils.clamp(roundness, 0, 1);
    const fx = THREE.MathUtils.lerp(nx, sx, blend);
    const fz = THREE.MathUtils.lerp(nz, sz, blend);
    return { x: fx * halfW, z: fz * halfD };
  };

  // Store normalized coordinates in [-1, 1] for crisp distortion-free UV mapping
  const normX = new Float32Array(posAttr.count);
  const normY = new Float32Array(posAttr.count);
  const normZ = new Float32Array(posAttr.count);

  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const nx = THREE.MathUtils.clamp(v.x, -1, 1);
    const ny = THREE.MathUtils.clamp(v.y / hy, -1, 1);
    const nz = THREE.MathUtils.clamp(v.z, -1, 1);

    normX[i] = nx;
    normY[i] = ny;
    normZ[i] = nz;

    const t = (ny + 1) * 0.5;
    const p = sampleProfile(t);
    const cs = mapCrossSection(nx, nz, p.halfW, p.halfD, p.roundness);
    posAttr.setXYZ(i, cs.x + p.offsetX, -hy + t * height, cs.z + p.offsetZ);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  // Compute per-face vertex counts for BoxGeometry(2, height, 2, segX, rows, segZ)
  const faceVertCounts = [
    (segZ + 1) * (rows + 1), // 0: +X
    (segZ + 1) * (rows + 1), // 1: -X
    (segX + 1) * (segZ + 1), // 2: +Y
    (segX + 1) * (segZ + 1), // 3: -Y
    (segX + 1) * (rows + 1), // 4: +Z
    (segX + 1) * (rows + 1)  // 5: -Z
  ];

  const byName = new Map<string, UvIsland>();
  for (const isl of islands) byName.set(isl.name, isl);

  let cursor = 0;
  for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
    const count = faceVertCounts[faceIdx];
    const startVert = cursor;
    const endVert = cursor + count;
    cursor = endVert;

    const slice = faceSlices?.[faceIdx] ?? null;
    const isl = slice ? byName.get(slice.islandName) : undefined;

    let u0 = 0;
    let u1 = 1;
    let vBot = 0;
    let vTop = 1;
    if (isl) {
      const vStart = slice?.vStartFrac ?? 0;
      const vEnd = slice?.vEndFrac ?? 1;
      const inset = 0.28;
      u0 = (isl.x + inset) / texWidth;
      u1 = (isl.x + isl.w - inset) / texWidth;
      vTop = 1 - (isl.y + isl.h * vStart + inset) / texHeight;
      vBot = 1 - (isl.y + isl.h * vEnd - inset) / texHeight;
    }

    for (let vi = startVert; vi < endVert; vi++) {
      const nx = normX[vi];
      const ny = normY[vi];
      const nz = normZ[vi];

      let localU = 0;
      let localV = 0;
      switch (faceIdx) {
        case 0: // +X (viewer right / avatar left)
          localU = (-nz + 1) * 0.5;
          localV = (ny + 1) * 0.5;
          break;
        case 1: // -X (viewer left / avatar right)
          localU = (nz + 1) * 0.5;
          localV = (ny + 1) * 0.5;
          break;
        case 2: // +Y (top)
          localU = (nx + 1) * 0.5;
          localV = (-nz + 1) * 0.5;
          break;
        case 3: // -Y (bottom)
          localU = (nx + 1) * 0.5;
          localV = (nz + 1) * 0.5;
          break;
        case 4: // +Z (front)
          localU = (nx + 1) * 0.5;
          localV = (ny + 1) * 0.5;
          break;
        case 5: // -Z (back)
          localU = (-nx + 1) * 0.5;
          localV = (ny + 1) * 0.5;
          break;
      }

      uvAttr.setXY(
        vi,
        THREE.MathUtils.lerp(u0, u1, THREE.MathUtils.clamp(localU, 0, 1)),
        THREE.MathUtils.lerp(vBot, vTop, THREE.MathUtils.clamp(localV, 0, 1))
      );
    }
  }

  uvAttr.needsUpdate = true;
  return geo;
}

/**
 * Builds the iconic Roblox Woman C-shaped claw hand (matching authentic Roblox Woman 1 & Woman 2
 * rigs) with an integrated wrist collar and smooth rounded finger/thumb tips, pivoted at wrist y = 0.
 */
export function createRobloxWomanHandGeometry(side: 'left' | 'right'): THREE.BufferGeometry {
  const outerR = 0.275;
  const innerR = 0.11;
  const centerY = -0.255;
  const shape = new THREE.Shape();

  // Open C-claw notch faces downward and slightly inward toward the thigh
  const openStart = -Math.PI * 0.26; // lower-right tip
  const openEnd = Math.PI * 1.26;    // lower-left tip
  const tipMidR = (outerR + innerR) * 0.5;
  const tipR = (outerR - innerR) * 0.5;

  const steps = 18;
  // 1. Outer arc from right tip up over the wrist crown to left tip
  for (let i = 0; i <= steps; i++) {
    const a = THREE.MathUtils.lerp(openStart, openEnd, i / steps);
    const x = Math.cos(a) * outerR;
    const y = Math.sin(a) * outerR + centerY;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  // 2. Smooth semicircular rounded tip at openEnd
  const endTipCx = Math.cos(openEnd) * tipMidR;
  const endTipCy = Math.sin(openEnd) * tipMidR + centerY;
  for (let i = 1; i <= 6; i++) {
    const a = openEnd + (i / 6) * Math.PI;
    shape.lineTo(endTipCx + Math.cos(a) * tipR, endTipCy + Math.sin(a) * tipR);
  }

  // 3. Inner C-grip cavity arc back to openStart
  for (let i = steps - 1; i >= 0; i--) {
    const a = THREE.MathUtils.lerp(openStart, openEnd, i / steps);
    const x = Math.cos(a) * innerR;
    const y = Math.sin(a) * innerR + centerY;
    shape.lineTo(x, y);
  }

  // 4. Smooth semicircular rounded tip at openStart closing back to start
  const startTipCx = Math.cos(openStart) * tipMidR;
  const startTipCy = Math.sin(openStart) * tipMidR + centerY;
  for (let i = 1; i < 6; i++) {
    const a = openStart + Math.PI + (i / 6) * Math.PI;
    shape.lineTo(startTipCx + Math.cos(a) * tipR, startTipCy + Math.sin(a) * tipR);
  }
  shape.closePath();

  const depth = 0.21;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.036,
    bevelSize: 0.028,
    bevelSegments: 3,
    curveSegments: 12
  });

  // Center along Z so hand aligns cleanly with the sleeve cuff center
  geo.translate(0, 0, -depth / 2);

  // Subtle inward twist so C-claw faces naturally forward/inward like Roblox Woman rigs
  geo.rotateZ(side === 'right' ? 0.14 : -0.14);
  geo.rotateY(side === 'right' ? 0.26 : -0.26);
  geo.computeVertexNormals();
  return geo;
}

function applyBoxFaceUvs(
  geo: THREE.BufferGeometry,
  preX: Float32Array,
  preY: Float32Array,
  preZ: Float32Array,
  width: number,
  height: number,
  depth: number,
  vertsPerFace: number,
  faceSlices: (FaceUvSlice | null)[] | undefined,
  islands: UvIsland[],
  texWidth: number,
  texHeight: number
): void {
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;

  const byName = new Map<string, UvIsland>();
  for (const isl of islands) byName.set(isl.name, isl);

  for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
    const startVert = faceIdx * vertsPerFace;
    const endVert = startVert + vertsPerFace;
    const slice = faceSlices?.[faceIdx] ?? null;
    const isl = slice ? byName.get(slice.islandName) : undefined;

    let u0 = 0;
    let u1 = 1;
    let vBot = 0;
    let vTop = 1;

    if (isl) {
      const vStart = slice?.vStartFrac ?? 0;
      const vEnd = slice?.vEndFrac ?? 1;
      const inset = 0.28;
      const px0 = isl.x + inset;
      const px1 = isl.x + isl.w - inset;
      const py0 = isl.y + isl.h * vStart + inset;
      const py1 = isl.y + isl.h * vEnd - inset;

      u0 = px0 / texWidth;
      u1 = px1 / texWidth;
      vTop = 1 - py0 / texHeight;
      vBot = 1 - py1 / texHeight;
    }

    for (let vi = startVert; vi < endVert; vi++) {
      const x = preX[vi];
      const y = preY[vi];
      const z = preZ[vi];

      let localU = 0;
      let localV = 0;

      switch (faceIdx) {
        case 0:
          localU = THREE.MathUtils.clamp((-z + hz) / depth, 0, 1);
          localV = THREE.MathUtils.clamp((y + hy) / height, 0, 1);
          break;
        case 1:
          localU = THREE.MathUtils.clamp((z + hz) / depth, 0, 1);
          localV = THREE.MathUtils.clamp((y + hy) / height, 0, 1);
          break;
        case 2:
          localU = THREE.MathUtils.clamp((x + hx) / width, 0, 1);
          localV = THREE.MathUtils.clamp((-z + hz) / depth, 0, 1);
          break;
        case 3:
          localU = THREE.MathUtils.clamp((x + hx) / width, 0, 1);
          localV = THREE.MathUtils.clamp((z + hz) / depth, 0, 1);
          break;
        case 4:
          localU = THREE.MathUtils.clamp((x + hx) / width, 0, 1);
          localV = THREE.MathUtils.clamp((y + hy) / height, 0, 1);
          break;
        case 5:
          localU = THREE.MathUtils.clamp((-x + hx) / width, 0, 1);
          localV = THREE.MathUtils.clamp((y + hy) / height, 0, 1);
          break;
      }

      uvAttr.setXY(
        vi,
        THREE.MathUtils.lerp(u0, u1, localU),
        THREE.MathUtils.lerp(vBot, vTop, localV)
      );
    }
  }

  uvAttr.needsUpdate = true;
}

/**
 * Authentic Roblox Classic Head silhouette (smooth rounded bevel cylinder matching Dripzels & Customuse).
 */
export function createRobloxHeadGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const radius = 0.59;
  const halfH = 0.56;
  const bevel = 0.22;
  const steps = 8;

  points.push(new THREE.Vector2(0, -halfH));
  points.push(new THREE.Vector2(radius - bevel, -halfH));
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - bevel + Math.cos(a) * bevel,
        -halfH + bevel + Math.sin(a) * bevel
      )
    );
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - bevel + Math.cos(a) * bevel,
        halfH - bevel + Math.sin(a) * bevel
      )
    );
  }
  points.push(new THREE.Vector2(0, halfH));
  const geo = new THREE.LatheGeometry(points, 28);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Adaptive radial-fading studio floor grid that harmonizes with both Heavenly Light
 * pastel backdrops and dark studio backdrops.
 */
export function createStudioFadedGridMesh(): {
  mesh: THREE.Mesh;
  setThemeForBackground: (bgHex: string) => void;
} {
  const geo = new THREE.PlaneGeometry(24, 24);
  const uniforms = {
    uColorMajor: { value: new THREE.Color('#7dd3fc') },
    uColorMinor: { value: new THREE.Color('#cbd5e1') },
    uAlphaBoost: { value: 0.52 }
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uColorMajor;
      uniform vec3 uColorMinor;
      uniform float uAlphaBoost;

      float gridLine(vec2 coord, float spacing, float thickness) {
        vec2 p = abs(fract(coord / spacing - 0.5) - 0.5) / fwidth(coord / spacing);
        float line = min(p.x, p.y);
        return 1.0 - smoothstep(0.0, thickness, line);
      }

      void main() {
        vec2 xz = vWorldPos.xz;
        float dist = length(xz);
        float fade = 1.0 - smoothstep(3.2, 11.2, dist);
        if (fade <= 0.001) discard;

        float minor = gridLine(xz, 0.5, 1.15) * 0.25;
        float major = gridLine(xz, 2.0, 1.35) * 0.34;
        vec3 col = mix(uColorMinor, uColorMajor, clamp(major * 2.2, 0.0, 1.0));
        float alpha = clamp(minor + major, 0.0, uAlphaBoost) * fade;
        if (alpha <= 0.002) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;

  const setThemeForBackground = (bgHex: string) => {
    const c = new THREE.Color(bgHex);
    const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    if (luminance > 0.52) {
      // Soft Heavenly Light backdrop
      uniforms.uColorMajor.value.set('#38bdf8');
      uniforms.uColorMinor.value.set('#94a3b8');
      uniforms.uAlphaBoost.value = 0.36;
    } else {
      // Dark Studio backdrop
      uniforms.uColorMajor.value.set('#38bdf8');
      uniforms.uColorMinor.value.set('#475569');
      uniforms.uAlphaBoost.value = 0.42;
    }
  };

  return { mesh, setThemeForBackground };
}
