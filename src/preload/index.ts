import { contextBridge, ipcRenderer } from 'electron';
import type {
  ConversationCreateRequest,
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
  close: (): Promise<void> => ipcRenderer.invoke('window:close')
};

const settingsApi = {
  load: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
  save: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:save', settings)
};

const conversationApi = {
  list: (): Promise<ConversationStore> => ipcRenderer.invoke('conversation:list'),
  create: (request: ConversationCreateRequest): Promise<ConversationStore> =>
    ipcRenderer.invoke('conversation:create', request),
  touch: (id: string): Promise<ConversationStore> => ipcRenderer.invoke('conversation:touch', id),
  delete: (id: string): Promise<ConversationStore> => ipcRenderer.invoke('conversation:delete', id),
  chooseProject: (): Promise<string | null> => ipcRenderer.invoke('conversation:choose-project')
};

contextBridge.exposeInMainWorld('terminalApi', terminalApi);
contextBridge.exposeInMainWorld('windowApi', windowApi);
contextBridge.exposeInMainWorld('settingsApi', settingsApi);
contextBridge.exposeInMainWorld('conversationApi', conversationApi);
