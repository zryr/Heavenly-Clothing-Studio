import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Copy, Check, Sparkles, Image as ImageIcon } from 'lucide-react';
import { TemplateType, UvIsland, TEMPLATE_WIDTH, TEMPLATE_HEIGHT } from '../types/uv';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceCanvas: HTMLCanvasElement | null;
  templateType: TemplateType;
  islands: UvIsland[];
  skinColor: string;
}

export const Showcase2DModal: React.FC<Props> = ({
  isOpen,
  onClose,
  sourceCanvas,
  templateType,
  islands,
  skinColor
}) => {
  const showcaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [watermarkText, setWatermarkText] = useState<string>('UV ARMOR');

  // Helper to find island rect
  const getIsland = (nameKeyword: string, fallback: { x: number; y: number; w: number; h: number }) => {
    const match = islands.find((i) => i.name.toLowerCase().includes(nameKeyword.toLowerCase()));
    return match ? { x: match.x, y: match.y, w: match.w, h: match.h } : fallback;
  };

  useEffect(() => {
    if (!isOpen || !showcaseCanvasRef.current) return;
    const canvas = showcaseCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dimensions for showcase presentation: 820 x 480
    const W = 820;
    const H = 480;
    canvas.width = W;
    canvas.height = H;

    // Dark sleek backdrop with subtle studio gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
    bgGradient.addColorStop(0, '#0d1017');
    bgGradient.addColorStop(1, '#080a0f');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid/dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let x = 20; x < W; x += 30) {
      for (let y = 20; y < H; y += 30) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // Source canvas image or fallback
    const src = sourceCanvas;

    // Island definitions
    const torsoFront = getIsland('Torso Front', { x: 230, y: 75, w: 128, h: 128 });
    const torsoBack = getIsland('Torso Back', { x: 422, y: 75, w: 128, h: 128 });
    const rightArmFront = getIsland('Right Arm Front', { x: 87, y: 358, w: 64, h: 128 });
    const leftArmFront = getIsland('Left Arm Front', { x: 371, y: 357, w: 64, h: 128 });
    const rightLegFront = getIsland('Right Leg Front', { x: 87, y: 358, w: 64, h: 128 });
    const leftLegFront = getIsland('Left Leg Front', { x: 371, y: 357, w: 64, h: 128 });
    const rightLegBack = getIsland('Right Leg Back', { x: 215, y: 358, w: 64, h: 128 });
    const leftLegBack = getIsland('Left Leg Back', { x: 499, y: 357, w: 64, h: 128 });

    // Card drawing helper with rounded corners & shadow
    const drawCard = (x: number, y: number, w: number, h: number, label: string) => {
      ctx.save();
      // Drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;

      // Base skin/card background
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();

      // Border outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Label at bottom
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h + 18);
    };

    // Draw textured piece
    const drawTexture = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
      radius = 0
    ) => {
      if (!src) return;
      ctx.save();
      if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(dx, dy, dw, dh, radius);
        ctx.clip();
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
    };

    // Layout configuration (matches Screenshot 2 showcase format):
    // Left Arm: x: 50, w: 68, h: 250
    // Front Figure (Torso + Legs): x: 148, w: 220, h: 250 (Torso 220x125, Legs 220x125)
    // Back Figure (Torso + Legs): x: 398, w: 220, h: 250 (Torso 220x125, Legs 220x125)
    // Right Arm: x: 648, w: 68, h: 250
    const topY = 75;
    const figureW = 220;
    const armW = 70;
    const figureH = 260;
    const torsoH = 130;
    const legsH = 130;

    // 1. LEFT ARM CARD (Viewer Left, Roblox Right Arm)
    const leftArmX = 65;
    drawCard(leftArmX, topY, armW, figureH, 'RIGHT ARM');
    if (src) {
      if (templateType === 'shirt') {
        drawTexture(rightArmFront.x, rightArmFront.y, rightArmFront.w, rightArmFront.h, leftArmX, topY, armW, figureH, 8);
      }
    }

    // 2. FRONT FIGURE (Front Torso + Front Legs)
    const frontX = 165;
    drawCard(frontX, topY, figureW, figureH, 'FRONT VIEW');

    // Torso Front piece
    if (src) {
      if (templateType === 'shirt') {
        drawTexture(torsoFront.x, torsoFront.y, torsoFront.w, torsoFront.h, frontX, topY, figureW, torsoH, 6);
      }
      // Pants Front pieces (Right leg + Left leg)
      if (templateType === 'pants') {
        drawTexture(rightLegFront.x, rightLegFront.y, rightLegFront.w, rightLegFront.h, frontX, topY + torsoH, figureW / 2, legsH);
        drawTexture(leftLegFront.x, leftLegFront.y, leftLegFront.w, leftLegFront.h, frontX + figureW / 2, topY + torsoH, figureW / 2, legsH);
      }
    }

    // Seam line between torso and legs
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frontX, topY + torsoH);
    ctx.lineTo(frontX + figureW, topY + torsoH);
    ctx.stroke();

    // 3. BACK FIGURE (Back Torso + Back Legs)
    const backX = 415;
    drawCard(backX, topY, figureW, figureH, 'BACK VIEW');

    // Torso Back piece
    if (src) {
      if (templateType === 'shirt') {
        drawTexture(torsoBack.x, torsoBack.y, torsoBack.w, torsoBack.h, backX, topY, figureW, torsoH, 6);
      }
      // Pants Back pieces
      if (templateType === 'pants') {
        drawTexture(rightLegBack.x, rightLegBack.y, rightLegBack.w, rightLegBack.h, backX, topY + torsoH, figureW / 2, legsH);
        drawTexture(leftLegBack.x, leftLegBack.y, leftLegBack.w, leftLegBack.h, backX + figureW / 2, topY + torsoH, figureW / 2, legsH);
      }
    }

    // Seam line between torso and legs
    ctx.beginPath();
    ctx.moveTo(backX, topY + torsoH);
    ctx.lineTo(backX + figureW, topY + torsoH);
    ctx.stroke();

    // 4. RIGHT ARM CARD (Viewer Right, Roblox Left Arm)
    const rightArmX = 665;
    drawCard(rightArmX, topY, armW, figureH, 'LEFT ARM');
    if (src) {
      if (templateType === 'shirt') {
        drawTexture(leftArmFront.x, leftArmFront.y, leftArmFront.w, leftArmFront.h, rightArmX, topY, armW, figureH, 8);
      }
    }

    // 5. Center Bottom Brand Emblem / Watermark Badge (matches Screenshot 2!)
    const badgeX = W / 2 - 45;
    const badgeY = topY + figureH - 25;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, 90, 48, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Little glowing moon/sparkle icon & brand text
    ctx.fillStyle = '#fcd34d';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌙', W / 2, badgeY + 22);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '700 9px monospace';
    ctx.fillText(watermarkText.toUpperCase(), W / 2, badgeY + 38);
    ctx.restore();

    // Top Title in Canvas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '700 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ROBLOX 2D SHOWCASE • ${templateType.toUpperCase()} TEMPLATE`, W / 2, 42);

  }, [isOpen, sourceCanvas, templateType, islands, skinColor, watermarkText]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!showcaseCanvasRef.current) return;
    const dataUrl = showcaseCanvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = `Roblox_2D_Showcase_${templateType}_${Date.now()}.png`;
    a.href = dataUrl;
    a.click();
  };

  const handleCopy = async () => {
    if (!showcaseCanvasRef.current) return;
    try {
      showcaseCanvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#0e121b] border border-[#232936] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#232936] bg-[#121622]">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-[#00e5ff]/15 text-[#00e5ff]">
              <ImageIcon className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold font-mono text-white tracking-wider">2D Showcase</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#94a3b8] hover:text-white hover:bg-[#1a2130] rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Display View */}
        <div className="p-3 sm:p-4 flex flex-col items-center justify-center bg-[#090b10] overflow-x-auto">
          <canvas
            ref={showcaseCanvasRef}
            className="rounded-xl shadow-2xl border border-[#1f2838] max-w-full h-auto"
            style={{ width: '100%', maxWidth: '820px' }}
          />
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 border-t border-[#232936] bg-[#121622] text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[#64748b] font-mono text-[11px]">Brand Tag:</span>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="bg-[#181e2b] border border-[#263145] rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#00e5ff] w-32"
              placeholder="Brand Tag"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#181e2b] hover:bg-[#232b3d] border border-[#2b374c] text-white font-mono transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Image!' : 'Copy Image'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#00e5ff] to-[#38bdf8] hover:brightness-110 text-black font-mono font-bold transition shadow-lg shadow-[#00e5ff]/20"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download 2D Showcase</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#1a2130] hover:bg-[#263044] text-[#cbd5e1] font-mono font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
