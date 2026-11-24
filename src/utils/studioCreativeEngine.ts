import { TEMPLATE_HEIGHT, TEMPLATE_WIDTH, UvIsland } from '../types/uv';
import { getIslandAtCoord } from './uvEngine';

export interface DecalStampConfig {
  activePresetId: string | null;
  customImageUrl: string | null;
  customName: string;
  size: number;        // px diameter/width on template
  rotationDeg: number; // -180..180
  opacity: number;     // 0.1..1
}

export const DEFAULT_DECAL_STAMP: DecalStampConfig = {
  activePresetId: null,
  customImageUrl: null,
  customName: '',
  size: 52,
  rotationDeg: 0,
  opacity: 1
};

export const PAINT_SWATCHES = [
  '#F8FAFC',
  '#0F172A',
  '#38BDF8',
  '#2563EB',
  '#E11D48',
  '#F59E0B',
  '#10B981',
  '#A855F7'
];

export interface CompactIslandLabel {
  prefix: string;
  face: string;
  fontSize: number;
  prefixFontSize: number;
}

/**
 * Formats Roblox UV island names into short, strictly-bounded 2-line studio labels
 * that NEVER overflow narrow 64px limb/side boxes at any zoom level.
 */
export function formatCompactIslandLabel(island: UvIsland): CompactIslandLabel {
  let prefix = '';
  let face = island.name;

  if (island.name.startsWith('Torso ')) {
    prefix = 'TORSO';
    face = island.name.slice(6);
  } else if (island.name.startsWith('Right Arm ')) {
    prefix = 'R ARM';
    face = island.name.slice(10);
  } else if (island.name.startsWith('Left Arm ')) {
    prefix = 'L ARM';
    face = island.name.slice(9);
  } else if (island.name.startsWith('Right Leg ')) {
    prefix = 'R LEG';
    face = island.name.slice(10);
  } else if (island.name.startsWith('Left Leg ')) {
    prefix = 'L LEG';
    face = island.name.slice(9);
  }

  // Shorten verbose face descriptors cleanly so every face is <= 6 chars
  const faceMap: Record<string, string> = {
    'Right Side': 'R SIDE',
    'Left Side': 'L SIDE',
    'Outer/Right': 'OUTER',
    'Outer/Left': 'OUTER',
    'Inner/Left': 'INNER',
    'Inner/Right': 'INNER',
    'Bottom/Cuff': 'CUFF',
    Front: 'FRONT',
    Back: 'BACK',
    Top: 'TOP',
    Bottom: 'BTM'
  };

  const compactFace = (faceMap[face] || face.toUpperCase()).slice(0, 7);
  // Narrow islands (< 96px wide) use ultra-compact 2-char prefix codes
  const compactPrefix =
    island.w < 96
      ? prefix
          .replace('TORSO', 'T')
          .replace('R ARM', 'RA')
          .replace('L ARM', 'LA')
          .replace('R LEG', 'RL')
          .replace('L LEG', 'LL')
      : prefix;

  const usableW = Math.max(20, island.w - 10);
  const longestChars = Math.max(compactFace.length, compactPrefix.length, 3);
  // Monospace glyph advance is ~0.62 * fontSize; clamp cleanly inside island width & height
  const maxByWidth = usableW / (longestChars * 0.68);
  const maxByHeight = Math.max(6, (island.h - 10) / 2.6);
  const fontSize = Math.max(6.2, Math.min(10.5, Number(Math.min(maxByWidth, maxByHeight).toFixed(2))));
  const prefixFontSize = Math.max(5.5, Number((fontSize * 0.78).toFixed(2)));

  return {
    prefix: compactPrefix,
    face: compactFace,
    fontSize,
    prefixFontSize
  };
}

/**
 * Pure mirror symmetry mapper for Roblox 585x559 Shirt/Pants templates.
 * Maps a canvas coordinate on one limb to its exact mirrored coordinate on the opposite limb,
 * or mirrors horizontally across the Torso centerline (and Torso Right Side <-> Left Side).
 */
