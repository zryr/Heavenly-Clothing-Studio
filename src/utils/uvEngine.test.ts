import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROBLOX_PANTS_UV_ISLANDS,
  ROBLOX_SHIRT_UV_ISLANDS,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  TSHIRT_SIZE
} from '../types/uv';
import {
  LEGACY_SHIRT_UV_KEY,
  STORAGE_SHIRT_UV_KEY,
  analyzeBufferPreflight,
  buildExportFilename,
  computeConformRect,
  defringeUvAlphaBuffer,
  extendUvIslands,
  getIslandAtCoord,
  getUvMask,
  loadOrMigrateUvIslands,
  nudgeUvIslands,
  stripNonUvBuffer,
  validateUvIslands
} from './uvEngine';
import { computeBrush3DRadiusWorld } from '../three/avatarSceneEngine';
import { HistoryStack } from './historyStack';
import {
  createRobloxBeveledPartGeometry,
  createRobloxHeadGeometry,
  createRobloxSculptedLoftGeometry,
  createRobloxWomanHandGeometry
} from '../three/robloxMeshBuilder';
import { buildCustomBackgroundMask } from './backgroundCompositor';
import {
  R15_LIMB_BASE_H,
  R15_LIMB_BASE_W,
  R15_LIMB_RECTS,
  R15_TORSO_BASE_H,
  R15_TORSO_BASE_W,
  R15_TORSO_RECTS
} from '../three/r15Compositor';

