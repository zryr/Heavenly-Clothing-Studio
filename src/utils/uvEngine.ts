import {
  ConformMode,
  ImageTransform,
  PreflightReport,
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TemplateType,
  UvIsland,
  getTemplateSpec
} from '../types/uv';

export const LEGACY_SHIRT_UV_KEY = 'uv_armor_shirt_islands_v5';
export const LEGACY_PANTS_UV_KEY = 'uv_armor_pants_islands_v5';
export const STORAGE_SHIRT_UV_KEY = 'heavenly_studio_uv_shirt_v1';
export const STORAGE_PANTS_UV_KEY = 'heavenly_studio_uv_pants_v1';

/**
 * Pure bitmask generator: 1 = inside UV island (+ optional bleed margin), 0 = outside.
 */
export function getUvMask(
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  bleedMargin: number = 0,
  width: number = TEMPLATE_WIDTH,
  height: number = TEMPLATE_HEIGHT
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const safeBleed = Math.max(0, Math.floor(bleedMargin));

  for (const island of islands) {
    const xStart = Math.max(0, Math.min(width, Math.floor(island.x - safeBleed)));
    const yStart = Math.max(0, Math.min(height, Math.floor(island.y - safeBleed)));
    const xEnd = Math.max(0, Math.min(width, Math.ceil(island.x + island.w + safeBleed)));
    const yEnd = Math.max(0, Math.min(height, Math.ceil(island.y + island.h + safeBleed)));

    for (let y = yStart; y < yEnd; y++) {
      const rowOffset = y * width;
      for (let x = xStart; x < xEnd; x++) {
        mask[rowOffset + x] = 1;
      }
    }
  }

  return mask;
}

/**
 * Returns which UV island contains coordinate (x, y), or null if outside all islands.
 */
export function getIslandAtCoord(
  x: number,
  y: number,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  width: number = TEMPLATE_WIDTH,
  height: number = TEMPLATE_HEIGHT
): UvIsland | null {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  for (const island of islands) {
    if (x >= island.x && x < island.x + island.w && y >= island.y && y < island.y + island.h) {
      return island;
    }
  }
  return null;
}

export interface BufferStripResult {
  dirtyPixelsStripped: number;
  remainingVisiblePixels: number;
  durationMs: number;
}

/**
 * Pure RGBA buffer stripper (works in both browser and Node unit tests).
 * Sets all pixels outside the UV mask (+ bleed margin) to transparent rgba(0, 0, 0, 0).
 */
export function stripNonUvBuffer(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  islands: UvIsland[],
  bleedMargin: number = 0
): BufferStripResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const totalPixels = width * height;
  const mask = getUvMask(islands, bleedMargin, width, height);

  let dirtyStripped = 0;
  let remainingVisible = 0;

  for (let i = 0; i < totalPixels; i++) {
    const alphaOffset = i * 4 + 3;
    const alpha = rgbaData[alphaOffset];
    if (mask[i] === 0) {
      if (alpha !== 0) {
        dirtyStripped++;
        rgbaData[i * 4] = 0;
        rgbaData[i * 4 + 1] = 0;
        rgbaData[i * 4 + 2] = 0;
        rgbaData[alphaOffset] = 0;
      }
    } else if (alpha !== 0) {
      remainingVisible++;
    }
  }

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    dirtyPixelsStripped: dirtyStripped,
    remainingVisiblePixels: remainingVisible,
    durationMs: Number(Math.max(0, end - start).toFixed(2))
  };
}

export interface StripResult extends BufferStripResult {
  cleanedImageData: ImageData;
}

/**
 * Strips pixels outside Roblox UV islands directly on a 2D canvas context.
 */
export function autoStripNonUvPixels(
  ctx: CanvasRenderingContext2D,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  bleedMargin: number = 0
): StripResult {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const result = stripNonUvBuffer(imgData.data, width, height, islands, bleedMargin);
  ctx.putImageData(imgData, 0, 0);
  return {
    ...result,
    cleanedImageData: imgData
  };
}

