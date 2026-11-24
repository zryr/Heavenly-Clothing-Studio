import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AccessoryPreset,
  AvatarPreviewSettings,
  BodyRegionGroup,
  Compare3DMode,
  HumanoidType,
  PoseType
} from '../types/studio';
import {
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TemplateType,
  UvIsland
} from '../types/uv';
import {
  FaceUvSlice,
  LoftRingProfile,
  createRobloxBeveledPartGeometry,
  createRobloxHeadGeometry,
  createRobloxSculptedLoftGeometry,
  createRobloxWomanHandGeometry,
  createStudioFadedGridMesh
} from './robloxMeshBuilder';
import {
  R15AtlasSlot,
  R15CompositeInput,
  R15_LIMB_H,
  R15_LIMB_W,
  R15_TORSO_H,
  R15_TORSO_W,
  compositeR15LimbAtlas,
  compositeR15TorsoAtlas
} from './r15Compositor';
import {
  mapDirectTemplateUvToCanvas,
  mapR15AtlasUvToTemplate
} from './r15UvInverse';
import {
  RobloxR15MeshPack,
  RobloxR15PartName,
  getCachedRobloxRigPacks,
  preloadOfficialRobloxRigs
} from './robloxRigLoader';
import {
  TouchTapRecord,
  classifyMultiTouchTap,
  computePinchDollyDistance,
  computePinchOrthoZoom
} from '../utils/touchGestures';

export type CameraPresetId = 'front' | 'three_quarter' | 'back' | 'left' | 'right' | 'top';

export interface GarmentSlotSource {
  workingCanvas: HTMLCanvasElement | null;
  originalCanvas: HTMLCanvasElement | null;
  hasImage: boolean;
}

export interface MultiGarmentInput {
  shirt: GarmentSlotSource;
  pants: GarmentSlotSource;
  tshirt: GarmentSlotSource;
  shirtIslands: UvIsland[];
  pantsIslands: UvIsland[];
}

export interface AvatarRigMetadata {
  id: HumanoidType;
  label: string;
  shortLabel: string;
  verified: boolean;
  note: string;
}

export const RIG_METADATA: Record<HumanoidType, AvatarRigMetadata> = {
  blocky_r15: {
    id: 'blocky_r15',
    label: 'Blocky (R15)',
    shortLabel: 'R15',
    verified: true,
    note: 'Authentic official 15-part Roblox R15 Blocky rig'
  },
  woman_1: {
    id: 'woman_1',
    label: 'Woman 1',
    shortLabel: 'Woman 1',
    verified: true,
    note: 'Authentic official Roblox R15 Woman body & C-hands'
  },
  blocky_r6: {
    id: 'blocky_r6',
    label: 'Blocky (R6)',
    shortLabel: 'R6',
    verified: true,
    note: 'Classic 6-part beveled Roblox R6 rig'
  },
  woman_2: {
    id: 'woman_2',
    label: 'Woman 2',
    shortLabel: 'Woman 2',
    verified: true,
    note: 'Official Roblox Woman torso & C-hands + Blocky R15 legs'
  }
};

interface PartGroupRefs {
  root: THREE.Group;
  head: THREE.Group;
  faceMesh: THREE.Mesh;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  usedOfficialWomanArms?: boolean;
}

interface AvatarMaterialSet {
  skin: THREE.MeshStandardMaterial;
  upperBody: THREE.MeshStandardMaterial;
  lowerBody: THREE.MeshStandardMaterial;
  r15Torso: THREE.MeshStandardMaterial;
  r15RightArm: THREE.MeshStandardMaterial;
  r15LeftArm: THREE.MeshStandardMaterial;
  r15RightLeg: THREE.MeshStandardMaterial;
  r15LeftLeg: THREE.MeshStandardMaterial;
}