test('getUvMask marks interior UV island pixels as 1 and outside pixels as 0', () => {
  const mask = getUvMask(ROBLOX_SHIRT_UV_ISLANDS, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  assert.equal(mask.length, TEMPLATE_WIDTH * TEMPLATE_HEIGHT);

  // Corner (0, 0) is outside all islands
  assert.equal(mask[0], 0);

  // Center of Torso Front (231..359, 74..202)
  const torsoFrontCenter = 120 * TEMPLATE_WIDTH + 280;
  assert.equal(mask[torsoFrontCenter], 1);

  // 1px left of Torso Front with bleed 0 vs bleed 1 (Torso Front starts at x=231; Torso Right Side ends at 229)
  const gapIdx = 120 * TEMPLATE_WIDTH + 230;
  assert.equal(mask[gapIdx], 0);

  const maskBleed1 = getUvMask(ROBLOX_SHIRT_UV_ISLANDS, 1, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  assert.equal(maskBleed1[gapIdx], 1);
});

test('getIslandAtCoord identifies exact UV islands and returns null outside', () => {
  const torsoFront = getIslandAtCoord(250, 100, ROBLOX_SHIRT_UV_ISLANDS);
  assert.ok(torsoFront);
  assert.equal(torsoFront.name, 'Torso Front');

  const outside = getIslandAtCoord(2, 2, ROBLOX_SHIRT_UV_ISLANDS);
  assert.equal(outside, null);

  const outOfBounds = getIslandAtCoord(-5, 10, ROBLOX_SHIRT_UV_ISLANDS);
  assert.equal(outOfBounds, null);
});

test('stripNonUvBuffer strips all outside pixels while preserving interior UV pixels untouched', () => {
  const totalPixels = TEMPLATE_WIDTH * TEMPLATE_HEIGHT;
  const rgba = new Uint8ClampedArray(totalPixels * 4);

  // Fill entire image with opaque teal
  for (let i = 0; i < totalPixels; i++) {
    rgba[i * 4] = 12;
    rgba[i * 4 + 1] = 180;
    rgba[i * 4 + 2] = 210;
    rgba[i * 4 + 3] = 255;
  }

  const res = stripNonUvBuffer(rgba, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, ROBLOX_SHIRT_UV_ISLANDS, 0);
  assert.ok(res.dirtyPixelsStripped > 100000);
  assert.ok(res.remainingVisiblePixels > 100000);
  assert.equal(res.dirtyPixelsStripped + res.remainingVisiblePixels, totalPixels);

  // Verify outside pixel (0,0) is strictly rgba(0,0,0,0)
  assert.equal(rgba[0], 0);
  assert.equal(rgba[1], 0);
  assert.equal(rgba[2], 0);
  assert.equal(rgba[3], 0);

  // Verify interior pixel inside Torso Front (280, 120) is completely preserved
  const innerOffset = (120 * TEMPLATE_WIDTH + 280) * 4;
  assert.equal(rgba[innerOffset], 12);
  assert.equal(rgba[innerOffset + 1], 180);
  assert.equal(rgba[innerOffset + 2], 210);
  assert.equal(rgba[innerOffset + 3], 255);
});

test('analyzeBufferPreflight reports dirty outside pixels for Shirt and exact check for Classic T-Shirt', () => {
  const shirtRgba = new Uint8ClampedArray(TEMPLATE_WIDTH * TEMPLATE_HEIGHT * 4);
  // Make pixel (0, 0) opaque outside UV
  shirtRgba[3] = 255;
  const dirtyReport = analyzeBufferPreflight(
    shirtRgba,
    TEMPLATE_WIDTH,
    TEMPLATE_HEIGHT,
    'shirt',
    'test_shirt.png',
    1024,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.equal(dirtyReport.isExactDimensions, true);
  assert.equal(dirtyReport.dirtyNonUvPixels, 1);

  // Clean shirt buffer
  shirtRgba[3] = 0;
  const cleanReport = analyzeBufferPreflight(
    shirtRgba,
    TEMPLATE_WIDTH,
    TEMPLATE_HEIGHT,
    'shirt',
    'test_shirt.png',
    1024,
    ROBLOX_SHIRT_UV_ISLANDS
  );
  assert.equal(cleanReport.dirtyNonUvPixels, 0);
  assert.equal(cleanReport.uvConformityPercentage, 100);

  // Classic T-Shirt 512x512 exact check
  const tshirtRgba = new Uint8ClampedArray(TSHIRT_SIZE * TSHIRT_SIZE * 4);
  tshirtRgba[3] = 255;
  const tshirtReport = analyzeBufferPreflight(
    tshirtRgba,
    TSHIRT_SIZE,
    TSHIRT_SIZE,
    'tshirt',
    'crest.png',
    512
  );
  assert.equal(tshirtReport.isExactDimensions, true);
  assert.equal(tshirtReport.expectedWidth, 512);
  assert.equal(tshirtReport.expectedHeight, 512);
  assert.equal(tshirtReport.dirtyNonUvPixels, 0);
  assert.equal(tshirtReport.visiblePixels, 1);
});

test('computeConformRect produces accurate Pad, Crop, and Scale geometry', () => {
  // Wide 1000x500 image into 500x500 target
  const pad = computeConformRect(1000, 500, 500, 500, 'pad');
  assert.equal(pad.dw, 500);
  assert.equal(pad.dh, 250);
  assert.equal(pad.dx, 0);
  assert.equal(pad.dy, 125);

  const crop = computeConformRect(1000, 500, 500, 500, 'crop');
  assert.equal(crop.dw, 500);
  assert.equal(crop.dh, 500);
  assert.equal(crop.sw, 500);
  assert.equal(crop.sh, 500);
  assert.equal(crop.sx, 250);
  assert.equal(crop.sy, 0);

  const scale = computeConformRect(1000, 500, 500, 500, 'scale');
  assert.equal(scale.dx, 0);
  assert.equal(scale.dy, 0);
  assert.equal(scale.dw, 500);
  assert.equal(scale.dh, 500);
  assert.equal(scale.sw, 1000);
  assert.equal(scale.sh, 500);
});

test('nudgeUvIslands and extendUvIslands move/expand islands and clamp within template bounds', () => {
  const nudged = nudgeUvIslands(
    ROBLOX_SHIRT_UV_ISLANDS,
    (isl) => isl.name === 'Torso Front',
    5,
    -10
  );
  const moved = nudged.find((i) => i.name === 'Torso Front')!;
  assert.equal(moved.x, 236);
  assert.equal(moved.y, 64);

  // Clamp at 0
  const clamped = nudgeUvIslands(
    ROBLOX_SHIRT_UV_ISLANDS,
    (isl) => isl.name === 'Torso Front',
    -999,
    -999
  );
  const clampedFront = clamped.find((i) => i.name === 'Torso Front')!;
  assert.equal(clampedFront.x, 0);
  assert.equal(clampedFront.y, 0);

  // Extend single island bleed +2
  const extended = extendUvIslands(
    ROBLOX_SHIRT_UV_ISLANDS,
    (isl) => isl.name === 'Torso Front',
    'bleed',
    2,
    'single'
  );
  const extFront = extended.find((i) => i.name === 'Torso Front')!;
  assert.equal(extFront.x, 229);
  assert.equal(extFront.y, 72);
  assert.equal(extFront.w, 132);
  assert.equal(extFront.h, 132);
});

test('buildExportFilename sanitizes names and appends .png cleanly', () => {
  assert.equal(buildExportFilename('My Cool Shirt!.png', 'shirt'), 'My_Cool_Shirt.png');
  assert.match(buildExportFilename('', 'pants'), /^Heavenly_Pants_\d{8}\.png$/);
  assert.match(buildExportFilename('   ', 'tshirt'), /^Heavenly_TShirt_\d{8}\.png$/);
});

test('validateUvIslands and loadOrMigrateUvIslands migrate legacy v5 storage cleanly', () => {
  assert.equal(validateUvIslands([]), null);
  assert.equal(validateUvIslands([{ name: 'Bad', x: 0, y: 0, w: 1, h: 1 }]), null);
  assert.ok(validateUvIslands(ROBLOX_PANTS_UV_ISLANDS));

  const mem = new Map<string, string>();
  const customLegacy = ROBLOX_SHIRT_UV_ISLANDS.map((isl) =>
    isl.name === 'Torso Front' ? { ...isl, x: 233 } : isl
  );
  mem.set(LEGACY_SHIRT_UV_KEY, JSON.stringify(customLegacy));

  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    }
  };

  const migrated = loadOrMigrateUvIslands('shirt', mockStorage);
  assert.equal(migrated.migratedFromLegacy, true);
  assert.equal(migrated.isCustom, true);
  assert.equal(migrated.islands.find((i) => i.name === 'Torso Front')?.x, 233);
  assert.ok(mem.has(STORAGE_SHIRT_UV_KEY));
});

test('HistoryStack handles push, undo, redo, branch truncation, and capacity cap', () => {
  const stack = new HistoryStack<string>(3);
  assert.equal(stack.canUndo(), false);
  assert.equal(stack.canRedo(), false);

  stack.reset('s0');
  stack.push('s1');
  stack.push('s2');
  assert.equal(stack.current(), 's2');
  assert.equal(stack.canUndo(), true);
  assert.equal(stack.canRedo(), false);

  assert.equal(stack.undo(), 's1');
  assert.equal(stack.canRedo(), true);

  // Pushing drops s2
  stack.push('s2_alt');
  assert.equal(stack.canRedo(), false);
  assert.equal(stack.current(), 's2_alt');

  // Capacity cap of 3 drops oldest
  stack.push('s3');
  assert.equal(stack.size(), 3);
  assert.equal(stack.undo(), 's2_alt');
  assert.equal(stack.undo(), 's1');
  assert.equal(stack.canUndo(), false);
});

test('createRobloxBeveledPartGeometry preserves exact dimensions, beveled corners, valid normals, and Roblox UV island bounds', () => {
  const upperTorso = createRobloxBeveledPartGeometry({
    width: 2,
    height: 1.28,
    depth: 1,
    bevel: 0.048,
    segments: 6,
    islands: ROBLOX_SHIRT_UV_ISLANDS,
    faceSlices: [
      { islandName: 'Torso Left Side', vStartFrac: 0, vEndFrac: 0.64 },
      { islandName: 'Torso Right Side', vStartFrac: 0, vEndFrac: 0.64 },
      { islandName: 'Torso Top', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Bottom', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Front', vStartFrac: 0, vEndFrac: 0.64 },
      { islandName: 'Torso Back', vStartFrac: 0, vEndFrac: 0.64 }
    ]
  });

  upperTorso.computeBoundingBox();
  const bb = upperTorso.boundingBox!;
  assert.ok(Math.abs(bb.max.x - bb.min.x - 2) < 0.01);
  assert.ok(Math.abs(bb.max.y - bb.min.y - 1.28) < 0.01);
  assert.ok(Math.abs(bb.max.z - bb.min.z - 1) < 0.01);

  const pos = upperTorso.attributes.position;
  const norm = upperTorso.attributes.normal;
  const uv = upperTorso.attributes.uv;

  // Check all normals are finite unit vectors and corners are genuinely beveled (distance < sharp corner diagonal)
  const sharpCornerDist = Math.hypot(1, 0.64, 0.5);
  let maxDist = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    maxDist = Math.max(maxDist, Math.hypot(x, y, z));

    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    const nLen = Math.hypot(nx, ny, nz);
    assert.ok(Number.isFinite(nLen) && Math.abs(nLen - 1) < 0.02, `Invalid normal at ${i}`);

    const u = uv.getX(i);
    const v = uv.getY(i);
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `UV out of range at ${i}: ${u},${v}`);
  }
  assert.ok(maxDist < sharpCornerDist - 0.01, 'Beveled corners should be strictly pulled inside sharp cube corners');

  // Verify Face 4 (+Z Front) UVs stay strictly inside Torso Front upper 64%
  const vertsPerFace = 7 * 7;
  const torsoFront = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Torso Front')!;
  const expectedU0 = torsoFront.x / TEMPLATE_WIDTH;
  const expectedU1 = (torsoFront.x + torsoFront.w) / TEMPLATE_WIDTH;
  const expectedVTop = 1 - torsoFront.y / TEMPLATE_HEIGHT;
  const expectedVBot = 1 - (torsoFront.y + torsoFront.h * 0.64) / TEMPLATE_HEIGHT;

  for (let vi = 4 * vertsPerFace; vi < 5 * vertsPerFace; vi++) {
    const u = uv.getX(vi);
    const v = uv.getY(vi);
    assert.ok(u >= expectedU0 - 1e-4 && u <= expectedU1 + 1e-4);
    assert.ok(v >= expectedVBot - 1e-4 && v <= expectedVTop + 1e-4);
  }
  upperTorso.dispose();
});

