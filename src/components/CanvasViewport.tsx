import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Box,
  Check,
  Columns2,
  Eraser,
  FolderOpen,
  Maximize2,
  PencilLine,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import {
  ImageTransform,
  MarqueeBox,
  TemplateType,
  ToolMode,
  UvIsland,
  UvSectionId,
  getTemplateSpec
} from '../types/uv';
import {
  BodyRegionGroup,
  CustomBackgroundConfig,
  DEFAULT_LOUPE_SETTINGS,
  FloatingDecalState,
  HoverPixelInfo,
  LoupeSettings,
  LoupeZoomFactor
} from '../types/studio';
import {
  applyBrushStroke,
  eraseMarqueeArea,
  getIslandAtCoord,
  restoreMarqueeArea
} from '../utils/uvEngine';
import {
  DecalStampConfig,
  applyPaintStroke,
  computeMirrorCanvasPoint,
  computeSeamWrappedPoints,
  formatCompactIslandLabel,
  getIslandSeamCrossovers
} from '../utils/studioCreativeEngine';
import { drawCustomBackgroundLayer } from '../utils/backgroundCompositor';
import { TouchTapRecord, classifyMultiTouchTap } from '../utils/touchGestures';

interface CanvasViewportProps {
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  originalCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  templateType: TemplateType;
  islands: UvIsland[];
  hasImage: boolean;
  hasCutAction: boolean;
  customBackground: CustomBackgroundConfig;
  customBgImage: HTMLImageElement | null;
  bleedMargin: number;
  toolMode: ToolMode;
  brushSize: number;
  brushHardness: number;
  showUvOverlay: boolean;
  uvOpacity: number;
  showUvLabels: boolean;
  showCompare: boolean;
  onToggleCompare: () => void;
  uvCalibrationEnabled: boolean;
  activeUvSection: UvSectionId;
  activeUvIslandName: string | null;
  onSelectUvIsland: (island: UvIsland) => void;
  transform: ImageTransform;
  onUpdateTransform: (next: ImageTransform) => void;
  onResetTransform: () => void;
  onCanvasMutated: (commitHistory: boolean, isCutAction?: boolean, actionLabel?: string) => void;
  onLiveCanvasMutated?: (regions: ReadonlySet<BodyRegionGroup> | 'all') => void;
  onRegisterRepaint?: (fn: (() => void) | null) => void;
  onZoomChange: (zoom: number) => void;
  onHoverPixel: (info: HoverPixelInfo | null) => void;
  onTriggerImport: () => void;
  onLoadDefaultSample: () => void;
  onOpenProjects: () => void;
  onClearCurrentSlot?: () => void;
  updateTrigger: number;
  // Creative Studio Tools
  paintColor?: string;
  paintOpacity?: number;
  symmetryEnabled?: boolean;
  clipToUv?: boolean;
  seamBridgeEnabled?: boolean;
  onSampleColor?: (hex: string, switchToPaint?: boolean) => void;
  decalConfig?: DecalStampConfig;
  decalCustomImage?: HTMLImageElement | null;
  floatingDecal?: FloatingDecalState | null;
  onUpdateFloatingDecal?: (next: FloatingDecalState | null) => void;
  onCommitFloatingDecal?: () => void;
  onCancelFloatingDecal?: () => void;
  loupeEnabled?: boolean;
  onToggleLoupe?: () => void;
  loupeSettings?: LoupeSettings;
  onUpdateLoupeSettings?: (patch: Partial<LoupeSettings>) => void;
  highlightedRegion?: BodyRegionGroup | null;
  onHoverRegion?: (region: BodyRegionGroup | null) => void;
  // Mobile bottom-right Editor | 3D switcher
  showMobileViewSwitcher?: boolean;
  onSwitchTo3D?: () => void;
  // Multi-touch gesture Undo / Redo callbacks
  onGestureUndo?: () => void;
  onGestureRedo?: () => void;
}

interface PendingTouchBrush {
  pointerId: number;
  mode: 'erase' | 'restore' | 'paint';
  startScreenX: number;
  startScreenY: number;
  startCanvasX: number;
  startCanvasY: number;
  hasPainted: boolean;
}

function getGroupStrokeColor(group: UvIsland['group']): string {
  if (group === 'torso') return '#0284C7';
  if (group === 'right_arm' || group === 'right_leg') return '#0EA5E9';
  return '#6366F1';
}

