import type { CliId } from './terminal';

export type ConversationMode = 'new' | 'resume-last' | 'resume-id' | 'fork';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status?: 'running' | 'done' | 'error';
  attachments?: ConversationAttachment[];
  references?: ConversationReference[];
}

export interface ConversationAttachment {
  id: string;
  type: 'image';
  name: string;
  mimeType: string;
  path: string;
  previewUrl: string;
}

export interface ConversationRun {
  id: string;
  prompt: string;
  output: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  attachments?: ConversationAttachment[];
  references?: ConversationReference[];
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface ConversationReference {
  id: string;
  title: string;
  cliId: CliId;
  projectPath: string;
}

export interface ConversationRecord {
  id: string;
  cliId: CliId;
  projectPath: string;
  title: string;
  mode: ConversationMode;
  sessionId?: string;
  linkedConversationIds?: string[];
  messages?: ConversationMessage[];
  runs?: ConversationRun[];
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

export interface ConversationUpdateRequest {
  id: string;
  title?: string;
  mode?: ConversationMode;
  sessionId?: string;
  linkedConversationIds?: string[];
}

export interface ConversationBindSessionRequest {
  id: string;
}

export interface ConversationStore {
  conversations: ConversationRecord[];
  recentProjectPaths: string[];
}

export const emptyConversationStore: ConversationStore = {
  conversations: [],
  recentProjectPaths: []
};
