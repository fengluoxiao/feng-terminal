import type { CliId } from './terminal';

export interface WorkspaceTabRecord {
  id: string;
  profileId: CliId;
  title: string;
  cwd?: string;
  extraArgs?: string[];
  conversationId?: string;
  projectPath?: string;
  sessionKey?: string;
}

export interface WorkspaceState {
  tabs: WorkspaceTabRecord[];
  activeTabId?: string;
  activeView: 'terminal' | 'settings';
  conversationPanelOpen: boolean;
}

export const emptyWorkspaceState: WorkspaceState = {
  tabs: [],
  activeView: 'terminal',
  conversationPanelOpen: true
};
