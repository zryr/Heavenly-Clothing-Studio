import { TEMPLATE_WIDTH, TEMPLATE_HEIGHT, ROBLOX_SHIRT_UV_ISLANDS } from '../types/uv';

export interface SampleTemplate {
  id: string;
  name: string;
  category: 'Shirt' | 'Pants';
  description: string;
  hasWatermarkInDeadSpace: boolean;
  hasWatermarkInsideUV: boolean;
  thumbnailColor: string;
  generate: () => HTMLCanvasElement;
}

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: 'cyber-hoodie',
    name: 'Cyberpunk Tech Hoodie (Heavy Watermarks)',
    category: 'Shirt',
    description: 'Realistic designer showcase with dead-space skulls, typography watermarks, and a torso tag.',
    hasWatermarkInDeadSpace: true,
    hasWatermarkInsideUV: true,
    thumbnailColor: '#00e5ff',
    generate: () => generateCyberHoodieTemplate()
  },
  {
    id: 'streetwear-flannel',
    name: 'Streetwear Plaid Overshirt (Showcase Frame)',
    category: 'Shirt',
    description: 'Vibrant flannel pattern with exterior watermark banners, social handles, and decorative background.',
    hasWatermarkInDeadSpace: true,
    hasWatermarkInsideUV: false,
    thumbnailColor: '#f97316',
    generate: () => generateStreetwearFlannelTemplate()
  },
  {
    id: 'specops-vest',
    name: 'Spec-Ops Combat Rig (Template Bleed)',
    category: 'Shirt',
    description: 'Tactical plate carrier with full-bleed camo pattern leaking into dead space, ready for 1-click clean.',
    hasWatermarkInDeadSpace: true,
    hasWatermarkInsideUV: true,
    thumbnailColor: '#10b981',
    generate: () => generateSpecOpsTemplate()
  }
];

function drawCheckerDeadSpace(ctx: CanvasRenderingContext2D, baseColor: string) {
  // Fill the whole canvas with dirty showcase background
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // Decorative cyber grid in dead space
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < TEMPLATE_WIDTH; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEMPLATE_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < TEMPLATE_HEIGHT; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEMPLATE_WIDTH, y);
    ctx.stroke();
  }

  // Draw showcase decorative labels in dead space
  ctx.save();
  ctx.fillStyle = 'rgba(255, 50, 100, 0.85)';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('⚡ SHOWCASE TEMPLATE ⚡', 150, 45);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '12px monospace';
  ctx.fillText('© 2026 CYBER_ASSET_LAB • DO NOT REUPLOAD', 160, 60);

  // Big diagonal watermark across dead space (and bleeding across)
  ctx.rotate(-0.25);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.font = '900 38px sans-serif';
  ctx.fillText('WATERMARK SAMPLE ONLY', 30, 220);
  ctx.fillText('WATERMARK SAMPLE ONLY', 60, 480);
  ctx.restore();

  // Draw skulls / decorative tags in corner dead space
  ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
  ctx.font = '18px monospace';
  ctx.fillText('☠ DEAD SPACE SKULL', 30, 120);
  ctx.fillText('☠ WATERMARK ZONE', 380, 30);
  ctx.fillText('IG: @roblox_designer_official', 20, 260);
  ctx.fillText('COMMISSIONS CLOSED', 360, 260);
  ctx.fillText('ROBLOX 585x559 RAW ASSET', 200, 545);
}

