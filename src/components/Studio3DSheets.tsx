import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Moon,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User,
  Video,
  X
} from 'lucide-react';
import {
  AccessoryPreset,
  AvatarPreviewSettings,
  BodyPartVisibility,
  DEFAULT_AVATAR_SETTINGS,
  HumanoidType,
  LightingType,
  PoseType,
  Sheet3DType,
  StudioTheme
} from '../types/studio';
import { CameraPresetId, RIG_METADATA } from '../three/avatarSceneEngine';

interface Studio3DSheetsProps {
  activeSheet: Sheet3DType;
  onClose: () => void;
  settings: AvatarPreviewSettings;
  onUpdateSettings: (patch: Partial<AvatarPreviewSettings>) => void;
  studioTheme: StudioTheme;
  onSetStudioTheme: (theme: StudioTheme) => void;
  hasActiveSlotImage?: boolean;
  activeSlotLabel?: string;
  onRemoveActiveTemplate?: () => void;
  turntable: boolean;
  onToggleTurntable: () => void;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  onCaptureSnapshot: (transparentBg: boolean) => void;
  onRecordTurntableVideo?: () => void;
  recordingProgress?: number | null;
  onOpenShowcase2D: () => void;
}

const ACCESSORY_OPTIONS: { id: AccessoryPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'street_beanie', label: 'Beanie' },
  { id: 'bob_hair', label: 'Hair' },
  { id: 'visor_shades', label: 'Shades' },
  { id: 'headphones', label: 'Phones' }
];

const RIG_CARDS: HumanoidType[] = ['blocky_r15', 'woman_1', 'blocky_r6', 'woman_2'];

const SKIN_SWATCHES = [
  { name: 'Porcelain', hex: '#FCE2D0' },
  { name: 'Warm Peach', hex: '#F4C6A6' },
  { name: 'Medium Sand', hex: '#D9A77C' },
  { name: 'Golden Bronze', hex: '#B57B4C' },
  { name: 'Deep Chestnut', hex: '#7D4E32' },
  { name: 'Classic Yellow', hex: '#F5CD30' }
];

const BACKDROP_SWATCHES = [
  { name: 'Twilight Sky', hex: '#0E172A' },
  { name: 'Obsidian Night', hex: '#090D16' },
  { name: 'Studio Slate', hex: '#1E293B' },
  { name: 'Cloud Sky', hex: '#EAF2FF' },
  { name: 'Periwinkle Mist', hex: '#E0E7FF' },
  { name: 'Pure White', hex: '#F8FAFC' }
];

const POSE_OPTIONS: { id: PoseType; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 't_pose', label: 'T-Pose' },
  { id: 'action_walk', label: 'Walk' },
  { id: 'fashion_hip', label: 'Pose' },
  { id: 'hero', label: 'Hero' }
];

const CAMERA_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'three_quarter', label: '3/4' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' }
];

const LIGHTING_OPTIONS: { id: LightingType; label: string; hint: string }[] = [
  { id: 'true_color', label: 'True-Color', hint: 'Crisp studio colors + soft edges' },
  { id: '3_point', label: '3-Point', hint: 'Sculpted key, fill & rim lights' },
  { id: 'none', label: 'Flat Unlit', hint: '100% raw albedo inspection' }
];

