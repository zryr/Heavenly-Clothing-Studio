import { ImageTransform, TemplateType, UvIsland } from './uv';

export type HumanoidType = 'blocky_r15' | 'woman_1' | 'blocky_r6' | 'woman_2';
export type PoseType = 'idle' | 'fashion_hip' | 'action_walk' | 'hero' | 't_pose';
export type LightingType = 'true_color' | 'none' | '3_point';
export type ViewMode = 'split' | '2d' | '3d';
export type InspectorTab = 'canvas' | 'uv';
export type Compare3DMode = 'off' | 'split' | 'side_by_side';
export type Sheet3DType = 'none' | 'avatar' | 'stage';
export type StudioTheme = 'dark' | 'light';
export type AccessoryPreset = 'none' | 'street_beanie' | 'bob_hair' | 'visor_shades' | 'headphones';
export type BodyRegionGroup = 'torso' | 'right_arm' | 'left_arm' | 'right_leg' | 'left_leg';

export const DEFAULT_STAGE_BG_BY_THEME: Record<StudioTheme, string> = {
  dark: '#0E172A',
  light: '#EAF2FF'
};

export type CustomBackgroundMode = 'transparent' | 'solid' | 'gradient' | 'image';

export interface CustomBackgroundConfig {
  mode: CustomBackgroundMode;
  solidColor: string;
  gradientId: string;
  imageDataUrl: string | null;
  opacity: number;
  includeInExport: boolean;
}

export const DEFAULT_CUSTOM_BACKGROUND: CustomBackgroundConfig = {
  mode: 'transparent',
  solidColor: '#E0F2FE',
  gradientId: 'cloud_sky',
  imageDataUrl: null,
  opacity: 1,
  includeInExport: false
};

export interface LightSettings {
  color: string;
  intensity: number;
  x: number;
  y: number;
  z: number;
}

export interface BodyPartVisibility {
  head: boolean;
  torso: boolean;
  leftArm: boolean;
  rightArm: boolean;
  leftLeg: boolean;
  rightLeg: boolean;
}

export interface AvatarProportions {
  height: number;
  width: number;
  depth: number;
}

export interface GarmentLayerVisibility {
  shirt: boolean;
  pants: boolean;
  tshirt: boolean;
}

export interface AvatarPreviewSettings {
  humanoidType: HumanoidType;
  pose: PoseType;
  skinColor: string;
  tshirtBaseColor: string;
  showClassicFace: boolean;
  accessoryPreset: AccessoryPreset;
  visibility: BodyPartVisibility;
  layerVisibility: GarmentLayerVisibility;
  proportions: AvatarProportions;
  lightingType: LightingType;
  keyLight: LightSettings;
  fillLight: LightSettings;
  backLight: LightSettings;
  bgColor: string;
  showGrid: boolean;
  showGroundShadow: boolean;
  isGrayscale: boolean;
  projectionMode: 'perspective' | 'orthographic';
  cameraFov: number;
  showWireframe3D: boolean;
}

export const DEFAULT_AVATAR_SETTINGS: AvatarPreviewSettings = {
  humanoidType: 'blocky_r15',
  pose: 'idle',
  skinColor: '#F4C6A6',
  tshirtBaseColor: '#1E293B',
  showClassicFace: false,
  accessoryPreset: 'none',
  visibility: {
    head: true,
    torso: true,
    leftArm: true,
    rightArm: true,
    leftLeg: true,
    rightLeg: true
  },
  layerVisibility: {
    shirt: true,
    pants: true,
    tshirt: true
  },
  proportions: {
    height: 1.0,
    width: 1.0,
    depth: 1.0
  },
  lightingType: 'true_color',
  keyLight: { color: '#ffffff', intensity: 0.72, x: 3.8, y: 5.8, z: 5.5 },
  fillLight: { color: '#dbeafe', intensity: 0.45, x: -4.5, y: 2.5, z: 4.0 },
  backLight: { color: '#bae6fd', intensity: 0.42, x: 0.0, y: 4.8, z: -5.2 },
  bgColor: '#0E172A',
  showGrid: true,
  showGroundShadow: true,
  isGrayscale: false,
  projectionMode: 'perspective',
  cameraFov: 44,
  showWireframe3D: false
};

export interface SavedOutfitSlotData {
  originalBlob: Blob | null;
  workingBlob: Blob | null;
  transform: ImageTransform;
  projectName?: string;
}

export interface StudioProjectRecord {
  id: string;
  name: string;
  templateType: TemplateType;
  originalBlob: Blob | null;
  workingBlob: Blob | null;
  transform: ImageTransform;
  customShirtIslands?: UvIsland[];
  customPantsIslands?: UvIsland[];
  avatarSettings: AvatarPreviewSettings;
  createdAt: number;
  updatedAt: number;
  isAutoDraft?: boolean;
  isOutfitLookbook?: boolean;
  outfitSlots?: Partial<Record<TemplateType, SavedOutfitSlotData>>;
}

export interface StudioProjectSummary {
  id: string;
  name: string;
  templateType: TemplateType;
  createdAt: number;
  updatedAt: number;
  isAutoDraft?: boolean;
  isOutfitLookbook?: boolean;
  outfitSlotCount?: number;
  thumbnailUrl?: string;
}

export type LoupeZoomFactor = 2 | 4 | 6 | 8 | 12;
export type LoupeDiameter = 112 | 148 | 188;

export interface LoupeSettings {
  zoom: LoupeZoomFactor;
  diameter: LoupeDiameter;
  showPixelGrid: boolean;
  showHexReadout: boolean;
}

export const DEFAULT_LOUPE_SETTINGS: LoupeSettings = {
  zoom: 4,
  diameter: 148,
  showPixelGrid: true,
  showHexReadout: true
};

export interface SavedDecalPreset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface FloatingDecalState {
  x: number;
  y: number;
  size: number;
  rotationDeg: number;
  opacity: number;
  imageUrl: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface HistoryTimelineItem {
  index: number;
  label: string;
  timestamp: number;
  thumbDataUrl: string;
}

export interface HoverPixelInfo {
  x: number;
  y: number;
  island: UvIsland | null;
  colorRgba: string | null;
}

export interface ToastNotice {
  id: string;
  text: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

