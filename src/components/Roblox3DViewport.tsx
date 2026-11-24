import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Box,
  Brush,
  Columns2,
  Eraser,
  Eye,
  EyeOff,
  LayoutGrid,
  Minus,
  PencilLine,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  User,
  X
} from 'lucide-react';
import {
  AvatarPreviewSettings,
  BodyRegionGroup,
  Compare3DMode,
  GarmentLayerVisibility,
  Sheet3DType,
  StudioTheme
} from '../types/studio';
import { TemplateType } from '../types/uv';
import {
  AvatarSceneEngine,
  MultiGarmentInput,
  RIG_METADATA
} from '../three/avatarSceneEngine';
import { Studio3DSheets } from './Studio3DSheets';

interface Roblox3DViewportProps {
  garments: MultiGarmentInput;
  updateTrigger: number;
  settings: AvatarPreviewSettings;
  onUpdateSettings: (patch: Partial<AvatarPreviewSettings>) => void;
  studioTheme: StudioTheme;
  onSetStudioTheme: (theme: StudioTheme) => void;
  hasActiveSlotImage?: boolean;
  activeSlotLabel?: string;
  activeTemplateType?: TemplateType;
  onRemoveActiveTemplate?: () => void;
  canCompare3D: boolean;
  isPure3DMode?: boolean;
  onSwitchToEditor?: () => void;
  highlightedRegion?: BodyRegionGroup | null;
  onSelectBodyRegion?: (region: BodyRegionGroup | null) => void;
  onOpenShowcase2D: () => void;
  onToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  // Direct 3D-to-2D Painting
  paint3DEnabled?: boolean;
  onTogglePaint3D?: () => void;
  paint3DMode?: 'paint' | 'erase';
  onChangePaint3DMode?: (mode: 'paint' | 'erase') => void;
  paintColor?: string;
  onChangePaintColor?: (hex: string) => void;
  brushSize?: number;
  onChangeBrushSize?: (size: number) => void;
  onRegisterFastRefresh?: (
    fn: ((regions: ReadonlySet<BodyRegionGroup> | 'all') => void) | null
  ) => void;
  onPaint3DStroke?: (
    phase: 'start' | 'move' | 'end' | 'cancel',
    hit: { x: number; y: number; bodyRegion: BodyRegionGroup } | null
  ) => void;
  onGestureUndo?: () => void;
  onGestureRedo?: () => void;
}

const REGION_LABELS: Record<BodyRegionGroup, string> = {
  torso: 'Torso',
  right_arm: 'Right Arm',
  left_arm: 'Left Arm',
  right_leg: 'Right Leg',
  left_leg: 'Left Leg'
};

