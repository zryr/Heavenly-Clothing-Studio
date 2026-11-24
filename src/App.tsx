import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  Box,
  Brush,
  ChevronDown,
  Columns2,
  Download,
  Eraser,
  FolderOpen,
  Hand,
  HelpCircle,
  History,
  Moon,
  Move,
  PanelRight,
  PencilLine,
  Pipette,
  Redo2,
  RotateCcw,
  Sparkles,
  SquareDashed,
  Stamp,
  Sun,
  Undo2,
  Upload,
  X
} from 'lucide-react';
import {
  ConformMode,
  DEFAULT_IMAGE_TRANSFORM,
  ImageTransform,
  PreflightReport,
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TSHIRT_SIZE,
  TemplateType,
  ToolMode,
  UvIsland,
  UvSectionId,
  getTemplateSpec
} from './types/uv';
import {
  AvatarPreviewSettings,
  BodyRegionGroup,
  CustomBackgroundConfig,
  DEFAULT_AVATAR_SETTINGS,
  DEFAULT_CUSTOM_BACKGROUND,
  DEFAULT_LOUPE_SETTINGS,
  DEFAULT_STAGE_BG_BY_THEME,
  FloatingDecalState,
  HistoryTimelineItem,
  HoverPixelInfo,
  InspectorTab,
  LoupeSettings,
  SavedDecalPreset,
  SavedOutfitSlotData,
  StudioProjectRecord,
  StudioTheme,
  ToastNotice,
  ViewMode
} from './types/studio';
import {
  STORAGE_PANTS_UV_KEY,
  STORAGE_SHIRT_UV_KEY,
  analyzePreflight,
  applyBrushStroke,
  autoStripNonUvPixels,
  defringeUvEdges,
  extendUvIslands,
  getUvMask,
  loadOrMigrateUvIslands,
  nudgeUvIslands,
  renderTransformedSource,
  resampleToTarget
} from './utils/uvEngine';
import {
  DEFAULT_DECAL_STAMP,
  DecalStampConfig,
  applyPaintStroke,
  computeMirrorCanvasPoint,
  computeSeamWrappedPoints,
  drawDecalStamp,
  extractDominantPaletteFromCanvas
} from './utils/studioCreativeEngine';
import {
  deleteDecalPreset,
  listDecalPresets,
  saveDecalPreset
} from './utils/decalStorage';
import { HistoryStack } from './utils/historyStack';
import { SAMPLE_TEMPLATES, SampleTemplateSpec } from './utils/sampleTemplates';
import {
  blobToImage,
  canvasToPngBlob,
  saveAutoDraft,
  saveProject
} from './utils/projectStorage';
import { MultiGarmentInput } from './three/avatarSceneEngine';
import { CanvasViewport } from './components/CanvasViewport';
import { Roblox3DViewport } from './components/Roblox3DViewport';
import { InspectorPanel } from './components/InspectorPanel';
import { PreflightModal } from './components/PreflightModal';
import { ExportModal, OutfitZipSlotEntry } from './components/ExportModal';
import { ProjectsModal } from './components/ProjectsModal';
import { UvDebugModal } from './components/UvDebugModal';
import { Showcase2DModal } from './components/Showcase2DModal';
import { HistoryTimelineDrawer } from './components/HistoryTimelineDrawer';
import { ShortcutsModal } from './components/ShortcutsModal';

interface PendingImport {
  image: HTMLImageElement;
  fileName: string;
  fileSize: number;
}

interface CanvasHistoryEntry {
  imageData: ImageData;
  label: string;
  timestamp: number;
  thumbDataUrl: string;
}

interface GarmentSlotBuffers {
  mainCanvas: HTMLCanvasElement;
  originalCanvas: HTMLCanvasElement;
  history: HistoryStack<CanvasHistoryEntry>;
}

interface GarmentSlotMeta {
  hasImage: boolean;
  hasCutAction: boolean;
  customBackground: CustomBackgroundConfig;
  projectId: string | null;
  projectName: string;
  sourceFileName: string;
  sourceFileSize: number;
  transform: ImageTransform;
  isDirty: boolean;
  lastSavedAt: number | null;
}

function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function createInitialSlotMeta(type: TemplateType): GarmentSlotMeta {
  return {
    hasImage: false,
    hasCutAction: false,
    customBackground: { ...DEFAULT_CUSTOM_BACKGROUND },
    projectId: null,
    projectName: `Untitled ${getTemplateSpec(type).label}`,
    sourceFileName: '',
    sourceFileSize: 0,
    transform: { ...DEFAULT_IMAGE_TRANSFORM },
    isDirty: false,
    lastSavedAt: null
  };
}