test('createRobloxHeadGeometry builds finite smooth mannequin head mesh', () => {
  const head = createRobloxHeadGeometry();
  const pos = head.attributes.position;
  const norm = head.attributes.normal;
  assert.ok(pos.count > 200);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    assert.ok(Number.isFinite(norm.getX(i)) && Number.isFinite(norm.getY(i)) && Number.isFinite(norm.getZ(i)));
  }
  head.dispose();
});

test('createRobloxBeveledPartGeometry supports flush R15 internal seams with bevelTop/bevelBottom disabled', () => {
  const flushPart = createRobloxBeveledPartGeometry({
    width: 1.0,
    height: 1.0,
    depth: 1.0,
    bevel: 0.048,
    bevelTop: false,
    bevelBottom: false,
    segments: 4,
    islands: ROBLOX_SHIRT_UV_ISLANDS,
    faceSlices: [
      { islandName: 'Right Arm Inner/Left', vStartFrac: 0, vEndFrac: 0.5 },
      { islandName: 'Right Arm Outer/Right', vStartFrac: 0, vEndFrac: 0.5 },
      { islandName: 'Right Arm Top', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Right Arm Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Right Arm Front', vStartFrac: 0, vEndFrac: 0.5 },
      { islandName: 'Right Arm Back', vStartFrac: 0, vEndFrac: 0.5 }
    ]
  });

  flushPart.computeBoundingBox();
  const bb = flushPart.boundingBox!;
  assert.ok(Math.abs(bb.max.y - 0.5) < 1e-4);
  assert.ok(Math.abs(bb.min.y + 0.5) < 1e-4);

  // Verify vertices right at y = +0.5 still reach full X extent (not pinched inward by a top bevel)
  const pos = flushPart.attributes.position;
  let maxXAtTopRim = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - 0.5) < 1e-4) {
      maxXAtTopRim = Math.max(maxXAtTopRim, Math.abs(pos.getX(i)));
    }
  }
  assert.ok(
    maxXAtTopRim > 0.49,
    `Flush top rim should reach outer X width without bevel gap (got ${maxXAtTopRim})`
  );
  flushPart.dispose();
});

