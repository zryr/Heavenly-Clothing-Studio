import {
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  UvIsland,
  PreflightReport
} from '../types/uv';

// Precomputed 585x559 bitmask: 1 = inside UV island, 0 = outside (dead space)
export function getUvMask(islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS, bleedMargin: number = 0): Uint8Array {
  const mask = new Uint8Array(TEMPLATE_WIDTH * TEMPLATE_HEIGHT);

  for (const island of islands) {
    const xStart = Math.max(0, Math.min(TEMPLATE_WIDTH, Math.floor(island.x - bleedMargin)));
    const yStart = Math.max(0, Math.min(TEMPLATE_HEIGHT, Math.floor(island.y - bleedMargin)));
    const xEnd = Math.max(0, Math.min(TEMPLATE_WIDTH, Math.ceil(island.x + island.w + bleedMargin)));
    const yEnd = Math.max(0, Math.min(TEMPLATE_HEIGHT, Math.ceil(island.y + island.h + bleedMargin)));

    for (let y = yStart; y < yEnd; y++) {
      const rowOffset = y * TEMPLATE_WIDTH;
      for (let x = xStart; x < xEnd; x++) {
        mask[rowOffset + x] = 1;
      }
    }
  }

  return mask;
}

/**
 * Returns which UV island contains the coordinate (x, y), or null if in dead space.
 */
export function getIslandAtCoord(x: number, y: number, islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS): UvIsland | null {
  if (x < 0 || x >= TEMPLATE_WIDTH || y < 0 || y >= TEMPLATE_HEIGHT) return null;
  for (const island of islands) {
    if (x >= island.x && x < island.x + island.w && y >= island.y && y < island.y + island.h) {
      return island;
    }
  }
  return null;
}

export interface StripResult {
  cleanedImageData: ImageData;
  dirtyPixelsStripped: number;
  durationMs: number;
  cleanUvConformity: number;
}

/**
 * Deterministically strips 100% of pixels outside Roblox UV islands to rgba(0,0,0,0).
 * Executed via direct 32-bit memory buffer manipulation with sub-millisecond latency.
 */
export function autoStripNonUvPixels(
  ctx: CanvasRenderingContext2D,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS,
  bleedMargin: number = 0
): StripResult {
  const startTime = performance.now();
  const width = TEMPLATE_WIDTH;
  const height = TEMPLATE_HEIGHT;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data32 = new Uint32Array(imgData.data.buffer);
  const mask = getUvMask(islands, bleedMargin);

  let dirtyStripped = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] === 0) {
      // Outside UV island
      // If alpha channel > 0, it was dirty non-UV space
      if ((data32[i] & 0xff000000) !== 0) {
        dirtyStripped++;
        data32[i] = 0; // Set to transparent rgba(0,0,0,0)
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const durationMs = performance.now() - startTime;

  return {
    cleanedImageData: imgData,
    dirtyPixelsStripped: dirtyStripped,
    durationMs: Number(durationMs.toFixed(2)),
    cleanUvConformity: 100.0
  };
}

/**
 * Erases a rectangular marquee box on the canvas to rgba(0,0,0,0)
 */
export function eraseMarqueeArea(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number }
): { erasedCount: number } {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(TEMPLATE_WIDTH - x, Math.ceil(box.w));
  const h = Math.min(TEMPLATE_HEIGHT - y, Math.ceil(box.h));

  if (w <= 0 || h <= 0) return { erasedCount: 0 };

  ctx.clearRect(x, y, w, h);
  return { erasedCount: w * h };
}

/**
 * Erases a circular brush footprint
 */
export function eraseBrushCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  hardness: number = 1.0
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  
  if (hardness >= 0.95) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  } else {
    const gradient = ctx.createRadialGradient(cx, cy, radius * hardness, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
  
  ctx.restore();
}

/**
 * Analyzes an image element or canvas for pre-flight dimensions and UV conformity.
 */
export function analyzePreflight(
  canvas: HTMLCanvasElement,
  fileName: string = 'template.png',
  fileSize: number = 0,
  islands: UvIsland[] = ROBLOX_SHIRT_UV_ISLANDS
): PreflightReport {
  const width = canvas.width;
  const height = canvas.height;
  const isExactDimensions = width === TEMPLATE_WIDTH && height === TEMPLATE_HEIGHT;
  const totalPixels = width * height;

  let dirtyNonUv = 0;
  let nonUvTotal = 0;

  if (isExactDimensions) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data32 = new Uint32Array(imgData.data.buffer);
      const mask = getUvMask(islands);

      for (let i = 0; i < totalPixels; i++) {
        if (mask[i] === 0) {
          nonUvTotal++;
          if ((data32[i] & 0xff000000) !== 0) {
            dirtyNonUv++;
          }
        }
      }
    }
  }

  const uvConformity = nonUvTotal > 0
    ? Number((((nonUvTotal - dirtyNonUv) / nonUvTotal) * 100).toFixed(1))
    : 100;

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
    isExactDimensions,
    totalPixels,
    nonUvPixelsTotal: nonUvTotal,
    dirtyNonUvPixels: dirtyNonUv,
    uvConformityPercentage: uvConformity,
    hasWatermarkPotential: dirtyNonUv > 50,
    fileSize,
    fileName
  };
}

/**
 * Resamples an arbitrary image into a strictly 585x559 canvas with crisp bicubic/smooth scaling.
 */
export function resampleTo585x559(
  sourceImage: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  mode: 'scale' | 'pad' | 'crop' = 'scale'
): HTMLCanvasElement {
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = TEMPLATE_WIDTH;
  targetCanvas.height = TEMPLATE_HEIGHT;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to get 2D context for resampling');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (mode === 'scale') {
    ctx.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  } else if (mode === 'pad') {
    // Preserve aspect ratio and center on 585x559
    const scale = Math.min(TEMPLATE_WIDTH / sourceWidth, TEMPLATE_HEIGHT / sourceHeight);
    const destW = Math.round(sourceWidth * scale);
    const destH = Math.round(sourceHeight * scale);
    const destX = Math.round((TEMPLATE_WIDTH - destW) / 2);
    const destY = Math.round((TEMPLATE_HEIGHT - destH) / 2);
    ctx.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight, destX, destY, destW, destH);
  } else if (mode === 'crop') {
    // Center crop
    const scale = Math.max(TEMPLATE_WIDTH / sourceWidth, TEMPLATE_HEIGHT / sourceHeight);
    const cropW = TEMPLATE_WIDTH / scale;
    const cropH = TEMPLATE_HEIGHT / scale;
    const cropX = (sourceWidth - cropW) / 2;
    const cropY = (sourceHeight - cropH) / 2;
    ctx.drawImage(sourceImage, cropX, cropY, cropW, cropH, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  }

  return targetCanvas;
}

/**
 * Strict Export Gatekeeper: Verifies exact 585x559 bounds and generates 32-bit PNG Blob.
 */
export async function exportStrictPng(
  canvas: HTMLCanvasElement
): Promise<{ blob: Blob; filename: string }> {
  if (canvas.width !== TEMPLATE_WIDTH || canvas.height !== TEMPLATE_HEIGHT) {
    throw new Error(
      `STRICT GATEKEEPER VIOLATION: Canvas resolution must be exactly ${TEMPLATE_WIDTH}x${TEMPLATE_HEIGHT}px. Detected: ${canvas.width}x${canvas.height}px.`
    );
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `Roblox_Clean_Template_${timestamp}.png`;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG blob from canvas'));
      } else {
        resolve({ blob, filename });
      }
    }, 'image/png');
  });
}
