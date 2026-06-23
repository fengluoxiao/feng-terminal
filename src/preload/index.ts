import { clipboard, contextBridge, ipcRenderer } from 'electron';
import type {
  ConversationBindSessionRequest,
  ConversationCreateRequest,
  ConversationUpdateRequest,
  ConversationStore
} from '../shared/conversation';
import type {
  CliProfile,
  ShellOption,
  TerminalBindingCheckRequest,
  TerminalBindingCheckResult,
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalDataEvent,
  TerminalExitEvent
} from '../shared/terminal';
import type { AppSettings } from '../shared/settings';
import type { WorkspaceState } from '../shared/workspace';
import type { AgentChooseImageResult, AgentSendRequest, AgentSendResult, AgentSkill, AgentUpdateEvent } from '../shared/agent';
import type { DesktopPetAsset, DesktopPetImportResult } from '../shared/desktopPetAsset';

const terminalApi = {
  listProfiles: (): Promise<CliProfile[]> => ipcRenderer.invoke('terminal:list-profiles'),
  listShells: (): Promise<ShellOption[]> => ipcRenderer.invoke('terminal:list-shells'),
  checkBinding: (request: TerminalBindingCheckRequest): Promise<TerminalBindingCheckResult> =>
    ipcRenderer.invoke('terminal:check-binding', request),
  create: (request: TerminalCreateRequest): Promise<TerminalCreateResult> =>
    ipcRenderer.invoke('terminal:create', request),
  input: (id: string, data: string): void => ipcRenderer.send('terminal:input', id, data),
  resize: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id: string): void => ipcRenderer.send('terminal:kill', id),
  killAll: (): void => ipcRenderer.send('terminal:kill-all'),
  onData: (callback: (event: TerminalDataEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => callback(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onExit: (callback: (event: TerminalExitEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => callback(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
};

const windowApi = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  onFocusState: (callback: (focused: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, focused: boolean) => callback(focused);
    ipcRenderer.on('window:focus-state', listener);
    return () => ipcRenderer.removeListener('window:focus-state', listener);
  }
};

const petApi = {
  focusMain: (): Promise<void> => ipcRenderer.invoke('pet:focus-main'),
  toggle: (enabled: boolean): Promise<void> => ipcRenderer.invoke('pet:toggle', enabled),
  resize: (scale: number, persist = true): Promise<AppSettings> => ipcRenderer.invoke('pet:resize', scale, persist),
  action: (action: string): Promise<void> => ipcRenderer.invoke('pet:action', action),
  agentUpdate: (store: ConversationStore): void => ipcRenderer.send('pet:agent-update', store),
  nativeAvailable: (): Promise<boolean> => ipcRenderer.invoke('pet:native-available'),
  listAssets: (): Promise<DesktopPetAsset[]> => ipcRenderer.invoke('pet:list-assets'),
  resolveAsset: (manifestPath?: string): Promise<DesktopPetAsset | null> =>
    ipcRenderer.invoke('pet:resolve-asset', manifestPath),
  importAsset: (): Promise<DesktopPetImportResult> => ipcRenderer.invoke('pet:import-asset')
};

const settingsApi = {
  load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
  save: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:save', settings)
};

const conversationApi = {
  list: (): Promise<ConversationStore> => ipcRenderer.invoke('conversation:list'),
  create: (request: ConversationCreateRequest): Promise<ConversationStore> =>
    ipcRenderer.invoke('conversation:create', request),
  update: (request: ConversationUpdateRequest): Promise<ConversationStore> =>
    ipcRenderer.invoke('conversation:update', request),
  bindSession: (request: ConversationBindSessionRequest): Promise<ConversationStore> =>
    ipcRenderer.invoke('conversation:bind-session', request),
  touch: (id: string): Promise<ConversationStore> => ipcRenderer.invoke('conversation:touch', id),
  delete: (id: string): Promise<ConversationStore> => ipcRenderer.invoke('conversation:delete', id),
  chooseProject: (): Promise<string | null> => ipcRenderer.invoke('conversation:choose-project')
};

const workspaceApi = {
  load: (): Promise<WorkspaceState> => ipcRenderer.invoke('workspace:load'),
  save: (workspace: WorkspaceState): Promise<WorkspaceState> => ipcRenderer.invoke('workspace:save', workspace)
};

const agentApi = {
  send: (request: AgentSendRequest): Promise<AgentSendResult> => ipcRenderer.invoke('agent:send', request),
  chooseImage: (): Promise<AgentChooseImageResult | null> => ipcRenderer.invoke('agent:choose-image'),
  listSkills: (): Promise<AgentSkill[]> => ipcRenderer.invoke('agent:list-skills'),
  onUpdate: (callback: (event: AgentUpdateEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentUpdateEvent) => callback(payload);
    ipcRenderer.on('agent:update', listener);
    return () => ipcRenderer.removeListener('agent:update', listener);
  }
};

const clipboardApi = {
  readImage: (): string | null => {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toDataURL();
  }
};

contextBridge.exposeInMainWorld('terminalApi', terminalApi);
contextBridge.exposeInMainWorld('windowApi', windowApi);
contextBridge.exposeInMainWorld('petApi', petApi);
contextBridge.exposeInMainWorld('settingsApi', settingsApi);
contextBridge.exposeInMainWorld('conversationApi', conversationApi);
contextBridge.exposeInMainWorld('workspaceApi', workspaceApi);
contextBridge.exposeInMainWorld('agentApi', agentApi);
contextBridge.exposeInMainWorld('clipboardApi', clipboardApi);
