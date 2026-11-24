import { UvIsland } from '../types/uv';

/**
 * Official Roblox R15 Classic Clothing Compositor
 *
 * Maps standard 585×559 Classic Shirt & Pants templates (plus 512×512 Classic T-Shirts)
 * onto the 5 official Roblox R15 UV atlases used by authentic Roblox R15 meshes
 * (`R15_Woman` & `R15_Block`):
 *   - Torso Atlas: 388 × 272 base px (UpperTorso + LowerTorso)
 *   - Limb Atlases: 264 × 284 base px each (RightArm, LeftArm, RightLeg, LeftLeg)
 *
 * Rendered at 2× HiDPI (`776 × 544` and `528 × 568`) for razor-sharp stitching and prints.
 */

export const R15_COMPOSITE_SCALE = 2;

export const R15_TORSO_BASE_W = 388;
export const R15_TORSO_BASE_H = 272;
export const R15_TORSO_W = R15_TORSO_BASE_W * R15_COMPOSITE_SCALE;
export const R15_TORSO_H = R15_TORSO_BASE_H * R15_COMPOSITE_SCALE;

export const R15_LIMB_BASE_W = 264;
export const R15_LIMB_BASE_H = 284;
export const R15_LIMB_W = R15_LIMB_BASE_W * R15_COMPOSITE_SCALE;
export const R15_LIMB_H = R15_LIMB_BASE_H * R15_COMPOSITE_SCALE;

export type R15AtlasSlot = 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

export interface R15AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Exact pixel destinations inside the 388×272 official Roblox R15 Torso Atlas */
export const R15_TORSO_RECTS = {
  top: { x: 2, y: 10, w: 128, h: 64 } as R15AtlasRect,
  front: { x: 2, y: 74, w: 128, h: 128 } as R15AtlasRect,
  left: { x: 130, y: 74, w: 64, h: 128 } as R15AtlasRect,
  back: { x: 194, y: 74, w: 128, h: 128 } as R15AtlasRect,
  right: { x: 322, y: 74, w: 64, h: 128 } as R15AtlasRect,
  bottom: { x: 2, y: 202, w: 128, h: 64 } as R15AtlasRect,
  upperWaistCap: { x: 134, y: 38, w: 64, h: 32 } as R15AtlasRect,
  lowerWaistCap: { x: 134, y: 206, w: 64, h: 32 } as R15AtlasRect
} as const;

/** Exact pixel destinations inside the 264×284 official Roblox R15 Limb Atlas */
export const R15_LIMB_RECTS = {
  top: { x: 2, y: 2, w: 64, h: 64 } as R15AtlasRect,
  // Main 108px upper+lower shaft (UpperLimb y=66..130, LowerLimb y=130..174)
  shaftRight: { x: 2, y: 66, w: 64, h: 108 } as R15AtlasRect,
  shaftFront: { x: 66, y: 66, w: 64, h: 108 } as R15AtlasRect,
  shaftLeft: { x: 130, y: 66, w: 64, h: 108 } as R15AtlasRect,
  shaftBack: { x: 194, y: 66, w: 64, h: 108 } as R15AtlasRect,
  // Internal joint ball / elbow / knee caps so bent poses never show bare skin seams
  upperJointCap: { x: 66, y: 26, w: 192, h: 40 } as R15AtlasRect,
  lowerJointCap: { x: 2, y: 174, w: 256, h: 42 } as R15AtlasRect,
  // Bottom 20px hand/foot side strips (y=218..236 on blocky, extending to 258 for Woman sculpted shoe)
  endRight: { x: 2, y: 218, w: 64, h: 18 } as R15AtlasRect,
  endRightShoe: { x: 2, y: 218, w: 64, h: 40 } as R15AtlasRect,
  endFront: { x: 66, y: 218, w: 64, h: 18 } as R15AtlasRect,
  endFrontShoe: { x: 66, y: 218, w: 64, h: 40 } as R15AtlasRect,
  endLeft: { x: 130, y: 218, w: 64, h: 18 } as R15AtlasRect,
  endLeftShoe: { x: 130, y: 218, w: 64, h: 40 } as R15AtlasRect,
  endBack: { x: 2, y: 238, w: 64, h: 18 } as R15AtlasRect,
  // Bottom / Cuff / Shoe Sole (-Y)
  bottom: { x: 198, y: 218, w: 64, h: 64 } as R15AtlasRect,
  // Woman sculpted C-hand UV pocket (x=92..145, y=241..279)
  womanHandPocket: { x: 88, y: 238, w: 64, h: 44 } as R15AtlasRect,
  // Foot ankle socket cap
  footAnkleCap: { x: 130, y: 222, w: 66, h: 56 } as R15AtlasRect
} as const;

