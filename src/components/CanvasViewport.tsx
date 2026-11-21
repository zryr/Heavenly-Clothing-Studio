import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Crosshair,
  Scissors,
  Eraser,
  Hand,
  RotateCcw,
  Check,
  Split,
  Trash2,
  Upload,
  Info,
  Move,
  Sliders,
  Copy,
  Code2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  Layers,
  ChevronRight,
  Minimize2,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Undo2,
  Redo2,
  Expand,
  ShieldCheck,
  Plus,
  Minus
} from 'lucide-react';
import {
  ROBLOX_SHIRT_UV_ISLANDS,
  ROBLOX_PANTS_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  ToolMode,
  MarqueeBox,
  TemplateType,
  UvIsland
} from '../types/uv';
import { getIslandAtCoord, eraseMarqueeArea, eraseBrushCircle } from '../utils/uvEngine';

export type UvSectionId = 'torso' | 'right_arm' | 'left_arm';

interface Props {
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  originalCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  originalImageSourceRef?: React.RefObject<HTMLCanvasElement | null>;
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  showWireframe: boolean;
  setShowWireframe: (show: boolean) => void;
  templateType: TemplateType;
  brushSize: number;
  setBrushSize: (size: number) => void;
  onCanvasModified: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  debugMode?: boolean;
  onHoverCoordChange?: (info: { x: number; y: number; island: UvIsland | null; colorRgba: string | null } | null) => void;
  onUploadClick?: () => void;
  conformBannerInfo?: {
    originalWidth: number;
    originalHeight: number;
    mode: 'scale' | 'pad' | 'crop';
    fileName: string;
    onSwitchMode: (mode: 'scale' | 'pad' | 'crop') => void;
    onDismiss: () => void;
  } | null;
  // Dynamic line alignment & debug
  islands: UvIsland[];
  onUpdateIslands: (newIslands: UvIsland[]) => void;
  onResetIslands: () => void;
  onOpenDebugModal: () => void;
  onCopyCoordinates: () => void;
}

