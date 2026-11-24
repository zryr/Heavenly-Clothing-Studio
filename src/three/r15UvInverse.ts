import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TSHIRT_SIZE,
  TemplateType,
  UvIsland
} from '../types/uv';
import {
  R15AtlasRect,
  R15AtlasSlot,
  R15_LIMB_BASE_H,
  R15_LIMB_BASE_W,
  R15_LIMB_RECTS,
  R15_TORSO_BASE_H,
  R15_TORSO_BASE_W,
  R15_TORSO_RECTS
} from './r15Compositor';

export interface MappedTemplateHit {
  x: number;
  y: number;
  islandName: string | null;
}

function insideRect(px: number, py: number, rect: R15AtlasRect, pad = 1.5): boolean {
  return (
    px >= rect.x - pad &&
    px <= rect.x + rect.w + pad &&
    py >= rect.y - pad &&
    py <= rect.y + rect.h + pad
  );
}

function mapLinear(
  px: number,
  py: number,
  srcRect: R15AtlasRect,
  dstX: number,
  dstY: number,
  dstW: number,
  dstH: number
): { x: number; y: number } {
  const fx = Math.max(0, Math.min(1, (px - srcRect.x) / Math.max(1, srcRect.w)));
  const fy = Math.max(0, Math.min(1, (py - srcRect.y) / Math.max(1, srcRect.h)));
  return {
    x: dstX + fx * dstW,
    y: dstY + fy * dstH
  };
}

/**
 * Exact mathematical inverse of `r15Compositor.ts`:
 * Converts a Three.js raycast UV hit `(u, v)` on an official R15 Torso or Limb atlas
 * directly back into exact 2D template canvas coordinates `(x, y)` for live 3D-to-2D painting!
 *
 * Note: Three.js UV `v = 0` is bottom of the texture, while HTML Canvas `y = 0` is top.
 */
