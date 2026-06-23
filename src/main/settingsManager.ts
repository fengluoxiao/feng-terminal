import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { defaultCliBindings, defaultSettings } from '../shared/settings';
import type { AppSettings, CliBinding, CliBindings } from '../shared/settings';
import type { CliId } from '../shared/terminal';

const settingsPath = join(app.getPath('userData'), 'settings.json');
const profileIds: CliId[] = ['shell', 'opencode', 'codex', 'antigtravaty', 'antigravity', 'claude', 'kimi'];

function sanitizeBinding(value: Partial<CliBinding> | null | undefined, fallback: CliBinding): CliBinding {
  return {
    command: typeof value?.command === 'string' ? value.command.trim() : fallback.command,
    args: typeof value?.args === 'string' ? value.args.trim() : fallback.args
  };
}

function sanitizeCliBindings(value: CliBindings | null | undefined): CliBindings {
  return profileIds.reduce<CliBindings>((bindings, profileId) => {
    bindings[profileId] = sanitizeBinding(value?.[profileId], defaultCliBindings[profileId] ?? { command: '', args: '' });
    return bindings;
  }, {});
}

function sanitizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const legacyPet = value as Partial<AppSettings> & { codexPet?: boolean };
  return {
    theme: value?.theme === 'dark' || value?.theme === 'system' ? value.theme : defaultSettings.theme,
    language:
      value?.language === 'en' || value?.language === 'zh-CN' || value?.language === 'system'
        ? value.language
        : defaultSettings.language,
    nativeMaterial:
      typeof value?.nativeMaterial === 'boolean' ? value.nativeMaterial : defaultSettings.nativeMaterial,
    terminalFontSize:
      typeof value?.terminalFontSize === 'number'
        ? Math.min(22, Math.max(11, Math.round(value.terminalFontSize)))
        : defaultSettings.terminalFontSize,
    defaultProfileId: profileIds.includes(value?.defaultProfileId as CliId)
      ? (value?.defaultProfileId as CliId)
      : defaultSettings.defaultProfileId,
    cliBindings: sanitizeCliBindings(value?.cliBindings),
    confirmClose: typeof value?.confirmClose === 'boolean' ? value.confirmClose : defaultSettings.confirmClose,
    openLinksExternally:
      typeof value?.openLinksExternally === 'boolean'
        ? value.openLinksExternally
        : defaultSettings.openLinksExternally,
    desktopPet:
      typeof value?.desktopPet === 'boolean'
        ? value.desktopPet
        : typeof legacyPet?.codexPet === 'boolean'
          ? legacyPet.codexPet
          : defaultSettings.desktopPet,
    desktopPetNativeWindow:
      typeof value?.desktopPetNativeWindow === 'boolean'
        ? value.desktopPetNativeWindow
        : defaultSettings.desktopPetNativeWindow,
    desktopPetAssetPath:
      typeof value?.desktopPetAssetPath === 'string' && value.desktopPetAssetPath.trim()
        ? value.desktopPetAssetPath.trim()
        : defaultSettings.desktopPetAssetPath,
    desktopPetScale:
      typeof value?.desktopPetScale === 'number'
        ? Math.min(2, Math.max(0.5, Math.round(value.desktopPetScale * 100) / 100))
        : defaultSettings.desktopPetScale
  };
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const contents = await readFile(settingsPath, 'utf8');
    return sanitizeSettings(JSON.parse(contents) as Partial<AppSettings>);
  } catch {
    return defaultSettings;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const nextSettings = sanitizeSettings(settings);
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
  for (const window of BrowserWindow.getAllWindows()) {
    if (process.platform === 'win32') {
      window.setBackgroundMaterial(nextSettings.nativeMaterial ? 'acrylic' : 'none');
    } else if (process.platform === 'darwin') {
      window.setVibrancy(nextSettings.nativeMaterial ? 'under-window' : null);
    }
  }
  return nextSettings;
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:load', () => readAppSettings());
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => saveAppSettings(settings));
}