test('createRobloxSculptedLoftGeometry and createRobloxWomanHandGeometry produce valid Woman 1 & Woman 2 meshes', () => {
  const womanTorso = createRobloxSculptedLoftGeometry({
    height: 2.0,
    radialSegments: 6,
    profile: [
      { t: 0, halfW: 0.85, halfD: 0.48, roundness: 0.45 },
      { t: 0.35, halfW: 0.72, halfD: 0.42, roundness: 0.45 },
      { t: 0.75, halfW: 0.92, halfD: 0.50, roundness: 0.42 },
      { t: 1.0, halfW: 0.82, halfD: 0.44, roundness: 0.45 }
    ],
    islands: ROBLOX_SHIRT_UV_ISLANDS,
    faceSlices: [
      { islandName: 'Torso Left Side', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Right Side', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Top', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Bottom', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Front', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Torso Back', vStartFrac: 0, vEndFrac: 1 }
    ]
  });

  womanTorso.computeBoundingBox();
  const bb = womanTorso.boundingBox!;
  assert.ok(Math.abs(bb.max.y - bb.min.y - 2.0) < 0.02);
  const pos = womanTorso.attributes.position;
  const norm = womanTorso.attributes.normal;
  const uv = womanTorso.attributes.uv;
  assert.ok(pos.count > 100);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    const nLen = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
    assert.ok(Number.isFinite(nLen) && nLen > 0.9 && nLen < 1.1);
    assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
  }
  womanTorso.dispose();

  const leftHand = createRobloxWomanHandGeometry('left');
  const rightHand = createRobloxWomanHandGeometry('right');
  assert.ok(leftHand.attributes.position.count > 50);
  assert.equal(leftHand.attributes.position.count, rightHand.attributes.position.count);
  leftHand.dispose();
  rightHand.dispose();
});

