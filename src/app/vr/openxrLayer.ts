import { app } from 'electron';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import logger from '../logger';

// Register the irDashies OpenXR implicit API layer per-user (HKCU, no admin/UAC).
// The OpenXR loader reads implicit layers from both HKLM and HKCU; per-user keeps
// the whole flow silent and lets us register/unregister it as VR is toggled.
const REG_KEY = 'HKCU\\Software\\Khronos\\OpenXR\\1\\ApiLayers\\Implicit';
const LAYER_DLL = 'irDashies-OpenXR-Layer.dll';
const MANIFEST = 'irDashies-OpenXR.json';

// Dev build output. CMake bakes the correct absolute DLL path into this manifest,
// so in dev we register it as-is. __dirname is .vite/build at runtime → repo root.
const DEV_OUT = path.join(__dirname, '../../native/openxr-layer/build/Release');

let registered = false;

export function vrLayerRegistered(): boolean {
  return registered;
}

// Absolute path of the manifest we register (the registry value name).
// Packaged: a STABLE path under userData. Squirrel installs each version into a
// per-version dir, so registering the versioned resources path would leave a dead
// registry entry on every update. userData is stable → one entry, refreshed in
// place. Dev: the CMake-generated manifest in the build tree.
function manifestPath(): string {
  return app.isPackaged
    ? path.join(app.getPath('userData'), MANIFEST)
    : path.join(DEV_OUT, MANIFEST);
}

// Ensure the manifest we register exists and points at this install's DLL.
// Returns the manifest path, or null if the layer isn't built/available.
function ensureManifest(): string | null {
  const dll = app.isPackaged
    ? path.join(process.resourcesPath, LAYER_DLL)
    : path.join(DEV_OUT, LAYER_DLL);
  if (!existsSync(dll)) {
    logger.warn('[VR] OpenXR layer DLL missing, skipping registration', dll);
    return null;
  }
  const out = manifestPath();
  if (app.isPackaged) {
    try {
      const shipped = path.join(process.resourcesPath, MANIFEST);
      const manifest = JSON.parse(readFileSync(shipped, 'utf8'));
      manifest.api_layer.library_path = dll; // absolute path for this install
      writeFileSync(out, JSON.stringify(manifest, null, 2));
    } catch (err) {
      logger.error('[VR] failed to write OpenXR manifest', err);
      return null;
    }
  } else if (!existsSync(out)) {
    logger.warn(
      '[VR] dev OpenXR manifest missing (run: npm run build:openxr)',
      out
    );
    return null;
  }
  return out;
}

function reg(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile('reg', args, (err) => {
      // Best-effort: never block the VR toggle on a registry hiccup.
      if (err) logger.error('[VR] reg', args[0], 'failed', err.message);
      resolve();
    });
  });
}

export async function registerOpenXrLayer(): Promise<void> {
  if (process.platform !== 'win32') return;
  const manifest = ensureManifest();
  if (!manifest) return;
  // value name = manifest path, DWORD 0 = enabled. /f overwrites idempotently.
  await reg([
    'add',
    REG_KEY,
    '/v',
    manifest,
    '/t',
    'REG_DWORD',
    '/d',
    '0',
    '/f',
  ]);
  registered = true;
  logger.info('[VR] registered OpenXR layer', manifest);
}

export async function unregisterOpenXrLayer(): Promise<void> {
  if (process.platform !== 'win32') return;
  await reg(['delete', REG_KEY, '/v', manifestPath(), '/f']);
  registered = false;
  logger.info('[VR] unregistered OpenXR layer');
}

// Synchronous unregister for paths where the process exits immediately and an
// async reg.exe spawn would be killed mid-flight: app before-quit and the
// Squirrel uninstall event. Harmless if the value isn't present.
export function unregisterOpenXrLayerSync(): void {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('reg', ['delete', REG_KEY, '/v', manifestPath(), '/f'], {
      stdio: 'ignore',
    });
  } catch {
    // value may not exist (never registered) — nothing to do
  }
  registered = false;
}
