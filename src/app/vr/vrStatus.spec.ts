import { describe, expect, it } from 'vitest';
import { deriveVrStatus, VR_PAINT_STALE_MS } from './vrStatus';

const base = {
  enabled: true,
  running: true,
  msSinceLastPaint: 0,
  consumerActive: true,
};

describe('deriveVrStatus', () => {
  it('off when not enabled', () => {
    expect(deriveVrStatus({ ...base, enabled: false })).toBe('off');
  });

  it('off when enabled but not running', () => {
    expect(deriveVrStatus({ ...base, running: false })).toBe('off');
  });

  it('waiting when producer paint is stale', () => {
    expect(
      deriveVrStatus({ ...base, msSinceLastPaint: VR_PAINT_STALE_MS + 1 })
    ).toBe('waiting');
  });

  it('waiting when producing but layer is not consuming', () => {
    expect(deriveVrStatus({ ...base, consumerActive: false })).toBe('waiting');
  });

  it('active when producing and layer is consuming', () => {
    expect(deriveVrStatus(base)).toBe('active');
  });
});
