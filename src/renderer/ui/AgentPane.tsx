import { useMemo, useState } from 'react';
import type { ClipboardEvent, ReactNode } from 'react';
import { Bot, CheckCircle2, Image, LoaderCircle, RotateCcw, SendHorizonal, X } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { CliId } from '../../shared/terminal';
import type { AgentImageAttachmentInput } from '../../shared/agent';

interface ImagePreviewState {
  name: string;
  url: string;
}

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
  const [attachments, setAttachments] = useState<AgentImageAttachmentInput[]>([]);
  const [previewImage, setPreviewImage] = useState<ImagePreviewState | null>(null);
  const [sending, setSending] = useState(false);
  const conversation = useMemo<ConversationRecord | undefined>(
    () => conversationStore.conversations.find((item) => item.id === conversationId),
    [conversationId, conversationStore.conversations]
  );
  const messages = conversation?.messages ?? [];
  const running = sending || messages.some((message) => message.status === 'running');

  function sendText(value: string, nextAttachments = attachments): void {
    const nextPrompt = value.trim();
    const attachmentSnapshot = nextAttachments.slice();
    if (!conversation || (!nextPrompt && attachmentSnapshot.length === 0) || sending) return;

    setPrompt('');
    setAttachments([]);
    setSending(true);
    void window.agentApi
      .send({
        conversationId: conversation.id,
        prompt: nextPrompt || 'Describe this image.',
        attachments: attachmentSnapshot
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

  function addImageAttachment(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setAttachments((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          name: file.name || `clipboard-image-${current.length + 1}.png`,
          mimeType: file.type || 'image/png',
          dataUrl
        }
      ]);
    };
    reader.readAsDataURL(file);
  }

  function addImageDataUrl(dataUrl: string, name?: string): void {
    if (attachments.length >= 6) return;
    setAttachments((current) => {
      if (current.length >= 6) return current;
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          name: name || `clipboard-image-${current.length + 1}.png`,
          mimeType: dataUrl.match(/^data:([^;]+);/u)?.[1] || 'image/png',
          dataUrl
        }
      ];
    });
  }

  function addClipboardImage(): boolean {
    const dataUrl = window.clipboardApi.readImage();
    if (!dataUrl) return false;
    addImageDataUrl(dataUrl);
    return true;
  }

  function chooseImage(): void {
    void window.agentApi
      .chooseImage()
      .then((result) => {
        if (!result) return;
        addImageDataUrl(result.dataUrl, result.name);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    const imageItems = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const images = files.length ? files : imageItems;
    if (!images.length) {
      if (addClipboardImage()) event.preventDefault();
      return;
    }

    event.preventDefault();
    images.slice(0, 6 - attachments.length).forEach(addImageAttachment);
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
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
                {message.attachments?.length ? (
                  <div className="agent-message-attachments">
                    {message.attachments.map((attachment) => (
                      <button
                        aria-label={`Preview ${attachment.name}`}
                        key={attachment.id}
                        type="button"
                        onClick={() => setPreviewImage({ name: attachment.name, url: attachment.previewUrl })}
                      >
                        <img alt={attachment.name} src={attachment.previewUrl} />
                      </button>
                    ))}
                  </div>
                ) : null}
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
          <div className={attachments.length ? 'agent-composer has-attachments' : 'agent-composer'}>
            {attachments.length ? (
              <div className="agent-attachment-tray">
                {attachments.map((attachment) => (
                  <span className="agent-attachment-chip" key={attachment.id}>
                    <button
                      className="agent-attachment-preview"
                      aria-label={`Preview ${attachment.name}`}
                      type="button"
                      onClick={() => setPreviewImage({ name: attachment.name, url: attachment.dataUrl })}
                    >
                      <img alt={attachment.name} src={attachment.dataUrl} />
                    </button>
                    <button
                      className="agent-attachment-remove"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                      aria-label="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <button className="agent-image-picker-button" type="button" onClick={chooseImage} aria-label="Choose image">
              <Image size={14} />
            </button>
            <textarea
              value={prompt}
              placeholder={labels.inputPlaceholder}
              onChange={(event) => setPrompt(event.target.value)}
              onPaste={pasteImages}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendPrompt();
                }
              }}
            />
          </div>
          <button type="button" disabled={(!prompt.trim() && attachments.length === 0) || sending || !conversation} onClick={sendPrompt}>
            <SendHorizonal size={15} />
          </button>
        </div>
      </div>
      {previewImage ? (
        <div
          className="agent-image-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={previewImage.name}
          onClick={() => setPreviewImage(null)}
        >
          <div className="agent-image-preview" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="agent-image-preview-close" onClick={() => setPreviewImage(null)} aria-label="Close preview">
              <X size={16} />
            </button>
            <img alt={previewImage.name} src={previewImage.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
