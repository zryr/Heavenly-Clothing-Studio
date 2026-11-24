# Heavenly Clothing Studio

**Roblox Classic Clothing Editor & 3D Previewer**  
*Create. Refine. Preview.*

Heavenly Clothing Studio is a browser-based creative workspace for importing, cleaning, editing, and 3D-previewing classic Roblox clothing assets.

## Supported Classic Clothing Formats

- **Classic Shirts** (`585 × 559 px` lossless PNG-32 mapped to torso and arm UV islands)
- **Classic Pants** (`585 × 559 px` lossless PNG-32 mapped to waist and leg UV islands)
- **Classic T-Shirts** (`512 × 512 px` square PNG overlaid on the front torso with customizable preview base shirt color)

## Core Capabilities

- **Live 2D + 3D Split Workspace**: Edit in 2D while watching changes update instantaneously on a real-time Three.js avatar, or switch to dedicated 2D Focus / 3D Focus views. Adapts automatically to single-view tabs on tablets and smaller screens.
- **Deterministic UV Cleanup**: Strip template backgrounds, frames, and exterior watermarks outside official Roblox UV islands with optional seam bleed margins (`0px`, `+1px`, `+2px`).
- **Precision 2D Tools**: Cursor-anchored wheel zoom, two-finger touch pinch zoom, interpolated Erase & Restore brushes, Marquee selection actions, non-destructive Placement/Scale transform, and a draggable Before/After comparison slider.
- **Verified Classic R6 & Labeled Rig Previews**: Classic R6 serves as the verified reference rig, alongside clearly labeled approximate previews for Blocky R15, Woman 1, and Woman 2 with accurate skin-under-transparency compositing and split upper/lower torso UVs.
- **Import Conform & Export Verification**: Mismatched image uploads open a live Conform preview (`Fit & Center`, `Fill & Crop`, or `Stretch`) rather than silently distorting artwork. Exports validate exact dimensions and outside-UV cleanliness before writing PNG-32 files.
- **Local Project Library**: Save, reopen, and auto-recover sessions locally via IndexedDB, plus portable `.hcs.json` project export/import.
- **Advanced UV Calibration**: Locked by default to prevent accidental nudges; unlock in the `UV Adv` inspector tab for fine pixel offsets, bleed expansion, and JSON coordinate import/export.

## Development

```bash
npm install
npm run dev
```

Run pure UV engine and history stack unit tests:

```bash
npx tsx --test src/utils/uvEngine.test.ts
```

Build and type-check:

```bash
npm run lint
npm run build
```

## Notes

- Final Roblox asset moderation, compression, and in-game character rendering remain subject to Roblox Creator Hub and Roblox client behavior.
- All image processing and project storage run locally in your browser.
