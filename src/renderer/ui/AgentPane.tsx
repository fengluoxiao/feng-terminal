import { useEffect, useMemo, useState } from 'react';
import type { ClipboardEvent, ReactNode } from 'react';
import { Bot, CheckCircle2, Image, LoaderCircle, RotateCcw, SendHorizonal, X } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { CliId } from '../../shared/terminal';
import type { AgentImageAttachmentInput, AgentSkill } from '../../shared/agent';
import { getCliSkills } from '../../shared/skills';

interface ImagePreviewState {
  name: string;
  url: string;
}

function getSkillSearchScore(skill: AgentSkill, query: string): number {
  if (!query) return 1;
  const command = skill.command.toLowerCase();
  const label = skill.label.toLowerCase();
  const source = (skill.source ?? '').toLowerCase();
  const description = skill.description.toLowerCase();
  const id = skill.id.toLowerCase();

  if (command === `/${query}` || id === query) return 1000;
  if (command.startsWith(`/${query}`) || id.startsWith(query)) return 800;
  if (label.startsWith(query)) return 700;
  if (source.startsWith(query)) return 620;
  if (command.includes(query) || id.includes(query)) return 520;
  if (label.includes(query)) return 460;
  if (source.includes(query)) return 380;
  if (description.includes(query)) return 220;

  const words = query.split(/\s+/u).filter(Boolean);
  if (words.length > 1 && words.every((word) => `${command} ${label} ${source} ${description}`.includes(word))) return 120;
  return 0;
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
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [codexSkills, setCodexSkills] = useState<AgentSkill[] | null>(null);
  const [sending, setSending] = useState(false);
  const conversation = useMemo<ConversationRecord | undefined>(
    () => conversationStore.conversations.find((item) => item.id === conversationId),
    [conversationId, conversationStore.conversations]
  );
  const messages = conversation?.messages ?? [];
  const running = sending || messages.some((message) => message.status === 'running');
  const skills = useMemo(
    () => (profileId === 'codex' && codexSkills?.length ? codexSkills : getCliSkills(profileId)),
    [codexSkills, profileId]
  );
  const skillQuery = prompt.startsWith('/') && !prompt.includes('\n') ? prompt.slice(1).trim().toLowerCase() : null;
  const matchingSkills = useMemo(
    () => {
      if (skillQuery === null) return [];
      return skills
        .map((skill) => ({ skill, score: getSkillSearchScore(skill, skillQuery) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.skill.command.localeCompare(right.skill.command))
        .map((item) => item.skill)
        .slice(0, 80);
    },
    [skillQuery, skills]
  );
  const showSkillMenu = matchingSkills.length > 0;

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [skillQuery, profileId]);

  useEffect(() => {
    if (profileId !== 'codex' || codexSkills) return;
    void window.agentApi
      .listSkills()
      .then((items) => {
        if (items.length) setCodexSkills(items);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [codexSkills, profileId]);

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

  function insertSkill(skill: AgentSkill): void {
    setPrompt((current) => {
      const nextText = current.startsWith('/') && !current.includes('\n') ? '' : current;
      return `${skill.prompt}${nextText}`.trimStart();
    });
    setSelectedSkillIndex(0);
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
              onChange={(event) => {
                setPrompt(event.target.value);
                setSelectedSkillIndex(0);
              }}
              onPaste={pasteImages}
              onKeyDown={(event) => {
                if (showSkillMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setSelectedSkillIndex((current) => {
                    const offset = event.key === 'ArrowDown' ? 1 : -1;
                    return (current + offset + matchingSkills.length) % matchingSkills.length;
                  });
                  return;
                }

                if (showSkillMenu && (event.key === 'Enter' || event.key === 'Tab')) {
                  event.preventDefault();
                  insertSkill(matchingSkills[selectedSkillIndex] ?? matchingSkills[0]);
                  return;
                }

                if (showSkillMenu && event.key === 'Escape') {
                  event.preventDefault();
                  setPrompt('');
                  return;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendPrompt();
                }
              }}
            />
            {showSkillMenu ? (
              <div className="agent-skill-menu">
                <div className="agent-skill-menu-meta">
                  <span>{skillQuery ? `Search: ${skillQuery}` : `${skills.length} skills`}</span>
                </div>
                {matchingSkills.map((skill, index) => (
                  <button
                    className={index === selectedSkillIndex ? 'selected' : undefined}
                    key={skill.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertSkill(skill)}
                  >
                    <span>{skill.command}</span>
                    <strong>{skill.label}</strong>
                    <small>{skill.source ? `${skill.source} - ${skill.description}` : skill.description}</small>
                  </button>
                ))}
              </div>
            ) : null}
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
