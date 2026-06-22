/// <reference types="vite/client" />

import type {
  CliProfile,
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalDataEvent,
  TerminalExitEvent
} from '../shared/terminal';

declare global {
  interface Window {
    terminalApi: {
      listProfiles: () => Promise<CliProfile[]>;
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
  }
}

export {};
