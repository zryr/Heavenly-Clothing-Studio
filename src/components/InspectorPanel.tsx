import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brush,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  EyeOff,
  FlipHorizontal2,
  ImagePlus,
  Layers,
  Link2,
  Moon,
  Palette,
  Pipette,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  Sun,
  Trash2,
  Upload,
  Wand2,
  Wrench,
  X
} from 'lucide-react';
import {
  AvatarPreviewSettings,
  CustomBackgroundConfig,
  CustomBackgroundMode,
  FloatingDecalState,
  InspectorTab,
  LoupeDiameter,
  LoupeSettings,
  LoupeZoomFactor,
  SavedDecalPreset,
  StudioTheme
} from '../types/studio';
import {
  ImageTransform,
  PreflightReport,
  TemplateType,
  ToolMode,
  UvIsland,
  UvSectionId,
  getTemplateSpec
} from '../types/uv';
import { CUSTOM_BG_GRADIENTS } from '../utils/backgroundCompositor';
import { DecalStampConfig } from '../utils/studioCreativeEngine';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  templateType: TemplateType;
  hasImage: boolean;
  hasCutAction: boolean;
  preflight: PreflightReport | null;
  bleedMargin: number;
  onChangeBleedMargin: (val: number) => void;
  onAutoClean: () => void;
  onDefringeAlpha?: () => void;
  customBackground: CustomBackgroundConfig;
  onUpdateCustomBackground: (patch: Partial<CustomBackgroundConfig>) => void;
  onUploadCustomBgFile: (file: File) => void;
  brushSize: number;
  onChangeBrushSize: (val: number) => void;
  brushHardness: number;
  onChangeBrushHardness: (val: number) => void;
  transform: ImageTransform;
  onUpdateTransform: (next: ImageTransform) => void;
  onBakeTransform: () => void;
  onResetToOriginal: () => void;
  onClearCurrentSlot: () => void;
  showUvOverlay: boolean;
  onToggleUvOverlay: () => void;
  uvOpacity: number;
  onChangeUvOpacity: (val: number) => void;
  showUvLabels: boolean;
  onToggleUvLabels: () => void;
  showCompare: boolean;
  onToggleCompare: () => void;
  avatarSettings: AvatarPreviewSettings;
  onUpdateAvatarSettings: (patch: Partial<AvatarPreviewSettings>) => void;
  studioTheme: StudioTheme;
  onSetStudioTheme: (theme: StudioTheme) => void;
  // Advanced UV Calibration
  islands: UvIsland[];
  uvCalibrationEnabled: boolean;
  onToggleUvCalibration: (enabled: boolean) => void;
  activeUvSection: UvSectionId;
  onChangeUvSection: (sec: UvSectionId) => void;
  uvEditScope: 'section' | 'single';
  onChangeUvEditScope: (scope: 'section' | 'single') => void;
  activeUvIslandName: string | null;
  onSelectUvIslandName: (name: string) => void;
  uvNudgeStep: number;
  onChangeUvNudgeStep: (step: number) => void;
  onNudgeUv: (dx: number, dy: number) => void;
  onExtendUv: (edge: 'left' | 'right' | 'top' | 'bottom' | 'bleed', amount: number) => void;
  onResetUvSection: () => void;
  onResetAllUv: () => void;
  onOpenUvJsonModal: () => void;
  // Creative Studio Props (Paint, Symmetry, Customizable Loupe, Custom PNG Decal Library)
  toolMode: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  paintColor: string;
  onChangePaintColor: (hex: string) => void;
  suggestedColors?: string[];
  onRefreshSuggestedColors?: () => void;
  recentColors: string[];
  paintOpacity: number;
  onChangePaintOpacity: (val: number) => void;
  symmetryEnabled: boolean;
  onToggleSymmetry: () => void;
  clipToUv: boolean;
  onToggleClipToUv: () => void;
  seamBridgeEnabled: boolean;
  onToggleSeamBridge: () => void;
  loupeEnabled: boolean;
  onToggleLoupe: () => void;
  loupeSettings: LoupeSettings;
  onUpdateLoupeSettings: (patch: Partial<LoupeSettings>) => void;
  decalConfig: DecalStampConfig;
  onUpdateDecalConfig: (patch: Partial<DecalStampConfig>) => void;
  onUploadDecalFile: (file: File) => void;
  hasCustomDecalImage: boolean;
  decalPresets: SavedDecalPreset[];
  onSaveDecalPreset: (name: string) => Promise<void>;
  onSelectDecalPreset: (preset: SavedDecalPreset) => void;
  onDeleteDecalPreset: (id: string) => Promise<void>;
  floatingDecal: FloatingDecalState | null;
  onCommitFloatingDecal: () => void;
  onCancelFloatingDecal: () => void;
}

const PAINT_SWATCHES = [
  '#0F172A',
  '#F8FAFC',
  '#38BDF8',
  '#6366F1',
  '#EC4899',
  '#EF4444',
  '#F59E0B',
  '#10B981'
];

const TSHIRT_BASE_SWATCHES = [
  { name: 'Obsidian', hex: '#0F172A' },
  { name: 'Slate', hex: '#1E293B' },
  { name: 'Chalk', hex: '#F1F5F9' },
  { name: 'Sky', hex: '#BAE6FD' },
  { name: 'Forest', hex: '#14532D' },
  { name: 'Crimson', hex: '#7F1D1D' }
];

const CUSTOM_SOLID_SWATCHES = [
  { name: 'Cloud Sky', hex: '#E0F2FE' },
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Periwinkle', hex: '#E0E7FF' },
  { name: 'Rose Blush', hex: '#FCE7F3' },
  { name: 'Soft Mint', hex: '#CCFBF1' },
  { name: 'Studio Dark', hex: '#0F172A' }
];

// Editor-Only 2 Tabs (Avatar & Stage live exclusively in the 3D Viewport's slide-up sheets!)
const TABS: {
  id: InspectorTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'canvas', label: 'Editor', icon: SlidersHorizontal },
  { id: 'uv', label: 'UV Adv', icon: Wrench }
];

