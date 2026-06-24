import type { ConversationStore } from './conversation';
import type { AcpRun } from './acp';

export interface AgentSendRequest {
  conversationId: string;
  prompt: string;
  attachments?: AgentImageAttachmentInput[];
  fileReferences?: AgentFileReferenceInput[];
  contextSnippets?: AgentContextSnippetInput[];
  referencedConversationIds?: string[];
  contextReferences?: AgentContextReferenceInput[];
}

export interface AgentFileReferenceInput {
  id: string;
  type: 'file' | 'directory';
  name: string;
  path: string;
  relativePath: string;
}

export type AgentContextReferenceInput =
  | {
      type: 'conversation';
      id: string;
    }
  | {
      type: 'terminal';
      id: string;
      title: string;
      projectPath?: string;
      sessionKey: string;
    };

export interface AgentContextSnippetInput {
  id: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  body: string;
}

export interface AgentSendResult {
  store: ConversationStore;
  output: string;
}

export interface AgentImageAttachmentInput {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface AgentChooseImageResult {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface AgentSkill {
  id: string;
  label: string;
  command: string;
  description: string;
  prompt: string;
  source?: string;
}

export interface AgentProjectEntry {
  id: string;
  type: 'file' | 'directory';
  name: string;
  path: string;
  relativePath: string;
}

export interface AgentContextSnippet {
  id: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  body: string;
}

export interface AgentUpdateEvent {
  conversationId: string;
  store: ConversationStore;
}

export interface AcpAgentSummary {
  id: string;
  name: string;
  cliId: string;
  projectPath?: string;
  conversationId: string;
}

export interface AcpRunSummary {
  conversationId: string;
  run: AcpRun;
}