export interface DefringeResult {
  fringePixelsCleared: number;
  edgePixelsCrisped: number;
  totalAdjusted: number;
}

/**
 * Pure alpha-fringe cleaner for Roblox classic clothing edges (unit-testable without DOM).
 * Removes faint semi-transparent halo pixels (0 < alpha < lowThreshold) that show ugly outlines
 * on dark skin tones, and crisps near-opaque interior edges (highThreshold <= alpha < 255) to 255.
 * When islands are provided, operates strictly inside UV islands (+ optional bleedMargin).
 */
export function defringeUvAlphaBuffer(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  islands: UvIsland[] = [],
  bleedMargin: number = 0,
  lowThreshold: number = 96,
  highThreshold: number = 215
): DefringeResult {
  const totalPixels = width * height;
  const mask = islands.length > 0 ? getUvMask(islands, bleedMargin, width, height) : null;
  let fringePixelsCleared = 0;
  let edgePixelsCrisped = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (mask && mask[i] === 0) continue;
    const base = i * 4;
    const a = rgbaData[base + 3];
    if (a > 0 && a < lowThreshold) {
      rgbaData[base] = 0;
      rgbaData[base + 1] = 0;
      rgbaData[base + 2] = 0;
      rgbaData[base + 3] = 0;
      fringePixelsCleared++;
    } else if (a >= highThreshold && a < 255) {
      rgbaData[base + 3] = 255;
      edgePixelsCrisped++;
    }
  }

  return {
    fringePixelsCleared,
    edgePixelsCrisped,
    totalAdjusted: fringePixelsCleared + edgePixelsCrisped
  };
}

/**
 * Cleans semi-transparent halo/fringe pixels directly on a 2D canvas context.
 */
export function defringeUvEdges(
  ctx: CanvasRenderingContext2D,
  islands: UvIsland[] = [],
  bleedMargin: number = 0,
  lowThreshold: number = 96,
  highThreshold: number = 215
): DefringeResult {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const result = defringeUvAlphaBuffer(
    imgData.data,
    width,
    height,
    islands,
    bleedMargin,
    lowThreshold,
    highThreshold
  );
  if (result.totalAdjusted > 0) {
    ctx.putImageData(imgData, 0, 0);
  }
  return result;
}

/**
 * Pure buffer preflight analyzer (unit-testable without DOM).
 */
export function analyzeBufferPreflight(
  rgbaData: Uint8ClampedArray | null,
  width: number,
  height: number,
  templateType: TemplateType,
  fileName: string = 'untitled.png',
  fileSize: number = 0,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  bleedMargin: number = 0
): PreflightReport {
  const spec = getTemplateSpec(templateType);
  const isExactDimensions = width === spec.width && height === spec.height;
  const totalPixels = width * height;

  let dirtyNonUv = 0;
  let nonUvTotal = 0;
  let visiblePixels = 0;

  if (rgbaData && rgbaData.length >= totalPixels * 4) {
    if (spec.hasUvIslands && isExactDimensions) {
      const mask = getUvMask(islands, bleedMargin, width, height);
      for (let i = 0; i < totalPixels; i++) {
        const hasAlpha = rgbaData[i * 4 + 3] !== 0;
        if (hasAlpha) visiblePixels++;
        if (mask[i] === 0) {
          nonUvTotal++;
          if (hasAlpha) dirtyNonUv++;
        }
      }
    } else {
      for (let i = 0; i < totalPixels; i++) {
        if (rgbaData[i * 4 + 3] !== 0) visiblePixels++;
      }
    }
  }

  const uvConformity =
    nonUvTotal > 0
      ? Number((((nonUvTotal - dirtyNonUv) / nonUvTotal) * 100).toFixed(1))
      : 100;

  return {
    width,
    height,
    expectedWidth: spec.width,
    expectedHeight: spec.height,
    aspectRatio: height > 0 ? Number((width / height).toFixed(4)) : 0,
    isExactDimensions,
    totalPixels,
    visiblePixels,
    nonUvPixelsTotal: nonUvTotal,
    dirtyNonUvPixels: dirtyNonUv,
    uvConformityPercentage: uvConformity,
    hasWatermarkPotential: dirtyNonUv > 50,
    fileSize,
    fileName
  };
}

