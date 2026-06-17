import { ipcMain } from 'electron';
import { getVrStatus } from '../vr/vrOverlay';

export function setupVrBridge(): void {
  ipcMain.handle('vr:getStatus', () => getVrStatus());
}