test('buildCustomBackgroundMask targets strictly outside UV islands for Shirts/Pants and full canvas for T-Shirts', () => {
  const shirtMask = buildCustomBackgroundMask(
    TEMPLATE_WIDTH,
    TEMPLATE_HEIGHT,
    'shirt',
    ROBLOX_SHIRT_UV_ISLANDS,
    0
  );
  // Corner (0,0) is outside UV -> eligible (1)
  assert.equal(shirtMask[0], 1);
  // Center of Torso Front (280, 120) is inside UV -> protected (0)
  assert.equal(shirtMask[120 * TEMPLATE_WIDTH + 280], 0);

  // Classic T-Shirt -> full canvas eligible (1)
  const tshirtMask = buildCustomBackgroundMask(TSHIRT_SIZE, TSHIRT_SIZE, 'tshirt', [], 0);
  assert.equal(tshirtMask[0], 1);
  assert.equal(tshirtMask[256 * TSHIRT_SIZE + 256], 1);
});

test('hand and foot Bottom/Cuff faces map strictly inside their 64x64 UV islands (never full template)', () => {
  const handGeo = createRobloxBeveledPartGeometry({
    width: 1.0,
    height: 0.4,
    depth: 1.0,
    bevel: 0.042,
    bevelTop: false,
    bevelBottom: true,
    segments: 4,
    islands: ROBLOX_SHIRT_UV_ISLANDS,
    faceSlices: [
      { islandName: 'Right Arm Inner/Left', vStartFrac: 0.8, vEndFrac: 1 },
      { islandName: 'Right Arm Outer/Right', vStartFrac: 0.8, vEndFrac: 1 },
      { islandName: 'Right Arm Front', vStartFrac: 0.8, vEndFrac: 0.83 },
      { islandName: 'Right Arm Bottom/Cuff', vStartFrac: 0, vEndFrac: 1 },
      { islandName: 'Right Arm Front', vStartFrac: 0.8, vEndFrac: 1 },
      { islandName: 'Right Arm Back', vStartFrac: 0.8, vEndFrac: 1 }
    ]
  });

  const uv = handGeo.attributes.uv;
  const vertsPerFace = 5 * 5;
  const cuff = ROBLOX_SHIRT_UV_ISLANDS.find((i) => i.name === 'Right Arm Bottom/Cuff')!;
  const u0 = cuff.x / TEMPLATE_WIDTH;
  const u1 = (cuff.x + cuff.w) / TEMPLATE_WIDTH;
  const vTop = 1 - cuff.y / TEMPLATE_HEIGHT;
  const vBot = 1 - (cuff.y + cuff.h) / TEMPLATE_HEIGHT;

  // Face 3 (-Y bottom) vertices must stay strictly inside the 64x64 cuff island
  for (let vi = 3 * vertsPerFace; vi < 4 * vertsPerFace; vi++) {
    const u = uv.getX(vi);
    const v = uv.getY(vi);
    assert.ok(u >= u0 - 1e-4 && u <= u1 + 1e-4, `Bottom U ${u} leaked outside cuff [${u0}, ${u1}]`);
    assert.ok(v >= vBot - 1e-4 && v <= vTop + 1e-4, `Bottom V ${v} leaked outside cuff [${vBot}, ${vTop}]`);
  }
  handGeo.dispose();

  // Verify every Bottom/Cuff island exists for both Shirt and Pants
  assert.ok(ROBLOX_SHIRT_UV_ISLANDS.some((i) => i.name === 'Right Arm Bottom/Cuff'));
  assert.ok(ROBLOX_SHIRT_UV_ISLANDS.some((i) => i.name === 'Left Arm Bottom/Cuff'));
  assert.ok(ROBLOX_PANTS_UV_ISLANDS.some((i) => i.name === 'Right Leg Bottom/Cuff'));
  assert.ok(ROBLOX_PANTS_UV_ISLANDS.some((i) => i.name === 'Left Leg Bottom/Cuff'));
});

