import type { ConversationStore } from './conversation';

export interface AgentSendRequest {
  conversationId: string;
  prompt: string;
  attachments?: AgentImageAttachmentInput[];
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

export interface AgentUpdateEvent {
  conversationId: string;
  store: ConversationStore;
}