const RigSilhouetteSvg: React.FC<{ rig: HumanoidType; active: boolean }> = ({ rig, active }) => {
  const fill = active ? 'var(--h-accent-border)' : 'var(--h-muted)';
  const accent = active ? 'var(--h-accent-text)' : 'var(--h-border)';

  if (rig === 'blocky_r15') {
    return (
      <svg viewBox="0 0 64 80" className="w-11 h-14 shrink-0" aria-hidden="true">
        {/* Rounded Blocky Head */}
        <rect x="23" y="4" width="18" height="16" rx="5" fill={fill} />
        {/* Upper + Lower Torso (seamless flush R15) */}
        <rect x="19" y="22" width="26" height="24" rx="2.5" fill={fill} />
        <line x1="20" y1="37" x2="44" y2="37" stroke={accent} strokeWidth="0.9" strokeOpacity="0.65" />
        {/* Arms */}
        <rect x="7.5" y="22" width="10" height="24" rx="2" fill={fill} />
        <rect x="46.5" y="22" width="10" height="24" rx="2" fill={fill} />
        <line x1="8.5" y1="33" x2="16.5" y2="33" stroke={accent} strokeWidth="0.8" strokeOpacity="0.6" />
        <line x1="47.5" y1="33" x2="55.5" y2="33" stroke={accent} strokeWidth="0.8" strokeOpacity="0.6" />
        {/* Legs */}
        <rect x="19" y="47.5" width="12.2" height="26" rx="2" fill={fill} />
        <rect x="32.8" y="47.5" width="12.2" height="26" rx="2" fill={fill} />
        <line x1="20" y1="60" x2="30.2" y2="60" stroke={accent} strokeWidth="0.8" strokeOpacity="0.6" />
        <line x1="33.8" y1="60" x2="44" y2="60" stroke={accent} strokeWidth="0.8" strokeOpacity="0.6" />
      </svg>
    );
  }

  if (rig === 'blocky_r6') {
    return (
      <svg viewBox="0 0 64 80" className="w-11 h-14 shrink-0" aria-hidden="true">
        <rect x="23" y="4" width="18" height="16" rx="5" fill={fill} />
        <rect x="19" y="22" width="26" height="24" rx="2" fill={fill} />
        <rect x="7.5" y="22" width="10" height="24" rx="2" fill={fill} />
        <rect x="46.5" y="22" width="10" height="24" rx="2" fill={fill} />
        <rect x="19" y="47.5" width="12.2" height="26" rx="2" fill={fill} />
        <rect x="32.8" y="47.5" width="12.2" height="26" rx="2" fill={fill} />
      </svg>
    );
  }

  if (rig === 'woman_1') {
    return (
      <svg viewBox="0 0 64 80" className="w-11 h-14 shrink-0" aria-hidden="true">
        {/* Head */}
        <rect x="23.5" y="4" width="17" height="16" rx="5.5" fill={fill} />
        {/* Hourglass Woman Torso */}
        <path
          d="M21 22 L43 22 L40.5 34.5 L42.5 46 L21.5 46 L23.5 34.5 Z"
          fill={fill}
        />
        {/* Angled Slim Arms + Claw Hands */}
        <path d="M19.5 23 L13 42 L8 40 L14.5 22 Z" fill={fill} />
        <circle cx="9.2" cy="43.8" r="3" fill={accent} />
        <path d="M44.5 23 L51 42 L56 40 L49.5 22 Z" fill={fill} />
        <circle cx="54.8" cy="43.8" r="3" fill={accent} />
        {/* Slim Tapered Legs */}
        <path d="M22 47 L31 47 L29.8 73 L23.2 73 Z" fill={fill} />
        <path d="M33 47 L42 47 L40.8 73 L34.2 73 Z" fill={fill} />
      </svg>
    );
  }

  // woman_2: Hourglass Woman torso + angled slim arms + THICK BLOCKY LEGS
  return (
    <svg viewBox="0 0 64 80" className="w-11 h-14 shrink-0" aria-hidden="true">
      {/* Head */}
      <rect x="23.5" y="4" width="17" height="16" rx="5.5" fill={fill} />
      {/* Hourglass Woman Torso */}
      <path
        d="M21 22 L43 22 L40.5 34.5 L43 46 L21 46 L23.5 34.5 Z"
        fill={fill}
      />
      {/* Angled Slim Arms + Claw Hands */}
      <path d="M19.5 23 L13 42 L8 40 L14.5 22 Z" fill={fill} />
      <circle cx="9.2" cy="43.8" r="3" fill={accent} />
      <path d="M44.5 23 L51 42 L56 40 L49.5 22 Z" fill={fill} />
      <circle cx="54.8" cy="43.8" r="3" fill={accent} />
      {/* Thick Rounded-Top Blocky Legs */}
      <rect x="19" y="47" width="12.2" height="27" rx="3" fill={fill} />
      <rect x="32.8" y="47" width="12.2" height="27" rx="3" fill={fill} />
    </svg>
  );
};

