import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { registerAgentIpc } from './agentManager';
import { registerConversationIpc } from './conversationManager';
import { readAppSettings, registerSettingsIpc } from './settingsManager';
import { registerTerminalIpc } from './terminalManager';
import { registerWorkspaceIpc } from './workspaceManager';
import type { AppSettings } from '../shared/settings';

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
}

function createWindow(settings: AppSettings): void {
  const mainWindow = new BrowserWindow({
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

  if (process.platform === 'win32' && settings.nativeMaterial) {
    mainWindow.setBackgroundMaterial('acrylic');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL).then(() => mainWindow.focus());
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then(() => mainWindow.focus());
  }
}

app.whenReady().then(async () => {
  const settings = await readAppSettings();
  registerAgentIpc();
  registerConversationIpc();
  registerSettingsIpc();
  registerWorkspaceIpc();
  registerWindowIpc();
  registerTerminalIpc();
  createWindow(settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
