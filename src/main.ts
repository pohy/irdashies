import { app, ipcMain } from 'electron';
import log from './app/logger';
import {
  iRacingSDKSetup,
  getCurrentBridge,
} from './app/bridge/iracingSdk/setup';
import { getOrCreateDefaultDashboard } from './app/storage/dashboards';
import { setupTaskbar, KeybindingManager } from './app';
import {
  publishDashboardUpdates,
  dashboardBridge,
} from './app/bridge/dashboard/dashboardBridge';
import { setupPitLaneBridge } from './app/bridge/pitLaneBridge';
import { setupFuelCalculatorBridge } from './app/bridge/fuelCalculatorBridge';
import { OverlayManager } from './app/overlayManager';
import {
  startComponentServer,
  getComponentServerPort,
} from './app/webserver/componentServer';
import { updateElectronApp } from 'update-electron-app';
// @ts-expect-error no types for squirrel
import started from 'electron-squirrel-startup';
import { Analytics } from './app/analytics';
import { setupReferenceLapsBridge } from './app/bridge/referenceLapsBridge';
import { setupKeybindingsBridge } from './app/bridge/keybindingsBridge';
import { setupLogBridge } from './app/bridge/logBridge';
import { setupPersonalBestLapTimesBridge } from './app/bridge/personalBestLapTimesBridge';
import {
  validateReferenceLapFile,
  flushReferenceLapsOnShutdown,
} from './app/storage/referenceLaps';
import { setupChromiumFlagsBridge } from './app/bridge/chromiumFlagsBridge';
import { setupVrBridge } from './app/bridge/vrBridge';
import {
  startVrOverlay,
  stopVrOverlay,
  applyVrOverlaySettings,
} from './app/vr/vrOverlay';
import { onDashboardUpdated } from './app/storage/dashboardEvents';
import {
  registerOpenXrLayer,
  unregisterOpenXrLayer,
  unregisterOpenXrLayerSync,
  vrLayerRegistered,
} from './app/vr/openxrLayer';
import type { VrOverlaySettings } from '@irdashies/types';

// On uninstall, remove our OpenXR layer registration before Squirrel quits us.
if (process.argv[1] === '--squirrel-uninstall') {
  unregisterOpenXrLayerSync();
}
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();

updateElectronApp();

const overlayManager = new OverlayManager();
const analytics = new Analytics();
analytics.setupLogTransport();

overlayManager.setupChromiumFlags();
overlayManager.setupHardwareAcceleration();
overlayManager.setupSingleInstanceLock();
overlayManager.setupAutoStart();

// Hoisted so the quit handler can tear down the WebHID host window cleanly.
let keybindingManager: KeybindingManager | undefined;

app.on('ready', async () => {
  // Don't start services if we don't have the single instance lock
  // (this instance should be quitting)
  if (!overlayManager.hasLock()) {
    return;
  }

  await iRacingSDKSetup(overlayManager);

  // Perform one-time cleanup of old reference laps
  validateReferenceLapFile();

  const dashboard = getOrCreateDefaultDashboard();
  const bridge = getCurrentBridge();

  // Setup IPC bridges
  setupLogBridge();
  setupFuelCalculatorBridge();
  setupPitLaneBridge();
  setupReferenceLapsBridge();
  setupPersonalBestLapTimesBridge();
  setupChromiumFlagsBridge();
  setupVrBridge();

  // Start component server for browser components
  await startComponentServer(bridge, dashboardBridge);

  ipcMain.handle('getComponentServerPort', () => getComponentServerPort());

  overlayManager.createOverlays(dashboard);

  // Experimental native VR overlay — toggled in the VR settings section.
  // Start/stop on the toggle and push placement changes live while running.
  const syncVrOverlay = (settings?: VrOverlaySettings) => {
    if (settings?.enabled) {
      startVrOverlay(overlayManager, settings); // no-op if already running
      applyVrOverlaySettings(settings);
      void registerOpenXrLayer(); // register the OpenXR layer so games load it
    } else {
      stopVrOverlay(); // no-op if not running
      void unregisterOpenXrLayer(); // stop injecting into OpenXR games
    }
  };
  syncVrOverlay(dashboard?.generalSettings?.vr);
  onDashboardUpdated((updated) => syncVrOverlay(updated.generalSettings?.vr));

  keybindingManager = new KeybindingManager(overlayManager);
  keybindingManager.registerAll();
  // Start the WebHID host window that reads game controllers for gamepad bindings.
  keybindingManager.startGamepad();

  setupTaskbar(overlayManager, keybindingManager);
  publishDashboardUpdates(overlayManager, analytics);
  setupKeybindingsBridge(keybindingManager);

  await analytics.init(overlayManager.getVersion(), dashboard);

  // Check if settings window should start minimized
  const shouldStartMinimized =
    dashboard?.generalSettings?.startMinimized ?? false;
  if (shouldStartMinimized) {
    // Create the settings window but don't show it immediately
    const settingsWindow = overlayManager.createSettingsWindow();
    // Minimize it to system tray
    settingsWindow.hide();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('quit', () => {
  log.info('App quit');
  analytics.shutdown();
});

app.on('before-quit', () => {
  overlayManager.markQuitting();
  keybindingManager?.stopGamepad();
  stopVrOverlay();
  // Don't leave the layer injecting into OpenXR games while irDashies is closed.
  // Sync so the reg.exe call completes before the process exits.
  if (vrLayerRegistered()) unregisterOpenXrLayerSync();
  // Synchronous flush so any pending debounced reference-lap write completes
  // before the process exits.
  flushReferenceLapsOnShutdown();
});
