/**
 * VR overlay connection status, surfaced as a red/amber/green dot in settings.
 *  - 'off'     : overlay not running (disabled in VR settings, or failed to
 *                start) -> red
 *  - 'waiting' : irDashies is producing frames but they are not reaching the
 *                headset (game/layer not running, GPU compositing off, ...) ->
 *                amber
 *  - 'active'  : the OpenXR layer confirms it is compositing our frames -> green
 */
export type VrStatus = 'off' | 'waiting' | 'active';

/** Bridge methods exposed to the renderer for VR overlay status. */
export interface VrBridge {
  getStatus: () => Promise<VrStatus>;
}