interface AtlasCanvasBundle {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

interface R15AtlasTextureSet {
  torso: AtlasCanvasBundle;
  rightArm: AtlasCanvasBundle;
  leftArm: AtlasCanvasBundle;
  rightLeg: AtlasCanvasBundle;
  leftLeg: AtlasCanvasBundle;
}

// Reusable scratch vectors (zero GC allocations inside render loop)
const _tmpCamPos = new THREE.Vector3();
const _tmpTarget = new THREE.Vector3();
const _tmpNormal = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _pinchDir = new THREE.Vector3();
const _pinchRight = new THREE.Vector3();
const _pinchUp = new THREE.Vector3();

/**
 * Pure helper mapping 2D template brush diameter (px) to 3D avatar surface ring radius (world units).
 */
export function computeBrush3DRadiusWorld(brushSizePx: number): number {
  const clamped = Math.max(2, Math.min(64, Number.isFinite(brushSizePx) ? brushSizePx : 16));
  // 128px Torso Front maps to ~2.0 world units wide -> 1px ≈ 0.0156 world units (radius = diameter / 2)
  return Number(Math.max(0.032, Math.min(0.42, (clamped * 0.5) * 0.0145)).toFixed(4));
}

// 2× HiDPI compositing resolution for crisp clothing details on 3D avatar
const COMP_SCALE = 2;
const COMP_W = TEMPLATE_WIDTH * COMP_SCALE;
const COMP_H = TEMPLATE_HEIGHT * COMP_SCALE;

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createSubtleFaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(94, 108, 10, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(162, 108, 10, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(98, 102, 3.2, 0, Math.PI * 2);
  ctx.arc(166, 102, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 134, 28, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 122);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.24)');
  grad.addColorStop(0.52, 'rgba(15, 23, 42, 0.11)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Authentic Roblox Woman Torso Profile (gentle athletic taper, lower waist seam, flat-ish chest/back + soft beveled sides)
const WOMAN_UPPER_TORSO_PROFILE: LoftRingProfile[] = [
  { t: 0.0, halfW: 0.61, halfD: 0.39, roundness: 0.24 },  // Subtle natural waist seam
  { t: 0.24, halfW: 0.65, halfD: 0.42, roundness: 0.24 }, // Lower ribcage
  { t: 0.54, halfW: 0.72, halfD: 0.45, roundness: 0.22 }, // Bust / mid chest
  { t: 0.80, halfW: 0.75, halfD: 0.44, roundness: 0.22 }, // Upper chest / shoulder line
  { t: 0.92, halfW: 0.72, halfD: 0.41, roundness: 0.28 }, // Smooth clavicle slope
  { t: 1.0, halfW: 0.60, halfD: 0.35, roundness: 0.34 }   // Clean neck base
];

const WOMAN_LOWER_TORSO_PROFILE: LoftRingProfile[] = [
  { t: 0.0, halfW: 0.72, halfD: 0.44, roundness: 0.22 },  // Hip hem (exact width match to Woman 1 thighs)
  { t: 0.22, halfW: 0.73, halfD: 0.44, roundness: 0.22 }, // Pelvis fullness
  { t: 0.64, halfW: 0.66, halfD: 0.41, roundness: 0.24 }, // Upper hip flare
  { t: 1.0, halfW: 0.61, halfD: 0.39, roundness: 0.24 }   // Flush match to UpperTorso waist
];

// Sculpted Roblox Woman Slim Arm Profile factory (rounded deltoid cap tucked cleanly into shoulder — zero pointy horns!)
function buildWomanArmProfile(side: 'right' | 'left'): LoftRingProfile[] {
  // 'right' arm sits at -X (viewer left), so inward toward torso is +X; 'left' arm is mirrored (-X)
  const inward = side === 'right' ? 1 : -1;
  return [
    { t: 0.0, halfW: 0.175, halfD: 0.195, roundness: 0.46, offsetX: -0.02 * inward }, // Slim wrist cuff
    { t: 0.34, halfW: 0.195, halfD: 0.215, roundness: 0.44, offsetX: -0.01 * inward }, // Forearm
    { t: 0.66, halfW: 0.225, halfD: 0.245, roundness: 0.42, offsetX: 0.0 },           // Upper arm / bicep
    { t: 0.82, halfW: 0.23, halfD: 0.25, roundness: 0.46, offsetX: 0.02 * inward },   // Deltoid round
    { t: 0.91, halfW: 0.20, halfD: 0.22, roundness: 0.56, offsetX: 0.06 * inward },   // Smooth shoulder curve
    { t: 0.97, halfW: 0.15, halfD: 0.17, roundness: 0.68, offsetX: 0.10 * inward },   // Deltoid crown
    { t: 1.0, halfW: 0.09, halfD: 0.11, roundness: 0.76, offsetX: 0.13 * inward }     // Flush tuck inside shoulder
  ];
}

const WOMAN_RIGHT_ARM_PROFILE = buildWomanArmProfile('right');
const WOMAN_LEFT_ARM_PROFILE = buildWomanArmProfile('left');

// Woman 1: Close-set Slim Sculpted Legs (matches Dripzels Woman 1 — minimal upper thigh gap, gentle calf & rounded shoe foot)
const WOMAN1_LEG_PROFILE: LoftRingProfile[] = [
  { t: 0.0, halfW: 0.285, halfD: 0.39, roundness: 0.52, offsetZ: 0.035 },  // Soft rounded shoe sole
  { t: 0.07, halfW: 0.305, halfD: 0.41, roundness: 0.48, offsetZ: 0.035 }, // Foot instep
  { t: 0.18, halfW: 0.305, halfD: 0.37, roundness: 0.44, offsetZ: 0.01 },  // Ankle
  { t: 0.44, halfW: 0.325, halfD: 0.39, roundness: 0.40, offsetZ: -0.005 },// Calf
  { t: 0.72, halfW: 0.34, halfD: 0.40, roundness: 0.36, offsetZ: 0.0 },    // Mid thigh
  { t: 0.90, halfW: 0.355, halfD: 0.42, roundness: 0.32, offsetZ: 0.0 },   // Full upper thigh (meets inner seam cleanly)
  { t: 1.0, halfW: 0.345, halfD: 0.40, roundness: 0.36, offsetZ: 0.0 }     // Seamless tuck into pelvis
];

// Woman 2: Iconic Thick Classic Blocky Legs with Flush Inner Seam & Smoothly Domed Outer Hip Shoulders (1:1 match to Dripzels Woman 2!)
function buildWoman2LegProfile(side: 'right' | 'left'): LoftRingProfile[] {
  // 'right' leg sits at -X (viewer left), so inward toward the center seam is +X; 'left' leg is mirrored (-X)
  const inward = side === 'right' ? 1 : -1;
  const baseHalfW = 0.488;
  const outerDome = (t: number, halfW: number, halfD: number, roundness: number): LoftRingProfile => ({
    t,
    halfW,
    halfD,
    roundness,
    offsetX: (baseHalfW - halfW) * inward
  });
  return [
    { t: 0.0, halfW: 0.468, halfD: 0.475, roundness: 0.11, offsetX: (baseHalfW - 0.468) * inward * 0.4 }, // Crisp beveled blocky sole
    { t: 0.04, halfW: baseHalfW, halfD: 0.495, roundness: 0.08, offsetX: 0 }, // Sturdy straight blocky ankle
    { t: 0.76, halfW: baseHalfW, halfD: 0.495, roundness: 0.08, offsetX: 0 }, // Straight blocky shaft (flush at inseam)
    outerDome(0.82, 0.480, 0.488, 0.14), // Begins outer hip curve while inner thigh stays vertical
    outerDome(0.89, 0.458, 0.466, 0.24), // Smoothly domed outer hip shoulder
    outerDome(0.95, 0.420, 0.426, 0.34), // Upper outer hip tuck
    outerDome(1.0, 0.365, 0.370, 0.42)   // Flush tuck into Woman pelvis (zero inner V-gap!)
  ];
}

const WOMAN2_RIGHT_LEG_PROFILE = buildWoman2LegProfile('right');
const WOMAN2_LEFT_LEG_PROFILE = buildWoman2LegProfile('left');

/**
 * Pure Three.js studio avatar preview engine:
 * - Seamless zero-gap R15 & R6 beveled rigs + sculpted authentic Woman 1 & Woman 2 rigs with C-hands
 * - High-framerate lag-free rendering (zero dynamic shadow-map overhead, optimized bevel polycount)
 * - Crisp True-Color Studio default lighting + Flat Unlit + 3-Point Studio options
 * - Simultaneous Shirt + Pants + T-Shirt layering + 3D Compare (Wipe & Side-by-Side)
 */
export class AvatarSceneEngine {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private perspCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private envTexture: THREE.Texture | null = null;

  private hemiLight: THREE.HemisphereLight;
  private ambientFlatLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private backLight: THREE.DirectionalLight;

  private gridMesh: THREE.Mesh;
  private setGridThemeForBg: (bgHex: string) => void;
  private contactShadowPrimary: THREE.Mesh;
  private contactShadowCompare: THREE.Mesh;
  private contactShadowTexture: THREE.CanvasTexture;

  // Dual Avatar Containers for Side-by-Side 3D Compare
  private primaryContainer: THREE.Group;
  private compareContainer: THREE.Group;
  private primaryParts: PartGroupRefs | null = null;
  private compareParts: PartGroupRefs | null = null;

  private primaryMats: AvatarMaterialSet;
  private compareMats: AvatarMaterialSet;
  private faceMaterial: THREE.MeshBasicMaterial;
  private faceTexture: THREE.CanvasTexture;

  private rigDisposableGeometries: THREE.BufferGeometry[] = [];
  private rigDisposableMaterials: THREE.Material[] = [];
  private officialRigs: { woman: RobloxR15MeshPack; block: RobloxR15MeshPack } | null = null;
  private highlightedRegion: BodyRegionGroup | null = null;
  private isRecordingVideo = false;

  // Dual Composited Texture Sets (Classic R6 / Fallback)
  private editedUpperCanvas: HTMLCanvasElement;
  private editedUpperCtx: CanvasRenderingContext2D;
  private editedUpperTex: THREE.CanvasTexture;
  private editedLowerCanvas: HTMLCanvasElement;
  private editedLowerCtx: CanvasRenderingContext2D;
  private editedLowerTex: THREE.CanvasTexture;

  private origUpperCanvas: HTMLCanvasElement;
  private origUpperCtx: CanvasRenderingContext2D;
  private origUpperTex: THREE.CanvasTexture;
  private origLowerCanvas: HTMLCanvasElement;
  private origLowerCtx: CanvasRenderingContext2D;
  private origLowerTex: THREE.CanvasTexture;

  // Dual Official Roblox R15 Atlas Texture Sets (Torso 388x272 + 4 Limbs 264x284 at 2x HiDPI)
  private editedR15: R15AtlasTextureSet;
  private origR15: R15AtlasTextureSet;

  private settings: AvatarPreviewSettings;
  private garments: MultiGarmentInput = {
    shirt: { workingCanvas: null, originalCanvas: null, hasImage: false },
    pants: { workingCanvas: null, originalCanvas: null, hasImage: false },
    tshirt: { workingCanvas: null, originalCanvas: null, hasImage: false },
    shirtIslands: ROBLOX_SHIRT_UV_ISLANDS,
    pantsIslands: ROBLOX_PANTS_UV_ISLANDS
  };

  private compareMode: Compare3DMode = 'off';
  private compareSplitRatio = 0.5;
  private showUvGuideDummy = false;

  // On-demand render & smooth damping state
  private frameId: number | null = null;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private turntableEnabled = false;
  private lastTickTime = 0;
  private isOrbitInteracting = false;
  private dampingFramesRemaining = 0;
  private userHasOrbited = false;

  // Smooth camera transition & rig-switch pop-in state
  private camGoalPos: THREE.Vector3 | null = null;
  private camGoalTarget: THREE.Vector3 | null = null;
  private rigPopProgress = 1;

  private resizeObserver: ResizeObserver;
  private onContextLostCb?: () => void;
  private onContextRestoredCb?: () => void;
  private onSelectBodyRegionCb?: (region: BodyRegionGroup) => void;
  private onPaint3DStrokeCb?: (
    phase: 'start' | 'move' | 'end' | 'cancel',
    hit: { x: number; y: number; bodyRegion: BodyRegionGroup } | null
  ) => void;
  private onGestureUndoCb?: () => void;
  private onGestureRedoCb?: () => void;
  private onGestureFeedbackCb?: (label: string) => void;
  private paint3DEnabled = false;
  private paint3DTemplateType: TemplateType = 'shirt';
  private paint3DBrushSize = 16;
  private paint3DBrushColor = '#38BDF8';
  private isPainting3D = false;
  private pendingTouch3DPaint: {
    pointerId: number;
    startX: number;
    startY: number;
    startHit: { x: number; y: number; bodyRegion: BodyRegionGroup };
    hasStarted: boolean;
  } | null = null;
  private activeTouchPointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number; startTime: number }
  >();
  private completedTouchTaps: TouchTapRecord[] = [];
  private maxTouchFingersInGesture = 0;
  private hadMultiTouchMove = false;
  private touchPinchCooldownUntil = 0;
  private lastSingleTapMeta: { x: number; y: number; time: number } | null = null;
  private touchPinch3D: {
    startSpan: number;
    startCamDist: number;
    startOrthoZoom: number;
    startMidX: number;
    startMidY: number;
    startTarget: THREE.Vector3;
    startDir: THREE.Vector3;
  } | null = null;
  private raycaster = new THREE.Raycaster();
  private rayNdc = new THREE.Vector2();
  private pointerDownPos: { x: number; y: number; time: number } | null = null;
  private cachedCanvasRect: DOMRect | null = null;
  private pickablePrimaryMeshes: THREE.Mesh[] = [];

  // Lightweight 3D Brush Hover Ring projected onto avatar surface
  private brushCursorGroup: THREE.Group;
  private brushCursorInnerMat: THREE.MeshBasicMaterial;
  private brushCursorOuterMat: THREE.MeshBasicMaterial;

  // Lazy / Partial Texture Upload Tracking (zero redundant recompositing!)
  private origTexturesDirty = true;
  private pendingFastRegions = new Set<BodyRegionGroup>();
  private pendingFastAll = false;
  private fastRefreshRafId: number | null = null;

  constructor(
    container: HTMLElement,
    initialSettings: AvatarPreviewSettings,
    callbacks?: {
      onContextLost?: () => void;
      onContextRestored?: () => void;
      onSelectBodyRegion?: (region: BodyRegionGroup) => void;
      onPaint3DStroke?: (
        phase: 'start' | 'move' | 'end' | 'cancel',
        hit: { x: number; y: number; bodyRegion: BodyRegionGroup } | null
      ) => void;
      onGestureUndo?: () => void;
      onGestureRedo?: () => void;
      onGestureFeedback?: (label: string) => void;
    }
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onContextLostCb = callbacks?.onContextLost;
    this.onContextRestoredCb = callbacks?.onContextRestored;
    this.onSelectBodyRegionCb = callbacks?.onSelectBodyRegion;
    this.onPaint3DStrokeCb = callbacks?.onPaint3DStroke;
    this.onGestureUndoCb = callbacks?.onGestureUndo;
    this.onGestureRedoCb = callbacks?.onGestureRedo;
    this.onGestureFeedbackCb = callbacks?.onGestureFeedback;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;

    // 1. High-Performance WebGL Renderer (no heavy real-time shadowMap pass!)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = false;

    const canvasEl = this.renderer.domElement;
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.display = 'block';
    canvasEl.style.touchAction = 'none';
    container.appendChild(canvasEl);

    // 2. Scene & Subtle Studio IBL
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.settings.bgColor);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    // 3. Cameras (aspect-aware framing so narrow portrait mobile viewports never clip avatar arms!)
    this.perspCamera = new THREE.PerspectiveCamera(this.settings.cameraFov, aspect, 0.1, 100);
    const initDistScale = this.getAspectDistanceScale();
    this.perspCamera.position.set(0.45 * initDistScale, 3.15, 8.2 * initDistScale);

    const frustum = 7.4 * Math.max(1, initDistScale * 0.9);
    this.orthoCamera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      100
    );
    this.orthoCamera.position.copy(this.perspCamera.position);
    this.activeCamera =
      this.settings.projectionMode === 'orthographic' ? this.orthoCamera : this.perspCamera;

    // 4. Silky-Smooth OrbitControls (fluid inertial damping on real GPUs)
    this.controls = new OrbitControls(this.activeCamera, canvasEl);
    this.controls.target.set(0, 2.38, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.085;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };
    this.controls.update();
    this.controls.addEventListener('change', this.handleControlsChange);
    this.controls.addEventListener('start', this.handleControlsStart);
    this.controls.addEventListener('end', this.handleControlsEnd);

    // 5. Studio Lighting Rig
    this.hemiLight = new THREE.HemisphereLight('#f0f9ff', '#cbd5e1', 0.55);
    this.ambientFlatLight = new THREE.AmbientLight('#ffffff', 1.15);

    this.keyLight = new THREE.DirectionalLight('#ffffff', 0.72);
    this.keyLight.position.set(3.8, 5.8, 5.5);

    this.fillLight = new THREE.DirectionalLight('#dbeafe', 0.45);
    this.fillLight.position.set(-4.5, 2.5, 4.0);

    this.backLight = new THREE.DirectionalLight('#bae6fd', 0.42);
    this.backLight.position.set(0, 4.8, -5.2);

    this.scene.add(
      this.hemiLight,
      this.ambientFlatLight,
      this.keyLight,
      this.fillLight,
      this.backLight
    );

    // 6. Adaptive Studio Floor Grid + Soft Baked Contact Shadows
    const gridHelper = createStudioFadedGridMesh();
    this.gridMesh = gridHelper.mesh;
    this.setGridThemeForBg = gridHelper.setThemeForBackground;
    this.setGridThemeForBg(this.settings.bgColor);
    this.scene.add(this.gridMesh);

    this.contactShadowTexture = createContactShadowTexture();
    const makeContactMesh = () => {
      const geo = new THREE.PlaneGeometry(3.8, 3.8);
      const mat = new THREE.MeshBasicMaterial({
        map: this.contactShadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.85
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.003;
      return m;
    };
    this.contactShadowPrimary = makeContactMesh();
    this.contactShadowCompare = makeContactMesh();
    this.contactShadowCompare.visible = false;
    this.scene.add(this.contactShadowPrimary, this.contactShadowCompare);

    // 7. Dual Composited Canvases & Textures (Edited vs Original)
    const maxAniso = this.isSoftwareGl
      ? 1
      : Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const makeCanvasPair = () => {
      const c = document.createElement('canvas');
      c.width = COMP_W;
      c.height = COMP_H;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = !this.isSoftwareGl;
      tex.minFilter = this.isSoftwareGl ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return { c, ctx, tex };
    };

    const eUp = makeCanvasPair();
    this.editedUpperCanvas = eUp.c;
    this.editedUpperCtx = eUp.ctx;
    this.editedUpperTex = eUp.tex;

    const eLo = makeCanvasPair();
    this.editedLowerCanvas = eLo.c;
    this.editedLowerCtx = eLo.ctx;
    this.editedLowerTex = eLo.tex;

    const oUp = makeCanvasPair();
    this.origUpperCanvas = oUp.c;
    this.origUpperCtx = oUp.ctx;
    this.origUpperTex = oUp.tex;

    const oLo = makeCanvasPair();
    this.origLowerCanvas = oLo.c;
    this.origLowerCtx = oLo.ctx;
    this.origLowerTex = oLo.tex;

    const makeAtlasBundle = (w: number, h: number): AtlasCanvasBundle => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = !this.isSoftwareGl;
      tex.minFilter = this.isSoftwareGl ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return { canvas, ctx, tex };
    };

    const makeR15Set = (): R15AtlasTextureSet => ({
      torso: makeAtlasBundle(R15_TORSO_W, R15_TORSO_H),
      rightArm: makeAtlasBundle(R15_LIMB_W, R15_LIMB_H),
      leftArm: makeAtlasBundle(R15_LIMB_W, R15_LIMB_H),
      rightLeg: makeAtlasBundle(R15_LIMB_W, R15_LIMB_H),
      leftLeg: makeAtlasBundle(R15_LIMB_W, R15_LIMB_H)
    });

    this.editedR15 = makeR15Set();
    this.origR15 = makeR15Set();

    this.faceTexture = createSubtleFaceTexture();
    this.faceMaterial = new THREE.MeshBasicMaterial({
      map: this.faceTexture,
      transparent: true,
      depthWrite: false
    });

    const makeBodyMat = (map: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map,
        color: new THREE.Color('#ffffff'),
        roughness: 0.82,
        metalness: 0.02
      });

    const makeMaterialSet = (
      upperTex: THREE.CanvasTexture,
      lowerTex: THREE.CanvasTexture,
      r15Set: R15AtlasTextureSet
    ): AvatarMaterialSet => ({
      skin: new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.settings.skinColor),
        roughness: 0.72,
        metalness: 0.01
      }),
      upperBody: makeBodyMat(upperTex),
      lowerBody: makeBodyMat(lowerTex),
      r15Torso: makeBodyMat(r15Set.torso.tex),
      r15RightArm: makeBodyMat(r15Set.rightArm.tex),
      r15LeftArm: makeBodyMat(r15Set.leftArm.tex),
      r15RightLeg: makeBodyMat(r15Set.rightLeg.tex),
      r15LeftLeg: makeBodyMat(r15Set.leftLeg.tex)
    });

    this.primaryMats = makeMaterialSet(this.editedUpperTex, this.editedLowerTex, this.editedR15);
    this.compareMats = makeMaterialSet(this.origUpperTex, this.origLowerTex, this.origR15);

    // Pick up already-cached official Roblox GLBs synchronously if available, else preload async
    const cached = getCachedRobloxRigPacks();
    if (cached.woman && cached.block) {
      this.officialRigs = { woman: cached.woman, block: cached.block };
    } else {
      preloadOfficialRobloxRigs()
        .then((packs) => {
          if (this.disposed) return;
          this.officialRigs = packs;
          this.rebuildRigs();
          this.recompositeAllTextures();
          this.requestRender();
        })
        .catch(() => {
          // Graceful procedural fallback already rendered
        });
    }

    // 8. Avatar Containers + Lightweight 3D Brush Hover Ring
    this.primaryContainer = new THREE.Group();
    this.compareContainer = new THREE.Group();
    this.compareContainer.visible = false;
    this.scene.add(this.primaryContainer, this.compareContainer);

    this.brushCursorGroup = new THREE.Group();
    this.brushCursorGroup.visible = false;
    this.brushCursorGroup.renderOrder = 20;
    const outerRingGeo = new THREE.RingGeometry(0.96, 1.14, 28);
    this.brushCursorOuterMat = new THREE.MeshBasicMaterial({
      color: '#040914',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    const innerRingGeo = new THREE.RingGeometry(0.80, 0.98, 28);
    this.brushCursorInnerMat = new THREE.MeshBasicMaterial({
      color: this.paint3DBrushColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    this.brushCursorGroup.add(
      new THREE.Mesh(outerRingGeo, this.brushCursorOuterMat),
      new THREE.Mesh(innerRingGeo, this.brushCursorInnerMat)
    );
    this.scene.add(this.brushCursorGroup);

    this.rebuildRigs();
    this.recompositeAllTextures();
    this.applySettings(this.settings, true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.activeCamera);
    }

    // 9. Listeners (capture phase so 3D Paint & universal 2-finger pinch-to-zoom preempt cleanly on touchscreens)
    canvasEl.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvasEl.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    canvasEl.addEventListener('pointerdown', this.handleCanvasPointerDown, true);
    canvasEl.addEventListener('pointermove', this.handleCanvasPointerMove, true);
    canvasEl.addEventListener('pointerup', this.handleCanvasPointerUp, true);
    canvasEl.addEventListener('pointercancel', this.handleCanvasPointerUp, true);
    canvasEl.addEventListener('pointerleave', this.handleCanvasPointerLeave, false);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.requestRender();
  }

  public setPaint3DMode(enabled: boolean, templateType: TemplateType): void {
    this.paint3DEnabled = enabled;
    this.paint3DTemplateType = templateType;
    if (!enabled) {
      if (this.brushCursorGroup.visible) {
        this.brushCursorGroup.visible = false;
        this.requestRender();
      }
      if (this.isPainting3D || this.pendingTouch3DPaint) {
        const hadStarted = this.isPainting3D && (!this.pendingTouch3DPaint || this.pendingTouch3DPaint.hasStarted);
        this.isPainting3D = false;
        this.pendingTouch3DPaint = null;
        this.controls.enabled = true;
        if (hadStarted) {
          this.onPaint3DStrokeCb?.('end', null);
        }
      }
    }
  }

  public getCameraDistance(): number {
    return Number(this.activeCamera.position.distanceTo(this.controls.target).toFixed(4));
  }

  public setPaint3DStyle(color: string, mode: 'paint' | 'erase', brushSizePx: number): void {
    this.paint3DBrushColor = color;
    this.paint3DBrushSize = brushSizePx;
    this.brushCursorInnerMat.color.set(mode === 'erase' ? '#F43F5E' : color);
    const r = computeBrush3DRadiusWorld(brushSizePx);
    this.brushCursorGroup.scale.set(r, r, r);
    if (this.brushCursorGroup.visible) {
      this.requestRender();
    }
  }

  private getCanvasRectCached(forceRefresh: boolean = false): DOMRect {
    if (forceRefresh || !this.cachedCanvasRect || this.cachedCanvasRect.width <= 0) {
      this.cachedCanvasRect = this.renderer.domElement.getBoundingClientRect();
    }
    return this.cachedCanvasRect;
  }

  private raycastTemplateHit(
    clientX: number,
    clientY: number,
    updateCursorMesh: boolean = false
  ): { x: number; y: number; bodyRegion: BodyRegionGroup } | null {
    if (!this.primaryParts || this.pickablePrimaryMeshes.length === 0) return null;
    const rect = this.getCanvasRectCached();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.rayNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.rayNdc, this.activeCamera);
    const hits = this.raycaster.intersectObjects(this.pickablePrimaryMeshes, false);

    const activeIslands =
      this.paint3DTemplateType === 'pants'
        ? this.garments.pantsIslands.length
          ? this.garments.pantsIslands
          : ROBLOX_PANTS_UV_ISLANDS
        : this.garments.shirtIslands.length
        ? this.garments.shirtIslands
        : ROBLOX_SHIRT_UV_ISLANDS;

    for (const hit of hits) {
      if (!hit.uv) continue;
      const mesh = hit.object as THREE.Mesh;
      const region = mesh.userData.bodyRegion as BodyRegionGroup | undefined;
      if (!region) continue;

      const isR15Mat = Boolean(mesh.userData.isR15Mat);
      let mapped: { x: number; y: number } | null = null;

      if (isR15Mat) {
        const slotMap: Record<BodyRegionGroup, R15AtlasSlot> = {
          torso: 'torso',
          right_arm: 'rightArm',
          left_arm: 'leftArm',
          right_leg: 'rightLeg',
          left_leg: 'leftLeg'
        };
        mapped = mapR15AtlasUvToTemplate(
          slotMap[region],
          hit.uv.x,
          hit.uv.y,
          this.paint3DTemplateType,
          activeIslands,
          true
        );
      } else {
        mapped = mapDirectTemplateUvToCanvas(
          hit.uv.x,
          hit.uv.y,
          this.paint3DTemplateType,
          region,
          activeIslands
        );
      }

      if (mapped) {
        if (updateCursorMesh && hit.face) {
          _tmpNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).normalize();
          this.brushCursorGroup.position.copy(hit.point).addScaledVector(_tmpNormal, 0.018);
          _tmpQuat.setFromUnitVectors(_zAxis, _tmpNormal);
          this.brushCursorGroup.quaternion.copy(_tmpQuat);
          const r = computeBrush3DRadiusWorld(this.paint3DBrushSize);
          this.brushCursorGroup.scale.set(r, r, r);
          this.brushCursorGroup.visible = true;
        }
        return { x: mapped.x, y: mapped.y, bodyRegion: region };
      }
    }

    if (updateCursorMesh && this.brushCursorGroup.visible) {
      this.brushCursorGroup.visible = false;
    }
    return null;
  }

  private beginTouchPinch3D(): void {
    const pts = Array.from(this.activeTouchPointers.values());
    if (pts.length < 2) return;
    const span = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
    const midX = (pts[0].x + pts[1].x) * 0.5;
    const midY = (pts[0].y + pts[1].y) * 0.5;
    const startDir = new THREE.Vector3()
      .subVectors(this.activeCamera.position, this.controls.target)
      .normalize();
    const startCamDist = this.activeCamera.position.distanceTo(this.controls.target);

    this.camGoalPos = null;
    this.camGoalTarget = null;
    this.userHasOrbited = true;
    this.controls.enabled = false;
    this.touchPinch3D = {
      startSpan: span,
      startCamDist,
      startOrthoZoom: this.orthoCamera.zoom,
      startMidX: midX,
      startMidY: midY,
      startTarget: this.controls.target.clone(),
      startDir
    };
  }

  private cancelActiveTouchPaintForGesture(): void {
    if (this.pendingTouch3DPaint) {
      const hadStarted = this.pendingTouch3DPaint.hasStarted;
      this.pendingTouch3DPaint = null;
      this.isPainting3D = false;
      if (hadStarted) {
        this.onPaint3DStrokeCb?.('cancel', null);
      }
    } else if (this.isPainting3D) {
      this.isPainting3D = false;
      this.onPaint3DStrokeCb?.('cancel', null);
    }
    if (this.brushCursorGroup.visible) {
      this.brushCursorGroup.visible = false;
    }
  }

  private handleCanvasPointerDown = (e: PointerEvent) => {
    const now = performance.now();

    // Universal Multi-Touch Tracker (enables 2-finger pinch-to-zoom EVEN on the 3D shirt + 2/3-finger tap Undo/Redo!)
    if (e.pointerType === 'touch') {
      if (this.activeTouchPointers.size === 0) {
        this.completedTouchTaps = [];
        this.maxTouchFingersInGesture = 0;
        this.hadMultiTouchMove = false;
      }
      this.activeTouchPointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        startTime: now
      });
      this.maxTouchFingersInGesture = Math.max(
        this.maxTouchFingersInGesture,
        this.activeTouchPointers.size
      );

      if (this.activeTouchPointers.size >= 2) {
        // 2+ fingers down -> immediately preempt painting/orbiting so pinch-zoom works directly over the 3D shirt!
        this.cancelActiveTouchPaintForGesture();
        this.pointerDownPos = null;
        this.touchPinchCooldownUntil = now + 260;
        e.stopPropagation();
        e.preventDefault();
        try {
          this.renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (this.activeTouchPointers.size === 2) {
          this.beginTouchPinch3D();
        } else {
          // 3+ fingers (e.g., 3-finger Redo tap) -> pause pinch so fingers stay still
          this.touchPinch3D = null;
        }
        return;
      }
    }

    if (e.button !== 0 && e.pointerType !== 'touch') return;

    if (this.paint3DEnabled && this.onPaint3DStrokeCb) {
      if (e.pointerType === 'touch' && now < this.touchPinchCooldownUntil) {
        return;
      }
      // Refresh rect once on pointerdown (zero layout thrash during subsequent moves!)
      this.getCanvasRectCached(true);
      const hit = this.raycastTemplateHit(e.clientX, e.clientY, true);
      if (hit) {
        e.stopPropagation();
        e.preventDefault();
        this.controls.enabled = false;
        try {
          this.renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // ignore synthetic pointer capture failure
        }

        if (e.pointerType === 'touch') {
          // Defer touch 3D paint by 5px so landing a 2nd finger for pinch-to-zoom on the 3D shirt never leaves a stray dot!
          this.isPainting3D = true;
          this.pendingTouch3DPaint = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startHit: hit,
            hasStarted: false
          };
          return;
        }

        this.isPainting3D = true;
        this.onPaint3DStrokeCb('start', hit);
        return;
      }
    }

    this.pointerDownPos = { x: e.clientX, y: e.clientY, time: now };
  };

  private handleCanvasPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && this.activeTouchPointers.has(e.pointerId)) {
      const rec = this.activeTouchPointers.get(e.pointerId)!;
      rec.x = e.clientX;
      rec.y = e.clientY;

      // Active 2-Finger Pinch-to-Zoom + 2-Finger Pan (works directly over 3D shirt & everywhere!)
      if (this.activeTouchPointers.size === 2 && this.touchPinch3D) {
        e.stopPropagation();
        e.preventDefault();
        const pts = Array.from(this.activeTouchPointers.values());
        const curSpan = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const curMidX = (pts[0].x + pts[1].x) * 0.5;
        const curMidY = (pts[0].y + pts[1].y) * 0.5;

        const spanDelta = Math.abs(curSpan - this.touchPinch3D.startSpan);
        const midDelta = Math.hypot(
          curMidX - this.touchPinch3D.startMidX,
          curMidY - this.touchPinch3D.startMidY
        );
        if (spanDelta > 10 || midDelta > 10) {
          this.hadMultiTouchMove = true;
        }

        const rect = this.getCanvasRectCached();
        const hPx = Math.max(1, rect.height);
        const dxMid = curMidX - this.touchPinch3D.startMidX;
        const dyMid = curMidY - this.touchPinch3D.startMidY;

        if (this.activeCamera === this.perspCamera) {
          const nextDist = computePinchDollyDistance(
            this.touchPinch3D.startCamDist,
            this.touchPinch3D.startSpan,
            curSpan,
            this.controls.minDistance,
            this.controls.maxDistance
          );
          const worldPerPx =
            (2 * nextDist * Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov * 0.5))) / hPx;
          this.activeCamera.updateMatrixWorld();
          _pinchRight.setFromMatrixColumn(this.activeCamera.matrixWorld, 0).normalize();
          _pinchUp.setFromMatrixColumn(this.activeCamera.matrixWorld, 1).normalize();

          _tmpTarget
            .copy(this.touchPinch3D.startTarget)
            .addScaledVector(_pinchRight, -dxMid * worldPerPx)
            .addScaledVector(_pinchUp, dyMid * worldPerPx);
          _tmpTarget.y = Math.max(0.4, Math.min(5.2, _tmpTarget.y));

          _pinchDir.copy(this.touchPinch3D.startDir).multiplyScalar(nextDist);
          this.controls.target.copy(_tmpTarget);
          this.perspCamera.position.copy(_tmpTarget).add(_pinchDir);
        } else {
          const nextZoom = computePinchOrthoZoom(
            this.touchPinch3D.startOrthoZoom,
            this.touchPinch3D.startSpan,
            curSpan,
            0.4,
            4.5
          );
          this.orthoCamera.zoom = nextZoom;
          this.orthoCamera.updateProjectionMatrix();
        }

        this.controls.update();
        this.container.dataset.cameraDist = String(this.getCameraDistance());
        this.requestRender();
        return;
      }

      if (this.activeTouchPointers.size >= 2) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }

    if (this.isPainting3D && this.onPaint3DStrokeCb) {
      e.stopPropagation();
      if (this.pendingTouch3DPaint && e.pointerType === 'touch') {
        if (!this.pendingTouch3DPaint.hasStarted) {
          const moved = Math.hypot(
            e.clientX - this.pendingTouch3DPaint.startX,
            e.clientY - this.pendingTouch3DPaint.startY
          );
          if (moved < 5) return;
          this.pendingTouch3DPaint.hasStarted = true;
          this.onPaint3DStrokeCb('start', this.pendingTouch3DPaint.startHit);
        }
      }
      const hit = this.raycastTemplateHit(e.clientX, e.clientY, true);
      if (hit) {
        this.onPaint3DStrokeCb('move', hit);
      }
      return;
    }

    // Lightweight hover preview ring when Paint 3D is armed (and not orbiting)
    if (this.paint3DEnabled && !this.isOrbitInteracting && !this.isSoftwareGl) {
      const wasVisible = this.brushCursorGroup.visible;
      const hit = this.raycastTemplateHit(e.clientX, e.clientY, true);
      if (hit || wasVisible) {
        this.requestRender();
      }
    }
  };

  private handleCanvasPointerLeave = () => {
    if (this.brushCursorGroup.visible) {
      this.brushCursorGroup.visible = false;
      this.requestRender();
    }
  };

  private handleCanvasPointerUp = (e: PointerEvent) => {
    const now = performance.now();

    if (e.pointerType === 'touch') {
      const rec = this.activeTouchPointers.get(e.pointerId);
      if (rec) {
        this.completedTouchTaps.push({
          startX: rec.startX,
          startY: rec.startY,
          endX: e.clientX,
          endY: e.clientY,
          startTime: rec.startTime,
          endTime: now
        });
        this.activeTouchPointers.delete(e.pointerId);
      }

      if (this.maxTouchFingersInGesture >= 2) {
        e.stopPropagation();
        try {
          this.renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        if (this.activeTouchPointers.size < 2) {
          this.touchPinch3D = null;
          this.touchPinchCooldownUntil = now + 240;
        }

        if (this.activeTouchPointers.size === 0) {
          const action = classifyMultiTouchTap(
            this.maxTouchFingersInGesture,
            this.completedTouchTaps,
            this.hadMultiTouchMove
          );
          this.maxTouchFingersInGesture = 0;
          this.completedTouchTaps = [];
          this.hadMultiTouchMove = false;
          this.controls.enabled = true;
          this.pointerDownPos = null;

          if (action === 'undo') {
            this.onGestureUndoCb?.();
            this.onGestureFeedbackCb?.('Undo');
          } else if (action === 'redo') {
            this.onGestureRedoCb?.();
            this.onGestureFeedbackCb?.('Redo');
          }
        }
        return;
      }
    }

    if (this.isPainting3D) {
      const pending = this.pendingTouch3DPaint;
      this.isPainting3D = false;
      this.pendingTouch3DPaint = null;
      this.controls.enabled = true;
      try {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (pending && !pending.hasStarted) {
        // Quick single-finger tap on avatar while Paint 3D is armed -> apply a clean single dab
        if (now >= this.touchPinchCooldownUntil) {
          this.onPaint3DStrokeCb?.('start', pending.startHit);
          this.onPaint3DStrokeCb?.('end', null);
        }
      } else {
        this.onPaint3DStrokeCb?.('end', null);
      }
      this.pointerDownPos = null;
      return;
    }

    if (!this.pointerDownPos || !this.primaryParts) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    const dt = now - this.pointerDownPos.time;
    this.pointerDownPos = null;
    if (Math.hypot(dx, dy) > 8 || dt > 360) return;

    // Touch double-tap resets 3D camera smoothly to ideal hero framing
    if (e.pointerType === 'touch' && !this.paint3DEnabled) {
      const prev = this.lastSingleTapMeta;
      if (prev && now - prev.time < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 34) {
        this.lastSingleTapMeta = null;
        this.setCameraPreset('three_quarter');
        this.onGestureFeedbackCb?.('Camera Reset');
        return;
      }
      this.lastSingleTapMeta = { x: e.clientX, y: e.clientY, time: now };
    }

    if (!this.onSelectBodyRegionCb) return;
    const rect = this.getCanvasRectCached(true);
    if (rect.width <= 0 || rect.height <= 0) return;
    this.rayNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.rayNdc, this.activeCamera);
    const hits = this.raycaster.intersectObjects(this.pickablePrimaryMeshes, false);
    for (const hit of hits) {
      const region = hit.object.userData?.bodyRegion as BodyRegionGroup | undefined;
      if (region) {
        this.onSelectBodyRegionCb(region);
        return;
      }
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLostCb?.();
  };

  private handleContextRestored = () => {
    this.onContextRestoredCb?.();
    this.requestRender();
  };

  private handleControlsChange = () => {
    this.requestRender();
  };

  private handleControlsStart = () => {
    this.isOrbitInteracting = true;
    this.userHasOrbited = true;
    this.camGoalPos = null;
    this.camGoalTarget = null;
    this.requestRender();
  };

  private handleControlsEnd = () => {
    this.isOrbitInteracting = false;
    if (!this.isSoftwareGl && this.controls.enableDamping) {
      // Allow smooth inertial glide to settle naturally after release
      this.dampingFramesRemaining = 26;
      this.requestRender();
    }
  };

  private getAspectDistanceScale(): number {
    const aspect = Math.max(0.38, this.perspCamera.aspect || 1);
    const portraitScale = aspect < 0.85 ? Math.min(1.65, 0.88 / aspect) : 1.0;
    if (this.compareMode === 'side_by_side') {
      const halfTan = Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov) / 2);
      const neededDist = Math.max(10.6, Math.min(20.5, 4.55 / (halfTan * aspect)));
      return Math.max(portraitScale, neededDist / 8.2);
    }
    return portraitScale;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;

    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();

    const distScale = this.getAspectDistanceScale();
    if (!this.userHasOrbited && !this.camGoalPos) {
      this.perspCamera.position.set(0.45 * distScale, 3.15, 8.2 * distScale);
      this.controls.update();
    }

    const baseFrustum = this.compareMode === 'side_by_side' ? 9.4 : 7.4;
    const frustum = baseFrustum * Math.max(1, distScale * 0.9);
    this.orthoCamera.left = (-frustum * aspect) / 2;
    this.orthoCamera.right = (frustum * aspect) / 2;
    this.orthoCamera.top = frustum / 2;
    this.orthoCamera.bottom = -frustum / 2;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.cachedCanvasRect = null;
    this.requestRender();
  }

  private disposeRigGeometries(): void {
    for (const geo of this.rigDisposableGeometries) geo.dispose();
    this.rigDisposableGeometries = [];
    for (const mat of this.rigDisposableMaterials) mat.dispose();
    this.rigDisposableMaterials = [];
    while (this.primaryContainer.children.length > 0) {
      this.primaryContainer.remove(this.primaryContainer.children[0]);
    }
    while (this.compareContainer.children.length > 0) {
      this.compareContainer.remove(this.compareContainer.children[0]);
    }
    this.primaryParts = null;
    this.compareParts = null;
  }

  private buildHeadAccessoryGroup(
    preset: AccessoryPreset,
    centerY: number
  ): THREE.Group | null {
    if (preset === 'none') return null;
    const g = new THREE.Group();
    g.position.set(0, centerY, 0);

    const trackGeo = <T extends THREE.BufferGeometry>(geo: T): T => {
      this.rigDisposableGeometries.push(geo);
      return geo;
    };
    const trackMat = <T extends THREE.Material>(mat: T): T => {
      this.rigDisposableMaterials.push(mat);
      return mat;
    };

    if (preset === 'street_beanie') {
      const knitMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.88, metalness: 0.02 })
      );
      const cuffMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.9, metalness: 0.02 })
      );
      const tagMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.45, metalness: 0.1 })
      );

      const dome = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.66, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)),
        knitMat
      );
      dome.scale.set(1.0, 0.92, 1.0);
      dome.position.set(0, 0.27, -0.02);
      g.add(dome);

      const cuff = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.675, 0.685, 0.24, 24)),
        cuffMat
      );
      cuff.position.set(0, 0.29, -0.01);
      g.add(cuff);

      const labelPatch = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.24, 0.11, 0.04)),
        tagMat
      );
      labelPatch.position.set(0.22, 0.28, 0.66);
      labelPatch.rotation.y = 0.34;
      g.add(labelPatch);
      return g;
    }

    if (preset === 'bob_hair') {
      const hairMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#1C1917', roughness: 0.68, metalness: 0.06 })
      );
      const crown = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.69, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58)),
        hairMat
      );
      crown.scale.set(1.02, 0.95, 1.04);
      crown.position.set(0, 0.22, -0.03);
      g.add(crown);

      const backDrape = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.68, 0.74, 0.86, 20, 1, false, Math.PI * 0.6, Math.PI * 0.8)),
        hairMat
      );
      backDrape.position.set(0, -0.06, -0.06);
      g.add(backDrape);

      const leftSide = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.2, 0.82, 0.62)),
        hairMat
      );
      leftSide.position.set(0.63, -0.05, -0.04);
      leftSide.rotation.z = -0.08;
      g.add(leftSide);

      const rightSide = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.2, 0.82, 0.62)),
        hairMat
      );
      rightSide.position.set(-0.63, -0.05, -0.04);
      rightSide.rotation.z = 0.08;
      g.add(rightSide);

      const bangs = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.16, 0.24, 0.18)),
        hairMat
      );
      bangs.position.set(0, 0.37, 0.56);
      bangs.rotation.x = -0.15;
      g.add(bangs);
      return g;
    }

    if (preset === 'visor_shades') {
      const lensMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#090F1E',
          roughness: 0.16,
          metalness: 0.72,
          emissive: '#0284C7',
          emissiveIntensity: 0.16
        })
      );
      const frameMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.35, metalness: 0.5 })
      );

      const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.16, 0.28, 0.1)), lensMat);
      visor.position.set(0, 0.07, 0.62);
      g.add(visor);

      const topBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.2, 0.045, 0.12)), frameMat);
      topBar.position.set(0, 0.21, 0.62);
      g.add(topBar);

      const leftTemple = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.07, 0.82)), frameMat);
      leftTemple.position.set(0.61, 0.1, 0.24);
      g.add(leftTemple);

      const rightTemple = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.07, 0.82)), frameMat);
      rightTemple.position.set(-0.61, 0.1, 0.24);
      g.add(rightTemple);
      return g;
    }

    if (preset === 'headphones') {
      const bandMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.45, metalness: 0.28 })
      );
      const padMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.85, metalness: 0.05 })
      );
      const glowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#38BDF8',
          emissive: '#38BDF8',
          emissiveIntensity: 0.55,
          roughness: 0.3
        })
      );

      const band = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.68, 0.065, 10, 28, Math.PI)),
        bandMat
      );
      band.position.set(0, 0.08, 0);
      g.add(band);

      for (const side of [-1, 1]) {
        const cup = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 18)),
          bandMat
        );
        cup.rotation.z = Math.PI / 2;
        cup.position.set(side * 0.68, 0.04, 0);
        g.add(cup);

        const pad = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18)),
          padMat
        );
        pad.rotation.z = Math.PI / 2;
        pad.position.set(side * 0.61, 0.04, 0);
        g.add(pad);

        const ring = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(0.16, 0.018, 8, 20)),
          glowMat
        );
        ring.rotation.y = Math.PI / 2;
        ring.position.set(side * 0.765, 0.04, 0);
        g.add(ring);
      }
      return g;
    }

    return null;
  }

  private createBeveledMesh(
    opts: Parameters<typeof createRobloxBeveledPartGeometry>[0],
    material: THREE.Material
  ): THREE.Mesh {
    const geo = createRobloxBeveledPartGeometry(opts);
    this.rigDisposableGeometries.push(geo);
    return new THREE.Mesh(geo, material);
  }

  private createSculptedMesh(
    opts: Parameters<typeof createRobloxSculptedLoftGeometry>[0],
    material: THREE.Material
  ): THREE.Mesh {
    const geo = createRobloxSculptedLoftGeometry(opts);
    this.rigDisposableGeometries.push(geo);
    return new THREE.Mesh(geo, material);
  }

  private buildOfficialR15Hierarchy(
    mats: AvatarMaterialSet,
    type: 'woman_1' | 'woman_2' | 'blocky_r15',
    packs: { woman: RobloxR15MeshPack; block: RobloxR15MeshPack }
  ): PartGroupRefs {
    const root = new THREE.Group();
    const isWomanUpper = type === 'woman_1' || type === 'woman_2';
    const upperPack = isWomanUpper ? packs.woman : packs.block;
    const lowerPack = type === 'woman_1' ? packs.woman : packs.block;

    // Grounding & hip alignment offsets matching Roblox Studio HipHeight:
    // - woman_1: pure official R15_Woman grounded at y=0 (raw feet minY = -1.973)
    // - woman_2: official R15_Woman upper body seated flush on official R15_Block legs (HipHeight = 2.0)
    // - blocky_r15: pure official R15_Block grounded at y=0 (raw feet minY = -2.0)
    const upperYOff = type === 'woman_1' ? 1.973 : type === 'woman_2' ? 1.83 : 2.0;
    const upperZOff = type === 'woman_2' ? -0.02 : 0;
    const lowerYOff = type === 'woman_1' ? 1.973 : 2.0;

    const addPart = (
      group: THREE.Group,
      pack: RobloxR15MeshPack,
      partName: RobloxR15PartName,
      material: THREE.Material,
      pivotRawX: number,
      pivotRawY: number,
      pivotRawZ: number
    ) => {
      const geo = pack.parts[partName];
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(-pivotRawX, -pivotRawY, -pivotRawZ);
      group.add(mesh);
    };

    // 1. Head
    const head = new THREE.Group();
    const headRawY = isWomanUpper ? 1.98 : 2.0;
    head.position.set(0, headRawY + upperYOff, upperZOff);
    addPart(head, upperPack, 'Head', mats.skin, 0, headRawY, 0);

    const headCenterY = isWomanUpper ? 0.5 : 0.52;
    const faceGeo = new THREE.PlaneGeometry(0.72, 0.72);
    this.rigDisposableGeometries.push(faceGeo);
    const faceMesh = new THREE.Mesh(faceGeo, this.faceMaterial);
    faceMesh.position.set(0, headCenterY, isWomanUpper ? 0.592 : 0.605);
    faceMesh.visible = this.settings.showClassicFace;
    head.add(faceMesh);

    const accGroup = this.buildHeadAccessoryGroup(
      this.settings.accessoryPreset ?? 'none',
      headCenterY
    );
    if (accGroup) head.add(accGroup);

    // 2. Torso (UpperTorso + LowerTorso sharing official R15 Torso Atlas)
    const torso = new THREE.Group();
    torso.userData.bodyRegion = 'torso';
    const torsoRawY = isWomanUpper ? 0.45 : 0.4;
    torso.position.set(0, torsoRawY + upperYOff, upperZOff);
    addPart(torso, upperPack, 'UpperTorso', mats.r15Torso, 0, torsoRawY, 0);
    addPart(torso, upperPack, 'LowerTorso', mats.r15Torso, 0, torsoRawY, 0);

    // 3. Arms (pivoted cleanly at official shoulder joints)
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();
    rightArm.userData.bodyRegion = 'right_arm';
    leftArm.userData.bodyRegion = 'left_arm';
    const shX = isWomanUpper ? 0.82 : 1.5;
    const shY = isWomanUpper ? 1.56 : 1.85;
    rightArm.position.set(-shX, shY + upperYOff, upperZOff);
    leftArm.position.set(shX, shY + upperYOff, upperZOff);

    addPart(rightArm, upperPack, 'RightUpperArm', mats.r15RightArm, -shX, shY, 0);
    addPart(rightArm, upperPack, 'RightLowerArm', mats.r15RightArm, -shX, shY, 0);
    addPart(rightArm, upperPack, 'RightHand', mats.r15RightArm, -shX, shY, 0);

    addPart(leftArm, upperPack, 'LeftUpperArm', mats.r15LeftArm, shX, shY, 0);
    addPart(leftArm, upperPack, 'LeftLowerArm', mats.r15LeftArm, shX, shY, 0);
    addPart(leftArm, upperPack, 'LeftHand', mats.r15LeftArm, shX, shY, 0);

    // 4. Legs (pivoted cleanly at official hip joints)
    const rightLeg = new THREE.Group();
    const leftLeg = new THREE.Group();
    rightLeg.userData.bodyRegion = 'right_leg';
    leftLeg.userData.bodyRegion = 'left_leg';
    const hipX = type === 'woman_1' ? 0.34 : 0.5;
    const hipY = type === 'woman_1' ? 0.34 : 0.0;
    rightLeg.position.set(-hipX, hipY + lowerYOff, 0);
    leftLeg.position.set(hipX, hipY + lowerYOff, 0);

    addPart(rightLeg, lowerPack, 'RightUpperLeg', mats.r15RightLeg, -hipX, hipY, 0);
    addPart(rightLeg, lowerPack, 'RightLowerLeg', mats.r15RightLeg, -hipX, hipY, 0);
    addPart(rightLeg, lowerPack, 'RightFoot', mats.r15RightLeg, -hipX, hipY, 0);

    addPart(leftLeg, lowerPack, 'LeftUpperLeg', mats.r15LeftLeg, hipX, hipY, 0);
    addPart(leftLeg, lowerPack, 'LeftLowerLeg', mats.r15LeftLeg, hipX, hipY, 0);
    addPart(leftLeg, lowerPack, 'LeftFoot', mats.r15LeftLeg, hipX, hipY, 0);

    root.add(head, torso, leftArm, rightArm, leftLeg, rightLeg);
    return {
      root,
      head,
      faceMesh,
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      usedOfficialWomanArms: isWomanUpper
    };
  }

  private buildAvatarHierarchy(mats: AvatarMaterialSet): PartGroupRefs {
    const type = this.settings.humanoidType;

    // Use authentic official Roblox R15 Woman & Blocky GLB rigs for Woman 1, Woman 2, and Blocky R15
    if (
      this.officialRigs &&
      (type === 'woman_1' || type === 'woman_2' || type === 'blocky_r15')
    ) {
      return this.buildOfficialR15Hierarchy(mats, type, this.officialRigs);
    }

    const shirtIslands = this.garments.shirtIslands.length
      ? this.garments.shirtIslands
      : ROBLOX_SHIRT_UV_ISLANDS;
    const pantsIslands = this.garments.pantsIslands.length
      ? this.garments.pantsIslands
      : ROBLOX_PANTS_UV_ISLANDS;

    const root = new THREE.Group();
    const isR15 = type === 'blocky_r15';
    const isWoman1 = type === 'woman_1';
    const isWoman2 = type === 'woman_2';
    const isWoman = isWoman1 || isWoman2;

    // 1. Sculpted Roblox Mannequin Head (clean rounded silhouette matching Dripzels & Customuse)
    const head = new THREE.Group();
    head.position.set(0, isWoman ? 4.49 : 4.55, 0);
    const headGeo = createRobloxHeadGeometry();
    this.rigDisposableGeometries.push(headGeo);
    const headMesh = new THREE.Mesh(headGeo, mats.skin);
    head.add(headMesh);

    const faceGeo = new THREE.PlaneGeometry(0.74, 0.74);
    this.rigDisposableGeometries.push(faceGeo);
    const faceMesh = new THREE.Mesh(faceGeo, this.faceMaterial);
    faceMesh.position.set(0, 0.02, 0.595);
    faceMesh.visible = this.settings.showClassicFace;
    head.add(faceMesh);

    const accGroup = this.buildHeadAccessoryGroup(this.settings.accessoryPreset ?? 'none', 0.02);
    if (accGroup) head.add(accGroup);

    // UV slice factories (exact official island names including Bottom/Cuff so ZERO full-template leaks!)
    const makeTorsoSlices = (v0: number, v1: number, isTopCap: boolean, isBotCap: boolean): FaceUvSlice[] => [
      { islandName: 'Torso Left Side', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Torso Right Side', vStartFrac: v0, vEndFrac: v1 },
      isTopCap
        ? { islandName: 'Torso Top', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Torso Front', vStartFrac: v0, vEndFrac: Math.min(1, v0 + 0.03) },
      isBotCap
        ? { islandName: 'Torso Bottom', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Torso Front', vStartFrac: Math.max(0, v1 - 0.03), vEndFrac: v1 },
      { islandName: 'Torso Front', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Torso Back', vStartFrac: v0, vEndFrac: v1 }
    ];

    const makeRightArmSlices = (v0: number, v1: number, isTopCap: boolean, isBotCap: boolean): FaceUvSlice[] => [
      { islandName: 'Right Arm Inner/Left', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Right Arm Outer/Right', vStartFrac: v0, vEndFrac: v1 },
      isTopCap
        ? { islandName: 'Right Arm Top', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Right Arm Front', vStartFrac: v0, vEndFrac: Math.min(1, v0 + 0.03) },
      isBotCap
        ? { islandName: 'Right Arm Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Right Arm Front', vStartFrac: Math.max(0, v1 - 0.03), vEndFrac: v1 },
      { islandName: 'Right Arm Front', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Right Arm Back', vStartFrac: v0, vEndFrac: v1 }
    ];

    const makeLeftArmSlices = (v0: number, v1: number, isTopCap: boolean, isBotCap: boolean): FaceUvSlice[] => [
      { islandName: 'Left Arm Outer/Left', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Left Arm Inner/Right', vStartFrac: v0, vEndFrac: v1 },
      isTopCap
        ? { islandName: 'Left Arm Top', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Left Arm Front', vStartFrac: v0, vEndFrac: Math.min(1, v0 + 0.03) },
      isBotCap
        ? { islandName: 'Left Arm Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Left Arm Front', vStartFrac: Math.max(0, v1 - 0.03), vEndFrac: v1 },
      { islandName: 'Left Arm Front', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Left Arm Back', vStartFrac: v0, vEndFrac: v1 }
    ];

    const makeRightLegSlices = (v0: number, v1: number, isTopCap: boolean, isBotCap: boolean): FaceUvSlice[] => [
      { islandName: 'Right Leg Inner/Left', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Right Leg Outer/Right', vStartFrac: v0, vEndFrac: v1 },
      isTopCap
        ? { islandName: 'Right Leg Top', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Right Leg Front', vStartFrac: v0, vEndFrac: Math.min(1, v0 + 0.03) },
      isBotCap
        ? { islandName: 'Right Leg Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Right Leg Front', vStartFrac: Math.max(0, v1 - 0.03), vEndFrac: v1 },
      { islandName: 'Right Leg Front', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Right Leg Back', vStartFrac: v0, vEndFrac: v1 }
    ];

    const makeLeftLegSlices = (v0: number, v1: number, isTopCap: boolean, isBotCap: boolean): FaceUvSlice[] => [
      { islandName: 'Left Leg Outer/Left', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Left Leg Inner/Right', vStartFrac: v0, vEndFrac: v1 },
      isTopCap
        ? { islandName: 'Left Leg Top', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Left Leg Front', vStartFrac: v0, vEndFrac: Math.min(1, v0 + 0.03) },
      isBotCap
        ? { islandName: 'Left Leg Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 }
        : { islandName: 'Left Leg Front', vStartFrac: Math.max(0, v1 - 0.03), vEndFrac: v1 },
      { islandName: 'Left Leg Front', vStartFrac: v0, vEndFrac: v1 },
      { islandName: 'Left Leg Back', vStartFrac: v0, vEndFrac: v1 }
    ];

    // 2. Torso
    const torso = new THREE.Group();
    torso.position.set(0, 3.0, 0);

    if (isWoman) {
      // Authentic Sculpted Roblox Woman Torso (UpperTorso 72% + LowerTorso 28%, lower waist crease, ZERO gap)
      const upperH = 1.44;
      const lowerH = 0.56;
      const upperMesh = this.createSculptedMesh(
        {
          height: upperH,
          profile: WOMAN_UPPER_TORSO_PROFILE,
          faceSlices: makeTorsoSlices(0, 0.72, true, false),
          islands: shirtIslands,
          radialSegments: 6
        },
        mats.upperBody
      );
      upperMesh.position.y = 1.0 - upperH / 2;
      torso.add(upperMesh);

      const lowerMesh = this.createSculptedMesh(
        {
          height: lowerH,
          profile: WOMAN_LOWER_TORSO_PROFILE,
          faceSlices: makeTorsoSlices(0.72, 1.0, false, true),
          islands: shirtIslands,
          radialSegments: 6
        },
        mats.upperBody
      );
      lowerMesh.position.y = -1.0 + lowerH / 2;
      torso.add(lowerMesh);
    } else if (isR15) {
      // Seamless Flush R15 Torso (ZERO blank gap between UpperTorso & LowerTorso!)
      const upperH = 1.28;
      const lowerH = 0.72;
      const upperMesh = this.createBeveledMesh(
        {
          width: 2.0,
          height: upperH,
          depth: 1.0,
          bevel: 0.042,
          bevelTop: true,
          bevelBottom: false,
          segments: 4,
          faceSlices: makeTorsoSlices(0, 0.64, true, false),
          islands: shirtIslands
        },
        mats.upperBody
      );
      upperMesh.position.y = 1.0 - upperH / 2;
      torso.add(upperMesh);

      const lowerMesh = this.createBeveledMesh(
        {
          width: 2.0,
          height: lowerH,
          depth: 1.0,
          bevel: 0.042,
          bevelTop: false,
          bevelBottom: true,
          segments: 4,
          faceSlices: makeTorsoSlices(0.64, 1.0, false, true),
          islands: shirtIslands
        },
        mats.upperBody
      );
      lowerMesh.position.y = -1.0 + lowerH / 2;
      torso.add(lowerMesh);
    } else {
      // Classic Blocky R6 Torso
      const torsoMesh = this.createBeveledMesh(
        {
          width: 2.0,
          height: 2.0,
          depth: 1.0,
          bevel: 0.046,
          segments: 4,
          faceSlices: makeTorsoSlices(0, 1, true, true),
          islands: shirtIslands
        },
        mats.upperBody
      );
      torso.add(torsoMesh);
    }

    // 3. Arms (Pivot at shoulder)
    const rightArm = new THREE.Group();
    const leftArm = new THREE.Group();

    if (isWoman) {
      // Smooth horn-free sculpted Woman arms + chunky iconic C-shaped claw hands
      rightArm.position.set(-0.77, 3.74, 0);
      leftArm.position.set(0.77, 3.74, 0);

      const armLen = 1.62;
      const shoulderLift = 0.14; // Keeps rounded deltoid cap nestled flush inside shoulder curve
      const rArmMesh = this.createSculptedMesh(
        {
          height: armLen,
          profile: WOMAN_RIGHT_ARM_PROFILE,
          faceSlices: makeRightArmSlices(0, 0.88, true, true),
          islands: shirtIslands,
          radialSegments: 5
        },
        mats.upperBody
      );
      rArmMesh.position.y = -armLen / 2 + shoulderLift;
      rightArm.add(rArmMesh);

      const rHandGeo = createRobloxWomanHandGeometry('right');
      this.rigDisposableGeometries.push(rHandGeo);
      const rHand = new THREE.Mesh(rHandGeo, mats.skin);
      rHand.position.set(-0.02, -armLen + shoulderLift + 0.06, 0);
      rightArm.add(rHand);

      const lArmMesh = this.createSculptedMesh(
        {
          height: armLen,
          profile: WOMAN_LEFT_ARM_PROFILE,
          faceSlices: makeLeftArmSlices(0, 0.88, true, true),
          islands: shirtIslands,
          radialSegments: 5
        },
        mats.upperBody
      );
      lArmMesh.position.y = -armLen / 2 + shoulderLift;
      leftArm.add(lArmMesh);

      const lHandGeo = createRobloxWomanHandGeometry('left');
      this.rigDisposableGeometries.push(lHandGeo);
      const lHand = new THREE.Mesh(lHandGeo, mats.skin);
      lHand.position.set(0.02, -armLen + shoulderLift + 0.06, 0);
      leftArm.add(lHand);
    } else if (isR15) {
      // Seamless Flush 3-Part Blocky R15 Arms (ZERO blank spaces between UpperArm/LowerArm/Hand!)
      rightArm.position.set(-1.51, 4.0, 0);
      leftArm.position.set(1.51, 4.0, 0);

      const armSegs: [number, number, number, boolean, boolean][] = [
        [0.0, 0.42, 0.84, true, false],   // UpperArm (bevel top only)
        [0.42, 0.80, 0.76, false, false], // LowerArm (flush top & bottom!)
        [0.80, 1.0, 0.40, false, true]    // Hand (bevel bottom only)
      ];

      let yCursor = 0;
      for (const [v0, v1, h, bTop, bBot] of armSegs) {
        const yCenter = yCursor - h / 2;
        yCursor -= h;

        const rSeg = this.createBeveledMesh(
          {
            width: 1.0,
            height: h,
            depth: 1.0,
            bevel: 0.042,
            bevelTop: bTop,
            bevelBottom: bBot,
            segments: 4,
            faceSlices: makeRightArmSlices(v0, v1, bTop, bBot),
            islands: shirtIslands
          },
          mats.upperBody
        );
        rSeg.position.y = yCenter;
        rightArm.add(rSeg);

        const lSeg = this.createBeveledMesh(
          {
            width: 1.0,
            height: h,
            depth: 1.0,
            bevel: 0.042,
            bevelTop: bTop,
            bevelBottom: bBot,
            segments: 4,
            faceSlices: makeLeftArmSlices(v0, v1, bTop, bBot),
            islands: shirtIslands
          },
          mats.upperBody
        );
        lSeg.position.y = yCenter;
        leftArm.add(lSeg);
      }
    } else {
      // Classic Blocky R6 Arms
      rightArm.position.set(-1.51, 4.0, 0);
      leftArm.position.set(1.51, 4.0, 0);

      const rMesh = this.createBeveledMesh(
        {
          width: 1.0,
          height: 2.0,
          depth: 1.0,
          bevel: 0.046,
          segments: 4,
          faceSlices: makeRightArmSlices(0, 1, true, true),
          islands: shirtIslands
        },
        mats.upperBody
      );
      rMesh.position.y = -1.0;
      rightArm.add(rMesh);

      const lMesh = this.createBeveledMesh(
        {
          width: 1.0,
          height: 2.0,
          depth: 1.0,
          bevel: 0.046,
          segments: 4,
          faceSlices: makeLeftArmSlices(0, 1, true, true),
          islands: shirtIslands
        },
        mats.upperBody
      );
      lMesh.position.y = -1.0;
      leftArm.add(lMesh);
    }

    // 4. Legs (Pivot at hip)
    const rightLeg = new THREE.Group();
    const leftLeg = new THREE.Group();

    if (isWoman1) {
      // Woman 1: Close-set Slim Sculpted Legs (matches Dripzels Woman 1 — minimal upper thigh gap)
      rightLeg.position.set(-0.358, 2.06, 0);
      leftLeg.position.set(0.358, 2.06, 0);

      const rLegMesh = this.createSculptedMesh(
        {
          height: 2.06,
          profile: WOMAN1_LEG_PROFILE,
          faceSlices: makeRightLegSlices(0, 1, true, true),
          islands: pantsIslands,
          radialSegments: 6
        },
        mats.lowerBody
      );
      rLegMesh.position.y = -1.03;
      rightLeg.add(rLegMesh);

      const lLegMesh = this.createSculptedMesh(
        {
          height: 2.06,
          profile: WOMAN1_LEG_PROFILE,
          faceSlices: makeLeftLegSlices(0, 1, true, true),
          islands: pantsIslands,
          radialSegments: 6
        },
        mats.lowerBody
      );
      lLegMesh.position.y = -1.03;
      leftLeg.add(lLegMesh);
    } else if (isWoman2) {
      // Woman 2: Iconic Thick Classic Blocky Legs with Smoothly Domed Top Hip Shoulders
      rightLeg.position.set(-0.495, 2.05, 0);
      leftLeg.position.set(0.495, 2.05, 0);

      const rLegMesh = this.createSculptedMesh(
        {
          height: 2.05,
          profile: WOMAN2_RIGHT_LEG_PROFILE,
          faceSlices: makeRightLegSlices(0, 1, true, true),
          islands: pantsIslands,
          radialSegments: 6
        },
        mats.lowerBody
      );
      rLegMesh.position.y = -1.025;
      rightLeg.add(rLegMesh);

      const lLegMesh = this.createSculptedMesh(
        {
          height: 2.05,
          profile: WOMAN2_LEFT_LEG_PROFILE,
          faceSlices: makeLeftLegSlices(0, 1, true, true),
          islands: pantsIslands,
          radialSegments: 6
        },
        mats.lowerBody
      );
      lLegMesh.position.y = -1.025;
      leftLeg.add(lLegMesh);
    } else if (isR15) {
      // Seamless Flush 3-Part Blocky R15 Legs (ZERO blank gaps!)
      rightLeg.position.set(-0.505, 2.0, 0);
      leftLeg.position.set(0.505, 2.0, 0);

      const legSegs: [number, number, number, boolean, boolean][] = [
        [0.0, 0.42, 0.84, true, false],
        [0.42, 0.80, 0.76, false, false],
        [0.80, 1.0, 0.40, false, true]
      ];

      let yCursor = 0;
      for (const [v0, v1, h, bTop, bBot] of legSegs) {
        const yCenter = yCursor - h / 2;
        yCursor -= h;

        const rSeg = this.createBeveledMesh(
          {
            width: 1.0,
            height: h,
            depth: 1.0,
            bevel: 0.042,
            bevelTop: bTop,
            bevelBottom: bBot,
            segments: 4,
            faceSlices: makeRightLegSlices(v0, v1, bTop, bBot),
            islands: pantsIslands
          },
          mats.lowerBody
        );
        rSeg.position.y = yCenter;
        rightLeg.add(rSeg);

        const lSeg = this.createBeveledMesh(
          {
            width: 1.0,
            height: h,
            depth: 1.0,
            bevel: 0.042,
            bevelTop: bTop,
            bevelBottom: bBot,
            segments: 4,
            faceSlices: makeLeftLegSlices(v0, v1, bTop, bBot),
            islands: pantsIslands
          },
          mats.lowerBody
        );
        lSeg.position.y = yCenter;
        leftLeg.add(lSeg);
      }
    } else {
      // Classic Blocky R6 Legs
      rightLeg.position.set(-0.505, 2.0, 0);
      leftLeg.position.set(0.505, 2.0, 0);

      const rMesh = this.createBeveledMesh(
        {
          width: 1.0,
          height: 2.0,
          depth: 1.0,
          bevel: 0.046,
          segments: 4,
          faceSlices: makeRightLegSlices(0, 1, true, true),
          islands: pantsIslands
        },
        mats.lowerBody
      );
      rMesh.position.y = -1.0;
      rightLeg.add(rMesh);

      const lMesh = this.createBeveledMesh(
        {
          width: 1.0,
          height: 2.0,
          depth: 1.0,
          bevel: 0.046,
          segments: 4,
          faceSlices: makeLeftLegSlices(0, 1, true, true),
          islands: pantsIslands
        },
        mats.lowerBody
      );
      lMesh.position.y = -1.0;
      leftLeg.add(lMesh);
    }

    torso.userData.bodyRegion = 'torso';
    rightArm.userData.bodyRegion = 'right_arm';
    leftArm.userData.bodyRegion = 'left_arm';
    rightLeg.userData.bodyRegion = 'right_leg';
    leftLeg.userData.bodyRegion = 'left_leg';

    root.add(head, torso, leftArm, rightArm, leftLeg, rightLeg);
    return { root, head, faceMesh, torso, leftArm, rightArm, leftLeg, rightLeg };
  }

  private rebuildPickablePrimaryMeshes(): void {
    this.pickablePrimaryMeshes = [];
    if (!this.primaryParts) return;
    const regionGroups: [BodyRegionGroup, THREE.Group][] = [
      ['torso', this.primaryParts.torso],
      ['right_arm', this.primaryParts.rightArm],
      ['left_arm', this.primaryParts.leftArm],
      ['right_leg', this.primaryParts.rightLeg],
      ['left_leg', this.primaryParts.leftLeg]
    ];
    for (const [region, group] of regionGroups) {
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material;
          const isR15Mat =
            mat === this.primaryMats.r15Torso ||
            mat === this.primaryMats.r15RightArm ||
            mat === this.primaryMats.r15LeftArm ||
            mat === this.primaryMats.r15RightLeg ||
            mat === this.primaryMats.r15LeftLeg;
          const isDirectMat =
            mat === this.primaryMats.upperBody || mat === this.primaryMats.lowerBody;
          if (isR15Mat || isDirectMat) {
            mesh.userData.bodyRegion = region;
            mesh.userData.isR15Mat = isR15Mat;
            this.pickablePrimaryMeshes.push(mesh);
          }
        }
      });
    }
  }

  private isUsingOfficialR15Rig(): boolean {
    const t = this.settings.humanoidType;
    return Boolean(this.officialRigs && (t === 'woman_1' || t === 'woman_2' || t === 'blocky_r15'));
  }

  private rebuildRigs(): void {
    this.disposeRigGeometries();

    this.primaryParts = this.buildAvatarHierarchy(this.primaryMats);
    this.primaryContainer.add(this.primaryParts.root);

    this.compareParts = this.buildAvatarHierarchy(this.compareMats);
    this.compareContainer.add(this.compareParts.root);

    this.rebuildPickablePrimaryMeshes();

    this.applyPose(this.settings.pose);
    this.applyVisibility();
    this.applyProportions();
    this.applyWireframe();
    this.applyCompareLayout();
  }

  private applyPoseTo(parts: PartGroupRefs | null, pose: PoseType): void {
    if (!parts) return;
    const isWoman =
      this.settings.humanoidType === 'woman_1' || this.settings.humanoidType === 'woman_2';
    const { head, torso, leftArm, rightArm, leftLeg, rightLeg } = parts;
    head.rotation.set(0, 0, 0);
    torso.rotation.set(0, 0, 0);
    leftArm.rotation.set(0, 0, 0);
    rightArm.rotation.set(0, 0, 0);
    leftLeg.rotation.set(0, 0, 0);
    rightLeg.rotation.set(0, 0, 0);

    // Official Roblox Woman GLB already has the authentic ~18 deg outward arm stance baked into rest geometry!
    const bakedOut = parts.usedOfficialWomanArms ? 0.30 : 0;
    const baseArmOut = isWoman && !parts.usedOfficialWomanArms ? 0.31 : 0;

    switch (pose) {
      case 't_pose':
        leftArm.rotation.z = Math.PI / 2 - bakedOut;
        rightArm.rotation.z = -(Math.PI / 2 - bakedOut);
        break;
      case 'action_walk':
        rightArm.rotation.x = -0.42;
        leftArm.rotation.x = 0.42;
        rightArm.rotation.z = -baseArmOut * 0.55 + bakedOut * 0.35;
        leftArm.rotation.z = baseArmOut * 0.55 - bakedOut * 0.35;
        rightLeg.rotation.x = 0.34;
        leftLeg.rotation.x = -0.34;
        torso.rotation.y = 0.08;
        break;
      case 'fashion_hip':
        torso.rotation.y = -0.14;
        head.rotation.y = 0.12;
        rightArm.rotation.z = -(baseArmOut + 0.14);
        leftArm.rotation.z = baseArmOut + 0.12;
        rightArm.rotation.x = -0.18;
        leftArm.rotation.x = 0.12;
        rightLeg.rotation.x = -0.08;
        leftLeg.rotation.x = 0.08;
        break;
      case 'hero':
        torso.rotation.y = 0.16;
        head.rotation.y = -0.12;
        rightArm.rotation.z = -(baseArmOut + 0.16);
        leftArm.rotation.z = baseArmOut + 0.16;
        rightArm.rotation.x = -0.1;
        leftArm.rotation.x = 0.1;
        break;
      case 'idle':
      default:
        rightArm.rotation.z = -baseArmOut;
        leftArm.rotation.z = baseArmOut;
        break;
    }
  }

  private applyPose(pose: PoseType): void {
    this.applyPoseTo(this.primaryParts, pose);
    this.applyPoseTo(this.compareParts, pose);
  }

  private applyVisibility(): void {
    const v = this.settings.visibility;
    for (const parts of [this.primaryParts, this.compareParts]) {
      if (!parts) continue;
      parts.head.visible = v.head;
      parts.faceMesh.visible = v.head && this.settings.showClassicFace;
      parts.torso.visible = v.torso;
      parts.leftArm.visible = v.leftArm;
      parts.rightArm.visible = v.rightArm;
      parts.leftLeg.visible = v.leftLeg;
      parts.rightLeg.visible = v.rightLeg;
    }
  }

  private applyProportions(): void {
    const p = this.settings.proportions;
    for (const parts of [this.primaryParts, this.compareParts]) {
      if (!parts) continue;
      parts.root.scale.set(p.width, p.height, p.depth);
    }
  }

  private applyWireframe(): void {
    const wf = this.settings.showWireframe3D;
    for (const set of [this.primaryMats, this.compareMats]) {
      set.skin.wireframe = wf;
      set.upperBody.wireframe = wf;
      set.lowerBody.wireframe = wf;
      set.r15Torso.wireframe = wf;
      set.r15RightArm.wireframe = wf;
      set.r15LeftArm.wireframe = wf;
      set.r15RightLeg.wireframe = wf;
      set.r15LeftLeg.wireframe = wf;
    }
  }

  private applyCompareLayout(): void {
    if (this.compareMode === 'side_by_side') {
      this.compareContainer.visible = true;
      this.compareContainer.position.set(-2.15, 0, 0);
      this.primaryContainer.position.set(2.15, 0, 0);
      this.contactShadowCompare.visible = this.settings.showGroundShadow;
      this.contactShadowCompare.position.x = -2.15;
      this.contactShadowPrimary.position.x = 2.15;
    } else {
      this.compareContainer.visible = false;
      this.compareContainer.position.set(0, 0, 0);
      this.primaryContainer.position.set(0, 0, 0);
      this.contactShadowCompare.visible = false;
      this.contactShadowPrimary.position.x = 0;
    }
  }

  private drawUvGuideDummy(ctx: CanvasRenderingContext2D, islands: UvIsland[]): void {
    ctx.save();
    for (const isl of islands) {
      const x = isl.x * COMP_SCALE;
      const y = isl.y * COMP_SCALE;
      const w = isl.w * COMP_SCALE;
      const h = isl.h * COMP_SCALE;

      let fill = '#dc2626';
      let tag = 'F';
      if (isl.name.includes('Front')) {
        fill = '#dc2626';
        tag = isl.group === 'torso' ? 'FRONT' : 'F';
      } else if (isl.name.includes('Back')) {
        fill = '#2563eb';
        tag = isl.group === 'torso' ? 'BACK' : 'B';
      } else if (isl.name.includes('Outer/Right') || isl.name.includes('Right Side')) {
        fill = '#16a34a';
        tag = 'R';
      } else if (isl.name.includes('Outer/Left') || isl.name.includes('Left Side')) {
        fill = '#eab308';
        tag = 'L';
      } else if (isl.name.includes('Top')) {
        fill = '#0ea5e9';
        tag = 'T';
      } else if (isl.name.includes('Bottom')) {
        fill = '#f97316';
        tag = 'B';
      } else if (isl.name.includes('Inner')) {
        fill = '#15803d';
        tag = '';
      }

      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);

      // Subtle Dripzels-style dashed R15 joint guides
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      if (isl.group === 'torso' && (isl.name.includes('Front') || isl.name.includes('Back'))) {
        const ySplit = y + h * 0.64;
        ctx.beginPath();
        ctx.moveTo(x, ySplit);
        ctx.lineTo(x + w, ySplit);
        ctx.stroke();
      } else if (
        isl.group !== 'torso' &&
        !isl.name.includes('Top') &&
        !isl.name.includes('Bottom')
      ) {
        const y1 = y + h * 0.42;
        const y2 = y + h * 0.80;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x + w, y1);
        ctx.moveTo(x, y2);
        ctx.lineTo(x + w, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      if (tag) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize =
          tag.length > 1 ? Math.round(w * 0.27) : Math.round(Math.min(w, h) * 0.46);
        ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(tag, x + w / 2, y + h / 2);
      }
    }
    ctx.restore();
  }

  private compositeBodyPair(
    upperCtx: CanvasRenderingContext2D,
    lowerCtx: CanvasRenderingContext2D,
    useOriginal: boolean
  ): void {
    const { shirt, pants, tshirt, shirtIslands, pantsIslands } = this.garments;
    const vis = this.settings.layerVisibility;

    const showShirt = vis.shirt && shirt.hasImage;
    const showPants = vis.pants && pants.hasImage;
    const showTshirt = vis.tshirt && tshirt.hasImage;

    const shirtSrc = useOriginal ? shirt.originalCanvas : shirt.workingCanvas;
    const pantsSrc = useOriginal ? pants.originalCanvas : pants.workingCanvas;
    const tshirtSrc = useOriginal ? tshirt.originalCanvas : tshirt.workingCanvas;

    const sIslands = shirtIslands.length ? shirtIslands : ROBLOX_SHIRT_UV_ISLANDS;
    const pIslands = pantsIslands.length ? pantsIslands : ROBLOX_PANTS_UV_ISLANDS;

    upperCtx.imageSmoothingEnabled = true;
    upperCtx.imageSmoothingQuality = 'high';
    lowerCtx.imageSmoothingEnabled = true;
    lowerCtx.imageSmoothingQuality = 'high';

    // 1. Clear & Fill Base Skin Color
    upperCtx.clearRect(0, 0, COMP_W, COMP_H);
    upperCtx.fillStyle = this.settings.skinColor;
    upperCtx.fillRect(0, 0, COMP_W, COMP_H);
    lowerCtx.clearRect(0, 0, COMP_W, COMP_H);
    lowerCtx.fillStyle = this.settings.skinColor;
    lowerCtx.fillRect(0, 0, COMP_W, COMP_H);

    // Optional UV Alignment Guide Dummy (displayed clearly on top when toggled on)
    if (this.showUvGuideDummy) {
      this.drawUvGuideDummy(upperCtx, sIslands);
      this.drawUvGuideDummy(lowerCtx, pIslands);
      return;
    }

    // 2. Classic T-Shirt base torso tint when worn solo without a shirt
    if (showTshirt && !showShirt && !this.showUvGuideDummy) {
      upperCtx.fillStyle = this.settings.tshirtBaseColor;
      for (const isl of sIslands) {
        if (isl.group === 'torso') {
          upperCtx.fillRect(
            isl.x * COMP_SCALE,
            isl.y * COMP_SCALE,
            isl.w * COMP_SCALE,
            isl.h * COMP_SCALE
          );
        }
      }
    }

    // 3. Pants Layer (Roblox draws Pants first on legs + lower torso)
    if (showPants && pantsSrc) {
      lowerCtx.drawImage(pantsSrc, 0, 0, COMP_W, COMP_H);
      upperCtx.save();
      upperCtx.beginPath();
      for (const isl of pIslands) {
        if (isl.group === 'torso') {
          upperCtx.rect(
            isl.x * COMP_SCALE,
            isl.y * COMP_SCALE,
            isl.w * COMP_SCALE,
            isl.h * COMP_SCALE
          );
        }
      }
      upperCtx.clip();
      upperCtx.drawImage(pantsSrc, 0, 0, COMP_W, COMP_H);
      upperCtx.restore();
    }

    // 4. Shirt Layer (Draws over Pants on torso & arms)
    if (showShirt && shirtSrc) {
      upperCtx.drawImage(shirtSrc, 0, 0, COMP_W, COMP_H);
    }

    // 5. Classic T-Shirt Graphic Layer (Draws on Torso Front above Shirt & Pants)
    if (showTshirt && tshirtSrc) {
      const frontIsl =
        sIslands.find((i) => i.name === 'Torso Front') ?? { x: 231, y: 74, w: 128, h: 128 };
      const pad = Math.round(frontIsl.w * 0.04 * COMP_SCALE);
      upperCtx.save();
      upperCtx.beginPath();
      upperCtx.rect(
        frontIsl.x * COMP_SCALE,
        frontIsl.y * COMP_SCALE,
        frontIsl.w * COMP_SCALE,
        frontIsl.h * COMP_SCALE
      );
      upperCtx.clip();
      upperCtx.drawImage(
        tshirtSrc,
        frontIsl.x * COMP_SCALE + pad,
        frontIsl.y * COMP_SCALE + pad,
        frontIsl.w * COMP_SCALE - pad * 2,
        frontIsl.h * COMP_SCALE - pad * 2
      );
      upperCtx.restore();
    }
  }

  private buildR15Input(useOriginal: boolean): R15CompositeInput {
    const { shirt, pants, tshirt, shirtIslands, pantsIslands } = this.garments;
    const vis = this.settings.layerVisibility;
    const showShirt = vis.shirt && shirt.hasImage;
    const showPants = vis.pants && pants.hasImage;
    const showTshirt = vis.tshirt && tshirt.hasImage;

    return {
      skinColor: this.settings.skinColor,
      tshirtBaseColor: this.settings.tshirtBaseColor,
      shirtCanvas: showShirt ? (useOriginal ? shirt.originalCanvas : shirt.workingCanvas) : null,
      pantsCanvas: showPants ? (useOriginal ? pants.originalCanvas : pants.workingCanvas) : null,
      tshirtCanvas: showTshirt ? (useOriginal ? tshirt.originalCanvas : tshirt.workingCanvas) : null,
      shirtIslands: shirtIslands.length ? shirtIslands : ROBLOX_SHIRT_UV_ISLANDS,
      pantsIslands: pantsIslands.length ? pantsIslands : ROBLOX_PANTS_UV_ISLANDS,
      showUvGuide: this.showUvGuideDummy
    };
  }

  private markCanvasTexUpdated(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture): void {
    // Only force Skia CPU flush on headless SwiftShader; hardware GPUs upload CanvasTexture in-place with zero stalls!
    if (this.isSoftwareGl) {
      ctx.getImageData(0, 0, 1, 1);
    }
    tex.needsUpdate = true;
  }

  private compositeR15Set(
    set: R15AtlasTextureSet,
    useOriginal: boolean,
    regions?: ReadonlySet<BodyRegionGroup>
  ): void {
    const input = this.buildR15Input(useOriginal);
    const updateAll = !regions;

    if (updateAll || regions.has('torso')) {
      compositeR15TorsoAtlas(set.torso.ctx, input);
      this.markCanvasTexUpdated(set.torso.ctx, set.torso.tex);
    }
    if (updateAll || regions.has('right_arm')) {
      compositeR15LimbAtlas(set.rightArm.ctx, 'rightArm', input);
      this.markCanvasTexUpdated(set.rightArm.ctx, set.rightArm.tex);
    }
    if (updateAll || regions.has('left_arm')) {
      compositeR15LimbAtlas(set.leftArm.ctx, 'leftArm', input);
      this.markCanvasTexUpdated(set.leftArm.ctx, set.leftArm.tex);
    }
    if (updateAll || regions.has('right_leg')) {
      compositeR15LimbAtlas(set.rightLeg.ctx, 'rightLeg', input);
      this.markCanvasTexUpdated(set.rightLeg.ctx, set.rightLeg.tex);
    }
    if (updateAll || regions.has('left_leg')) {
      compositeR15LimbAtlas(set.leftLeg.ctx, 'leftLeg', input);
      this.markCanvasTexUpdated(set.leftLeg.ctx, set.leftLeg.tex);
    }
  }

  private ensureOriginalTexturesFresh(): void {
    if (!this.origTexturesDirty) return;
    this.origTexturesDirty = false;
    if (this.isUsingOfficialR15Rig()) {
      this.compositeR15Set(this.origR15, true);
    } else {
      this.compositeBodyPair(this.origUpperCtx, this.origLowerCtx, true);
      this.markCanvasTexUpdated(this.origUpperCtx, this.origUpperTex);
      this.markCanvasTexUpdated(this.origLowerCtx, this.origLowerTex);
    }
  }

  private recompositeAllTextures(): void {
    this.origTexturesDirty = true;
    if (this.isUsingOfficialR15Rig()) {
      this.compositeR15Set(this.editedR15, false);
    } else {
      this.compositeBodyPair(this.editedUpperCtx, this.editedLowerCtx, false);
      this.markCanvasTexUpdated(this.editedUpperCtx, this.editedUpperTex);
      this.markCanvasTexUpdated(this.editedLowerCtx, this.editedLowerTex);
    }

    if (this.compareMode !== 'off') {
      this.ensureOriginalTexturesFresh();
    }
  }

  /**
   * Zero-lag rAF-coalesced partial texture updater for live 3D & 2D brush strokes.
   * Re-composites ONLY the touched body region(s) of the active rig in-place with zero allocations.
   */
  public fastRefreshEditedRegions(regions: ReadonlySet<BodyRegionGroup> | 'all'): void {
    if (this.disposed) return;
    if (regions === 'all') {
      this.pendingFastAll = true;
    } else if (!this.pendingFastAll) {
      for (const r of regions) this.pendingFastRegions.add(r);
    }

    if (this.fastRefreshRafId !== null) return;
    this.fastRefreshRafId = requestAnimationFrame(() => {
      this.fastRefreshRafId = null;
      if (this.disposed) return;
      const doAll = this.pendingFastAll;
      const dirty = doAll ? undefined : new Set(this.pendingFastRegions);
      this.pendingFastAll = false;
      this.pendingFastRegions.clear();

      if (this.isUsingOfficialR15Rig()) {
        this.compositeR15Set(this.editedR15, false, dirty);
      } else {
        this.compositeBodyPair(this.editedUpperCtx, this.editedLowerCtx, false);
        this.markCanvasTexUpdated(this.editedUpperCtx, this.editedUpperTex);
        this.markCanvasTexUpdated(this.editedLowerCtx, this.editedLowerTex);
      }
      this.requestRender();
    });
  }

  public updateGarments(next: MultiGarmentInput): void {
    const islandsChanged =
      next.shirtIslands !== this.garments.shirtIslands ||
      next.pantsIslands !== this.garments.pantsIslands;
    this.garments = next;
    if (islandsChanged) {
      this.rebuildRigs();
    }
    this.recompositeAllTextures();
    this.requestRender();
  }

  public setShowUvGuideDummy(enabled: boolean): void {
    if (this.showUvGuideDummy === enabled) return;
    this.showUvGuideDummy = enabled;
    this.recompositeAllTextures();
    this.requestRender();
  }

  public setCompare3D(mode: Compare3DMode, splitRatio: number): void {
    const prevMode = this.compareMode;
    const modeChanged = prevMode !== mode;
    this.compareMode = mode;
    this.compareSplitRatio = THREE.MathUtils.clamp(splitRatio, 0.04, 0.96);

    if (mode !== 'off') {
      this.ensureOriginalTexturesFresh();
    }

    if (modeChanged) {
      this.applyCompareLayout();
      this.handleResize();
      if (mode === 'side_by_side' || prevMode === 'side_by_side') {
        this.setCameraPreset('front');
      }
    }
    this.requestRender();
  }

  public applySettings(next: AvatarPreviewSettings, forceAll: boolean = false): void {
    const prev = this.settings;
    this.settings = { ...next };

    const rigChanged =
      forceAll ||
      prev.humanoidType !== next.humanoidType ||
      prev.accessoryPreset !== next.accessoryPreset;
    const textureInputsChanged =
      forceAll ||
      prev.skinColor !== next.skinColor ||
      prev.tshirtBaseColor !== next.tshirtBaseColor ||
      prev.layerVisibility !== next.layerVisibility;

    if (forceAll || prev.skinColor !== next.skinColor) {
      this.primaryMats.skin.color.set(next.skinColor);
      this.compareMats.skin.color.set(next.skinColor);
    }

    if (rigChanged) {
      this.rebuildRigs();
      // Subtle tactile scale pop when user switches avatar body type on real GPUs
      if (!forceAll && !this.isSoftwareGl && prev.humanoidType !== next.humanoidType) {
        this.rigPopProgress = 0;
        this.primaryContainer.scale.setScalar(0.94);
      }
      // Switching between R6 (direct upper/lower) and R15 (5-atlas) requires ensuring active rig textures are fresh
      this.recompositeAllTextures();
    } else if (textureInputsChanged) {
      this.recompositeAllTextures();
    }
    if (!rigChanged) {
      if (prev.pose !== next.pose) this.applyPose(next.pose);
      if (prev.visibility !== next.visibility || prev.showClassicFace !== next.showClassicFace) {
        this.applyVisibility();
      }
      if (prev.proportions !== next.proportions) this.applyProportions();
      if (prev.showWireframe3D !== next.showWireframe3D) this.applyWireframe();
    }

    if (forceAll || prev.bgColor !== next.bgColor) {
      this.scene.background = new THREE.Color(next.bgColor);
      this.setGridThemeForBg(next.bgColor);
    }
    this.gridMesh.visible = next.showGrid;
    this.contactShadowPrimary.visible = next.showGroundShadow;
    this.contactShadowCompare.visible =
      next.showGroundShadow && this.compareMode === 'side_by_side';

    this.renderer.domElement.style.filter = next.isGrayscale ? 'grayscale(100%)' : 'none';

    // Lighting Modes:
    // - 'true_color' (Default): Crisp true-color clarity + subtle edge bevel shading
    // - 'none': Dripzels-style flat unlit 100% raw texture colors
    // - '3_point': Sculpted 3-point studio lighting with key, fill & rim
    if (next.lightingType === 'none') {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.hemiLight.intensity = 0.0;
      this.ambientFlatLight.intensity = 2.65;
      this.keyLight.intensity = 0;
      this.fillLight.intensity = 0;
      this.backLight.intensity = 0;
      this.scene.environment = null;
    } else if (next.lightingType === 'true_color') {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.98;
      this.hemiLight.intensity = 0.48;
      this.ambientFlatLight.intensity = 0.92;
      this.keyLight.color.set(next.keyLight.color);
      this.keyLight.intensity = next.keyLight.intensity * 0.95;
      this.keyLight.position.set(next.keyLight.x, next.keyLight.y, next.keyLight.z);
      this.fillLight.color.set(next.fillLight.color);
      this.fillLight.intensity = next.fillLight.intensity * 0.55;
      this.fillLight.position.set(next.fillLight.x, next.fillLight.y, next.fillLight.z);
      this.backLight.color.set(next.backLight.color);
      this.backLight.intensity = next.backLight.intensity * 0.65;
      this.backLight.position.set(next.backLight.x, next.backLight.y, next.backLight.z);
      this.scene.environment = this.envTexture;
    } else {
      // 3-Point Studio
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.hemiLight.intensity = 0.65;
      this.ambientFlatLight.intensity = 0.18;
      this.keyLight.color.set(next.keyLight.color);
      this.keyLight.intensity = Math.max(1.3, next.keyLight.intensity * 1.9);
      this.keyLight.position.set(next.keyLight.x, next.keyLight.y, next.keyLight.z);

      this.fillLight.color.set(next.fillLight.color);
      this.fillLight.intensity = Math.max(0.55, next.fillLight.intensity * 1.35);
      this.fillLight.position.set(next.fillLight.x, next.fillLight.y, next.fillLight.z);

      this.backLight.color.set(next.backLight.color);
      this.backLight.intensity = Math.max(0.65, next.backLight.intensity * 1.6);
      this.backLight.position.set(next.backLight.x, next.backLight.y, next.backLight.z);
      this.scene.environment = this.envTexture;
    }

    if (forceAll || prev.cameraFov !== next.cameraFov) {
      this.perspCamera.fov = next.cameraFov;
      this.perspCamera.updateProjectionMatrix();
    }

    if (prev.projectionMode !== next.projectionMode) {
      const currentPos = this.activeCamera.position.clone();
      const currentTarget = this.controls.target.clone();
      this.activeCamera =
        next.projectionMode === 'orthographic' ? this.orthoCamera : this.perspCamera;
      this.activeCamera.position.copy(currentPos);
      this.controls.object = this.activeCamera;
      this.controls.target.copy(currentTarget);
      this.controls.update();
    }

    this.requestRender();
  }

  public setTurntable(enabled: boolean): void {
    this.turntableEnabled = enabled;
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPresetId): void {
    const distScale = this.getAspectDistanceScale();
    const target = new THREE.Vector3(0, 2.38, 0);
    const pos = new THREE.Vector3(0.45 * distScale, 3.15, 8.2 * distScale);

    switch (preset) {
      case 'front':
        pos.set(0, 3.1, 8.2 * distScale);
        break;
      case 'three_quarter':
        pos.set(3.4 * distScale, 3.45, 7.2 * distScale);
        break;
      case 'back':
        pos.set(0, 3.1, -8.2 * distScale);
        break;
      case 'left':
        pos.set(8.2 * distScale, 3.1, 0);
        break;
      case 'right':
        pos.set(-8.2 * distScale, 3.1, 0);
        break;
      case 'top':
        pos.set(0, 9.0 * distScale, 2.5);
        target.set(0, 2.9, 0);
        break;
    }

    if (this.isSoftwareGl) {
      this.activeCamera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.camGoalPos = null;
      this.camGoalTarget = null;
    } else {
      this.camGoalPos = pos;
      this.camGoalTarget = target;
    }
    this.requestRender();
  }

  private bindPrimaryMaps(useOriginal: boolean): void {
    const r15 = useOriginal ? this.origR15 : this.editedR15;
    this.primaryMats.upperBody.map = useOriginal ? this.origUpperTex : this.editedUpperTex;
    this.primaryMats.lowerBody.map = useOriginal ? this.origLowerTex : this.editedLowerTex;
    this.primaryMats.r15Torso.map = r15.torso.tex;
    this.primaryMats.r15RightArm.map = r15.rightArm.tex;
    this.primaryMats.r15LeftArm.map = r15.leftArm.tex;
    this.primaryMats.r15RightLeg.map = r15.rightLeg.tex;
    this.primaryMats.r15LeftLeg.map = r15.leftLeg.tex;
  }

  private renderFrameInternal(): void {
    if (this.compareMode === 'split') {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      const splitPx = Math.round(w * this.compareSplitRatio);

      this.renderer.setScissorTest(true);

      this.bindPrimaryMaps(true);
      this.renderer.setScissor(0, 0, splitPx, h);
      this.renderer.render(this.scene, this.activeCamera);

      this.bindPrimaryMaps(false);
      this.renderer.setScissor(splitPx, 0, Math.max(0, w - splitPx), h);
      this.renderer.render(this.scene, this.activeCamera);

      this.renderer.setScissorTest(false);
    } else {
      this.bindPrimaryMaps(false);
      this.renderer.setScissorTest(false);
      this.renderer.render(this.scene, this.activeCamera);
    }
  }

  public captureSnapshotDataUrl(transparentBackground: boolean): string {
    const prevBg = this.scene.background;
    const prevGrid = this.gridMesh.visible;
    const prevContact1 = this.contactShadowPrimary.visible;
    const prevContact2 = this.contactShadowCompare.visible;
    const prevCursor = this.brushCursorGroup.visible;
    this.brushCursorGroup.visible = false;

    if (transparentBackground) {
      this.scene.background = null;
      this.gridMesh.visible = false;
      this.contactShadowPrimary.visible = false;
      this.contactShadowCompare.visible = false;
    }

    this.renderer.setClearAlpha(transparentBackground ? 0 : 1);
    this.renderFrameInternal();
    const url = this.renderer.domElement.toDataURL('image/png');

    this.scene.background = prevBg;
    this.gridMesh.visible = prevGrid;
    this.contactShadowPrimary.visible = prevContact1;
    this.contactShadowCompare.visible = prevContact2;
    this.brushCursorGroup.visible = prevCursor;
    this.renderer.setClearAlpha(1);
    this.renderFrameInternal();

    return url;
  }

  public setHighlightedRegion(region: BodyRegionGroup | null): void {
    if (this.highlightedRegion === region) return;
    this.highlightedRegion = region;

    const allBodyMats = [
      this.primaryMats.r15Torso,
      this.primaryMats.r15RightArm,
      this.primaryMats.r15LeftArm,
      this.primaryMats.r15RightLeg,
      this.primaryMats.r15LeftLeg,
      this.primaryMats.upperBody,
      this.primaryMats.lowerBody
    ];
    for (const m of allBodyMats) {
      m.emissive.set('#000000');
      m.emissiveIntensity = 0;
    }

    if (region) {
      const highlightColor = '#0EA5E9';
      const intensity = 0.24;
      const map: Record<BodyRegionGroup, THREE.MeshStandardMaterial[]> = {
        torso: [this.primaryMats.r15Torso, this.primaryMats.upperBody],
        right_arm: [this.primaryMats.r15RightArm, this.primaryMats.upperBody],
        left_arm: [this.primaryMats.r15LeftArm, this.primaryMats.upperBody],
        right_leg: [this.primaryMats.r15RightLeg, this.primaryMats.lowerBody],
        left_leg: [this.primaryMats.r15LeftLeg, this.primaryMats.lowerBody]
      };
      for (const m of map[region]) {
        m.emissive.set(highlightColor);
        m.emissiveIntensity = intensity;
      }
    }

    this.requestRender();
  }

  public async recordTurntableVideo(
    durationSec: number = 4,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (this.isRecordingVideo) {
      throw new Error('Recording already in progress.');
    }
    const canvas = this.renderer.domElement as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('Video recording is not supported in this browser.');
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    this.isRecordingVideo = true;
    const prevTurntable = this.turntableEnabled;
    const startRotY = this.primaryContainer.rotation.y;
    this.turntableEnabled = false;

    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_200_000
    });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stoppedPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error('MediaRecorder error while encoding turntable.'));
    });

    const totalMs = Math.max(1500, durationSec * 1000);
    const startedAt = performance.now();
    recorder.start(120);

    try {
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          if (this.disposed) {
            resolve();
            return;
          }
          const elapsed = now - startedAt;
          const p = Math.min(1, elapsed / totalMs);
          this.primaryContainer.rotation.y = startRotY + p * Math.PI * 2;
          this.compareContainer.rotation.y = this.primaryContainer.rotation.y;
          this.controls.update();
          this.renderFrameInternal();
          onProgress?.(p);

          if (p >= 1) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      });
    } finally {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      for (const t of stream.getTracks()) t.stop();
      this.primaryContainer.rotation.y = startRotY;
      this.compareContainer.rotation.y = startRotY;
      this.turntableEnabled = prevTurntable;
      this.isRecordingVideo = false;
      this.requestRender();
    }

    return stoppedPromise;
  }

  public requestRender(): void {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame((now) => this.tickFrame(now));
  }

  private afterSoftwareDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tickFrame(now: number): void {
    if (this.disposed) return;
    this.renderDirty = false;
    const dt = this.lastTickTime ? Math.min(0.05, (now - this.lastTickTime) / 1000) : 0.016;
    this.lastTickTime = now;

    let needsAnotherFrame = false;

    if (this.camGoalPos && this.camGoalTarget) {
      const k = 1 - Math.exp(-10 * dt);
      _tmpCamPos.copy(this.activeCamera.position).lerp(this.camGoalPos, k);
      _tmpTarget.copy(this.controls.target).lerp(this.camGoalTarget, k);
      this.activeCamera.position.copy(_tmpCamPos);
      this.controls.target.copy(_tmpTarget);

      if (
        this.activeCamera.position.distanceTo(this.camGoalPos) < 0.02 &&
        this.controls.target.distanceTo(this.camGoalTarget) < 0.02
      ) {
        this.activeCamera.position.copy(this.camGoalPos);
        this.controls.target.copy(this.camGoalTarget);
        this.camGoalPos = null;
        this.camGoalTarget = null;
      } else {
        needsAnotherFrame = true;
      }
    }

    if (this.turntableEnabled) {
      const rotDelta = dt * 0.72;
      this.primaryContainer.rotation.y += rotDelta;
      this.compareContainer.rotation.y = this.primaryContainer.rotation.y;
      needsAnotherFrame = true;
    }

    if (this.rigPopProgress < 1) {
      this.rigPopProgress = Math.min(1, this.rigPopProgress + dt * 5.2);
      // Smooth cubic ease-out pop-in 0.94 -> 1.0
      const ease = 1 - Math.pow(1 - this.rigPopProgress, 3);
      const s = 0.94 + 0.06 * ease;
      this.primaryContainer.scale.setScalar(s);
      this.compareContainer.scale.setScalar(s);
      if (this.rigPopProgress < 1) {
        needsAnotherFrame = true;
      }
    }

    if (this.dampingFramesRemaining > 0 && !this.isOrbitInteracting) {
      this.dampingFramesRemaining--;
      needsAnotherFrame = true;
    }

    this.controls.update();
    this.renderFrameInternal();

    const finish = () => {
      this.renderBusy = false;
      if (!this.disposed && (this.renderDirty || needsAnotherFrame)) {
        this.requestRender();
      }
    };

    if (this.isSoftwareGl) {
      this.afterSoftwareDraw(finish);
    } else {
      finish();
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = null;
    }
    if (this.fastRefreshRafId !== null) {
      cancelAnimationFrame(this.fastRefreshRafId);
      this.fastRefreshRafId = null;
    }
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.handleControlsChange);
    this.controls.removeEventListener('start', this.handleControlsStart);
    this.controls.removeEventListener('end', this.handleControlsEnd);
    this.controls.dispose();

    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown, true);
    this.renderer.domElement.removeEventListener('pointermove', this.handleCanvasPointerMove, true);
    this.renderer.domElement.removeEventListener('pointerup', this.handleCanvasPointerUp, true);
    this.renderer.domElement.removeEventListener('pointercancel', this.handleCanvasPointerUp, true);
    this.renderer.domElement.removeEventListener('pointerleave', this.handleCanvasPointerLeave);

    this.disposeRigGeometries();

    for (const child of this.brushCursorGroup.children) {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }
    this.brushCursorInnerMat.dispose();
    this.brushCursorOuterMat.dispose();

    for (const set of [this.primaryMats, this.compareMats]) {
      set.skin.dispose();
      set.upperBody.dispose();
      set.lowerBody.dispose();
      set.r15Torso.dispose();
      set.r15RightArm.dispose();
      set.r15LeftArm.dispose();
      set.r15RightLeg.dispose();
      set.r15LeftLeg.dispose();
    }
    for (const r15 of [this.editedR15, this.origR15]) {
      r15.torso.tex.dispose();
      r15.rightArm.tex.dispose();
      r15.leftArm.tex.dispose();
      r15.rightLeg.tex.dispose();
      r15.leftLeg.tex.dispose();
    }
    this.faceMaterial.dispose();
    this.faceTexture.dispose();
    this.editedUpperTex.dispose();
    this.editedLowerTex.dispose();
    this.origUpperTex.dispose();
    this.origLowerTex.dispose();
    this.contactShadowTexture.dispose();
    this.gridMesh.geometry.dispose();
    (this.gridMesh.material as THREE.Material).dispose();
    this.contactShadowPrimary.geometry.dispose();
    (this.contactShadowPrimary.material as THREE.Material).dispose();
    this.contactShadowCompare.geometry.dispose();
    (this.contactShadowCompare.material as THREE.Material).dispose();
    this.envTexture?.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
