export type CliId =
  | 'shell'
  | 'opencode'
  | 'codex'
  | 'antigtravaty'
  | 'antigravity'
  | 'claude'
  | 'kimi';

export interface CliProfile {
  id: CliId;
  name: string;
  command: string;
  args: string[];
  description: string;
}

export interface ShellOption {
  label: string;
  command: string;
}

export interface TerminalBindingCheckRequest {
  command: string;
}

export interface TerminalBindingCheckResult {
  available: boolean;
  command: string;
  resolvedCommand?: string;
}

export interface TerminalCreateRequest {
  profileId: CliId;
  cols: number;
  rows: number;
  cwd?: string;
  extraArgs?: string[];
  sessionKey?: string;
}

export interface TerminalCreateResult {
  id: string;
  pid?: number;
  profile: CliProfile;
  replay?: string;
  warning?: string;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number | null;
  signal?: number;
}