export function mapR15AtlasUvToTemplate(
  slot: R15AtlasSlot,
  u: number,
  v: number,
  templateType: TemplateType,
  islands: UvIsland[],
  flipY: boolean = true
): MappedTemplateHit | null {
  const clampedU = Math.max(0, Math.min(1, u));
  const clampedV = Math.max(0, Math.min(1, v));
  const yNorm = flipY ? 1 - clampedV : clampedV;

  // Classic T-Shirt maps directly onto the Torso Front panel!
  if (templateType === 'tshirt') {
    if (slot !== 'torso') return null;
    const ax = clampedU * R15_TORSO_BASE_W;
    const ay = yNorm * R15_TORSO_BASE_H;
    const f = R15_TORSO_RECTS.front;
    if (!insideRect(ax, ay, f, 2)) return null;
    const pt = mapLinear(ax, ay, f, 0, 0, TSHIRT_SIZE, TSHIRT_SIZE);
    return { x: pt.x, y: pt.y, islandName: 'Torso Front' };
  }

  // Only allow painting Shirt on Torso + Arms, and Pants on Torso + Legs
  if (templateType === 'shirt' && (slot === 'rightLeg' || slot === 'leftLeg')) {
    return null;
  }
  if (templateType === 'pants' && (slot === 'rightArm' || slot === 'leftArm')) {
    return null;
  }

  const findIsland = (name: string) => islands.find((i) => i.name === name);

  if (slot === 'torso') {
    const ax = clampedU * R15_TORSO_BASE_W;
    const ay = yNorm * R15_TORSO_BASE_H;
    const panels: Array<[R15AtlasRect, string]> = [
      [R15_TORSO_RECTS.front, 'Torso Front'],
      [R15_TORSO_RECTS.left, 'Torso Left Side'],
      [R15_TORSO_RECTS.back, 'Torso Back'],
      [R15_TORSO_RECTS.right, 'Torso Right Side'],
      [R15_TORSO_RECTS.top, 'Torso Top'],
      [R15_TORSO_RECTS.bottom, 'Torso Bottom']
    ];
    for (const [rect, islandName] of panels) {
      if (insideRect(ax, ay, rect, 1.5)) {
        const isl = findIsland(islandName);
        if (!isl) return null;
        const pt = mapLinear(ax, ay, rect, isl.x, isl.y, isl.w, isl.h);
        return { x: pt.x, y: pt.y, islandName: isl.name };
      }
    }
    return null;
  }

  // Limb Atlas (264 x 284 base)
  const ax = clampedU * R15_LIMB_BASE_W;
  const ay = yNorm * R15_LIMB_BASE_H;
  const isRight = slot === 'rightArm' || slot === 'rightLeg';
  const isLeg = slot === 'rightLeg' || slot === 'leftLeg';
  const prefix =
    slot === 'rightArm'
      ? 'Right Arm'
      : slot === 'leftArm'
      ? 'Left Arm'
      : slot === 'rightLeg'
      ? 'Right Leg'
      : 'Left Leg';

  const col0Name = isRight ? `${prefix} Outer/Right` : `${prefix} Inner/Right`;
  const col2Name = isRight ? `${prefix} Inner/Left` : `${prefix} Outer/Left`;
  const shaftFrac = 108 / 128;
  const endFrac = 1 - shaftFrac;

  // 1. Main upper + lower limb shafts
  const shafts: Array<[R15AtlasRect, string]> = [
    [R15_LIMB_RECTS.shaftRight, col0Name],
    [R15_LIMB_RECTS.shaftFront, `${prefix} Front`],
    [R15_LIMB_RECTS.shaftLeft, col2Name],
    [R15_LIMB_RECTS.shaftBack, `${prefix} Back`]
  ];
  for (const [rect, islandName] of shafts) {
    if (insideRect(ax, ay, rect, 1.5)) {
      const isl = findIsland(islandName);
      if (!isl) return null;
      const pt = mapLinear(ax, ay, rect, isl.x, isl.y, isl.w, isl.h * shaftFrac);
      return { x: pt.x, y: pt.y, islandName: isl.name };
    }
  }

  // 2. Shoulder / Hip Top (+Y) — invert the +-90deg rotation applied in r15Compositor
  if (insideRect(ax, ay, R15_LIMB_RECTS.top, 1.5)) {
    const isl = findIsland(`${prefix} Top`);
    if (!isl) return null;
    const fx = Math.max(
      0,
      Math.min(1, (ax - R15_LIMB_RECTS.top.x) / Math.max(1, R15_LIMB_RECTS.top.w))
    );
    const fy = Math.max(
      0,
      Math.min(1, (ay - R15_LIMB_RECTS.top.y) / Math.max(1, R15_LIMB_RECTS.top.h))
    );
    // Forward rotation: right uses -90deg (u_dst = y_src, v_dst = 1 - x_src); left uses +90deg
    const srcFx = isRight ? 1 - fy : fy;
    const srcFy = isRight ? fx : 1 - fx;
    return {
      x: isl.x + srcFx * isl.w,
      y: isl.y + srcFy * isl.h,
      islandName: isl.name
    };
  }

  // 3. Hand / Foot ends (bottom 15.6% strip)
  const ends: Array<[R15AtlasRect, string]> = [
    [isLeg ? R15_LIMB_RECTS.endRightShoe : R15_LIMB_RECTS.endRight, col0Name],
    [isLeg ? R15_LIMB_RECTS.endFrontShoe : R15_LIMB_RECTS.endFront, `${prefix} Front`],
    [isLeg ? R15_LIMB_RECTS.endLeftShoe : R15_LIMB_RECTS.endLeft, col2Name],
    [R15_LIMB_RECTS.endBack, `${prefix} Back`]
  ];
  for (const [rect, islandName] of ends) {
    if (insideRect(ax, ay, rect, 1.5)) {
      const isl = findIsland(islandName);
      if (!isl) return null;
      const pt = mapLinear(
        ax,
        ay,
        rect,
        isl.x,
        isl.y + isl.h * shaftFrac,
        isl.w,
        isl.h * endFrac
      );
      return { x: pt.x, y: pt.y, islandName: isl.name };
    }
  }

  // 4. Bottom / Cuff / Sole
  if (insideRect(ax, ay, R15_LIMB_RECTS.bottom, 1.5)) {
    const isl = findIsland(`${prefix} Bottom/Cuff`);
    if (!isl) return null;
    const pt = mapLinear(ax, ay, R15_LIMB_RECTS.bottom, isl.x, isl.y, isl.w, isl.h);
    return { x: pt.x, y: pt.y, islandName: isl.name };
  }

  return null;
}

/**
 * Maps a direct procedural R6 mesh UV hit `(u, v)` onto the 585×559 template or 512×512 T-shirt.
 */
export function mapDirectTemplateUvToCanvas(
  u: number,
  v: number,
  templateType: TemplateType,
  bodyRegion: 'torso' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg',
  islands: UvIsland[]
): MappedTemplateHit | null {
  if (templateType === 'shirt' && (bodyRegion === 'right_leg' || bodyRegion === 'left_leg')) {
    return null;
  }
  if (templateType === 'pants' && (bodyRegion === 'right_arm' || bodyRegion === 'left_arm')) {
    return null;
  }

  const clampedU = Math.max(0, Math.min(1, u));
  const clampedV = Math.max(0, Math.min(1, v));
  const tx = clampedU * TEMPLATE_WIDTH;
  const ty = (1 - clampedV) * TEMPLATE_HEIGHT;

  if (templateType === 'tshirt') {
    const torsoFront = islands.find((i) => i.name === 'Torso Front');
    if (!torsoFront) return null;
    if (
      tx < torsoFront.x ||
      tx > torsoFront.x + torsoFront.w ||
      ty < torsoFront.y ||
      ty > torsoFront.y + torsoFront.h
    ) {
      return null;
    }
    return {
      x: ((tx - torsoFront.x) / torsoFront.w) * TSHIRT_SIZE,
      y: ((ty - torsoFront.y) / torsoFront.h) * TSHIRT_SIZE,
      islandName: 'Torso Front'
    };
  }

  return { x: tx, y: ty, islandName: null };
}
