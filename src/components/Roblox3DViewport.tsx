import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  RotateCcw,
  Camera,
  Layers,
  Maximize2,
  Minimize2,
  SunMedium,
  User,
  Sliders,
  Share2,
  ChevronLeft,
  ChevronRight,
  Check,
  RotateCw,
  Eye,
  EyeOff,
  Sparkles,
  Download,
  Copy,
  Grid,
  Palette,
  X,
  ArrowLeft,
  Lightbulb,
  Box,
  Compass,
  Play,
  Pause,
  RefreshCw,
  Shirt
} from 'lucide-react';
import { TEMPLATE_WIDTH, TEMPLATE_HEIGHT, TemplateType, UvIsland } from '../types/uv';
import { Showcase2DModal } from './Showcase2DModal';

interface Props {
  sourceCanvas: HTMLCanvasElement | null;
  templateType: TemplateType;
  updateTrigger: number;
  islands: UvIsland[];
  onToggleTemplateType?: () => void;
  onReturnTo2D?: () => void;
  isFullPage?: boolean;
}

export type HumanoidType = 'blocky_r15' | 'woman_1' | 'blocky_r6' | 'woman_2';
export type PoseType = 'idle' | 'fashion_hip' | 'action_walk' | 'hero' | 't_pose';
export type InspectorTab = 'avatar' | 'lighting' | 'scene' | 'showcase';
export type LightingType = 'none' | 'ambient_dir' | '3_point';

export interface LightSettings {
  color: string;
  customHex: string;
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

const PRESET_SKIN_TONES = [
  { name: 'Peach / Fair', color: '#FFD8C2' },
  { name: 'Classic Yellow', color: '#F5CD30' },
  { name: 'Warm Tan', color: '#D97706' },
  { name: 'Peach Glow', color: '#FED7AA' },
  { name: 'Deep Bronze', color: '#78350F' },
  { name: 'Espresso', color: '#3E2723' },
  { name: 'Studio Grey', color: '#9E9E9E' },
  { name: 'Dark Dummy', color: '#1F2937' },
  { name: 'Studio White', color: '#E2E8F0' },
  { name: 'Pastel Lilac', color: '#D8B4E2' }
];

const PRESET_BG_COLORS = [
  { name: 'Dark Cyber Void', color: '#07090e' },
  { name: 'Studio Charcoal', color: '#121622' },
  { name: 'Clean Studio Cream', color: '#fff6eb' },
  { name: 'Warm Espresso', color: '#1f1414' },
  { name: 'Pastel Blossom', color: '#fce7f3' },
  { name: 'Mint Horizon', color: '#ecfdf5' },
  { name: 'Pure White Stage', color: '#ffffff' }
];

// Helper to create soft ground contact shadow texture
const createContactShadowTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  gradient.addColorStop(0.35, 'rgba(0, 0, 0, 0.35)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};

// Helper to find island rect by name
const getIslandBox = (
  islands: UvIsland[],
  nameKeyword: string,
  fallback: { x: number; y: number; w: number; h: number }
) => {
  const norm = nameKeyword.toLowerCase();
  const match = islands.find((i) => i.name.toLowerCase().includes(norm));
  return match ? { x: match.x, y: match.y, w: match.w, h: match.h } : fallback;
};

export const Roblox3DViewport: React.FC<Props> = ({
  sourceCanvas,
  templateType,
  updateTrigger,
  islands,
  onToggleTemplateType,
  onReturnTo2D,
  isFullPage = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mesh & lighting references
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const shadowMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const backLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Limb articulation groups for dynamic poses
  const limbsRef = useRef<{
    torsoGroup?: THREE.Group;
    headGroup?: THREE.Group;
    rightArmGroup?: THREE.Group;
    leftArmGroup?: THREE.Group;
    rightLegGroup?: THREE.Group;
    leftLegGroup?: THREE.Group;
  }>({});

  // Body part meshes reference for visibility toggle
  const bodyMeshesRef = useRef<{
    head?: THREE.Object3D;
    torso?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    rightArm?: THREE.Object3D;
    leftLeg?: THREE.Object3D;
    rightLeg?: THREE.Object3D;
  }>({});

  // Geometries for dynamic UV alignment
  const uvsGeomsRef = useRef<THREE.BoxGeometry[]>([]);

  // UI State: Right Slide-out Studio Inspector
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>('avatar');

  // Humanoid customization
  const [humanoidType, setHumanoidType] = useState<HumanoidType>('blocky_r15');
  const [currentPose, setCurrentPose] = useState<PoseType>('idle');
  const [visibility, setVisibility] = useState<BodyPartVisibility>({
    head: true,
    torso: true,
    leftArm: true,
    rightArm: true,
    leftLeg: true,
    rightLeg: true
  });
  const [skinColor, setSkinColor] = useState<string>('#FFD8C2');
  const [customSkinHex, setCustomSkinHex] = useState<string>('#FFD8C2');
  const [proportions, setProportions] = useState<{ height: number; width: number; depth: number }>({
    height: 1.0,
    width: 1.0,
    depth: 1.0
  });

  // Scene & Camera customization
  const [bgColor, setBgColor] = useState<string>('#07090e');
  const [customBgHex, setCustomBgHex] = useState<string>('#07090e');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showGroundShadow, setShowGroundShadow] = useState<boolean>(true);
  const [isGrayscale, setIsGrayscale] = useState<boolean>(false);
  const [cameraFov, setCameraFov] = useState<number>(75);
  const [projectionMode, setProjectionMode] = useState<'perspective' | 'orthographic'>('perspective');

  // 3-Point Studio Lighting
  const [lightingType, setLightingType] = useState<LightingType>('3_point');
  const [keyLight, setKeyLight] = useState<LightSettings>({
    color: '#ffffff',
    customHex: '#ffffff',
    intensity: 2.2,
    x: 4.5,
    y: 6.0,
    z: 5.0
  });
  const [fillLight, setFillLight] = useState<LightSettings>({
    color: '#93c5fd',
    customHex: '#93c5fd',
    intensity: 1.0,
    x: -4.5,
    y: 1.0,
    z: 3.5
  });
  const [backLight, setBackLight] = useState<LightSettings>({
    color: '#c084fc',
    customHex: '#c084fc',
    intensity: 1.4,
    x: 0.0,
    y: 4.5,
    z: -5.5
  });

  // General controls
  const [showWireframe3D, setShowWireframe3D] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showShowcaseModal, setShowShowcaseModal] = useState<boolean>(false);

  const isRotatingRef = useRef<boolean>(isRotating);
  useEffect(() => {
    isRotatingRef.current = isRotating;
  }, [isRotating]);

  // Helper to map box UV coordinates from 585x559 canvas to Three.js BoxGeometry
  const applyCustomUv = useCallback((
    geom: THREE.BoxGeometry,
    faces: {
      right: { x: number; y: number; w: number; h: number };
      left: { x: number; y: number; w: number; h: number };
      top: { x: number; y: number; w: number; h: number };
      bottom: { x: number; y: number; w: number; h: number };
      front: { x: number; y: number; w: number; h: number };
      back: { x: number; y: number; w: number; h: number };
    }
  ) => {
    const uvAttr = geom.attributes.uv as THREE.BufferAttribute;
    if (!uvAttr) return;
    const uvs = uvAttr.array as Float32Array;

    const setFaceUv = (
      faceIndex: number,
      box: { x: number; y: number; w: number; h: number }
    ) => {
      const u0 = box.x / TEMPLATE_WIDTH;
      const u1 = (box.x + box.w) / TEMPLATE_WIDTH;
      const v0 = 1.0 - (box.y / TEMPLATE_HEIGHT);
      const v1 = 1.0 - ((box.y + box.h) / TEMPLATE_HEIGHT);

      const offset = faceIndex * 8;
      uvs[offset + 0] = u0; uvs[offset + 1] = v0;
      uvs[offset + 2] = u1; uvs[offset + 3] = v0;
      uvs[offset + 4] = u0; uvs[offset + 5] = v1;
      uvs[offset + 6] = u1; uvs[offset + 7] = v1;
    };

    setFaceUv(0, faces.right);
    setFaceUv(1, faces.left);
    setFaceUv(2, faces.top);
    setFaceUv(3, faces.bottom);
    setFaceUv(4, faces.front);
    setFaceUv(5, faces.back);

    uvAttr.needsUpdate = true;
  }, []);

  // Update UV coordinates across all registered geometries
  const updateAllGeomUvs = useCallback((currentIslands: UvIsland[]) => {
    uvsGeomsRef.current.forEach((geom) => {
      const tag = geom.userData?.tag;
      if (tag === 'torso') {
        applyCustomUv(geom, {
          right: getIslandBox(currentIslands, 'Torso Left Side', { x: 358, y: 75, w: 64, h: 128 }),
          left: getIslandBox(currentIslands, 'Torso Right Side', { x: 166, y: 75, w: 64, h: 128 }),
          top: getIslandBox(currentIslands, 'Torso Top', { x: 230, y: 11, w: 128, h: 64 }),
          bottom: getIslandBox(currentIslands, 'Torso Bottom', { x: 230, y: 203, w: 128, h: 64 }),
          front: getIslandBox(currentIslands, 'Torso Front', { x: 230, y: 75, w: 128, h: 128 }),
          back: getIslandBox(currentIslands, 'Torso Back', { x: 422, y: 75, w: 128, h: 128 })
        });
      } else if (tag === 'right_arm') {
        applyCustomUv(geom, {
          right: getIslandBox(currentIslands, 'Right Arm Inner', { x: 151, y: 358, w: 64, h: 128 }),
          left: getIslandBox(currentIslands, 'Right Arm Outer', { x: 23, y: 358, w: 64, h: 128 }),
          top: getIslandBox(currentIslands, 'Right Arm Top', { x: 215, y: 294, w: 64, h: 64 }),
          bottom: getIslandBox(currentIslands, 'Right Arm Bottom', { x: 215, y: 486, w: 64, h: 64 }),
          front: getIslandBox(currentIslands, 'Right Arm Front', { x: 87, y: 358, w: 64, h: 128 }),
          back: getIslandBox(currentIslands, 'Right Arm Back', { x: 215, y: 358, w: 64, h: 128 })
        });
      } else if (tag === 'left_arm') {
        applyCustomUv(geom, {
          right: getIslandBox(currentIslands, 'Left Arm Outer', { x: 435, y: 357, w: 64, h: 128 }),
          left: getIslandBox(currentIslands, 'Left Arm Inner', { x: 307, y: 357, w: 64, h: 128 }),
          top: getIslandBox(currentIslands, 'Left Arm Top', { x: 307, y: 293, w: 64, h: 64 }),
          bottom: getIslandBox(currentIslands, 'Left Arm Bottom', { x: 307, y: 485, w: 64, h: 64 }),
          front: getIslandBox(currentIslands, 'Left Arm Front', { x: 371, y: 357, w: 64, h: 128 }),
          back: getIslandBox(currentIslands, 'Left Arm Back', { x: 499, y: 357, w: 64, h: 128 })
        });
      } else if (tag === 'right_leg') {
        applyCustomUv(geom, {
          right: getIslandBox(currentIslands, 'Right Leg Inner', { x: 151, y: 358, w: 64, h: 128 }),
          left: getIslandBox(currentIslands, 'Right Leg Outer', { x: 23, y: 358, w: 64, h: 128 }),
          top: getIslandBox(currentIslands, 'Right Leg Top', { x: 215, y: 294, w: 64, h: 64 }),
          bottom: getIslandBox(currentIslands, 'Right Leg Bottom', { x: 215, y: 486, w: 64, h: 64 }),
          front: getIslandBox(currentIslands, 'Right Leg Front', { x: 87, y: 358, w: 64, h: 128 }),
          back: getIslandBox(currentIslands, 'Right Leg Back', { x: 215, y: 358, w: 64, h: 128 })
        });
      } else if (tag === 'left_leg') {
        applyCustomUv(geom, {
          right: getIslandBox(currentIslands, 'Left Leg Outer', { x: 435, y: 357, w: 64, h: 128 }),
          left: getIslandBox(currentIslands, 'Left Leg Inner', { x: 307, y: 357, w: 64, h: 128 }),
          top: getIslandBox(currentIslands, 'Left Leg Top', { x: 307, y: 293, w: 64, h: 64 }),
          bottom: getIslandBox(currentIslands, 'Left Leg Bottom', { x: 307, y: 485, w: 64, h: 64 }),
          front: getIslandBox(currentIslands, 'Left Leg Front', { x: 371, y: 357, w: 64, h: 128 }),
          back: getIslandBox(currentIslands, 'Left Leg Back', { x: 499, y: 357, w: 64, h: 128 })
        });
      }
    });
  }, [applyCustomUv]);

  // Main Three.js Scene Initialization and Avatar Assembly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let activeCanvas = sourceCanvas;
    if (!activeCanvas) {
      if (!fallbackCanvasRef.current) {
        const fb = document.createElement('canvas');
        fb.width = TEMPLATE_WIDTH;
        fb.height = TEMPLATE_HEIGHT;
        const ctx = fb.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1e2430';
          ctx.fillRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
          ctx.fillStyle = '#00e5ff';
          ctx.font = '24px monospace';
          ctx.fillText('UV ARMOR 3D READY', 170, 280);
        }
        fallbackCanvasRef.current = fb;
      }
      activeCanvas = fallbackCanvasRef.current;
    }

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    sceneRef.current = scene;