function generateCyberHoodieTemplate(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_WIDTH;
  canvas.height = TEMPLATE_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // 1. Fill dirty background
  drawCheckerDeadSpace(ctx, '#141822');

  // 2. Draw textures strictly on the UV islands
  for (const island of ROBLOX_SHIRT_UV_ISLANDS) {
    ctx.save();
    // Clip to island
    ctx.beginPath();
    ctx.rect(island.x, island.y, island.w, island.h);
    ctx.clip();

    // Dark cyber fabric base
    ctx.fillStyle = '#181b22';
    ctx.fillRect(island.x, island.y, island.w, island.h);

    // Subtle fabric micro-texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let px = island.x; px < island.x + island.w; px += 4) {
      for (let py = island.y; py < island.y + island.h; py += 4) {
        if ((px + py) % 8 === 0) {
          ctx.fillRect(px, py, 2, 2);
        }
      }
    }

    if (island.name === 'Torso Front') {
      // Draw neon cyber zipper & straps
      ctx.fillStyle = '#0f1218';
      ctx.fillRect(island.x + 30, island.y, 68, island.h);

      // Neon cyan accent lines
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(island.x + 40, island.y + 20);
      ctx.lineTo(island.x + 40, island.y + 110);
      ctx.moveTo(island.x + 88, island.y + 20);
      ctx.lineTo(island.x + 88, island.y + 110);
      ctx.stroke();

      // Cyber graphic print in chest center
      ctx.fillStyle = '#7000ff';
      ctx.beginPath();
      ctx.arc(island.x + 64, island.y + 55, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('CYBER-V', island.x + 42, island.y + 58);

      // A small watermark tag inside lower front torso for testing the manual eraser!
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(island.x + 36, island.y + 104, 56, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('REV-WATERMARK', island.x + 38, island.y + 115);
    } else if (island.name === 'Torso Back') {
      // Large cyber emblem on back
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 4;
      ctx.strokeRect(island.x + 28, island.y + 28, 72, 72);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('NEO // 07', island.x + 34, island.y + 70);
    } else if (island.name.includes('Top')) {
      // Shoulder seams
      ctx.fillStyle = '#222733';
      ctx.fillRect(island.x, island.y, island.w, island.h);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(island.x + 4, island.y + 4, island.w - 8, island.h - 8);
    } else if (island.name.includes('Bottom')) {
      // Hem / cuff
      ctx.fillStyle = '#11141b';
      ctx.fillRect(island.x, island.y, island.w, island.h);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(island.x, island.y + island.h - 12, island.w, 12);
    } else {
      // Arms side/front/back: draw tactical straps
      ctx.fillStyle = '#1e232e';
      ctx.fillRect(island.x, island.y + 40, island.w, 18);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(island.x, island.y + 40);
      ctx.lineTo(island.x + island.w, island.y + 40);
      ctx.stroke();
    }

    // High-contrast border to emphasize exact UV boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(island.x + 0.5, island.y + 0.5, island.w - 1, island.h - 1);

    ctx.restore();
  }

  return canvas;
}

function generateStreetwearFlannelTemplate(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_WIDTH;
  canvas.height = TEMPLATE_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Fill dirty grunge showcase background
  ctx.fillStyle = '#2a1a1f';
  ctx.fillRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // Exterior watermark spam in dead space
  ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('★★★ ORIGINAL STREETWEAR DROP ★★★', 80, 50);
  ctx.fillText('EXCLUSIVE ROBLOX CLOTHING GANG', 90, 540);
  ctx.fillText('NO LEAKS / NO STEALING', 20, 200);
  ctx.fillText('DISCORD.GG/DESIGNERS', 360, 200);

  // Plaid pattern inside islands
  for (const island of ROBLOX_SHIRT_UV_ISLANDS) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(island.x, island.y, island.w, island.h);
    ctx.clip();

    // Base warm orange/red
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(island.x, island.y, island.w, island.h);

    // Dark brown/black plaid grid
    ctx.fillStyle = '#1c1917';
    for (let x = island.x; x < island.x + island.w; x += 16) {
      ctx.fillRect(x, island.y, 6, island.h);
    }
    for (let y = island.y; y < island.y + island.h; y += 16) {
      ctx.fillRect(island.x, y, island.w, 6);
    }

    // Yellow accent stripe
    ctx.fillStyle = '#fbbf24';
    for (let x = island.x + 10; x < island.x + island.w; x += 32) {
      ctx.fillRect(x, island.y, 2, island.h);
    }
    for (let y = island.y + 10; y < island.y + island.h; y += 32) {
      ctx.fillRect(island.x, y, island.w, 2);
    }

    if (island.name === 'Torso Front') {
      // White inner shirt opening
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(island.x + 44, island.y);
      ctx.lineTo(island.x + 64, island.y + 60);
      ctx.lineTo(island.x + 84, island.y);
      ctx.fill();

      // Buttons
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(island.x + 64, island.y + 75, 4, 0, Math.PI * 2);
      ctx.arc(island.x + 64, island.y + 95, 4, 0, Math.PI * 2);
      ctx.arc(island.x + 64, island.y + 115, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  return canvas;
}

function generateSpecOpsTemplate(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_WIDTH;
  canvas.height = TEMPLATE_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Fill dirty olive military background with bleed everywhere
  ctx.fillStyle = '#1c2417';
  ctx.fillRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // Large camo blotches in dead space
  ctx.fillStyle = '#2c3823';
  ctx.beginPath();
  ctx.arc(100, 100, 90, 0, Math.PI * 2);
  ctx.arc(480, 80, 80, 0, Math.PI * 2);
  ctx.arc(300, 500, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(100, 200, 100, 0.4)';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('TACTICAL SPEC-OPS RIG // CLASS-A', 110, 45);
  ctx.fillText('DEV IDENT: UNIT_DELTA_09', 180, 545);

  // Draw vest textures inside UV islands
  for (const island of ROBLOX_SHIRT_UV_ISLANDS) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(island.x, island.y, island.w, island.h);
    ctx.clip();

    ctx.fillStyle = '#2b3624';
    ctx.fillRect(island.x, island.y, island.w, island.h);

    // Molle tactical straps
    ctx.fillStyle = '#171e13';
    for (let y = island.y + 10; y < island.y + island.h; y += 14) {
      ctx.fillRect(island.x + 8, y, island.w - 16, 5);
    }

    if (island.name === 'Torso Front') {
      // Plate carrier front
      ctx.fillStyle = '#1e271a';
      ctx.fillRect(island.x + 20, island.y + 20, island.w - 40, island.h - 40);

      // American / Operator Patch
      ctx.fillStyle = '#10b981';
      ctx.fillRect(island.x + 40, island.y + 35, 48, 24);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('SPECIAL OPS', island.x + 42, island.y + 50);

      // Interior watermark to test eraser
      ctx.fillStyle = '#e11d48';
      ctx.font = '8px monospace';
      ctx.fillText('SAMPLE_MOLLE_WM', island.x + 28, island.y + 115);
    }

    ctx.restore();
  }

  return canvas;
}
