import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { killAllAgentProcesses, registerAgentIpc, setAgentUpdateListener } from './agentManager';
import { registerConversationIpc } from './conversationManager';
import { registerDesktopPetIpc } from './desktopPetManager';
import { readAppSettings, registerSettingsIpc, saveAppSettings } from './settingsManager';
import { killAllTerminalSessions, registerTerminalIpc } from './terminalManager';
import { registerWorkspaceIpc } from './workspaceManager';
import type { AppSettings } from '../shared/settings';
import type { ConversationStore } from '../shared/conversation';

let mainWindow: BrowserWindow | null = null;
let latestSettings: AppSettings | null = null;
let quitting = false;
let petSidecar: ChildProcess | null = null;
let petSidecarAvailable = false;
let petAction = 'idle';
let petSidecarGeneration = 0;
let petSidecarSyncTimer: NodeJS.Timeout | null = null;

function getPetSidecarPath(): string {
  const executable = process.platform === 'win32' ? 'pet-sidecar.exe' : 'pet-sidecar';
  if (app.isPackaged) return join(process.resourcesPath, 'native', executable);
  return join(app.getAppPath(), 'native', 'pet-sidecar', 'target', 'release', executable);
}

function stopPetSidecar(): void {
  petSidecarGeneration += 1;
  petSidecar?.kill();
  petSidecar = null;
  petSidecarAvailable = false;
}

function killPetSidecarRemainders(sidecarPath: string): void {
  if (process.platform !== 'win32') return;
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `Get-Process pet-sidecar -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${sidecarPath.replaceAll("'", "''")}' } | Stop-Process -Force`
      ],
      { windowsHide: true, stdio: 'ignore' }
    );
  } catch {
    // Best-effort cleanup only; spawn will still fall back to normal process tracking.
  }
}

function sendPetSidecarResize(scale: number): boolean {
  if (!petSidecar || petSidecar.killed || !petSidecar.stdin?.writable) return false;
  return petSidecar.stdin.write(`resize ${scale}\n`);
}

function sendPetSidecarAction(action: string): boolean {
  if (!petSidecar || petSidecar.killed || !petSidecar.stdin?.writable) return false;
  return petSidecar.stdin.write(`action ${action}\n`);
}

function sendPetSidecarTransientAction(action: string): boolean {
  if (!petSidecar || petSidecar.killed || !petSidecar.stdin?.writable) return false;
  return petSidecar.stdin.write(`transient ${action}\n`);
}

function setPetAction(action: string): void {
  if (petAction === action) return;
  petAction = action;
  sendPetSidecarAction(action);
}

function resendPetAction(): void {
  sendPetSidecarAction(petAction);
}

function getPetAction(store: ConversationStore): string {
  const conversation = [...store.conversations].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))[0];
  const latestMessage = conversation?.messages?.at(-1);
  const latestRun = conversation?.runs?.at(-1);
  if (latestMessage?.status === 'running' || latestRun?.status === 'running') return 'running';
  if (latestMessage?.status === 'error' || latestRun?.status === 'error') return 'failed';
  return 'idle';
}

function syncPetSidecar(settings: AppSettings): void {
  if (petSidecarSyncTimer) clearTimeout(petSidecarSyncTimer);
  petSidecarSyncTimer = setTimeout(() => syncPetSidecarNow(settings), 80);
}

function isPetSidecarWritable(): boolean {
  return Boolean(petSidecar && !petSidecar.killed && petSidecar.stdin?.writable);
}

async function ensurePetSidecar(): Promise<void> {
  if (isPetSidecarWritable()) return;
  latestSettings = latestSettings ?? (await readAppSettings());
  syncPetSidecarNow(latestSettings);
}

