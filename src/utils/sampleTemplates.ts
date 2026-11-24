import {
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TSHIRT_SIZE,
  TemplateType
} from '../types/uv';

export interface SampleTemplateSpec {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  renderToCanvas: () => HTMLCanvasElement;
}

function drawTemplateExteriorMockup(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string
) {
  // Background frame & template margins outside UV islands (so Auto-Clean can strip them cleanly)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 4.5, width - 9, height - 9);

  // Subtle corner guide text strictly inside top-left exterior margin (clear of Torso Top at x=231)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.48)';
  ctx.font = '600 9px monospace';
  ctx.fillText('TEMPLATE GUIDE — STRIP BEFORE UPLOAD', 14, 22);
  ctx.fillText(label.toUpperCase(), 14, 36);

  // Diagonal exterior watermark lines outside UV islands
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1;
  for (let i = -200; i < width + 200; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - 140, height);
    ctx.stroke();
  }
  ctx.restore();
}

export const SAMPLE_TEMPLATES: SampleTemplateSpec[] = [
  {
    id: 'heavenly-tech-jacket',
    name: 'Heavenly Tech Jacket',
    description: 'Slate obsidian shell with cyan seam piping, cuffs & exterior guide margin',
    type: 'shirt',
    renderToCanvas: () => {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_WIDTH;
      canvas.height = TEMPLATE_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      drawTemplateExteriorMockup(ctx, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, 'Tech Shell Shirt');

      for (const island of ROBLOX_SHIRT_UV_ISLANDS) {
        const { x, y, w, h, name } = island;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        // Base tailored slate fabric gradient
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.55, '#111827');
        grad.addColorStop(1, '#0b1120');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        // Subtle woven micro-texture
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        for (let py = y + 2; py < y + h; py += 4) {
          ctx.fillRect(x, py, w, 1);
        }

        // Hem ribbing at bottom of vertical panels
        if (h === 128) {
          ctx.fillStyle = '#090d16';
          ctx.fillRect(x, y + h - 14, w, 14);
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(x, y + h - 15, w, 2);
        }

        // Torso Front: collar cutout, zipper placket, chest panels, pocket
        if (name === 'Torso Front') {
          // Transparent neck scoop so skin tone peeks through naturally
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + 4, 24, 15, 0, 0, Math.PI);
          ctx.fill();
          ctx.restore();

          // Collar trim
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + 4, 25, 16, 0, 0.08 * Math.PI, 0.92 * Math.PI);
          ctx.stroke();

          // Center weatherproof zipper
          ctx.fillStyle = '#030712';
          ctx.fillRect(x + w / 2 - 3, y + 18, 6, h - 32);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(x + w / 2 - 1, y + 20, 2, h - 36);

          // Chest yoke seam + cyan accent bar
          ctx.fillStyle = '#273549';
          ctx.fillRect(x + 8, y + 36, 46, 3);
          ctx.fillRect(x + w - 54, y + 36, 46, 3);

          // Minimal chest crest on wearer's left (viewer right)
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 80, y + 48, 22, 16);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(x + 85, y + 54, 12, 4);

          // Lower angled pockets
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 12, y + 78, 34, 24);
          ctx.strokeRect(x + w - 46, y + 78, 34, 24);
        }

        // Torso Back: yoke, vertical spine seam, clean geometric emblem
        if (name === 'Torso Back') {
          ctx.fillStyle = '#273549';
          ctx.fillRect(x + 10, y + 26, w - 20, 3);
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(x + w / 2 - 1, y + 29, 2, 78);

          // Back geometric diamond emblem
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y + 44);
          ctx.lineTo(x + w / 2 + 22, y + 66);
          ctx.lineTo(x + w / 2, y + 88);
          ctx.lineTo(x + w / 2 - 22, y + 66);
          ctx.closePath();
          ctx.stroke();
        }

        // Arms: shoulder cap, bicep stripe, transparent hand area at bottom
        if (island.group === 'right_arm' || island.group === 'left_arm') {
          if (h === 128) {
            // Shoulder reinforcement
            ctx.fillStyle = '#273549';
            ctx.fillRect(x, y, w, 24);

            // Bicep accent band on outer/front sleeves
            if (name.includes('Outer') || name.includes('Front')) {
              ctx.fillStyle = '#06b6d4';
              ctx.fillRect(x + 6, y + 34, w - 12, 4);
              ctx.fillStyle = '#334155';
              ctx.fillRect(x + 6, y + 42, w - 12, 2);
            }

            // Wrist cuff
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(x, y + h - 32, w, 10);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(x, y + h - 32, w, 2);

            // Clear hand region so avatar skin tone shows cleanly on hands
            ctx.clearRect(x, y + h - 22, w, 22);
          } else if (name.includes('Bottom')) {
            // Hand palm base transparent so skin renders cleanly
            ctx.clearRect(x, y, w, h);
          }
        }
        ctx.restore();
      }

      return canvas;
    }
  },
  {
    id: 'alpine-plaid-overshirt',
    name: 'Alpine Plaid Overshirt',
    description: 'Deep navy & warm terracotta flannel plaid with buttoned front and rolled cuffs',
    type: 'shirt',
    renderToCanvas: () => {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_WIDTH;
      canvas.height = TEMPLATE_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      drawTemplateExteriorMockup(ctx, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, 'Alpine Plaid Overshirt');

      for (const island of ROBLOX_SHIRT_UV_ISLANDS) {
        const { x, y, w, h, name } = island;

        // Clip strictly to each UV island so plaid stripes never bleed across UV borders
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        // Base deep indigo flannel
        ctx.fillStyle = '#172554';
        ctx.fillRect(x, y, w, h);

        // Plaid horizontal & vertical bands (cleanly tiled inside the clipped UV rect)
        for (let py = y; py < y + h; py += 24) {
          ctx.fillStyle = 'rgba(194, 65, 12, 0.65)';
          ctx.fillRect(x, py + 6, w, 8);
          ctx.fillStyle = 'rgba(248, 250, 252, 0.25)';
          ctx.fillRect(x, py + 18, w, 2);
        }
        for (let px = x; px < x + w; px += 24) {
          ctx.fillStyle = 'rgba(194, 65, 12, 0.55)';
          ctx.fillRect(px + 6, y, 8, h);
          ctx.fillStyle = 'rgba(248, 250, 252, 0.22)';
          ctx.fillRect(px + 18, y, 2, h);
        }

        if (name === 'Torso Front') {
          // Open collar & inner cream tee
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(x + w / 2 - 20, y);
          ctx.lineTo(x + w / 2 + 20, y);
          ctx.lineTo(x + w / 2, y + 26);
          ctx.closePath();
          ctx.fill();

          // Button placket
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + w / 2 - 5, y + 20, 10, h - 20);
          for (let by = y + 32; by < y + h - 8; by += 20) {
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.arc(x + w / 2, by, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }

          // Twin buttoned chest pockets
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fillRect(x + 14, y + 40, 32, 30);
          ctx.fillRect(x + w - 46, y + 40, 32, 30);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 14, y + 40, 32, 30);
          ctx.strokeRect(x + w - 46, y + 40, 32, 30);
        }

        if ((island.group === 'right_arm' || island.group === 'left_arm') && h === 128) {
          // Rolled sleeve cuff + bare forearm/hand
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y + h - 40, w, 8);
          ctx.clearRect(x, y + h - 32, w, 32);
        } else if (name.includes('Bottom')) {
          ctx.clearRect(x, y, w, h);
        }

        ctx.restore();
      }

      return canvas;
    }
  },
  {
    id: 'utility-cargo-trousers',
    name: 'Utility Cargo Trousers',
    description: 'Charcoal twill cargo pants with belt hardware, side pockets & studio sneakers',
    type: 'pants',
    renderToCanvas: () => {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_WIDTH;
      canvas.height = TEMPLATE_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      drawTemplateExteriorMockup(ctx, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, 'Utility Cargo Pants');

      for (const island of ROBLOX_PANTS_UV_ISLANDS) {
        const { x, y, w, h, name } = island;

        if (island.group === 'torso') {
          // Keep upper torso transparent so shirts layer cleanly; draw belt/waistband on lower third
          ctx.clearRect(x, y, w, h);
          if (h === 128) {
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(x, y + h - 30, w, 30);
            // Webbing belt
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(x, y + h - 26, w, 10);
            if (name === 'Torso Front') {
              // Brushed steel buckle
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(x + w / 2 - 12, y + h - 27, 24, 12);
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(x + w / 2 - 7, y + h - 24, 14, 6);
            }
          } else if (name === 'Torso Bottom') {
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(x, y, w, h);
          }
          continue;
        }

        // Legs base charcoal twill
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, '#27303f');
        grad.addColorStop(0.75, '#1e2430');
        grad.addColorStop(1, '#151a23');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        if (h === 128) {
          // Knee articulation stitching
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 56);
          ctx.lineTo(x + w - 6, y + 56);
          ctx.moveTo(x + 6, y + 72);
          ctx.lineTo(x + w - 6, y + 72);
          ctx.stroke();

          // Side cargo pocket on outer leg faces
          if (name.includes('Outer')) {
            ctx.fillStyle = '#1a202c';
            ctx.fillRect(x + 10, y + 32, w - 20, 34);
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 10, y + 32, w - 20, 34);
            ctx.fillStyle = '#06b6d4';
            ctx.fillRect(x + 14, y + 39, 14, 2);
          }

          // Studio sneakers at bottom 24px
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y + h - 24, w, 16);
          // Crisp off-white midsole
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(x, y + h - 8, w, 8);
          // Cyan heel / toe accent
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(x + 8, y + h - 14, w - 16, 2);
        } else if (name.includes('Bottom')) {
          // Sneaker outsole
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
        }
      }

      return canvas;
    }
  },
  {
    id: 'heavenly-crest-tshirt',
    name: 'Heavenly Crest Emblem',
    description: '512 × 512 transparent front-chest emblem graphic for Classic T-Shirts',
    type: 'tshirt',
    renderToCanvas: () => {
      const canvas = document.createElement('canvas');
      canvas.width = TSHIRT_SIZE;
      canvas.height = TSHIRT_SIZE;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, TSHIRT_SIZE, TSHIRT_SIZE);

      const cx = TSHIRT_SIZE / 2;
      const cy = TSHIRT_SIZE / 2 - 12;

      // Subtle architectural backdrop disc (semi-transparent dark navy)
      ctx.fillStyle = 'rgba(11, 17, 32, 0.88)';
      ctx.beginPath();
      ctx.arc(cx, cy, 164, 0, Math.PI * 2);
      ctx.fill();

      // Outer thin cyan ring
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 152, 0, Math.PI * 2);
      ctx.stroke();

      // Inner subtle slate ring
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 134, 0, Math.PI * 2);
      ctx.stroke();

      // Geometric diamond + horizon lines
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 92);
      ctx.lineTo(cx + 88, cy);
      ctx.lineTo(cx, cy + 92);
      ctx.lineTo(cx - 88, cy);
      ctx.closePath();
      ctx.stroke();

      // Inner cyan prism
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 42);
      ctx.lineTo(cx + 42, cy);
      ctx.lineTo(cx, cy + 42);
      ctx.lineTo(cx - 42, cy);
      ctx.closePath();
      ctx.fill();

      // Clean studio typography below crest
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 34px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HEAVENLY', cx, TSHIRT_SIZE - 56);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 14px monospace';
      ctx.fillText('STUDIO EDITION · 01', cx, TSHIRT_SIZE - 26);

      return canvas;
    }
  }
];