/**
 * Analyzes an HTMLCanvasElement for dimensions, visible pixel count, and outside-UV pixels.
 */
export function analyzePreflight(
  canvas: HTMLCanvasElement,
  templateType: TemplateType = 'shirt',
  fileName: string = 'untitled.png',
  fileSize: number = 0,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  bleedMargin: number = 0
): PreflightReport {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgbaData = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height).data : null;
  return analyzeBufferPreflight(
    rgbaData,
    canvas.width,
    canvas.height,
    templateType,
    fileName,
    fileSize,
    islands,
    bleedMargin
  );
}

/**
 * Pure conform geometry calculation for Pad (fit & center), Crop (fill & center-crop), or Scale (stretch).
 */
export interface ConformDrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function computeConformRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ConformMode
): ConformDrawRect {
  if (mode === 'scale') {
    return {
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      dx: 0,
      dy: 0,
      dw: targetWidth,
      dh: targetHeight
    };
  }

  if (mode === 'pad') {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const dw = Math.max(1, Math.round(sourceWidth * scale));
    const dh = Math.max(1, Math.round(sourceHeight * scale));
    const dx = Math.round((targetWidth - dw) / 2);
    const dy = Math.round((targetHeight - dh) / 2);
    return {
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      dx,
      dy,
      dw,
      dh
    };
  }

  // mode === 'crop'
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sw = targetWidth / scale;
  const sh = targetHeight / scale;
  const sx = (sourceWidth - sw) / 2;
  const sy = (sourceHeight - sh) / 2;
  return {
    sx,
    sy,
    sw,
    sh,
    dx: 0,
    dy: 0,
    dw: targetWidth,
    dh: targetHeight
  };
}

/**
 * Resamples an arbitrary image into target dimensions using Pad, Crop, or Scale.
 */
export function resampleToTarget(
  sourceImage: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: ConformMode = 'pad'
): HTMLCanvasElement {
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to acquire 2D context for resampling');

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const rect = computeConformRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode);
  ctx.drawImage(sourceImage, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);

  return targetCanvas;
}

/**
 * Renders original source image onto working canvas with non-destructive offset & scale transform.
 */
export function renderTransformedSource(
  targetCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  transform: ImageTransform
): void {
  const w = targetCtx.canvas.width;
  const h = targetCtx.canvas.height;
  targetCtx.save();
  targetCtx.clearRect(0, 0, w, h);
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = 'high';

  const drawW = sourceCanvas.width * transform.scale;
  const drawH = sourceCanvas.height * transform.scale;
  const drawX = (w - drawW) / 2 + transform.x;
  const drawY = (h - drawH) / 2 + transform.y;

  targetCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, drawX, drawY, drawW, drawH);
  targetCtx.restore();
}

/**
 * Erases a rectangular marquee box to transparent rgba(0, 0, 0, 0).
 */
export function eraseMarqueeArea(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number }
): { erasedCount: number } {
  const maxW = ctx.canvas.width;
  const maxH = ctx.canvas.height;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(maxW - x, Math.ceil(box.w));
  const h = Math.min(maxH - y, Math.ceil(box.h));

  if (w <= 0 || h <= 0) return { erasedCount: 0 };

  ctx.clearRect(x, y, w, h);
  return { erasedCount: w * h };
}

/**
 * Restores a rectangular marquee box from the pristine original canvas.
 */
export function restoreMarqueeArea(
  ctx: CanvasRenderingContext2D,
  originalCanvas: HTMLCanvasElement,
  box: { x: number; y: number; w: number; h: number }
): { restoredCount: number } {
  const maxW = ctx.canvas.width;
  const maxH = ctx.canvas.height;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(maxW - x, Math.ceil(box.w));
  const h = Math.min(maxH - y, Math.ceil(box.h));

  if (w <= 0 || h <= 0) return { restoredCount: 0 };

  ctx.clearRect(x, y, w, h);
  ctx.drawImage(originalCanvas, x, y, w, h, x, y, w, h);
  return { restoredCount: w * h };
}

