import type { CliId } from './terminal';

export type AcpParticipantKind = 'agent' | 'terminal' | 'user' | 'system';
export type AcpEventStatus = 'queued' | 'running' | 'sent' | 'completed' | 'warning' | 'failed' | 'skipped';
export type AcpEventKind =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'handoff'
  | 'terminal_command'
  | 'terminal_output'
  | 'error';

export interface AcpParticipant {
  id: string;
  kind: AcpParticipantKind;
  name: string;
  cliId?: CliId;
  projectPath?: string;
  sessionKey?: string;
}

export interface AcpEvent {
  id: string;
  kind: AcpEventKind;
  status: AcpEventStatus;
  createdAt: string;
  source: AcpParticipant;
  target?: AcpParticipant;
  cwd?: string;
  command?: string;
  content?: string;
  metadata?: Record<string, string>;
}

export interface AcpRun {
  id: string;
  protocol: 'acp';
  version: '0.1';
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  source: AcpParticipant;
  target: AcpParticipant;
  events: AcpEvent[];
}
