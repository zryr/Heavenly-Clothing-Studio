import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Maximize, Minimize, Move, X } from 'lucide-react';
import { ConformMode, TemplateType, getTemplateSpec } from '../types/uv';
import { computeConformRect } from '../utils/uvEngine';

interface PreflightModalProps {
  image: HTMLImageElement;
  fileName: string;
  fileSize: number;
  templateType: TemplateType;
  onConfirm: (mode: ConformMode) => void;
  onCancel: () => void;
}

const MODES: {
  id: ConformMode;
  title: string;
  summary: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'pad',
    title: 'Fit & Center (Pad)',
    summary: 'Preserves full aspect ratio',
    detail:
      'Fits the entire image inside the target canvas with transparent margins. Best for logos and T-Shirts.',
    icon: Minimize
  },
  {
    id: 'crop',
    title: 'Fill & Center-Crop',
    summary: 'Fills frame without distortion',
    detail: 'Scales uniformly to cover the canvas and trims overflow edges symmetrically.',
    icon: Maximize
  },
  {
    id: 'scale',
    title: 'Stretch to Exact Size',
    summary: 'Exact edge-to-edge remap',
    detail:
      'Resamples width and height independently to match the exact template grid. Best for slightly scaled 585×559 templates.',
    icon: Move
  }
];

export const PreflightModal: React.FC<PreflightModalProps> = ({
  image,
  fileName,
  fileSize,
  templateType,
  onConfirm,
  onCancel
}) => {
  const spec = getTemplateSpec(templateType);
  const [selectedMode, setSelectedMode] = useState<ConformMode>(
    templateType === 'tshirt' ? 'pad' : 'scale'
  );

  const previewRefs = useRef<Record<ConformMode, HTMLCanvasElement | null>>({
    pad: null,
    crop: null,
    scale: null
  });

  useEffect(() => {
    const modes: ConformMode[] = ['pad', 'crop', 'scale'];
    for (const mode of modes) {
      const canvas = previewRefs.current[mode];
      if (!canvas) continue;
      canvas.width = spec.width;
      canvas.height = spec.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, spec.width, spec.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const rect = computeConformRect(
        image.naturalWidth,
        image.naturalHeight,
        spec.width,
        spec.height,
        mode
      );
      ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
    }
  }, [image, spec.width, spec.height]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conform-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-3xl bg-h-surface border border-h-border rounded-3xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[90vh] text-h-text"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-h-border-soft bg-h-surface-2 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-amber-600 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Dimension Mismatch Detected</span>
            </div>
            <h2 id="conform-modal-title" className="font-display text-lg font-bold text-h-text">
              Conform Image to {spec.label} ({spec.width} × {spec.height} px)
            </h2>
            <p className="text-xs text-h-muted">
              <span className="text-h-text font-semibold">{fileName}</span> is{' '}
              <span className="font-mono font-semibold text-amber-400">
                {image.naturalWidth} × {image.naturalHeight} px
              </span>
              {fileSize > 0 ? ` · ${(fileSize / 1024).toFixed(1)} KB` : ''}. Choose how to fit it
              before editing:
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Live Preview Cards */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = selectedMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMode(m.id)}
                data-testid={`conform-mode-${m.id}`}
                className={`text-left rounded-2xl border p-3 flex flex-col gap-3 transition-colors cursor-pointer ${
                  active
                    ? 'bg-h-surface-3 border-h-accent-border shadow-xs'
                    : 'bg-h-surface-2 border-h-border hover:border-h-accent-border'
                }`}
              >
                <div className="w-full aspect-square rounded-xl checkerboard-surface border border-h-border overflow-hidden flex items-center justify-center p-2">
                  <canvas
                    ref={(el) => {
                      previewRefs.current[m.id] = el;
                    }}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-h-text flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-h-accent-text" />
                      {m.title}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-h-accent-text shrink-0" />}
                  </div>
                  <p className="text-[11px] font-semibold text-h-accent-text">{m.summary}</p>
                  <p className="text-[11px] text-h-muted leading-relaxed">{m.detail}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-h-border-soft bg-h-surface-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-h-surface hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text-2 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedMode)}
            data-testid="conform-apply-btn"
            className="px-4 py-2 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold cursor-pointer shadow-xs"
          >
            Import with {MODES.find((m) => m.id === selectedMode)?.title}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
