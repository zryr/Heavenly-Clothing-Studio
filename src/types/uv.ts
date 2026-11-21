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

export const ROBLOX_SHIRT_UV_ISLANDS: UvIsland[] = [
  // --- TORSO ISLAND ---
  { name: "Torso Top", x: 230, y: 11, w: 128, h: 64, group: 'torso', description: "Top shoulder plane connecting neck and arms" },
  { name: "Torso Right Side", x: 166, y: 75, w: 64, h: 128, group: 'torso', description: "Right ribcage / armpit seam" },
  { name: "Torso Front", x: 230, y: 75, w: 128, h: 128, group: 'torso', description: "Front chest and abdomen main display" },
  { name: "Torso Left Side", x: 358, y: 75, w: 64, h: 128, group: 'torso', description: "Left ribcage / armpit seam" },
  { name: "Torso Back", x: 422, y: 75, w: 128, h: 128, group: 'torso', description: "Upper and lower back panel" },
  { name: "Torso Bottom", x: 230, y: 203, w: 128, h: 64, group: 'torso', description: "Waistline / lower pelvis bottom" },

  // --- RIGHT ARM ISLAND (Template Left) ---
  { name: "Right Arm Top", x: 215, y: 294, w: 64, h: 64, group: 'right_arm', description: "Right shoulder crown (inner center)" },
  { name: "Right Arm Outer/Right", x: 23, y: 358, w: 64, h: 128, group: 'right_arm', description: "Right arm outer lateral face" },
  { name: "Right Arm Front", x: 87, y: 358, w: 64, h: 128, group: 'right_arm', description: "Right arm bicep & forearm front" },
  { name: "Right Arm Inner/Left", x: 151, y: 358, w: 64, h: 128, group: 'right_arm', description: "Right arm inner medial face (facing torso)" },
  { name: "Right Arm Back", x: 215, y: 358, w: 64, h: 128, group: 'right_arm', description: "Right arm tricep & elbow back" },
  { name: "Right Arm Bottom/Cuff", x: 215, y: 486, w: 64, h: 64, group: 'right_arm', description: "Right wrist cuff & hand base (inner center)" },

  // --- LEFT ARM ISLAND (Template Right) ---
  { name: "Left Arm Top", x: 307, y: 293, w: 64, h: 64, group: 'left_arm', description: "Left shoulder crown (inner center)" },
  { name: "Left Arm Inner/Right", x: 307, y: 357, w: 64, h: 128, group: 'left_arm', description: "Left arm inner medial face (facing torso)" },
  { name: "Left Arm Front", x: 371, y: 357, w: 64, h: 128, group: 'left_arm', description: "Left arm bicep & forearm front" },
  { name: "Left Arm Outer/Left", x: 435, y: 357, w: 64, h: 128, group: 'left_arm', description: "Left arm outer lateral face" },
  { name: "Left Arm Back", x: 499, y: 357, w: 64, h: 128, group: 'left_arm', description: "Left arm tricep & elbow back" },
  { name: "Left Arm Bottom/Cuff", x: 307, y: 485, w: 64, h: 64, group: 'left_arm', description: "Left wrist cuff & hand base (inner center)" }
];

export const ROBLOX_PANTS_UV_ISLANDS: UvIsland[] = [
  // --- TORSO / PELVIS ISLAND ---
  { name: "Torso Top", x: 230, y: 11, w: 128, h: 64, group: 'torso', description: "Waistline interior top" },
  { name: "Torso Right Side", x: 166, y: 75, w: 64, h: 128, group: 'torso', description: "Right hip / belt lateral seam" },
  { name: "Torso Front", x: 230, y: 75, w: 128, h: 128, group: 'torso', description: "Pelvis / crotch / belt front" },
  { name: "Torso Left Side", x: 358, y: 75, w: 64, h: 128, group: 'torso', description: "Left hip / belt lateral seam" },
  { name: "Torso Back", x: 422, y: 75, w: 128, h: 128, group: 'torso', description: "Posterior / back pockets" },
  { name: "Torso Bottom", x: 230, y: 203, w: 128, h: 64, group: 'torso', description: "Crotch seam / bottom" },

  // --- RIGHT LEG ISLAND (Template Left) ---
  { name: "Right Leg Top", x: 215, y: 294, w: 64, h: 64, group: 'right_leg', description: "Right upper thigh top (inner center)" },
  { name: "Right Leg Outer/Right", x: 23, y: 358, w: 64, h: 128, group: 'right_leg', description: "Right leg outer lateral seam" },
  { name: "Right Leg Front", x: 87, y: 358, w: 64, h: 128, group: 'right_leg', description: "Right thigh & shin front" },
  { name: "Right Leg Inner/Left", x: 151, y: 358, w: 64, h: 128, group: 'right_leg', description: "Right inseam (facing left leg)" },
  { name: "Right Leg Back", x: 215, y: 358, w: 64, h: 128, group: 'right_leg', description: "Right calf & hamstring back" },
  { name: "Right Leg Bottom/Cuff", x: 215, y: 486, w: 64, h: 64, group: 'right_leg', description: "Right pant hem / boot cuff (inner center)" },

  // --- LEFT LEG ISLAND (Template Right) ---
  { name: "Left Leg Top", x: 307, y: 293, w: 64, h: 64, group: 'left_leg', description: "Left upper thigh top (inner center)" },
  { name: "Left Leg Inner/Right", x: 307, y: 357, w: 64, h: 128, group: 'left_leg', description: "Left inseam (facing right leg)" },
  { name: "Left Leg Front", x: 371, y: 357, w: 64, h: 128, group: 'left_leg', description: "Left thigh & shin front" },
  { name: "Left Leg Outer/Left", x: 435, y: 357, w: 64, h: 128, group: 'left_leg', description: "Left leg outer lateral seam" },
  { name: "Left Leg Back", x: 499, y: 357, w: 64, h: 128, group: 'left_leg', description: "Left calf & hamstring back" },
  { name: "Left Leg Bottom/Cuff", x: 307, y: 485, w: 64, h: 64, group: 'left_leg', description: "Left pant hem / boot cuff (inner center)" }
];

export type TemplateType = 'shirt' | 'pants';

export type ToolMode = 'pan' | 'marquee' | 'brush' | 'picker' | 'align';

export interface PreflightReport {
  width: number;
  height: number;
  aspectRatio: number;
  isExactDimensions: boolean;
  totalPixels: number;
  nonUvPixelsTotal: number;
  dirtyNonUvPixels: number; // Pixels outside UV that have alpha > 0
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
