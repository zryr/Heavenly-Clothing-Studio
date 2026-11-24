import test from 'node:test';
import assert from 'node:assert/strict';
import { ROBLOX_PANTS_UV_ISLANDS, ROBLOX_SHIRT_UV_ISLANDS } from '../types/uv';
import {
  computeMirrorCanvasPoint,
  computeSeamWrappedPoints,
  extractDominantPaletteFromBuffer,
  formatCompactIslandLabel,
  getIslandSeamCrossovers
} from './studioCreativeEngine';
import {
  classifyMultiTouchTap,
  computePinchDollyDistance,
  computePinchOrthoZoom
} from './touchGestures';
import { buildZipArchive, computeCrc32 } from './zipBuilder';
import { HistoryStack } from './historyStack';
import {
  R15_LIMB_BASE_H,
  R15_LIMB_BASE_W,
  R15_LIMB_RECTS,
  R15_TORSO_BASE_H,
  R15_TORSO_BASE_W,
  R15_TORSO_RECTS
} from '../three/r15Compositor';
import { mapR15AtlasUvToTemplate } from '../three/r15UvInverse';

test('computeMirrorCanvasPoint mirrors Right Arm Front cleanly onto Left Arm Front', () => {
  const rightFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Right Arm Front')!;
  const leftFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Left Arm Front')!;
  assert.ok(rightFront && leftFront);

  const mirrored = computeMirrorCanvasPoint(
    rightFront.x + 12,
    rightFront.y + 40,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.ok(mirrored);
  assert.equal(mirrored.island?.name, 'Left Arm Front');
  assert.equal(Math.round(mirrored.x), leftFront.x + leftFront.w - 12);
  assert.equal(Math.round(mirrored.y), leftFront.y + 40);
});

test('computeMirrorCanvasPoint mirrors Right Leg Outer onto Left Leg Outer', () => {
  const rOuter = ROBLOX_PANTS_UV_ISLANDS.find((i) => i.name === 'Right Leg Outer/Right')!;
  const lOuter = ROBLOX_PANTS_UV_ISLANDS.find((i) => i.name === 'Left Leg Outer/Left')!;
  assert.ok(rOuter && lOuter);

  const mirrored = computeMirrorCanvasPoint(
    rOuter.x + 10,
    rOuter.y + 25,
    ROBLOX_PANTS_UV_ISLANDS
  );
  assert.ok(mirrored);
  assert.equal(mirrored.island?.name, 'Left Leg Outer/Left');
  assert.equal(Math.round(mirrored.x), lOuter.x + lOuter.w - 10);
  assert.equal(Math.round(mirrored.y), lOuter.y + 25);
});

test('computeMirrorCanvasPoint mirrors Torso Front horizontally across its center and pairs Torso Sides', () => {
  const torsoFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Front')!;
  const mFront = computeMirrorCanvasPoint(
    torsoFront.x + 20,
    torsoFront.y + 50,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.ok(mFront);
  assert.equal(mFront.island?.name, 'Torso Front');
  assert.equal(Math.round(mFront.x), torsoFront.x + torsoFront.w - 20);

  const torsoRight = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Right Side')!;
  const mSide = computeMirrorCanvasPoint(
    torsoRight.x + 15,
    torsoRight.y + 30,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.ok(mSide);
  assert.equal(mSide.island?.name, 'Torso Left Side');
});

test('formatCompactIslandLabel keeps every Shirt and Pants UV label strictly within its island width', () => {
  const allIslands = [...ROBLOX_SHIRT_UV_ISLANDS, ...ROBLOX_PANTS_UV_ISLANDS];
  for (const isl of allIslands) {
    const lbl = formatCompactIslandLabel(isl);
    assert.ok(lbl.prefix.length > 0 && lbl.prefix.length <= 5, `Prefix too long: ${lbl.prefix}`);
    assert.ok(lbl.face.length > 0 && lbl.face.length <= 6, `Face too long: ${lbl.face}`);
    const estFaceWidth = lbl.face.length * lbl.fontSize * 0.62;
    assert.ok(
      estFaceWidth <= isl.w - 6,
      `Label "${lbl.face}" (${estFaceWidth.toFixed(1)}px) overflows ${isl.name} (${isl.w}px)`
    );
  }
});

test('computeSeamWrappedPoints bridges horizontal seam edges across Torso and Limbs cleanly', () => {
  const torsoFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Front')!;
  const torsoLeft = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Left Side')!;
  const wrappedRight = computeSeamWrappedPoints(
    torsoFront.x + torsoFront.w - 3,
    torsoFront.y + 60,
    12,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.equal(wrappedRight.length, 1);
  assert.equal(wrappedRight[0].island.name, 'Torso Left Side');
  assert.equal(Math.round(wrappedRight[0].x), torsoLeft.x - 3);
  assert.equal(Math.round(wrappedRight[0].y), torsoLeft.y + 60);

  // Far from edges should produce zero wrapped points
  const center = computeSeamWrappedPoints(
    torsoFront.x + 64,
    torsoFront.y + 64,
    10,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.equal(center.length, 0);
});

test('mapR15AtlasUvToTemplate accurately inverts R15 Torso and Limb UV hits back to 585x559 islands', () => {
  // Torso Front center
  const tfU = (R15_TORSO_RECTS.front.x + R15_TORSO_RECTS.front.w / 2) / R15_TORSO_BASE_W;
  const tfV = 1 - (R15_TORSO_RECTS.front.y + R15_TORSO_RECTS.front.h / 2) / R15_TORSO_BASE_H;
  const torsoHit = mapR15AtlasUvToTemplate('torso', tfU, tfV, 'shirt', ROBLOX_SHIRT_UV_ISLANDS);
  const torsoFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Front')!;
  assert.ok(torsoHit);
  assert.equal(torsoHit.islandName, 'Torso Front');
  assert.ok(Math.abs(torsoHit.x - (torsoFront.x + torsoFront.w / 2)) < 1.5);
  assert.ok(Math.abs(torsoHit.y - (torsoFront.y + torsoFront.h / 2)) < 1.5);

  // Right Arm Front shaft center -> maps inside Right Arm Front
  const raU = (R15_LIMB_RECTS.shaftFront.x + R15_LIMB_RECTS.shaftFront.w / 2) / R15_LIMB_BASE_W;
  const raV = 1 - (R15_LIMB_RECTS.shaftFront.y + R15_LIMB_RECTS.shaftFront.h / 2) / R15_LIMB_BASE_H;
  const armHit = mapR15AtlasUvToTemplate('rightArm', raU, raV, 'shirt', ROBLOX_SHIRT_UV_ISLANDS);
  assert.ok(armHit);
  assert.equal(armHit.islandName, 'Right Arm Front');

  // Painting shirt on leg should safely return null
  const wrongSlot = mapR15AtlasUvToTemplate('rightLeg', raU, raV, 'shirt', ROBLOX_SHIRT_UV_ISLANDS);
  assert.equal(wrongSlot, null);
});

test('HistoryStack jumpTo scrubs cleanly across timeline entries without destroying redo branch', () => {
  const stack = new HistoryStack<string>(10);
  stack.reset('Init');
  stack.push('Step 1');
  stack.push('Step 2');
  stack.push('Step 3');

  assert.equal(stack.entries().length, 4);
  assert.equal(stack.jumpTo(1), 'Step 1');
  assert.equal(stack.pointer(), 1);
  assert.equal(stack.canRedo(), true);
  assert.equal(stack.jumpTo(3), 'Step 3');
  assert.equal(stack.jumpTo(99), null);
});

test('getIslandSeamCrossovers reports collar, armpit, and waist seams for Torso Front', () => {
  const torsoFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Front')!;
  const seams = getIslandSeamCrossovers(torsoFront);
  assert.equal(seams.length, 4);
  assert.ok(seams.some((s) => s.edge === 'top' && s.label === 'Collar'));
  assert.ok(seams.some((s) => s.edge === 'bottom' && s.label === 'Waist Hem'));
});

test('buildZipArchive produces a standards-compliant PKZIP buffer with valid headers and CRC32', () => {
  const textBytes = new TextEncoder().encode('Hello Roblox Studio');
  assert.equal(computeCrc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const zip = buildZipArchive([
    { name: 'UPLOAD_CHECKLIST.txt', data: textBytes },
    { name: 'shirt.png', data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }
  ]);

  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);

  let foundEocd = false;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x05 && zip[i + 3] === 0x06) {
      foundEocd = true;
      const dv = new DataView(zip.buffer, zip.byteOffset + i, 22);
      assert.equal(dv.getUint16(10, true), 2);
      break;
    }
  }
  assert.ok(foundEocd, 'ZIP archive must end with a valid End of Central Directory record');
});

test('extractDominantPaletteFromBuffer extracts 5 distinct dominant colors and respects UV mask', () => {
  const w = 40;
  const h = 40;
  const buf = new Uint8ClampedArray(w * h * 4);
  const mask = new Uint8Array(w * h);

  const paintRect = (
    x0: number,
    y0: number,
    rw: number,
    rh: number,
    r: number,
    g: number,
    b: number,
    inMask: boolean
  ) => {
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        const idx = y * w + x;
        mask[idx] = inMask ? 1 : 0;
        buf[idx * 4] = r;
        buf[idx * 4 + 1] = g;
        buf[idx * 4 + 2] = b;
        buf[idx * 4 + 3] = 255;
      }
    }
  };

  // Bright magenta OUTSIDE UV mask — must be ignored when mask is passed!
  paintRect(0, 0, 40, 40, 255, 0, 255, false);

  // 5 distinct garment colors strictly INSIDE UV mask
  paintRect(2, 2, 16, 16, 18, 28, 48, true);   // Deep navy
  paintRect(20, 2, 14, 14, 56, 189, 248, true); // Sky cyan
  paintRect(2, 20, 12, 12, 239, 68, 68, true);  // Crimson red
  paintRect(16, 20, 10, 10, 245, 158, 11, true);// Amber gold
  paintRect(28, 20, 10, 10, 16, 185, 129, true);// Emerald green

  const palette = extractDominantPaletteFromBuffer(buf, w, h, mask, 5);
  assert.equal(palette.length, 5);
  assert.ok(!palette.includes('#FF00FF'), 'Masked-out outside background color must not appear');
  // Every returned swatch must be valid uppercase 6-digit hex
  for (const hex of palette) {
    assert.match(hex, /^#[0-9A-F]{6}$/);
  }
});

test('classifyMultiTouchTap distinguishes 2-finger Undo, 3-finger Redo, and rejects drags/pinches', () => {
  const twoTap = [
    { startX: 100, startY: 100, endX: 103, endY: 101, startTime: 1000, endTime: 1120 },
    { startX: 160, startY: 110, endX: 158, endY: 112, startTime: 1010, endTime: 1130 }
  ];
  assert.equal(classifyMultiTouchTap(2, twoTap, false), 'undo');

  const threeTap = [
    ...twoTap,
    { startX: 210, startY: 120, endX: 212, endY: 118, startTime: 1015, endTime: 1140 }
  ];
  assert.equal(classifyMultiTouchTap(3, threeTap, false), 'redo');

  // Pinch/drag or slow hold must NOT trigger Undo/Redo
  assert.equal(classifyMultiTouchTap(2, twoTap, true), null);
  const slowHold = [
    { startX: 100, startY: 100, endX: 100, endY: 100, startTime: 1000, endTime: 1600 },
    { startX: 160, startY: 110, endX: 160, endY: 110, startTime: 1005, endTime: 1610 }
  ];
  assert.equal(classifyMultiTouchTap(2, slowHold, false), null);
});

test('computePinchDollyDistance & computePinchOrthoZoom scale monotonically and clamp safely', () => {
  // Spreading fingers apart (100px -> 200px) zooms IN (halves perspective camera distance)
  assert.equal(computePinchDollyDistance(8.0, 100, 200, 2.6, 22), 4.0);
  // Pinching fingers closer (200px -> 100px) zooms OUT (doubles distance)
  assert.equal(computePinchDollyDistance(8.0, 200, 100, 2.6, 22), 16.0);
  // Clamping at min/max bounds
  assert.equal(computePinchDollyDistance(3.0, 100, 500, 2.6, 22), 2.6);
  assert.equal(computePinchDollyDistance(18.0, 400, 50, 2.6, 22), 22);

  // Orthographic zoom increases when spreading fingers
  assert.equal(computePinchOrthoZoom(1.0, 100, 200, 0.4, 4.5), 2.0);
  assert.equal(computePinchOrthoZoom(1.0, 100, 900, 0.4, 4.5), 4.5);
});


