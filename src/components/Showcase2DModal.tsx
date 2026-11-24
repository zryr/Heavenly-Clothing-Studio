import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Download, X } from 'lucide-react';
import { TemplateType, UvIsland, getTemplateSpec } from '../types/uv';

interface Showcase2DModalProps {
  sourceCanvas: HTMLCanvasElement;
  templateType: TemplateType;
  islands: UvIsland[];
  skinColor: string;
  tshirtBaseColor: string;
  projectName: string;
  onClose: () => void;
}

type CardTheme = 'heavenly' | 'slate' | 'obsidian';

const CARD_THEMES: Record<
  CardTheme,
  {
    label: string;
    bgTop: string;
    bgBot: string;
    text: string;
    muted: string;
    accent: string;
    lightGrid: boolean;
  }
> = {
  heavenly: {
    label: 'Heavenly Sky',
    bgTop: '#F5FAFF',
    bgBot: '#DBEAFE',
    text: '#0F172A',
    muted: '#475569',
    accent: '#0284C7',
    lightGrid: true
  },
  slate: {
    label: 'Studio Slate',
    bgTop: '#0F172A',
    bgBot: '#1E293B',
    text: '#F8FAFC',
    muted: '#CBD5E1',
    accent: '#38BDF8',
    lightGrid: false
  },
  obsidian: {
    label: 'Obsidian',
    bgTop: '#030712',
    bgBot: '#0B1120',
    text: '#F8FAFC',
    muted: '#94A3B8',
    accent: '#38BDF8',
    lightGrid: false
  }
};

