import type { ConversationStore } from './conversation';

export interface AgentSendRequest {
  conversationId: string;
  prompt: string;
}

export interface AgentSendResult {
  store: ConversationStore;
  output: string;
}

export interface AgentUpdateEvent {
  conversationId: string;
  store: ConversationStore;
}
