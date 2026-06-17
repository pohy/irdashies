import { useEffect, useState } from 'react';
import type { VrStatus } from '@irdashies/types';

/**
 * Poll the main process for VR overlay connection status. Status changes
 * infrequently and the dot is non-critical, so a light poll is enough — no
 * push channel needed.
 */
export function useVrStatus(pollMs = 1500): VrStatus {
  const [status, setStatus] = useState<VrStatus>('off');

  useEffect(() => {
    if (!window.vrBridge) return;
    let active = true;
    // Ignore transient IPC errors and keep the last known status.
    const poll = () =>
      window.vrBridge
        .getStatus()
        .then((s) => active && setStatus(s))
        .catch(() => undefined);

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return status;
}