export const Showcase2DModal: React.FC<Showcase2DModalProps> = ({
  sourceCanvas,
  templateType,
  islands,
  skinColor,
  tshirtBaseColor,
  projectName,
  onClose
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spec = getTemplateSpec(templateType);

  const [title, setTitle] = useState(projectName || spec.label);
  const [brandTag, setBrandTag] = useState('HEAVENLY');
  const [theme, setTheme] = useState<CardTheme>('heavenly');
  const [showWatermark, setShowWatermark] = useState(true);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const W = 1200;
    const H = 800;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t = CARD_THEMES[theme];
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, t.bgTop);
    bgGrad.addColorStop(1, t.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = t.lightGrid ? 'rgba(2,132,199,0.06)' : 'rgba(148,163,184,0.06)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 40; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.fillStyle = t.accent;
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(`HEAVENLY CLOTHING STUDIO · ${spec.label.toUpperCase()}`, 64, 72);

    ctx.fillStyle = t.text;
    ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title || spec.label, 64, 128);

    const drawCroppedIsland = (
      islandName: string,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => {
      const isl = islands.find((i) => i.name === islandName);
      if (!isl) return;
      ctx.fillStyle = skinColor;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.drawImage(sourceCanvas, isl.x, isl.y, isl.w, isl.h, dx, dy, dw, dh);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dx, dy, dw, dh);
    };

    if (templateType === 'tshirt') {
      const boxSize = 420;
      const bx = (W - boxSize) / 2;
      const by = 210;

      ctx.fillStyle = tshirtBaseColor;
      ctx.beginPath();
      ctx.roundRect(bx - 40, by - 24, boxSize + 80, boxSize + 48, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        bx,
        by,
        boxSize,
        boxSize
      );

      ctx.fillStyle = t.muted;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FRONT CHEST GRAPHIC · 512 × 512 PX', W / 2, by + boxSize + 64);
      ctx.textAlign = 'left';
    } else if (templateType === 'shirt') {
      const scale = 2.0;
      const torsoW = 128 * scale;
      const torsoH = 128 * scale;
      const armW = 64 * scale;
      const armH = 128 * scale;

      const fX = 200;
      const fY = 235;
      drawCroppedIsland('Right Arm Front', fX - armW - 6, fY, armW, armH);
      drawCroppedIsland('Torso Front', fX, fY, torsoW, torsoH);
      drawCroppedIsland('Left Arm Front', fX + torsoW + 6, fY, armW, armH);

      const bX = 740;
      const bY = 235;
      drawCroppedIsland('Left Arm Back', bX - armW - 6, bY, armW, armH);
      drawCroppedIsland('Torso Back', bX, bY, torsoW, torsoH);
      drawCroppedIsland('Right Arm Back', bX + torsoW + 6, bY, armW, armH);

      ctx.fillStyle = t.muted;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FRONT VIEW', fX + torsoW / 2, fY + torsoH + 42);
      ctx.fillText('BACK VIEW', bX + torsoW / 2, bY + torsoH + 42);
      ctx.textAlign = 'left';
    } else {
      const scale = 2.1;
      const legW = 64 * scale;
      const legH = 128 * scale;
      const waistH = 56;

      const fX = 220;
      const fY = 220;
      drawCroppedIsland('Torso Front', fX, fY, legW * 2 + 6, waistH);
      drawCroppedIsland('Right Leg Front', fX, fY + waistH + 4, legW, legH);
      drawCroppedIsland('Left Leg Front', fX + legW + 6, fY + waistH + 4, legW, legH);

      const bX = 700;
      const bY = 220;
      drawCroppedIsland('Torso Back', bX, bY, legW * 2 + 6, waistH);
      drawCroppedIsland('Left Leg Back', bX, bY + waistH + 4, legW, legH);
      drawCroppedIsland('Right Leg Back', bX + legW + 6, bY + waistH + 4, legW, legH);

      ctx.fillStyle = t.muted;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FRONT VIEW', fX + legW + 3, fY + waistH + legH + 42);
      ctx.fillText('BACK VIEW', bX + legW + 3, bY + waistH + legH + 42);
      ctx.textAlign = 'left';
    }

    if (showWatermark && brandTag.trim()) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.32);
      ctx.fillStyle = t.lightGrid ? 'rgba(2,132,199,0.06)' : 'rgba(248,250,252,0.06)';
      ctx.font = '700 68px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(brandTag.toUpperCase(), 0, -140);
      ctx.fillText(brandTag.toUpperCase(), 0, 20);
      ctx.fillText(brandTag.toUpperCase(), 0, 180);
      ctx.restore();
    }

    ctx.fillStyle = t.muted;
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(`${spec.width} × ${spec.height} PX CLASSIC TEMPLATE`, 64, H - 40);
    ctx.textAlign = 'right';
    ctx.fillText(
      brandTag ? `${brandTag.toUpperCase()} · CREATE. REFINE. PREVIEW.` : 'CREATE. REFINE. PREVIEW.',
      W - 64,
      H - 40
    );
    ctx.textAlign = 'left';
  }, [
    sourceCanvas,
    templateType,
    islands,
    skinColor,
    tshirtBaseColor,
    title,
    brandTag,
    theme,
    showWatermark,
    spec
  ]);

  const handleDownloadCard = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'Heavenly_Showcase').replace(/[^a-zA-Z0-9_-]/g, '_')}_Showcase.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="showcase-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-4xl bg-h-surface border border-h-border rounded-3xl shadow-[0_24px_64px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[92vh] text-h-text"
      >
        <div className="px-5 py-4 border-b border-h-border-soft bg-h-surface-2 flex items-center justify-between">
          <div>
            <h2 id="showcase-modal-title" className="font-display text-lg font-bold text-h-text">
              2D Showcase Card
            </h2>
            <p className="text-xs text-h-muted">
              Export a 1200 × 800 presentation card with optional creator watermark.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-h-muted hover:text-h-text hover:bg-h-surface-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="rounded-2xl border border-h-border overflow-hidden bg-h-canvas">
            <canvas ref={previewCanvasRef} className="w-full h-auto block" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-h-muted">Garment Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-h-surface-2 border border-h-border text-xs text-h-text focus:border-h-accent focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-h-muted">Creator Tag</span>
              <input
                type="text"
                value={brandTag}
                onChange={(e) => setBrandTag(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-h-surface-2 border border-h-border text-xs text-h-text focus:border-h-accent focus:outline-none"
              />
            </label>
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-h-muted">Card Theme</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['heavenly', 'slate', 'obsidian'] as CardTheme[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`h-9 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                      theme === id
                        ? 'bg-h-accent-soft border-h-accent-border text-h-accent-text'
                        : 'bg-h-surface-2 border-h-border text-h-text-2'
                    }`}
                  >
                    {id === 'heavenly' ? 'Sky' : id === 'slate' ? 'Slate' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-h-text-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showWatermark}
              onChange={(e) => setShowWatermark(e.target.checked)}
              className="accent-h-accent cursor-pointer"
            />
            Include subtle diagonal creator watermark
          </label>
        </div>

        <div className="px-5 py-3.5 border-t border-h-border-soft bg-h-surface-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-h-surface hover:bg-h-surface-3 border border-h-border text-xs font-semibold text-h-text-2 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownloadCard}
            className="px-4 py-2 rounded-xl bg-h-accent hover:bg-h-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Download 1200×800 PNG
          </button>
        </div>
      </motion.div>
    </div>
  );
};
