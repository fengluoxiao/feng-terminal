import type { ConversationStore } from './conversation';

export interface AgentSendRequest {
  conversationId: string;
  prompt: string;
  attachments?: AgentImageAttachmentInput[];
  referencedConversationIds?: string[];
  contextReferences?: AgentContextReferenceInput[];
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

export interface AgentUpdateEvent {
  conversationId: string;
  store: ConversationStore;
}
