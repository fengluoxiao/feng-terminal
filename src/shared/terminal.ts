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

export interface TerminalCreateRequest {
  profileId: CliId;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface TerminalCreateResult {
  id: string;
  pid?: number;
  profile: CliProfile;
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