export const Roblox3DViewport: React.FC<Roblox3DViewportProps> = ({
  garments,
  updateTrigger,
  settings,
  onUpdateSettings,
  studioTheme,
  onSetStudioTheme,
  hasActiveSlotImage = false,
  activeSlotLabel = 'Template',
  activeTemplateType = 'shirt',
  onRemoveActiveTemplate,
  canCompare3D,
  isPure3DMode = false,
  onSwitchToEditor,
  highlightedRegion = null,
  onSelectBodyRegion,
  onOpenShowcase2D,
  onToast,
  paint3DEnabled = false,
  onTogglePaint3D,
  paint3DMode = 'paint',
  onChangePaint3DMode,
  paintColor = '#38BDF8',
  onChangePaintColor,
  brushSize = 16,
  onChangeBrushSize,
  onRegisterFastRefresh,
  onPaint3DStroke,
  onGestureUndo,
  onGestureRedo
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AvatarSceneEngine | null>(null);
  const onSelectBodyRegionRef = useRef(onSelectBodyRegion);
  onSelectBodyRegionRef.current = onSelectBodyRegion;
  const onPaint3DStrokeRef = useRef(onPaint3DStroke);
  onPaint3DStrokeRef.current = onPaint3DStroke;
  const onRegisterFastRefreshRef = useRef(onRegisterFastRefresh);
  onRegisterFastRefreshRef.current = onRegisterFastRefresh;
  const onGestureUndoRef = useRef(onGestureUndo);
  onGestureUndoRef.current = onGestureUndo;
  const onGestureRedoRef = useRef(onGestureRedo);
  onGestureRedoRef.current = onGestureRedo;

  const [turntable, setTurntable] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [activeSheet, setActiveSheet] = useState<Sheet3DType>('none');
  const [recordingProgress, setRecordingProgress] = useState<number | null>(null);
  const [resetSpinCount, setResetSpinCount] = useState(0);
  const [gestureHud, setGestureHud] = useState<{ id: number; label: string } | null>(null);
  const gestureTimerRef = useRef<number | null>(null);

  const flashGestureHud = (label: string) => {
    if (gestureTimerRef.current !== null) {
      window.clearTimeout(gestureTimerRef.current);
    }
    setGestureHud({ id: Date.now(), label });
    gestureTimerRef.current = window.setTimeout(() => {
      setGestureHud(null);
      gestureTimerRef.current = null;
    }, 950);
  };

  // Cut-gated 3D Compare (Stripped/Edited vs Original)
  const [compareMode, setCompareMode] = useState<Compare3DMode>('off');
  const [splitRatio, setSplitRatio] = useState<number>(0.5);
  const draggingSplitRef = useRef(false);

  // Dripzels-style FRONT / BACK / R / L UV Alignment Guide
  const [showUvDummy, setShowUvDummy] = useState(false);

  // Automatically disable 3D Compare if user resets or loads a fresh un-cut garment
  useEffect(() => {
    if (!canCompare3D && compareMode !== 'off') {
      setCompareMode('off');
    }
  }, [canCompare3D, compareMode]);

  // Single mount of WebGL scene engine
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new AvatarSceneEngine(el, settings, {
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
      onSelectBodyRegion: (region) => {
        onSelectBodyRegionRef.current?.(region);
      },
      onPaint3DStroke: (phase, hit) => {
        onPaint3DStrokeRef.current?.(phase, hit);
      },
      onGestureUndo: () => {
        onGestureUndoRef.current?.();
      },
      onGestureRedo: () => {
        onGestureRedoRef.current?.();
      },
      onGestureFeedback: (label) => {
        flashGestureHud(label);
      }
    });
    engine.updateGarments(garments);
    engineRef.current = engine;
    onRegisterFastRefreshRef.current?.((regions) => engine.fastRefreshEditedRegions(regions));

    return () => {
      if (gestureTimerRef.current !== null) {
        window.clearTimeout(gestureTimerRef.current);
      }
      onRegisterFastRefreshRef.current?.(null);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push garment canvases & islands imperatively
  useEffect(() => {
    engineRef.current?.updateGarments(garments);
  }, [garments, updateTrigger]);

  // Push settings imperatively
  useEffect(() => {
    engineRef.current?.applySettings(settings);
  }, [settings]);

  // Push turntable state
  useEffect(() => {
    engineRef.current?.setTurntable(turntable);
  }, [turntable]);

  // Push 3D Compare mode & split ratio
  useEffect(() => {
    engineRef.current?.setCompare3D(compareMode, splitRatio);
  }, [compareMode, splitRatio]);

  // Push UV Dummy state
  useEffect(() => {
    engineRef.current?.setShowUvGuideDummy(showUvDummy);
  }, [showUvDummy]);

  // Push 2D ↔ 3D region highlight
  useEffect(() => {
    engineRef.current?.setHighlightedRegion(highlightedRegion ?? null);
  }, [highlightedRegion]);

  // Push 3D Direct Paint state & brush ring style
  useEffect(() => {
    engineRef.current?.setPaint3DMode(paint3DEnabled && hasActiveSlotImage, activeTemplateType);
  }, [paint3DEnabled, hasActiveSlotImage, activeTemplateType]);

  useEffect(() => {
    engineRef.current?.setPaint3DStyle(paintColor, paint3DMode, brushSize);
  }, [paintColor, paint3DMode, brushSize]);

  const cycleCompareMode = () => {
    if (!canCompare3D) return;
    setCompareMode((prev) =>
      prev === 'off' ? 'split' : prev === 'split' ? 'side_by_side' : 'off'
    );
  };

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    draggingSplitRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current || !containerRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    setSplitRatio(Math.max(0.05, Math.min(0.95, ratio)));
  };

  const handleSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    draggingSplitRef.current = false;
  };

  const toggleGarmentLayer = (key: keyof GarmentLayerVisibility) => {
    onUpdateSettings({
      layerVisibility: {
        ...settings.layerVisibility,
        [key]: !settings.layerVisibility[key]
      }
    });
  };

  const handleCaptureSnapshot = (transparentBg: boolean) => {
    if (!engineRef.current) return;
    try {
      const dataUrl = engineRef.current.captureSnapshotDataUrl(transparentBg);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Heavenly_3D_${settings.humanoidType}_${transparentBg ? 'Transparent' : 'Stage'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onToast(
        transparentBg
          ? 'Saved transparent 3D avatar PNG.'
          : 'Saved 3D studio stage snapshot.',
        'success'
      );
    } catch {
      onToast('Could not capture 3D snapshot.', 'error');
    }
  };

  const handleRecordTurntableVideo = async () => {
    if (!engineRef.current || recordingProgress !== null) return;
    setActiveSheet('none');
    setRecordingProgress(0.01);
    try {
      const blob = await engineRef.current.recordTurntableVideo(4, (p) => {
        setRecordingProgress(p);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Heavenly_360_${settings.humanoidType}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      onToast('Downloaded 4s 360° turntable showcase video (WebM).', 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Could not record 360° turntable video.',
        'warning'
      );
    } finally {
      setRecordingProgress(null);
    }
  };

  const toggleSheet = (sheet: Exclude<Sheet3DType, 'none'>) => {
    setActiveSheet((prev) => (prev === sheet ? 'none' : sheet));
  };

  const rigMeta = RIG_METADATA[settings.humanoidType];

  return (
    <div
      ref={containerRef}
      style={{ backgroundColor: settings.bgColor }}
      className="relative w-full h-full overflow-hidden select-none flex flex-col"
    >
      {/* Isolated WebGL mount container */}
      <div
        ref={mountRef}
        data-testid="viewport-3d-canvas"
        className={`w-full h-full ${
          paint3DEnabled && hasActiveSlotImage
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {/* 3D Split Wipe Draggable Handle */}
      <AnimatePresence>
        {compareMode === 'split' && (
          <motion.div
            key="compare-3d-split-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="contents"
          >
            <div
              data-testid="compare-3d-handle"
              onPointerDown={handleSplitPointerDown}
              onPointerMove={handleSplitPointerMove}
              onPointerUp={handleSplitPointerUp}
              onPointerCancel={handleSplitPointerUp}
              style={{ left: `${splitRatio * 100}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 w-10 z-20 cursor-ew-resize flex items-center justify-center group touch-none"
            >
              <div className="w-0.5 h-full bg-h-accent shadow-[0_0_10px_rgba(2,132,199,0.5)] pointer-events-none" />
              <div className="absolute w-8 h-8 rounded-full bg-h-surface border-2 border-h-accent text-h-accent-text flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform pointer-events-none">
                <Columns2 className="w-3.5 h-3.5" />
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="absolute top-14 left-3 z-10 pointer-events-none px-2.5 py-1 rounded-lg bg-h-surface/95 border border-h-border text-[10px] font-mono font-semibold uppercase tracking-wider text-h-text-2 shadow-xs"
            >
              Original
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              className="absolute top-14 right-3 z-10 pointer-events-none px-2.5 py-1 rounded-lg bg-h-surface/95 border border-h-accent-border text-[10px] font-mono font-semibold uppercase tracking-wider text-h-accent-text shadow-xs"
            >
              Stripped / Edited
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Side-by-Side Comparison Labels */}
      <AnimatePresence>
        {compareMode === 'side_by_side' && (
          <motion.div
            key="compare-3d-sbs-labels"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="contents"
          >
            <div className="absolute top-14 left-[26%] -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap px-2.5 py-1 rounded-lg bg-h-surface/95 border border-h-border text-[10px] font-mono font-semibold uppercase tracking-wider text-h-text-2 shadow-xs">
              Original
            </div>
            <div className="absolute top-14 left-[74%] -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap px-2.5 py-1 rounded-lg bg-h-surface/95 border border-h-accent-border text-[10px] font-mono font-semibold uppercase tracking-wider text-h-accent-text shadow-xs">
              Stripped / Edited
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transient Touch Gesture Feedback Pill (Undo / Redo / Camera Reset) — top-center above avatar, clear of top toolbar */}
      <AnimatePresence>
        {gestureHud && (
          <motion.div
            key={gestureHud.id}
            data-testid="viewport-3d-gesture-pill"
            initial={{ opacity: 0, scale: 0.9, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
            className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-4 py-1.5 rounded-2xl bg-h-surface/98 border border-h-accent-border shadow-xl text-xs font-semibold text-h-accent-text tracking-wide whitespace-nowrap ${
              paint3DEnabled && hasActiveSlotImage ? 'top-26' : 'top-14'
            }`}
          >
            {gestureHud.label}
          </motion.div>
        )}
      </AnimatePresence>

      {/* WebGL Context Lost Banner */}
      {contextLost && (
        <div className="absolute inset-0 bg-h-canvas/92 flex items-center justify-center p-6 z-30">
          <div className="max-w-sm text-center space-y-2 bg-h-surface border border-h-border rounded-2xl p-5 shadow-lg">
            <p className="text-sm font-semibold text-h-text">3D Preview Paused</p>
            <p className="text-xs text-h-text-2">
              Your browser reclaimed GPU memory. Waiting for WebGL to restore automatically.
            </p>
          </div>
        </div>
      )}

      {/* Top-Left Minimal Body Identifier Badge */}
      <div
        data-testid="viewport-3d-rig-pill"
        aria-label={`Current body: ${rigMeta.label}`}
        className="absolute top-3 left-3 z-20 pointer-events-none flex items-center text-[11px] bg-h-surface/92 border border-h-border px-3 py-1.5 rounded-xl shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
      >
        <span className="font-semibold text-h-text whitespace-nowrap">{rigMeta.label}</span>
      </div>

      {/* Live 3D Direct Paint Mode Banner */}
      <AnimatePresence>
        {paint3DEnabled && hasActiveSlotImage && recordingProgress === null && (
          <motion.div
            key="paint-3d-banner"
            data-testid="paint-3d-banner"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)] flex items-center gap-2 bg-h-surface/95 border border-h-accent-border px-2.5 py-1.5 rounded-xl shadow-lg text-[11px] font-medium text-h-text whitespace-nowrap"
          >
            {onChangePaintColor ? (
              <label
                title={`Paint color (${paintColor.toUpperCase()})`}
                className="relative w-5 h-5 rounded-full border-2 border-white/40 shrink-0 cursor-pointer overflow-hidden shadow-xs"
                style={{ backgroundColor: paintColor }}
              >
                <input
                  type="color"
                  aria-label="3D paint brush color"
                  data-testid="paint-3d-color-input"
                  value={paintColor}
                  onChange={(e) => onChangePaintColor(e.target.value)}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                />
              </label>
            ) : (
              <span
                className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                style={{ backgroundColor: paintColor }}
              />
            )}
            {onChangePaint3DMode && (
              <div className="flex items-center bg-h-surface-2 rounded-lg p-0.5 border border-h-border-soft">
                <button
                  type="button"
                  onClick={() => onChangePaint3DMode('paint')}
                  data-testid="paint-3d-mode-brush"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    paint3DMode === 'paint'
                      ? 'bg-h-accent text-white'
                      : 'text-h-muted hover:text-h-text'
                  }`}
                >
                  <Brush className="w-2.5 h-2.5" />
                  Paint
                </button>
                <button
                  type="button"
                  onClick={() => onChangePaint3DMode('erase')}
                  data-testid="paint-3d-mode-erase"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    paint3DMode === 'erase'
                      ? 'bg-rose-500 text-white'
                      : 'text-h-muted hover:text-h-text'
                  }`}
                >
                  <Eraser className="w-2.5 h-2.5" />
                  Erase
                </button>
              </div>
            )}
            {onChangeBrushSize && (
              <div className="flex items-center bg-h-surface-2 rounded-lg p-0.5 border border-h-border-soft">
                <button
                  type="button"
                  aria-label="Decrease 3D brush size"
                  data-testid="paint-3d-size-dec"
                  onClick={() => onChangeBrushSize(Math.max(2, brushSize - 4))}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span
                  data-testid="paint-3d-size-label"
                  className="px-1.5 text-[10px] font-mono font-semibold tabular-nums text-h-text-2"
                >
                  {brushSize}px
                </span>
                <button
                  type="button"
                  aria-label="Increase 3D brush size"
                  data-testid="paint-3d-size-inc"
                  onClick={() => onChangeBrushSize(Math.min(64, brushSize + 4))}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            <span className="hidden xl:inline text-h-text-2 truncate">
              Drag avatar to paint · Orbit space
            </span>
            {onTogglePaint3D && (
              <button
                type="button"
                onClick={onTogglePaint3D}
                className="px-2 py-0.5 rounded-md bg-h-surface-3 hover:bg-h-accent-soft text-h-accent-text text-[10px] font-semibold cursor-pointer shrink-0"
              >
                Done
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live 360° Recording Progress Banner */}
      <AnimatePresence>
        {recordingProgress !== null && (
          <motion.div
            key="recording-banner"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-h-surface/95 border border-rose-400/45 px-3.5 py-1.5 rounded-xl shadow-lg text-xs font-semibold text-h-text whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Recording 360° · {Math.round(recordingProgress * 100)}%</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active 2D ↔ 3D Region Seam Inspector Pill */}
      <AnimatePresence>
        {highlightedRegion && recordingProgress === null && (
          <motion.div
            key="region-inspector-pill"
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.16 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-h-surface/95 border border-h-accent-border px-3 py-1.5 rounded-xl shadow-md text-[11px] font-medium text-h-text whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-h-accent shrink-0" />
            <span>
              Region: <strong className="text-h-accent-text">{REGION_LABELS[highlightedRegion]}</strong>
            </span>
            {isPure3DMode && onSwitchToEditor && (
              <button
                type="button"
                onClick={onSwitchToEditor}
                className="px-2 py-0.5 rounded-md bg-h-accent-soft text-h-accent-text font-semibold hover:bg-h-accent hover:text-white transition-colors cursor-pointer"
              >
                Edit UV
              </button>
            )}
            {onSelectBodyRegion && (
              <button
                type="button"
                onClick={() => onSelectBodyRegion(null)}
                aria-label="Clear region highlight"
                className="text-h-muted hover:text-h-text cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-Right Compact Controls: Cut-Gated Compare 3D + Guide Toggle */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
        <AnimatePresence>
          {canCompare3D && (
            <motion.button
              key="compare-3d-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              transition={{ duration: 0.18 }}
              whileTap={{ scale: 0.96 }}
              onClick={cycleCompareMode}
              data-testid="toggle-3d-compare-btn"
              title="Compare Original vs Stripped in 3D (Off → Wipe → Side-by-Side)"
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap ${
                compareMode !== 'off'
                  ? 'bg-h-accent border-h-accent text-white'
                  : 'bg-h-surface/95 border-h-border text-h-text hover:border-h-accent-border'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>
                {compareMode === 'off'
                  ? 'Compare 3D'
                  : compareMode === 'split'
                  ? 'Wipe'
                  : 'Side-by-Side'}
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {onTogglePaint3D && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            disabled={!hasActiveSlotImage}
            onClick={onTogglePaint3D}
            data-testid="toggle-3d-paint-btn"
            title={
              hasActiveSlotImage
                ? `Paint directly onto ${activeSlotLabel} in 3D`
                : 'Load or import a garment first to paint in 3D'
            }
            className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-35 disabled:cursor-default ${
              paint3DEnabled && hasActiveSlotImage
                ? 'bg-h-accent border-h-accent text-white'
                : 'bg-h-surface/95 border-h-border text-h-text-2 hover:text-h-text hover:border-h-accent-border'
            }`}
          >
            <Brush className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paint 3D</span>
          </motion.button>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowUvDummy((v) => !v)}
          data-testid="toggle-3d-uv-dummy-btn"
          title="Toggle FRONT / BACK / R / L UV Alignment Guide on Avatar"
          className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap ${
            showUvDummy
              ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
              : 'bg-h-surface/95 border-h-border text-h-text-2 hover:text-h-text hover:border-h-accent-border'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Guide</span>
        </motion.button>

        <AnimatePresence>
          {hasActiveSlotImage && onRemoveActiveTemplate && (
            <motion.button
              key="remove-3d-template-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.16 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRemoveActiveTemplate}
              data-testid="viewport-3d-remove-template-btn"
              title={`Remove imported ${activeSlotLabel}`}
              aria-label={`Remove imported ${activeSlotLabel}`}
              className="h-9 px-2.5 rounded-xl border border-h-border bg-h-surface/95 hover:border-rose-400/45 hover:text-rose-400 text-h-text-2 text-xs font-medium flex items-center gap-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Remove</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Floating Controls (Dripzels-inspired, airy & unobstructed single row!) */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-nowrap items-center justify-between gap-1.5 pointer-events-none">
        {/* Bottom-Left: Avatar & Stage Sheet Triggers */}
        <div className="pointer-events-auto flex items-center gap-1 bg-h-surface/95 border border-h-border rounded-2xl p-1 shadow-[0_10px_28px_rgba(15,23,42,0.1)] shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => toggleSheet('avatar')}
            data-testid="open-avatar-sheet-btn"
            className={`min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeSheet === 'avatar'
                ? 'bg-h-accent text-white'
                : 'text-h-text hover:bg-h-surface-3'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Avatar</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => toggleSheet('stage')}
            data-testid="open-stage-sheet-btn"
            className={`min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeSheet === 'stage'
                ? 'bg-h-accent text-white'
                : 'text-h-text hover:bg-h-surface-3'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Stage</span>
          </motion.button>
        </div>

        {/* Bottom-Right: Worn Layer Toggles + Reset Camera + Quick Editor Pill */}
        <div className="pointer-events-auto flex items-center gap-1 bg-h-surface/95 border border-h-border rounded-2xl p-1 shadow-[0_10px_28px_rgba(15,23,42,0.1)] shrink-0">
          {(
            [
              ['shirt', 'Shirt', garments.shirt.hasImage],
              ['pants', 'Pants', garments.pants.hasImage],
              ['tshirt', 'T-Shirt', garments.tshirt.hasImage]
            ] as [keyof GarmentLayerVisibility, string, boolean][]
          ).map(([key, label, loaded]) => {
            const visible = settings.layerVisibility[key];
            return (
              <button
                key={key}
                type="button"
                disabled={!loaded}
                onClick={() => toggleGarmentLayer(key)}
                title={
                  loaded
                    ? `Toggle ${label} visibility on avatar`
                    : `No ${label} loaded yet`
                }
                className={`${
                  loaded ? 'flex' : 'hidden sm:flex'
                } min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-xl text-[11px] font-medium items-center gap-1 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-35 disabled:cursor-default ${
                  loaded && visible
                    ? 'bg-h-accent-soft text-h-accent-text'
                    : 'text-h-muted hover:bg-h-surface-3'
                }`}
              >
                {loaded && visible ? (
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}

          <div className="w-px h-5 bg-h-border-soft mx-0.5" />

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setResetSpinCount((c) => c + 1);
              engineRef.current?.setCameraPreset('three_quarter');
            }}
            title="Reset 3D Camera"
            data-testid="reset-3d-camera-btn"
            className="min-w-[36px] min-h-[36px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl text-h-text-2 hover:text-h-text hover:bg-h-surface-3 flex items-center justify-center transition-colors cursor-pointer"
          >
            <motion.span
              animate={{ rotate: resetSpinCount * -360 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="flex items-center justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </motion.span>
          </motion.button>

          {isPure3DMode && onSwitchToEditor && (
            <>
              {/* Mobile Unified Bottom-Right Editor | 3D Segmented Toggle */}
              <div
                data-testid="mobile-3d-view-switcher"
                className="flex md:hidden items-center bg-h-surface-2 rounded-xl p-0.5 border border-h-border-soft"
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={onSwitchToEditor}
                  data-testid="mobile-switch-editor-from-3d"
                  className="h-8 px-2.5 rounded-lg text-[11px] font-semibold text-h-muted hover:text-h-text flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <PencilLine className="w-3.5 h-3.5" />
                  <span>Editor</span>
                </motion.button>
                <div className="h-8 px-2.5 rounded-lg bg-h-accent text-white text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap">
                  <Box className="w-3.5 h-3.5" />
                  <span>3D</span>
                </div>
              </div>

              {/* Desktop Quick Back to Editor Pill */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={onSwitchToEditor}
                data-testid="quick-back-to-editor-btn"
                title="Back to 2D Editor"
                className="hidden md:flex min-h-[38px] px-3 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PencilLine className="w-3.5 h-3.5" />
                <span>Editor</span>
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* Smooth Slide-Up Avatar & Stage Sheets */}
      <Studio3DSheets
        activeSheet={activeSheet}
        onClose={() => setActiveSheet('none')}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        studioTheme={studioTheme}
        onSetStudioTheme={onSetStudioTheme}
        hasActiveSlotImage={hasActiveSlotImage}
        activeSlotLabel={activeSlotLabel}
        onRemoveActiveTemplate={onRemoveActiveTemplate}
        turntable={turntable}
        onToggleTurntable={() => setTurntable((t) => !t)}
        onSelectCameraPreset={(preset) => engineRef.current?.setCameraPreset(preset)}
        onCaptureSnapshot={handleCaptureSnapshot}
        onRecordTurntableVideo={handleRecordTurntableVideo}
        recordingProgress={recordingProgress}
        onOpenShowcase2D={onOpenShowcase2D}
      />
    </div>
  );
};