export const CanvasViewport: React.FC<Props> = ({
  mainCanvasRef,
  originalCanvasRef,
  originalImageSourceRef,
  toolMode,
  setToolMode,
  showWireframe,
  setShowWireframe,
  templateType,
  brushSize,
  setBrushSize,
  onCanvasModified,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  debugMode = false,
  onHoverCoordChange,
  onUploadClick,
  conformBannerInfo,
  islands,
  onUpdateIslands,
  onResetIslands,
  onOpenDebugModal,
  onCopyCoordinates
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Marquee selection state
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const [isDraggingMarquee, setIsDraggingMarquee] = useState<boolean>(false);
  const marqueeStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Brush state
  const isBrushingRef = useRef<boolean>(false);
  const [mousePosOnCanvas, setMousePosOnCanvas] = useState<{ x: number; y: number } | null>(null);

  // Split view before/after slider
  const [showSplitView, setShowSplitView] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(0.5);
  const [showPixelGrid, setShowPixelGrid] = useState<boolean>(true);
  const [showIslandLabels, setShowIslandLabels] = useState<boolean>(true);
  const [hoveredIsland, setHoveredIsland] = useState<UvIsland | null>(null);

  // --- 3-SECTION ALIGNMENT STATE ---
  // Section 1: Torso (Top)
  // Section 2: Right Arm / Leg (Bottom Left)
  // Section 3: Left Arm / Leg (Bottom Right)
  const [selectedSection, setSelectedSection] = useState<UvSectionId | null>('torso');
  const [showSectionController, setShowSectionController] = useState<boolean>(false);
  const [isControllerMinimized, setIsControllerMinimized] = useState<boolean>(true);
  const [nudgeScope, setNudgeScope] = useState<'section' | 'single'>('section');
  const [controllerTab, setControllerTab] = useState<'move' | 'extend'>('move');
  const [selectedIslandName, setSelectedIslandName] = useState<string | null>(null);
  const [nudgeStep, setNudgeStep] = useState<number>(1); // 1, 2, 5, 10, 25
  const [quickCopied, setQuickCopied] = useState<boolean>(false);
  const [customExtendW, setCustomExtendW] = useState<string>('');
  const [customExtendH, setCustomExtendH] = useState<string>('');
  // Active edge line being adjusted ('left' | 'right' | 'top' | 'bottom' | null)
  const [activeExtendEdge, setActiveExtendEdge] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);

  // Transparent line mode (turns wireframe lines transparent/see-through when Extend or Move is on)
  const [transparentLinesEnabled, setTransparentLinesEnabled] = useState<boolean>(true);
  const [lineOpacity, setLineOpacity] = useState<number>(0.3); // 30% see-through opacity

  // Determine if transparent lines are active
  const isTransparentMode = useMemo(() => {
    return showWireframe && showSectionController && transparentLinesEnabled && (controllerTab === 'extend' || controllerTab === 'move');
  }, [showWireframe, showSectionController, transparentLinesEnabled, controllerTab]);

  // Brush action mode: Erase (transparent) vs Restore (paint back original image pixels)
  const [brushAction, setBrushAction] = useState<'erase' | 'restore'>('erase');
  const brushDidModifyRef = useRef<boolean>(false);

  // Manual numeric shift text box state
  const [customShiftX, setCustomShiftX] = useState<string>('');
  const [customShiftY, setCustomShiftY] = useState<string>('');

  // Active handle / body dragging state
  const [activeDrag, setActiveDrag] = useState<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se';
    startClientX: number;
    startClientY: number;
    initialCoords: Map<string, { x: number; y: number; w: number; h: number }>;
  } | null>(null);

  // Touch tracking for mobile gestures
  const touchStartRef = useRef<{
    startX: number;
    startY: number;
    initialDistance?: number;
    initialZoom?: number;
    initialOffset?: { x: number; y: number };
  }>({ startX: 0, startY: 0 });

  const activeIslands = useMemo(() => {
    return islands && islands.length > 0 ? islands : (templateType === 'shirt' ? ROBLOX_SHIRT_UV_ISLANDS : ROBLOX_PANTS_UV_ISLANDS);
  }, [islands, templateType]);

  // Section grouping mapping
  const sectionGroups = useMemo(() => {
    const isShirt = templateType === 'shirt';
    return {
      torso: 'torso',
      right_arm: isShirt ? 'right_arm' : 'right_leg',
      left_arm: isShirt ? 'left_arm' : 'left_leg'
    };
  }, [templateType]);

  // Get islands for the active section
  const currentSectionIslands = useMemo(() => {
    if (!selectedSection) return [];
    const groupName = sectionGroups[selectedSection];
    return activeIslands.filter((isl) => isl.group === groupName);
  }, [selectedSection, sectionGroups, activeIslands]);

  // Section bounding box
  const sectionBounds = useMemo(() => {
    if (currentSectionIslands.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const isl of currentSectionIslands) {
      if (isl.x < minX) minX = isl.x;
      if (isl.y < minY) minY = isl.y;
      if (isl.x + isl.w > maxX) maxX = isl.x + isl.w;
      if (isl.y + isl.h > maxY) maxY = isl.y + isl.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [currentSectionIslands]);

  // Center and fit canvas in container
  const centerCanvas = useCallback((customZoom?: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    let targetZoom = customZoom;
    if (targetZoom === undefined) {
      const padW = Math.max(16, rect.width * 0.08);
      const padH = Math.max(16, rect.height * 0.08);
      const fitScale = Math.min(
        (rect.width - padW) / TEMPLATE_WIDTH,
        (rect.height - padH) / TEMPLATE_HEIGHT
      );
      targetZoom = Math.min(Math.max(Number(fitScale.toFixed(2)), 0.35), 2.5);
    }

    setZoom(targetZoom);
    const targetW = TEMPLATE_WIDTH * targetZoom;
    const targetH = TEMPLATE_HEIGHT * targetZoom;

    setPanOffset({
      x: Math.round((rect.width - targetW) / 2),
      y: Math.round((rect.height - targetH) / 2)
    });
  }, []);

  // Auto-fit on mount and resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let hasInitiallyCentered = false;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 40 && height > 40 && !hasInitiallyCentered) {
          centerCanvas();
          hasInitiallyCentered = true;
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [centerCanvas]);

  // Convert client viewport coordinates to exact 585x559 canvas pixel coordinates
  const clientToCanvasCoord = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const canvasX = Math.floor(((clientX - rect.left) / rect.width) * TEMPLATE_WIDTH);
    const canvasY = Math.floor(((clientY - rect.top) / rect.height) * TEMPLATE_HEIGHT);

    return {
      x: Math.max(0, Math.min(TEMPLATE_WIDTH - 1, canvasX)),
      y: Math.max(0, Math.min(TEMPLATE_HEIGHT - 1, canvasY))
    };
  }, [mainCanvasRef]);

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const originX = cursorX - panOffset.x;
    const originY = cursorY - panOffset.y;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(Math.max(Number((zoom * zoomFactor).toFixed(2)), 0.25), 14);

    const scaleRatio = newZoom / zoom;
    const newPanX = cursorX - originX * scaleRatio;
    const newPanY = cursorY - originY * scaleRatio;

    setZoom(newZoom);
    setPanOffset({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Identify which of the 3 sections a coordinate belongs to
  const getSectionFromCoord = useCallback((canvasX: number, canvasY: number): UvSectionId => {
    const isShirt = templateType === 'shirt';
    const island = getIslandAtCoord(canvasX, canvasY, activeIslands);
    if (island) {
      if (island.group === 'torso') return 'torso';
      if (island.group === (isShirt ? 'right_arm' : 'right_leg')) return 'right_arm';
      if (island.group === (isShirt ? 'left_arm' : 'left_leg')) return 'left_arm';
    }

    // Geometry based fallback (Top vs Bottom-Left vs Bottom-Right)
    if (canvasY < 310) {
      return 'torso';
    }
    if (canvasX < 280) {
      return 'right_arm';
    }
    return 'left_arm';
  }, [templateType, activeIslands]);

  // Shift section by exact delta (X, Y)
  const handleNudgeDelta = useCallback((dx: number, dy: number) => {
    if (!selectedSection) return;
    const targetGroup = sectionGroups[selectedSection];
    const effectiveIslandName = selectedIslandName || currentSectionIslands[0]?.name;

    const updated = activeIslands.map((isl) => {
      const isTarget =
        nudgeScope === 'section'
          ? isl.group === targetGroup
          : isl.name === effectiveIslandName;

      if (isTarget) {
        return {
          ...isl,
          x: Math.round(Math.max(0, Math.min(TEMPLATE_WIDTH - isl.w, isl.x + dx))),
          y: Math.round(Math.max(0, Math.min(TEMPLATE_HEIGHT - isl.h, isl.y + dy)))
        };
      }
      return isl;
    });

    onUpdateIslands(updated);
  }, [selectedSection, sectionGroups, nudgeScope, selectedIslandName, currentSectionIslands, activeIslands, onUpdateIslands]);

  // Quick arrow nudge handler with custom step
  const handleNudge = useCallback((dirX: number, dirY: number, step: number = nudgeStep) => {
    handleNudgeDelta(dirX * step, dirY * step);
  }, [handleNudgeDelta, nudgeStep]);

  // Smooth pointer-event repeat timers for mobile touch & desktop click-and-hold
  const nudgeIntervalRef = useRef<number | null>(null);
  const nudgeTimeoutRef = useRef<number | null>(null);
  const isPointerActiveRef = useRef<boolean>(false);

  const stopNudgeRepeat = useCallback(() => {
    isPointerActiveRef.current = false;
    if (nudgeTimeoutRef.current !== null) {
      window.clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = null;
    }
    if (nudgeIntervalRef.current !== null) {
      window.clearInterval(nudgeIntervalRef.current);
      nudgeIntervalRef.current = null;
    }
  }, []);

  const startNudgeRepeat = useCallback((dirX: number, dirY: number) => {
    stopNudgeRepeat();
    isPointerActiveRef.current = true;
    handleNudge(dirX, dirY);

    // If held down, begin repeat after 300ms
    nudgeTimeoutRef.current = window.setTimeout(() => {
      if (!isPointerActiveRef.current) return;
      nudgeIntervalRef.current = window.setInterval(() => {
        handleNudge(dirX, dirY);
      }, 75);
    }, 300);
  }, [handleNudge, stopNudgeRepeat]);

  // Extend or contract section/island boundaries (left, right, top, bottom, or bleed margin)
  const handleExtendDelta = useCallback((
    edge: 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height' | 'bleed',
    amount: number
  ) => {
    if (!selectedSection) return;
    const targetGroup = sectionGroups[selectedSection];
    const effectiveIslandName = selectedIslandName || currentSectionIslands[0]?.name;

    // Calculate section bounding box limits
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const isl of activeIslands) {
      if (isl.group === targetGroup) {
        if (isl.x < minX) minX = isl.x;
        if (isl.y < minY) minY = isl.y;
        if (isl.x + isl.w > maxX) maxX = isl.x + isl.w;
        if (isl.y + isl.h > maxY) maxY = isl.y + isl.h;
      }
    }

    const updated = activeIslands.map((isl) => {
      if (nudgeScope === 'section') {
        if (isl.group !== targetGroup) return isl;

        let { x, y, w, h } = isl;

        if (edge === 'left') {
          // Push left boundary of leftmost faces outward to left
          if (isl.x <= minX + 2) {
            const newX = Math.max(0, Math.min(x + w - 4, x - amount));
            const diff = x - newX;
            x = newX;
            w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + diff));
          }
        } else if (edge === 'right') {
          // Push right boundary of rightmost faces outward to right
          if (isl.x + isl.w >= maxX - 2) {
            w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + amount));
          }
        } else if (edge === 'top') {
          // Push top boundary of topmost faces outward upward
          if (isl.y <= minY + 2) {
            const newY = Math.max(0, Math.min(y + h - 4, y - amount));
            const diff = y - newY;
            y = newY;
            h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + diff));
          }
        } else if (edge === 'bottom') {
          // Push bottom boundary of bottommost faces outward downward
          if (isl.y + isl.h >= maxY - 2) {
            h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + amount));
          }
        } else if (edge === 'width') {
          // Symmetrical width expand from left and right outer boundaries
          if (isl.x <= minX + 2) {
            const newX = Math.max(0, x - amount);
            w += (x - newX);
            x = newX;
          }
          if (isl.x + isl.w >= maxX - 2) {
            w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + amount));
          }
        } else if (edge === 'height') {
          // Symmetrical height expand from top and bottom outer boundaries
          if (isl.y <= minY + 2) {
            const newY = Math.max(0, y - amount);
            h += (y - newY);
            y = newY;
          }
          if (isl.y + isl.h >= maxY - 2) {
            h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + amount));
          }
        } else if (edge === 'bleed') {
          // Bleed margin on all 4 outer boundaries
          if (isl.x <= minX + 2) {
            const newX = Math.max(0, x - amount);
            w += (x - newX);
            x = newX;
          }
          if (isl.x + isl.w >= maxX - 2) {
            w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + amount));
          }
          if (isl.y <= minY + 2) {
            const newY = Math.max(0, y - amount);
            h += (y - newY);
            y = newY;
          }
          if (isl.y + isl.h >= maxY - 2) {
            h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + amount));
          }
        }

        return {
          ...isl,
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h)
        };
      }

      // Single Island Scope
      if (isl.name !== effectiveIslandName) return isl;

      let { x, y, w, h } = isl;

      if (edge === 'left') {
        const newX = Math.max(0, Math.min(x + w - 4, x - amount));
        const diff = x - newX;
        x = newX;
        w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + diff));
      } else if (edge === 'right') {
        w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + amount));
      } else if (edge === 'top') {
        const newY = Math.max(0, Math.min(y + h - 4, y - amount));
        const diff = y - newY;
        y = newY;
        h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + diff));
      } else if (edge === 'bottom') {
        h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + amount));
      } else if (edge === 'width') {
        const half = Math.round(amount / 2);
        const newX = Math.max(0, x - half);
        x = newX;
        w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + amount));
      } else if (edge === 'height') {
        const half = Math.round(amount / 2);
        const newY = Math.max(0, y - half);
        y = newY;
        h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + amount));
      } else if (edge === 'bleed') {
        const newX = Math.max(0, x - amount);
        const newY = Math.max(0, y - amount);
        const diffX = x - newX;
        const diffY = y - newY;
        x = newX;
        y = newY;
        w = Math.max(4, Math.min(TEMPLATE_WIDTH - x, w + diffX + amount));
        h = Math.max(4, Math.min(TEMPLATE_HEIGHT - y, h + diffY + amount));
      }

      return {
        ...isl,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h)
      };
    });

    onUpdateIslands(updated);
  }, [selectedSection, sectionGroups, nudgeScope, selectedIslandName, currentSectionIslands, activeIslands, onUpdateIslands]);

  // Extend all individual faces with padding (bleed protection) so no internal seams get clipped
  const handleExtendAllFacesBleed = useCallback((amount: number) => {
    if (!selectedSection) return;
    const targetGroup = sectionGroups[selectedSection];

    const updated = activeIslands.map((isl) => {
      const isTarget =
        nudgeScope === 'section'
          ? isl.group === targetGroup
          : isl.name === (selectedIslandName || currentSectionIslands[0]?.name);

      if (!isTarget) return isl;

      const newX = Math.max(0, isl.x - amount);
      const newY = Math.max(0, isl.y - amount);
      const diffX = isl.x - newX;
      const diffY = isl.y - newY;

      return {
        ...isl,
        x: Math.round(newX),
        y: Math.round(newY),
        w: Math.round(Math.max(4, Math.min(TEMPLATE_WIDTH - newX, isl.w + diffX + amount))),
        h: Math.round(Math.max(4, Math.min(TEMPLATE_HEIGHT - newY, isl.h + diffY + amount)))
      };
    });

    onUpdateIslands(updated);
  }, [selectedSection, sectionGroups, nudgeScope, selectedIslandName, currentSectionIslands, activeIslands, onUpdateIslands]);

  const startExtendRepeat = useCallback((
    edge: 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height' | 'bleed',
    amount: number
  ) => {
    stopNudgeRepeat();
    isPointerActiveRef.current = true;
    handleExtendDelta(edge, amount);

    nudgeTimeoutRef.current = window.setTimeout(() => {
      if (!isPointerActiveRef.current) return;
      nudgeIntervalRef.current = window.setInterval(() => {
        handleExtendDelta(edge, amount);
      }, 75);
    }, 300);
  }, [handleExtendDelta, stopNudgeRepeat]);

  // Set direct dimension
  const handleSetDirectDimension = useCallback((field: 'w' | 'h', value: number) => {
    if (!selectedSection || value <= 0) return;
    const targetGroup = sectionGroups[selectedSection];
    const effectiveIslandName = selectedIslandName || currentSectionIslands[0]?.name;

    const updated = activeIslands.map((isl) => {
      const isTarget =
        nudgeScope === 'section'
          ? isl.group === targetGroup
          : isl.name === effectiveIslandName;

      if (!isTarget) return isl;

      if (field === 'w') {
        return {
          ...isl,
          w: Math.max(4, Math.min(TEMPLATE_WIDTH - isl.x, Math.round(value)))
        };
      } else {
        return {
          ...isl,
          h: Math.max(4, Math.min(TEMPLATE_HEIGHT - isl.y, Math.round(value)))
        };
      }
    });

    onUpdateIslands(updated);
  }, [selectedSection, sectionGroups, nudgeScope, selectedIslandName, currentSectionIslands, activeIslands, onUpdateIslands]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopNudgeRepeat();
  }, [stopNudgeRepeat]);

  // Unified Brush applicator (Erase vs Restore)
  const applyBrush = useCallback((coordX: number, coordY: number) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (brushAction === 'erase') {
      eraseBrushCircle(ctx, coordX, coordY, brushSize);
      brushDidModifyRef.current = true;
    } else {
      // Restore mode: draw original pristine pixels inside the brush circle
      const sourceCanvas = originalImageSourceRef?.current || originalCanvasRef?.current;
      if (sourceCanvas) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(coordX, coordY, brushSize, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(sourceCanvas, 0, 0);
        ctx.restore();
        brushDidModifyRef.current = true;
      }
    }
  }, [mainCanvasRef, originalImageSourceRef, originalCanvasRef, brushAction, brushSize]);

  // Apply custom typed shift from text inputs
  const handleApplyCustomShift = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const shiftX = parseInt(customShiftX, 10) || 0;
    const shiftY = parseInt(customShiftY, 10) || 0;
    if (shiftX !== 0 || shiftY !== 0) {
      handleNudgeDelta(shiftX, shiftY);
      setCustomShiftX('');
      setCustomShiftY('');
    }
  };

  // Direct absolute X / Y position change
  const handleSetSectionOrigin = (field: 'x' | 'y', value: number) => {
    if (!sectionBounds || !selectedSection) return;
    const currentVal = field === 'x' ? sectionBounds.x : sectionBounds.y;
    const delta = value - currentVal;
    if (field === 'x') {
      handleNudgeDelta(delta, 0);
    } else {
      handleNudgeDelta(0, delta);
    }
  };

  // Quick copy coordinates handler (formats pristine TypeScript code to hardcode into uv.ts)
  const handleQuickCopy = useCallback((format: 'ts' | 'json' = 'ts') => {
    const constName = templateType === 'shirt' ? 'ROBLOX_SHIRT_UV_ISLANDS' : 'ROBLOX_PANTS_UV_ISLANDS';
    const textToCopy = format === 'ts'
      ? `// Roblox ${templateType === 'shirt' ? 'Shirt' : 'Pants'} Calibrated UV Island Coordinates\n// Ready to hardcode into src/types/uv.ts\nexport const ${constName}: UvIsland[] = [\n` +
        activeIslands.map((isl) =>
          `  { name: ${JSON.stringify(isl.name)}, x: ${Math.round(isl.x)}, y: ${Math.round(isl.y)}, w: ${Math.round(isl.w)}, h: ${Math.round(isl.h)}, group: ${JSON.stringify(isl.group)}${isl.description ? `, description: ${JSON.stringify(isl.description)}` : ''} }`
        ).join(',\n') +
        `\n];\n`
      : JSON.stringify(
          activeIslands.map(({ name, x, y, w, h, group, description }) => ({
            name,
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h),
            group,
            description
          })),
          null,
          2
        );

    navigator.clipboard.writeText(textToCopy).then(() => {
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 3000);
      onCopyCoordinates();
    }).catch(() => {
      onCopyCoordinates();
    });
  }, [templateType, activeIslands, onCopyCoordinates]);

  // Reset current section to default positions
  const handleResetCurrentSection = () => {
    if (!selectedSection) return;
    const targetGroup = sectionGroups[selectedSection];
    const defaults = templateType === 'shirt' ? ROBLOX_SHIRT_UV_ISLANDS : ROBLOX_PANTS_UV_ISLANDS;

    const updated = activeIslands.map((isl) => {
      if (isl.group === targetGroup) {
        const orig = defaults.find((d) => d.name === isl.name);
        return orig ? { ...orig } : isl;
      }
      return isl;
    });

    onUpdateIslands(updated);
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent) => {
    // Never treat clicks on UI buttons, inputs, or control panels as canvas clicks
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, [data-interactive="true"]')) {
      return;
    }

    if (e.button === 1 || (toolMode === 'pan' && !showSectionController) || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX - panOffset.x,
        y: e.clientY - panOffset.y
      };
      return;
    }

    if (e.button === 0) {
      const coord = clientToCanvasCoord(e.clientX, e.clientY);
      if (!coord) return;

      // Only switch active section if Move Sections is ALREADY open and active
      if (showSectionController && toolMode !== 'brush' && toolMode !== 'marquee') {
        const sec = getSectionFromCoord(coord.x, coord.y);
        setSelectedSection(sec);
        const clickedIsland = getIslandAtCoord(coord.x, coord.y, activeIslands);
        if (clickedIsland) {
          setSelectedIslandName(clickedIsland.name);
        }
      }

      if (toolMode === 'marquee') {
        setIsDraggingMarquee(true);
        marqueeStartRef.current = { x: coord.x, y: coord.y };
        setMarqueeBox({ x: coord.x, y: coord.y, w: 0, h: 0 });
      } else if (toolMode === 'brush') {
        isBrushingRef.current = true;
        applyBrush(coord.x, coord.y);
      }
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, [data-interactive="true"]')) {
      return;
    }

    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
      return;
    }

    const coord = clientToCanvasCoord(e.clientX, e.clientY);
    if (!coord) {
      setMousePosOnCanvas(null);
      setHoveredIsland(null);
      if (onHoverCoordChange) onHoverCoordChange(null);
      return;
    }

    setMousePosOnCanvas(coord);
    const island = getIslandAtCoord(coord.x, coord.y, activeIslands);
    setHoveredIsland(island);

    let colorRgba: string | null = null;
    const canvas = mainCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          const pixel = ctx.getImageData(coord.x, coord.y, 1, 1).data;
          colorRgba = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${(pixel[3] / 255).toFixed(2)})`;
        } catch {}
      }
    }

    if (onHoverCoordChange) {
      onHoverCoordChange({ x: coord.x, y: coord.y, island, colorRgba });
    }

    // Drag Marquee Box
    if (isDraggingMarquee) {
      const startX = marqueeStartRef.current.x;
      const startY = marqueeStartRef.current.y;
      const x = Math.min(startX, coord.x);
      const y = Math.min(startY, coord.y);
      const w = Math.abs(coord.x - startX);
      const h = Math.abs(coord.y - startY);
      setMarqueeBox({ x, y, w, h });
    }

    // Brush Drag
    if (isBrushingRef.current && toolMode === 'brush') {
      applyBrush(coord.x, coord.y);
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingMarquee(false);
    isBrushingRef.current = false;
    setActiveDrag(null);
    if (brushDidModifyRef.current) {
      brushDidModifyRef.current = false;
      onCanvasModified();
    }
  };

  // Touch Handlers for Mobile Devices
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, [data-interactive="true"]')) {
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const coord = clientToCanvasCoord(touch.clientX, touch.clientY);

      touchStartRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        initialOffset: { ...panOffset }
      };

      if (coord) {
        if (showSectionController && toolMode !== 'brush' && toolMode !== 'marquee') {
          const sec = getSectionFromCoord(coord.x, coord.y);
          setSelectedSection(sec);
          const clickedIsland = getIslandAtCoord(coord.x, coord.y, activeIslands);
          if (clickedIsland) {
            setSelectedIslandName(clickedIsland.name);
          }
        }
      }

      if (toolMode === 'marquee' && coord) {
        setIsDraggingMarquee(true);
        marqueeStartRef.current = { x: coord.x, y: coord.y };
        setMarqueeBox({ x: coord.x, y: coord.y, w: 0, h: 0 });
      } else if (toolMode === 'brush' && coord) {
        isBrushingRef.current = true;
        applyBrush(coord.x, coord.y);
      } else if (toolMode === 'pan') {
        setIsPanning(true);
        panStartRef.current = {
          x: touch.clientX - panOffset.x,
          y: touch.clientY - panOffset.y
        };
      }
    } else if (e.touches.length === 2) {
      // 2-finger pinch zoom
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      touchStartRef.current = {
        startX: (t1.clientX + t2.clientX) / 2,
        startY: (t1.clientY + t2.clientY) / 2,
        initialDistance: dist,
        initialZoom: zoom,
        initialOffset: { ...panOffset }
      };
      setIsPanning(false);
      setIsDraggingMarquee(false);
      isBrushingRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, [data-interactive="true"]')) {
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const coord = clientToCanvasCoord(touch.clientX, touch.clientY);

      if (isDraggingMarquee && coord) {
        const startX = marqueeStartRef.current.x;
        const startY = marqueeStartRef.current.y;
        setMarqueeBox({
          x: Math.min(startX, coord.x),
          y: Math.min(startY, coord.y),
          w: Math.abs(coord.x - startX),
          h: Math.abs(coord.y - startY)
        });
      } else if (isBrushingRef.current && coord && toolMode === 'brush') {
        applyBrush(coord.x, coord.y);
      } else if (isPanning) {
        setPanOffset({
          x: touch.clientX - panStartRef.current.x,
          y: touch.clientY - panStartRef.current.y
        });
      }
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      if (touchStartRef.current.initialDistance && touchStartRef.current.initialZoom) {
        const factor = dist / touchStartRef.current.initialDistance;
        const newZoom = Math.min(Math.max(Number((touchStartRef.current.initialZoom * factor).toFixed(2)), 0.3), 8);
        setZoom(newZoom);

        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const initMidX = touchStartRef.current.startX;
        const initMidY = touchStartRef.current.startY;
        const initOffset = touchStartRef.current.initialOffset || panOffset;

        setPanOffset({
          x: initOffset.x + (midX - initMidX),
          y: initOffset.y + (midY - initMidY)
        });
      }
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    setIsDraggingMarquee(false);
    isBrushingRef.current = false;
    if (brushDidModifyRef.current) {
      brushDidModifyRef.current = false;
      onCanvasModified();
    }
  };

  // Erase Marquee selection
  const handleClearMarquee = () => {
    if (!marqueeBox || marqueeBox.w <= 0 || marqueeBox.h <= 0) return;
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    eraseMarqueeArea(ctx, marqueeBox);
    setMarqueeBox(null);
    onCanvasModified();
  };

  // Keyboard arrow nudge support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (marqueeBox) {
          e.preventDefault();
          handleClearMarquee();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (showSectionController && controllerTab === 'extend') {
          if (activeExtendEdge === 'bottom') {
            // When bottom line is active, Up contracts bottom line upward
            handleExtendDelta('bottom', e.shiftKey ? nudgeStep : -nudgeStep);
          } else {
            // Up moves top line upward (extends outward, or contracts if Shift)
            handleExtendDelta('top', e.shiftKey ? -nudgeStep : nudgeStep);
            setActiveExtendEdge('top');
          }
        } else {
          handleNudge(0, -1, e.shiftKey ? 5 : nudgeStep);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (showSectionController && controllerTab === 'extend') {
          if (activeExtendEdge === 'top') {
            // When top line is active, Down contracts top line downward
            handleExtendDelta('top', e.shiftKey ? nudgeStep : -nudgeStep);
          } else {
            // Down moves bottom line downward (extends outward, or contracts if Shift)
            handleExtendDelta('bottom', e.shiftKey ? -nudgeStep : nudgeStep);
            setActiveExtendEdge('bottom');
          }
        } else {
          handleNudge(0, 1, e.shiftKey ? 5 : nudgeStep);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (showSectionController && controllerTab === 'extend') {
          if (activeExtendEdge === 'right') {
            // When right line is active, Left contracts right line leftward
            handleExtendDelta('right', e.shiftKey ? nudgeStep : -nudgeStep);
          } else {
            // Left moves left line leftward (extends outward, or contracts if Shift)
            handleExtendDelta('left', e.shiftKey ? -nudgeStep : nudgeStep);
            setActiveExtendEdge('left');
          }
        } else {
          handleNudge(-1, 0, e.shiftKey ? 5 : nudgeStep);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (showSectionController && controllerTab === 'extend') {
          if (activeExtendEdge === 'left') {
            // When left line is active, Right contracts left line rightward
            handleExtendDelta('left', e.shiftKey ? nudgeStep : -nudgeStep);
          } else {
            // Right moves right line rightward (extends outward, or contracts if Shift)
            handleExtendDelta('right', e.shiftKey ? -nudgeStep : nudgeStep);
            setActiveExtendEdge('right');
          }
        } else {
          handleNudge(1, 0, e.shiftKey ? 5 : nudgeStep);
        }
      } else if (e.key === '+' || e.key === '=') {
        if (showSectionController && controllerTab === 'extend') {
          e.preventDefault();
          handleExtendDelta(activeExtendEdge || 'bleed', nudgeStep);
        }
      } else if (e.key === '-' || e.key === '_') {
        if (showSectionController && controllerTab === 'extend') {
          e.preventDefault();
          handleExtendDelta(activeExtendEdge || 'bleed', -nudgeStep);
        }
      } else if (e.key === '1') {
        setSelectedSection('torso');
        setShowSectionController(true);
      } else if (e.key === '2') {
        setSelectedSection('right_arm');
        setShowSectionController(true);
      } else if (e.key === '3') {
        setSelectedSection('left_arm');
        setShowSectionController(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [marqueeBox, nudgeStep, showSectionController, controllerTab, activeExtendEdge, handleNudge, handleExtendDelta]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseLeave={() => {
        setIsPanning(false);
        setIsDraggingMarquee(false);
        isBrushingRef.current = false;
        setActiveDrag(null);
        setMousePosOnCanvas(null);
        setHoveredIsland(null);
        if (onHoverCoordChange) onHoverCoordChange(null);
        if (brushDidModifyRef.current) {
          brushDidModifyRef.current = false;
          onCanvasModified();
        }
      }}
      className="relative flex-1 w-full h-full overflow-hidden bg-[#07090e] select-none touch-none"
      style={{
        cursor:
          isPanning
            ? 'grabbing'
            : toolMode === 'pan' && !showSectionController
            ? 'grab'
            : showSectionController || toolMode === 'align'
            ? 'default'
            : toolMode === 'brush'
            ? 'crosshair'
            : toolMode === 'marquee'
            ? 'crosshair'
            : 'default'
      }}
    >
      {/* Quick Conform Notification Strip */}
      {conformBannerInfo && (
        <div className="absolute top-14 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-xl z-30 p-2 sm:p-2.5 bg-[#121622]/95 backdrop-blur-md rounded-xl border border-[#00e5ff]/50 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-[#00e5ff] animate-ping" />
            <div>
              <span className="font-bold text-white">Auto-Conformed: </span>
              <span className="font-mono text-[#00e5ff]">{conformBannerInfo.originalWidth}×{conformBannerInfo.originalHeight}</span>
              <span className="text-[#94a3b8]"> → 585×559 px</span>
            </div>
          </div>

          <div className="flex items-center space-x-1 self-end sm:self-auto">
            <span className="text-[10px] text-[#64748b] mr-1 uppercase font-mono">Mode:</span>
            {(['scale', 'pad', 'crop'] as const).map((m) => (
              <button
                key={m}
                onClick={() => conformBannerInfo.onSwitchMode(m)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase font-semibold transition ${
                  conformBannerInfo.mode === m
                    ? 'bg-[#00e5ff] text-black shadow-sm'
                    : 'bg-[#1a2130] text-[#94a3b8] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={conformBannerInfo.onDismiss}
              className="ml-1 p-1 text-[#64748b] hover:text-white rounded"
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* --- RIGID 585x559 WORKSPACE CONTAINER --- */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          width: `${TEMPLATE_WIDTH}px`,
          height: `${TEMPLATE_HEIGHT}px`
        }}
      >
        {/* High-Contrast Cyber Checkerboard for Pure Transparency Verification */}
        <div
          className="absolute inset-0 shadow-[0_0_60px_rgba(0,0,0,0.9)] border border-[#232936]"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #121620 25%, transparent 25%), 
              linear-gradient(-45deg, #121620 25%, transparent 25%), 
              linear-gradient(45deg, transparent 75%, #121620 75%), 
              linear-gradient(-45deg, transparent 75%, #121620 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#0a0d14'
          }}
        >
          {/* Main 585x559 Canvas */}
          <canvas
            ref={mainCanvasRef as any}
            width={TEMPLATE_WIDTH}
            height={TEMPLATE_HEIGHT}
            className="w-full h-full block image-rendering-pixelated"
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Split-View Original Canvas Underlay */}
          {originalCanvasRef && (
            <div
              className={`absolute inset-0 overflow-hidden pointer-events-none transition-opacity ${
                showSplitView ? 'opacity-90' : 'opacity-0'
              }`}
              style={{
                clipPath: showSplitView
                  ? `polygon(0% 0%, ${splitPos * 100}% 0%, ${splitPos * 100}% 100%, 0% 100%)`
                  : undefined
              }}
            >
              <canvas
                ref={originalCanvasRef as any}
                width={TEMPLATE_WIDTH}
                height={TEMPLATE_HEIGHT}
                className="w-full h-full block image-rendering-pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          )}

          {/* --- MATHEMATICALLY RIGID SVG VECTOR OVERLAY --- */}
          <svg
            viewBox="0 0 585 559"
            width={TEMPLATE_WIDTH}
            height={TEMPLATE_HEIGHT}
            className="absolute inset-0 w-full h-full overflow-visible select-none pointer-events-none"
          >
            {/* 1. Fine Pixel Grid (at zoom >= 4x) */}
            {showPixelGrid && zoom >= 4 && (
              <g stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" vectorEffect="non-scaling-stroke">
                {Array.from({ length: Math.ceil(TEMPLATE_WIDTH / 16) + 1 }).map((_, i) => (
                  <line key={`gx-${i}`} x1={i * 16} y1={0} x2={i * 16} y2={TEMPLATE_HEIGHT} />
                ))}
                {Array.from({ length: Math.ceil(TEMPLATE_HEIGHT / 16) + 1 }).map((_, i) => (
                  <line key={`gy-${i}`} x1={0} y1={i * 16} x2={TEMPLATE_WIDTH} y2={i * 16} />
                ))}
              </g>
            )}

            {/* 2. Official Roblox UV Wireframe Boxes */}
            {showWireframe && (
              <g>
                {/* 585x559 Canvas Boundary */}
                <rect
                  x="0"
                  y="0"
                  width={TEMPLATE_WIDTH}
                  height={TEMPLATE_HEIGHT}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.35)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Section Bounding Box Highlight on Active Section */}
                {sectionBounds && selectedSection && (
                  <rect
                    x={sectionBounds.x - 2}
                    y={sectionBounds.y - 2}
                    width={sectionBounds.w + 4}
                    height={sectionBounds.h + 4}
                    fill="none"
                    stroke={controllerTab === 'extend' ? '#00e5ff' : '#fbbf24'}
                    strokeOpacity={isTransparentMode ? Math.min(0.45, lineOpacity + 0.1) : 0.9}
                    strokeWidth={isTransparentMode ? '1.2' : '1.5'}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Active Line Indicator Glow when extending lines */}
                {sectionBounds && selectedSection && controllerTab === 'extend' && activeExtendEdge && (
                  <line
                    x1={activeExtendEdge === 'right' ? sectionBounds.x + sectionBounds.w : sectionBounds.x}
                    y1={activeExtendEdge === 'bottom' ? sectionBounds.y + sectionBounds.h : sectionBounds.y}
                    x2={activeExtendEdge === 'left' ? sectionBounds.x : sectionBounds.x + sectionBounds.w}
                    y2={activeExtendEdge === 'top' ? sectionBounds.y : sectionBounds.y + sectionBounds.h}
                    stroke="#00e5ff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    style={{ filter: 'drop-shadow(0 0 6px #00e5ff)' }}
                  />
                )}

                {/* Individual Island Boxes */}
                {activeIslands.map((island) => {
                  const isHovered = hoveredIsland?.name === island.name;
                  const isSectionActive = selectedSection && island.group === sectionGroups[selectedSection];
                  const isSingleSelected = selectedIslandName === island.name;

                  // Determine stroke and opacity in transparent mode vs normal mode
                  const strokeColor = isSingleSelected
                    ? '#fbbf24'
                    : isSectionActive
                    ? (controllerTab === 'extend' ? '#00e5ff' : '#fbbf24')
                    : isHovered
                    ? '#ffffff'
                    : '#00e5ff';

                  const effectiveStrokeOpacity = isTransparentMode
                    ? (isSingleSelected
                      ? Math.min(0.9, lineOpacity + 0.25)
                      : isSectionActive
                      ? lineOpacity
                      : isHovered
                      ? Math.min(0.8, lineOpacity + 0.3)
                      : Math.max(0.12, lineOpacity * 0.45))
                    : 1;

                  const effectiveFill = isTransparentMode
                    ? (isHovered ? 'rgba(0, 229, 255, 0.05)' : 'none')
                    : (isSingleSelected
                      ? 'rgba(251, 191, 36, 0.28)'
                      : isSectionActive
                      ? 'rgba(251, 191, 36, 0.12)'
                      : isHovered
                      ? 'rgba(0, 229, 255, 0.16)'
                      : 'rgba(0, 229, 255, 0.04)');

                  return (
                    <g key={island.name}>
                      {/* Island Region Background Fill */}
                      <rect
                        x={island.x}
                        y={island.y}
                        width={island.w}
                        height={island.h}
                        fill={effectiveFill}
                        stroke={strokeColor}
                        strokeOpacity={effectiveStrokeOpacity}
                        strokeWidth={isTransparentMode ? '1' : (isSingleSelected ? '2' : isSectionActive ? '1.5' : '1')}
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* Corner Accents */}
                      <path
                        d={`
                          M ${island.x} ${island.y + 6} L ${island.x} ${island.y} L ${island.x + 6} ${island.y}
                          M ${island.x + island.w - 6} ${island.y + island.h} L ${island.x + island.w} ${island.y + island.h} L ${island.x + island.w} ${island.y + island.h - 6}
                        `}
                        fill="none"
                        stroke={isSectionActive ? (controllerTab === 'extend' ? '#00e5ff' : '#fbbf24') : '#ffffff'}
                        strokeOpacity={isTransparentMode ? Math.max(0.2, lineOpacity * 0.7) : 1}
                        strokeWidth={isTransparentMode ? '1' : '1.5'}
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* Island Name & Dimensions */}
                      {showIslandLabels && (
                        <text
                          x={island.x + 3}
                          y={island.y + 11}
                          fill={isSectionActive ? (controllerTab === 'extend' ? '#00e5ff' : '#fbbf24') : '#00e5ff'}
                          fillOpacity={isTransparentMode ? Math.max(0.25, lineOpacity * 0.85) : 1}
                          fontSize="9px"
                          fontFamily="monospace"
                          fontWeight="700"
                          letterSpacing="0.05em"
                          style={{
                            textShadow: isTransparentMode ? 'none' : '0 1px 3px rgba(0,0,0,0.9)'
                          }}
                        >
                          {island.name.toUpperCase()}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* 3. Marquee Box Selection */}
            {marqueeBox && marqueeBox.w > 0 && marqueeBox.h > 0 && (
              <g>
                <rect
                  x={marqueeBox.x}
                  y={marqueeBox.y}
                  width={marqueeBox.w}
                  height={marqueeBox.h}
                  fill="rgba(239, 68, 68, 0.25)"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={marqueeBox.x + 2}
                  y={Math.max(0, marqueeBox.y - 16)}
                  width="70"
                  height="14"
                  fill="#ef4444"
                  rx="3"
                />
                <text
                  x={marqueeBox.x + 6}
                  y={Math.max(0, marqueeBox.y - 16) + 10}
                  fill="#ffffff"
                  fontSize="9px"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {Math.round(marqueeBox.w)}×{Math.round(marqueeBox.h)} px
                </text>
              </g>
            )}

            {/* 4. Brush Cursor Footprint */}
            {toolMode === 'brush' && mousePosOnCanvas && (
              <g>
                <circle
                  cx={mousePosOnCanvas.x}
                  cy={mousePosOnCanvas.y}
                  r={brushSize}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={mousePosOnCanvas.x} cy={mousePosOnCanvas.y} r="1.5" fill="#ffffff" />
              </g>
            )}

            {/* 5. Split-View Comparison Divider */}
            {showSplitView && (
              <g>
                <line
                  x1={TEMPLATE_WIDTH * splitPos}
                  y1={0}
                  x2={TEMPLATE_WIDTH * splitPos}
                  y2={TEMPLATE_HEIGHT}
                  stroke="#00e5ff"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={TEMPLATE_WIDTH * splitPos} cy={TEMPLATE_HEIGHT / 2} r="8" fill="#00e5ff" />
              </g>
            )}
          </svg>

          {/* Interactive On-Canvas Line Extender Badges */}
          {showWireframe && showSectionController && controllerTab === 'extend' && sectionBounds && (
            <div className="absolute inset-0 pointer-events-none select-none z-10">
              {/* Left Edge Extender */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveExtendEdge('left');
                  handleExtendDelta('left', nudgeStep);
                }}
                style={{
                  left: `${sectionBounds.x}px`,
                  top: `${sectionBounds.y + sectionBounds.h / 2}px`,
                  transform: 'translate(-100%, -50%)',
                  pointerEvents: 'auto'
                }}
                className={`absolute mr-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-extrabold shadow-[0_0_12px_rgba(0,229,255,0.7)] hover:scale-110 active:scale-95 transition flex items-center space-x-0.5 cursor-pointer ${
                  activeExtendEdge === 'left'
                    ? 'bg-white text-black ring-2 ring-[#00e5ff] scale-105'
                    : 'bg-[#00e5ff] hover:bg-[#38bdf8] text-black'
                }`}
                title={`Extend Left line outward (+${nudgeStep}px) - Arrow keys move this line`}
              >
                <span>←</span>
                <span>Ext L</span>
              </button>

              {/* Right Edge Extender */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveExtendEdge('right');
                  handleExtendDelta('right', nudgeStep);
                }}
                style={{
                  left: `${sectionBounds.x + sectionBounds.w}px`,
                  top: `${sectionBounds.y + sectionBounds.h / 2}px`,
                  transform: 'translate(0%, -50%)',
                  pointerEvents: 'auto'
                }}
                className={`absolute ml-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-extrabold shadow-[0_0_12px_rgba(0,229,255,0.7)] hover:scale-110 active:scale-95 transition flex items-center space-x-0.5 cursor-pointer ${
                  activeExtendEdge === 'right'
                    ? 'bg-white text-black ring-2 ring-[#00e5ff] scale-105'
                    : 'bg-[#00e5ff] hover:bg-[#38bdf8] text-black'
                }`}
                title={`Extend Right line outward (+${nudgeStep}px) - Arrow keys move this line`}
              >
                <span>Ext R</span>
                <span>→</span>
              </button>

              {/* Top Edge Extender */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveExtendEdge('top');
                  handleExtendDelta('top', nudgeStep);
                }}
                style={{
                  left: `${sectionBounds.x + sectionBounds.w / 2}px`,
                  top: `${sectionBounds.y}px`,
                  transform: 'translate(-50%, -100%)',
                  pointerEvents: 'auto'
                }}
                className={`absolute mb-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-extrabold shadow-[0_0_12px_rgba(0,229,255,0.7)] hover:scale-110 active:scale-95 transition flex items-center space-x-0.5 cursor-pointer ${
                  activeExtendEdge === 'top'
                    ? 'bg-white text-black ring-2 ring-[#00e5ff] scale-105'
                    : 'bg-[#00e5ff] hover:bg-[#38bdf8] text-black'
                }`}
                title={`Extend Top line upward (+${nudgeStep}px) - Arrow keys move this line`}
              >
                <span>↑</span>
                <span>Ext Top</span>
              </button>

              {/* Bottom Edge Extender */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveExtendEdge('bottom');
                  handleExtendDelta('bottom', nudgeStep);
                }}
                style={{
                  left: `${sectionBounds.x + sectionBounds.w / 2}px`,
                  top: `${sectionBounds.y + sectionBounds.h}px`,
                  transform: 'translate(-50%, 0%)',
                  pointerEvents: 'auto'
                }}
                className={`absolute mt-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-extrabold shadow-[0_0_12px_rgba(0,229,255,0.7)] hover:scale-110 active:scale-95 transition flex items-center space-x-0.5 cursor-pointer ${
                  activeExtendEdge === 'bottom'
                    ? 'bg-white text-black ring-2 ring-[#00e5ff] scale-105'
                    : 'bg-[#00e5ff] hover:bg-[#38bdf8] text-black'
                }`}
                title={`Extend Bottom line downward (+${nudgeStep}px) - Arrow keys move this line`}
              >
                <span>Ext Btm</span>
                <span>↓</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Canvas Top Toolbar */}
      <div
        data-interactive="true"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2.5 left-2.5 max-w-[calc(100vw-20px)] flex items-center space-x-1 sm:space-x-1.5 p-1 bg-[#10141ea8] backdrop-blur-md rounded-lg border border-[#232936] text-xs shadow-xl overflow-x-auto scrollbar-none z-20"
      >
        {/* 1. Pan / View Tool (First tool, active by default on startup) */}
        <button
          onClick={() => {
            setToolMode('pan');
            setShowSectionController(false);
          }}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 py-1.5 rounded transition flex-shrink-0 font-bold ${
            toolMode === 'pan' && !showSectionController
              ? 'bg-[#7000ff] text-white shadow-md border border-[#7000ff]/60'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#1a202c]'
          }`}
          title="Pan / View Tool (Default tool: click and drag canvas freely, Spacebar/Middle-click)"
        >
          <Hand className="w-3.5 h-3.5" />
          <span>Pan</span>
        </button>

        {/* 2. Toggle Section Controller (Move & Extend Sections) */}
        <button
          onClick={() => {
            if (showSectionController) {
              setShowSectionController(false);
              setToolMode('pan');
            } else {
              setShowSectionController(true);
              setToolMode('align');
            }
          }}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 py-1.5 rounded transition flex-shrink-0 font-bold ${
            showSectionController
              ? 'bg-[#fbbf24] text-black shadow-md'
              : 'text-[#fbbf24] hover:text-white hover:bg-[#1a202c]'
          }`}
          title="Move & Extend Sections - Select and adjust UV boundaries"
        >
          <Move className="w-3.5 h-3.5" />
          <span>Move Sections</span>
        </button>

        {/* 3. Marquee Tool */}
        <button
          onClick={() => {
            setToolMode('marquee');
            setShowSectionController(false);
          }}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded transition flex-shrink-0 ${
            toolMode === 'marquee'
              ? 'bg-[#ef4444] text-white font-semibold shadow-md'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#1a202c]'
          }`}
          title="Marquee Eraser Tool - Drag to select and erase"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Marquee</span>
        </button>

        {/* 4. Brush Tool */}
        <button
          onClick={() => {
            setToolMode('brush');
            setShowSectionController(false);
          }}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded transition flex-shrink-0 ${
            toolMode === 'brush'
              ? 'bg-[#00e5ff] text-black font-semibold shadow-md'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#1a202c]'
          }`}
          title="Manual Eraser Brush"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Brush</span>
        </button>

        {toolMode === 'brush' && (
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {/* Erase vs Restore Toggle Pill */}
            <div className="flex items-center space-x-0.5 bg-[#141824] p-0.5 rounded-lg border border-[#232b3b]">
              <button
                type="button"
                onClick={() => setBrushAction('erase')}
                className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold transition ${
                  brushAction === 'erase'
                    ? 'bg-[#ef4444] text-white shadow-sm'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
                title="Eraser Brush: make pixels transparent"
              >
                <Eraser className="w-3 h-3" />
                <span>Erase</span>
              </button>
              <button
                type="button"
                onClick={() => setBrushAction('restore')}
                className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold transition ${
                  brushAction === 'restore'
                    ? 'bg-[#10b981] text-black shadow-sm'
                    : 'text-[#94a3b8] hover:text-white'
                }`}
                title="Restore Brush: paint back original template image pixels"
              >
                <Sparkles className="w-3 h-3" />
                <span>Restore</span>
              </button>
            </div>

            {/* Brush Size Slider */}
            <div className="flex items-center space-x-1.5 px-2 py-1 bg-[#161b26] rounded-lg border border-[#262f3f]">
              <span className="text-[10px] text-[#94a3b8] font-mono">{brushSize}px</span>
              <input
                type="range"
                min="2"
                max="48"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-16 h-1 accent-[#00e5ff] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Quick Canvas Undo / Redo */}
        {onUndo && (
          <div className="flex items-center space-x-0.5 bg-[#141822] p-0.5 rounded-lg border border-[#232936] flex-shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1 rounded text-[#94a3b8] hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#1f2636] transition"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            {onRedo && (
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1 rounded text-[#94a3b8] hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#1f2636] transition"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {marqueeBox && marqueeBox.w > 0 && marqueeBox.h > 0 && (
          <button
            onClick={handleClearMarquee}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold shadow-md transition animate-pulse flex-shrink-0"
            title="Erase selected area"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Erase Area</span>
          </button>
        )}

        <div className="h-4 w-[1px] bg-[#232936] mx-0.5 flex-shrink-0" />

        {/* Wireframe toggle */}
        <button
          onClick={() => setShowWireframe(!showWireframe)}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded transition flex-shrink-0 ${
            showWireframe
              ? 'bg-[#00e5ff]/20 text-[#00e5ff] font-medium border border-[#00e5ff]/30'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#1a202c]'
          }`}
          title={isTransparentMode ? `Wireframe Lines (${Math.round(lineOpacity * 100)}% Transparent for Seam Alignment)` : 'Toggle Cyan UV Lines'}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lines</span>
          {showWireframe && isTransparentMode && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-[#7000ff]/40 text-[#c084fc] font-mono border border-[#7000ff]/50">
              Ghost {Math.round(lineOpacity * 100)}%
            </span>
          )}
        </button>

        {/* Island Labels toggle */}
        <button
          onClick={() => setShowIslandLabels(!showIslandLabels)}
          className={`px-2 py-1.5 rounded transition flex-shrink-0 text-[11px] font-mono ${
            showIslandLabels ? 'text-[#00e5ff]' : 'text-[#64748b] hover:text-white'
          }`}
        >
          Labels
        </button>

        {/* Split View Toggle */}
        <button
          onClick={() => setShowSplitView(!showSplitView)}
          className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded transition flex-shrink-0 ${
            showSplitView
              ? 'bg-[#7000ff]/30 text-[#c084fc] font-medium border border-[#7000ff]/40'
              : 'text-[#94a3b8] hover:text-white hover:bg-[#1a202c]'
          }`}
        >
          <Split className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Split</span>
        </button>

        {/* Zoom controls */}
        <div className="flex items-center space-x-0.5 bg-[#141822] p-0.5 rounded border border-[#232936] flex-shrink-0">
          <button
            onClick={() => {
              const newZ = Math.max(0.25, Number((zoom - 0.2).toFixed(2)));
              setZoom(newZ);
            }}
            className="p-1 rounded text-[#94a3b8] hover:text-white hover:bg-[#1f2636] transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[10px] font-mono text-[#cbd5e1] min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => {
              const newZ = Math.min(14, Number((zoom + 0.2).toFixed(2)));
              setZoom(newZ);
            }}
            className="p-1 rounded text-[#94a3b8] hover:text-white hover:bg-[#1f2636] transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={() => centerCanvas()}
          className="flex items-center space-x-1 px-2 py-1.5 rounded text-[#94a3b8] hover:text-white hover:bg-[#1a202c] transition flex-shrink-0"
          title="Fit"
        >
          <Maximize className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Fit</span>
        </button>
      </div>

      {/* --- 3-SECTION PRECISION ALIGNMENT CONTROLLER ("THE THINGY") --- */}
      {showSectionController && selectedSection && (
        isControllerMinimized ? (
          /* =========================================================================
             1. ULTRA-COMPACT FLOATING HUD DOCK (Takes < 65px, gives 100% canvas view!)
             ========================================================================= */
          <div
            data-interactive="true"
            className="absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:w-[480px] max-w-[calc(100vw-16px)] z-30 p-2 bg-[#0d1017]/95 backdrop-blur-xl rounded-2xl border border-[#fbbf24]/50 shadow-[0_4px_30px_rgba(0,0,0,0.85)] flex flex-col gap-1.5 text-xs text-[#cbd5e1] animate-in fade-in slide-in-from-bottom-2 select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {/* Row 1: Section Switcher & Mode (Move vs Extend) + More/Close */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center space-x-1 bg-[#141822] p-0.5 rounded-xl border border-[#232936]">
                <button
                  type="button"
                  onClick={() => setSelectedSection('torso')}
                  className={`py-1 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-mono font-bold transition text-center ${
                    selectedSection === 'torso'
                      ? 'bg-[#fbbf24] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  1: Top
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSection('right_arm')}
                  className={`py-1 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-mono font-bold transition text-center ${
                    selectedSection === 'right_arm'
                      ? 'bg-[#fbbf24] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  2: Btm-Left
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSection('left_arm')}
                  className={`py-1 px-1.5 rounded-lg text-[10px] sm:text-[11px] font-mono font-bold transition text-center ${
                    selectedSection === 'left_arm'
                      ? 'bg-[#fbbf24] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  3: Btm-Right
                </button>
              </div>

              {/* Mode Switch: Move (XY) vs Extend (W/H) */}
              <div className="flex items-center space-x-0.5 bg-[#141822] p-0.5 rounded-lg border border-[#232936]">
                <button
                  type="button"
                  onClick={() => setControllerTab('move')}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition ${
                    controllerTab === 'move'
                      ? 'bg-[#fbbf24] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                  title="Move section position (X/Y) - transparent lines active for sub-pixel precision"
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => setControllerTab('extend')}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition flex items-center space-x-1 ${
                    controllerTab === 'extend'
                      ? 'bg-[#00e5ff] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                  title="Extend lines left to right and up to down - transparent lines active for sub-pixel precision"
                >
                  <Expand className="w-3 h-3" />
                  <span>Extend</span>
                </button>
              </div>

              {/* Line Transparency Toggle / Preset Pill */}
              <button
                type="button"
                onClick={() => {
                  if (!transparentLinesEnabled) {
                    setTransparentLinesEnabled(true);
                    setLineOpacity(0.3);
                  } else if (lineOpacity === 0.3) {
                    setLineOpacity(0.15);
                  } else if (lineOpacity === 0.15) {
                    setLineOpacity(0.55);
                  } else if (lineOpacity === 0.55) {
                    setTransparentLinesEnabled(false);
                    setLineOpacity(1.0);
                  } else {
                    setTransparentLinesEnabled(true);
                    setLineOpacity(0.3);
                  }
                }}
                className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition flex items-center space-x-1 ${
                  isTransparentMode
                    ? 'bg-[#7000ff]/25 border border-[#7000ff]/50 text-[#c084fc] hover:bg-[#7000ff]/35'
                    : 'bg-[#141822] text-[#64748b] hover:text-[#94a3b8]'
                }`}
                title="Wireframe Line Transparency (Tap to cycle: 30% -> 15% -> 55% -> Solid)"
              >
                <Layers className="w-3 h-3" />
                <span className="hidden xs:inline">{isTransparentMode ? `${Math.round(lineOpacity * 100)}% Ghost` : 'Solid'}</span>
              </button>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsControllerMinimized(false)}
                  className="px-2 py-1 bg-[#1e2536] hover:bg-[#2b354b] text-[#fbbf24] rounded-lg border border-[#2d374d] text-[10px] font-mono font-bold transition flex items-center space-x-1"
                  title="Expand to Full Precision Studio"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">More</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSectionController(false);
                    setToolMode('pan');
                  }}
                  className="p-1 text-[#94a3b8] hover:text-white hover:bg-[#1a2130] rounded-lg transition"
                  title="Close controller"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Row 2: Controls based on Mode */}
            {controllerTab === 'move' ? (
              <div className="flex items-center justify-between gap-1.5">
                {/* 4 Directional Arrows in a neat row (hold-to-repeat + tap) */}
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(-1, 0);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(-1, 0);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-8 h-8 rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Left (tap or hold)"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(0, -1);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(0, -1);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-8 h-8 rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Up (tap or hold)"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(0, 1);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(0, 1);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-8 h-8 rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Down (tap or hold)"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(1, 0);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(1, 0);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-8 h-8 rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Right (tap or hold)"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Step Size Selector Pill */}
                <button
                  type="button"
                  onClick={() => {
                    const steps = [1, 2, 5, 10];
                    const next = steps[(steps.indexOf(nudgeStep) + 1) % steps.length];
                    setNudgeStep(next);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1e2435] border border-[#2b364c] text-[#fbbf24] font-mono text-[11px] font-bold transition"
                  title="Tap to cycle step: 1px → 2px → 5px → 10px"
                >
                  {nudgeStep}px
                </button>

                {/* Coordinates */}
                {sectionBounds && (
                  <span className="text-[10px] font-mono text-[#94a3b8] hidden xs:inline">
                    X:{sectionBounds.x} Y:{sectionBounds.y}
                  </span>
                )}

                {/* Quick Copy Coordinates */}
                <button
                  type="button"
                  onClick={() => handleQuickCopy('ts')}
                  className={`py-1.5 px-2.5 rounded-xl font-mono text-[10px] font-bold transition flex items-center space-x-1.5 ${
                    quickCopied
                      ? 'bg-[#10b981] text-black shadow-sm'
                      : 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:brightness-110 text-black shadow-sm'
                  }`}
                  title="Copy coordinates as TypeScript code to clipboard so you can hardcode in uv.ts"
                >
                  {quickCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{quickCopied ? 'Copied TS!' : 'Copy Positions'}</span>
                </button>
              </div>
            ) : (
              /* Extend Lines Mode in Minimized Dock */
              <div className="flex items-center justify-between gap-1.5">
                {/* 4 Directional Edge Extenders */}
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('left');
                      startExtendRepeat('left', nudgeStep);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('left');
                      if (!isPointerActiveRef.current) handleExtendDelta('left', nudgeStep);
                    }}
                    style={{ touchAction: 'none' }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition shadow-sm font-mono text-[10px] font-bold cursor-pointer ${
                      activeExtendEdge === 'left'
                        ? 'bg-[#00e5ff] text-black border border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.6)]'
                        : 'bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#00e5ff] active:text-black text-white border border-[#333e56]'
                    }`}
                    title={`Extend Left line outward by +${nudgeStep}px (Arrow keys also move this line)`}
                  >
                    ←L
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('right');
                      startExtendRepeat('right', nudgeStep);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('right');
                      if (!isPointerActiveRef.current) handleExtendDelta('right', nudgeStep);
                    }}
                    style={{ touchAction: 'none' }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition shadow-sm font-mono text-[10px] font-bold cursor-pointer ${
                      activeExtendEdge === 'right'
                        ? 'bg-[#00e5ff] text-black border border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.6)]'
                        : 'bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#00e5ff] active:text-black text-white border border-[#333e56]'
                    }`}
                    title={`Extend Right line outward by +${nudgeStep}px (Arrow keys also move this line)`}
                  >
                    R→
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('top');
                      startExtendRepeat('top', nudgeStep);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('top');
                      if (!isPointerActiveRef.current) handleExtendDelta('top', nudgeStep);
                    }}
                    style={{ touchAction: 'none' }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition shadow-sm font-mono text-[10px] font-bold cursor-pointer ${
                      activeExtendEdge === 'top'
                        ? 'bg-[#00e5ff] text-black border border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.6)]'
                        : 'bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#00e5ff] active:text-black text-white border border-[#333e56]'
                    }`}
                    title={`Extend Top line upward by +${nudgeStep}px (Arrow keys also move this line)`}
                  >
                    ↑T
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('bottom');
                      startExtendRepeat('bottom', nudgeStep);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveExtendEdge('bottom');
                      if (!isPointerActiveRef.current) handleExtendDelta('bottom', nudgeStep);
                    }}
                    style={{ touchAction: 'none' }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition shadow-sm font-mono text-[10px] font-bold cursor-pointer ${
                      activeExtendEdge === 'bottom'
                        ? 'bg-[#00e5ff] text-black border border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.6)]'
                        : 'bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#00e5ff] active:text-black text-white border border-[#333e56]'
                    }`}
                    title={`Extend Bottom line downward by +${nudgeStep}px (Arrow keys also move this line)`}
                  >
                    B↓
                  </button>

                  {/* Quick contract active line button */}
                  {activeExtendEdge && (
                    <button
                      type="button"
                      onClick={() => handleExtendDelta(activeExtendEdge, -nudgeStep)}
                      className="px-1.5 py-1 rounded-lg bg-[#ef4444]/20 hover:bg-[#ef4444]/30 border border-[#ef4444]/40 text-[#f87171] font-mono text-[10px] font-bold transition flex items-center space-x-0.5"
                      title={`Contract ${activeExtendEdge} line inward (-${nudgeStep}px)`}
                    >
                      <Minus className="w-3 h-3" />
                      <span className="uppercase">{activeExtendEdge[0]}</span>
                    </button>
                  )}
                </div>

                {/* +1px Bleed Shield button */}
                <button
                  type="button"
                  onClick={() => handleExtendDelta('bleed', 1)}
                  className="px-2 py-1.5 rounded-lg bg-[#10b981]/15 hover:bg-[#10b981]/25 border border-[#10b981]/40 text-[#10b981] font-mono text-[10px] font-bold transition flex items-center space-x-1"
                  title="Add +1px margin to all 4 edges so Auto-Cut won't make sides transparent"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>+1px Bleed</span>
                </button>

                {/* Step Size */}
                <button
                  type="button"
                  onClick={() => {
                    const steps = [1, 2, 5, 10];
                    const next = steps[(steps.indexOf(nudgeStep) + 1) % steps.length];
                    setNudgeStep(next);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1e2435] border border-[#2b364c] text-[#00e5ff] font-mono text-[11px] font-bold transition"
                  title="Cycle extend step size: 1px → 2px → 5px → 10px"
                >
                  {nudgeStep}px
                </button>

                {/* Dimensions */}
                {sectionBounds && (
                  <span className="text-[10px] font-mono text-[#00e5ff] hidden xs:inline">
                    W:{sectionBounds.w} H:{sectionBounds.h}
                  </span>
                )}

                {/* Quick Copy Coordinates */}
                <button
                  type="button"
                  onClick={() => handleQuickCopy('ts')}
                  className={`py-1.5 px-2.5 rounded-xl font-mono text-[10px] font-bold transition flex items-center space-x-1.5 ${
                    quickCopied
                      ? 'bg-[#10b981] text-black shadow-sm'
                      : 'bg-gradient-to-r from-[#00e5ff] to-[#38bdf8] hover:brightness-110 text-black shadow-sm'
                  }`}
                  title="Copy coordinates to clipboard in TypeScript code so you can hardcode it"
                >
                  {quickCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{quickCopied ? 'Copied TS!' : 'Copy Positions'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             2. EXPANDED PRECISION STUDIO PANEL (Full Move & Extend Lines Control)
             ========================================================================= */
          <div
            data-interactive="true"
            className="absolute bottom-2 left-2 right-2 sm:left-auto sm:right-3 sm:w-[460px] max-h-[82vh] overflow-y-auto z-30 p-2.5 bg-[#0d1017]/95 backdrop-blur-xl rounded-2xl border border-[#fbbf24]/50 shadow-[0_0_35px_rgba(0,0,0,0.85)] flex flex-col gap-2 text-xs text-[#cbd5e1] animate-in fade-in slide-in-from-bottom-2 select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {/* Header: Tabs & Minimize / Close */}
            <div className="flex items-center justify-between gap-1.5 border-b border-[#232936] pb-1.5">
              <div className="flex items-center space-x-1 bg-[#141822] p-1 rounded-xl border border-[#232936]">
                <button
                  type="button"
                  onClick={() => setSelectedSection('torso')}
                  className={`py-1 px-2 rounded-lg text-[11px] font-mono font-bold transition ${
                    selectedSection === 'torso'
                      ? 'bg-[#fbbf24] text-black shadow-md'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <span>1: Top</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSection('right_arm')}
                  className={`py-1 px-2 rounded-lg text-[11px] font-mono font-bold transition ${
                    selectedSection === 'right_arm'
                      ? 'bg-[#fbbf24] text-black shadow-md'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <span>2: Btm-Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSection('left_arm')}
                  className={`py-1 px-2 rounded-lg text-[11px] font-mono font-bold transition ${
                    selectedSection === 'left_arm'
                      ? 'bg-[#fbbf24] text-black shadow-md'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <span>3: Btm-Right</span>
                </button>
              </div>

              {/* Mode Toggle in Expanded Panel: Move vs Extend Lines */}
              <div className="flex items-center space-x-0.5 bg-[#141822] p-0.5 rounded-lg border border-[#232936]">
                <button
                  type="button"
                  onClick={() => setControllerTab('move')}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition ${
                    controllerTab === 'move'
                      ? 'bg-[#fbbf24] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  Move (XY)
                </button>
                <button
                  type="button"
                  onClick={() => setControllerTab('extend')}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition flex items-center space-x-1 ${
                    controllerTab === 'extend'
                      ? 'bg-[#00e5ff] text-black shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <Expand className="w-3 h-3" />
                  <span>Extend Lines</span>
                </button>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsControllerMinimized(true)}
                  className="p-1.5 text-[#fbbf24] hover:bg-[#1a2130] rounded-lg transition"
                  title="Minimize to compact dock"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSectionController(false);
                    setToolMode('pan');
                  }}
                  className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#1a2130] rounded-lg transition"
                  title="Close controller"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Subheader: Scope (Whole Section vs Single Island) & Bounds Readout */}
            <div className="flex items-center justify-between text-[11px] font-mono text-[#94a3b8] px-0.5">
              <div className="flex items-center space-x-1">
                <span className="text-[#64748b]">Target:</span>
                <button
                  type="button"
                  onClick={() => setNudgeScope(nudgeScope === 'section' ? 'single' : 'section')}
                  className="px-2 py-0.5 rounded bg-[#161c28] border border-[#263145] text-white font-bold hover:border-[#fbbf24] transition flex items-center space-x-1"
                >
                  <span>{nudgeScope === 'section' ? 'Entire Section (All 6 faces)' : 'Single Island'}</span>
                  <ChevronRight className="w-3 h-3 text-[#fbbf24]" />
                </button>
              </div>

              {sectionBounds && (
                <div className="text-[10px] text-[#fbbf24]">
                  X:{sectionBounds.x} Y:{sectionBounds.y} • W:{sectionBounds.w} H:{sectionBounds.h}
                </div>
              )}
            </div>

            {/* Line Transparency / Ghost Overlay Mode Bar */}
            <div className="flex items-center justify-between text-[11px] font-mono bg-[#141824] p-1.5 rounded-xl border border-[#232b3b]">
              <div className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span className="text-[#94a3b8]">Wireframe Lines:</span>
                <span className={`font-bold ${isTransparentMode ? 'text-[#00e5ff]' : 'text-white'}`}>
                  {isTransparentMode ? `${Math.round(lineOpacity * 100)}% Transparent (See-Through)` : 'Solid'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                {[
                  { label: '15%', val: 0.15 },
                  { label: '30%', val: 0.3 },
                  { label: '50%', val: 0.5 },
                  { label: 'Solid', val: 1.0 }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      if (preset.val === 1.0) {
                        setTransparentLinesEnabled(false);
                        setLineOpacity(1.0);
                      } else {
                        setTransparentLinesEnabled(true);
                        setLineOpacity(preset.val);
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                      (isTransparentMode && lineOpacity === preset.val) || (!isTransparentMode && preset.val === 1.0)
                        ? 'bg-[#00e5ff] text-black shadow-sm'
                        : 'bg-[#1b2232] text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* If Single Island mode is active */}
            {nudgeScope === 'single' && (
              <div className="flex items-center space-x-1.5">
                <select
                  value={selectedIslandName || ''}
                  onChange={(e) => setSelectedIslandName(e.target.value || null)}
                  className="w-full bg-[#141824] border border-[#262f40] rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#fbbf24]"
                >
                  <option value="">-- Choose specific island face to extend/move --</option>
                  {currentSectionIslands.map((isl) => (
                    <option key={isl.name} value={isl.name}>
                      {isl.name} (X:{isl.x}, Y:{isl.y}, W:{isl.w}, H:{isl.h})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tab Body: Move vs Extend Lines */}
            {controllerTab === 'move' ? (
              /* MOVE POSITION CLUSTER */
              <div className="flex items-center justify-between gap-2.5 bg-[#121622] p-2 rounded-xl border border-[#232936]">
                {/* 28x28 D-PAD */}
                <div className="grid grid-cols-3 gap-1 w-24 h-24 flex-shrink-0 touch-none select-none">
                  {/* Row 1 */}
                  <div />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(0, -1);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(0, -1);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-full h-full rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <div />

                  {/* Row 2 */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(-1, 0);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(-1, 0);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-full h-full rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Left"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center justify-center text-[10px] text-[#fbbf24] font-mono font-bold bg-[#090b10] rounded-lg border border-[#1f2636]">
                    {nudgeStep}px
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(1, 0);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(1, 0);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-full h-full rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Right"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Row 3 */}
                  <div />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startNudgeRepeat(0, 1);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stopNudgeRepeat();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isPointerActiveRef.current) handleNudge(0, 1);
                    }}
                    style={{ touchAction: 'none' }}
                    className="w-full h-full rounded-xl bg-[#1e2433] hover:bg-[#2b354b] active:bg-[#fbbf24] active:text-black text-white flex items-center justify-center border border-[#333e56] transition shadow-sm select-none cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <div />
                </div>

                {/* STEP SELECTOR & RAPID INPUTS */}
                <div className="flex-1 flex flex-col justify-between space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#64748b] font-mono uppercase">Step:</span>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 5, 10].map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => setNudgeStep(s)}
                          className={`px-2 py-0.5 rounded text-center font-mono text-[10px] font-bold transition ${
                            nudgeStep === s
                              ? 'bg-[#fbbf24] text-black shadow-sm'
                              : 'bg-[#181e2b] text-[#94a3b8] hover:text-white'
                          }`}
                        >
                          {s}px
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Direct numeric input shift */}
                  <form onSubmit={handleApplyCustomShift} className="flex items-center space-x-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="X"
                      value={customShiftX}
                      onChange={(e) => setCustomShiftX(e.target.value)}
                      className="w-14 bg-[#090b10] border border-[#2b364c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#fbbf24] focus:outline-none"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Y"
                      value={customShiftY}
                      onChange={(e) => setCustomShiftY(e.target.value)}
                      className="w-14 bg-[#090b10] border border-[#2b364c] rounded-lg px-2 py-1 text-white font-mono text-xs focus:border-[#fbbf24] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-[#1e2536] hover:bg-[#283246] active:bg-[#fbbf24] active:text-black border border-[#2f3b52] rounded-lg font-mono text-[10px] text-white font-semibold transition"
                    >
                      Shift
                    </button>
                  </form>

                  {/* Quick jump pills */}
                  <div className="flex items-center space-x-1 overflow-x-auto">
                    {[-10, -1, 1, 10].map((val) => (
                      <button
                        type="button"
                        key={val}
                        onClick={() => handleNudgeDelta(val, 0)}
                        className="flex-1 py-0.5 px-1 rounded text-[10px] font-mono bg-[#181e2b] text-[#cbd5e1] hover:bg-[#242d3f] border border-[#232936] text-center"
                      >
                        {val > 0 ? `+${val}X` : `${val}X`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* EXTEND LINES PANEL */
              <div className="flex flex-col gap-2 bg-[#121622] p-2.5 rounded-xl border border-[#232936]">
                {/* Header with Step Selector */}
                <div className="flex items-center justify-between pb-1 border-b border-[#1f2636]">
                  <div className="flex items-center space-x-1 text-[#00e5ff] font-mono text-[11px] font-bold">
                    <Expand className="w-3.5 h-3.5" />
                    <span>Extend Lines (Prevent Auto-Cut Clear Edges)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] text-[#64748b] font-mono uppercase">Step:</span>
                    {[1, 2, 5, 10].map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setNudgeStep(s)}
                        className={`px-2 py-0.5 rounded text-center font-mono text-[10px] font-bold transition ${
                          nudgeStep === s
                            ? 'bg-[#00e5ff] text-black shadow-sm'
                            : 'bg-[#181e2b] text-[#94a3b8] hover:text-white'
                        }`}
                      >
                        {s}px
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. HORIZONTAL: EXTEND LEFT TO RIGHT */}
                <div className={`flex flex-col gap-1 bg-[#0b0e14] p-2 rounded-lg border transition ${
                  activeExtendEdge === 'left' || activeExtendEdge === 'right'
                    ? 'border-[#00e5ff]/60 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                    : 'border-[#1f2838]'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-white font-bold flex items-center space-x-1.5">
                      <span>Horizontal Lines (Left & Right):</span>
                      {(activeExtendEdge === 'left' || activeExtendEdge === 'right') && (
                        <span className="text-[10px] text-[#00e5ff] font-bold">
                          [Arrow Keys Active: {activeExtendEdge.toUpperCase()} Line]
                        </span>
                      )}
                    </span>
                    <span className="text-[#00e5ff] text-[10px]">
                      Width: {nudgeScope === 'single' && selectedIslandName ? activeIslands.find(i => i.name === selectedIslandName)?.w : sectionBounds?.w}px
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Left Line Outward/Inward */}
                    <div className={`flex items-center space-x-1 bg-[#131722] p-1 rounded-lg border transition ${
                      activeExtendEdge === 'left' ? 'border-[#00e5ff]' : 'border-[#232c3d]'
                    }`}>
                      <span className="text-[10px] text-[#94a3b8] font-mono pl-0.5">Left:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('left');
                          handleExtendDelta('left', nudgeStep);
                        }}
                        className={`flex-1 py-1 px-1 rounded font-mono text-[10px] font-bold transition text-center ${
                          activeExtendEdge === 'left'
                            ? 'bg-[#00e5ff] text-black shadow-sm'
                            : 'bg-[#1e2638] hover:bg-[#28334a] text-white'
                        }`}
                        title={`Extend Left line outward by +${nudgeStep}px (Arrow keys also move this line)`}
                      >
                        ← Ext (+{nudgeStep})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('left');
                          handleExtendDelta('left', -nudgeStep);
                        }}
                        className="py-1 px-1.5 rounded bg-[#181e2b] hover:bg-[#222b3d] text-[#94a3b8] hover:text-white font-mono text-[10px] transition text-center"
                        title={`Contract Left line inward by -${nudgeStep}px`}
                      >
                        In (-{nudgeStep})
                      </button>
                    </div>

                    {/* Right Line Outward/Inward */}
                    <div className={`flex items-center space-x-1 bg-[#131722] p-1 rounded-lg border transition ${
                      activeExtendEdge === 'right' ? 'border-[#00e5ff]' : 'border-[#232c3d]'
                    }`}>
                      <span className="text-[10px] text-[#94a3b8] font-mono pl-0.5">Right:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('right');
                          handleExtendDelta('right', nudgeStep);
                        }}
                        className={`flex-1 py-1 px-1 rounded font-mono text-[10px] font-bold transition text-center ${
                          activeExtendEdge === 'right'
                            ? 'bg-[#00e5ff] text-black shadow-sm'
                            : 'bg-[#1e2638] hover:bg-[#28334a] text-white'
                        }`}
                        title={`Extend Right line outward by +${nudgeStep}px (Arrow keys also move this line)`}
                      >
                        Ext (+{nudgeStep}) →
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('right');
                          handleExtendDelta('right', -nudgeStep);
                        }}
                        className="py-1 px-1.5 rounded bg-[#181e2b] hover:bg-[#222b3d] text-[#94a3b8] hover:text-white font-mono text-[10px] transition text-center"
                        title={`Contract Right line inward by -${nudgeStep}px`}
                      >
                        (-{nudgeStep}) In
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. VERTICAL: EXTEND UP AND DOWN */}
                <div className={`flex flex-col gap-1 bg-[#0b0e14] p-2 rounded-lg border transition ${
                  activeExtendEdge === 'top' || activeExtendEdge === 'bottom'
                    ? 'border-[#00e5ff]/60 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                    : 'border-[#1f2838]'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-white font-bold flex items-center space-x-1.5">
                      <span>Vertical Lines (Up & Down):</span>
                      {(activeExtendEdge === 'top' || activeExtendEdge === 'bottom') && (
                        <span className="text-[10px] text-[#00e5ff] font-bold">
                          [Arrow Keys Active: {activeExtendEdge.toUpperCase()} Line]
                        </span>
                      )}
                    </span>
                    <span className="text-[#00e5ff] text-[10px]">
                      Height: {nudgeScope === 'single' && selectedIslandName ? activeIslands.find(i => i.name === selectedIslandName)?.h : sectionBounds?.h}px
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Top Line Outward/Inward */}
                    <div className={`flex items-center space-x-1 bg-[#131722] p-1 rounded-lg border transition ${
                      activeExtendEdge === 'top' ? 'border-[#00e5ff]' : 'border-[#232c3d]'
                    }`}>
                      <span className="text-[10px] text-[#94a3b8] font-mono pl-0.5">Top:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('top');
                          handleExtendDelta('top', nudgeStep);
                        }}
                        className={`flex-1 py-1 px-1 rounded font-mono text-[10px] font-bold transition text-center ${
                          activeExtendEdge === 'top'
                            ? 'bg-[#00e5ff] text-black shadow-sm'
                            : 'bg-[#1e2638] hover:bg-[#28334a] text-white'
                        }`}
                        title={`Extend Top line upward by +${nudgeStep}px (Arrow keys also move this line)`}
                      >
                        ↑ Ext (+{nudgeStep})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('top');
                          handleExtendDelta('top', -nudgeStep);
                        }}
                        className="py-1 px-1.5 rounded bg-[#181e2b] hover:bg-[#222b3d] text-[#94a3b8] hover:text-white font-mono text-[10px] transition text-center"
                        title={`Contract Top line downward by -${nudgeStep}px`}
                      >
                        In (-{nudgeStep})
                      </button>
                    </div>

                    {/* Bottom Line Outward/Inward */}
                    <div className={`flex items-center space-x-1 bg-[#131722] p-1 rounded-lg border transition ${
                      activeExtendEdge === 'bottom' ? 'border-[#00e5ff]' : 'border-[#232c3d]'
                    }`}>
                      <span className="text-[10px] text-[#94a3b8] font-mono pl-0.5">Bottom:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('bottom');
                          handleExtendDelta('bottom', nudgeStep);
                        }}
                        className={`flex-1 py-1 px-1 rounded font-mono text-[10px] font-bold transition text-center ${
                          activeExtendEdge === 'bottom'
                            ? 'bg-[#00e5ff] text-black shadow-sm'
                            : 'bg-[#1e2638] hover:bg-[#28334a] text-white'
                        }`}
                        title={`Extend Bottom line downward by +${nudgeStep}px (Arrow keys also move this line)`}
                      >
                        Ext (+{nudgeStep}) ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExtendEdge('bottom');
                          handleExtendDelta('bottom', -nudgeStep);
                        }}
                        className="py-1 px-1.5 rounded bg-[#181e2b] hover:bg-[#222b3d] text-[#94a3b8] hover:text-white font-mono text-[10px] transition text-center"
                        title={`Contract Bottom line upward by -${nudgeStep}px`}
                      >
                        (-{nudgeStep}) In
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. AUTO-CUT ANTI-CLIPPING SHIELD (BLEED MARGIN) */}
                <div className="flex items-center justify-between gap-1.5 bg-[#0b0e14] p-2 rounded-lg border border-[#1f2838]">
                  <div className="flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#10b981] flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-white leading-tight">Auto-Cut Protection:</span>
                      <span className="text-[9px] text-[#64748b] leading-tight">Adds margin so auto-cut won't clip edges</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleExtendDelta('bleed', 1)}
                      className="px-2 py-1 rounded bg-[#10b981]/15 hover:bg-[#10b981]/25 border border-[#10b981]/40 text-[#10b981] font-mono text-[10px] font-bold transition"
                      title="Add +1px margin to all 4 edges"
                    >
                      +1px Bleed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendDelta('bleed', 2)}
                      className="px-2 py-1 rounded bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981]/50 text-[#10b981] font-mono text-[10px] font-bold transition"
                      title="Add +2px margin to all 4 edges"
                    >
                      +2px Bleed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendDelta('bleed', -1)}
                      className="px-1.5 py-1 rounded bg-[#181e2b] hover:bg-[#222b3d] text-[#94a3b8] hover:text-white font-mono text-[10px] transition"
                      title="Shrink all 4 edges by -1px"
                    >
                      -1px
                    </button>
                  </div>
                </div>

                {/* 4. DIRECT WIDTH & HEIGHT INPUTS */}
                <div className="flex items-center justify-between gap-2 bg-[#0b0e14] p-1.5 rounded-lg border border-[#1f2838]">
                  <span className="text-[10px] text-[#94a3b8] font-mono">Set Dimensions:</span>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      placeholder="W (px)"
                      value={customExtendW}
                      onChange={(e) => setCustomExtendW(e.target.value)}
                      className="w-16 bg-[#131722] border border-[#2b364c] rounded-lg px-2 py-0.5 text-white font-mono text-xs focus:border-[#00e5ff] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseInt(customExtendW, 10);
                        if (val > 0) {
                          handleSetDirectDimension('w', val);
                          setCustomExtendW('');
                        }
                      }}
                      className="px-2 py-0.5 bg-[#1e2536] hover:bg-[#283246] active:bg-[#00e5ff] active:text-black border border-[#2f3b52] rounded text-[10px] font-mono text-white transition"
                    >
                      Set W
                    </button>
                    <input
                      type="number"
                      placeholder="H (px)"
                      value={customExtendH}
                      onChange={(e) => setCustomExtendH(e.target.value)}
                      className="w-16 bg-[#131722] border border-[#2b364c] rounded-lg px-2 py-0.5 text-white font-mono text-xs focus:border-[#00e5ff] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseInt(customExtendH, 10);
                        if (val > 0) {
                          handleSetDirectDimension('h', val);
                          setCustomExtendH('');
                        }
                      }}
                      className="px-2 py-0.5 bg-[#1e2536] hover:bg-[#283246] active:bg-[#00e5ff] active:text-black border border-[#2f3b52] rounded text-[10px] font-mono text-white transition"
                    >
                      Set H
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Footer: Prominent Copy Positions Button + Reset */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1f2636]">
              <button
                type="button"
                onClick={() => handleQuickCopy('ts')}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-xl font-mono text-xs font-bold transition shadow-lg active:scale-95 ${
                  quickCopied
                    ? 'bg-[#10b981] text-black shadow-[#10b981]/40'
                    : 'bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] hover:brightness-110 text-black shadow-[#fbbf24]/20'
                }`}
                title="Copy current wireframe positions as TypeScript array code to clipboard so you can paste into uv.ts to hardcode"
              >
                {quickCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{quickCopied ? 'COPIED TS CODE TO HARDCODE!' : 'COPY POSITIONS (TS CODE TO HARDCODE)'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickCopy('json')}
                className="py-2 px-2.5 rounded-xl bg-[#181e2b] hover:bg-[#252f44] border border-[#263145] text-white font-mono text-xs font-bold transition"
                title="Copy coordinates as clean JSON"
              >
                JSON
              </button>

              <button
                type="button"
                onClick={onOpenDebugModal}
                className="p-2 rounded-xl bg-[#181e2b] hover:bg-[#252f44] border border-[#263145] text-[#00e5ff] transition"
                title="Open full JSON debug code inspector"
              >
                <Code2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetCurrentSection}
                className="p-2 rounded-xl bg-[#181e2b] hover:bg-[#252f44] border border-[#263145] text-[#94a3b8] hover:text-white transition"
                title="Reset this section to defaults"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}

      {/* Floating Center Prompt for Upload */}
      {onUploadClick && (
        <div className="absolute bottom-4 right-4 z-20">
          <button
            onClick={onUploadClick}
            className="flex items-center space-x-2 px-3 py-2 bg-[#121622]/90 hover:bg-[#1a202e] border border-[#00e5ff]/40 hover:border-[#00e5ff] rounded-xl text-xs font-mono text-white shadow-xl transition backdrop-blur-md group"
          >
            <Upload className="w-3.5 h-3.5 text-[#00e5ff] group-hover:scale-110 transition-transform" />
            <span>Upload Another Asset</span>
          </button>
        </div>
      )}
    </div>
  );
};
