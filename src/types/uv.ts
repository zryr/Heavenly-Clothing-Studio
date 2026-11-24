export interface UvIsland {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group: 'torso' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg';
  description?: string;
}

export const TEMPLATE_WIDTH = 585;
export const TEMPLATE_HEIGHT = 559;
export const TSHIRT_SIZE = 512;

export type TemplateType = 'shirt' | 'pants' | 'tshirt';

export interface TemplateSpec {
  type: TemplateType;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  hasUvIslands: boolean;
  requirementSummary: string;
}

export const TEMPLATE_SPECS: Record<TemplateType, TemplateSpec> = {
  shirt: {
    type: 'shirt',
    label: 'Classic Shirt',
    shortLabel: 'Shirt',
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    hasUvIslands: true,
    requirementSummary: '585 × 559 px transparent PNG mapped to torso and arms'
  },
  pants: {
    type: 'pants',
    label: 'Classic Pants',
    shortLabel: 'Pants',
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    hasUvIslands: true,
    requirementSummary: '585 × 559 px transparent PNG mapped to waist and legs'
  },
  tshirt: {
    type: 'tshirt',
    label: 'Classic T-Shirt',
    shortLabel: 'T-Shirt',
    width: TSHIRT_SIZE,
    height: TSHIRT_SIZE,
    hasUvIslands: false,
    requirementSummary: '512 × 512 px square PNG placed on the front torso chest'
  }
};

export function getTemplateSpec(type: TemplateType): TemplateSpec {
  return TEMPLATE_SPECS[type];
}

/**
 * Official Roblox 585x559 Classic Shirt UV Island Layout.
 * Verified against Roblox Creator Documentation classic clothing template grid:
 * Torso Front: (231, 74) 128x128, Top: (231, 8) 128x64, Bottom: (231, 204) 128x64,
 * Right Side (viewer left): (165, 74) 64x128, Left Side (viewer right): (361, 74) 64x128, Back: (427, 74) 128x128.
 * Right Arm (template left): Front (85, 355), Outer/R (19, 355), Inner/L (151, 355), Back (217, 355), Top (217, 289), Bottom (217, 485).
 * Left Arm (template right): Inner/R (308, 355), Front (374, 355), Outer/L (440, 355), Back (506, 355), Top (308, 289), Bottom (308, 485).
 *
 * Note: We preserve 2px Roblox template divider spacing cleanly in the official defaults,
 * and also retain the legacy calibrated preset for users migrating from UV Armor v5.
 */
export const ROBLOX_SHIRT_UV_ISLANDS: UvIsland[] = [
  // --- TORSO ISLAND ---
  { name: 'Torso Top', x: 231, y: 8, w: 128, h: 64, group: 'torso', description: 'Top shoulder plane connecting neck and arms' },
  { name: 'Torso Right Side', x: 165, y: 74, w: 64, h: 128, group: 'torso', description: 'Right ribcage / armpit seam' },
  { name: 'Torso Front', x: 231, y: 74, w: 128, h: 128, group: 'torso', description: 'Front chest and abdomen main display' },
  { name: 'Torso Left Side', x: 361, y: 74, w: 64, h: 128, group: 'torso', description: 'Left ribcage / armpit seam' },
  { name: 'Torso Back', x: 427, y: 74, w: 128, h: 128, group: 'torso', description: 'Upper and lower back panel' },
  { name: 'Torso Bottom', x: 231, y: 204, w: 128, h: 64, group: 'torso', description: 'Waistline / lower torso bottom' },

  // --- RIGHT ARM ISLAND (Template Left) ---
  { name: 'Right Arm Top', x: 217, y: 289, w: 64, h: 64, group: 'right_arm', description: 'Right shoulder crown' },
  { name: 'Right Arm Outer/Right', x: 19, y: 355, w: 64, h: 128, group: 'right_arm', description: 'Right arm outer lateral face' },
  { name: 'Right Arm Front', x: 85, y: 355, w: 64, h: 128, group: 'right_arm', description: 'Right arm front sleeve' },
  { name: 'Right Arm Inner/Left', x: 151, y: 355, w: 64, h: 128, group: 'right_arm', description: 'Right arm inner face (toward torso)' },
  { name: 'Right Arm Back', x: 217, y: 355, w: 64, h: 128, group: 'right_arm', description: 'Right arm back sleeve' },
  { name: 'Right Arm Bottom/Cuff', x: 217, y: 485, w: 64, h: 64, group: 'right_arm', description: 'Right wrist cuff & hand base' },

  // --- LEFT ARM ISLAND (Template Right) ---
  { name: 'Left Arm Top', x: 308, y: 289, w: 64, h: 64, group: 'left_arm', description: 'Left shoulder crown' },
  { name: 'Left Arm Inner/Right', x: 308, y: 355, w: 64, h: 128, group: 'left_arm', description: 'Left arm inner face (toward torso)' },
  { name: 'Left Arm Front', x: 374, y: 355, w: 64, h: 128, group: 'left_arm', description: 'Left arm front sleeve' },
  { name: 'Left Arm Outer/Left', x: 440, y: 355, w: 64, h: 128, group: 'left_arm', description: 'Left arm outer lateral face' },
  { name: 'Left Arm Back', x: 506, y: 355, w: 64, h: 128, group: 'left_arm', description: 'Left arm back sleeve' },
  { name: 'Left Arm Bottom/Cuff', x: 308, y: 485, w: 64, h: 64, group: 'left_arm', description: 'Left wrist cuff & hand base' }
];

