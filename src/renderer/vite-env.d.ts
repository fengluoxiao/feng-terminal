/// <reference types="vite/client" />

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
    };
    settingsApi: {
      load: () => Promise<AppSettings>;
      save: (settings: AppSettings) => Promise<AppSettings>;
    };
    conversationApi: {
      list: () => Promise<ConversationStore>;
      create: (request: ConversationCreateRequest) => Promise<ConversationStore>;
      touch: (id: string) => Promise<ConversationStore>;
      delete: (id: string) => Promise<ConversationStore>;
      chooseProject: () => Promise<string | null>;
    };
  }
}

export {};