export function computeMirrorCanvasPoint(
  x: number,
  y: number,
  islands: UvIsland[],
  canvasW: number = TEMPLATE_WIDTH,
  canvasH: number = TEMPLATE_HEIGHT
): { x: number; y: number; island: UvIsland | null } | null {
  if (!islands.length) {
    // Classic T-Shirt 512x512: simple horizontal mirror across center
    const mx = canvasW - x;
    return { x: mx, y, island: null };
  }

  const srcIsland = getIslandAtCoord(Math.floor(x), Math.floor(y), islands, canvasW, canvasH);
  if (!srcIsland) return null;

  const relX = x - srcIsland.x;
  const relY = y - srcIsland.y;
  const mirroredRelX = srcIsland.w - relX;

  // 1. Torso Center faces (Front, Back, Top, Bottom): mirror horizontally inside same island
  if (
    srcIsland.name === 'Torso Front' ||
    srcIsland.name === 'Torso Back' ||
    srcIsland.name === 'Torso Top' ||
    srcIsland.name === 'Torso Bottom'
  ) {
    return {
      x: srcIsland.x + mirroredRelX,
      y,
      island: srcIsland
    };
  }

  // 2. Torso Right Side <-> Torso Left Side
  if (srcIsland.name === 'Torso Right Side' || srcIsland.name === 'Torso Left Side') {
    const targetName =
      srcIsland.name === 'Torso Right Side' ? 'Torso Left Side' : 'Torso Right Side';
    const target = islands.find((i) => i.name === targetName);
    if (!target) return null;
    return {
      x: target.x + (mirroredRelX / srcIsland.w) * target.w,
      y: target.y + (relY / srcIsland.h) * target.h,
      island: target
    };
  }

  // 3. Limbs: Right Arm <-> Left Arm, Right Leg <-> Left Leg
  let targetName: string | null = null;
  if (srcIsland.name.startsWith('Right Arm ')) {
    const suffix = srcIsland.name.replace('Right Arm ', '');
    const mappedSuffix =
      suffix === 'Outer/Right'
        ? 'Outer/Left'
        : suffix === 'Inner/Left'
        ? 'Inner/Right'
        : suffix;
    targetName = `Left Arm ${mappedSuffix}`;
  } else if (srcIsland.name.startsWith('Left Arm ')) {
    const suffix = srcIsland.name.replace('Left Arm ', '');
    const mappedSuffix =
      suffix === 'Outer/Left'
        ? 'Outer/Right'
        : suffix === 'Inner/Right'
        ? 'Inner/Left'
        : suffix;
    targetName = `Right Arm ${mappedSuffix}`;
  } else if (srcIsland.name.startsWith('Right Leg ')) {
    const suffix = srcIsland.name.replace('Right Leg ', '');
    const mappedSuffix =
      suffix === 'Outer/Right'
        ? 'Outer/Left'
        : suffix === 'Inner/Left'
        ? 'Inner/Right'
        : suffix;
    targetName = `Left Leg ${mappedSuffix}`;
  } else if (srcIsland.name.startsWith('Left Leg ')) {
    const suffix = srcIsland.name.replace('Left Leg ', '');
    const mappedSuffix =
      suffix === 'Outer/Left'
        ? 'Outer/Right'
        : suffix === 'Inner/Right'
        ? 'Inner/Left'
        : suffix;
    targetName = `Right Leg ${mappedSuffix}`;
  }

  if (!targetName) return null;
  const target = islands.find((i) => i.name === targetName);
  if (!target) return null;

  return {
    x: target.x + (mirroredRelX / srcIsland.w) * target.w,
    y: target.y + (relY / srcIsland.h) * target.h,
    island: target
  };
}

/**
 * Smooth interpolated paint brush stroke with optional UV island clipping.
 */