let sharedThumbCanvas: HTMLCanvasElement | null = null;
function createCanvasThumbnail(source: HTMLCanvasElement): string {
  if (typeof document === 'undefined') return '';
  if (!sharedThumbCanvas) {
    sharedThumbCanvas = createOffscreenCanvas(64, 61);
  }
  const ctx = sharedThumbCanvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, sharedThumbCanvas.width, sharedThumbCanvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  const aspect = source.width / Math.max(1, source.height);
  let drawW = sharedThumbCanvas.width;
  let drawH = sharedThumbCanvas.height;
  let dx = 0;
  let dy = 0;
  if (aspect > drawW / drawH) {
    drawH = Math.round(drawW / aspect);
    dy = Math.round((sharedThumbCanvas.height - drawH) / 2);
  } else {
    drawW = Math.round(drawH * aspect);
    dx = Math.round((sharedThumbCanvas.width - drawW) / 2);
  }
  ctx.drawImage(source, dx, dy, drawW, drawH);
  try {
    return sharedThumbCanvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export default function App() {
  // 3 Independent Persistent Garment Slots (Shirt, Pants, T-Shirt) — switching tabs NEVER erases work!
  const slotsRef = useRef<Record<TemplateType, GarmentSlotBuffers> | null>(null);
  if (!slotsRef.current && typeof document !== 'undefined') {
    slotsRef.current = {
      shirt: {
        mainCanvas: createOffscreenCanvas(TEMPLATE_WIDTH, TEMPLATE_HEIGHT),
        originalCanvas: createOffscreenCanvas(TEMPLATE_WIDTH, TEMPLATE_HEIGHT),
        history: new HistoryStack<CanvasHistoryEntry>(30)
      },
      pants: {
        mainCanvas: createOffscreenCanvas(TEMPLATE_WIDTH, TEMPLATE_HEIGHT),
        originalCanvas: createOffscreenCanvas(TEMPLATE_WIDTH, TEMPLATE_HEIGHT),
        history: new HistoryStack<CanvasHistoryEntry>(30)
      },
      tshirt: {
        mainCanvas: createOffscreenCanvas(TSHIRT_SIZE, TSHIRT_SIZE),
        originalCanvas: createOffscreenCanvas(TSHIRT_SIZE, TSHIRT_SIZE),
        history: new HistoryStack<CanvasHistoryEntry>(30)
      }
    };
  }

  // Reusable offscreen canvas for live 3D preview of Floating Decal Layer before baking
  const floatingPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const last3DPaintPtRef = useRef<{ x: number; y: number } | null>(null);
  const paint3DStrokeDirtyRef = useRef<boolean>(false);
  const paint3DPreStrokeSnapshotRef = useRef<ImageData | null>(null);
  const prefersReducedMotion = useReducedMotion();
  // Zero-re-render imperative bridges for 120fps live 3D & 2D brush strokes
  const fastRefresh3DRef = useRef<
    ((regions: ReadonlySet<BodyRegionGroup> | 'all') => void) | null
  >(null);
  const repaint2DRef = useRef<(() => void) | null>(null);

  // Per-slot decoded HTMLImageElement cache for Custom Stripped Background images
  const customBgImagesRef = useRef<Record<TemplateType, HTMLImageElement | null>>({
    shirt: null,
    pants: null,
    tshirt: null
  });

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Core Workspace State
  const [templateType, setTemplateType] = useState<TemplateType>('shirt');
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? '2d' : 'split'
  );
  const [isDesktopSplitCapable, setIsDesktopSplitCapable] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isXlDesktop, setIsXlDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : false
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('canvas');

  // Persistent Per-Slot Metadata
  const [slotMeta, setSlotMeta] = useState<Record<TemplateType, GarmentSlotMeta>>({
    shirt: createInitialSlotMeta('shirt'),
    pants: createInitialSlotMeta('pants'),
    tshirt: createInitialSlotMeta('tshirt')
  });

  const [updateTrigger, setUpdateTrigger] = useState<number>(0);
  const [paletteRefreshTick, setPaletteRefreshTick] = useState<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // Sync active canvas refs immediately during render so CanvasViewport always sees the active slot
  if (slotsRef.current) {
    mainCanvasRef.current = slotsRef.current[templateType].mainCanvas;
    originalCanvasRef.current = slotsRef.current[templateType].originalCanvas;
  }

  const activeMeta = slotMeta[templateType];
  const hasImage = activeMeta.hasImage;
  const hasCutAction = activeMeta.hasCutAction;
  const customBackground = activeMeta.customBackground;
  const projectName = activeMeta.projectName;
  const transform = activeMeta.transform;
  const isDirty = activeMeta.isDirty;
  const lastSavedAt = activeMeta.lastSavedAt;
  const anySlotDirty = slotMeta.shirt.isDirty || slotMeta.pants.isDirty || slotMeta.tshirt.isDirty;

  // 2D Editor Tool & Guide State
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  const [brushSize, setBrushSize] = useState<number>(16);
  const [brushHardness, setBrushHardness] = useState<number>(0.95);
  const [bleedMargin, setBleedMargin] = useState<number>(0);
  const [showUvOverlay, setShowUvOverlay] = useState<boolean>(true);
  const [uvOpacity, setUvOpacity] = useState<number>(0.78);
  const [showUvLabels, setShowUvLabels] = useState<boolean>(false);
  const [showCompare, setShowCompare] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoverPixel, setHoverPixel] = useState<HoverPixelInfo | null>(null);

  // Creative Studio State (Paint Brush, Eyedropper, Seam Bridge, Floating Decal Layer, Direct 3D Paint, Loupe)
  const [paintColor, setPaintColor] = useState<string>('#38BDF8');
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('heavenly_recent_colors_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((c): c is string => typeof c === 'string').slice(0, 6)
        : [];
    } catch {
      return [];
    }
  });
  const [paintOpacity, setPaintOpacity] = useState<number>(1);
  const [symmetryEnabled, setSymmetryEnabled] = useState<boolean>(false);
  const [clipToUv, setClipToUv] = useState<boolean>(true);
  const [seamBridgeEnabled, setSeamBridgeEnabled] = useState<boolean>(true);
  const [paint3DEnabled, setPaint3DEnabled] = useState<boolean>(false);
  const [paint3DMode, setPaint3DMode] = useState<'paint' | 'erase'>('paint');
  const [loupeEnabled, setLoupeEnabled] = useState<boolean>(false);
  const [loupeSettings, setLoupeSettings] = useState<LoupeSettings>(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_LOUPE_SETTINGS };
    try {
      const raw = window.localStorage.getItem('heavenly_loupe_settings_v1');
      if (!raw) return { ...DEFAULT_LOUPE_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_LOUPE_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_LOUPE_SETTINGS };
    }
  });
  const [decalConfig, setDecalConfig] = useState<DecalStampConfig>({ ...DEFAULT_DECAL_STAMP });
  const [decalCustomImage, setDecalCustomImage] = useState<HTMLImageElement | null>(null);
  const [decalPresets, setDecalPresets] = useState<SavedDecalPreset[]>([]);
  const [floatingDecal, setFloatingDecal] = useState<FloatingDecalState | null>(null);
  const [highlightedRegion, setHighlightedRegion] = useState<BodyRegionGroup | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('heavenly_loupe_settings_v1', JSON.stringify(loupeSettings));
    } catch {
      // ignore
    }
  }, [loupeSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem('heavenly_recent_colors_v1', JSON.stringify(recentColors));
    } catch {
      // ignore
    }
  }, [recentColors]);

  useEffect(() => {
    let active = true;
    listDecalPresets()
      .then((items) => {
        if (active) setDecalPresets(items);
      })
      .catch(() => {
        // ignore storage errors
      });
    return () => {
      active = false;
    };
  }, []);

  // Studio Theme: Heavenly Dark by default, with Heavenly Light optional toggle
  const [studioTheme, setStudioTheme] = useState<StudioTheme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('heavenly_studio_theme_v1');
    return saved === 'light' ? 'light' : 'dark';
  });

  // 3D Avatar & Stage Settings (managed exclusively inside the 3D Viewport's slide-up sheets!)
  const [avatarSettings, setAvatarSettings] = useState<AvatarPreviewSettings>(() => {
    const savedTheme =
      typeof window !== 'undefined' &&
      window.localStorage.getItem('heavenly_studio_theme_v1') === 'light'
        ? 'light'
        : 'dark';
    return {
      ...DEFAULT_AVATAR_SETTINGS,
      bgColor: DEFAULT_STAGE_BG_BY_THEME[savedTheme]
    };
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', studioTheme);
    try {
      window.localStorage.setItem('heavenly_studio_theme_v1', studioTheme);
    } catch {
      // ignore storage quota errors
    }
  }, [studioTheme]);

  const handleSetTheme = useCallback((next: StudioTheme) => {
    setStudioTheme((prev) => {
      if (prev === next) return prev;
      setAvatarSettings((curr) => {
        const prevDefault = DEFAULT_STAGE_BG_BY_THEME[prev].toLowerCase();
        if (curr.bgColor.toLowerCase() === prevDefault) {
          return { ...curr, bgColor: DEFAULT_STAGE_BG_BY_THEME[next] };
        }
        return curr;
      });
      return next;
    });
  }, []);

  const handleToggleTheme = useCallback(() => {
    handleSetTheme(studioTheme === 'dark' ? 'light' : 'dark');
  }, [studioTheme, handleSetTheme]);

  // UV Coordinates (with automatic migration from legacy uv_armor_*_v5 keys)
  const [shirtIslands, setShirtIslands] = useState<UvIsland[]>(
    () => loadOrMigrateUvIslands('shirt').islands
  );
  const [pantsIslands, setPantsIslands] = useState<UvIsland[]>(
    () => loadOrMigrateUvIslands('pants').islands
  );
  const [uvCalibrationEnabled, setUvCalibrationEnabled] = useState<boolean>(false);
  const [activeUvSection, setActiveUvSection] = useState<UvSectionId>('torso');
  const [uvEditScope, setUvEditScope] = useState<'section' | 'single'>('section');
  const [activeUvIslandName, setActiveUvIslandName] = useState<string | null>(null);
  const [uvNudgeStep, setUvNudgeStep] = useState<number>(1);

  // Modals & Popovers
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showProjectsModal, setShowProjectsModal] = useState<boolean>(false);
  const [showUvJsonModal, setShowUvJsonModal] = useState<boolean>(false);
  const [showShowcaseModal, setShowShowcaseModal] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [samplesMenuOpen, setSamplesMenuOpen] = useState<boolean>(false);
  const [dragOverActive, setDragOverActive] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const spec = getTemplateSpec(templateType);
  const activeIslands = useMemo(
    () => (templateType === 'pants' ? pantsIslands : shirtIslands),
    [templateType, pantsIslands, shirtIslands]
  );

  // Smart Color Picker: extract 5 perceptually distinct dominant colors from the active 2D canvas
  const suggestedCanvasColors = useMemo<string[]>(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot || !hasImage) return [];
    const mask = spec.hasUvIslands
      ? getUvMask(activeIslands, slot.mainCanvas.width, slot.mainCanvas.height, bleedMargin)
      : null;
    return extractDominantPaletteFromCanvas(slot.mainCanvas, mask, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, templateType, spec.hasUvIslands, activeIslands, bleedMargin, updateTrigger, paletteRefreshTick]);

  const handleRefreshSuggestedColors = useCallback(() => {
    setPaletteRefreshTick((t) => t + 1);
  }, []);

  // Multi-garment input passed to 3D viewport (layers Shirt + Pants + T-Shirt simultaneously,
  // AND live-composites any active Floating Decal Layer onto the active slot before baking!)
  const garments3DInput = useMemo<MultiGarmentInput>(() => {
    const slots = slotsRef.current;
    let activeWorkingOverride: HTMLCanvasElement | null = null;

    if (
      slots &&
      floatingDecal &&
      decalCustomImage &&
      slotMeta[templateType].hasImage &&
      typeof document !== 'undefined'
    ) {
      const base = slots[templateType].mainCanvas;
      let preview = floatingPreviewCanvasRef.current;
      if (!preview || preview.width !== base.width || preview.height !== base.height) {
        preview = createOffscreenCanvas(base.width, base.height);
        floatingPreviewCanvasRef.current = preview;
      }
      const pCtx = preview.getContext('2d');
      if (pCtx) {
        pCtx.clearRect(0, 0, preview.width, preview.height);
        pCtx.drawImage(base, 0, 0);
        const clipIslands =
          clipToUv && spec.hasUvIslands
            ? templateType === 'pants'
              ? pantsIslands
              : shirtIslands
            : undefined;
        const stampCfg: DecalStampConfig = {
          activePresetId: null,
          customImageUrl: decalConfig.customImageUrl,
          customName: floatingDecal.name,
          size: floatingDecal.size,
          rotationDeg: floatingDecal.rotationDeg,
          opacity: floatingDecal.opacity
        };
        drawDecalStamp(pCtx, floatingDecal.x, floatingDecal.y, stampCfg, decalCustomImage, clipIslands);
        if (symmetryEnabled) {
          const mirrored = computeMirrorCanvasPoint(
            floatingDecal.x,
            floatingDecal.y,
            spec.hasUvIslands ? (templateType === 'pants' ? pantsIslands : shirtIslands) : [],
            base.width,
            base.height
          );
          if (mirrored) {
            drawDecalStamp(
              pCtx,
              mirrored.x,
              mirrored.y,
              { ...stampCfg, rotationDeg: -stampCfg.rotationDeg },
              decalCustomImage,
              clipIslands
            );
          }
        }
        activeWorkingOverride = preview;
      }
    }

    return {
      shirt: {
        workingCanvas:
          templateType === 'shirt' && activeWorkingOverride
            ? activeWorkingOverride
            : slots?.shirt.mainCanvas ?? null,
        originalCanvas: slots?.shirt.originalCanvas ?? null,
        hasImage: slotMeta.shirt.hasImage
      },
      pants: {
        workingCanvas:
          templateType === 'pants' && activeWorkingOverride
            ? activeWorkingOverride
            : slots?.pants.mainCanvas ?? null,
        originalCanvas: slots?.pants.originalCanvas ?? null,
        hasImage: slotMeta.pants.hasImage
      },
      tshirt: {
        workingCanvas:
          templateType === 'tshirt' && activeWorkingOverride
            ? activeWorkingOverride
            : slots?.tshirt.mainCanvas ?? null,
        originalCanvas: slots?.tshirt.originalCanvas ?? null,
        hasImage: slotMeta.tshirt.hasImage
      },
      shirtIslands,
      pantsIslands
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slotMeta.shirt.hasImage,
    slotMeta.pants.hasImage,
    slotMeta.tshirt.hasImage,
    shirtIslands,
    pantsIslands,
    updateTrigger,
    floatingDecal,
    decalCustomImage,
    decalConfig.customImageUrl,
    templateType,
    clipToUv,
    symmetryEnabled,
    spec.hasUvIslands
  ]);

  // Cut-gated 3D Compare: only available when at least one visible worn garment has been cut/stripped/erased
  const canCompare3D =
    (slotMeta.shirt.hasImage && slotMeta.shirt.hasCutAction && avatarSettings.layerVisibility.shirt) ||
    (slotMeta.pants.hasImage && slotMeta.pants.hasCutAction && avatarSettings.layerVisibility.pants) ||
    (slotMeta.tshirt.hasImage && slotMeta.tshirt.hasCutAction && avatarSettings.layerVisibility.tshirt);

  const updateSlotMeta = useCallback(
    (type: TemplateType, patch: Partial<GarmentSlotMeta>) => {
      setSlotMeta((prev) => ({
        ...prev,
        [type]: { ...prev[type], ...patch }
      }));
    },
    []
  );

  const pushToast = useCallback(
    (text: string, type: ToastNotice['type'] = 'info') => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3400);
    },
    []
  );

  // Persist custom UV islands
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_SHIRT_UV_KEY, JSON.stringify(shirtIslands));
    } catch {
      // Ignore
    }
  }, [shirtIslands]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PANTS_UV_KEY, JSON.stringify(pantsIslands));
    } catch {
      // Ignore
    }
  }, [pantsIslands]);

  // Responsive viewport detection
  useEffect(() => {
    const onResize = () => {
      const canSplit = window.innerWidth >= 1024;
      const isXl = window.innerWidth >= 1280;
      setIsDesktopSplitCapable(canSplit);
      setIsXlDesktop(isXl);
      if (!canSplit) {
        setViewMode((prev) => (prev === 'split' ? '2d' : prev));
      }
      if (!isXl) {
        setInspectorOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (anySlotDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anySlotDirty]);

  const syncHistoryFlags = useCallback(
    (targetType: TemplateType = templateType) => {
      const hist = slotsRef.current?.[targetType].history;
      setCanUndo(hist ? hist.canUndo() : false);
      setCanRedo(hist ? hist.canRedo() : false);
    },
    [templateType]
  );

  useEffect(() => {
    syncHistoryFlags(templateType);
  }, [templateType, syncHistoryFlags]);

  const captureHistorySnapshot = useCallback(
    (targetType: TemplateType, resetStack: boolean = false, label: string = 'Edit') => {
      const slot = slotsRef.current?.[targetType];
      if (!slot) return;
      const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const snap = ctx.getImageData(0, 0, slot.mainCanvas.width, slot.mainCanvas.height);
      const entry: CanvasHistoryEntry = {
        imageData: snap,
        label,
        timestamp: Date.now(),
        thumbDataUrl: createCanvasThumbnail(slot.mainCanvas)
      };
      if (resetStack) {
        slot.history.reset(entry);
      } else {
        slot.history.push(entry);
      }
      if (targetType === templateType) {
        syncHistoryFlags(targetType);
      }
    },
    [templateType, syncHistoryFlags]
  );

  const historyTimelineState = useMemo<{
    items: HistoryTimelineItem[];
    currentIndex: number;
  }>(() => {
    const hist = slotsRef.current?.[templateType].history;
    if (!hist) return { items: [], currentIndex: -1 };
    const entries = hist.entries();
    return {
      items: entries.map((e, idx) => ({
        index: idx,
        label: e.label,
        timestamp: e.timestamp,
        thumbDataUrl: e.thumbDataUrl
      })),
      currentIndex: hist.pointer()
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateType, updateTrigger]);

  // Live Preflight report for currently active slot
  const preflight = useMemo<PreflightReport | null>(() => {
    const main = slotsRef.current?.[templateType].mainCanvas;
    if (!hasImage || !main) return null;
    return analyzePreflight(
      main,
      templateType,
      activeMeta.sourceFileName || `${activeMeta.projectName}.png`,
      activeMeta.sourceFileSize,
      activeIslands,
      bleedMargin
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasImage,
    templateType,
    activeMeta.sourceFileName,
    activeMeta.projectName,
    activeMeta.sourceFileSize,
    activeIslands,
    bleedMargin,
    updateTrigger
  ]);

  const loadedSlotCount = useMemo(
    () =>
      (['shirt', 'pants', 'tshirt'] as TemplateType[]).filter((t) => slotMeta[t].hasImage).length,
    [slotMeta]
  );

  // Ready-to-upload Multi-Slot Outfit ZIP Pack entries (gated strictly to ExportModal so zero pixel scans run while painting!)
  const buildOutfitSlotsForZip = useCallback((): OutfitZipSlotEntry[] => {
    const slots = slotsRef.current;
    if (!slots) return [];
    const entries: OutfitZipSlotEntry[] = [];
    (['shirt', 'pants', 'tshirt'] as TemplateType[]).forEach((t) => {
      if (!slotMeta[t].hasImage) return;
      const canvas = slots[t].mainCanvas;
      const islandsForSlot = t === 'pants' ? pantsIslands : shirtIslands;
      const report = analyzePreflight(
        canvas,
        t,
        slotMeta[t].sourceFileName || `${slotMeta[t].projectName}.png`,
        slotMeta[t].sourceFileSize,
        islandsForSlot,
        bleedMargin
      );
      entries.push({
        type: t,
        canvas,
        islands: islandsForSlot,
        bleedMargin,
        preflight: report,
        name: slotMeta[t].projectName,
        customBackground: slotMeta[t].customBackground,
        customBgImage: customBgImagesRef.current[t]
      });
    });
    return entries;
  }, [slotMeta, shirtIslands, pantsIslands, bleedMargin]);

  const outfitSlotsForZip = useMemo<OutfitZipSlotEntry[]>(() => {
    if (!showExportModal) return [];
    return buildOutfitSlotsForZip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExportModal, buildOutfitSlotsForZip, updateTrigger]);

  const handleUpdateLoupeSettings = useCallback((patch: Partial<LoupeSettings>) => {
    setLoupeSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSampleColor = useCallback(
    (hex: string, switchToPaint: boolean = false) => {
      const norm = hex.toUpperCase();
      setPaintColor(norm);
      setRecentColors((prev) => [norm, ...prev.filter((c) => c.toUpperCase() !== norm)].slice(0, 6));
      if (switchToPaint) {
        setToolMode('paint');
      }
      pushToast(`Sampled ${norm}`, 'info');
    },
    [pushToast]
  );

  const handleUpdateDecalConfig = useCallback((patch: Partial<DecalStampConfig>) => {
    setDecalConfig((prev) => ({ ...prev, ...patch }));
    setFloatingDecal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        size: patch.size ?? prev.size,
        rotationDeg: patch.rotationDeg ?? prev.rotationDeg,
        opacity: patch.opacity ?? prev.opacity
      };
    });
  }, []);

  const handleUploadDecalFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        pushToast('Please choose a PNG, WebP, or JPG decal image.', 'error');
        return;
      }
      const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 28) || 'Custom Decal';
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : null;
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          setDecalCustomImage(img);
          setDecalConfig((prev) => ({
            ...prev,
            activePresetId: null,
            customImageUrl: dataUrl,
            customName: cleanName
          }));
          setToolMode('stamp');
          pushToast(`Loaded "${cleanName}". Click the canvas to stamp or save as preset.`, 'success');
        };
        img.onerror = () => {
          pushToast('Could not decode decal image.', 'error');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [pushToast]
  );

  const handleSaveDecalPreset = useCallback(
    async (presetName: string) => {
      if (!decalConfig.customImageUrl || !decalCustomImage) return;
      const now = Date.now();
      const id =
        decalConfig.activePresetId || `decal_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const preset: SavedDecalPreset = {
        id,
        name: presetName.trim() || 'Custom Decal',
        dataUrl: decalConfig.customImageUrl,
        width: decalCustomImage.naturalWidth,
        height: decalCustomImage.naturalHeight,
        createdAt: now
      };
      await saveDecalPreset(preset);
      const updated = await listDecalPresets();
      setDecalPresets(updated);
      setDecalConfig((prev) => ({ ...prev, activePresetId: id, customName: preset.name }));
      pushToast(`Saved "${preset.name}" to your Custom PNG Decals library.`, 'success');
    },
    [decalConfig.customImageUrl, decalConfig.activePresetId, decalCustomImage, pushToast]
  );

  const handleSelectDecalPreset = useCallback(
    (preset: SavedDecalPreset) => {
      const img = new Image();
      img.onload = () => {
        setDecalCustomImage(img);
        setDecalConfig((prev) => ({
          ...prev,
          activePresetId: preset.id,
          customImageUrl: preset.dataUrl,
          customName: preset.name
        }));
        setToolMode('stamp');
        pushToast(`Equipped "${preset.name}" decal.`, 'info');
      };
      img.src = preset.dataUrl;
    },
    [pushToast]
  );

  const handleDeleteDecalPreset = useCallback(
    async (id: string) => {
      await deleteDecalPreset(id);
      setDecalPresets((prev) => prev.filter((p) => p.id !== id));
      setDecalConfig((prev) =>
        prev.activePresetId === id ? { ...prev, activePresetId: null } : prev
      );
      pushToast('Removed decal preset.', 'info');
    },
    [pushToast]
  );

  // Debounced auto-draft backup into IndexedDB for active slot
  useEffect(() => {
    if (!hasImage || !isDirty) return;
    const timer = window.setTimeout(async () => {
      const slot = slotsRef.current?.[templateType];
      if (!slot) return;
      try {
        const [workingBlob, originalBlob] = await Promise.all([
          canvasToPngBlob(slot.mainCanvas),
          canvasToPngBlob(slot.originalCanvas)
        ]);
        await saveAutoDraft({
          name: projectName,
          templateType,
          originalBlob,
          workingBlob,
          transform,
          customShirtIslands: shirtIslands,
          customPantsIslands: pantsIslands,
          avatarSettings,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } catch {
        // Silent background draft
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [
    hasImage,
    isDirty,
    updateTrigger,
    projectName,
    templateType,
    transform,
    shirtIslands,
    pantsIslands,
    avatarSettings
  ]);

  // Custom Stripped Background handlers
  const handleUpdateCustomBackground = useCallback(
    (patch: Partial<CustomBackgroundConfig>) => {
      setSlotMeta((prev) => ({
        ...prev,
        [templateType]: {
          ...prev[templateType],
          customBackground: { ...prev[templateType].customBackground, ...patch }
        }
      }));
      setUpdateTrigger((n) => n + 1);
    },
    [templateType]
  );

  const handleUploadCustomBgFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        pushToast('Please choose a PNG, JPG, or WebP background image.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : null;
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          customBgImagesRef.current[templateType] = img;
          setSlotMeta((prev) => ({
            ...prev,
            [templateType]: {
              ...prev[templateType],
              customBackground: {
                ...prev[templateType].customBackground,
                mode: 'image',
                imageDataUrl: dataUrl
              }
            }
          }));
          setUpdateTrigger((n) => n + 1);
          pushToast('Loaded custom stripped background image.', 'success');
        };
        img.onerror = () => {
          pushToast('Could not decode the chosen background image.', 'error');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [templateType, pushToast]
  );

  // Commit a conformed/verified canvas into the chosen garment slot (NEVER wipes other slots!)
  const commitLoadedCanvas = useCallback(
    (
      sourceCanvas: HTMLCanvasElement,
      targetType: TemplateType,
      name: string,
      fileName: string,
      fileSize: number,
      loadedProjectId: string | null = null,
      historyLabel: string = 'Imported Template'
    ) => {
      const slot = slotsRef.current?.[targetType];
      if (!slot) return;
      const targetSpec = getTemplateSpec(targetType);

      const mCtx = slot.mainCanvas.getContext('2d', { willReadFrequently: true })!;
      const oCtx = slot.originalCanvas.getContext('2d', { willReadFrequently: true })!;

      mCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);
      oCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);
      mCtx.drawImage(sourceCanvas, 0, 0, targetSpec.width, targetSpec.height);
      oCtx.drawImage(sourceCanvas, 0, 0, targetSpec.width, targetSpec.height);

      setAvatarSettings((prev) => ({
        ...prev,
        layerVisibility: { ...prev.layerVisibility, [targetType]: true }
      }));

      setFloatingDecal(null);
      setTemplateType(targetType);
      updateSlotMeta(targetType, {
        hasImage: true,
        hasCutAction: false,
        projectId: loadedProjectId,
        projectName: name,
        sourceFileName: fileName,
        sourceFileSize: fileSize,
        transform: { ...DEFAULT_IMAGE_TRANSFORM },
        isDirty: true
      });
      setShowCompare(false);
      captureHistorySnapshot(targetType, true, historyLabel);
      syncHistoryFlags(targetType);
      setUpdateTrigger((n) => n + 1);
    },
    [updateSlotMeta, captureHistorySnapshot, syncHistoryFlags]
  );

  const ingestImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        pushToast('Please import a valid PNG, WebP, or JPG image file.', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const currentSpec = getTemplateSpec(templateType);
        const cleanBaseName = file.name.replace(/\.[^/.]+$/, '') || 'Imported Garment';

        if (img.naturalWidth === currentSpec.width && img.naturalHeight === currentSpec.height) {
          const exactCanvas = resampleToTarget(
            img,
            img.naturalWidth,
            img.naturalHeight,
            currentSpec.width,
            currentSpec.height,
            'scale'
          );
          commitLoadedCanvas(exactCanvas, templateType, cleanBaseName, file.name, file.size);
          pushToast(`Loaded ${file.name} into ${currentSpec.label} slot.`, 'success');
        } else {
          setPendingImport({ image: img, fileName: file.name, fileSize: file.size });
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        pushToast('Could not decode the selected image file.', 'error');
      };
      img.src = url;
    },
    [templateType, commitLoadedCanvas, pushToast]
  );

  const handleConfirmImportConform = (mode: ConformMode) => {
    if (!pendingImport) return;
    const currentSpec = getTemplateSpec(templateType);
    const conformed = resampleToTarget(
      pendingImport.image,
      pendingImport.image.naturalWidth,
      pendingImport.image.naturalHeight,
      currentSpec.width,
      currentSpec.height,
      mode
    );
    const cleanBaseName = pendingImport.fileName.replace(/\.[^/.]+$/, '') || 'Imported Garment';
    commitLoadedCanvas(
      conformed,
      templateType,
      cleanBaseName,
      pendingImport.fileName,
      pendingImport.fileSize
    );
    setPendingImport(null);
    pushToast(
      `Imported into ${currentSpec.label} (${currentSpec.width} × ${currentSpec.height} px).`,
      'success'
    );
  };

  const handleLoadSample = useCallback(
    (sample: SampleTemplateSpec) => {
      setSamplesMenuOpen(false);
      const canvas = sample.renderToCanvas();
      commitLoadedCanvas(
        canvas,
        sample.type,
        sample.name,
        `${sample.id}.png`,
        0,
        null,
        `Loaded ${sample.name}`
      );
      pushToast(`Loaded ${sample.name} into ${getTemplateSpec(sample.type).label} slot.`, 'info');
    },
    [commitLoadedCanvas, pushToast]
  );

  const handleLoadDefaultSampleForCurrentType = useCallback(() => {
    const match = SAMPLE_TEMPLATES.find((s) => s.type === templateType) || SAMPLE_TEMPLATES[0];
    handleLoadSample(match);
  }, [templateType, handleLoadSample]);

  // Non-destructive Slot Switcher: switching between Shirt, Pants & T-Shirt preserves EVERY slot!
  const handleChangeTemplateType = (nextType: TemplateType) => {
    if (nextType === templateType) return;
    setFloatingDecal(null);
    setTemplateType(nextType);
    setUvCalibrationEnabled(false);
    setActiveUvIslandName(null);
    setHighlightedRegion(null);
    setShowCompare(false);
    if (!slotMeta[nextType].hasImage) {
      setPaint3DEnabled(false);
    }
    syncHistoryFlags(nextType);
    setUpdateTrigger((n) => n + 1);
  };

  // Explicit Clear Current Slot action
  const handleClearCurrentSlot = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot) return;
    const mCtx = slot.mainCanvas.getContext('2d');
    const oCtx = slot.originalCanvas.getContext('2d');
    mCtx?.clearRect(0, 0, slot.mainCanvas.width, slot.mainCanvas.height);
    oCtx?.clearRect(0, 0, slot.originalCanvas.width, slot.originalCanvas.height);
    slot.history.reset();
    customBgImagesRef.current[templateType] = null;
    setFloatingDecal(null);
    setPaint3DEnabled(false);
    updateSlotMeta(templateType, createInitialSlotMeta(templateType));
    setShowCompare(false);
    syncHistoryFlags(templateType);
    setUpdateTrigger((n) => n + 1);
    pushToast(`Cleared ${spec.label} slot.`, 'info');
  }, [templateType, spec.label, updateSlotMeta, syncHistoryFlags, pushToast]);

  const handleRegisterFastRefresh3D = useCallback(
    (fn: ((regions: ReadonlySet<BodyRegionGroup> | 'all') => void) | null) => {
      fastRefresh3DRef.current = fn;
    },
    []
  );

  const handleRegisterRepaint2D = useCallback((fn: (() => void) | null) => {
    repaint2DRef.current = fn;
  }, []);

  const handleLiveCanvasMutated = useCallback(
    (regions: ReadonlySet<BodyRegionGroup> | 'all') => {
      fastRefresh3DRef.current?.(regions);
    },
    []
  );

  // Canvas mutation callback from 2D Editor viewport & 3D Direct Paint
  const handleCanvasMutated = useCallback(
    (commitHistory: boolean, isCutAction: boolean = false, actionLabel: string = 'Edit') => {
      if (commitHistory) {
        captureHistorySnapshot(templateType, false, actionLabel);
      }
      setSlotMeta((prev) => ({
        ...prev,
        [templateType]: {
          ...prev[templateType],
          isDirty: true,
          hasCutAction: prev[templateType].hasCutAction || isCutAction
        }
      }));
      setUpdateTrigger((n) => n + 1);
    },
    [templateType, captureHistorySnapshot]
  );

  // Commit / Cancel Floating Decal Layer (bakes onto mainCanvas with Clip UV + Mirror!)
  const handleCommitFloatingDecal = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot || !floatingDecal || !decalCustomImage || !hasImage) return;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const clipIslands = clipToUv && spec.hasUvIslands ? activeIslands : undefined;
    const stampCfg: DecalStampConfig = {
      activePresetId: decalConfig.activePresetId,
      customImageUrl: decalConfig.customImageUrl,
      customName: floatingDecal.name,
      size: floatingDecal.size,
      rotationDeg: floatingDecal.rotationDeg,
      opacity: floatingDecal.opacity
    };

    drawDecalStamp(ctx, floatingDecal.x, floatingDecal.y, stampCfg, decalCustomImage, clipIslands);

    if (symmetryEnabled) {
      const mirrored = computeMirrorCanvasPoint(
        floatingDecal.x,
        floatingDecal.y,
        spec.hasUvIslands ? activeIslands : [],
        slot.mainCanvas.width,
        slot.mainCanvas.height
      );
      if (mirrored) {
        drawDecalStamp(
          ctx,
          mirrored.x,
          mirrored.y,
          { ...stampCfg, rotationDeg: -stampCfg.rotationDeg },
          decalCustomImage,
          clipIslands
        );
      }
    }

    const label = `Stamp ${floatingDecal.name || 'Decal'}`;
    setFloatingDecal(null);
    handleCanvasMutated(true, false, label);
    pushToast(`Applied "${floatingDecal.name || 'Decal'}" to canvas.`, 'success');
  }, [
    templateType,
    floatingDecal,
    decalCustomImage,
    hasImage,
    clipToUv,
    spec.hasUvIslands,
    activeIslands,
    decalConfig.activePresetId,
    decalConfig.customImageUrl,
    symmetryEnabled,
    handleCanvasMutated,
    pushToast
  ]);

  const handleCancelFloatingDecal = useCallback(() => {
    setFloatingDecal(null);
  }, []);

  // Direct 3D-to-2D Avatar Raycast Painting (supports Clip UV, Seam Bridge, L↔R Mirror & touch pinch cancel rollback!)
  const handlePaint3DStroke = useCallback(
    (
      phase: 'start' | 'move' | 'end' | 'cancel',
      hit: { x: number; y: number; bodyRegion: BodyRegionGroup } | null
    ) => {
      const slot = slotsRef.current?.[templateType];
      if (!slot || !hasImage) return;

      if (phase === 'cancel') {
        last3DPaintPtRef.current = null;
        paint3DStrokeDirtyRef.current = false;
        if (paint3DPreStrokeSnapshotRef.current) {
          const rollbackCtx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
          rollbackCtx?.putImageData(paint3DPreStrokeSnapshotRef.current, 0, 0);
          paint3DPreStrokeSnapshotRef.current = null;
          fastRefresh3DRef.current?.('all');
          repaint2DRef.current?.();
        }
        return;
      }

      if (phase === 'end') {
        last3DPaintPtRef.current = null;
        paint3DPreStrokeSnapshotRef.current = null;
        if (paint3DStrokeDirtyRef.current) {
          paint3DStrokeDirtyRef.current = false;
          handleCanvasMutated(
            true,
            paint3DMode === 'erase',
            paint3DMode === 'erase' ? '3D Erase Stroke' : '3D Paint Stroke'
          );
        }
        return;
      }

      if (!hit) {
        last3DPaintPtRef.current = null;
        return;
      }

      const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      if (phase === 'start') {
        paint3DPreStrokeSnapshotRef.current = ctx.getImageData(
          0,
          0,
          slot.mainCanvas.width,
          slot.mainCanvas.height
        );
      }

      const prevPt = phase === 'start' ? null : last3DPaintPtRef.current;
      // Avoid accidental streak lines if raycast jumps across disjoint UV islands
      const fromPt =
        prevPt && Math.hypot(hit.x - prevPt.x, hit.y - prevPt.y) <= 44 ? prevPt : hit;
      last3DPaintPtRef.current = { x: hit.x, y: hit.y };
      paint3DStrokeDirtyRef.current = true;

      const radius = brushSize / 2;
      const clipIslands = clipToUv && spec.hasUvIslands ? activeIslands : undefined;

      const strokeSegment = (fx: number, fy: number, tx: number, ty: number) => {
        if (paint3DMode === 'paint') {
          applyPaintStroke(
            ctx,
            fx,
            fy,
            tx,
            ty,
            radius,
            paintColor,
            brushHardness,
            paintOpacity,
            clipIslands
          );
        } else {
          ctx.save();
          if (clipIslands && clipIslands.length > 0) {
            ctx.beginPath();
            for (const isl of clipIslands) {
              ctx.rect(isl.x, isl.y, isl.w, isl.h);
            }
            ctx.clip();
          }
          applyBrushStroke(ctx, 'erase', fx, fy, tx, ty, radius, brushHardness, slot.originalCanvas);
          ctx.restore();
        }
      };

      const applyWithSeam = (fx: number, fy: number, tx: number, ty: number) => {
        strokeSegment(fx, fy, tx, ty);
        if (seamBridgeEnabled && spec.hasUvIslands) {
          const wraps = computeSeamWrappedPoints(
            tx,
            ty,
            radius,
            activeIslands,
            slot.mainCanvas.width,
            slot.mainCanvas.height
          );
          for (const w of wraps) {
            strokeSegment(w.x, w.y, w.x, w.y);
          }
        }
      };

      const dirtyRegions = new Set<BodyRegionGroup>([hit.bodyRegion]);

      applyWithSeam(fromPt.x, fromPt.y, hit.x, hit.y);

      if (symmetryEnabled) {
        const mFrom = computeMirrorCanvasPoint(
          fromPt.x,
          fromPt.y,
          spec.hasUvIslands ? activeIslands : [],
          slot.mainCanvas.width,
          slot.mainCanvas.height
        );
        const mTo = computeMirrorCanvasPoint(
          hit.x,
          hit.y,
          spec.hasUvIslands ? activeIslands : [],
          slot.mainCanvas.width,
          slot.mainCanvas.height
        );
        if (mTo) {
          if (mTo.island) dirtyRegions.add(mTo.island.group);
          const startM =
            mFrom && Math.hypot(mTo.x - mFrom.x, mTo.y - mFrom.y) <= 44 ? mFrom : mTo;
          applyWithSeam(startM.x, startM.y, mTo.x, mTo.y);
        }
      }

      // Zero-re-render imperative fast path: updates ONLY the touched 3D atlas + 2D display canvas at 60-120fps!
      fastRefresh3DRef.current?.(spec.hasUvIslands ? dirtyRegions : 'all');
      repaint2DRef.current?.();
    },
    [
      templateType,
      hasImage,
      paint3DMode,
      brushSize,
      brushHardness,
      paintColor,
      paintOpacity,
      clipToUv,
      seamBridgeEnabled,
      symmetryEnabled,
      spec.hasUvIslands,
      activeIslands,
      handleCanvasMutated
    ]
  );

  // Undo / Redo / Timeline Jump (scoped cleanly to active garment slot)
  const handleUndo = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot) return;
    const entry = slot.history.undo();
    if (!entry) return;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(entry.imageData, 0, 0);
    syncHistoryFlags(templateType);
    updateSlotMeta(templateType, { isDirty: true });
    setUpdateTrigger((n) => n + 1);
  }, [templateType, syncHistoryFlags, updateSlotMeta]);

  const handleRedo = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot) return;
    const entry = slot.history.redo();
    if (!entry) return;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(entry.imageData, 0, 0);
    syncHistoryFlags(templateType);
    updateSlotMeta(templateType, { isDirty: true });
    setUpdateTrigger((n) => n + 1);
  }, [templateType, syncHistoryFlags, updateSlotMeta]);

  const handleJumpToHistory = useCallback(
    (targetIndex: number) => {
      const slot = slotsRef.current?.[templateType];
      if (!slot) return;
      const entry = slot.history.jumpTo(targetIndex);
      if (!entry) return;
      const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.putImageData(entry.imageData, 0, 0);
      syncHistoryFlags(templateType);
      updateSlotMeta(templateType, { isDirty: true });
      setUpdateTrigger((n) => n + 1);
    },
    [templateType, syncHistoryFlags, updateSlotMeta]
  );

  // Auto-Clean outside UV islands (enables Cut-Gated Compare buttons!)
  const handleAutoCleanSync = useCallback((): PreflightReport | null => {
    const slot = slotsRef.current?.[templateType];
    if (!slot || !hasImage || !spec.hasUvIslands) return null;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const res = autoStripNonUvPixels(ctx, activeIslands, bleedMargin);
    captureHistorySnapshot(templateType, false, 'Auto-Clean UV');
    updateSlotMeta(templateType, { isDirty: true, hasCutAction: true });
    setUpdateTrigger((n) => n + 1);

    if (res.dirtyPixelsStripped > 0) {
      pushToast(
        `Stripped ${res.dirtyPixelsStripped.toLocaleString()} pixels outside UV islands.`,
        'success'
      );
    } else {
      pushToast('Template is already clean outside UV islands.', 'info');
    }

    return analyzePreflight(
      slot.mainCanvas,
      templateType,
      activeMeta.sourceFileName || `${projectName}.png`,
      activeMeta.sourceFileSize,
      activeIslands,
      bleedMargin
    );
  }, [
    templateType,
    hasImage,
    spec.hasUvIslands,
    activeIslands,
    bleedMargin,
    captureHistorySnapshot,
    updateSlotMeta,
    activeMeta.sourceFileName,
    activeMeta.sourceFileSize,
    projectName,
    pushToast
  ]);

  // Defringe Semi-Transparent Alpha Halo Edges (Polisher tool for crisp collars, sleeves, hems & graphics)
  const handleDefringeAlpha = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot || !hasImage) return;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const islandsForDefringe = spec.hasUvIslands ? activeIslands : [];
    const res = defringeUvEdges(ctx, islandsForDefringe, bleedMargin);
    if (res.totalAdjusted === 0) {
      pushToast('Edges are already crisp — no semi-transparent halo pixels found.', 'info');
      return;
    }

    captureHistorySnapshot(templateType, false, 'Defringe Alpha Edges');
    updateSlotMeta(templateType, {
      isDirty: true,
      hasCutAction: slotMeta[templateType].hasCutAction || res.fringePixelsCleared > 0
    });
    setUpdateTrigger((n) => n + 1);
    pushToast(
      `Polished edges: cleared ${res.fringePixelsCleared.toLocaleString()} halo px & crisped ${res.edgePixelsCrisped.toLocaleString()} seam px.`,
      'success'
    );
  }, [
    templateType,
    hasImage,
    spec.hasUvIslands,
    activeIslands,
    bleedMargin,
    captureHistorySnapshot,
    updateSlotMeta,
    slotMeta,
    pushToast
  ]);

  // Batch Auto-Clean across ALL loaded UV slots before Multi-Slot ZIP Pack download
  const handleCleanAllSlotsSync = useCallback((): OutfitZipSlotEntry[] => {
    const slots = slotsRef.current;
    if (!slots) return [];
    let cleanedSlots = 0;
    const patchMap: Partial<Record<TemplateType, Partial<GarmentSlotMeta>>> = {};

    (['shirt', 'pants'] as TemplateType[]).forEach((t) => {
      if (!slotMeta[t].hasImage) return;
      const canvas = slots[t].mainCanvas;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const islandsForSlot = t === 'pants' ? pantsIslands : shirtIslands;
      const res = autoStripNonUvPixels(ctx, islandsForSlot, bleedMargin);
      if (res.dirtyPixelsStripped > 0) {
        cleanedSlots++;
        captureHistorySnapshot(t, false, 'Auto-Clean UV');
        patchMap[t] = { isDirty: true, hasCutAction: true };
      }
    });

    if (cleanedSlots > 0) {
      setSlotMeta((prev) => ({
        shirt: patchMap.shirt ? { ...prev.shirt, ...patchMap.shirt } : prev.shirt,
        pants: patchMap.pants ? { ...prev.pants, ...patchMap.pants } : prev.pants,
        tshirt: prev.tshirt
      }));
      setUpdateTrigger((n) => n + 1);
    }

    return buildOutfitSlotsForZip();
  }, [
    slotMeta,
    pantsIslands,
    shirtIslands,
    bleedMargin,
    captureHistorySnapshot,
    buildOutfitSlotsForZip
  ]);

  // Non-destructive Transform preview from slot's pristine original
  const handleUpdateTransform = useCallback(
    (next: ImageTransform) => {
      updateSlotMeta(templateType, { transform: next, isDirty: true });
      const slot = slotsRef.current?.[templateType];
      if (!slot || !hasImage) return;
      const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      renderTransformedSource(ctx, slot.originalCanvas, next);
      setUpdateTrigger((n) => n + 1);
    },
    [templateType, hasImage, updateSlotMeta]
  );

  const handleBakeTransform = useCallback(() => {
    captureHistorySnapshot(templateType, false, 'Move / Scale');
    updateSlotMeta(templateType, { transform: { ...DEFAULT_IMAGE_TRANSFORM } });
    pushToast('Committed placement transform to undo history.', 'success');
  }, [templateType, captureHistorySnapshot, updateSlotMeta, pushToast]);

  const handleResetToOriginal = useCallback(() => {
    const slot = slotsRef.current?.[templateType];
    if (!slot || !hasImage) return;
    const ctx = slot.mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, slot.mainCanvas.width, slot.mainCanvas.height);
    ctx.drawImage(slot.originalCanvas, 0, 0);
    setFloatingDecal(null);
    updateSlotMeta(templateType, {
      transform: { ...DEFAULT_IMAGE_TRANSFORM },
      isDirty: true,
      hasCutAction: false
    });
    setShowCompare(false);
    captureHistorySnapshot(templateType, false, 'Restored Original');
    setUpdateTrigger((n) => n + 1);
    pushToast('Restored working canvas from pristine original.', 'info');
  }, [templateType, hasImage, updateSlotMeta, captureHistorySnapshot, pushToast]);

  const handleUpdateAvatarSettings = useCallback((patch: Partial<AvatarPreviewSettings>) => {
    setAvatarSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // Advanced UV Calibration helpers
  const updateActiveIslands = useCallback(
    (updater: (prev: UvIsland[]) => UvIsland[]) => {
      if (templateType === 'pants') setPantsIslands(updater);
      else if (templateType === 'shirt') setShirtIslands(updater);
    },
    [templateType]
  );

  const uvTargetPredicate = useCallback(
    (isl: UvIsland) => {
      if (uvEditScope === 'single' && activeUvIslandName) {
        return isl.name === activeUvIslandName;
      }
      if (activeUvSection === 'torso') return isl.group === 'torso';
      if (activeUvSection === 'right_limb') {
        return isl.group === 'right_arm' || isl.group === 'right_leg';
      }
      return isl.group === 'left_arm' || isl.group === 'left_leg';
    },
    [uvEditScope, activeUvIslandName, activeUvSection]
  );

  const handleNudgeUv = useCallback(
    (dx: number, dy: number) => {
      if (!uvCalibrationEnabled || !spec.hasUvIslands) return;
      updateActiveIslands((prev) => nudgeUvIslands(prev, uvTargetPredicate, dx, dy));
    },
    [uvCalibrationEnabled, spec.hasUvIslands, updateActiveIslands, uvTargetPredicate]
  );

  const handleExtendUv = useCallback(
    (edge: 'left' | 'right' | 'top' | 'bottom' | 'bleed', amount: number) => {
      if (!uvCalibrationEnabled || !spec.hasUvIslands) return;
      updateActiveIslands((prev) =>
        extendUvIslands(prev, uvTargetPredicate, edge, amount, uvEditScope)
      );
    },
    [uvCalibrationEnabled, spec.hasUvIslands, updateActiveIslands, uvTargetPredicate, uvEditScope]
  );

  const handleResetUvSection = useCallback(() => {
    const defaults =
      templateType === 'pants' ? ROBLOX_PANTS_UV_ISLANDS : ROBLOX_SHIRT_UV_ISLANDS;
    const defMap = new Map(defaults.map((d) => [d.name, d]));
    updateActiveIslands((prev) =>
      prev.map((isl) => (uvTargetPredicate(isl) ? defMap.get(isl.name) || isl : isl))
    );
    pushToast('Reset selected UV section to official Roblox coordinates.', 'info');
  }, [templateType, updateActiveIslands, uvTargetPredicate, pushToast]);

  const handleResetAllUv = useCallback(() => {
    if (templateType === 'pants') setPantsIslands(ROBLOX_PANTS_UV_ISLANDS);
    else if (templateType === 'shirt') setShirtIslands(ROBLOX_SHIRT_UV_ISLANDS);
    pushToast('Restored all UV coordinates to official Roblox defaults.', 'info');
  }, [templateType, pushToast]);

  const handleToggleUvCalibration = (enabled: boolean) => {
    setUvCalibrationEnabled(enabled);
    if (enabled) {
      setShowUvOverlay(true);
      setToolMode('align');
    } else if (toolMode === 'align') {
      setToolMode('pan');
    }
  };

  // IndexedDB Save & Open (Supports Single Garments AND Multi-Slot Full-Outfit Lookbooks!)
  const handleSaveCurrentProject = async (name: string, saveAsLookbook: boolean = false) => {
    const slots = slotsRef.current;
    const slot = slots?.[templateType];
    if (!slots || !slot || !hasImage) {
      throw new Error('No active image to save.');
    }
    const [workingBlob, originalBlob] = await Promise.all([
      canvasToPngBlob(slot.mainCanvas),
      canvasToPngBlob(slot.originalCanvas)
    ]);

    let outfitSlots: Partial<Record<TemplateType, SavedOutfitSlotData>> | undefined;
    let savedSlotsCount = 1;
    if (saveAsLookbook) {
      outfitSlots = {};
      const types: TemplateType[] = ['shirt', 'pants', 'tshirt'];
      for (const t of types) {
        if (!slotMeta[t].hasImage) continue;
        const [wb, ob] = await Promise.all([
          canvasToPngBlob(slots[t].mainCanvas),
          canvasToPngBlob(slots[t].originalCanvas)
        ]);
        outfitSlots[t] = {
          workingBlob: wb,
          originalBlob: ob,
          transform: slotMeta[t].transform,
          projectName: slotMeta[t].projectName
        };
      }
      savedSlotsCount = Object.keys(outfitSlots).length;
    }

    const now = Date.now();
    const id = activeMeta.projectId || `proj_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const record: StudioProjectRecord = {
      id,
      name,
      templateType,
      originalBlob,
      workingBlob,
      transform,
      customShirtIslands: shirtIslands,
      customPantsIslands: pantsIslands,
      avatarSettings,
      isOutfitLookbook: saveAsLookbook && savedSlotsCount > 0,
      outfitSlots,
      createdAt: now,
      updatedAt: now
    };
    await saveProject(record);
    updateSlotMeta(templateType, {
      projectId: id,
      projectName: name,
      isDirty: false,
      lastSavedAt: now
    });
    pushToast(
      saveAsLookbook
        ? `Saved Outfit Lookbook "${name}" (${savedSlotsCount} ${
            savedSlotsCount === 1 ? 'slot' : 'slots'
          }).`
        : `Saved project "${name}".`,
      'success'
    );
  };

  const handleOpenProject = async (record: StudioProjectRecord) => {
    const slots = slotsRef.current;
    if (!slots) return;

    if (record.customShirtIslands) setShirtIslands(record.customShirtIslands);
    if (record.customPantsIslands) setPantsIslands(record.customPantsIslands);

    if (record.isOutfitLookbook && record.outfitSlots) {
      const types: TemplateType[] = ['shirt', 'pants', 'tshirt'];
      const nextLayerVis = {
        shirt: false,
        pants: false,
        tshirt: false
      };
      let restoredCount = 0;
      let firstRestoredType: TemplateType = record.templateType;

      for (const t of types) {
        const slot = slots[t];
        const targetSpec = getTemplateSpec(t);
        const mCtx = slot.mainCanvas.getContext('2d', { willReadFrequently: true })!;
        const oCtx = slot.originalCanvas.getContext('2d', { willReadFrequently: true })!;
        mCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);
        oCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);

        const saved = record.outfitSlots[t];
        if (saved && (saved.workingBlob || saved.originalBlob)) {
          if (saved.originalBlob) {
            const oImg = await blobToImage(saved.originalBlob);
            oCtx.drawImage(oImg, 0, 0, targetSpec.width, targetSpec.height);
          }
          if (saved.workingBlob) {
            const wImg = await blobToImage(saved.workingBlob);
            mCtx.drawImage(wImg, 0, 0, targetSpec.width, targetSpec.height);
          } else if (saved.originalBlob) {
            mCtx.drawImage(slot.originalCanvas, 0, 0);
          }
          nextLayerVis[t] = true;
          if (restoredCount === 0) firstRestoredType = t;
          restoredCount++;
          updateSlotMeta(t, {
            hasImage: true,
            hasCutAction: false,
            projectId: record.isAutoDraft ? null : record.id,
            projectName: saved.projectName || record.name,
            sourceFileName: `${saved.projectName || record.name}.png`,
            transform: saved.transform || { ...DEFAULT_IMAGE_TRANSFORM },
            isDirty: false,
            lastSavedAt: record.updatedAt
          });
          captureHistorySnapshot(t, true, `Opened ${record.name}`);
        } else {
          slot.history.reset();
          updateSlotMeta(t, createInitialSlotMeta(t));
        }
      }

      const activeSlotType = record.outfitSlots[record.templateType]
        ? record.templateType
        : firstRestoredType;
      setTemplateType(activeSlotType);
      setAvatarSettings({
        ...DEFAULT_AVATAR_SETTINGS,
        ...record.avatarSettings,
        layerVisibility: {
          ...nextLayerVis,
          ...(record.avatarSettings?.layerVisibility
            ? {
                shirt: nextLayerVis.shirt && record.avatarSettings.layerVisibility.shirt,
                pants: nextLayerVis.pants && record.avatarSettings.layerVisibility.pants,
                tshirt: nextLayerVis.tshirt && record.avatarSettings.layerVisibility.tshirt
              }
            : {})
        }
      });
      syncHistoryFlags(activeSlotType);
      setUpdateTrigger((n) => n + 1);
      pushToast(
        `Opened Outfit Lookbook "${record.name}" (${restoredCount} ${
          restoredCount === 1 ? 'garment' : 'garments'
        }).`,
        'success'
      );
      return;
    }

    const slot = slots[record.templateType];
    if (!slot) return;
    const targetSpec = getTemplateSpec(record.templateType);

    const mCtx = slot.mainCanvas.getContext('2d', { willReadFrequently: true })!;
    const oCtx = slot.originalCanvas.getContext('2d', { willReadFrequently: true })!;
    mCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);
    oCtx.clearRect(0, 0, targetSpec.width, targetSpec.height);

    if (record.originalBlob) {
      const oImg = await blobToImage(record.originalBlob);
      oCtx.drawImage(oImg, 0, 0, targetSpec.width, targetSpec.height);
    }
    if (record.workingBlob) {
      const wImg = await blobToImage(record.workingBlob);
      mCtx.drawImage(wImg, 0, 0, targetSpec.width, targetSpec.height);
    } else if (record.originalBlob) {
      mCtx.drawImage(slot.originalCanvas, 0, 0);
    }

    setTemplateType(record.templateType);
    setAvatarSettings({
      ...DEFAULT_AVATAR_SETTINGS,
      ...record.avatarSettings,
      layerVisibility: {
        ...DEFAULT_AVATAR_SETTINGS.layerVisibility,
        ...(record.avatarSettings?.layerVisibility || {}),
        [record.templateType]: true
      }
    });
    updateSlotMeta(record.templateType, {
      hasImage: Boolean(record.workingBlob || record.originalBlob),
      hasCutAction: false,
      projectId: record.isAutoDraft ? null : record.id,
      projectName: record.name,
      sourceFileName: `${record.name}.png`,
      transform: record.transform || { ...DEFAULT_IMAGE_TRANSFORM },
      isDirty: Boolean(record.isAutoDraft),
      lastSavedAt: record.updatedAt
    });
    captureHistorySnapshot(record.templateType, true, `Opened ${record.name}`);
    syncHistoryFlags(record.templateType);
    setUpdateTrigger((n) => n + 1);
    pushToast(`Opened "${record.name}" into ${targetSpec.label} slot.`, 'success');
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowProjectsModal(true);
        return;
      }

      if (e.key === '?' && !mod && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
      }

      if (mod || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          setToolMode('pan');
          break;
        case 'b':
          setToolMode('paint');
          break;
        case 'i':
          setToolMode('eyedropper');
          break;
        case 's':
          setToolMode('stamp');
          break;
        case 'm':
          setToolMode('marquee');
          break;
        case 'e':
          setToolMode('erase');
          break;
        case 'r':
          setToolMode('restore');
          break;
        case 't':
          setToolMode('transform');
          break;
        case '[':
          setBrushSize((s) => Math.max(2, s - 4));
          break;
        case ']':
          setBrushSize((s) => Math.min(64, s + 4));
          break;
        case 'arrowup':
          if (uvCalibrationEnabled && inspectorTab === 'uv' && !floatingDecal) {
            e.preventDefault();
            handleNudgeUv(0, -uvNudgeStep);
          }
          break;
        case 'arrowdown':
          if (uvCalibrationEnabled && inspectorTab === 'uv' && !floatingDecal) {
            e.preventDefault();
            handleNudgeUv(0, uvNudgeStep);
          }
          break;
        case 'arrowleft':
          if (uvCalibrationEnabled && inspectorTab === 'uv' && !floatingDecal) {
            e.preventDefault();
            handleNudgeUv(-uvNudgeStep, 0);
          }
          break;
        case 'arrowright':
          if (uvCalibrationEnabled && inspectorTab === 'uv' && !floatingDecal) {
            e.preventDefault();
            handleNudgeUv(uvNudgeStep, 0);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    uvCalibrationEnabled,
    inspectorTab,
    uvNudgeStep,
    handleNudgeUv,
    showShortcutsModal,
    floatingDecal
  ]);

  // Global Clipboard Paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            ingestImageFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ingestImageFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragOverActive) setDragOverActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingestImageFile(file);
  };

  const TOOLS: {
    id: ToolMode;
    label: string;
    shortcut: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'pan', label: 'Pan', shortcut: 'V', icon: Hand },
    { id: 'paint', label: 'Paint Brush', shortcut: 'B', icon: Brush },
    { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: Pipette },
    { id: 'stamp', label: 'Decal Stamp', shortcut: 'S', icon: Stamp },
    { id: 'marquee', label: 'Marquee Cut', shortcut: 'M', icon: SquareDashed },
    { id: 'erase', label: 'Erase', shortcut: 'E', icon: Eraser },
    { id: 'restore', label: 'Restore', shortcut: 'R', icon: RotateCcw },
    { id: 'transform', label: 'Move', shortcut: 'T', icon: Move }
  ];

  const effectiveViewMode: ViewMode =
    !isDesktopSplitCapable && viewMode === 'split' ? '2d' : viewMode;
  const isPure3DMode = effectiveViewMode === '3d';
  const showEditorChrome = !isPure3DMode;

  const activeMainCanvas = slotsRef.current?.[templateType].mainCanvas ?? null;
  const activeCustomBgImage = customBgImagesRef.current[templateType];

  return (
    <MotionConfig reducedMotion="user">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="h-dvh w-screen bg-h-canvas text-h-text flex flex-col overflow-hidden"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) ingestImageFile(file);
            e.target.value = '';
          }}
        />

        {/* ================= TOP HEAVENLY HEADER ================= */}
        <header className="shrink-0 bg-h-surface/95 border-b border-h-border z-30">
          <div className="h-12 md:h-13 px-3 sm:px-4 flex items-center justify-between gap-2">
            {/* Left: Brand Wordmark + Desktop Persistent Slot Switcher */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-display text-sm sm:text-base font-extrabold tracking-tight text-h-text whitespace-nowrap">
                  HEAVENLY
                </span>
                <span className="hidden lg:inline text-xs font-medium text-h-accent-text truncate">
                  Clothing Studio
                </span>
              </div>

              <div className="hidden md:block w-px h-5 bg-h-border-soft" />

              <div
                className="hidden md:flex items-center bg-h-surface-3 border border-h-border rounded-xl p-0.5"
                role="group"
                aria-label="Clothing template slot"
              >
                {(
                  [
                    ['shirt', 'Shirt'],
                    ['pants', 'Pants'],
                    ['tshirt', 'T-Shirt']
                  ] as [TemplateType, string][]
                ).map(([t, label]) => {
                  const loaded = slotMeta[t].hasImage;
                  const active = templateType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleChangeTemplateType(t)}
                      data-testid={`type-btn-${t}`}
                      className={`relative px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        active ? 'text-h-accent-text' : 'text-h-muted hover:text-h-text'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="desktop-slot-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 bg-h-surface rounded-lg shadow-xs border border-h-border"
                        />
                      )}
                      <span className="relative z-10">{label}</span>
                      {loaded && (
                        <span
                          aria-label={`${label} loaded`}
                          className="relative z-10 w-1.5 h-1.5 rounded-full bg-h-accent shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Center: Desktop View Mode Switcher (Editor | Split | 3D) */}
            <div
              className="hidden md:flex items-center bg-h-surface-3 border border-h-border rounded-xl p-0.5"
              role="group"
              aria-label="Workspace view mode"
            >
              {(
                [
                  { id: '2d' as ViewMode, label: 'Editor', icon: PencilLine, show: true },
                  {
                    id: 'split' as ViewMode,
                    label: 'Split',
                    icon: Columns2,
                    show: isDesktopSplitCapable
                  },
                  { id: '3d' as ViewMode, label: '3D', icon: Box, show: true }
                ]
              )
                .filter((v) => v.show)
                .map((v) => {
                  const Icon = v.icon;
                  const active = effectiveViewMode === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setViewMode(v.id)}
                      data-testid={`view-btn-${v.id}`}
                      className={`relative px-3 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        active ? 'text-h-accent-text' : 'text-h-muted hover:text-h-text'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="desktop-view-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 bg-h-surface rounded-lg shadow-xs border border-h-border"
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5" />
                      <span className="relative z-10">{v.label}</span>
                    </button>
                  );
                })}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSamplesMenuOpen((v) => !v)}
                  data-testid="header-samples-btn"
                  title="Load Sample Template"
                  className="h-8 px-2.5 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text-2 flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-h-accent-text" />
                  <span className="hidden lg:inline">Samples</span>
                  <ChevronDown className="w-3 h-3 text-h-muted" />
                </button>

                <AnimatePresence>
                  {samplesMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setSamplesMenuOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.14 }}
                        className="absolute right-0 top-10 w-72 bg-h-surface border border-h-border rounded-2xl shadow-[0_16px_44px_rgba(15,23,42,0.14)] p-1.5 z-40 space-y-1"
                      >
                        {SAMPLE_TEMPLATES.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            onClick={() => handleLoadSample(sample)}
                            data-testid={`sample-item-${sample.id}`}
                            className="w-full text-left p-2.5 rounded-xl hover:bg-h-surface-3 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-h-text">
                                {sample.name}
                              </span>
                              <span className="text-[10px] font-mono font-semibold uppercase text-h-accent-text">
                                {getTemplateSpec(sample.type).shortLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-h-muted mt-0.5 leading-snug">
                              {sample.description}
                            </p>
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowProjectsModal(true)}
                data-testid="header-projects-btn"
                title="Saved Projects (Ctrl+S)"
                className="h-8 px-2.5 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text-2 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5 text-h-text-2" />
                <span className="hidden xl:inline">Projects</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                animate={
                  anySlotDirty && !prefersReducedMotion
                    ? {
                        scale: [1, 1.022, 1],
                        boxShadow: [
                          '0 0 0 0px rgba(56, 189, 248, 0)',
                          '0 0 0 3px rgba(56, 189, 248, 0.24)',
                          '0 0 0 0px rgba(56, 189, 248, 0)'
                        ]
                      }
                    : { scale: 1, boxShadow: '0 0 0 0px rgba(56, 189, 248, 0)' }
                }
                transition={
                  anySlotDirty && !prefersReducedMotion
                    ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }
                    : { duration: 0.2 }
                }
                onClick={() => fileInputRef.current?.click()}
                data-testid="header-import-btn"
                data-pulsing={anySlotDirty ? 'true' : 'false'}
                title={anySlotDirty ? 'Import Image (Unsaved edits active)' : 'Import Image'}
                className={`h-8 px-2.5 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                  anySlotDirty
                    ? 'border-h-accent-border text-h-accent-text'
                    : 'border-h-border text-h-text-2'
                }`}
              >
                <Upload className={`w-3.5 h-3.5 ${anySlotDirty ? 'text-h-accent-text' : 'text-h-text-2'}`} />
                <span className="hidden sm:inline">Import</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={hasImage ? { scale: 1.025 } : undefined}
                whileTap={{ scale: 0.96 }}
                animate={
                  anySlotDirty && hasImage && !prefersReducedMotion
                    ? {
                        scale: [1, 1.03, 1],
                        boxShadow: [
                          '0 0 0 0px rgba(14, 165, 233, 0)',
                          '0 0 0 4px rgba(14, 165, 233, 0.32)',
                          '0 0 0 0px rgba(14, 165, 233, 0)'
                        ]
                      }
                    : { scale: 1, boxShadow: '0 0 0 0px rgba(14, 165, 233, 0)' }
                }
                transition={
                  anySlotDirty && hasImage && !prefersReducedMotion
                    ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
                disabled={!hasImage}
                onClick={() => setShowExportModal(true)}
                data-testid="header-export-btn"
                data-pulsing={anySlotDirty && hasImage ? 'true' : 'false'}
                title={anySlotDirty && hasImage ? 'Export PNG (Unsaved changes ready to export)' : 'Export PNG'}
                className="relative h-8 px-3 rounded-xl bg-h-accent hover:bg-h-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                {anySlotDirty && hasImage && (
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-white/95 shadow-[0_0_6px_rgba(255,255,255,0.9)]"
                  />
                )}
              </motion.button>

              {/* Editor Inspector toggle ONLY shown in Editor / Split modes — hidden in pure 3D! */}
              {showEditorChrome && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setInspectorOpen((o) => !o)}
                  data-testid="toggle-inspector-btn"
                  title="Toggle Editor Inspector Panel"
                  className={`h-8 w-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    inspectorOpen
                      ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                      : 'bg-h-surface-2 border-h-border text-h-muted hover:text-h-text'
                  }`}
                >
                  <PanelRight className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>

          {/* Mobile Sub-Bar (< md): Garment Slot Switcher + Compact Live Status (Editor | 3D moved to bottom-right!) */}
          <div className="md:hidden h-10 px-3 border-t border-h-border-soft bg-h-surface-2 flex items-center justify-between gap-2">
            <div
              className="flex items-center bg-h-surface-3 border border-h-border rounded-xl p-0.5"
              role="group"
              aria-label="Mobile clothing template slot"
            >
              {(
                [
                  ['shirt', 'Shirt'],
                  ['pants', 'Pants'],
                  ['tshirt', 'T-Shirt']
                ] as [TemplateType, string][]
              ).map(([t, label]) => {
                const loaded = slotMeta[t].hasImage;
                const active = templateType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleChangeTemplateType(t)}
                    data-testid={`mobile-type-btn-${t}`}
                    className={`relative px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                      active ? 'text-h-accent-text' : 'text-h-muted'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mobile-slot-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 bg-h-surface rounded-lg shadow-xs border border-h-border"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                    {loaded && (
                      <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-h-accent shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Compact right-side context indicator */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-h-muted whitespace-nowrap">
              {preflight && hasImage && spec.hasUvIslands ? (
                <span
                  className={`font-semibold ${
                    preflight.dirtyNonUvPixels === 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {preflight.dirtyNonUvPixels === 0
                    ? 'UV Clean'
                    : `${preflight.dirtyNonUvPixels.toLocaleString()} px out`}
                </span>
              ) : (
                <span>
                  {loadedSlotCount > 0
                    ? `${loadedSlotCount} ${loadedSlotCount === 1 ? 'garment' : 'garments'}`
                    : `${spec.width}×${spec.height}`}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ================= MAIN STUDIO BODY ================= */}
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Left Slim 2D Editor Tool Rail (Desktop & Tablet >= md — HIDDEN in pure 3D mode!) */}
          {showEditorChrome && (
            <nav
              aria-label="2D editing tools"
              data-testid="desktop-2d-tool-rail"
              className="hidden md:flex w-13 shrink-0 bg-h-surface border-r border-h-border flex-col items-center py-2.5 gap-1.5 z-20"
            >
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const active = toolMode === tool.id;
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setToolMode(tool.id)}
                    title={`${tool.label} (${tool.shortcut})`}
                    data-testid={`tool-btn-${tool.id}`}
                    className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      active
                        ? 'text-h-accent-text'
                        : 'text-h-muted hover:text-h-text hover:bg-h-surface-3'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="desktop-tool-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                        className="absolute inset-0 rounded-xl bg-h-accent-soft border border-h-accent-border shadow-xs"
                      />
                    )}
                    <Icon className="relative z-10 w-4 h-4" />
                  </motion.button>
                );
              })}

              <div className="w-7 h-px bg-h-border-soft my-1" />

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                disabled={!canUndo}
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
                data-testid="tool-undo-btn"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-h-muted hover:text-h-text hover:bg-h-surface-3 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                disabled={!canRedo}
                onClick={handleRedo}
                title="Redo (Ctrl+Y)"
                data-testid="tool-redo-btn"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-h-muted hover:text-h-text hover:bg-h-surface-3 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <Redo2 className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                disabled={historyTimelineState.items.length === 0}
                onClick={() => setShowHistoryDrawer((v) => !v)}
                title="Visual Undo History Timeline"
                data-testid="rail-history-btn"
                className={`w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 cursor-pointer transition-colors ${
                  showHistoryDrawer
                    ? 'bg-h-accent-soft border border-h-accent-border text-h-accent-text'
                    : 'text-h-muted hover:text-h-text hover:bg-h-surface-3'
                }`}
              >
                <History className="w-4 h-4" />
              </motion.button>

              {spec.hasUvIslands && (
                <>
                  <div className="w-7 h-px bg-h-border-soft my-1" />
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    disabled={!hasImage}
                    onClick={() => handleAutoCleanSync()}
                    title="Auto-Clean Pixels Outside UV Islands"
                    data-testid="rail-autoclean-btn"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-h-accent-text bg-h-surface-3 hover:bg-h-accent-soft disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.button>
                </>
              )}
            </nav>
          )}

          {/* Center Viewport Area */}
          <main className="flex-1 min-w-0 min-h-0 flex relative overflow-hidden">
            {effectiveViewMode === 'split' ? (
              <motion.div
                key="workspace-split"
                initial={{ opacity: 0.78, scale: 0.994 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="w-full h-full grid grid-cols-2 divide-x divide-h-border"
              >
                <div className="min-w-0 min-h-0 relative">
                  <CanvasViewport
                    mainCanvasRef={mainCanvasRef}
                    originalCanvasRef={originalCanvasRef}
                    templateType={templateType}
                    islands={activeIslands}
                    hasImage={hasImage}
                    hasCutAction={hasCutAction}
                    customBackground={customBackground}
                    customBgImage={activeCustomBgImage}
                    bleedMargin={bleedMargin}
                    toolMode={toolMode}
                    brushSize={brushSize}
                    brushHardness={brushHardness}
                    paintColor={paintColor}
                    paintOpacity={paintOpacity}
                    symmetryEnabled={symmetryEnabled}
                    clipToUv={clipToUv}
                    seamBridgeEnabled={seamBridgeEnabled}
                    onSampleColor={handleSampleColor}
                    decalConfig={decalConfig}
                    decalCustomImage={decalCustomImage}
                    floatingDecal={floatingDecal}
                    onUpdateFloatingDecal={setFloatingDecal}
                    onCommitFloatingDecal={handleCommitFloatingDecal}
                    onCancelFloatingDecal={handleCancelFloatingDecal}
                    loupeEnabled={loupeEnabled}
                    onToggleLoupe={() => setLoupeEnabled((v) => !v)}
                    loupeSettings={loupeSettings}
                    onUpdateLoupeSettings={handleUpdateLoupeSettings}
                    highlightedRegion={highlightedRegion}
                    onHoverRegion={setHighlightedRegion}
                    showUvOverlay={showUvOverlay}
                    uvOpacity={uvOpacity}
                    showUvLabels={showUvLabels}
                    showCompare={showCompare}
                    onToggleCompare={() => setShowCompare((c) => !c)}
                    uvCalibrationEnabled={uvCalibrationEnabled && inspectorTab === 'uv'}
                    activeUvSection={activeUvSection}
                    activeUvIslandName={uvEditScope === 'single' ? activeUvIslandName : null}
                    onSelectUvIsland={(isl) => {
                      setActiveUvIslandName(isl.name);
                      setUvEditScope('single');
                      if (isl.group === 'torso') setActiveUvSection('torso');
                      else if (isl.group === 'right_arm' || isl.group === 'right_leg') {
                        setActiveUvSection('right_limb');
                      } else setActiveUvSection('left_limb');
                    }}
                    transform={transform}
                    onUpdateTransform={handleUpdateTransform}
                    onResetTransform={handleResetToOriginal}
                    onCanvasMutated={handleCanvasMutated}
                    onLiveCanvasMutated={handleLiveCanvasMutated}
                    onRegisterRepaint={handleRegisterRepaint2D}
                    onZoomChange={setZoomLevel}
                    onHoverPixel={setHoverPixel}
                    onTriggerImport={() => fileInputRef.current?.click()}
                    onLoadDefaultSample={handleLoadDefaultSampleForCurrentType}
                    onOpenProjects={() => setShowProjectsModal(true)}
                    onClearCurrentSlot={handleClearCurrentSlot}
                    onGestureUndo={handleUndo}
                    onGestureRedo={handleRedo}
                    updateTrigger={updateTrigger}
                  />
                </div>
                <div className="min-w-0 min-h-0 relative">
                  <Roblox3DViewport
                    garments={garments3DInput}
                    updateTrigger={updateTrigger}
                    settings={avatarSettings}
                    onUpdateSettings={handleUpdateAvatarSettings}
                    studioTheme={studioTheme}
                    onSetStudioTheme={handleSetTheme}
                    hasActiveSlotImage={hasImage}
                    activeSlotLabel={spec.shortLabel}
                    activeTemplateType={templateType}
                    onRemoveActiveTemplate={handleClearCurrentSlot}
                    canCompare3D={canCompare3D}
                    isPure3DMode={false}
                    highlightedRegion={highlightedRegion}
                    onSelectBodyRegion={setHighlightedRegion}
                    paint3DEnabled={paint3DEnabled}
                    onTogglePaint3D={() => setPaint3DEnabled((v) => !v)}
                    paint3DMode={paint3DMode}
                    onChangePaint3DMode={setPaint3DMode}
                    paintColor={paintColor}
                    onChangePaintColor={setPaintColor}
                    brushSize={brushSize}
                    onChangeBrushSize={setBrushSize}
                    onRegisterFastRefresh={handleRegisterFastRefresh3D}
                    onPaint3DStroke={handlePaint3DStroke}
                    onGestureUndo={handleUndo}
                    onGestureRedo={handleRedo}
                    onOpenShowcase2D={() => {
                      if (!hasImage) {
                        pushToast(
                          'Load or import a template first to generate a 2D showcase card.',
                          'info'
                        );
                        return;
                      }
                      setShowShowcaseModal(true);
                    }}
                    onToast={pushToast}
                  />
                </div>
              </motion.div>
            ) : effectiveViewMode === '2d' ? (
              <motion.div
                key="workspace-2d"
                initial={{ opacity: 0.78, scale: 0.994 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="w-full h-full relative"
              >
                <CanvasViewport
                  mainCanvasRef={mainCanvasRef}
                  originalCanvasRef={originalCanvasRef}
                  templateType={templateType}
                  islands={activeIslands}
                  hasImage={hasImage}
                  hasCutAction={hasCutAction}
                  customBackground={customBackground}
                  customBgImage={activeCustomBgImage}
                  bleedMargin={bleedMargin}
                  toolMode={toolMode}
                  brushSize={brushSize}
                  brushHardness={brushHardness}
                  paintColor={paintColor}
                  paintOpacity={paintOpacity}
                  symmetryEnabled={symmetryEnabled}
                  clipToUv={clipToUv}
                  seamBridgeEnabled={seamBridgeEnabled}
                  onSampleColor={handleSampleColor}
                  decalConfig={decalConfig}
                  decalCustomImage={decalCustomImage}
                  floatingDecal={floatingDecal}
                  onUpdateFloatingDecal={setFloatingDecal}
                  onCommitFloatingDecal={handleCommitFloatingDecal}
                  onCancelFloatingDecal={handleCancelFloatingDecal}
                  loupeEnabled={loupeEnabled}
                  onToggleLoupe={() => setLoupeEnabled((v) => !v)}
                  loupeSettings={loupeSettings}
                  onUpdateLoupeSettings={handleUpdateLoupeSettings}
                  highlightedRegion={highlightedRegion}
                  onHoverRegion={setHighlightedRegion}
                  showMobileViewSwitcher={!isDesktopSplitCapable}
                  onSwitchTo3D={() => setViewMode('3d')}
                  showUvOverlay={showUvOverlay}
                  uvOpacity={uvOpacity}
                  showUvLabels={showUvLabels}
                  showCompare={showCompare}
                  onToggleCompare={() => setShowCompare((c) => !c)}
                  uvCalibrationEnabled={uvCalibrationEnabled && inspectorTab === 'uv'}
                  activeUvSection={activeUvSection}
                  activeUvIslandName={uvEditScope === 'single' ? activeUvIslandName : null}
                  onSelectUvIsland={(isl) => {
                    setActiveUvIslandName(isl.name);
                    setUvEditScope('single');
                  }}
                  transform={transform}
                  onUpdateTransform={handleUpdateTransform}
                  onResetTransform={handleResetToOriginal}
                  onCanvasMutated={handleCanvasMutated}
                  onLiveCanvasMutated={handleLiveCanvasMutated}
                  onRegisterRepaint={handleRegisterRepaint2D}
                  onZoomChange={setZoomLevel}
                  onHoverPixel={setHoverPixel}
                  onTriggerImport={() => fileInputRef.current?.click()}
                  onLoadDefaultSample={handleLoadDefaultSampleForCurrentType}
                  onOpenProjects={() => setShowProjectsModal(true)}
                  onClearCurrentSlot={handleClearCurrentSlot}
                  onGestureUndo={handleUndo}
                  onGestureRedo={handleRedo}
                  updateTrigger={updateTrigger}
                />
              </motion.div>
            ) : (
              <motion.div
                key="workspace-3d"
                initial={{ opacity: 0.78, scale: 0.994 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="w-full h-full relative"
              >
                <Roblox3DViewport
                  garments={garments3DInput}
                  updateTrigger={updateTrigger}
                  settings={avatarSettings}
                  onUpdateSettings={handleUpdateAvatarSettings}
                  studioTheme={studioTheme}
                  onSetStudioTheme={handleSetTheme}
                  hasActiveSlotImage={hasImage}
                  activeSlotLabel={spec.shortLabel}
                  activeTemplateType={templateType}
                  onRemoveActiveTemplate={handleClearCurrentSlot}
                  canCompare3D={canCompare3D}
                  isPure3DMode={true}
                  highlightedRegion={highlightedRegion}
                  onSelectBodyRegion={setHighlightedRegion}
                  paint3DEnabled={paint3DEnabled}
                  onTogglePaint3D={() => setPaint3DEnabled((v) => !v)}
                  paint3DMode={paint3DMode}
                  onChangePaint3DMode={setPaint3DMode}
                  paintColor={paintColor}
                  onChangePaintColor={setPaintColor}
                  brushSize={brushSize}
                  onChangeBrushSize={setBrushSize}
                  onRegisterFastRefresh={handleRegisterFastRefresh3D}
                  onPaint3DStroke={handlePaint3DStroke}
                  onGestureUndo={handleUndo}
                  onGestureRedo={handleRedo}
                  onSwitchToEditor={() => setViewMode('2d')}
                  onOpenShowcase2D={() => {
                    if (!hasImage) {
                      pushToast(
                        'Load or import a template first to generate a 2D showcase card.',
                        'info'
                      );
                      return;
                    }
                    setShowShowcaseModal(true);
                  }}
                  onToast={pushToast}
                />
              </motion.div>
            )}
          </main>

          {/* Right Editor-Only Inspector Sidebar (Smooth Animated Slide + Width Transition, HIDDEN in pure 3D!) */}
          <AnimatePresence initial={false}>
            {showEditorChrome && inspectorOpen && !isXlDesktop && (
              <motion.div
                key="inspector-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
                transition={{ duration: 0.18 }}
                onClick={() => setInspectorOpen(false)}
                className="fixed inset-0 bg-[#040914]/50 z-30"
              />
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showEditorChrome && inspectorOpen && !isXlDesktop && (
              <motion.aside
                key="inspector-mobile-drawer"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 38 }}
                data-testid="inspector-sidebar-mobile"
                className="fixed right-0 top-12 bottom-0 w-[312px] max-w-[88vw] shrink-0 z-40 flex flex-col shadow-2xl"
              >
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-h-surface-2 border-b border-l border-h-border">
                  <span className="text-xs font-bold text-h-text">Editor Inspector</span>
                  <button
                    type="button"
                    onClick={() => setInspectorOpen(false)}
                    data-testid="close-inspector-mobile-btn"
                    className="p-1 rounded-lg text-h-muted hover:text-h-text cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <InspectorPanel
                    activeTab={inspectorTab}
                    onChangeTab={setInspectorTab}
                    templateType={templateType}
                    hasImage={hasImage}
                    hasCutAction={hasCutAction}
                    preflight={preflight}
                    bleedMargin={bleedMargin}
                    onChangeBleedMargin={setBleedMargin}
                    onAutoClean={() => handleAutoCleanSync()}
                    onDefringeAlpha={handleDefringeAlpha}
                    customBackground={customBackground}
                    onUpdateCustomBackground={handleUpdateCustomBackground}
                    onUploadCustomBgFile={handleUploadCustomBgFile}
                    brushSize={brushSize}
                    onChangeBrushSize={setBrushSize}
                    brushHardness={brushHardness}
                    onChangeBrushHardness={setBrushHardness}
                    transform={transform}
                    onUpdateTransform={handleUpdateTransform}
                    onBakeTransform={handleBakeTransform}
                    onResetToOriginal={handleResetToOriginal}
                    onClearCurrentSlot={handleClearCurrentSlot}
                    showUvOverlay={showUvOverlay}
                    onToggleUvOverlay={() => setShowUvOverlay((v) => !v)}
                    uvOpacity={uvOpacity}
                    onChangeUvOpacity={setUvOpacity}
                    showUvLabels={showUvLabels}
                    onToggleUvLabels={() => setShowUvLabels((v) => !v)}
                    showCompare={showCompare}
                    onToggleCompare={() => setShowCompare((v) => !v)}
                    avatarSettings={avatarSettings}
                    onUpdateAvatarSettings={handleUpdateAvatarSettings}
                    studioTheme={studioTheme}
                    onSetStudioTheme={handleSetTheme}
                    islands={activeIslands}
                    uvCalibrationEnabled={uvCalibrationEnabled}
                    onToggleUvCalibration={handleToggleUvCalibration}
                    activeUvSection={activeUvSection}
                    onChangeUvSection={setActiveUvSection}
                    uvEditScope={uvEditScope}
                    onChangeUvEditScope={setUvEditScope}
                    activeUvIslandName={activeUvIslandName}
                    onSelectUvIslandName={setActiveUvIslandName}
                    uvNudgeStep={uvNudgeStep}
                    onChangeUvNudgeStep={setUvNudgeStep}
                    onNudgeUv={handleNudgeUv}
                    onExtendUv={handleExtendUv}
                    onResetUvSection={handleResetUvSection}
                    onResetAllUv={handleResetAllUv}
                    onOpenUvJsonModal={() => setShowUvJsonModal(true)}
                    toolMode={toolMode}
                    onSelectTool={setToolMode}
                    paintColor={paintColor}
                    onChangePaintColor={setPaintColor}
                    suggestedColors={suggestedCanvasColors}
                    onRefreshSuggestedColors={handleRefreshSuggestedColors}
                    recentColors={recentColors}
                    paintOpacity={paintOpacity}
                    onChangePaintOpacity={setPaintOpacity}
                    symmetryEnabled={symmetryEnabled}
                    onToggleSymmetry={() => setSymmetryEnabled((v) => !v)}
                    clipToUv={clipToUv}
                    onToggleClipToUv={() => setClipToUv((v) => !v)}
                    seamBridgeEnabled={seamBridgeEnabled}
                    onToggleSeamBridge={() => setSeamBridgeEnabled((v) => !v)}
                    loupeEnabled={loupeEnabled}
                    onToggleLoupe={() => setLoupeEnabled((v) => !v)}
                    loupeSettings={loupeSettings}
                    onUpdateLoupeSettings={handleUpdateLoupeSettings}
                    decalConfig={decalConfig}
                    onUpdateDecalConfig={handleUpdateDecalConfig}
                    onUploadDecalFile={handleUploadDecalFile}
                    hasCustomDecalImage={Boolean(decalCustomImage)}
                    decalPresets={decalPresets}
                    onSaveDecalPreset={handleSaveDecalPreset}
                    onSelectDecalPreset={handleSelectDecalPreset}
                    onDeleteDecalPreset={handleDeleteDecalPreset}
                    floatingDecal={floatingDecal}
                    onCommitFloatingDecal={handleCommitFloatingDecal}
                    onCancelFloatingDecal={handleCancelFloatingDecal}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showEditorChrome && inspectorOpen && isXlDesktop && (
              <motion.aside
                key="inspector-desktop-drawer"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 304, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 36 }}
                data-testid="inspector-sidebar-desktop"
                className="flex shrink-0 z-20 flex-col overflow-hidden"
              >
                <div className="w-[304px] h-full flex-1 min-h-0">
                  <InspectorPanel
                    activeTab={inspectorTab}
                    onChangeTab={setInspectorTab}
                    templateType={templateType}
                    hasImage={hasImage}
                    hasCutAction={hasCutAction}
                    preflight={preflight}
                    bleedMargin={bleedMargin}
                    onChangeBleedMargin={setBleedMargin}
                    onAutoClean={() => handleAutoCleanSync()}
                    onDefringeAlpha={handleDefringeAlpha}
                    customBackground={customBackground}
                    onUpdateCustomBackground={handleUpdateCustomBackground}
                    onUploadCustomBgFile={handleUploadCustomBgFile}
                    brushSize={brushSize}
                    onChangeBrushSize={setBrushSize}
                    brushHardness={brushHardness}
                    onChangeBrushHardness={setBrushHardness}
                    transform={transform}
                    onUpdateTransform={handleUpdateTransform}
                    onBakeTransform={handleBakeTransform}
                    onResetToOriginal={handleResetToOriginal}
                    onClearCurrentSlot={handleClearCurrentSlot}
                    showUvOverlay={showUvOverlay}
                    onToggleUvOverlay={() => setShowUvOverlay((v) => !v)}
                    uvOpacity={uvOpacity}
                    onChangeUvOpacity={setUvOpacity}
                    showUvLabels={showUvLabels}
                    onToggleUvLabels={() => setShowUvLabels((v) => !v)}
                    showCompare={showCompare}
                    onToggleCompare={() => setShowCompare((v) => !v)}
                    avatarSettings={avatarSettings}
                    onUpdateAvatarSettings={handleUpdateAvatarSettings}
                    studioTheme={studioTheme}
                    onSetStudioTheme={handleSetTheme}
                    islands={activeIslands}
                    uvCalibrationEnabled={uvCalibrationEnabled}
                    onToggleUvCalibration={handleToggleUvCalibration}
                    activeUvSection={activeUvSection}
                    onChangeUvSection={setActiveUvSection}
                    uvEditScope={uvEditScope}
                    onChangeUvEditScope={setUvEditScope}
                    activeUvIslandName={activeUvIslandName}
                    onSelectUvIslandName={setActiveUvIslandName}
                    uvNudgeStep={uvNudgeStep}
                    onChangeUvNudgeStep={setUvNudgeStep}
                    onNudgeUv={handleNudgeUv}
                    onExtendUv={handleExtendUv}
                    onResetUvSection={handleResetUvSection}
                    onResetAllUv={handleResetAllUv}
                    onOpenUvJsonModal={() => setShowUvJsonModal(true)}
                    toolMode={toolMode}
                    onSelectTool={setToolMode}
                    paintColor={paintColor}
                    onChangePaintColor={setPaintColor}
                    suggestedColors={suggestedCanvasColors}
                    onRefreshSuggestedColors={handleRefreshSuggestedColors}
                    recentColors={recentColors}
                    paintOpacity={paintOpacity}
                    onChangePaintOpacity={setPaintOpacity}
                    symmetryEnabled={symmetryEnabled}
                    onToggleSymmetry={() => setSymmetryEnabled((v) => !v)}
                    clipToUv={clipToUv}
                    onToggleClipToUv={() => setClipToUv((v) => !v)}
                    seamBridgeEnabled={seamBridgeEnabled}
                    onToggleSeamBridge={() => setSeamBridgeEnabled((v) => !v)}
                    loupeEnabled={loupeEnabled}
                    onToggleLoupe={() => setLoupeEnabled((v) => !v)}
                    loupeSettings={loupeSettings}
                    onUpdateLoupeSettings={handleUpdateLoupeSettings}
                    decalConfig={decalConfig}
                    onUpdateDecalConfig={handleUpdateDecalConfig}
                    onUploadDecalFile={handleUploadDecalFile}
                    hasCustomDecalImage={Boolean(decalCustomImage)}
                    decalPresets={decalPresets}
                    onSaveDecalPreset={handleSaveDecalPreset}
                    onSelectDecalPreset={handleSelectDecalPreset}
                    onDeleteDecalPreset={handleDeleteDecalPreset}
                    floatingDecal={floatingDecal}
                    onCommitFloatingDecal={handleCommitFloatingDecal}
                    onCancelFloatingDecal={handleCancelFloatingDecal}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* ================= MOBILE BOTTOM 2D EDITOR BAR (< md, HIDDEN in pure 3D!) ================= */}
        {showEditorChrome && (
          <nav
            aria-label="Mobile editing tools"
            data-testid="mobile-2d-tool-bar"
            className="md:hidden h-13 shrink-0 bg-h-surface border-t border-h-border px-1.5 flex items-center justify-between gap-0.5 z-20"
          >
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const active = toolMode === tool.id;
              return (
                <motion.button
                  key={tool.id}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setToolMode(tool.id)}
                  title={tool.label}
                  data-testid={`mobile-tool-btn-${tool.id}`}
                  className={`relative flex-1 min-w-[36px] max-w-[46px] h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                    active ? 'text-h-accent-text' : 'text-h-muted'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-tool-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                      className="absolute inset-0.5 rounded-xl bg-h-accent-soft border border-h-accent-border"
                    />
                  )}
                  <Icon className="relative z-10 w-4 h-4" />
                </motion.button>
              );
            })}
            <div className="w-px h-5 bg-h-border-soft mx-0.5 shrink-0" />
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              disabled={!canUndo}
              onClick={handleUndo}
              title="Undo"
              className="flex-1 min-w-[36px] max-w-[44px] h-10 rounded-xl flex items-center justify-center text-h-text-2 disabled:opacity-30 cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              disabled={!canRedo}
              onClick={handleRedo}
              title="Redo"
              className="flex-1 min-w-[36px] max-w-[44px] h-10 rounded-xl flex items-center justify-center text-h-text-2 disabled:opacity-30 cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
            </motion.button>
          </nav>
        )}

        {/* ================= DESKTOP BOTTOM STATUS BAR ================= */}
        <footer className="hidden md:flex h-7 shrink-0 bg-h-surface-2 border-t border-h-border px-3 items-center justify-between text-[11px] text-h-muted z-20">
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-h-text">{spec.label}</span>
            <span className="text-h-border">·</span>
            <span>
              {spec.width} × {spec.height} px
            </span>
            {showEditorChrome && (
              <>
                <span className="text-h-border">·</span>
                <span>{Math.round(zoomLevel * 100)}%</span>
                <span className="text-h-border">·</span>
                <span className="capitalize font-sans text-h-text-2 font-medium">{toolMode}</span>
                {hoverPixel && (
                  <>
                    <span className="text-h-border">·</span>
                    <span className="text-h-accent-text font-semibold">
                      {hoverPixel.x}, {hoverPixel.y}
                    </span>
                    {hoverPixel.island && (
                      <span className="font-sans text-h-text-2">({hoverPixel.island.name})</span>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {preflight && hasImage && spec.hasUvIslands && (
              <>
                <span
                  data-testid="status-uv-purity"
                  className={`font-mono font-semibold tabular-nums ${
                    preflight.dirtyNonUvPixels === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {preflight.dirtyNonUvPixels === 0
                    ? 'UV Clean'
                    : `${preflight.dirtyNonUvPixels.toLocaleString()} outside px`}
                </span>
                <span className="text-h-border">·</span>
              </>
            )}
            <span className="truncate max-w-[180px] font-medium text-h-text-2">{projectName}</span>
            <span className="text-h-border">·</span>
            <span className={isDirty ? 'text-amber-600 font-medium' : 'text-h-muted'}>
              {isDirty ? 'Unsaved edits' : lastSavedAt ? 'Saved locally' : 'Ready'}
            </span>
            {historyTimelineState.items.length > 0 && (
              <>
                <span className="text-h-border">·</span>
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer((v) => !v)}
                  data-testid="toggle-history-drawer-btn"
                  title="Open Visual History Timeline"
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                    showHistoryDrawer
                      ? 'bg-h-accent-soft text-h-accent-text font-semibold'
                      : 'text-h-text-2 hover:text-h-accent-text hover:bg-h-surface-3'
                  }`}
                >
                  <History className="w-3 h-3" />
                  <span>History ({historyTimelineState.items.length})</span>
                </button>
              </>
            )}
            <span className="text-h-border">·</span>
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              data-testid="open-shortcuts-btn"
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-h-text-2 hover:text-h-accent-text hover:bg-h-surface-3 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3 h-3" />
              <span>?</span>
            </button>
            <span className="text-h-border">·</span>
            <button
              type="button"
              onClick={handleToggleTheme}
              data-testid="footer-theme-toggle-btn"
              title={
                studioTheme === 'dark'
                  ? 'Switch to Heavenly Light Mode'
                  : 'Switch to Heavenly Dark Mode'
              }
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-h-text-2 hover:text-h-accent-text hover:bg-h-surface-3 transition-colors cursor-pointer"
            >
              {studioTheme === 'dark' ? (
                <>
                  <Moon className="w-3 h-3 text-h-accent-text" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-3 h-3 text-h-accent-text" />
                  <span>Light</span>
                </>
              )}
            </button>
          </div>
        </footer>

        {/* Visual Undo History Filmstrip Drawer */}
        <HistoryTimelineDrawer
          isOpen={showHistoryDrawer && historyTimelineState.items.length > 0}
          items={historyTimelineState.items}
          currentIndex={historyTimelineState.currentIndex}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onJumpTo={handleJumpToHistory}
          onClose={() => setShowHistoryDrawer(false)}
        />

        {/* Global File Drag-and-Drop Overlay */}
        <AnimatePresence>
          {dragOverActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-h-surface-3/85 border-2 border-dashed border-h-accent flex items-center justify-center pointer-events-none"
            >
              <div className="bg-h-surface border border-h-accent-border rounded-3xl px-8 py-6 text-center space-y-1.5 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
                <p className="font-display text-lg font-bold text-h-text">
                  Drop image to import into {spec.label} slot
                </p>
                <p className="text-xs text-h-muted">
                  Target dimensions: {spec.width} × {spec.height} px PNG
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Smooth Animated Toasts */}
        <div className="fixed top-24 md:top-auto md:bottom-10 right-3 md:right-4 z-50 flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className={`px-3.5 py-2.5 rounded-2xl border text-xs font-semibold shadow-[0_12px_32px_rgba(15,23,42,0.12)] pointer-events-auto bg-h-surface ${
                  t.type === 'success'
                    ? 'border-emerald-400/35 text-emerald-400'
                    : t.type === 'error'
                    ? 'border-rose-400/35 text-rose-400'
                    : t.type === 'warning'
                    ? 'border-amber-400/35 text-amber-400'
                    : 'border-h-accent-border text-h-accent-text'
                }`}
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ================= WORKFLOW MODALS (Smooth Enter/Exit) ================= */}
        <AnimatePresence>
          {pendingImport && (
            <PreflightModal
              key="preflight-modal"
              image={pendingImport.image}
              fileName={pendingImport.fileName}
              fileSize={pendingImport.fileSize}
              templateType={templateType}
              onConfirm={handleConfirmImportConform}
              onCancel={() => setPendingImport(null)}
            />
          )}

          {showExportModal && hasImage && activeMainCanvas && preflight && (
            <ExportModal
              key="export-modal"
              canvas={activeMainCanvas}
              templateType={templateType}
              islands={activeIslands}
              bleedMargin={bleedMargin}
              preflight={preflight}
              defaultFileName={projectName}
              customBackground={customBackground}
              customBgImage={activeCustomBgImage}
              outfitSlotsForZip={outfitSlotsForZip}
              onUpdateCustomBackground={handleUpdateCustomBackground}
              onAutoCleanSync={handleAutoCleanSync}
              onCleanAllSlotsSync={handleCleanAllSlotsSync}
              onClose={() => setShowExportModal(false)}
              onExportSuccess={(fname) => {
                pushToast(`Exported ${fname}`, 'success');
              }}
            />
          )}

          {showProjectsModal && (
            <ProjectsModal
              key="projects-modal"
              currentProjectName={projectName}
              hasImage={hasImage}
              loadedSlotCount={loadedSlotCount}
              onSaveCurrentProject={handleSaveCurrentProject}
              onOpenProject={handleOpenProject}
              onClose={() => setShowProjectsModal(false)}
            />
          )}

          {showUvJsonModal && (templateType === 'shirt' || templateType === 'pants') && (
            <UvDebugModal
              key="uv-debug-modal"
              templateType={templateType}
              islands={activeIslands}
              onApplyIslands={(next) => {
                if (templateType === 'pants') setPantsIslands(next);
                else setShirtIslands(next);
                pushToast('Applied custom UV island JSON.', 'success');
              }}
              onResetDefaults={handleResetAllUv}
              onClose={() => setShowUvJsonModal(false)}
            />
          )}

          {showShowcaseModal && hasImage && activeMainCanvas && (
            <Showcase2DModal
              key="showcase-2d-modal"
              sourceCanvas={activeMainCanvas}
              templateType={templateType}
              islands={activeIslands}
              skinColor={avatarSettings.skinColor}
              tshirtBaseColor={avatarSettings.tshirtBaseColor}
              projectName={projectName}
              onClose={() => setShowShowcaseModal(false)}
            />
          )}
        </AnimatePresence>

        {/* Keyboard Shortcuts Cheatsheet Modal (?) */}
        <ShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />
      </div>
    </MotionConfig>
  );
}