function islandMatchesSection(island: UvIsland, section: UvSectionId): boolean {
  if (section === 'torso') return island.group === 'torso';
  if (section === 'right_limb') return island.group === 'right_arm' || island.group === 'right_leg';
  return island.group === 'left_arm' || island.group === 'left_leg';
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  mainCanvasRef,
  originalCanvasRef,
  templateType,
  islands,
  hasImage,
  hasCutAction,
  customBackground,
  customBgImage,
  bleedMargin,
  toolMode,
  brushSize,
  brushHardness,
  showUvOverlay,
  uvOpacity,
  showUvLabels,
  showCompare,
  onToggleCompare,
  uvCalibrationEnabled,
  activeUvSection,
  activeUvIslandName,
  onSelectUvIsland,
  transform,
  onUpdateTransform,
  onResetTransform,
  onCanvasMutated,
  onLiveCanvasMutated,
  onRegisterRepaint,
  onZoomChange,
  onHoverPixel,
  onTriggerImport,
  onLoadDefaultSample,
  onOpenProjects,
  onClearCurrentSlot,
  updateTrigger,
  paintColor = '#38BDF8',
  paintOpacity = 1,
  symmetryEnabled = false,
  clipToUv = true,
  seamBridgeEnabled = true,
  onSampleColor,
  decalConfig,
  decalCustomImage = null,
  floatingDecal = null,
  onUpdateFloatingDecal,
  onCommitFloatingDecal,
  onCancelFloatingDecal,
  loupeEnabled = false,
  onToggleLoupe,
  loupeSettings = DEFAULT_LOUPE_SETTINGS,
  onUpdateLoupeSettings,
  highlightedRegion = null,
  onHoverRegion,
  showMobileViewSwitcher = false,
  onSwitchTo3D,
  onGestureUndo,
  onGestureRedo
}) => {
  const [loupeHex, setLoupeHex] = useState<string | null>(null);
  const [gestureHud, setGestureHud] = useState<{ id: number; label: string } | null>(null);
  const gestureHudTimerRef = useRef<number | null>(null);
  const flashGestureHud = useCallback((label: string) => {
    if (gestureHudTimerRef.current !== null) {
      window.clearTimeout(gestureHudTimerRef.current);
    }
    setGestureHud({ id: Date.now(), label });
    gestureHudTimerRef.current = window.setTimeout(() => {
      setGestureHud(null);
      gestureHudTimerRef.current = null;
    }, 950);
  }, []);
  useEffect(
    () => () => {
      if (gestureHudTimerRef.current !== null) {
        window.clearTimeout(gestureHudTimerRef.current);
      }
    },
    []
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const spec = getTemplateSpec(templateType);
  const canvasW = spec.width;
  const canvasH = spec.height;

  // Viewport Camera + Smooth Animated Tween Ref
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;
  const cameraAnimRef = useRef<number | null>(null);

  const cancelCameraAnim = useCallback(() => {
    if (cameraAnimRef.current !== null) {
      cancelAnimationFrame(cameraAnimRef.current);
      cameraAnimRef.current = null;
    }
  }, []);

  const animateCameraTo = useCallback(
    (targetZoom: number, targetPan: { x: number; y: number }, durationMs: number = 230) => {
      cancelCameraAnim();
      const startZoom = zoomRef.current;
      const startPan = { ...panRef.current };
      const startedAt = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        // Smooth cubic ease-out
        const ease = 1 - Math.pow(1 - t, 3);
        const curZoom = Number((startZoom + (targetZoom - startZoom) * ease).toFixed(4));
        const curPan = {
          x: startPan.x + (targetPan.x - startPan.x) * ease,
          y: startPan.y + (targetPan.y - startPan.y) * ease
        };
        setZoom(curZoom);
        setPan(curPan);
        if (t < 1) {
          cameraAnimRef.current = requestAnimationFrame(tick);
        } else {
          cameraAnimRef.current = null;
          setZoom(targetZoom);
          setPan(targetPan);
          onZoomChange(targetZoom);
        }
      };

      cameraAnimRef.current = requestAnimationFrame(tick);
    },
    [cancelCameraAnim, onZoomChange]
  );

  useEffect(() => () => cancelCameraAnim(), [cancelCameraAnim]);

  // Draggable Before/After Split Ratio (0.04..0.96)
  const [splitRatio, setSplitRatio] = useState<number>(0.5);
  const draggingSplitRef = useRef<boolean>(false);

  // Unified Pointer & Pinch-vs-Brush Gesture Guard State
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const touchGestureStartRef = useRef<
    Map<number, { startX: number; startY: number; startTime: number }>
  >(new Map());
  const completedTouchTapsRef = useRef<TouchTapRecord[]>([]);
  const maxTouchFingersRef = useRef<number>(0);
  const hadMultiTouchMoveRef = useRef<boolean>(false);
  const lastSingleTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinchStateRef = useRef<{
    dist: number;
    zoom: number;
    pan: { x: number; y: number };
    midX: number;
    midY: number;
  } | null>(null);
  const wasPinchGestureRef = useRef<boolean>(false);
  const pinchCooldownUntilRef = useRef<number>(0);

  // Touch brush deferral & pre-stroke rollback buffer (prevents pinch-to-zoom from punching erase dots!)
  const preStrokeSnapshotRef = useRef<ImageData | null>(null);
  const pendingTouchBrushRef = useRef<PendingTouchBrush | null>(null);

  const dragModeRef = useRef<
    | 'none'
    | 'pan'
    | 'erase'
    | 'restore'
    | 'paint'
    | 'marquee'
    | 'transform'
    | 'decal_move'
    | 'decal_resize'
    | 'decal_rotate'
  >('none');
  const decalDragOriginRef = useRef<{
    decal: FloatingDecalState;
    startCanvasX: number;
    startCanvasY: number;
    startDist: number;
    startAngle: number;
  } | null>(null);
  const lastScreenPtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastCanvasPtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const marqueeOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformOriginRef = useRef<ImageTransform>({ x: 0, y: 0, scale: 1 });

  const [spacePressed, setSpacePressed] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const [cursorCanvasPt, setCursorCanvasPt] = useState<{ x: number; y: number } | null>(null);
  const [cursorScreenPt, setCursorScreenPt] = useState<{ x: number; y: number } | null>(null);
  const [hoveredIsland, setHoveredIsland] = useState<UvIsland | null>(null);
  const [fitPulseCount, setFitPulseCount] = useState(0);

  const computeFitZoom = useCallback((): number | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const padX = 48;
    const padY = 64;
    const fitZoom = Math.min(
      (rect.width - padX) / canvasW,
      (rect.height - padY) / canvasH,
      2.2
    );
    return Math.max(0.25, Number(fitZoom.toFixed(3)));
  }, [canvasW, canvasH]);

  const fitToView = useCallback(
    (animated: boolean = false) => {
      const target = computeFitZoom();
      if (target === null) return;
      if (animated) {
        setFitPulseCount((c) => c + 1);
        animateCameraTo(target, { x: 0, y: 0 }, 260);
      } else {
        cancelCameraAnim();
        setZoom(target);
        setPan({ x: 0, y: 0 });
        onZoomChange(target);
      }
    },
    [computeFitZoom, animateCameraTo, cancelCameraAnim, onZoomChange]
  );

  useEffect(() => {
    fitToView(false);
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (panRef.current.x === 0 && panRef.current.y === 0) {
        fitToView(false);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToView]);

  const paintDisplayCanvases = useCallback(() => {
    const disp = displayCanvasRef.current;
    const src = mainCanvasRef.current;
    if (disp && src) {
      if (disp.width !== canvasW || disp.height !== canvasH) {
        disp.width = canvasW;
        disp.height = canvasH;
      }
      const ctx = disp.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        // Composite optional custom stripped background strictly outside UV islands
        if (hasImage && customBackground.mode !== 'transparent') {
          drawCustomBackgroundLayer(
            ctx,
            canvasW,
            canvasH,
            customBackground,
            templateType,
            islands,
            customBgImage,
            bleedMargin
          );
        }
        ctx.drawImage(src, 0, 0, canvasW, canvasH);
      }
    }

    const origDisp = originalPreviewCanvasRef.current;
    const origSrc = originalCanvasRef.current;
    if (origDisp && origSrc) {
      if (origDisp.width !== canvasW || origDisp.height !== canvasH) {
        origDisp.width = canvasW;
        origDisp.height = canvasH;
      }
      const oCtx = origDisp.getContext('2d');
      if (oCtx) {
        oCtx.clearRect(0, 0, canvasW, canvasH);
        oCtx.drawImage(origSrc, 0, 0, canvasW, canvasH);
      }
    }
  }, [
    canvasW,
    canvasH,
    mainCanvasRef,
    originalCanvasRef,
    hasImage,
    customBackground,
    templateType,
    islands,
    customBgImage,
    bleedMargin
  ]);

  useEffect(() => {
    paintDisplayCanvases();
  }, [paintDisplayCanvases, updateTrigger, showCompare, hasImage, templateType]);

  // Roll back any accidental touch brush pixels when a 2nd finger lands for pinch-zoom
  const cancelTouchBrushAndRollback = useCallback(() => {
    const pending = pendingTouchBrushRef.current;
    if (pending && pending.hasPainted && preStrokeSnapshotRef.current && mainCanvasRef.current) {
      const ctx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.putImageData(preStrokeSnapshotRef.current, 0, 0);
        paintDisplayCanvases();
        onCanvasMutated(false, false);
      }
    }
    pendingTouchBrushRef.current = null;
    preStrokeSnapshotRef.current = null;
    if (
      dragModeRef.current === 'erase' ||
      dragModeRef.current === 'restore' ||
      dragModeRef.current === 'paint'
    ) {
      dragModeRef.current = 'none';
    }
  }, [mainCanvasRef, paintDisplayCanvases, onCanvasMutated]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
      } else if (floatingDecal && e.key === 'Enter') {
        e.preventDefault();
        onCommitFloatingDecal?.();
      } else if (e.key === 'Escape') {
        if (floatingDecal) {
          e.preventDefault();
          onCancelFloatingDecal?.();
        } else if (marqueeBox) {
          setMarqueeBox(null);
        }
      } else if (
        floatingDecal &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        onUpdateFloatingDecal?.({
          ...floatingDecal,
          x: Math.max(0, Math.min(canvasW, floatingDecal.x + dx)),
          y: Math.max(0, Math.min(canvasH, floatingDecal.y + dy))
        });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && marqueeBox && hasImage) {
        e.preventDefault();
        handleMarqueeErase();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marqueeBox, hasImage, floatingDecal, canvasW, canvasH]);

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 + panRef.current.x;
      const centerY = rect.top + rect.height / 2 + panRef.current.y;
      const x = (clientX - centerX) / zoomRef.current + canvasW / 2;
      const y = (clientY - centerY) / zoomRef.current + canvasH / 2;
      return { x, y };
    },
    [canvasW, canvasH]
  );

  // Non-passive wheel listener for smooth cursor-anchored zoom (never triggers brush/tap)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelCameraAnim();
      cancelTouchBrushAndRollback();
      pinchCooldownUntilRef.current = performance.now() + 180;

      const rect = el.getBoundingClientRect();
      const mouseRelX = e.clientX - (rect.left + rect.width / 2);
      const mouseRelY = e.clientY - (rect.top + rect.height / 2);

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const prevZoom = zoomRef.current;
      const nextZoom = Math.max(0.25, Math.min(16, Number((prevZoom * factor).toFixed(4))));
      if (nextZoom === prevZoom) return;

      const scaleRatio = nextZoom / prevZoom;
      const nextPanX = mouseRelX - (mouseRelX - panRef.current.x) * scaleRatio;
      const nextPanY = mouseRelY - (mouseRelY - panRef.current.y) * scaleRatio;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
      onZoomChange(nextZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [onZoomChange, cancelTouchBrushAndRollback, cancelCameraAnim]);

  const stepZoom = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.28 : 1 / 1.28;
    const prevZoom = zoomRef.current;
    const nextZoom = Math.max(0.25, Math.min(16, Number((prevZoom * factor).toFixed(3))));
    if (nextZoom === prevZoom) return;
    const ratio = nextZoom / prevZoom;
    animateCameraTo(
      nextZoom,
      { x: panRef.current.x * ratio, y: panRef.current.y * ratio },
      210
    );
  };

  // Paint Customizable Precision Magnifier Loupe whenever cursor moves or settings change
  const drawPrecisionLoupe = useCallback(
    (cx: number, cy: number) => {
      if (!loupeEnabled || !hasImage) return;
      const loupe = loupeCanvasRef.current;
      const disp = displayCanvasRef.current;
      if (!loupe || !disp) return;
      const lctx = loupe.getContext('2d');
      if (!lctx) return;

      const size = loupeSettings.diameter;
      if (loupe.width !== size || loupe.height !== size) {
        loupe.width = size;
        loupe.height = size;
      }

      const mag = loupeSettings.zoom;
      const sampleSpan = size / mag;
      const sx = cx - sampleSpan / 2;
      const sy = cy - sampleSpan / 2;

      lctx.clearRect(0, 0, size, size);
      lctx.fillStyle = '#09111F';
      lctx.fillRect(0, 0, size, size);
      lctx.imageSmoothingEnabled = false;
      lctx.drawImage(disp, sx, sy, sampleSpan, sampleSpan, 0, 0, size, size);

      // Optional crisp 1px cell grid at >= 4× magnification
      if (loupeSettings.showPixelGrid && mag >= 4) {
        const offsetX = (Math.ceil(sx) - sx) * mag;
        const offsetY = (Math.ceil(sy) - sy) * mag;
        lctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        lctx.lineWidth = 1;
        lctx.beginPath();
        for (let gx = offsetX; gx < size; gx += mag) {
          const px = Math.round(gx) + 0.5;
          lctx.moveTo(px, 0);
          lctx.lineTo(px, size);
        }
        for (let gy = offsetY; gy < size; gy += mag) {
          const py = Math.round(gy) + 0.5;
          lctx.moveTo(0, py);
          lctx.lineTo(size, py);
        }
        lctx.stroke();
      }

      // Crisp center pixel crosshair + target pixel box
      const mid = size / 2;
      lctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      lctx.lineWidth = 1;
      lctx.beginPath();
      lctx.moveTo(mid, 0);
      lctx.lineTo(mid, mid - mag / 2 - 2);
      lctx.moveTo(mid, mid + mag / 2 + 2);
      lctx.lineTo(mid, size);
      lctx.moveTo(0, mid);
      lctx.lineTo(mid - mag / 2 - 2, mid);
      lctx.moveTo(mid + mag / 2 + 2, mid);
      lctx.lineTo(size, mid);
      lctx.stroke();

      lctx.strokeStyle = '#38BDF8';
      lctx.lineWidth = 1.5;
      lctx.strokeRect(mid - mag / 2, mid - mag / 2, mag, mag);

      // Sample exact center pixel HEX from working garment canvas
      if (loupeSettings.showHexReadout && mainCanvasRef.current) {
        const mctx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        const px = Math.floor(cx);
        const py = Math.floor(cy);
        if (mctx && px >= 0 && py >= 0 && px < canvasW && py < canvasH) {
          const d = mctx.getImageData(px, py, 1, 1).data;
          if (d[3] === 0) {
            setLoupeHex('ALPHA 0%');
          } else {
            const hex = `#${[d[0], d[1], d[2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase()}`;
            setLoupeHex(hex);
          }
        } else {
          setLoupeHex(null);
        }
      }
    },
    [loupeEnabled, hasImage, loupeSettings, mainCanvasRef, canvasW, canvasH]
  );

  useEffect(() => {
    if (loupeEnabled && cursorCanvasPt) {
      drawPrecisionLoupe(cursorCanvasPt.x, cursorCanvasPt.y);
    }
  }, [loupeEnabled, cursorCanvasPt, loupeSettings, updateTrigger, drawPrecisionLoupe]);

  // Register rAF-coalesced imperative repaint hook for zero-re-render 3D Direct Paint sync
  const paintDisplayCanvasesRef = useRef(paintDisplayCanvases);
  paintDisplayCanvasesRef.current = paintDisplayCanvases;
  const externalRepaintRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onRegisterRepaint) return;
    onRegisterRepaint(() => {
      if (externalRepaintRafRef.current !== null) return;
      externalRepaintRafRef.current = requestAnimationFrame(() => {
        externalRepaintRafRef.current = null;
        paintDisplayCanvasesRef.current();
      });
    });
    return () => {
      if (externalRepaintRafRef.current !== null) {
        cancelAnimationFrame(externalRepaintRafRef.current);
        externalRepaintRafRef.current = null;
      }
      onRegisterRepaint(null);
    };
  }, [onRegisterRepaint]);

  const applyStrokeWithSymmetry = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      mode: 'erase' | 'restore' | 'paint',
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ) => {
      const clipList = clipToUv && spec.hasUvIslands ? islands : null;
      const doSingle = (ax: number, ay: number, bx: number, by: number) => {
        if (mode === 'paint') {
          applyPaintStroke(
            ctx,
            ax,
            ay,
            bx,
            by,
            brushSize / 2,
            paintColor,
            brushHardness,
            paintOpacity,
            clipList || undefined
          );
        } else {
          if (clipList) {
            ctx.save();
            ctx.beginPath();
            for (const isl of clipList) {
              ctx.rect(isl.x, isl.y, isl.w, isl.h);
            }
            ctx.clip();
            applyBrushStroke(
              ctx,
              mode,
              ax,
              ay,
              bx,
              by,
              brushSize / 2,
              brushHardness,
              originalCanvasRef.current
            );
            ctx.restore();
          } else {
            applyBrushStroke(
              ctx,
              mode,
              ax,
              ay,
              bx,
              by,
              brushSize / 2,
              brushHardness,
              originalCanvasRef.current
            );
          }
        }
      };

      const doWithSeamBridge = (ax: number, ay: number, bx: number, by: number) => {
        doSingle(ax, ay, bx, by);
        if (seamBridgeEnabled && spec.hasUvIslands) {
          const r = brushSize / 2;
          const wrapsA = computeSeamWrappedPoints(ax, ay, r, islands, canvasW, canvasH);
          const wrapsB = computeSeamWrappedPoints(bx, by, r, islands, canvasW, canvasH);
          for (const wb of wrapsB) {
            const matchA = wrapsA.find((wa) => wa.island.name === wb.island.name);
            if (matchA) {
              doSingle(matchA.x, matchA.y, wb.x, wb.y);
            } else {
              doSingle(wb.x, wb.y, wb.x, wb.y);
            }
          }
        }
      };

      doWithSeamBridge(x0, y0, x1, y1);

      if (symmetryEnabled) {
        const m0 = computeMirrorCanvasPoint(x0, y0, islands, canvasW, canvasH);
        const m1 = computeMirrorCanvasPoint(x1, y1, islands, canvasW, canvasH);
        if (m0 && m1) {
          doWithSeamBridge(m0.x, m0.y, m1.x, m1.y);
        }
      }
    },
    [
      clipToUv,
      seamBridgeEnabled,
      spec.hasUvIslands,
      islands,
      brushSize,
      brushHardness,
      paintColor,
      paintOpacity,
      originalCanvasRef,
      symmetryEnabled,
      canvasW,
      canvasH
    ]
  );

  const emitHoverInfo = (cx: number, cy: number) => {
    const ix = Math.floor(cx);
    const iy = Math.floor(cy);
    if (ix < 0 || ix >= canvasW || iy < 0 || iy >= canvasH) {
      setHoveredIsland(null);
      onHoverRegion?.(null);
      onHoverPixel(null);
      return;
    }
    const island = spec.hasUvIslands ? getIslandAtCoord(ix, iy, islands, canvasW, canvasH) : null;
    setHoveredIsland(island);
    onHoverRegion?.(island?.group ?? null);
    let colorRgba: string | null = null;
    const main = mainCanvasRef.current;
    if (main && hasImage) {
      const ctx = main.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const p = ctx.getImageData(ix, iy, 1, 1).data;
        colorRgba =
          p[3] === 0 ? 'transparent' : `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p[3] / 255).toFixed(2)})`;
      }
    }
    onHoverPixel({ x: ix, y: iy, island, colorRgba });
  };

  const handleMarqueeErase = () => {
    if (!marqueeBox || !mainCanvasRef.current) return;
    const ctx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    eraseMarqueeArea(ctx, marqueeBox);
    setMarqueeBox(null);
    paintDisplayCanvases();
    onCanvasMutated(true, true, 'Marquee Cut');
  };

  const handleMarqueeRestore = () => {
    if (!marqueeBox || !mainCanvasRef.current || !originalCanvasRef.current) return;
    const ctx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    restoreMarqueeArea(ctx, originalCanvasRef.current, marqueeBox);
    setMarqueeBox(null);
    paintDisplayCanvases();
    onCanvasMutated(true, false, 'Marquee Restore');
  };

  // Unified Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement | null;
    if (
      draggingSplitRef.current ||
      targetEl?.closest('[data-testid="compare-split-handle"]') ||
      targetEl?.closest('[data-hud-control="true"]')
    ) {
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or simultaneously cancelled pointer events can safely skip capture
    }
    const now = performance.now();
    if (e.pointerType === 'touch') {
      if (activePointersRef.current.size === 0) {
        completedTouchTapsRef.current = [];
        maxTouchFingersRef.current = 0;
        hadMultiTouchMoveRef.current = false;
      }
      touchGestureStartRef.current.set(e.pointerId, {
        startX: e.clientX,
        startY: e.clientY,
        startTime: now
      });
    }
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch') {
      maxTouchFingersRef.current = Math.max(
        maxTouchFingersRef.current,
        activePointersRef.current.size
      );
    }

    // Two-finger pinch gesture on touchscreens: immediately roll back any pending 1st-finger brush touch!
    if (activePointersRef.current.size >= 2) {
      cancelCameraAnim();
      wasPinchGestureRef.current = true;
      cancelTouchBrushAndRollback();
      setMarqueeBox(null);

      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const rect = el.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect.left + rect.width / 2);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect.top + rect.height / 2);
      pinchStateRef.current =
        activePointersRef.current.size === 2
          ? {
              dist: Math.max(10, dist),
              zoom: zoomRef.current,
              pan: { ...panRef.current },
              midX,
              midY
            }
          : null;
      dragModeRef.current = 'none';
      return;
    }

    const canvasPt = clientToCanvas(e.clientX, e.clientY);
    lastScreenPtRef.current = { x: e.clientX, y: e.clientY };
    lastCanvasPtRef.current = canvasPt;

    if (e.button === 1 || spacePressed || toolMode === 'pan' || !hasImage) {
      cancelCameraAnim();
      dragModeRef.current = 'pan';
      return;
    }

    if (e.button !== 0) return;

    // When Before/After Compare is active, never allow Move/Transform drag to shift the garment
    if (toolMode === 'transform') {
      if (showCompare) {
        dragModeRef.current = 'pan';
        return;
      }
      dragModeRef.current = 'transform';
      transformOriginRef.current = { ...transform };
      return;
    }

    if (toolMode === 'align' && spec.hasUvIslands) {
      const clicked = getIslandAtCoord(
        Math.floor(canvasPt.x),
        Math.floor(canvasPt.y),
        islands,
        canvasW,
        canvasH
      );
      if (clicked) {
        onSelectUvIsland(clicked);
      } else {
        dragModeRef.current = 'pan';
      }
      return;
    }

    if (toolMode === 'marquee') {
      dragModeRef.current = 'marquee';
      const clampedX = Math.max(0, Math.min(canvasW, canvasPt.x));
      const clampedY = Math.max(0, Math.min(canvasH, canvasPt.y));
      marqueeOriginRef.current = { x: clampedX, y: clampedY };
      setMarqueeBox({ x: clampedX, y: clampedY, w: 0, h: 0 });
      return;
    }

    // Eyedropper Color Sampler (dedicated 'eyedropper' tool OR Alt+Click while painting)
    if (
      (toolMode === 'eyedropper' || (toolMode === 'paint' && e.altKey)) &&
      hasImage &&
      onSampleColor
    ) {
      const main = mainCanvasRef.current;
      const ctx = main?.getContext('2d', { willReadFrequently: true });
      const ix = Math.floor(canvasPt.x);
      const iy = Math.floor(canvasPt.y);
      if (ctx && ix >= 0 && iy >= 0 && ix < canvasW && iy < canvasH) {
        const px = ctx.getImageData(ix, iy, 1, 1).data;
        if (px[3] > 0) {
          const hex =
            '#' +
            [px[0], px[1], px[2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase();
          onSampleColor(hex, e.altKey);
        }
      }
      return;
    }

    // Floating Decal Layer interaction: check rotation handle, corner resize handles, or interior drag!
    if (floatingDecal && hasImage && onUpdateFloatingDecal) {
      const s = Math.max(8, floatingDecal.size);
      const aspect =
        floatingDecal.naturalHeight > 0
          ? floatingDecal.naturalWidth / floatingDecal.naturalHeight
          : 1;
      const drawW = aspect >= 1 ? s : s * aspect;
      const drawH = aspect >= 1 ? s / aspect : s;

      // Transform pointer into decal's local unrotated space
      const rad = (-floatingDecal.rotationDeg * Math.PI) / 180;
      const relX = canvasPt.x - floatingDecal.x;
      const relY = canvasPt.y - floatingDecal.y;
      const localX = relX * Math.cos(rad) - relY * Math.sin(rad);
      const localY = relX * Math.sin(rad) + relY * Math.cos(rad);
      const hitPad = Math.max(7, 11 / zoomRef.current);

      // 1. Top rotation lollipop handle at (0, -drawH/2 - 18/zoom)
      const rotHandleY = -drawH / 2 - 18 / zoomRef.current;
      if (Math.hypot(localX, localY - rotHandleY) <= hitPad) {
        dragModeRef.current = 'decal_rotate';
        decalDragOriginRef.current = {
          decal: { ...floatingDecal },
          startCanvasX: canvasPt.x,
          startCanvasY: canvasPt.y,
          startDist: 1,
          startAngle: Math.atan2(relY, relX)
        };
        return;
      }

      // 2. 4 corner resize handles
      const corners = [
        [-drawW / 2, -drawH / 2],
        [drawW / 2, -drawH / 2],
        [drawW / 2, drawH / 2],
        [-drawW / 2, drawH / 2]
      ];
      const hitCorner = corners.some(([cx, cy]) => Math.hypot(localX - cx, localY - cy) <= hitPad);
      if (hitCorner) {
        dragModeRef.current = 'decal_resize';
        decalDragOriginRef.current = {
          decal: { ...floatingDecal },
          startCanvasX: canvasPt.x,
          startCanvasY: canvasPt.y,
          startDist: Math.max(6, Math.hypot(relX, relY)),
          startAngle: 0
        };
        return;
      }

      // 3. Inside floating decal bounds -> smooth drag move!
      if (Math.abs(localX) <= drawW / 2 + 4 && Math.abs(localY) <= drawH / 2 + 4) {
        dragModeRef.current = 'decal_move';
        decalDragOriginRef.current = {
          decal: { ...floatingDecal },
          startCanvasX: canvasPt.x,
          startCanvasY: canvasPt.y,
          startDist: 1,
          startAngle: 0
        };
        return;
      }
    }

    if (toolMode === 'stamp' && decalConfig) {
      if (performance.now() < pinchCooldownUntilRef.current || wasPinchGestureRef.current) {
        return;
      }
      if (!decalCustomImage || !decalConfig.customImageUrl || !onUpdateFloatingDecal) return;
      const nextFloating: FloatingDecalState = {
        x: Math.round(Math.max(0, Math.min(canvasW, canvasPt.x))),
        y: Math.round(Math.max(0, Math.min(canvasH, canvasPt.y))),
        size: decalConfig.size,
        rotationDeg: decalConfig.rotationDeg,
        opacity: decalConfig.opacity,
        imageUrl: decalConfig.customImageUrl,
        name: decalConfig.customName || 'Custom Decal',
        naturalWidth: decalCustomImage.naturalWidth,
        naturalHeight: decalCustomImage.naturalHeight
      };
      onUpdateFloatingDecal(nextFloating);
      dragModeRef.current = 'decal_move';
      decalDragOriginRef.current = {
        decal: nextFloating,
        startCanvasX: canvasPt.x,
        startCanvasY: canvasPt.y,
        startDist: 1,
        startAngle: 0
      };
      return;
    }

    if (toolMode === 'erase' || toolMode === 'restore' || toolMode === 'paint') {
      if (performance.now() < pinchCooldownUntilRef.current || wasPinchGestureRef.current) {
        return;
      }

      const main = mainCanvasRef.current;
      const ctx = main?.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      if (e.pointerType === 'touch') {
        preStrokeSnapshotRef.current = ctx.getImageData(0, 0, main!.width, main!.height);
        pendingTouchBrushRef.current = {
          pointerId: e.pointerId,
          mode: toolMode,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startCanvasX: canvasPt.x,
          startCanvasY: canvasPt.y,
          hasPainted: false
        };
        dragModeRef.current = toolMode;
        return;
      }

      dragModeRef.current = toolMode;
      applyStrokeWithSymmetry(ctx, toolMode, canvasPt.x, canvasPt.y, canvasPt.x, canvasPt.y);
      paintDisplayCanvases();
      if (onLiveCanvasMutated) {
        if (!spec.hasUvIslands || symmetryEnabled) {
          onLiveCanvasMutated('all');
        } else {
          const hitIsl = getIslandAtCoord(Math.floor(canvasPt.x), Math.floor(canvasPt.y), islands, canvasW, canvasH);
          onLiveCanvasMutated(hitIsl ? new Set<BodyRegionGroup>([hitIsl.group]) : 'all');
        }
      } else {
        onCanvasMutated(false, toolMode === 'erase');
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingSplitRef.current) return;
    const el = containerRef.current;
    if (!el) return;

    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size >= 2 && pinchStateRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const rect = el.getBoundingClientRect();
      const curMidX = (pts[0].x + pts[1].x) / 2 - (rect.left + rect.width / 2);
      const curMidY = (pts[0].y + pts[1].y) / 2 - (rect.top + rect.height / 2);

      if (
        Math.abs(dist - pinchStateRef.current.dist) > 10 ||
        Math.hypot(curMidX - pinchStateRef.current.midX, curMidY - pinchStateRef.current.midY) > 10
      ) {
        hadMultiTouchMoveRef.current = true;
      }

      const ratio = dist / pinchStateRef.current.dist;
      const nextZoom = Math.max(0.25, Math.min(16, pinchStateRef.current.zoom * ratio));
      const actualRatio = nextZoom / pinchStateRef.current.zoom;
      const nextPanX =
        curMidX - (pinchStateRef.current.midX - pinchStateRef.current.pan.x) * actualRatio;
      const nextPanY =
        curMidY - (pinchStateRef.current.midY - pinchStateRef.current.pan.y) * actualRatio;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
      onZoomChange(nextZoom);
      return;
    }

    const canvasPt = clientToCanvas(e.clientX, e.clientY);
    const mode = dragModeRef.current;
    const isActivelyBrushing = mode === 'erase' || mode === 'restore' || mode === 'paint';

    if (!isActivelyBrushing) {
      const rect = el.getBoundingClientRect();
      setCursorCanvasPt(canvasPt);
      setCursorScreenPt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      emitHoverInfo(canvasPt.x, canvasPt.y);
    } else if (loupeEnabled) {
      drawPrecisionLoupe(canvasPt.x, canvasPt.y);
    }

    if (mode === 'none') return;

    if (mode === 'pan') {
      const dx = e.clientX - lastScreenPtRef.current.x;
      const dy = e.clientY - lastScreenPtRef.current.y;
      lastScreenPtRef.current = { x: e.clientX, y: e.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (mode === 'transform') {
      if (showCompare) return;
      const dx = (e.clientX - lastScreenPtRef.current.x) / zoomRef.current;
      const dy = (e.clientY - lastScreenPtRef.current.y) / zoomRef.current;
      onUpdateTransform({
        ...transformOriginRef.current,
        x: Math.round(transformOriginRef.current.x + dx),
        y: Math.round(transformOriginRef.current.y + dy)
      });
      return;
    }

    if (mode === 'marquee') {
      const curX = Math.max(0, Math.min(canvasW, canvasPt.x));
      const curY = Math.max(0, Math.min(canvasH, canvasPt.y));
      const ox = marqueeOriginRef.current.x;
      const oy = marqueeOriginRef.current.y;
      setMarqueeBox({
        x: Math.min(ox, curX),
        y: Math.min(oy, curY),
        w: Math.abs(curX - ox),
        h: Math.abs(curY - oy)
      });
      return;
    }

    if (mode === 'decal_move' && decalDragOriginRef.current && onUpdateFloatingDecal) {
      const origin = decalDragOriginRef.current;
      const dx = canvasPt.x - origin.startCanvasX;
      const dy = canvasPt.y - origin.startCanvasY;
      onUpdateFloatingDecal({
        ...origin.decal,
        x: Math.round(Math.max(0, Math.min(canvasW, origin.decal.x + dx))),
        y: Math.round(Math.max(0, Math.min(canvasH, origin.decal.y + dy)))
      });
      return;
    }

    if (mode === 'decal_resize' && decalDragOriginRef.current && onUpdateFloatingDecal) {
      const origin = decalDragOriginRef.current;
      const curDist = Math.max(6, Math.hypot(canvasPt.x - origin.decal.x, canvasPt.y - origin.decal.y));
      const scale = curDist / origin.startDist;
      const nextSize = Math.max(16, Math.min(200, Math.round(origin.decal.size * scale)));
      onUpdateFloatingDecal({
        ...origin.decal,
        size: nextSize
      });
      return;
    }

    if (mode === 'decal_rotate' && decalDragOriginRef.current && onUpdateFloatingDecal) {
      const origin = decalDragOriginRef.current;
      const curAngle = Math.atan2(canvasPt.y - origin.decal.y, canvasPt.x - origin.decal.x);
      const deltaDeg = ((curAngle - origin.startAngle) * 180) / Math.PI;
      let nextDeg = Math.round(origin.decal.rotationDeg + deltaDeg);
      if (e.shiftKey) {
        nextDeg = Math.round(nextDeg / 15) * 15;
      }
      while (nextDeg > 180) nextDeg -= 360;
      while (nextDeg < -180) nextDeg += 360;
      onUpdateFloatingDecal({
        ...origin.decal,
        rotationDeg: nextDeg
      });
      return;
    }

    if (mode === 'erase' || mode === 'restore' || mode === 'paint') {
      const main = mainCanvasRef.current;
      const ctx = main?.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const pending = pendingTouchBrushRef.current;
      if (pending && e.pointerType === 'touch') {
        if (!pending.hasPainted) {
          const movedPx = Math.hypot(
            e.clientX - pending.startScreenX,
            e.clientY - pending.startScreenY
          );
          if (movedPx < 4) return;
          pending.hasPainted = true;
          lastCanvasPtRef.current = { x: pending.startCanvasX, y: pending.startCanvasY };
        }
      }

      applyStrokeWithSymmetry(
        ctx,
        mode,
        lastCanvasPtRef.current.x,
        lastCanvasPtRef.current.y,
        canvasPt.x,
        canvasPt.y
      );
      lastCanvasPtRef.current = canvasPt;
      paintDisplayCanvases();
      if (onLiveCanvasMutated) {
        if (!spec.hasUvIslands || symmetryEnabled) {
          onLiveCanvasMutated('all');
        } else {
          const hitIsl = getIslandAtCoord(Math.floor(canvasPt.x), Math.floor(canvasPt.y), islands, canvasW, canvasH);
          onLiveCanvasMutated(hitIsl ? new Set<BodyRegionGroup>([hitIsl.group]) : 'all');
        }
      } else {
        onCanvasMutated(false, mode === 'erase');
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    activePointersRef.current.delete(e.pointerId);

    const startMeta = touchGestureStartRef.current.get(e.pointerId);
    if (e.pointerType === 'touch' && startMeta) {
      completedTouchTapsRef.current.push({
        startX: startMeta.startX,
        startY: startMeta.startY,
        endX: e.clientX,
        endY: e.clientY,
        startTime: startMeta.startTime,
        endTime: now
      });
      touchGestureStartRef.current.delete(e.pointerId);
    }

    if (wasPinchGestureRef.current) {
      pinchCooldownUntilRef.current = now + 220;
      if (activePointersRef.current.size < 2) {
        pinchStateRef.current = null;
      }
      if (activePointersRef.current.size === 0) {
        wasPinchGestureRef.current = false;
        const action = classifyMultiTouchTap(
          maxTouchFingersRef.current,
          completedTouchTapsRef.current,
          hadMultiTouchMoveRef.current
        );
        maxTouchFingersRef.current = 0;
        completedTouchTapsRef.current = [];
        hadMultiTouchMoveRef.current = false;
        if (action === 'undo') {
          onGestureUndo?.();
          flashGestureHud('Undo');
        } else if (action === 'redo') {
          onGestureRedo?.();
          flashGestureHud('Redo');
        }
      }
      pendingTouchBrushRef.current = null;
      preStrokeSnapshotRef.current = null;
      dragModeRef.current = 'none';
      return;
    }

    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }

    const mode = dragModeRef.current;
    dragModeRef.current = 'none';

    // Touch double-tap in Pan mode -> smoothly toggle between Fit View and 2× Zoom
    if (e.pointerType === 'touch' && mode === 'pan' && startMeta) {
      const moved = Math.hypot(e.clientX - startMeta.startX, e.clientY - startMeta.startY);
      if (moved < 10 && now - startMeta.startTime < 280) {
        const prevTap = lastSingleTapRef.current;
        if (
          prevTap &&
          now - prevTap.time < 320 &&
          Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 34
        ) {
          lastSingleTapRef.current = null;
          const fit = computeFitZoom() ?? 1;
          if (zoomRef.current > fit * 1.25) {
            fitToView(true);
            flashGestureHud('Fit View');
          } else {
            const targetZ = Math.min(4, Number((fit * 2.1).toFixed(3)));
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const rx = e.clientX - (rect.left + rect.width / 2);
              const ry = e.clientY - (rect.top + rect.height / 2);
              const ratio = targetZ / zoomRef.current;
              animateCameraTo(
                targetZ,
                {
                  x: rx - (rx - panRef.current.x) * ratio,
                  y: ry - (ry - panRef.current.y) * ratio
                },
                240
              );
            } else {
              animateCameraTo(targetZ, { x: 0, y: 0 }, 240);
            }
            flashGestureHud(`${Math.round(targetZ * 100)}% Zoom`);
          }
          return;
        }
        lastSingleTapRef.current = { x: e.clientX, y: e.clientY, time: now };
      }
    }

    const pending = pendingTouchBrushRef.current;
    if (pending && pending.pointerId === e.pointerId) {
      const actionLabel =
        pending.mode === 'paint'
          ? 'Paint Stroke'
          : pending.mode === 'erase'
          ? 'Erase Stroke'
          : 'Restore Stroke';
      if (!pending.hasPainted && performance.now() >= pinchCooldownUntilRef.current) {
        const main = mainCanvasRef.current;
        const ctx = main?.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          applyStrokeWithSymmetry(
            ctx,
            pending.mode,
            pending.startCanvasX,
            pending.startCanvasY,
            pending.startCanvasX,
            pending.startCanvasY
          );
          paintDisplayCanvases();
          onCanvasMutated(true, pending.mode === 'erase', actionLabel);
        }
      } else if (pending.hasPainted) {
        onCanvasMutated(true, pending.mode === 'erase', actionLabel);
      }
      pendingTouchBrushRef.current = null;
      preStrokeSnapshotRef.current = null;
      return;
    }

    if (mode === 'decal_move' || mode === 'decal_resize' || mode === 'decal_rotate') {
      decalDragOriginRef.current = null;
      return;
    }

    if (mode === 'erase' || mode === 'restore' || mode === 'paint') {
      const actionLabel =
        mode === 'paint' ? 'Paint Stroke' : mode === 'erase' ? 'Erase Stroke' : 'Restore Stroke';
      onCanvasMutated(true, mode === 'erase', actionLabel);
    } else if (mode === 'marquee' && marqueeBox && (marqueeBox.w < 2 || marqueeBox.h < 2)) {
      setMarqueeBox(null);
    }
  };

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    draggingSplitRef.current = true;
    dragModeRef.current = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const pt = clientToCanvas(e.clientX, e.clientY);
    const ratio = Math.max(0.04, Math.min(0.96, pt.x / canvasW));
    setSplitRatio(ratio);
  };

  const handleSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    draggingSplitRef.current = false;
  };

  const cursorClass =
    spacePressed || toolMode === 'pan' || !hasImage || (toolMode === 'transform' && showCompare)
      ? 'cursor-grab active:cursor-grabbing'
      : toolMode === 'erase' ||
        toolMode === 'restore' ||
        toolMode === 'paint' ||
        toolMode === 'eyedropper' ||
        toolMode === 'stamp'
      ? 'cursor-crosshair'
      : toolMode === 'transform'
      ? 'cursor-move'
      : toolMode === 'marquee'
      ? 'cursor-crosshair'
      : 'cursor-pointer';

  const scaledW = canvasW * zoom;
  const scaledH = canvasH * zoom;
  const mirrorCursorPt =
    symmetryEnabled && cursorCanvasPt
      ? computeMirrorCanvasPoint(cursorCanvasPt.x, cursorCanvasPt.y, islands, canvasW, canvasH)
      : null;
  const activeSeamCrossovers = hoveredIsland ? getIslandSeamCrossovers(hoveredIsland) : [];

  return (
    <div
      ref={containerRef}
      data-testid="viewport-2d-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        setCursorCanvasPt(null);
        setCursorScreenPt(null);
        setHoveredIsland(null);
        onHoverRegion?.(null);
        onHoverPixel(null);
      }}
      className={`relative w-full h-full heavenly-editor-bg overflow-hidden select-none touch-none ${cursorClass}`}
    >
      {/* Subtle Pastel Sky Dot Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-gradient(#B6CFF0_1px,transparent_1px)] [background-size:20px_20px]" />

      {/* Centered Transformed Artboard */}
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: `${canvasW}px`,
          height: `${canvasH}px`,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        <div className="relative w-full h-full checkerboard-surface shadow-[0_24px_60px_rgba(15,23,42,0.14)] ring-1 ring-[#C7DDF8]">
          {/* Working Garment Canvas (+ optional custom stripped background behind UV-stripped areas) */}
          <canvas
            ref={displayCanvasRef}
            data-testid="editor-2d-canvas"
            width={canvasW}
            height={canvasH}
            className="w-full h-full block [image-rendering:pixelated]"
          />

          {/* Before / After Original Comparison Layer */}
          {showCompare && hasImage && hasCutAction && (
            <>
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 ${(1 - splitRatio) * 100}% 0 0)` }}
              >
                <canvas
                  ref={originalPreviewCanvasRef}
                  width={canvasW}
                  height={canvasH}
                  className="w-full h-full block [image-rendering:pixelated]"
                />
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-h-surface/95 border border-h-border text-[9px] font-mono font-semibold uppercase tracking-wider text-h-text-2 shadow-xs">
                  Original
                </div>
              </div>
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-h-surface/95 border border-h-accent-border text-[9px] font-mono font-semibold uppercase tracking-wider text-h-accent-text pointer-events-none shadow-xs">
                Edited
              </div>
            </>
          )}

          {/* SVG UV Overlay / T-Shirt Chest Guide / Marquee / Brush Cursor */}
          <svg
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          >
            {zoom >= 4 && (
              <g opacity="0.22">
                <defs>
                  <pattern id="hcsPixelGrid" width="1" height="1" patternUnits="userSpaceOnUse">
                    <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#64748B" strokeWidth={0.5 / zoom} />
                  </pattern>
                </defs>
                <rect width={canvasW} height={canvasH} fill="url(#hcsPixelGrid)" />
              </g>
            )}

            {showUvOverlay && spec.hasUvIslands && (
              <g opacity={uvOpacity}>
                <defs>
                  {islands.map((isl, idx) => (
                    <clipPath key={`clip-${isl.name}`} id={`uv-isl-clip-${idx}`}>
                      <rect
                        x={isl.x + 2}
                        y={isl.y + 2}
                        width={Math.max(0, isl.w - 4)}
                        height={Math.max(0, isl.h - 4)}
                      />
                    </clipPath>
                  ))}
                </defs>
                {islands.map((isl, idx) => {
                  const isCalibHighlight =
                    uvCalibrationEnabled &&
                    (activeUvIslandName
                      ? isl.name === activeUvIslandName
                      : islandMatchesSection(isl, activeUvSection));
                  const isRegionLinked =
                    !isCalibHighlight && highlightedRegion === isl.group;
                  const stroke = isCalibHighlight
                    ? '#D97706'
                    : isRegionLinked
                    ? '#38BDF8'
                    : getGroupStrokeColor(isl.group);
                  const strokeWidth = (isCalibHighlight ? 2 : isRegionLinked ? 1.85 : 1.15) / zoom;
                  const fill = isCalibHighlight
                    ? 'rgba(245, 158, 11, 0.14)'
                    : isRegionLinked
                    ? 'rgba(56, 189, 248, 0.11)'
                    : 'transparent';
                  const lbl = showUvLabels ? formatCompactIslandLabel(isl) : null;
                  const pillW = lbl
                    ? Math.min(
                        isl.w - 6,
                        Math.max(
                          lbl.face.length * lbl.fontSize * 0.66,
                          lbl.prefix.length * lbl.prefixFontSize * 0.66
                        ) + 8
                      )
                    : 0;
                  const pillH = lbl
                    ? Math.min(isl.h - 6, lbl.fontSize + lbl.prefixFontSize + 7)
                    : 0;
                  return (
                    <g key={isl.name}>
                      <rect
                        x={isl.x}
                        y={isl.y}
                        width={isl.w}
                        height={isl.h}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                      />
                      {lbl && (
                        <g clipPath={`url(#uv-isl-clip-${idx})`}>
                          <rect
                            x={isl.x + (isl.w - pillW) / 2}
                            y={isl.y + (isl.h - pillH) / 2}
                            width={Math.max(0, pillW)}
                            height={Math.max(0, pillH)}
                            rx={3}
                            fill="rgba(7, 13, 24, 0.72)"
                          />
                          <text
                            x={isl.x + isl.w / 2}
                            y={isl.y + isl.h / 2 - lbl.fontSize * 0.48}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#94A3B8"
                            fontSize={lbl.prefixFontSize}
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="600"
                          >
                            {lbl.prefix}
                          </text>
                          <text
                            x={isl.x + isl.w / 2}
                            y={isl.y + isl.h / 2 + lbl.prefixFontSize * 0.62}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={stroke}
                            fontSize={lbl.fontSize}
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="700"
                          >
                            {lbl.face}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Interactive Seam Crossover Edge Markers on Hovered UV Island */}
            {showUvOverlay && spec.hasUvIslands && hoveredIsland && activeSeamCrossovers.length > 0 && (
              <g>
                {activeSeamCrossovers.map((seam) => {
                  const { x, y, w, h } = hoveredIsland;
                  let x1 = x;
                  let y1 = y;
                  let x2 = x + w;
                  let y2 = y;
                  let lx = x + w / 2;
                  let ly = y - 5 / zoom;
                  if (seam.edge === 'bottom') {
                    y1 = y + h;
                    y2 = y + h;
                    ly = y + h + 9 / zoom;
                  } else if (seam.edge === 'left') {
                    x2 = x;
                    y2 = y + h;
                    lx = x - 4 / zoom;
                    ly = y + h / 2;
                  } else if (seam.edge === 'right') {
                    x1 = x + w;
                    x2 = x + w;
                    y2 = y + h;
                    lx = x + w + 4 / zoom;
                    ly = y + h / 2;
                  }
                  return (
                    <g key={`${hoveredIsland.name}-${seam.edge}-${seam.label}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={seam.color}
                        strokeWidth={2.5 / zoom}
                        strokeLinecap="round"
                      />
                      <text
                        x={lx}
                        y={ly}
                        textAnchor={
                          seam.edge === 'left'
                            ? 'end'
                            : seam.edge === 'right'
                            ? 'start'
                            : 'middle'
                        }
                        dominantBaseline="central"
                        fill={seam.color}
                        fontSize={Math.max(6.5, 9 / Math.max(0.75, zoom * 0.85))}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="700"
                      >
                        {seam.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {showUvOverlay && !spec.hasUvIslands && (
              <g opacity={uvOpacity}>
                <rect
                  x={28}
                  y={28}
                  width={canvasW - 56}
                  height={canvasH - 56}
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth={1.25 / zoom}
                  strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                />
                <line
                  x1={canvasW / 2}
                  y1={16}
                  x2={canvasW / 2}
                  y2={canvasH - 16}
                  stroke="#0EA5E9"
                  strokeOpacity="0.45"
                  strokeWidth={1 / zoom}
                />
                {showUvLabels && (
                  <text
                    x={canvasW / 2}
                    y={18}
                    textAnchor="middle"
                    fill="#0284C7"
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    CHEST SAFE AREA · 512 × 512
                  </text>
                )}
              </g>
            )}

            {marqueeBox && marqueeBox.w > 0 && marqueeBox.h > 0 && (
              <rect
                x={marqueeBox.x}
                y={marqueeBox.y}
                width={marqueeBox.w}
                height={marqueeBox.h}
                fill="rgba(14, 165, 233, 0.16)"
                stroke="#0284C7"
                strokeWidth={1.5 / zoom}
                strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              />
            )}

            {/* Live Brush Cursor + Mirror Symmetry Ghost Cursor */}
            {hasImage &&
              cursorCanvasPt &&
              (toolMode === 'erase' || toolMode === 'restore' || toolMode === 'paint') && (
                <>
                  <circle
                    cx={cursorCanvasPt.x}
                    cy={cursorCanvasPt.y}
                    r={brushSize / 2}
                    fill={
                      toolMode === 'erase'
                        ? 'rgba(225, 29, 72, 0.12)'
                        : toolMode === 'paint'
                        ? `${paintColor}33`
                        : 'rgba(2, 132, 199, 0.12)'
                    }
                    stroke={
                      toolMode === 'erase'
                        ? '#E11D48'
                        : toolMode === 'paint'
                        ? paintColor
                        : '#0284C7'
                    }
                    strokeWidth={1.25 / zoom}
                  />
                  {mirrorCursorPt && (
                    <circle
                      cx={mirrorCursorPt.x}
                      cy={mirrorCursorPt.y}
                      r={brushSize / 2}
                      fill="none"
                      stroke="#38BDF8"
                      strokeDasharray={`${3 / zoom} ${2.5 / zoom}`}
                      strokeWidth={1.2 / zoom}
                    />
                  )}
                </>
              )}

            {/* Eyedropper Live Swatch Cursor Ring */}
            {hasImage && cursorCanvasPt && toolMode === 'eyedropper' && (
              <g transform={`translate(${cursorCanvasPt.x} ${cursorCanvasPt.y})`}>
                <circle
                  cx={0}
                  cy={0}
                  r={10 / zoom}
                  fill="none"
                  stroke={loupeHex && loupeHex.startsWith('#') ? loupeHex : paintColor}
                  strokeWidth={3.2 / zoom}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={12 / zoom}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={1 / zoom}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={1.6 / zoom}
                  fill="#38BDF8"
                />
              </g>
            )}

            {/* Movable / Resizable / Rotatable Floating Decal Layer (before baking!) */}
            {hasImage && floatingDecal && (
              <>
                {(() => {
                  const s = Math.max(8, floatingDecal.size);
                  const aspect =
                    floatingDecal.naturalHeight > 0
                      ? floatingDecal.naturalWidth / floatingDecal.naturalHeight
                      : 1;
                  const drawW = aspect >= 1 ? s : s * aspect;
                  const drawH = aspect >= 1 ? s / aspect : s;
                  const handleR = 4.2 / zoom;
                  const rotY = -drawH / 2 - 18 / zoom;
                  const mirrored = symmetryEnabled
                    ? computeMirrorCanvasPoint(
                        floatingDecal.x,
                        floatingDecal.y,
                        islands,
                        canvasW,
                        canvasH
                      )
                    : null;
                  return (
                    <>
                      {mirrored && (
                        <g
                          transform={`translate(${mirrored.x} ${mirrored.y}) rotate(${-floatingDecal.rotationDeg})`}
                        >
                          <image
                            href={floatingDecal.imageUrl}
                            x={-drawW / 2}
                            y={-drawH / 2}
                            width={drawW}
                            height={drawH}
                            opacity={floatingDecal.opacity}
                            preserveAspectRatio="xMidYMid meet"
                          />
                          <rect
                            x={-drawW / 2}
                            y={-drawH / 2}
                            width={drawW}
                            height={drawH}
                            fill="none"
                            stroke="#A855F7"
                            strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                            strokeWidth={1.25 / zoom}
                          />
                        </g>
                      )}
                      <g
                        data-testid="floating-decal-svg-layer"
                        transform={`translate(${floatingDecal.x} ${floatingDecal.y}) rotate(${floatingDecal.rotationDeg})`}
                      >
                        <image
                          href={floatingDecal.imageUrl}
                          x={-drawW / 2}
                          y={-drawH / 2}
                          width={drawW}
                          height={drawH}
                          opacity={floatingDecal.opacity}
                          preserveAspectRatio="xMidYMid meet"
                        />
                        <rect
                          x={-drawW / 2}
                          y={-drawH / 2}
                          width={drawW}
                          height={drawH}
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth={1.6 / zoom}
                        />
                        {/* Rotation Lollipop Stem + Handle */}
                        <line
                          x1={0}
                          y1={-drawH / 2}
                          x2={0}
                          y2={rotY}
                          stroke="#38BDF8"
                          strokeWidth={1.3 / zoom}
                        />
                        <circle
                          cx={0}
                          cy={rotY}
                          r={handleR * 1.15}
                          fill="#0F172A"
                          stroke="#38BDF8"
                          strokeWidth={1.6 / zoom}
                        />
                        {/* 4 Corner Resize Handles */}
                        {[
                          [-drawW / 2, -drawH / 2],
                          [drawW / 2, -drawH / 2],
                          [drawW / 2, drawH / 2],
                          [-drawW / 2, drawH / 2]
                        ].map(([cx, cy], idx) => (
                          <rect
                            key={idx}
                            x={cx - handleR}
                            y={cy - handleR}
                            width={handleR * 2}
                            height={handleR * 2}
                            rx={1.4 / zoom}
                            fill="#F8FAFC"
                            stroke="#0284C7"
                            strokeWidth={1.5 / zoom}
                          />
                        ))}
                      </g>
                    </>
                  );
                })()}
              </>
            )}

            {/* Live Custom PNG Decal Placement Ghost (+ Mirror Ghost) when no floating decal active */}
            {hasImage && !floatingDecal && cursorCanvasPt && toolMode === 'stamp' && decalConfig && (
              <>
                {(() => {
                  const s = Math.max(8, decalConfig.size);
                  const aspect =
                    decalCustomImage && decalCustomImage.naturalHeight > 0
                      ? decalCustomImage.naturalWidth / decalCustomImage.naturalHeight
                      : 1;
                  const drawW = aspect >= 1 ? s : s * aspect;
                  const drawH = aspect >= 1 ? s / aspect : s;
                  return (
                    <>
                      <g
                        transform={`translate(${cursorCanvasPt.x} ${cursorCanvasPt.y}) rotate(${decalConfig.rotationDeg})`}
                      >
                        {decalConfig.customImageUrl && decalCustomImage && (
                          <image
                            href={decalConfig.customImageUrl}
                            x={-drawW / 2}
                            y={-drawH / 2}
                            width={drawW}
                            height={drawH}
                            opacity={Math.max(0.2, decalConfig.opacity * 0.8)}
                            preserveAspectRatio="xMidYMid meet"
                          />
                        )}
                        <rect
                          x={-drawW / 2}
                          y={-drawH / 2}
                          width={drawW}
                          height={drawH}
                          rx={3 / zoom}
                          fill={decalCustomImage ? 'none' : 'rgba(56, 189, 248, 0.1)'}
                          stroke="#38BDF8"
                          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                          strokeWidth={1.25 / zoom}
                        />
                        <line
                          x1={-4 / zoom}
                          y1={0}
                          x2={4 / zoom}
                          y2={0}
                          stroke="#38BDF8"
                          strokeWidth={1 / zoom}
                        />
                        <line
                          x1={0}
                          y1={-4 / zoom}
                          x2={0}
                          y2={4 / zoom}
                          stroke="#38BDF8"
                          strokeWidth={1 / zoom}
                        />
                      </g>
                      {mirrorCursorPt && (
                        <g
                          transform={`translate(${mirrorCursorPt.x} ${mirrorCursorPt.y}) rotate(${-decalConfig.rotationDeg})`}
                        >
                          {decalConfig.customImageUrl && decalCustomImage && (
                            <image
                              href={decalConfig.customImageUrl}
                              x={-drawW / 2}
                              y={-drawH / 2}
                              width={drawW}
                              height={drawH}
                              opacity={Math.max(0.18, decalConfig.opacity * 0.55)}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          )}
                          <rect
                            x={-drawW / 2}
                            y={-drawH / 2}
                            width={drawW}
                            height={drawH}
                            rx={3 / zoom}
                            fill="none"
                            stroke="#A855F7"
                            strokeDasharray={`${3 / zoom} ${3 / zoom}`}
                            strokeWidth={1.1 / zoom}
                          />
                        </g>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Floating Decal Commit / Cancel Action Bar */}
      <AnimatePresence>
        {floatingDecal && hasImage && (
          <motion.div
            key="floating-decal-bar"
            data-testid="floating-decal-bar"
            data-hud-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-h-surface/96 border border-h-accent-border rounded-2xl px-2.5 py-1.5 shadow-[0_12px_32px_rgba(2,6,23,0.35)] whitespace-nowrap"
          >
            <span className="text-[11px] font-mono text-h-text-2 pr-1.5 border-r border-h-border-soft hidden sm:inline">
              {Math.round(floatingDecal.x)},{Math.round(floatingDecal.y)} · {Math.round(floatingDecal.size)}px · {Math.round(floatingDecal.rotationDeg)}°
            </span>
            <button
              type="button"
              data-testid="commit-floating-decal-btn"
              onClick={() => onCommitFloatingDecal?.()}
              className="px-2.5 py-1 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Decal
            </button>
            <button
              type="button"
              data-testid="cancel-floating-decal-btn"
              onClick={() => onCancelFloatingDecal?.()}
              className="px-2 py-1 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-h-text-2 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stamp Empty Helper Pill */}
      <AnimatePresence>
        {toolMode === 'stamp' && hasImage && !decalCustomImage && !floatingDecal && (
          <motion.div
            key="stamp-empty-hint"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-2xl bg-h-surface/95 border border-h-border text-[11px] font-medium text-h-text-2 shadow-sm pointer-events-none whitespace-nowrap"
          >
            Upload a custom PNG in Inspector → <span className="text-h-accent-text font-semibold">Custom PNG Decals</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customizable Precision Magnifier Pixel Loupe */}
      <AnimatePresence>
        {loupeEnabled && hasImage && cursorCanvasPt && cursorScreenPt && (
          <motion.div
            key="precision-loupe"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.14 }}
            style={{
              left: `${Math.max(
                12,
                Math.min(
                  (containerRef.current?.clientWidth ?? 400) - loupeSettings.diameter - 16,
                  cursorScreenPt.x + 22
                )
              )}px`,
              top: `${Math.max(12, cursorScreenPt.y - loupeSettings.diameter - 20)}px`
            }}
            className="absolute z-30 pointer-events-none flex flex-col items-center gap-1"
          >
            <div
              style={{
                width: `${loupeSettings.diameter}px`,
                height: `${loupeSettings.diameter}px`
              }}
              className="rounded-full overflow-hidden border-2 border-h-accent shadow-[0_14px_32px_rgba(2,132,199,0.28)] bg-slate-950"
            >
              <canvas
                ref={loupeCanvasRef}
                width={loupeSettings.diameter}
                height={loupeSettings.diameter}
                className="w-full h-full block [image-rendering:pixelated]"
              />
            </div>
            <div className="px-2 py-0.5 rounded-md bg-h-surface/95 border border-h-border text-[9px] font-mono font-semibold text-h-accent-text shadow-xs flex items-center gap-1.5 whitespace-nowrap">
              <span>
                {loupeSettings.zoom}× · {Math.round(cursorCanvasPt.x)},{Math.round(cursorCanvasPt.y)}
              </span>
              {loupeSettings.showHexReadout && loupeHex && (
                <>
                  <span className="text-h-border">·</span>
                  {loupeHex.startsWith('#') && (
                    <span
                      className="w-2.5 h-2.5 rounded-xs border border-white/25 inline-block shrink-0"
                      style={{ backgroundColor: loupeHex }}
                    />
                  )}
                  <span className="text-h-text-2">{loupeHex}</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real Draggable Before/After Split Handle (wide 40px capture zone, isolated from Move/Erase tools) */}
      {showCompare && hasImage && hasCutAction && (
        <div
          data-testid="compare-split-handle"
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          onPointerCancel={handleSplitPointerUp}
          style={{
            left: `calc(50% + ${pan.x + (splitRatio - 0.5) * scaledW}px)`,
            top: `calc(50% + ${pan.y - scaledH / 2}px)`,
            height: `${scaledH}px`
          }}
          className="absolute -translate-x-1/2 w-10 cursor-ew-resize z-30 flex items-center justify-center group touch-none"
        >
          <div className="w-0.5 h-full bg-h-accent shadow-[0_0_8px_rgba(2,132,199,0.5)] pointer-events-none" />
          <div className="absolute w-8 h-8 rounded-full bg-h-surface border-2 border-h-accent text-h-accent-text flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform pointer-events-none">
            <Columns2 className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Marquee Floating Action Bar */}
      <AnimatePresence>
        {marqueeBox && marqueeBox.w >= 3 && marqueeBox.h >= 3 && hasImage && (
          <motion.div
            key="marquee-bar"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            data-hud-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-h-surface/95 border border-h-border rounded-2xl px-2.5 py-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.12)]"
          >
            <span className="text-[11px] font-mono text-h-text-2 pr-1.5 border-r border-h-border-soft">
              {Math.round(marqueeBox.w)}×{Math.round(marqueeBox.h)} px
            </span>
            <button
              type="button"
              onClick={handleMarqueeErase}
              className="px-2.5 py-1 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-400/35 text-rose-400 text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Eraser className="w-3.5 h-3.5" />
              Cut Inside
            </button>
            <button
              type="button"
              onClick={handleMarqueeRestore}
              className="px-2.5 py-1 rounded-xl bg-h-accent-soft hover:bg-h-accent-soft border border-h-accent-border text-h-accent-text text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore
            </button>
            <button
              type="button"
              onClick={() => setMarqueeBox(null)}
              title="Clear Selection (Esc)"
              className="p-1 rounded-lg text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transform Active Helper */}
      <AnimatePresence>
        {toolMode === 'transform' && hasImage && (
          <motion.div
            key="transform-helper"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            data-hud-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-h-surface/95 border border-h-accent-border rounded-2xl px-3 py-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.1)] text-xs whitespace-nowrap"
          >
            {showCompare ? (
              <span className="text-amber-400 font-medium">
                Compare active · Drag divider to inspect (exit Compare to move artwork)
              </span>
            ) : (
              <>
                <span className="text-h-text-2 font-medium">
                  Drag to move ·{' '}
                  <span className="font-mono text-h-accent-text">
                    {transform.x}, {transform.y} px · {Math.round(transform.scale * 100)}%
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onResetTransform}
                  className="px-2 py-0.5 rounded-lg bg-h-surface-3 hover:bg-h-accent-soft text-h-accent-text text-[11px] font-semibold cursor-pointer"
                >
                  Reset
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State Overlay */}
      {!hasImage && (
        <div
          data-hud-control="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-auto bg-h-canvas/65"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="max-w-md w-full bg-h-surface border border-h-border rounded-3xl p-7 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)] space-y-5"
          >
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-h-accent-text">
                {spec.label} Slot
              </p>
              <h2 className="font-display text-xl font-bold text-h-text tracking-tight">
                Start with a template or sample
              </h2>
              <p className="text-xs text-h-text-2 leading-relaxed">
                Drop a PNG anywhere, paste from clipboard, or load a sample garment. Target format:{' '}
                <span className="font-mono font-semibold text-h-text">
                  {canvasW} × {canvasH} px
                </span>
                . Other clothing slots stay preserved automatically.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onTriggerImport}
                data-testid="empty-import-btn"
                className="px-4 py-2.5 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Image
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onLoadDefaultSample}
                data-testid="empty-sample-btn"
                className="px-3.5 py-2.5 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-h-text text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-h-accent-text" />
                Sample
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onOpenProjects}
                className="px-3 py-2.5 rounded-xl bg-h-surface hover:bg-h-surface-2 border border-h-border text-h-text-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Projects
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Top-Right Remove / Reset Imported Template Pill (isolated from canvas pointer events) */}
      <AnimatePresence>
        {hasImage && onClearCurrentSlot && (
          <motion.div
            key="remove-2d-template-wrap"
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.16 }}
            data-hud-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute top-3 right-3 z-20"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onClearCurrentSlot}
              data-testid="editor-remove-template-btn"
              title={`Remove imported ${spec.shortLabel} template`}
              aria-label={`Remove imported ${spec.shortLabel} template`}
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-h-border bg-h-surface/95 hover:border-rose-400/45 hover:text-rose-400 text-h-text-2 text-xs font-medium flex items-center gap-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Remove</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom-Left Compact Zoom + 4× Precision Loupe Control (isolated from canvas pointerdown) */}
      <div
        data-hud-control="true"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 bg-h-surface/95 border border-h-border rounded-2xl p-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
      >
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => stepZoom('out')}
          title="Zoom Out"
          data-testid="zoom-out-btn"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-h-text-2 hover:text-h-text hover:bg-h-surface-3 cursor-pointer transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => fitToView(true)}
          title="Smooth Fit Canvas to Viewport"
          data-testid="zoom-fit-pct-btn"
          className="px-2 h-8 rounded-xl text-[11px] font-mono font-semibold tabular-nums text-h-text hover:bg-h-surface-3 cursor-pointer transition-colors"
        >
          {Math.round(zoom * 100)}%
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => stepZoom('in')}
          title="Zoom In"
          data-testid="zoom-in-btn"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-h-text-2 hover:text-h-text hover:bg-h-surface-3 cursor-pointer transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => fitToView(true)}
          title="Reset View"
          data-testid="zoom-reset-btn"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-h-text-2 hover:text-h-text hover:bg-h-surface-3 cursor-pointer transition-colors"
        >
          <motion.span
            key={fitPulseCount}
            initial={fitPulseCount > 0 ? { scale: 0.72, rotate: -18 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="flex items-center justify-center"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </motion.span>
        </motion.button>

        {onToggleLoupe && hasImage && (
          <>
            <div className="w-px h-4 bg-h-border-soft mx-0.5" />
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={onToggleLoupe}
              title={`Toggle ${loupeSettings.zoom}× Precision Pixel Loupe`}
              aria-label="Toggle precision pixel loupe"
              data-testid="toggle-loupe-btn"
              className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                loupeEnabled
                  ? 'bg-h-accent-soft text-h-accent-text'
                  : 'text-h-text-2 hover:text-h-text hover:bg-h-surface-3'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
            </motion.button>
            {loupeEnabled && onUpdateLoupeSettings && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  const steps: LoupeZoomFactor[] = [2, 4, 6, 8, 12];
                  const idx = steps.indexOf(loupeSettings.zoom);
                  const next = steps[(idx + 1) % steps.length];
                  onUpdateLoupeSettings({ zoom: next });
                }}
                title="Cycle Loupe Magnification (2× / 4× / 6× / 8× / 12×)"
                data-testid="cycle-loupe-zoom-btn"
                className="h-7 px-1.5 rounded-lg bg-h-accent-soft/80 hover:bg-h-accent-soft text-[10px] font-mono font-bold text-h-accent-text cursor-pointer transition-colors"
              >
                {loupeSettings.zoom}×
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* Bottom-Right Cluster: Cut-Gated Compare Toggle + Mobile Editor | 3D Switcher */}
      <div
        data-hud-control="true"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5"
      >
        <AnimatePresence>
          {hasImage && hasCutAction && (
            <motion.button
              key="compare-2d-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              transition={{ duration: 0.18 }}
              whileTap={{ scale: 0.96 }}
              onClick={onToggleCompare}
              data-testid="toggle-compare-btn"
              className={`h-10 px-2.5 sm:px-3 rounded-2xl border text-xs font-semibold flex items-center gap-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap ${
                showCompare
                  ? 'bg-h-accent border-h-accent text-white'
                  : 'bg-h-surface/95 border-h-border text-h-text hover:border-h-accent-border'
              }`}
            >
              {showCompare ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Columns2 className="w-3.5 h-3.5 text-h-accent-text" />
              )}
              <span className="hidden sm:inline">Compare</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Mobile Bottom-Right Editor | 3D View Switcher (relocated cleanly from mobile top bar!) */}
        {showMobileViewSwitcher && onSwitchTo3D && (
          <div
            data-testid="mobile-editor-view-switcher"
            className="flex md:hidden items-center bg-h-surface/95 border border-h-border rounded-2xl p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            <div className="h-8 px-2.5 rounded-xl bg-h-accent text-white text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap">
              <PencilLine className="w-3.5 h-3.5" />
              <span>Editor</span>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onSwitchTo3D}
              data-testid="mobile-switch-3d-btn"
              className="h-8 px-2.5 rounded-xl text-[11px] font-semibold text-h-muted hover:text-h-text flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D</span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Transient 2D Touch Gesture Feedback Pill (Undo / Redo / Fit / Zoom) — top-center to keep main vision clear */}
      <AnimatePresence>
        {gestureHud && (
          <motion.div
            key={gestureHud.id}
            data-testid="viewport-2d-gesture-pill"
            initial={{ opacity: 0, scale: 0.9, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
            className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-4 py-1.5 rounded-2xl bg-h-surface/98 border border-h-accent-border shadow-xl text-xs font-semibold text-h-accent-text tracking-wide whitespace-nowrap ${
              toolMode === 'marquee' ||
              toolMode === 'transform' ||
              (uvCalibrationEnabled && spec.hasUvIslands) ||
              Boolean(floatingDecal)
                ? 'top-14'
                : 'top-3.5'
            }`}
          >
            {gestureHud.label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
