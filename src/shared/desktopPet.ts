import type { CliId } from './terminal';

export type DesktopPetStatus = 'idle' | 'running' | 'done' | 'error';

export interface DesktopPetState {
  source: 'native-session' | 'conversation' | 'empty';
  cliId?: CliId;
  cliName: string;
  status: DesktopPetStatus;
  title: string;
  subtitle: string;
  cwd?: string;
  sessionId?: string;
  updatedAt?: string;
  messageCount: number;
}

export const emptyDesktopPetState: DesktopPetState = {
  source: 'empty',
  cliName: 'Agent',
  status: 'idle',
  title: 'Agent',
  subtitle: '待命',
  messageCount: 0
};