/**
 * Interpolated brush stamping along a segment (eliminates dotted gaps during fast drags).
 */
export function applyBrushStroke(
  ctx: CanvasRenderingContext2D,
  mode: 'erase' | 'restore',
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  hardness: number = 0.95,
  originalCanvas?: HTMLCanvasElement | null
): void {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const step = Math.max(1, radius * 0.25);
  const steps = Math.max(1, Math.ceil(dist / step));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    const cx = fromX + (toX - fromX) * t;
    const cy = fromY + (toY - fromY) * t;

    if (mode === 'erase') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      if (hardness >= 0.95) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
      } else {
        const innerR = Math.max(0, radius * hardness);
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, radius);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    } else if (originalCanvas) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.clearRect(cx - radius - 1, cy - radius - 1, radius * 2 + 2, radius * 2 + 2);
      ctx.drawImage(originalCanvas, 0, 0);
      ctx.restore();
    }
  }
}

/**
 * Pure UV island nudge helper with canvas-boundary clamping.
 */
export function nudgeUvIslands(
  islands: UvIsland[],
  predicate: (island: UvIsland) => boolean,
  dx: number,
  dy: number,
  boundsW: number = TEMPLATE_WIDTH,
  boundsH: number = TEMPLATE_HEIGHT
): UvIsland[] {
  return islands.map((isl) => {
    if (!predicate(isl)) return isl;
    return {
      ...isl,
      x: Math.round(Math.max(0, Math.min(boundsW - isl.w, isl.x + dx))),
      y: Math.round(Math.max(0, Math.min(boundsH - isl.h, isl.y + dy)))
    };
  });
}

/**
 * Pure UV island edge extend/contract helper.
 */
export function extendUvIslands(
  islands: UvIsland[],
  predicate: (island: UvIsland) => boolean,
  edge: 'left' | 'right' | 'top' | 'bottom' | 'bleed',
  amount: number,
  scope: 'section' | 'single',
  boundsW: number = TEMPLATE_WIDTH,
  boundsH: number = TEMPLATE_HEIGHT
): UvIsland[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const isl of islands) {
    if (predicate(isl)) {
      if (isl.x < minX) minX = isl.x;
      if (isl.y < minY) minY = isl.y;
      if (isl.x + isl.w > maxX) maxX = isl.x + isl.w;
      if (isl.y + isl.h > maxY) maxY = isl.y + isl.h;
    }
  }

  return islands.map((isl) => {
    if (!predicate(isl)) return isl;
    let { x, y, w, h } = isl;

    const matchLeft = scope === 'single' || isl.x <= minX + 2;
    const matchRight = scope === 'single' || isl.x + isl.w >= maxX - 2;
    const matchTop = scope === 'single' || isl.y <= minY + 2;
    const matchBottom = scope === 'single' || isl.y + isl.h >= maxY - 2;

    if ((edge === 'left' || edge === 'bleed') && matchLeft) {
      const nextX = Math.max(0, Math.min(x + w - 4, x - amount));
      w = Math.max(4, Math.min(boundsW - nextX, w + (x - nextX)));
      x = nextX;
    }
    if ((edge === 'right' || edge === 'bleed') && matchRight) {
      w = Math.max(4, Math.min(boundsW - x, w + amount));
    }
    if ((edge === 'top' || edge === 'bleed') && matchTop) {
      const nextY = Math.max(0, Math.min(y + h - 4, y - amount));
      h = Math.max(4, Math.min(boundsH - nextY, h + (y - nextY)));
      y = nextY;
    }
    if ((edge === 'bottom' || edge === 'bleed') && matchBottom) {
      h = Math.max(4, Math.min(boundsH - y, h + amount));
    }

    return {
      ...isl,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h)
    };
  });
}

/**
 * Validates and sanitizes an export filename for Heavenly Clothing Studio.
 */