const BG_MODES: { id: CustomBackgroundMode; label: string }[] = [
  { id: 'transparent', label: 'None' },
  { id: 'solid', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'image', label: 'Image' }
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeTab,
  onChangeTab,
  templateType,
  hasImage,
  hasCutAction,
  preflight,
  bleedMargin,
  onChangeBleedMargin,
  onAutoClean,
  onDefringeAlpha,
  customBackground,
  onUpdateCustomBackground,
  onUploadCustomBgFile,
  brushSize,
  onChangeBrushSize,
  brushHardness,
  onChangeBrushHardness,
  transform,
  onUpdateTransform,
  onBakeTransform,
  onResetToOriginal,
  onClearCurrentSlot,
  showUvOverlay,
  onToggleUvOverlay,
  uvOpacity,
  onChangeUvOpacity,
  showUvLabels,
  onToggleUvLabels,
  showCompare,
  onToggleCompare,
  avatarSettings,
  onUpdateAvatarSettings,
  studioTheme,
  onSetStudioTheme,
  islands,
  uvCalibrationEnabled,
  onToggleUvCalibration,
  activeUvSection,
  onChangeUvSection,
  uvEditScope,
  onChangeUvEditScope,
  activeUvIslandName,
  onSelectUvIslandName,
  uvNudgeStep,
  onChangeUvNudgeStep,
  onNudgeUv,
  onExtendUv,
  onResetUvSection,
  onResetAllUv,
  onOpenUvJsonModal,
  toolMode,
  onSelectTool,
  paintColor,
  onChangePaintColor,
  suggestedColors = [],
  onRefreshSuggestedColors,
  recentColors,
  paintOpacity,
  onChangePaintOpacity,
  symmetryEnabled,
  onToggleSymmetry,
  clipToUv,
  onToggleClipToUv,
  seamBridgeEnabled,
  onToggleSeamBridge,
  loupeEnabled,
  onToggleLoupe,
  loupeSettings,
  onUpdateLoupeSettings,
  decalConfig,
  onUpdateDecalConfig,
  onUploadDecalFile,
  hasCustomDecalImage,
  decalPresets,
  onSaveDecalPreset,
  onSelectDecalPreset,
  onDeleteDecalPreset,
  floatingDecal,
  onCommitFloatingDecal,
  onCancelFloatingDecal
}) => {
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const decalFileInputRef = useRef<HTMLInputElement | null>(null);
  const spec = getTemplateSpec(templateType);

  const [stampOpen, setStampOpen] = useState(false);
  const [customBgOpen, setCustomBgOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);

  const isStampPanelOpen = stampOpen || toolMode === 'stamp';

  const sectionIslands = islands.filter((isl) => {
    if (activeUvSection === 'torso') return isl.group === 'torso';
    if (activeUvSection === 'right_limb') {
      return isl.group === 'right_arm' || isl.group === 'right_leg';
    }
    return isl.group === 'left_arm' || isl.group === 'left_leg';
  });

  const hasDirtyOutside = Boolean(spec.hasUvIslands && preflight && preflight.dirtyNonUvPixels > 0);

  return (
    <aside className="w-full h-full bg-h-surface border-l border-h-border flex flex-col overflow-hidden text-h-text">
      {/* Hidden file input for Custom Stripped Background Image */}
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadCustomBgFile(f);
          e.target.value = '';
        }}
      />

      {/* Hidden file input for Custom Decal PNG Logo */}
      <input
        ref={decalFileInputRef}
        type="file"
        accept="image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadDecalFile(f);
          e.target.value = '';
        }}
      />

      {/* Focused 2-Tab Editor Header */}
      <div className="grid grid-cols-2 border-b border-h-border bg-h-surface-2 shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTab(t.id)}
              data-testid={`inspector-tab-${t.id}`}
              className={`relative py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                active ? 'text-h-accent-text bg-h-surface' : 'text-h-muted hover:text-h-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              {active && (
                <motion.span
                  layoutId="inspector-tab-underline"
                  className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-h-accent"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable Editor Tab Content with Smooth Slide-Fade Transition */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'canvas' && (
            <motion.div
              key="inspector-tab-canvas-panel"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="space-y-5"
            >
              {/* Template Cleanup (Shirts & Pants) */}
              {spec.hasUvIslands ? (
              <section className="space-y-3 pb-4 border-b border-h-border-soft">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-h-text tracking-wide">
                    UV Background Cleanup
                  </h3>
                  {preflight && hasImage && (
                    <span
                      className={`text-[11px] font-mono font-medium tabular-nums ${
                        preflight.dirtyNonUvPixels === 0 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {preflight.dirtyNonUvPixels === 0
                        ? 'Clean'
                        : `${preflight.dirtyNonUvPixels.toLocaleString()} outside`}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-h-muted">
                    <span>Seam Bleed Margin</span>
                    <span className="font-mono font-semibold text-h-text">
                      +{bleedMargin} px
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((px) => {
                      const active = bleedMargin === px;
                      return (
                        <motion.button
                          key={px}
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => onChangeBleedMargin(px)}
                          className={`relative py-1.5 rounded-xl text-xs font-mono border transition-colors cursor-pointer ${
                            active
                              ? 'border-h-accent-border text-h-accent-text font-semibold'
                              : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="bleed-margin-pill"
                              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                              className="absolute inset-0 rounded-xl bg-h-accent-soft"
                            />
                          )}
                          <span className="relative z-10">{px === 0 ? 'Exact (0)' : `+${px} px`}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={!hasImage}
                  onClick={onAutoClean}
                  data-testid="inspector-autoclean-btn"
                  className="w-full py-2.5 px-3 rounded-xl bg-h-accent hover:bg-h-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Clean Outside UV
                </motion.button>

                {onDefringeAlpha && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    disabled={!hasImage}
                    onClick={onDefringeAlpha}
                    data-testid="inspector-defringe-btn"
                    title="Removes faint semi-transparent halo pixels around collars, sleeves & hems and crisps jagged edges"
                    className="w-full py-2 px-3 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border hover:border-h-accent-border disabled:opacity-40 disabled:cursor-not-allowed text-h-text-2 hover:text-h-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-h-accent-text" />
                    Defringe Alpha Edges
                  </motion.button>
                )}
              </section>
            ) : (
              /* Classic T-Shirt Base Color Preview */
              <section className="space-y-3 pb-4 border-b border-h-border-soft">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-h-text">Base Shirt Color</h3>
                  <span className="text-[11px] font-mono text-h-muted">
                    {avatarSettings.tshirtBaseColor.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-h-muted leading-relaxed">
                  Classic T-Shirts overlay a 512×512 graphic on the front chest. Pick a shirt tone to preview beneath transparent pixels.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {TSHIRT_BASE_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      onClick={() => onUpdateAvatarSettings({ tshirtBaseColor: sw.hex })}
                      style={{ backgroundColor: sw.hex }}
                      className={`w-7 h-7 rounded-lg border-2 transition-transform cursor-pointer ${
                        avatarSettings.tshirtBaseColor.toLowerCase() === sw.hex.toLowerCase()
                          ? 'border-h-accent scale-105'
                          : 'border-h-border hover:scale-105'
                      }`}
                    />
                  ))}
                  <label className="relative w-7 h-7 rounded-lg border border-h-border overflow-hidden cursor-pointer flex items-center justify-center bg-h-surface-2">
                    <input
                      type="color"
                      aria-label="Custom base shirt color"
                      value={avatarSettings.tshirtBaseColor}
                      onChange={(e) => onUpdateAvatarSettings({ tshirtBaseColor: e.target.value })}
                      className="opacity-0 absolute inset-0 cursor-pointer"
                    />
                    <span className="text-[10px] text-h-text-2 font-mono">+</span>
                  </label>
                </div>
                {onDefringeAlpha && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    disabled={!hasImage}
                    onClick={onDefringeAlpha}
                    data-testid="inspector-defringe-btn"
                    title="Removes faint semi-transparent halo pixels around chest graphic edges"
                    className="w-full py-2 px-3 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border hover:border-h-accent-border disabled:opacity-40 disabled:cursor-not-allowed text-h-text-2 hover:text-h-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-h-accent-text" />
                    Defringe Graphic Edges
                  </motion.button>
                )}
              </section>
            )}

            {/* ================= PAINT, BRUSH & MIRROR SYMMETRY ================= */}
            <section className="space-y-3 pb-4 border-b border-h-border-soft" data-testid="creative-brush-section">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-h-text flex items-center gap-1.5">
                  <Brush className="w-3.5 h-3.5 text-h-accent-text" />
                  Paint, Erase & Symmetry
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="inspector-eyedropper-btn"
                    onClick={() => onSelectTool('eyedropper')}
                    title="Eyedropper Color Sampler (I or Alt+Click)"
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                      toolMode === 'eyedropper'
                        ? 'bg-h-accent text-white'
                        : 'text-h-text-2 hover:text-h-accent-text hover:bg-h-surface-2'
                    }`}
                  >
                    <Pipette className="w-3 h-3" />
                    <span>Pick</span>
                  </button>
                  {toolMode !== 'paint' && (
                    <button
                      type="button"
                      onClick={() => onSelectTool('paint')}
                      className="text-[10px] font-semibold text-h-accent-text hover:underline cursor-pointer"
                    >
                      Paint
                    </button>
                  )}
                </div>
              </div>

              {/* Symmetry, Clip-to-UV, Seam Bridge & Customizable Loupe Quick Toggles */}
              <div className="grid grid-cols-2 gap-1.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onToggleSymmetry}
                  data-testid="inspector-symmetry-btn"
                  title="Mirror strokes L ↔ R across arms, legs, and torso"
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    symmetryEnabled
                      ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                      : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                  }`}
                >
                  <FlipHorizontal2 className="w-3 h-3 shrink-0" />
                  <span>L↔R Mirror</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onToggleClipToUv}
                  data-testid="inspector-clip-uv-btn"
                  title="Keep paint & stamps strictly inside UV islands"
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    clipToUv
                      ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                      : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                  }`}
                >
                  <Layers className="w-3 h-3 shrink-0" />
                  <span>Clip UV</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onToggleSeamBridge}
                  data-testid="inspector-seam-bridge-btn"
                  title="Continue strokes seamlessly across connected horizontal torso & limb UV seams"
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    seamBridgeEnabled
                      ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                      : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                  }`}
                >
                  <Link2 className="w-3 h-3 shrink-0" />
                  <span>Seam Bridge</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onToggleLoupe}
                  data-testid="inspector-loupe-btn"
                  title="Toggle customizable pixel magnifier loupe"
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    loupeEnabled
                      ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                      : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                  }`}
                >
                  <Search className="w-3 h-3 shrink-0" />
                  <span>{loupeSettings.zoom}× Loupe</span>
                </motion.button>
              </div>

              {/* Customizable Precision Loupe Settings (smoothly expands when Loupe is enabled) */}
              <AnimatePresence initial={false}>
                {loupeEnabled && (
                  <motion.div
                    key="loupe-custom-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div
                      data-testid="loupe-settings-panel"
                      className="p-2.5 rounded-xl bg-h-surface-2 border border-h-border space-y-2.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-h-text-2">Loupe Magnification</span>
                          <span className="font-mono font-bold text-h-accent-text">
                            {loupeSettings.zoom}×
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {([2, 4, 6, 8, 12] as LoupeZoomFactor[]).map((z) => (
                            <button
                              key={z}
                              type="button"
                              onClick={() => onUpdateLoupeSettings({ zoom: z })}
                              data-testid={`loupe-zoom-${z}`}
                              className={`py-1 rounded-lg border text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                                loupeSettings.zoom === z
                                  ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                                  : 'bg-h-surface border-h-border text-h-muted hover:text-h-text'
                              }`}
                            >
                              {z}×
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div className="space-y-1">
                          <span className="text-[10px] text-h-muted block">Loupe Size</span>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                [112, 'S'],
                                [148, 'M'],
                                [188, 'L']
                              ] as [LoupeDiameter, string][]
                            ).map(([d, lbl]) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => onUpdateLoupeSettings({ diameter: d })}
                                data-testid={`loupe-size-${lbl.toLowerCase()}`}
                                className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer ${
                                  loupeSettings.diameter === d
                                    ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                                    : 'bg-h-surface border-h-border text-h-muted hover:text-h-text'
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-3.5">
                          <label className="flex items-center justify-between text-[10px] text-h-text-2 cursor-pointer">
                            <span>Pixel Grid</span>
                            <input
                              type="checkbox"
                              checked={loupeSettings.showPixelGrid}
                              onChange={(e) =>
                                onUpdateLoupeSettings({ showPixelGrid: e.target.checked })
                              }
                              className="accent-h-accent cursor-pointer"
                            />
                          </label>
                          <label className="flex items-center justify-between text-[10px] text-h-text-2 cursor-pointer">
                            <span>HEX Swatch</span>
                            <input
                              type="checkbox"
                              checked={loupeSettings.showHexReadout}
                              onChange={(e) =>
                                onUpdateLoupeSettings({ showHexReadout: e.target.checked })
                              }
                              className="accent-h-accent cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Paint Color Swatches & Smart Color Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-h-muted">Paint Color</span>
                  <span className="font-mono font-semibold text-h-text uppercase">{paintColor}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PAINT_SWATCHES.map((hex) => (
                    <motion.button
                      key={hex}
                      type="button"
                      whileHover={{ scale: 1.12 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => {
                        onChangePaintColor(hex);
                        if (toolMode !== 'paint') onSelectTool('paint');
                      }}
                      style={{ backgroundColor: hex }}
                      aria-label={`Paint color ${hex}`}
                      className={`w-6 h-6 rounded-lg border-2 transition-colors cursor-pointer ${
                        paintColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-h-accent scale-110 shadow-xs'
                          : 'border-h-border'
                      }`}
                    />
                  ))}
                  <label
                    title="Custom paint color"
                    className="relative w-6 h-6 rounded-lg border border-h-border overflow-hidden cursor-pointer flex items-center justify-center bg-h-surface-2 hover:border-h-accent-border transition-colors"
                  >
                    <input
                      type="color"
                      aria-label="Custom paint color"
                      value={paintColor}
                      onChange={(e) => {
                        onChangePaintColor(e.target.value);
                        if (toolMode !== 'paint') onSelectTool('paint');
                      }}
                      className="opacity-0 absolute inset-0 cursor-pointer"
                    />
                    <span className="text-[10px] text-h-text-2 font-mono">+</span>
                  </label>
                </div>

                {/* Smart Color Picker — Suggested 5 Dominant Colors Extracted from Current 2D Canvas */}
                <AnimatePresence initial={false}>
                  {hasImage && suggestedColors.length > 0 && (
                    <motion.div
                      key="suggested-palette-block"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div
                        className="pt-1.5 space-y-1.5"
                        data-testid="suggested-canvas-swatches"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-h-accent-text flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Suggested
                          </span>
                          {onRefreshSuggestedColors && (
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.9, rotate: -180 }}
                              onClick={onRefreshSuggestedColors}
                              data-testid="refresh-suggested-colors-btn"
                              title="Re-extract 5 dominant colors from canvas"
                              aria-label="Refresh suggested canvas colors"
                              className="text-[10px] text-h-muted hover:text-h-accent-text flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Extract</span>
                            </motion.button>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {suggestedColors.map((hex, idx) => {
                            const selected = paintColor.toLowerCase() === hex.toLowerCase();
                            return (
                              <motion.button
                                key={`${hex}-${idx}`}
                                type="button"
                                initial={{ opacity: 0, scale: 0.72 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{
                                  delay: idx * 0.03,
                                  type: 'spring',
                                  stiffness: 420,
                                  damping: 26
                                }}
                                whileHover={{ scale: 1.08, y: -1 }}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => {
                                  onChangePaintColor(hex);
                                  if (toolMode !== 'paint') onSelectTool('paint');
                                }}
                                style={{ backgroundColor: hex }}
                                data-testid={`suggested-swatch-${idx}`}
                                data-color={hex}
                                title={`Suggested canvas color ${hex}`}
                                aria-label={`Suggested color ${hex}`}
                                className={`h-6 rounded-lg border-2 transition-colors cursor-pointer flex items-center justify-center ${
                                  selected
                                    ? 'border-h-accent shadow-[0_0_0_2px_rgba(56,189,248,0.28)]'
                                    : 'border-white/20 hover:border-h-accent-border'
                                }`}
                              >
                                {selected && (
                                  <Check className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Recent Sampled Swatches from Eyedropper */}
                {recentColors.length > 0 && (
                  <div className="pt-1 space-y-1" data-testid="recent-sampled-swatches">
                    <span className="text-[10px] text-h-muted block">Recent Sampled</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {recentColors.map((hex) => (
                        <motion.button
                          key={hex}
                          type="button"
                          initial={{ opacity: 0, scale: 0.75 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            onChangePaintColor(hex);
                            if (toolMode !== 'paint') onSelectTool('paint');
                          }}
                          style={{ backgroundColor: hex }}
                          title={`Sampled ${hex}`}
                          aria-label={`Recent sampled color ${hex}`}
                          className={`w-5 h-5 rounded-md border-2 transition-colors cursor-pointer ${
                            paintColor.toLowerCase() === hex.toLowerCase()
                              ? 'border-h-accent scale-110'
                              : 'border-white/25'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-h-muted">Brush Diameter</span>
                  <span className="font-mono font-semibold text-h-text tabular-nums">
                    {brushSize} px
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={64}
                  value={brushSize}
                  onChange={(e) => onChangeBrushSize(Number(e.target.value))}
                  className="w-full accent-h-accent cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-h-muted">Hardness</span>
                    <span className="font-mono font-semibold text-h-text tabular-nums">
                      {Math.round(brushHardness * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={Math.round(brushHardness * 100)}
                    onChange={(e) => onChangeBrushHardness(Number(e.target.value) / 100)}
                    className="w-full accent-h-accent cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-h-muted">Opacity</span>
                    <span className="font-mono font-semibold text-h-text tabular-nums">
                      {Math.round(paintOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(paintOpacity * 100)}
                    onChange={(e) => onChangePaintOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-h-accent cursor-pointer"
                  />
                </div>
              </div>
            </section>

            {/* ================= CUSTOM PNG DECALS & SAVED PRESETS ================= */}
            <section className="pb-4 border-b border-h-border-soft" data-testid="decal-stamp-section">
              <button
                type="button"
                onClick={() => setStampOpen((v) => !v)}
                data-testid="toggle-decal-section-btn"
                className="w-full flex items-center justify-between text-xs font-semibold text-h-text cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Stamp className="w-3.5 h-3.5 text-h-accent-text" />
                  Custom PNG Decals
                </span>
                <span className="flex items-center gap-1.5">
                  {decalPresets.length > 0 && (
                    <span className="text-[10px] font-mono text-h-muted">
                      {decalPresets.length}
                    </span>
                  )}
                  <motion.span
                    animate={{ rotate: isStampPanelOpen ? 90 : 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className="flex items-center justify-center"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-h-muted" />
                  </motion.span>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isStampPanelOpen && (
                  <motion.div
                    key="decal-stamp-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-3">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => decalFileInputRef.current?.click()}
                        data-testid="upload-custom-decal-btn"
                        className="w-full py-2 px-2.5 rounded-xl bg-h-accent-soft hover:bg-h-accent-soft/80 border border-h-accent-border text-h-accent-text text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {hasCustomDecalImage ? 'Upload Another PNG Decal' : 'Upload Custom PNG Decal'}
                      </motion.button>

                      {/* Live Floating Decal Layer Status Banner */}
                      {floatingDecal && (
                        <div className="p-2 rounded-xl bg-h-accent-soft border border-h-accent-border flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-h-accent-text truncate">
                            Positioning "{floatingDecal.name}"
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={onCommitFloatingDecal}
                              className="px-2 py-0.5 rounded-md bg-h-accent text-white text-[10px] font-semibold cursor-pointer"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={onCancelFloatingDecal}
                              className="px-1.5 py-0.5 rounded-md bg-h-surface text-h-text-2 text-[10px] font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Active Uploaded PNG Preview + Save as Reusable Preset */}
                      {hasCustomDecalImage && decalConfig.customImageUrl && (
                        <div className="p-2.5 rounded-xl bg-h-surface-2 border border-h-border space-y-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-11 h-11 rounded-lg border border-h-border overflow-hidden shrink-0 flex items-center justify-center p-1"
                              style={{
                                backgroundImage:
                                  'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)',
                                backgroundSize: '10px 10px'
                              }}
                            >
                              <img
                                src={decalConfig.customImageUrl}
                                alt="Active custom decal"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <input
                                type="text"
                                value={decalConfig.customName}
                                maxLength={28}
                                onChange={(e) =>
                                  onUpdateDecalConfig({ customName: e.target.value })
                                }
                                placeholder="Preset name..."
                                data-testid="decal-preset-name-input"
                                className="w-full h-7 px-2 rounded-lg bg-h-surface border border-h-border text-[11px] text-h-text focus:border-h-accent focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={savingPreset}
                                onClick={async () => {
                                  setSavingPreset(true);
                                  try {
                                    await onSaveDecalPreset(
                                      decalConfig.customName.trim() || 'Custom Decal'
                                    );
                                  } finally {
                                    setSavingPreset(false);
                                  }
                                }}
                                data-testid="save-decal-preset-btn"
                                className="w-full py-1 px-2 rounded-lg bg-h-surface hover:bg-h-surface-3 border border-h-border text-[10px] font-semibold text-h-accent-text flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Save className="w-3 h-3" />
                                {decalConfig.activePresetId ? 'Update Saved Preset' : 'Save as Preset'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Saved Custom PNG Presets Library */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-h-text-2">Saved PNG Presets</span>
                          <span className="font-mono text-h-muted">
                            {decalPresets.length} saved
                          </span>
                        </div>
                        {decalPresets.length === 0 ? (
                          <p className="text-[10px] text-h-muted px-2.5 py-2 rounded-xl bg-h-surface-2 border border-dashed border-h-border leading-relaxed">
                            Upload any transparent PNG logo or patch and save it here for instant reuse across garments.
                          </p>
                        ) : (
                          <div
                            data-testid="saved-decal-presets-grid"
                            className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-0.5"
                          >
                            {decalPresets.map((preset) => {
                              const active = decalConfig.activePresetId === preset.id;
                              return (
                                <div
                                  key={preset.id}
                                  className={`group relative rounded-xl border overflow-hidden transition-colors ${
                                    active
                                      ? 'border-h-accent bg-h-accent-soft/40'
                                      : 'border-h-border bg-h-surface-2 hover:border-h-accent-border'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onSelectDecalPreset(preset)}
                                    data-testid={`saved-decal-preset-${preset.id}`}
                                    title={`Equip ${preset.name}`}
                                    className="w-full p-1.5 flex flex-col items-center gap-1 cursor-pointer"
                                  >
                                    <div
                                      className="w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center p-1"
                                      style={{
                                        backgroundImage:
                                          'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)',
                                        backgroundSize: '8px 8px'
                                      }}
                                    >
                                      <img
                                        src={preset.dataUrl}
                                        alt={preset.name}
                                        className="max-w-full max-h-full object-contain"
                                      />
                                    </div>
                                    <span className="w-full truncate text-[9px] font-medium text-h-text-2 text-center">
                                      {preset.name}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteDecalPreset(preset.id);
                                    }}
                                    title={`Delete ${preset.name}`}
                                    data-testid={`delete-decal-preset-${preset.id}`}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-md bg-h-surface/90 border border-h-border text-h-muted hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Placement Size, Rotation & Opacity */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-h-muted">Decal Size</span>
                          <span className="font-mono text-h-text">{decalConfig.size} px</span>
                        </div>
                        <input
                          type="range"
                          min={16}
                          max={160}
                          value={decalConfig.size}
                          onChange={(e) => onUpdateDecalConfig({ size: Number(e.target.value) })}
                          className="w-full accent-h-accent cursor-pointer"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-h-muted">Rotate</span>
                            <span className="font-mono text-h-text">{decalConfig.rotationDeg}°</span>
                          </div>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            value={decalConfig.rotationDeg}
                            onChange={(e) =>
                              onUpdateDecalConfig({ rotationDeg: Number(e.target.value) })
                            }
                            className="w-full accent-h-accent cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-h-muted">Opacity</span>
                            <span className="font-mono text-h-text">
                              {Math.round(decalConfig.opacity * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={Math.round(decalConfig.opacity * 100)}
                            onChange={(e) =>
                              onUpdateDecalConfig({ opacity: Number(e.target.value) / 100 })
                            }
                            className="w-full accent-h-accent cursor-pointer"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-h-muted">
                        Click on the 2D template to stamp. Works with L↔R Mirror & Clip UV.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* ================= CUSTOM STRIPPED BACKGROUND STUDIO (Collapsible) ================= */}
            <section className="pb-4 border-b border-h-border-soft" data-testid="custom-bg-section">
              <button
                type="button"
                onClick={() => setCustomBgOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-h-text cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-h-accent-text" />
                  Stripped Background
                </span>
                <span className="flex items-center gap-1.5">
                  {customBackground.mode !== 'transparent' && (
                    <span className="text-[10px] font-mono text-h-accent-text capitalize">
                      {customBackground.mode}
                    </span>
                  )}
                  <motion.span
                    animate={{
                      rotate: customBgOpen || customBackground.mode !== 'transparent' ? 90 : 0
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className="flex items-center justify-center"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-h-muted" />
                  </motion.span>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {(customBgOpen || customBackground.mode !== 'transparent') && (
                  <motion.div
                    key="custom-bg-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-3">
                      <p className="text-[11px] text-h-muted leading-snug">
                        Fill the stripped area outside UV islands with a gradient, color, or backdrop image.
                      </p>

                      {/* Mode Selector */}
                      <div className="grid grid-cols-4 gap-1 bg-h-surface-2 p-1 rounded-xl border border-h-border-soft">
                        {BG_MODES.map((m) => {
                          const active = customBackground.mode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!hasImage && m.id !== 'transparent'}
                              onClick={() => {
                                if (m.id === 'image' && !customBackground.imageDataUrl) {
                                  bgFileInputRef.current?.click();
                                } else {
                                  onUpdateCustomBackground({ mode: m.id });
                                }
                              }}
                              data-testid={`custom-bg-mode-${m.id}`}
                              className={`py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                                active
                                  ? 'bg-h-surface text-h-accent-text shadow-xs border border-h-border'
                                  : 'text-h-muted hover:text-h-text'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      {customBackground.mode === 'solid' && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {CUSTOM_SOLID_SWATCHES.map((sw) => (
                            <button
                              key={sw.hex}
                              type="button"
                              title={sw.name}
                              onClick={() => onUpdateCustomBackground({ solidColor: sw.hex })}
                              style={{ backgroundColor: sw.hex }}
                              className={`w-7 h-7 rounded-lg border-2 transition-transform cursor-pointer ${
                                customBackground.solidColor.toLowerCase() === sw.hex.toLowerCase()
                                  ? 'border-h-accent scale-105'
                                  : 'border-[#CBDDF5] hover:scale-105'
                              }`}
                            />
                          ))}
                          <label
                            title="Custom solid backdrop color"
                            className="relative w-7 h-7 rounded-lg border border-[#CBDDF5] overflow-hidden cursor-pointer flex items-center justify-center bg-h-surface-2"
                          >
                            <input
                              type="color"
                              aria-label="Custom stripped background color"
                              value={customBackground.solidColor}
                              onChange={(e) =>
                                onUpdateCustomBackground({ solidColor: e.target.value })
                              }
                              className="opacity-0 absolute inset-0 cursor-pointer"
                            />
                            <span className="text-[11px] text-h-text-2 font-mono">+</span>
                          </label>
                        </div>
                      )}

                      {customBackground.mode === 'gradient' && (
                        <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                          {CUSTOM_BG_GRADIENTS.map((g) => {
                            const active = customBackground.gradientId === g.id;
                            return (
                              <button
                                key={g.id}
                                type="button"
                                title={g.name}
                                data-testid={`custom-bg-gradient-${g.id}`}
                                onClick={() => onUpdateCustomBackground({ gradientId: g.id })}
                                style={{
                                  background: `linear-gradient(${g.angleDeg}deg, ${g.stops[0]}, ${g.stops[1]}, ${g.stops[2]})`
                                }}
                                className={`h-8 rounded-lg border-2 transition-transform cursor-pointer ${
                                  active
                                    ? 'border-h-accent scale-105 shadow-xs'
                                    : 'border-[#CBDDF5] hover:scale-105'
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}

                      {customBackground.mode === 'image' && (
                        <div className="space-y-2 pt-0.5">
                          {customBackground.imageDataUrl ? (
                            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-h-surface-2 border border-h-border">
                              <img
                                src={customBackground.imageDataUrl}
                                alt="Custom stripped background"
                                className="w-10 h-10 rounded-lg object-cover border border-h-border shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-h-text truncate">
                                  Custom Backdrop
                                </p>
                                <button
                                  type="button"
                                  onClick={() => bgFileInputRef.current?.click()}
                                  className="text-[10px] font-medium text-h-accent-text hover:underline cursor-pointer"
                                >
                                  Replace Image
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateCustomBackground({
                                    mode: 'transparent',
                                    imageDataUrl: null,
                                    includeInExport: false
                                  })
                                }
                                title="Remove background image"
                                className="p-1.5 rounded-lg text-h-muted hover:text-rose-400 hover:bg-rose-500/12 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => bgFileInputRef.current?.click()}
                              className="w-full py-2.5 px-3 rounded-xl border border-dashed border-[#93C5FD] bg-h-surface-2 hover:bg-h-surface-3 text-xs font-medium text-h-accent-text flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <ImagePlus className="w-4 h-4" />
                              Upload Backdrop Image
                            </button>
                          )}
                        </div>
                      )}

                      {customBackground.mode !== 'transparent' && (
                        <div className="space-y-2.5 pt-1">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-h-muted">Backdrop Opacity</span>
                              <span className="font-mono font-semibold text-h-text tabular-nums">
                                {Math.round(customBackground.opacity * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={15}
                              max={100}
                              value={Math.round(customBackground.opacity * 100)}
                              onChange={(e) =>
                                onUpdateCustomBackground({
                                  opacity: Number(e.target.value) / 100
                                })
                              }
                              className="w-full accent-h-accent cursor-pointer"
                            />
                          </div>

                          <label className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-h-surface-2 border border-h-border cursor-pointer">
                            <div className="space-y-0.5">
                              <span className="text-xs font-semibold text-h-text block">
                                Include in Exported PNG
                              </span>
                              <span className="text-[10px] text-h-muted leading-snug block">
                                Off keeps Roblox-ready transparency; On bakes this backdrop outside UV islands.
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={customBackground.includeInExport}
                              onChange={(e) =>
                                onUpdateCustomBackground({ includeInExport: e.target.checked })
                              }
                              data-testid="custom-bg-export-toggle"
                              className="accent-h-accent w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                            />
                          </label>

                          {hasDirtyOutside && (
                            <div className="p-2.5 rounded-xl bg-h-surface-3 border border-[#BFDBFE] flex items-center justify-between gap-2">
                              <span className="text-[11px] text-h-accent-text leading-snug">
                                Strip old template background to reveal yours.
                              </span>
                              <button
                                type="button"
                                onClick={onAutoClean}
                                className="px-2.5 py-1 rounded-lg bg-h-accent hover:bg-h-accent-hover text-white text-[11px] font-semibold shrink-0 cursor-pointer whitespace-nowrap"
                              >
                                Strip Now
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Non-Destructive Image Transform */}
            <section className="space-y-3 pb-4 border-b border-h-border-soft">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-h-text">Placement & Scale</h3>
                <button
                  type="button"
                  disabled={!hasImage}
                  onClick={onResetToOriginal}
                  data-testid="restore-original-btn"
                  className="text-[11px] font-medium text-h-muted hover:text-h-accent-text disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore Original
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-h-muted">Artwork Scale</span>
                  <span className="font-mono font-semibold text-h-text tabular-nums">
                    {Math.round(transform.scale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={200}
                  disabled={!hasImage}
                  value={Math.round(transform.scale * 100)}
                  onChange={(e) =>
                    onUpdateTransform({
                      ...transform,
                      scale: Number(e.target.value) / 100
                    })
                  }
                  className="w-full accent-h-accent cursor-pointer disabled:opacity-40"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-h-muted">OFFSET X</span>
                  <input
                    type="number"
                    disabled={!hasImage}
                    value={transform.x}
                    onChange={(e) =>
                      onUpdateTransform({ ...transform, x: Number(e.target.value) || 0 })
                    }
                    className="w-full h-8 px-2 rounded-lg bg-h-surface-2 border border-h-border text-xs font-mono text-h-text disabled:opacity-40 focus:border-h-accent focus:outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-mono text-h-muted">OFFSET Y</span>
                  <input
                    type="number"
                    disabled={!hasImage}
                    value={transform.y}
                    onChange={(e) =>
                      onUpdateTransform({ ...transform, y: Number(e.target.value) || 0 })
                    }
                    className="w-full h-8 px-2 rounded-lg bg-h-surface-2 border border-h-border text-xs font-mono text-h-text disabled:opacity-40 focus:border-h-accent focus:outline-none"
                  />
                </label>
              </div>
              {(transform.x !== 0 || transform.y !== 0 || transform.scale !== 1) && (
                <button
                  type="button"
                  onClick={onBakeTransform}
                  className="w-full py-1.5 rounded-xl bg-h-surface-3 hover:bg-h-accent-soft border border-[#93C5FD] text-h-accent-text text-xs font-semibold cursor-pointer"
                >
                  Commit Transform to History
                </button>
              )}
            </section>

            {/* Guides & Slot Controls */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-h-text">Guides & Slot</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onToggleUvOverlay}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-h-surface-2 border border-h-border text-xs font-medium text-h-text-2 hover:border-h-accent-border cursor-pointer transition-colors"
                >
                  <span>{spec.hasUvIslands ? 'UV Island Wireframe' : 'Chest Safe Area Guide'}</span>
                  {showUvOverlay ? (
                    <Eye className="w-3.5 h-3.5 text-h-accent-text" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-h-muted" />
                  )}
                </button>

                {showUvOverlay && (
                  <div className="px-1 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-h-muted">Guide Opacity</span>
                      <span className="font-mono font-semibold text-h-text tabular-nums">
                        {Math.round(uvOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round(uvOpacity * 100)}
                      onChange={(e) => onChangeUvOpacity(Number(e.target.value) / 100)}
                      className="w-full accent-h-accent cursor-pointer"
                    />
                    <label className="flex items-center justify-between text-xs text-h-text-2 cursor-pointer pt-0.5">
                      <span>Show Region Labels</span>
                      <input
                        type="checkbox"
                        checked={showUvLabels}
                        onChange={onToggleUvLabels}
                        className="accent-h-accent rounded cursor-pointer"
                      />
                    </label>
                  </div>
                )}

                {/* Cut-gated Compare shortcut in Inspector */}
                {hasImage && hasCutAction && (
                  <button
                    type="button"
                    onClick={onToggleCompare}
                    data-testid="inspector-compare-btn"
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      showCompare
                        ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                        : 'bg-h-surface-2 border-h-border text-h-text-2 hover:border-h-accent-border'
                    }`}
                  >
                    <span>Before / After Split</span>
                    <Columns2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {hasImage && (
                  <button
                    type="button"
                    onClick={onClearCurrentSlot}
                    data-testid="clear-slot-btn"
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-rose-400/35 bg-rose-500/12 hover:bg-rose-500/20 text-xs font-semibold text-rose-400 transition-colors cursor-pointer"
                  >
                    <span>
                      Remove Imported{' '}
                      {templateType === 'shirt'
                        ? 'Shirt'
                        : templateType === 'pants'
                        ? 'Pants'
                        : 'T-Shirt'}
                    </span>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Studio Appearance Theme Switch */}
                <div className="pt-2 border-t border-h-border-soft space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-h-muted font-medium">Studio Theme</span>
                    <span className="text-h-text-2 capitalize">{studioTheme}</span>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-1 bg-h-surface-2 p-1 rounded-xl border border-h-border-soft"
                    role="group"
                    aria-label="Editor studio theme"
                  >
                    {(
                      [
                        ['dark', 'Dark', Moon],
                        ['light', 'Light', Sun]
                      ] as const
                    ).map(([mode, label, Icon]) => {
                      const active = studioTheme === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onSetStudioTheme(mode)}
                          data-testid={`inspector-theme-${mode}`}
                          className={`relative h-7 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            active ? 'text-h-accent-text' : 'text-h-muted hover:text-h-text'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="inspector-theme-pill"
                              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                              className="absolute inset-0 rounded-lg bg-h-surface border border-h-accent-border shadow-xs"
                            />
                          )}
                          <Icon className="relative z-10 w-3 h-3" />
                          <span className="relative z-10">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
            </motion.div>
          )}

          {/* ================= ADVANCED UV CALIBRATION TAB ================= */}
          {activeTab === 'uv' && (
            <motion.div
              key="inspector-tab-uv-panel"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="space-y-5"
            >
            {!spec.hasUvIslands ? (
              <div className="p-4 rounded-xl bg-h-surface-2 border border-h-border space-y-2">
                <p className="text-xs font-semibold text-h-text">Classic T-Shirt Layout</p>
                <p className="text-xs text-h-text-2 leading-relaxed">
                  Classic T-Shirts map a single{' '}
                  <span className="font-mono font-semibold text-h-text">512 × 512 px</span>{' '}
                  graphic directly onto the front chest. Multi-island UV calibration applies only to
                  Classic Shirts and Classic Pants.
                </p>
              </div>
            ) : (
              <>
                <section className="space-y-2.5 pb-4 border-b border-h-border-soft">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-h-text">UV Calibration Mode</h3>
                    <button
                      type="button"
                      onClick={() => onToggleUvCalibration(!uvCalibrationEnabled)}
                      data-testid="toggle-uv-calibration-btn"
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        uvCalibrationEnabled
                          ? 'bg-amber-500/12 border-amber-300 text-amber-400'
                          : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                      }`}
                    >
                      {uvCalibrationEnabled ? 'Active' : 'Locked'}
                    </button>
                  </div>
                  <p className="text-[11px] text-h-muted leading-relaxed">
                    Unlock to nudge UV island boundaries for custom templates. Arrow keys only move
                    UV masks while calibration is active.
                  </p>
                </section>

                <fieldset disabled={!uvCalibrationEnabled} className="space-y-4 disabled:opacity-45">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-h-muted">Target Section</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ['torso', 'Torso'],
                          ['right_limb', templateType === 'shirt' ? 'R Arm' : 'R Leg'],
                          ['left_limb', templateType === 'shirt' ? 'L Arm' : 'L Leg']
                        ] as [UvSectionId, string][]
                      ).map(([sec, label]) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => onChangeUvSection(sec)}
                          className={`py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                            activeUvSection === sec
                              ? 'bg-amber-500/12 border-amber-300 text-amber-500'
                              : 'bg-h-surface-2 border-h-border text-h-text-2'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['section', 'Whole Section'],
                          ['single', 'Single Face']
                        ] as const
                      ).map(([sc, label]) => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => onChangeUvEditScope(sc)}
                          className={`py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                            uvEditScope === sc
                              ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                              : 'bg-h-surface-2 border-h-border text-h-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {uvEditScope === 'single' && (
                      <select
                        value={activeUvIslandName || sectionIslands[0]?.name || ''}
                        onChange={(e) => onSelectUvIslandName(e.target.value)}
                        className="w-full h-8 px-2 rounded-lg bg-h-surface-2 border border-h-border text-xs text-h-text"
                      >
                        {sectionIslands.map((isl) => (
                          <option key={isl.name} value={isl.name}>
                            {isl.name} ({isl.x}, {isl.y})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-h-muted">Nudge Step</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 5, 10].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => onChangeUvNudgeStep(s)}
                            className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-semibold border cursor-pointer ${
                              uvNudgeStep === s
                                ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                                : 'bg-h-surface-2 border-h-border text-h-muted'
                            }`}
                          >
                            {s}px
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 w-36 mx-auto pt-1">
                      <div />
                      <button
                        type="button"
                        onClick={() => onNudgeUv(0, -uvNudgeStep)}
                        title="Move Up"
                        className="h-9 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border flex items-center justify-center text-h-text cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <div />
                      <button
                        type="button"
                        onClick={() => onNudgeUv(-uvNudgeStep, 0)}
                        title="Move Left"
                        className="h-9 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border flex items-center justify-center text-h-text cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onExtendUv('bleed', 1)}
                        title="Expand +1px Bleed"
                        className="h-9 rounded-xl bg-h-accent-soft hover:bg-h-accent-soft border border-h-accent-border text-[10px] font-mono font-semibold text-h-accent-text cursor-pointer"
                      >
                        +1B
                      </button>
                      <button
                        type="button"
                        onClick={() => onNudgeUv(uvNudgeStep, 0)}
                        title="Move Right"
                        className="h-9 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border flex items-center justify-center text-h-text cursor-pointer"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <div />
                      <button
                        type="button"
                        onClick={() => onNudgeUv(0, uvNudgeStep)}
                        title="Move Down"
                        className="h-9 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border flex items-center justify-center text-h-text cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <div />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-h-muted">
                      Edge Extend / Trim (±{uvNudgeStep}px)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['top', 'Top'],
                          ['bottom', 'Bottom'],
                          ['left', 'Left'],
                          ['right', 'Right']
                        ] as const
                      ).map(([edge, label]) => (
                        <div
                          key={edge}
                          className="flex items-center justify-between px-2 py-1 rounded-xl bg-h-surface-2 border border-h-border text-[11px]"
                        >
                          <span className="text-h-text-2">{label}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onExtendUv(edge, -uvNudgeStep)}
                              className="w-5 h-5 rounded-md bg-h-surface hover:bg-h-surface-3 border border-h-border text-h-text font-mono cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => onExtendUv(edge, uvNudgeStep)}
                              className="w-5 h-5 rounded-md bg-h-surface hover:bg-h-surface-3 border border-h-border text-h-text font-mono cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={onResetUvSection}
                      className="py-1.5 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-xs font-medium text-h-text-2 cursor-pointer"
                    >
                      Reset Section
                    </button>
                    <button
                      type="button"
                      onClick={onResetAllUv}
                      className="py-1.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-400/35 text-xs font-semibold text-amber-500 cursor-pointer"
                    >
                      Official Defaults
                    </button>
                  </div>
                </fieldset>

                <div className="pt-3 border-t border-h-border-soft">
                  <button
                    type="button"
                    onClick={onOpenUvJsonModal}
                    className="w-full py-2 px-3 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-h-accent-text" />
                    UV Coordinates JSON
                  </button>
                </div>
              </>
            )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
};