test('official Roblox R15 compositor rectangles fit atlas bounds and bundled GLB rigs are valid', () => {
  for (const [name, rect] of Object.entries(R15_TORSO_RECTS)) {
    assert.ok(rect.x >= 0 && rect.y >= 0, `Torso rect ${name} negative origin`);
    assert.ok(
      rect.x + rect.w <= R15_TORSO_BASE_W && rect.y + rect.h <= R15_TORSO_BASE_H,
      `Torso rect ${name} exceeds ${R15_TORSO_BASE_W}x${R15_TORSO_BASE_H}`
    );
  }
  for (const [name, rect] of Object.entries(R15_LIMB_RECTS)) {
    assert.ok(rect.x >= 0 && rect.y >= 0, `Limb rect ${name} negative origin`);
    assert.ok(
      rect.x + rect.w <= R15_LIMB_BASE_W && rect.y + rect.h <= R15_LIMB_BASE_H,
      `Limb rect ${name} exceeds ${R15_LIMB_BASE_W}x${R15_LIMB_BASE_H}`
    );
  }
  for (const glbPath of ['public/models/roblox_r15_woman.glb', 'public/models/roblox_r15_block.glb']) {
    const data = fs.readFileSync(glbPath);
    assert.ok(data.byteLength > 100_000, `${glbPath} unexpectedly small`);
    assert.equal(data.toString('ascii', 0, 4), 'glTF', `${glbPath} missing glTF magic header`);
  }
});

test('defringeUvAlphaBuffer removes faint halo fringes inside UV islands, crisps near-opaque edges, and ignores outside pixels', () => {
  const w = TEMPLATE_WIDTH;
  const h = TEMPLATE_HEIGHT;
  const rgba = new Uint8ClampedArray(w * h * 4);

  // 1. Outside UV pixel (0, 0) with low alpha (40) -> must stay untouched
  rgba[0] = 200;
  rgba[1] = 200;
  rgba[2] = 200;
  rgba[3] = 40;

  // 2. Inside Torso Front (250, 100): faint halo fringe (alpha = 45) -> cleared to 0
  const fringeOff = (100 * w + 250) * 4;
  rgba[fringeOff] = 255;
  rgba[fringeOff + 1] = 255;
  rgba[fringeOff + 2] = 255;
  rgba[fringeOff + 3] = 45;

  // 3. Inside Torso Front (251, 100): mid-translucent (alpha = 150) -> preserved untouched
  const midOff = (100 * w + 251) * 4;
  rgba[midOff] = 40;
  rgba[midOff + 1] = 120;
  rgba[midOff + 2] = 220;
  rgba[midOff + 3] = 150;

  // 4. Inside Torso Front (252, 100): near-opaque edge (alpha = 230) -> crisped to 255
  const crispOff = (100 * w + 252) * 4;
  rgba[crispOff] = 30;
  rgba[crispOff + 1] = 80;
  rgba[crispOff + 2] = 160;
  rgba[crispOff + 3] = 230;

  const res = defringeUvAlphaBuffer(rgba, w, h, ROBLOX_SHIRT_UV_ISLANDS, 0);
  assert.equal(res.fringePixelsCleared, 1);
  assert.equal(res.edgePixelsCrisped, 1);
  assert.equal(res.totalAdjusted, 2);

  assert.equal(rgba[3], 40);
  assert.equal(rgba[fringeOff + 3], 0);
  assert.equal(rgba[midOff + 3], 150);
  assert.equal(rgba[crispOff + 3], 255);
});

test('computeBrush3DRadiusWorld scales monotonically and clamps within safe 3D avatar bounds', () => {
  const tiny = computeBrush3DRadiusWorld(2);
  const medium = computeBrush3DRadiusWorld(16);
  const huge = computeBrush3DRadiusWorld(64);
  assert.ok(tiny >= 0.032 && tiny < medium);
  assert.ok(medium < huge && huge <= 0.42);
  assert.equal(computeBrush3DRadiusWorld(-10), tiny);
  assert.equal(computeBrush3DRadiusWorld(999), huge);
});