function findIsland(islands: UvIsland[], name: string): UvIsland | undefined {
  return islands.find((i) => i.name === name);
}

/** Draw a rectangular slice from a 585×559 template onto a scaled R15 atlas canvas */
function blitSlice(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  scale = R15_COMPOSITE_SCALE,
  padPx = 0
): void {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
  ctx.drawImage(
    src,
    sx,
    sy,
    sw,
    sh,
    (dx - padPx) * scale,
    (dy - padPx) * scale,
    (dw + padPx * 2) * scale,
    (dh + padPx * 2) * scale
  );
}

/** Draw a square island rotated by an angle in radians around the destination center */
function blitRotated(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  island: UvIsland,
  dst: R15AtlasRect,
  angleRad: number,
  scale = R15_COMPOSITE_SCALE,
  padPx = 1
): void {
  const cx = (dst.x + dst.w / 2) * scale;
  const cy = (dst.y + dst.h / 2) * scale;
  const dw = (dst.w + padPx * 2) * scale;
  const dh = (dst.h + padPx * 2) * scale;
  ctx.save();
  ctx.translate(cx, cy);
  if (angleRad !== 0) ctx.rotate(angleRad);
  ctx.drawImage(src, island.x, island.y, island.w, island.h, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export interface R15CompositeInput {
  skinColor: string;
  tshirtBaseColor?: string;
  shirtCanvas: HTMLCanvasElement | null;
  pantsCanvas: HTMLCanvasElement | null;
  tshirtCanvas: HTMLCanvasElement | null;
  shirtIslands: UvIsland[];
  pantsIslands: UvIsland[];
  showUvGuide: boolean;
}

function drawTorsoLayer(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  islands: UvIsland[]
): void {
  const top = findIsland(islands, 'Torso Top');
  const front = findIsland(islands, 'Torso Front');
  const left = findIsland(islands, 'Torso Left Side');
  const back = findIsland(islands, 'Torso Back');
  const right = findIsland(islands, 'Torso Right Side');
  const bottom = findIsland(islands, 'Torso Bottom');

  // 1. Internal waist caps (sampled from lower chest/waist so hip tilt reveals fabric, not skin)
  if (front) {
    const waistSy = front.y + front.h * 0.72;
    const waistSh = Math.max(4, front.h * 0.14);
    blitSlice(
      ctx,
      src,
      front.x,
      waistSy,
      front.w,
      waistSh,
      R15_TORSO_RECTS.upperWaistCap.x,
      R15_TORSO_RECTS.upperWaistCap.y,
      R15_TORSO_RECTS.upperWaistCap.w,
      R15_TORSO_RECTS.upperWaistCap.h,
      R15_COMPOSITE_SCALE,
      2
    );
    blitSlice(
      ctx,
      src,
      front.x,
      waistSy,
      front.w,
      waistSh,
      R15_TORSO_RECTS.lowerWaistCap.x,
      R15_TORSO_RECTS.lowerWaistCap.y,
      R15_TORSO_RECTS.lowerWaistCap.w,
      R15_TORSO_RECTS.lowerWaistCap.h,
      R15_COMPOSITE_SCALE,
      2
    );
  }

  // 2. Wraparound edge bleed on X=0..2 (copies Right Side edge) and X=386..388 (copies Front edge)
  if (right) {
    blitSlice(ctx, src, right.x + right.w - 2, right.y, 2, right.h, 0, 74, 2, 128);
  }
  if (front) {
    blitSlice(ctx, src, front.x, front.y, 2, front.h, 386, 74, 2, 128);
  }

  // 3. Top & Bottom planes
  if (top) {
    blitSlice(
      ctx,
      src,
      top.x,
      top.y,
      top.w,
      top.h,
      R15_TORSO_RECTS.top.x,
      R15_TORSO_RECTS.top.y,
      R15_TORSO_RECTS.top.w,
      R15_TORSO_RECTS.top.h,
      R15_COMPOSITE_SCALE,
      1
    );
  }
  if (bottom) {
    blitSlice(
      ctx,
      src,
      bottom.x,
      bottom.y,
      bottom.w,
      bottom.h,
      R15_TORSO_RECTS.bottom.x,
      R15_TORSO_RECTS.bottom.y,
      R15_TORSO_RECTS.bottom.w,
      R15_TORSO_RECTS.bottom.h,
      R15_COMPOSITE_SCALE,
      1
    );
  }

  // 4. Primary Front, Left, Back, Right torso faces (continuous 128px vertical span y=74..202)
  const panels: Array<[UvIsland | undefined, R15AtlasRect]> = [
    [front, R15_TORSO_RECTS.front],
    [left, R15_TORSO_RECTS.left],
    [back, R15_TORSO_RECTS.back],
    [right, R15_TORSO_RECTS.right]
  ];
  for (const [isl, dst] of panels) {
    if (!isl) continue;
    blitSlice(ctx, src, isl.x, isl.y, isl.w, isl.h, dst.x, dst.y, dst.w, dst.h, R15_COMPOSITE_SCALE, 0.75);
  }
}

function drawLimbLayer(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  islands: UvIsland[],
  kind: 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
): void {
  const isRight = kind === 'rightArm' || kind === 'rightLeg';
  const isLeg = kind === 'rightLeg' || kind === 'leftLeg';
  const prefix =
    kind === 'rightArm'
      ? 'Right Arm'
      : kind === 'leftArm'
        ? 'Left Arm'
        : kind === 'rightLeg'
          ? 'Right Leg'
          : 'Left Leg';

  const top = findIsland(islands, `${prefix} Top`);
  const bottom = findIsland(islands, `${prefix} Bottom/Cuff`);
  const front = findIsland(islands, `${prefix} Front`);
  const back = findIsland(islands, `${prefix} Back`);
  const col0Right = findIsland(islands, isRight ? `${prefix} Outer/Right` : `${prefix} Inner/Right`);
  const col2Left = findIsland(islands, isRight ? `${prefix} Inner/Left` : `${prefix} Outer/Left`);

  // Official Roblox R15 limb vertical split:
  // Top 84.4% (0..108 of 128px) -> UpperLimb + LowerLimb (y=66..174)
  // Bottom 15.6% (108..128 of 128px) -> Hand / Foot (y=218..258)
  const shaftFrac = 108 / 128;
  const endFrac = 1 - shaftFrac;

  // 1. Internal joint caps (elbow/knee) so poses never reveal bare white caps
  if (front) {
    const midSy = front.y + front.h * 0.45;
    const midSh = Math.max(4, front.h * 0.14);
    blitSlice(
      ctx,
      src,
      front.x,
      midSy,
      front.w,
      midSh,
      R15_LIMB_RECTS.upperJointCap.x,
      R15_LIMB_RECTS.upperJointCap.y,
      R15_LIMB_RECTS.upperJointCap.w,
      R15_LIMB_RECTS.upperJointCap.h,
      R15_COMPOSITE_SCALE,
      2
    );
    const lowSy = front.y + front.h * 0.72;
    const lowSh = Math.max(4, front.h * 0.14);
    blitSlice(
      ctx,
      src,
      front.x,
      lowSy,
      front.w,
      lowSh,
      R15_LIMB_RECTS.lowerJointCap.x,
      R15_LIMB_RECTS.lowerJointCap.y,
      R15_LIMB_RECTS.lowerJointCap.w,
      R15_LIMB_RECTS.lowerJointCap.h,
      R15_COMPOSITE_SCALE,
      2
    );
    if (isLeg) {
      blitSlice(
        ctx,
        src,
        front.x,
        front.y + front.h * shaftFrac,
        front.w,
        front.h * endFrac,
        R15_LIMB_RECTS.footAnkleCap.x,
        R15_LIMB_RECTS.footAnkleCap.y,
        R15_LIMB_RECTS.footAnkleCap.w,
        R15_LIMB_RECTS.footAnkleCap.h,
        R15_COMPOSITE_SCALE,
        2
      );
    }
  }

  // 2. Shoulder / Hip Top (+Y)
  if (top) {
    // Classic Right Arm/Leg Top sits above Back; Left Arm/Leg Top sits above Inner/Right
    // Rotate cleanly to align with R15 limb Top UV (u -> +Z, v -> +X)
    const angle = isRight ? -Math.PI / 2 : Math.PI / 2;
    blitRotated(ctx, src, top, R15_LIMB_RECTS.top, angle, R15_COMPOSITE_SCALE, 1.5);
  }

  // 3. Wraparound X edge bleed across Col 0..Col 3
  if (back) {
    blitSlice(ctx, src, back.x + back.w - 2, back.y, 2, back.h * shaftFrac, 0, 66, 2, 108);
  }
  if (col0Right) {
    blitSlice(ctx, src, col0Right.x, col0Right.y, 2, col0Right.h * shaftFrac, 258, 66, 6, 108);
  }

  // 4. Primary 4 limb shaft columns (Upper + Lower)
  const shafts: Array<[UvIsland | undefined, R15AtlasRect]> = [
    [col0Right, R15_LIMB_RECTS.shaftRight],
    [front, R15_LIMB_RECTS.shaftFront],
    [col2Left, R15_LIMB_RECTS.shaftLeft],
    [back, R15_LIMB_RECTS.shaftBack]
  ];
  for (const [isl, dst] of shafts) {
    if (!isl) continue;
    blitSlice(
      ctx,
      src,
      isl.x,
      isl.y,
      isl.w,
      isl.h * shaftFrac,
      dst.x,
      dst.y,
      dst.w,
      dst.h,
      R15_COMPOSITE_SCALE,
      0.75
    );
  }

  // 5. Hand / Foot sides (Bottom 15.6% of each classic limb strip)
  if (col0Right) {
    const rightDst = isLeg ? R15_LIMB_RECTS.endRightShoe : R15_LIMB_RECTS.endRight;
    blitSlice(
      ctx,
      src,
      col0Right.x,
      col0Right.y + col0Right.h * shaftFrac,
      col0Right.w,
      col0Right.h * endFrac,
      rightDst.x,
      rightDst.y,
      rightDst.w,
      rightDst.h,
      R15_COMPOSITE_SCALE,
      2
    );
  }
  if (front) {
    const frontDst = isLeg ? R15_LIMB_RECTS.endFrontShoe : R15_LIMB_RECTS.endFront;
    blitSlice(
      ctx,
      src,
      front.x,
      front.y + front.h * shaftFrac,
      front.w,
      front.h * endFrac,
      frontDst.x,
      frontDst.y,
      frontDst.w,
      frontDst.h,
      R15_COMPOSITE_SCALE,
      2
    );
  }
  if (col2Left) {
    const leftDst = isLeg ? R15_LIMB_RECTS.endLeftShoe : R15_LIMB_RECTS.endLeft;
    blitSlice(
      ctx,
      src,
      col2Left.x,
      col2Left.y + col2Left.h * shaftFrac,
      col2Left.w,
      col2Left.h * endFrac,
      leftDst.x,
      leftDst.y,
      leftDst.w,
      leftDst.h,
      R15_COMPOSITE_SCALE,
      2
    );
  }
  if (back) {
    blitSlice(
      ctx,
      src,
      back.x,
      back.y + back.h * shaftFrac,
      back.w,
      back.h * endFrac,
      R15_LIMB_RECTS.endBack.x,
      R15_LIMB_RECTS.endBack.y,
      R15_LIMB_RECTS.endBack.w,
      R15_LIMB_RECTS.endBack.h,
      R15_COMPOSITE_SCALE,
      2
    );
  }

  // 6. Bottom / Cuff / Shoe Sole (-Y)
  if (bottom) {
    blitSlice(
      ctx,
      src,
      bottom.x,
      bottom.y,
      bottom.w,
      bottom.h,
      R15_LIMB_RECTS.bottom.x,
      R15_LIMB_RECTS.bottom.y,
      R15_LIMB_RECTS.bottom.w,
      R15_LIMB_RECTS.bottom.h,
      R15_COMPOSITE_SCALE,
      2
    );
    // For Woman C-Hands (UV pocket x=92..145, y=241..279):
    // Layer Bottom/Cuff transparently over skin so bare-wrist sleeves keep natural skin hands
    // while full gloves / bodysuits automatically tint the C-hands!
    if (!isLeg) {
      blitSlice(
        ctx,
        src,
        bottom.x,
        bottom.y,
        bottom.w,
        bottom.h,
        R15_LIMB_RECTS.womanHandPocket.x,
        R15_LIMB_RECTS.womanHandPocket.y,
        R15_LIMB_RECTS.womanHandPocket.w,
        R15_LIMB_RECTS.womanHandPocket.h,
        R15_COMPOSITE_SCALE,
        1
      );
    }
  }
}

function paintGuideRect(
  ctx: CanvasRenderingContext2D,
  rect: R15AtlasRect,
  fill: string,
  primaryLabel: string,
  subLabel?: string,
  jointLineY?: number
): void {
  const s = R15_COMPOSITE_SCALE;
  const x = rect.x * s;
  const y = rect.y * s;
  const w = rect.w * s;
  const h = rect.h * s;

  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);

  // Crisp subtle 16px UV alignment grid inside the face
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  const step = 16 * s;
  for (let gx = x + step; gx < x + w; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y + step; gy < y + h; gy += step) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  // Optional dashed R15 joint split line (waist / elbow / knee)
  if (jointLineY !== undefined) {
    const jy = jointLineY * s;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(x, jy);
    ctx.lineTo(x + w, jy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Subtle face perimeter frame
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  // Dead-center, auto-fitted typography (never overflows face width!)
  if (primaryLabel) {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = x + w / 2;
    const cy = subLabel ? y + h * 0.43 : y + h / 2;
    const maxFontByWidth = Math.floor((w * 0.72) / Math.max(1, primaryLabel.length * 0.62));
    const maxFontByHeight = Math.floor(h * 0.34);
    const fontSize = Math.max(14, Math.min(maxFontByWidth, maxFontByHeight, 44));
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", Inter, system-ui, sans-serif`;
    ctx.fillText(primaryLabel, cx, cy);

    if (subLabel) {
      const subFont = Math.max(11, Math.min(Math.floor(w * 0.16), 20));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = `700 ${subFont}px "Plus Jakarta Sans", Inter, system-ui, sans-serif`;
      ctx.fillText(subLabel, cx, y + h * 0.67);
    }
  }
  ctx.restore();
}

function drawR15TorsoUvGuide(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, R15_TORSO_W, R15_TORSO_H);

  // Waist internal caps
  paintGuideRect(ctx, R15_TORSO_RECTS.upperWaistCap, '#334155', '');
  paintGuideRect(ctx, R15_TORSO_RECTS.lowerWaistCap, '#334155', '');

  // Wraparound edge bleed on left/right borders
  const s = R15_COMPOSITE_SCALE;
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(0, 74 * s, 2 * s, 128 * s);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(386 * s, 74 * s, 2 * s, 128 * s);

  // Exact R15 waist seam sits at y = 169.5 (UpperTorso / LowerTorso split)
  const waistY = 169.5;
  paintGuideRect(ctx, R15_TORSO_RECTS.top, '#0ea5e9', 'TOP');
  paintGuideRect(ctx, R15_TORSO_RECTS.front, '#dc2626', 'FRONT', undefined, waistY);
  paintGuideRect(ctx, R15_TORSO_RECTS.left, '#ca8a04', 'L', undefined, waistY);
  paintGuideRect(ctx, R15_TORSO_RECTS.back, '#2563eb', 'BACK', undefined, waistY);
  paintGuideRect(ctx, R15_TORSO_RECTS.right, '#16a34a', 'R', undefined, waistY);
  paintGuideRect(ctx, R15_TORSO_RECTS.bottom, '#f97316', 'BOT');
}

function drawR15LimbUvGuide(
  ctx: CanvasRenderingContext2D,
  kind: 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
): void {
  const isLeg = kind === 'rightLeg' || kind === 'leftLeg';
  const limbTagMap = {
    rightArm: 'R ARM',
    leftArm: 'L ARM',
    rightLeg: 'R LEG',
    leftLeg: 'L LEG'
  };
  const limbTag = limbTagMap[kind];

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, R15_LIMB_W, R15_LIMB_H);

  // Internal joint caps
  paintGuideRect(ctx, R15_LIMB_RECTS.upperJointCap, '#334155', '');
  paintGuideRect(ctx, R15_LIMB_RECTS.lowerJointCap, '#334155', '');
  if (isLeg) {
    paintGuideRect(ctx, R15_LIMB_RECTS.footAnkleCap, '#334155', '');
  }

  // Exact R15 elbow / knee seam sits at y = 130 (UpperLimb / LowerLimb split)
  const jointY = 130;
  paintGuideRect(ctx, R15_LIMB_RECTS.top, '#0ea5e9', 'T');
  paintGuideRect(ctx, R15_LIMB_RECTS.shaftRight, '#16a34a', 'R', undefined, jointY);
  paintGuideRect(ctx, R15_LIMB_RECTS.shaftFront, '#dc2626', 'F', limbTag, jointY);
  paintGuideRect(ctx, R15_LIMB_RECTS.shaftLeft, '#ca8a04', 'L', undefined, jointY);
  paintGuideRect(ctx, R15_LIMB_RECTS.shaftBack, '#2563eb', 'B', limbTag, jointY);

  // Hand / Foot cuff rings (deeper matching color so wrist/ankle cuff boundary reads clearly)
  paintGuideRect(ctx, isLeg ? R15_LIMB_RECTS.endRightShoe : R15_LIMB_RECTS.endRight, '#15803d', '');
  paintGuideRect(ctx, isLeg ? R15_LIMB_RECTS.endFrontShoe : R15_LIMB_RECTS.endFront, '#b91c1c', '');
  paintGuideRect(ctx, isLeg ? R15_LIMB_RECTS.endLeftShoe : R15_LIMB_RECTS.endLeft, '#a16207', '');
  paintGuideRect(ctx, R15_LIMB_RECTS.endBack, '#1d4ed8', '');
  paintGuideRect(ctx, R15_LIMB_RECTS.bottom, '#f97316', 'BOT');

  if (!isLeg) {
    paintGuideRect(ctx, R15_LIMB_RECTS.womanHandPocket, '#ea580c', '');
  }
}

/** Composite the official 388×272 (2× HiDPI) R15 Torso Atlas */
export function compositeR15TorsoAtlas(
  ctx: CanvasRenderingContext2D,
  input: R15CompositeInput
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = input.skinColor;
  ctx.fillRect(0, 0, R15_TORSO_W, R15_TORSO_H);

  if (input.showUvGuide) {
    drawR15TorsoUvGuide(ctx);
    return;
  }

  // Classic T-Shirt base torso tint when worn solo without a shirt (leaves neck stump bare skin)
  if (input.tshirtCanvas && !input.shirtCanvas && input.tshirtBaseColor) {
    ctx.fillStyle = input.tshirtBaseColor;
    const s = R15_COMPOSITE_SCALE;
    const rects = [
      R15_TORSO_RECTS.top,
      R15_TORSO_RECTS.front,
      R15_TORSO_RECTS.left,
      R15_TORSO_RECTS.back,
      R15_TORSO_RECTS.right,
      R15_TORSO_RECTS.bottom,
      R15_TORSO_RECTS.upperWaistCap,
      R15_TORSO_RECTS.lowerWaistCap
    ];
    for (const r of rects) {
      ctx.fillRect((r.x - 1) * s, (r.y - 1) * s, (r.w + 2) * s, (r.h + 2) * s);
    }
  }

  // Roblox Engine layer order: Skin -> Pants -> Shirt -> Classic T-Shirt
  if (input.pantsCanvas) {
    drawTorsoLayer(ctx, input.pantsCanvas, input.pantsIslands);
  }
  if (input.shirtCanvas) {
    drawTorsoLayer(ctx, input.shirtCanvas, input.shirtIslands);
  }
  if (input.tshirtCanvas) {
    const f = R15_TORSO_RECTS.front;
    const pad = 1;
    ctx.drawImage(
      input.tshirtCanvas,
      0,
      0,
      input.tshirtCanvas.width,
      input.tshirtCanvas.height,
      (f.x + pad) * R15_COMPOSITE_SCALE,
      (f.y + pad) * R15_COMPOSITE_SCALE,
      (f.w - pad * 2) * R15_COMPOSITE_SCALE,
      (f.h - pad * 2) * R15_COMPOSITE_SCALE
    );
  }
}

/** Composite one of the four official 264×284 (2× HiDPI) R15 Limb Atlases */
export function compositeR15LimbAtlas(
  ctx: CanvasRenderingContext2D,
  kind: 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
  input: R15CompositeInput
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = input.skinColor;
  ctx.fillRect(0, 0, R15_LIMB_W, R15_LIMB_H);

  if (input.showUvGuide) {
    drawR15LimbUvGuide(ctx, kind);
    return;
  }

  const isArm = kind === 'rightArm' || kind === 'leftArm';
  if (isArm) {
    if (input.shirtCanvas) {
      drawLimbLayer(ctx, input.shirtCanvas, input.shirtIslands, kind);
    }
  } else {
    if (input.pantsCanvas) {
      drawLimbLayer(ctx, input.pantsCanvas, input.pantsIslands, kind);
    }
  }
}
