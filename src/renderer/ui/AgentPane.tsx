import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, CheckCircle2, LoaderCircle, RotateCcw, SendHorizonal } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { CliId } from '../../shared/terminal';

interface AgentPaneProps {
  active: boolean;
  conversationId?: string;
  conversationStore: ConversationStore;
  profileName: string;
  profileId: CliId;
  onStoreChange: (store: ConversationStore) => void;
  labels: {
    user: string;
    running: string;
    ready: string;
    inputPlaceholder: string;
    interrupted: string;
    thinking: string;
    retry: string;
  };
}

export function AgentPane({
  active,
  conversationId,
  conversationStore,
  profileName,
  profileId,
  onStoreChange,
  labels
}: AgentPaneProps): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const conversation = useMemo<ConversationRecord | undefined>(
    () => conversationStore.conversations.find((item) => item.id === conversationId),
    [conversationId, conversationStore.conversations]
  );
  const messages = conversation?.messages ?? [];
  const running = sending || messages.some((message) => message.status === 'running');

  function sendText(value: string): void {
    const nextPrompt = value.trim();
    if (!conversation || !nextPrompt || sending) return;

    setPrompt('');
    setSending(true);
    void window.agentApi
      .send({
        conversationId: conversation.id,
        prompt: nextPrompt
      })
      .then((result) => {
        onStoreChange(result.store);
      })
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setSending(false);
      });
  }

  function sendPrompt(): void {
    sendText(prompt);
  }

  function retryBefore(index: number): void {
    const previousUserMessage = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === 'user');
    if (previousUserMessage) sendText(previousUserMessage.content);
  }

  return (
    <div className={active ? 'agent-terminal active' : 'agent-terminal'} aria-hidden={!active}>
      <div className="terminal-meta">
        <span className={`status-dot ${running ? 'booting' : 'ready'}`} />
        <Bot size={15} />
        <strong>{conversation?.title ?? profileName}</strong>
        <span className="terminal-state">
          {running ? <LoaderCircle size={14} /> : <CheckCircle2 size={14} />}
          {running ? labels.running : labels.ready}
        </span>
      </div>
      <div className={`agent-chat ${profileId ? `agent-chat-${profileId}` : ''}`}>
        <div className="agent-messages">
          {messages.length === 0 ? (
            <div className="agent-empty">
              <strong>{profileName}</strong>
              <span>{conversation?.projectPath ?? ''}</span>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <article className={`agent-message ${message.role} ${message.status ?? ''}`} key={message.id}>
              <div className="agent-message-avatar">{message.role === 'user' ? '你' : <Bot size={13} />}</div>
              <div className="agent-message-bubble">
                <span className="agent-message-author">{message.role === 'user' ? labels.user : profileName}</span>
                <p className={message.status === 'running' ? 'agent-message-running' : undefined}>
                  {message.content === 'Interrupted.'
                    ? labels.interrupted
                    : message.status === 'running'
                      ? labels.thinking
                      : message.content}
                </p>
                {message.status === 'error' ? (
                  <button className="agent-message-action" type="button" onClick={() => retryBefore(index)}>
                    <RotateCcw size={13} />
                    <span>{labels.retry}</span>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <div className="agent-input-row">
          <textarea
            value={prompt}
            placeholder={labels.inputPlaceholder}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendPrompt();
              }
            }}
          />
          <button type="button" disabled={!prompt.trim() || sending || !conversation} onClick={sendPrompt}>
            <SendHorizonal size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