export const Studio3DSheets: React.FC<Studio3DSheetsProps> = ({
  activeSheet,
  onClose,
  settings,
  onUpdateSettings,
  studioTheme,
  onSetStudioTheme,
  hasActiveSlotImage = false,
  activeSlotLabel = 'Template',
  onRemoveActiveTemplate,
  turntable,
  onToggleTurntable,
  onSelectCameraPreset,
  onCaptureSnapshot,
  onRecordTurntableVideo,
  recordingProgress = null,
  onOpenShowcase2D
}) => {
  const [fineLightsOpen, setFineLightsOpen] = useState(false);
  const [skinHexDraft, setSkinHexDraft] = useState(settings.skinColor.toUpperCase());
  const [bgHexDraft, setBgHexDraft] = useState(settings.bgColor.toUpperCase());

  useEffect(() => {
    setSkinHexDraft(settings.skinColor.toUpperCase());
  }, [settings.skinColor]);

  useEffect(() => {
    setBgHexDraft(settings.bgColor.toUpperCase());
  }, [settings.bgColor]);

  // Close sheet on Escape
  useEffect(() => {
    if (activeSheet === 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSheet, onClose]);

  const togglePart = (key: keyof BodyPartVisibility) => {
    onUpdateSettings({
      visibility: {
        ...settings.visibility,
        [key]: !settings.visibility[key]
      }
    });
  };

  const setVisibilityPreset = (preset: 'all' | 'shirt' | 'pants') => {
    if (preset === 'all') {
      onUpdateSettings({
        visibility: {
          head: true,
          torso: true,
          leftArm: true,
          rightArm: true,
          leftLeg: true,
          rightLeg: true
        }
      });
    } else if (preset === 'shirt') {
      onUpdateSettings({
        visibility: {
          head: false,
          torso: true,
          leftArm: true,
          rightArm: true,
          leftLeg: false,
          rightLeg: false
        }
      });
    } else {
      onUpdateSettings({
        visibility: {
          head: false,
          torso: true,
          leftArm: false,
          rightArm: false,
          leftLeg: true,
          rightLeg: true
        }
      });
    }
  };

  const commitHex = (raw: string, field: 'skinColor' | 'bgColor') => {
    const cleaned = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      onUpdateSettings({ [field]: cleaned.toUpperCase() });
    }
  };

  return (
    <AnimatePresence>
      {activeSheet !== 'none' && (
        <>
          {/* Click-outside scrim inside 3D viewport (no backdrop-blur over WebGL!) */}
          <motion.div
            key="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="absolute inset-0 z-30 bg-black/45"
          />

          {/* Slide-Up Heavenly Light Sheet */}
          <motion.div
            key={`sheet-${activeSheet}`}
            data-testid={`sheet-3d-${activeSheet}`}
            initial={{ y: '100%', opacity: 0.85 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.85 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="absolute left-2.5 right-2.5 bottom-2.5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[440px] max-w-[calc(100%-20px)] max-h-[82%] z-40 bg-h-surface border border-h-border rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] flex flex-col overflow-hidden"
          >
            {/* Drag Handle + Header */}
            <div className="px-4 pt-2.5 pb-3 border-b border-h-border-soft flex flex-col gap-2 shrink-0 bg-h-surface-2">
              <div className="w-9 h-1 rounded-full bg-h-border mx-auto" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-h-accent-soft text-h-accent-text flex items-center justify-center">
                    {activeSheet === 'avatar' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-h-text leading-tight">
                      {activeSheet === 'avatar' ? 'Avatar Settings' : 'Stage & Camera'}
                    </h3>
                    <p className="text-[11px] text-h-muted">
                      {activeSheet === 'avatar'
                        ? 'Choose body rig, limb visibility, skin tone & pose'
                        : 'Customize backdrop, studio lighting & snapshots'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings sheet"
                  data-testid="close-3d-sheet-btn"
                  className="w-8 h-8 rounded-lg text-h-muted hover:text-h-text hover:bg-h-surface-3 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-h-text">
              {activeSheet === 'avatar' ? (
                <>
                  {/* 2×2 Visual Rig Silhouette Cards */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Avatar Model</span>
                      <span className="text-[11px] text-h-accent-text font-medium">
                        {RIG_METADATA[settings.humanoidType].label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {RIG_CARDS.map((rigId) => {
                        const meta = RIG_METADATA[rigId];
                        const active = settings.humanoidType === rigId;
                        return (
                          <motion.button
                            key={rigId}
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onUpdateSettings({ humanoidType: rigId })}
                            data-testid={`rig-card-${rigId}`}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                              active
                                ? 'bg-h-accent-soft border-h-accent-border shadow-[0_2px_10px_rgba(2,132,199,0.12)]'
                                : 'bg-h-surface-2 border-h-border hover:border-h-accent-border hover:bg-h-surface'
                            }`}
                          >
                            <RigSilhouetteSvg rig={rigId} active={active} />
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-semibold leading-tight ${
                                  active ? 'text-h-accent-text' : 'text-h-text'
                                }`}
                              >
                                {meta.label}
                              </p>
                              <p className="text-[10px] text-h-muted leading-snug mt-0.5 line-clamp-2">
                                {meta.note}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Interactive Click-to-Toggle Body Visibility Diagram */}
                  <section className="space-y-2.5 pt-3 border-t border-h-border-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">
                        Body Part Visibility
                      </span>
                      <div className="flex items-center gap-1">
                        {(['all', 'shirt', 'pants'] as const).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setVisibilityPreset(preset)}
                            className="px-2 py-0.5 rounded-md bg-h-surface-3 hover:bg-h-accent-soft text-[10px] font-medium text-h-accent-text capitalize transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 rounded-xl bg-h-surface-2 border border-h-border-soft">
                      {/* Interactive Mannequin SVG */}
                      <svg
                        viewBox="0 0 110 132"
                        className="w-24 h-28 shrink-0 select-none"
                        role="group"
                        aria-label="Toggle body part visibility"
                      >
                        {/* Head */}
                        <rect
                          x="39"
                          y="4"
                          width="32"
                          height="28"
                          rx="8"
                          onClick={() => togglePart('head')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.head ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.head ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                        {/* Torso */}
                        <rect
                          x="33"
                          y="36"
                          width="44"
                          height="42"
                          rx="5"
                          onClick={() => togglePart('torso')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.torso ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.torso ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                        {/* Viewer Left = Avatar Right Arm */}
                        <rect
                          x="11"
                          y="36"
                          width="18"
                          height="42"
                          rx="5"
                          onClick={() => togglePart('rightArm')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.rightArm ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.rightArm ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                        {/* Viewer Right = Avatar Left Arm */}
                        <rect
                          x="81"
                          y="36"
                          width="18"
                          height="42"
                          rx="5"
                          onClick={() => togglePart('leftArm')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.leftArm ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.leftArm ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                        {/* Viewer Left = Avatar Right Leg */}
                        <rect
                          x="33"
                          y="82"
                          width="20"
                          height="44"
                          rx="5"
                          onClick={() => togglePart('rightLeg')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.rightLeg ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.rightLeg ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                        {/* Viewer Right = Avatar Left Leg */}
                        <rect
                          x="57"
                          y="82"
                          width="20"
                          height="44"
                          rx="5"
                          onClick={() => togglePart('leftLeg')}
                          className="cursor-pointer transition-colors"
                          fill={settings.visibility.leftLeg ? '#38BDF8' : 'var(--h-surface-3)'}
                          stroke={settings.visibility.leftLeg ? '#0284C7' : 'var(--h-border)'}
                          strokeWidth="2"
                        />
                      </svg>

                      {/* Accessible Pill Toggles alongside diagram */}
                      <div className="flex-1 grid grid-cols-2 gap-1.5">
                        {(
                          [
                            ['head', 'Head'],
                            ['torso', 'Torso'],
                            ['rightArm', 'R Arm'],
                            ['leftArm', 'L Arm'],
                            ['rightLeg', 'R Leg'],
                            ['leftLeg', 'L Leg']
                          ] as [keyof BodyPartVisibility, string][]
                        ).map(([key, label]) => {
                          const vis = settings.visibility[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => togglePart(key)}
                              className={`h-8 px-2 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                                vis
                                  ? 'bg-h-surface border-h-accent-border text-h-accent-text'
                                  : 'bg-h-surface-2 border-h-border-soft text-h-muted line-through'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  {/* Skin Tone Bar + Hex + Swatches + Classic Face */}
                  <section className="space-y-2.5 pt-3 border-t border-h-border-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Skin Tone</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={skinHexDraft}
                          onChange={(e) => setSkinHexDraft(e.target.value)}
                          onBlur={() => commitHex(skinHexDraft, 'skinColor')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitHex(skinHexDraft, 'skinColor');
                          }}
                          aria-label="Skin tone hex code"
                          className="w-20 h-7 px-2 rounded-lg bg-h-surface-2 border border-h-border text-[11px] font-mono text-h-text focus:border-h-accent focus:outline-none"
                        />
                        <label
                          title="Pick custom skin color"
                          className="relative w-7 h-7 rounded-lg border border-h-border overflow-hidden cursor-pointer shrink-0 shadow-xs"
                          style={{ backgroundColor: settings.skinColor }}
                        >
                          <input
                            type="color"
                            aria-label="Custom skin tone"
                            value={settings.skinColor}
                            onChange={(e) => onUpdateSettings({ skinColor: e.target.value })}
                            className="opacity-0 absolute inset-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                      {SKIN_SWATCHES.map((sw) => {
                        const active =
                          settings.skinColor.toLowerCase() === sw.hex.toLowerCase();
                        return (
                          <button
                            key={sw.hex}
                            type="button"
                            title={sw.name}
                            data-testid={`skin-swatch-${sw.name.toLowerCase().replace(/\s+/g, '-')}`}
                            onClick={() => onUpdateSettings({ skinColor: sw.hex })}
                            style={{ backgroundColor: sw.hex }}
                            className={`h-8 rounded-lg border-2 transition-transform cursor-pointer ${
                              active
                                ? 'border-h-accent scale-105 shadow-sm'
                                : 'border-h-border hover:scale-105'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <label className="flex items-center justify-between px-3 py-2 rounded-xl bg-h-surface-2 border border-h-border-soft text-xs font-medium text-h-text-2 cursor-pointer">
                      <span>Classic Roblox Face</span>
                      <input
                        type="checkbox"
                        checked={settings.showClassicFace}
                        onChange={(e) =>
                          onUpdateSettings({ showClassicFace: e.target.checked })
                        }
                        data-testid="toggle-classic-face"
                        className="accent-h-accent w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </section>

                  {/* Mannequin Accessories Preview */}
                  <section className="space-y-2 pt-3 border-t border-h-border-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Head Accessories</span>
                      <span className="text-[10px] text-h-muted">Mannequin Styling</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ACCESSORY_OPTIONS.map((acc) => {
                        const active = (settings.accessoryPreset ?? 'none') === acc.id;
                        return (
                          <motion.button
                            key={acc.id}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onUpdateSettings({ accessoryPreset: acc.id })}
                            data-testid={`accessory-preset-${acc.id}`}
                            className={`h-8 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-h-accent border-h-accent text-white'
                                : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                            }`}
                          >
                            {acc.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Pose Selector */}
                  <section className="space-y-2 pt-3 border-t border-h-border-soft">
                    <span className="text-xs font-semibold text-h-text">Avatar Pose</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {POSE_OPTIONS.map((p) => {
                        const active = settings.pose === p.id;
                        return (
                          <motion.button
                            key={p.id}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onUpdateSettings({ pose: p.id })}
                            className={`h-8 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-h-accent border-h-accent text-white'
                                : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                            }`}
                          >
                            {p.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Proportions */}
                  <section className="space-y-2.5 pt-3 border-t border-h-border-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Body Proportions</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            proportions: { ...DEFAULT_AVATAR_SETTINGS.proportions }
                          })
                        }
                        className="text-[11px] font-medium text-h-accent-text hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    </div>
                    {(['height', 'width', 'depth'] as const).map((axis) => (
                      <div key={axis} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-h-text-2 capitalize">{axis}</span>
                          <span className="font-mono text-h-text tabular-nums">
                            {Math.round(settings.proportions[axis] * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={80}
                          max={120}
                          value={Math.round(settings.proportions[axis] * 100)}
                          onChange={(e) =>
                            onUpdateSettings({
                              proportions: {
                                ...settings.proportions,
                                [axis]: Number(e.target.value) / 100
                              }
                            })
                          }
                          className="w-full accent-h-accent cursor-pointer"
                        />
                      </div>
                    ))}
                  </section>

                  {hasActiveSlotImage && onRemoveActiveTemplate && (
                    <section className="pt-3 border-t border-h-border-soft">
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveActiveTemplate();
                          onClose();
                        }}
                        data-testid="sheet-remove-template-btn"
                        className="w-full py-2.5 px-3 rounded-xl border border-rose-400/35 bg-rose-500/12 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Imported {activeSlotLabel}
                      </button>
                    </section>
                  )}
                </>
              ) : (
                <>
                  {/* Studio Appearance Theme (Dark Default | Soft Light) */}
                  <section className="space-y-2 pb-3 border-b border-h-border-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Studio Theme</span>
                      <span className="text-[11px] text-h-muted capitalize">{studioTheme} mode</span>
                    </div>
                    <div
                      className="grid grid-cols-2 gap-1.5 bg-h-surface-2 p-1 rounded-xl border border-h-border-soft"
                      role="group"
                      aria-label="Studio appearance theme"
                    >
                      <button
                        type="button"
                        onClick={() => onSetStudioTheme('dark')}
                        data-testid="stage-theme-dark"
                        className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          studioTheme === 'dark'
                            ? 'bg-h-surface border border-h-accent-border text-h-accent-text shadow-xs'
                            : 'text-h-muted hover:text-h-text'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Heavenly Dark</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetStudioTheme('light')}
                        data-testid="stage-theme-light"
                        className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          studioTheme === 'light'
                            ? 'bg-h-surface border border-h-accent-border text-h-accent-text shadow-xs'
                            : 'text-h-muted hover:text-h-text'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Heavenly Light</span>
                      </button>
                    </div>
                  </section>

                  {/* Stage Backdrop */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-h-text">Stage Backdrop</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={bgHexDraft}
                          onChange={(e) => setBgHexDraft(e.target.value)}
                          onBlur={() => commitHex(bgHexDraft, 'bgColor')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitHex(bgHexDraft, 'bgColor');
                          }}
                          aria-label="Backdrop hex color"
                          className="w-20 h-7 px-2 rounded-lg bg-h-surface-2 border border-h-border text-[11px] font-mono text-h-text focus:border-h-accent focus:outline-none"
                        />
                        <label
                          title="Pick custom stage color"
                          className="relative w-7 h-7 rounded-lg border border-h-border overflow-hidden cursor-pointer shrink-0"
                          style={{ backgroundColor: settings.bgColor }}
                        >
                          <input
                            type="color"
                            aria-label="Custom stage backdrop"
                            value={settings.bgColor}
                            onChange={(e) => onUpdateSettings({ bgColor: e.target.value })}
                            className="opacity-0 absolute inset-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-2">
                      {BACKDROP_SWATCHES.map((sw) => {
                        const active =
                          settings.bgColor.toLowerCase() === sw.hex.toLowerCase();
                        return (
                          <button
                            key={sw.hex}
                            type="button"
                            title={sw.name}
                            onClick={() => onUpdateSettings({ bgColor: sw.hex })}
                            style={{ backgroundColor: sw.hex }}
                            className={`h-8 rounded-lg border-2 transition-transform cursor-pointer ${
                              active
                                ? 'border-h-accent scale-105 shadow-sm'
                                : 'border-h-border hover:scale-105'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </section>

                  {/* Lighting Preset */}
                  <section className="space-y-2.5 pt-3 border-t border-h-border-soft">
                    <span className="text-xs font-semibold text-h-text">Studio Lighting</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {LIGHTING_OPTIONS.map((opt) => {
                        const active = settings.lightingType === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.hint}
                            onClick={() => onUpdateSettings({ lightingType: opt.id })}
                            className={`py-2 px-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                                : 'bg-h-surface-2 border-h-border text-h-text-2 hover:text-h-text'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Fine Lights Progressive Disclosure */}
                    <button
                      type="button"
                      onClick={() => setFineLightsOpen((v) => !v)}
                      className="w-full flex items-center justify-between text-[11px] font-medium text-h-text-2 hover:text-h-accent-text pt-1 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        Fine Light Intensities
                      </span>
                      {fineLightsOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {fineLightsOpen && (
                        <motion.div
                          key="fine-lights-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2 pt-1">
                            {(
                              [
                                ['keyLight', 'Key Light'],
                                ['fillLight', 'Fill Light'],
                                ['backLight', 'Rim Light']
                              ] as const
                            ).map(([lightKey, title]) => {
                              const l = settings[lightKey];
                              return (
                                <div
                                  key={lightKey}
                                  className="p-2.5 rounded-xl bg-h-surface-2 border border-h-border-soft space-y-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-h-text">
                                      {title}
                                    </span>
                                    <input
                                      type="color"
                                      aria-label={`${title} color`}
                                      value={l.color}
                                      onChange={(e) =>
                                        onUpdateSettings({
                                          [lightKey]: { ...l, color: e.target.value }
                                        })
                                      }
                                      className="w-6 h-5 rounded border-0 bg-transparent cursor-pointer"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-h-muted w-12">Intensity</span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={24}
                                      value={Math.round(l.intensity * 10)}
                                      onChange={(e) =>
                                        onUpdateSettings({
                                          [lightKey]: {
                                            ...l,
                                            intensity: Number(e.target.value) / 10
                                          }
                                        })
                                      }
                                      className="flex-1 accent-h-accent cursor-pointer"
                                    />
                                    <span className="font-mono text-h-text w-7 text-right">
                                      {l.intensity.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  {/* Camera Presets & Projection */}
                  <section className="space-y-2.5 pt-3 border-t border-h-border-soft">
                    <span className="text-xs font-semibold text-h-text">Camera Angle</span>
                    <div className="grid grid-cols-6 gap-1.5">
                      {CAMERA_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onSelectCameraPreset(preset.id)}
                          className="h-8 rounded-lg bg-h-surface-2 hover:bg-h-accent-soft border border-h-border text-[11px] font-medium text-h-text-2 hover:text-h-accent-text transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {(['perspective', 'orthographic'] as const).map((proj) => (
                        <button
                          key={proj}
                          type="button"
                          onClick={() => onUpdateSettings({ projectionMode: proj })}
                          className={`h-8 rounded-lg text-xs font-medium capitalize border transition-colors cursor-pointer ${
                            settings.projectionMode === proj
                              ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                              : 'bg-h-surface-2 border-h-border text-h-text-2'
                          }`}
                        >
                          {proj}
                        </button>
                      ))}
                    </div>

                    {settings.projectionMode === 'perspective' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-h-text-2">Field of View</span>
                          <span className="font-mono text-h-text tabular-nums">
                            {settings.cameraFov}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={28}
                          max={72}
                          value={settings.cameraFov}
                          onChange={(e) =>
                            onUpdateSettings({ cameraFov: Number(e.target.value) })
                          }
                          className="w-full accent-h-accent cursor-pointer"
                        />
                      </div>
                    )}
                  </section>

                  {/* Stage Toggles */}
                  <section className="space-y-2 pt-3 border-t border-h-border-soft">
                    <span className="text-xs font-semibold text-h-text">Stage & Display</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={onToggleTurntable}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                          turntable
                            ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                            : 'bg-h-surface-2 border-h-border-soft text-h-text-2'
                        }`}
                      >
                        <span>Turntable</span>
                        <RotateCw
                          className={`w-3.5 h-3.5 ${
                            turntable ? 'animate-[spin_5s_linear_infinite]' : ''
                          }`}
                        />
                      </button>

                      {(
                        [
                          ['showGrid', 'Floor Grid'],
                          ['showGroundShadow', 'Soft Shadow'],
                          ['isGrayscale', 'Grayscale'],
                          ['showWireframe3D', 'Wireframe']
                        ] as const
                      ).map(([key, label]) => {
                        const checked = settings[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => onUpdateSettings({ [key]: !checked })}
                            className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                              checked
                                ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                                : 'bg-h-surface-2 border-h-border-soft text-h-text-2'
                            }`}
                          >
                            <span>{label}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                checked ? 'bg-h-accent' : 'bg-h-border'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Snapshots, 360° Turntable Video & 2D Showcase */}
                  <section className="space-y-2 pt-3 border-t border-h-border-soft">
                    <span className="text-xs font-semibold text-h-text">Capture & Share</span>
                    <div className="grid grid-cols-2 gap-2">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onCaptureSnapshot(true)}
                        className="py-2 px-3 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Transparent PNG
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onCaptureSnapshot(false)}
                        className="py-2 px-3 rounded-xl bg-h-surface-3 hover:bg-h-accent-soft border border-h-border text-h-accent-text text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Stage Snapshot
                      </motion.button>
                    </div>
                    {onRecordTurntableVideo && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        disabled={recordingProgress !== null}
                        onClick={onRecordTurntableVideo}
                        data-testid="record-360-video-btn"
                        className="w-full py-2.5 px-3 rounded-xl bg-h-accent-soft hover:bg-h-accent hover:text-white border border-h-accent-border text-h-accent-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <Video className="w-3.5 h-3.5" />
                        {recordingProgress !== null
                          ? `Recording 360° (${Math.round(recordingProgress * 100)}%)...`
                          : 'Record 360° Turntable Video (4s WebM)'}
                      </motion.button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenShowcase2D();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-h-surface-2 hover:bg-h-surface-3 border border-h-border text-h-text-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-h-accent-text" />
                      Create 2D Showcase Card
                    </button>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
