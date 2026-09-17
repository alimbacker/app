import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Folder holding bundled resources (icons, helper). */
export function resourcesDir(): string {
  if (app.isPackaged) return process.resourcesPath;
  return path.resolve(app.getAppPath(), 'resources');
}

export function resourcePath(...parts: string[]): string {
  return path.join(resourcesDir(), ...parts);
}

export function iconPath(name: string): string {
  return resourcePath('icons', name);
}

export function helperPath(): string {
  return resourcePath('helper', 'allbee-helper.exe');
}

export function rendererTarget(page: 'index' | 'companion' | 'audio'): { url?: string; file?: string } {
  const dev = process.env.ALLBEE_DEV_SERVER;
  if (dev) return { url: `${dev.replace(/\/$/, '')}/${page}.html` };
  // Lets the smoke test drive the real main process with stand-in pages.
  const custom = process.env.ALLBEE_RENDERER_DIR;
  if (custom) return { file: path.join(custom, `${page}.html`) };
  return { file: path.join(__dirname, '..', 'renderer', `${page}.html`) };
}

export function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

/** Allows tests and portable setups to keep data somewhere else. Must run before app ready. */
export function applyUserDataOverride(): void {
  const custom = process.env.ALLBEE_USER_DATA;
  if (custom) {
    fs.mkdirSync(custom, { recursive: true });
    app.setPath('userData', custom);
  }
}
