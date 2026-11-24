import { CustomBackgroundConfig } from '../types/studio';
import { TemplateType, UvIsland, getTemplateSpec } from '../types/uv';
import { getUvMask } from './uvEngine';

export interface CustomBgGradientPreset {
  id: string;
  name: string;
  stops: [string, string, string];
  angleDeg: number;
}

export const CUSTOM_BG_GRADIENTS: CustomBgGradientPreset[] = [
  {
    id: 'cloud_sky',
    name: 'Cloud Sky',
    stops: ['#E0F2FE', '#F0F9FF', '#DBEAFE'],
    angleDeg: 135
  },
  {
    id: 'periwinkle_dawn',
    name: 'Periwinkle Dawn',
    stops: ['#DBEAFE', '#E0E7FF', '#EDE9FE'],
    angleDeg: 145
  },
  {
    id: 'soft_mint',
    name: 'Soft Mint Mist',
    stops: ['#CCFBF1', '#ECFEFF', '#E0F2FE'],
    angleDeg: 135
  },
  {
    id: 'rose_cloud',
    name: 'Rose Cloud',
    stops: ['#FCE7F3', '#F5F3FF', '#E0F2FE'],
    angleDeg: 135
  },
  {
    id: 'obsidian_studio',
    name: 'Obsidian Studio',
    stops: ['#0F172A', '#1E293B', '#0B1120'],
    angleDeg: 150
  }
];

/**
 * Pure pixel mask helper: returns a boolean array where 1 = eligible for custom background fill.
 * For Shirts & Pants, ONLY pixels outside the UV islands (with optional bleed margin) receive
 * the custom background so clothing artwork inside UV islands is never altered.
 * For Classic T-Shirts, every pixel behind transparent artwork is eligible.
 */
export function buildCustomBackgroundMask(
  width: number,
  height: number,
  templateType: TemplateType,
  islands: UvIsland[],
  bleedMargin: number = 0
): Uint8Array {
  const total = width * height;
  const spec = getTemplateSpec(templateType);
  if (!spec.hasUvIslands) {
    const all = new Uint8Array(total);
    all.fill(1);
    return all;
  }
  const uvMask = getUvMask(islands, bleedMargin, width, height);
  const bgMask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    bgMask[i] = uvMask[i] === 0 ? 1 : 0;
  }
  return bgMask;
}

/**
 * Draws the user's custom background (solid color, heavenly gradient, or custom uploaded image)
 * onto a 2D canvas context strictly outside the UV islands (for Shirts/Pants) or full-canvas
 * beneath transparent pixels (for Classic T-Shirts).
 */
export function drawCustomBackgroundLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: CustomBackgroundConfig,
  templateType: TemplateType,
  islands: UvIsland[],
  loadedBgImage: HTMLImageElement | null,
  bleedMargin: number = 0
): void {
  if (config.mode === 'transparent') return;
  if (config.mode === 'image' && (!loadedBgImage || !loadedBgImage.complete || loadedBgImage.naturalWidth === 0)) {
    return;
  }

  const spec = getTemplateSpec(templateType);

  // Render onto a small temporary canvas if we need to punch out UV islands cleanly
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = width;
  layerCanvas.height = height;
  const lctx = layerCanvas.getContext('2d');
  if (!lctx) return;

  lctx.save();
  lctx.globalAlpha = Math.max(0.05, Math.min(1, config.opacity));

  if (config.mode === 'solid') {
    lctx.fillStyle = config.solidColor;
    lctx.fillRect(0, 0, width, height);
  } else if (config.mode === 'gradient') {
    const preset =
      CUSTOM_BG_GRADIENTS.find((g) => g.id === config.gradientId) ?? CUSTOM_BG_GRADIENTS[0];
    const rad = (preset.angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.hypot(width, height) / 2;
    const grad = lctx.createLinearGradient(
      cx - Math.cos(rad) * r,
      cy - Math.sin(rad) * r,
      cx + Math.cos(rad) * r,
      cy + Math.sin(rad) * r
    );
    grad.addColorStop(0, preset.stops[0]);
    grad.addColorStop(0.5, preset.stops[1]);
    grad.addColorStop(1, preset.stops[2]);
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, width, height);
  } else if (config.mode === 'image' && loadedBgImage) {
    // Cover-fit image cleanly centered across the template
    const iw = loadedBgImage.naturalWidth;
    const ih = loadedBgImage.naturalHeight;
    const scale = Math.max(width / iw, height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    lctx.drawImage(loadedBgImage, dx, dy, dw, dh);
  }

  lctx.restore();

  // For Shirts & Pants: punch out UV island interiors so custom background NEVER touches clothing art
  if (spec.hasUvIslands && islands.length > 0) {
    lctx.save();
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = '#000000';
    for (const isl of islands) {
      const rx = Math.max(0, isl.x - bleedMargin);
      const ry = Math.max(0, isl.y - bleedMargin);
      const rw = Math.min(width - rx, isl.w + bleedMargin * 2);
      const rh = Math.min(height - ry, isl.h + bleedMargin * 2);
      lctx.fillRect(rx, ry, rw, rh);
    }
    lctx.restore();
  }

  ctx.drawImage(layerCanvas, 0, 0);
}

/**
 * Produces a composed export canvas combining the optional custom stripped background underneath
 * the garment artwork (only when config.includeInExport is true and config.mode !== 'transparent').
 */
export function composeExportCanvasWithBackground(
  workingCanvas: HTMLCanvasElement,
  templateType: TemplateType,
  islands: UvIsland[],
  config: CustomBackgroundConfig,
  loadedBgImage: HTMLImageElement | null,
  bleedMargin: number = 0
): HTMLCanvasElement {
  if (!config.includeInExport || config.mode === 'transparent') {
    return workingCanvas;
  }
  const out = document.createElement('canvas');
  out.width = workingCanvas.width;
  out.height = workingCanvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return workingCanvas;

  drawCustomBackgroundLayer(
    ctx,
    out.width,
    out.height,
    config,
    templateType,
    islands,
    loadedBgImage,
    bleedMargin
  );
  ctx.drawImage(workingCanvas, 0, 0);
  return out;
}