export function buildExportFilename(
  rawName: string | undefined,
  templateType: TemplateType
): string {
  const base = (rawName || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const typeSuffix = templateType === 'tshirt' ? 'TShirt' : templateType === 'pants' ? 'Pants' : 'Shirt';
  if (base.length > 0) {
    return `${base}.png`;
  }
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `Heavenly_${typeSuffix}_${stamp}.png`;
}

/**
 * Verifies exact target dimensions for the active clothing type and encodes a lossless PNG-32 Blob.
 */
export async function exportVerifiedPng(
  canvas: HTMLCanvasElement,
  templateType: TemplateType,
  customName?: string
): Promise<{ blob: Blob; filename: string; width: number; height: number }> {
  const spec = getTemplateSpec(templateType);
  if (canvas.width !== spec.width || canvas.height !== spec.height) {
    throw new Error(
      `${spec.label} exports require exact ${spec.width} × ${spec.height} px dimensions (detected ${canvas.width} × ${canvas.height} px).`
    );
  }

  const filename = buildExportFilename(customName, templateType);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode PNG image from canvas.'));
      } else {
        resolve({ blob, filename, width: canvas.width, height: canvas.height });
      }
    }, 'image/png');
  });
}

/**
 * Safely validates an array of UV islands (for storage load & JSON import).
 */
export function validateUvIslands(raw: unknown): UvIsland[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const validGroups = new Set(['torso', 'right_arm', 'left_arm', 'right_leg', 'left_leg']);
  const result: UvIsland[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.name !== 'string' ||
      typeof obj.x !== 'number' ||
      typeof obj.y !== 'number' ||
      typeof obj.w !== 'number' ||
      typeof obj.h !== 'number' ||
      !Number.isFinite(obj.x) ||
      !Number.isFinite(obj.y) ||
      !Number.isFinite(obj.w) ||
      !Number.isFinite(obj.h) ||
      obj.w < 4 ||
      obj.h < 4
    ) {
      return null;
    }
    const group = typeof obj.group === 'string' && validGroups.has(obj.group)
      ? (obj.group as UvIsland['group'])
      : 'torso';
    result.push({
      name: obj.name,
      x: Math.round(obj.x),
      y: Math.round(obj.y),
      w: Math.round(obj.w),
      h: Math.round(obj.h),
      group,
      description: typeof obj.description === 'string' ? obj.description : undefined
    });
  }
  return result;
}

/**
 * Migrates legacy UV Armor v5 localStorage coordinates into Heavenly Clothing Studio storage.
 */
export function loadOrMigrateUvIslands(
  kind: 'shirt' | 'pants',
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): { islands: UvIsland[]; isCustom: boolean; migratedFromLegacy: boolean } {
  const defaults = kind === 'shirt' ? ROBLOX_SHIRT_UV_ISLANDS : ROBLOX_PANTS_UV_ISLANDS;
  const newKey = kind === 'shirt' ? STORAGE_SHIRT_UV_KEY : STORAGE_PANTS_UV_KEY;
  const legacyKey = kind === 'shirt' ? LEGACY_SHIRT_UV_KEY : LEGACY_PANTS_UV_KEY;

  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return { islands: defaults, isCustom: false, migratedFromLegacy: false };

  try {
    const savedNew = store.getItem(newKey);
    if (savedNew) {
      const parsed = validateUvIslands(JSON.parse(savedNew));
      if (parsed) {
        return { islands: parsed, isCustom: true, migratedFromLegacy: false };
      }
    }

    const savedLegacy = store.getItem(legacyKey);
    if (savedLegacy) {
      const parsed = validateUvIslands(JSON.parse(savedLegacy));
      if (parsed) {
        store.setItem(newKey, JSON.stringify(parsed));
        return { islands: parsed, isCustom: true, migratedFromLegacy: true };
      }
    }
  } catch {
    // Ignore corrupt localStorage entries
  }

  return { islands: defaults, isCustom: false, migratedFromLegacy: false };
}
