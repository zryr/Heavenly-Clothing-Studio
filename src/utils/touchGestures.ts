export interface TouchTapRecord {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
  endTime: number;
}

export type MultiTouchTapAction = 'undo' | 'redo' | null;

/**
 * Classifies a completed multi-finger touch gesture into a quick tap action:
 * - 2 simultaneous fingers released quickly with tiny drift -> 'undo'
 * - 3 simultaneous fingers released quickly with tiny drift -> 'redo'
 * Rejects drags, pinches, or long-presses so zooming/panning NEVER triggers accidental Undo/Redo!
 */
export function classifyMultiTouchTap(
  maxSimultaneousFingers: number,
  records: ReadonlyArray<TouchTapRecord>,
  hadPinchOrDrag: boolean = false,
  maxDurationMs: number = 310,
  maxMovePx: number = 18
): MultiTouchTapAction {
  if (hadPinchOrDrag) return null;
  if (maxSimultaneousFingers !== 2 && maxSimultaneousFingers !== 3) return null;
  if (records.length < maxSimultaneousFingers) return null;

  let earliestStart = Infinity;
  let latestEnd = -Infinity;

  for (const r of records) {
    const moved = Math.hypot(r.endX - r.startX, r.endY - r.startY);
    if (moved > maxMovePx) return null;
    if (r.startTime < earliestStart) earliestStart = r.startTime;
    if (r.endTime > latestEnd) latestEnd = r.endTime;
  }

  const duration = latestEnd - earliestStart;
  if (duration < 0 || duration > maxDurationMs) return null;

  return maxSimultaneousFingers === 2 ? 'undo' : 'redo';
}

/**
 * Computes new 3D camera dolly distance from a 2-finger pinch ratio.
 * Spreading fingers (curDist > startDist) zooms IN (smaller distance);
 * pinching fingers together zooms OUT (larger distance).
 */
export function computePinchDollyDistance(
  startDistance: number,
  startPinchSpanPx: number,
  currentPinchSpanPx: number,
  minDistance: number = 2.6,
  maxDistance: number = 22
): number {
  const safeStartSpan = Math.max(12, startPinchSpanPx);
  const safeCurSpan = Math.max(12, currentPinchSpanPx);
  const ratio = safeStartSpan / safeCurSpan;
  const nextDist = startDistance * ratio;
  return Number(Math.max(minDistance, Math.min(maxDistance, nextDist)).toFixed(4));
}

/**
 * Computes orthographic camera zoom factor from a 2-finger pinch span.
 */
export function computePinchOrthoZoom(
  startZoom: number,
  startPinchSpanPx: number,
  currentPinchSpanPx: number,
  minZoom: number = 0.4,
  maxZoom: number = 4.5
): number {
  const safeStartSpan = Math.max(12, startPinchSpanPx);
  const safeCurSpan = Math.max(12, currentPinchSpanPx);
  const ratio = safeCurSpan / safeStartSpan;
  return Number(Math.max(minZoom, Math.min(maxZoom, startZoom * ratio)).toFixed(4));
}
