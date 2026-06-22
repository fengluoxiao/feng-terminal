import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { registerAgentIpc } from './agentManager';
import { registerConversationIpc } from './conversationManager';
import { registerDesktopPetIpc } from './desktopPetManager';
import { readAppSettings, registerSettingsIpc } from './settingsManager';
import { registerTerminalIpc } from './terminalManager';
import { registerWorkspaceIpc } from './workspaceManager';
import type { AppSettings } from '../shared/settings';

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let latestSettings: AppSettings | null = null;

function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('pet:focus-main', () => {
    mainWindow?.show();
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  ipcMain.handle('pet:toggle', async (_event, enabled: boolean) => {
    latestSettings = { ...(await readAppSettings()), desktopPet: enabled };
    if (enabled && latestSettings.desktopPetAssetPath) {
      if (petWindow) {
        petWindow.webContents.reload();
      } else {
        createPetWindow(latestSettings);
      }
    } else {
      destroyPetWindow();
    }
  });
}

function loadRenderer(window: BrowserWindow, hash = ''): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`).then(() => window.focus());
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash: hash.slice(1) } : undefined).then(() => window.focus());
  }
}

function createPetWindow(settings: AppSettings): void {
  if (!settings.desktopPet || !settings.desktopPetAssetPath || petWindow) return;

  petWindow = new BrowserWindow({
    title: 'Desktop Pet',
    width: 164,
    height: 202,
    minWidth: 132,
    minHeight: 148,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.on('closed', () => {
    petWindow = null;
  });
  loadRenderer(petWindow, '#/pet');
}

function destroyPetWindow(): void {
  petWindow?.close();
  petWindow = null;
}

function syncPetWindow(settings: AppSettings): void {
  if (settings.desktopPet && settings.desktopPetAssetPath) {
    createPetWindow(settings);
    return;
  }
  destroyPetWindow();
}

function createWindow(settings: AppSettings): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    show: true,
    autoHideMenuBar: true,
    frame: process.platform === 'darwin',
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: process.platform === 'win32' && settings.nativeMaterial ? 'acrylic' : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: process.platform === 'darwin' && settings.nativeMaterial ? 'under-window' : undefined,
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = window;

  if (process.platform === 'win32' && settings.nativeMaterial) {
    window.setBackgroundMaterial('acrylic');
  }

  window.once('ready-to-show', () => {
    window.focus();
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  loadRenderer(window);
}

app.whenReady().then(async () => {
  const settings = await readAppSettings();
  latestSettings = settings;
  registerAgentIpc();
  registerConversationIpc();
  registerDesktopPetIpc();
  registerSettingsIpc();
  registerWorkspaceIpc();
  registerWindowIpc();
  registerTerminalIpc();
  createWindow(settings);
  syncPetWindow(settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