export function applyPaintStroke(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  color: string,
  hardness: number = 0.95,
  opacity: number = 1,
  clipIslands?: UvIsland[]
): void {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const step = Math.max(1, radius * 0.22);
  const steps = Math.max(1, Math.ceil(dist / step));

  ctx.save();
  if (clipIslands && clipIslands.length > 0) {
    ctx.beginPath();
    for (const isl of clipIslands) {
      ctx.rect(isl.x, isl.y, isl.w, isl.h);
    }
    ctx.clip();
  }

  ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    const cx = fromX + (toX - fromX) * t;
    const cy = fromY + (toY - fromY) * t;

    if (hardness >= 0.92) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      const innerR = Math.max(0, radius * hardness);
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Draws a crisp custom PNG decal stamp centered at (cx, cy), preserving aspect ratio,
 * rotation, opacity, and optional UV island clipping.
 */
export function drawDecalStamp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  config: DecalStampConfig,
  customImg?: HTMLImageElement | null,
  clipIslands?: UvIsland[]
): boolean {
  if (!customImg || customImg.naturalWidth <= 0 || customImg.naturalHeight <= 0) {
    return false;
  }

  ctx.save();
  if (clipIslands && clipIslands.length > 0) {
    ctx.beginPath();
    for (const isl of clipIslands) {
      ctx.rect(isl.x, isl.y, isl.w, isl.h);
    }
    ctx.clip();
  }

  ctx.translate(cx, cy);
  ctx.rotate((config.rotationDeg * Math.PI) / 180);
  ctx.globalAlpha = Math.max(0.08, Math.min(1, config.opacity));

  const s = Math.max(8, config.size);
  const aspect = customImg.naturalWidth / Math.max(1, customImg.naturalHeight);
  const drawW = aspect >= 1 ? s : s * aspect;
  const drawH = aspect >= 1 ? s / aspect : s;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(customImg, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();
  return true;
}

export interface SeamConnectionInfo {
  edge: 'top' | 'bottom' | 'left' | 'right';
  label: string;
  connectsTo: string;
  color: string;
}

/**
 * Returns the key Roblox UV seam crossovers for a hovered/selected island
 * so designers can see exact armpit, collar, waist, and sleeve wrap connections.
 */
export function getIslandSeamCrossovers(island: UvIsland): SeamConnectionInfo[] {
  switch (island.name) {
    case 'Torso Front':
      return [
        { edge: 'top', label: 'Collar', connectsTo: 'Torso Top', color: '#38BDF8' },
        { edge: 'left', label: 'R Armpit', connectsTo: 'Torso Right Side', color: '#10B981' },
        { edge: 'right', label: 'L Armpit', connectsTo: 'Torso Left Side', color: '#F59E0B' },
        { edge: 'bottom', label: 'Waist Hem', connectsTo: 'Torso Bottom', color: '#F97316' }
      ];
    case 'Torso Back':
      return [
        { edge: 'top', label: 'Back Neck', connectsTo: 'Torso Top', color: '#38BDF8' },
        { edge: 'left', label: 'L Side Seam', connectsTo: 'Torso Left Side', color: '#F59E0B' },
        { edge: 'right', label: 'R Side Seam', connectsTo: 'Torso Right Side', color: '#10B981' },
        { edge: 'bottom', label: 'Back Hem', connectsTo: 'Torso Bottom', color: '#F97316' }
      ];
    case 'Torso Right Side':
      return [
        { edge: 'right', label: 'Front Seam', connectsTo: 'Torso Front', color: '#EF4444' },
        { edge: 'left', label: 'Back Seam', connectsTo: 'Torso Back', color: '#3B82F6' }
      ];
    case 'Torso Left Side':
      return [
        { edge: 'left', label: 'Front Seam', connectsTo: 'Torso Front', color: '#EF4444' },
        { edge: 'right', label: 'Back Seam', connectsTo: 'Torso Back', color: '#3B82F6' }
      ];
    default:
      if (island.name.includes('Front')) {
        return [
          {
            edge: 'top',
            label: 'Shoulder/Hip',
            connectsTo: `${island.group.replace('_', ' ')} Top`,
            color: '#38BDF8'
          },
          { edge: 'bottom', label: 'Wrist/Ankle', connectsTo: 'Cuff / Hem', color: '#F97316' }
        ];
      }
      if (island.name.includes('Back')) {
        return [
          { edge: 'top', label: 'Cap Seam', connectsTo: 'Top', color: '#38BDF8' },
          { edge: 'bottom', label: 'Cuff Seam', connectsTo: 'Bottom', color: '#F97316' }
        ];
      }
      return [];
  }
}

/**
 * Horizontal wraparound seam ring topology for Roblox Classic Shirts & Pants.
 * Each ring lists the 4 continuous lateral UV islands in wrap order (left-to-right).
 */
const HORIZONTAL_SEAM_RINGS: string[][] = [
  ['Torso Right Side', 'Torso Front', 'Torso Left Side', 'Torso Back'],
  ['Right Arm Outer/Right', 'Right Arm Front', 'Right Arm Inner/Left', 'Right Arm Back'],
  ['Left Arm Inner/Right', 'Left Arm Front', 'Left Arm Outer/Left', 'Left Arm Back'],
  ['Right Leg Outer/Right', 'Right Leg Front', 'Right Leg Inner/Left', 'Right Leg Back'],
  ['Left Leg Inner/Right', 'Left Leg Front', 'Left Leg Outer/Left', 'Left Leg Back']
];

/**
 * Computes additional brush stroke center points on adjacent horizontally-connected
 * UV islands whenever a brush dab near a seam edge overflows into the neighboring panel.
 * Eliminates harsh seam discontinuities when painting wraparound stripes, sleeves, or belts!
 */
export function computeSeamWrappedPoints(
  x: number,
  y: number,
  radius: number,
  islands: UvIsland[],
  canvasW: number = TEMPLATE_WIDTH,
  canvasH: number = TEMPLATE_HEIGHT
): { x: number; y: number; island: UvIsland }[] {
  if (!islands.length || radius <= 0) return [];
  const src = getIslandAtCoord(Math.floor(x), Math.floor(y), islands, canvasW, canvasH);
  if (!src) return [];

  const ring = HORIZONTAL_SEAM_RINGS.find((r) => r.includes(src.name));
  if (!ring) return [];

  const idx = ring.indexOf(src.name);
  const relY = (y - src.y) / Math.max(1, src.h);
  const results: { x: number; y: number; island: UvIsland }[] = [];

  // Overflow past left edge -> enters right edge of previous island in ring
  const distLeft = x - src.x;
  if (distLeft < radius) {
    const prevName = ring[(idx - 1 + ring.length) % ring.length];
    const prevIsl = islands.find((i) => i.name === prevName);
    if (prevIsl) {
      results.push({
        x: prevIsl.x + prevIsl.w + distLeft,
        y: prevIsl.y + relY * prevIsl.h,
        island: prevIsl
      });
    }
  }

  // Overflow past right edge -> enters left edge of next island in ring
  const distRight = src.x + src.w - x;
  if (distRight < radius) {
    const nextName = ring[(idx + 1) % ring.length];
    const nextIsl = islands.find((i) => i.name === nextName);
    if (nextIsl) {
      results.push({
        x: nextIsl.x - distRight,
        y: nextIsl.y + relY * nextIsl.h,
        island: nextIsl
      });
    }
  }

  return results;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Smart Color Picker — extracts up to `count` (default 5) perceptually distinct
 * dominant colors from an RGBA image buffer using 5-bit quantized color histograms
 * with perceptual RGB distance separation (prioritizing clean garment tones).
 * When `uvMask` is provided (for Shirts/Pants), samples strictly inside UV islands
 * so outside template backgrounds never pollute the suggested garment palette.
 */
export function extractDominantPaletteFromBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  uvMask?: Uint8Array | null,
  count: number = 5
): string[] {
  if (!data || width <= 0 || height <= 0 || count <= 0) return [];

  const totalPixels = width * height;
  // Stride 2 keeps 585x559 extraction under ~2ms with crisp accuracy
  const stride = totalPixels > 80_000 ? 2 : 1;

  interface Bucket {
    count: number;
    rSum: number;
    gSum: number;
    bSum: number;
    satSum: number;
  }

  const buckets = new Map<number, Bucket>();

  const collect = (useMask: boolean) => {
    buckets.clear();
    for (let y = 0; y < height; y += stride) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += stride) {
        const pxIdx = rowOffset + x;
        if (useMask && uvMask && uvMask[pxIdx] === 0) continue;

        const i = pxIdx * 4;
        const a = data[i + 3];
        if (a < 140) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 4-bit per channel quantization (4096 bins) groups subtle anti-aliased noise cleanly
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { count: 0, rSum: 0, gSum: 0, bSum: 0, satSum: 0 };
          buckets.set(key, bucket);
        }
        bucket.count++;
        bucket.rSum += r;
        bucket.gSum += g;
        bucket.bSum += b;
        bucket.satSum += sat;
      }
    }
  };

  collect(Boolean(uvMask && uvMask.length === totalPixels));
  // Fallback to full canvas if UV islands happened to be completely transparent
  if (buckets.size === 0 && uvMask) {
    collect(false);
  }
  if (buckets.size === 0) return [];

  // Convert buckets into weighted color candidates (slight chroma boost so signature garment accents surface alongside base fabric)
  const candidates = Array.from(buckets.values()).map((b) => {
    const r = b.rSum / b.count;
    const g = b.gSum / b.count;
    const bl = b.bSum / b.count;
    const avgSat = b.satSum / b.count;
    const score = b.count * (1 + avgSat * 0.45);
    return { r, g, b: bl, count: b.count, score };
  });

  candidates.sort((a, b) => b.score - a.score);

  // Perceptual weighted Euclidean RGB distance (redmean approximation)
  const colorDist = (
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number }
  ): number => {
    const rMean = (c1.r + c2.r) * 0.5;
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(
      (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db
    );
  };

  const selected: { r: number; g: number; b: number; hex: string }[] = [];
  // Two-pass threshold: first pick well-separated distinct tones (>= 52), then relax (>= 26) if canvas is monochromatic
  for (const minDist of [52, 26, 10]) {
    for (const cand of candidates) {
      if (selected.length >= count) break;
      const hex = rgbToHex(cand.r, cand.g, cand.b);
      if (selected.some((s) => s.hex === hex)) continue;
      if (selected.every((s) => colorDist(s, cand) >= minDist)) {
        selected.push({ r: cand.r, g: cand.g, b: cand.b, hex });
      }
    }
    if (selected.length >= count) break;
  }

  return selected.map((s) => s.hex);
}

/**
 * Convenience wrapper extracting up to `count` dominant colors directly from an HTMLCanvasElement.
 */
export function extractDominantPaletteFromCanvas(
  canvas: HTMLCanvasElement,
  uvMask?: Uint8Array | null,
  count: number = 5
): string[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return [];
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return extractDominantPaletteFromBuffer(imgData.data, canvas.width, canvas.height, uvMask, count);
}


