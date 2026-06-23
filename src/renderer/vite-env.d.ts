/// <reference types="vite/client" />

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

declare global {
  interface Window {
    terminalApi: {
      listProfiles: () => Promise<CliProfile[]>;
      listShells: () => Promise<ShellOption[]>;
      checkBinding: (request: TerminalBindingCheckRequest) => Promise<TerminalBindingCheckResult>;
      create: (request: TerminalCreateRequest) => Promise<TerminalCreateResult>;
      input: (id: string, data: string) => void;
      resize: (id: string, cols: number, rows: number) => void;
      kill: (id: string) => void;
      killAll: () => void;
      onData: (callback: (event: TerminalDataEvent) => void) => () => void;
      onExit: (callback: (event: TerminalExitEvent) => void) => () => void;
    };
    windowApi: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
      onFocusState: (callback: (focused: boolean) => void) => () => void;
    };
    petApi: {
      focusMain: () => Promise<void>;
      toggle: (enabled: boolean) => Promise<void>;
      resize: (scale: number, persist?: boolean) => Promise<AppSettings>;
      action: (action: string) => Promise<void>;
      agentUpdate: (store: ConversationStore) => void;
      nativeAvailable: () => Promise<boolean>;
      listAssets: () => Promise<DesktopPetAsset[]>;
      resolveAsset: (manifestPath?: string) => Promise<DesktopPetAsset | null>;
      importAsset: () => Promise<DesktopPetImportResult>;
    };
    settingsApi: {
      load: () => Promise<AppSettings>;
      save: (settings: AppSettings) => Promise<AppSettings>;
    };
    conversationApi: {
      list: () => Promise<ConversationStore>;
      create: (request: ConversationCreateRequest) => Promise<ConversationStore>;
      update: (request: ConversationUpdateRequest) => Promise<ConversationStore>;
      bindSession: (request: ConversationBindSessionRequest) => Promise<ConversationStore>;
      touch: (id: string) => Promise<ConversationStore>;
      delete: (id: string) => Promise<ConversationStore>;
      chooseProject: () => Promise<string | null>;
    };
    workspaceApi: {
      load: () => Promise<WorkspaceState>;
      save: (workspace: WorkspaceState) => Promise<WorkspaceState>;
    };
    agentApi: {
      send: (request: AgentSendRequest) => Promise<AgentSendResult>;
      chooseImage: () => Promise<AgentChooseImageResult | null>;
      listSkills: () => Promise<AgentSkill[]>;
      onUpdate: (callback: (event: AgentUpdateEvent) => void) => () => void;
    };
    clipboardApi: {
      readImage: () => string | null;
    };
  }
}

export {};
