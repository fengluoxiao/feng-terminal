import type { CliId } from './terminal';

export type ConversationMode = 'new' | 'resume-last' | 'resume-id' | 'fork';

export interface ConversationRecord {
  id: string;
  cliId: CliId;
  projectPath: string;
  title: string;
  mode: ConversationMode;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ConversationCreateRequest {
  cliId: CliId;
  projectPath: string;
  title?: string;
  mode: ConversationMode;
  sessionId?: string;
}

export interface ConversationStore {
  conversations: ConversationRecord[];
  recentProjectPaths: string[];
}

export const emptyConversationStore: ConversationStore = {
  conversations: [],
  recentProjectPaths: []
};