export const ROBLOX_PANTS_UV_ISLANDS: UvIsland[] = [
  // --- TORSO / PELVIS ISLAND ---
  { name: 'Torso Top', x: 231, y: 8, w: 128, h: 64, group: 'torso', description: 'Waistline top plane' },
  { name: 'Torso Right Side', x: 165, y: 74, w: 64, h: 128, group: 'torso', description: 'Right hip / belt lateral seam' },
  { name: 'Torso Front', x: 231, y: 74, w: 128, h: 128, group: 'torso', description: 'Pelvis / belt front' },
  { name: 'Torso Left Side', x: 361, y: 74, w: 64, h: 128, group: 'torso', description: 'Left hip / belt lateral seam' },
  { name: 'Torso Back', x: 427, y: 74, w: 128, h: 128, group: 'torso', description: 'Back waistband and seat' },
  { name: 'Torso Bottom', x: 231, y: 204, w: 128, h: 64, group: 'torso', description: 'Lower torso bottom seam' },

  // --- RIGHT LEG ISLAND (Template Left) ---
  { name: 'Right Leg Top', x: 217, y: 289, w: 64, h: 64, group: 'right_leg', description: 'Right upper thigh top' },
  { name: 'Right Leg Outer/Right', x: 19, y: 355, w: 64, h: 128, group: 'right_leg', description: 'Right leg outer seam' },
  { name: 'Right Leg Front', x: 85, y: 355, w: 64, h: 128, group: 'right_leg', description: 'Right thigh & shin front' },
  { name: 'Right Leg Inner/Left', x: 151, y: 355, w: 64, h: 128, group: 'right_leg', description: 'Right inseam (toward left leg)' },
  { name: 'Right Leg Back', x: 217, y: 355, w: 64, h: 128, group: 'right_leg', description: 'Right calf & hamstring back' },
  { name: 'Right Leg Bottom/Cuff', x: 217, y: 485, w: 64, h: 64, group: 'right_leg', description: 'Right hem / shoe sole' },

  // --- LEFT LEG ISLAND (Template Right) ---
  { name: 'Left Leg Top', x: 308, y: 289, w: 64, h: 64, group: 'left_leg', description: 'Left upper thigh top' },
  { name: 'Left Leg Inner/Right', x: 308, y: 355, w: 64, h: 128, group: 'left_leg', description: 'Left inseam (toward right leg)' },
  { name: 'Left Leg Front', x: 374, y: 355, w: 64, h: 128, group: 'left_leg', description: 'Left thigh & shin front' },
  { name: 'Left Leg Outer/Left', x: 440, y: 355, w: 64, h: 128, group: 'left_leg', description: 'Left leg outer seam' },
  { name: 'Left Leg Back', x: 506, y: 355, w: 64, h: 128, group: 'left_leg', description: 'Left calf & hamstring back' },
  { name: 'Left Leg Bottom/Cuff', x: 308, y: 485, w: 64, h: 64, group: 'left_leg', description: 'Left hem / shoe sole' }
];

export type ToolMode = 'pan' | 'paint' | 'eyedropper' | 'stamp' | 'marquee' | 'erase' | 'restore' | 'transform' | 'align';

export type ConformMode = 'pad' | 'crop' | 'scale';

export interface ImageTransform {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  x: 0,
  y: 0,
  scale: 1
};

export interface PreflightReport {
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  aspectRatio: number;
  isExactDimensions: boolean;
  totalPixels: number;
  visiblePixels: number;
  nonUvPixelsTotal: number;
  dirtyNonUvPixels: number;
  uvConformityPercentage: number;
  hasWatermarkPotential: boolean;
  fileSize: number;
  fileName: string;
}

export interface MarqueeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type UvSectionId = 'torso' | 'right_limb' | 'left_limb';
