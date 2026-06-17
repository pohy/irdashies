import type { VrStatus } from '@irdashies/types';

/**
 * If the producer hasn't painted a frame within this window the overlay is
 * considered stalled (GPU compositing off, window destroyed, ...), so the dot
 * drops to amber even if the layer was recently active.
 */
export const VR_PAINT_STALE_MS = 1500;

export interface VrStatusInputs {
  /** VR overlay opt-in is on (IRDASHIES_VR=1, win32). */
  enabled: boolean;
  /** The offscreen producer window exists. */
  running: boolean;
  /** Time since the producer last submitted a GPU frame. */
  msSinceLastPaint: number;
  /** The OpenXR layer's heartbeat is advancing (confirmed end-to-end). */
  consumerActive: boolean;
}

/** Pure mapping from observed signals to the red/amber/green status. */
export function deriveVrStatus(i: VrStatusInputs): VrStatus {
  if (!i.enabled || !i.running) return 'off';
  if (i.msSinceLastPaint > VR_PAINT_STALE_MS) return 'waiting';
  return i.consumerActive ? 'active' : 'waiting';
}