    // 2. Camera Setup
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const aspect = width / Math.max(height, 1);

    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (projectionMode === 'perspective') {
      camera = new THREE.PerspectiveCamera(cameraFov, aspect, 0.1, 100);
      camera.position.set(0, -0.15, 6.0);
    } else {
      const frustumSize = 7.6;
      camera = new THREE.OrthographicCamera(
        (frustumSize * aspect) / -2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        100
      );
      camera.position.set(0, -0.15, 6.0);
    }
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, -0.35, 0);
    controls.maxDistance = 16;
    controls.minDistance = 1.4;
    controlsRef.current = controls;

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const keyLightObj = new THREE.DirectionalLight(new THREE.Color(keyLight.color), keyLight.intensity);
    keyLightObj.position.set(keyLight.x, keyLight.y, keyLight.z);
    scene.add(keyLightObj);
    keyLightRef.current = keyLightObj;

    const fillLightObj = new THREE.DirectionalLight(new THREE.Color(fillLight.color), fillLight.intensity);
    fillLightObj.position.set(fillLight.x, fillLight.y, fillLight.z);
    scene.add(fillLightObj);
    fillLightRef.current = fillLightObj;

    const backLightObj = new THREE.DirectionalLight(new THREE.Color(backLight.color), backLight.intensity);
    backLightObj.position.set(backLight.x, backLight.y, backLight.z);
    scene.add(backLightObj);
    backLightRef.current = backLightObj;

    // 6. Floor Grid
    const grid = new THREE.GridHelper(18, 28, 0x475569, 0x1e293b);
    grid.position.y = -3.0;
    grid.visible = showGrid;
    scene.add(grid);
    gridHelperRef.current = grid;

    // 7. Ground Contact Shadow (Soft realistic ambient occlusion)
    const shadowGeo = new THREE.PlaneGeometry(3.6, 3.6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: showGroundShadow ? 0.75 : 0
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, -2.99, 0);
    scene.add(shadowMesh);
    shadowMeshRef.current = shadowMesh;

    // 8. Dynamic Canvas Texture
    const texture = new THREE.CanvasTexture(activeCanvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    textureRef.current = texture;

    // Materials
    const clothingMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.58,
      metalness: 0.05,
      wireframe: showWireframe3D
    });

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(skinColor),
      roughness: 0.5,
      metalness: 0.05
    });

    // 9. Authentic Roblox Avatar Construction
    const avatarGroup = new THREE.Group();
    avatarGroup.scale.set(proportions.width, proportions.height, proportions.depth);
    avatarGroupRef.current = avatarGroup;
    scene.add(avatarGroup);

    uvsGeomsRef.current = [];
    bodyMeshesRef.current = {};
    limbsRef.current = {};

    const trackGeom = (geom: THREE.BoxGeometry, tag: string) => {
      geom.userData = { tag };
      uvsGeomsRef.current.push(geom);
      return geom;
    };

    // --- CONSTRUCT BASED ON HUMANOID TYPE ---
    if (humanoidType === 'blocky_r15') {
      // 1. MODERN ROBLOX R15 (Segmented Joints + Curved Hands)
      // Head
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.62, 0);
      const headGeom = new THREE.CylinderGeometry(0.72, 0.72, 1.25, 32);
      const headMesh = new THREE.Mesh(headGeom, skinMaterial);
      headGroup.add(headMesh);
      headGroup.visible = visibility.head;
      avatarGroup.add(headGroup);
      bodyMeshesRef.current.head = headGroup;
      limbsRef.current.headGroup = headGroup;

      // Torso Group (Upper Torso + Lower Torso)
      const torsoGroup = new THREE.Group();
      torsoGroup.position.set(0, 0, 0);

      const upperTorsoGeom = trackGeom(new THREE.BoxGeometry(2.0, 1.15, 1.0), 'torso');
      const upperTorsoMesh = new THREE.Mesh(upperTorsoGeom, clothingMaterial);
      upperTorsoMesh.position.set(0, 0.45, 0);
      torsoGroup.add(upperTorsoMesh);

      const lowerTorsoGeom = trackGeom(new THREE.BoxGeometry(1.88, 0.85, 0.95), 'torso');
      const lowerTorsoMesh = new THREE.Mesh(lowerTorsoGeom, clothingMaterial);
      lowerTorsoMesh.position.set(0, -0.55, 0);
      torsoGroup.add(lowerTorsoMesh);

      torsoGroup.visible = visibility.torso;
      avatarGroup.add(torsoGroup);
      bodyMeshesRef.current.torso = torsoGroup;
      limbsRef.current.torsoGroup = torsoGroup;

      // Right Arm (Shoulder pivot at -1.5, 0.9, 0)
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(-1.55, 0.9, 0);
      const rightArmGeom = trackGeom(new THREE.BoxGeometry(1.0, 1.9, 1.0), 'right_arm');
      const rightArmMesh = new THREE.Mesh(
        rightArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      rightArmMesh.position.set(0, -0.85, 0);
      rightArmGroup.add(rightArmMesh);

      // C-Grip Hand
      const rightHandGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.4, 20);
      const rightHandMesh = new THREE.Mesh(rightHandGeom, skinMaterial);
      rightHandMesh.position.set(0, -1.9, 0);
      rightArmGroup.add(rightHandMesh);

      rightArmGroup.visible = visibility.rightArm;
      avatarGroup.add(rightArmGroup);
      bodyMeshesRef.current.rightArm = rightArmGroup;
      limbsRef.current.rightArmGroup = rightArmGroup;

      // Left Arm (Shoulder pivot at 1.5, 0.9, 0)
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(1.55, 0.9, 0);
      const leftArmGeom = trackGeom(new THREE.BoxGeometry(1.0, 1.9, 1.0), 'left_arm');
      const leftArmMesh = new THREE.Mesh(
        leftArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      leftArmMesh.position.set(0, -0.85, 0);
      leftArmGroup.add(leftArmMesh);

      const leftHandGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.4, 20);
      const leftHandMesh = new THREE.Mesh(leftHandGeom, skinMaterial);
      leftHandMesh.position.set(0, -1.9, 0);
      leftArmGroup.add(leftHandMesh);

      leftArmGroup.visible = visibility.leftArm;
      avatarGroup.add(leftArmGroup);
      bodyMeshesRef.current.leftArm = leftArmGroup;
      limbsRef.current.leftArmGroup = leftArmGroup;

      // Right Leg (Hip pivot at -0.5, -1.0, 0)
      const rightLegGroup = new THREE.Group();
      rightLegGroup.position.set(-0.52, -1.0, 0);
      const rightLegGeom = trackGeom(new THREE.BoxGeometry(0.96, 2.0, 0.96), 'right_leg');
      const rightLegMesh = new THREE.Mesh(
        rightLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      rightLegMesh.position.set(0, -1.0, 0);
      rightLegGroup.add(rightLegMesh);
      rightLegGroup.visible = visibility.rightLeg;
      avatarGroup.add(rightLegGroup);
      bodyMeshesRef.current.rightLeg = rightLegGroup;
      limbsRef.current.rightLegGroup = rightLegGroup;

      // Left Leg (Hip pivot at 0.5, -1.0, 0)
      const leftLegGroup = new THREE.Group();
      leftLegGroup.position.set(0.52, -1.0, 0);
      const leftLegGeom = trackGeom(new THREE.BoxGeometry(0.96, 2.0, 0.96), 'left_leg');
      const leftLegMesh = new THREE.Mesh(
        leftLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      leftLegMesh.position.set(0, -1.0, 0);
      leftLegGroup.add(leftLegMesh);
      leftLegGroup.visible = visibility.leftLeg;
      avatarGroup.add(leftLegGroup);
      bodyMeshesRef.current.leftLeg = leftLegGroup;
      limbsRef.current.leftLegGroup = leftLegGroup;

    } else if (humanoidType === 'woman_1') {
      // 2. WOMAN 1 (Curved Silhouette Package)
      // Head
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.58, 0);
      const headGeom = new THREE.CylinderGeometry(0.66, 0.66, 1.18, 32);
      const headMesh = new THREE.Mesh(headGeom, skinMaterial);
      headGroup.add(headMesh);
      headGroup.visible = visibility.head;
      avatarGroup.add(headGroup);
      bodyMeshesRef.current.head = headGroup;
      limbsRef.current.headGroup = headGroup;

      // Curved Hourglass Torso
      const torsoGroup = new THREE.Group();
      const torsoGeom = trackGeom(new THREE.BoxGeometry(1.72, 2.0, 0.92), 'torso');
      const torsoMesh = new THREE.Mesh(torsoGeom, clothingMaterial);
      torsoGroup.add(torsoMesh);
      torsoGroup.visible = visibility.torso;
      avatarGroup.add(torsoGroup);
      bodyMeshesRef.current.torso = torsoGroup;
      limbsRef.current.torsoGroup = torsoGroup;

      // Slender Arms
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(-1.3, 0.85, 0);
      const rightArmGeom = trackGeom(new THREE.BoxGeometry(0.78, 1.9, 0.78), 'right_arm');
      const rightArmMesh = new THREE.Mesh(
        rightArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      rightArmMesh.position.set(0, -0.85, 0);
      rightArmGroup.add(rightArmMesh);
      const rHand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 16), skinMaterial);
      rHand.position.set(0, -1.85, 0);
      rightArmGroup.add(rHand);
      rightArmGroup.visible = visibility.rightArm;
      avatarGroup.add(rightArmGroup);
      bodyMeshesRef.current.rightArm = rightArmGroup;
      limbsRef.current.rightArmGroup = rightArmGroup;

      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(1.3, 0.85, 0);
      const leftArmGeom = trackGeom(new THREE.BoxGeometry(0.78, 1.9, 0.78), 'left_arm');
      const leftArmMesh = new THREE.Mesh(
        leftArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      leftArmMesh.position.set(0, -0.85, 0);
      leftArmGroup.add(leftArmMesh);
      const lHand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 16), skinMaterial);
      lHand.position.set(0, -1.85, 0);
      leftArmGroup.add(lHand);
      leftArmGroup.visible = visibility.leftArm;
      avatarGroup.add(leftArmGroup);
      bodyMeshesRef.current.leftArm = leftArmGroup;
      limbsRef.current.leftArmGroup = leftArmGroup;

      // Slender Legs
      const rightLegGroup = new THREE.Group();
      rightLegGroup.position.set(-0.46, -1.0, 0);
      const rightLegGeom = trackGeom(new THREE.BoxGeometry(0.85, 2.0, 0.85), 'right_leg');
      const rightLegMesh = new THREE.Mesh(
        rightLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      rightLegMesh.position.set(0, -1.0, 0);
      rightLegGroup.add(rightLegMesh);
      rightLegGroup.visible = visibility.rightLeg;
      avatarGroup.add(rightLegGroup);
      bodyMeshesRef.current.rightLeg = rightLegGroup;
      limbsRef.current.rightLegGroup = rightLegGroup;

      const leftLegGroup = new THREE.Group();
      leftLegGroup.position.set(0.46, -1.0, 0);
      const leftLegGeom = trackGeom(new THREE.BoxGeometry(0.85, 2.0, 0.85), 'left_leg');
      const leftLegMesh = new THREE.Mesh(
        leftLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      leftLegMesh.position.set(0, -1.0, 0);
      leftLegGroup.add(leftLegMesh);
      leftLegGroup.visible = visibility.leftLeg;
      avatarGroup.add(leftLegGroup);
      bodyMeshesRef.current.leftLeg = leftLegGroup;
      limbsRef.current.leftLegGroup = leftLegGroup;

    } else if (humanoidType === 'woman_2') {
      // 3. WOMAN 2 (Chic Flared Skirt Package)
      // Head
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.62, 0);
      const headGeom = new THREE.CylinderGeometry(0.68, 0.68, 1.2, 32);
      const headMesh = new THREE.Mesh(headGeom, skinMaterial);
      headGroup.add(headMesh);
      headGroup.visible = visibility.head;
      avatarGroup.add(headGroup);
      bodyMeshesRef.current.head = headGroup;
      limbsRef.current.headGroup = headGroup;

      // Torso with Flared A-Line Skirt
      const torsoGroup = new THREE.Group();
      const upperTorsoGeom = trackGeom(new THREE.BoxGeometry(1.78, 1.05, 0.95), 'torso');
      const upperTorsoMesh = new THREE.Mesh(upperTorsoGeom, clothingMaterial);
      upperTorsoMesh.position.set(0, 0.45, 0);
      torsoGroup.add(upperTorsoMesh);

      // Flared Skirt Hem
      const skirtGeom = trackGeom(new THREE.BoxGeometry(2.35, 1.0, 1.35), 'torso');
      const skirtMesh = new THREE.Mesh(skirtGeom, clothingMaterial);
      skirtMesh.position.set(0, -0.55, 0);
      torsoGroup.add(skirtMesh);

      torsoGroup.visible = visibility.torso;
      avatarGroup.add(torsoGroup);
      bodyMeshesRef.current.torso = torsoGroup;
      limbsRef.current.torsoGroup = torsoGroup;

      // Stylized Arms
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(-1.35, 0.85, 0);
      const rightArmGeom = trackGeom(new THREE.BoxGeometry(0.78, 1.8, 0.78), 'right_arm');
      const rightArmMesh = new THREE.Mesh(
        rightArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      rightArmMesh.position.set(0, -0.85, 0);
      rightArmGroup.add(rightArmMesh);
      const rHand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 16), skinMaterial);
      rHand.position.set(0, -1.8, 0);
      rightArmGroup.add(rHand);
      rightArmGroup.visible = visibility.rightArm;
      avatarGroup.add(rightArmGroup);
      bodyMeshesRef.current.rightArm = rightArmGroup;
      limbsRef.current.rightArmGroup = rightArmGroup;

      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(1.35, 0.85, 0);
      const leftArmGeom = trackGeom(new THREE.BoxGeometry(0.78, 1.8, 0.78), 'left_arm');
      const leftArmMesh = new THREE.Mesh(
        leftArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      leftArmMesh.position.set(0, -0.85, 0);
      leftArmGroup.add(leftArmMesh);
      const lHand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 16), skinMaterial);
      lHand.position.set(0, -1.8, 0);
      leftArmGroup.add(lHand);
      leftArmGroup.visible = visibility.leftArm;
      avatarGroup.add(leftArmGroup);
      bodyMeshesRef.current.leftArm = leftArmGroup;
      limbsRef.current.leftArmGroup = leftArmGroup;

      // Legs
      const rightLegGroup = new THREE.Group();
      rightLegGroup.position.set(-0.48, -1.0, 0);
      const rightLegGeom = trackGeom(new THREE.BoxGeometry(0.85, 2.0, 0.85), 'right_leg');
      const rightLegMesh = new THREE.Mesh(
        rightLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      rightLegMesh.position.set(0, -1.0, 0);
      rightLegGroup.add(rightLegMesh);
      rightLegGroup.visible = visibility.rightLeg;
      avatarGroup.add(rightLegGroup);
      bodyMeshesRef.current.rightLeg = rightLegGroup;
      limbsRef.current.rightLegGroup = rightLegGroup;

      const leftLegGroup = new THREE.Group();
      leftLegGroup.position.set(0.48, -1.0, 0);
      const leftLegGeom = trackGeom(new THREE.BoxGeometry(0.85, 2.0, 0.85), 'left_leg');
      const leftLegMesh = new THREE.Mesh(
        leftLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      leftLegMesh.position.set(0, -1.0, 0);
      leftLegGroup.add(leftLegMesh);
      leftLegGroup.visible = visibility.leftLeg;
      avatarGroup.add(leftLegGroup);
      bodyMeshesRef.current.leftLeg = leftLegGroup;
      limbsRef.current.leftLegGroup = leftLegGroup;

    } else {
      // 4. CLASSIC RETRO R6 (Canonical Single-Mesh Proportions)
      // Head
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.6, 0);
      const headGeom = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 32);
      const headMesh = new THREE.Mesh(headGeom, skinMaterial);
      headGroup.add(headMesh);
      headGroup.visible = visibility.head;
      avatarGroup.add(headGroup);
      bodyMeshesRef.current.head = headGroup;
      limbsRef.current.headGroup = headGroup;

      // Torso
      const torsoGroup = new THREE.Group();
      const torsoGeom = trackGeom(new THREE.BoxGeometry(2.0, 2.0, 1.0), 'torso');
      const torsoMesh = new THREE.Mesh(torsoGeom, clothingMaterial);
      torsoGroup.add(torsoMesh);
      torsoGroup.visible = visibility.torso;
      avatarGroup.add(torsoGroup);
      bodyMeshesRef.current.torso = torsoGroup;
      limbsRef.current.torsoGroup = torsoGroup;

      // Arms
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(-1.5, 0.9, 0);
      const rightArmGeom = trackGeom(new THREE.BoxGeometry(1.0, 2.0, 1.0), 'right_arm');
      const rightArmMesh = new THREE.Mesh(
        rightArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      rightArmMesh.position.set(0, -0.9, 0);
      rightArmGroup.add(rightArmMesh);
      rightArmGroup.visible = visibility.rightArm;
      avatarGroup.add(rightArmGroup);
      bodyMeshesRef.current.rightArm = rightArmGroup;
      limbsRef.current.rightArmGroup = rightArmGroup;

      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(1.5, 0.9, 0);
      const leftArmGeom = trackGeom(new THREE.BoxGeometry(1.0, 2.0, 1.0), 'left_arm');
      const leftArmMesh = new THREE.Mesh(
        leftArmGeom,
        templateType === 'pants' ? skinMaterial : clothingMaterial
      );
      leftArmMesh.position.set(0, -0.9, 0);
      leftArmGroup.add(leftArmMesh);
      leftArmGroup.visible = visibility.leftArm;
      avatarGroup.add(leftArmGroup);
      bodyMeshesRef.current.leftArm = leftArmGroup;
      limbsRef.current.leftArmGroup = leftArmGroup;

      // Legs
      const rightLegGroup = new THREE.Group();
      rightLegGroup.position.set(-0.5, -1.0, 0);
      const rightLegGeom = trackGeom(new THREE.BoxGeometry(1.0, 2.0, 1.0), 'right_leg');
      const rightLegMesh = new THREE.Mesh(
        rightLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      rightLegMesh.position.set(0, -1.0, 0);
      rightLegGroup.add(rightLegMesh);
      rightLegGroup.visible = visibility.rightLeg;
      avatarGroup.add(rightLegGroup);
      bodyMeshesRef.current.rightLeg = rightLegGroup;
      limbsRef.current.rightLegGroup = rightLegGroup;

      const leftLegGroup = new THREE.Group();
      leftLegGroup.position.set(0.5, -1.0, 0);
      const leftLegGeom = trackGeom(new THREE.BoxGeometry(1.0, 2.0, 1.0), 'left_leg');
      const leftLegMesh = new THREE.Mesh(
        leftLegGeom,
        templateType === 'shirt' ? skinMaterial : clothingMaterial
      );
      leftLegMesh.position.set(0, -1.0, 0);
      leftLegGroup.add(leftLegMesh);
      leftLegGroup.visible = visibility.leftLeg;
      avatarGroup.add(leftLegGroup);
      bodyMeshesRef.current.leftLeg = leftLegGroup;
      limbsRef.current.leftLegGroup = leftLegGroup;
    }

    // Apply custom UV coordinates to all generated geometries
    updateAllGeomUvs(islands);

    // Apply dynamic pose rotations
    applyPoseRotations(currentPose);

    // 10. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (isRotatingRef.current && avatarGroupRef.current) {
        avatarGroupRef.current.rotation.y += 0.014;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 11. ResizeObserver for robust layout adaptation
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 20 && h > 20) {
          const asp = w / h;
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.aspect = asp;
            camera.updateProjectionMatrix();
          } else {
            const fs = 7.6;
            camera.left = (fs * asp) / -2;
            camera.right = (fs * asp) / 2;
            camera.top = fs / 2;
            camera.bottom = fs / -2;
            camera.updateProjectionMatrix();
          }
          renderer.setSize(w, h);
          renderer.render(scene, camera);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      clothingMaterial.dispose();
      skinMaterial.dispose();
      texture.dispose();
    };
  }, [
    templateType,
    humanoidType,
    bgColor,
    projectionMode,
    cameraFov,
    showGrid,
    keyLight.color,
    islands,
    updateAllGeomUvs
  ]);

  // Apply Pose rotations to articulated limb groups
  const applyPoseRotations = useCallback((pose: PoseType) => {
    const { rightArmGroup, leftArmGroup, rightLegGroup, leftLegGroup, torsoGroup, headGroup } = limbsRef.current;
    if (!rightArmGroup || !leftArmGroup) return;

    // Reset base rotations
    rightArmGroup.rotation.set(0, 0, 0);
    leftArmGroup.rotation.set(0, 0, 0);
    if (rightLegGroup) rightLegGroup.rotation.set(0, 0, 0);
    if (leftLegGroup) leftLegGroup.rotation.set(0, 0, 0);
    if (torsoGroup) torsoGroup.rotation.set(0, 0, 0);
    if (headGroup) headGroup.rotation.set(0, 0, 0);

    switch (pose) {
      case 'idle':
        rightArmGroup.rotation.z = 0.08;
        leftArmGroup.rotation.z = -0.08;
        break;
      case 'fashion_hip':
        // Iconic fashion model pose: right hand resting on hip, left arm relaxed, slight torso tilt
        rightArmGroup.rotation.set(0.15, -0.3, 0.65);
        leftArmGroup.rotation.set(-0.1, 0, -0.12);
        if (rightLegGroup) rightLegGroup.rotation.set(0.12, 0.1, 0.05);
        if (leftLegGroup) leftLegGroup.rotation.set(-0.08, -0.05, -0.04);
        if (torsoGroup) torsoGroup.rotation.y = -0.1;
        if (headGroup) headGroup.rotation.set(-0.05, 0.12, 0.05);
        break;
      case 'action_walk':
        rightArmGroup.rotation.x = 0.45;
        leftArmGroup.rotation.x = -0.45;
        if (rightLegGroup) rightLegGroup.rotation.x = -0.35;
        if (leftLegGroup) leftLegGroup.rotation.x = 0.35;
        break;
      case 'hero':
        rightArmGroup.rotation.set(0.2, 0, 0.25);
        leftArmGroup.rotation.set(0.2, 0, -0.25);
        if (rightLegGroup) rightLegGroup.rotation.z = 0.06;
        if (leftLegGroup) leftLegGroup.rotation.z = -0.06;
        break;
      case 't_pose':
        rightArmGroup.rotation.set(0, 0, 1.57);
        leftArmGroup.rotation.set(0, 0, -1.57);
        break;
    }
  }, []);

  // Update Pose whenever currentPose state changes
  useEffect(() => {
    applyPoseRotations(currentPose);
  }, [currentPose, applyPoseRotations]);

  // Update canvas texture dynamically
  useEffect(() => {
    if (textureRef.current && sourceCanvas) {
      textureRef.current.image = sourceCanvas;
      textureRef.current.needsUpdate = true;
    }
  }, [updateTrigger, sourceCanvas]);

  // Update UV coordinates whenever islands change
  useEffect(() => {
    updateAllGeomUvs(islands);
  }, [islands, updateAllGeomUvs]);

  // Update Body Part Visibility dynamically
  useEffect(() => {
    const meshes = bodyMeshesRef.current;
    if (meshes.head) meshes.head.visible = visibility.head;
    if (meshes.torso) meshes.torso.visible = visibility.torso;
    if (meshes.leftArm) meshes.leftArm.visible = visibility.leftArm;
    if (meshes.rightArm) meshes.rightArm.visible = visibility.rightArm;
    if (meshes.leftLeg) meshes.leftLeg.visible = visibility.leftLeg;
    if (meshes.rightLeg) meshes.rightLeg.visible = visibility.rightLeg;
  }, [visibility]);

  // Update Skin Color dynamically
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material && child.material.name !== 'clothing') {
          if (child.geometry instanceof THREE.CylinderGeometry || child.material.color) {
            (child.material as THREE.MeshStandardMaterial).color.set(skinColor);
          }
        }
      }
    });
  }, [skinColor]);

  // Update Proportions dynamically
  useEffect(() => {
    if (avatarGroupRef.current) {
      avatarGroupRef.current.scale.set(proportions.width, proportions.height, proportions.depth);
    }
    if (shadowMeshRef.current) {
      shadowMeshRef.current.scale.set(proportions.width, proportions.depth, 1);
    }
  }, [proportions]);

  // Update Ground Shadow visibility
  useEffect(() => {
    if (shadowMeshRef.current) {
      (shadowMeshRef.current.material as THREE.MeshBasicMaterial).opacity = showGroundShadow ? 0.75 : 0;
    }
  }, [showGroundShadow]);

  // Update Lighting dynamically
  useEffect(() => {
    if (!keyLightRef.current || !fillLightRef.current || !backLightRef.current || !ambientLightRef.current) return;

    if (lightingType === 'none') {
      ambientLightRef.current.intensity = 1.35;
      ambientLightRef.current.color.set('#ffffff');
      keyLightRef.current.intensity = 0;
      fillLightRef.current.intensity = 0;
      backLightRef.current.intensity = 0;
    } else if (lightingType === 'ambient_dir') {
      ambientLightRef.current.intensity = 0.8;
      ambientLightRef.current.color.set('#ffffff');

      keyLightRef.current.intensity = keyLight.intensity;
      keyLightRef.current.color.set(keyLight.color);
      keyLightRef.current.position.set(keyLight.x, keyLight.y, keyLight.z);

      fillLightRef.current.intensity = 0;
      backLightRef.current.intensity = 0;
    } else {
      // 3-Point Studio Lighting
      ambientLightRef.current.intensity = 0.5;
      ambientLightRef.current.color.set('#ffffff');

      keyLightRef.current.intensity = keyLight.intensity;
      keyLightRef.current.color.set(keyLight.color);
      keyLightRef.current.position.set(keyLight.x, keyLight.y, keyLight.z);

      fillLightRef.current.intensity = fillLight.intensity;
      fillLightRef.current.color.set(fillLight.color);
      fillLightRef.current.position.set(fillLight.x, fillLight.y, fillLight.z);

      backLightRef.current.intensity = backLight.intensity;
      backLightRef.current.color.set(backLight.color);
      backLightRef.current.position.set(backLight.x, backLight.y, backLight.z);
    }
  }, [lightingType, keyLight, fillLight, backLight]);

  // Set Camera View Angles
  const setCameraView = (view: 'front' | 'back' | 'left' | 'right' | 'perspective' | 'seams') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    switch (view) {
      case 'front':
        camera.position.set(0, -0.3, 5.8);
        break;
      case 'back':
        camera.position.set(0, -0.3, -5.8);
        break;
      case 'left':
        camera.position.set(-5.8, -0.3, 0);
        break;
      case 'right':
        camera.position.set(5.8, -0.3, 0);
        break;
      case 'perspective':
        camera.position.set(3.8, 1.8, 4.8);
        break;
      case 'seams':
        camera.position.set(0, 4.8, 1.2);
        break;
    }
    controls.target.set(0, -0.35, 0);
    controls.update();
    if (avatarGroupRef.current) {
      avatarGroupRef.current.rotation.set(0, 0, 0);
    }
  };

  // Reset Camera View
  const handleResetCamera = () => {
    setCameraView('front');
  };

  // Capture Snapshot PNG
  const handleCaptureSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Roblox_Avatar_4K_${humanoidType}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div
      className={`relative flex flex-col w-full h-full bg-[#0a0c10] text-[#e2e8f0] overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* =========================================================================
          TOP FLOATING WORKSPACE STATUS BAR
          ========================================================================= */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none gap-2">
        {/* Left Island: Back to 2D + Avatar Model Pill */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          {onReturnTo2D && isFullPage && (
            <button
              onClick={onReturnTo2D}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#10141f]/90 hover:bg-[#1b2234] border border-[#232936] text-xs font-mono font-bold text-white shadow-xl backdrop-blur-md transition active:scale-95 group"
              title="Return to 2D Canvas Editor"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#00e5ff] group-hover:-translate-x-0.5 transition-transform" />
              <span>2D Canvas</span>
            </button>
          )}

          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#10141f]/90 border border-[#232936] shadow-xl backdrop-blur-md text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping" />
            <span className="font-bold text-white uppercase tracking-wider">
              {humanoidType === 'blocky_r15'
                ? 'R15 Modern'
                : humanoidType === 'woman_1'
                ? 'Woman 1 Curved'
                : humanoidType === 'woman_2'
                ? 'Woman 2 Flared'
                : 'R6 Retro'}
            </span>
            <span className="text-[#64748b] hidden sm:inline">• Live Texture Sync</span>
          </div>

          {onToggleTemplateType && (
            <button
              onClick={onToggleTemplateType}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#10141f]/90 hover:bg-[#1b2234] border border-[#232936] text-xs font-mono font-semibold text-[#cbd5e1] hover:text-white shadow-xl backdrop-blur-md transition"
              title={`Switch garment template to ${templateType === 'shirt' ? 'Pants' : 'Shirt'}`}
            >
              <Shirt className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span className="capitalize">{templateType} Mode</span>
            </button>
          )}
        </div>

        {/* Right Island: Inspector Drawer Toggle + Viewport Tools */}
        <div className="flex items-center space-x-1.5 pointer-events-auto">
          <button
            onClick={() => setIsRotating(!isRotating)}
            className={`p-2 rounded-xl border backdrop-blur-md shadow-xl transition ${
              isRotating
                ? 'bg-[#00e5ff] text-black border-[#00e5ff]'
                : 'bg-[#10141f]/90 border-[#232936] text-[#94a3b8] hover:text-white hover:bg-[#1b2234]'
            }`}
            title={isRotating ? 'Stop Turntable' : 'Auto Turntable 360°'}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowWireframe3D(!showWireframe3D)}
            className={`p-2 rounded-xl border backdrop-blur-md shadow-xl transition ${
              showWireframe3D
                ? 'bg-[#7000ff] text-white border-[#7000ff]'
                : 'bg-[#10141f]/90 border-[#232936] text-[#94a3b8] hover:text-white hover:bg-[#1b2234]'
            }`}
            title="Toggle 3D Wireframe Inspection"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCaptureSnapshot}
            className="p-2 rounded-xl bg-[#10141f]/90 hover:bg-[#1b2234] border border-[#232936] text-[#94a3b8] hover:text-white shadow-xl backdrop-blur-md transition"
            title="Download 4K Avatar Snapshot"
          >
            <Camera className="w-3.5 h-3.5 text-[#00e5ff]" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-[#10141f]/90 hover:bg-[#1b2234] border border-[#232936] text-[#94a3b8] hover:text-white shadow-xl backdrop-blur-md transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Toggle Studio Inspector Drawer */}
          <button
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold shadow-xl backdrop-blur-md transition ${
              isInspectorOpen
                ? 'bg-gradient-to-r from-[#00e5ff] to-[#38bdf8] text-black border-[#00e5ff]'
                : 'bg-[#10141f]/90 border-[#232936] text-[#94a3b8] hover:text-white hover:bg-[#1b2234]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Inspector</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN 3D WEBGL VIEWPORT CANVAS
          ========================================================================= */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <div
          ref={containerRef}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{
            filter: isGrayscale ? 'grayscale(100%)' : 'none'
          }}
        />

        {/* =========================================================================
            ORIGINAL FLOATING STUDIO DOCK (Bottom Center Pill)
            Avatars • Poses • Camera Angles • 2D Showcase
            ========================================================================= */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 p-1.5 bg-[#0e121bf0] backdrop-blur-2xl border border-[#232936] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] select-none pointer-events-auto max-w-[95vw] overflow-x-auto">
          {/* 1. Humanoid Package Switcher */}
          <div className="flex items-center bg-[#151a26] p-0.5 rounded-xl border border-[#222a3d]">
            {[
              { id: 'blocky_r15', label: 'R15', tip: 'Modern R15 Segmented' },
              { id: 'woman_1', label: 'Woman', tip: 'Curved Woman 2.0' },
              { id: 'blocky_r6', label: 'R6', tip: 'Classic Retro R6' },
              { id: 'woman_2', label: 'Skirt', tip: 'Flared Dress / Skirt' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setHumanoidType(item.id as HumanoidType)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                  humanoidType === item.id
                    ? 'bg-[#00e5ff] text-black shadow-md'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
                title={item.tip}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="w-[1px] h-6 bg-[#232936]" />

          {/* 2. Pose Switcher */}
          <div className="flex items-center space-x-1">
            {[
              { id: 'idle', label: 'Idle' },
              { id: 'fashion_hip', label: 'Fashion' },
              { id: 'action_walk', label: 'Walk' },
              { id: 'hero', label: 'Hero' },
              { id: 't_pose', label: 'T-Pose' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setCurrentPose(p.id as PoseType)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono transition ${
                  currentPose === p.id
                    ? 'bg-[#7000ff] text-white font-bold shadow-md'
                    : 'text-[#94a3b8] hover:text-white hover:bg-[#1a2130]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-[1px] h-6 bg-[#232936] hidden sm:block" />

          {/* 3. Camera Angles */}
          <div className="hidden sm:flex items-center space-x-0.5">
            <button
              onClick={() => setCameraView('front')}
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-[#94a3b8] hover:text-white hover:bg-[#1a2130] transition"
            >
              Front
            </button>
            <button
              onClick={() => setCameraView('perspective')}
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-[#94a3b8] hover:text-white hover:bg-[#1a2130] transition"
            >
              3/4
            </button>
            <button
              onClick={() => setCameraView('back')}
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-[#94a3b8] hover:text-white hover:bg-[#1a2130] transition"
            >
              Back
            </button>
            <button
              onClick={() => setCameraView('seams')}
              className="px-2 py-1 rounded-lg text-[11px] font-mono text-[#94a3b8] hover:text-white hover:bg-[#1a2130] transition"
              title="Top Seam Alignment View"
            >
              Seams
            </button>
          </div>

          <div className="w-[1px] h-6 bg-[#232936]" />

          {/* 4. Showcase & Reset Actions */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowShowcaseModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#38bdf8] text-black font-mono font-extrabold text-xs shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 transition active:scale-95"
              title="Open 2D Clothing Presentation Card"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>2D Showcase</span>
            </button>

            <button
              onClick={handleResetCamera}
              className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#1a2130] transition"
              title="Reset Camera View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            SLIDE-OUT STUDIO INSPECTOR DRAWER (Right Side)
            Clean, professional, and easily collapsible
            ========================================================================= */}
        {isInspectorOpen && (
          <aside className="absolute top-16 right-3 bottom-20 w-80 max-w-[calc(100vw-24px)] bg-[#0d1017]/95 backdrop-blur-2xl border border-[#232936] rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.85)] flex flex-col z-30 overflow-hidden animate-in fade-in slide-in-from-right-4">
            {/* Inspector Navigation Tabs */}
            <div className="flex items-center border-b border-[#232936] bg-[#121622] p-1 gap-1">
              {[
                { id: 'avatar', label: 'Avatar', icon: User },
                { id: 'lighting', label: 'Lighting', icon: Lightbulb },
                { id: 'scene', label: 'Scene', icon: Compass },
                { id: 'showcase', label: 'Export', icon: Share2 }
              ].map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveInspectorTab(tab.id as InspectorTab)}
                    className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                      activeInspectorTab === tab.id
                        ? 'bg-[#00e5ff] text-black shadow-md'
                        : 'text-[#94a3b8] hover:text-white hover:bg-[#181e2b]'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Inspector Body */}
            <div className="flex-1 overflow-y-auto p-3 text-xs flex flex-col gap-3">
              {/* --- TAB 1: AVATAR & ANATOMY --- */}
              {activeInspectorTab === 'avatar' && (
                <div className="flex flex-col gap-3">
                  {/* Humanoid Cards */}
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] block mb-1.5 font-bold">
                      Humanoid Character Model
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'blocky_r15', label: 'R15 Modern', desc: 'Segmented Multi-Joint' },
                        { id: 'woman_1', label: 'Woman 1', desc: 'Curved Waist & Limbs' },
                        { id: 'blocky_r6', label: 'R6 Retro', desc: 'Canonical Single-Mesh' },
                        { id: 'woman_2', label: 'Woman 2', desc: 'Flared Dress / Skirt' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setHumanoidType(item.id as HumanoidType)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                            humanoidType === item.id
                              ? 'bg-[#182132] border-[#00e5ff] text-white shadow-md'
                              : 'bg-[#121622] border-[#222a3a] text-[#94a3b8] hover:text-white hover:bg-[#171d2b]'
                          }`}
                        >
                          <User className={`w-4 h-4 mb-1 ${humanoidType === item.id ? 'text-[#00e5ff]' : 'text-[#64748b]'}`} />
                          <span className="font-bold text-[11px] font-mono leading-tight">{item.label}</span>
                          <span className="text-[9px] text-[#64748b]">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Body Visibility Doll + Filter Presets */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-bold">
                        Anatomy Visibility
                      </span>
                      <div className="flex items-center space-x-1 text-[10px] font-mono">
                        <button
                          onClick={() =>
                            setVisibility({
                              head: true,
                              torso: true,
                              leftArm: true,
                              rightArm: true,
                              leftLeg: true,
                              rightLeg: true
                            })
                          }
                          className="text-[#00e5ff] hover:underline"
                        >
                          All
                        </button>
                        <span className="text-[#475569]">•</span>
                        <button
                          onClick={() =>
                            setVisibility({
                              head: true,
                              torso: true,
                              leftArm: true,
                              rightArm: true,
                              leftLeg: false,
                              rightLeg: false
                            })
                          }
                          className="text-[#94a3b8] hover:text-white"
                          title="Solo Shirt (Hide Legs)"
                        >
                          Shirt
                        </button>
                        <span className="text-[#475569]">•</span>
                        <button
                          onClick={() =>
                            setVisibility({
                              head: true,
                              torso: false,
                              leftArm: false,
                              rightArm: false,
                              leftLeg: true,
                              rightLeg: true
                            })
                          }
                          className="text-[#94a3b8] hover:text-white"
                          title="Solo Pants (Hide Torso/Arms)"
                        >
                          Pants
                        </button>
                      </div>
                    </div>

                    {/* Interactive 2D Avatar Schematic Diagram */}
                    <div className="flex flex-col items-center justify-center p-2.5 bg-[#090c12] rounded-lg border border-[#1b2230]">
                      {/* Head */}
                      <button
                        onClick={() => setVisibility((v) => ({ ...v, head: !v.head }))}
                        className={`w-9 h-9 rounded-md mb-1 transition flex items-center justify-center border ${
                          visibility.head
                            ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                            : 'bg-transparent border-dashed border-[#475569] opacity-40'
                        }`}
                        title="Click to toggle Head"
                      >
                        {!visibility.head && <EyeOff className="w-3.5 h-3.5 text-white" />}
                      </button>

                      {/* Torso & Arms */}
                      <div className="flex items-center space-x-1 mb-1">
                        <button
                          onClick={() => setVisibility((v) => ({ ...v, rightArm: !v.rightArm }))}
                          className={`w-8 h-14 rounded-md transition flex items-center justify-center border ${
                            visibility.rightArm
                              ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                              : 'bg-transparent border-dashed border-[#475569] opacity-40'
                          }`}
                          title="Toggle Right Arm"
                        >
                          {!visibility.rightArm && <EyeOff className="w-3.5 h-3.5 text-white" />}
                        </button>

                        <button
                          onClick={() => setVisibility((v) => ({ ...v, torso: !v.torso }))}
                          className={`w-14 h-14 rounded-md transition flex items-center justify-center border ${
                            visibility.torso
                              ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                              : 'bg-transparent border-dashed border-[#475569] opacity-40'
                          }`}
                          title="Toggle Torso"
                        >
                          {!visibility.torso && <EyeOff className="w-3.5 h-3.5 text-white" />}
                        </button>

                        <button
                          onClick={() => setVisibility((v) => ({ ...v, leftArm: !v.leftArm }))}
                          className={`w-8 h-14 rounded-md transition flex items-center justify-center border ${
                            visibility.leftArm
                              ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                              : 'bg-transparent border-dashed border-[#475569] opacity-40'
                          }`}
                          title="Toggle Left Arm"
                        >
                          {!visibility.leftArm && <EyeOff className="w-3.5 h-3.5 text-white" />}
                        </button>
                      </div>

                      {/* Legs */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => setVisibility((v) => ({ ...v, rightLeg: !v.rightLeg }))}
                          className={`w-7 h-14 rounded-md transition flex items-center justify-center border ${
                            visibility.rightLeg
                              ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                              : 'bg-transparent border-dashed border-[#475569] opacity-40'
                          }`}
                          title="Toggle Right Leg"
                        >
                          {!visibility.rightLeg && <EyeOff className="w-3.5 h-3.5 text-white" />}
                        </button>

                        <button
                          onClick={() => setVisibility((v) => ({ ...v, leftLeg: !v.leftLeg }))}
                          className={`w-7 h-14 rounded-md transition flex items-center justify-center border ${
                            visibility.leftLeg
                              ? 'bg-[#94a3b8] border-[#cbd5e1] hover:brightness-110 shadow-sm'
                              : 'bg-transparent border-dashed border-[#475569] opacity-40'
                          }`}
                          title="Toggle Left Leg"
                        >
                          {!visibility.leftLeg && <EyeOff className="w-3.5 h-3.5 text-white" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Skin Tone Atelier */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936]">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] block mb-1.5 font-bold">
                      Skin Tone Atelier
                    </label>

                    <div className="flex items-center space-x-2 bg-[#090c12] p-1.5 rounded-lg border border-[#1e2637] mb-2">
                      <div
                        className="w-12 h-7 rounded border border-white/20 shadow-inner flex-shrink-0 cursor-pointer relative overflow-hidden"
                        style={{ backgroundColor: skinColor }}
                      >
                        <input
                          type="color"
                          value={skinColor}
                          onChange={(e) => {
                            setSkinColor(e.target.value);
                            setCustomSkinHex(e.target.value);
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <input
                        type="text"
                        value={customSkinHex}
                        onChange={(e) => setCustomSkinHex(e.target.value)}
                        onBlur={() => {
                          if (/^#[0-9A-Fa-f]{6}$/.test(customSkinHex)) {
                            setSkinColor(customSkinHex);
                          }
                        }}
                        className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                        placeholder="#FFD8C2"
                      />
                      <button
                        onClick={() => {
                          if (/^#[0-9A-Fa-f]{6}$/.test(customSkinHex)) {
                            setSkinColor(customSkinHex);
                          }
                        }}
                        className="px-2 py-1 rounded bg-[#1e2538] hover:bg-[#2b354d] text-[#00e5ff] text-[10px] font-mono font-bold transition"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="grid grid-cols-5 gap-1">
                      {PRESET_SKIN_TONES.map((st) => (
                        <button
                          key={st.name}
                          onClick={() => {
                            setSkinColor(st.color);
                            setCustomSkinHex(st.color);
                          }}
                          className={`h-6 rounded-md border transition ${
                            skinColor.toUpperCase() === st.color.toUpperCase()
                              ? 'ring-2 ring-[#00e5ff] scale-105'
                              : 'border-white/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: st.color }}
                          title={st.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Proportions Sliders */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-bold">
                        Avatar Scaling
                      </label>
                      <button
                        onClick={() => setProportions({ height: 1.0, width: 1.0, depth: 1.0 })}
                        className="text-[10px] text-[#00e5ff] hover:underline font-mono flex items-center space-x-1"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset All</span>
                      </button>
                    </div>

                    {/* Height */}
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#94a3b8]">Height</span>
                        <span className="text-white font-bold">{Math.round(proportions.height * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="1.3"
                        step="0.01"
                        value={proportions.height}
                        onChange={(e) => setProportions((p) => ({ ...p, height: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-[#1e2536] rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                      />
                    </div>

                    {/* Width */}
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#94a3b8]">Width</span>
                        <span className="text-white font-bold">{Math.round(proportions.width * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="1.3"
                        step="0.01"
                        value={proportions.width}
                        onChange={(e) => setProportions((p) => ({ ...p, width: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-[#1e2536] rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                      />
                    </div>

                    {/* Depth */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#94a3b8]">Depth</span>
                        <span className="text-white font-bold">{Math.round(proportions.depth * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="1.3"
                        step="0.01"
                        value={proportions.depth}
                        onChange={(e) => setProportions((p) => ({ ...p, depth: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-[#1e2536] rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 2: LIGHTING STUDIO --- */}
              {activeInspectorTab === 'lighting' && (
                <div className="flex flex-col gap-3">
                  {/* Preset Selector */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider font-bold">
                      Lighting Rig Type
                    </span>
                    <select
                      value={lightingType}
                      onChange={(e) => setLightingType(e.target.value as LightingType)}
                      className="w-full bg-[#181e2b] border border-[#2b374c] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00e5ff]"
                    >
                      <option value="3_point">3-Point Studio Rig (Key, Fill, Rim)</option>
                      <option value="ambient_dir">Ambient + Directional Sunlight</option>
                      <option value="none">Flat Neutral (Zero Specular)</option>
                    </select>
                  </div>

                  {/* 1. KEY LIGHT */}
                  {lightingType !== 'none' && (
                    <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] font-mono flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                          <span>Key Light</span>
                        </span>
                        <span className="text-[10px] font-mono text-[#94a3b8]">{keyLight.intensity}x</span>
                      </div>

                      {/* Color */}
                      <div className="flex items-center space-x-2 bg-[#090c12] p-1.5 rounded-lg border border-[#1e2637]">
                        <div
                          className="w-10 h-6 rounded border border-white/20 shadow-inner flex-shrink-0 cursor-pointer relative overflow-hidden"
                          style={{ backgroundColor: keyLight.color }}
                        >
                          <input
                            type="color"
                            value={keyLight.color}
                            onChange={(e) =>
                              setKeyLight((prev) => ({ ...prev, color: e.target.value, customHex: e.target.value }))
                            }
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                        <input
                          type="text"
                          value={keyLight.customHex}
                          onChange={(e) => setKeyLight((prev) => ({ ...prev, customHex: e.target.value }))}
                          onBlur={() => {
                            if (/^#[0-9A-Fa-f]{6}$/.test(keyLight.customHex)) {
                              setKeyLight((prev) => ({ ...prev, color: prev.customHex }));
                            }
                          }}
                          className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                          placeholder="#ffffff"
                        />
                      </div>

                      {/* Intensity */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                          <span>Intensity</span>
                          <button
                            onClick={() => setKeyLight((k) => ({ ...k, intensity: 2.2 }))}
                            className="hover:text-white"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={keyLight.intensity}
                          onChange={(e) => setKeyLight((k) => ({ ...k, intensity: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-[#1e2536] rounded appearance-none cursor-pointer accent-[#00e5ff]"
                        />
                      </div>

                      {/* XYZ Position */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#1a2130] text-[9px] font-mono text-center">
                        <div>
                          <span className="text-[#64748b] block">X: {keyLight.x}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={keyLight.x}
                            onChange={(e) => setKeyLight((k) => ({ ...k, x: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Y: {keyLight.y}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={keyLight.y}
                            onChange={(e) => setKeyLight((k) => ({ ...k, y: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Z: {keyLight.z}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={keyLight.z}
                            onChange={(e) => setKeyLight((k) => ({ ...k, z: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. FILL LIGHT */}
                  {lightingType === '3_point' && (
                    <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] font-mono flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#60a5fa]" />
                          <span>Fill Light</span>
                        </span>
                        <span className="text-[10px] font-mono text-[#94a3b8]">{fillLight.intensity}x</span>
                      </div>

                      <div className="flex items-center space-x-2 bg-[#090c12] p-1.5 rounded-lg border border-[#1e2637]">
                        <div
                          className="w-10 h-6 rounded border border-white/20 shadow-inner flex-shrink-0 cursor-pointer relative overflow-hidden"
                          style={{ backgroundColor: fillLight.color }}
                        >
                          <input
                            type="color"
                            value={fillLight.color}
                            onChange={(e) =>
                              setFillLight((prev) => ({ ...prev, color: e.target.value, customHex: e.target.value }))
                            }
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                        <input
                          type="text"
                          value={fillLight.customHex}
                          onChange={(e) => setFillLight((prev) => ({ ...prev, customHex: e.target.value }))}
                          onBlur={() => {
                            if (/^#[0-9A-Fa-f]{6}$/.test(fillLight.customHex)) {
                              setFillLight((prev) => ({ ...prev, color: prev.customHex }));
                            }
                          }}
                          className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                          placeholder="#93c5fd"
                        />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                          <span>Intensity</span>
                          <button
                            onClick={() => setFillLight((f) => ({ ...f, intensity: 1.0 }))}
                            className="hover:text-white"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={fillLight.intensity}
                          onChange={(e) => setFillLight((f) => ({ ...f, intensity: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-[#1e2536] rounded appearance-none cursor-pointer accent-[#00e5ff]"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#1a2130] text-[9px] font-mono text-center">
                        <div>
                          <span className="text-[#64748b] block">X: {fillLight.x}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={fillLight.x}
                            onChange={(e) => setFillLight((f) => ({ ...f, x: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Y: {fillLight.y}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={fillLight.y}
                            onChange={(e) => setFillLight((f) => ({ ...f, y: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Z: {fillLight.z}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={fillLight.z}
                            onChange={(e) => setFillLight((f) => ({ ...f, z: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. BACK LIGHT (RIM LIGHT) */}
                  {lightingType === '3_point' && (
                    <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] font-mono flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#c084fc]" />
                          <span>Back / Rim Light</span>
                        </span>
                        <span className="text-[10px] font-mono text-[#94a3b8]">{backLight.intensity}x</span>
                      </div>

                      <div className="flex items-center space-x-2 bg-[#090c12] p-1.5 rounded-lg border border-[#1e2637]">
                        <div
                          className="w-10 h-6 rounded border border-white/20 shadow-inner flex-shrink-0 cursor-pointer relative overflow-hidden"
                          style={{ backgroundColor: backLight.color }}
                        >
                          <input
                            type="color"
                            value={backLight.color}
                            onChange={(e) =>
                              setBackLight((prev) => ({ ...prev, color: e.target.value, customHex: e.target.value }))
                            }
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                        <input
                          type="text"
                          value={backLight.customHex}
                          onChange={(e) => setBackLight((prev) => ({ ...prev, customHex: e.target.value }))}
                          onBlur={() => {
                            if (/^#[0-9A-Fa-f]{6}$/.test(backLight.customHex)) {
                              setBackLight((prev) => ({ ...prev, color: prev.customHex }));
                            }
                          }}
                          className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                          placeholder="#c084fc"
                        />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#94a3b8]">
                          <span>Intensity</span>
                          <button
                            onClick={() => setBackLight((b) => ({ ...b, intensity: 1.4 }))}
                            className="hover:text-white"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={backLight.intensity}
                          onChange={(e) => setBackLight((b) => ({ ...b, intensity: parseFloat(e.target.value) }))}
                          className="w-full h-1.5 bg-[#1e2536] rounded appearance-none cursor-pointer accent-[#00e5ff]"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#1a2130] text-[9px] font-mono text-center">
                        <div>
                          <span className="text-[#64748b] block">X: {backLight.x}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={backLight.x}
                            onChange={(e) => setBackLight((b) => ({ ...b, x: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Y: {backLight.y}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={backLight.y}
                            onChange={(e) => setBackLight((b) => ({ ...b, y: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                        <div>
                          <span className="text-[#64748b] block">Z: {backLight.z}</span>
                          <input
                            type="range"
                            min="-10"
                            max="10"
                            step="0.5"
                            value={backLight.z}
                            onChange={(e) => setBackLight((b) => ({ ...b, z: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-[#1e2536] rounded appearance-none accent-[#00e5ff]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- TAB 3: SCENE & CAMERA --- */}
              {activeInspectorTab === 'scene' && (
                <div className="flex flex-col gap-3">
                  {/* Backdrop Color */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936]">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] block mb-1.5 font-bold">
                      Stage Backdrop Color
                    </label>

                    <div className="flex items-center space-x-2 bg-[#090c12] p-1.5 rounded-lg border border-[#1e2637] mb-2">
                      <div
                        className="w-12 h-7 rounded border border-white/20 shadow-inner flex-shrink-0 cursor-pointer relative overflow-hidden"
                        style={{ backgroundColor: bgColor }}
                      >
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => {
                            setBgColor(e.target.value);
                            setCustomBgHex(e.target.value);
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <input
                        type="text"
                        value={customBgHex}
                        onChange={(e) => setCustomBgHex(e.target.value)}
                        onBlur={() => {
                          if (/^#[0-9A-Fa-f]{6}$/.test(customBgHex)) {
                            setBgColor(customBgHex);
                          }
                        }}
                        className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                        placeholder="#07090e"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {PRESET_BG_COLORS.map((bg) => (
                        <button
                          key={bg.name}
                          onClick={() => {
                            setBgColor(bg.color);
                            setCustomBgHex(bg.color);
                          }}
                          className={`h-6 rounded-md border transition ${
                            bgColor.toUpperCase() === bg.color.toUpperCase()
                              ? 'ring-2 ring-[#00e5ff] scale-105'
                              : 'border-white/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: bg.color }}
                          title={bg.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Floor & Shadow Toggles */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] block font-bold">
                      Stage Floor & Shadows
                    </label>

                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">Studio Floor Grid</span>
                      <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`w-10 h-5 flex items-center rounded-full p-0.5 transition ${
                          showGrid ? 'bg-[#00e5ff]' : 'bg-[#1e2536]'
                        }`}
                      >
                        <div
                          className={`bg-black w-4 h-4 rounded-full shadow-md transform transition ${
                            showGrid ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">Ground Contact Shadow</span>
                      <button
                        onClick={() => setShowGroundShadow(!showGroundShadow)}
                        className={`w-10 h-5 flex items-center rounded-full p-0.5 transition ${
                          showGroundShadow ? 'bg-[#00e5ff]' : 'bg-[#1e2536]'
                        }`}
                      >
                        <div
                          className={`bg-black w-4 h-4 rounded-full shadow-md transform transition ${
                            showGroundShadow ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">Grayscale Diagnostic</span>
                      <button
                        onClick={() => setIsGrayscale(!isGrayscale)}
                        className={`w-10 h-5 flex items-center rounded-full p-0.5 transition ${
                          isGrayscale ? 'bg-[#00e5ff]' : 'bg-[#1e2536]'
                        }`}
                      >
                        <div
                          className={`bg-black w-4 h-4 rounded-full shadow-md transform transition ${
                            isGrayscale ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Camera Projection & Optics */}
                  <div className="bg-[#121622] p-2.5 rounded-xl border border-[#232936] flex flex-col gap-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] block font-bold">
                      Camera Optics
                    </label>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-[#94a3b8]">Projection Mode</span>
                      <select
                        value={projectionMode}
                        onChange={(e) => setProjectionMode(e.target.value as any)}
                        className="w-full bg-[#181e2b] border border-[#2b374c] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00e5ff]"
                      >
                        <option value="perspective">Perspective (Realistic 3D Depth)</option>
                        <option value="orthographic">Orthographic (Isometric Technical View)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#94a3b8]">Field of View</span>
                        <span className="text-white font-bold">{cameraFov}°</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="95"
                        step="1"
                        value={cameraFov}
                        onChange={(e) => setCameraFov(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-[#1e2536] rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 4: SHOWCASE & EXPORT --- */}
              {activeInspectorTab === 'showcase' && (
                <div className="flex flex-col gap-2.5">
                  <div className="p-3 bg-[#121622] rounded-xl border border-[#232936] flex flex-col gap-2 text-center">
                    <Sparkles className="w-8 h-8 text-[#00e5ff] mx-auto animate-pulse" />
                    <h3 className="font-bold text-white text-xs font-mono">Publish & Showcase</h3>
                    <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                      Render professional 2D presentation cards or export high-resolution 4K snapshots ready for Discord, Roblox Groups, and social media.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowShowcaseModal(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#38bdf8] text-black font-bold font-mono text-xs flex items-center justify-center space-x-2 shadow-lg shadow-[#00e5ff]/20 hover:brightness-110 transition active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Open 2D Showcase Card</span>
                  </button>

                  <button
                    onClick={handleCaptureSnapshot}
                    className="w-full py-2 px-3 rounded-xl bg-[#1a2130] hover:bg-[#253046] text-white font-mono text-xs flex items-center justify-center space-x-2 border border-[#2b374c] transition"
                  >
                    <Download className="w-4 h-4 text-[#00e5ff]" />
                    <span>Download 4K Snapshot</span>
                  </button>

                  {onReturnTo2D && isFullPage && (
                    <button
                      onClick={onReturnTo2D}
                      className="w-full py-2 px-3 rounded-xl bg-[#121622] hover:bg-[#1a2130] text-[#cbd5e1] font-mono text-xs flex items-center justify-center space-x-2 border border-[#232936] transition mt-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to 2D Canvas Editor</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* --- 2D SHOWCASE PRESENTATION MODAL --- */}
      <Showcase2DModal
        isOpen={showShowcaseModal}
        onClose={() => setShowShowcaseModal(false)}
        sourceCanvas={sourceCanvas}
        templateType={templateType}
        islands={islands}
        skinColor={skinColor}
      />
    </div>
  );
};