function syncPetSidecarNow(settings: AppSettings): void {
  petSidecarSyncTimer = null;
  stopPetSidecar();
  if (!settings.desktopPet || !settings.desktopPetNativeWindow || !settings.desktopPetAssetPath) return;

  const sidecarPath = getPetSidecarPath();
  if (!existsSync(sidecarPath)) return;
  killPetSidecarRemainders(sidecarPath);
  const generation = petSidecarGeneration;

  petSidecar = spawn(sidecarPath, [], {
    env: {
      ...process.env,
      TUI_PET_MANIFEST: settings.desktopPetAssetPath,
      TUI_PET_SCALE: String(settings.desktopPetScale)
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore']
  });
  petSidecarAvailable = true;
  setTimeout(resendPetAction, 50);
  petSidecar.stdout?.setEncoding('utf8');
  petSidecar.stdout?.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const match = /^resize\s+([0-9.]+)$/.exec(line.trim());
      if (!match || !latestSettings) continue;
      const desktopPetScale = Math.min(2, Math.max(0.5, Math.round(Number(match[1]) * 100) / 100));
      latestSettings = { ...latestSettings, desktopPetScale };
      void saveAppSettings(latestSettings);
    }
  });
  petSidecar.once('exit', () => {
    if (generation !== petSidecarGeneration) return;
    petSidecar = null;
    petSidecarAvailable = false;
  });
  petSidecar.once('error', () => {
    if (generation !== petSidecarGeneration) return;
    petSidecar = null;
    petSidecarAvailable = false;
  });
}

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
    syncPetSidecar(latestSettings);
  });

  ipcMain.handle('pet:resize', async (_event, scale: number, persist = true) => {
    const nextScale = Math.min(2, Math.max(0.5, Math.round(scale * 100) / 100));
    latestSettings = { ...(latestSettings ?? (await readAppSettings())), desktopPetScale: nextScale };
    if (
      latestSettings.desktopPet &&
      latestSettings.desktopPetNativeWindow &&
      latestSettings.desktopPetAssetPath &&
      !sendPetSidecarResize(nextScale)
    ) {
      syncPetSidecar(latestSettings);
    }
    if (persist) {
      latestSettings = await saveAppSettings(latestSettings);
    }
    return latestSettings;
  });

  ipcMain.handle('pet:native-available', () => petSidecarAvailable);

  ipcMain.handle('pet:action', (_event, action: string) => {
    if (action === 'waving' || action === 'jumping') {
      void ensurePetSidecar().then(() => {
        setTimeout(() => sendPetSidecarTransientAction(action), 80);
      });
      return;
    }
    setPetAction(action);
  });
}

function registerPetAgentBridge(): void {
  setAgentUpdateListener((store) => {
    setPetAction(getPetAction(store));
  });
  ipcMain.on('pet:agent-update', (_event, store: ConversationStore) => {
    setPetAction(getPetAction(store));
  });
}

function loadRenderer(window: BrowserWindow, hash = '', focusWhenLoaded = true): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`).then(() => {
      if (focusWhenLoaded) window.focus();
    });
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash: hash.slice(1) } : undefined).then(() => {
      if (focusWhenLoaded) window.focus();
    });
  }
}

function setWindowFocusState(window: BrowserWindow, focused: boolean, nativeMaterial: boolean): void {
  window.webContents.send('window:focus-state', focused);
  if (process.platform === 'darwin') {
    window.setVibrancy(nativeMaterial ? 'under-window' : null);
  }
}

function shutdownApp(): void {
  if (quitting) return;
  quitting = true;
  killAllTerminalSessions();
  killAllAgentProcesses();
  stopPetSidecar();
  app.quit();
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
    visualEffectState: 'followWindow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow = window;

  setWindowFocusState(window, window.isFocused(), settings.nativeMaterial);

  window.once('ready-to-show', () => {
    window.focus();
  });

  window.on('focus', () => {
    setWindowFocusState(window, true, settings.nativeMaterial);
  });

  window.on('blur', () => {
    setWindowFocusState(window, false, settings.nativeMaterial);
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  window.webContents.on('did-finish-load', () => {
    setWindowFocusState(window, window.isFocused(), settings.nativeMaterial);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('close', () => {
    shutdownApp();
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
  registerPetAgentBridge();
  registerTerminalIpc();
  createWindow(settings);
  syncPetSidecar(settings);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  killAllTerminalSessions();
  killAllAgentProcesses();
  stopPetSidecar();
});
